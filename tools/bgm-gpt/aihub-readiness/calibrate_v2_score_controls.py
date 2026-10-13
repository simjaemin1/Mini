#!/usr/bin/env python3
"""Private fit-only, pitch-conditioned score loudness calibration for dry V2.

This is an empirical association between stable acoustic RMS and the exact
IRCAM weighted-log feature, not a learned breath model or a causal loudness
law. Twelve fit songs only are opened. Low authored attack levels outside the
observed range use declared output attenuation, never feature extrapolation.
No model inference, waveform output, or network transfer is performed here.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import math
import os
from pathlib import Path
import time

import numpy as np

import bound_v2_dry_diagnostic as diagnostic
import diagnose_ircam_score_loudness as association
import mac_mps_ddsp_features as features
import mac_mps_ddsp_long_trial as v1
import mac_mps_ddsp_pilot as pilot
import mac_mps_ddsp_v2_dry_trial as v2
import score_ircam_conditioning_adapter as adapter


SCHEMA = "mini.aihub-71470-v2-fit-only-score-calibration.v1"
REPORT_NAME = "v2_score_calibration.json"
PRIVATE_ROOT = Path.home() / "Mini" / "_bgm" / "gpt"
MAX_MINUTES = 45
MAX_BYTES = 1_048_576
PITCH_TOLERANCE_CENTS = 50.0
MIN_FRAMES = 30
MIN_SONGS = 3
MAX_FIT_CORRECTION_STD = 0.5
MAX_MEDIAN_RESIDUAL_STD = 0.75
AUTHORED_STEADY_DB = -29.0
SHIFT_CANDIDATES = (0, 2)


class CalibrationError(Exception):
    """A fixed non-private reason; source identities must not be printed."""


def code_sha256() -> str:
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def approved_private_path(path: Path, *, directory: bool = False) -> Path:
    actual = path.resolve(strict=True)
    root = PRIVATE_ROOT.resolve(strict=True)
    if actual == root or root not in actual.parents:
        raise CalibrationError("approved_local_rnd_path_required")
    if directory:
        pilot._private_dir(path)
    else:
        pilot._private_dir(path.parent)
    return actual


def public_score() -> tuple[dict, dict, str]:
    compiled, candidate, score_sha = association._score_candidate()
    if {float(event["steady_loudness_db"]) for event in compiled["events"]
            if event["articulation"] != "release"} != {AUTHORED_STEADY_DB}:
        raise CalibrationError("fixed_score_steady_level_changed")
    return compiled, candidate, score_sha


def nominal_pitches(compiled: dict, shift: int) -> list[tuple[int, float]]:
    if shift not in SHIFT_CANDIDATES:
        raise CalibrationError("unsupported_score_shift")
    notes = {}
    for event in compiled["events"]:
        if event["articulation"] != "release":
            hz = float(event["pitch_hz"]) * 2 ** (shift / 12.0)
            midi = round(69 + 12 * math.log2(hz / 440.0))
            notes[midi] = hz
    return sorted(notes.items())


def pitch_conditioned_support(pairs: dict, target_hz: float,
                              normalizer_std: float, anchor_rms: float) -> dict:
    """Use source-supported, near-nominal stable F0 frames from >=3 songs."""
    pitch = np.asarray(pairs["pitch_hz"], dtype=np.float64)
    rms = np.asarray(pairs["rms_dbfs"], dtype=np.float64)
    weighted = np.asarray(pairs["weighted_log"], dtype=np.float64)
    songs = np.asarray(pairs["song_index"], dtype=np.int32)
    if (pitch.ndim != 1 or any(array.shape != pitch.shape for array in (rms, weighted, songs))
            or not np.all(np.isfinite(pitch)) or np.any(pitch <= 0)
            or not np.all(np.isfinite(rms)) or not np.all(np.isfinite(weighted))
            or normalizer_std <= 1e-5 or not math.isfinite(anchor_rms)):
        raise CalibrationError("stable_pair_contract_invalid")
    near = np.abs(1200 * np.log2(pitch / target_hz)) <= PITCH_TOLERANCE_CENTS
    selected = {"rms_dbfs": rms[near], "weighted_log": weighted[near],
                "pitch_hz": pitch[near], "song_index": songs[near]}
    result = {"target_pitch_hz": round(target_hz, 6), "frames": int(near.sum()),
              "songs": len(set(songs[near].tolist())), "usable": False}
    if result["frames"] < MIN_FRAMES or result["songs"] < MIN_SONGS:
        return {**result, "reason": "nominal_pitch_support_insufficient"}
    # Same-pitch group only. The association helper normally chooses its own
    # median anchor; build its supported bins and reselect the contiguous run
    # at one score-wide anchor so pitched notes share the intended steady RMS.
    raw = association._support_bins(selected, normalizer_std=normalizer_std)
    bins = {row["index"]: dict(row) for row in raw["supported_bins"]}
    index = math.floor(anchor_rms / association.RMS_BIN_DB)
    if index not in bins:
        return {**result, "reason": "score_anchor_bin_unsupported", "supported_bins": list(bins.values())}
    left = right = index
    while left - 1 in bins:
        left -= 1
    while right + 1 in bins:
        right += 1
    run = [bins[row] for row in range(left, right + 1)]
    if len(run) < 2:
        return {**result, "reason": "pitch_rms_range_insufficient", "supported_bins": list(bins.values())}
    raw_values = [row["weighted_log_median_of_song_medians"] for row in run]
    fitted = association._pava(raw_values, [row["training_songs"] for row in run])
    for row, value in zip(run, fitted):
        row["monotone_candidate_weighted_log"] = float(value)
    x = np.asarray([row["center_rms_dbfs"] for row in run])
    y = np.asarray(fitted)
    if not x[0] <= anchor_rms <= x[-1]:
        return {**result, "reason": "score_anchor_outside_bin_centers"}
    covered = (rms[near] >= x[0]) & (rms[near] <= x[-1])
    residuals = np.abs(weighted[near][covered] - np.interp(rms[near][covered], x, y))
    song_residuals = [float(np.median(residuals[songs[near][covered] == song]))
                      for song in np.unique(songs[near][covered])]
    correction = max(abs(a - b) for a, b in zip(raw_values, fitted)) / normalizer_std
    residual = float(np.median(song_residuals)) / normalizer_std
    usable = (correction <= MAX_FIT_CORRECTION_STD and residual <= MAX_MEDIAN_RESIDUAL_STD)
    return {**result, "usable": usable, "reason": "supported_empirical_association" if usable else "same_pitch_rms_feature_association_failed",
            "rms_center_range_dbfs": [float(x[0]), float(x[-1])], "usable_run": run,
            "max_isotonic_adjustment_std": correction, "song_macro_median_residual_std": residual,
            "not_a_causal_same_pitch_loudness_transform": True}


def build_calibration(pairs: dict, compiled: dict, normalizer: tuple[float, float]) -> dict:
    song_ids = np.unique(pairs["song_index"])
    if len(song_ids) != v2.FIT_SONGS:
        raise CalibrationError("twelve_fit_song_pairs_required")
    anchor = float(np.median([np.median(np.asarray(pairs["rms_dbfs"])[np.asarray(pairs["song_index"]) == song])
                              for song in song_ids]))
    variants = []
    for shift in SHIFT_CANDIDATES:
        groups = []
        for midi, hz in nominal_pitches(compiled, shift):
            group = pitch_conditioned_support(pairs, hz, normalizer[1], anchor)
            group["pitch_midi"] = midi
            groups.append(group)
        variants.append({"pitch_shift_semitones": shift,
                         "all_nominal_pitches_and_steady_level_supported": all(row["usable"] for row in groups),
                         "groups": groups})
    eligible = [item["pitch_shift_semitones"] for item in variants
                if item["all_nominal_pitches_and_steady_level_supported"]]
    return {"anchor_rms_dbfs": anchor, "authored_steady_db": AUTHORED_STEADY_DB,
            "anchor_interpretation": "median of 12 fit-song stable RMS medians; authorial -29dB intent assigned to this coordinate",
            "variants": variants, "selected_shift_for_private_trial": min(eligible) if eligible else None,
            "selection_rule": "use 0 if fully supported, otherwise +2 if fully supported; never change public score",
            "low_attack_policy": "condition at observed minimum then apply declared output attenuation; no feature extrapolation",
            "association_is_not_learned_articulation": True}


def map_intent(support: dict, target_rms: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return observed-range feature and explicit low-tail sample gain."""
    if support.get("usable") is not True:
        raise CalibrationError("pitch_mapping_unsupported")
    run = support["usable_run"]
    x = np.asarray([row["center_rms_dbfs"] for row in run], dtype=np.float64)
    y = np.asarray([row["monotone_candidate_weighted_log"] for row in run], dtype=np.float64)
    values = np.asarray(target_rms, dtype=np.float64)
    if (values.ndim != 1 or not np.all(np.isfinite(values)) or len(x) < 2
            or np.any(np.diff(x) <= 0) or np.any(np.diff(y) < 0)):
        raise CalibrationError("mapping_table_invalid")
    if np.any(values > x[-1] + 1e-5):
        raise CalibrationError("score_level_above_pitch_supported_range")
    bounded = np.maximum(values, x[0])
    mapped = np.interp(bounded, x, y)
    gain = 10 ** (np.minimum(values - x[0], 0) / 20)
    return mapped.astype(np.float32), gain.astype(np.float32)


