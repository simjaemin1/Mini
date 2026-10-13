#!/usr/bin/env python3
"""Private B1 comparison: inherited authorial final-note vibrato, same B0 gains.

Only the pinned legacy *expression selection* is read, never its old model.
Copy its final-note vibrato/policy into the canonical 300 Hz B0 score so all
written rests, note times and earlier controls remain unchanged. The same new
ML model renders B1 in one pass. B0 note gains and listening gain are reused.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import time

import numpy as np

import calibrate_v2_score_controls as calibration
import compose_v2_level_calibrated_trial as composition
import diagnose_ircam_score_loudness as association
import mac_mps_ddsp_features as features
import mac_mps_ddsp_long_trial as v1
import mac_mps_ddsp_pilot as pilot
import mac_mps_ddsp_v2_dry_trial as v2
import render_v2_private_score as renderer


SCHEMA = "mini.aihub-71470-v2-authorial-final-vibrato-comparison.v1"
REPORT_NAME = "final_vibrato_comparison_report.json"
HERE = Path(__file__).resolve().parent.parent / "new-arirang-score"
B1_SOURCE = HERE / "new_ari_8bar_ddsp_gugak_legacy100_b1_final_c_vibrato_r1.json"
B1_SOURCE_SHA256 = "a09a8daa9cc68c636c7fc3ecc86aea912dd182250caa4db9eec2f3680160b244"
BUILDER = HERE / "build_private_vibrato_b1.py"
BUILDER_SHA256 = "5ae3c56024edd23f2ed58c38ad7da589c85b60552692f29f8b5d9f90c1e7beac"
FINAL_EVENT = "b08_e0_rearticulate"
PREFIX_SECONDS = 17.6
PREFIX_ABSOLUTE_TOLERANCE = 1e-7
VIBRATO_GATE = {"fixed_rate_fit_r2_min": 0.5, "amplitude_cents_min": 6.0,
                "amplitude_cents_max": 35.0, "voiced_fraction_min": 0.80}


class ComparisonError(Exception):
    """Fixed private-safe reason suitable for CLI output."""


def _module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ComparisonError("public_expression_module_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def derive_b1_plan() -> dict:
    if composition._hash(B1_SOURCE) != B1_SOURCE_SHA256 or composition._hash(BUILDER) != BUILDER_SHA256:
        raise ComparisonError("pinned_authorial_b1_source_changed")
    source = json.loads(B1_SOURCE.read_text(encoding="utf-8"))
    if _module(BUILDER, "mini_b1_authorial_builder").build() != source:
        raise ComparisonError("saved_b1_differs_from_pinned_authorial_builder")
    original = json.loads(association.SCORE_PLAN.read_text(encoding="utf-8"))
    result = copy.deepcopy(original)
    selected = next(event for event in source["events"] if event["id"] == FINAL_EVENT)
    target = next(event for event in result["events"] if event["id"] == FINAL_EVENT)
    target["vibrato"] = copy.deepcopy(selected["vibrato"])
    target["vibrato_policy"] = copy.deepcopy(selected["vibrato_policy"])
    result["expression_policy"]["active_selection_provenance"] = copy.deepcopy(source["expression_policy"]["active_selection_provenance"])
    result["plan_role"] = "new_ML_private_score_b1_final_note_authorial_vibrato_only_300hz"
    result["authorial_b1_selection_source"] = {"source_plan_sha256": B1_SOURCE_SHA256, "builder_sha256": BUILDER_SHA256,
        "source_kind": "expression_selection_only_no_legacy_model_weights", "control_hz": 300,
        "original_canonical_score_sha256": composition._hash(association.SCORE_PLAN)}
    for before, after in zip(original["events"], result["events"]):
        if before["id"] != FINAL_EVENT and before != after:
            raise ComparisonError("b1_changed_an_unselected_score_event")
        for field in ("start_seconds", "end_seconds", "pitch_hz", "articulation", "steady_loudness_db"):
            if before.get(field) != after.get(field):
                raise ComparisonError("b1_changed_note_timing_pitch_or_level")
    return result


def output_vibrato_evidence(audio: np.ndarray, compiled: dict, controls: dict) -> dict:
    measured = features.extract_features(audio)
    event = next(item for item in compiled["events"] if item["id"] == FINAL_EVENT)
    start = float(event["start_seconds"]) + 0.8 + 0.18
    end = float(event["end_seconds"]) - 0.24
    times = controls["candidate"]["frame_times_seconds"]
    region = (times >= start) & (times <= end)
    valid = region & measured["voiced_mask"] & (measured["pitch_hz"] > 0)
    fraction = float(valid.sum() / region.sum()) if region.any() else 0
    expected = controls["candidate"]["f0_hz_candidate"]
    nominal = float(event["pitch_hz"]) * 2 ** (controls["pitch_shift_semitones"] / 12)
    def fit(pitch):
        t = times[valid]
        if len(t) < 20:
            return None
        cents = 1200 * np.log2(pitch[valid] / nominal)
        design = np.column_stack((np.sin(2 * np.pi * 3.45 * t), np.cos(2 * np.pi * 3.45 * t),
                                  np.ones(len(t)), t - t.mean()))
        beta = np.linalg.lstsq(design, cents, rcond=None)[0]
        estimate = design @ beta
        denominator = float(np.sum((cents - cents.mean()) ** 2))
        return {"amplitude_cents": float(math.hypot(beta[0], beta[1])),
                "r2": 1 - float(np.sum((cents - estimate) ** 2)) / max(denominator, 1e-12),
                "offset_cents": float(beta[2]), "frames": len(t)}
    target, output = fit(expected), fit(measured["pitch_hz"])
    passed = (output is not None and fraction >= VIBRATO_GATE["voiced_fraction_min"]
              and VIBRATO_GATE["amplitude_cents_min"] <= output["amplitude_cents"] <= VIBRATO_GATE["amplitude_cents_max"]
              and output["r2"] >= VIBRATO_GATE["fixed_rate_fit_r2_min"])
    return {"authored_rate_hz": 3.45, "authored_peak_depth_cents": 18.0,
            "authored_onset_within_note_seconds": 0.8, "authored_ramp_seconds": 0.18,
            "authored_end_fade_seconds": 0.24, "region_seconds": [start, end], "voiced_fraction": fraction,
            "input_fixed_rate_fit": target, "output_fixed_rate_fit": output,
            "output_modulation_numerically_observed": passed,
            "estimator": "64ms YIN plus sinusoid/offset/trend least-squares at the authored fixed 3.45Hz; short ~2.2-cycle plateau",
            "rate_independently_estimated": False, "placement_learned": False,
            "not_musicological_or_perceptual_authenticity_evidence": True}


def prefix_comparison(before: np.ndarray, after: np.ndarray) -> dict:
    count = round(PREFIX_SECONDS * 16_000)
    if before.shape != (307_200,) or after.shape != before.shape or not np.all(np.isfinite(after)):
        raise ComparisonError("comparison_waveforms_invalid")
    delta = before[:count].astype(np.float64) - after[:count].astype(np.float64)
    difference = float(np.max(np.abs(delta)))
    changed = np.flatnonzero(np.abs(delta) > PREFIX_ABSOLUTE_TOLERANCE)
    return {"unchanged_prefix_seconds": PREFIX_SECONDS, "prefix_max_abs_difference": difference,
            "prefix_rms_difference": float(np.sqrt(np.mean(delta * delta))),
            "first_changed_prefix_seconds": float(changed[0] / 16_000) if len(changed) else None,
            "prefix_within_tolerance": difference <= PREFIX_ABSOLUTE_TOLERANCE,
            "absolute_tolerance": PREFIX_ABSOLUTE_TOLERANCE}


def run(*, b0_dir: Path, calibration_file: Path, parent_checkpoint_dir: Path,
        checkpoint_dir: Path, upstream_root: Path, output_dir: Path,
        render_device: str = "mps") -> dict:
    if render_device not in ("mps", "cpu"):
        raise ComparisonError("explicit_supported_render_device_required")
    started = time.monotonic()
    for folder in (b0_dir, parent_checkpoint_dir, checkpoint_dir, upstream_root, output_dir):
        calibration.approved_private_path(folder, directory=True)
    calibration.approved_private_path(calibration_file)
    pilot._check_disjoint_report_dir(output_dir, [b0_dir, parent_checkpoint_dir, checkpoint_dir, upstream_root, calibration_file.parent])
    if os.listdir(output_dir):
        raise ComparisonError("fresh_private_comparison_output_required")
    encoder = shutil.which("ffmpeg")
    if encoder is None:
        raise ComparisonError("local_aac_encoder_required")
    with pilot._network_disabled():
        v2._free_space_gate(output_dir, starting=False)
        b0, b0_report_sha = pilot._read_json(b0_dir / composition.REPORT_NAME)
        report, calibration_sha = pilot._read_json(calibration_file)
        snapshot = composition.trial_child_snapshot(checkpoint_dir)
        parent_snapshot = composition.diagnostic.checkpoint_snapshot(parent_checkpoint_dir)
        if (b0.get("schema") != composition.SCHEMA or b0.get("status") != "private_level_calibrated_new_score_ready"
                or b0.get("script_sha256") != composition._hash(Path(composition.__file__))
                or b0.get("calibration_sha256") != calibration_sha
                or b0.get("gate", {}).get("eligible_for_private_composition_preview") is not True
                or b0.get("actual_timbre_model_sha256") != snapshot["checkpoint_sha256"]
                or b0.get("training_report_sha256") != snapshot["training_report_sha256"]
                or b0.get("calibration_model_parent_sha256") != parent_snapshot["checkpoint_sha256"]):
            raise ComparisonError("successful_b0_same_new_model_proof_required")
        archive_name = "private_raw_controls_and_gains.npz"
        payload = pilot._private_file(b0_dir / archive_name, max_bytes=16_777_216)
        if hashlib.sha256(payload).hexdigest() != b0.get("private_archive_sha256", {}).get(archive_name):
            raise ComparisonError("b0_raw_control_archive_changed")
        with np.load(io.BytesIO(payload), allow_pickle=False) as source:
            saved = {key: source[key].copy() for key in source.files}
        compiled_b0, _, current_score_sha = calibration.public_score()
        if b0.get("score_plan_sha256") != current_score_sha or report.get("score_plan_sha256") != current_score_sha:
            raise ComparisonError("canonical_public_b0_score_changed_after_render")
        controls_b0 = renderer.prepare_controls(compiled_b0, report)
        plan_path = output_dir / "b1_final_note_authorial_300hz.json"
        plan_payload = composition._json_bytes(derive_b1_plan())
        v1._atomic_private_bytes(output_dir, plan_path.name, plan_payload, replace=False)
        compiled = _module(association.COMPILER_PATH, "mini_final_vibrato_compiler").compile_plan(plan_path)
        controls = renderer.prepare_controls(compiled, report)
        curve = renderer.authored_output_curve(compiled, controls)
        if (not np.array_equal(controls["candidate"]["f0_hz_candidate"][:1760], controls_b0["candidate"]["f0_hz_candidate"][:1760])
                or not np.array_equal(controls["normalized_loudness"], saved["normalized_loudness"])
                or not np.array_equal(curve, saved["authored_output_curve"])):
            raise ComparisonError("b1_changed_prefix_loudness_or_authored_envelope")
        gain_curve = saved["note_gain_curve"]
        if gain_curve.shape != (307_200,) or not np.all(np.isfinite(gain_curve)) or np.any(gain_curve <= 0):
            raise ComparisonError("b0_note_gain_curve_invalid")
        if float(np.max(np.abs(20 * np.log10(gain_curve)))) > composition.MAX_NOTE_GAIN_DB + 1e-5:
            raise ComparisonError("b0_applied_gain_exceeds_declared_limit")
        torch, DDSP, _, _ = v1._mac_mps_gate(output_dir, upstream_root)
        parent = torch.load(parent_snapshot["_path"], map_location="cpu", weights_only=True)
        checkpoint = torch.load(snapshot["_path"], map_location="cpu", weights_only=True)
        composition._verify_trial_child(checkpoint, snapshot, parent, parent_snapshot, report["binding"])
        model = DDSP(**v2.MODEL_CONFIG)
        model.reverb = torch.nn.Identity()
        model.load_state_dict(checkpoint["model_state"], strict=True)
        model.to(render_device).eval()
        forward_calls = 0
        def synthesize(f0, normalized):
            nonlocal forward_calls
            pitch = torch.from_numpy(f0.copy()).to(render_device).reshape(1, -1, 1)
            loudness = torch.from_numpy(normalized.copy()).to(render_device).reshape(1, -1, 1)
            torch.manual_seed(composition.SEED)
            with torch.no_grad():
                output = model(pitch, loudness).squeeze().detach().cpu().numpy()
            forward_calls += 1
            if output.shape != (307_200,) or not np.all(np.isfinite(output)):
                raise ComparisonError("paired_render_shape_or_finiteness_failed")
            return output
        baseline_raw = saved["model_raw_float32"]
        baseline_corrected = saved["corrected_float32"]
        baseline_raw_metrics = b0["raw_score_metrics"]
        baseline_corrected_metrics = b0["corrected_score_metrics"]
        baseline_gate = b0["gate"]
        engine_comparison = None
        anchor = report["calibration"]["anchor_rms_dbfs"]
        if render_device == "cpu":
            # Render BOTH versions on the same CPU backend. Never compare
            # a new CPU B1 with the old MPS AAC or splice an MPS prefix in.
            baseline_raw = synthesize(saved["f0_hz"], saved["normalized_loudness"])
            baseline_corrected = baseline_raw * curve * gain_curve
            baseline_raw_metrics = renderer.score_metrics(baseline_raw * curve, compiled_b0, controls_b0, anchor)
            baseline_corrected_metrics = renderer.score_metrics(baseline_corrected, compiled_b0, controls_b0, anchor)
            baseline_gate = composition.composition_gate(baseline_raw_metrics, baseline_corrected_metrics, b0["note_level_correction"], baseline_corrected)
            engine_comparison = prefix_comparison(saved["model_raw_float32"], baseline_raw)
        raw = synthesize(controls["candidate"]["f0_hz_candidate"], controls["normalized_loudness"])
        raw_prefix = prefix_comparison(baseline_raw, raw)
        corrected = raw * curve * gain_curve
        corrected_prefix = prefix_comparison(baseline_corrected, corrected)
        raw_metrics = renderer.score_metrics(raw * curve, compiled, controls, anchor)
        corrected_metrics = renderer.score_metrics(corrected, compiled, controls, anchor)
        if time.monotonic() - started > 600:
            raise ComparisonError("paired_comparison_ten_minute_cap")
        gate = composition.composition_gate(raw_metrics, corrected_metrics, b0["note_level_correction"], corrected)
        evidence = output_vibrato_evidence(corrected, compiled, controls)
        gate["checks"].update({"identical_raw_prefix": raw_prefix["prefix_within_tolerance"],
                               "identical_corrected_prefix": corrected_prefix["prefix_within_tolerance"],
                               "same_backend_b0_musical_gates": baseline_gate["eligible_for_private_composition_preview"],
                               "output_final_modulation_observed": evidence["output_modulation_numerically_observed"]})
        listening_gain = 10 ** (b0["uniform_listening_gain_db"] / 20)
        gate["checks"]["same_b0_listening_gain_and_peak"] = (listening_gain <= 16
            and max(float(np.max(np.abs(corrected))), float(np.max(np.abs(baseline_corrected)))) * listening_gain <= 0.90)
        gate["eligible_for_private_composition_preview"] = bool(all(gate["checks"].values()))
        snapshot_after = composition.trial_child_snapshot(checkpoint_dir)
        parent_after = composition.diagnostic.checkpoint_snapshot(parent_checkpoint_dir)
        for before, after in ((snapshot, snapshot_after), (parent_snapshot, parent_after)):
            if any(before[key] != after[key] for key in ("checkpoint_sha256", "checkpoint_marker_sha256", "training_report_sha256", "step")):
                raise ComparisonError("model_lineage_changed_during_comparison")
        _, b0_after = pilot._read_json(b0_dir / composition.REPORT_NAME)
        _, calibration_after = pilot._read_json(calibration_file)
        if b0_after != b0_report_sha or calibration_after != calibration_sha:
            raise ComparisonError("b0_or_calibration_changed_during_comparison")
        archive = composition._np_bytes({"model_raw_float32": raw, "corrected_float32": corrected,
            "paired_b0_model_raw_float32": baseline_raw, "paired_b0_corrected_float32": baseline_corrected,
            "f0_hz": controls["candidate"]["f0_hz_candidate"], "normalized_loudness": controls["normalized_loudness"],
            "authored_output_curve": curve, "reused_b0_note_gain_curve": gain_curve})
        v1._atomic_private_bytes(output_dir, "private_b1_raw_controls.npz", archive, replace=False)
        result = {"schema": SCHEMA, "status": "b1_comparison_blocked", "b0_report_sha256": b0_report_sha,
            "b1_plan_sha256": hashlib.sha256(plan_payload).hexdigest(), "source_expression_b1_sha256": B1_SOURCE_SHA256,
            "source_builder_sha256": BUILDER_SHA256, "legacy_model_weights_read": False,
            "actual_timbre_model_sha256": snapshot["checkpoint_sha256"], "checkpoint_total_step": snapshot["total_step"],
            "calibration_sha256": calibration_sha, "model_forward_calls": forward_calls, "source_waveforms_read": 0,
            "render_device": render_device, "dtype": "float32", "wall_seconds_before_encoding": time.monotonic() - started,
            "same_backend_paired_b0_raw_metrics": baseline_raw_metrics,
            "same_backend_paired_b0_corrected_metrics": baseline_corrected_metrics,
            "old_mps_b0_vs_new_cpu_b0_prefix": engine_comparison,
            "raw_model_internal_feasibility_passed": b0["raw_model_internal_status"]["raw_internal_feasibility_passed"],
            "reused_b0_note_gain_curve_sha256": hashlib.sha256(np.ascontiguousarray(gain_curve).tobytes()).hexdigest(),
            "uniform_listening_gain_db": b0["uniform_listening_gain_db"], "pitch_shift_semitones": controls["pitch_shift_semitones"],
            "raw_prefix": raw_prefix, "corrected_prefix": corrected_prefix, "final_vibrato_evidence": evidence,
            "raw_score_metrics": raw_metrics, "corrected_score_metrics": corrected_metrics, "gate": gate,
            "private_b1_archive_sha256": hashlib.sha256(archive).hexdigest(), "script_sha256": composition._hash(Path(__file__)),
            "limits": ["Vibrato shape and placement are inherited authorial choices, not learned decisions.",
                       "Same new ML model, render backend, B0 note gains, uniform listening gain and noise seed; only final-note F0 changes.",
                       "CPU paired mode regenerates both performances; it does not assert waveform equality with the older MPS run.",
                       "Short-region pitch estimator is acoustic evidence, not proof of authentic daegeum interpretation.",
                       "Private AI Hub 71470 research only, no game output or external model validation claim."]}
        if gate["eligible_for_private_composition_preview"]:
            wav = renderer._wav_bytes(corrected * listening_gain)
            v1._atomic_private_bytes(output_dir, "b1_final_vibrato.wav", wav, replace=False)
            audio_path = output_dir / "b1_final_vibrato.m4a"
            encoded = subprocess.run([encoder, "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-i",
                str(output_dir / "b1_final_vibrato.wav"), "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
                "-movflags", "+faststart", str(audio_path)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60)
            if encoded.returncode or not audio_path.is_file() or not 0 < audio_path.stat().st_size < 4_194_304:
                raise ComparisonError("private_comparison_aac_encoding_failed")
            audio_path.chmod(0o600)
            if render_device == "cpu":
                b0_wav = renderer._wav_bytes(baseline_corrected * listening_gain)
                v1._atomic_private_bytes(output_dir, "b0_straight.wav", b0_wav, replace=False)
                b0_path = output_dir / "b0_straight.m4a"
                encoded_b0 = subprocess.run([encoder, "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-i",
                    str(output_dir / "b0_straight.wav"), "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
                    "-movflags", "+faststart", str(b0_path)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60)
                if encoded_b0.returncode or not b0_path.is_file() or not 0 < b0_path.stat().st_size < 4_194_304:
                    raise ComparisonError("paired_cpu_b0_aac_encoding_failed")
                b0_path.chmod(0o600)
                b0_aac = pilot._private_file(b0_path, max_bytes=4_194_304)
                result["same_backend_b0_wav_sha256"] = hashlib.sha256(b0_wav).hexdigest()
            else:
                b0_aac = pilot._private_file(b0_dir / "new_score_level_calibrated.m4a", max_bytes=4_194_304)
                if hashlib.sha256(b0_aac).hexdigest() != b0["audio_aac_sha256"]:
                    raise ComparisonError("b0_listening_audio_changed")
                v1._atomic_private_bytes(output_dir, "b0_straight.m4a", b0_aac, replace=False)
            result.update({"status": "private_b0_b1_comparison_ready", "b0_aac_sha256": hashlib.sha256(b0_aac).hexdigest(),
                           "b0_audio_source": "fresh_matched_cpu_render" if render_device == "cpu" else "private_copy_of_existing_mps_b0",
                           "b1_wav_sha256": hashlib.sha256(wav).hexdigest(), "b1_aac_sha256": composition._hash(audio_path)})
            html = ("<!doctype html><html lang='ko'><meta charset='utf-8'><title>새 선율 대금 비교</title>"
                "<body style='font:18px system-ui;padding:28px;max-width:780px'><h1>새 8마디 대금 — 마지막 음 비교</h1>"
                "<p>학습 음색으로 새 선율을 연주했습니다. 호흡·음별 음량은 악보와 보정 곡선에서 지정했습니다.</p>"
                "<h2>① 평음</h2><audio id='b0' controls preload='metadata' src='b0_straight.m4a'></audio>"
                "<button onclick=\"document.getElementById('b0').currentTime=16.8\">마지막 음부터</button>"
                "<h2>② 마지막 음에 얕은 비브라토</h2><audio id='b1' controls preload='metadata' src='b1_final_vibrato.m4a'></audio>"
                "<button onclick=\"document.getElementById('b1').currentTime=16.8\">마지막 음부터</button>"
                "<p>앞부분은 같은 연주이며 음량 보정도 같습니다. 비브라토 위치·모양은 이전에 작성한 규칙을 사용했습니다.</p>"
                "<p>AI Hub 국악 악보 및 음원 데이터(71470)로 학습한 로컬 연구용 시험본입니다. 게임 확정본이나 모델 전체 검증 합격을 뜻하지 않습니다.</p>"
                "<script>const all=document.querySelectorAll('audio');all.forEach(a=>a.addEventListener('play',()=>all.forEach(b=>{if(a!==b)b.pause()})))</script></body></html>").encode()
            v1._atomic_private_bytes(output_dir, "listen.html", html, replace=False)
        v1._atomic_private_bytes(output_dir, REPORT_NAME, composition._json_bytes(result), replace=False)
        return {"status": result["status"], "model_forward_calls": forward_calls, "render_device": render_device,
                "output_vibrato_amplitude_cents": evidence.get("output_fixed_rate_fit", {}).get("amplitude_cents") if evidence.get("output_fixed_rate_fit") else None,
                "unchanged_prefix_seconds": PREFIX_SECONDS, "shared_b0_gain": True}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("b0-dir", "calibration-file", "parent-checkpoint-dir", "checkpoint-dir", "upstream-root", "output-dir"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--render-device", choices=("mps", "cpu"), default="mps")
    args = parser.parse_args()
    try:
        result = run(**vars(args))
    except (ComparisonError, composition.CompositionError, calibration.CalibrationError, renderer.RenderError,
            composition.diagnostic.DiagnosticError, v1.TrialError, v2.V2Error, pilot.PilotError, composition.child.ContinuationError) as exc:
        result = {"status": "blocked", "reason": str(exc)}
    except Exception:
        result = {"status": "blocked", "reason": "unexpected_private_final_vibrato_comparison_error"}
    print(json.dumps(result, sort_keys=True))
    return 2 if result["status"] == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
