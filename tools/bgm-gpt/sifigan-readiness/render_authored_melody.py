#!/usr/bin/env python3
"""Global3000 renders an explicit19.2s score, borrowing a clean timbre loop.

The score is lowered by7or12 semitones. Timing, rests, reattacks and microcurve rules
are authored here, NOT learned breath/sigim or source-envelope copying.
One source-exact baseline + two continuous forwards; raw output is ungated.
"""
import argparse
from fractions import Fraction
import json
import os
from pathlib import Path
import re
import shutil
import socket
import sys
import time
import traceback

import numpy as np
import render_pitch_control as prior

lineage, base = prior.lineage, prior.base
RATE, HOP, FRAMES, SAMPLES = 24000, 120, 3840, 460800
VARIANTS = ("all_microcurve", "late_long_microcurve")
PRIVATE_ROOT = prior.PRIVATE_ROOT
GIB, MAX_BYTES = 1024 ** 3, 50_000_000


def smootherstep(value):
    u = np.clip(np.asarray(value, dtype=np.float64), 0., 1.)
    return np.clip(10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5, 0., 1.)


def parse_score(score, transpose_semitones=-12):
    if type(transpose_semitones) is not int or transpose_semitones not in (-12, -7):
        raise ValueError("explicit_minus12_or_minus7_register_only")
    if (score.get("schema") != "mini.bgm-gpt.original-variation.v1" or score.get("bar_count") != 8
            or score.get("duration_seconds") != 19.2 or score.get("beats_per_bar") != 3
            or score.get("sobak_per_beat") != 3 or not np.isclose(score.get("sobak_seconds", 0), 4 / 15, rtol=0, atol=1e-15)
            or len(score.get("bars", [])) != 8):
        raise ValueError("fixed_eight_bar19p2s_score_required")
    rows, note = [], 0
    for bar_index, bar in enumerate(score["bars"]):
        if bar.get("bar") != bar_index + 1:
            raise ValueError("ordered_eight_bars_required")
        cursor = 0
        for event in bar.get("events", []):
            onset, duration = event.get("onset_sobak"), event.get("duration_sobak")
            if type(onset) is not int or type(duration) is not int or onset != cursor or duration <= 0 or onset + duration > 9:
                raise ValueError("contiguous_positive_integer_sobak_events_required")
            start_sobak, end_sobak = bar_index * 9 + onset, bar_index * 9 + onset + duration
            start, end = round(Fraction(start_sobak * 160, 3)), round(Fraction(end_sobak * 160, 3))
            original_start, original_end = float(Fraction(start_sobak * 4, 15)), float(Fraction(end_sobak * 4, 15))
            rest = event.get("rest") is True
            midi, articulation = None, "breath_rest"
            if not rest:
                match = re.fullmatch(r"([CDEGA])([0-8])", event.get("pitch", ""))
                if match is None or event.get("articulation") not in ("breath_start", "slur", "rearticulate"):
                    raise ValueError("explicit_pentatonic_pitch_and_articulation_required")
                midi = 12 * (int(match[2]) + 1) + {"C": 0, "D": 2, "E": 4, "G": 7, "A": 9}[match[1]]
                articulation = event["articulation"]
            rows.append(dict(index=len(rows), rest=rest, note_index=-1 if rest else note,
                start_frame=start, end_frame=end, start_sample=start_sobak * 6400, end_sample=end_sobak * 6400,
                original_start_seconds=original_start, original_end_seconds=original_end,
                quantization_start_error_seconds=start * HOP / RATE - original_start,
                quantization_end_error_seconds=end * HOP / RATE - original_end,
                original_midi=midi, transposed_midi=None if rest else midi + transpose_semitones,
                articulation=articulation, duration_sobak=duration, duration_seconds=float(Fraction(duration * 4, 15))))
            note += not rest
            cursor = onset + duration
        if cursor != 9:
            raise ValueError("each_bar_must_fill_nine_sobak")
    if note != 28 or sum(r["rest"] for r in rows) != 4 or rows[-1]["end_frame"] != FRAMES:
        raise ValueError("exact28_notes_four_rests_required")
    if any(abs(r[key]) > .0025 for r in rows for key in ("quantization_start_error_seconds", "quantization_end_error_seconds")):
        raise ValueError("nearest5ms_joint_edges_required")
    return rows


