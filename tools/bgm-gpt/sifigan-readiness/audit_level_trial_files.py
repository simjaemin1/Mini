#!/usr/bin/env python3
"""Read-only orphan-render diagnostics, never a completed-training report.

No checkpoints are loaded or unpickled, no audio is written or processed.
"""
import argparse
import json
import os
from pathlib import Path
import time
import zipfile

import numpy as np
import export_corpus_audition as saved
import level_metrics
import pilot_metrics
import prepare_corpus


def partial_checkpoint(path):
    path = saved.regular(path)
    is_zip = zipfile.is_zipfile(path)
    if is_zip:
        raise ValueError("expected_known_truncated_nonzip_checkpoint_not_a_loadability_test")
    return dict(path=str(path), bytes=path.stat().st_size, sha256=saved.sha256(path),
        zipfile_is_zipfile=is_zip, full_checkpoint_incomplete=True,
        checkpoint_unpickled_or_loaded=False, full_resumable_checkpoint_recovered=False)


def validate_orphan(reference, generated, corpus_reference, parent_generated=None):
    reference, generated = saved.validate_arrays(reference, generated, corpus_reference)
    if parent_generated is not None and not np.allclose(generated, parent_generated, rtol=1e-5, atol=1e-6):
        raise ValueError("orphan_baseline_not_parent1000_generated")
    return reference, generated


def audit(parent_report, retry_dir, output):
    output, retry_dir = Path(output), Path(retry_dir).resolve(strict=True)
    if (not output.is_absolute() or output.exists() or output.is_symlink()
            or output.resolve().is_relative_to(retry_dir)):
        raise ValueError("fresh_absolute_audit_outside_read_only_retry_required")
    root = saved.PRIVATE_ROOT.resolve(strict=True)
    if not output.resolve().is_relative_to(root):
        raise ValueError("private_audit_output_required")
    started = time.monotonic()
    parent, selected, bindings, checkpoints = saved.validate_inputs(parent_report)
    for path, checksum in parent["input_bindings"].items():
        saved.bound(Path(path), checksum, bindings)
    checkpoint = partial_checkpoint(saved.local_child(retry_dir, "final_full_resume.pt", 850_000_000))
    bindings[checkpoint["path"]] = checkpoint["sha256"]
    modules = (Path(__file__).resolve(), Path(saved.__file__).resolve(), Path(prepare_corpus.__file__).resolve(),
        Path(pilot_metrics.__file__).resolve(), Path(level_metrics.__file__).resolve(),
        Path(__file__).with_name("train_level_fix.py").resolve())
    code_bindings = {str(path): saved.sha256(path) for path in modules}
    bindings.update(code_bindings)
    report = dict(schema="mini.sifigan-orphan-level-render-audit.v1",
        status="orphaned_render_audit_not_training_completion", quality_approved=False,
        parent_report_path=str(parent_report), retry_directory=str(retry_dir), parent_completed_steps=1000,
        reported_training_event_observed_global_step=1500,
        training_event_is_not_verified_by_complete_serialized_optimizer_state=True,
        training_completion_established=False, full_checkpoint_incomplete=True,
        full_resumable_checkpoint_recovered=False, partial_checkpoint=checkpoint,
        parent_checkpoints=checkpoints, input_bindings=bindings, code_bindings=code_bindings,
        checkpoint_unpickled_or_loaded=False, models_run=0, generated_audio_written=0,
        no_output_DSP_or_gain_or_F0_edits=True, source_credit=saved.CREDIT, records=[],
        interpretation="Partial experimental renders only; no success, naturalness, or better-audio claim.")
    for item in selected:
        reference_diag = prepare_corpus.diagnostics(item["reference"])
        for stage in ("baseline", "final"):
            if time.monotonic() - started > 300:
                raise RuntimeError("300second_metadata_audit_limit")
            path = saved.local_child(retry_dir, stage + "_" + item["case"] + "_reconstruction.npz")
            checksum = saved.sha256(path)
            bindings[str(path)] = checksum
            with np.load(path, allow_pickle=False) as archive:
                reference, generated = validate_orphan(archive["reference"], archive["generated"],
                    item["reference"], item["generated"] if stage == "baseline" else None)
            generated_diag = prepare_corpus.diagnostics(generated)
            rd, gd = reference_diag, generated_diag
            pitch = pilot_metrics.summary(generated, reference, rd["yin_hz"], rd["periodicity"],
                gd["yin_hz"], gd["periodicity"], rd["rms_db"], gd["rms_db"])
            level = level_metrics.summary(generated, reference, rd["rms_db"], gd["rms_db"])
            report["records"].append(dict(case=item["case"], stage=stage, npz_path=str(path), npz_sha256=checksum,
                npz_bytes=path.stat().st_size, source_path=item["original_path"], source_sha256=item["original_sha256"],
                reference_is_byte_exact_corpus=True,
                baseline_is_byte_exact_parent=generated.tobytes() == item["generated"].tobytes() if stage == "baseline" else None,
                samples=saved.SAMPLES, seconds=4.8, pilot_metrics=pitch, level_metrics=level))
    if any(saved.sha256(path) != checksum for path, checksum in bindings.items()):
        raise ValueError("source_parent_or_orphan_files_changed_during_audit")
    report.update(input_hashes_unchanged=True, elapsed_seconds=time.monotonic() - started)
    payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
    if len(payload) > 5_000_000:
        raise ValueError("5MB_metadata_output_limit")
    output.mkdir(mode=0o700)
    with os.fdopen(os.open(output / "orphan_audit.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as handle:
        handle.write(payload)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent-report", type=Path, required=True)
    parser.add_argument("--retry-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.parent_report, args.retry_dir, args.output)
    print(json.dumps(dict(status=result["status"], records=len(result["records"]), full_checkpoint_incomplete=True)))
