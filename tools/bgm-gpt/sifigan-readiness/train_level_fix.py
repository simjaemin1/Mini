#!/usr/bin/env python3
"""Bounded fit-only quiet/level fine-tuning of the preserved global1000 model.

Two declared interventions: broader source-state sampling and energy losses.
No output gate, gain envelope, pitch edit, source mixing or quality approval.
"""
import argparse
from collections import Counter, defaultdict
import json
import os
from pathlib import Path
import socket
import sys
import time
import traceback

import numpy as np
import probe_generator_mps as base
from train_real_gate import cpu_tree, tree_digest
from train_corpus_pilot import FRAMES, HOP, RATE, SEED, validate_file_splits
from resume_corpus_pilot import compare_evaluation, STATE_KEYS
import level_loss

SAMPLER_SEED = 20261026
CATEGORY_WEIGHTS = dict(voiced=.60, quiet=.20, transition=.15, aperiodic_low_support=.05)
MAX_BYTES, RESERVED_BYTES = 1_000_000_000, 800_000_000


def bytes_used(path):
    return sum(p.stat().st_size for p in Path(path).rglob("*") if p.is_file())


def verify_bindings(bindings):
    if not bindings or any(base.sha256(path) != value for path, value in bindings.items()):
        raise ValueError("bound_original_feature_code_or_checkpoint_changed")


def validate_parent(path, upstream):
    path = Path(path).resolve(strict=True)
    parent = json.loads(path.read_text())
    if (parent.get("schema") != "mini.sifigan-corpus-resume.v1"
            or parent.get("status") != "bounded_resume_complete_not_perceptually_approved"
            or parent.get("completed_steps") != 1000 or parent.get("quality_approved") is not False
            or parent.get("public_weights_used") is not False
            or parent.get("parent_final_baseline_reproduced") is not True):
        raise ValueError("bound_completed_global1000_parent_required")
    bindings = dict(parent["input_bindings"])
    verify_bindings(bindings)
    if base.validate_upstream(upstream) != parent["upstream_bindings"]:
        raise ValueError("clean_parent_official_code_required")
    checkpoint = path.parent / "final_full_resume.pt"
    if (base.sha256(checkpoint) != parent["checkpoint_sha256"]
            or checkpoint.stat().st_size != parent["checkpoint_bytes"]):
        raise ValueError("parent1000_full_checkpoint_changed")
    bindings[str(path)] = base.sha256(path)
    bindings[str(checkpoint)] = parent["checkpoint_sha256"]
    if len(parent["reconstructions"]) != 2 or {r["case"] for r in parent["reconstructions"]} != {"deepvib48", "arirang001"}:
        raise ValueError("two_unchanged_parent_clips_required")
    for row in parent["reconstructions"]:
        p = path.parent / row["file"]
        if p.parent != path.parent or base.sha256(p) != row["sha256"]:
            raise ValueError("bound_parent_reconstruction_changed")
        bindings[str(p)] = row["sha256"]
    return parent, checkpoint, bindings


def restore1000(state, generator, discriminator, opt_g, opt_d, sch_g, sch_d):
    if state.get("completed_steps") != 1000 or state.get("format") != "private_sifigan_corpus_pilot_v1":
        raise ValueError("full1000_training_state_required")
    for key, model in (("generator", generator), ("discriminator", discriminator)):
        model.load_state_dict(state[key], strict=True)
    for key, obj in (("optimizer_g", opt_g), ("optimizer_d", opt_d), ("scheduler_g", sch_g), ("scheduler_d", sch_d)):
        obj.load_state_dict(state[key])
    actual = dict(generator=generator.state_dict(), discriminator=discriminator.state_dict(),
        optimizer_g=opt_g.state_dict(), optimizer_d=opt_d.state_dict(),
        scheduler_g=sch_g.state_dict(), scheduler_d=sch_d.state_dict())
    hashes = {key: tree_digest(state[key]) for key in STATE_KEYS}
    if any(tree_digest(actual[key]) != hashes[key] for key in STATE_KEYS):
        raise ValueError("exact_numeric_parent_state_restore_required")
    for optimizer in (opt_g, opt_d):
        counters = [float(v["step"].detach().cpu()) for v in optimizer.state.values() if "step" in v]
        if not counters or set(counters) != {1000.}:
            raise ValueError("all_Adam_counters_must_equal1000")
    if sch_g.last_epoch != 1000 or sch_d.last_epoch != 1000:
        raise ValueError("scheduler_epochs_must_equal1000")
    return hashes


