#!/usr/bin/env python3
"""Export authored19.2s score: constant carrier level, then explicit score gate.

The raw stage uses the existing neural model, not new training. This exporter
loads no model. Borrowed microcurve/spectral templates are not learned score
expression, a pure vibrato estimate, or independently performed target audio.
"""
import argparse
import hashlib
import importlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

import numpy as np
import export_extended_training as extended

saved, level = extended.saved, extended.level
PRIVATE_ROOT = saved.PRIVATE_ROOT
RATE, HOP, FRAMES, SAMPLES, SECONDS = 24000, 120, 3840, 460800, 19.2
VARIANTS = ("all_microcurve", "late_long_microcurve")
MAX_BYTES, MIN_FREE = 50_000_000, 12 * 1024 ** 3
PRODUCER = Path(__file__).with_name("render_authored_melody.py")


def array_hash(value):
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def capacity(output, reserve=0):
    used = sum(p.stat().st_size for p in Path(output).parent.rglob("*") if p.is_file())
    if used + reserve > MAX_BYTES:
        raise RuntimeError("whole_fresh_experiment50MB_cap")
    if shutil.disk_usage(output).free < MIN_FREE + reserve:
        raise RuntimeError("reserve_above12GiB_disk_floor_required")
    return used


def finite_wave(wave):
    if (not isinstance(wave, np.ndarray) or wave.dtype != np.float32 or wave.shape != (SAMPLES,)
            or not np.isfinite(wave).all()):
        raise ValueError("finite460800_float32_native_wave_required")


def write_wave(path, wave):
    from scipy.io import wavfile
    finite_wave(wave)
    with Path(path).open("xb") as handle:
        wavfile.write(handle, RATE, wave)
    Path(path).chmod(0o600)
    rate, actual = wavfile.read(path)
    if rate != RATE or actual.dtype != np.float32 or actual.tobytes() != wave.tobytes():
        raise ValueError("native19p2_WAV_not_byte_exact")


def waveform_stats(wave):
    finite_wave(wave)
    return dict(samples=len(wave), seconds=SECONDS, finite=True, peak=float(np.max(np.abs(wave))),
        rms_dbfs=float(20 * np.log10(max(float(np.sqrt(np.mean(wave.astype(np.float64) ** 2))), 1e-12))),
        samples_at_or_above_unit_peak=int(np.count_nonzero(np.abs(wave) >= 1)))


def _pitch_scope(diag, target, mask):
    """The authored mask is fixed before measuring the candidate."""
    mask = np.asarray(mask, bool)
    if (mask.shape != (FRAMES,) or np.asarray(target).shape != (FRAMES,)
            or any(np.asarray(diag[key]).shape != (FRAMES,) or not np.isfinite(diag[key]).all()
                   for key in ("yin_hz", "periodicity", "rms_db"))):
        raise ValueError("same3840_frame_pitch_scope_arrays_required")
    confident = (diag["yin_hz"] > 0) & (diag["periodicity"] >= .90) & (diag["rms_db"] > -60)
    shared = mask & confident
    count, total = int(shared.sum()), int(mask.sum())
    cents = 1200 * np.log2(diag["yin_hz"][shared].astype(np.float64) / target[shared])
    return dict(fixed_score_frames=total, fixed_score_mask_sha256=array_hash(mask),
        measured_confident_frames=count, missing_frames=total - count,
        coverage_fraction=float(count / total) if total else None,
        near50c_frames=int((np.abs(cents) <= 50).sum()),
        near50c_fraction_fixed_score=float((np.abs(cents) <= 50).sum() / total) if total else None,
        median_signed_cents=float(np.median(cents)) if count else None,
        median_abs_cents=float(np.median(np.abs(cents))) if count else None,
        p95_abs_cents=float(np.quantile(np.abs(cents), .95)) if count else None,
        candidate_missing_frames_remain_in_fixed_denominator=True)


