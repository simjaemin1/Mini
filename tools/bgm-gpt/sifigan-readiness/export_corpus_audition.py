#!/usr/bin/env python3
"""Export two original/reconstruction research pairs from fixed global step1000.

No model is loaded. Static programme-level display gain does not repair quiet
breath leakage, unstable within-phrase level, timbre, or pitch defects.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys

import numpy as np

CASES = ("deepvib48", "arirang001")
RATE, SAMPLES = 24000, 115200
PRIVATE_ROOT = Path.home() / "Mini/_bgm/gpt"
HELPER = Path(__file__).resolve().parents[1] / "foundation-model-trial/compare_audio.py"
CREDIT = "국악기 음원 제공 — 국립국악원 (공공누리 제1유형)"


def sha256(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def regular(path, maximum=850_000_000):
    path = Path(path)
    if (not path.is_absolute() or path.is_symlink() or not path.is_file()
            or path.stat().st_size > maximum):
        raise ValueError("bounded_absolute_regular_input_required")
    return path


def local_child(parent, name, maximum=100_000_000):
    if not isinstance(name, str) or Path(name).name != name or name in ("", ".", ".."):
        raise ValueError("safe_local_basename_required")
    return regular(parent / name, maximum)


def bound(path, expected, bindings, maximum=850_000_000):
    path = regular(path, maximum)
    if not isinstance(expected, str) or sha256(path) != expected:
        raise ValueError("input_hash_binding_changed")
    bindings[str(path)] = expected
    return path


def validate_arrays(reference, generated, corpus_waveform):
    for array in (reference, generated):
        if (array.dtype != np.float32 or array.shape != (SAMPLES,)
                or not np.isfinite(array).all()):
            raise ValueError("exact_finite_115200_float32_mono_required")
    if (corpus_waveform.dtype != np.float32 or corpus_waveform.ndim != 1
            or len(corpus_waveform) < SAMPLES or not np.isfinite(corpus_waveform[:SAMPLES]).all()):
        raise ValueError("finite_float32_corpus_prefix_required")
    if reference.tobytes() != corpus_waveform[:SAMPLES].tobytes():
        raise ValueError("reference_not_byte_exact_original_corpus_prefix")
    return reference.copy(), generated.copy()


def validate_inputs(report_path):
    report_path = regular(report_path, 5_000_000)
    report = json.loads(report_path.read_text())
    if (report.get("schema") != "mini.sifigan-corpus-resume.v1"
            or report.get("status") != "bounded_resume_complete_not_perceptually_approved"
            or report.get("completed_steps") != 1000
            or report.get("additional_completed_steps") != 500
            or report.get("parent_completed_steps") != 500):
        raise ValueError("completed_global1000_continuation_required")
    for flag in ("quality_approved", "new_score_or_music", "public_weights_used", "heldout_used_for_optimizer"):
        if report.get(flag) is not False:
            raise ValueError("unapproved_same_source_research_report_required")
    bindings = {str(report_path): sha256(report_path)}
    inherited = report["input_bindings"]
    gate_path = regular(report["data_gate"], 50_000_000)
    bound(gate_path, inherited.get(str(gate_path)), bindings)
    gate = json.loads(gate_path.read_text())
    if gate.get("schema") != "mini.sifigan-window-gate.v1" or gate.get("status") != "complete":
        raise ValueError("completed_bound_window_gate_required")
    manifest_path = regular(gate["source_manifest_path"], 5_000_000)
    if inherited.get(str(manifest_path)) != gate["source_manifest_sha256"]:
        raise ValueError("continuation_and_gate_corpus_binding_disagree")
    bound(manifest_path, gate["source_manifest_sha256"], bindings)
    corpus = json.loads(manifest_path.read_text())
    if (corpus.get("schema") != "mini.sifigan-corpus.v1" or corpus.get("status") != "complete"
            or corpus.get("sample_rate") != RATE or corpus.get("hop_size") != 120):
        raise ValueError("completed24k_original_corpus_required")
    checkpoints = {}
    for filename, hash_key, size_key in (
            ("final_full_resume.pt", "checkpoint_sha256", "checkpoint_bytes"),
            ("final_generator.pt", "inference_checkpoint_sha256", "inference_checkpoint_bytes")):
        path = local_child(report_path.parent, filename, 850_000_000)
        if path.stat().st_size != report[size_key]:
            raise ValueError("completed_checkpoint_size_changed")
        bound(path, report[hash_key], bindings)
        checkpoints[filename] = dict(path=str(path), sha256=report[hash_key],
                                     bytes=path.stat().st_size, hash_verified_without_loading=True)
    reconstructions = report["reconstructions"]
    if len(reconstructions) != 2 or {row["case"] for row in reconstructions} != set(CASES):
        raise ValueError("exact_two_fixed_reconstructions_required")
    selected = []
    for case in CASES:
        row = next(item for item in reconstructions if item["case"] == case)
        if row.get("perceptually_approved") is not False:
            raise ValueError("reconstruction_must_remain_unapproved")
        originals = [item for item in corpus["files"] if item["case"] == case]
        gates = [item for item in gate["files"] if item["case"] == case]
        if len(originals) != 1 or len(gates) != 1:
            raise ValueError("one_bound_corpus_recording_per_case_required")
        source, gate_row = originals[0], gates[0]
        if (source["split"] != "heldout" or gate_row["split"] != "heldout"
                or any(source[key] != gate_row[key] for key in ("source_path", "source_sha256", "npz_sha256"))):
            raise ValueError("same_heldout_original_recording_required")
        original = bound(Path(source["source_path"]), source["source_sha256"], bindings)
        native = local_child(manifest_path.parent, source["npz_file"])
        if (str(native) != gate_row["npz_path"]
                or inherited.get(str(native)) != source["npz_sha256"]):
            raise ValueError("continuation_corpus_feature_binding_disagrees")
        bound(native, source["npz_sha256"], bindings)
        reconstruction = local_child(report_path.parent, row["file"])
        bound(reconstruction, row["sha256"], bindings)
        with np.load(native, allow_pickle=False) as archive:
            corpus_waveform = archive["waveform"].copy()
        with np.load(reconstruction, allow_pickle=False) as archive:
            reference, generated = validate_arrays(archive["reference"], archive["generated"], corpus_waveform)
        selected.append(dict(case=case, reference=reference, generated=generated,
            corpus_npz_path=str(native), corpus_npz_sha256=source["npz_sha256"],
            original_path=str(original), original_sha256=source["source_sha256"],
            reconstruction_path=str(reconstruction), reconstruction_sha256=row["sha256"],
            source_metrics=row.get("metrics", {})))
    return report, selected, bindings, checkpoints


def write_float_wav(path, wave):
    from scipy.io import wavfile
    if wave.dtype != np.float32 or wave.shape != (SAMPLES,) or not np.isfinite(wave).all():
        raise ValueError("finite_native_float32_waveform_required")
    with Path(path).open("xb") as handle:
        wavfile.write(handle, RATE, wave)
    Path(path).chmod(0o600)
    rate, saved = wavfile.read(path)
    if rate != RATE or saved.dtype != np.float32 or saved.tobytes() != wave.tobytes():
        raise ValueError("written_float_WAV_not_byte_exact_native_PCM")


def load_comparator():
    sys.path.insert(0, str(HELPER.parent))
    spec = importlib.util.spec_from_file_location("sifigan_static_comparison", HELPER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.compare


def export(report_path, output, compare_fn=None):
    output = Path(output)
    if not output.is_absolute() or output.is_symlink() or output.exists():
        raise ValueError("fresh_absolute_private_export_required")
    root, resolved = PRIVATE_ROOT.resolve(strict=True), output.resolve()
    if resolved == root or not resolved.is_relative_to(root):
        raise ValueError("approved_private_export_root_required")
    source_report, selected, bindings, checkpoints = validate_inputs(report_path)
    bindings[str(HELPER)] = sha256(HELPER)
    bindings[str(Path(__file__).resolve())] = sha256(__file__)
    compare_fn = load_comparator() if compare_fn is None else compare_fn
    output.mkdir(mode=0o700)
    previous = os.umask(0o077)
    report = dict(schema="mini.sifigan-global1000-research-audition.v1",
        status="research_intermediate_not_quality_approved", completed_steps=1000,
        source_report_path=str(report_path), source_report_sha256=sha256(report_path),
        input_bindings=bindings, checkpoints=checkpoints, source_credit=CREDIT,
        new_score_or_music=False, perceptually_approved=False, quality_approved=False,
        model_loaded_or_run=False, original_or_model_audio_modified=False,
        input_arrays_preserved_as_float32_WAV=True,
        processing="per pair4.8s; official static-LUFS display helper; 24kmono->48kstereo AAC192k",
        static_display_gain_does_not_repair_within_phrase_level_or_quiet_introduction_leakage=True,
        no_EQ_AGC_compression_pitch_time_edit_or_source_mixing=True,
        known_limitations=["Research intermediate, not a naturalness or instrument-identity pass.",
            "Measured deepvib48 quiet introduction0.000-0.610s contains unwanted generated sound; level-contour defects remain.",
            "Introduction leakage is not proof of an internal-breath dropout; breath/attack naturalness remains unapproved.",
            "One constant gain per whole file improves display comparability only, not these defects.",
            "Source YIN/Harvest octave ambiguity is retained; no pitch controls or metrics are relabeled."],
        pairs=[])
    try:
        for item in selected:
            case = item["case"]
            reference = output / (case + "_original_reference_24k_mono.wav")
            generated = output / (case + "_learned_reconstruction_24k_mono.wav")
            write_float_wav(reference, item["reference"])
            write_float_wav(generated, item["generated"])
            destination = output / case
            labels = ("original_reference_same_source", "learned_reconstruction_same_source_not_new_score")
            comparison = compare_fn([labels[0] + "=" + str(reference), labels[1] + "=" + str(generated)],
                                    destination, seconds=4.8)
            if (comparison.get("schema") != "mini.foundation-local-static-lufs-comparison.v1"
                    or comparison.get("status") != "ready" or comparison.get("seconds") != 4.8
                    or comparison.get("no_compression_AGC_EQ_pitch_time_edits") is not True
                    or [row["label"] for row in comparison["outputs"]] != list(labels)):
                raise ValueError("official_static_gain_pair_comparison_required")
            outputs = []
            for row in comparison["outputs"]:
                path = local_child(destination, row["file"], 5_000_000)
                if sha256(path) != row["sha256"]:
                    raise ValueError("encoded_audition_hash_changed")
                outputs.append(dict(row, path=str(path), perceptually_approved=False))
            comparison_path = local_child(destination, "comparison.json", 5_000_000)
            report["pairs"].append(dict(case=case, original_path=item["original_path"],
                original_sha256=item["original_sha256"], corpus_npz_path=item["corpus_npz_path"],
                corpus_npz_sha256=item["corpus_npz_sha256"], reconstruction_path=item["reconstruction_path"],
                reconstruction_sha256=item["reconstruction_sha256"],
                reference_PCM_sha256=hashlib.sha256(item["reference"].tobytes()).hexdigest(),
                generated_PCM_sha256=hashlib.sha256(item["generated"].tobytes()).hexdigest(),
                native_wavs=[dict(path=str(p), sha256=sha256(p)) for p in (reference, generated)],
                comparison_path=str(comparison_path), comparison_sha256=sha256(comparison_path),
                existing_unaltered_source_metrics=item["source_metrics"], outputs=outputs,
                perceptually_approved=False))
        if any(sha256(path) != checksum for path, checksum in bindings.items()):
            raise ValueError("bound_input_or_export_code_changed")
        with (output / "export_report.json").open("x", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2, ensure_ascii=False, allow_nan=False)
            handle.write("\n")
        (output / "export_report.json").chmod(0o600)
    finally:
        os.umask(previous)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = export(args.report, args.output)
    print(json.dumps(dict(status=result["status"], pairs=len(result["pairs"]),
                          quality_approved=result["quality_approved"])))