def sampler_groups(gate, files):
    windows = gate["fit_windows"]
    groups = defaultdict(list)
    seen = set()
    for row in windows:
        if (row["case"] not in files or files[row["case"]]["split"] != "fit" or row["split"] != "fit"
                or row.get("accepted") is not True or type(row["start_frame"]) is not int or row["start_frame"] < 0
                or row["category"] not in CATEGORY_WEIGHTS or row.get("frame_count") != FRAMES):
            raise ValueError("only_finite_eligible_fit_state_windows_for_optimizer")
        key = (row["case"], row["start_frame"])
        if key in seen:
            raise ValueError("duplicate_optimizer_window")
        seen.add(key)
        groups[(row["category"], row["case"], row["pitch_bin"], row["rms_stratum"])].append(row)
    if not {"voiced", "quiet"}.issubset({key[0] for key in groups}):
        raise ValueError("actual_voiced_and_quiet_fit_data_required")
    return {category: [groups[k] for k in sorted(groups) if k[0] == category]
            for category in CATEGORY_WEIGHTS if any(k[0] == category for k in groups)}


def sample(rng, groups):
    categories = list(groups)
    weights = np.array([CATEGORY_WEIGHTS[c] for c in categories], dtype=np.float64)
    category = categories[int(rng.choice(len(categories), p=weights / weights.sum()))]
    group = groups[category][int(rng.integers(len(groups[category])))]
    return group[int(rng.integers(len(group)))]


