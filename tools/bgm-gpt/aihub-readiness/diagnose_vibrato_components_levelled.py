#!/usr/bin/env python3
"""Level-controlled follow-up to the immutable VB01 component diagnosis.

The frozen 1,000-step model is rerun on the same 24 held-out crops and seeds.
Component waveforms are RMS-matched to their own source crop *in memory only*
for a second YIN reading. The raw full output and first component report are
separately replayed and SHA-bound. No audio, F0 trace, event time, or source
filename is written or printed. Level matching is a diagnostic, not a new
model, listening master, or proof that a component sounds natural.
"""

from __future__ import annotations

import argparse
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
import diagnose_vibrato_components as components
import mac_mps_ddsp_long_trial as trial
import mac_mps_ddsp_pilot as pilot


SCHEMA = "mini.aihub-71470-vb01-components-levelled.v1"
REPORT_NAME = "levelled_component_report.json"
BINDING_NAME = "checkpoint_binding.json"
MAX_GAIN = 64.0
MAX_PEAK = 0.95


class LevelledError(Exception):
    """Fixed non-private error code."""


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _private_json(path: Path) -> tuple[dict[str, Any], str]:
    return bound._json_private(path, max_bytes=vb.MAX_REPORT_BYTES)


def _rms(audio: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.asarray(audio, dtype=np.float64) ** 2)))


