#!/usr/bin/env python3
"""Private, train-only feasibility check for score -> IRCAM loudness.

This does NOT create model controls or render audio.  The score's authored dB
is an intention, not the checkpoint's weighted-log spectral feature.  Only
the checkpoint's selected training windows are sampled, with no held-out WAV
opened.  The output is a private aggregate, never a calibration approval.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import stat
import sys
import time
import wave

import numpy as np

import mac_mps_ddsp_long_trial as trial
import mac_mps_ddsp_pilot as pilot
from mac_mps_ddsp_features import extract_features
import score_ircam_conditioning_adapter as score_adapter


SCHEMA = "mini.aihub-71470-ircam-score-loudness-feasibility.v1"
SCORE_PLAN = Path(__file__).resolve().parents[1] / "new-arirang-score" / "new_ari_8bar_expression_b0_r1.json"
COMPILER_PATH = Path(__file__).resolve().parents[2] / "score-expression" / "compile_expression.py"
REPORT_NAME = "train_only_score_loudness_feasibility.json"
MIN_CLIPS = 15
DEFAULT_CLIPS = 60
MAX_CLIPS = trial.TRAIN_RECORDS
MAX_MINUTES = 60
RMS_BIN_DB = 2.0
MIN_BIN_FRAMES = 30
MIN_BIN_SONGS = 3
PITCH_TOLERANCE_CENTS = 50.0


class DiagnosticError(Exception):
    """A fixed, non-private failure code; never attach paths or names."""


def _score_candidate() -> tuple[dict, dict, str]:
    """Compile only the public, fixed B0 plan; no waveform or model access."""
    spec = importlib.util.spec_from_file_location("mini_score_expression", COMPILER_PATH)
    if spec is None or spec.loader is None:
        raise DiagnosticError("score_compiler_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    compiled = module.compile_plan(SCORE_PLAN)
    candidate = score_adapter.adapt_compiled_controls(compiled)
    if candidate["manifest"].get("inference_ready") is not False:
        raise DiagnosticError("score_gate_unexpectedly_open")
    score_sha = hashlib.sha256(SCORE_PLAN.read_bytes()).hexdigest()
    return compiled, candidate, score_sha


def _check_bindings(
    source_manifest: Path, split_manifest: Path, checkpoint_dir: Path,
    upstream_root: Path, output_dir: Path,
) -> tuple[list[dict], Path, dict]:
    """Read manifests and checkpoint, but never open a held-out WAV."""
    pilot._private_dir(output_dir)
    pilot._private_dir(checkpoint_dir)
    pilot._private_dir(upstream_root)
    pilot._check_disjoint_report_dir(output_dir, [
        source_manifest.parent, split_manifest.parent,
        split_manifest.parent / "train", split_manifest.parent / "heldout",
        checkpoint_dir, upstream_root,
    ])
    if os.listdir(output_dir):
        raise DiagnosticError("output_directory_must_be_empty")
    trial._verify_feature_version()
    pilot._verify_upstream(upstream_root)
    source, source_sha = pilot._read_json(source_manifest)
    split, split_sha = pilot._read_json(split_manifest)
    train_records, _ = trial.validate_documents(source, source_sha, split)
    train_dir = pilot._private_dir(split_manifest.parent / "train")
    if set(os.listdir(train_dir)) != {record["output_file"] for record in train_records}:
        raise DiagnosticError("training_directory_inventory_changed")
    marker = trial._checkpoint_marker(checkpoint_dir)
    if marker is None:
        raise DiagnosticError("checkpoint_missing")
    checkpoint_marker, checkpoint_path = marker
    try:
        import torch
        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    except Exception as exc:
        raise DiagnosticError("checkpoint_load_failed") from exc
    if not isinstance(checkpoint, dict):
        raise DiagnosticError("checkpoint_invalid")
    report, report_sha = pilot._read_json(checkpoint_dir / trial.REPORT_NAME)
    expected = {
        "schema": trial.SCHEMA,
        "source_manifest_sha256": source_sha,
        "split_manifest_sha256": split_sha,
        "feature_sha256": trial.FEATURE_SHA256,
        "script_sha256": trial._script_sha256(),
        "upstream_commit": pilot.UPSTREAM_SHA,
        "conditioning": trial.CONDITIONING,
        "model_config": trial.MODEL_CONFIG,
        "clips_requested": trial.TRAIN_RECORDS,
    }
    if any(checkpoint.get(key) != value for key, value in expected.items()):
        raise DiagnosticError("checkpoint_contract_mismatch")
    if (checkpoint.get("step") != trial.MAX_STEPS
            or checkpoint.get("step") != checkpoint_marker.get("step")
            or checkpoint.get("step") != report.get("steps_completed")
            or report.get("schema") != trial.SCHEMA
            or report.get("status") != "bounded_trial_completed"
            or report.get("source_manifest_sha256") != source_sha
            or report.get("split_manifest_sha256") != split_sha
            or report.get("feature_sha256") != trial.FEATURE_SHA256
            or report.get("upstream_commit") != pilot.UPSTREAM_SHA
            or report.get("conditioning") != trial.CONDITIONING
            or report.get("model_config") != trial.MODEL_CONFIG
            or report.get("clips_requested") != trial.TRAIN_RECORDS
            or report.get("steps_target") != trial.MAX_STEPS
            or report.get("heldout_training_clips") != 0
            or report.get("training_windows") != checkpoint.get("windows")):
        raise DiagnosticError("training_report_contract_mismatch")
    mean, std = checkpoint.get("loudness_mean"), checkpoint.get("loudness_std")
    if (not isinstance(mean, (int, float)) or not isinstance(std, (int, float))
            or not math.isfinite(mean) or not math.isfinite(std) or std <= 1e-5
            or not isinstance(checkpoint.get("dataset_digest"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", checkpoint["dataset_digest"])):
        raise DiagnosticError("checkpoint_normalizer_or_dataset_invalid")
    binding = {
        "checkpoint_sha256": checkpoint_marker["sha256"],
        "checkpoint_marker_sha256": hashlib.sha256(
            pilot._private_file(checkpoint_dir / f"checkpoint_step_{checkpoint['step']:06d}.json",
                                max_bytes=4096)).hexdigest(),
        "checkpoint_step": checkpoint["step"],
        "checkpoint_dataset_digest": checkpoint["dataset_digest"],
        "training_report_sha256": report_sha,
        "source_manifest_sha256": source_sha,
        "split_manifest_sha256": split_sha,
        "feature_sha256": trial.FEATURE_SHA256,
        "training_script_sha256": trial._script_sha256(),
        "upstream_commit": pilot.UPSTREAM_SHA,
        "training_windows_total": checkpoint["windows"],
        "checkpoint_loudness_mean": float(mean),
        "checkpoint_loudness_std": float(std),
    }
    return train_records, train_dir, binding


def _recheck_checkpoint_binding(checkpoint_dir: Path, binding: dict) -> None:
    """Fail closed if another run changed checkpoint/report while WAVs were read."""
    latest = trial._checkpoint_marker(checkpoint_dir)  # Rehashes the full .pt file.
    if latest is None:
        raise DiagnosticError("checkpoint_changed_during_diagnostic")
    marker, _ = latest
    marker_bytes = pilot._private_file(
        checkpoint_dir / f"checkpoint_step_{marker['step']:06d}.json", max_bytes=4096)
    _, report_sha = pilot._read_json(checkpoint_dir / trial.REPORT_NAME)
    if (marker["step"] != binding["checkpoint_step"]
            or marker["sha256"] != binding["checkpoint_sha256"]
            or hashlib.sha256(marker_bytes).hexdigest() != binding["checkpoint_marker_sha256"]
            or report_sha != binding["training_report_sha256"]):
        raise DiagnosticError("checkpoint_changed_during_diagnostic")


def _read_train_prefix(directory: Path, record: dict) -> np.ndarray:
    """Hash one training file as a stream; retain at most its first 120 s."""
    path = directory / record["output_file"]
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_size != record["output_bytes"]
            or stat.S_IMODE(info.st_mode) & 0o077):
        raise DiagnosticError("training_audio_permissions_or_size")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as source:
        opened = os.fstat(source.fileno())
        if (not stat.S_ISREG(opened.st_mode)
                or (opened.st_dev, opened.st_ino, opened.st_size)
                != (info.st_dev, info.st_ino, info.st_size)):
            raise DiagnosticError("training_audio_changed")
        if hashlib.file_digest(source, "sha256").hexdigest() != record["output_sha256"]:
            raise DiagnosticError("training_audio_hash_mismatch")
        source.seek(0)
        with wave.open(source, "rb") as reader:
            if (reader.getnchannels() != 1 or reader.getsampwidth() != 2
                    or reader.getframerate() != 16_000 or reader.getcomptype() != "NONE"
                    or reader.getnframes() != record["output_frames"]):
                raise DiagnosticError("training_audio_format_mismatch")
            frame_count = min(record["output_frames"], trial.MAX_ANALYZED_SECONDS_PER_CLIP * 16_000)
            pcm = reader.readframes(frame_count)
    if len(pcm) != frame_count * 2:
        raise DiagnosticError("training_audio_truncated")
    return np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0


def _stable_pairs(window: dict, song_index: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """RMS and the *exact training-window* weighted log feature, aligned at 100 Hz.

    The feature extractor's `rms_db` is a 64 ms centered window, not a
    calibrated SPL reading or a 10 ms block RMS.  Ignore 120 ms crop edges so
    recomputing that RMS on a 4 s selected window has full source context.
    """
    if window["samples"].shape != (pilot.WINDOW_SAMPLES,):
        raise DiagnosticError("training_window_shape_invalid")
    measured = extract_features(window["samples"])
    loudness = np.asarray(window["loudness"], dtype=np.float64)
    pitch = np.asarray(window["pitch_hz"], dtype=np.float64)
    valid = np.asarray(window["mask"], dtype=bool)
    rms_db = np.asarray(measured["rms_db"], dtype=np.float64)
    if any(array.shape != (pilot.WINDOW_FRAMES,) for array in (loudness, pitch, valid, rms_db)):
        raise DiagnosticError("training_feature_shape_invalid")
    # The selected window's center rows must match full-clip features used in
    # the actual training call; never silently use a different feature recipe.
    if not np.allclose(loudness[12:-12], measured["loudness"][12:-12], atol=2e-5, rtol=0):
        raise DiagnosticError("training_loudness_alignment_mismatch")
    chosen: list[int] = []
    for index in range(12, pilot.WINDOW_FRAMES - 12):
        neighborhood = slice(index - 5, index + 6)
        if not np.all(valid[neighborhood]):
            continue
        local_pitch = pitch[neighborhood]
        local_rms = rms_db[neighborhood]
        if (np.any(local_pitch <= 0) or not np.all(np.isfinite(local_rms))
                or np.ptp(local_rms) > 6.0
                or np.ptp(1200.0 * np.log2(local_pitch)) > 120.0):
            continue
        chosen.append(index)
    indices = np.asarray(chosen, dtype=np.int32)
    return (rms_db[indices].astype(np.float32), loudness[indices].astype(np.float32),
            pitch[indices].astype(np.float32),
            np.full(len(indices), song_index, dtype=np.int32))


def _collect_train_pairs(records: list[dict], directory: Path, deadline: float) -> tuple[dict, dict]:
    arrays: list[tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]] = []
    windows = 0
    clips_with_windows = 0
    clips_with_pairs = 0
    for record in records:
        if time.monotonic() >= deadline:
            raise DiagnosticError("time_cap_before_completion")
        audio = _read_train_prefix(directory, record)
        selected = trial.select_nonoverlapping_windows(audio)
        if selected:
            clips_with_windows += 1
        clip_has_pairs = False
        for window in selected:
            windows += 1
            pairs = _stable_pairs(window, record["song_index"])
            if len(pairs[0]):
                arrays.append(pairs)
                clip_has_pairs = True
        if clip_has_pairs:
            clips_with_pairs += 1
    if not arrays:
        raise DiagnosticError("no_stable_training_pairs")
    combined = tuple(np.concatenate([part[index] for part in arrays]) for index in range(4))
    if any(len(array) != len(combined[0]) for array in combined):
        raise DiagnosticError("pair_length_mismatch")
    counts = {"clips_examined": len(records), "clips_with_selected_windows": clips_with_windows,
              "clips_with_stable_pairs": clips_with_pairs, "selected_windows": windows,
              "stable_100hz_frames": len(combined[0]),
              "training_song_groups_with_pairs": len(set(combined[3].tolist()))}
    return {"rms_dbfs": combined[0], "weighted_log": combined[1],
            "pitch_hz": combined[2], "song_index": combined[3]}, counts


def _pava(values: list[float], weights: list[int]) -> list[float]:
    """Weighted monotone nondecreasing isotonic fit; no extrapolation."""
    blocks: list[list[float]] = []  # start, end, weight, weighted total
    for index, (value, weight) in enumerate(zip(values, weights)):
        if weight <= 0 or not math.isfinite(value):
            raise DiagnosticError("invalid_monotone_input")
        blocks.append([float(index), float(index), float(weight), value * weight])
        while len(blocks) >= 2 and blocks[-2][3] / blocks[-2][2] > blocks[-1][3] / blocks[-1][2]:
            right = blocks.pop()
            left = blocks[-1]
            left[1] = right[1]
            left[2] += right[2]
            left[3] += right[3]
    fitted = [0.0] * len(values)
    for start, end, weight, total in blocks:
        for index in range(int(start), int(end) + 1):
            fitted[index] = total / weight
    return fitted


def _support_bins(pairs: dict, *, normalizer_std: float) -> dict:
    rms = np.asarray(pairs["rms_dbfs"], dtype=np.float64)
    feature = np.asarray(pairs["weighted_log"], dtype=np.float64)
    songs = np.asarray(pairs["song_index"], dtype=np.int32)
    if (not len(rms) or any(array.shape != rms.shape for array in (feature, songs))
            or not np.all(np.isfinite(rms)) or not np.all(np.isfinite(feature))):
        raise DiagnosticError("pairs_invalid")
    indices = np.floor(rms / RMS_BIN_DB).astype(np.int32)
    candidate_bins = []
    for index in sorted(set(indices.tolist())):
        mask = indices == index
        song_values = [float(np.median(feature[mask & (songs == song)]))
                       for song in np.unique(songs[mask])]
        if int(np.count_nonzero(mask)) < MIN_BIN_FRAMES or len(song_values) < MIN_BIN_SONGS:
            continue
        candidate_bins.append({
            "index": int(index), "center_rms_dbfs": (index + 0.5) * RMS_BIN_DB,
            "training_frames": int(np.count_nonzero(mask)),
            "training_songs": len(song_values),
            "weighted_log_median_of_song_medians": float(np.median(song_values)),
        })
    song_rms_medians = [float(np.median(rms[songs == song])) for song in np.unique(songs)]
    anchor = float(np.median(song_rms_medians))
    anchor_index = math.floor(anchor / RMS_BIN_DB)
    supported = {row["index"]: row for row in candidate_bins}
    if anchor_index not in supported:
        return {"status": "anchor_bin_unsupported", "anchor_rms_dbfs": round(anchor, 4),
                "supported_bins": candidate_bins, "usable_run": []}
    left = right = anchor_index
    while left - 1 in supported:
        left -= 1
    while right + 1 in supported:
        right += 1
    run = [supported[index] for index in range(left, right + 1)]
    if len(run) < 2:
        return {"status": "insufficient_contiguous_bins", "anchor_rms_dbfs": round(anchor, 4),
                "supported_bins": candidate_bins, "usable_run": run}
    raw = [row["weighted_log_median_of_song_medians"] for row in run]
    fitted = _pava(raw, [row["training_songs"] for row in run])
    for row, value in zip(run, fitted):
        row["monotone_candidate_weighted_log"] = round(value, 6)
    correction_z = max(abs(a - b) / normalizer_std for a, b in zip(raw, fitted))
    return {"status": "train_only_candidate_range", "anchor_rms_dbfs": round(anchor, 4),
            "supported_bins": candidate_bins, "usable_run": run,
            "usable_center_range_rms_dbfs": [run[0]["center_rms_dbfs"], run[-1]["center_rms_dbfs"]],
            "max_monotonic_fit_adjustment_checkpoint_std": round(correction_z, 4)}


def _interpolate_supported(rms_dbfs: float, support: dict) -> float | None:
    run = support.get("usable_run", [])
    if support.get("status") != "train_only_candidate_range" or len(run) < 2:
        return None
    centers = np.asarray([item["center_rms_dbfs"] for item in run], dtype=float)
    if not centers[0] <= rms_dbfs <= centers[-1]:
        return None
    values = np.asarray([item["monotone_candidate_weighted_log"] for item in run], dtype=float)
    return float(np.interp(rms_dbfs, centers, values))


def _score_coverage(compiled: dict, candidate: dict, pairs: dict, support: dict,
                    normalizer_mean: float, normalizer_std: float) -> dict:
    steady = {float(event["steady_loudness_db"]) for event in compiled["events"]
              if event["articulation"] != "release"}
    if steady != {-29.0}:
        raise DiagnosticError("unexpected_score_steady_level")
    anchor = support["anchor_rms_dbfs"]
    states = candidate["gesture_state"]
    intent = candidate["loudness_db_intent"]
    state_rows: dict[str, dict] = {}
    for name, code in score_adapter.STATE_CODES.items():
        mask = states == code
        target_rms = anchor + (intent[mask].astype(np.float64) - (-29.0))
        mapped = [_interpolate_supported(float(value), support) for value in target_rms]
        supported = sum(value is not None for value in mapped)
        state_rows[name] = {
            "score_control_frames": int(np.count_nonzero(mask)),
            "authored_db_intent_range": [round(float(np.min(intent[mask])), 4),
                                         round(float(np.max(intent[mask])), 4)],
            "hypothetical_measured_rms_range_dbfs": [round(float(np.min(target_rms)), 4),
                                                      round(float(np.max(target_rms)), 4)],
            "frames_outside_train_supported_center_range": int(len(mapped) - supported),
            "all_frames_in_train_supported_center_range": supported == len(mapped),
            "interpretation": ("explicit_rest_requires_post_reverb_sample_mute"
                               if name == "release" else
                               "range_only_not_learned_attack_or_breath" if name in ("breath_start", "rearticulate")
                               else "range_only_not_timbre_validation"),
        }
    pitch = np.asarray(pairs["pitch_hz"], dtype=np.float64)
    songs = np.asarray(pairs["song_index"], dtype=np.int32)
    pitch_rows = []
    names = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
    notes = {}
    for event in compiled["events"]:
        if event["articulation"] == "release":
            continue
        hz = float(event["pitch_hz"])
        midi = round(69 + 12 * math.log2(hz / 440.0))
        name = f"{names[midi % 12]}{midi // 12 - 1}"
        notes[name] = 440.0 * 2 ** ((midi - 69) / 12)
    for name, hz in sorted(notes.items()):
        cents = 1200.0 * np.log2(pitch / hz)
        near = np.abs(cents) <= PITCH_TOLERANCE_CENTS
        frames = int(np.count_nonzero(near))
        song_count = len(set(songs[near].tolist()))
        pitch_rows.append({"score_pitch": name, "train_frames_within_50_cents": frames,
                           "train_songs_within_50_cents": song_count,
                           "minimum_observed_support": frames >= MIN_BIN_FRAMES and song_count >= MIN_BIN_SONGS})
    anchor_feature = _interpolate_supported(anchor, support)
    return {
        "score_plan_sha256": candidate["manifest"]["plan_sha256"],
        "score_control_frames": len(intent),
        "score_pitched_events": sum(event["articulation"] != "release" for event in compiled["events"]),
        "authored_steady_db": -29.0,
        "anchor_assumption": "authorial_-29db_equals_median_of_per_train_song_stable_64ms_rms_dbfs; relative_dB_preserved_only_as_a_feasibility_coordinate",
        "anchor_weighted_log_candidate": None if anchor_feature is None else round(anchor_feature, 6),
        "anchor_normalized_candidate": None if anchor_feature is None else round((anchor_feature - normalizer_mean) / normalizer_std, 6),
        "states": state_rows,
        "nominal_pitch_coverage": pitch_rows,
        "all_sounding_state_frames_supported": all(state_rows[name]["all_frames_in_train_supported_center_range"]
                                               for name in ("breath_start", "rearticulate", "slur")),
        "all_nominal_pitches_minimally_supported": all(row["minimum_observed_support"] for row in pitch_rows),
        "release_requires_sample_domain_mute": True,
        "score_candidate_inference_ready": False,
    }


def run(*, source_manifest: Path, split_manifest: Path, checkpoint_dir: Path,
        upstream_root: Path, output_dir: Path, clips: int, minutes: int) -> dict:
    if not MIN_CLIPS <= clips <= MAX_CLIPS or not 1 <= minutes <= MAX_MINUTES:
        raise DiagnosticError("diagnostic_limit")
    deadline = time.monotonic() + minutes * 60
    with pilot._network_disabled():
        records, train_dir, binding = _check_bindings(
            source_manifest, split_manifest, checkpoint_dir, upstream_root, output_dir)
        compiled, candidate, score_sha = _score_candidate()
        selected = trial._balanced_training_records(records, clips)
        pairs, counts = _collect_train_pairs(selected, train_dir, deadline)
        support = _support_bins(pairs, normalizer_std=binding["checkpoint_loudness_std"])
        score = _score_coverage(compiled, candidate, pairs, support,
                                binding["checkpoint_loudness_mean"],
                                binding["checkpoint_loudness_std"])
        if score["score_plan_sha256"] != score_sha:
            raise DiagnosticError("score_plan_hash_mismatch")
        report = {
            "schema": SCHEMA,
            "status": "train_only_feasibility_not_inference_ready",
            "source_rights": "AI_Hub_71470_private_research_only_no_export_or_redistribution",
            "binding": binding,
            "data_scope": {**counts, "heldout_wavs_opened": 0,
                           "max_seconds_read_per_train_clip": trial.MAX_ANALYZED_SECONDS_PER_CLIP,
                           "selected_training_window_seconds":
                           pilot.WINDOW_SAMPLES / pilot.SAMPLE_RATE,
                           "pair_rms": "64ms_centered_YIN_window_RMS_dBFS_at_100Hz; not SPL",
                           "pair_feature": "exact_checkpoint_training_window_weighted_log_spectral_loudness"},
            "train_only_monotone_support": support,
            "score_feasibility": score,
            "limitations": [
                "no_heldout_audio_opened_or_used_for_fit",
                "train_only_subset_does_not_prove_heldout_generalization",
                "monotone_RMS_to_weighted_log_is_a_candidate_not_a_validated_score_loudness_mapping",
                "score_authored_dB_has_no_measured_RMS_ground_truth",
                "empirical_RMS_feature_association_is_not_a_causal_same_pitch_or_same_timbre_transform",
                "100Hz_model_has_no_articulation_state_breath_label_or_true_silence_guarantee",
                "no_inference_no_audio_no_game_asset",
                "python_socket_guard_is_not_an_OS_network_sandbox",
            ],
            "inference_ready": False,
        }
        payload = json.dumps(report, sort_keys=True, indent=2).encode() + b"\n"
        if len(payload) > 64_000:
            raise DiagnosticError("aggregate_report_too_large")
        _recheck_checkpoint_binding(checkpoint_dir, binding)
        trial._atomic_private_bytes(output_dir, REPORT_NAME, payload, replace=False)
        return {"status": "train_only_feasibility_completed",
                "training_clips": counts["clips_examined"],
                "training_windows": counts["selected_windows"],
                "stable_frames": counts["stable_100hz_frames"],
                "inference_ready": False}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--split-manifest", type=Path, required=True)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--upstream-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--clips", type=int, default=DEFAULT_CLIPS)
    parser.add_argument("--minutes", type=int, default=30)
    args = parser.parse_args()
    try:
        result = run(**vars(args))
    except (DiagnosticError, trial.TrialError, pilot.PilotError) as exc:
        result = {"status": "blocked", "reason": str(exc)}
    except (OSError, ValueError, wave.Error):
        result = {"status": "blocked", "reason": "private_input_unavailable_or_invalid"}
    except Exception:
        # The unhandled exception's text/traceback could contain a licensed
        # source pathname.  Only emit a fixed code, never exception details.
        result = {"status": "blocked", "reason": "unexpected_private_diagnostic_error"}
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] != "blocked" else 2


if __name__ == "__main__":
    raise SystemExit(main())
