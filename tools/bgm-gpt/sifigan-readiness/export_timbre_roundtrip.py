#!/usr/bin/env python3
"""Four-way Arirang copy diagnostic with EXPLICIT reference-level control.

This exporter loads no learned model and runs no WORLD synthesis. It preserves
the raw round-trip evidence, applies the same source-derived RMS condition to
the three generated carriers, then uses only static LUFS display gains.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time

import numpy as np
import build_level_conditioned_trial as level_trial
import export_corpus_audition as saved
import level_metrics
import pilot_metrics
import prepare_corpus

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "foundation-model-trial"))
from ace_limits import GIB, ResourceCaps, ResourceGuard

MAX_BYTES = 8_000_000
PRIMARY = "arirang001"
RAW_KEYS = ("original_reference", "saved_SiFiGAN_global1000", "full_sp_full_ap",
            "compact_sp_full_ap", "full_sp_compact_ap", "compact_sp_compact_ap")
CARRIERS = (("full_sp_full_ap", "fullWORLD_REFERENCE_LEVEL_CONDITIONED"),
            ("compact_sp_compact_ap", "compactWORLD_REFERENCE_LEVEL_CONDITIONED"),
            ("saved_SiFiGAN_global1000", "savedSiFiGAN1000_REFERENCE_LEVEL_CONDITIONED"))
LABELS = ("original_reference",) + tuple(label for _, label in CARRIERS)


def array_hash(value):
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def directory_bytes(output):
    return sum(path.stat().st_size for path in Path(output).rglob("*") if path.is_file())


def validate_roundtrip(roundtrip_report, parent_report):
    """Independently bind both cases and require exact frozen source/carrier PCM."""
    roundtrip_report = saved.regular(roundtrip_report, 5_000_000)
    parent_report = saved.regular(parent_report, 5_000_000)
    raw = json.loads(roundtrip_report.read_text())
    if (raw.get("schema") != "mini.sifigan-world-timbre-roundtrip.v1"
            or raw.get("status") != "roundtrip_diagnostic_complete_not_perceptually_approved"
            or raw.get("parent_report_path") != str(parent_report)
            or raw.get("inputs_unchanged") is not True):
        raise ValueError("completed_bound_same_parent_roundtrip_required")
    for flag in ("training", "learned_model_loaded_or_run", "public_weights_used", "GPU_used", "Torch_imported",
                 "new_score_or_music", "heldout_is_blind", "quality_approved", "perceptually_approved",
                 "source_PCM_mixed_into_synthesis", "EQ_AGC_gain_pitch_time_edit"):
        if raw.get(flag) is not False:
            raise ValueError("unaltered_unapproved_CPU_roundtrip_required:" + flag)
    if raw.get("WORLD_synthesis_performed") is not True:
        raise ValueError("actual_completed_WORLD_roundtrip_required")
    inherited = raw.get("input_bindings", {})
    if inherited.get(str(parent_report)) != saved.sha256(parent_report):
        raise ValueError("roundtrip_parent_report_hash_disagrees")
    parent, selected, bindings, checkpoints = saved.validate_inputs(parent_report)
    saved.bound(roundtrip_report, saved.sha256(roundtrip_report), bindings, 5_000_000)
    for path, checksum in inherited.items():
        saved.bound(Path(path), checksum, bindings)
    rows = raw.get("cases", [])
    if len(rows) != 2 or {row.get("case") for row in rows} != set(saved.CASES):
        raise ValueError("exact_two_bound_roundtrip_cases_required")
    primary = None
    for source in selected:
        case = source["case"]
        row = next(item for item in rows if item["case"] == case)
        for key in ("original_path", "original_sha256", "corpus_npz_path", "corpus_npz_sha256"):
            if row.get(key) != source[key]:
                raise ValueError("roundtrip_original_or_corpus_identity_disagrees")
        if (row.get("saved_carrier_path") != source["reconstruction_path"]
                or row.get("saved_carrier_sha256") != source["reconstruction_sha256"]):
            raise ValueError("roundtrip_saved_carrier_identity_disagrees")
        checks = row.get("byte_exact_corpus_checks", {})
        if any(checks.get(key) is not True for key in ("f0", "cf0", "features", "decoded_PCM", "reference_PCM")):
            raise ValueError("byte_exact_raw_conditioning_checks_required")
        files = {}
        for key in ("raw_waveforms", "controls"):
            item = row[key]
            path = saved.local_child(roundtrip_report.parent, item["file"], 40_000_000)
            if path.stat().st_size != item["bytes"]:
                raise ValueError("roundtrip_artifact_size_changed")
            saved.bound(path, item["sha256"], bindings, 40_000_000)
            files[key] = path
        with np.load(files["raw_waveforms"], allow_pickle=False) as archive:
            waves = {name: archive[name].copy() for name in RAW_KEYS}
        for name, wave in waves.items():
            if (wave.dtype != np.float32 or wave.shape != (saved.SAMPLES,)
                    or not np.isfinite(wave).all()):
                raise ValueError("exact_finite_float32_roundtrip_waveforms_required")
            if row.get("waveform_hashes", {}).get(name) != array_hash(wave):
                raise ValueError("roundtrip_waveform_array_hash_changed")
        if (waves["original_reference"].tobytes() != source["reference"].tobytes()
                or waves["saved_SiFiGAN_global1000"].tobytes() != source["generated"].tobytes()):
            raise ValueError("roundtrip_reference_or_saved1000_not_byte_exact")
        if case == PRIMARY:
            primary = dict(source=source, row=row, waves=waves)
    return raw, parent, primary, bindings, checkpoints


def export(roundtrip_report, parent_report, output, compare_fn=None):
    output = Path(output)
    if not output.is_absolute() or output.is_symlink() or output.exists():
        raise ValueError("fresh_absolute_private_export_required")
    root = saved.PRIVATE_ROOT.resolve(strict=True)
    if output.resolve() == root or not output.resolve().is_relative_to(root):
        raise ValueError("approved_private_export_root_required")
    if "torch" in sys.modules:
        raise ValueError("fresh_noTorch_CPU_export_process_required")
    raw, _, primary, bindings, checkpoints = validate_roundtrip(roundtrip_report, parent_report)
    for path in (Path(__file__).resolve(), Path(saved.__file__).resolve(), saved.HELPER,
                 Path(level_trial.__file__).resolve(), Path(level_metrics.__file__).resolve(),
                 Path(pilot_metrics.__file__).resolve(), Path(prepare_corpus.__file__).resolve(),
                 HERE / "prepare_real_features.py", HERE.parent / "foundation-model-trial/ace_limits.py"):
        bindings[str(path)] = saved.sha256(path)
    compare_fn = saved.load_comparator() if compare_fn is None else compare_fn
    output.mkdir(mode=0o700)
    started, previous = time.monotonic(), os.umask(0o077)
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=120, max_rss_bytes=2 * GIB)) as guard:
            reference = primary["waves"]["original_reference"]
            reference_before = reference.tobytes()
            desired = level_trial.extract_curve(reference)
            condition = level_trial.write_npz(output / "EXPLICIT_REFERENCE_level_condition.npz",
                                               desired_level_dbfs=desired)
            reference_diag = prepare_corpus.diagnostics(reference)
            reference_wav = output / "01_original_reference_24k_mono.wav"
            saved.write_float_wav(reference_wav, reference)
            native = [reference_wav]
            report = dict(schema="mini.sifigan-world-timbre-roundtrip-audition.v1", status="started",
                case=PRIMARY, parent_report_path=str(parent_report), roundtrip_report_path=str(roundtrip_report),
                input_bindings=bindings, source_credit=saved.CREDIT, carrier_checkpoints_hash_only=checkpoints,
                reference_envelope_used=True, source_envelope_used=True, amplitude_condition_NOT_learned=True,
                training=False, ML_training=False, model_loaded_or_run=False, WORLD_synthesis_performed=False,
                GPU_used=False, Torch_imported=False, new_score_or_music=False, heldout_is_blind=False,
                quality_approved=False, perceptually_approved=False, output_AGC=True, output_postprocessing=True,
                original_PCM_mixed_into_generated_output=False, raw_roundtrip_files_unchanged=True,
                hard_mute_or_gate=False, EQ_pitch_or_time_edit=False, original_reference_gain_controlled=False,
                all_generated_carriers_use_identical_reference_condition=True,
                independent_envelope_prediction_or_new_performance=False,
                processing="Three carrier-only explicit reference-level controllers, then four static-LUFS display gains.",
                params=dict(sample_rate=24000, samples=115200, seconds=4.8, hop_samples=120,
                    rms_window_samples=480, rms_reflect_padding=240, amplitude_floor=1e-5,
                    gain_bounds_db=[-60., 60.], centered_log_gain_kernel=[.25, .5, .25],
                    log_gain_padding="edge", sample_gain_interpolation="linear with final5ms hold",
                    offline_noncausal=True, rms_future_context_ms=10, gain_smoothing_future_context_ms=5,
                    waveform_shift_samples=0, max_output_bytes=MAX_BYTES),
                original_path=primary["source"]["original_path"],
                original_sha256=primary["source"]["original_sha256"], condition=condition,
                reference_PCM_sha256=array_hash(reference), condition_array_sha256=array_hash(desired),
                preserved_raw_timbre_metrics=primary["row"]["raw_timbre_metrics"],
                preserved_raw_pitch_level_diagnostics=primary["row"]["raw_pitch_level_diagnostics"],
                preserved_compression_parameter_diagnostics=primary["row"]["compression_parameter_diagnostics"],
                limitations=["The source RMS envelope IS supplied to all three generated carriers; this is an explicit copy diagnostic, not learned expression.",
                    "Only gain control is applied; carrier pitch, noise and timbre defects are not repaired or approved.",
                    "Raw roundtrip evidence remains immutable and is retained separately from these controlled listening copies.",
                    "Original audio has no dynamic controller; an additional constant display gain is applied to each whole file only.",
                    "WORLD noise/phase and neural architecture differ, so this is not a controlled causal architecture or perceptual-quality test.",
                    "Centered RMS/smoothing uses future samples; no waveform shift does not imply realtime zero latency."],
                generated=[], outputs=[])
            for index, (key, label) in enumerate(CARRIERS, 2):
                carrier = primary["waves"][key]
                before = carrier.tobytes()
                after, controls = level_trial.apply_curve(carrier, desired)
                if carrier.tobytes() != before or reference.tobytes() != reference_before:
                    raise ValueError("source_or_carrier_PCM_mutated")
                controls_file = level_trial.write_npz(output / (key + "_applied_level_controls.npz"), **controls)
                after_file = level_trial.write_npz(output / (key + "_REFERENCE_LEVEL_CONDITIONED.npz"), generated=after)
                wav = output / (f"{index:02}_" + label + "_24k_mono.wav")
                saved.write_float_wav(wav, after)
                native.append(wav)
                report["generated"].append(dict(raw_key=key, label=label, raw_PCM_sha256=array_hash(carrier),
                    conditioned_PCM_sha256=array_hash(after), controls=controls_file, after=after_file,
                    smoothed_gain_min_max_db=[float(controls["smoothed_gain_db"].min()), float(controls["smoothed_gain_db"].max())],
                    limited_gain_frames=int(np.count_nonzero(np.abs(controls["desired_gain_db"]) > 60)),
                    conditioned_peak=float(np.abs(after).max()), conditioned_samples_abs_ge1=int(np.count_nonzero(np.abs(after) >= 1)),
                    conditioned_pitch_level_diagnostics=level_trial.diagnostics(after, reference, reference_diag)))
            destination = output / "arirang001_four_way"
            comparison = compare_fn([label + "=" + str(path) for label, path in zip(LABELS, native)], destination, seconds=4.8)
            if (comparison.get("schema") != "mini.foundation-local-static-lufs-comparison.v1"
                    or comparison.get("status") != "ready" or comparison.get("seconds") != 4.8
                    or comparison.get("no_compression_AGC_EQ_pitch_time_edits") is not True
                    or [row["label"] for row in comparison["outputs"]] != list(LABELS)):
                raise ValueError("frozen_static_LUFS_four_way_comparison_required")
            for row in comparison["outputs"]:
                path = saved.local_child(destination, row["file"], 5_000_000)
                if saved.sha256(path) != row["sha256"]:
                    raise ValueError("encoded_audition_hash_changed")
                path.chmod(0o600)
                report["outputs"].append(dict(row, path=str(path), perceptually_approved=False))
            comparison_path = saved.local_child(destination, "comparison.json", 5_000_000)
            comparison_path.chmod(0o600)
            report.update(native_wavs=[dict(path=str(path), sha256=saved.sha256(path)) for path in native],
                comparison_path=str(comparison_path), comparison_sha256=saved.sha256(comparison_path))
            if "torch" in sys.modules or any(saved.sha256(path) != checksum for path, checksum in bindings.items()):
                raise ValueError("bound_raw_input_source_model_or_code_changed_or_Torch_imported")
            report.update(status="explicit_level_controlled_timbre_audition_not_perceptually_approved",
                inputs_unchanged=True, elapsed_seconds=time.monotonic() - started, resources=guard.snapshot())
            payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
            if directory_bytes(output) + len(payload) > MAX_BYTES:
                raise ValueError("8MB_export_output_cap")
            with os.fdopen(os.open(output / "export_report.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as handle:
                handle.write(payload)
    finally:
        os.umask(previous)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roundtrip-report", type=Path, required=True)
    parser.add_argument("--parent-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = export(args.roundtrip_report, args.parent_report, args.output)
    print(json.dumps(dict(status=result["status"], outputs=len(result["outputs"]),
                         reference_envelope_used=True, bytes=directory_bytes(args.output))))
