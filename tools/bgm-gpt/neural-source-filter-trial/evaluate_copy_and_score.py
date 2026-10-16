#!/usr/bin/env python3
"""Explicit private NSF inference: two reused-file copy crops and one new score.

Only an operator runs this CLI. Copy diagnostics are not blind or music-quality
evidence. A new authored score is never a source-waveform stitch. The separate
sample-domain written-rest mask is authorial DSP, never learned breathing.
"""
import argparse
import importlib.util
import json
import math
import os
from pathlib import Path
import sys

import numpy as np
import soundfile as sf
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "foundation-model-trial"))
from ace_limits import ResourceCaps, ResourceGuard
from prepare_inputs import fresh_private_dir
import nsf_lite
import nsf_losses
import nsf_pilot_data as data

SCHEMA = "mini.public-ngc-nsf-scratch-pilot.v1"
CONFIG = {"channels": 16, "dilations": [1, 2, 4, 8, 16, 32], "harmonics": 8,
          "fir_taps": 65, "sample_rate": 24000, "control_hz": 100}
COMPILER = HERE.parents[1] / "score-expression/compile_expression.py"
AUDIO_BUDGET = 15_000_000


def validate_checkpoint(state, metadata, loaded, metadata_sha, manifest_sha):
    if (state.get("schema") != SCHEMA or metadata.get("schema") != SCHEMA
            or state.get("metadata_sha256") != metadata_sha
            or state.get("manifest_sha256") != manifest_sha or loaded["manifest_sha256"] != manifest_sha
            or state.get("model_config") != CONFIG or metadata.get("model_config") != CONFIG
            or state.get("nsf_lite_sha256") != data.digest(nsf_lite.__file__)
            or not isinstance(state.get("step"), int) or not 0 <= state["step"] <= 1500):
        raise ValueError("fixed_nsf_checkpoint_metadata_or_source_mismatch")
    for key in ("target_gain", "target_gain_db", "fit_voiced_rms_db_median_scaled"):
        if not (math.isfinite(state[key]) and state[key] == metadata["data"][key] == loaded[key]):
            raise ValueError("fit_only_calibration_mismatch")
    if metadata["data"]["manifest_sha256"] != manifest_sha:
        raise ValueError("training_manifest_mismatch")


def heldout_copy_windows(heldout, gain):
    if len(heldout) != 2 or any(len(row["pitch_hz"]) < 300 for row in heldout):
        raise ValueError("two_heldout_files_with_fixed_2_to_3second_crops_required")
    results = []
    for index, row in enumerate(heldout):
        target, controls = data.batch_from_windows([(row, 200, 100)], gain)
        results.append((target, controls, {"source_sha256": row["source_sha256"],
            "start_frame": 200, "frames": 100, "seconds": [2., 3.],
            "noise_seed": data.SEED + 200000 + index, "not_blind_same_file_as_training_validation": True,
            "distinct_from_validation_first_second": True, "source_static_gain": gain}))
    return results


def compile_score_controls(plan_path, anchor_db):
    spec = importlib.util.spec_from_file_location("nsf_authorial_compiler", COMPILER)
    compiler = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(compiler)
    compiled = compiler.compile_plan(plan_path)
    if compiled["control_hz"] != 300 or not math.isclose(compiled["duration_seconds"], 19.2):
        raise ValueError("canonical_300hz_19p2second_score_required")
    choose = slice(0, 5760, 3)  # Exclude compiler's terminal 19.2s control row.
    pitch = compiled["f0_hz"][choose].copy() * 2**(2 / 12)
    voice = compiled["voicing"][choose].copy()
    voice[pitch <= 0] = 0  # Compiler RELEASE has F0=0 but a fading voicing proxy.
    active = compiled["voicing"][choose].copy()
    times = np.arange(1920) / 100
    for event in compiled["events"]:
        if event["articulation"] == "release":
            active[(times >= event["start_seconds"]) & (times < event["end_seconds"])] = 0
    loudness = np.clip(anchor_db + compiled["loudness_db"][choose] + 29., -120, 6)
    controls = [torch.from_numpy(np.asarray(column, dtype=np.float32).copy())[None]
                for column in (pitch, loudness, voice, active)]
    nsf_lite.validate_controls(*controls)
    return controls, {"duration_seconds": 19.2, "control_frames": 1920, "pitch_shift_semitones": 2,
        "fit_voiced_rms_anchor_dbfs": anchor_db, "relative_plan_steady_dbfs": -29,
        "control_selection": "300Hz rows0,3,...5757;100Hz left hold; terminal row excluded",
        "voicing": "compiled harmonic voicing on pitched rows; F0zero RELEASE rows set unvoiced",
        "active": "separate authored compiled-voicing curve, zero on written rests; not RMS threshold",
        "events": compiled["events"], "authored_vibrato_retention_not_yet_measured": True}


