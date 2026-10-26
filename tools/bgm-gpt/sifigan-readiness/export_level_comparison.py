#!/usr/bin/env python3
"""Export saved OLD/NEW learned reconstructions; never source-copy or new score.

No model execution. Whole-file static LUFS matching does not repair the raw
within-phrase envelope, silence leakage, pitch, or instrument identity.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path

import numpy as np
import export_corpus_audition as old

PRIVATE_ROOT = old.PRIVATE_ROOT


def validate_inputs(parent_path, child_path):
    parent_path, child_path = old.regular(parent_path, 5_000_000), old.regular(child_path, 5_000_000)
    parent, selected, bindings, old_checkpoints = old.validate_inputs(parent_path)
    child = json.loads(child_path.read_text())
    if (child.get("schema") != "mini.sifigan-level-fix.v1"
            or child.get("status") != "bounded_level_fix_complete_not_perceptually_approved"
            or child.get("parent_completed_steps") != 1000
            or type(child.get("completed_steps")) is not int or not 1000 < child["completed_steps"] <= 2000
            or child.get("additional_completed_steps") != child["completed_steps"] - 1000
            or child.get("parent_final_baseline_reproduced") is not True):
        raise ValueError("completed_bound_global1000_level_continuation_required")
    for key in ("quality_approved", "new_score_or_music", "normalizer_changed", "input_gain_changed",
                "conditioning_or_F0_changed", "optimizer_or_scheduler_reset", "public_weights_used",
                "heldout_used_for_optimizer", "output_mute_EQ_AGC_gain_envelope_source_mix"):
        if child.get(key) is not False:
            raise ValueError("unchanged_source_controls_and_no_output_DSP_required:" + key)
    if (Path(child["parent_report"]) != parent_path
            or child["input_bindings"].get(str(parent_path)) != old.sha256(parent_path)):
        raise ValueError("child_must_bind_exact_parent_report")
    original_checkpoint = old_checkpoints["final_full_resume.pt"]
    if (child["parent_checkpoint"] != original_checkpoint["path"]
            or child["input_bindings"].get(original_checkpoint["path"]) != original_checkpoint["sha256"]):
        raise ValueError("child_must_resume_exact_parent_full_checkpoint")
    for path, checksum in child["input_bindings"].items():
        old.bound(Path(path), checksum, bindings)
    bindings[str(child_path)] = old.sha256(child_path)
    new_checkpoints = {}
    for filename, hash_key, size_key in (("final_full_resume.pt", "checkpoint_sha256", "checkpoint_bytes"),
            ("final_generator.pt", "inference_checkpoint_sha256", "inference_checkpoint_bytes")):
        path = old.local_child(child_path.parent, filename, 850_000_000)
        if path.stat().st_size != child[size_key]:
            raise ValueError("child_checkpoint_size_changed")
        old.bound(path, child[hash_key], bindings)
        new_checkpoints[filename] = dict(path=str(path), sha256=child[hash_key], bytes=path.stat().st_size,
            hash_verified_without_loading=True)
    for key in ("baseline_reconstructions", "reconstructions"):
        rows = child[key]
        if len(rows) != 2 or {row["case"] for row in rows} != set(old.CASES):
            raise ValueError("exact_two_child_baseline_and_final_reconstructions_required")
    pairs = []
    for item in selected:
        case = item["case"]
        reload_row = next(row for row in child["baseline_reconstructions"] if row["case"] == case)
        after_row = next(row for row in child["reconstructions"] if row["case"] == case)
        archives = []
        for row in (reload_row, after_row):
            if row.get("perceptually_approved") is not False or "level_metrics" not in row:
                raise ValueError("unapproved_child_reconstruction_with_raw_level_metrics_required")
            path = old.local_child(child_path.parent, row["file"])
            old.bound(path, row["sha256"], bindings)
            with np.load(path, allow_pickle=False) as archive:
                reference, generated = old.validate_arrays(archive["reference"], archive["generated"], item["reference"])
            archives.append((path, reference, generated))
        reload_path, reference, reloaded = archives[0]
        after_path, _, generated = archives[1]
        exact = reloaded.tobytes() == item["generated"].tobytes()
        if not np.allclose(reloaded, item["generated"], rtol=1e-5, atol=1e-6):
            raise ValueError("child_reload_baseline_does_not_match_parent1000")
        pairs.append(dict(item, before=item["generated"].copy(), after=generated,
            reload_path=str(reload_path), reload_sha256=reload_row["sha256"], reload_is_byte_exact_parent=exact,
            after_path=str(after_path), after_sha256=after_row["sha256"],
            raw_baseline_level_metrics=reload_row["level_metrics"], raw_after_level_metrics=after_row["level_metrics"],
            raw_after_pitch_metrics=after_row.get("metrics", {})))
    return child, pairs, bindings, dict(old_global1000=old_checkpoints, new_level_fix=new_checkpoints)


def export(parent_report, child_report, output, compare_fn=None):
    output = Path(output)
    if not output.is_absolute() or output.is_symlink() or output.exists():
        raise ValueError("fresh_absolute_private_export_required")
    root, resolved = PRIVATE_ROOT.resolve(strict=True), output.resolve()
    if resolved == root or not resolved.is_relative_to(root):
        raise ValueError("approved_private_export_root_required")
    child, selected, bindings, checkpoints = validate_inputs(parent_report, child_report)
    for path in (Path(__file__).resolve(), Path(old.__file__).resolve(), old.HELPER):
        bindings[str(path)] = old.sha256(path)
    compare_fn = old.load_comparator() if compare_fn is None else compare_fn
    output.mkdir(mode=0o700)
    previous = os.umask(0o077)
    report = dict(schema="mini.sifigan-learned-level-comparison.v1",
        status="research_intermediate_not_quality_approved", parent_completed_steps=1000,
        completed_steps=child["completed_steps"], parent_report_path=str(parent_report), child_report_path=str(child_report),
        input_bindings=bindings, checkpoints=checkpoints, source_credit=old.CREDIT,
        model_loaded_or_run=False, new_score_or_music=False, quality_approved=False, perceptually_approved=False,
        raw_waveforms_preserved_as_float32_WAV=True, no_EQ_AGC_compression_pitch_time_edit_source_mix_or_output_mute=True,
        processing="two4.8s OLDlearned/NEWlearned pairs; per-file static-LUFS display gain;24kmono->48kstereo AAC192k",
        static_LUFS_does_not_repair_actual_time_varying_level_or_leakage=True,
        two_training_interventions=child.get("two_interventions"), evaluation_role=child.get("evaluation_role"),
        caveats=["OLD is saved learned global1000 output, not an original performance; NEW is learned continuation, not a new score.",
            "Whole-file LUFS matching changes a constant display gain only; raw envelope and leakage defects remain audible if present.",
            "Raw child level_metrics are copied unchanged, before display gains; they are not a perceptual quality verdict.",
            "Two training interventions and adaptively inspected heldout recordings do not establish single-cause improvement.",
            "Pitch/octave ambiguity and source F0 controls are not edited or relabeled."], pairs=[])
    try:
        for item in selected:
            case = item["case"]
            before_path = output / (case + "_OLD_learned_global1000_24k_mono.wav")
            after_path = output / (case + "_NEW_learned_level_fix_24k_mono.wav")
            old.write_float_wav(before_path, item["before"])
            old.write_float_wav(after_path, item["after"])
            labels = ("OLD_learned_global1000_same_source", f"NEW_learned_level_fix_global{child['completed_steps']}_same_source_not_new_score")
            destination = output / case
            comparison = compare_fn([labels[0] + "=" + str(before_path), labels[1] + "=" + str(after_path)],
                                    destination, seconds=4.8)
            if (comparison.get("schema") != "mini.foundation-local-static-lufs-comparison.v1"
                    or comparison.get("status") != "ready" or comparison.get("seconds") != 4.8
                    or comparison.get("no_compression_AGC_EQ_pitch_time_edits") is not True
                    or [row["label"] for row in comparison["outputs"]] != list(labels)):
                raise ValueError("official_static_gain_OLD_NEW_comparison_required")
            outputs = []
            for row in comparison["outputs"]:
                path = old.local_child(destination, row["file"], 5_000_000)
                if old.sha256(path) != row["sha256"]:
                    raise ValueError("encoded_audition_hash_changed")
                outputs.append(dict(row, path=str(path), perceptually_approved=False))
            comparison_path = old.local_child(destination, "comparison.json", 5_000_000)
            report["pairs"].append(dict(case=case, original_path=item["original_path"], original_sha256=item["original_sha256"],
                corpus_npz_path=item["corpus_npz_path"], corpus_npz_sha256=item["corpus_npz_sha256"],
                before_reconstruction_path=item["reconstruction_path"], before_reconstruction_sha256=item["reconstruction_sha256"],
                reload_baseline_path=item["reload_path"], reload_baseline_sha256=item["reload_sha256"],
                reload_baseline_is_byte_exact_parent=item["reload_is_byte_exact_parent"],
                after_reconstruction_path=item["after_path"], after_reconstruction_sha256=item["after_sha256"],
                before_PCM_sha256=hashlib.sha256(item["before"].tobytes()).hexdigest(),
                after_PCM_sha256=hashlib.sha256(item["after"].tobytes()).hexdigest(),
                native_wavs=[dict(path=str(p), sha256=old.sha256(p)) for p in (before_path, after_path)],
                raw_baseline_level_metrics=item["raw_baseline_level_metrics"], raw_after_level_metrics=item["raw_after_level_metrics"],
                raw_after_pitch_metrics=item["raw_after_pitch_metrics"],
                comparison_path=str(comparison_path), comparison_sha256=old.sha256(comparison_path), outputs=outputs))
        if any(old.sha256(path) != checksum for path, checksum in bindings.items()):
            raise ValueError("bound_input_or_export_code_changed")
        with (output / "export_report.json").open("x", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
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
    print(json.dumps(dict(status=result["status"], pairs=len(result["pairs"]), quality_approved=False)))
