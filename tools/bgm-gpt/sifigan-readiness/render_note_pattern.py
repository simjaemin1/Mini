#!/usr/bin/env python3
"""Three-forward fixed four-note offset diagnostic using global3000.

Source articulation/vibrato/spectrum are borrowed, not independently composed
or learned. Only F0/cf0 inputs change. A source-exact baseline is mandatory.
Existing runners/constants are never monkeypatched. No training/postprocessing.
"""
import argparse
import json
import os
from pathlib import Path
import socket
import sys
import time
import traceback

import numpy as np
import render_pitch_control as prior

lineage, base = prior.lineage, prior.base
FRAMES, SAMPLES, RATE, HOP, SEED = prior.FRAMES, prior.SAMPLES, prior.RATE, prior.HOP, prior.SEED
PRIVATE_ROOT = prior.PRIVATE_ROOT
BOUNDARIES = (300, 520, 740)
OFFSETS = (0., 2., 5., 2.)
VARIANTS = ("0ms", "20ms")
BOUNDARY_HALF_FRAMES, TRANSITION_HALF_FRAMES = 16, 2
MAX_SECONDS, MAX_BYTES, GIB = 300, 50_000_000, 1024 ** 3


def note_slices():
    edges = (0,) + BOUNDARIES + (FRAMES,)
    return list(zip(edges[:-1], edges[1:]))


def boundary_masks():
    """Declared half-open +/-80ms exclusions; never candidate-selected."""
    boundary = np.zeros(FRAMES, dtype=bool)
    for frame in BOUNDARIES:
        start, end = frame - BOUNDARY_HALF_FRAMES, frame + BOUNDARY_HALF_FRAMES
        if start < 0 or end > FRAMES or boundary[start:end].any():
            raise ValueError("nonoverlapping_inbounds_declared_boundary_windows_required")
        boundary[start:end] = True
    return dict(boundary=boundary, steady=~boundary)


def build_offset_curve(variant):
    """5ms control grid;20ms is centered quintic log-pitch interpolation.

    b-2..b+2 has u=[0,.25,.5,.75,1]. Only b-1,b,b+1 differ from hard steps.
    Official excitation interpolation stays unchanged; no second lowpass.
    """
    if variant not in VARIANTS:
        raise ValueError("fixed_0ms_or20ms_variant_required")
    offsets = np.empty(FRAMES, np.float64)
    for (start, end), value in zip(note_slices(), OFFSETS):
        offsets[start:end] = value
    if variant == "20ms":
        u = np.arange(5, dtype=np.float64) / 4.
        progress = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5
        for index, frame in enumerate(BOUNDARIES):
            offsets[frame - 2:frame + 3] = OFFSETS[index] + (OFFSETS[index + 1] - OFFSETS[index]) * progress
    if not np.isfinite(offsets).all() or offsets.min() < 0 or offsets.max() > 5:
        raise ValueError("fixed_finite_zero_to_five_semitones_required")
    return offsets


def pattern_controls(f0, cf0, features, variant):
    """Framewise double precision factor, then official float32 input arrays."""
    for value, shape, label in ((f0, (FRAMES,), "f0"), (cf0, (FRAMES,), "cf0"),
            (features, (FRAMES, 43), "features")):
        if not isinstance(value, np.ndarray) or value.dtype != np.float32 or value.shape != shape or not np.isfinite(value).all():
            raise ValueError("finite_exact_float32_source_controls_required:" + label)
    voiced = f0 > 0
    if not voiced.any() or np.any(f0 < 0) or np.any((f0[voiced] < 70) | (f0[voiced] > 1800)):
        raise ValueError("nonempty_existing70_to1800_source_F0_required")
    if np.any((cf0 < 70) | (cf0 > 1800)):
        raise ValueError("positive_existing70_to1800_continuous_F0_required")
    offsets = build_offset_curve(variant)
    factors = np.power(2.0, offsets / 12.0)
    new_f0 = (f0.astype(np.float64) * factors).astype(np.float32)
    new_cf0 = (cf0.astype(np.float64) * factors).astype(np.float32)
    if np.any(new_f0 > 1800) or np.any(new_cf0 > 1800):
        raise ValueError("controlled_pitch_outside_existing70_to1800_range")
    if not np.array_equal(f0 == 0, new_f0 == 0):
        raise ValueError("source_F0_zero_mask_changed")
    return dict(f0=new_f0, cf0=new_cf0, offset_semitones=offsets, factor=factors)


