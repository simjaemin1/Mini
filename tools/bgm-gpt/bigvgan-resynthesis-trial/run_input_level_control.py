#!/usr/bin/env python3
"""One exploratory source-level control, never AGC or a new trained model.

The first unchanged-level trial remains intact. Apply one source-only constant
to peak0.5 before mel, then exactly invert that constant on model output.
"""
import argparse
import json
import os
from pathlib import Path
import socket
import sys
import time

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

import run_spectral_pitch_trial as method
base = method.base


def fixed_level(x):
    peak=float(np.abs(x).max())
    if x.shape != (115200,) or x.dtype != np.float32 or not np.isfinite(x).all() or peak <= 1e-8:
        raise ValueError("exact_audible_float32_source_required")
    gain=0.5/peak
    return (x.astype(float)*gain).astype(np.float32),gain


def run(model_root,source_report,raw_report,output):
    x,h,bindings=method.load_inputs(model_root,source_report)
    path=base.regular(raw_report,1000000)
    raw=json.loads(path.read_text())
    if (raw.get("schema") != "mini.bigvgan-fixed-spectral-pitch-trial.v1"
            or raw.get("status") != "complete_pitch_and_listening_unapproved"
            or raw.get("input_bindings") != bindings):
        raise ValueError("same_source_method_and_completed_raw_trial_required")
    bindings.update({str(path):base.private.sha256(path),str(Path(__file__)):base.private.sha256(Path(__file__))})
    model_x,gain=fixed_level(x)
    destination=base.private.fresh_private_dir(output)
    started=time.monotonic()
    old_umask=os.umask(0o077)
    report={"schema":"mini.bigvgan-source-level-control.v1","date":"2026-10-23","status":"started",
        "input_bindings":bindings,"source_credit":base.private.CREDIT,"exploratory_after_raw_jitter_observed":True,
        "model_revision":base.MODEL_REVISION,"input_target_peak":0.5,"source_original_peak":float(np.abs(x).max()),
        "input_static_gain":gain,"input_static_gain_db":float(20*np.log10(gain)),
        "output_static_gain":1/gain,"no_AGC_or_framewise_gain":True,
        "new_weights_training_or_model_download":False,"new_score_or_learned_vibrato":False,
        "same_spectral_warp_as_raw_trial":True,"variants":[],"files":[]}
    def persist():
        fd=os.open(destination/"run_report.json",os.O_CREAT|os.O_WRONLY|os.O_TRUNC,0o600)
        with os.fdopen(fd,"w") as handle:
            json.dump(report,handle,ensure_ascii=False,indent=2,allow_nan=False)
    persist()
    try:
        with base.ace_limits.ResourceGuard(destination,base.ace_limits.ResourceCaps(
                max_seconds=900,max_rss_bytes=8*base.ace_limits.GIB)) as guard:
            import torch
            torch.set_num_threads(4);torch.set_num_interop_threads(1);torch.manual_seed(20261023)
            sys.path.insert(0,str(model_root/"upstream"))
            from bigvgan import BigVGAN
            from env import AttrDict
            from librosa.filters import mel as mel_basis
            def deny_network(*_a,**_kw): raise RuntimeError("offline_inference_only")
            old_socket=socket.socket;socket.socket=deny_network
            try:
                for semitones,label in ((0,"unshifted"),(1,"plus1")):
                    def mel_fn(wav,config):
                        return method.make_mel(wav,config,semitones,
                            torch_module=torch,mel_basis_function=mel_basis)
                    y,mel,facts=base.reconstruct(model_x,AttrDict(h),model_root/"model/bigvgan_generator.pt",
                        torch_module=torch,model_class=BigVGAN,mel_function=mel_fn)
                    restored=(y.astype(float)/gain).astype(np.float32)
                    if restored.shape != x.shape or not np.isfinite(restored).all():
                        raise ValueError("finite_same_length_after_inverse_constant_required")
                    report["variants"].append({"label":label,"semitones":semitones,"model_facts":facts,
                        "restored_rms":float(np.sqrt(np.mean(restored.astype(float)**2)))})
                    archive=destination/f"{label}_mel.npz"
                    np.savez_compressed(archive,mel=mel)
                    report["files"].append({"path":str(archive),"sha256":base.private.sha256(archive)})
                    for rate,suffix,wave in ((24000,"24k_mono",restored),
                            (48000,"48k_stereo",np.repeat(resample_poly(restored.astype(float),2,1)[:,None],2,axis=1))):
                        path=destination/f"{label}_{suffix}.wav"
                        sf.write(path,wave,rate,subtype="FLOAT");path.chmod(0o600)
                        report["files"].append({"role":label,"path":str(path),"sha256":base.private.sha256(path),
                            "sample_rate":rate,"samples":len(wave)})
                    persist()
            finally:
                socket.socket=old_socket
            if any(base.private.sha256(Path(p)) != sha for p,sha in bindings.items()):
                raise ValueError("immutable_inputs_changed")
            if sum(p.stat().st_size for p in destination.iterdir()) > 15000000:
                raise ValueError("fifteen_MB_level_control_budget_exceeded")
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
    parser.add_argument("--raw-report",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    result=run(args.model_root,args.source_report,args.raw_report,args.output)
    print(json.dumps({"status":result["status"],"wall_seconds":result["wall_seconds"]}))