def score_diagnostics(wave, target, controls, events):
    """Known prescribed F0, not source821 mask or a performed reference."""
    finite_wave(wave)
    diag = level.prepare_corpus.diagnostics(wave)
    target = np.asarray(target, np.float64)
    if target.shape != (FRAMES,) or not np.isfinite(target).all() or np.any(target <= 0):
        raise ValueError("positive_finite_authored_actual_target_required")
    sounding, steady = controls["sounding_mask"], controls["steady_mask"]
    rests, notes = [], []
    for event in events:
        start, end = event["start_frame"], event["end_frame"]
        if event["rest"]:
            a, b = event["start_sample"], event["end_sample"]
            region = wave[a:b]
            rests.append(dict(start_sample=a, end_sample=b, samples=b - a,
                nonzero_samples=int(np.count_nonzero(region)), exact_zero=bool(np.all(region == 0)),
                peak=float(np.max(np.abs(region)))))
        else:
            mask = np.zeros(FRAMES, bool)
            mask[start:end] = True
            notes.append(dict(note_index=event["note_index"], transposed_midi=event["transposed_midi"],
                start_frame=start, end_frame=end,
                all_sounding=_pitch_scope(diag, target, mask & sounding),
                steady=_pitch_scope(diag, target, mask & steady)))
    return dict(schema="mini.sifigan-fixed-authored-score-diagnostics.v1",
        target_is_authored_not_performed_reference=True, source821_mask_used=False,
        confidence_rule="candidate YIN>0 & periodicity>=.90 &64ms_RMS>-60dBFS; not calibrated probability",
        alignment="same prescribed timestamps; no warp/offset/pitch correction",
        all_sounding=_pitch_scope(diag, target, sounding), steady=_pitch_scope(diag, target, steady),
        boundary=_pitch_scope(diag, target, sounding & ~steady),
        steady_definition="each sounding note[start_frame+16,end_frame-16); authored80ms edges excluded",
        per_note=notes, native_rests=rests, waveform=waveform_stats(wave), naturalness_approved=False,
        limits=["64ms centered YIN blends note transitions; no20ms acoustic-duration claim.",
            "Known target controls do not provide a performed acoustic ground truth.",
            "Borrowed microcurve is not proven pure vibrato or a learned musical expression policy."])