def authored_gate(events):
    gate = np.zeros(SAMPLES, np.float64)
    for row in events:
        start, end = row["start_sample"], row["end_sample"]
        if not row["rest"]:
            gate[start:end] = 1.
    for index, row in enumerate(events):
        start, end = row["start_sample"], row["end_sample"]
        if row["rest"]:
            if index and not events[index - 1]["rest"]:
                gate[start - 960:start + 1] *= 1 - smootherstep(np.arange(961) / 960.)
        elif row["articulation"] == "breath_start":
            if index and not events[index - 1]["rest"]:
                raise ValueError("breath_start_requires_written_rest_or_score_start")
            gate[start:start + 961] *= smootherstep(np.arange(961) / 960.)
        elif row["articulation"] == "rearticulate":
            if not index or events[index - 1]["rest"]:
                raise ValueError("rearticulation_requires_touching_notes")
            gate[start - 240:start + 1] *= 1 - smootherstep(np.arange(241) / 240.)
            gate[start:start + 481] *= smootherstep(np.arange(481) / 480.)
    return gate


def build_controls(score, source_cf0, source_features, mean, scale, transpose_semitones=-12):
    events = parse_score(score, transpose_semitones)
    if (source_cf0.dtype != np.float32 or source_cf0.ndim != 1 or len(source_cf0) < 1200
            or source_features.dtype != np.float32 or source_features.shape != (len(source_cf0), 43)
            or not np.isfinite(source_cf0).all() or not np.isfinite(source_features).all()
            or np.any((source_cf0 < 70) | (source_cf0 > 1800))):
        raise ValueError("finite_full_corpus_cf0_and43features_with_clean1200frame_prefix_required")
    if (mean.shape != (43,) or scale.shape != (43,) or not np.isfinite(mean).all()
            or not np.isfinite(scale).all() or np.any(scale <= 0)):
        raise ValueError("finite43channel_fit_normalizer_required")
    indices = 240 + ((np.arange(FRAMES, dtype=np.int64) + 16) % 960)
    template = source_cf0[240:1200].astype(np.float64)
    microcurve = 1200 * np.log2(source_cf0[indices].astype(np.float64) / np.median(template))
    features = source_features[indices].copy()
    normalized = ((features - mean) / scale).astype(np.float32)
    sounding, steady = np.zeros(FRAMES, bool), np.zeros(FRAMES, bool)
    note_index, center = np.full(FRAMES, -1, np.int16), np.empty(FRAMES, np.float64)
    previous_hz = None
    for row in events:
        start, end = row["start_frame"], row["end_frame"]
        if row["rest"]:
            if previous_hz is None:
                raise ValueError("score_must_start_with_sounding_note")
            center[start:end] = previous_hz
        else:
            previous_hz = 440 * 2 ** ((row["transposed_midi"] - 69) / 12.)
            center[start:end] = previous_hz
            sounding[start:end] = True
            steady[start + 16:end - 16] = True
            note_index[start:end] = row["note_index"]
    log_center = np.log2(center)
    for index, row in enumerate(events):
        if index and not row["rest"] and not events[index - 1]["rest"]:
            boundary = row["start_frame"]
            old_hz, new_hz = center[boundary - 1], center[boundary]
            u = smootherstep(np.arange(5) / 4.)
            log_center[boundary - 2:boundary + 3] = np.log2(old_hz) + (np.log2(new_hz) - np.log2(old_hz)) * u
    center = np.exp2(log_center)
    late = np.zeros(FRAMES, np.float64)
    for row in events:
        if not row["rest"] and row["duration_sobak"] >= 3:
            start, end = row["start_frame"], row["end_frame"]
            age = np.arange(end - start, dtype=np.float64) * HOP / RATE
            remaining = (end - start - np.arange(end - start, dtype=np.float64)) * HOP / RATE
            late[start:end] = smootherstep((age - .30) / .15) * smootherstep(remaining / .12)
    arrays = dict(gate=authored_gate(events), center_hz=center, sounding_mask=sounding, rest_mask=~sounding,
        steady_mask=steady, template_index_map=indices, borrowed_microcurve_cents=microcurve,
        features=features, normalized_features=normalized, note_index=note_index,
        microcurve_envelope_all_microcurve=sounding.astype(np.float64), microcurve_envelope_late_long_microcurve=late)
    for variant in VARIANTS:
        hz = (center * np.exp2(microcurve * arrays["microcurve_envelope_" + variant] / 1200.)).astype(np.float32)
        if not np.isfinite(hz).all() or np.any((hz < 70) | (hz > 1800)):
            raise ValueError("authored_target_outside_existing70_to1800_pitch_range")
        arrays["target_hz_" + variant] = hz
    return arrays, events


