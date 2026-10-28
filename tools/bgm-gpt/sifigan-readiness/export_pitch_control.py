#!/usr/bin/env python3
"""Export fixed-pitch inference with the disclosed reference level controller.

No model is loaded here. The pair is baseline and +100c neural inference,
not an original recording, newly composed music, or learned expression.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time

import numpy as np

import export_extended_training as extended

saved, level = extended.saved, extended.level
PRIVATE_ROOT = saved.PRIVATE_ROOT
MAX_BYTES = 12_000_000


def array_hash(value):
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def validate_inputs(parent_path, training_path, pitch_path):
    training, sources, bindings, checkpoints = extended.validate_inputs(parent_path, training_path)
    if training.get("completed_steps") != 3000:
        raise ValueError("fixed_global3000_training_required")
    pitch_path = saved.regular(pitch_path, 5_000_000)
    pitch = json.loads(pitch_path.read_text())
    if (pitch.get("schema") != "mini.sifigan-fixed-pitch-control.v1"
            or pitch.get("status") != "fixed_pitch_control_rendered_not_perceptually_approved"
            or pitch.get("baseline_reproduced") is not True
            or pitch.get("target_cents") != 100.0 or pitch.get("semitones") != 1.0
            or not np.isclose(pitch.get("factor", 0), 2. ** (1. / 12.), rtol=0, atol=1e-15)):
        raise ValueError("completed_fixed_100cent_pitch_control_required")
    for flag in ("training", "new_score_or_music", "quality_approved", "source_PCM_mixed_into_output", "output_processing"):
        if pitch.get(flag) is not False:
            raise ValueError("unprocessed_unapproved_inference_required:" + flag)
    inherited = pitch.get("input_bindings", {})
    training_path = Path(training_path)
    if inherited.get(str(training_path)) != saved.sha256(training_path):
        raise ValueError("same_completed_training_report_binding_required")
    for path, checksum in inherited.items():
        saved.bound(Path(path), checksum, bindings)
    saved.bound(pitch_path, saved.sha256(pitch_path), bindings, 5_000_000)
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
    rows = pitch.get("cases", [])
    if len(rows) != 2 or {row.get("case") for row in rows} != set(saved.CASES):
        raise ValueError("exact_two_pitch_cases_required")
    selected = []
    for source in sources:
        row = next(item for item in rows if item["case"] == source["case"])
        if (row.get("baseline_reproduced") is not True or row.get("baseline_byte_exact") is not True
                or set(row.get("raw_diagnostics", {})) != {"baseline", "shifted", "baseline_to_shifted"}):
            raise ValueError("byte_exact_baseline_reproduction_required")
        path = saved.local_child(pitch_path.parent, row["file"], MAX_BYTES)
        saved.bound(path, row["sha256"], bindings, MAX_BYTES)
        with np.load(path, allow_pickle=False) as archive:
            arrays = {key: archive[key].copy() for key in archive.files}
        expected = {"reference", "baseline", "shifted", "source_f0", "source_cf0", "shifted_f0", "shifted_cf0",
                    "features", "normalized_features"}
        if set(arrays) != expected:
            raise ValueError("exact_pitch_archive_arrays_required")
        for key, value in arrays.items():
            shape = ((saved.SAMPLES,) if key in ("reference", "baseline", "shifted") else
                     (960, 43) if key in ("features", "normalized_features") else (960,))
            if value.dtype != np.float32 or value.shape != shape or not np.isfinite(value).all():
                raise ValueError("finite_float32_pitch_archive_required:" + key)
            if row.get("array_sha256", {}).get(key) != array_hash(value):
                raise ValueError("pitch_array_hash_changed:" + key)
        for key, original in (("reference", source["reference"]), ("baseline", source["generated"])):
            if arrays[key].tobytes() != original.tobytes():
                raise ValueError("pitch_baseline_or_source_not_byte_exact:" + key)
        with np.load(source["corpus_npz_path"], allow_pickle=False) as archive:
            for key, corpus_key in (("source_f0", "f0"), ("source_cf0", "cf0"), ("features", "features")):
                if arrays[key].tobytes() != archive[corpus_key][:960].tobytes():
                    raise ValueError("pitch_source_control_not_corpus_exact:" + key)
        if (not np.array_equal(arrays["source_f0"] == 0, arrays["shifted_f0"] == 0)
                or np.any(arrays["source_cf0"] <= 0) or np.any(arrays["shifted_cf0"] <= 0)):
            raise ValueError("unchanged_voicing_positive_cf0_required")
        for first, second in (("source_f0", "shifted_f0"), ("source_cf0", "shifted_cf0")):
            target = arrays[first].copy()
            target *= pitch["factor"]
            if arrays[second].tobytes() != target.tobytes():
                raise ValueError("fixed_100cent_control_required")
        normalized = ((arrays["features"] - mean) / scale).astype(np.float32)
        if arrays["normalized_features"].tobytes() != normalized.tobytes():
            raise ValueError("normalized_features_not_bound_stats_exact")
        selected.append(dict(source, row=row, arrays=arrays, raw_path=str(path)))
    return pitch, selected, bindings, checkpoints


def export(parent_path, training_path, pitch_path, output, compare_fn=None):
    output = Path(output)
    root = PRIVATE_ROOT.resolve(strict=True)
    if (not output.is_absolute() or output.is_symlink() or output.exists()
            or output.resolve() == root or not output.resolve().is_relative_to(root)):
        raise ValueError("fresh_absolute_private_export_required")
    output.mkdir(mode=0o700)
    previous, started = os.umask(0o077), time.monotonic()
    try:
        with level.ResourceGuard(output, level.ResourceCaps(max_seconds=120, max_rss_bytes=2 * level.GIB)) as guard:
            pitch, selected, bindings, checkpoints = validate_inputs(parent_path, training_path, pitch_path)
            for path in (Path(__file__).resolve(), Path(extended.__file__).resolve(), Path(saved.__file__).resolve(),
                         Path(level.__file__).resolve(), saved.HELPER):
                bindings[str(path)] = saved.sha256(path)
            compare_fn = saved.load_comparator() if compare_fn is None else compare_fn
            report = dict(schema="mini.sifigan-pitch-control-audition.v1", status="started",
                pitch_report_path=str(pitch_path), pitch_report_sha256=saved.sha256(pitch_path),
                training_report_path=str(training_path), completed_training_steps=3000,
                target_cents=100.0, semitones=1.0, training=False, model_loaded_or_run=False,
                source_envelope_used=True, amplitude_condition_NOT_learned=True, AGC=True,
                source_PCM_mixed_into_output=False, new_score_or_music=False, quality_approved=False,
                noise_reduction=False, denoising_EQ=False, waveform_pitch_shift=False,
                input_bindings=bindings, checkpoints=checkpoints, source_credit=saved.CREDIT,
                pairs=[], caveats=[
                    "Baseline is the reproduced global3000 neural output, not an original performance.",
                    "The +100c target was supplied to excitation and pitch-dependent dilation; 43 timbre features stay fixed.",
                    "Both carriers receive the same original-reference 20ms/3tap RMS curve, not a learned envelope.",
                    "This transposition borrows the source articulation/spectral envelope; it is not a new score performance.",
                    "Noise and naturalness are unresolved. No denoiser, EQ, source PCM mix or waveform pitch warp is used."])
            for item in selected:
                case, arrays = item["case"], item["arrays"]
                reference = arrays["reference"]
                desired = level.extract_curve(reference)
                condition = level.write_npz(output / (case + "_REFERENCE_level_condition.npz"), desired_level_dbfs=desired)
                paths, carriers = [], []
                for name in ("baseline", "shifted"):
                    raw = arrays[name]
                    controlled, controls = level.apply_curve(raw, desired)
                    control = level.write_npz(output / (case + "_" + name + "_controls.npz"), **controls)
                    after = level.write_npz(output / (case + "_" + name + "_controlled.npz"), generated=controlled)
                    path = output / (case + "_" + name + "_24k_mono.wav")
                    saved.write_float_wav(path, controlled)
                    paths.append(path)
                    carriers.append(dict(role=name, raw_PCM_sha256=array_hash(raw),
                        controlled_PCM_sha256=array_hash(controlled), controls=control, controlled=after,
                        native_wav=dict(path=str(path), sha256=saved.sha256(path)),
                        level_metrics=level.level_metrics.summary(controlled, reference),
                        raw_diagnostics_copied=item["row"]["raw_diagnostics"][name]))
                labels = ("BASELINE_global3000_EXPLICIT_REFERENCE_LEVEL",
                          "F0_PLUS_100c_global3000_EXPLICIT_REFERENCE_LEVEL_NOT_NEW_SCORE")
                destination = output / case
                comparison = compare_fn([label + "=" + str(path) for label, path in zip(labels, paths)],
                                        destination, seconds=4.8)
                if (comparison.get("schema") != "mini.foundation-local-static-lufs-comparison.v1"
                        or comparison.get("status") != "ready" or comparison.get("seconds") != 4.8
                        or comparison.get("no_compression_AGC_EQ_pitch_time_edits") is not True
                        or [row["label"] for row in comparison["outputs"]] != list(labels)):
                    raise ValueError("fixed_baseline_shifted_static_comparison_required")
                outputs = []
                for name, row in zip(("baseline", "shifted"), comparison["outputs"]):
                    path = saved.local_child(destination, row["file"], MAX_BYTES)
                    saved.bound(path, row["sha256"], {})
                    outputs.append(dict(row, path=str(path), role=name, perceptually_approved=False))
                comparison_path = saved.local_child(destination, "comparison.json", MAX_BYTES)
                report["pairs"].append(dict(case=case, raw_path=item["raw_path"],
                    raw_sha256=item["row"]["sha256"], condition=condition, carriers=carriers,
                    reference_PCM_sha256=array_hash(reference),
                    comparison_path=str(comparison_path), comparison_sha256=saved.sha256(comparison_path), outputs=outputs))
            if any(saved.sha256(path) != checksum for path, checksum in bindings.items()):
                raise ValueError("bound_source_model_or_code_changed")
            report.update(status="fixed_pitch_auditions_ready_not_perceptually_approved", inputs_unchanged=True,
                          elapsed_seconds=time.monotonic() - started, resources=guard.snapshot())
            payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
            if sum(path.stat().st_size for path in output.rglob("*") if path.is_file()) + len(payload) > MAX_BYTES:
                raise ValueError("12MB_export_cap")
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
    parser.add_argument("--pitch-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = export(args.parent_report, args.training_report, args.pitch_report, args.output)
    print(json.dumps(dict(status=result["status"], shifted_files=[row["outputs"][1]["path"] for row in result["pairs"]])))
