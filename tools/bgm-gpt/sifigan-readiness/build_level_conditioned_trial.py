#!/usr/bin/env python3
"""EXPLICIT reference-derived level conditioning: not a learned level model.

This copy diagnostic supplies the source RMS curve to a separate carrier-only
gain controller. It demonstrates condition tracking, not independent music
generation, new raw-vocoder quality, or successful envelope prediction.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time

import numpy as np
import export_corpus_audition as saved
import level_metrics
import pilot_metrics
import prepare_corpus

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "foundation-model-trial"))
from ace_limits import GIB, ResourceCaps, ResourceGuard

RATE, HOP, WINDOW, FLOOR, MAX_BYTES = 24000, 120, 480, 1e-5, 20_000_000


def extract_curve(wave):
    """Centered20ms RMS dBFS on the5ms grid, reflected edges, -100dB floor."""
    wave = np.asarray(wave, dtype=np.float64)
    if wave.ndim != 1 or len(wave) < HOP or len(wave) % HOP or not np.isfinite(wave).all():
        raise ValueError("finite_mono_whole5ms_frames_required")
    frames = np.lib.stride_tricks.sliding_window_view(np.pad(wave, (240, 240), mode="reflect"), WINDOW)
    frames = frames[:len(wave):HOP]
    return 20 * np.log10(np.maximum(np.sqrt(np.mean(frames * frames, axis=1)), FLOOR))


def apply_curve(carrier, desired_db):
    """No reference waveform argument; desired_db is explicit level control."""
    wave = np.asarray(carrier, dtype=np.float64)
    measured = extract_curve(wave)
    desired = np.asarray(desired_db, dtype=np.float64)
    if desired.shape != measured.shape or not np.isfinite(desired).all():
        raise ValueError("finite_level_condition_on_same5ms_grid_required")
    raw = desired - measured
    bounded = np.clip(raw, -60., 60.)
    smoothed = np.convolve(np.pad(bounded, (1, 1), mode="edge"), np.array([.25, .5, .25]), mode="valid")
    sample_gain_db = np.interp(np.arange(len(wave)) / HOP, np.arange(len(smoothed)), smoothed)
    result = (wave * 10 ** (sample_gain_db / 20)).astype(np.float32)
    if not np.isfinite(result).all():
        raise ValueError("nonfinite_level_conditioned_output")
    controls = dict(desired_level_dbfs=desired.copy(), measured_carrier_level_dbfs=measured,
        desired_gain_db=raw, bounded_gain_db=bounded, smoothed_gain_db=smoothed)
    return result, controls


def write_npz(path, **arrays):
    with path.open("xb") as handle:
        np.savez_compressed(handle, **arrays)
    path.chmod(0o600)
    return dict(file=path.name, sha256=saved.sha256(path), bytes=path.stat().st_size)


def diagnostics(wave, reference, reference_diag):
    rd, gd = reference_diag, prepare_corpus.diagnostics(wave)
    return dict(pitch=pilot_metrics.summary(wave, reference, rd["yin_hz"], rd["periodicity"],
        gd["yin_hz"], gd["periodicity"], rd["rms_db"], gd["rms_db"]),
        level=level_metrics.summary(wave, reference, rd["rms_db"], gd["rms_db"]))


def build(parent_report, output, compare_fn=None):
    output = Path(output)
    if not output.is_absolute() or output.is_symlink() or output.exists():
        raise ValueError("fresh_absolute_private_output_required")
    root = saved.PRIVATE_ROOT.resolve(strict=True)
    if output.resolve() == root or not output.resolve().is_relative_to(root):
        raise ValueError("private_gpt_output_required")
    output.mkdir(mode=0o700)
    started, previous_umask = time.monotonic(), os.umask(0o077)
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=120, max_rss_bytes=2 * GIB)) as guard:
            parent, selected, bindings, checkpoints = saved.validate_inputs(parent_report)
            for path, checksum in parent["input_bindings"].items():
                saved.bound(Path(path), checksum, bindings)
            for path in (Path(__file__).resolve(), Path(saved.__file__).resolve(), saved.HELPER,
                    Path(prepare_corpus.__file__).resolve(), Path(pilot_metrics.__file__).resolve(),
                    Path(level_metrics.__file__).resolve(), HERE.parent / "foundation-model-trial/ace_limits.py"):
                bindings[str(path)] = saved.sha256(path)
            compare_fn = saved.load_comparator() if compare_fn is None else compare_fn
            report = dict(schema="mini.sifigan-explicit-level-conditioned-trial.v1", status="started",
                reference_envelope_used=True, sourcecurveused=True, amplitude_condition_NOT_learned=True,
                training=False, model_loaded_or_run=False, AGC=True, output_postprocessing=True,
                new_score_or_music=False, heldout_is_blind=False, quality_approved=False, perceptually_approved=False,
                independent_envelope_prediction_or_copy_generalization_test=False,
                original_vocoder_normalizer_changed=False, original_pitch_controls_edited=False,
                source_PCM_mixed_into_output=False, hard_mute_or_gate=False, EQ_or_pitch_or_time_edits=False,
                trial_role="EXPLICIT same-source reference-level curve COPY DIAGNOSTIC; controller condition tracking only",
                parent_report_path=str(parent_report), input_bindings=bindings, carrier_checkpoints=checkpoints,
                source_credit=saved.CREDIT, params=dict(rate=RATE, hop=HOP, rms_window=WINDOW,
                    reflect_padding_samples=240, amplitude_floor=FLOOR, gain_bounds_db=[-60., 60.],
                    log_gain_smoothing=[.25, .5, .25], smoothing_padding="edge", sample_interpolation="linear_frame_index_to_sample/120",
                    rms_future_context_ms=10, gain_smoothing_future_context_ms=5,
                    waveform_time_shift_samples=0, offline_noncausal=True),
                constraints=["The reference RMS curve IS used. No learned head or independent envelope prediction is being claimed.",
                    "apply_curve accepts carrier + separate desired-level control, not the reference waveform.",
                    "Only gain is changed; carrier timbre/pitch defects may remain. No new score or new raw-vocoder training.",
                    "Raw diagnostics use independent64ms RMS, not the20ms condition. No parameter tuning in this trial.",
                    "AAC display uses an additional constant per-file LUFS gain only, not another dynamic processor.",
                    "Centered RMS/smoothing uses future samples; zero time shift is not real-time zero latency."], cases=[], pairs=[])
            for source in selected:
                case, before, reference = source["case"], source["generated"], source["reference"]
                before_bytes = before.tobytes()
                # COPY-DIAGNOSTIC wrapper: source reference deliberately supplies
                # the explicit condition; it is not hidden in the runtime API.
                desired = extract_curve(reference)
                after, controls = apply_curve(before, desired)
                if before.tobytes() != before_bytes:
                    raise ValueError("saved_parent_carrier_mutated")
                condition = write_npz(output / (case + "_EXPLICIT_REFERENCE_level_condition.npz"), desired_level_dbfs=desired)
                control_file = write_npz(output / (case + "_applied_level_controls.npz"), **controls)
                rd = prepare_corpus.diagnostics(reference)
                entry = dict(case=case, original_path=source["original_path"], original_sha256=source["original_sha256"],
                    corpus_npz_path=source["corpus_npz_path"], corpus_npz_sha256=source["corpus_npz_sha256"],
                    carrier_path=source["reconstruction_path"], carrier_sha256=source["reconstruction_sha256"],
                    source_reference_is_byte_exact_corpus=True, before_is_byte_exact_parent1000=True,
                    condition=condition, controls=control_file,
                    condition_array_sha256=hashlib.sha256(desired.tobytes()).hexdigest(),
                    before_PCM_sha256=hashlib.sha256(before.tobytes()).hexdigest(),
                    after_PCM_sha256=hashlib.sha256(after.tobytes()).hexdigest(),
                    limited_gain_frames=int(np.count_nonzero(np.abs(controls["desired_gain_db"]) > 60)),
                    smoothed_gain_min_max_db=[float(controls["smoothed_gain_db"].min()), float(controls["smoothed_gain_db"].max())])
                native = []
                for stage, wave in (("before", before), ("after", after)):
                    entry[stage] = dict(write_npz(output / (stage + "_" + case + "_reconstruction.npz"),
                        generated=wave, reference=reference), diagnostics=diagnostics(wave, reference, rd))
                    wav = output / (stage + "_" + case + "_24k_mono.wav")
                    saved.write_float_wav(wav, wave)
                    native.append(wav)
                report["cases"].append(entry)
                labels = ("OLD_global1000_CARRIER", "NEW_EXPLICIT_REFERENCE_LEVEL_CONDITIONED_SAME_CARRIER_NOT_LEARNED")
                destination = output / case
                comparison = compare_fn([label + "=" + str(path) for label, path in zip(labels, native)], destination, seconds=4.8)
                if (comparison.get("schema") != "mini.foundation-local-static-lufs-comparison.v1" or comparison.get("status") != "ready"
                        or comparison.get("seconds") != 4.8 or comparison.get("no_compression_AGC_EQ_pitch_time_edits") is not True
                        or [row["label"] for row in comparison["outputs"]] != list(labels)):
                    raise ValueError("frozen_static_LUFS_display_helper_required")
                outputs = []
                for row in comparison["outputs"]:
                    path = saved.local_child(destination, row["file"], 5_000_000)
                    if saved.sha256(path) != row["sha256"]:
                        raise ValueError("encoded_audition_hash_changed")
                    outputs.append(dict(row, path=str(path), perceptually_approved=False))
                comparison_path = saved.local_child(destination, "comparison.json", 5_000_000)
                report["pairs"].append(dict(case=case, outputs=outputs,
                    native_wavs=[dict(path=str(path), sha256=saved.sha256(path)) for path in native],
                    comparison_path=str(comparison_path), comparison_sha256=saved.sha256(comparison_path)))
            if any(saved.sha256(path) != checksum for path, checksum in bindings.items()):
                raise ValueError("parent_source_corpus_model_or_code_changed")
            report.update(status="explicit_reference_condition_trial_ready_not_perceptually_approved",
                inputs_unchanged=True, elapsed_seconds=time.monotonic() - started, resources=guard.snapshot())
            payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
            if sum(path.stat().st_size for path in output.rglob("*") if path.is_file()) + len(payload) > MAX_BYTES:
                raise ValueError("20MB_trial_output_cap")
            with (output / "report.json").open("xb") as handle:
                handle.write(payload)
            (output / "report.json").chmod(0o600)
    finally:
        os.umask(previous_umask)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = build(args.parent_report, args.output)
    print(json.dumps(dict(status=result["status"], reference_envelope_used=True,
        amplitude_condition_NOT_learned=True, pairs=len(result["pairs"]))))
