#!/usr/bin/env python3
"""Explicit carrier/learned-gain-AGC comparison, NOT a new raw vocoder.

No model is run. Saved head output and its gain controls are verified before
the existing static-LUFS listening-display helper encodes two fixed pairs.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path

import numpy as np
import export_corpus_audition as carrier

PRIVATE_ROOT = carrier.PRIVATE_ROOT
CONTROL_KEYS = ("predicted_level_dbfs", "carrier_measured_level_dbfs", "desired_gain_db",
                "bounded_gain_db", "smoothed_gain_db")


def validate_controls(values, before, after):
    if any(key not in values for key in CONTROL_KEYS):
        raise ValueError("five_bound_predicted_gain_control_arrays_required")
    for key in CONTROL_KEYS:
        value = values[key]
        if value.shape != (960,) or value.dtype.kind != "f" or not np.isfinite(value).all():
            raise ValueError("finite960frame_gain_controls_required")
    if (np.any(np.abs(values["bounded_gain_db"]) > 60 + 1e-10)
            or np.any(np.abs(values["smoothed_gain_db"]) > 60 + 1e-10)):
        raise ValueError("declared60dB_gain_bounds_required")
    if not np.allclose(values["desired_gain_db"], values["predicted_level_dbfs"]
                       - values["carrier_measured_level_dbfs"], rtol=1e-10, atol=1e-10):
        raise ValueError("predicted_level_minus_carrier_level_must_equal_desired_gain")
    if not np.allclose(values["bounded_gain_db"], np.clip(values["desired_gain_db"], -60, 60), rtol=1e-10, atol=1e-10):
        raise ValueError("declared_gain_clip_does_not_match_saved_controls")
    # Reproduce only the saved arithmetic for verification, not a new model run
    # or a replacement output. The supplied saved after waveform is exported.
    sample_gain = np.interp(np.arange(carrier.SAMPLES) / 120., np.arange(960), values["smoothed_gain_db"])
    expected = (before.astype(np.float64) * 10 ** (sample_gain / 20)).astype(np.float32)
    if expected.tobytes() != after.tobytes():
        raise ValueError("saved_after_not_exact_carrier_times_saved_continuous_gain")


def validate_inputs(head_report, parent_report):
    head_report, parent_report = carrier.regular(head_report, 5_000_000), carrier.regular(parent_report, 5_000_000)
    _, selected, bindings, checkpoints = carrier.validate_inputs(parent_report)
    head = json.loads(head_report.read_text())
    if (head.get("schema") != "mini.sifigan-physical-volume-head.v1"
            or head.get("status") != "learned_gain_head_evaluated_not_perceptually_approved"):
        raise ValueError("completed_physical_volume_head_report_required")
    for key in ("learned_continuous_gain_control", "AGC", "output_postprocessing",
                "runtime_requires_original_acoustic_features"):
        if head.get(key) is not True:
            raise ValueError("explicit_learned_continuous_gain_AGC_postprocess_required:" + key)
    for key in ("raw_vocoder_training", "new_score_or_music", "quality_approved", "perceptually_approved",
                "reference_envelope_copied", "reference_RMS_used_for_runtime_gain", "hard_quiet_threshold_or_mute",
                "original_vocoder_normalizer_changed", "heldout_used_for_head_fit_statistics_or_hyperparameter_selection"):
        if head.get(key) is not False:
            raise ValueError("unapproved_fit_only_no_reference_envelope_copy_required:" + key)
    for path, checksum in head["input_bindings"].items():
        carrier.bound(Path(path), checksum, bindings)
    if head["input_bindings"].get(str(parent_report)) != carrier.sha256(parent_report):
        raise ValueError("head_must_bind_exact_complete_global1000_carrier_report")
    bindings[str(head_report)] = carrier.sha256(head_report)
    model = carrier.local_child(head_report.parent, head["model_file"], 20_000_000)
    carrier.bound(model, head["model_sha256"], bindings, 20_000_000)
    rows = head["cases"]
    if len(rows) != 2 or {row["case"] for row in rows} != set(carrier.CASES):
        raise ValueError("exact_two_fixed_carrier_head_cases_required")
    pairs = []
    for source in selected:
        row = next(item for item in rows if item["case"] == source["case"])
        if (row["carrier_path"] != source["reconstruction_path"]
                or row["carrier_sha256"] != source["reconstruction_sha256"]):
            raise ValueError("head_carrier_must_be_exact_global1000_saved_reconstruction")
        waveforms = []
        for stage in ("before", "after"):
            item = row[stage]
            path = carrier.local_child(head_report.parent, item["file"])
            carrier.bound(path, item["sha256"], bindings)
            with np.load(path, allow_pickle=False) as archive:
                _, wave = carrier.validate_arrays(archive["reference"], archive["generated"], source["reference"])
            waveforms.append((path, wave))
        before, after = waveforms[0][1], waveforms[1][1]
        if before.tobytes() != source["generated"].tobytes():
            raise ValueError("before_must_be_byte_exact_parent1000_not_reference_or_replacement")
        controls = carrier.local_child(head_report.parent, row["controls"]["file"])
        carrier.bound(controls, row["controls"]["sha256"], bindings)
        with np.load(controls, allow_pickle=False) as archive:
            validate_controls({key: archive[key].copy() for key in archive.files}, before, after)
        pairs.append(dict(source, before=before, after=after, before_path=str(waveforms[0][0]),
            after_path=str(waveforms[1][0]), before_sha256=row["before"]["sha256"], after_sha256=row["after"]["sha256"],
            controls=dict(row["controls"], path=str(controls)), facts=row["facts"],
            raw_before_diagnostics=row["before"]["diagnostics"], raw_after_diagnostics=row["after"]["diagnostics"]))
    return head, pairs, bindings, dict(carrier_global1000=checkpoints,
        physical_volume_head=dict(path=str(model), sha256=head["model_sha256"], hash_verified_without_loading=True))


def export(head_report, parent_report, output, compare_fn=None):
    output = Path(output)
    if not output.is_absolute() or output.is_symlink() or output.exists():
        raise ValueError("fresh_absolute_private_export_required")
    root = PRIVATE_ROOT.resolve(strict=True)
    if output.resolve() == root or not output.resolve().is_relative_to(root):
        raise ValueError("approved_private_export_root_required")
    head, selected, bindings, models = validate_inputs(head_report, parent_report)
    for path in (Path(__file__).resolve(), Path(carrier.__file__).resolve(), carrier.HELPER):
        bindings[str(path)] = carrier.sha256(path)
    compare_fn = carrier.load_comparator() if compare_fn is None else compare_fn
    output.mkdir(mode=0o700)
    old_umask = os.umask(0o077)
    report = dict(schema="mini.sifigan-carrier-volume-head-comparison.v1", status="research_AGC_postprocess_not_quality_approved",
        head_report_path=str(head_report), carrier_report_path=str(parent_report), input_bindings=bindings,
        models=models, source_credit=carrier.CREDIT, model_loaded_or_run=False,
        learned_continuous_gain_control=True, AGC=True, output_postprocessing=True, raw_vocoder_training=False,
        quality_approved=False, perceptually_approved=False, new_score_or_music=False,
        reference_envelope_copied=False, reference_RMS_used_for_runtime_gain=False,
        runtime_requires_original_acoustic_features=True, original_vocoder_normalizer_changed=False,
        head_training_and_CV_selection=head.get("training"), raw_head_evaluation_role=head.get("evaluation_role"),
        raw_input_PCM_preserved_as_float32_WAV=True, no_additional_EQ_AGC_compression_pitch_time_or_source_mix=True,
        static_LUFS_matching_is_not_proof_of_actual_envelope_repair=True,
        caveats=["NEW is the same global1000 carrier multiplied by learned continuous gain (AGC/output postprocessing), NOT a newly trained raw vocoder.",
            "Runtime still requires acoustic features from the original recording; this is not new-score performance.",
            "Raw before/after diagnostics precede display normalization and are copied unchanged.",
            "Independent constant per-file LUFS display gains do not establish quiet/level-contour repair or instrument quality.",
            "Offline future context remains; zero waveform time shift does not imply real-time zero latency."], pairs=[])
    try:
        for row in selected:
            case = row["case"]
            before_wav = output / (case + "_CARRIER_global1000_24k_mono.wav")
            after_wav = output / (case + "_CARRIER_plus_LEARNED_GAIN_HEAD_24k_mono.wav")
            carrier.write_float_wav(before_wav, row["before"])
            carrier.write_float_wav(after_wav, row["after"])
            labels = ("OLD_global1000_CARRIER_learned_vocoder", "NEW_same_CARRIER_plus_LEARNED_CONTINUOUS_GAIN_HEAD_AGC_POSTPROCESS")
            destination = output / case
            comparison = compare_fn([labels[0] + "=" + str(before_wav), labels[1] + "=" + str(after_wav)], destination, seconds=4.8)
            if (comparison.get("schema") != "mini.foundation-local-static-lufs-comparison.v1"
                    or comparison.get("status") != "ready" or comparison.get("seconds") != 4.8
                    or comparison.get("no_compression_AGC_EQ_pitch_time_edits") is not True
                    or [item["label"] for item in comparison["outputs"]] != list(labels)):
                raise ValueError("official_static_display_gain_pair_required")
            outputs = []
            for item in comparison["outputs"]:
                path = carrier.local_child(destination, item["file"], 5_000_000)
                if carrier.sha256(path) != item["sha256"]:
                    raise ValueError("encoded_audition_hash_changed")
                outputs.append(dict(item, path=str(path), perceptually_approved=False))
            comparison_path = carrier.local_child(destination, "comparison.json", 5_000_000)
            report["pairs"].append(dict(case=case, original_path=row["original_path"], original_sha256=row["original_sha256"],
                corpus_npz_path=row["corpus_npz_path"], corpus_npz_sha256=row["corpus_npz_sha256"],
                carrier_path=row["reconstruction_path"], carrier_sha256=row["reconstruction_sha256"],
                before_npz_path=row["before_path"], before_npz_sha256=row["before_sha256"],
                after_npz_path=row["after_path"], after_npz_sha256=row["after_sha256"],
                predicted_gain_controls=row["controls"], saved_gain_exactly_reproduces_after=True,
                before_PCM_sha256=hashlib.sha256(row["before"].tobytes()).hexdigest(),
                after_PCM_sha256=hashlib.sha256(row["after"].tobytes()).hexdigest(),
                native_wavs=[dict(path=str(path), sha256=carrier.sha256(path)) for path in (before_wav, after_wav)],
                raw_before_diagnostics=row["raw_before_diagnostics"], raw_after_diagnostics=row["raw_after_diagnostics"],
                continuous_gain_facts=row["facts"], comparison_path=str(comparison_path),
                comparison_sha256=carrier.sha256(comparison_path), outputs=outputs))
        if any(carrier.sha256(path) != checksum for path, checksum in bindings.items()):
            raise ValueError("input_model_control_or_export_code_changed")
        payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
        if sum(path.stat().st_size for path in output.rglob("*") if path.is_file()) + len(payload) > 20_000_000:
            raise ValueError("20MB_export_output_cap")
        with (output / "export_report.json").open("xb") as handle:
            handle.write(payload)
        (output / "export_report.json").chmod(0o600)
    finally:
        os.umask(old_umask)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--head-report", type=Path, required=True)
    parser.add_argument("--parent-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = export(args.head_report, args.parent_report, args.output)
    print(json.dumps(dict(status=result["status"], pairs=len(result["pairs"]), AGC=True, quality_approved=False)))