def run(parent_report, level_gate, upstream, output, steps=1000):
    base.require_mps_environment()
    if type(steps) is not int or not 1 <= steps <= 1000:
        raise ValueError("additional_step_limit1000")
    output = Path(output).resolve()
    if output.exists() or not output.is_relative_to((Path.home() / "Mini/_bgm/gpt").resolve()):
        raise ValueError("fresh_private_output_required")
    if bytes_used(output.parent) + RESERVED_BYTES > MAX_BYTES:
        raise ValueError("new_experiment_1GB_budget_insufficient")
    output.mkdir(mode=0o700)
    started = time.monotonic()
    report = dict(schema="mini.sifigan-level-fix.v1", status="started", phase="validate",
        parent_completed_steps=1000, completed_steps=1000, additional_completed_steps=0,
        requested_additional_steps=steps, max_seconds=1200, soft_training_stop_seconds=1050,
        max_experiment_bytes=MAX_BYTES, sampler_seed=SAMPLER_SEED, category_weights=CATEGORY_WEIGHTS,
        sampler_changed_intentionally=True, normalizer_changed=False, input_gain_changed=False,
        conditioning_or_F0_changed=False, optimizer_or_scheduler_reset=False, trace=[],
        public_weights_used=False, heldout_used_for_optimizer=False, heldout_is_blind=False,
        evaluation_role="adaptive_development_validation_not_untouched_test",
        two_interventions="source_state_sampling_and_differentiable_level_supervision_not_causal_ablation",
        level_loss=dict(windows_samples=level_loss.WINDOWS, hop=HOP, epsilon_power=level_loss.FLOOR_POWER,
            units="one_unit_is20dB_absolute_log_amplitude", level_weight=level_loss.LEVEL_WEIGHT,
            source_quiet_excess_weight=level_loss.QUIET_WEIGHT),
        output_mute_EQ_AGC_gain_envelope_source_mix=False, quality_approved=False,
        new_score_or_music=False, automatic_CPU_fallback=False,
        source_credit="국악기 음원 제공 — 국립국악원 (공공누리 제1유형)")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "foundation-model-trial"))
    from ace_limits import ResourceGuard, ResourceCaps, GIB
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=1200, max_rss_bytes=8 * GIB)) as guard:
            upstream = Path(upstream).resolve(strict=True)
            parent, cp, bindings = validate_parent(parent_report, upstream)
            gate_path = Path(level_gate).resolve(strict=True)
            gate = json.loads(gate_path.read_text())
            if gate.get("schema") != "mini.sifigan-level-windows.v1" or gate.get("status") != "complete":
                raise ValueError("completed_separate_level_window_policy_required")
            import prepare_level_windows
            verify_bindings(gate["input_bindings"])
            if gate.get("policy") != prepare_level_windows.POLICY or gate.get("normalization_changed") is not False:
                raise ValueError("bound_unchanged_source_state_policy_required")
            bindings.update(gate["input_bindings"])
            if (gate["original_gate_path"] != parent["data_gate"]
                    or gate["original_gate_sha256"] != bindings[parent["data_gate"]]):
                raise ValueError("same_parent_corpus_and_original_gate_required")
            bindings[str(gate_path)] = base.sha256(gate_path)
            old_gate = json.loads(Path(parent["data_gate"]).read_text())
            manifest = json.loads(Path(old_gate["source_manifest_path"]).read_text())
            files = validate_file_splits(gate["files"], manifest["files"])
            groups = sampler_groups(gate, files)
            datasets = {}
            for row in gate["files"]:
                if (base.sha256(row["npz_path"]) != row["npz_sha256"]
                        or base.sha256(row["source_path"]) != row["source_sha256"]):
                    raise ValueError("source_or_feature_binding_changed")
                with np.load(row["npz_path"], allow_pickle=False) as archive:
                    datasets[row["case"]] = {key: archive[key].copy() for key in archive.files}
            stats = Path(old_gate["stats_path"])
            if (base.sha256(stats) != old_gate["stats_sha256"] or gate["stats_path"] != str(stats)
                    or gate["stats_sha256"] != old_gate["stats_sha256"]):
                raise ValueError("same_original_fit_only_normalizer_required")
            with np.load(stats, allow_pickle=False) as archive:
                mean, scale = archive["mean"].copy(), archive["scale"].copy()
            for name in ("train_level_fix.py", "level_loss.py", "level_metrics.py", "prepare_level_windows.py"):
                path = Path(__file__).with_name(name).resolve()
                bindings[str(path)] = base.sha256(path)
            report.update(input_bindings=bindings, upstream_bindings=parent["upstream_bindings"],
                parent_report=str(Path(parent_report).resolve()), parent_checkpoint=str(cp),
                data_gate=str(gate_path), original_data_gate=parent["data_gate"], initial_resources=guard.initial,
                fit_category_windows={k: sum(map(len, v)) for k, v in groups.items()},
                fit_category_groups={k: len(v) for k, v in groups.items()})
            socket.create_connection = base.block_network
            socket.socket.connect = base.block_network
            socket.socket.connect_ex = base.block_network
            import torch
            import yaml
            import prepare_corpus
            import pilot_metrics
            import level_metrics
            if not torch.backends.mps.is_available():
                raise RuntimeError("MPS_required_no_fallback")
            torch.set_num_threads(4)
            sys.path.insert(0, str(upstream))
            from sifigan.models import SiFiGANGenerator, UnivNetMultiResolutionMultiPeriodDiscriminator
            from sifigan.losses import MelSpectralLoss, ResidualLoss, AdversarialLoss, FeatureMatchLoss
            from sifigan.utils.features import SignalGenerator, dilated_factor
            with torch.serialization.safe_globals([Counter]):
                state = torch.load(cp, map_location="cpu", weights_only=True)
            gc, dc = parent["generator_config"], parent["discriminator_config"]
            if (state["generator_config"] != gc or state["discriminator_config"] != dc
                    or state["data_gate_sha256"] != base.sha256(parent["data_gate"])
                    or not np.array_equal(mean, np.asarray(state["normalizer_mean"]))
                    or not np.array_equal(scale, np.asarray(state["normalizer_scale"]))):
                raise ValueError("checkpoint_configs_gate_or_normalizer_changed")
            def config(name):
                item = yaml.safe_load((upstream / "sifigan/bin/config" / name).read_text())
                item.pop("_target_", None)
                return item
            if gc != config("generator/sifigan.yaml") or dc != config("discriminator/univnet.yaml"):
                raise ValueError("full_official_architectures_required")
            tc = config("train/sifigan.yaml")
            generator = SiFiGANGenerator(**gc).to("mps").train()
            discriminator = UnivNetMultiResolutionMultiPeriodDiscriminator(**dc).to("mps").train()
            mc, rc = parent["mel_config"], parent["residual_config"]
            mel, residual = MelSpectralLoss(**mc).to("mps"), ResidualLoss(**rc).to("mps")
            ac, fc = dict(tc["adv_loss"]), dict(tc["fm_loss"])
            ac.pop("_target_"); fc.pop("_target_")
            adv, matching = AdversarialLoss(**ac), FeatureMatchLoss(**fc)
            go, do = dict(tc["generator_optimizer"]), dict(tc["discriminator_optimizer"])
            go.pop("_target_"); do.pop("_target_")
            opt_g, opt_d = torch.optim.Adam(generator.parameters(), **go), torch.optim.Adam(discriminator.parameters(), **do)
            schedule = dict(milestones=[100000, 200000, 300000, 400000], gamma=.5)
            sch_g = torch.optim.lr_scheduler.MultiStepLR(opt_g, **schedule)
            sch_d = torch.optim.lr_scheduler.MultiStepLR(opt_d, **schedule)
            report["restored_numeric_state_sha256"] = restore1000(state, generator, discriminator, opt_g, opt_d, sch_g, sch_d)
            report.update(generator_config=gc, discriminator_config=dc, mel_config=mc, residual_config=rc)
            torch.set_rng_state(state["torch_cpu_rng"]); torch.mps.set_rng_state(state["torch_mps_rng"])
            rng = np.random.default_rng(SAMPLER_SEED)  # deliberately NEW source-state policy
            signal = SignalGenerator(sample_rate=RATE, hop_size=HOP, sine_amp=.1, noise_amp=.003, signal_types=["sine"])
            def inputs(case, start, frames=FRAMES):
                source = datasets[case]
                f0, cf0 = source["f0"][start:start + frames].copy(), source["cf0"][start:start + frames].copy()
                c = ((source["features"][start:start + frames] - mean) / scale).astype(np.float32)
                y = source["waveform"][start * HOP:(start + frames) * HOP].copy()
                if (c.shape != (frames, 43) or y.shape != (frames * HOP,) or not np.isfinite(c).all()
                        or not np.isfinite(y).all() or np.any(cf0 <= 0)):
                    raise ValueError("unaltered_finite_aligned_crop_required")
                z = signal(torch.from_numpy(cf0).reshape(1, 1, -1)).float().to("mps")
                factors, cumulative = [], 1
                for factor, dense in zip(gc["upsample_scales"], [.5, 1, 4, 8]):
                    cumulative *= factor
                    d = np.repeat(dilated_factor(cf0.copy(), RATE, dense), cumulative).astype(np.float32)
                    factors.append(torch.from_numpy(d).reshape(1, 1, -1).to("mps"))
                return z, torch.from_numpy(c.T.copy()).unsqueeze(0).to("mps"), factors, \
                    torch.from_numpy(y).reshape(1, 1, -1).to("mps"), torch.from_numpy(f0).reshape(1, 1, -1).to("mps")
            def evaluate():
                cpu_rng, mps_rng = torch.get_rng_state(), torch.mps.get_rng_state()
                generator.eval(); values = defaultdict(list)
                try:
                    torch.manual_seed(SEED + 1)
                    with torch.no_grad():
                        for row in parent["evaluation_windows"]:
                            z, c, ds, y, _ = inputs(row["case"], row["start_frame"])
                            value = float(mel(generator(z, c, ds)[0], y).cpu())
                            if not np.isfinite(value):
                                raise RuntimeError("nonfinite_evaluation")
                            values[row["split"]].append(value)
                    return {k: dict(windows=len(v), mean_logmel_l1=float(np.mean(v))) for k, v in values.items()}
                finally:
                    torch.set_rng_state(cpu_rng); torch.mps.set_rng_state(mps_rng); generator.train()
            def reconstruct(label, verify=False):
                cpu_rng, mps_rng = torch.get_rng_state(), torch.mps.get_rng_state()
                generator.eval(); rows = []
                try:
                    torch.manual_seed(SEED + 2)
                    for case in ("deepvib48", "arirang001"):
                        with torch.no_grad():
                            z, c, ds, _, _ = inputs(case, 0, 960)
                            prediction = generator(z, c, ds)[0].squeeze().cpu().numpy()
                        reference = datasets[case]["waveform"][:960 * HOP]
                        if verify:
                            row = next(r for r in parent["reconstructions"] if r["case"] == case)
                            with np.load(Path(parent_report).resolve().parent / row["file"], allow_pickle=False) as saved:
                                if (reference.tobytes() != saved["reference"].tobytes()
                                        or not np.allclose(prediction, saved["generated"], rtol=1e-5, atol=1e-6)):
                                    raise ValueError("baseline_not_exact_parent1000_reconstruction")
                        rd, gd = prepare_corpus.diagnostics(reference), prepare_corpus.diagnostics(prediction)
                        p = pilot_metrics.summary(prediction, reference, rd["yin_hz"], rd["periodicity"],
                            gd["yin_hz"], gd["periodicity"], rd["rms_db"], gd["rms_db"])
                        l = level_metrics.summary(prediction, reference, rd["rms_db"], gd["rms_db"])
                        destination = output / (label + "_" + case + "_reconstruction.npz")
                        with destination.open("xb") as handle:
                            np.savez_compressed(handle, generated=prediction, reference=reference)
                        destination.chmod(0o600)
                        rows.append(dict(case=case, file=destination.name, sha256=base.sha256(destination),
                            metrics=p, level_metrics=l, perceptually_approved=False))
                    return rows
                finally:
                    torch.set_rng_state(cpu_rng); torch.mps.set_rng_state(mps_rng); generator.train()
            # Verify the original complete state and output BEFORE changed training.
            report["phase"] = "verify_parent1000"
            report["baseline"] = evaluate()
            compare_evaluation(report["baseline"], parent["final"])
            report["baseline_reconstructions"] = reconstruct("baseline", verify=True)
            report["parent_final_baseline_reproduced"] = True
            torch.set_rng_state(state["torch_cpu_rng"]); torch.mps.set_rng_state(state["torch_mps_rng"])
            del state
            # Check official residual on zero target/zero F0, not a special masked loss.
            test_source = torch.full((1, 1, FRAMES * HOP), .001, device="mps", requires_grad=True)
            synthetic = residual(test_source, torch.zeros_like(test_source), torch.zeros(1, 1, FRAMES, device="mps"))
            synthetic.backward()
            if not bool(torch.isfinite(synthetic).cpu()) or not bool(torch.isfinite(test_source.grad).all().cpu()):
                raise RuntimeError("official_residual_zero_target_F0_nonfinite")
            report["unvoiced_residual_finite_gradient_checked"] = True
            del test_source, synthetic
            counts, cases = Counter(), Counter()
            tick = time.monotonic()
            for index in range(steps):
                if time.monotonic() - started > 1050:
                    report["soft_stop_reason"] = "reserve_evaluation_checkpoint_time"; break
                row = sample(rng, groups)
                counts[row["category"]] += 1; cases[row["case"]] += 1
                z, c, ds, y, f0 = inputs(row["case"], row["start_frame"])
                opt_g.zero_grad(set_to_none=True); opt_d.zero_grad(set_to_none=True)
                prediction, excitation = generator(z, c, ds)
                ml, rl = mel(prediction, y), residual(excitation, y, f0)
                ll, ql = level_loss.losses(prediction, y)
                fake, ff = discriminator(prediction, return_fmaps=True)
                with torch.no_grad():
                    _, rf = discriminator(y, return_fmaps=True)
                fl, al = matching(ff, rf), adv(fake)
                gl = 45 * ml + rl + 2 * fl + al + level_loss.LEVEL_WEIGHT * ll + level_loss.QUIET_WEIGHT * ql
                if not bool(torch.isfinite(gl).cpu()) or len(fake) != 8:
                    raise RuntimeError("nonfinite_generator_or_missing_discriminator_heads")
                gl.backward()
                torch.nn.utils.clip_grad_norm_(generator.parameters(), 10, error_if_nonfinite=True)
                opt_g.step(); sch_g.step()
                del prediction, excitation, ff, rf, fake, gl
                opt_d.zero_grad(set_to_none=True)
                with torch.no_grad():
                    prediction = generator(z, c, ds)[0]
                dl = sum(adv(discriminator(prediction.detach()), discriminator(y)))
                if not bool(torch.isfinite(dl).cpu()):
                    raise RuntimeError("nonfinite_discriminator_loss")
                dl.backward()
                torch.nn.utils.clip_grad_norm_(discriminator.parameters(), 10, error_if_nonfinite=True)
                opt_d.step(); sch_d.step()
                report.update(phase="training", completed_steps=1001 + index, additional_completed_steps=index + 1)
                if index == 0 or (index + 1) % 25 == 0 or index + 1 == steps:
                    torch.mps.synchronize()
                    item = dict(step=1001 + index, category=row["category"], elapsed_training_seconds=time.monotonic() - tick,
                        mel=float(ml.detach().cpu()), residual=float(rl.detach().cpu()), level=float(ll.detach().cpu()),
                        quiet_excess=float(ql.detach().cpu()), weighted_level=float((level_loss.LEVEL_WEIGHT * ll).detach().cpu()),
                        weighted_quiet_excess=float((level_loss.QUIET_WEIGHT * ql).detach().cpu()),
                        fm=float(fl.detach().cpu()), adv=float(al.detach().cpu()), D=float(dl.detach().cpu()))
                    report["trace"].append(item); print(json.dumps(item), flush=True)
            if not report["additional_completed_steps"]:
                raise RuntimeError("no_fine_tuning_completed")
            report.update(sampled_categories=dict(counts), sampled_cases=dict(cases))
            report["phase"] = "evaluate_and_save"
            report["final"] = evaluate()
            report["reconstructions"] = reconstruct("final")
            completed = report["completed_steps"]
            state = dict(generator=generator.state_dict(), discriminator=discriminator.state_dict(),
                optimizer_g=opt_g.state_dict(), optimizer_d=opt_d.state_dict(), scheduler_g=sch_g.state_dict(), scheduler_d=sch_d.state_dict(),
                completed_steps=completed, torch_cpu_rng=torch.get_rng_state(), torch_mps_rng=torch.mps.get_rng_state(),
                numpy_sampler_rng=rng.bit_generator.state, sampler_seed=SAMPLER_SEED, category_weights=CATEGORY_WEIGHTS,
                generator_config=gc, discriminator_config=dc, original_data_gate_sha256=base.sha256(parent["data_gate"]),
                data_gate_sha256=base.sha256(gate_path), normalizer_mean=mean.tolist(), normalizer_scale=scale.tolist(),
                level_loss_config=report["level_loss"], format="private_sifigan_level_fix_v1")
            destination = output / "final_full_resume.pt"
            with destination.open("xb") as handle:
                torch.save(cpu_tree(state), handle)
            destination.chmod(0o600)
            report.update(checkpoint_sha256=base.sha256(destination), checkpoint_bytes=destination.stat().st_size)
            del state
            destination = output / "final_generator.pt"
            with destination.open("xb") as handle:
                torch.save(dict(generator=cpu_tree(generator.state_dict()), generator_config=gc,
                    completed_steps=completed, normalizer_mean=mean.tolist(), normalizer_scale=scale.tolist(),
                    data_gate_sha256=base.sha256(gate_path), source_credit=report["source_credit"], quality_approved=False), handle)
            destination.chmod(0o600)
            report.update(inference_checkpoint_sha256=base.sha256(destination), inference_checkpoint_bytes=destination.stat().st_size)
            verify_bindings(bindings)
            if base.validate_upstream(upstream) != parent["upstream_bindings"]:
                raise ValueError("official_upstream_changed")
            report.update(status="bounded_level_fix_complete_not_perceptually_approved", phase="complete",
                final_resources=guard.snapshot(), final_experiment_bytes_before_report=bytes_used(output.parent))
            if report["final_experiment_bytes_before_report"] > MAX_BYTES:
                raise RuntimeError("announced_1GB_new_storage_exceeded")
    except Exception as error:
        report.update(status="failed", error_type=type(error).__name__, error_message=str(error), traceback=traceback.format_exc())
        raise
    finally:
        report["elapsed_seconds"] = time.monotonic() - started
        base.write_report(output / "report.json", report)
        if bytes_used(output.parent) > MAX_BYTES:
            raise RuntimeError("1GB_storage_exceeded_after_report")


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent-report", type=Path, required=True)
    parser.add_argument("--level-gate", type=Path, required=True)
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--steps", type=int, default=1000)
    args = parser.parse_args()
    run(args.parent_report, args.level_gate, args.upstream, args.output, args.steps)
