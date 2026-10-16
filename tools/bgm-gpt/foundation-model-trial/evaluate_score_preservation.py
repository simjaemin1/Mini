#!/usr/bin/env python3
"""Read-only B1/+2-semitone score preservation; numerical preview eligibility only.

No model, alignment search, octave correction, dynamic warp or audio editing.
Monophonic YIN can mistake mixed partials; octave-folded diagnostics never pass
the gate. The 50-cent criterion does not establish 18-cent vibrato retention.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import sys

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "aihub-readiness"))
import mac_mps_ddsp_features as yin

PRIVATE_ROOT = Path.home() / "Mini/_bgm/gpt"
SR, DURATION, PREVIEW = 16000, 19.2, 4.8
START_EDGE, END_EDGE, REST_EDGE = .080, .040, .040
NEAR_CENTS, MIN_FRACTION, REST_DB, LEAK_DB, FLOOR_DB = 50., .95, -35., 6., -120.


def digest(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def read_audio(path):
    path = Path(path)
    if not stat.S_ISREG(path.lstat().st_mode) or path.stat().st_size > 16 * 1024**2:
        raise ValueError("small_regular_local_audio_required")
    audio, rate = sf.read(path, dtype="float64", always_2d=True)
    if rate not in (16000, 48000) or audio.shape[1] not in (1, 2):
        raise ValueError("16k_or_48k_mono_or_stereo_required")
    if len(audio) != round(DURATION * rate) or not np.isfinite(audio).all():
        raise ValueError("exact_finite_19p2_second_audio_required")
    if rate == 48000:
        from scipy.signal import resample_poly
        audio = resample_poly(audio, 1, 3, axis=0)
    return audio


def read_plan(path):
    plan = json.loads(Path(path).read_text())
    events = plan["events"]
    notes = [e for e in events if e["articulation"] != "release"]
    rests = [e for e in events if e["articulation"] == "release"]
    if plan.get("schema") != "mini.score-expression.plan.v1" or len(notes) != 28 or len(rests) != 4:
        raise ValueError("explicit_28_note_four_rest_authorial_plan_required")
    ordered = sorted(events, key=lambda e: e["start_seconds"])
    last = 0.
    for event in ordered:
        a, b = float(event["start_seconds"]), float(event["end_seconds"])
        if not (math.isfinite(a + b) and math.isclose(a, last, abs_tol=1e-8) and a < b <= DURATION):
            raise ValueError("contiguous_finite_19p2_second_plan_required")
        if event["articulation"] != "release" and not 80 < event["pitch_hz"] < 1400:
            raise ValueError("supported_nominal_pitch_required")
        last = b
    if not math.isclose(last, DURATION, abs_tol=1e-8):
        raise ValueError("plan_duration_mismatch")
    return notes, rests


def track(audio):
    signal = audio.mean(axis=1)
    frames = np.lib.stride_tricks.sliding_window_view(np.pad(signal, (512, 512), mode="reflect"), 1024)[::160][:1920]
    pitch, voiced = np.zeros(1920), np.zeros(1920, dtype=bool)
    for start in range(0, 1920, 256):
        chunk = frames[start:start + 256]
        db = 20 * np.log10(np.maximum(np.sqrt(np.mean(chunk**2, axis=1)), 1e-12))
        pitch[start:start + len(chunk)], voiced[start:start + len(chunk)] = yin._yin_pitch_for_chunk(chunk, db, sample_rate=SR)
    return pitch, voiced


def pitch_metrics(mask, guide, candidate, nominal=None):
    gp, gv = guide
    cp, cv = candidate
    count = int(mask.sum())
    both = mask & gv & cv
    cents = 1200 * np.log2(cp[both] / gp[both])
    near = int(np.count_nonzero(np.abs(cents) <= NEAR_CENTS))
    folded = (cents + 600) % 1200 - 600
    result = {"frames": count, "guide_voiced_fraction": float(gv[mask].mean()),
        "candidate_voiced_fraction": float(cv[mask].mean()), "near_50c_frames": near,
        "near_50c_fraction_all": near / count, "shared_voiced_frames": int(both.sum()),
        "median_abs_cents_shared": float(np.median(np.abs(cents))) if len(cents) else None,
        "octave_ambiguous_fraction_all": float(np.count_nonzero((np.abs(cents) > 600) & (np.abs(folded) <= 50)) / count),
        "pitch_class_near_50c_fraction_all_diagnostic_only": float(np.count_nonzero(np.abs(folded) <= 50) / count)}
    if nominal is not None:
        error = 1200 * np.log2(gp[mask & gv] / (nominal * 2**(2 / 12)))
        result["guide_matches_plan_plus2_fraction_all"] = float(np.count_nonzero(np.abs(error) <= 50) / count)
        error = 1200 * np.log2(cp[mask & cv] / (nominal * 2**(2 / 12)))
        result["candidate_matches_plan_plus2_fraction_all"] = float(np.count_nonzero(np.abs(error) <= 50) / count)
    result["passed"] = all(result[k] >= MIN_FRACTION for k in
        ("guide_voiced_fraction", "candidate_voiced_fraction", "near_50c_fraction_all"))
    result["passed"] &= result.get("guide_matches_plan_plus2_fraction_all", 1.) >= MIN_FRACTION
    result["passed"] &= result.get("candidate_matches_plan_plus2_fraction_all", 1.) >= MIN_FRACTION
    return result


def scope_metrics(limit, notes, rests, ga, ca, gt, ct):
    times = np.arange(1920) / 100
    stable = np.zeros(1920, dtype=bool)
    active = np.zeros(len(ga), dtype=bool)
    rows = []
    for event in notes:
        a, b = event["start_seconds"] + START_EDGE, min(event["end_seconds"] - END_EDGE, limit)
        if a >= b:
            continue
        mask = (times >= a - 1e-10) & (times < b - 1e-10)
        stable |= mask
        active[round(a * SR):round(b * SR)] = True
        rows.append({"id": event["id"], **pitch_metrics(mask, gt, ct, event["pitch_hz"])})
    rms = lambda x: float(np.sqrt(np.mean(x**2)))
    active_rms = [rms(audio[active]) for audio in (ga, ca)]
    rest_rows = []
    for event in rests:
        if event["end_seconds"] > limit + 1e-8:
            continue
        a, b = event["start_seconds"] + REST_EDGE, event["end_seconds"] - REST_EDGE
        ratios = [rms(audio[round(a * SR):round(b * SR)]) / max(level, 1e-12)
                  for audio, level in zip((ga, ca), active_rms)]
        db = [20 * math.log10(max(r, 10**(FLOOR_DB / 20))) for r in ratios]
        rest_rows.append({"start_seconds": a, "end_seconds": b, "guide_db_vs_active": db[0],
            "candidate_db_vs_active": db[1], "leak_delta_db": db[1] - db[0],
            "passed": db[1] <= REST_DB and db[1] <= db[0] + LEAK_DB})
    aggregate = pitch_metrics(stable, gt, ct)
    aggregate["candidate_matches_plan_plus2_fraction_all"] = sum(row["frames"] * row["candidate_matches_plan_plus2_fraction_all"] for row in rows) / int(stable.sum())
    aggregate["passed"] &= aggregate["candidate_matches_plan_plus2_fraction_all"] >= MIN_FRACTION
    pitch_pass = aggregate["passed"] and all(row["passed"] for row in rows)
    return {"seconds": limit, "pitch": aggregate, "notes": rows, "rests": rest_rows,
        "active_rms": {"guide": active_rms[0], "candidate": active_rms[1]}, "pitch_passed": pitch_pass,
        "rests_passed": bool(rest_rows) and all(row["passed"] for row in rest_rows),
        "passed": pitch_pass and bool(rest_rows) and all(row["passed"] for row in rest_rows)}


def evaluate(guide, candidate, plan):
    paths = [Path(p).resolve(strict=True) for p in (guide, candidate, plan)]
    hashes = [digest(p) for p in paths]
    ga, ca = map(read_audio, paths[:2])
    notes, rests = read_plan(paths[2])
    gt, ct = track(ga), track(ca)
    full = scope_metrics(DURATION, notes, rests, ga, ca, gt, ct)
    preview = scope_metrics(PREVIEW, notes, rests, ga, ca, gt, ct)
    if hashes != [digest(p) for p in paths]:
        raise ValueError("input_changed_during_evaluation")
    return {"schema": "mini.foundation-score-preservation.v1", "status": "complete",
        "binding": dict(zip(("guide_sha256", "candidate_sha256", "plan_sha256"), hashes)),
        "script_sha256": digest(__file__), "yin_helper_sha256": digest(yin.__file__),
        "criteria": {"near_cents": NEAR_CENTS, "min_fraction_aggregate_and_each_note": MIN_FRACTION,
            "rest_db_vs_active_max": REST_DB, "leak_delta_db_max": LEAK_DB, "relative_rms_floor_db": FLOOR_DB,
            "start_edge_seconds": START_EDGE, "end_edge_seconds": END_EDGE, "rest_edge_seconds": REST_EDGE},
        "method": "16k mono-mean FFT-YIN1024/64ms,hop160/10ms,80..1400Hz,threshold.17,RMSfloor-60dBFS; no warp/shift; guide checked against plan+2semi; rest/all-stable-sample RMS uses all channels",
        "full_19p2s": full, "first_4p8s": preview,
        "numerical_preview_eligible": full["passed"] and preview["passed"],
        "auditory_quality_or_instrument_identity_approved": False,
        "limits": ["Mixed partials can confuse monophonic YIN; folded-pitch diagnostics never override failure.",
                   "Both actual-guide50c and nominal-plan-plus2semi50c gates apply independently.",
                   "50-cent proximity cannot prove retention of authored18-cent final vibrato.",
                   "This report performs no audio edits, model inference, or external transfer."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("guide", "candidate", "plan", "output-report"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    parent = args.output_report.parent.resolve(strict=True)
    root = PRIVATE_ROOT.resolve(strict=True)
    if root not in parent.parents or stat.S_IMODE(parent.stat().st_mode) & 0o077:
        raise ValueError("private_0700_report_directory_required")
    report = evaluate(args.guide, args.candidate, args.plan)
    descriptor = os.open(args.output_report, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
    print(json.dumps({"status": "complete", "numerical_preview_eligible": report["numerical_preview_eligible"]}))


if __name__ == "__main__":
    main()