def authored_rest_gate(audio, events, sample_rate=24000):
    result = np.asarray(audio, dtype=np.float32).copy()
    envelope = np.ones(len(result), dtype=np.float64)
    fade = round(.010 * sample_rate)
    intervals = []
    for event in events:
        if event["articulation"] != "release":
            continue
        start = math.ceil(event["start_seconds"] * sample_rate)
        end = math.ceil(event["end_seconds"] * sample_rate)
        a, b = max(0, start - fade), min(len(result), end + fade)
        u = np.clip((start - np.arange(a, start)) / fade, 0, 1)
        envelope[a:start] *= u**3 * (10 - 15 * u + 6 * u*u)
        envelope[start:end] = 0
        u = np.clip((np.arange(end, b) - end) / fade, 0, 1)
        envelope[end:b] *= u**3 * (10 - 15 * u + 6 * u*u)
        intervals.append({"start_sample": start, "end_sample": end})
    result *= envelope.astype(np.float32)
    return result, {"sample_rate_hz": sample_rate, "intervals": intervals, "fade_seconds": .010,
        "method": "10ms minimum-jerk release before each rest, exact written-rest zero,10ms attack after",
        "learned_breathing": False, "time_or_f0_shift": False}


def audio_metrics(predicted, target=None):
    if predicted.ndim != 3 or predicted.shape[1] != 1 or not bool(torch.isfinite(predicted).all()):
        raise ValueError("finite_batch_mono_output_required")
    predicted = predicted.detach().float().cpu()
    rms = float(predicted.square().mean().sqrt())
    result = {"finite": True, "frames": predicted.shape[-1], "rms": rms,
              "peak": float(predicted.abs().max()), "quality_approved": False}
    if target is not None:
        _total, terms = nsf_losses.nsf_loss(predicted, target)
        target_rms = float(target.float().cpu().square().mean().sqrt())
        result.update(target_rms=target_rms, rms_delta_db=20 * math.log10(max(rms, 1e-12) / max(target_rms, 1e-12)),
            mrstft_spectral_convergence=float(terms["spectral_convergence"]),
            mrstft_log_magnitude_l1=float(terms["log_magnitude_l1"]),
            rms_db_l1=float(terms["rms_db_l1"]))
    return result


def save_wave(output, filename, audio, rate):
    path = output / filename
    if path.exists() or not np.isfinite(audio).all():
        raise ValueError("fresh_finite_audio_output_required")
    sf.write(path, audio, rate, format="WAV", subtype="FLOAT")
    path.chmod(0o600)
    if sum(p.stat().st_size for p in output.glob("*.wav")) > AUDIO_BUDGET:
        raise ValueError("fifteen_megabyte_audio_budget_exceeded")
    return {"file": filename, "sha256": data.digest(path), "bytes": path.stat().st_size,
            "sample_rate_hz": rate, "format": "WAV_FLOAT", "frames": len(audio)}