def pattern_inference(render, get_rng, set_rng, saved):
    """One baseline and two variants with identical pre-baseline CPU noise."""
    before = get_rng()
    baseline = render("baseline")
    after = get_rng()
    prior.require_baseline(baseline, saved)
    variants, variant_rng = {}, {}
    for variant in VARIANTS:
        try:
            set_rng(before)
            variant_rng[variant] = get_rng()
            wave = render(variant)
            if wave.dtype != np.float32 or wave.shape != (SAMPLES,) or not np.isfinite(wave).all():
                raise ValueError("finite_fixed_float32_variant_required")
            variants[variant] = wave
        finally:
            set_rng(after)
    return baseline, variants, before, after, variant_rng


def _source_support(diag):
    return (diag["yin_hz"] > 0) & (diag["periodicity"] >= .90) & (diag["rms_db"] > -60)


def _pitch_scope(measured, target_hz, support, scope):
    fixed = support & scope
    good = _source_support(measured)
    shared = fixed & good
    cents = 1200 * np.log2(measured["yin_hz"][shared].astype(np.float64) / target_hz[shared])
    count, total = int(shared.sum()), int(fixed.sum())
    return dict(scope_frames=int(scope.sum()), reference_support_frames=total,
        reference_support_mask_sha256=prior.pcm_sha(fixed), shared_confident_frames=count,
        candidate_missing_frames=total - count, coverage_fraction_reference_support=float(count / total) if total else None,
        near50c_frames=int((np.abs(cents) <= 50).sum()),
        near50c_fraction_reference_support=float((np.abs(cents) <= 50).sum() / total) if total else None,
        median_signed_error_cents=float(np.median(cents)) if count else None,
        median_abs_error_cents=float(np.median(np.abs(cents))) if count else None,
        p95_abs_error_cents=float(np.quantile(np.abs(cents), .95)) if count else None,
        candidate_missing_frames_remain_in_reference_denominator=True)


def _relative_scope(baseline, measured, target_cents, support, scope):
    fixed = support & scope
    shared = fixed & _source_support(baseline) & _source_support(measured)
    shifts = 1200 * np.log2(measured["yin_hz"][shared].astype(np.float64) / baseline["yin_hz"][shared])
    errors = shifts - target_cents[shared]
    count, total = int(shared.sum()), int(fixed.sum())
    return dict(scope_frames=int(scope.sum()), reference_support_frames=total,
        reference_support_mask_sha256=prior.pcm_sha(fixed), shared_confident_frames=count,
        baseline_missing_frames=int((fixed & ~_source_support(baseline)).sum()),
        candidate_missing_frames=int((fixed & ~_source_support(measured)).sum()),
        paired_missing_frames=total - count, coverage_fraction_reference_support=float(count / total) if total else None,
        target_offset_median_cents_on_fixed_source=float(np.median(target_cents[fixed])) if total else None,
        measured_offset_median_cents_on_shared=float(np.median(shifts)) if count else None,
        median_signed_error_cents=float(np.median(errors)) if count else None,
        median_abs_error_cents=float(np.median(np.abs(errors))) if count else None,
        p95_abs_error_cents=float(np.quantile(np.abs(errors), .95)) if count else None,
        near50c_frames=int((np.abs(errors) <= 50).sum()),
        near50c_fraction_reference_support=float((np.abs(errors) <= 50).sum() / total) if total else None,
        candidate_missing_frames_remain_in_reference_denominator=True)


