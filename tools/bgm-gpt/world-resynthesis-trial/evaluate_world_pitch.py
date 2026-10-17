#!/usr/bin/env python3
"""Read-only source-copy pitch diagnostic, not a natural-timbre quality gate.

24k mono WAVs must have the same exact length (1s or 4.8s). Source-only YIN
confident/stable frames define the denominator before candidate measurement.
No offset search, warping, F0 interpolation, WORLD controls, or torch is used.
YIN is an imperfect independent acoustic proxy, not ground-truth transcription.
One source-only constant brings whole-excerpt analysis RMS to -30dBFS and is
applied identically to both arrays, never saved audio or candidate-only AGC.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat

import numpy as np
from scipy.signal import resample_poly
import soundfile as sf

HELPER = Path(__file__).resolve().parents[1] / "aihub-readiness/mac_mps_ddsp_features.py"
spec = importlib.util.spec_from_file_location("world_pitch_existing_yin", HELPER)
features = importlib.util.module_from_spec(spec)
spec.loader.exec_module(features)
PRIVATE_ROOT = Path.home() / "Mini/_bgm/gpt"
SR = 24000


def sha256(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def read_wave(path):
    path = Path(path)
    if not path.is_absolute() or path.suffix.lower() != ".wav" or not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError("absolute_regular_local_wav_required")
    audio, rate = sf.read(path, dtype="float64", always_2d=True)
    if (rate != SR or audio.shape[1] != 1 or len(audio) not in (SR, round(4.8 * SR))
            or not np.isfinite(audio).all()):
        raise ValueError("finite_24k_mono_exact_1s_or_4p8s_required")
    return audio[:, 0]


def source_stable_mask(source):
    """Exclude 50ms at file/voiced-run boundaries, then require ±2-frame stability."""
    pitch = np.asarray(source["pitch_hz"], dtype=np.float64)
    voiced = np.asarray(source["voiced_mask"], dtype=np.bool_) & (pitch > 0)
    mask = np.convolve(voiced.astype(np.int32), np.ones(11, dtype=np.int32), mode="same") == 11
    neighborhoods = np.lib.stride_tricks.sliding_window_view(pitch, 5)
    spread = 1200 * np.log2(np.maximum(neighborhoods.max(1), 1e-12)
                            / np.maximum(neighborhoods.min(1), 1e-12))
    stable = np.zeros(len(pitch), dtype=np.bool_)
    stable[2:-2] = spread <= 50
    return mask & stable


def analysis_level(source, candidate):
    source_rms, candidate_rms = [float(np.sqrt(np.mean(audio * audio))) for audio in (source, candidate)]
    gain = 10 ** (-30 / 20) / source_rms if source_rms > 0 else 1.
    def db(value): return float(20 * np.log10(value)) if value > 0 else None
    metadata = {"target_source_rms_dbfs": -30., "raw_source_rms": source_rms,
        "raw_candidate_rms": candidate_rms, "raw_source_rms_dbfs": db(source_rms),
        "raw_candidate_rms_dbfs": db(candidate_rms),
        "raw_rms_delta_db": db(candidate_rms / source_rms) if source_rms > 0 else None,
        "common_analysis_gain": gain, "common_analysis_gain_db": db(gain),
        "gain_source": "whole source excerpt only; silent source uses gain1",
        "same_constant_applied_to_both": True, "saved_audio_modified": False}
    return source * gain, candidate * gain, metadata


def pitch_metrics(source, candidate, semitones):
    if semitones not in (0, 1): raise ValueError("only_0_or_plus1_semitone_supported")
    if len(source["pitch_hz"]) != len(candidate["pitch_hz"]):
        raise ValueError("matching_feature_frames_required")
    mask = source_stable_mask(source)
    reference = np.asarray(source["pitch_hz"], dtype=np.float64) * 2 ** (semitones / 12)
    measured = np.asarray(candidate["pitch_hz"], dtype=np.float64)
    candidate_voiced = np.asarray(candidate["voiced_mask"], dtype=np.bool_) & np.isfinite(measured) & (measured > 0)
    shared = mask & candidate_voiced
    cents = 1200 * np.log2(measured[shared] / reference[shared])
    valid, voiced = int(mask.sum()), int(shared.sum())
    near = int((np.abs(cents) <= 50).sum())
    octave = np.rint(cents / 1200)
    octave_errors = (octave != 0) & (np.abs(cents - octave * 1200) <= 50)
    outside = int((mask & ((reference < features.YIN_MIN_HZ) | (reference > features.YIN_MAX_HZ))).sum())
    coverage, near_fraction = (voiced / valid, near / valid) if valid else (None, None)
    return {"feature_frames": len(mask), "source_voiced_frames": int(np.asarray(source["voiced_mask"]).sum()),
        "source_valid_stable_frames": valid, "source_valid_fraction_all_frames": valid / len(mask),
        "source_mask_indices": np.flatnonzero(mask).tolist(),
        "source_mask_sha256": hashlib.sha256(mask.tobytes()).hexdigest(),
        "target_semitones": semitones, "shared_voiced_frames": voiced, "near50c_frames": near,
        "candidate_voicing_coverage": coverage, "near50c_fraction_source_valid": near_fraction,
        "median_abs_cents": float(np.median(np.abs(cents))) if voiced else None,
        "p95_abs_cents": float(np.quantile(np.abs(cents), .95)) if voiced else None,
        "median_signed_cents": float(np.median(cents)) if voiced else None,
        "octave_error_frames": int(octave_errors.sum()),
        "octave_up_frames": int((octave_errors & (octave > 0)).sum()),
        "octave_down_frames": int((octave_errors & (octave < 0)).sum()),
        "target_outside_yin_range_frames": outside,
        "numerical_eligible_provisional": bool(valid and coverage >= .95 and near_fraction >= .95 and not outside),
        "eligibility_reason": "no_confident_stable_source_frames" if not valid else
            "target_outside_estimator_range" if outside else "provisional_pitch_only_criteria",
        "natural_timbre_approved": False}


def evaluate(source_path, candidate_path, semitones):
    paths = [Path(source_path), Path(candidate_path)]
    before = {str(path): sha256(path) for path in paths}
    source, candidate = (read_wave(path) for path in paths)
    if len(source) != len(candidate): raise ValueError("identical_sample_count_required_no_alignment")
    scaled_source, scaled_candidate, level = analysis_level(source, candidate)
    analyzed = [features.extract_features(resample_poly(audio, 2, 3)) for audio in (scaled_source, scaled_candidate)]
    result = pitch_metrics(*analyzed, semitones)
    if any(sha256(path) != before[str(path)] for path in paths):
        raise ValueError("input_changed_during_readonly_evaluation")
    return {"schema": "mini.world-source-copy-independent-yin-pitch.v1", "status": "complete",
        "source_path": str(paths[0]), "candidate_path": str(paths[1]), "input_sha256": before,
        "sample_rate_hz": SR, "samples": len(source), "seconds": len(source) / SR,
        "analysis_level_calibration": level,
        "method": "24k->16k resample_poly(2,3); existing64ms YIN/100Hz independently on both WAVs",
        "source_mask": "sourcevoiced;50msfile+voiced-run guards;±2frames maxF0spread<=50c",
        "alignment": "same timestamps; no offset search, warping or F0 interpolation",
        "criteria": {"candidate_voicing_coverage_min": .95, "near50c_fraction_source_valid_min": .95},
        "yin_range_hz": [features.YIN_MIN_HZ, features.YIN_MAX_HZ],
        "world_conditioning_f0_quality_evaluated": False, "pitch": result,
        "inputs_unchanged": True, "natural_timbre_approved": False,
        "helper_sha256": sha256(HELPER), "script_sha256": sha256(__file__),
        "limits": ["YIN may confuse octaves or reject airy/transitional sound; source is not exact F0 truth.",
            "Mask excludes unstable attacks/connections; their fidelity is not certified.",
            "Voicing/near50 denominators include candidate dropouts, not only shared frames.",
            "Source-only common analysis gain prevents arbitrary saved-source level from triggering YIN's RMS floor; relative level is unchanged.",
            "Pitch-only provisional eligibility never certifies daegeum identity, breath, phase or timbre."]}


def write_private_json(path, report):
    path = Path(path)
    if path.exists() or path.is_symlink(): raise FileExistsError("new_nonexistent_json_required")
    resolved, root = path.resolve(strict=False), PRIVATE_ROOT.resolve(strict=True)
    if (not path.is_absolute() or path.suffix.lower() != ".json" or root not in resolved.parents
            or not path.parent.is_dir()):
        raise ValueError("new_json_inside_existing_private_gpt_directory_required")
    with os.fdopen(os.open(resolved, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--semitones", type=int, choices=(0, 1), required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = evaluate(args.source, args.candidate, args.semitones)
    write_private_json(args.output, report)
    print(json.dumps({"status": report["status"], "source_valid_frames": report["pitch"]["source_valid_stable_frames"],
                      "numerical_eligible_provisional": report["pitch"]["numerical_eligible_provisional"]}))
