#!/usr/bin/env python3
"""Local-only, checkpoint-bound decomposition of the frozen VB01 reconstructions.

The 24 source-selected crops, conditioning, model, and per-crop noise seeds are
identical to bound_heldout_vibrato.py. A temporary forward hook captures the
harmonic oscillator before noise and the harmonic+noise signal before reverb;
the ordinary full model output is captured in the same forward call. Nothing
is trained, no audio is saved, and no private filename or event time is printed.
The periodicity statistic is an autocorrelation heuristic, not calibrated F0
confidence or proof of authentic daegeum vibrato.
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

import bound_heldout_evaluation as bound
import bound_heldout_vibrato as vb
import mac_mps_ddsp_long_trial as trial
import mac_mps_ddsp_pilot as pilot
from mac_mps_ddsp_features import extract_features


SCHEMA = "mini.aihub-71470-vb01-component-diagnostic.v1"
REPORT_NAME = "component_report.json"
BINDING_NAME = "checkpoint_binding.json"
MAX_MINUTES = 30
TRACKS = ("input_16k", "harmonic_only", "harmonic_plus_noise", "full_with_reverb")
OUTPUT_TRACKS = TRACKS[1:]


class ComponentError(Exception):
    """Fixed error code safe to print without revealing a private path."""


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _read_private(path: Path) -> tuple[dict[str, Any], str]:
    return bound._json_private(path, max_bytes=vb.MAX_REPORT_BYTES)


def _capture_components(model, model_module, pitch, loudness, torch) -> dict[str, Any]:
    """Observe, but do not replace, the pinned model's normal forward result."""
    caught: dict[str, Any] = {}
    original_harmonic = model_module.harmonic_synth

    def harmonic_hook(*args, **kwargs):
        signal = original_harmonic(*args, **kwargs)
        caught["harmonic_only"] = signal
        return signal

    def reverb_input_hook(_module, inputs):
        if len(inputs) != 1:
            raise ComponentError("reverb_hook_shape")
        caught["harmonic_plus_noise"] = inputs[0]

    handle = model.reverb.register_forward_pre_hook(reverb_input_hook)
    model_module.harmonic_synth = harmonic_hook
    try:
        with torch.no_grad():
            caught["full_with_reverb"] = model(pitch, loudness)
    finally:
        model_module.harmonic_synth = original_harmonic
        handle.remove()
    shape = (1, pilot.WINDOW_SAMPLES, 1)
    if (set(caught) != set(OUTPUT_TRACKS)
            or any(value.shape != shape or value.device.type != "mps"
                   or not torch.isfinite(value).all().item() for value in caught.values())):
        raise ComponentError("component_capture_invalid")
    return {name: value.detach().cpu().numpy().reshape(-1) for name, value in caught.items()}