def run(args):
    os.umask(0o077)
    output = fresh_private_dir(args.output)
    report = {"schema": "mini.nsf-copy-and-authorial-score-evaluation.v1", "status": "started",
              "model_forward_calls": 0, "quality_approved": False, "external_transfer": False}
    report_path = output / "evaluation_report.json"
    def write_report():
        with report_path.open("w") as handle:
            json.dump(report, handle, indent=2, ensure_ascii=False, allow_nan=False)
    write_report()
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=600)):
            if args.device == "mps" and not torch.backends.mps.is_available():
                raise ValueError("explicit_mps_unavailable_no_fallback")
            fit, heldout, binding = data.load_dataset(args.data_manifest)
            checkpoint, plan = args.checkpoint.resolve(strict=True), args.plan.resolve(strict=True)
            meta_path, train_report_path = checkpoint.parent / "metadata.json", checkpoint.parent / "report.json"
            metadata, training = (json.loads(p.read_text()) for p in (meta_path, train_report_path))
            bindings = {**binding["input_bindings"], **metadata["code_sha256"], str(checkpoint): data.digest(checkpoint),
                str(plan): data.digest(plan), str(meta_path): data.digest(meta_path),
                str(train_report_path): data.digest(train_report_path), str(COMPILER): data.digest(COMPILER),
                str(Path(__file__)): data.digest(__file__)}
            state = torch.load(checkpoint, map_location="cpu", weights_only=True)
            validate_checkpoint(state, metadata, binding, bindings[str(meta_path)], binding["manifest_sha256"])
            markers = [training.get(key, {}) for key in ("best", "latest")]
            if (training.get("status") not in ("completed_not_quality_approved", "time_limit_partial_no_auto_continuation")
                    or not any(m.get("file") == checkpoint.name and m.get("sha256") == bindings[str(checkpoint)]
                               and m.get("step") == state["step"] for m in markers)):
                raise ValueError("finished_report_bound_checkpoint_required")
            data.verify_bindings(bindings)
            torch.set_num_threads(1)
            model = nsf_lite.NSFLite().to(args.device)
            model.load_state_dict(state["state_dict"], strict=True)
            model.eval()
            report.update(checkpoint_sha256=bindings[str(checkpoint)], checkpoint_step=state["step"],
                metadata_sha256=bindings[str(meta_path)], manifest_sha256=binding["manifest_sha256"],
                plan_sha256=bindings[str(plan)], model_config=CONFIG, device=args.device,
                source_credit=binding["source_credit"], license_scope=binding["license_scope"],
                target_gain=binding["target_gain"], target_gain_db=binding["target_gain_db"], copy_diagnostics=[])
            with torch.inference_mode():
                for index, (target, controls, facts) in enumerate(heldout_copy_windows(heldout, binding["target_gain"]), 1):
                    predicted, _ = model(*controls, noise_seed=facts["noise_seed"])
                    report["model_forward_calls"] += 1
                    if predicted.shape != target.shape:
                        raise ValueError("source_copy_output_length_mismatch")
                    files = [save_wave(output, f"heldout{index}_{name}_1s_24k.wav", value.detach().cpu().numpy()[0, 0], 24000)
                             for name, value in (("source_static_gain", target), ("prediction", predicted))]
                    report["copy_diagnostics"].append({**facts, "metrics": audio_metrics(predicted, target), "audio": files})
                controls, score = compile_score_controls(plan, binding["fit_voiced_rms_db_median_scaled"])
                predicted, _ = model(*controls, noise_seed=data.SEED + 300000)
                report["model_forward_calls"] += 1
                if predicted.shape != (1, 1, 460800):
                    raise ValueError("one_pass_19p2_second_score_output_required")
                raw = predicted.detach().cpu().numpy()[0, 0]
                gated, gate = authored_rest_gate(raw, score["events"])
                from scipy.signal import resample_poly
                high = np.repeat(resample_poly(gated, 2, 1)[:, None], 2, axis=1)
                high_intervals = []
                for event in score["events"]:
                    if event["articulation"] == "release":
                        a, b = (math.ceil(event[key] * 48000) for key in ("start_seconds", "end_seconds"))
                        high[a:b] = 0
                        high_intervals.append({"start_sample": a, "end_sample": b})
                files = [save_wave(output, "new_score_before_sample_rest_gate_24k.wav", raw, 24000),
                    save_wave(output, "new_score_authored_rest_gate_24k.wav", gated, 24000),
                    save_wave(output, "new_score_authored_rest_gate_48k_stereo.wav", high, 48000)]
                score.pop("events")
                report["new_authorial_score"] = {**score, "seed": data.SEED + 300000,
                    "source_waveform_segments_reused": 0, "model_forward_calls": 1,
                    "raw_metrics": audio_metrics(predicted), "sample_domain_authored_rest_gate": gate,
                    "resampled_rest_intervals_48k": high_intervals,
                    "resampling": "24k to48k polyphase,dualmono FLOAT;written-rest intervals re-zeroed after SRC only",
                    "audio": files, "numerical_score_preservation_evaluated": False}
            data.verify_bindings(bindings)
            report.update(status="rendered_not_listening_approved", immutable_inputs_unchanged=True,
                audio_bytes=sum(p.stat().st_size for p in output.glob("*.wav")),
                limits=["Copy crops reuse training-validation source files, not blind unseen-file evidence.",
                        "MRSTFT/RMS are diagnostics, not naturalness or timbre-identity claims.",
                        "New-score F0,expression and rests are authored; model learned no composition or breath placement."])
    except BaseException as exc:
        report.update(status="failed", error_type=type(exc).__name__, error=str(exc)[:1500])
        raise
    finally:
        write_report()
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("checkpoint", "data-manifest", "plan", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--device", choices=("cpu", "mps"), required=True)
    run(parser.parse_args())
