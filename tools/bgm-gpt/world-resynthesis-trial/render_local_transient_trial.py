#!/usr/bin/env python3
"""Local HF-only softening of the user-reported 029 transient, not a timbre fix.

No model, training, waveform insertion, nonlinear clipping, whole-track EQ or
automatic gain control. Original029 and National Gugak Center sources are read
only. Two fixed trials differ only in high-pass residual attenuation depth.
"""
import argparse
import json
import math
import os
from pathlib import Path
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy import signal

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "foundation-model-trial"))
import compare_audio as audio
import prepare_inputs as private

SR, FRAMES = 24000, 115200
WINDOW = (2.040, 2.055, 2.085, 2.100)
DEPTHS = (2., 4.)


def db(value):
    return float(20*np.log10(value)) if value > 0 else None


def bounds(seconds):
    return slice(round(seconds[0]*SR), round(seconds[1]*SR))


def window_envelope():
    time = np.arange(FRAMES)/SR
    first, plateau, release, last = WINDOW
    mask = np.zeros(FRAMES, dtype=np.float64)
    def smooth(u): return u**3*(10+u*(-15+6*u))
    a = (time >= first) & (time < plateau)
    mask[a] = smooth((time[a]-first)/(plateau-first))
    mask[(time >= plateau) & (time <= release)] = 1.
    a = (time > release) & (time < last)
    mask[a] = smooth((last-time[a])/(last-release))
    return mask


def waveform_metrics(x, seconds):
    x = x[bounds(seconds)]
    rms, peak = float(np.sqrt(np.mean(x*x))), float(np.max(np.abs(x)))
    return {"rms_dbfs": db(rms), "peak_dbfs": db(peak),
            "crest_db": db(peak/rms) if rms else None}


def soften(audio, depth_db):
    original = np.asarray(audio)
    if original.dtype not in (np.dtype("float32"),np.dtype("float64")):
        raise ValueError("float32_or_float64_waveform_required")
    x = original.astype(np.float64)
    if x.shape != (FRAMES,) or not np.isfinite(x).all() or depth_db not in DEPTHS:
        raise ValueError("finite_24k_mono_4p8s_and_fixed_2_or4db_trial_required")
    taps = signal.firwin(129, 3000, fs=SR, pass_zero=False, window=("kaiser",8.6))
    high = signal.fftconvolve(x, taps, mode="same")  # Symmetric, center-aligned; no time shift.
    envelope = window_envelope()
    correction = envelope*(1-10**(-depth_db/20))*high
    y = original.astype(np.float32).copy()
    inside = envelope > 0
    y[inside] = (x[inside]-correction[inside]).astype(np.float32)
    outside = envelope == 0
    if not np.array_equal(y[outside], x.astype(np.float32)[outside]) or not np.isfinite(y).all():
        raise ValueError("native_PCM_outside_edit_must_remain_identical")
    change = x-y.astype(np.float64)
    low = signal.fftconvolve(change, signal.firwin(129,2000,fs=SR,window=("kaiser",8.6)), mode="same")
    region = bounds((WINDOW[0],WINDOW[-1]))
    base_rms = float(np.sqrt(np.mean(x[region]**2)))
    low_rms = float(np.sqrt(np.mean(low[region]**2)))
    high_after = signal.fftconvolve(y.astype(np.float64),taps,mode="same")
    level = {}
    for ms in (5,10):
        kernel = np.ones(round(SR*ms/1000))/round(SR*ms/1000)
        before = np.sqrt(signal.convolve(x*x,kernel,mode="same")[region])
        after = np.sqrt(signal.convolve(y.astype(np.float64)**2,kernel,mode="same")[region])
        good = before > 1e-8
        delta = 20*np.log10(np.maximum(after[good],1e-12)/before[good])
        level[str(ms)] = [float(delta.min()),float(delta.max())] if good.any() else [None,None]
    facts = {"depth_db_on_HF_component_only":depth_db,
        "window_start_plateau_release_end_seconds":list(WINDOW),
        "filter":"129tap Kaiser8.6 FIR highpass3k, symmetric convolution centered on original timeline",
        "envelope":"quintic minimum jerk edges; no nonlinear limiter or waveform replacement",
        "native_float32_PCM_outside_window_identical":True,
        "edited_samples":int(np.count_nonzero(envelope)),
        "below2k_correction_rms_relative_to_local_input_db":db(low_rms/base_rms) if base_rms else None,
        "fixed_FIR_high_component_peak_dbfs_2p064to2p076":
            [db(float(np.max(np.abs(h[bounds((2.064,2.076))])))) for h in (high,high_after)],
        "local_fullband_rms_delta_db_5ms_10ms":level,
        "fullband_level_drop_exceeds1db":any(v[0] is not None and v[0] < -1 for v in level.values()),
        "before_after_fullband":{str(interval):[waveform_metrics(x,interval),waveform_metrics(y,interval)]
                                 for interval in ((2.064,2.076),(2.070,2.075),(2.040,2.100))},
        "fullband_crest_improvement_not_guaranteed":True,
        "physical_cause_or_auditory_success_not_established":True}
    return y, facts


