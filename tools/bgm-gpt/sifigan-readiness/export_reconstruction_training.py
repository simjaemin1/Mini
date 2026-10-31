#!/usr/bin/env python3
"""Original/global3000/new same-source reconstruction comparisons, no model load.

Both saved neural carriers receive the SAME explicit original20ms/3tap RMS
condition. The original receives no dynamic gain. This does not generate a
new score, learn an envelope, establish convergence, or approve audible quality.
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
MAX_BYTES, GIB = 20_000_000, 1024 ** 3
PARENT_STEP, MAX_STEP = 3000, 6000
STATE_KEYS = ("generator", "discriminator", "optimizer_g", "optimizer_d", "scheduler_g", "scheduler_d")
FULL_STATUS = "bounded_reconstruction_continuation_complete_not_perceptually_approved"
G_ONLY_STATUS = "generator_only_not_full_resume"
FALSE_FLAGS = ("quality_approved", "new_score_or_music", "normalizer_changed", "input_gain_changed",
    "AP_or_cf0_changed", "optimizer_or_scheduler_reset", "public_weights_used", "hyperparameters_changed",
    "heldout_used_for_optimizer", "output_processing", "sampler_changed", "loss_changed", "heldout_is_blind",
    "automatic_CPU_fallback", "training_convergence_established")


def array_hash(array):
    return hashlib.sha256(np.ascontiguousarray(array).tobytes()).hexdigest()


def capacity(output, reserve=0):
    """Cap this exporter ONLY; the separately bounded training checkpoints stay put."""
    output = Path(output)
    total = sum(p.stat().st_size for p in output.rglob("*") if p.is_file())
    if total + reserve > MAX_BYTES:
        raise RuntimeError("export_only20MB_cap")
    if shutil.disk_usage(output).free < 12 * GIB + reserve:
        raise RuntimeError("reserve_above12GiB_disk_floor_required")
    return total


def digest(value):
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def state_digests(value):
    return isinstance(value, dict) and set(value) == set(STATE_KEYS) and all(digest(v) for v in value.values())


def checked_checkpoint(folder, name, checksum, size, bindings, maximum=850_000_000):
    path = saved.local_child(folder, name, maximum)
    if type(size) is not int or size <= 0 or path.stat().st_size != size or not digest(checksum):
        raise ValueError("checkpoint_size_or_digest_changed")
    saved.bound(path, checksum, bindings, maximum)
    return dict(path=str(path), sha256=checksum, bytes=size, hash_verified_without_loading=True)


def reconstruction_rows(report, key):
    rows = report.get(key)
    if (not isinstance(rows, list) or len(rows) != 2
            or {row.get("case") for row in rows} != set(saved.CASES)):
        raise ValueError("exact_two_fixed_reconstructions_required:" + key)
    for row in rows:
        if (row.get("perceptually_approved") is not False or not isinstance(row.get("metrics"), dict)
                or not isinstance(row.get("level_metrics"), dict)):
            raise ValueError("unapproved_raw_pitch_and_level_metrics_required:" + key)
    return {row["case"]: row for row in rows}


def validate_inputs(parent_path, report_path):
    """Hash/array validation only; typed model state checks are producer evidence."""
    parent_path = saved.regular(parent_path, 5_000_000)
    report_path = saved.regular(report_path, 5_000_000)
    claimed_parent = json.loads(parent_path.read_text())
    ancestor_path = saved.regular(claimed_parent["parent_report"], 5_000_000)
    parent, sources, bindings, checkpoints = extended.validate_inputs(ancestor_path, parent_path)
    if (parent.get("completed_steps") != PARENT_STEP
            or parent.get("status") != "bounded_extension_complete_not_perceptually_approved"
            or parent.get("full_resume_available") is not True
            or parent.get("full_checkpoint_numeric_roundtrip_verified") is not True
            or parent.get("full_checkpoint_zip_crc_verified") is not True
            or not digest(parent.get("full_checkpoint_typed_state_sha256"))
            or not state_digests(parent.get("final_numeric_state_sha256"))):
        raise ValueError("full_verified_global3000_parent_required")
    report = json.loads(report_path.read_text())
    done, requested = report.get("completed_steps"), report.get("requested_additional_steps")
    if (report.get("schema") != "mini.sifigan-reconstruction-continuation.v1"
            or report.get("status") not in (FULL_STATUS, G_ONLY_STATUS)
            or report.get("parent_completed_steps") != PARENT_STEP or type(done) is not int
            or not PARENT_STEP < done <= MAX_STEP or type(requested) is not int or not 1 <= requested <= 3000
            or type(report.get("additional_completed_steps")) is not int
            or report["additional_completed_steps"] != done - PARENT_STEP or done - PARENT_STEP > requested
            or report.get("phase") != "complete" or report.get("parent_all_inputs_preserved") is not True
            or report.get("parent_final_baseline_reproduced") is not True
            or report.get("parent_reconstructions_byte_exact") is not True
            or report.get("unchanged_training_recipe") is not True):
        raise ValueError("completed_bound_same_recipe_post3000_continuation_required")
    if done - PARENT_STEP < requested and not report.get("soft_stop_reason"):
        raise ValueError("early_stop_must_have_explicit_reason")
    for key in FALSE_FLAGS:
        if report.get(key) is not False:
            raise ValueError("unchanged_unapproved_training_contract_required:" + key)
    for key in ("seed", "batch_size", "frames", "generator_config", "discriminator_config", "mel_config",
                "residual_config", "fit_groups", "fit_windows", "data_gate", "evaluation_windows", "upstream_bindings"):
        if key not in parent or report.get(key) != parent[key]:
            raise ValueError("frozen_parent_training_configuration_changed:" + key)
    if (report.get("source_credit") != saved.CREDIT or parent.get("source_credit") != saved.CREDIT
            or not isinstance(report.get("upstream_bindings"), dict) or not report["upstream_bindings"]
            or report.get("restored_numeric_state_sha256") != parent["final_numeric_state_sha256"]):
        raise ValueError("exact_source_credit_upstream_and_restored_six_states_required")
    parent_full = checkpoints["extended"][parent["checkpoint_file"]]
    inherited = report.get("input_bindings", {})
    if (Path(report.get("parent_report", "")) != parent_path
            or inherited.get(str(parent_path)) != saved.sha256(parent_path)
            or report.get("parent_checkpoint") != parent_full["path"]
            or inherited.get(parent_full["path"]) != parent_full["sha256"]
            or any(inherited.get(path) != checksum for path, checksum in parent["input_bindings"].items())):
        raise ValueError("exact_global3000_parent_and_all_inherited_bindings_required")
    for path, checksum in inherited.items():
        saved.bound(Path(path), checksum, bindings)
    bindings[str(report_path)] = saved.sha256(report_path)
    full = report["status"] == FULL_STATUS
    if report.get("full_resume_available") is not full:
        raise ValueError("full_resume_claim_must_match_completion_status")
    if full:
        if (report.get("full_checkpoint_numeric_roundtrip_verified") is not True
                or report.get("full_checkpoint_zip_crc_verified") is not True
                or report.get("final_generator_matches_full_state") is not True
                or not digest(report.get("full_checkpoint_typed_state_sha256"))
                or not state_digests(report.get("final_numeric_state_sha256"))):
            raise ValueError("producer_full_CRC_typed_numeric_roundtrip_required")
    elif (not report.get("full_checkpoint_skip_reason")
            or any(report.get(key) is True for key in
                   ("full_checkpoint_numeric_roundtrip_verified", "full_checkpoint_zip_crc_verified"))
            or any(report.get(key) is not None for key in ("checkpoint_file", "checkpoint_sha256", "checkpoint_bytes"))):
        raise ValueError("generator_only_must_not_claim_verified_full_resume")
    new_checkpoints = {}
    snapshots = report.get("generator_snapshots")
    if not isinstance(snapshots, list) or not 1 <= len(snapshots) <= 2:
        raise ValueError("one_or_two_bound_generator_snapshots_required")
    steps = []
    for row in snapshots:
        step = row.get("completed_steps")
        if (type(step) is not int or not PARENT_STEP < step <= done or row.get("optimizer_resume") is not False
                or row.get("zip_crc_verified") is not True or row.get("file") != f"generator_step_{step:06d}.pt"):
            raise ValueError("bounded_generator_snapshot_contract_required")
        if step != done and step != 4500:
            raise ValueError("only_fixed4500_and_actual_final_snapshots_allowed")
        steps.append(step)
        new_checkpoints[row["file"]] = checked_checkpoint(report_path.parent, row["file"], row.get("sha256"),
            row.get("bytes"), bindings, 50_000_000)
    if steps != sorted(set(steps)) or steps[-1] != done:
        raise ValueError("unique_ordered_actual_final_generator_snapshot_required")
    final_g = snapshots[-1]
    if any(report.get("inference_checkpoint_" + key) != final_g[source]
           for key, source in (("file", "file"), ("sha256", "sha256"), ("bytes", "bytes"))):
        raise ValueError("inference_checkpoint_must_be_actual_final_snapshot")
    if full:
        new_checkpoints[report["checkpoint_file"]] = checked_checkpoint(report_path.parent, report["checkpoint_file"],
            report.get("checkpoint_sha256"), report.get("checkpoint_bytes"), bindings, 700_000_000)
    # Keep the unchanged42-window training criterion, not a new perceptual test.
    for name in ("baseline", "final"):
        value = report.get(name, {})
        if (set(value) != {"fit", "heldout"} or any(value[split].get("windows") != n
                or not isinstance(value[split].get("mean_logmel_l1"), (float, int))
                or not np.isfinite(value[split]["mean_logmel_l1"])
                for split, n in (("fit", 27), ("heldout", 15)))):
            raise ValueError("same_finite42_window_evaluation_required:" + name)
    if any(not np.isclose(report["baseline"][split]["mean_logmel_l1"], parent["final"][split]["mean_logmel_l1"],
                          rtol=1e-7, atol=1e-7) for split in ("fit", "heldout")):
        raise ValueError("parent3000_fixed_evaluation_not_reproduced")
    baseline, final = (reconstruction_rows(report, key) for key in ("baseline_reconstructions", "reconstructions"))
    selected = []
    for source in sources:
        case = source["case"]
        records = {}
        for role, row in (("baseline", baseline[case]), ("new", final[case])):
            path = saved.local_child(report_path.parent, row["file"], MAX_BYTES)
            saved.bound(path, row["sha256"], bindings, MAX_BYTES)
            with np.load(path, allow_pickle=False) as archive:
                if set(archive.files) != {"reference", "generated"}:
                    raise ValueError("raw_archive_requires_only_original_and_generated")
                reference, generated = saved.validate_arrays(archive["reference"], archive["generated"], source["reference"])
            if role == "baseline" and generated.tobytes() != source["generated"].tobytes():
                raise ValueError("parent3000_baseline_not_byte_exact:" + case)
            records[role] = dict(path=str(path), sha256=row["sha256"], record=row, generated=generated)
        selected.append(dict(source, old_generated=source["generated"], new_generated=records["new"]["generated"],
            old_raw_path=source["new_reconstruction_path"], old_raw_sha256=source["new_reconstruction_sha256"],
            baseline_raw_path=records["baseline"]["path"], baseline_raw_sha256=records["baseline"]["sha256"],
            new_raw_path=records["new"]["path"], new_raw_sha256=records["new"]["sha256"],
            new_training_record=records["new"]["record"], baseline_training_record=records["baseline"]["record"]))
    return parent, report, selected, bindings, dict(parent_lineage=checkpoints, new_continuation=new_checkpoints)


def diagnostics(wave, reference, reference_diag):
    result = level.diagnostics(wave, reference, reference_diag)
    result["spectral"] = timbre_metrics.summary(wave, reference)
    return result


def validate_comparison(comparison, labels):
    if (comparison.get("schema") != "mini.foundation-local-static-lufs-comparison.v1"
            or comparison.get("status") != "ready" or comparison.get("seconds") != 4.8
            or comparison.get("sample_rate_hz") != 48000 or comparison.get("channels") != 2
            or comparison.get("requested_target_lufs") != -24.
            or comparison.get("no_compression_AGC_EQ_pitch_time_edits") is not True
            or [row.get("label") for row in comparison.get("outputs", [])] != list(labels)):
        raise ValueError("frozen_4p8s_48k_stereo_static_three_way_comparison_required")
    target = comparison.get("actual_common_target_lufs")
    if not isinstance(target, (int, float)) or not np.isfinite(target) or target > -24.:
        raise ValueError("finite_peak_safe_common_LUFS_target_required")
    for row in comparison["outputs"]:
        measured = row.get("decoded", {}).get("integrated_lufs")
        peak = row.get("decoded", {}).get("true_peak_dbfs")
        if (row.get("programme_frames") != 230400 or type(row.get("decoded_frames")) is not int
                or not 230400 <= row["decoded_frames"] <= 231423
                or not isinstance(measured, (int, float)) or not np.isfinite(measured) or abs(measured - target) > .3
                or not isinstance(peak, (int, float)) or not np.isfinite(peak) or peak > -1.1 + 1e-9):
            raise ValueError("matched_common_LUFS_finite_peak_and_exact_programme_required")


def export(parent_path, report_path, output, compare_fn=None):
    parent_path, report_path, output = Path(parent_path), Path(report_path), Path(output)
    private = PRIVATE_ROOT.resolve(strict=True)
    if (not output.is_absolute() or output.is_symlink() or output.exists() or output.resolve() == private
            or not output.resolve().is_relative_to(private)
            or output.parent.resolve() != report_path.parent.parent.resolve()):
        raise ValueError("fresh_same_private_experiment_export_required")
    output.mkdir(mode=0o700)
    previous, started = os.umask(0o077), time.monotonic()
    try:
        with level.ResourceGuard(output, level.ResourceCaps(max_seconds=120, max_rss_bytes=2 * GIB)) as guard:
            capacity(output, 8_000_000)
            parent, training, selected, bindings, checkpoints = validate_inputs(parent_path, report_path)
            for path in (Path(__file__).resolve(), Path(extended.__file__).resolve(), Path(saved.__file__).resolve(),
                    Path(level.__file__).resolve(), Path(timbre_metrics.__file__).resolve(), saved.HELPER,
                    Path(level.prepare_corpus.__file__).resolve(), Path(level.pilot_metrics.__file__).resolve(),
                    Path(level.level_metrics.__file__).resolve(), level.HERE.parent / "foundation-model-trial/ace_limits.py"):
                bindings[str(path)] = saved.sha256(path)
            compare_fn = saved.load_comparator() if compare_fn is None else compare_fn
            done = training["completed_steps"]
            report = dict(schema="mini.sifigan-reconstruction-continuation-audition.v1", status="started",
                parent_report_path=str(parent_path), training_report_path=str(report_path),
                parent_completed_steps=PARENT_STEP, completed_steps=done,
                requested_additional_steps=training["requested_additional_steps"],
                additional_completed_steps=training["additional_completed_steps"],
                stopped_before_requested=training["additional_completed_steps"] < training["requested_additional_steps"],
                soft_stop_reason=training.get("soft_stop_reason"), training_status=training["status"],
                training_final_evaluation=training["final"], parent_final_evaluation=parent["final"],
                upstream_bindings=training["upstream_bindings"], checkpoints=checkpoints, input_bindings=bindings,
                full_resume_checkpoint_complete=training["full_resume_available"],
                producer_full_checkpoint_numeric_roundtrip_verified=training.get("full_checkpoint_numeric_roundtrip_verified", False),
                producer_full_checkpoint_typed_state_sha256=training.get("full_checkpoint_typed_state_sha256"),
                producer_final_numeric_state_sha256=training.get("final_numeric_state_sha256"),
                producer_final_generator_matches_full_state=training.get("final_generator_matches_full_state", False),
                exporter_independently_loaded_or_verified_typed_model_states=False,
                exporter_model_loaded_or_run=False, exporter_training=False, training_completed=True,
                parent_baselines_independently_byte_verified=True, source_fixed_support_unchanged=True,
                both_carriers_same_reference_RMS_condition=True, original_dynamic_gain=False,
                reference_envelope_used=True, source_envelope_NOT_learned=True, amplitude_condition_NOT_learned=True,
                AGC_on_both_neural_carriers=True, output_postprocessing=True,
                source_PCM_mixed_into_output=False, hard_mute_or_gate=False, EQ_pitch_or_time_edits=False,
                new_score_or_music=False, heldout_is_blind=False, quality_approved=False, perceptually_approved=False,
                source_credit=saved.CREDIT, max_export_seconds=120, max_export_bytes=MAX_BYTES,
                controller=dict(rms_window_samples=480, hop_samples=120, reflect_padding_samples=240,
                    amplitude_floor=1e-5, gain_bounds_db=[-60., 60.], log_gain_smoothing=[.25, .5, .25],
                    smoothing_padding="edge", interpolation="linear_frame_index_to_sample/120", offline_noncausal=True),
                caveats=["Same original/old3000/new reconstruction; no new score or learned performance model.",
                    "Only neural carriers receive identical supplied original RMS, not original PCM or a learned envelope.",
                    "Raw saved neural output remains unchanged and is measured separately before dynamic gain.",
                    "Static display gain is additional; requested -24LUFS may be lowered equally for safe peaks.",
                    "All source-fixed masks/quiet frames remain; candidate dropouts cannot improve denominators.",
                    "Repeated development sources are not blind tests; numerical changes do not certify audible improvement.",
                    "Exporter verifies archive SHA/size and producer validation records without loading checkpoint tensors.",
                    "A separate generator-only reload/re-render verification, if performed, is not implied by this report."], cases=[])
            for item in selected:
                capacity(output, 5_000_000)
                case, reference = item["case"], item["reference"]
                condition = level.extract_curve(reference)
                condition_record = level.write_npz(output / (case + "_EXPLICIT_SAME_REFERENCE_RMS.npz"), desired_level_dbfs=condition)
                rd = level.prepare_corpus.diagnostics(reference)
                pitch_mask = (rd["yin_hz"] > 0) & (rd["periodicity"] >= .90) & (rd["rms_db"] > -60.)
                level_mask = rd["rms_db"] > -60.
                source_diagnostics = level.write_npz(output / (case + "_SOURCE_ONLY_DIAGNOSTICS.npz"), **rd,
                    pitch_support=pitch_mask, level_support=level_mask, quiet_support=~level_mask)
                original_path = output / (case + "_ORIGINAL_REFERENCE_24k.wav")
                saved.write_float_wav(original_path, reference)
                paths, candidates = [original_path], []
                for role, step in (("old3000", PARENT_STEP), ("new", done)):
                    raw = item["old_generated"] if role == "old3000" else item["new_generated"]
                    raw_path = item["old_raw_path"] if role == "old3000" else item["new_raw_path"]
                    raw_sha = item["old_raw_sha256"] if role == "old3000" else item["new_raw_sha256"]
                    raw_copy = output / (case + "_" + role + "_RAW_UNCHANGED.npz")
                    shutil.copyfile(raw_path, raw_copy)
                    raw_copy.chmod(0o600)
                    if saved.sha256(raw_copy) != raw_sha:
                        raise ValueError("copied_raw_neural_archive_changed")
                    controlled, controls = level.apply_curve(raw, condition)
                    if controls["desired_level_dbfs"].tobytes() != condition.tobytes():
                        raise ValueError("identical_reference_RMS_condition_required")
                    controls_record = level.write_npz(output / (case + "_" + role + "_gain_controls.npz"), **controls)
                    conditioned_record = level.write_npz(output / (case + "_" + role + "_LEVEL_CONDITIONED.npz"),
                        generated=controlled, reference=reference)
                    native = output / (case + "_" + role + "_LEVEL_CONDITIONED_24k.wav")
                    saved.write_float_wav(native, controlled)
                    paths.append(native)
                    candidates.append(dict(role=role, completed_steps=step, raw_path=raw_path, raw_sha256=raw_sha,
                        unchanged_raw_copy=dict(file=raw_copy.name, sha256=saved.sha256(raw_copy)),
                        raw_PCM_sha256=array_hash(raw), controlled_PCM_sha256=array_hash(controlled),
                        reference_condition_array_sha256=array_hash(condition), controls=controls_record,
                        conditioned=conditioned_record, raw_diagnostics=diagnostics(raw, reference, rd),
                        conditioned_diagnostics=diagnostics(controlled, reference, rd),
                        raw_training_record=item["raw_training_record"] if role == "old3000" else item["new_training_record"],
                        raw_training_record_copied_unchanged=True))
                labels = ("ORIGINAL_reference_same_source", "OLD_trained_global3000_EXPLICIT_REFERENCE_RMS",
                          f"NEW_trained_global{done}_EXPLICIT_REFERENCE_RMS")
                destination = output / case
                comparison = compare_fn([label + "=" + str(path) for label, path in zip(labels, paths)], destination, seconds=4.8)
                validate_comparison(comparison, labels)
                comparison_path = saved.local_child(destination, "comparison.json", MAX_BYTES)
                if json.loads(comparison_path.read_text()) != comparison:
                    raise ValueError("comparison_file_and_returned_record_disagree")
                outputs = []
                for role, row, source_path in zip(("original_reference", "old3000", "new_candidate"), comparison["outputs"], paths):
                    path = saved.local_child(destination, row["file"], MAX_BYTES)
                    saved.bound(path, row["sha256"], {}, MAX_BYTES)
                    if row.get("source_path") != str(source_path) or row.get("source_sha256") != saved.sha256(source_path):
                        raise ValueError("AAC_must_bind_exact_declared_native_waveform")
                    outputs.append(dict(row, path=str(path), role=role, perceptually_approved=False))
                report["cases"].append(dict(case=case, original_path=item["original_path"], original_sha256=item["original_sha256"],
                    corpus_npz_path=item["corpus_npz_path"], corpus_npz_sha256=item["corpus_npz_sha256"],
                    source_reference_byte_exact_corpus=True, reference_PCM_sha256=array_hash(reference),
                    baseline_raw_path=item["baseline_raw_path"], baseline_raw_sha256=item["baseline_raw_sha256"],
                    parent_baseline_byte_exact=True, reference_condition=condition_record,
                    source_only_diagnostics=source_diagnostics, source_pitch_support_frames=int(pitch_mask.sum()),
                    source_pitch_mask_sha256=array_hash(pitch_mask), source_level_support_frames=int(level_mask.sum()),
                    source_quiet_frames=int((~level_mask).sum()), source_level_mask_sha256=array_hash(level_mask),
                    candidates=candidates, native_wavs=[dict(path=str(path), sha256=saved.sha256(path)) for path in paths],
                    comparison_path=str(comparison_path), comparison_sha256=saved.sha256(comparison_path), outputs=outputs))
            for path, checksum in bindings.items():
                saved.bound(Path(path), checksum, {})
            report.update(status="same_source_old_new_training_comparisons_ready_not_perceptually_approved", inputs_unchanged=True,
                elapsed_seconds=time.monotonic() - started, resources=guard.snapshot())
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
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = export(args.parent_report, args.report, args.output)
    print(json.dumps(dict(status=result["status"], completed_steps=result["completed_steps"],
        candidate_files=[row["outputs"][2]["path"] for row in result["cases"]], quality_approved=False)))
