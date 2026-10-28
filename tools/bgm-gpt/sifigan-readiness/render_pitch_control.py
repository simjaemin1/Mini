#!/usr/bin/env python3
"""Fixed global3000 +100-cent control diagnostic, not a new score or song.

Only the two historically seen 4.8s clips are rendered. The official cf0
excitation AND dilation inputs change together; 43ch mcep/BAP and normalizer
remain byte unchanged. Baseline must first reproduce its saved PCM exactly.
No training, source mixing, denoising, output gain, or waveform pitch warp.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import sys
import time
import traceback

import numpy as np
import export_extended_training as lineage
import probe_generator_mps as base
from train_corpus_pilot import HOP, RATE, SEED

FRAMES, SAMPLES = 960, 115200
SEMITONES, CENTS, FACTOR = 1.0, 100.0, 2.0 ** (1.0 / 12.0)
MAX_SECONDS, MAX_BYTES, GIB = 300, 50_000_000, 1024 ** 3
WRITE_RESERVE, REPORT_RESERVE = 8_000_000, 1_000_000
CASES, PRIVATE_ROOT = lineage.saved.CASES, lineage.saved.PRIVATE_ROOT


def pcm_sha(value):
    return hashlib.sha256(value.tobytes()).hexdigest()


def design_flags():
    return dict(training=False, optimizer_steps=0, weights_written=False,
        public_weights_used=False, source_PCM_mixed_into_output=False,
        output_processing=False, denoising=False, EQ=False, waveform_pitch_warp=False,
        new_score_or_music=False, source_amplitude_prediction_learned=False,
        quality_approved=False, perceptually_approved=False, automatic_CPU_fallback=False,
        mcep_BAP_unchanged=True, normalizer_unchanged=True, input_gain_unchanged=True,
        raw_F0_zero_mask_unchanged=True, excitation_and_dilation_use_same_shifted_cf0=True,
        source_YIN_is_pitch_truth=False, heldout_is_blind=False)


def transpose_controls(f0, cf0, features, semitones=SEMITONES):
    """Exact official float32 multiplication; never mutate source arrays."""
    if type(semitones) not in (int, float) or semitones != SEMITONES:
        raise ValueError("fixed_plus_one_semitone_only")
    for value, shape, name in ((f0, (FRAMES,), "f0"), (cf0, (FRAMES,), "cf0"),
            (features, (FRAMES, 43), "features")):
        if not isinstance(value, np.ndarray) or value.dtype != np.float32 or value.shape != shape or not np.isfinite(value).all():
            raise ValueError("finite_exact_float32_fixed_crop_required:" + name)
    voiced = f0 > 0
    if not voiced.any() or np.any(f0 < 0) or np.any((f0[voiced] < 70) | (f0[voiced] > 1800)):
        raise ValueError("nonempty_70_to1800_voiced_source_required")
    if np.any((cf0 < 70) | (cf0 > 1800)):
        raise ValueError("strict_positive_70_to1800_continuous_F0_required")
    shifted_f0, shifted_cf0 = f0.copy(), cf0.copy()
    # np.float32 arrays multiplied in place by the Python scalar: mirrors
    # official FeatDataset's `f0 *= f0_factor; cf0 *= f0_factor`.
    shifted_f0 *= FACTOR
    shifted_cf0 *= FACTOR
    if np.any(shifted_f0 > 1800) or np.any(shifted_cf0 > 1800):
        raise ValueError("shifted_F0_outside_existing70_to1800_analysis_range")
    if not np.array_equal(shifted_f0 == 0, f0 == 0):
        raise ValueError("raw_F0_zero_mask_changed")
    return dict(source_f0=f0.copy(), source_cf0=cf0.copy(), shifted_f0=shifted_f0,
        shifted_cf0=shifted_cf0, features=features.copy())


def normalize_features(features, mean, scale):
    for value, name in ((mean, "mean"), (scale, "scale")):
        if np.asarray(value).shape != (43,) or not np.isfinite(value).all():
            raise ValueError("finite43_channel_normalizer_required:" + name)
    if np.any(scale <= 0):
        raise ValueError("positive_normalizer_scale_required")
    normalized = ((features - mean) / scale).astype(np.float32)
    if normalized.shape != (FRAMES, 43) or not np.isfinite(normalized).all():
        raise ValueError("finite_unchanged_normalized_features_required")
    return normalized


def require_baseline(actual, saved):
    for value in (actual, saved):
        if value.dtype != np.float32 or value.shape != (SAMPLES,) or not np.isfinite(value).all():
            raise ValueError("finite_float32_fixed_baseline_required")
    if actual.tobytes() != saved.tobytes():
        raise ValueError("global3000_baseline_not_byte_exact_no_candidate_export")


def paired_inference(render, get_rng, set_rng, saved):
    """Preserve the original case-to-case RNG stream, repeat noise per variant.

    Caller seeds ONCE before deepvib48 then arirang001, exactly as the producer.
    Shifted rendering cannot consume the next case's baseline excitation RNG.
    """
    before = get_rng()
    baseline = render(False)
    after = get_rng()
    require_baseline(baseline, saved)
    try:
        set_rng(before)
        shifted = render(True)
        if shifted.dtype != np.float32 or shifted.shape != (SAMPLES,) or not np.isfinite(shifted).all():
            raise ValueError("finite_float32_shifted_PCM_required")
    finally:
        set_rng(after)
    return baseline, shifted, before, after


def ensure_capacity(output, reserve=0):
    used = sum(p.stat().st_size for p in Path(output).rglob("*") if p.is_file())
    if used + reserve + REPORT_RESERVE > MAX_BYTES:
        raise RuntimeError("fresh_output50MB_ceiling")
    if shutil.disk_usage(output).free < 12 * GIB + reserve:
        raise RuntimeError("reserve_above12GiB_disk_floor_required")
    return used


def save_arrays(path, arrays):
    if any(not isinstance(v, np.ndarray) or not np.isfinite(v).all() for v in arrays.values()):
        raise ValueError("finite_numeric_output_arrays_required")
    if sum(v.nbytes for v in arrays.values()) > WRITE_RESERVE:
        raise ValueError("bounded_control_archive_required")
    ensure_capacity(Path(path).parent, WRITE_RESERVE)
    with Path(path).open("xb") as handle:
        np.savez_compressed(handle, **arrays)
    Path(path).chmod(0o600)
    with np.load(path, allow_pickle=False) as archive:
        if set(archive.files) != set(arrays) or any(archive[k].tobytes() != v.tobytes() for k, v in arrays.items()):
            raise ValueError("saved_control_archive_not_byte_exact")
    return dict(file=Path(path).name, sha256=lineage.saved.sha256(path),
        array_sha256={k: pcm_sha(v) for k, v in arrays.items()})


def raw_diagnostics(reference, baseline, shifted):
    import prepare_corpus
    import pilot_metrics
    rd, bd, sd = [prepare_corpus.diagnostics(x) for x in (reference, baseline, shifted)]
    def metrics(wave, measured, target_pitch):
        return pilot_metrics.summary(wave, reference, target_pitch, rd["periodicity"],
            measured["yin_hz"], measured["periodicity"], rd["rms_db"], measured["rms_db"])
    support = (rd["yin_hz"] > 0) & (rd["periodicity"] >= .90) & (rd["rms_db"] > -60)
    good = [(d["yin_hz"] > 0) & (d["periodicity"] >= .90) & (d["rms_db"] > -60) for d in (bd, sd)]
    shared = support & good[0] & good[1]
    cents = 1200 * np.log2(sd["yin_hz"][shared].astype(np.float64) / bd["yin_hz"][shared])
    count, total = int(shared.sum()), int(support.sum())
    return dict(baseline=metrics(baseline, bd, rd["yin_hz"]),
        shifted=metrics(shifted, sd, rd["yin_hz"] * FACTOR),
        baseline_to_shifted=dict(reference_support_frames=total, shared_confident_frames=count,
            reference_support_mask_sha256=pcm_sha(support), shared_mask_sha256=pcm_sha(shared),
            coverage_fraction_reference_support=float(count / total) if total else None,
            median_signed_shift_cents=float(np.median(cents)) if count else None,
            median_abs_error_from100c=float(np.median(np.abs(cents - CENTS))) if count else None,
            p95_abs_error_from100c=float(np.quantile(np.abs(cents - CENTS), .95)) if count else None,
            near50c_frames=int((np.abs(cents - CENTS) <= 50).sum()),
            near50c_fraction_reference_support=float((np.abs(cents - CENTS) <= 50).sum() / total) if total else None,
            candidate_dropouts_remain_in_fixed_source_denominator=True, alignment="unchanged timestamps; no warp",
            note="YIN is an estimator, not pitch truth. Target pitch is virtual; no transposed reference PCM exists."))


def validate_state(state, training, mean, scale, gate_path):
    if (state.get("format") != "private_sifigan_generator_only_v1"
            or state.get("completed_steps") != 3000 or state.get("full_resume_available") is not False
            or state.get("quality_approved") is not False
            or state.get("generator_config") != training["generator_config"]
            or state.get("data_gate_sha256") != lineage.saved.sha256(gate_path)
            or not np.array_equal(mean, np.asarray(state.get("normalizer_mean")))
            or not np.array_equal(scale, np.asarray(state.get("normalizer_scale")))):
        raise ValueError("exact_global3000_generator_gate_config_normalizer_required")
    if not isinstance(state.get("generator"), dict) or not state["generator"]:
        raise ValueError("nonempty_generator_only_numeric_state_required")


def run(parent_report, report_path, upstream, output):
    base.require_mps_environment()
    output = Path(output)
    private = PRIVATE_ROOT.resolve(strict=True)
    if (not output.is_absolute() or output.is_symlink() or output.exists()
            or output.resolve() == private or not output.resolve().is_relative_to(private)):
        raise ValueError("fresh_absolute_private_output_required")
    output.mkdir(mode=0o700)
    started, previous = time.monotonic(), os.umask(0o077)
    report = dict(schema="mini.sifigan-fixed-pitch-control.v1", status="started", phase="validation",
        **design_flags(), semitones=SEMITONES, target_cents=CENTS, factor=FACTOR,
        frames=FRAMES, samples=SAMPLES, sample_rate=RATE, hop_size=HOP,
        max_seconds=MAX_SECONDS, max_output_bytes=MAX_BYTES, max_conservative_rss_plus_MPS_bytes=8 * GIB,
        min_free_disk_bytes=12 * GIB, source_credit=lineage.saved.CREDIT,
        seed=SEED + 2, case_order=list(CASES), baseline_reproduced=False, cases=[])
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "foundation-model-trial"))
    from ace_limits import ResourceCaps, ResourceGuard
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=MAX_SECONDS, max_rss_bytes=8 * GIB)) as guard:
            ensure_capacity(output, WRITE_RESERVE)
            training, selected, bindings, checkpoints = lineage.validate_inputs(parent_report, report_path)
            if training["completed_steps"] != 3000:
                raise ValueError("fixed_completed_global3000_required")
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
            datasets = {}
            for item in selected:
                with np.load(item["corpus_npz_path"], allow_pickle=False) as archive:
                    controls = transpose_controls(archive["f0"][:FRAMES].copy(), archive["cf0"][:FRAMES].copy(),
                        archive["features"][:FRAMES].copy())
                controls["normalized_features"] = normalize_features(controls["features"], mean, scale)
                datasets[item["case"]] = controls
            for path in (Path(__file__).resolve(), Path(lineage.__file__).resolve(), Path(base.__file__).resolve(),
                    Path(lineage.saved.__file__).resolve(), Path(__file__).with_name("prepare_corpus.py"),
                    Path(__file__).with_name("pilot_metrics.py"), Path(__file__).with_name("train_corpus_pilot.py"),
                    Path(__file__).resolve().parents[1] / "foundation-model-trial/ace_limits.py"):
                bindings[str(path)] = lineage.saved.sha256(path)
            report.update(training_report_path=str(report_path), parent_report_path=str(parent_report),
                completed_steps=3000, input_bindings=bindings, upstream_bindings=official,
                checkpoints=checkpoints, data_gate=str(gate_path), initial_resources=guard.initial)
            # No public model downloads or network access, including lazy imports.
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
            checkpoint = next(v for k, v in checkpoints["extended"].items() if k == training["inference_checkpoint_file"])
            state = torch.load(checkpoint["path"], map_location="cpu", weights_only=True)
            validate_state(state, training, mean, scale, gate_path)
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
            report.update(phase="baseline_then_shift", device="MPS; official CPU_float64_excitation_then_float32_transfer",
                sine_amp=.1, noise_amp=.003, signal_types=["sine"], dense_factors=[.5, 1, 4, 8],
                remove_weight_norm=False, excitation_rng="CPU restored per case/variant; next baseline consumes only original baseline RNG")
            torch.manual_seed(SEED + 2)
            for item in selected:
                case, controls = item["case"], datasets[item["case"]]
                def render(shifted):
                    cf0 = controls["shifted_cf0" if shifted else "source_cf0"]
                    z = signal(torch.from_numpy(cf0.copy()).reshape(1, 1, -1)).float().to("mps")
                    ds, cumulative = [], 1
                    for factor, dense in zip(gc["upsample_scales"], [.5, 1, 4, 8]):
                        cumulative *= factor
                        values = np.repeat(dilated_factor(cf0.copy(), RATE, dense), cumulative).astype(np.float32)
                        ds.append(torch.from_numpy(values).reshape(1, 1, -1).to("mps"))
                    c = torch.from_numpy(controls["normalized_features"].T.copy()).unsqueeze(0).to("mps")
                    with torch.no_grad():
                        wave = generator(z, c, ds)[0].squeeze().cpu().numpy().copy()
                    return wave
                baseline, shifted, before, after = paired_inference(render,
                    lambda: torch.get_rng_state().clone(), torch.set_rng_state, item["generated"])
                arrays = dict(reference=item["reference"].copy(), baseline=baseline, shifted=shifted, **controls)
                record = save_arrays(output / (case + "_pitch_control.npz"), arrays)
                record.update(case=case, baseline_reproduced=True, baseline_byte_exact=True,
                    rng_before_sha256=pcm_sha(before.numpy()), rng_after_baseline_sha256=pcm_sha(after.numpy()),
                    source_reference_byte_exact_corpus=True,
                    raw_diagnostics=raw_diagnostics(arrays["reference"], baseline, shifted))
                report["cases"].append(record)
                print(json.dumps(dict(phase="case_complete", case=case, baseline_byte_exact=True)), flush=True)
            if any(lineage.saved.sha256(path) != digest for path, digest in bindings.items()) or base.validate_upstream(upstream) != official:
                raise ValueError("bound_original_model_code_or_upstream_changed")
            report.update(status="fixed_pitch_control_rendered_not_perceptually_approved", phase="complete",
                baseline_reproduced=True, inputs_unchanged=True, final_resources=guard.snapshot(),
                caveats=["Full constant +100c transpose, NOT a new score, composition, or learned score performance.",
                    "43ch source spectral/AP controls remain fixed and may retain original-pitch harmonic evidence.",
                    "No transposed original performance PCM exists. Source YIN is an estimator, not ground truth.",
                    "cf0 remains positive in original-unvoiced frames; no new breath/rest/voicing control is learned.",
                    "No denoising or level controller is applied in this raw inference stage."])
    except Exception as exc:
        report.update(status="pitch_control_failed_no_candidate_approval", error_type=type(exc).__name__,
            error_message=str(exc), traceback=traceback.format_exc())
        raise
    finally:
        try:
            report["elapsed_seconds"] = time.monotonic() - started
            ensure_capacity(output)
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
        cases=len(result["cases"]), quality_approved=False)))
