#!/usr/bin/env python3
"""Source-only level/quiet/transition training policy; no output processing.

Quiet and aperiodic are measured states, not verified breath/articulation labels.
The original checkpoint normalizer and every waveform/control remain unchanged.
"""
import argparse
from collections import Counter, defaultdict
import json
import os
from pathlib import Path
import sys
import time

import numpy as np
import audit_corpus as original

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "foundation-model-trial"))
from ace_limits import GIB, ResourceCaps, ResourceGuard

FRAMES, HOP, RATE, STRIDE = 70, 120, 24000, 35
FIT_CASES = {"sus04", "vib39", "sanjo2", "daru1", "nina29", "nira23", "staccato60", "chung34"}
HELDOUT_CASES = {"deepvib48", "arirang001", "arirang002", "arirang003", "arirang004"}
POLICY = dict(frames=FRAMES, stride_frames=STRIDE, quiet_window_rms_max_dbfs=-60.,
    quiet_frame_rms_max_dbfs=-60., quiet_fraction_min=.8, quiet_harvest_zero_fraction_min=.8,
    independent_yin_periodicity_min=.9, independent_yin_range_hz=[70., 1800.],
    harvest_supported_agreement_min=.95, harvest_supported_abs_cents_max=50.,
    supported_voiced_ap_all_one_fraction_strict_max=.1,
    voiced_rms_strata_boundaries_dbfs=[-40., -30.], minimum_support_fraction_for_new_windows=0.,
    undefined_AP_without_supported_voicing_is_not_rejection=True,
    original_accepted_voiced_windows_preserved=True, pitch_derivative_gate=False)


def rms_db(wave):
    return float(20 * np.log10(max(float(np.sqrt(np.mean(np.asarray(wave, np.float64) ** 2))), 1e-12)))


def level_stratum(db):
    return "lt_minus40" if db < -40 else "minus40_to_minus30" if db < -30 else "ge_minus30"


def assess(arrays, start, was_accepted=False):
    stop = start + FRAMES
    if start < 0 or stop > len(arrays["f0"]):
        raise ValueError("complete70frame_window_required")
    wave = arrays["waveform"][start * HOP:stop * HOP]
    local = {key: value[start:stop] for key, value in arrays.items() if key != "waveform"}
    reasons = []
    if not np.isfinite(wave).all() or any(not np.isfinite(value).all() for value in local.values()):
        return dict(accepted=False, category="invalid", rejection_reasons=["nonfinite_values"],
                    original_accepted=was_accepted, pitch_bin="unsupported", rms_stratum="undefined")
    f0, cf0, yin, support = (local[name] for name in ("f0", "cf0", "yin_hz", "periodicity"))
    if (f0 < 0).any() or (f0 > 1800).any() or (cf0 < 0).any():
        reasons.append("invalid_pitch_controls")
    if (support < 0).any() or (support > 1).any():
        reasons.append("invalid_periodicity_proxy")
    reference = (yin >= 70) & (yin <= 1800) & (support >= .9) & (support <= 1)
    count = int(reference.sum())
    comparable = reference & (f0 > 0)
    agreement = np.zeros(FRAMES, bool)
    agreement[comparable] = np.abs(1200 * np.log2(f0[comparable] / yin[comparable])) <= 50
    fraction = float(agreement.sum() / count) if count else None
    ap_fraction = float(local["ap_all_one"][comparable].mean()) if comparable.any() else None
    if not was_accepted and count and fraction < .95:
        reasons.append("supported_harvest_reference_disagreement")
    if not was_accepted and ap_fraction is not None and ap_fraction >= .1:
        reasons.append("excess_supported_voiced_AP_all_one")
    db = rms_db(wave)
    frame_db = 20 * np.log10(np.maximum(np.sqrt(np.mean(wave.astype(np.float64).reshape(FRAMES, HOP) ** 2, axis=1)), 1e-12))
    quiet_fraction, zero_fraction = float(np.mean(frame_db <= -60)), float(np.mean(f0 == 0))
    if was_accepted:
        category = "voiced"
    elif db <= -60 and quiet_fraction >= .8 and zero_fraction >= .8:
        category = "quiet"
    elif count and (count < FRAMES or quiet_fraction > 0 or zero_fraction > 0):
        category = "transition"
    else:
        category = "aperiodic_low_support"
    # Old accepted windows are preserved, not relabeled based on model outputs.
    median = float(np.median(yin[reference])) if count else None
    return dict(accepted=not reasons, category=category, original_accepted=was_accepted,
        rejection_reasons=reasons, window_rms_dbfs=db, quiet_frame_fraction=quiet_fraction,
        harvest_zero_fraction=zero_fraction, reference_supported_frames=count,
        reference_supported_fraction=count / FRAMES, supported_harvest_agreement_fraction=fraction,
        supported_voiced_ap_all_one_fraction=ap_fraction, median_reference_hz=median,
        pitch_bin=original.pitch_bin(median), rms_stratum=level_stratum(db))


