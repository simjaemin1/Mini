#!/usr/bin/env python3
"""Export two NEW authored pitch-pattern carriers, not an old/original replay.

No model is loaded. Source timbre, articulation and vibrato are borrowed;
only the fixed four-note pitch offsets are authored. The original 20ms/3tap
RMS controller is explicitly supplied, not learned breath or expression.
"""
import argparse
import hashlib
import importlib
import json
import os
from pathlib import Path
import shutil
import time

import numpy as np
import export_extended_training as extended

saved, level = extended.saved, extended.level
PRIVATE_ROOT = saved.PRIVATE_ROOT
FRAMES, SAMPLES = 960, 115200
BOUNDARIES, OFFSETS, VARIANTS = (300, 520, 740), (0., 2., 5., 2.), ("0ms", "20ms")
MAX_BYTES, WHOLE_MAX_BYTES, MIN_FREE = 12_000_000, 50_000_000, 12 * 1024 ** 3
PRODUCER = Path(__file__).with_name("render_note_pattern.py")


def array_hash(value):
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def expected_curve(variant):
    """Independent fixed-grid contract: 20ms contains five endpoint controls."""
    if variant not in VARIANTS:
        raise ValueError("fixed_step_or_centered20ms_required")
    curve = np.zeros(FRAMES, np.float64)
    for boundary, offset in zip(BOUNDARIES, OFFSETS[1:]):
        curve[boundary:] = offset
    if variant == "20ms":
        u = np.arange(5, dtype=np.float64) / 4.
        blend = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5
        for index, boundary in enumerate(BOUNDARIES):
            curve[boundary - 2:boundary + 3] = OFFSETS[index] + (OFFSETS[index + 1] - OFFSETS[index]) * blend
    return curve


def expected_masks():
    boundary = np.zeros(FRAMES, bool)
    for frame in BOUNDARIES:
        boundary[frame - 16:frame + 16] = True
    return dict(boundary=boundary, steady=~boundary)


def capacity(output, reserve=0):
    """Cap the fresh whole experiment, including raw producer outputs."""
    output = Path(output)
    local = sum(p.stat().st_size for p in output.rglob("*") if p.is_file())
    whole = sum(p.stat().st_size for p in output.parent.rglob("*") if p.is_file())
    if local + reserve > MAX_BYTES or whole + reserve > WHOLE_MAX_BYTES:
        raise RuntimeError("12MB_export_or50MB_whole_experiment_cap")
    if shutil.disk_usage(output).free < MIN_FREE + reserve:
        raise RuntimeError("reserve_above12GiB_disk_floor_required")
    return dict(export_bytes=local, whole_experiment_bytes=whole)