def _periodicity_at_measured_f0(audio: np.ndarray, pitch: np.ndarray,
                                mask: np.ndarray, middle: np.ndarray) -> float | None:
    """Median 64-ms normalized lag correlation at each YIN-selected pitch.

    This is a periodicity *proxy*, not a probability of a correct F0: octave
    mistakes and cleaner synthetic harmonics may also yield high correlation.
    """
    if audio.shape != (pilot.WINDOW_SAMPLES,) or any(
            value.shape != (pilot.WINDOW_FRAMES,) for value in (pitch, mask, middle)):
        raise ComponentError("periodicity_shape")
    width = 1024
    padded = np.pad(np.asarray(audio, dtype=np.float64), (width // 2, width // 2), mode="reflect")
    values = []
    for frame in np.flatnonzero(mask & middle):
        f0 = float(pitch[frame])
        if not math.isfinite(f0) or f0 <= 0:
            continue
        lag = round(pilot.SAMPLE_RATE / f0)
        if not 2 <= lag < width // 2:
            continue
        window = padded[frame * pilot.BLOCK_SIZE:frame * pilot.BLOCK_SIZE + width]
        left, right = window[:-lag], window[lag:]
        denominator = math.sqrt(float(np.dot(left, left) * np.dot(right, right)))
        if denominator > 1e-12:
            values.append(float(np.dot(left, right)) / denominator)
    return float(np.median(values)) if values else None


def _track_metrics(audio: np.ndarray, *, frame_start: int, midpoint: float,
                   input_pitch: np.ndarray, input_mask: np.ndarray,
                   is_input: bool = False) -> dict[str, Any]:
    features = extract_features(audio)
    mask = vb._erode_voicing(features["voiced_mask"])
    middle = vb._center_indices(frame_start, midpoint)
    times = (frame_start + np.arange(pilot.WINDOW_FRAMES)) / 100.0
    measured_pitch = features["pitch_hz"]
    if is_input:
        # The model receives the two-neighbour-eroded pitch, not raw YIN F0.
        measured_pitch = input_pitch
        mask = input_mask
    modulation = vb._modulation(measured_pitch[middle], mask[middle], times[middle])
    common, f0_error, longest_gap = vb._f0_comparison(
        input_pitch, input_mask, measured_pitch, mask, middle)
    rms = float(np.sqrt(np.mean(np.asarray(audio, dtype=np.float64) ** 2)))
    return {
        "state": modulation["state"],
        "amplitude_cents": modulation.get("amplitude_cents"),
        "frequency_hz": modulation.get("frequency_hz"),
        "voiced_fraction": float(np.mean(mask[middle])),
        "common_input_voiced_frames": common,
        "median_absolute_f0_error_cents": f0_error,
        "longest_input_voiced_pitch_gap_frames": longest_gap,
        "periodicity_proxy": _periodicity_at_measured_f0(audio, measured_pitch, mask, middle),
        "raw_whole_rms_dbfs": 20.0 * math.log10(max(rms, 1e-12)),
    }


def _median(values: list[float]) -> float | None:
    return round(float(np.median(values)), 4) if values else None


def _aggregate(rows: list[dict[str, Any]], *, prior_report: dict[str, Any],
               elapsed: float) -> dict[str, Any]:
    if len(rows) != vb.EXPECTED_SELECTED:
        raise ComponentError("component_denominator_incomplete")
    input_positive = [row for row in rows if row["tracks"]["input_16k"]["state"] == "modulated"]
    if len(input_positive) != prior_report["counts"]["input64_positive_evaluated"]:
        raise ComponentError("input_replay_mismatch")
    full_positive = sum(row["tracks"]["full_with_reverb"]["state"] == "modulated"
                        for row in input_positive)
    if full_positive != prior_report["counts"]["input64_positive_output64_positive"]:
        raise ComponentError("full_replay_mismatch")
    prior_ratios = []
    for row in input_positive:
        input_amp = row["tracks"]["input_16k"]["amplitude_cents"]
        full = row["tracks"]["full_with_reverb"]
        if full["state"] == "modulated" and input_amp and full["amplitude_cents"] is not None:
            prior_ratios.append(full["amplitude_cents"] / input_amp)
    if _median(prior_ratios) != prior_report["input64_output64_amplitude_ratio_median_when_both_strict"]:
        raise ComponentError("full_replay_amplitude_mismatch")

    tracks = {}
    for name in TRACKS:
        values = [row["tracks"][name] for row in rows]
        positive = [row["tracks"][name] for row in input_positive]
        all_determinate = [item for item in positive if item["state"] != "indeterminate"
                           and item["amplitude_cents"] is not None]
        ratios = [item["amplitude_cents"] / row["tracks"]["input_16k"]["amplitude_cents"]
                  for row in input_positive for item in (row["tracks"][name],)
                  if item["state"] != "indeterminate" and item["amplitude_cents"] is not None
                  and row["tracks"]["input_16k"]["amplitude_cents"]]
        tracks[name] = {
            "all_24_states": dict(sorted(Counter(item["state"] for item in values).items())),
            "input_positive_20_strict_reproduced": sum(item["state"] == "modulated" for item in positive),
            "input_positive_20_determinate": len(all_determinate),
            "input_positive_20_amplitude_ratio_median_determinate": _median(ratios),
            "central_eroded_voiced_fraction_median": _median([item["voiced_fraction"] for item in values]),
            "central_periodicity_proxy_median": _median([
                item["periodicity_proxy"] for item in values if item["periodicity_proxy"] is not None]),
            "periodicity_proxy_available_crops": sum(item["periodicity_proxy"] is not None for item in values),
            "median_absolute_f0_error_cents_median": _median([
                item["median_absolute_f0_error_cents"] for item in values
                if item["median_absolute_f0_error_cents"] is not None]),
            "raw_whole_rms_minus_input_db_median": _median([
                item["raw_whole_rms_dbfs"] - row["tracks"]["input_16k"]["raw_whole_rms_dbfs"]
                for row, item in zip(rows, values)]),
        }
    common = [row for row in input_positive if all(
        row["tracks"][name]["state"] != "indeterminate"
        and row["tracks"][name]["amplitude_cents"] is not None for name in TRACKS)]
    paired = {"input_positive_20_all_tracks_determinate": len(common)}
    for name in OUTPUT_TRACKS:
        paired[f"{name}_to_input_amplitude_ratio_median_same_crops"] = _median([
            row["tracks"][name]["amplitude_cents"] /
            row["tracks"]["input_16k"]["amplitude_cents"] for row in common])
    paired["full_minus_harmonic_periodicity_proxy_median_same_crops"] = _median([
        row["tracks"]["full_with_reverb"]["periodicity_proxy"] -
        row["tracks"]["harmonic_only"]["periodicity_proxy"] for row in common
        if row["tracks"]["full_with_reverb"]["periodicity_proxy"] is not None
        and row["tracks"]["harmonic_only"]["periodicity_proxy"] is not None])
    paired["harmonic_strict_full_not_strict_count"] = sum(
        row["tracks"]["harmonic_only"]["state"] == "modulated" and
        row["tracks"]["full_with_reverb"]["state"] != "modulated" for row in input_positive)
    paired["harmonic_not_strict_full_strict_count"] = sum(
        row["tracks"]["harmonic_only"]["state"] != "modulated" and
        row["tracks"]["full_with_reverb"]["state"] == "modulated" for row in input_positive)

    groups = []
    for ordinal, song in enumerate(sorted({row["song_index"] for row in rows}), start=1):
        group = [row for row in rows if row["song_index"] == song]
        groups.append({
            "heldout_song_ordinal": ordinal,
            "selected_crops": len(group),
            "input_positive": sum(row["tracks"]["input_16k"]["state"] == "modulated" for row in group),
            "harmonic_strict": sum(row["tracks"]["harmonic_only"]["state"] == "modulated" for row in group),
            "pre_reverb_strict": sum(row["tracks"]["harmonic_plus_noise"]["state"] == "modulated" for row in group),
            "full_strict": sum(row["tracks"]["full_with_reverb"]["state"] == "modulated" for row in group),
        })
    if len(groups) != trial.HELDOUT_SONGS or sum(item["selected_crops"] for item in groups) != len(rows):
        raise ComponentError("song_group_coverage_mismatch")
    return {
        "schema": SCHEMA, "status": "component_diagnostic_complete",
        "scope": "local_private_r_and_d_only_no_new_training_no_game_output",
        "selected_crops": len(rows), "input_positive_crops": len(input_positive),
        "tracks": tracks, "paired_same_crops": paired, "heldout_song_group_aggregates": groups,
        "replay_of_existing_full": {
            "input_positive": len(input_positive), "full_positive_when_input_positive": full_positive,
            "full_to_input_amplitude_ratio_median_both_strict": _median(prior_ratios),
        },
        "source_selection": "exact_prior_24_crop_selection_and_per_crop_seed_no_cherry_pick",
        "periodicity_proxy_definition": "median_64ms_normalized_autocorrelation_at_YIN_selected_lag_on_central_0.5s; not_a_calibrated_pitch_probability",
        "limitations": [
            "harmonic_only_excludes_noise_and_reverb; pre_reverb_adds_seeded_noise; full_adds_reverb",
            "YIN_is_reapplied_to_synthesized_audio_so_measured_amplitude_can_shrink_twice",
            "component_levels_differ_and_a_quiet_component_can_fail_the_YIN_voicing_gate",
            "a_64ms_YIN_error_or_octave_error_can_change_strict_state_without_audible_vibrato_change",
            "24_crops_are_nested_in_only_4_songs_and_were_previously_evaluated",
            "this_does_not_test_when_vibrato_should_be_played_or_timbre_naturalness",
        ],
        "wall_seconds": round(elapsed, 2),
    }


def evaluate_and_bind(*, source_manifest: Path, split_manifest: Path, label_zip: Path,
                      upstream_root: Path, checkpoint_dir: Path, vb_dir: Path,
                      output_dir: Path, minutes: int = MAX_MINUTES) -> dict[str, Any]:
    if not 1 <= minutes <= MAX_MINUTES:
        raise ComponentError("evaluation_limit")
    started = time.monotonic()
    deadline = started + minutes * 60
    try:
        with pilot._network_disabled(), trial._exclusive_private_lock(output_dir), trial._exclusive_private_lock(checkpoint_dir):
            pilot._private_dir(output_dir)
            if set(os.listdir(output_dir)) != {".trial.lock"}:
                raise ComponentError("evaluation_output_not_fresh")
            pilot._check_disjoint_report_dir(output_dir, [source_manifest.parent, split_manifest.parent,
                label_zip.parent, upstream_root, checkpoint_dir, vb_dir])
            pilot._check_free_space(output_dir)
            if vb.inspect_current_binding(source_manifest=source_manifest, split_manifest=split_manifest,
                    label_zip=label_zip, upstream_root=upstream_root, checkpoint_dir=checkpoint_dir,
                    output_dir=vb_dir, _already_locked=True) != "complete_bound_to_checkpoint":
                raise ComponentError("prior_vb_binding_invalid")
            selection, selection_sha = _read_private(vb_dir / vb.SELECTION_NAME)
            previous, previous_sha = _read_private(vb_dir / "result" / vb.REPORT_NAME)
            previous_binding, previous_binding_sha = _read_private(vb_dir / "result" / vb.BINDING_NAME)
            if (selection_sha != previous_binding["selection_sha256"]
                    or previous_sha != previous_binding["reproduction_report_sha256"]
                    or len(selection["records"]) != vb.EXPECTED_SELECTED):
                raise ComponentError("prior_vb_documents_mismatch")
            source, source_sha, split, split_sha, _, heldout_dir = trial._private_inputs(
                source_manifest, split_manifest, output_dir, upstream_root)
            _, heldout_records = trial.validate_documents(source, source_sha, split)
            checkpoint_before = bound._checkpoint_snapshot(checkpoint_dir)
            contract = bound._checkpoint_contract(checkpoint_before["_path"])
            bound._verify_contract(contract, source_sha=source_sha, split_sha=split_sha)
            training_report_sha = bound._verify_training_report(checkpoint_dir, contract)
            trial._verify_feature_version()
            script_shas = {name: _sha(path) for name, path in (
                ("diagnostic", Path(__file__)), ("prior_vb", Path(vb.__file__)),
                ("binding_helper", Path(bound.__file__)), ("training", Path(trial.__file__)),
            )}

            torch, DDSP, _, _ = trial._mac_mps_gate(output_dir, upstream_root)
            import ddsp.model as model_module
            checkpoint = torch.load(checkpoint_before["_path"], map_location="cpu", weights_only=True)
            bound._verify_contract(checkpoint, source_sha=source_sha, split_sha=split_sha)
            model, _ = trial._model_and_optimizer(torch, DDSP)
            model.load_state_dict(checkpoint["model_state"])
            model.eval()
            mean, std = contract["loudness_mean"], contract["loudness_std"]
            by_name = {item["output_file"]: item for item in heldout_records}
            rows = []
            for index, selected in enumerate(selection["records"]):
                if time.monotonic() >= deadline:
                    raise ComponentError("evaluation_time_cap")
                pilot._check_free_space(output_dir)
                record = by_name[selected["output_file"]]
                audio = trial._load_wav(heldout_dir, record)
                frame_start = selected["crop_start_frame_100hz"]
                excerpt = audio[frame_start * pilot.BLOCK_SIZE:
                                (frame_start + pilot.WINDOW_FRAMES) * pilot.BLOCK_SIZE]
                midpoint = (selected["event_start_seconds"] + selected["event_end_seconds"]) / 2
                item, source_mod = vb._conditioning(excerpt, frame_start, midpoint)
                if source_mod["state"] != selected["input64_state"]:
                    raise ComponentError("source_conditioning_replay_mismatch")
                _, pitch, loudness, _ = trial._tensors(torch, item, mean, std)
                torch.manual_seed(trial.SEED + 300_000 + index)
                components = _capture_components(model, model_module, pitch, loudness, torch)
                tracks = {"input_16k": _track_metrics(excerpt, frame_start=frame_start,
                    midpoint=midpoint, input_pitch=item["pitch_hz"], input_mask=item["mask"],
                    is_input=True)}
                if tracks["input_16k"]["state"] != source_mod["state"]:
                    raise ComponentError("input_metric_replay_mismatch")
                for name in OUTPUT_TRACKS:
                    tracks[name] = _track_metrics(components[name], frame_start=frame_start,
                        midpoint=midpoint, input_pitch=item["pitch_hz"], input_mask=item["mask"])
                rows.append({"song_index": selected["song_index"], "tracks": tracks})

            report = _aggregate(rows, prior_report=previous, elapsed=time.monotonic() - started)
            # The original 24-crop result, code, source, and tensor bytes must
            # remain unchanged even if the private run took several minutes.
            scripts_unchanged = all(_sha(path) == script_shas[name] for name, path in (
                ("diagnostic", Path(__file__)), ("prior_vb", Path(vb.__file__)),
                ("binding_helper", Path(bound.__file__)), ("training", Path(trial.__file__))))
            if (vb.inspect_current_binding(source_manifest=source_manifest, split_manifest=split_manifest,
                    label_zip=label_zip, upstream_root=upstream_root, checkpoint_dir=checkpoint_dir,
                    output_dir=vb_dir, _already_locked=True) != "complete_bound_to_checkpoint"
                    or _sha(vb_dir / vb.SELECTION_NAME) != selection_sha
                    or _sha(vb_dir / "result" / vb.REPORT_NAME) != previous_sha
                    or _sha(vb_dir / "result" / vb.BINDING_NAME) != previous_binding_sha
                    or not scripts_unchanged):
                raise ComponentError("prior_inputs_changed_during_diagnostic")
            checkpoint_after = bound._checkpoint_snapshot(checkpoint_dir)
            bound._same_checkpoint(checkpoint_before, checkpoint_after)
            if bound._verify_training_report(checkpoint_dir, contract) != training_report_sha:
                raise ComponentError("training_report_changed_during_diagnostic")
            pilot._check_free_space(output_dir)
            pending = Path(tempfile.mkdtemp(prefix=".pending_components_", dir=output_dir))
            pending.chmod(0o700)
            trial._write_json(pending, REPORT_NAME, report, replace=False)
            _, report_sha = _read_private(pending / REPORT_NAME)
            binding = {
                "schema": SCHEMA, "status": "complete_bound_to_checkpoint",
                "source_manifest_sha256": source_sha, "split_manifest_sha256": split_sha,
                "label_zip_sha256": previous_binding["label_zip_sha256"],
                "selection_sha256": selection_sha,
                "prior_reproduction_report_sha256": previous_sha,
                "prior_binding_sha256": previous_binding_sha,
                "checkpoint_marker_sha256": checkpoint_before["marker_sha256"],
                "checkpoint_sha256": checkpoint_before["checkpoint_sha256"],
                "checkpoint_bytes": checkpoint_before["checkpoint_bytes"],
                "training_report_sha256": training_report_sha,
                "component_report_sha256": report_sha,
                "script_sha256": script_shas,
                "feature_sha256": trial.FEATURE_SHA256,
                "upstream_commit": pilot.UPSTREAM_SHA,
                "model_config": trial.MODEL_CONFIG,
                "conditioning": trial.CONDITIONING,
                "loudness_mean": mean, "loudness_std": std,
                "selected_crops": vb.EXPECTED_SELECTED,
                "scope": "local_private_r_and_d_only_no_audio_output",
            }
            trial._write_json(pending, BINDING_NAME, binding, replace=False)
            trial._fsync_directory(pending)
            if (output_dir / "result").exists():
                raise ComponentError("result_already_committed")
            os.replace(pending, output_dir / "result")
            trial._fsync_directory(output_dir)
            if inspect_current_binding(source_manifest=source_manifest, split_manifest=split_manifest,
                    label_zip=label_zip, upstream_root=upstream_root, checkpoint_dir=checkpoint_dir,
                    vb_dir=vb_dir, output_dir=output_dir, _already_locked=True) != "complete_bound_to_checkpoint":
                raise ComponentError("binding_self_check_failed")
            return {"status": "complete_bound_to_checkpoint", "selected_crops": vb.EXPECTED_SELECTED,
                    "input_positive_crops": report["input_positive_crops"]}
    except ComponentError:
        raise
    except Exception as exc:
        raise ComponentError("private_component_diagnostic_internal_error") from exc


def inspect_current_binding(*, source_manifest: Path, split_manifest: Path, label_zip: Path,
                            upstream_root: Path, checkpoint_dir: Path, vb_dir: Path,
                            output_dir: Path, _already_locked: bool = False) -> str:
    def check() -> str:
        if vb.inspect_current_binding(source_manifest=source_manifest, split_manifest=split_manifest,
                label_zip=label_zip, upstream_root=upstream_root, checkpoint_dir=checkpoint_dir,
                output_dir=vb_dir, _already_locked=True) != "complete_bound_to_checkpoint":
            return "prior_vb_binding_invalid"
        pilot._private_dir(output_dir)
        result = output_dir / "result"
        if not result.exists():
            return "incomplete_unbound"
        pilot._private_dir(result)
        report, report_sha = _read_private(result / REPORT_NAME)
        binding, _ = _read_private(result / BINDING_NAME)
        _, selection_sha = _read_private(vb_dir / vb.SELECTION_NAME)
        _, previous_sha = _read_private(vb_dir / "result" / vb.REPORT_NAME)
        _, previous_binding_sha = _read_private(vb_dir / "result" / vb.BINDING_NAME)
        source, source_sha, split, split_sha, _, _ = trial._private_inputs(
            source_manifest, split_manifest, output_dir, upstream_root)
        trial.validate_documents(source, source_sha, split)
        checkpoint = bound._checkpoint_snapshot(checkpoint_dir)
        contract = bound._checkpoint_contract(checkpoint["_path"])
        bound._verify_contract(contract, source_sha=source_sha, split_sha=split_sha)
        expected = {
            "source_manifest_sha256": source_sha, "split_manifest_sha256": split_sha,
            "label_zip_sha256": vb._label_sha(label_zip),
            "selection_sha256": selection_sha,
            "prior_reproduction_report_sha256": previous_sha,
            "prior_binding_sha256": previous_binding_sha,
            "checkpoint_marker_sha256": checkpoint["marker_sha256"],
            "checkpoint_sha256": checkpoint["checkpoint_sha256"],
            "checkpoint_bytes": checkpoint["checkpoint_bytes"],
            "training_report_sha256": bound._verify_training_report(checkpoint_dir, contract),
            "component_report_sha256": report_sha,
            "script_sha256": {name: _sha(path) for name, path in (
                ("diagnostic", Path(__file__)), ("prior_vb", Path(vb.__file__)),
                ("binding_helper", Path(bound.__file__)), ("training", Path(trial.__file__)))},
            "feature_sha256": trial._verify_feature_version(),
            "upstream_commit": pilot.UPSTREAM_SHA,
            "model_config": contract["model_config"], "conditioning": contract["conditioning"],
            "loudness_mean": contract["loudness_mean"], "loudness_std": contract["loudness_std"],
            "selected_crops": vb.EXPECTED_SELECTED,
        }
        if (binding.get("schema") != SCHEMA or binding.get("status") != "complete_bound_to_checkpoint"
                or report.get("schema") != SCHEMA or report.get("status") != "component_diagnostic_complete"
                or report.get("selected_crops") != vb.EXPECTED_SELECTED
                or report.get("input_positive_crops") != 20
                or not isinstance(report.get("heldout_song_group_aggregates"), list)
                or len(report["heldout_song_group_aggregates"]) != trial.HELDOUT_SONGS
                or any(binding.get(key) != value for key, value in expected.items())):
            return "binding_invalid"
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
        command.add_argument("--vb-dir", type=Path, required=True)
        command.add_argument("--output-dir", type=Path, required=True)
        if name == "evaluate-and-bind":
            command.add_argument("--minutes", type=int, default=MAX_MINUTES)
    args = parser.parse_args()
    kwargs = {name: getattr(args, name) for name in (
        "source_manifest", "split_manifest", "label_zip", "upstream_root",
        "checkpoint_dir", "vb_dir", "output_dir")}
    if args.action == "inspect":
        print(json.dumps({"status": inspect_current_binding(**kwargs)}))
        return
    try:
        result = evaluate_and_bind(**kwargs, minutes=args.minutes)
    except ComponentError as exc:
        print(json.dumps({"status": "incomplete_unbound", "reason": str(exc)}))
        raise SystemExit(2) from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
