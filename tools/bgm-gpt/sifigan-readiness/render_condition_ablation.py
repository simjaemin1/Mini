#!/usr/bin/env python3
"""Same Arirang F0/time/noise/model: actual43 versus repeated clean43 input.

No authored score, pitch change, gate, output processing or new training.
Historical deep and Arirang baselines must both reproduce byte-exactly.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import sys
import time
import traceback

import numpy as np
import render_pitch_control as prior

lineage, base = prior.lineage, prior.base
FRAMES, SAMPLES, RATE, HOP = 960, 115200, 24000, 120
PRIVATE_ROOT = prior.PRIVATE_ROOT
GIB, MAX_BYTES = 1024 ** 3, 20_000_000


def build_controls(f0, cf0, actual_features, deep_features, mean, scale):
    for value, name in ((f0, "f0"), (cf0, "cf0")):
        if value.dtype != np.float32 or value.ndim != 1 or len(value) < FRAMES or not np.isfinite(value).all():
            raise ValueError("finite_float32_source_pitch_required:" + name)
    for value, minimum, name in ((actual_features, FRAMES, "actual"), (deep_features, 1200, "clean_template")):
        if value.dtype != np.float32 or value.ndim != 2 or value.shape[1] != 43 or len(value) < minimum or not np.isfinite(value).all():
            raise ValueError("finite_full43_feature_source_required:" + name)
    if np.any(f0[:FRAMES] < 0) or not np.any(f0[:FRAMES] > 0) or np.any((cf0[:FRAMES] < 70) | (cf0[:FRAMES] > 1800)):
        raise ValueError("unaltered_positive_continuous_source_pitch_required")
    indices = 240 + ((np.arange(FRAMES, dtype=np.int64) + 16) % 960)
    actual, template = actual_features[:FRAMES].copy(), deep_features[indices].copy()
    return dict(f0=f0[:FRAMES].copy(), cf0=cf0[:FRAMES].copy(), actual_features=actual, template_features=template,
        normalized_actual=prior.normalize_features(actual, mean, scale),
        normalized_template=prior.normalize_features(template, mean, scale), template_index_map=indices)


def inference(render, get_rng, set_rng, saved_deep, saved_arirang):
    deep_before = get_rng()
    deep = render("deep_baseline")
    deep_after = get_rng()
    prior.require_baseline(deep, saved_deep)
    observed = {}
    def pair(repeated):
        observed["repeated_before" if repeated else "actual_before"] = get_rng()
        return render("repeated_features" if repeated else "actual_features")
    actual, repeated, before, after = prior.paired_inference(pair, get_rng, set_rng, saved_arirang)
    return dict(deep_baseline=deep, raw_actual_features=actual, raw_repeated_features=repeated), dict(
        deep_before=deep_before, deep_after=deep_after, arirang_before=before, arirang_after=after, **observed)


def capacity(output, reserve=0):
    whole = sum(path.stat().st_size for path in Path(output).parent.rglob("*") if path.is_file())
    if whole + reserve > MAX_BYTES or shutil.disk_usage(output).free < 12 * GIB + reserve:
        raise RuntimeError("whole_experiment20MB_or12GiB_disk_reserve_exceeded")
    return whole


def save_archive(path, arrays):
    if any(not isinstance(value, np.ndarray) or not np.isfinite(value).all() for value in arrays.values()):
        raise ValueError("finite_numeric_archive_required")
    capacity(Path(path).parent, sum(value.nbytes for value in arrays.values()) + 500_000)
    with Path(path).open("xb") as handle:
        np.savez_compressed(handle, **arrays)
    Path(path).chmod(0o600)
    with np.load(path, allow_pickle=False) as archive:
        if set(archive.files) != set(arrays) or any(archive[key].tobytes() != value.tobytes() for key, value in arrays.items()):
            raise ValueError("saved_archive_not_byte_exact")
    return dict(file=Path(path).name, sha256=lineage.saved.sha256(path), array_sha256={k: prior.pcm_sha(v) for k, v in arrays.items()})


def design_flags():
    return dict(training=False, optimizer_steps=0, weights_written=False, public_weights_used=False,
        source_F0_cf0_unchanged=True, source_timestamps_unchanged=True, normalizer_unchanged=True,
        model_weights_unchanged=True, source_PCM_mixed_into_output=False, authored_score=False,
        new_score_or_music=False, output_processing=False, gate=False, hard_mute=False,
        EQ=False, denoising=False, waveform_pitch_shift=False, automatic_CPU_fallback=False,
        quality_approved=False, perceptually_approved=False, hidden_wrap_frame_exclusion=False)


def run(parent_report, training_path, upstream, output):
    base.require_mps_environment()
    output, root = Path(output), PRIVATE_ROOT.resolve(strict=True)
    if (not output.is_absolute() or output.is_symlink() or output.exists() or output.resolve() == root
            or not output.resolve().is_relative_to(root) or output.parent.resolve() == root):
        raise ValueError("fresh_private_experiment_child_required")
    output.mkdir(mode=0o700)
    previous, started = os.umask(0o077), time.monotonic()
    report = dict(schema="mini.sifigan-conditioning-ablation.v1", status="started", phase="validate", **design_flags(),
        sample_rate=RATE, hop_size=HOP, frames=FRAMES, samples=SAMPLES, duration_seconds=4.8, completed_steps=3000,
        model_loaded_or_run=False, baseline_deep_byte_exact=False, baseline_arirang_byte_exact=False,
        seed=prior.SEED + 2, case_order=["deepvib48", "arirang001_actual", "arirang001_repeated"],
        template_source_case="deepvib48", template_source_frames=[240, 1200], template_phase_offset_frames=16,
        template_wrap_frame=944, template_wrap_seconds=4.72, template_wrap_is_not_proven_artifact_free=True,
        max_seconds=300, max_whole_experiment_bytes=MAX_BYTES, max_conservative_rss_plus_MPS_bytes=8 * GIB,
        min_free_disk_bytes=12 * GIB)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "foundation-model-trial"))
    from ace_limits import ResourceCaps, ResourceGuard
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=300, max_rss_bytes=8 * GIB)) as guard:
            capacity(output, 8_000_000)
            training, sources, bindings, checkpoints = lineage.validate_inputs(parent_report, training_path)
            if training["completed_steps"] != 3000 or [r["case"] for r in sources] != ["deepvib48", "arirang001"]:
                raise ValueError("fixed_global3000_deep_then_arirang_source_order_required")
            deep, arirang = sources
            upstream = Path(upstream).resolve(strict=True)
            official = base.validate_upstream(upstream)
            if len(official) != 56 or official != training["upstream_bindings"]:
                raise ValueError("same_clean_pinned56_file_official_upstream_required")
            gate_path = Path(training["data_gate"])
            gate = json.loads(gate_path.read_text())
            stats_path = lineage.saved.local_child(gate_path.parent, gate.get("stats_file", "stats.npz"))
            lineage.saved.bound(stats_path, gate["stats_sha256"], bindings)
            with np.load(stats_path, allow_pickle=False) as archive:
                mean, scale = archive["mean"].copy(), archive["scale"].copy()
            with np.load(deep["corpus_npz_path"], allow_pickle=False) as archive:
                deep_cf0, deep_features = archive["cf0"].copy(), archive["features"].copy()
            with np.load(arirang["corpus_npz_path"], allow_pickle=False) as archive:
                arrays = build_controls(archive["f0"].copy(), archive["cf0"].copy(), archive["features"].copy(), deep_features, mean, scale)
            baseline_features = prior.normalize_features(deep_features[:FRAMES], mean, scale)
            for path in (Path(__file__).resolve(), Path(prior.__file__).resolve(), Path(lineage.__file__).resolve(),
                    Path(lineage.saved.__file__).resolve(), Path(base.__file__).resolve(),
                    Path(__file__).resolve().parents[1] / "foundation-model-trial/ace_limits.py"):
                bindings[str(path)] = lineage.saved.sha256(path)
            report.update(parent_report_path=str(parent_report), training_report_path=str(training_path),
                input_bindings=bindings, upstream_bindings=official, checkpoints=checkpoints, data_gate=str(gate_path),
                corpus_paths={r["case"]: r["corpus_npz_path"] for r in sources}, source_credit=lineage.saved.CREDIT,
                source_cf0_range_hz=[float(arrays["cf0"].min()), float(arrays["cf0"].max())],
                template_cf0_range_hz=[float(deep_cf0[240:1200].min()), float(deep_cf0[240:1200].max())],
                initial_resources=guard.initial)
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
            if any(p.device.type != "mps" for p in generator.parameters()):
                raise RuntimeError("all_generator_parameters_must_be_on_MPS")
            report.update(model_loaded_or_run=True, phase="deep_baseline_then_arirang_A_B")
            signal = SignalGenerator(sample_rate=RATE, hop_size=HOP, sine_amp=.1, noise_amp=.003, signal_types=["sine"])
            def render(case):
                if case == "deep_baseline":
                    pitch, cond = deep_cf0[:FRAMES], baseline_features
                else:
                    pitch = arrays["cf0"]
                    cond = arrays["normalized_template" if case == "repeated_features" else "normalized_actual"]
                z = signal(torch.from_numpy(pitch.copy()).reshape(1, 1, -1)).float().to("mps")
                ds, cumulative = [], 1
                for factor, dense in zip(gc["upsample_scales"], [.5, 1, 4, 8]):
                    cumulative *= factor
                    values = np.repeat(dilated_factor(pitch.copy(), RATE, dense), cumulative).astype(np.float32)
                    ds.append(torch.from_numpy(values).reshape(1, 1, -1).to("mps"))
                c = torch.from_numpy(cond.T.copy()).unsqueeze(0).to("mps")
                with torch.no_grad():
                    return generator(z, c, ds)[0].squeeze().cpu().numpy().copy()
            torch.manual_seed(prior.SEED + 2)
            waves, states = inference(render, lambda: torch.get_rng_state().clone(), torch.set_rng_state, deep["generated"], arirang["generated"])
            state_hashes = {key: prior.pcm_sha(value.numpy()) for key, value in states.items()}
            if state_hashes["arirang_before"] != state_hashes["repeated_before"] or state_hashes["deep_after"] != state_hashes["arirang_before"]:
                raise ValueError("historical_baseline_stream_or_same_arirang_noise_not_preserved")
            arrays.update(waves, reference_arirang=arirang["reference"].copy(), deep_reference=deep["reference"].copy())
            archive = save_archive(output / "controls_and_raw.npz", arrays)
            if any(lineage.saved.sha256(path) != digest for path, digest in bindings.items()) or base.validate_upstream(upstream) != official:
                raise ValueError("bound_original_model_data_or_code_changed")
            report.update(status="conditioning_ablation_raw_ready_not_perceptually_approved", phase="complete", forward_calls=3,
                baseline_deep_byte_exact=True, baseline_arirang_byte_exact=True, archive=archive,
                rng_sha256=state_hashes, same_arirang_noise_verified=True, inputs_unchanged=True,
                sine_amp=.1, noise_amp=.003, signal_types=["sine"], dense_factors=[.5, 1, 4, 8], remove_weight_norm=False,
                device="MPS; official CPU_float64_excitation_then_float32_transfer", final_resources=guard.snapshot(),
                caveats=["Only43 mcep/BAP conditioning channels change in Arirang A/B; F0/cf0, timestamps, model and excitation RNG remain fixed.",
                    "B borrows a source timbre loop; this is not an authored score, new model training, or perceptual approval.",
                    "Arirang pitch spans a wider register than the prior authored-melody trial; this feature counterfactual is not a direct reproduction of that trial's failure.",
                    "Template wraps at4.72s; no frames around the wrap are silently excluded from evaluation.",
                    "Raw output has no reference-level controller, gate, hard mute, EQ, denoiser, waveform pitch edit or source PCM mixture."])
    except Exception as exc:
        report.update(status="conditioning_ablation_failed_no_candidate_approval", error_type=type(exc).__name__, error_message=str(exc), traceback=traceback.format_exc())
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
    parser.add_argument("--parent-report", type=Path, required=True)
    parser.add_argument("--training-report", type=Path, required=True)
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = run(args.parent_report, args.training_report, args.upstream, args.output)
    print(json.dumps(dict(status=result["status"], forward_calls=result["forward_calls"], quality_approved=False)))