def validate_inputs(parent_path, training_path, pattern_path):
    training, sources, bindings, checkpoints = extended.validate_inputs(parent_path, training_path)
    if training.get("completed_steps") != 3000:
        raise ValueError("fixed_completed_global3000_required")
    pattern_path = saved.regular(pattern_path, 5_000_000)
    pattern = json.loads(pattern_path.read_text())
    if (pattern.get("schema") != "mini.sifigan-four-note-pattern.v1"
            or pattern.get("status") != "four_note_pattern_rendered_not_perceptually_approved"
            or pattern.get("phase") != "complete" or pattern.get("completed_steps") != 3000
            or pattern.get("baseline_reproduced") is not True or pattern.get("inputs_unchanged") is not True
            or pattern.get("boundaries_frames") != list(BOUNDARIES)
            or pattern.get("boundaries_seconds") != [1.5, 2.6, 3.7]
            or pattern.get("offsets_semitones") != list(OFFSETS)
            or pattern.get("variants") != list(VARIANTS)
            or pattern.get("frames") != FRAMES or pattern.get("samples") != SAMPLES
            or pattern.get("sample_rate") != 24000 or pattern.get("hop_size") != 120
            or pattern.get("forward_calls") != 3 or pattern.get("case_order") != ["deepvib48"]
            or pattern.get("optimizer_steps") != 0):
        raise ValueError("completed_fixed_four_note_contract_required")
    for key in ("training", "weights_written", "public_weights_used", "source_PCM_mixed_into_output",
                "output_processing", "denoising", "EQ", "waveform_pitch_warp", "new_score_or_music",
                "source_amplitude_prediction_learned", "quality_approved", "perceptually_approved"):
        if pattern.get(key) is not False:
            raise ValueError("unprocessed_unapproved_pattern_required:" + key)
    for key in ("mcep_BAP_unchanged", "normalizer_unchanged", "input_gain_unchanged",
                "raw_F0_zero_mask_unchanged", "excitation_and_dilation_use_same_shifted_cf0"):
        if pattern.get(key) is not True:
            raise ValueError("unchanged_pattern_control_contract_required:" + key)
    inherited = pattern.get("input_bindings", {})
    if inherited.get(str(training_path)) != saved.sha256(training_path):
        raise ValueError("same_global3000_report_binding_required")
    if pattern.get("checkpoints") != checkpoints:
        raise ValueError("same_bound_completed_checkpoint_records_required")
    if pattern.get("upstream_bindings") != training.get("upstream_bindings"):
        raise ValueError("same_upstream_bindings_required")
    for path, checksum in inherited.items():
        saved.bound(Path(path), checksum, bindings)
    saved.bound(pattern_path, saved.sha256(pattern_path), bindings, 5_000_000)
    gate_path = saved.regular(training["data_gate"], 50_000_000)
    if bindings.get(str(gate_path)) != saved.sha256(gate_path):
        raise ValueError("bound_training_gate_required")
    gate = json.loads(gate_path.read_text())
    stats_path = saved.local_child(gate_path.parent, gate.get("stats_file", "stats.npz"))
    saved.bound(stats_path, gate["stats_sha256"], bindings)
    with np.load(stats_path, allow_pickle=False) as archive:
        mean, scale = archive["mean"].copy(), archive["scale"].copy()
    if (mean.shape != (43,) or scale.shape != (43,) or not np.isfinite(mean).all()
            or not np.isfinite(scale).all() or np.any(scale <= 0)):
        raise ValueError("finite_positive43_channel_normalizer_required")
    rows = pattern.get("cases", [])
    if len(rows) != 1 or rows[0].get("case") != "deepvib48":
        raise ValueError("one_deepvib48_pattern_case_required")
    source = next(item for item in sources if item["case"] == "deepvib48")
    row = rows[0]
    if (row.get("baseline_reproduced") is not True or row.get("baseline_byte_exact") is not True
            or set(row.get("raw_diagnostics", {})) != {"baseline", "variants"}
            or set(row["raw_diagnostics"].get("variants", {})) != set(VARIANTS)):
        raise ValueError("byte_exact_baseline_and_two_raw_diagnostics_required")
    before = row.get("rng_before_sha256")
    after = row.get("rng_after_baseline_sha256")
    if (any(not isinstance(value, str) or len(value) != 64
            or any(c not in "0123456789abcdef" for c in value) for value in (before, after))
            or row.get("rng_variant_before_sha256") != {variant: before for variant in VARIANTS}):
        raise ValueError("same_recorded_variant_excitation_rng_required")
    path = saved.local_child(pattern_path.parent, row["file"], MAX_BYTES)
    saved.bound(path, row["sha256"], bindings, MAX_BYTES)
    with np.load(path, allow_pickle=False) as archive:
        arrays = {key: archive[key].copy() for key in archive.files}
    waves = {"reference", "baseline", "generated_0ms", "generated_20ms"}
    features = {"features", "normalized_features"}
    masks = {"boundary_mask", "steady_mask"}
    doubles = {prefix + variant for prefix in ("offset_semitones_", "factor_") for variant in VARIANTS}
    controls = {"source_f0", "source_cf0"} | {prefix + variant for prefix in ("f0_", "cf0_") for variant in VARIANTS}
    if set(arrays) != waves | features | masks | doubles | controls:
        raise ValueError("exact_pattern_archive_keys_required")
    for key, value in arrays.items():
        shape = (SAMPLES,) if key in waves else (FRAMES, 43) if key in features else (FRAMES,)
        dtype = np.bool_ if key in masks else np.float64 if key in doubles else np.float32
        if value.shape != shape or value.dtype != dtype or not np.isfinite(value).all():
            raise ValueError("finite_exact_pattern_archive_dtype_shape_required:" + key)
        if row.get("array_sha256", {}).get(key) != array_hash(value):
            raise ValueError("pattern_array_hash_changed:" + key)
    for key, original in (("reference", source["reference"]), ("baseline", source["generated"])):
        if arrays[key].tobytes() != original.tobytes():
            raise ValueError("pattern_baseline_or_source_not_byte_exact:" + key)
    with np.load(source["corpus_npz_path"], allow_pickle=False) as archive:
        for ours, theirs in (("source_f0", "f0"), ("source_cf0", "cf0"), ("features", "features")):
            if arrays[ours].tobytes() != archive[theirs][:FRAMES].tobytes():
                raise ValueError("pattern_source_control_not_corpus_exact:" + ours)
    normalized = ((arrays["features"] - mean) / scale).astype(np.float32)
    if arrays["normalized_features"].tobytes() != normalized.tobytes():
        raise ValueError("normalized_features_not_bound_stats_exact")
    for name, mask in expected_masks().items():
        if arrays[name + "_mask"].tobytes() != mask.tobytes():
            raise ValueError("exact_96boundary_864steady_mask_required")
    for variant in VARIANTS:
        offset = expected_curve(variant)
        factor = 2. ** (offset / 12.)
        if (arrays["offset_semitones_" + variant].tobytes() != offset.tobytes()
                or arrays["factor_" + variant].tobytes() != factor.tobytes()):
            raise ValueError("fixed_note_schedule_and_factor_required")
        for source_key, shifted_key in (("source_f0", "f0_"), ("source_cf0", "cf0_")):
            expected = (arrays[source_key].astype(np.float64) * factor).astype(np.float32)
            if arrays[shifted_key + variant].tobytes() != expected.tobytes():
                raise ValueError("float64_factor_then_float32_pitch_controls_required")
        if (not np.array_equal(arrays["source_f0"] == 0, arrays["f0_" + variant] == 0)
                or np.any(arrays["cf0_" + variant] <= 0)):
            raise ValueError("unchanged_raw_zero_mask_positive_cf0_required")
    return pattern, dict(source, arrays=arrays, row=row, raw_path=str(path)), bindings, checkpoints