def inference(render, get_rng, set_rng, saved_baseline):
    before = get_rng()
    baseline = render("baseline")
    after = get_rng()
    prior.require_baseline(baseline, saved_baseline)
    waves, states = {}, {}
    for variant in VARIANTS:
        try:
            set_rng(before)
            states[variant] = get_rng()
            wave = render(variant)
            if wave.dtype != np.float32 or wave.shape != (SAMPLES,) or not np.isfinite(wave).all():
                raise ValueError("finite_continuous19p2s_float32_raw_output_required")
            waves[variant] = wave
        finally:
            set_rng(after)
    return baseline, waves, before, after, states


def capacity(output, reserve=0):
    used = sum(path.stat().st_size for path in Path(output).rglob("*") if path.is_file())
    if used + reserve > MAX_BYTES or shutil.disk_usage(output).free < 12 * GIB + reserve:
        raise RuntimeError("50MB_output_or12GiB_disk_reserve_exceeded")
    return used


def write_raw_wav(path, wave):
    from scipy.io import wavfile
    if wave.dtype != np.float32 or wave.shape != (SAMPLES,) or not np.isfinite(wave).all():
        raise ValueError("native19p2s_float32_raw_wave_required")
    with Path(path).open("xb") as handle:
        wavfile.write(handle, RATE, wave)
    Path(path).chmod(0o600)
    rate, reread = wavfile.read(path)
    if rate != RATE or reread.tobytes() != wave.tobytes() or reread.dtype != wave.dtype:
        raise ValueError("native_WAV_not_byte_exact")
    return dict(file=Path(path).name, sha256=lineage.saved.sha256(path), PCM_sha256=prior.pcm_sha(wave), rate=RATE, samples=SAMPLES)