def validate_inputs(parent_path, training_path, raw_path):
    training, sources, bindings, checkpoints = extended.validate_inputs(parent_path, training_path)
    raw_path = saved.regular(raw_path, 5_000_000)
    report = json.loads(raw_path.read_text())
    if (report.get("schema") != "mini.sifigan-authored-melody.v1"
            or report.get("status") != "authored_melody_raw_rendered_not_perceptually_approved"
            or report.get("phase") != "complete" or report.get("completed_steps") != 3000
            or training.get("completed_steps") != 3000 or report.get("baseline_reproduced") is not True
            or report.get("forward_calls") != 3 or report.get("inputs_unchanged") is not True
            or report.get("frames") != FRAMES or report.get("samples") != SAMPLES
            or report.get("sample_rate") != RATE or report.get("hop_size") != HOP
            or report.get("variants") != list(VARIANTS) or report.get("checkpoints") != checkpoints):
        raise ValueError("completed_bound_authored19p2_raw_required")
    transpose = report.get("score_transposition_semitones")
    if type(transpose) is not int or transpose not in (-12, -7):
        raise ValueError("versioned_score_transposition_minus12_or_minus7_required")
    for flag in ("training", "weights_written", "output_postprocessing", "authored_gate_applied_to_raw",
                 "source_PCM_mixed_into_output", "quality_approved", "new_learned_performance"):
        if report.get(flag) is not False:
            raise ValueError("unprocessed_unapproved_no_training_raw_required:" + flag)
    if report.get("authored_eight_bar_score_render") is not True:
        raise ValueError("explicit_authored_eight_bar_score_required")
    inherited = report.get("input_bindings", {})
    if inherited.get(str(training_path)) != saved.sha256(training_path):
        raise ValueError("same_global3000_training_binding_required")
    for path, checksum in inherited.items():
        saved.bound(Path(path), checksum, bindings)
    saved.bound(raw_path, saved.sha256(raw_path), bindings, 5_000_000)
    source = next(item for item in sources if item["case"] == "deepvib48")
    controls_record = report["controls"]
    controls_path = saved.local_child(raw_path.parent, controls_record["file"], MAX_BYTES)
    saved.bound(controls_path, controls_record["sha256"], bindings, MAX_BYTES)
    with np.load(controls_path, allow_pickle=False) as archive:
        controls = {key: archive[key].copy() for key in archive.files}
    for key, value in controls.items():
        if not np.isfinite(value).all() or controls_record.get("array_sha256", {}).get(key) != array_hash(value):
            raise ValueError("finite_bound_control_arrays_required:" + key)
    expected = {"gate", "center_hz", "sounding_mask", "rest_mask", "steady_mask", "template_index_map",
                "borrowed_microcurve_cents", "features", "normalized_features", "note_index"}
    expected |= {prefix + variant for prefix in ("target_hz_", "microcurve_envelope_") for variant in VARIANTS}
    if set(controls) != expected:
        raise ValueError("exact_authored_control_arrays_required")
    for key, value in controls.items():
        shape = ((SAMPLES,) if key == "gate" else (FRAMES, 43) if key in ("features", "normalized_features") else (FRAMES,))
        dtype = (np.bool_ if key.endswith("_mask") else np.int64 if key == "template_index_map"
                 else np.int16 if key == "note_index" else np.float32 if key.startswith("target_hz_")
                 or key in ("features", "normalized_features") else np.float64)
        if value.shape != shape or value.dtype != dtype:
            raise ValueError("exact_authored_control_shape_dtype_required:" + key)
    events = report.get("score_events", [])
    if len(events) != 32 or sum(event["rest"] for event in events) != 4:
        raise ValueError("exact28_notes4_rests_required")
    sounding, steady, rests = (np.zeros(FRAMES, bool) for _ in range(3))
    expected_note = np.full(FRAMES, -1, np.int16)
    next_frame, next_sample = 0, 0
    for event in events:
        a, b, sa, sb = (event[key] for key in ("start_frame", "end_frame", "start_sample", "end_sample"))
        if a != next_frame or sa != next_sample or not a < b <= FRAMES or not sa < sb <= SAMPLES:
            raise ValueError("contiguous_complete_score_events_required")
        next_frame, next_sample = b, sb
        if event["rest"]:
            rests[a:b] = True
            if np.any(controls["gate"][sa:sb] != 0):
                raise ValueError("exact_native_authored_rest_zero_required")
        else:
            sounding[a:b] = True
            steady[a + 16:max(a + 16, b - 16)] = True
            expected_note[a:b] = event["note_index"]
    if next_frame != FRAMES or next_sample != SAMPLES:
        raise ValueError("score_must_fill19p2_seconds")
    for key, value in dict(sounding_mask=sounding, steady_mask=steady, rest_mask=rests, note_index=expected_note).items():
        if controls[key].tobytes() != value.tobytes():
            raise ValueError("fixed_score_mask_or_note_index_changed:" + key)
    if np.any((controls["gate"] < 0) | (controls["gate"] > 1)) or np.any(controls["center_hz"] <= 0):
        raise ValueError("finite_positive_center_bounded_gate_required")
    # Regenerate authored gate/microcurve math with the bound pure producer;
    # no model, torch, WORLD analysis, inference or audio rendering is invoked.
    producer = importlib.import_module("render_authored_melody")
    score_path = saved.regular(report["score_path"], 1_000_000)
    saved.bound(score_path, report["score_sha256"], bindings, 1_000_000)
    gate_path = Path(training["data_gate"])
    gate = json.loads(gate_path.read_text())
    stats_path = saved.local_child(gate_path.parent, gate.get("stats_file", "stats.npz"))
    saved.bound(stats_path, gate["stats_sha256"], bindings)
    with np.load(source["corpus_npz_path"], allow_pickle=False) as original, np.load(stats_path, allow_pickle=False) as stats:
        rebuilt = producer.build_controls(json.loads(score_path.read_text()), original["cf0"],
            original["features"], stats["mean"], stats["scale"], transpose_semitones=transpose)
    rebuilt_controls, rebuilt_events = rebuilt[0], rebuilt[1]
    if (set(rebuilt_controls) != set(controls) or rebuilt_events != events
            or any(controls[key].tobytes() != value.tobytes() for key, value in rebuilt_controls.items())):
        raise ValueError("authored_score_template_stats_recomputation_changed")
    baseline_record = report["baseline"]
    baseline_path = saved.local_child(raw_path.parent, baseline_record["file"], 5_000_000)
    saved.bound(baseline_path, baseline_record["sha256"], bindings)
    with np.load(baseline_path, allow_pickle=False) as archive:
        if (archive["generated"].tobytes() != source["generated"].tobytes()
                or archive["reference"].tobytes() != source["reference"].tobytes()
                or baseline_record.get("baseline_byte_exact") is not True):
            raise ValueError("byte_exact_global3000_baseline_required")
    rows = report.get("rawfiles", [])
    if len(rows) != 2 or [row["variant"] for row in rows] != list(VARIANTS):
        raise ValueError("exact_two_new_raw_variants_required")
    from scipy.io import wavfile
    waves = {}
    for row in rows:
        path = saved.local_child(raw_path.parent, row["file"], MAX_BYTES)
        saved.bound(path, row["sha256"], bindings, MAX_BYTES)
        rate, wave = wavfile.read(path)
        finite_wave(wave)
        if rate != RATE or array_hash(wave) != row["PCM_sha256"]:
            raise ValueError("bound_native_raw19p2_PCM_required")
        waves[row["variant"]] = wave
    return report, controls, events, waves, bindings, checkpoints


