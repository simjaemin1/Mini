#!/usr/bin/env python3
"""Private new-score trial: ML timbre plus explicit per-note level correction.

This separate R&D route does not pass, relax, or replace the frozen model
validation protocol. A completed child that failed raw internal level gates
may supply timbre, with that failure recorded. Source-supported score pitch
and feature inputs are inherited from a parent-400 fit-only calibration.
One model forward renders the whole new score; 28 steady note RMS readings
set authored gain transitions. No framewise RMS tracking or heldout inference.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
from pathlib import Path
import shutil
import stat
import subprocess
import time

import numpy as np

import bound_v2_dry_diagnostic as diagnostic
import calibrate_v2_score_controls as calibration
import diagnose_ircam_score_loudness as association
import mac_mps_ddsp_long_trial as v1
import mac_mps_ddsp_pilot as pilot
import mac_mps_ddsp_v2_continuation as child
import mac_mps_ddsp_v2_dry_trial as v2
import render_v2_private_score as score_renderer
import score_ircam_conditioning_adapter as adapter


SCHEMA = "mini.aihub-71470-v2-level-calibrated-new-score-trial.v1"
REPORT_NAME = "level_calibrated_composition_report.json"
MAX_NOTE_GAIN_DB = 12.0
GAIN_TRANSITION_SECONDS = 0.080
MIN_STEADY_SECONDS = 0.080
MAX_MINUTES = 10
SEED = 71474
PITCH_CHECK_NAMES = ("steady_pitch_coverage", "steady_pitch_accuracy", "each_note_pitch_coverage_and_accuracy",
                     "slur_output_short_window_target", "exact_written_rests")


class CompositionError(Exception):
    """Fixed non-private reason suitable for CLI output."""


def _hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _json_bytes(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, indent=2, allow_nan=False).encode() + b"\n"


def note_level_plan(raw: np.ndarray, compiled: dict, anchor_db: float) -> dict:
    """One gain per note, fit from steady raw audio; never from corrected RMS."""
    if raw.shape != (307_200,) or not np.all(np.isfinite(raw)) or not math.isfinite(anchor_db):
        raise CompositionError("raw_full_score_or_anchor_invalid")
    rows = []
    for index, event in enumerate(compiled["events"]):
        if event["articulation"] == "release":
            continue
        start = math.ceil((float(event["start_seconds"]) + 0.100) * 16_000)
        end = math.floor((float(event["end_seconds"]) - 0.070) * 16_000)
        if end - start < round(MIN_STEADY_SECONDS * 16_000):
            raise CompositionError("note_has_insufficient_steady_gain_context")
        rms = float(np.sqrt(np.mean(raw[start:end].astype(np.float64) ** 2)))
        db = 20 * math.log10(max(rms, 1e-12))
        requested = anchor_db - db
        rows.append({"event_index": index, "event_id": event["id"],
                     "steady_start_sample_16k": start, "steady_end_sample_16k": end,
                     "raw_steady_rms_dbfs": db, "target_rms_dbfs": anchor_db,
                     "requested_gain_db": requested, "gain_within_limit": abs(requested) <= MAX_NOTE_GAIN_DB})
    maximum = max((abs(row["requested_gain_db"]) for row in rows), default=float("inf"))
    return {"notes": rows, "note_count": len(rows), "maximum_requested_abs_gain_db": maximum,
            "minimum_gain_db": min(row["requested_gain_db"] for row in rows),
            "maximum_gain_db": max(row["requested_gain_db"] for row in rows),
            "all_note_gains_within_limit": len(rows) == 28 and all(row["gain_within_limit"] for row in rows),
            "gain_limit_db": MAX_NOTE_GAIN_DB, "rms_method": "whole raw waveform RMS from note+100ms through note_end-70ms"}


def note_gain_curve(compiled: dict, plan: dict) -> np.ndarray:
    if plan.get("all_note_gains_within_limit") is not True:
        raise CompositionError("required_note_gain_exceeds_12db")
    times = np.arange(307_200, dtype=np.float64) / 16_000
    curve_db = np.zeros(307_200, dtype=np.float64)
    by_index = {row["event_index"]: row for row in plan["notes"]}
    previous_gain = None
    previous_kind = None
    for index, event in enumerate(compiled["events"]):
        start, end = float(event["start_seconds"]), float(event["end_seconds"])
        mask = (times >= start) & (times < end)
        if event["articulation"] == "release":
            curve_db[mask] = previous_gain if previous_gain is not None else 0
        else:
            target = by_index[index]["requested_gain_db"]
            if previous_gain is None or previous_kind == "release":
                curve_db[mask] = target
            else:
                progress = np.clip((times[mask] - start) / GAIN_TRANSITION_SECONDS, 0, 1)
                ease = progress ** 3 * (10 + progress * (-15 + 6 * progress))
                curve_db[mask] = previous_gain + ease * (target - previous_gain)
            previous_gain = target
        previous_kind = event["articulation"]
    if not np.all(np.isfinite(curve_db)) or np.max(np.abs(curve_db)) > MAX_NOTE_GAIN_DB + 1e-6:
        raise CompositionError("note_gain_curve_limit_failed")
    return np.power(10.0, curve_db / 20.0).astype(np.float32)


def composition_gate(raw_metrics: dict, corrected_metrics: dict, plan: dict,
                     corrected: np.ndarray) -> dict:
    raw_checks = raw_metrics.get("checks", {})
    corrected_checks = corrected_metrics.get("checks", {})
    checks = {"raw_pitch_and_slur_not_hidden_by_gain": all(raw_checks.get(key) is True for key in PITCH_CHECK_NAMES),
              "corrected_pitch_slur_levels_and_rests": corrected_metrics.get("numerically_eligible_for_local_score_preview") is True,
              "note_correction_within_12db": plan.get("all_note_gains_within_limit") is True,
              "corrected_waveform_finite": bool(np.all(np.isfinite(corrected))),
              "corrected_peak_before_preview_gain": float(np.max(np.abs(corrected))) <= 0.90}
    return {"eligible_for_private_composition_preview": bool(all(checks.values())), "checks": checks,
            "raw_internal_model_validation_passed_by_this_tool": False,
            "raw_model_level_learning_success_claimed": False,
            "level_correction_is_explicit_post_synthesis_authoring": True}


def trial_child_snapshot(folder: Path) -> dict:
    """Completed internal-selected child snapshot, without a feasibility claim."""
    calibration.approved_private_path(folder, directory=True)
    report, report_sha = pilot._read_json(folder / child.REPORT_NAME)
    step, digest = report.get("best_internal_validation_step"), report.get("best_checkpoint_sha256")
    target = report.get("steps_target")
    if (report.get("schema") != child.SCHEMA or report.get("status") != "complete"
            or type(target) is not int or not 1000 <= target <= child.MAX_STEPS
            or report.get("additional_steps_completed") != target
            or type(step) is not int or not 50 <= step <= target or step % 50
            or not diagnostic._sha_valid(digest)
            or report.get("best_internal_validation_total_step") != child.PARENT_STEP + step):
        raise CompositionError("complete_internally_selected_child_required")
    if report.get("feasible_checkpoint_selected") is False and report.get("diagnostic_best_step") != step:
        raise CompositionError("diagnostic_best_child_selection_changed")
    marker, marker_sha = pilot._read_json(folder / f"child_step_{step:06d}.json")
    filename = f"child_step_{step:06d}_{digest[:12]}.pt"
    expected = {"schema": child.SCHEMA, "step": step, "total_step": child.PARENT_STEP + step,
                "file": filename, "sha256": digest}
    if any(marker.get(key) != value for key, value in expected.items()):
        raise CompositionError("child_marker_contract_invalid")
    path = folder / filename
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o077
            or not 0 < info.st_size <= v2.MAX_CHECKPOINT_BYTES or info.st_size != marker.get("bytes")):
        raise CompositionError("child_checkpoint_file_invalid")
    with path.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != digest:
            raise CompositionError("child_checkpoint_sha_changed")
    return {"step": step, "total_step": child.PARENT_STEP + step, "checkpoint_sha256": digest,
            "checkpoint_marker_sha256": marker_sha, "training_report_sha256": report_sha,
            "_path": path, "_report": report, "_kind": "composition_continuation"}


def _verify_trial_child(checkpoint: dict, snapshot: dict, parent: dict,
                        parent_snapshot: dict, binding: dict) -> dict:
    expected = {"schema": child.SCHEMA, "step": snapshot["step"], "total_step": snapshot["total_step"],
                "source_manifest_sha256": binding["source_manifest_sha256"], "split_manifest_sha256": binding["split_manifest_sha256"],
                "upstream_commit": pilot.UPSTREAM_SHA, "architecture": v2.ARCHITECTURE, "model_config": v2.MODEL_CONFIG,
                "loss_weights": v2.LOSS_WEIGHTS, "sampler": v2.SAMPLER, "learning_rate": child.LEARNING_RATE,
                "internal_partition_sha256": binding["internal_partition_sha256"], "normalizer_fit_only": binding["normalizer_fit_only"],
                "fit_windows": parent["fit_windows"], "validation_windows": parent["validation_windows"],
                "fit_window_selection_sha256": binding["fit_window_selection_sha256"],
                "parent_step": parent_snapshot["step"], "parent_checkpoint_sha256": parent_snapshot["checkpoint_sha256"],
                "parent_checkpoint_marker_sha256": parent_snapshot["checkpoint_marker_sha256"],
                "parent_training_report_sha256": parent_snapshot["training_report_sha256"],
                "v1_baseline_checkpoint_sha256": parent["v1_baseline_checkpoint_sha256"],
                "internal_feasibility_criteria": child.INTERNAL_FEASIBILITY_CRITERIA, **child._code_hashes()}
    if any(checkpoint.get(key) != value for key, value in expected.items()):
        raise CompositionError("child_parent_fit_or_code_contract_changed")
    report_expected = {key: value for key, value in expected.items() if key not in ("step", "total_step")}
    report_expected.update({"fit_song_groups": 12, "validation_song_groups": 3, "external_heldout_training_or_selection_songs": 0})
    if any(snapshot["_report"].get(key) != value for key, value in report_expected.items()):
        raise CompositionError("child_report_fit_or_code_contract_changed")
    if not isinstance(checkpoint.get("model_state"), dict) or any(key.startswith("reverb.") for key in checkpoint["model_state"]):
        raise CompositionError("child_dry_model_state_invalid")
    if (not diagnostic._sha_valid(checkpoint.get("validation_window_selection_sha256"))
            or snapshot["_report"].get("validation_window_selection_sha256") != checkpoint["validation_window_selection_sha256"]):
        raise CompositionError("child_validation_window_sha_invalid")
    validation = checkpoint.get("validation", {})
    feasibility = child.internal_feasibility(validation)
    selected = [row for row in snapshot["_report"].get("history", []) if row.get("step") == snapshot["step"]]
    if validation.get("internal_feasibility") != feasibility or len(selected) != 1 or selected[0].get("validation") != validation:
        raise CompositionError("child_internal_selection_metrics_changed")
    return {"raw_internal_feasibility_passed": feasibility["feasible"], "internal_feasibility": feasibility,
            "internal_validation": validation, "external_heldout_inference_for_this_trial": 0}


def _np_bytes(arrays: dict) -> bytes:
    stream = io.BytesIO()
    np.savez_compressed(stream, **arrays)
    return stream.getvalue()


def run(*, calibration_file: Path, parent_checkpoint_dir: Path, upstream_root: Path,
        output_dir: Path, checkpoint_dir: Path | None = None, minutes: int = MAX_MINUTES) -> dict:
    if type(minutes) is not int or not 1 <= minutes <= MAX_MINUTES:
        raise CompositionError("composition_time_limit")
    started = time.monotonic()
    for folder in (parent_checkpoint_dir, upstream_root, output_dir) + ((checkpoint_dir,) if checkpoint_dir else ()):
        calibration.approved_private_path(folder, directory=True)
    calibration.approved_private_path(calibration_file)
    pilot._check_disjoint_report_dir(output_dir, [parent_checkpoint_dir, upstream_root, calibration_file.parent] + ([checkpoint_dir] if checkpoint_dir else []))
    if os.listdir(output_dir):
        raise CompositionError("fresh_private_composition_directory_required")
    encoder = shutil.which("ffmpeg")
    if encoder is None:
        raise CompositionError("local_aac_encoder_required")
    with pilot._network_disabled():
        v2._free_space_gate(output_dir, starting=False)
        report, calibration_sha = pilot._read_json(calibration_file)
        binding = report.get("binding", {})
        compiled, _, score_sha = calibration.public_score()
        parent_snapshot = diagnostic.checkpoint_snapshot(parent_checkpoint_dir)
        expected_parent = {"checkpoint_sha256": parent_snapshot["checkpoint_sha256"],
                           "checkpoint_marker_sha256": parent_snapshot["checkpoint_marker_sha256"],
                           "training_report_sha256": parent_snapshot["training_report_sha256"], "checkpoint_step": 400,
                           "checkpoint_kind": "v2", "normalizer_fit_only": parent_snapshot["_report"]["normalizer_fit_only"]}
        if (parent_snapshot["step"] != 400 or parent_snapshot["checkpoint_sha256"] != child.PARENT_CHECKPOINT_SHA256
                or report.get("schema") != calibration.SCHEMA or report.get("status") != "fit_only_calibration_complete"
                or report.get("calibration_script_sha256") != calibration.code_sha256()
                or report.get("score_plan_sha256") != score_sha or report.get("score_adapter_sha256") != _hash(Path(adapter.__file__))
                or report.get("compiler_sha256") != _hash(association.COMPILER_PATH)
                or any(binding.get(key) != value for key, value in expected_parent.items())
                or not diagnostic._sha_valid(binding.get("fit_window_selection_sha256"))
                or report.get("data_scope", {}).get("fit_song_groups") != 12
                or report.get("data_scope", {}).get("internal_validation_audio_opened") != 0
                or report.get("data_scope", {}).get("external_heldout_audio_opened") != 0):
            raise CompositionError("parent400_fit_only_calibration_required")
        controls = score_renderer.prepare_controls(compiled, report)
        authored_curve = score_renderer.authored_output_curve(compiled, controls)
        snapshot = trial_child_snapshot(checkpoint_dir) if checkpoint_dir else parent_snapshot
        torch, DDSP, _, _ = v1._mac_mps_gate(output_dir, upstream_root)
        parent = torch.load(parent_snapshot["_path"], map_location="cpu", weights_only=True)
        if (parent.get("normalizer_fit_only") != binding["normalizer_fit_only"]
                or parent.get("internal_partition_sha256") != binding["internal_partition_sha256"]
                or parent.get("architecture") != v2.ARCHITECTURE or parent.get("model_config") != v2.MODEL_CONFIG):
            raise CompositionError("parent_model_fit_contract_changed")
        checkpoint = torch.load(snapshot["_path"], map_location="cpu", weights_only=True) if checkpoint_dir else parent
        internal = (_verify_trial_child(checkpoint, snapshot, parent, parent_snapshot, binding) if checkpoint_dir else
                    {"raw_internal_feasibility_passed": False, "internal_feasibility_status": "parent_scalar_selected_model_not_population_level_validated",
                     "internal_validation": parent.get("validation"), "external_heldout_inference_for_this_trial": 0})
        v1._assert_checkpoint_state_finite(torch, checkpoint)
        model = DDSP(**v2.MODEL_CONFIG)
        model.reverb = torch.nn.Identity()
        model.load_state_dict(checkpoint["model_state"], strict=True)
        model.to("mps").eval()
        pitch = torch.from_numpy(controls["candidate"]["f0_hz_candidate"].copy()).to("mps").reshape(1, -1, 1)
        loudness = torch.from_numpy(controls["normalized_loudness"].copy()).to("mps").reshape(1, -1, 1)
        torch.manual_seed(SEED)
        with torch.no_grad():
            raw = model(pitch, loudness).squeeze().detach().cpu().numpy()
        plan = note_level_plan(raw, compiled, report["calibration"]["anchor_rms_dbfs"])
        uncorrected = raw * authored_curve
        raw_metrics = score_renderer.score_metrics(uncorrected, compiled, controls, report["calibration"]["anchor_rms_dbfs"])
        corrected = uncorrected.copy()
        gain_curve = np.ones_like(raw)
        if plan["all_note_gains_within_limit"]:
            gain_curve = note_gain_curve(compiled, plan)
            corrected = uncorrected * gain_curve
        corrected_metrics = score_renderer.score_metrics(corrected, compiled, controls, report["calibration"]["anchor_rms_dbfs"])
        gate = composition_gate(raw_metrics, corrected_metrics, plan, corrected)
        if time.monotonic() - started >= minutes * 60:
            raise CompositionError("composition_time_cap")
        parent_after = diagnostic.checkpoint_snapshot(parent_checkpoint_dir)
        actual_after = trial_child_snapshot(checkpoint_dir) if checkpoint_dir else parent_after
        for before, after in ((parent_snapshot, parent_after), (snapshot, actual_after)):
            if any(before[key] != after[key] for key in ("checkpoint_sha256", "checkpoint_marker_sha256", "training_report_sha256", "step")):
                raise CompositionError("checkpoint_or_lineage_changed_during_composition")
        _, calibration_after = pilot._read_json(calibration_file)
        if calibration_after != calibration_sha:
            raise CompositionError("fit_calibration_changed_during_composition")
        v2._free_space_gate(output_dir, starting=False)
        archives = {"private_raw_controls_and_gains.npz": _np_bytes({"model_raw_float32": raw, "uncorrected_authorial_float32": uncorrected,
                    "corrected_float32": corrected, "f0_hz": controls["candidate"]["f0_hz_candidate"],
                    "normalized_loudness": controls["normalized_loudness"], "weighted_log": controls["weighted_log_feature"],
                    "authored_output_curve": authored_curve, "note_gain_curve": gain_curve})}
        digests = {}
        for name, payload in archives.items():
            v1._atomic_private_bytes(output_dir, name, payload, replace=False)
            digests[name] = hashlib.sha256(payload).hexdigest()
        result = {"schema": SCHEMA, "status": "composition_preview_blocked", "model_forward_calls": 1,
                  "source_waveforms_read": 0, "duration_seconds": 19.2, "sample_rate_hz": 16_000, "control_hz": 100,
                  "checkpoint_sha256": snapshot["checkpoint_sha256"], "checkpoint_step": snapshot["step"], "checkpoint_total_step": snapshot["total_step"],
                  "checkpoint_marker_sha256": snapshot["checkpoint_marker_sha256"], "training_report_sha256": snapshot["training_report_sha256"],
                  "calibration_model_parent_sha256": parent_snapshot["checkpoint_sha256"], "actual_timbre_model_sha256": snapshot["checkpoint_sha256"],
                  "calibration_sha256": calibration_sha, "score_plan_sha256": score_sha,
                  "source_manifest_sha256": binding["source_manifest_sha256"], "split_manifest_sha256": binding["split_manifest_sha256"],
                  "fit_window_selection_sha256": binding["fit_window_selection_sha256"], "normalizer_fit_only": binding["normalizer_fit_only"],
                  "pitch_shift_semitones": controls["pitch_shift_semitones"], "authorial_score_bytes_unchanged": True,
                  "architecture": v2.ARCHITECTURE, "model_config": v2.MODEL_CONFIG, "seed": SEED,
                  "claims": "ML timbre + authored performance curves + explicit per-note level calibration; private R&D only",
                  "raw_model_internal_status": internal, "raw_score_metrics": raw_metrics, "corrected_score_metrics": corrected_metrics,
                  "note_level_correction": plan, "gain_transition_seconds": GAIN_TRANSITION_SECONDS,
                  "gain_interpolation": "80ms minimum-jerk dB gain between adjacent notes, fixed per-note values; no 10ms RMS feedback",
                  "score_vibrato": {"active_authored_vibrato_frames": int(np.count_nonzero(compiled["vibrato_cents"])),
                                    "maximum_authored_vibrato_abs_cents": float(np.max(np.abs(compiled["vibrato_cents"]))),
                                    "reference_contour_frames": int(np.count_nonzero(compiled["reference_contour_cents"])),
                                    "placement_learned": False, "present_score_is_straight_except_short_authored_slurs": True},
                  "slur_input_audit": controls["slur_input_audit"], "slur_feature_blend_clamped_frames": controls["slur_feature_blend_clamped_frames"],
                  "gate": gate, "private_archive_sha256": digests, "script_sha256": _hash(Path(__file__)),
                  "source_rights": "AI_Hub_71470_private_R_and_D_only_no_export_or_game_output",
                  "limitations": ["This route corrects model level errors explicitly and does not establish raw model validation success.",
                                  "Fit-only RMS-feature association is not a causal model-output loudness law.",
                                  "No heldout inference, learned composition, learned breath labels, or learned vibrato placement.",
                                  "Gain correction can amplify model noise; numerical pitch/level gates do not prove timbre naturalness."]}
        if gate["eligible_for_private_composition_preview"]:
            rms = float(np.sqrt(np.mean(corrected.astype(np.float64) ** 2)))
            gain = 0.035 / rms if rms > 1e-8 else float("inf")
            if gain <= 16 and float(np.max(np.abs(corrected))) * gain <= 0.90:
                wav = score_renderer._wav_bytes(corrected * gain)
                v1._atomic_private_bytes(output_dir, "new_score_level_calibrated.wav", wav, replace=False)
                audio_path = output_dir / "new_score_level_calibrated.m4a"
                encoded = subprocess.run([encoder, "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-i",
                    str(output_dir / "new_score_level_calibrated.wav"), "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
                    "-movflags", "+faststart", str(audio_path)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60)
                if encoded.returncode or not audio_path.is_file() or not 0 < audio_path.stat().st_size < 4_194_304:
                    raise CompositionError("private_aac_encoding_failed")
                audio_path.chmod(0o600)
                result.update({"status": "private_level_calibrated_new_score_ready", "uniform_listening_gain_db": 20 * math.log10(gain),
                               "audio_wav_sha256": hashlib.sha256(wav).hexdigest(), "audio_aac_sha256": _hash(audio_path)})
                html = ("<!doctype html><html lang='ko'><meta charset='utf-8'><title>새 선율 대금 시험</title>"
                    "<body style='font:18px system-ui;padding:32px;max-width:760px'><h1>새 8마디 대금 시험</h1>"
                    "<p>학습한 음색으로 새 선율을 합성하고, 호흡 곡선과 음별 음량을 따로 보정한 연구용 시험본입니다.</p>"
                    f"<p>{controls['pitch_shift_semitones']:+d}반음 · 19.2초 · 잔향 없음 · 이번 선율은 비브라토 없이 작성했습니다.</p>"
                    "<audio controls preload='metadata' src='new_score_level_calibrated.m4a'></audio>"
                    "<p>원본 녹음을 이어 붙인 음악은 아닙니다. 모델 자체의 음량 검증을 통과했다는 뜻은 아니며 게임 확정본도 아닙니다.</p>"
                    "<p>AI Hub 국악 악보 및 음원 데이터(71470)로 학습. 로컬 개인 연구용.</p></body></html>").encode()
                v1._atomic_private_bytes(output_dir, "listen.html", html, replace=False)
            else:
                result["gate"]["checks"]["uniform_listening_gain_and_peak"] = False
                result["gate"]["eligible_for_private_composition_preview"] = False
        v1._atomic_private_bytes(output_dir, REPORT_NAME, _json_bytes(result), replace=False)
        return {"status": result["status"], "model_forward_calls": 1, "source_waveforms_read": 0,
                "note_gain_max_abs_db": plan["maximum_requested_abs_gain_db"], "raw_model_validation_claimed": False}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("calibration-file", "parent-checkpoint-dir", "upstream-root", "output-dir"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--checkpoint-dir", type=Path)
    parser.add_argument("--minutes", type=int, default=MAX_MINUTES)
    args = parser.parse_args()
    try:
        result = run(**vars(args))
    except (CompositionError, calibration.CalibrationError, score_renderer.RenderError, diagnostic.DiagnosticError,
            v1.TrialError, v2.V2Error, pilot.PilotError, child.ContinuationError) as exc:
        result = {"status": "blocked", "reason": str(exc)}
    except Exception:
        result = {"status": "blocked", "reason": "unexpected_private_composition_error"}
    print(json.dumps(result, sort_keys=True))
    return 2 if result["status"] == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
