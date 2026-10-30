#!/usr/bin/env python3
"""Author a leading rest on copies of057/058; no ML/inference or denoiser.

The existing reference-RMS-controlled carriers are revalidated byte-exactly.
One fixed amplitude envelope mutes through.545s and reaches unity at.575s;
native PCM from.575s onward must remain byte-identical to each old carrier.
The boundary is an authored rest choice, not a detected true note onset.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import time

import numpy as np
import export_note_pattern as old

saved, level = old.saved, old.level
PRIVATE_ROOT = old.PRIVATE_ROOT
RATE, SAMPLES, START, END = 24000, 115200, 13080, 13800
VARIANTS = old.VARIANTS
MAX_BYTES, GIB = 20_000_000, 1024 ** 3
REGIONS = ((0, 12000), (9600, 11520), (13080, 13800), (13800, 14400), (14400, 24000), (24000, SAMPLES))


def rest_envelope():
    gain = np.ones(SAMPLES, np.float64)
    gain[:START] = 0.
    u = np.arange(END - START + 1, dtype=np.float64) / (END - START)
    gain[START:END + 1] = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5
    return gain


def finite_wave(wave):
    if not isinstance(wave, np.ndarray) or wave.dtype != np.float32 or wave.shape != (SAMPLES,) or not np.isfinite(wave).all():
        raise ValueError("finite115200_float32_native_PCM_required")


def apply_rest(before):
    finite_wave(before)
    gain = rest_envelope()
    after = (before.astype(np.float64) * gain).astype(np.float32)
    after[:START + 1] = np.float32(0.)
    after[END:] = before[END:]
    if after[END:].tobytes() != before[END:].tobytes() or np.any(after[:START + 1] != 0):
        raise ValueError("authored_rest_or_post575ms_PCM_contract_changed")
    return after, gain


def capacity(output, reserve=0):
    output = Path(output)
    whole = sum(path.stat().st_size for path in output.parent.rglob("*") if path.is_file())
    if whole + reserve > MAX_BYTES:
        raise RuntimeError("fresh_whole_experiment20MB_cap")
    if shutil.disk_usage(output).free < 12 * GIB + reserve:
        raise RuntimeError("reserve_above12GiB_disk_floor_required")
    return whole


def intervals(wave):
    finite_wave(wave)
    rows = []
    for start, end in REGIONS:
        region = wave[start:end].astype(np.float64)
        rms, peak = float(np.sqrt(np.mean(region * region))), float(np.max(np.abs(region)))
        rows.append(dict(start_sample=start, end_sample=end, start_seconds=start / RATE, end_seconds=end / RATE,
            rms=rms, rms_dbfs=float(20 * np.log10(max(rms, 1e-12))), peak=peak,
            peak_dbfs=float(20 * np.log10(max(peak, 1e-12))), rms_amplitude_floor=1e-12,
            quieter_is_not_proof_of_artifact_removal=True))
    return rows


def source_fixed_check(reference, before, after, rd=None):
    rd = level.prepare_corpus.diagnostics(reference) if rd is None else rd
    mask = (rd["yin_hz"] > 0) & (rd["periodicity"] >= .90) & (rd["rms_db"] > -60)
    if int(mask.sum()) != 821:
        raise ValueError("exact821_original_source_YIN_support_required")
    first_context_sample = int(np.flatnonzero(mask)[0]) * 120 - 1536 // 2
    if first_context_sample < END:
        raise ValueError("source_supported64ms_context_overlaps_authored_rest")
    before_diag, after_diag = [level.prepare_corpus.diagnostics(wave) for wave in (before, after)]
    hashes = {}
    for key in ("yin_hz", "periodicity", "rms_db"):
        if before_diag[key][mask].tobytes() != after_diag[key][mask].tobytes():
            raise ValueError("measured_source_supported_pitch_periodicity_or_RMS_changed:" + key)
        hashes[key] = old.array_hash(before_diag[key][mask])
    return dict(source_support_frames=821, source_support_mask_sha256=old.array_hash(mask),
        source_support_rule="original-source YIN>0 & periodicity>=.90 &64ms_RMS>-60dBFS",
        first_source_supported_analysis_left_sample=first_context_sample,
        before_after_arrays_byte_exact_on_source_mask=True, unchanged_array_sha256=hashes,
        source_YIN_is_truth=False, listening_or_naturalness_approved=False)


def bound_child(folder, record, bindings):
    path = saved.local_child(folder, record["file"], MAX_BYTES)
    saved.bound(path, record["sha256"], bindings, MAX_BYTES)
    return path


def validate_inputs(parent_path, training_path, pattern_path, export_path):
    pattern, item, bindings, checkpoints = old.validate_inputs(parent_path, training_path, pattern_path)
    export_path = saved.regular(export_path, 5_000_000)
    report, folder = json.loads(export_path.read_text()), export_path.parent
    if (report.get("schema") != "mini.sifigan-four-note-pattern-audition.v1"
            or report.get("status") != "four_note_pattern_auditions_ready_not_perceptually_approved"
            or report.get("phase") != "complete" or report.get("inputs_unchanged") is not True
            or report.get("pattern_report_path") != str(pattern_path)
            or report.get("pattern_report_sha256") != saved.sha256(pattern_path)
            or report.get("training_report_path") != str(training_path)
            or report.get("completed_training_steps") != 3000 or report.get("case") != "deepvib48"
            or report.get("checkpoints") != checkpoints or report.get("variants") != list(VARIANTS)):
        raise ValueError("same_completed_bound_old_pattern_export_required")
    for key in ("training", "model_loaded_or_run", "source_PCM_mixed_into_output", "new_score_or_music",
                "noise_reduction", "denoising_EQ", "waveform_pitch_shift", "quality_approved", "perceptually_approved"):
        if report.get(key) is not False:
            raise ValueError("unapproved_unmixed_old_export_required:" + key)
    if (report.get("source_envelope_used") is not True or report.get("amplitude_condition_NOT_learned") is not True
            or report.get("AGC") is not True or report.get("reference_PCM_sha256") != old.array_hash(item["arrays"]["reference"])):
        raise ValueError("explicit_original_reference_controller_required")
    inherited = report.get("input_bindings", {})
    if inherited.get(str(pattern_path)) != saved.sha256(pattern_path) or inherited.get(str(training_path)) != saved.sha256(training_path):
        raise ValueError("old_export_pattern_training_hash_binding_required")
    for path, checksum in inherited.items():
        saved.bound(Path(path), checksum, bindings)
    saved.bound(export_path, saved.sha256(export_path), bindings)
    reference = item["arrays"]["reference"]
    desired = level.extract_curve(reference)
    condition_path = bound_child(folder, report["condition"], bindings)
    with np.load(condition_path, allow_pickle=False) as archive:
        if set(archive.files) != {"desired_level_dbfs"} or archive["desired_level_dbfs"].tobytes() != desired.tobytes():
            raise ValueError("old_original_reference_condition_changed")
    carriers, selected = report.get("carriers", []), {}
    if [row.get("role") for row in carriers] != ["baseline", *VARIANTS]:
        raise ValueError("private_baseline_and_two_old_carriers_required")
    from scipy.io import wavfile
    for row in carriers:
        name = row["role"]
        raw = item["arrays"]["baseline" if name == "baseline" else "generated_" + name]
        expected, controls = level.apply_curve(raw, desired)
        if row.get("raw_PCM_sha256") != old.array_hash(raw) or row.get("controlled_PCM_sha256") != old.array_hash(expected):
            raise ValueError("old_carrier_PCM_hash_changed")
        control_path = bound_child(folder, row["controls"], bindings)
        with np.load(control_path, allow_pickle=False) as archive:
            if set(archive.files) != set(controls) or any(archive[k].tobytes() != v.tobytes() for k, v in controls.items()):
                raise ValueError("old_frozen_RMS_controls_not_byte_exact")
        controlled_path = bound_child(folder, row["controlled"], bindings)
        with np.load(controlled_path, allow_pickle=False) as archive:
            if set(archive.files) != {"generated"}:
                raise ValueError("exact_old_controlled_archive_keys_required")
            controlled = archive["generated"].copy()
        finite_wave(controlled)
        native = Path(row["native_wav"]["path"])
        if native.parent != folder:
            raise ValueError("old_native_WAV_must_be_local_child")
        saved.bound(native, row["native_wav"]["sha256"], bindings, MAX_BYTES)
        rate, native_pcm = wavfile.read(native)
        if rate != RATE or native_pcm.dtype != np.float32 or native_pcm.shape != (SAMPLES,):
            raise ValueError("native24k_float32_old_carrier_required")
        if expected.tobytes() != controlled.tobytes() or expected.tobytes() != native_pcm.tobytes():
            raise ValueError("old_controlled_and_native_not_exact_frozen_RMS_recomputation")
        if name in VARIANTS:
            selected[name] = dict(before=controlled, old_carrier=row)
    return report, item, selected, bindings, checkpoints


def build(parent_path, training_path, pattern_path, export_path, output, compare_fn=None):
    output, root = Path(output), PRIVATE_ROOT.resolve(strict=True)
    if (not output.is_absolute() or output.is_symlink() or output.exists()
            or output.resolve() == root or not output.resolve().is_relative_to(root)
            or output.parent.resolve() == root):
        raise ValueError("fresh_private_experiment_child_output_required")
    output.mkdir(mode=0o700)
    previous, started = os.umask(0o077), time.monotonic()
    try:
        with level.ResourceGuard(output, level.ResourceCaps(max_seconds=300, max_rss_bytes=2 * GIB)) as guard:
            capacity(output, 8_000_000)
            old_export, item, selected, bindings, checkpoints = validate_inputs(parent_path, training_path, pattern_path, export_path)
            for path in (Path(__file__).resolve(), Path(old.__file__).resolve(), Path(saved.__file__).resolve(),
                    Path(level.__file__).resolve(), saved.HELPER, Path(level.prepare_corpus.__file__).resolve(),
                    Path(level.pilot_metrics.__file__).resolve(), Path(level.level_metrics.__file__).resolve(),
                    Path(level.__file__).resolve().parents[1] / "foundation-model-trial/ace_limits.py"):
                bindings[str(path)] = saved.sha256(path)
            reference = item["arrays"]["reference"]
            rd = level.prepare_corpus.diagnostics(reference)
            gain_record = level.write_npz(output / "authored_leading_rest_gain.npz", amplitude_gain=rest_envelope())
            condition_record = level.write_npz(output / "EXPLICIT_REFERENCE_condition.npz", desired_level_dbfs=level.extract_curve(reference))
            reference_record = level.write_npz(output / "original_reference_PCM.npz", reference=reference)
            carriers, paths = [], []
            for variant in VARIANTS:
                capacity(output, 3_000_000)
                before = selected[variant]["before"]
                after, gain = apply_rest(before)
                if gain.tobytes() != rest_envelope().tobytes():
                    raise ValueError("fixed_authored_gain_changed")
                before_record = level.write_npz(output / (variant + "_before.npz"), generated=before, reference=reference)
                after_record = level.write_npz(output / (variant + "_after.npz"), generated=after, reference=reference)
                native = output / (variant + "_REST_COPY_24k_mono.wav")
                saved.write_float_wav(native, after)
                paths.append(native)
                carriers.append(dict(role=variant, old_carrier=selected[variant]["old_carrier"],
                    before=before_record, after=after_record, native_wav=dict(path=str(native), sha256=saved.sha256(native)),
                    before_PCM_sha256=old.array_hash(before), after_PCM_sha256=old.array_hash(after),
                    post575ms_before_after_PCM_sha256=old.array_hash(before[END:]), post575ms_byte_exact=True,
                    source_fixed_check=source_fixed_check(reference, before, after, rd),
                    before_intervals=intervals(before), after_intervals=intervals(after)))
            labels = ("NEW_REST_COPY_OLD057_STEP_NO_NEW_ML", "NEW_REST_COPY_OLD058_CENTERED20ms_NO_NEW_ML")
            capacity(output, 3_000_000)
            compare_fn = saved.load_comparator() if compare_fn is None else compare_fn
            comparison_dir = output / "new_intro_copies"
            comparison = compare_fn([label + "=" + str(path) for label, path in zip(labels, paths)], comparison_dir, seconds=4.8)
            if (comparison.get("schema") != "mini.foundation-local-static-lufs-comparison.v1"
                    or comparison.get("status") != "ready" or comparison.get("seconds") != 4.8
                    or comparison.get("no_compression_AGC_EQ_pitch_time_edits") is not True
                    or [row["label"] for row in comparison["outputs"]] != list(labels)):
                raise ValueError("two_new_rest_copies_static_LUFS_required")
            outputs = []
            for variant, row in zip(VARIANTS, comparison["outputs"]):
                path = saved.local_child(comparison_dir, row["file"], MAX_BYTES)
                saved.bound(path, row["sha256"], {})
                outputs.append(dict(row, path=str(path), role=variant, perceptually_approved=False))
            comparison_path = saved.local_child(comparison_dir, "comparison.json", MAX_BYTES)
            if any(saved.sha256(path) != checksum for path, checksum in bindings.items()):
                raise ValueError("old_original_model_or_code_changed")
            report = dict(schema="mini.sifigan-authored-intro-rest.v1", status="authored_intro_rest_copies_ready_not_perceptually_approved",
                phase="complete", training=False, ML=False, optimizer_steps=0, model_loaded_or_run=False, forward_calls=0,
                weights_written=False, sourcecurveused=True, source_envelope_used=True, amplitude_condition_NOT_learned=True,
                rest_authored=True, hard_mute=True, fade=True, denoising=False, EQ=False, waveform_pitch_shift=False,
                source_PCM_mixed_into_output=False, new_score_or_music=False, quality_approved=False, perceptually_approved=False,
                source_credit=saved.CREDIT, parent_report_path=str(parent_path), training_report_path=str(training_path),
                pattern_report_path=str(pattern_path), old_export_report_path=str(export_path), old_export_report_sha256=saved.sha256(export_path),
                input_bindings=bindings, checkpoints=checkpoints, reference=reference_record, condition=condition_record,
                gain=gain_record, params=dict(rate=RATE, samples=SAMPLES, mute_until_sample=START, full_gain_from_sample=END,
                    fade_samples_inclusive=[START, END], fade_intervals=720, fade_control_points=721,
                    curve="quintic10u^3-15u^4+6u^5; log-pitch unchanged; amplitude domain", post575ms_native_PCM_byte_exact=True,
                    authored_boundary_NOT_detected_true_onset=True),
                carriers=carriers, comparison_path=str(comparison_path), comparison_sha256=saved.sha256(comparison_path), outputs=outputs,
                inputs_unchanged=True, max_seconds=300, max_conservative_rss_plus_MPS_bytes=2 * GIB, max_whole_experiment_bytes=MAX_BYTES,
                elapsed_seconds=time.monotonic() - started, resources=guard.snapshot(),
                caveats=["Copies of OLD057/058 with one shared authored leading-rest amplitude envelope; not new ML/model inference.",
                    "The0.575s boundary is authored, not proof of true attack onset or learned breath articulation.",
                    "Native PCM from0.575s onward is byte-identical; AAC static display gain/codec is separate and lossy.",
                    "Quieter interval levels do not prove artifact removal or musical naturalness."])
            payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
            capacity(output, len(payload))
            with (output / "report.json").open("xb") as handle:
                handle.write(payload)
            (output / "report.json").chmod(0o600)
    finally:
        os.umask(previous)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent-report", type=Path, required=True)
    parser.add_argument("--training-report", type=Path, required=True)
    parser.add_argument("--pattern-report", type=Path, required=True)
    parser.add_argument("--export-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = build(args.parent_report, args.training_report, args.pattern_report, args.export_report, args.output)
    print(json.dumps(dict(status=result["status"], new_files=[row["path"] for row in result["outputs"]])))