def decoded_rest_diagnostics(path, events):
    data = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(path),
        "-ar", "48000", "-ac", "2", "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1"],
        check=True, capture_output=True, timeout=60).stdout
    audio = np.frombuffer(data, dtype="<f4").reshape(-1, 2)
    if audio.shape != (921600, 2) or not np.isfinite(audio).all():
        raise ValueError("finite_exact19p2_AAC_decode_required")
    rows = []
    for event in events:
        if not event["rest"]:
            continue
        start, end = event["start_sample"] * 2 + 2400, event["end_sample"] * 2 - 2400
        region = audio[start:end].astype(np.float64)
        rms, peak = float(np.sqrt(np.mean(region ** 2))), float(np.max(np.abs(region)))
        rows.append(dict(start_48k_sample=start, end_48k_sample=end, edge_guard_seconds=.05,
            rms_dbfs=float(20 * np.log10(max(rms, 1e-12))), peak_dbfs=float(20 * np.log10(max(peak, 1e-12))),
            nearquiet_rms_at_or_below_minus60=bool(rms <= .001), exact_zero=bool(np.all(region == 0)),
            lossy_codec_rests_not_assumed_bit_exact=True))
    return dict(decoded_frames=len(audio), channels=2, sample_rate=48000, central_rests=rows,
        quiet_does_not_certify_breath_naturalness=True)