def _inputs(source_manifest: Path, split_manifest: Path, checkpoint_dir: Path,
            upstream_root: Path, output_dir: Path,
            parent_checkpoint_dir: Path | None = None) -> tuple[list[dict], Path, dict, dict, tuple[float, float]]:
    for path in (source_manifest, split_manifest):
        approved_private_path(path)
    for path in (checkpoint_dir, upstream_root, output_dir):
        approved_private_path(path, directory=True)
    pilot._check_disjoint_report_dir(output_dir, [source_manifest.parent, split_manifest.parent,
                                               checkpoint_dir, upstream_root])
    if os.listdir(output_dir):
        raise CalibrationError("fresh_private_output_required")
    v2._free_space_gate(output_dir, starting=False)
    pilot._verify_upstream(upstream_root)
    v1._verify_feature_version()
    source, source_sha = pilot._read_json(source_manifest)
    split, split_sha = pilot._read_json(split_manifest)
    records, _ = v1.validate_documents(source, source_sha, split)
    train_dir = approved_private_path(split_manifest.parent / "train", directory=True)
    if set(os.listdir(train_dir)) != {row["output_file"] for row in records}:
        raise CalibrationError("train_directory_inventory_changed")
    snapshot = diagnostic.checkpoint_snapshot(checkpoint_dir)
    import torch
    checkpoint = torch.load(snapshot["_path"], map_location="cpu", weights_only=True)
    lineage = {}
    if snapshot.get("_kind") == "continuation":
        if parent_checkpoint_dir is None:
            raise CalibrationError("continuation_parent_checkpoint_required")
        approved_private_path(parent_checkpoint_dir, directory=True)
        parent_snapshot = diagnostic.checkpoint_snapshot(parent_checkpoint_dir)
        parent_checkpoint = torch.load(parent_snapshot["_path"], map_location="cpu", weights_only=True)
        lineage = {"parent_snapshot": parent_snapshot, "parent_checkpoint": parent_checkpoint}
    normalizer = diagnostic.verify_contract(checkpoint, snapshot, source_sha=source_sha,
                                            split_sha=split_sha, train_records=records, **lineage)
    fit, validation = v2.partition_training_songs(records)
    binding = {"checkpoint_sha256": snapshot["checkpoint_sha256"], "checkpoint_step": snapshot["step"],
               "checkpoint_total_step": snapshot.get("total_step", snapshot["step"]),
               "checkpoint_kind": snapshot.get("_kind", "v2"),
               "checkpoint_marker_sha256": snapshot["checkpoint_marker_sha256"],
               "training_report_sha256": snapshot["training_report_sha256"],
               "source_manifest_sha256": source_sha, "split_manifest_sha256": split_sha,
               "internal_partition_sha256": v2._song_partition_sha(fit, validation),
               "normalizer_fit_only": list(normalizer), "upstream_commit": pilot.UPSTREAM_SHA,
               "trainer_sha256": v2._code_sha256(), "feature_sha256": v1.FEATURE_SHA256,
               "architecture": v2.ARCHITECTURE, "model_config": v2.MODEL_CONFIG,
               "parent_checkpoint_sha256": (lineage["parent_snapshot"]["checkpoint_sha256"] if lineage else None),
               "parent_checkpoint_marker_sha256": (lineage["parent_snapshot"]["checkpoint_marker_sha256"] if lineage else None),
               "parent_training_report_sha256": (lineage["parent_snapshot"]["training_report_sha256"] if lineage else None),
               "parent_step": (lineage["parent_snapshot"]["step"] if lineage else None)}
    return [row for row in records if row["song_index"] in fit], train_dir, checkpoint, binding, normalizer