def boundary_waveform_stats(reference, baseline, candidate, start_frame, end_frame):
    """Identical declared PCM region only; descriptive levels, not click proof."""
    if not 0 <= start_frame < end_frame <= FRAMES:
        raise ValueError("bounded_halfopen_waveform_region_required")
    start, end = start_frame * HOP, end_frame * HOP
    rows = {}
    for role, wave in (("reference", reference), ("baseline", baseline), ("candidate", candidate)):
        if wave.shape != (SAMPLES,) or not np.isfinite(wave).all():
            raise ValueError("finite_fixed_waveform_region_required")
        region = wave[start:end].astype(np.float64)
        chunks = region.reshape(-1, HOP)
        chunk_db = 20 * np.log10(np.maximum(np.sqrt(np.mean(chunks * chunks, axis=1)), 1e-12))
        rows[role] = dict(peak=float(np.max(np.abs(region))),
            samples_at_or_above_unit_peak=int((np.abs(region) >= 1).sum()),
            region_rms_dbfs=float(20 * np.log10(max(float(np.sqrt(np.mean(region * region))), 1e-12))),
            chunk_rms_dbfs_min=float(chunk_db.min()), chunk_rms_dbfs_max=float(chunk_db.max()),
            max_abs_adjacent_chunk_rms_step_db=float(np.max(np.abs(np.diff(chunk_db)))) if len(chunk_db) > 1 else 0.)
    return dict(start_frame=start_frame, end_frame=end_frame, samples=end - start,
        chunk_samples=HOP, chunk_seconds=HOP / RATE, rms_amplitude_floor=1e-12,
        descriptive_only_not_artifact_detector_or_quality_pass=True, roles=rows)


def raw_diagnostics(reference, baseline, variants, curves):
    """Fixed source denominators;64ms YIN cannot certify a20ms transition."""
    import prepare_corpus
    import pilot_metrics
    rd, bd = prepare_corpus.diagnostics(reference), prepare_corpus.diagnostics(baseline)
    support, masks = _source_support(rd), boundary_masks()
    scopes = dict(all=np.ones(FRAMES, bool), steady=masks["steady"], boundary=masks["boundary"])
    def full(wave, diag, target):
        return pilot_metrics.summary(wave, reference, target, rd["periodicity"],
            diag["yin_hz"], diag["periodicity"], rd["rms_db"], diag["rms_db"])
    result = dict(baseline=full(baseline, bd, rd["yin_hz"]), variants={})
    for variant in VARIANTS:
        offsets = curves[variant]
        factors = np.power(2.0, offsets / 12.0)
        target_hz = rd["yin_hz"].astype(np.float64) * factors
        target_cents = offsets * 100.
        measured = prepare_corpus.diagnostics(variants[variant])
        notes = []
        for index, ((start, end), note) in enumerate(zip(note_slices(), OFFSETS)):
            scope = np.zeros(FRAMES, bool)
            scope[start:end] = True
            notes.append(dict(note_index=index + 1, start_frame=start, end_frame=end,
                target_offset_semitones=note,
                source_fixed=_pitch_scope(measured, target_hz, support, scope),
                relative_to_baseline=_relative_scope(bd, measured, target_cents, support, scope),
                steady_relative_to_baseline=_relative_scope(bd, measured, target_cents, support, scope & masks["steady"])))
        boundaries = []
        for frame in BOUNDARIES:
            scope = np.zeros(FRAMES, bool)
            scope[frame - 16:frame + 16] = True
            boundaries.append(dict(center_frame=frame, start_frame=frame - 16, end_frame=frame + 16,
                source_fixed=_pitch_scope(measured, target_hz, support, scope),
                relative_to_baseline=_relative_scope(bd, measured, target_cents, support, scope),
                waveform_levels=boundary_waveform_stats(reference, baseline, variants[variant], frame - 16, frame + 16)))
        result["variants"][variant] = dict(all_source=full(variants[variant], measured, target_hz),
            source_fixed_scopes={name: _pitch_scope(measured, target_hz, support, mask) for name, mask in scopes.items()},
            baseline_relative_scopes={name: _relative_scope(bd, measured, target_cents, support, mask) for name, mask in scopes.items()},
            per_note=notes, per_boundary=boundaries,
            source_YIN_virtual_target_sha256=prior.pcm_sha(target_hz),
            source_only_support_sha256=prior.pcm_sha(support), source_YIN_is_truth=False,
            scope_exclusion="all-source excludes nothing; steady excludes only declared halfopen +/-80ms boundary windows",
            analysis_limit="64ms centered YIN blends transitions, and neural receptive fields add context; these numbers cannot prove20ms acoustic transition duration.")
    return result


def design_flags():
    return dict(prior.design_flags(), borrowed_source_vibrato=True, borrowed_source_articulation=True,
        learned_new_breath_or_voicing=False, fixed_four_note_offset_not_independent_score=True,
        no_second_lowpass=True, three_forwards_only=True)