def export(parent_path, training_path, raw_path, output, compare_fn=None, decode_fn=None):
    output, raw_path = Path(output), Path(raw_path)
    private = PRIVATE_ROOT.resolve(strict=True)
    if (not output.is_absolute() or output.is_symlink() or output.exists()
            or not output.resolve().is_relative_to(private) or output.resolve() == private
            or output.parent.resolve() != raw_path.parent.parent.resolve()):
        raise ValueError("fresh_same_private_experiment_output_required")
    output.mkdir(mode=0o700)
    previous, started = os.umask(0o077), time.monotonic()
    try:
        with level.ResourceGuard(output, level.ResourceCaps(max_seconds=600, max_rss_bytes=2 * level.GIB)) as guard:
            capacity(output, 15_000_000)
            raw, controls, events, waves, bindings, checkpoints = validate_inputs(parent_path, training_path, raw_path)
            for path in (Path(__file__).resolve(), PRODUCER.resolve(), Path(extended.__file__).resolve(),
                    Path(saved.__file__).resolve(), Path(level.__file__).resolve(), saved.HELPER,
                    Path(level.prepare_corpus.__file__).resolve()):
                bindings[str(path)] = saved.sha256(path)
            desired = np.full(FRAMES, -40., np.float64)
            condition = level.write_npz(output / "EXPLICIT_CONSTANT_minus40dBFS.npz", desired_level_dbfs=desired)
            carriers, paths = [], []
            for variant in VARIANTS:
                capacity(output, 7_000_000)
                wave = waves[variant]
                leveled, gain = level.apply_curve(wave, desired)
                after = (leveled.astype(np.float64) * controls["gate"]).astype(np.float32)
                after[controls["gate"] == 0] = 0.
                finite_wave(after)
                if np.any(np.abs(after) >= 1):
                    raise ValueError("gated_melody_clipping_requires_review")
                gain_record = level.write_npz(output / (variant + "_constant_level_controls.npz"), **gain)
                level_record = level.write_npz(output / (variant + "_levelled.npz"), generated=leveled)
                after_record = level.write_npz(output / (variant + "_gated.npz"), generated=after)
                path = output / (variant + "_AUTHORED_19p2_24k.wav")
                write_wave(path, after)
                paths.append(path)
                diagnostics = score_diagnostics(after, controls["target_hz_" + variant], controls, events)
                if any(not row["exact_zero"] for row in diagnostics["native_rests"]):
                    raise ValueError("native_score_rests_not_exact_zero")
                carriers.append(dict(variant=variant, raw_PCM_sha256=array_hash(wave),
                    leveled_PCM_sha256=array_hash(leveled), gated_PCM_sha256=array_hash(after),
                    gain_controls=gain_record, leveled=level_record, gated=after_record,
                    native_wav=dict(path=str(path), sha256=saved.sha256(path)), raw_waveform=waveform_stats(wave),
                    raw_score_diagnostics=score_diagnostics(wave, controls["target_hz_" + variant], controls, events),
                    raw_rests_are_intentionally_ungated_not_a_safety_failure=True,
                    diagnostics=diagnostics))
            labels = ("NEW_AUTHORED_8BARS_ALL_BORROWED_MICROCURVE_NO_NEW_TRAINING",
                      "NEW_AUTHORED_8BARS_LATE_LONG_BORROWED_MICROCURVE_NO_NEW_TRAINING")
            compare_fn = saved.load_comparator() if compare_fn is None else compare_fn
            decode_fn = decoded_rest_diagnostics if decode_fn is None else decode_fn
            capacity(output, 4_000_000)
            destination = output / "new_authored_melodies"
            comparison = compare_fn([label + "=" + str(path) for label, path in zip(labels, paths)], destination, seconds=SECONDS)
            if (comparison.get("schema") != "mini.foundation-local-static-lufs-comparison.v1"
                    or comparison.get("status") != "ready" or comparison.get("seconds") != SECONDS
                    or comparison.get("no_compression_AGC_EQ_pitch_time_edits") is not True
                    or [row["label"] for row in comparison["outputs"]] != list(labels)):
                raise ValueError("exact_two_new_authored19p2_static_comparisons_required")
            outputs = []
            for variant, row in zip(VARIANTS, comparison["outputs"]):
                path = saved.local_child(destination, row["file"], MAX_BYTES)
                saved.bound(path, row["sha256"], {})
                outputs.append(dict(row, variant=variant, path=str(path),
                    decoded_rest_diagnostics=decode_fn(path, events), perceptually_approved=False))
            comparison_path = saved.local_child(destination, "comparison.json", MAX_BYTES)
            if any(saved.sha256(path) != checksum for path, checksum in bindings.items()):
                raise ValueError("bound_score_source_model_or_code_changed")
            report = dict(schema="mini.sifigan-authored-melody-audition.v1",
                status="authored_melody_auditions_ready_not_perceptually_approved", phase="complete",
                raw_report_path=str(raw_path), raw_report_sha256=saved.sha256(raw_path),
                completed_training_steps=3000, training=False, optimizer_steps=0, model_loaded_or_run=False,
                raw_stage_neural_inference=True, authored_eight_bar_score_render=True, new_learned_performance=False,
                source_PCM_mixed_into_output=False, source_reference_RMS_curve_used=False,
                constant_carrier_RMS_condition_dbfs=-40., amplitude_condition_NOT_learned=True,
                authored_attack_release_reattack_and_four_rest_gate=True, old575ms_cut_used=False,
                EQ=False, denoising=False, waveform_pitch_shift=False, quality_approved=False,
                borrowed_microcurve_NOT_pure_vibrato=True, learned_breath_attack_or_sigim=False,
                source_credit=saved.CREDIT, variants=list(VARIANTS), seconds=SECONDS,
                source_score_transposition_semitones=raw["score_transposition_semitones"],
                input_bindings=bindings, checkpoints=checkpoints, condition=condition,
                score_events=events, carriers=carriers, outputs=outputs,
                comparison_path=str(comparison_path), comparison_sha256=saved.sha256(comparison_path),
                inputs_unchanged=True, whole_experiment_bytes_before_report=capacity(output),
                elapsed_seconds=time.monotonic() - started, resources=guard.snapshot(),
                caveats=[f"19.2s authored eight-bar score transposed {raw['score_transposition_semitones']:+d} semitones; not new model training.",
                    "A clean source spectral/microcurve template is cycled as controls; no source PCM is mixed or spliced.",
                    "Explicit constant−40dBFS carrier control and authored gate replace borrowed source RMS.",
                    "Breath/rest/reattack envelopes are authored amplitude edits, not newly learned articulation.",
                    "Pitch denominators are fixed from the score, not source821 frames or a performed reference.",
                    "AAC rests are checked inside50ms guards; lossy encoding need not preserve exact zeros."])
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
    print(json.dumps(dict(status=result["status"], new_files=[row["path"] for row in result["outputs"]])))