def run(upstream, parent_training, training_path, score_path, output, transpose_semitones=-12):
    if type(transpose_semitones) is not int or transpose_semitones not in (-12, -7):
        raise ValueError("explicit_minus12_or_minus7_register_only")
    base.require_mps_environment()
    output, root = Path(output), PRIVATE_ROOT.resolve(strict=True)
    if not output.is_absolute() or output.is_symlink() or output.exists() or output.resolve() == root or not output.resolve().is_relative_to(root):
        raise ValueError("fresh_absolute_private_output_required")
    output.mkdir(mode=0o700)
    previous, started = os.umask(0o077), time.monotonic()
    report = dict(schema="mini.sifigan-authored-melody.v1", status="started", phase="validate", variants=list(VARIANTS),
        sample_rate=RATE, hop_size=HOP, frames=FRAMES, samples=SAMPLES, duration_seconds=19.2, completed_steps=3000,
        training=False, optimizer_steps=0, weights_written=False, public_weights_used=False,
        authored_eight_bar_score_render=True, new_learned_performance=False, borrowed_microcurve_NOT_pure_vibrato=True,
        source_envelope_used=False, model_loaded_or_run=False, output_postprocessing=False, authored_gate_applied_to_raw=False,
        normalizer_unchanged=True, generator_weights_unchanged=True, automatic_CPU_fallback=False,
        source_PCM_mixed_into_output=False, denoising=False, EQ=False, waveform_pitch_shift=False, quality_approved=False,
        source_credit=lineage.saved.CREDIT, baseline_reproduced=False, seed=prior.SEED + 2,
        score_transposition_semitones=transpose_semitones, template_source_frames=[240, 1200], template_phase_offset_frames=16,
        register_policy="minus7_correction_after_reliable_source_range_audit" if transpose_semitones == -7 else "historical_minus12_register_diagnostic",
        clean_feature_loop_still_borrowed=True, legacy_B0_B1_policy_reused=False, old575ms_intro_cut_applied=False,
        max_seconds=600, max_output_bytes=MAX_BYTES, max_conservative_rss_plus_MPS_bytes=8 * GIB, min_free_disk_bytes=12 * GIB)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "foundation-model-trial"))
    from ace_limits import ResourceCaps, ResourceGuard
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=600, max_rss_bytes=8 * GIB)) as guard:
            capacity(output, 15_000_000)
            training, sources, bindings, checkpoints = lineage.validate_inputs(parent_training, training_path)
            if training["completed_steps"] != 3000 or sources[0]["case"] != "deepvib48":
                raise ValueError("fixed_global3000_deep_first_baseline_required")
            item = sources[0]
            upstream = Path(upstream).resolve(strict=True)
            official = base.validate_upstream(upstream)
            if len(official) != 56 or official != training["upstream_bindings"]:
                raise ValueError("same_clean_pinned56_file_official_upstream_required")
            score_path = lineage.saved.regular(score_path, 1_000_000)
            bindings[str(score_path)] = lineage.saved.sha256(score_path)
            score = json.loads(score_path.read_text())
            gate_path = Path(training["data_gate"])
            gate = json.loads(gate_path.read_text())
            stats_path = lineage.saved.local_child(gate_path.parent, gate.get("stats_file", "stats.npz"))
            lineage.saved.bound(stats_path, gate["stats_sha256"], bindings)
            with np.load(stats_path, allow_pickle=False) as archive:
                mean, scale = archive["mean"].copy(), archive["scale"].copy()
            with np.load(item["corpus_npz_path"], allow_pickle=False) as archive:
                cf0, features = archive["cf0"].copy(), archive["features"].copy()
            arrays, events = build_controls(score, cf0, features, mean, scale, transpose_semitones)
            baseline_features = prior.normalize_features(features[:960], mean, scale)
            for path in (Path(__file__).resolve(), Path(prior.__file__).resolve(), Path(lineage.__file__).resolve(),
                    Path(lineage.saved.__file__).resolve(), Path(base.__file__).resolve(),
                    Path(__file__).resolve().parents[1] / "foundation-model-trial/ace_limits.py"):
                bindings[str(path)] = lineage.saved.sha256(path)
            report.update(parent_report_path=str(parent_training), training_report_path=str(training_path), score_path=str(score_path),
                score_sha256=bindings[str(score_path)], score_events=events, input_bindings=bindings, upstream_bindings=official,
                checkpoints=checkpoints, data_gate=str(gate_path), corpus_npz_path=item["corpus_npz_path"], initial_resources=guard.initial,
                native_gate_uses_exact_score_sobak_samples=True, F0_control_edges_joint_nearest5ms=True,
                normalized_features_dtype="float32", nearest_control_edge_error_limit_seconds=.0025,
                long_microcurve_note_indices_1based=[r["note_index"] + 1 for r in events if not r["rest"] and r["duration_sobak"] >= 3],
                nominal_note_hz_range=[min(440 * 2 ** ((r["transposed_midi"] - 69) / 12.) for r in events if not r["rest"]),
                    max(440 * 2 ** ((r["transposed_midi"] - 69) / 12.) for r in events if not r["rest"])],
                target_hz_range={v: [float(arrays["target_hz_" + v].min()), float(arrays["target_hz_" + v].max())] for v in VARIANTS})
            socket.create_connection = base.block_network
            socket.socket.connect = base.block_network
            socket.socket.connect_ex = base.block_network
            import torch
            import yaml
            if not torch.backends.mps.is_available():
                raise RuntimeError("MPS_required_no_CPU_fallback")
            torch.set_num_threads(4)
            sys.path.insert(0, str(upstream))
            from sifigan.models import SiFiGANGenerator
            from sifigan.utils.features import SignalGenerator, dilated_factor
            checkpoint = checkpoints["extended"][training["inference_checkpoint_file"]]
            state = torch.load(checkpoint["path"], map_location="cpu", weights_only=True)
            prior.validate_state(state, training, mean, scale, gate_path)
            gc = dict(training["generator_config"])
            official_gc = yaml.safe_load((upstream / "sifigan/bin/config/generator/sifigan.yaml").read_text())
            if official_gc.pop("_target_") != "sifigan.models.SiFiGANGenerator" or gc != official_gc:
                raise ValueError("same_official_full_generator_config_required")
            generator = SiFiGANGenerator(**gc).to("mps").eval()
            generator.load_state_dict(state["generator"], strict=True)
            del state
            if any(parameter.device.type != "mps" for parameter in generator.parameters()):
                raise RuntimeError("all_generator_parameters_must_be_on_MPS")
            report["model_loaded_or_run"] = True
            signal = SignalGenerator(sample_rate=RATE, hop_size=HOP, sine_amp=.1, noise_amp=.003, signal_types=["sine"])
            def render(variant):
                pitch, cond = (cf0[:960], baseline_features) if variant == "baseline" else (arrays["target_hz_" + variant], arrays["normalized_features"])
                z = signal(torch.from_numpy(pitch.copy()).reshape(1, 1, -1)).float().to("mps")
                ds, cumulative = [], 1
                for factor, dense in zip(gc["upsample_scales"], [.5, 1, 4, 8]):
                    cumulative *= factor
                    d = np.repeat(dilated_factor(pitch.copy(), RATE, dense), cumulative).astype(np.float32)
                    ds.append(torch.from_numpy(d).reshape(1, 1, -1).to("mps"))
                c = torch.from_numpy(cond.T.copy()).unsqueeze(0).to("mps")
                with torch.no_grad():
                    return generator(z, c, ds)[0].squeeze().cpu().numpy().copy()
            torch.manual_seed(prior.SEED + 2)
            baseline, waves, before, after, variant_states = inference(render, lambda: torch.get_rng_state().clone(), torch.set_rng_state, item["generated"])
            capacity(output, 15_000_000)
            baseline_record = prior.save_arrays(output / "baseline_deepvib48.npz", dict(generated=baseline, reference=item["reference"]))
            baseline_record.update(baseline_byte_exact=True, generated_PCM_sha256=prior.pcm_sha(baseline))
            with (output / "controls.npz").open("xb") as handle:
                np.savez_compressed(handle, **arrays)
            (output / "controls.npz").chmod(0o600)
            with np.load(output / "controls.npz", allow_pickle=False) as archive:
                if set(archive.files) != set(arrays) or any(archive[k].tobytes() != v.tobytes() for k, v in arrays.items()):
                    raise ValueError("saved_controls_not_byte_exact")
            rawfiles = [dict(write_raw_wav(output / ("raw_" + v + "_24k_mono.wav"), waves[v]), variant=v) for v in VARIANTS]
            if any(lineage.saved.sha256(path) != digest for path, digest in bindings.items()) or base.validate_upstream(upstream) != official:
                raise ValueError("bound_source_score_code_or_checkpoint_changed")
            report.update(status="authored_melody_raw_rendered_not_perceptually_approved", phase="complete", baseline_reproduced=True,
                baseline_byte_exact=True, forward_calls=3, baseline=baseline_record, rawfiles=rawfiles,
                controls=dict(file="controls.npz", sha256=lineage.saved.sha256(output / "controls.npz"), array_sha256={k: prior.pcm_sha(v) for k, v in arrays.items()}),
                rng_before_sha256=prior.pcm_sha(before.numpy()), rng_after_baseline_sha256=prior.pcm_sha(after.numpy()),
                rng_variant_before_sha256={v: prior.pcm_sha(s.numpy()) for v, s in variant_states.items()},
                inputs_unchanged=True, final_resources=guard.snapshot(),
                caveats=["Raw neural output is NOT gated or RMS-normalized here; exporter applies constant carrier level then authored gate.",
                    "Microcurve includes source pitch drift/modulation, not isolated learned vibrato. These rules are separate from legacy B0/B1.",
                    "Tiled source spectrum remains borrowed; wraps are placed inside rests but80ms is not a proved neural settling time.",
                    "No source envelope/PCM mix, new training, learned breath/sigim, denoising, EQ or waveform pitch warp."])
    except Exception as exc:
        report.update(status="authored_melody_failed_no_candidate_approval", error_type=type(exc).__name__, error_message=str(exc), traceback=traceback.format_exc())
        raise
    finally:
        try:
            report["elapsed_seconds"] = time.monotonic() - started
            capacity(output, 500_000)
            base.write_report(output / "report.json", report)
        finally:
            os.umask(previous)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--parent-training", type=Path, required=True)
    parser.add_argument("--training", type=Path, required=True)
    parser.add_argument("--score", type=Path, required=True)
    parser.add_argument("--transpose-semitones", type=int, choices=(-12, -7), default=-12)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = run(args.upstream, args.parent_training, args.training, args.score, args.output, args.transpose_semitones)
    print(json.dumps(dict(status=result["status"], forward_calls=result["forward_calls"], quality_approved=False)))
