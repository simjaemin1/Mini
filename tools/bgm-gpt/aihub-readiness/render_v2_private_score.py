#!/usr/bin/env python3
"""One-pass private R&D synthesis of the authorial eight-bar score with V2.

Requires a checkpoint-bound fit-only calibration and successful frozen
external diagnostic. No source waveform is a renderer input. Breath/reattack
envelopes and rest fades are authored controls, not learned performance labels.
The trained model supplies dry harmonic/noise timbre for a new written melody.
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
import subprocess
import time
import wave

import numpy as np

import bound_v2_dry_diagnostic as diagnostic
import calibrate_v2_score_controls as calibration
import diagnose_ircam_score_loudness as association
import mac_mps_ddsp_features as features
import mac_mps_ddsp_long_trial as v1
import mac_mps_ddsp_pilot as pilot
import mac_mps_ddsp_v2_dry_trial as v2
import score_ircam_conditioning_adapter as adapter


SCHEMA = "mini.aihub-71470-v2-private-authorial-score-render.v1"
REPORT_NAME = "v2_private_score_report.json"
SEED = 71473
MAX_MINUTES = 10
REST_FADE_SECONDS = 0.010
GATES = {"pitch_median_error_cents_max": 50.0,
         "common_steady_voiced_fraction_min": 0.80,
         "each_note_pitch_median_error_cents_max": 50.0,
         "each_note_common_steady_voiced_fraction_min": 0.80,
         "slur_output_short_window_target_error_cents_max": 50.0,
         "steady_level_abs_error_db_max": 3.0,
         "preview_gain_max": 16.0, "preview_peak_max": 0.90}


class RenderError(Exception):
    """Fixed non-private failure code suitable for CLI output."""


def _hash_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare_controls(compiled: dict, report: dict) -> dict:
    """Public score F0 plus an observed-range feature; no audio input."""
    body = report["calibration"]
    shift = body.get("selected_shift_for_private_trial")
    if shift not in calibration.SHIFT_CANDIDATES:
        raise RenderError("no_supported_score_variant")
    variant = next((item for item in body["variants"] if item["pitch_shift_semitones"] == shift), None)
    if not variant or variant.get("all_nominal_pitches_and_steady_level_supported") is not True:
        raise RenderError("score_variant_gate_failed")
    candidate = adapter.adapt_compiled_controls(compiled, pitch_shift_semitones=shift)
    count = len(candidate["f0_hz_candidate"])
    weighted = np.zeros(count, dtype=np.float32)
    attenuation = np.zeros(count, dtype=np.float32)
    owners = candidate["event_index"]
    table = {item["pitch_midi"]: item for item in variant["groups"]}
    below_support_frames = 0
    blend_clamped_frames = 0
    last_group = None
    for index, event in enumerate(compiled["events"]):
        rows = np.flatnonzero(owners == index)
        if not len(rows):
            raise RenderError("event_without_model_control")
        if event["articulation"] == "release":
            if last_group is None:
                raise RenderError("initial_release_forbidden")
            weighted[rows] = last_group["usable_run"][0]["monotone_candidate_weighted_log"]
            continue
        midi = round(69 + 12 * math.log2(float(event["pitch_hz"]) / 440)) + shift
        group = table.get(midi)
        if group is None:
            raise RenderError("score_pitch_calibration_missing")
        desired_rms = body["anchor_rms_dbfs"] + candidate["loudness_db_intent"][rows] - calibration.AUTHORED_STEADY_DB
        mapped, gain = calibration.map_intent(group, desired_rms)
        weighted[rows], attenuation[rows] = mapped, gain
        below_support_frames += int(np.count_nonzero(gain < 1))
        if event["articulation"] == "slur":
            # Dynamic interpolation is independent of the existing 12 ms F0
            # transition. Never interpolate pitch across a whole note.
            prior = rows[0] - 1
            local = candidate["frame_times_seconds"][rows] - event["start_seconds"]
            progress = np.clip(local / 0.080, 0, 1)
            ease = progress ** 3 * (10 + progress * (-15 + 6 * progress))
            weighted[rows] = weighted[prior] + ease * (weighted[rows] - weighted[prior])
            attenuation[rows] = attenuation[prior] + ease * (attenuation[rows] - attenuation[prior])
            # The previous note's spectral feature can lie outside the next
            # pitch group's observed range. Keep target-note model input in
            # its measured range; do not infer dB correction from this
            # feature difference, which has no established causal dB law.
            low = group["usable_run"][0]["monotone_candidate_weighted_log"]
            high = group["usable_run"][-1]["monotone_candidate_weighted_log"]
            outside = (weighted[rows] < low) | (weighted[rows] > high)
            blend_clamped_frames += int(outside.sum())
            weighted[rows] = np.clip(weighted[rows], low, high)
        last_group = group
    mean, std = report["binding"]["normalizer_fit_only"]
    normalized = (weighted - mean) / std
    if not np.all(np.isfinite(normalized)) or not np.all(np.isfinite(attenuation)):
        raise RenderError("nonfinite_score_controls")
    transition_rows = []
    for index, event in enumerate(compiled["events"]):
        if event["articulation"] != "slur":
            continue
        rows = np.flatnonzero(owners == index)
        local = candidate["frame_times_seconds"][rows] - event["start_seconds"]
        target = float(event["pitch_hz"]) * 2 ** (shift / 12)
        settled = rows[(local >= 0.020) & (local <= 0.050)]
        if not len(settled) or np.any(np.abs(1200 * np.log2(candidate["f0_hz_candidate"][settled] / target)) > 1.0):
            raise RenderError("score_pitch_transition_does_not_settle_by_50ms")
        transition_rows.append({"event_id": event["id"], "authored_slur_ms": 12,
                                "model_grid_transition_frames": int(np.count_nonzero(local < 0.012)),
                                "target_settle_verified_by_ms": 50})
    return {"candidate": candidate, "normalized_loudness": normalized.astype(np.float32),
            "weighted_log_feature": weighted, "output_attenuation": attenuation,
            "pitch_shift_semitones": shift, "below_support_output_attenuation_frames": below_support_frames,
            "slur_feature_blend_clamped_frames": blend_clamped_frames,
            "slur_input_audit": transition_rows}


def authored_output_curve(compiled: dict, controls: dict) -> np.ndarray:
    """Sample-domain authored voicing, low-tail attenuation, and exact rests."""
    candidate = controls["candidate"]
    count = candidate["sample_count"]
    times = np.arange(count, dtype=np.float64) / adapter.TARGET_SAMPLE_RATE_HZ
    model_times = candidate["frame_times_seconds"]
    curve = np.interp(times, model_times, controls["output_attenuation"])
    curve *= np.interp(times, compiled["frame_times_seconds"], compiled["voicing"])
    for event in compiled["events"]:
        if event["articulation"] != "release":
            continue
        start, end = float(event["start_seconds"]), float(event["end_seconds"])
        fading = (times >= start - REST_FADE_SECONDS) & (times < start)
        progress = np.clip((start - times[fading]) / REST_FADE_SECONDS, 0, 1)
        curve[fading] *= progress ** 3 * (10 + progress * (-15 + 6 * progress))
        curve[(times >= start) & (times < end)] = 0
    if not np.all(np.isfinite(curve)) or np.any((curve < 0) | (curve > 1.00001)):
        raise RenderError("authored_output_envelope_invalid")
    # Rest boundaries use integer sample ownership from the score adapter,
    # independent of float comparisons and model control quantization.
    for interval in candidate["hard_mute_intervals_16k"]:
        curve[interval["start_sample_16k"]:interval["end_sample_16k"]] = 0
    return curve.astype(np.float32)


def score_metrics(audio: np.ndarray, compiled: dict, controls: dict, anchor: float) -> dict:
    candidate = controls["candidate"]
    if audio.shape != (candidate["sample_count"],) or not np.all(np.isfinite(audio)):
        raise RenderError("score_audio_shape_or_finiteness")
    measured = features.extract_features(audio)
    expected = candidate["f0_hz_candidate"]
    steady = np.zeros(len(expected), dtype=bool)
    for index, event in enumerate(compiled["events"]):
        if event["articulation"] == "release":
            continue
        local = candidate["frame_times_seconds"] - event["start_seconds"]
        remaining = event["end_seconds"] - candidate["frame_times_seconds"]
        steady |= ((candidate["event_index"] == index) & (local >= 0.100) & (remaining >= 0.070))
    common = steady & (expected > 0) & measured["voiced_mask"] & (measured["pitch_hz"] > 0)
    errors = np.abs(1200 * np.log2(measured["pitch_hz"][common] / expected[common]))
    fraction = int(common.sum()) / int(steady.sum()) if steady.any() else 0
    median_error = float(np.median(errors)) if len(errors) else None
    note_levels = []
    note_pitch = []
    for index, event in enumerate(compiled["events"]):
        mask = steady & (candidate["event_index"] == index)
        if mask.any():
            level = float(np.median(measured["rms_db"][mask]))
            note_levels.append({"event_id": event["id"], "steady_median_rms_dbfs": level,
                                "intended_anchor_error_db": level - anchor})
            matched = mask & common
            note_errors = np.abs(1200 * np.log2(measured["pitch_hz"][matched] / expected[matched]))
            coverage = int(matched.sum()) / int(mask.sum())
            error = float(np.median(note_errors)) if len(note_errors) else None
            note_pitch.append({"event_id": event["id"], "steady_frames": int(mask.sum()),
                               "common_steady_voiced_fraction": coverage,
                               "median_f0_error_cents": error,
                               "pitch_gate_passed": coverage >= GATES["each_note_common_steady_voiced_fraction_min"]
                               and error is not None and error <= GATES["each_note_pitch_median_error_cents_max"]})
    # The ordinary estimator has a 64 ms centered window and cannot prove
    # attachment at 50 ms. This separate 32 ms YIN window ends exactly 50 ms
    # after a written slur (it observes ~18..50 ms); it is a short-window
    # output estimate, not a claim that control-array attachment is audible.
    slur_output = []
    for event in compiled["events"]:
        if event["articulation"] != "slur":
            continue
        stop = round((float(event["start_seconds"]) + 0.050) * 16_000)
        excerpt = audio[stop - 512:stop].astype(np.float64)
        if excerpt.shape != (512,):
            raise RenderError("short_slur_estimator_window_invalid")
        db = 20 * math.log10(max(float(np.sqrt(np.mean(excerpt * excerpt))), 1e-12))
        estimated, voiced = features._yin_pitch_for_chunk(excerpt.reshape(1, -1), np.array([db]), sample_rate=16_000)
        target = float(event["pitch_hz"]) * 2 ** (controls["pitch_shift_semitones"] / 12)
        error = abs(1200 * math.log2(float(estimated[0]) / target)) if voiced[0] and estimated[0] > 0 else None
        slur_output.append({"event_id": event["id"], "estimator": "YIN_short_window_32ms_ending_at_50ms",
                            "voiced": bool(voiced[0]), "estimated_hz": float(estimated[0]) if voiced[0] else None,
                            "target_hz": target, "target_error_cents": error,
                            "output_short_window_gate_passed": error is not None and error <= GATES["slur_output_short_window_target_error_cents_max"]})
    exact_rests = all(not np.any(audio[item["start_sample_16k"]:item["end_sample_16k"]])
                      for item in candidate["hard_mute_intervals_16k"])
    checks = {"steady_pitch_coverage": fraction >= GATES["common_steady_voiced_fraction_min"],
              "steady_pitch_accuracy": median_error is not None and median_error <= GATES["pitch_median_error_cents_max"],
              "each_note_pitch_coverage_and_accuracy": len(note_pitch) == sum(event["articulation"] != "release" for event in compiled["events"])
              and all(row["pitch_gate_passed"] for row in note_pitch),
              "slur_output_short_window_target": bool(slur_output) and all(row["output_short_window_gate_passed"] for row in slur_output),
              "steady_note_levels": bool(note_levels) and all(abs(row["intended_anchor_error_db"]) <= GATES["steady_level_abs_error_db_max"] for row in note_levels),
              "exact_written_rests": exact_rests}
    return {"numerically_eligible_for_local_score_preview": all(checks.values()), "checks": checks,
            "steady_voiced_fraction": fraction, "median_f0_error_cents": median_error,
            "note_levels": note_levels, "note_pitch": note_pitch, "slur_output_short_window_pitch": slur_output,
            "short_window_estimators_do_not_establish_perceptual_attachment_time": True,
            "numeric_gates_do_not_prove_human_timbre_quality": True}


def _verify_evaluation(directory: Path, checkpoint_dir: Path, binding: dict) -> dict:
    calibration.approved_private_path(directory, directory=True)
    proof, _ = pilot._read_json(directory / diagnostic.BINDING_NAME)
    report, report_sha = pilot._read_json(directory / diagnostic.REPORT_NAME)
    plan, plan_sha = pilot._read_json(directory.parent / "evaluation_plan.json")
    freeze, _ = pilot._read_json(checkpoint_dir / diagnostic.FREEZE_NAME)
    expected = {name: binding[name] for name in ("checkpoint_sha256", "training_report_sha256",
                                                 "normalizer_fit_only", "source_manifest_sha256", "split_manifest_sha256")}
    expected.update({"code_sha256": diagnostic._code_hashes(), "architecture": v2.ARCHITECTURE,
                     "checkpoint_trial_kind": binding["checkpoint_kind"],
                     "checkpoint_total_step": binding["checkpoint_total_step"]})
    if binding["checkpoint_kind"] == "continuation":
        expected.update({name: binding[name] for name in ("parent_checkpoint_sha256", "parent_checkpoint_marker_sha256",
                                                        "parent_training_report_sha256", "parent_step")})
    if (proof.get("schema") != diagnostic.SCHEMA or proof.get("status") != "complete_bound_to_frozen_v2"
            or proof.get("report_sha256") != report_sha or any(proof.get(name) != value for name, value in expected.items())
            or plan != freeze or proof.get("evaluation_plan_sha256") != plan_sha
            or any(plan.get(name) != value for name, value in expected.items())
            or plan.get("seeds") != diagnostic.SEEDS or plan.get("gates") != diagnostic.GATES
            or report.get("schema") != diagnostic.SCHEMA or report.get("status") != "reused_diagnostic_complete"
            or report.get("numerical_preview_gate", {}).get("numerically_eligible_for_local_preview") is not True):
        raise RenderError("successful_checkpoint_bound_external_diagnostic_required")
    try:
        rows = (report["general_scores_private"], report["vb01_scores_private"], report["planned_preview_metrics"])
        songs = {row["song_index"] for row in plan["general_source_selection"]}
        if (sum(row.get("kind") == "sustain" for row in rows[0]) != 34 or len(rows[1]) != 24
                or diagnostic.preview_gate(*rows, songs) != report["numerical_preview_gate"]):
            raise RenderError("external_diagnostic_gate_proof_changed")
    except (KeyError, TypeError, ValueError):
        raise RenderError("external_diagnostic_gate_proof_invalid") from None
    return {"diagnostic_report_sha256": report_sha, "diagnostic_checkpoint_sha256": proof["checkpoint_sha256"]}


def _wav_bytes(audio: np.ndarray) -> bytes:
    if audio.ndim != 1 or not np.all(np.isfinite(audio)) or np.max(np.abs(audio)) > GATES["preview_peak_max"]:
        raise RenderError("preview_waveform_invalid")
    result = io.BytesIO()
    with wave.open(result, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(16_000)
        writer.writeframes(np.rint(audio * 32767).astype("<i2").tobytes())
    return result.getvalue()


def render(*, calibration_file: Path, checkpoint_dir: Path, diagnostic_dir: Path,
           upstream_root: Path, output_dir: Path, minutes: int = MAX_MINUTES,
           parent_checkpoint_dir: Path | None = None) -> dict:
    if type(minutes) is not int or not 1 <= minutes <= MAX_MINUTES:
        raise RenderError("render_time_limit")
    deadline = time.monotonic() + minutes * 60
    for folder in (checkpoint_dir, diagnostic_dir, upstream_root, output_dir):
        calibration.approved_private_path(folder, directory=True)
    calibration.approved_private_path(calibration_file)
    pilot._check_disjoint_report_dir(output_dir, [checkpoint_dir, diagnostic_dir, upstream_root, calibration_file.parent])
    if os.listdir(output_dir):
        raise RenderError("fresh_private_render_output_required")
    with pilot._network_disabled(), v1._exclusive_private_lock(checkpoint_dir):
        v2._free_space_gate(output_dir, starting=False)
        report, calibration_sha = pilot._read_json(calibration_file)
        compiled, _, score_sha = calibration.public_score()
        snapshot = diagnostic.checkpoint_snapshot(checkpoint_dir)
        binding = report.get("binding", {})
        if (report.get("schema") != calibration.SCHEMA or report.get("status") != "fit_only_calibration_complete"
                or report.get("calibration_script_sha256") != calibration.code_sha256()
                or report.get("score_plan_sha256") != score_sha
                or report.get("score_adapter_sha256") != _hash_file(Path(adapter.__file__))
                or report.get("compiler_sha256") != _hash_file(association.COMPILER_PATH)
                or binding.get("checkpoint_sha256") != snapshot["checkpoint_sha256"]
                or binding.get("training_report_sha256") != snapshot["training_report_sha256"]
                or report.get("data_scope", {}).get("fit_song_groups") != 12
                or report.get("data_scope", {}).get("internal_validation_audio_opened") != 0
                or report.get("data_scope", {}).get("external_heldout_audio_opened") != 0):
            raise RenderError("calibration_checkpoint_or_score_contract_changed")
        evaluation = _verify_evaluation(diagnostic_dir, checkpoint_dir, binding)
        controls = prepare_controls(compiled, report)
        curve = authored_output_curve(compiled, controls)
        torch, DDSP, _, _ = v1._mac_mps_gate(output_dir, upstream_root)
        checkpoint = torch.load(snapshot["_path"], map_location="cpu", weights_only=True)
        if (checkpoint.get("normalizer_fit_only") != binding.get("normalizer_fit_only")
                or checkpoint.get("internal_partition_sha256") != binding.get("internal_partition_sha256")
                or checkpoint.get("architecture") != v2.ARCHITECTURE
                or checkpoint.get("model_config") != v2.MODEL_CONFIG
                or any(key.startswith("reverb.") for key in checkpoint.get("model_state", {}))):
            raise RenderError("model_contract_changed_after_calibration")
        if snapshot.get("_kind") == "continuation":
            if parent_checkpoint_dir is None:
                raise RenderError("continuation_parent_checkpoint_required")
            calibration.approved_private_path(parent_checkpoint_dir, directory=True)
            parent = diagnostic.checkpoint_snapshot(parent_checkpoint_dir)
            if any(binding.get(key) != parent[value] for key, value in (
                    ("parent_checkpoint_sha256", "checkpoint_sha256"),
                    ("parent_checkpoint_marker_sha256", "checkpoint_marker_sha256"),
                    ("parent_training_report_sha256", "training_report_sha256"), ("parent_step", "step"))):
                raise RenderError("continuation_parent_changed_after_calibration")
        model = DDSP(**v2.MODEL_CONFIG)
        model.reverb = torch.nn.Identity()
        model.load_state_dict(checkpoint["model_state"], strict=True)
        model.to(torch.device("mps"))
        model.eval()
        pitch = torch.from_numpy(controls["candidate"]["f0_hz_candidate"].copy()).to("mps").reshape(1, -1, 1)
        loudness = torch.from_numpy(controls["normalized_loudness"].copy()).to("mps").reshape(1, -1, 1)
        torch.manual_seed(SEED)
        with torch.no_grad():
            raw = model(pitch, loudness).squeeze().detach().cpu().numpy()
        if raw.shape != curve.shape or not np.all(np.isfinite(raw)):
            raise RenderError("nonfinite_or_wrong_fullphrase_model_output")
        audio = raw * curve
        metrics = score_metrics(audio, compiled, controls, report["calibration"]["anchor_rms_dbfs"])
        if time.monotonic() >= deadline:
            raise RenderError("render_time_cap")
        after = diagnostic.checkpoint_snapshot(checkpoint_dir)
        _, calibration_after = pilot._read_json(calibration_file)
        if (after["checkpoint_sha256"] != snapshot["checkpoint_sha256"]
                or after["training_report_sha256"] != snapshot["training_report_sha256"]
                or after["checkpoint_marker_sha256"] != snapshot["checkpoint_marker_sha256"]
                or calibration_after != calibration_sha):
            raise RenderError("inputs_changed_during_score_inference")
        _verify_evaluation(diagnostic_dir, checkpoint_dir, binding)
        if snapshot.get("_kind") == "continuation":
            parent_after = diagnostic.checkpoint_snapshot(parent_checkpoint_dir)
            if any(parent_after[key] != parent[key] for key in ("checkpoint_sha256", "checkpoint_marker_sha256", "training_report_sha256", "step")):
                raise RenderError("continuation_parent_changed_during_score_inference")
        v2._free_space_gate(output_dir, starting=False)
        manifest = {"schema": SCHEMA, "status": "score_synthesized_numerical_gate_pending_audio", "checkpoint_sha256": snapshot["checkpoint_sha256"],
                    "checkpoint_step": snapshot["step"], "checkpoint_total_step": snapshot.get("total_step", snapshot["step"]),
                    "calibration_sha256": calibration_sha, "score_plan_sha256": score_sha, **evaluation,
                    "renderer_sha256": _hash_file(Path(__file__)), "normalizer_fit_only": binding["normalizer_fit_only"],
                    "pitch_shift_semitones": controls["pitch_shift_semitones"], "public_score_not_modified": True,
                    "sample_rate_hz": 16_000, "control_hz": 100, "duration_seconds": 19.2,
                    "model_forward_calls": 1, "source_waveforms_read_by_renderer": 0, "seed": SEED,
                    "below_support_output_attenuation_frames": controls["below_support_output_attenuation_frames"],
                    "slur_feature_blend_clamped_frames": controls["slur_feature_blend_clamped_frames"],
                    "output_envelope": "authored voicing + declared below-support attenuation +10ms fade before exact written rests; not learned articulation",
                    "slur_input_audit": controls["slur_input_audit"], "score_numerical_gates": GATES,
                    "metrics": metrics, "raw_audio_sha256": hashlib.sha256(np.ascontiguousarray(audio).tobytes()).hexdigest(),
                    "source_rights": "AI_Hub_71470_private_R_and_D_only_no_export_or_game_output",
                    "limits": ["The model learned timbre, not note choices or where vibrato belongs.",
                               "This score has authored straight F0; no copied source melody, source waveform or source performance contour.",
                               "Full 19.2-second recurrent inference differs from four-second training windows.",
                               "The first 12ms of slurs contain intermediate F0 not covered by nominal-pitch calibration; feature blending is bounded to the target-note table.",
                               "Authored envelopes and numerical F0/level gates do not establish human naturalness."]}
        if metrics["numerically_eligible_for_local_score_preview"]:
            rms = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))
            gain = 0.035 / rms if rms > 1e-8 else float("inf")
            if gain > GATES["preview_gain_max"] or float(np.max(np.abs(audio))) * gain > GATES["preview_peak_max"]:
                manifest["status"] = "score_preview_blocked_by_gain_or_peak"
            else:
                payload = _wav_bytes(audio * gain)
                v1._atomic_private_bytes(output_dir, "authorial_8bar_v2.wav", payload, replace=False)
                encoder = shutil.which("ffmpeg")
                if encoder is None:
                    raise RenderError("local_aac_encoder_required")
                output = output_dir / "authorial_8bar_v2.m4a"
                encoded = subprocess.run([encoder, "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-i",
                                          str(output_dir / "authorial_8bar_v2.wav"), "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
                                          "-movflags", "+faststart", str(output)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60)
                if encoded.returncode or not output.is_file() or not 0 < output.stat().st_size < 4_194_304:
                    raise RenderError("private_aac_encode_failed")
                output.chmod(0o600)
                manifest.update({"status": "private_authorial_score_preview_ready", "uniform_preview_gain_db": 20 * math.log10(gain),
                                 "preview_wav_sha256": hashlib.sha256(payload).hexdigest(), "preview_m4a_sha256": _hash_file(output)})
                html = ("<!doctype html><html lang='ko'><meta charset='utf-8'><title>새 선율 대금 시험</title>"
                        "<body style='font:18px system-ui;padding:32px;max-width:760px'><h1>새 8마디 — 대금 학습 모델 시험</h1>"
                        "<p>새로 쓴 선율을 학습 모델이 연주한 연구용 시험본입니다. 호흡과 재어택의 음량은 악보에서 지정했습니다.</p>"
                        f"<p>원래 악보 대비 {controls['pitch_shift_semitones']:+d}반음 · 19.2초 · 잔향 없음</p>"
                        "<audio controls preload='metadata' src='authorial_8bar_v2.m4a'></audio>"
                        "<p>AI Hub 국악 악보 및 음원 데이터(71470)로 학습. 개인 연구용이며 게임 배포용이 아닙니다.</p></body></html>").encode()
                v1._atomic_private_bytes(output_dir, "listen.html", html, replace=False)
        else:
            manifest["status"] = "score_preview_blocked_by_numerical_gate"
        payload = json.dumps(manifest, sort_keys=True, indent=2, allow_nan=False).encode() + b"\n"
        v1._atomic_private_bytes(output_dir, REPORT_NAME, payload, replace=False)
        return {"status": manifest["status"], "pitch_shift_semitones": controls["pitch_shift_semitones"],
                "model_forward_calls": 1, "source_waveforms_read": 0, "private_preview_only": True}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("calibration-file", "checkpoint-dir", "diagnostic-dir", "upstream-root", "output-dir"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--parent-checkpoint-dir", type=Path)
    parser.add_argument("--minutes", type=int, default=MAX_MINUTES)
    args = parser.parse_args()
    try:
        result = render(**vars(args))
    except (RenderError, calibration.CalibrationError, diagnostic.DiagnosticError, v1.TrialError, v2.V2Error, pilot.PilotError) as exc:
        result = {"status": "blocked", "reason": str(exc)}
    except Exception:
        result = {"status": "blocked", "reason": "unexpected_private_score_render_error"}
    print(json.dumps(result, sort_keys=True))
    return 2 if result["status"] == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