def export(parent_path, training_path, pattern_path, output, compare_fn=None):
    output, pattern_path = Path(output), Path(pattern_path)
    root = PRIVATE_ROOT.resolve(strict=True)
    if (not output.is_absolute() or output.is_symlink() or output.exists()
            or output.resolve() == root or not output.resolve().is_relative_to(root)
            or output.parent.resolve() != pattern_path.parent.parent.resolve()):
        raise ValueError("fresh_same_experiment_private_export_required")
    output.mkdir(mode=0o700)
    previous, started = os.umask(0o077), time.monotonic()
    try:
        with level.ResourceGuard(output, level.ResourceCaps(max_seconds=120, max_rss_bytes=2 * level.GIB)) as guard:
            capacity(output, 5_000_000)
            pattern, item, bindings, checkpoints = validate_inputs(parent_path, training_path, pattern_path)
            # Pure helper import: no torch, model, network, or inference side effect.
            producer = importlib.import_module("render_note_pattern")
            for path in (Path(__file__).resolve(), PRODUCER.resolve(), Path(extended.__file__).resolve(),
                         Path(saved.__file__).resolve(), Path(level.__file__).resolve(), saved.HELPER,
                         Path(level.prepare_corpus.__file__).resolve(), Path(level.pilot_metrics.__file__).resolve(),
                         Path(level.level_metrics.__file__).resolve()):
                bindings[str(path)] = saved.sha256(path)
            compare_fn = saved.load_comparator() if compare_fn is None else compare_fn
            arrays = item["arrays"]
            reference = arrays["reference"]
            desired = level.extract_curve(reference)
            condition = level.write_npz(output / "EXPLICIT_REFERENCE_level_condition.npz", desired_level_dbfs=desired)
            names = ("baseline", "0ms", "20ms")
            controlled, carriers = {}, []
            for name in names:
                capacity(output, 1_000_000)
                raw = arrays["baseline" if name == "baseline" else "generated_" + name]
                wave, controls = level.apply_curve(raw, desired)
                controlled[name] = wave
                control = level.write_npz(output / (name + "_controls.npz"), **controls)
                after = level.write_npz(output / (name + "_controlled.npz"), generated=wave)
                native = output / (name + "_24k_mono.wav")
                saved.write_float_wav(native, wave)
                carriers.append(dict(role=name, presented=name != "baseline", raw_PCM_sha256=array_hash(raw),
                    controlled_PCM_sha256=array_hash(wave), controls=control, controlled=after,
                    native_wav=dict(path=str(native), sha256=saved.sha256(native))))
            curves = {variant: arrays["offset_semitones_" + variant] for variant in VARIANTS}
            controlled_diagnostics = producer.raw_diagnostics(reference, controlled["baseline"],
                {variant: controlled[variant] for variant in VARIANTS}, curves)
            labels = ("NEW_AUTHORED_4NOTE_STEP_BORROWED_SOURCE_VIBRATO_EXPLICIT_REFERENCE_LEVEL",
                      "NEW_AUTHORED_4NOTE_CENTERED20ms_BORROWED_SOURCE_VIBRATO_EXPLICIT_REFERENCE_LEVEL")
            paths = [next(row["native_wav"]["path"] for row in carriers if row["role"] == variant) for variant in VARIANTS]
            destination = output / "new_patterns"
            capacity(output, 3_000_000)
            comparison = compare_fn([label + "=" + path for label, path in zip(labels, paths)], destination, seconds=4.8)
            if (comparison.get("schema") != "mini.foundation-local-static-lufs-comparison.v1"
                    or comparison.get("status") != "ready" or comparison.get("seconds") != 4.8
                    or comparison.get("no_compression_AGC_EQ_pitch_time_edits") is not True
                    or [row["label"] for row in comparison["outputs"]] != list(labels)):
                raise ValueError("exact_two_new_patterns_static_comparison_required")
            outputs = []
            for variant, row in zip(VARIANTS, comparison["outputs"]):
                path = saved.local_child(destination, row["file"], MAX_BYTES)
                saved.bound(path, row["sha256"], {})
                outputs.append(dict(row, path=str(path), role=variant, perceptually_approved=False))
            comparison_path = saved.local_child(destination, "comparison.json", MAX_BYTES)
            if any(saved.sha256(path) != checksum for path, checksum in bindings.items()):
                raise ValueError("bound_source_model_or_code_changed")
            masks = expected_masks()
            report = dict(schema="mini.sifigan-four-note-pattern-audition.v1",
                status="four_note_pattern_auditions_ready_not_perceptually_approved", phase="complete",
                pattern_report_path=str(pattern_path), pattern_report_sha256=saved.sha256(pattern_path),
                training_report_path=str(training_path), completed_training_steps=3000, training=False,
                optimizer_steps=0, model_loaded_or_run=False, source_envelope_used=True,
                amplitude_condition_NOT_learned=True, AGC=True, source_PCM_mixed_into_output=False,
                new_score_or_music=False, authored_fixed_four_note_pitch_pattern=True,
                source_vibrato_articulation_and_timbre_borrowed=True, learned_breath_attack_or_sigim=False,
                noise_reduction=False, denoising_EQ=False, waveform_pitch_shift=False,
                quality_approved=False, perceptually_approved=False, old_baseline_or_original_presented=False,
                input_bindings=bindings, checkpoints=checkpoints, source_credit=saved.CREDIT,
                case="deepvib48", raw_path=item["raw_path"], raw_sha256=item["row"]["sha256"],
                reference_PCM_sha256=array_hash(reference), offsets_semitones=list(OFFSETS),
                boundaries_frames=list(BOUNDARIES), boundaries_seconds=[1.5, 2.6, 3.7], variants=list(VARIANTS),
                geometry_boundary_mask_frames=int(masks["boundary"].sum()),
                geometry_steady_mask_frames=int(masks["steady"].sum()),
                geometry_mask_counts_are_not_source_supported_pitch_counts=True,
                mask_sha256={key: array_hash(mask) for key, mask in masks.items()},
                boundary_exclusion="steady excludes [b-16,b+16) at each boundary; all96 boundary frames remain separately reported",
                controller=dict(rms_window_samples=480, hop_samples=120, reflect_padding_samples=240,
                    amplitude_floor=1e-5, gain_bounds_db=[-60., 60.], log_gain_smoothing=[.25, .5, .25],
                    interpolation="linear_frame_index_to_sample/120", offline_noncausal=True),
                condition=condition, carriers=carriers, raw_diagnostics_copied=item["row"]["raw_diagnostics"],
                controlled_diagnostics=controlled_diagnostics,
                controlled_level_metrics={name: level.level_metrics.summary(wave, reference) for name, wave in controlled.items()},
                comparison_path=str(comparison_path), comparison_sha256=saved.sha256(comparison_path), outputs=outputs,
                inputs_unchanged=True, elapsed_seconds=time.monotonic() - started, resources=guard.snapshot(),
                caveats=["A fixed four-note pitch pattern borrows source timbre/vibrato/articulation, not learned score performance.",
                    "The two auditions are NEW STEP and centered20ms variants; old baseline and original PCM are not presented.",
                    "Original-reference20ms/3tap RMS is explicitly supplied to all carriers, not learned amplitude or breath.",
                    "Target is original-source YIN multiplied by the supplied pitch factors; no performed target recording exists.",
                    "Steady metrics exclude96 transition-context frames, which remain in all-frame and separate boundary diagnostics.",
                    "No reattack, breath, sigim policy, denoising, EQ, waveform warp, or naturalness approval is established."])
            report["bytes_before_report"] = capacity(output)
            payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
            capacity(output, len(payload))
            with (output / "export_report.json").open("xb") as handle:
                handle.write(payload)
            (output / "export_report.json").chmod(0o600)
    finally:
        os.umask(previous)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent-report", type=Path, required=True)
    parser.add_argument("--training-report", type=Path, required=True)
    parser.add_argument("--pattern-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = export(args.parent_report, args.training_report, args.pattern_report, args.output)
    print(json.dumps(dict(status=result["status"], new_files=[row["path"] for row in result["outputs"]])))