def calibrate(*, source_manifest: Path, split_manifest: Path, checkpoint_dir: Path,
              upstream_root: Path, output_dir: Path, minutes: int = 30,
              parent_checkpoint_dir: Path | None = None) -> dict:
    if type(minutes) is not int or not 1 <= minutes <= MAX_MINUTES:
        raise CalibrationError("calibration_time_limit")
    deadline = time.monotonic() + minutes * 60
    with pilot._network_disabled(), v1._exclusive_private_lock(checkpoint_dir):
        records, train_dir, checkpoint, binding, normalizer = _inputs(
            source_manifest, split_manifest, checkpoint_dir, upstream_root, output_dir,
            parent_checkpoint_dir)
        compiled, candidate, score_sha = public_score()
        windows, counts = v2._windows_for_records(train_dir, records, validation=False, deadline=deadline)
        recomputed = features.normalize_loudness([window["loudness"] for window in windows])
        if (counts["windows"] != checkpoint.get("fit_windows")
                or not np.allclose(recomputed, normalizer, atol=1e-10, rtol=0)):
            raise CalibrationError("exact_fit_windows_or_normalizer_changed")
        selection_sha = importlib.import_module("mac_mps_ddsp_v2_continuation")._windows_sha256(windows)
        if binding["checkpoint_kind"] == "continuation" and checkpoint.get("fit_window_selection_sha256") != selection_sha:
            raise CalibrationError("exact_child_fit_window_selection_changed")
        binding["fit_window_selection_sha256"] = selection_sha
        parts = [association._stable_pairs(window, window["song_index"]) for window in windows]
        parts = [item for item in parts if len(item[0])]
        if not parts:
            raise CalibrationError("no_stable_fit_pairs")
        names = ("rms_dbfs", "weighted_log", "pitch_hz", "song_index")
        pairs = {name: np.concatenate([item[index] for item in parts]) for index, name in enumerate(names)}
        result = build_calibration(pairs, compiled, normalizer)
        if time.monotonic() >= deadline:
            raise CalibrationError("calibration_time_cap")
        after = diagnostic.checkpoint_snapshot(checkpoint_dir)
        if after["checkpoint_sha256"] != binding["checkpoint_sha256"] or after["training_report_sha256"] != binding["training_report_sha256"]:
            raise CalibrationError("checkpoint_changed_during_calibration")
        if binding["checkpoint_kind"] == "continuation":
            parent_after = diagnostic.checkpoint_snapshot(parent_checkpoint_dir)
            if any(parent_after[value] != binding[key] for key, value in (
                    ("parent_checkpoint_sha256", "checkpoint_sha256"),
                    ("parent_checkpoint_marker_sha256", "checkpoint_marker_sha256"),
                    ("parent_training_report_sha256", "training_report_sha256"), ("parent_step", "step"))):
                raise CalibrationError("parent_changed_during_calibration")
        _, source_after = pilot._read_json(source_manifest)
        _, split_after = pilot._read_json(split_manifest)
        if source_after != binding["source_manifest_sha256"] or split_after != binding["split_manifest_sha256"]:
            raise CalibrationError("manifests_changed_during_calibration")
        report = {"schema": SCHEMA, "status": "fit_only_calibration_complete", "binding": binding,
                  "score_plan_sha256": score_sha, "calibration_script_sha256": code_sha256(),
                  "score_adapter_sha256": hashlib.sha256(Path(adapter.__file__).read_bytes()).hexdigest(),
                  "compiler_sha256": hashlib.sha256(association.COMPILER_PATH.read_bytes()).hexdigest(),
                  "data_scope": {"fit_song_groups": 12, "fit_records": len(records), "fit_windows": len(windows),
                                 "stable_frame_observations": len(pairs["rms_dbfs"]),
                                 "internal_validation_audio_opened": 0, "external_heldout_audio_opened": 0,
                                 "overlapping_training_window_observations_not_independent": True,
                                 "source_f0_gate": "YIN threshold <0.17 and RMS >-60dBFS; +/-50ms neighborhood valid with pitch span<=120 cents and RMS span<=6dB"},
                  "gate_parameters": {"pitch_tolerance_cents": PITCH_TOLERANCE_CENTS, "minimum_frames": MIN_FRAMES,
                                      "minimum_songs": MIN_SONGS, "max_fit_correction_std": MAX_FIT_CORRECTION_STD,
                                      "max_median_residual_std": MAX_MEDIAN_RESIDUAL_STD},
                  "calibration": result, "source_rights": "AI_Hub_71470_private_R_and_D_only_no_export_or_game_output",
                  "limitations": ["Stable RMS-feature association is not causal and does not prove model output level.",
                                  "Low attack output attenuation is an authored envelope, not learned breath or tongue articulation.",
                                  "Twelve-fit-song nominal F0 coverage is not proof of transposed melody timbre.",
                                  "No inference, source relocation, network transfer, or public release."]}
        v2._free_space_gate(output_dir, starting=False)
        payload = json.dumps(report, sort_keys=True, indent=2, allow_nan=False).encode() + b"\n"
        if len(payload) > MAX_BYTES:
            raise CalibrationError("calibration_report_size_limit")
        v1._atomic_private_bytes(output_dir, REPORT_NAME, payload, replace=False)
        return {"status": report["status"], "fit_song_groups": 12, "fit_windows": len(windows),
                "selected_shift_for_private_trial": result["selected_shift_for_private_trial"], "audio_rendered": False}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source-manifest", "split-manifest", "checkpoint-dir", "upstream-root", "output-dir"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--minutes", type=int, default=30)
    parser.add_argument("--parent-checkpoint-dir", type=Path)
    args = parser.parse_args()
    try:
        result = calibrate(**vars(args))
    except (CalibrationError, diagnostic.DiagnosticError, v1.TrialError, v2.V2Error, pilot.PilotError) as exc:
        result = {"status": "blocked", "reason": str(exc)}
    except Exception:
        result = {"status": "blocked", "reason": "unexpected_private_calibration_error"}
    print(json.dumps(result, sort_keys=True))
    return 2 if result["status"] == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
