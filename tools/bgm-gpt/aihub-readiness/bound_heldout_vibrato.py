#!/usr/bin/env python3
"""Private, checkpoint-bound VB01 *reproduction* test on held-out songs.

This does not learn or test when to add vibrato.  The model receives F0 from
the held-out performance.  Source-only selection is frozen before inference;
all eligible clips remain in the numerical denominator, including failures.
Only fixed aggregate status is printed.  Licensed audio, event times, and
checkpoints stay in 0700/0600 local-private folders outside the repository.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
import time
from typing import Any

import numpy as np
from scipy.signal import find_peaks

import audit_vibrato_boundaries as audit
import bound_heldout_evaluation as bound
import mac_mps_ddsp_long_trial as trial
import mac_mps_ddsp_pilot as pilot
from mac_mps_ddsp_features import extract_features


SCHEMA = "mini.aihub-71470-heldout-vb01-reproduction.v1"
SELECTION_SCHEMA = "mini.aihub-71470-heldout-vb01-selection.v1"
REPORT_NAME = "vibrato_reproduction_report.json"
SELECTION_NAME = "vibrato_selection_private.json"
BINDING_NAME = "checkpoint_binding.json"
EXPECTED_SELECTED = 24
EXPECTED_VB01 = 163
EXPECTED_ELIGIBLE = 50
MAX_MINUTES = 30
MAX_REPORT_BYTES = 16_384
PAIR_TARGET_SONGS = 3
MIDDLE_SECONDS = 0.50


class VibratoError(Exception):
    """Fixed non-private error code for CLI output."""


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _script_sha(path: Path) -> str:
    return _digest(path.read_bytes())


def _private_json(path: Path) -> tuple[dict[str, Any], str]:
    return bound._json_private(path, max_bytes=MAX_REPORT_BYTES)


def _label_sha(label_zip: Path) -> str:
    return _digest(audit._private_regular_file(label_zip, audit.MAX_LABEL_ZIP_BYTES, ".zip"))


def _erode_voicing(voiced: np.ndarray) -> np.ndarray:
    """The same two-neighbour mask used for high-confidence training windows."""
    mask = np.asarray(voiced, dtype=bool).copy()
    for shift in (1, 2):
        mask[shift:] &= voiced[:-shift]
        mask[:-shift] &= voiced[shift:]
    return mask


def _center_indices(frame_start: int, midpoint: float) -> np.ndarray:
    times = (frame_start + np.arange(pilot.WINDOW_FRAMES)) / 100.0
    return (times >= midpoint - MIDDLE_SECONDS / 2) & (times < midpoint + MIDDLE_SECONDS / 2)


def _modulation(pitch_hz: np.ndarray, voiced: np.ndarray, times: np.ndarray) -> dict[str, Any]:
    """Strict central-half-second periodicity, not a Korean ornament ground truth."""
    pitch_hz = np.asarray(pitch_hz, dtype=np.float64)
    voiced = np.asarray(voiced, dtype=bool)
    times = np.asarray(times, dtype=np.float64)
    if pitch_hz.shape != voiced.shape or pitch_hz.shape != times.shape or pitch_hz.size < 35:
        raise VibratoError("modulation_window_shape")
    fraction = float(np.mean(voiced))
    if fraction < 0.78 or not np.all(np.isfinite(pitch_hz[voiced])) or np.any(pitch_hz[voiced] <= 0):
        return {"state": "indeterminate", "reason": "insufficient_voiced_frames", "voiced_fraction": fraction}
    indices = np.flatnonzero(voiced)
    if np.max(np.diff(indices), initial=0) > 5:
        return {"state": "indeterminate", "reason": "long_pitch_gap", "voiced_fraction": fraction}
    cents = 1200.0 * np.log2(pitch_hz[voiced] / np.median(pitch_hz[voiced]))
    t = times[voiced]
    jumps = np.abs(np.diff(cents) / np.maximum(np.diff(t) / 0.01, 1.0))
    if jumps.size and float(np.mean(jumps > 120.0)) > 0.05:
        return {"state": "indeterminate", "reason": "pitch_discontinuity", "voiced_fraction": fraction}
    t = t - float(np.mean(t))
    baseline = np.column_stack((np.ones(t.size), t))
    baseline_coeff, *_ = np.linalg.lstsq(baseline, cents, rcond=None)
    residual = cents - baseline @ baseline_coeff
    baseline_sse = float(np.dot(residual, residual))
    if baseline_sse < 0.01 * t.size:
        return {"state": "not_modulated", "reason": "nearly_flat", "voiced_fraction": fraction,
                "amplitude_cents": 0.0, "frequency_hz": None}
    best_amplitude, best_improvement, best_frequency = 0.0, 0.0, None
    for frequency in np.arange(3.5, 8.501, 0.25):
        phase = 2 * math.pi * frequency * t
        design = np.column_stack((baseline, np.sin(phase), np.cos(phase)))
        coefficients, *_ = np.linalg.lstsq(design, cents, rcond=None)
        remainder = cents - design @ coefficients
        improvement = max(0.0, 1.0 - float(np.dot(remainder, remainder)) / baseline_sse)
        if improvement > best_improvement:
            best_amplitude = math.hypot(float(coefficients[-2]), float(coefficients[-1]))
            best_improvement = improvement
            best_frequency = float(frequency)
    smoothed = np.convolve(residual, np.ones(3) / 3.0, mode="same")
    turns = (len(find_peaks(smoothed, prominence=8.0, distance=6)[0])
             + len(find_peaks(-smoothed, prominence=8.0, distance=6)[0]))
    modulated = best_amplitude >= 12.0 and best_improvement >= 0.40 and turns >= 2
    return {
        "state": "modulated" if modulated else "not_modulated",
        "reason": "strict_periodic_modulation" if modulated else "no_strict_modulation",
        "voiced_fraction": fraction,
        "amplitude_cents": float(best_amplitude),
        "frequency_hz": best_frequency,
    }


def _crop_frame(midpoint: float, sample_count: int, start: float, end: float) -> int:
    max_start = min(sample_count // pilot.BLOCK_SIZE - pilot.WINDOW_FRAMES, 11_600)
    if max_start < 0:
        raise VibratoError("selected_clip_shorter_than_four_seconds")
    candidate = math.floor(midpoint * 100) - 200
    chosen = max(0, min(candidate, max_start))
    if start - chosen / 100 < 0.50 or (chosen + pilot.WINDOW_FRAMES) / 100 - end < 0.50:
        raise VibratoError("selected_event_lacks_four_second_context")
    return chosen


def _conditioning(audio: np.ndarray, frame_start: int, midpoint: float) -> tuple[dict[str, np.ndarray], dict]:
    features = extract_features(audio, sample_rate=pilot.SAMPLE_RATE, block_size=pilot.BLOCK_SIZE)
    if any(len(value) != pilot.WINDOW_FRAMES for value in features.values()):
        raise VibratoError("conditioning_frame_count")
    mask = _erode_voicing(features["voiced_mask"])
    middle = _center_indices(frame_start, midpoint)
    times = (frame_start + np.arange(pilot.WINDOW_FRAMES)) / 100.0
    modulation = _modulation(features["pitch_hz"][middle], mask[middle], times[middle])
    item = {
        "samples": np.ascontiguousarray(audio, dtype=np.float32),
        "pitch_hz": np.where(mask, features["pitch_hz"], 0).astype(np.float32),
        "loudness": np.ascontiguousarray(features["loudness"], dtype=np.float32),
        "mask": mask,
    }
    return item, modulation


def _rms_db(audio: np.ndarray) -> np.ndarray:
    blocks = np.asarray(audio, dtype=np.float64).reshape(pilot.WINDOW_FRAMES, pilot.BLOCK_SIZE)
    return 20 * np.log10(np.maximum(np.sqrt(np.mean(blocks * blocks, axis=1)), 1e-12))


def _attack_transitions(levels: np.ndarray) -> list[int]:
    """Five quiet 10-ms frames then five active; acoustic proxy, not breath labels."""
    transitions = []
    for frame in range(5, len(levels) - 5):
        if np.all(levels[frame - 5:frame] < -50) and np.all(levels[frame:frame + 5] > -42):
            transitions.append(frame)
    return transitions


def _attack_match(source: np.ndarray, rendered: np.ndarray) -> tuple[int, int]:
    original = _attack_transitions(_rms_db(source))
    reconstructed = _attack_transitions(_rms_db(rendered))
    remaining = reconstructed.copy()
    matched = 0
    for onset in original:
        candidates = [value for value in remaining if abs(value - onset) <= 20]
        if candidates:
            chosen = min(candidates, key=lambda value: (abs(value - onset), value))
            remaining.remove(chosen)
            matched += 1
    return len(original), matched


def _f0_comparison(source_pitch: np.ndarray, source_mask: np.ndarray,
                   output_pitch: np.ndarray, output_mask: np.ndarray,
                   middle: np.ndarray) -> tuple[int, float | None, int]:
    common = middle & source_mask & output_mask
    if np.any(common):
        errors = np.abs(1200.0 * np.log2(output_pitch[common] / source_pitch[common]))
        median = float(np.median(errors))
    else:
        median = None
    missing = middle & source_mask & ~output_mask
    longest = 0
    current = 0
    for value in missing:
        current = current + 1 if value else 0
        longest = max(longest, current)
    return int(np.count_nonzero(common)), median, longest


def _audible_dropouts(source: np.ndarray, rendered: np.ndarray,
                      middle: np.ndarray) -> tuple[int, int, int]:
    """Raw level gaps, separately from a possibly failing F0 tracker."""
    source_active = middle & (_rms_db(source) > -42)
    reconstructed_quiet = _rms_db(rendered) < -50
    gaps = source_active & reconstructed_quiet
    longest = 0
    current = 0
    for value in gaps:
        current = current + 1 if value else 0
        longest = max(longest, current)
    return int(np.count_nonzero(source_active)), int(np.count_nonzero(gaps)), longest


def _whole_rms_db(audio: np.ndarray) -> float:
    rms = float(np.sqrt(np.mean(np.asarray(audio, dtype=np.float64) ** 2)))
    return 20 * math.log10(max(rms, 1e-12))


def _source_selection(records: list[dict], heldout_dir: Path, label_zip: Path,
                      deadline: float) -> dict[str, Any]:
    sorted_records = sorted(records, key=lambda item: item["output_sha256"])
    stems = {item.get("source_stem") for item in sorted_records}
    if len(stems) != trial.HELDOUT_RECORDS or not all(isinstance(stem, str) for stem in stems):
        raise VibratoError("heldout_label_stems_invalid")
    labels = audit._load_labels(label_zip, stems)
    counts: Counter[str] = Counter()
    selected: list[dict[str, Any]] = []
    for record in sorted_records:
        if time.monotonic() >= deadline:
            raise VibratoError("selection_time_cap")
        duration, all_events = labels[record["source_stem"]]
        audio = trial._load_wav(heldout_dir, record)
        if abs(len(audio) / pilot.SAMPLE_RATE - duration) > 0.05:
            raise VibratoError("heldout_wav_label_duration_mismatch")
        eligible = audit._eligible_events(duration, all_events)
        counts["heldout_clips"] += 1
        counts["vb01_labels"] += sum(code == "VB01" for _, _, code in all_events)
        counts["eligible_vb01_labels"] += len(eligible)
        if not eligible:
            counts["clips_without_eligible_vb01"] += 1
            continue
        # The first chronological eligible label is fixed before any model output.
        event = eligible[0]
        midpoint = (event.start + event.end) / 2
        frame_start = _crop_frame(midpoint, len(audio), event.start, event.end)
        excerpt = audio[frame_start * pilot.BLOCK_SIZE:(frame_start + pilot.WINDOW_FRAMES) * pilot.BLOCK_SIZE]
        _, input64 = _conditioning(excerpt, frame_start, midpoint)
        source80 = audit.analyze_window(audio, midpoint - 0.25, midpoint + 0.25)
        counts["selected_clips"] += 1
        counts[f"source80_{source80.state}"] += 1
        counts[f"input64_{input64['state']}"] += 1
        selected.append({
            "output_file": record["output_file"],
            "output_sha256": record["output_sha256"],
            "song_index": record["song_index"],
            "event_start_seconds": event.start,
            "event_end_seconds": event.end,
            "crop_start_frame_100hz": frame_start,
            "source80_state": source80.state,
            "source80_amplitude_cents": source80.amplitude_cents,
            "input64_state": input64["state"],
            "input64_amplitude_cents": input64.get("amplitude_cents"),
            "planned_pair_rank": 0,
        })
    if (counts["heldout_clips"] != trial.HELDOUT_RECORDS
            or counts["vb01_labels"] != EXPECTED_VB01
            or counts["eligible_vb01_labels"] != EXPECTED_ELIGIBLE
            or counts["selected_clips"] != EXPECTED_SELECTED):
        raise VibratoError("heldout_label_population_changed")
    if {item["song_index"] for item in selected} != {item["song_index"] for item in records}:
        raise VibratoError("heldout_song_group_coverage_changed")
    # Three song groups are chosen by index only, not their acoustic or model quality.
    first_songs = sorted({item["song_index"] for item in records})[:PAIR_TARGET_SONGS]
    for rank, song in enumerate(first_songs, start=1):
        candidates = [item for item in selected if item["song_index"] == song
                      and item["input64_state"] == "modulated"]
        if candidates:
            min(candidates, key=lambda item: item["output_sha256"])["planned_pair_rank"] = rank
    return {
        "schema": SELECTION_SCHEMA,
        "selection_rule": "first_chronological_isolated_vb01_per_clip; source_sha_order; first_three_song_groups_by_index; first_source_input64_modulated_sha_per_group",
        "central_detector": "3.5-8.5Hz amplitude>=12c fit_improvement>=0.4 turns>=2; 0.5s; not an expression ground truth",
        "counts": dict(sorted(counts.items())),
        "records": selected,
    }


def _aggregate_report(selection: dict[str, Any], *, source_sha: str, split_sha: str,
                      label_sha: str, checkpoint_sha: str, training_report_sha: str,
                      selection_sha: str, scores: list[dict[str, Any]],
                      pair_notes: list[dict[str, Any]], elapsed: float) -> dict[str, Any]:
    counts = Counter(selection["counts"])
    for row in scores:
        counts[f"output64_{row['output64_state']}"] += 1
        if row["input64_state"] == "modulated":
            counts["input64_positive_evaluated"] += 1
            counts["input64_positive_output64_positive"] += row["output64_state"] == "modulated"
        counts["source_quiet_10ms_frames"] += row["quiet_frames"]
        counts["reconstruction_leakage_frames_above_minus40dbfs"] += row["leaking_frames"]
        counts["source_quiet_to_active_proxies"] += row["attack_count"]
        counts["matched_quiet_to_active_proxies_within_200ms"] += row["attack_matched"]
        counts["central_input_voiced_output_pitch_gap_gt30ms"] += row["longest_missing_frames"] > 3
        counts["central_common_voiced_frames"] += row["common_voiced_frames"]
        counts["central_crops_with_common_voiced_f0"] += row["common_voiced_frames"] > 0
        counts["central_source_active_10ms_frames"] += row["central_source_active_frames"]
        counts["central_output_quiet_on_source_active_frames"] += row["central_quiet_frames"]
        counts["central_output_audible_gap_gt30ms"] += row["longest_audible_gap_frames"] > 3
    def median(key: str) -> float | None:
        values = [float(row[key]) for row in scores if row[key] is not None]
        return round(float(np.median(values)), 4) if values else None
    leakage = (round(counts["reconstruction_leakage_frames_above_minus40dbfs"]
                     / counts["source_quiet_10ms_frames"], 6)
               if counts["source_quiet_10ms_frames"] else None)
    ratios = [row["output_amplitude_cents"] / row["input_amplitude_cents"]
              for row in scores if row["input64_state"] == "modulated"
              and row["output64_state"] == "modulated"
              and row["input_amplitude_cents"] and row["output_amplitude_cents"] is not None]
    frequency_differences = [abs(row["output_frequency_hz"] - row["input_frequency_hz"])
                             for row in scores if row["input64_state"] == "modulated"
                             and row["output64_state"] == "modulated"
                             and row["input_frequency_hz"] is not None
                             and row["output_frequency_hz"] is not None]
    source80_amplitudes = [item["source80_amplitude_cents"] for item in selection["records"]
                           if item["source80_state"] == "modulated"
                           and item["source80_amplitude_cents"] is not None]
    song_indices = sorted({item["song_index"] for item in selection["records"]})
    song_groups = []
    for ordinal, song in enumerate(song_indices, start=1):
        group = [row for row in scores if row["song_index"] == song]
        song_groups.append({
            "heldout_song_ordinal": ordinal,
            "selected_crops": len(group),
            "input64_strict_modulated": sum(row["input64_state"] == "modulated" for row in group),
            "output64_strict_modulated": sum(row["output64_state"] == "modulated" for row in group),
            "input64_positive_output64_positive": sum(
                row["input64_state"] == "modulated" and row["output64_state"] == "modulated"
                for row in group),
        })
    return {
        "schema": SCHEMA,
        "status": "heldout_vb01_reproduction_evaluated",
        "scope": "private_local_r_and_d_only_not_game_output",
        "checkpoint_step": bound.EXPECTED_STEP,
        "checkpoint_sha256": checkpoint_sha,
        "source_manifest_sha256": source_sha,
        "split_manifest_sha256": split_sha,
        "label_zip_sha256": label_sha,
        "training_report_sha256": training_report_sha,
        "selection_sha256": selection_sha,
        "feature_sha256": trial.FEATURE_SHA256,
        "upstream_commit": pilot.UPSTREAM_SHA,
        "conditioning": trial.CONDITIONING,
        "model_config": trial.MODEL_CONFIG,
        "counts": dict(sorted(counts.items())),
        "heldout_song_group_aggregates": song_groups,
        "heldout_crops_evaluated": len(scores),
        "unmasked_spectral_loss_mean": round(float(np.mean([row["spectral_loss"] for row in scores])), 6),
        "unmasked_spectral_loss_median": median("spectral_loss"),
        "input64_to_output64_median_absolute_f0_error_cents_median": median("median_f0_error_cents"),
        "source80_strict_amplitude_cents_median": (
            round(float(np.median(source80_amplitudes)), 2) if source80_amplitudes else None),
        "input64_output64_amplitude_ratio_median_when_both_strict": (
            round(float(np.median(ratios)), 4) if ratios else None),
        "input64_output64_frequency_absolute_difference_hz_median_when_both_strict": (
            round(float(np.median(frequency_differences)), 4) if frequency_differences else None),
        "raw_reconstruction_minus_source_rms_db_median": median("rms_level_difference_db"),
        "source_quiet_reconstruction_leakage_fraction": leakage,
        "private_pair_notes": pair_notes,
        "window_seconds": 4,
        "pair_sample_rate_hz": pilot.SAMPLE_RATE,
        "wall_seconds": round(elapsed, 2),
        "limitations": [
            "input_F0_is_extracted_from_the_heldout_performance; this_is_not_vibrato_placement_learning",
            "VB01_boundaries_are_not_sample_accurate_or_confirmed_flat_to_vibrato_transitions",
            "source_80ms_and_model_64ms_YIN_are_estimators_not_independent_pitch_ground_truth",
            "24_clips_are_nested_in_4_heldout_songs_not_24_independent_songs",
            "prior_250_clip_F0_audit_included_heldout_material; preprocessing_was_not_fully_blind",
            "four_second_crops_truncate_context_and_reverb; stochastic_noise_is_seeded",
            "audio_naturalness_and_Korean_ornament_style_require_local_human_listening",
        ],
    }


def evaluate_and_bind(*, source_manifest: Path, split_manifest: Path, label_zip: Path,
                      upstream_root: Path, checkpoint_dir: Path, output_dir: Path,
                      minutes: int = MAX_MINUTES) -> dict[str, Any]:
    if not 1 <= minutes <= MAX_MINUTES:
        raise VibratoError("evaluation_limit")
    start_time = time.monotonic()
    deadline = start_time + 60 * minutes
    try:
        with pilot._network_disabled(), trial._exclusive_private_lock(output_dir), trial._exclusive_private_lock(checkpoint_dir):
            pilot._private_dir(output_dir)
            if set(os.listdir(output_dir)) != {".trial.lock"}:
                raise VibratoError("evaluation_output_not_fresh")
            pilot._check_disjoint_report_dir(output_dir, [source_manifest.parent,
                split_manifest.parent, label_zip.parent, upstream_root, checkpoint_dir])
            evaluator_sha = _script_sha(Path(__file__))
            audit_sha = _script_sha(Path(audit.__file__))
            helper_sha = _script_sha(Path(bound.__file__))
            source, source_sha, split, split_sha, _, heldout_dir = trial._private_inputs(
                source_manifest, split_manifest, output_dir, upstream_root)
            _, heldout_records = trial.validate_documents(source, source_sha, split)
            label_sha = _label_sha(label_zip)
            trial._verify_feature_version()
            pilot._verify_upstream(upstream_root)
            before = bound._checkpoint_snapshot(checkpoint_dir)
            contract = bound._checkpoint_contract(before["_path"])
            bound._verify_contract(contract, source_sha=source_sha, split_sha=split_sha)
            training_report_sha = bound._verify_training_report(checkpoint_dir, contract)

            selection = _source_selection(heldout_records, heldout_dir, label_zip, deadline)
            selection.update({"source_manifest_sha256": source_sha,
                "split_manifest_sha256": split_sha, "label_zip_sha256": label_sha,
                "feature_sha256": trial.FEATURE_SHA256})
            trial._write_json(output_dir, SELECTION_NAME, selection, replace=False)
            _, selection_sha = _private_json(output_dir / SELECTION_NAME)

            torch, DDSP, multiscale_fft, safe_log = trial._mac_mps_gate(output_dir, upstream_root)
            checkpoint = torch.load(before["_path"], map_location="cpu", weights_only=True)
            bound._verify_contract(checkpoint, source_sha=source_sha, split_sha=split_sha)
            model, _ = trial._model_and_optimizer(torch, DDSP)
            model.load_state_dict(checkpoint["model_state"])
            model.eval()
            mean, std = contract["loudness_mean"], contract["loudness_std"]
            record_by_name = {item["output_file"]: item for item in heldout_records}
            scores: list[dict[str, Any]] = []
            planned_pairs: list[tuple[int, np.ndarray, np.ndarray]] = []
            for index, selected in enumerate(selection["records"]):
                if time.monotonic() >= deadline:
                    raise VibratoError("evaluation_time_cap")
                record = record_by_name[selected["output_file"]]
                audio = trial._load_wav(heldout_dir, record)
                frame_start = selected["crop_start_frame_100hz"]
                excerpt = audio[frame_start * pilot.BLOCK_SIZE:(frame_start + pilot.WINDOW_FRAMES) * pilot.BLOCK_SIZE]
                midpoint = (selected["event_start_seconds"] + selected["event_end_seconds"]) / 2
                item, input64 = _conditioning(excerpt, frame_start, midpoint)
                if input64["state"] != selected["input64_state"]:
                    raise VibratoError("source_conditioning_changed_after_selection")
                torch.manual_seed(trial.SEED + 300_000 + index)
                with torch.no_grad():
                    samples, pitch, loudness, _ = trial._tensors(torch, item, mean, std)
                    prediction = model(pitch, loudness).squeeze(-1)
                    if prediction.shape != samples.shape or prediction.device.type != "mps":
                        raise VibratoError("mps_output_invalid")
                    loss = trial._loss(torch, multiscale_fft, safe_log, samples, prediction,
                                       torch.ones_like(samples))
                    if not torch.isfinite(loss).item() or not torch.isfinite(prediction).all().item():
                        raise VibratoError("nonfinite_model_output")
                    rendered = prediction.detach().cpu().numpy().reshape(-1)
                output_features = extract_features(rendered)
                output_mask = _erode_voicing(output_features["voiced_mask"])
                middle = _center_indices(frame_start, midpoint)
                times = (frame_start + np.arange(pilot.WINDOW_FRAMES)) / 100.0
                output64 = _modulation(output_features["pitch_hz"][middle],
                                       output_mask[middle], times[middle])
                common, median_error, longest_missing = _f0_comparison(
                    item["pitch_hz"], item["mask"], output_features["pitch_hz"],
                    output_mask, middle)
                quiet, leaking = trial.quiet_leakage_counts(excerpt, rendered)
                attacks, matched_attacks = _attack_match(excerpt, rendered)
                central_active, central_quiet, longest_audible_gap = _audible_dropouts(
                    excerpt, rendered, middle)
                scores.append({
                    "song_index": selected["song_index"],
                    "input64_state": input64["state"],
                    "output64_state": output64["state"],
                    "input_amplitude_cents": input64.get("amplitude_cents"),
                    "output_amplitude_cents": output64.get("amplitude_cents"),
                    "input_frequency_hz": input64.get("frequency_hz"),
                    "output_frequency_hz": output64.get("frequency_hz"),
                    "spectral_loss": float(loss.item()),
                    "rms_level_difference_db": _whole_rms_db(rendered) - _whole_rms_db(excerpt),
                    "common_voiced_frames": common,
                    "median_f0_error_cents": median_error,
                    "longest_missing_frames": longest_missing,
                    "central_source_active_frames": central_active,
                    "central_quiet_frames": central_quiet,
                    "longest_audible_gap_frames": longest_audible_gap,
                    "quiet_frames": quiet, "leaking_frames": leaking,
                    "attack_count": attacks, "attack_matched": matched_attacks,
                })
                if selected["planned_pair_rank"]:
                    planned_pairs.append((selected["planned_pair_rank"], excerpt.copy(), rendered.copy()))

            if len(scores) != EXPECTED_SELECTED:
                raise VibratoError("evaluation_denominator_incomplete")
            pair_payloads: list[tuple[str, bytes]] = []
            pair_notes: list[dict[str, Any]] = []
            for planned_rank, original, rendered in sorted(planned_pairs):
                note: dict[str, Any] = {"planned_song_rank": planned_rank}
                try:
                    left, right, levels = trial._matched_pair(original, rendered)
                except trial.TrialError as exc:
                    if str(exc) not in ("listening_pair_too_quiet",
                                        "listening_pair_cannot_match_audibly_without_excess_gain"):
                        raise
                    note["status"] = "unavailable_level_match"  # No replacement/cherry-pick.
                else:
                    number = len(pair_payloads) // 2 + 1
                    pair_payloads.extend([
                        (f"pair_{number:02d}_source_input_16k.wav", trial._wav_bytes(left)),
                        (f"pair_{number:02d}_reconstruction.wav", trial._wav_bytes(right)),
                    ])
                    note.update({"status": "saved", "pair_number": number, "levels": levels})
                pair_notes.append(note)

            # End-of-run source, label, code, model, and training-report equality.
            _, source_after, _, split_after, _, _ = trial._private_inputs(
                source_manifest, split_manifest, output_dir, upstream_root)
            if source_after != source_sha or split_after != split_sha or _label_sha(label_zip) != label_sha:
                raise VibratoError("private_inputs_changed_during_evaluation")
            if (_script_sha(Path(__file__)) != evaluator_sha
                    or _script_sha(Path(audit.__file__)) != audit_sha
                    or _script_sha(Path(bound.__file__)) != helper_sha):
                raise VibratoError("evaluation_code_changed_during_run")
            pilot._verify_upstream(upstream_root)
            after = bound._checkpoint_snapshot(checkpoint_dir)
            bound._same_checkpoint(before, after)
            if bound._verify_training_report(checkpoint_dir, contract) != training_report_sha:
                raise VibratoError("training_report_changed_during_evaluation")
            pilot._check_free_space(output_dir)

            report = _aggregate_report(selection, source_sha=source_sha, split_sha=split_sha,
                label_sha=label_sha, checkpoint_sha=before["checkpoint_sha256"],
                training_report_sha=training_report_sha, selection_sha=selection_sha,
                scores=scores, pair_notes=pair_notes, elapsed=time.monotonic() - start_time)
            pending = Path(tempfile.mkdtemp(prefix=".pending_vb_", dir=output_dir))
            pending.chmod(0o700)
            # Write and hash the exact report and A/B bytes before binding; one
            # final directory rename makes the complete result visible at once.
            if pair_payloads:
                pairs_dir = pending / "pairs"
                pairs_dir.mkdir(mode=0o700)
                for name, payload in pair_payloads:
                    trial._atomic_private_bytes(pairs_dir, name, payload, replace=False)
                trial._fsync_directory(pairs_dir)
            trial._write_json(pending, REPORT_NAME, report, replace=False)
            _, report_sha = _private_json(pending / REPORT_NAME)
            pair_digests = bound._pair_digests(pending, len(pair_payloads) // 2)
            binding = {
                "schema": SCHEMA, "status": "complete_bound_to_checkpoint",
                "checkpoint_step": before["step"],
                "checkpoint_marker_sha256": before["marker_sha256"],
                "checkpoint_sha256": before["checkpoint_sha256"],
                "checkpoint_bytes": before["checkpoint_bytes"],
                "source_manifest_sha256": source_sha, "split_manifest_sha256": split_sha,
                "label_zip_sha256": label_sha, "selection_sha256": selection_sha,
                "training_report_sha256": training_report_sha,
                "reproduction_report_sha256": report_sha,
                "private_pair_wav_digests": pair_digests,
                "evaluation_script_sha256": evaluator_sha,
                "audit_script_sha256": audit_sha,
                "binding_helper_sha256": helper_sha,
                "feature_sha256": trial.FEATURE_SHA256,
                "training_script_sha256": contract["script_sha256"],
                "dataset_digest": contract["dataset_digest"],
                "upstream_commit": pilot.UPSTREAM_SHA,
                "conditioning": trial.CONDITIONING,
                "model_config": trial.MODEL_CONFIG,
                "loudness_mean": mean, "loudness_std": std,
                "heldout_clips": trial.HELDOUT_RECORDS,
                "selected_crops": EXPECTED_SELECTED,
                "scope": "private_local_r_and_d_only_not_game_output",
            }
            trial._write_json(pending, BINDING_NAME, binding, replace=False)
            trial._fsync_directory(pending)
            if (output_dir / "result").exists():
                raise VibratoError("result_already_committed")
            os.replace(pending, output_dir / "result")
            trial._fsync_directory(output_dir)
            if inspect_current_binding(source_manifest=source_manifest, split_manifest=split_manifest,
                    label_zip=label_zip, upstream_root=upstream_root,
                    checkpoint_dir=checkpoint_dir, output_dir=output_dir,
                    _already_locked=True) != "complete_bound_to_checkpoint":
                raise VibratoError("binding_self_check_failed")
            return {"status": "complete_bound_to_checkpoint",
                    "heldout_clips": trial.HELDOUT_RECORDS,
                    "selected_crops": EXPECTED_SELECTED,
                    "private_pairs": len(pair_payloads) // 2}
    except VibratoError:
        raise
    except Exception as exc:
        raise VibratoError("private_evaluation_internal_error") from exc


def inspect_current_binding(*, source_manifest: Path, split_manifest: Path, label_zip: Path,
                            upstream_root: Path, checkpoint_dir: Path, output_dir: Path,
                            _already_locked: bool = False) -> str:
    """Rehash every private input and exact result bytes; never imply completion if unbound."""
    def check() -> str:
        pilot._private_dir(output_dir)
        result_dir = output_dir / "result"
        if not result_dir.exists():
            return "incomplete_unbound"
        pilot._private_dir(result_dir)
        binding, _ = _private_json(result_dir / BINDING_NAME)
        report, report_sha = _private_json(result_dir / REPORT_NAME)
        selection, selection_sha = _private_json(output_dir / SELECTION_NAME)
        if (binding.get("schema") != SCHEMA or binding.get("status") != "complete_bound_to_checkpoint"
                or report.get("schema") != SCHEMA or report.get("status") != "heldout_vb01_reproduction_evaluated"
                or selection.get("schema") != SELECTION_SCHEMA
                or binding.get("reproduction_report_sha256") != report_sha
                or binding.get("selection_sha256") != selection_sha):
            return "binding_invalid"
        selection_counts = selection.get("counts")
        if (not isinstance(selection_counts, dict)
                or selection_counts.get("heldout_clips") != trial.HELDOUT_RECORDS
                or selection_counts.get("selected_clips") != EXPECTED_SELECTED
                or selection_counts.get("vb01_labels") != EXPECTED_VB01
                or selection_counts.get("eligible_vb01_labels") != EXPECTED_ELIGIBLE
                or not isinstance(selection.get("records"), list)
                or len(selection["records"]) != EXPECTED_SELECTED
                or report.get("heldout_crops_evaluated") != EXPECTED_SELECTED
                or report.get("counts", {}).get("selected_clips") != EXPECTED_SELECTED
                or not isinstance(report.get("heldout_song_group_aggregates"), list)
                or len(report["heldout_song_group_aggregates"]) != trial.HELDOUT_SONGS):
            return "binding_pair_or_population_mismatch"
        source, source_sha, split, split_sha, _, _ = trial._private_inputs(
            source_manifest, split_manifest, output_dir, upstream_root)
        trial.validate_documents(source, source_sha, split)
        label_sha = _label_sha(label_zip)
        if any(binding.get(key) != value for key, value in (
            ("source_manifest_sha256", source_sha), ("split_manifest_sha256", split_sha),
            ("label_zip_sha256", label_sha), ("evaluation_script_sha256", _script_sha(Path(__file__))),
            ("audit_script_sha256", _script_sha(Path(audit.__file__))),
            ("binding_helper_sha256", _script_sha(Path(bound.__file__))),
            ("feature_sha256", trial._verify_feature_version()),
            ("upstream_commit", pilot.UPSTREAM_SHA),
        )):
            return "binding_input_mismatch"
        if any(value.get(key) != binding.get(key) for value in (selection, report)
               for key in ("source_manifest_sha256", "split_manifest_sha256",
                           "label_zip_sha256", "feature_sha256")):
            return "binding_input_mismatch"
        pilot._verify_upstream(upstream_root)
        checkpoint = bound._checkpoint_snapshot(checkpoint_dir)
        contract = bound._checkpoint_contract(checkpoint["_path"])
        bound._verify_contract(contract, source_sha=source_sha, split_sha=split_sha)
        training_report_sha = bound._verify_training_report(checkpoint_dir, contract)
        if any(binding.get(key) != value for key, value in (
            ("checkpoint_marker_sha256", checkpoint["marker_sha256"]),
            ("checkpoint_sha256", checkpoint["checkpoint_sha256"]),
            ("checkpoint_bytes", checkpoint["checkpoint_bytes"]),
            ("training_report_sha256", training_report_sha),
            ("training_script_sha256", contract["script_sha256"]),
            ("dataset_digest", contract["dataset_digest"]),
            ("conditioning", contract["conditioning"]),
            ("model_config", contract["model_config"]),
            ("loudness_mean", contract["loudness_mean"]),
            ("loudness_std", contract["loudness_std"]),
        )):
            return "binding_checkpoint_mismatch"
        pair_count = sum(note.get("status") == "saved" for note in report.get("private_pair_notes", []))
        if (type(pair_count) is not int or not 0 <= pair_count <= PAIR_TARGET_SONGS
                or binding.get("selected_crops") != EXPECTED_SELECTED
                or binding.get("heldout_clips") != trial.HELDOUT_RECORDS
                or binding.get("private_pair_wav_digests") != bound._pair_digests(result_dir, pair_count)):
            return "binding_pair_or_population_mismatch"
        return "complete_bound_to_checkpoint"
    try:
        if _already_locked:
            return check()
        with trial._exclusive_private_lock(checkpoint_dir):
            return check()
    except Exception:
        return "binding_invalid"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    for name in ("evaluate-and-bind", "inspect"):
        command = sub.add_parser(name)
        command.add_argument("--source-manifest", type=Path, required=True)
        command.add_argument("--split-manifest", type=Path, required=True)
        command.add_argument("--label-zip", type=Path, required=True)
        command.add_argument("--upstream-root", type=Path, required=True)
        command.add_argument("--checkpoint-dir", type=Path, required=True)
        command.add_argument("--output-dir", type=Path, required=True)
        if name == "evaluate-and-bind":
            command.add_argument("--minutes", type=int, default=MAX_MINUTES)
    args = parser.parse_args()
    kwargs = {name: getattr(args, name) for name in (
        "source_manifest", "split_manifest", "label_zip", "upstream_root",
        "checkpoint_dir", "output_dir")}
    if args.action == "inspect":
        print(json.dumps({"status": inspect_current_binding(**kwargs)}))
        return
    try:
        result = evaluate_and_bind(**kwargs, minutes=args.minutes)
    except VibratoError as exc:
        print(json.dumps({"status": "incomplete_unbound", "reason": str(exc)}))
        raise SystemExit(2) from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