def validate_inputs(gate_path):
    gate_path = Path(gate_path).resolve(strict=True)
    gate = json.loads(gate_path.read_text())
    if gate.get("schema") != "mini.sifigan-window-gate.v1" or gate.get("status") != "complete":
        raise ValueError("completed_original_gate_required")
    if gate.get("policy") != original.POLICY or gate.get("audit_code_sha256") != original.digest(original.__file__):
        raise ValueError("unchanged_original_gate_policy_and_code_required")
    manifest, corpus, files = original.validate_manifest(gate["source_manifest_path"])
    if original.digest(manifest) != gate["source_manifest_sha256"]:
        raise ValueError("original_gate_corpus_binding_changed")
    actual_fit = {row["case"] for row in files if row["split"] == "fit"}
    actual_held = {row["case"] for row in files if row["split"] == "heldout"}
    if actual_fit != FIT_CASES or actual_held != HELDOUT_CASES:
        raise ValueError("exact8fit5protected_heldout_sources_required")
    bound = {row["case"]: row for row in gate["files"]}
    if len(bound) != len(files):
        raise ValueError("exact_gate_corpus_cases_required")
    bindings = {str(gate_path): original.digest(gate_path), str(manifest): original.digest(manifest)}
    for row in files:
        prior = bound.get(row["case"], {})
        if any(prior.get(key) != row[key] for key in ("source_path", "source_sha256", "npz_sha256", "npz_path", "split")):
            raise ValueError("original_gate_file_binding_changed")
        bindings[row["source_path"]] = row["source_sha256"]
        bindings[row["npz_path"]] = row["npz_sha256"]
    stats = original.child(gate_path.parent, gate["stats_file"])
    if original.digest(stats) != gate["stats_sha256"]:
        raise ValueError("original_checkpoint_normalizer_changed")
    with np.load(stats, allow_pickle=False) as archive:
        if (archive["mean"].shape != (43,) or archive["scale"].shape != (43,)
                or not np.isfinite(archive["mean"]).all() or not np.isfinite(archive["scale"]).all()
                or (archive["scale"] <= 0).any()):
            raise ValueError("original43channel_positive_normalizer_required")
    bindings[str(stats)] = gate["stats_sha256"]
    for path in (Path(__file__).resolve(), Path(original.__file__).resolve(), HERE.parent / "foundation-model-trial/ace_limits.py"):
        bindings[str(path)] = original.digest(path)
    return gate_path, gate, manifest, files, stats, bindings


