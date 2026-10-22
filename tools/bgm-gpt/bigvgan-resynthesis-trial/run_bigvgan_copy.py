#!/usr/bin/env python3
"""One private, offline BigVGAN-v2 reconstruction of the exact source behind027.

Not new music, score conditioning, fine-tuning, or a daegeum quality approval.
The only model input is the unnormalized source waveform's official mel.
"""
import argparse
from importlib.metadata import version, distributions
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

import numpy as np
from scipy.signal import resample_poly
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "foundation-model-trial"))
import ace_limits
import prepare_inputs as private

SR, SAMPLES, HOP, MEL_FRAMES = 24000, 115200, 256, 450
UPSTREAM = "7d2b454564a6c7d014227f635b7423881f14bdac"
MODEL_REVISION = "c329ede9e9bbc100ddf5c91e2330a61921262370"
WEIGHTS_SHA = "6f9c5715550c9d0f11159ceb8935638da5aeb19e27d1e63677632df095e376f5"
CONFIG_SHA = "d77e2c96583ca2296ac112a56ec7cc6bd5da4bf7681ceff18448bedc4fcf6512"
SOURCE_SHA = "8b5316217a10d0242aa6ae35f8e36a7724b59ef57771e4d1c883d5d2c8d31887"


def regular(path, limit):
    path = Path(path)
    if (not path.is_absolute() or path.is_symlink() or not path.is_file()
            or path.stat().st_size > limit):
        raise ValueError("bounded_absolute_regular_file_required")
    return path


def validate_input(x, h):
    x = np.asarray(x)
    expected = {"sampling_rate": SR, "num_mels": 100, "n_fft": 1024,
                "win_size": 1024, "hop_size": HOP, "fmin": 0, "fmax": None}
    if any(h.get(k) != value for k, value in expected.items()):
        raise ValueError("exact_official24k100mel256hop_config_required")
    if (x.shape != (SAMPLES,) or x.dtype != np.float32 or not np.isfinite(x).all()
            or np.max(np.abs(x)) > 1 or np.sqrt(np.mean(x.astype(float)**2)) <= 1e-8):
        raise ValueError("exact_finite_audible_115200_float32_mono_required")
    return x


def reconstruct(x, h, weights, *, torch_module, model_class, mel_function):
    """Dependency-injected for synthetic tests; never pads or normalizes x."""
    x = validate_input(x, h)
    before = x.tobytes()
    torch = torch_module
    model = model_class(h, use_cuda_kernel=False).to("cpu").float()
    checkpoint = torch.load(weights, map_location="cpu", weights_only=True)
    if not isinstance(checkpoint, dict) or "generator" not in checkpoint:
        raise ValueError("generator_state_dict_required")
    model.load_state_dict(checkpoint["generator"], strict=True)
    del checkpoint
    model.remove_weight_norm()
    model.eval()
    model.requires_grad_(False)
    tensor = torch.from_numpy(x.copy()).unsqueeze(0)
    with torch.inference_mode():
        mel = mel_function(tensor, h)
        if tuple(mel.shape) != (1, 100, MEL_FRAMES) or not bool(torch.isfinite(mel).all()):
            raise ValueError("official_mel_must_be_1x100x450_finite")
        output = model(mel)
        if tuple(output.shape) != (1, 1, SAMPLES) or not bool(torch.isfinite(output).all()):
            raise ValueError("exact_finite_untrimmed_115200_model_samples_required")
        y = output[0, 0].cpu().numpy().copy()
        saved_mel = mel[0].cpu().numpy().copy()
    if x.tobytes() != before:
        raise ValueError("source_mutation")
    saturated = int(np.count_nonzero(np.abs(y) >= 1))
    if saturated or np.sqrt(np.mean(y.astype(float)**2)) <= 1e-8:
        raise ValueError("silent_or_saturated_model_output_not_publishable")
    facts = {"input_shape": list(tensor.shape), "mel_shape": [1,100,MEL_FRAMES],
        "output_shape": [1,1,SAMPLES], "parameters": sum(p.numel() for p in model.parameters()),
        "input_gain_db": 0, "input_normalized": False, "additional_padding_or_trim_samples": 0,
        "output_saturated_sample_count": saturated, "sample_rate_hz": SR,
        "device": "cpu", "dtype": "float32", "use_cuda_kernel": False,
        "checkpoint_weights_only": True, "state_loading_strict": True,
        "source_PCM_inserted_into_output": False, "source_unchanged": True,
        "output_rms": float(np.sqrt(np.mean(y.astype(float)**2))),
        "source_rms": float(np.sqrt(np.mean(x.astype(float)**2))),
        "output_peak": float(np.abs(y).max()),
        "source_timing_searched_or_warped": False, "naturalness_approved": False}
    return y, saved_mel, facts


