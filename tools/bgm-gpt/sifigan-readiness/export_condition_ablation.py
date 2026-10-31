#!/usr/bin/env python3
"""Three-way source/actual43/repeated43 diagnostic; no new music or training.

The original is unchanged before static display gain. Both neural carriers
receive the SAME explicit original20ms/3tap RMS curve. No model is loaded.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import time

import numpy as np
import export_extended_training as extended
import timbre_metrics

saved, level = extended.saved, extended.level
PRIVATE_ROOT = saved.PRIVATE_ROOT
RATE, HOP, FRAMES, SAMPLES = 24000, 120, 960, 115200
MAX_BYTES, GIB = 20_000_000, 1024 ** 3
ROLES = ("original_reference", "actual43", "repeated43")
RAW_KEYS = dict(actual43="raw_actual_features", repeated43="raw_repeated_features")


def array_hash(value):
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def capacity(output, reserve=0):
    total = sum(p.stat().st_size for p in Path(output).parent.rglob("*") if p.is_file())
    if total + reserve > MAX_BYTES:
        raise RuntimeError("whole_fresh_experiment20MB_cap")
    if shutil.disk_usage(output).free < 12 * GIB + reserve:
        raise RuntimeError("reserve_above12GiB_disk_floor_required")
    return total


def validate_inputs(parent_path, training_path, raw_path):
    training, sources, bindings, checkpoints = extended.validate_inputs(parent_path, training_path)
    raw_path = saved.regular(raw_path, 5_000_000)
    report = json.loads(raw_path.read_text())
    if (report.get("schema") != "mini.sifigan-conditioning-ablation.v1"
            or report.get("status") != "conditioning_ablation_raw_ready_not_perceptually_approved"
            or report.get("phase") != "complete" or report.get("completed_steps") != 3000
            or training.get("completed_steps") != 3000 or report.get("forward_calls") != 3
            or report.get("baseline_deep_byte_exact") is not True
            or report.get("baseline_arirang_byte_exact") is not True or report.get("inputs_unchanged") is not True
            or report.get("frames") != FRAMES or report.get("samples") != SAMPLES
            or report.get("sample_rate") != RATE or report.get("hop_size") != HOP
            or report.get("checkpoints") != checkpoints):
        raise ValueError("completed_bound_three_forward_condition_ablation_required")
    for key in ("training", "output_processing", "source_PCM_mixed_into_output", "quality_approved",
                "authored_score", "new_score_or_music", "gate", "hard_mute", "EQ", "denoising"):
        if report.get(key) is not False:
            raise ValueError("unprocessed_unapproved_no_training_raw_required:" + key)
    for key in ("source_F0_cf0_unchanged", "source_timestamps_unchanged", "normalizer_unchanged",
                "model_weights_unchanged", "same_arirang_noise_verified"):
        if report.get(key) is not True:
            raise ValueError("same_input_model_and_noise_required:" + key)
    rng = report.get("rng_sha256", {})
    if (not rng.get("arirang_before") or any(rng.get(key) != rng["arirang_before"]
            for key in ("deep_after", "actual_before", "repeated_before"))):
        raise ValueError("same_recorded_arirang_excitation_rng_required")
    inherited = report.get("input_bindings", {})
    if inherited.get(str(training_path)) != saved.sha256(training_path):
        raise ValueError("same_completed_global3000_binding_required")
    for path, digest in inherited.items():
        saved.bound(Path(path), digest, bindings)
    saved.bound(raw_path, saved.sha256(raw_path), bindings, 5_000_000)
    record = report["archive"]
    archive_path = saved.local_child(raw_path.parent, record["file"], MAX_BYTES)
    saved.bound(archive_path, record["sha256"], bindings, MAX_BYTES)
    with np.load(archive_path, allow_pickle=False) as archive:
        arrays = {key: archive[key].copy() for key in archive.files}
    waves = {"reference_arirang", "raw_actual_features", "raw_repeated_features", "deep_baseline", "deep_reference"}
    feature_keys = {"actual_features", "template_features", "normalized_actual", "normalized_template"}
    expected = waves | feature_keys | {"f0", "cf0", "template_index_map"}
    if set(arrays) != expected or set(record.get("array_sha256", {})) != expected:
        raise ValueError("exact_condition_ablation_archive_keys_required")
    for key, value in arrays.items():
        shape = (SAMPLES,) if key in waves else (FRAMES, 43) if key in feature_keys else (FRAMES,)
        dtype = np.int64 if key == "template_index_map" else np.float32
        if value.dtype != dtype or value.shape != shape or not np.isfinite(value).all():
            raise ValueError("finite_exact_condition_ablation_arrays_required:" + key)
        if array_hash(value) != record["array_sha256"][key]:
            raise ValueError("ablation_array_hash_changed:" + key)
    deep, ari = (next(item for item in sources if item["case"] == name) for name in ("deepvib48", "arirang001"))
    for key, value in (("reference_arirang", ari["reference"]), ("raw_actual_features", ari["generated"]),
                       ("deep_reference", deep["reference"]), ("deep_baseline", deep["generated"])):
        if arrays[key].tobytes() != value.tobytes():
            raise ValueError("source_or_global3000_baseline_not_byte_exact:" + key)
    mapping = 240 + ((np.arange(FRAMES, dtype=np.int64) + 16) % 960)
    if arrays["template_index_map"].tobytes() != mapping.tobytes():
        raise ValueError("fixed_clean_template_phase16_map_required")
    with np.load(ari["corpus_npz_path"], allow_pickle=False) as original:
        for ours, theirs in (("f0", "f0"), ("cf0", "cf0"), ("actual_features", "features")):
            if arrays[ours].tobytes() != original[theirs][:FRAMES].tobytes():
                raise ValueError("original_arirang_controls_changed:" + ours)
    with np.load(deep["corpus_npz_path"], allow_pickle=False) as original:
        if arrays["template_features"].tobytes() != original["features"][mapping].tobytes():
            raise ValueError("repeated_features_not_exact_clean_deep_template")
    gate_path = Path(training["data_gate"])
    gate = json.loads(gate_path.read_text())
    stats_path = saved.local_child(gate_path.parent, gate.get("stats_file", "stats.npz"))
    saved.bound(stats_path, gate["stats_sha256"], bindings)
    with np.load(stats_path, allow_pickle=False) as stats:
        for feature, normalized in (("actual_features", "normalized_actual"), ("template_features", "normalized_template")):
            expected_normalized = ((arrays[feature] - stats["mean"]) / stats["scale"]).astype(np.float32)
            if arrays[normalized].tobytes() != expected_normalized.tobytes():
                raise ValueError("bound_fit_normalizer_recomputation_changed:" + normalized)
    return report, arrays, bindings, checkpoints


def diagnostics(wave, reference, reference_diag):
    result = level.diagnostics(wave, reference, reference_diag)
    result["spectral"] = timbre_metrics.summary(wave, reference)
    generated = level.prepare_corpus.diagnostics(wave)
    # The control-template wraps at4.720s. Keep this32-frame context in all
    # diagnostics AND report it separately; no frame is removed from a mask.
    good = (generated["yin_hz"] > 0) & (generated["periodicity"] >= .90) & (generated["rms_db"] > -60)
    xm, ym = (timbre_metrics._magnitude(value.astype(np.float64)) for value in (reference, wave))
    bins = np.fft.rfftfreq(2048, 1 / RATE) >= 70.
    xu, _ = timbre_metrics._unit(xm[:, bins])
    yu, _ = timbre_metrics._unit(ym[:, bins])
    source_spectral = level.level_metrics.frame_rms_db(reference) > -60
    def context(start, end):
        region = np.zeros(FRAMES, bool)
        region[start:end] = True
        support = ((reference_diag["yin_hz"] > 0) & (reference_diag["periodicity"] >= .90)
                   & (reference_diag["rms_db"] > -60) & region)
        shared = support & good
        cents = 1200 * np.log2(generated["yin_hz"][shared].astype(np.float64) / reference_diag["yin_hz"][shared])
        count, total = int(shared.sum()), int(support.sum())
        spectral_support = source_spectral & region
        distances = np.linalg.norm(yu - xu, axis=1)[spectral_support]
        interval = wave[start * HOP:end * HOP].astype(np.float64)
        return dict(start_frame=start, end_frame=end, omitted_from_full_metrics=False,
            source_pitch_support_frames=total, source_pitch_mask_sha256=array_hash(support),
            measured_confident_frames=count, missing_frames=total - count,
            near50c_frames=int((np.abs(cents) <= 50).sum()),
            near50c_fraction_source_support=float((np.abs(cents) <= 50).sum() / total) if total else None,
            median_abs_cents=float(np.median(np.abs(cents))) if count else None,
            p95_abs_cents=float(np.quantile(np.abs(cents), .95)) if count else None,
            spectral_source_support_frames=int(spectral_support.sum()),
            normalized_magnitude_L2_mean=float(distances.mean()) if len(distances) else None,
            normalized_magnitude_L2_p95=float(np.quantile(distances, .95)) if len(distances) else None,
            waveform_peak=float(np.max(np.abs(interval))),
            waveform_rms_dbfs=float(20 * np.log10(max(float(np.sqrt(np.mean(interval * interval))), 1e-12))),
            numeric_context_is_not_audible_artifact_detection=True)
    result["declared_template_wrap_context"] = dict(context(928, 960), wrap_frame=944,
        nominal_half_width_frames=16, clipped_to_programme_end=True)
    result["pre_wrap_context"] = context(0, 928)
    return result


def export(parent_path, training_path, raw_path, output, compare_fn=None):
    output, raw_path = Path(output), Path(raw_path)
    private = PRIVATE_ROOT.resolve(strict=True)
    if (not output.is_absolute() or output.is_symlink() or output.exists()
            or not output.resolve().is_relative_to(private) or output.resolve() == private
            or output.parent.resolve() != raw_path.parent.parent.resolve()):
        raise ValueError("fresh_same_private_experiment_output_required")
    # Reserve the raw runtime against the combined300-second limit.
    raw_seconds = json.loads(saved.regular(raw_path, 5_000_000).read_text()).get("elapsed_seconds")
    if not isinstance(raw_seconds, (float, int)) or not np.isfinite(raw_seconds) or not 0 <= raw_seconds < 300:
        raise ValueError("finite_completed_raw_runtime_under300_seconds_required")
    output.mkdir(mode=0o700)
    previous, started = os.umask(0o077), time.monotonic()
    try:
        with level.ResourceGuard(output, level.ResourceCaps(max_seconds=300 - raw_seconds, max_rss_bytes=2 * GIB)) as guard:
            capacity(output, 8_000_000)
            raw, arrays, bindings, checkpoints = validate_inputs(parent_path, training_path, raw_path)
            for path in (Path(__file__).resolve(), Path(extended.__file__).resolve(), Path(saved.__file__).resolve(),
                    Path(level.__file__).resolve(), Path(timbre_metrics.__file__).resolve(), saved.HELPER,
                    Path(level.prepare_corpus.__file__).resolve(), Path(level.pilot_metrics.__file__).resolve(),
                    Path(level.level_metrics.__file__).resolve()):
                bindings[str(path)] = saved.sha256(path)
            reference = arrays["reference_arirang"]
            desired = level.extract_curve(reference)
            condition = level.write_npz(output / "EXPLICIT_SAME_REFERENCE_RMS.npz", desired_level_dbfs=desired)
            rd = level.prepare_corpus.diagnostics(reference)
            source_record = level.write_npz(output / "ORIGINAL_reference.npz", reference=reference)
            reference_path = output / "ORIGINAL_reference_24k.wav"
            saved.write_float_wav(reference_path, reference)
            paths = [reference_path]
            carriers = []
            for role in ("actual43", "repeated43"):
                capacity(output, 3_000_000)
                wave = arrays[RAW_KEYS[role]]
                after, gain = level.apply_curve(wave, desired)
                if not np.isfinite(after).all() or np.any(np.abs(after) >= 1):
                    raise ValueError("conditioned_output_nonfinite_or_clipping")
                control = level.write_npz(output / (role + "_same_RMS_controls.npz"), **gain)
                controlled = level.write_npz(output / (role + "_controlled.npz"), generated=after)
                path = output / (role + "_RECONSTRUCTION_24k.wav")
                saved.write_float_wav(path, after)
                paths.append(path)
                carriers.append(dict(role=role, raw_PCM_sha256=array_hash(wave), controlled_PCM_sha256=array_hash(after),
                    gain_controls=control, controlled=controlled, native_wav=dict(path=str(path), sha256=saved.sha256(path)),
                    raw_diagnostics=diagnostics(wave, reference, rd), controlled_diagnostics=diagnostics(after, reference, rd)))
            labels = ("ORIGINAL_ARIRANG_REFERENCE_NO_DYNAMIC_GAIN", "ACTUAL43_SAME_F0_REFERENCE_RMS_NOT_NEW_TRAINING",
                      "REPEATED43_SAME_F0_REFERENCE_RMS_NOT_NEW_TRAINING")
            compare_fn = saved.load_comparator() if compare_fn is None else compare_fn
            capacity(output, 3_000_000)
            destination = output / "source_actual_repeated"
            comparison = compare_fn([label + "=" + str(path) for label, path in zip(labels, paths)], destination, seconds=4.8)
            if (comparison.get("schema") != "mini.foundation-local-static-lufs-comparison.v1"
                    or comparison.get("status") != "ready" or comparison.get("seconds") != 4.8
                    or comparison.get("no_compression_AGC_EQ_pitch_time_edits") is not True
                    or [row["label"] for row in comparison["outputs"]] != list(labels)):
                raise ValueError("exact_source_actual_repeated_static_comparison_required")
            outputs = []
            for role, row in zip(ROLES, comparison["outputs"]):
                path = saved.local_child(destination, row["file"], MAX_BYTES)
                saved.bound(path, row["sha256"], {})
                outputs.append(dict(row, role=role, path=str(path), perceptually_approved=False))
            comparison_path = saved.local_child(destination, "comparison.json", MAX_BYTES)
            if any(saved.sha256(path) != digest for path, digest in bindings.items()):
                raise ValueError("bound_source_model_or_code_changed")
            report = dict(schema="mini.sifigan-conditioning-ablation-audition.v1",
                status="conditioning_ablation_auditions_ready_not_perceptually_approved", phase="complete",
                raw_report_path=str(raw_path), raw_report_sha256=saved.sha256(raw_path),
                completed_training_steps=3000, training=False, model_loaded_or_run=False, optimizer_steps=0,
                source_credit=saved.CREDIT, source_reference_RMS_used_for_both_neural_carriers=True,
                original_dynamic_gain_applied=False, source_PCM_mixed_into_neural_outputs=False,
                same_F0_time_model_RNG=True, score_or_pitch_changes=False, authored_gate=False, old575ms_cut=False,
                reference_cf0_hz_min_median_max=np.percentile(arrays["cf0"], [0, 50, 100]).tolist(),
                same_recording_comparison_not_direct_063_failure_measurement=True,
                denoising=False, EQ=False, new_music=False, quality_approved=False,
                source_pitch_support_frames=int(((rd["yin_hz"] > 0) & (rd["periodicity"] >= .90) & (rd["rms_db"] > -60)).sum()),
                source_spectral_support_frames=int((level.level_metrics.frame_rms_db(reference) > -60).sum()),
                source_reference_PCM_sha256=array_hash(reference), actual43_raw_reproduces_historical_global3000=True,
                public_historical_audio_equivalence_not_inferred=True, input_bindings=bindings, checkpoints=checkpoints,
                condition=condition, original_reference=source_record,
                original_native_wav=dict(path=str(reference_path), sha256=saved.sha256(reference_path)),
                carriers=carriers, outputs=outputs, comparison_path=str(comparison_path),
                comparison_sha256=saved.sha256(comparison_path), inputs_unchanged=True,
                whole_experiment_bytes_before_report=capacity(output), elapsed_seconds=time.monotonic() - started,
                combined_raw_and_export_seconds=raw_seconds + time.monotonic() - started, resources=guard.snapshot(),
                caveats=["Same original4.8s, model, F0/time and excitation RNG; only43-channel conditioning differs.",
                    "Both reconstructions use the same explicitly supplied original RMS curve, not learned amplitude.",
                    "Original source receives no dynamic gain; all three receive static programme-level display gain.",
                    "Actual43 is a reproduced historical baseline, not new training or newly improved audio.",
                    "The repeated-template wrap4.72s +/-80ms is reported separately without dropping frames.",
                    "This original melody/register differs from063/064 and is a higher-register stress test, not a direct causal measurement of those rejected files.",
                    "Conditioning replacement differences do not isolate SP versus AP, register, attack, or prove that ML is the only possible condition-generation method.",
                    "Source-F0 estimator ambiguity remains. Numerical spectral/pitch errors do not certify daegeum identity."])
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
    parser.add_argument("--raw-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = export(args.parent_report, args.training_report, args.raw_report, args.output)
    print(json.dumps(dict(status=result["status"], files=[row["path"] for row in result["outputs"]])))