def prepare(gate_path, output):
    output = Path(output).resolve()
    if output.exists():
        raise ValueError("fresh_private_policy_output_required")
    output.mkdir(mode=0o700)
    started = time.monotonic()
    with ResourceGuard(output, ResourceCaps(max_seconds=300, max_rss_bytes=2 * GIB)) as guard:
        gate_path, gate, manifest, files, stats, bindings = validate_inputs(gate_path)
        if output.is_relative_to(manifest.parent):
            raise ValueError("corpus_inputs_are_read_only")
        prior = {(row["case"], row["start_frame"]): row for row in gate["windows"] if row["accepted"]}
        if len(prior) != len(gate["windows"]):
            raise ValueError("unique_original_accepted_windows_required")
        report = dict(schema="mini.sifigan-level-windows.v1", status="started", policy=POLICY,
            original_gate_path=str(gate_path), original_gate_sha256=bindings[str(gate_path)],
            source_manifest_path=str(manifest), source_manifest_sha256=bindings[str(manifest)],
            files=files, fit_windows=[], rejected_fit_windows=[], heldout_windows=[], fit_groups=[],
            stats_path=str(stats), stats_sha256=bindings[str(stats)], normalization_changed=False,
            input_bindings=bindings, heldout_is_blind=False, heldout_used_for_training_policy_choices=False,
            waveform_or_features_edited=False, output_mute_EQ_or_gain_applied=False,
            generated_audio_written=0, model_runs=0, sample_rate=RATE, hop_size=HOP,
            source_credit="국악기 음원 제공 — 국립국악원 (공공누리 제1유형)",
            limitations=["quiet/transition/aperiodic_low_support are source states, not verified breath labels",
                "YIN1-CMNDF is not calibrated confidence; no pitch derivative or vibrato flattening",
                "All heldout candidate windows retained; no heldout statistics or optimizer use",
                "Source-only eligibility; no model output or source feature correction used"])
        groups = defaultdict(list)
        unique_fit_frames, counts_by_case = {}, {}
        encountered_prior = set()
        for row in files:
            with np.load(row["npz_path"], allow_pickle=False) as archive:
                arrays = original.validate_arrays({key: archive[key].copy() for key in archive.files})
            if len(arrays["f0"]) != row["frames"]:
                raise ValueError("source_frame_count_changed")
            selected, counts = np.zeros(row["frames"], bool), Counter()
            for start in range(0, row["frames"] - FRAMES + 1, STRIDE):
                key = (row["case"], start)
                old = prior.get(key)
                facts = assess(arrays, start, old is not None)
                if old is not None:
                    encountered_prior.add(key)
                    if not facts["accepted"]:
                        raise ValueError("previously_accepted_voiced_window_would_be_lost")
                window = dict(case=row["case"], split=row["split"], start_frame=start, frame_count=FRAMES, **facts)
                if row["split"] == "heldout":
                    report["heldout_windows"].append(window)
                elif facts["accepted"]:
                    index = len(report["fit_windows"])
                    report["fit_windows"].append(window)
                    group_key = (row["case"], facts["category"], facts["pitch_bin"], facts["rms_stratum"])
                    groups[group_key].append(index)
                    selected[start:start + FRAMES] = True
                else:
                    report["rejected_fit_windows"].append(window)
                counts[("accepted:" if facts["accepted"] else "rejected:") + facts["category"]] += 1
            if row["split"] == "fit":
                unique_fit_frames[row["case"]] = int(selected.sum())
            counts_by_case[row["case"]] = dict(counts)
        if encountered_prior != set(prior):
            raise ValueError("original_accepted_window_not_represented")
        report["fit_groups"] = [dict(case=key[0], category=key[1], pitch_bin=key[2], rms_stratum=key[3],
            window_indices=indices, window_count=len(indices)) for key, indices in sorted(groups.items())]
        fit_keys = {(row["case"], row["start_frame"]) for row in report["fit_windows"]}
        if len(fit_keys) != len(report["fit_windows"]):
            raise ValueError("duplicate_fit_windows")
        if any(original.digest(path) != checksum for path, checksum in bindings.items()):
            raise RuntimeError("original_source_gate_code_or_arrays_changed")
        report.update(status="complete", counts_by_case=counts_by_case,
            fit_category_counts=dict(Counter(row["category"] for row in report["fit_windows"])),
            voiced_level_counts=dict(Counter(row["rms_stratum"] for row in report["fit_windows"] if row["category"] == "voiced")),
            total_unique_fit_windows=len(fit_keys), fit_unique_frame_counts=unique_fit_frames,
            original_accepted_fit_windows_preserved=sum(row["original_accepted"] for row in report["fit_windows"]),
            total_heldout_evaluation_windows=len(report["heldout_windows"]), total_fit_groups=len(groups),
            originals_and_arrays_unchanged=True, elapsed_seconds=time.monotonic() - started, resources=guard.snapshot())
        payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
        if len(payload) > 100_000_000:
            raise ValueError("100MB_policy_output_cap")
        with os.fdopen(os.open(output / "level_windows.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as handle:
            handle.write(payload)
    return report


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gate", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = prepare(args.gate, args.output)
    print(json.dumps({key: result[key] for key in ("status", "fit_category_counts", "voiced_level_counts", "total_unique_fit_windows", "total_heldout_evaluation_windows")}))
