#!/usr/bin/env python3
"""Fixed +1-semitone spectral transposition before pretrained BigVGAN.

Not an F0-only instrument, learned vibrato, new score, or model training.
Spectral envelope and noise are transposed too. No output pitch correction.
"""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

import run_bigvgan_copy as base

SOURCE_SHA = "36287485c7083892aae5384e04bb52207c908626201709f441dba45c25a5aa1a"


def warp_magnitude(magnitude, semitones):
    """y[out_bin,time] = x[out_bin / ratio,time], linear frequency interpolation."""
    x = np.asarray(magnitude)
    if (semitones not in (0,1) or x.shape != (513,450)
            or x.dtype not in (np.dtype('float32'),np.dtype('float64'))
            or not np.isfinite(x).all() or np.any(x < 0)):
        raise ValueError("finite_nonnegative_513x450_float_and_fixed0_or1_required")
    if semitones == 0:
        return x.astype(np.float32,copy=True)
    position = np.arange(513,dtype=np.float64)/2**(semitones/12)
    lo = np.floor(position).astype(np.int64)
    hi = np.minimum(lo+1,512)
    alpha = (position-lo)[:,None]
    return ((1-alpha)*x[lo]+alpha*x[hi]).astype(np.float32)


def make_mel(wav, h, semitones, *, torch_module, mel_basis_function):
    """Replicate official STFT exactly; transpose linear magnitude before mel."""
    torch = torch_module
    if tuple(wav.shape) != (1,base.SAMPLES) or wav.device.type != "cpu" or wav.dtype != torch.float32:
        raise ValueError("exact_CPU_float32_1x115200_waveform_required")
    base.validate_input(wav[0].numpy(),h)
    if semitones not in (0,1):
        raise ValueError("fixed0_or1_semitone_required")
    padded = torch.nn.functional.pad(wav.unsqueeze(1),(384,384),mode="reflect").squeeze(1)
    spectrum = torch.stft(padded,1024,hop_length=256,win_length=1024,
        window=torch.hann_window(1024),center=False,pad_mode="reflect",
        normalized=False,onesided=True,return_complex=True)
    magnitude = torch.sqrt(torch.view_as_real(spectrum).pow(2).sum(-1)+1e-9)
    shifted = warp_magnitude(magnitude[0].numpy(),semitones)
    basis = mel_basis_function(sr=24000,n_fft=1024,n_mels=100,fmin=0,fmax=None)
    basis = np.asarray(basis)
    if basis.shape != (100,513) or not np.isfinite(basis).all() or np.any(basis < 0):
        raise ValueError("finite_nonnegative_official100x513_mel_basis_required")
    projected = torch.matmul(torch.from_numpy(basis).float(),torch.from_numpy(shifted).unsqueeze(0))
    mel = torch.log(torch.clamp(projected,min=1e-5))
    if tuple(mel.shape) != (1,100,450) or not bool(torch.isfinite(mel).all()):
        raise ValueError("finite_1x100x450_mel_required")
    return mel


def load_inputs(model_root, source_report):
    model_root = model_root.resolve(strict=True)
    parent_report = base.regular(model_root/"result/run_report.json",1000000)
    parent = json.loads(parent_report.read_text())
    if (parent.get("schema") != "mini.bigvgan027-source-reconstruction.v1"
            or parent.get("status") != "complete_not_listening_approved"
            or parent.get("model_revision") != base.MODEL_REVISION):
        raise ValueError("bound_completed_BigVGAN_parent_required")
    bindings = dict(parent["input_bindings"])
    expected = {str(model_root/"model/bigvgan_generator.pt"):base.WEIGHTS_SHA,
                str(model_root/"model/config.json"):base.CONFIG_SHA}
    if any(bindings.get(p) != sha for p,sha in expected.items()):
        raise ValueError("fixed_official_model_bindings_required")
    for path,sha in bindings.items():
        if base.private.sha256(base.regular(path,2000000000)) != sha:
            raise ValueError("parent_source_model_or_code_changed")
    state = subprocess.check_output(["git","-C",str(model_root/"upstream"),"status","--porcelain"],text=True)
    revision = subprocess.check_output(["git","-C",str(model_root/"upstream"),"rev-parse","HEAD"],text=True).strip()
    if state or revision != base.UPSTREAM:
        raise ValueError("clean_pinned_official_upstream_required")
    path = base.regular(source_report,1000000)
    report = json.loads(path.read_text())
    if report.get("schema") != "mini.world-source-copy.v1" or report.get("status") != "complete":
        raise ValueError("completed_bound_source_report_required")
    selected = [r for r in report["cases"] if r["case"] == "vib39"]
    if len(selected) != 1 or selected[0]["start_seconds"] != 2 or selected[0]["end_seconds"] != 6.8:
        raise ValueError("fixed_vib39_2to6p8_seconds_required")
    row = selected[0]
    original = base.regular(row["source_path"],2000000000)
    if row["source_sha256"] != SOURCE_SHA or base.private.sha256(original) != SOURCE_SHA:
        raise ValueError("fixed_NGC_original_SHA_required")
    rows = [a for a in row["audio"] if a["role"] == "source_excerpt" and a["sample_rate"] == 24000]
    if len(rows) != 1 or Path(rows[0]["file"]).name != rows[0]["file"]:
        raise ValueError("one_safe_native_source_excerpt_required")
    native = base.regular(path.parent/rows[0]["file"],1000000)
    if base.private.sha256(native) != rows[0]["sha256"]:
        raise ValueError("native_source_SHA_mismatch")
    x,rate = sf.read(native,dtype="float32")
    h = json.loads((model_root/"model/config.json").read_text())
    base.validate_input(x,h)
    if rate != base.SR:
        raise ValueError("native24k_required")
    for extra in (path,parent_report,original,native,Path(__file__)):
        bindings[str(extra)] = base.private.sha256(extra)
    return x,h,bindings