def _analysis_match(source: np.ndarray, component: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """RMS matching for F0 analysis only, with explicit cap/peak disclosure."""
    if source.shape != component.shape or source.shape != (pilot.WINDOW_SAMPLES,):
        raise LevelledError("analysis_level_shape")
    target = _rms(source)
    original = _rms(component)
    peak = float(np.max(np.abs(component)))
    if not all(math.isfinite(value) for value in (target, original, peak)) or target < 1e-8:
        raise LevelledError("analysis_level_invalid")
    if original < 1e-10 or peak < 1e-10:
        return component.copy(), {"gain": 1.0, "matched": False, "limit": "near_zero_component",
                                   "difference_after_db": None}
    requested = target / original
    peak_limit = MAX_PEAK / peak
    gain = min(requested, MAX_GAIN, peak_limit)
    if gain <= 0 or not math.isfinite(gain):
        raise LevelledError("analysis_level_invalid")
    result = (component * gain).astype(np.float32)
    difference = 20 * math.log10(max(_rms(result), 1e-12) / target)
    limit = ("target" if gain >= requested * (1 - 1e-9)
             else "gain_cap" if MAX_GAIN <= peak_limit else "peak_cap")
    return result, {"gain": gain, "matched": abs(difference) <= 0.1,
                    "limit": limit, "difference_after_db": difference}


def _impulse_summary(model, torch) -> dict[str, float]:
    """Frequency response of the checkpoint's actual unnormalized reverb IR."""
    with torch.no_grad():
        impulse = model.reverb.build_impulse().detach().cpu().numpy().reshape(-1)
        wet = float(torch.sigmoid(model.reverb.wet).item())
    if impulse.size != pilot.SAMPLE_RATE or not np.all(np.isfinite(impulse)):
        raise LevelledError("reverb_impulse_invalid")
    response = np.abs(np.fft.rfft(impulse, n=32_768))
    response_db = 20 * np.log10(np.maximum(response, 1e-12))
    return {
        "impulse_l2_gain_db": round(20 * math.log10(max(float(np.linalg.norm(impulse)), 1e-12)), 4),
        "frequency_magnitude_db_p10": round(float(np.quantile(response_db, 0.10)), 4),
        "frequency_magnitude_db_median": round(float(np.median(response_db)), 4),
        "frequency_magnitude_db_p90": round(float(np.quantile(response_db, 0.90)), 4),
        "frequency_magnitude_db_max": round(float(np.max(response_db)), 4),
        "learned_wet_sigmoid": round(wet, 6),
        "impulse_first_sample": round(float(impulse[0]), 6),
    }


def _summarize(rows: list[dict[str, Any]], *, prior_vb: dict[str, Any],
               original_component: dict[str, Any], impulse: dict[str, Any],
               elapsed: float) -> dict[str, Any]:
    if len(rows) != vb.EXPECTED_SELECTED:
        raise LevelledError("denominator_incomplete")
    raw = components._aggregate(
        [{"song_index": row["song_index"], "tracks": row["raw"]} for row in rows],
        prior_report=prior_vb, elapsed=elapsed)
    # A second exact replay check protects the first diagnostic from a changed
    # hook/crop/checkpoint even though its current SHA is separately verified.
    if (raw["tracks"] != original_component["tracks"]
            or raw["paired_same_crops"] != original_component["paired_same_crops"]
            or raw["heldout_song_group_aggregates"] != original_component["heldout_song_group_aggregates"]):
        raise LevelledError("original_component_replay_mismatch")
    input_positive = [row for row in rows if row["raw"]["input_16k"]["state"] == "modulated"]
    tracks = {}
    for name in components.OUTPUT_TRACKS:
        metrics = [row["levelled"][name] for row in rows]
        selected = [row["levelled"][name] for row in input_positive]
        levels = [row["gain"][name] for row in rows]
        ratios = [m["amplitude_cents"] / row["raw"]["input_16k"]["amplitude_cents"]
                  for row in input_positive for m in (row["levelled"][name],)
                  if m["state"] != "indeterminate" and m["amplitude_cents"] is not None
                  and row["raw"]["input_16k"]["amplitude_cents"]]
        tracks[name] = {
            "all_24_states": dict(sorted({state: sum(item["state"] == state for item in metrics)
                                          for state in ("modulated", "not_modulated", "indeterminate")}.items())),
            "input_positive_20_strict_reproduced": sum(item["state"] == "modulated" for item in selected),
            "input_positive_20_determinate": sum(item["state"] != "indeterminate" for item in selected),
            "input_positive_20_amplitude_ratio_median_determinate": components._median(ratios),
            "central_eroded_voiced_fraction_median": components._median([item["voiced_fraction"] for item in metrics]),
            "central_periodicity_proxy_median": components._median([
                item["periodicity_proxy"] for item in metrics if item["periodicity_proxy"] is not None]),
            "periodicity_proxy_available_crops": sum(item["periodicity_proxy"] is not None for item in metrics),
            "median_absolute_f0_error_cents_median": components._median([
                item["median_absolute_f0_error_cents"] for item in metrics
                if item["median_absolute_f0_error_cents"] is not None]),
            "matched_to_source_rms_crops": sum(level["matched"] for level in levels),
            "gain_db_median": components._median([20 * math.log10(level["gain"]) for level in levels]),
            "gain_db_p10": round(float(np.quantile([20 * math.log10(level["gain"]) for level in levels], 0.1)), 4),
            "gain_db_p90": round(float(np.quantile([20 * math.log10(level["gain"]) for level in levels], 0.9)), 4),
            "gain_limited_count": sum(level["limit"] != "target" for level in levels),
            "raw_whole_rms_minus_source_db_median": raw["tracks"][name]["raw_whole_rms_minus_input_db_median"],
            "levelled_whole_rms_minus_source_db_median": components._median([
                level["difference_after_db"] for level in levels if level["difference_after_db"] is not None]),
        }
    pre_to_full_db = [row["raw"]["full_with_reverb"]["raw_whole_rms_dbfs"] -
                      row["raw"]["harmonic_plus_noise"]["raw_whole_rms_dbfs"] for row in rows]
    harmonic_to_pre_db = [row["raw"]["harmonic_plus_noise"]["raw_whole_rms_dbfs"] -
                          row["raw"]["harmonic_only"]["raw_whole_rms_dbfs"] for row in rows]
    groups = []
    for ordinal, song in enumerate(sorted({row["song_index"] for row in rows}), start=1):
        group = [row for row in rows if row["song_index"] == song]
        groups.append({
            "heldout_song_ordinal": ordinal, "selected_crops": len(group),
            "input_positive": sum(row["raw"]["input_16k"]["state"] == "modulated" for row in group),
            "harmonic_levelled_strict": sum(row["levelled"]["harmonic_only"]["state"] == "modulated" for row in group),
            "pre_reverb_levelled_strict": sum(row["levelled"]["harmonic_plus_noise"]["state"] == "modulated" for row in group),
            "full_levelled_strict": sum(row["levelled"]["full_with_reverb"]["state"] == "modulated" for row in group),
            "pre_to_full_rms_gain_db_median": components._median([
                row["raw"]["full_with_reverb"]["raw_whole_rms_dbfs"] -
                row["raw"]["harmonic_plus_noise"]["raw_whole_rms_dbfs"] for row in group]),
        })
    return {
        "schema": SCHEMA, "status": "levelled_component_diagnostic_complete",
        "scope": "analysis_only_rms_matching_in_memory_no_audio_output_no_training",
        "selected_crops": len(rows), "input_positive_crops": len(input_positive),
        "raw_full_replay": raw["replay_of_existing_full"],
        "raw_component_replay_exact": True,
        "levelled_tracks": tracks,
        "raw_same_forward_rms_gain_db": {
            "harmonic_to_harmonic_plus_noise_p10": round(float(np.quantile(harmonic_to_pre_db, 0.1)), 4),
            "harmonic_to_harmonic_plus_noise_median": components._median(harmonic_to_pre_db),
            "harmonic_to_harmonic_plus_noise_p90": round(float(np.quantile(harmonic_to_pre_db, 0.9)), 4),
            "pre_reverb_to_full_p10": round(float(np.quantile(pre_to_full_db, 0.1)), 4),
            "pre_reverb_to_full_median": components._median(pre_to_full_db),
            "pre_reverb_to_full_p90": round(float(np.quantile(pre_to_full_db, 0.9)), 4),
        },
        "reverb_impulse": impulse,
        "heldout_song_group_aggregates": groups,
        "analysis_gain_policy": "each_component_4s_RMS_to_its_same_crop_source_RMS_in_memory; gain<=64; peak<=0.95; raw_full_unchanged",
        "limitations": [
            "level_matching_changes_the_YIN_voicing_gate_not_the_frozen_model_or_its_raw_sound",
            "whole_crop_RMS_matching_does_not_equalize_local_ornament_loudness",
            "periodicity_proxy_is_not_calibrated_pitch_confidence_or_ground_truth",
            "the_reverb_IR_frequency_response_describes_linear_gain_not_perceptual_timbre",
            "noise_and_reverb_contributions_may_interact_so_stage_differences_are_not_causal_attributions",
            "the_24_crops_are_nested_in_four_previously_examined_heldout_songs",
        ],
        "wall_seconds": round(elapsed, 2),
    }


def evaluate_and_bind(*, source_manifest: Path, split_manifest: Path, label_zip: Path,
                      upstream_root: Path, checkpoint_dir: Path, vb_dir: Path,
                      raw_components_dir: Path, output_dir: Path, minutes: int = 30) -> dict[str, Any]:
    if not 1 <= minutes <= 30:
        raise LevelledError("evaluation_limit")
    started = time.monotonic()
    deadline = started + minutes * 60
    try:
        with pilot._network_disabled(), trial._exclusive_private_lock(output_dir), trial._exclusive_private_lock(checkpoint_dir):
            pilot._private_dir(output_dir)
            if set(os.listdir(output_dir)) != {".trial.lock"}:
                raise LevelledError("evaluation_output_not_fresh")
            pilot._check_disjoint_report_dir(output_dir, [source_manifest.parent, split_manifest.parent,
                label_zip.parent, upstream_root, checkpoint_dir, vb_dir, raw_components_dir])
            pilot._check_free_space(output_dir)
            args = dict(source_manifest=source_manifest, split_manifest=split_manifest,
                label_zip=label_zip, upstream_root=upstream_root, checkpoint_dir=checkpoint_dir,
                vb_dir=vb_dir, output_dir=raw_components_dir, _already_locked=True)
            if components.inspect_current_binding(**args) != "complete_bound_to_checkpoint":
                raise LevelledError("raw_component_binding_invalid")
            selection, selection_sha = _private_json(vb_dir / vb.SELECTION_NAME)
            prior_vb, prior_vb_sha = _private_json(vb_dir / "result" / vb.REPORT_NAME)
            original_component, original_component_sha = _private_json(raw_components_dir / "result" / components.REPORT_NAME)
            _, raw_component_binding_sha = _private_json(raw_components_dir / "result" / components.BINDING_NAME)
            source, source_sha, split, split_sha, _, heldout_dir = trial._private_inputs(
                source_manifest, split_manifest, output_dir, upstream_root)
            _, heldout_records = trial.validate_documents(source, source_sha, split)
            before = bound._checkpoint_snapshot(checkpoint_dir)
            contract = bound._checkpoint_contract(before["_path"])
            bound._verify_contract(contract, source_sha=source_sha, split_sha=split_sha)
            training_report_sha = bound._verify_training_report(checkpoint_dir, contract)
            script_shas = {name: _sha(path) for name, path in (
                ("levelled", Path(__file__)), ("raw_components", Path(components.__file__)),
                ("prior_vb", Path(vb.__file__)), ("training", Path(trial.__file__)),
                ("binding_helper", Path(bound.__file__)),
            )}
            torch, DDSP, _, _ = trial._mac_mps_gate(output_dir, upstream_root)
            import ddsp.model as model_module
            checkpoint = torch.load(before["_path"], map_location="cpu", weights_only=True)
            bound._verify_contract(checkpoint, source_sha=source_sha, split_sha=split_sha)
            model, _ = trial._model_and_optimizer(torch, DDSP)
            model.load_state_dict(checkpoint["model_state"])
            model.eval()
            impulse = _impulse_summary(model, torch)
            mean, std = contract["loudness_mean"], contract["loudness_std"]
            records = {item["output_file"]: item for item in heldout_records}
            rows = []
            for index, selected in enumerate(selection["records"]):
                if time.monotonic() >= deadline:
                    raise LevelledError("evaluation_time_cap")
                pilot._check_free_space(output_dir)
                audio = trial._load_wav(heldout_dir, records[selected["output_file"]])
                frame_start = selected["crop_start_frame_100hz"]
                excerpt = audio[frame_start * pilot.BLOCK_SIZE:
                                (frame_start + pilot.WINDOW_FRAMES) * pilot.BLOCK_SIZE]
                midpoint = (selected["event_start_seconds"] + selected["event_end_seconds"]) / 2
                item, source_mod = vb._conditioning(excerpt, frame_start, midpoint)
                if source_mod["state"] != selected["input64_state"]:
                    raise LevelledError("source_conditioning_replay_mismatch")
                _, pitch, loudness, _ = trial._tensors(torch, item, mean, std)
                torch.manual_seed(trial.SEED + 300_000 + index)
                waveforms = components._capture_components(model, model_module, pitch, loudness, torch)
                raw = {"input_16k": components._track_metrics(excerpt, frame_start=frame_start,
                    midpoint=midpoint, input_pitch=item["pitch_hz"], input_mask=item["mask"], is_input=True)}
                levelled, gains = {}, {}
                for name in components.OUTPUT_TRACKS:
                    raw[name] = components._track_metrics(waveforms[name], frame_start=frame_start,
                        midpoint=midpoint, input_pitch=item["pitch_hz"], input_mask=item["mask"])
                    aligned, gain = _analysis_match(excerpt, waveforms[name])
                    levelled[name] = components._track_metrics(aligned, frame_start=frame_start,
                        midpoint=midpoint, input_pitch=item["pitch_hz"], input_mask=item["mask"])
                    gains[name] = gain
                rows.append({"song_index": selected["song_index"], "raw": raw,
                             "levelled": levelled, "gain": gains})

            report = _summarize(rows, prior_vb=prior_vb, original_component=original_component,
                impulse=impulse, elapsed=time.monotonic() - started)
            if (components.inspect_current_binding(**args) != "complete_bound_to_checkpoint"
                    or _sha(vb_dir / vb.SELECTION_NAME) != selection_sha
                    or _sha(vb_dir / "result" / vb.REPORT_NAME) != prior_vb_sha
                    or _sha(raw_components_dir / "result" / components.REPORT_NAME) != original_component_sha
                    or _sha(raw_components_dir / "result" / components.BINDING_NAME) != raw_component_binding_sha
                    or any(_sha(path) != script_shas[name] for name, path in (
                        ("levelled", Path(__file__)), ("raw_components", Path(components.__file__)),
                        ("prior_vb", Path(vb.__file__)), ("training", Path(trial.__file__)),
                        ("binding_helper", Path(bound.__file__))))):
                raise LevelledError("private_inputs_changed_during_diagnostic")
            after = bound._checkpoint_snapshot(checkpoint_dir)
            bound._same_checkpoint(before, after)
            if bound._verify_training_report(checkpoint_dir, contract) != training_report_sha:
                raise LevelledError("training_report_changed_during_diagnostic")
            pilot._check_free_space(output_dir)
            pending = Path(tempfile.mkdtemp(prefix=".pending_levelled_", dir=output_dir))
            pending.chmod(0o700)
            trial._write_json(pending, REPORT_NAME, report, replace=False)
            _, report_sha = _private_json(pending / REPORT_NAME)
            binding = {
                "schema": SCHEMA, "status": "complete_bound_to_checkpoint",
                "source_manifest_sha256": source_sha, "split_manifest_sha256": split_sha,
                "label_zip_sha256": vb._label_sha(label_zip), "selection_sha256": selection_sha,
                "prior_vb_report_sha256": prior_vb_sha,
                "raw_component_report_sha256": original_component_sha,
                "raw_component_binding_sha256": raw_component_binding_sha,
                "checkpoint_marker_sha256": before["marker_sha256"],
                "checkpoint_sha256": before["checkpoint_sha256"],
                "checkpoint_bytes": before["checkpoint_bytes"],
                "training_report_sha256": training_report_sha,
                "levelled_report_sha256": report_sha, "script_sha256": script_shas,
                "feature_sha256": trial.FEATURE_SHA256, "upstream_commit": pilot.UPSTREAM_SHA,
                "model_config": trial.MODEL_CONFIG, "conditioning": trial.CONDITIONING,
                "loudness_mean": mean, "loudness_std": std,
                "selected_crops": vb.EXPECTED_SELECTED,
                "scope": "local_private_r_and_d_only_no_audio_output",
            }
            trial._write_json(pending, BINDING_NAME, binding, replace=False)
            trial._fsync_directory(pending)
            if (output_dir / "result").exists():
                raise LevelledError("result_already_committed")
            os.replace(pending, output_dir / "result")
            trial._fsync_directory(output_dir)
            if inspect_current_binding(source_manifest=source_manifest, split_manifest=split_manifest,
                    label_zip=label_zip, upstream_root=upstream_root, checkpoint_dir=checkpoint_dir,
                    vb_dir=vb_dir, raw_components_dir=raw_components_dir, output_dir=output_dir,
                    _already_locked=True) != "complete_bound_to_checkpoint":
                raise LevelledError("binding_self_check_failed")
            return {"status": "complete_bound_to_checkpoint", "selected_crops": vb.EXPECTED_SELECTED,
                    "raw_full_reproduced": True}
    except LevelledError:
        raise
    except Exception as exc:
        raise LevelledError("private_levelled_diagnostic_internal_error") from exc


def inspect_current_binding(*, source_manifest: Path, split_manifest: Path, label_zip: Path,
                            upstream_root: Path, checkpoint_dir: Path, vb_dir: Path,
                            raw_components_dir: Path, output_dir: Path,
                            _already_locked: bool = False) -> str:
    def check() -> str:
        if components.inspect_current_binding(source_manifest=source_manifest,
                split_manifest=split_manifest, label_zip=label_zip,
                upstream_root=upstream_root, checkpoint_dir=checkpoint_dir,
                vb_dir=vb_dir, output_dir=raw_components_dir,
                _already_locked=True) != "complete_bound_to_checkpoint":
            return "raw_component_binding_invalid"
        pilot._private_dir(output_dir)
        result = output_dir / "result"
        if not result.exists():
            return "incomplete_unbound"
        pilot._private_dir(result)
        report, report_sha = _private_json(result / REPORT_NAME)
        binding, _ = _private_json(result / BINDING_NAME)
        _, selection_sha = _private_json(vb_dir / vb.SELECTION_NAME)
        _, prior_vb_sha = _private_json(vb_dir / "result" / vb.REPORT_NAME)
        _, raw_component_sha = _private_json(raw_components_dir / "result" / components.REPORT_NAME)
        _, raw_binding_sha = _private_json(raw_components_dir / "result" / components.BINDING_NAME)
        source, source_sha, split, split_sha, _, _ = trial._private_inputs(
            source_manifest, split_manifest, output_dir, upstream_root)
        trial.validate_documents(source, source_sha, split)
        checkpoint = bound._checkpoint_snapshot(checkpoint_dir)
        contract = bound._checkpoint_contract(checkpoint["_path"])
        bound._verify_contract(contract, source_sha=source_sha, split_sha=split_sha)
        expected = {
            "source_manifest_sha256": source_sha, "split_manifest_sha256": split_sha,
            "label_zip_sha256": vb._label_sha(label_zip), "selection_sha256": selection_sha,
            "prior_vb_report_sha256": prior_vb_sha,
            "raw_component_report_sha256": raw_component_sha,
            "raw_component_binding_sha256": raw_binding_sha,
            "checkpoint_marker_sha256": checkpoint["marker_sha256"],
            "checkpoint_sha256": checkpoint["checkpoint_sha256"],
            "checkpoint_bytes": checkpoint["checkpoint_bytes"],
            "training_report_sha256": bound._verify_training_report(checkpoint_dir, contract),
            "levelled_report_sha256": report_sha,
            "script_sha256": {name: _sha(path) for name, path in (
                ("levelled", Path(__file__)), ("raw_components", Path(components.__file__)),
                ("prior_vb", Path(vb.__file__)), ("training", Path(trial.__file__)),
                ("binding_helper", Path(bound.__file__)))},
            "feature_sha256": trial._verify_feature_version(),
            "upstream_commit": pilot.UPSTREAM_SHA,
            "model_config": contract["model_config"], "conditioning": contract["conditioning"],
            "loudness_mean": contract["loudness_mean"], "loudness_std": contract["loudness_std"],
            "selected_crops": vb.EXPECTED_SELECTED,
        }
        if (binding.get("schema") != SCHEMA or binding.get("status") != "complete_bound_to_checkpoint"
                or report.get("schema") != SCHEMA or report.get("status") != "levelled_component_diagnostic_complete"
                or report.get("selected_crops") != vb.EXPECTED_SELECTED
                or report.get("input_positive_crops") != 20
                or report.get("raw_component_replay_exact") is not True
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
        command.add_argument("--raw-components-dir", type=Path, required=True)
        command.add_argument("--output-dir", type=Path, required=True)
        if name == "evaluate-and-bind":
            command.add_argument("--minutes", type=int, default=30)
    args = parser.parse_args()
    kwargs = {name: getattr(args, name) for name in (
        "source_manifest", "split_manifest", "label_zip", "upstream_root",
        "checkpoint_dir", "vb_dir", "raw_components_dir", "output_dir")}
    if args.action == "inspect":
        print(json.dumps({"status": inspect_current_binding(**kwargs)}))
        return
    try:
        result = evaluate_and_bind(**kwargs, minutes=args.minutes)
    except LevelledError as exc:
        print(json.dumps({"status": "incomplete_unbound", "reason": str(exc)}))
        raise SystemExit(2) from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