def load_inputs(ablation_report, comparison_report):
    for path in (ablation_report,comparison_report):
        if not path.is_absolute() or path.is_symlink() or not path.is_file() or path.stat().st_size > 1_000_000:
            raise ValueError("bounded_absolute_regular_reports_required")
    report = json.loads(ablation_report.read_text())
    comparison = json.loads(comparison_report.read_text())
    if report.get("schema") != "mini.world-d4c-threshold-ablation.v1" or report.get("status") != "complete_quality_unapproved":
        raise ValueError("completed_bound_029_ablation_required")
    selected = [c for c in report["cases"] if c["case"] == "arirang002"]
    if len(selected) != 1: raise ValueError("single_arirang002_required")
    paths = []
    binding = {str(p):private.sha256(p) for p in (ablation_report,comparison_report,Path(__file__),Path(audio.__file__))}
    for rate in (24000,48000):
        rows = [r for r in selected[0]["audio"] if r["sample_rate"] == rate]
        if len(rows) != 1 or Path(rows[0]["file"]).name != rows[0]["file"]:
            raise ValueError("bound_native_and_SRC_pair_required")
        path = ablation_report.parent/rows[0]["file"]
        if path.is_symlink() or not path.is_file() or private.sha256(path) != rows[0]["sha256"]:
            raise ValueError("bound_029_audio_SHA_mismatch")
        binding[str(path)] = rows[0]["sha256"]
        paths.append(path)
    levels = [r for r in comparison["outputs"] if r["source_path"] == str(paths[1])]
    if (comparison.get("status") != "ready" or comparison.get("seconds") != 4.8 or len(levels) != 1
            or levels[0]["source_sha256"] != private.sha256(paths[1])):
        raise ValueError("original_029_static_gain_binding_required")
    gain = levels[0]["static_gain_db"]
    if not math.isfinite(gain): raise ValueError("finite_original_static_gain_required")
    x,rate = sf.read(paths[0],dtype="float64")
    if rate != SR or x.shape != (FRAMES,): raise ValueError("exact_native_029_required")
    return x,gain,binding


def run(ablation_report,comparison_report,output):
    x,gain,binding = load_inputs(ablation_report,comparison_report)
    destination = private.fresh_private_dir(output)
    previous = os.umask(0o077)
    try:
        report = {"schema":"mini.029-local-transient-listening-trial.v1","date":"2026-10-18",
            "confirmed_user_file":"029_WORLD_고음판별수정후_동일구절.m4a",
            "input_bindings":binding,"common_static_gain_db":gain,"variants":[],
            "source_credit":"국악기 음원 제공 — 국립국악원 (공공누리 제1유형)",
            "new_model_training_or_synthesis":False,"source_waveform_insertion":False,
            "global_EQ_AGC_limiter_or_pitch_time_edit":False,"auditory_success":False}
        for name,depth in (("before",0.),("soft2",2.),("soft4",4.)):
            y,facts = (x.astype(np.float32),{}) if not depth else soften(x,depth)
            native = destination/f"{name}_24k_mono.wav"
            sf.write(native,y,SR,subtype="FLOAT");native.chmod(0o600)
            high = np.repeat(signal.resample_poly(y.astype(np.float64),2,1)[:,None],2,axis=1).astype(np.float32)
            path = destination/f"{name}.m4a"
            audio.encode(high,path,gain);path.chmod(0o600)
            decoded = audio.decode(path,trim=False)
            probe = subprocess.run(["ffprobe","-v","error","-select_streams","a:0","-show_entries",
                "stream=duration,sample_rate,channels,codec_name","-of","json",str(path)],
                capture_output=True,check=True,timeout=20)
            stream = json.loads(probe.stdout)["streams"][0]
            if (stream["codec_name"] != "aac" or int(stream["sample_rate"]) != 48000
                    or int(stream["channels"]) != 2 or abs(float(stream["duration"])-4.8) > 1/48000):
                raise ValueError("AAC_container_must_remain_exact4p8s_48k_stereo")
            measurement = audio.measure(decoded)
            if len(decoded) > 230400+1023 or measurement["true_peak_dbfs"] > -1.1:
                raise ValueError("AAC_padding_or_peak_failed")
            if abs(measurement["integrated_lufs"]+24) > .3:
                raise ValueError("same_static_gain_loudness_failed_no_renormalization")
            report["variants"].append({"role":name,"depth_db":depth,"facts":facts,
                "native_file":native.name,"native_sha256":private.sha256(native),
                "file":path.name,"sha256":private.sha256(path),"decoded_frames":len(decoded),"decoded":measurement})
        if any(private.sha256(Path(p)) != h for p,h in binding.items()):
            raise ValueError("immutable_input_or_code_changed")
        if sum(p.stat().st_size for p in destination.iterdir()) > 20_000_000:
            raise ValueError("twenty_MB_trial_budget_exceeded")
        report.update(status="ready_not_listening_approved",inputs_unchanged=True,
            duration_seconds=4.8,sample_rate_hz=48000,channels=2,
            note="All versions use original029 constant gain; outside-edit native PCM exact, SRC/AAC need not be bit-identical; high-frequency energy excess is NOT established as the cause")
        fd=os.open(destination/"local_trial.json",os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,"w",encoding="utf-8") as handle:
            json.dump(report,handle,ensure_ascii=False,indent=2,allow_nan=False)
        return report
    finally:
        os.umask(previous)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ablation-report",type=Path,required=True)
    parser.add_argument("--comparison-report",type=Path,required=True)
    parser.add_argument("--output-dir",type=Path,required=True)
    args=parser.parse_args()
    report=run(args.ablation_report,args.comparison_report,args.output_dir)
    print(json.dumps({"status":report["status"],"variants":len(report["variants"])}))
