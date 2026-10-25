#!/usr/bin/env python3
"""Conservative source-feature gates and fit-only statistics, not musical QA.

No audio/model rendering, F0 editing, or feature repair. Held-out windows stay
visible even when they fail this training-eligibility diagnostic.
"""
import argparse
from collections import Counter
import hashlib
import io
import json
import os
from pathlib import Path
import time

import numpy as np

SCHEMA = "mini.sifigan-corpus.v1"
FRAMES, HOP, RATE, STRIDE = 70, 120, 24000, 35
POLICY = {
    "frames": FRAMES, "stride_frames": STRIDE,
    "yin_support_proxy_min": .90,
    "reference_supported_fraction_min": .80,
    "harvest_reference_match_fraction_min": .95,
    "harvest_reference_abs_cents_max": 50.,
    "harvest_voiced_ap_all_one_fraction_strict_max": .10,
    "window_rms_dbfs_strict_min": -80.,
    "reference_frequency_range_hz": [70., 1800.],
    "pitch_derivative_or_vibrato_depth_gate": False,
}


def digest(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def child(root, name):
    if not isinstance(name, str) or Path(name).name != name or name in ("", ".", ".."):
        raise ValueError("safe_basename_required")
    path = root / name
    if path.is_symlink() or not path.is_file():
        raise ValueError("regular_local_feature_file_required")
    return path


def protected_holdout(row):
    identity = (row["case"] + " " + row["source_path"]).lower()
    return any(token in identity for token in ("arirang", "아리랑", "deepvib", "deep_vib"))


def validate_manifest(path):
    path = Path(path).resolve(strict=True)
    report = json.loads(path.read_text())
    if report.get("schema") != SCHEMA or report.get("status") != "complete":
        raise ValueError("completed_corpus_manifest_required")
    if report.get("sample_rate", RATE) != RATE or report.get("hop_size", HOP) != HOP:
        raise ValueError("24k_120hop_corpus_required")
    rows, cases, splits_by_sha = [], set(), {}
    for item in report["files"]:
        row = dict(item)
        if (not isinstance(row.get("case"), str) or not row["case"] or row["case"] in cases
                or row.get("split") not in ("fit", "heldout")):
            raise ValueError("unique_cases_and_explicit_fit_heldout_splits_required")
        cases.add(row["case"])
        original = Path(row["source_path"])
        if not original.is_absolute() or original.is_symlink() or not original.is_file():
            raise ValueError("absolute_regular_original_required")
        if protected_holdout(row) and row["split"] != "heldout":
            raise ValueError("all_Arirang_and_deepvib_must_be_heldout")
        if digest(original) != row["source_sha256"]:
            raise ValueError("original_source_sha_changed")
        npz = child(path.parent, row["npz_file"])
        if digest(npz) != row["npz_sha256"]:
            raise ValueError("corpus_feature_sha_changed")
        splits_by_sha.setdefault(row["source_sha256"], set()).add(row["split"])
        row.update(npz_path=str(npz), source_path=str(original))
        rows.append(row)
    if not rows:
        raise ValueError("nonempty_corpus_required")
    if any(len(splits) > 1 for splits in splits_by_sha.values()):
        raise ValueError("whole_original_source_split_leakage")
    return path, report, rows


def validate_arrays(arrays):
    if "periodicity" not in arrays and "yin_periodicity" in arrays:
        arrays = {**arrays, "periodicity": arrays["yin_periodicity"]}
    required = ("waveform", "f0", "cf0", "features", "rms_db", "ap_all_one", "yin_hz", "periodicity")
    if any(key not in arrays for key in required):
        raise ValueError("complete_corpus_feature_arrays_required")
    count = len(arrays["f0"])
    if (arrays["waveform"].shape != (count * HOP,) or arrays["features"].shape != (count, 43)
            or any(arrays[key].shape != (count,) for key in required if key not in ("waveform", "features"))):
        raise ValueError("exact_aligned_24k_120hop_43feature_shapes_required")
    if arrays["ap_all_one"].dtype != np.bool_:
        raise ValueError("boolean_ap_all_one_required")
    for key in required:
        if key != "ap_all_one" and not np.issubdtype(arrays[key].dtype, np.floating):
            raise ValueError("floating_acoustic_features_required")
    return arrays


def pitch_bin(hz):
    if hz is None:
        return "unsupported"
    for lower, upper in ((70, 200), (200, 400), (400, 800), (800, 1200), (1200, 1801)):
        if lower <= hz < upper:
            return f"{lower}-{min(upper, 1800)}Hz"
    return "outside_70-1800Hz"


def assess_window(arrays, start):
    stop = start + FRAMES
    if start < 0 or stop > len(arrays["f0"]):
        raise ValueError("complete_70frame_window_required")
    wave = arrays["waveform"][start * HOP:stop * HOP]
    local = {key: value[start:stop] for key, value in arrays.items() if key != "waveform"}
    reasons = []
    finite = np.isfinite(wave).all() and all(np.isfinite(value).all() for value in local.values())
    if not finite:
        reasons.append("nonfinite_values")
    f0, cf0, yin, support = local["f0"], local["cf0"], local["yin_hz"], local["periodicity"]
    reference = (np.isfinite(yin) & np.isfinite(support) & (yin >= 70) & (yin <= 1800)
                 & (support >= POLICY["yin_support_proxy_min"]) & (support <= 1))
    source_count = int(reference.sum())
    source_fraction = source_count / FRAMES
    if source_fraction < POLICY["reference_supported_fraction_min"]:
        reasons.append("insufficient_reference_support")
    if np.any((support < 0) | (support > 1)):
        reasons.append("invalid_periodicity_proxy")
    if np.any((f0 < 0) | (f0 > 1800)) or np.any(cf0 <= 0):
        reasons.append("invalid_generator_pitch_controls")
    agreement = np.zeros(FRAMES, dtype=bool)
    comparable = reference & np.isfinite(f0) & (f0 > 0)
    agreement[comparable] = np.abs(1200 * np.log2(f0[comparable] / yin[comparable])) <= 50.
    match_fraction = float(agreement.sum() / source_count) if source_count else 0.
    if match_fraction < POLICY["harvest_reference_match_fraction_min"]:
        reasons.append("harvest_reference_disagreement")
    voiced = np.isfinite(f0) & (f0 > 0)
    voiced_count = int(voiced.sum())
    ap_fraction = float(local["ap_all_one"][voiced].mean()) if voiced_count else None
    if ap_fraction is None or ap_fraction >= POLICY["harvest_voiced_ap_all_one_fraction_strict_max"]:
        reasons.append("excess_or_undefined_voiced_AP_all_one")
    if np.isfinite(wave).all():
        rms_db = float(20 * np.log10(max(float(np.sqrt(np.mean(wave.astype(np.float64) ** 2))), 1e-12)))
    else:
        rms_db = None
    if rms_db is None or rms_db <= POLICY["window_rms_dbfs_strict_min"]:
        reasons.append("near_silent_window")
    median = float(np.median(yin[reference])) if source_count else None
    return dict(accepted=not reasons, rejection_reasons=reasons,
        reference_supported_frames=source_count, reference_supported_fraction=source_fraction,
        harvest_reference_match_fraction=match_fraction, harvest_voiced_frames=voiced_count,
        voiced_ap_all_one_fraction=ap_fraction, window_rms_dbfs=rms_db,
        median_reference_hz=median, pitch_bin=pitch_bin(median))


def fit_statistics(parts):
    """Population statistics over unique accepted fit frames, not overlap copies."""
    count, mean, m2 = 0, np.zeros(43), np.zeros(43)
    for part in parts:
        values = np.asarray(part, dtype=np.float64)
        if values.ndim != 2 or values.shape[1] != 43 or not np.isfinite(values).all():
            raise ValueError("finite_43feature_fit_frames_required")
        if not len(values):
            continue
        local_mean = values.mean(axis=0)
        local_m2 = ((values - local_mean) ** 2).sum(axis=0)
        total, delta = count + len(values), local_mean - mean
        m2 += local_m2 + delta ** 2 * count * len(values) / total
        mean += delta * len(values) / total
        count = total
    if not count:
        raise ValueError("accepted_training_frames_required_for_statistics")
    scale = np.sqrt(np.maximum(m2 / count, 0))
    scale[scale == 0] = 1.
    return mean, scale, count


def audit(manifest, output):
    manifest, source, files = validate_manifest(manifest)
    output = Path(output).resolve()
    if output.exists():
        raise ValueError("fresh_audit_output_required")
    if output.is_relative_to(manifest.parent):
        raise ValueError("corpus_inputs_are_read_only_use_separate_output")
    output.mkdir(mode=0o700)
    started = time.monotonic()
    source_sha = digest(manifest)
    report = dict(schema="mini.sifigan-window-gate.v1", status="started",
        source_manifest_path=str(manifest), source_manifest_sha256=source_sha,
        audit_code_sha256=digest(__file__), policy=POLICY, files=[], windows=[], rejected_windows=[],
        heldout_windows=[], statistics_fit_cases=[], fit_frame_counts={},
        sample_rate=RATE, hop_size=HOP, frames=FRAMES,
        waveform_or_features_edited=False, generated_audio_written=0, model_runs=0,
        pitch_derivative_or_vibrato_depth_rejection=False,
        statistical_gate_is_not_musical_correctness=True,
        limitations=["YIN1-CMNDF is an estimator support proxy, not calibrated confidence.",
            "No pitch derivative or vibrato depth is gated or flattened.",
            "Mostly voiced criterion underrepresents long breaths, attacks, staccatos and uncertain phrases.",
            "All heldout candidate windows are retained separately, including gate failures.",
            "Recording-disjoint here does not mean blind: these original files were inspected before.",
            "AP-all-one gates feature suitability only; it is not a quality or musical correctness test."],
        source_credit="국악기 음원 제공 — 국립국악원 (공공누리 제1유형)")
    selected_parts, by_case = [], {}
    by_pitch, by_split, exclusions = {}, {}, Counter()
    for row in files:
        if time.monotonic() - started > 300:
            raise RuntimeError("five_minute_audit_soft_time_limit")
        with np.load(row["npz_path"], allow_pickle=False) as archive:
            arrays = validate_arrays({key: archive[key].copy() for key in archive.files})
        count = len(arrays["f0"])
        if "frames" in row and row["frames"] != count:
            raise ValueError("manifest_frame_count_mismatch")
        selected = np.zeros(count, dtype=bool)
        counts = dict(candidate_windows=0, accepted_windows=0, rejected_windows=0,
                      total_frames=count, selected_fit_frames=0, split=row["split"])
        for start in range(0, count - FRAMES + 1, STRIDE):
            facts = assess_window(arrays, start)
            window = dict(case=row["case"], split=row["split"], start_frame=start,
                          frame_count=FRAMES, **facts)
            for bucket, key in ((by_pitch, facts["pitch_bin"]), (by_split, row["split"])):
                values = bucket.setdefault(key, dict(candidate_windows=0, accepted_windows=0, rejected_windows=0))
                values["candidate_windows"] += 1
                values["accepted_windows" if facts["accepted"] else "rejected_windows"] += 1
            counts["candidate_windows"] += 1
            counts["accepted_windows" if facts["accepted"] else "rejected_windows"] += 1
            if row["split"] == "heldout":
                report["heldout_windows"].append(window)
            if facts["accepted"]:
                report["windows"].append(window)
                if row["split"] == "fit":
                    selected[start:start + FRAMES] = True
            else:
                report["rejected_windows"].append(window)
                exclusions.update(facts["rejection_reasons"])
        if selected.any():
            selected_parts.append(arrays["features"][selected].astype(np.float64))
            report["statistics_fit_cases"].append(row["case"])
            report["fit_frame_counts"][row["case"]] = int(selected.sum())
            counts["selected_fit_frames"] = int(selected.sum())
        by_case[row["case"]] = counts
        report["files"].append(dict(row, frame_count=count, **counts))
    if selected_parts:
        mean, scale, count = fit_statistics(selected_parts)
        payload = io.BytesIO()
        np.savez_compressed(payload, mean=mean, scale=scale, fit_frame_count=np.array(count))
        stats_path = output / "stats.npz"
        with stats_path.open("xb") as handle:
            handle.write(payload.getvalue())
        stats_path.chmod(0o600)
        report.update(stats_file=stats_path.name, stats_path=str(stats_path), stats_sha256=digest(stats_path),
                      statistics_fit_frame_count=count, training_eligible=True,
                      statistics="fit-only union of accepted frame indices per recording; population std; zero std->1")
    else:
        report.update(stats_file=None, stats_path=None, stats_sha256=None,
                      statistics_fit_frame_count=0, training_eligible=False,
                      statistics="No eligible fit frames: no normalizer fabricated.")
    for row in files:
        if digest(row["npz_path"]) != row["npz_sha256"] or digest(row["source_path"]) != row["source_sha256"]:
            raise RuntimeError("corpus_or_original_changed_during_audit")
    if digest(manifest) != source_sha:
        raise RuntimeError("corpus_manifest_changed_during_audit")
    report.update(status="complete", counts_by_case=by_case, counts_by_pitch_bin=by_pitch,
                  counts_by_split=by_split, rejection_reason_counts=dict(exclusions),
                  total_accepted_windows=len(report["windows"]),
                  total_rejected_windows=len(report["rejected_windows"]),
                  heldout_used_for_statistics=False, original_and_feature_hashes_unchanged=True,
                  elapsed_seconds=time.monotonic() - started)
    payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
    if len(payload) > 50_000_000:
        raise ValueError("50MB_audit_manifest_limit")
    destination = output / "window_gate.json"
    with destination.open("xb") as handle:
        handle.write(payload)
    destination.chmod(0o600)
    return report


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.manifest, args.output)
    print(json.dumps({key: result[key] for key in ("status", "training_eligible", "total_accepted_windows", "total_rejected_windows")}))