def run(model_root, source_report, output):
    x,h,bindings = load_inputs(model_root,source_report)
    destination = base.private.fresh_private_dir(output)
    started = time.monotonic()
    old_umask = os.umask(0o077)
    report = {"schema":"mini.bigvgan-fixed-spectral-pitch-trial.v1","date":"2026-10-23",
        "status":"started","input_bindings":bindings,"source_credit":base.private.CREDIT,
        "model_revision":base.MODEL_REVISION,"new_weights_training_or_download":False,
        "new_score_or_learned_vibrato":False,"source":"NGCvib39[2,6.8),24kfloat32",
        "frequency_edit":"magnitudeFFT[outbin/2**(semitones/12)] linearinterp; THEN officialSlaneymel/log",
        "also_transposes_spectral_envelope_and_noise":True,"output_pitch_or_time_correction":False,
        "additional_input_padding_or_output_trimming":False,"variants":[],"files":[]}
    def persist():
        fd=os.open(destination/"run_report.json",os.O_CREAT|os.O_WRONLY|os.O_TRUNC,0o600)
        with os.fdopen(fd,"w") as handle:
            json.dump(report,handle,indent=2,ensure_ascii=False,allow_nan=False)
    def save_audio(label,wave):
        for rate,suffix,a in ((24000,"24k_mono",wave),
                (48000,"48k_stereo",np.repeat(resample_poly(wave.astype(float),2,1)[:,None],2,axis=1))):
            path=destination/f"{label}_{suffix}.wav"
            sf.write(path,a,rate,subtype="FLOAT");path.chmod(0o600)
            report["files"].append({"role":label,"path":str(path),"sha256":base.private.sha256(path),
                "sample_rate":rate,"samples":len(a)})
    persist()
    try:
        with base.ace_limits.ResourceGuard(destination,base.ace_limits.ResourceCaps(
                max_seconds=900,max_rss_bytes=8*base.ace_limits.GIB)) as guard:
            import torch
            torch.set_num_threads(4);torch.set_num_interop_threads(1);torch.manual_seed(20261023)
            sys.path.insert(0,str(model_root/"upstream"))
            from bigvgan import BigVGAN
            from meldataset import get_mel_spectrogram
            from librosa.filters import mel as mel_basis
            from env import AttrDict
            report["resource_initial"]=guard.initial
            def deny_network(*_a,**_kw): raise RuntimeError("offline_inference_only")
            old_socket=socket.socket;socket.socket=deny_network
            try:
                tensor=torch.from_numpy(x.copy()).unsqueeze(0)
                official=get_mel_spectrogram(tensor,AttrDict(h))
                identity=make_mel(tensor,AttrDict(h),0,torch_module=torch,mel_basis_function=mel_basis)
                error=float(torch.max(torch.abs(official-identity)))
                if error > 1e-6:
                    raise ValueError("identity_mel_differs_from_official")
                report["identity_vs_official_mel_maxabs"]=error
                save_audio("source",x)
                for semitones,label in ((0,"unshifted"),(1,"plus1")):
                    def mel_fn(wav,config):
                        return make_mel(wav,config,semitones,torch_module=torch,mel_basis_function=mel_basis)
                    before=time.monotonic()
                    y,mel,facts=base.reconstruct(x,AttrDict(h),model_root/"model/bigvgan_generator.pt",
                        torch_module=torch,model_class=BigVGAN,mel_function=mel_fn)
                    report["variants"].append({"label":label,"semitones":semitones,
                        "ratio":2**(semitones/12),"elapsed_seconds":time.monotonic()-before,"facts":facts})
                    archive=destination/f"{label}_mel.npz"
                    np.savez_compressed(archive,mel=mel)
                    report["files"].append({"role":label+"_mel","path":str(archive),
                        "sha256":base.private.sha256(archive),"shape":list(mel.shape)})
                    save_audio(label,y);persist()
            finally:
                socket.socket=old_socket
            if any(base.private.sha256(Path(p)) != sha for p,sha in bindings.items()):
                raise ValueError("source_model_code_or_parent_changed")
            if sum(p.stat().st_size for p in destination.iterdir()) > 20000000:
                raise ValueError("twenty_MB_native_output_budget_exceeded")
            report.update(status="complete_pitch_and_listening_unapproved",inputs_unchanged=True)
        report["resource_final"]=guard.final
    except BaseException as exc:
        report.update(status="failed",error_type=type(exc).__name__,error=str(exc)[:500])
        raise
    finally:
        report["wall_seconds"]=time.monotonic()-started
        persist();os.umask(old_umask)
    return report


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-root",type=Path,required=True)
    parser.add_argument("--source-report",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    result=run(args.model_root,args.source_report,args.output)
    print(json.dumps({"status":result["status"],"wall_seconds":result["wall_seconds"]}))