def run(parent_report, report_path, upstream, output):
    base.require_mps_environment()
    output, private = Path(output), PRIVATE_ROOT.resolve(strict=True)
    if (not output.is_absolute() or output.is_symlink() or output.exists()
            or output.resolve() == private or not output.resolve().is_relative_to(private)):
        raise ValueError("fresh_absolute_private_output_required")
    output.mkdir(mode=0o700)
    started, previous = time.monotonic(), os.umask(0o077)
    masks = boundary_masks()
    report = dict(schema="mini.sifigan-four-note-pattern.v1", status="started", phase="validation",
        **design_flags(), case="deepvib48", case_order=["deepvib48"], frames=FRAMES, samples=SAMPLES, sample_rate=RATE, hop_size=HOP,
        variants=list(VARIANTS), boundaries_frames=list(BOUNDARIES), boundaries_seconds=[f * HOP / RATE for f in BOUNDARIES],
        offsets_semitones=list(OFFSETS), max_semitones=5., transition_half_frames=2,
        transition_grid_progress=[0., .103515625, .5, .896484375, 1.],
        boundary_windows_halfopen_frames=[[b - 16, b + 16] for b in BOUNDARIES],
        boundary_mask_frames=int(masks["boundary"].sum()), steady_mask_frames=int(masks["steady"].sum()),
        mask_counts_note="96/864 are geometric frame counts; source-supported counts are separately fixed in raw_diagnostics (not the same denominators)",
        max_seconds=MAX_SECONDS, max_output_bytes=MAX_BYTES, max_conservative_rss_plus_MPS_bytes=8 * GIB,
        min_free_disk_bytes=12 * GIB, source_credit=lineage.saved.CREDIT, seed=SEED + 2,
        completed_steps=3000, baseline_reproduced=False, cases=[])
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "foundation-model-trial"))
    from ace_limits import ResourceCaps, ResourceGuard
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=MAX_SECONDS, max_rss_bytes=8 * GIB)) as guard:
            prior.ensure_capacity(output, prior.WRITE_RESERVE)
            training, selected, bindings, checkpoints = lineage.validate_inputs(parent_report, report_path)
            if training["completed_steps"] != 3000 or selected[0]["case"] != "deepvib48":
                raise ValueError("fixed_global3000_deep_first_baseline_required")
            item = selected[0]
            upstream = Path(upstream).resolve(strict=True)
            official = base.validate_upstream(upstream)
            if len(official) != 56 or official != training["upstream_bindings"]:
                raise ValueError("same_clean56_file_official_upstream_required")
            gate_path = lineage.saved.regular(training["data_gate"], 50_000_000)
            gate = json.loads(gate_path.read_text())
            if gate.get("training_eligible") is not True:
                raise ValueError("unchanged_accepted_fit_gate_required")
            stats_path = lineage.saved.local_child(gate_path.parent, gate.get("stats_file", "stats.npz"))
            lineage.saved.bound(stats_path, gate["stats_sha256"], bindings)
            with np.load(stats_path, allow_pickle=False) as archive:
                mean, scale = archive["mean"].copy(), archive["scale"].copy()
            with np.load(item["corpus_npz_path"], allow_pickle=False) as archive:
                f0, cf0, features = [archive[key][:FRAMES].copy() for key in ("f0", "cf0", "features")]
            controls = {v: pattern_controls(f0, cf0, features, v) for v in VARIANTS}
            normalized = prior.normalize_features(features, mean, scale)
            for path in (Path(__file__).resolve(), Path(prior.__file__).resolve(), Path(lineage.__file__).resolve(),
                    Path(base.__file__).resolve(), Path(lineage.saved.__file__).resolve(),
                    Path(__file__).with_name("prepare_corpus.py"), Path(__file__).with_name("pilot_metrics.py"),
                    Path(__file__).with_name("train_corpus_pilot.py"),
                    Path(__file__).resolve().parents[1] / "foundation-model-trial/ace_limits.py"):
                bindings[str(path)] = lineage.saved.sha256(path)
            report.update(training_report_path=str(report_path), parent_report_path=str(parent_report),
                input_bindings=bindings, upstream_bindings=official, checkpoints=checkpoints,
                data_gate=str(gate_path), initial_resources=guard.initial)
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
                raise ValueError("unchanged_official_full_generator_required")
            generator = SiFiGANGenerator(**gc).to("mps").eval()
            generator.load_state_dict(state["generator"], strict=True)
            del state
            if any(p.device.type != "mps" for p in generator.parameters()):
                raise RuntimeError("all_generator_parameters_must_be_on_MPS")
            signal = SignalGenerator(sample_rate=RATE, hop_size=HOP, sine_amp=.1, noise_amp=.003, signal_types=["sine"])
            def render(variant):
                pitch = cf0 if variant == "baseline" else controls[variant]["cf0"]
                z = signal(torch.from_numpy(pitch.copy()).reshape(1, 1, -1)).float().to("mps")
                ds, cumulative = [], 1
                for factor, dense in zip(gc["upsample_scales"], [.5, 1, 4, 8]):
                    cumulative *= factor
                    values = np.repeat(dilated_factor(pitch.copy(), RATE, dense), cumulative).astype(np.float32)
                    ds.append(torch.from_numpy(values).reshape(1, 1, -1).to("mps"))
                c = torch.from_numpy(normalized.T.copy()).unsqueeze(0).to("mps")
                with torch.no_grad():
                    return generator(z, c, ds)[0].squeeze().cpu().numpy().copy()
            report.update(phase="baseline_then_two_variants", device="MPS; official CPU_float64_excitation_then_float32_transfer",
                sine_amp=.1, noise_amp=.003, signal_types=["sine"], dense_factors=[.5, 1, 4, 8],
                remove_weight_norm=False, excitation_rng="SEED+2 deep-first baseline; CPU RNG restored before each variant, then baseline-after restored")
            torch.manual_seed(SEED + 2)
            baseline, waves, before, after, variant_rng = pattern_inference(render,
                lambda: torch.get_rng_state().clone(), torch.set_rng_state, item["generated"])
            curves = {v: controls[v]["offset_semitones"] for v in VARIANTS}
            diagnostics = raw_diagnostics(item["reference"], baseline, waves, curves)
            arrays = dict(reference=item["reference"].copy(), baseline=baseline, source_f0=f0.copy(),
                source_cf0=cf0.copy(), features=features.copy(), normalized_features=normalized,
                boundary_mask=masks["boundary"], steady_mask=masks["steady"])
            for variant in VARIANTS:
                arrays["generated_" + variant] = waves[variant]
                arrays.update({key + "_" + variant: value for key, value in controls[variant].items()})
            record = prior.save_arrays(output / "deepvib48_four_note_pattern.npz", arrays)
            record.update(case="deepvib48", baseline_reproduced=True, baseline_byte_exact=True,
                rng_before_sha256=prior.pcm_sha(before.numpy()), rng_after_baseline_sha256=prior.pcm_sha(after.numpy()),
                rng_variant_before_sha256={v: prior.pcm_sha(s.numpy()) for v, s in variant_rng.items()},
                raw_diagnostics=diagnostics, source_reference_byte_exact_corpus=True)
            report["cases"].append(record)
            if any(lineage.saved.sha256(path) != digest for path, digest in bindings.items()) or base.validate_upstream(upstream) != official:
                raise ValueError("bound_original_model_code_or_upstream_changed")
            report.update(status="four_note_pattern_rendered_not_perceptually_approved", phase="complete",
                baseline_reproduced=True, inputs_unchanged=True, forward_calls=3, final_resources=guard.snapshot(),
                caveats=["Four source-relative offsets, NOT an independently performed new score or naturalness approval.",
                    "Source vibrato, articulation, 43 spectral/AP channels and reference amplitude curve are borrowed.",
                    "0ms refers to input-grid hard steps; official excitation interpolation/receptive-field behavior is unchanged.",
                    "20ms is an explicit centered log-offset control curve, not a measured20ms acoustic transition.",
                    "64ms centered YIN and model temporal context limit transition interpretation; all-source and boundary metrics remain visible.",
                    "No new breath/rest/voicing control, new training, output denoising/EQ/gain, waveform pitch warp, or source PCM mixing."])
    except Exception as exc:
        report.update(status="four_note_pattern_failed_no_candidate_approval", error_type=type(exc).__name__,
            error_message=str(exc), traceback=traceback.format_exc())
        raise
    finally:
        try:
            report["elapsed_seconds"] = time.monotonic() - started
            prior.ensure_capacity(output)
            base.write_report(output / "report.json", report)
        finally:
            os.umask(previous)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent-report", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = run(args.parent_report, args.report, args.upstream, args.output)
    print(json.dumps(dict(status=result["status"], baseline_reproduced=result["baseline_reproduced"],
        forward_calls=result["forward_calls"], quality_approved=False)))
