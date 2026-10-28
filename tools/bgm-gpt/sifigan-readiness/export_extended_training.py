#!/usr/bin/env python3
"""Export NEW extended-training candidates, never replay the rejected old052.

The saved neural output receives an EXPLICIT source-derived level curve, using
the exact frozen20ms/3tap controller. This is not learned envelope prediction,
new-score generation, or a perceptual quality approval. No model is loaded.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import time

import numpy as np
import export_corpus_audition as saved
import build_level_conditioned_trial as level

PRIVATE_ROOT = saved.PRIVATE_ROOT
MAX_BYTES = 10_000_000


def pcm_sha(wave):
    return hashlib.sha256(wave.tobytes()).hexdigest()


def validate_inputs(parent_path, report_path):
    """Validate completed lineage/files using hashes only, never torch.load."""
    parent_path = saved.regular(parent_path, 5_000_000)
    report_path = saved.regular(report_path, 5_000_000)
    parent, sources, bindings, parent_checkpoints = saved.validate_inputs(parent_path)
    report = json.loads(report_path.read_text())
    # The producer contract is intentionally strict: aborted/progress reports
    # with orphaned renders cannot be presented as a completed extension.
    if (report.get("schema") != "mini.sifigan-corpus-extension.v1"
            or report.get("status") not in (
                "bounded_extension_complete_not_perceptually_approved",
                "generator_only_not_full_resume")
            or report.get("parent_completed_steps") != 1000
            or type(report.get("completed_steps")) is not int
            or not 1000 < report["completed_steps"] <= 3000
            or report.get("additional_completed_steps") != report["completed_steps"] - 1000
            or report.get("parent_final_baseline_reproduced") is not True
            or report.get("phase") != "complete" or report.get("parent_all_inputs_preserved") is not True):
        raise ValueError("completed_bound_global1000_extension_required")
    if report.get("unchanged_training_recipe") is not True:
        raise ValueError("unchanged_training_recipe_required")
    for key in ("quality_approved", "new_score_or_music", "normalizer_changed", "input_gain_changed",
                "AP_or_cf0_changed", "optimizer_or_scheduler_reset", "public_weights_used", "hyperparameters_changed",
                "heldout_used_for_optimizer", "output_processing", "sampler_changed", "loss_changed"):
        if report.get(key) is not False:
            raise ValueError("unchanged_raw_neural_training_contract_required:" + key)
    if (Path(report["parent_report"]) != parent_path
            or report["input_bindings"].get(str(parent_path)) != saved.sha256(parent_path)
            or report["parent_checkpoint"] != parent_checkpoints["final_full_resume.pt"]["path"]
            or report["input_bindings"].get(report["parent_checkpoint"]) != parent_checkpoints["final_full_resume.pt"]["sha256"]
            or report["data_gate"] != parent["data_gate"]):
        raise ValueError("exact_parent1000_report_and_checkpoint_required")
    for path, checksum in parent["input_bindings"].items():
        saved.bound(Path(path), checksum, bindings)
    for path, checksum in report["input_bindings"].items():
        saved.bound(Path(path), checksum, bindings)
    bindings[str(report_path)] = saved.sha256(report_path)
    checkpoints = {}
    full = report["status"] == "bounded_extension_complete_not_perceptually_approved"
    if report.get("full_resume_available") is not full:
        raise ValueError("full_resume_claim_must_match_completion_status")
    if full and report.get("full_checkpoint_numeric_roundtrip_verified") is not True:
        raise ValueError("producer_full_numeric_checkpoint_roundtrip_required")
    checkpoint_records = [(report["inference_checkpoint_file"], "inference_checkpoint_sha256", "inference_checkpoint_bytes")]
    if full:
        checkpoint_records.append((report["checkpoint_file"], "checkpoint_sha256", "checkpoint_bytes"))
    for name, hash_key, size_key in checkpoint_records:
        path = saved.local_child(report_path.parent, name, 850_000_000)
        if path.stat().st_size != report[size_key]:
            raise ValueError("extension_checkpoint_size_changed")
        saved.bound(path, report[hash_key], bindings)
        checkpoints[name] = dict(path=str(path), sha256=report[hash_key], bytes=path.stat().st_size,
            hash_verified_without_loading=True)
    rows = report["reconstructions"]
    if len(rows) != 2 or {row["case"] for row in rows} != set(saved.CASES):
        raise ValueError("exact_two_fixed_new_reconstructions_required")
    selected = []
    for source in sources:
        row = next(item for item in rows if item["case"] == source["case"])
        if row.get("perceptually_approved") is not False or not isinstance(row.get("metrics"), dict):
            raise ValueError("unapproved_raw_reconstruction_metrics_required")
        path = saved.local_child(report_path.parent, row["file"], MAX_BYTES)
        saved.bound(path, row["sha256"], bindings)
        with np.load(path, allow_pickle=False) as archive:
            reference, generated = saved.validate_arrays(archive["reference"], archive["generated"], source["reference"])
        selected.append(dict(source, reference=reference, generated=generated,
            new_reconstruction_path=str(path), new_reconstruction_sha256=row["sha256"], raw_training_record=row))
    return report, selected, bindings, dict(parent_global1000=parent_checkpoints, extended=checkpoints)


def export(parent_report, report_path, output, compare_fn=None):
    output = Path(output)
    root = PRIVATE_ROOT.resolve(strict=True)
    if (not output.is_absolute() or output.is_symlink() or output.exists()
            or output.resolve() == root or not output.resolve().is_relative_to(root)):
        raise ValueError("fresh_absolute_private_export_required")
    output.mkdir(mode=0o700)
    started, previous = time.monotonic(), os.umask(0o077)
    try:
        with level.ResourceGuard(output, level.ResourceCaps(max_seconds=120, max_rss_bytes=2 * level.GIB)) as guard:
            training, selected, bindings, checkpoints = validate_inputs(parent_report, report_path)
            for path in (Path(__file__).resolve(), Path(saved.__file__).resolve(), Path(level.__file__).resolve(),
                    saved.HELPER, Path(level.prepare_corpus.__file__).resolve(), Path(level.pilot_metrics.__file__).resolve(),
                    Path(level.level_metrics.__file__).resolve(), level.HERE.parent / "foundation-model-trial/ace_limits.py"):
                bindings[str(path)] = saved.sha256(path)
            compare_fn = saved.load_comparator() if compare_fn is None else compare_fn
            report = dict(schema="mini.sifigan-extended-training-audition.v1", status="started",
                completed_steps=training["completed_steps"], additional_completed_steps=training["additional_completed_steps"],
                parent_report_path=str(parent_report), training_report_path=str(report_path),
                training_status=training["status"], evaluation_role=training.get("evaluation_role"),
                upstream_bindings=training.get("upstream_bindings", {}),
                training_completed=True, export_model_loaded_or_run=False, export_training=False,
                sourcecurveused=True, reference_envelope_used=True, source_envelope_NOT_learned=True,
                amplitude_condition_NOT_learned=True, AGC=True, output_postprocessing=True,
                source_PCM_mixed_into_output=False, hard_mute_or_gate=False, EQ_pitch_or_time_edits=False,
                new_score_or_music=False, heldout_is_blind=False, quality_approved=False, perceptually_approved=False,
                old_global1000_or_rejected052_presented=False, input_bindings=bindings, checkpoints=checkpoints,
                full_resume_checkpoint_complete=training["full_resume_available"], source_credit=saved.CREDIT,
                producer_full_checkpoint_numeric_roundtrip_verified=training.get("full_checkpoint_numeric_roundtrip_verified", False),
                controller=dict(rms_window_samples=480, hop_samples=120, reflect_padding_samples=240,
                    amplitude_floor=1e-5, gain_bounds_db=[-60., 60.], log_gain_smoothing=[.25, .5, .25],
                    smoothing_padding="edge", interpolation="linear_frame_index_to_sample/120", offline_noncausal=True),
                caveats=["Reference RMS curve is explicitly supplied, not learned. Same controller as prior046/048.",
                    "Pairs contain ORIGINAL reference and NEW trained candidate only; rejected old052 is not replayed.",
                    "No source PCM is mixed into the carrier. Raw saved neural arrays/metrics remain unchanged.",
                    "Static per-file LUFS display gain is additional to the declared dynamic gain controller.",
                    "Centered analysis/smoothing/interpolation uses future context; zero waveform shift is not zero latency.",
                    "Repeatedly inspected heldout sources are development validation, not an untouched blind test.",
                    "Actual additional training steps do not guarantee improved timbre, pitch, vibrato, or naturalness."], pairs=[])
            for item in selected:
                case, raw, reference = item["case"], item["generated"], item["reference"]
                # COPY DIAGNOSTIC: reference PCM supplies only the declared
                # amplitude condition, not output samples or pitch controls.
                condition = level.extract_curve(reference)
                controlled, controls = level.apply_curve(raw, condition)
                raw_copy = output / (case + "_RAW_UNCHANGED.npz")
                shutil.copyfile(item["new_reconstruction_path"], raw_copy)
                raw_copy.chmod(0o600)
                if saved.sha256(raw_copy) != item["new_reconstruction_sha256"]:
                    raise ValueError("copied_raw_neural_archive_changed")
                condition_file = level.write_npz(output / (case + "_EXPLICIT_REFERENCE_condition.npz"), desired_level_dbfs=condition)
                control_file = level.write_npz(output / (case + "_gain_controls.npz"), **controls)
                after_file = level.write_npz(output / (case + "_LEVEL_CONDITIONED.npz"), generated=controlled, reference=reference)
                rd = level.prepare_corpus.diagnostics(reference)
                reference_path = output / (case + "_ORIGINAL_REFERENCE_24k_mono.wav")
                candidate_path = output / (case + "_NEW_LEVEL_CONDITIONED_24k_mono.wav")
                saved.write_float_wav(reference_path, reference)
                saved.write_float_wav(candidate_path, controlled)
                labels = ("ORIGINAL_reference_same_source", f"NEW_trained_global{training['completed_steps']}_EXPLICIT_REFERENCE_LEVEL_NOT_NEW_SCORE")
                destination = output / case
                comparison = compare_fn([label + "=" + str(path) for label, path in zip(labels, (reference_path, candidate_path))],
                    destination, seconds=4.8)
                if (comparison.get("schema") != "mini.foundation-local-static-lufs-comparison.v1" or comparison.get("status") != "ready"
                        or comparison.get("seconds") != 4.8 or comparison.get("no_compression_AGC_EQ_pitch_time_edits") is not True
                        or [row["label"] for row in comparison["outputs"]] != list(labels)):
                    raise ValueError("frozen_static_LUFS_original_NEW_pair_required")
                outputs = []
                for index, row in enumerate(comparison["outputs"]):
                    path = saved.local_child(destination, row["file"], MAX_BYTES)
                    saved.bound(path, row["sha256"], {})
                    outputs.append(dict(row, path=str(path), role="original_reference" if index == 0 else "new_candidate",
                        perceptually_approved=False))
                comparison_path = saved.local_child(destination, "comparison.json", MAX_BYTES)
                report["pairs"].append(dict(case=case, original_path=item["original_path"], original_sha256=item["original_sha256"],
                    corpus_npz_path=item["corpus_npz_path"], corpus_npz_sha256=item["corpus_npz_sha256"],
                    new_raw_path=item["new_reconstruction_path"], new_raw_sha256=item["new_reconstruction_sha256"],
                    unchanged_raw_copy=dict(file=raw_copy.name, sha256=saved.sha256(raw_copy)),
                    raw_training_record=item["raw_training_record"], raw_metrics_copied_unchanged=True,
                    raw_recomputed_diagnostics=level.diagnostics(raw, reference, rd),
                    conditioned_diagnostics=level.diagnostics(controlled, reference, rd),
                    condition=condition_file, controls=control_file, conditioned=after_file,
                    source_reference_byte_exact_corpus=True, reference_PCM_sha256=pcm_sha(reference),
                    raw_PCM_sha256=pcm_sha(raw), controlled_PCM_sha256=pcm_sha(controlled),
                    condition_array_sha256=pcm_sha(condition),
                    native_wavs=[dict(path=str(path), sha256=saved.sha256(path)) for path in (reference_path, candidate_path)],
                    comparison_path=str(comparison_path), comparison_sha256=saved.sha256(comparison_path), outputs=outputs))
            if any(saved.sha256(path) != checksum for path, checksum in bindings.items()):
                raise ValueError("bound_training_source_model_or_export_code_changed")
            report.update(status="new_extended_candidates_ready_not_perceptually_approved", inputs_unchanged=True,
                elapsed_seconds=time.monotonic() - started, resources=guard.snapshot())
            payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
            if sum(path.stat().st_size for path in output.rglob("*") if path.is_file()) + len(payload) > MAX_BYTES:
                raise ValueError("10MB_export_cap")
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
        candidate_files=[row["outputs"][1]["path"] for row in result["pairs"]], quality_approved=False)))