def load_bound_inputs(root, source_report):
    root = root.resolve(strict=True)
    report_path = regular(source_report, 1000000)
    report = json.loads(report_path.read_text())
    if report.get("schema") != "mini.world-source-copy.v1" or report.get("status") != "complete":
        raise ValueError("completed_source_report_required")
    rows = [r for r in report["cases"] if r["case"] == "arirang002"]
    if len(rows) != 1 or rows[0]["start_seconds"] != 0 or rows[0]["end_seconds"] != 4.8:
        raise ValueError("same027_original_interval_required")
    row = rows[0]
    original = regular(row["source_path"], 2000000000)
    if row["source_sha256"] != SOURCE_SHA or private.sha256(original) != SOURCE_SHA:
        raise ValueError("NGC_original_SHA_mismatch")
    archive_row = row["controls_archive"]
    if Path(archive_row["file"]).name != archive_row["file"]:
        raise ValueError("unsafe_archive_name")
    archive = regular(report_path.parent/archive_row["file"], 20000000)
    if private.sha256(archive) != archive_row["sha256"]:
        raise ValueError("source_archive_SHA_mismatch")
    with np.load(archive, allow_pickle=False) as saved:
        x = saved["source_waveform_24k"].astype(np.float32)
    checkpoint = regular(root/"model/bigvgan_generator.pt", 451000000)
    config = regular(root/"model/config.json", 10000)
    if private.sha256(checkpoint) != WEIGHTS_SHA or private.sha256(config) != CONFIG_SHA:
        raise ValueError("official_model_or_config_SHA_mismatch")
    upstream = root/"upstream"
    sha = subprocess.check_output(["git","-C",str(upstream),"rev-parse","HEAD"], text=True).strip()
    dirty = subprocess.check_output(["git","-C",str(upstream),"status","--porcelain"], text=True)
    if sha != UPSTREAM or dirty:
        raise ValueError("exact_clean_official_upstream_required")
    h = json.loads(config.read_text())
    validate_input(x,h)
    files = [original,archive,report_path,checkpoint,config,Path(__file__)]
    files += list(upstream.rglob("*.py"))
    files += [upstream/"LICENSE",root/"model/LICENSE"] + list((upstream/"incl_licenses").rglob("*"))
    bindings = {str(p):private.sha256(regular(p,2000000000)) for p in files if p.is_file()}
    return x,h,bindings


def write_json(path, value):
    fd = os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,"w") as handle:
        json.dump(value,handle,indent=2,ensure_ascii=False,allow_nan=False)


def run(root, source_report, output):
    x,h,bindings = load_bound_inputs(root,source_report)
    destination = private.fresh_private_dir(output)
    started = time.monotonic()
    previous = os.umask(0o077)
    report = {"schema":"mini.bigvgan027-source-reconstruction.v1","date":"2026-10-22",
        "status":"started", "input_bindings":bindings, "source_credit":private.CREDIT,
        "model":"nvidia/bigvgan_v2_24khz_100band_256x", "model_revision":MODEL_REVISION,
        "upstream_commit":UPSTREAM,"new_training":False,"new_music":False,
        "network_or_audio_upload":False,"source_waveform_used":"original source only; not029 resynthesis",
        "input_conversion":"same027 source; original44.1k FFmpeg24k float64 then float32; no normalization",
        "mel":"official Slaney magnitude/natural log,1024Hann,hop256,384reflect/side,center=False",
        "max_seconds":900,"max_rss_bytes":8*ace_limits.GIB,"files":[]}
    def persist():
        fd=os.open(destination/"run_report.json",os.O_CREAT|os.O_WRONLY|os.O_TRUNC,0o600)
        with os.fdopen(fd,"w") as handle:
            json.dump(report,handle,indent=2,ensure_ascii=False,allow_nan=False)
    persist()
    try:
        with ace_limits.ResourceGuard(destination,ace_limits.ResourceCaps(
                max_seconds=900,max_rss_bytes=8*ace_limits.GIB)) as guard:
            import torch
            torch.set_num_threads(4)
            torch.set_num_interop_threads(1)
            torch.manual_seed(20261022)
            sys.path.insert(0,str(root/"upstream"))
            from bigvgan import BigVGAN
            from meldataset import get_mel_spectrogram
            from env import AttrDict
            report.update(resource_initial=guard.initial,versions={name:version(name) for name in
                          ("torch","numpy","scipy","soundfile","librosa","huggingface_hub")})
            # No Hub downloader or model-provided Python is executed. All files are pinned local.
            def deny_network(*_a,**_kw): raise RuntimeError("offline_inference_only")
            old_socket=socket.socket
            socket.socket=deny_network
            try:
                before=time.monotonic()
                y,mel,facts=reconstruct(x,AttrDict(h),root/"model/bigvgan_generator.pt",
                    torch_module=torch,model_class=BigVGAN,mel_function=get_mel_spectrogram)
            finally:
                socket.socket=old_socket
            report.update(inference=facts,inference_and_load_seconds=time.monotonic()-before)
            np.savez_compressed(destination/"official_source_mel.npz",mel=mel)
            for label,a in (("source",x),("bigvgan",y)):
                for rate,suffix,wave in ((SR,"24k_mono",a),
                        (48000,"48k_stereo",np.repeat(resample_poly(a.astype(float),2,1)[:,None],2,axis=1))):
                    path=destination/f"{label}_{suffix}.wav"
                    sf.write(path,wave,rate,subtype="FLOAT")
                    path.chmod(0o600)
                    report["files"].append({"role":label,"path":str(path),"sha256":private.sha256(path),
                        "sample_rate":rate,"samples":len(wave),"type":"WAV_FLOAT"})
            if any(private.sha256(Path(p)) != sha for p,sha in bindings.items()):
                raise ValueError("original_model_source_or_code_changed")
            if sum(p.stat().st_size for p in destination.iterdir()) > 20000000:
                raise ValueError("twenty_MB_output_budget_exceeded")
            report.update(status="complete_not_listening_approved",inputs_unchanged=True)
        report["resource_final"]=guard.final
    except BaseException as exc:
        report.update(status="failed",error_type=type(exc).__name__,error=str(exc)[:500])
        raise
    finally:
        report["wall_seconds"]=time.monotonic()-started
        persist()
        os.umask(previous)
    return report


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root",type=Path,required=True)
    parser.add_argument("--source-report",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    result=run(args.root,args.source_report,args.output)
    print(json.dumps({k:result[k] for k in ("status","wall_seconds","inference_and_load_seconds")}))
