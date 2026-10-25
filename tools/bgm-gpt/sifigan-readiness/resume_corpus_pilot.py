#!/usr/bin/env python3
"""Strict bounded continuation of the fixed 500-step SiFi-GAN pilot.

Evaluation has informed this continuation: it is development validation, not
an untouched test. No optimizer input, normalization, gain, AP, or loss changes.
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
from train_corpus_pilot import FRAMES, HOP, RATE, SEED, select_groups, validate_file_splits

RULE = "At positive completed_steps divisible by group count, draw next permutation before next group"
STATE_KEYS = ("generator", "discriminator", "optimizer_g", "optimizer_d", "scheduler_g", "scheduler_d")
MAX_EXPERIMENT_BYTES, RESERVED_CONTINUATION_BYTES = 2_000_000_000, 930_000_000


def experiment_bytes(root):
    return sum(path.stat().st_size for path in Path(root).rglob("*") if path.is_file())


def check_disk_budget(root, output):
    if not Path(output).resolve().is_relative_to(Path(root).resolve()):
        raise ValueError("continuation_output_must_stay_in_parent_experiment")
    existing = experiment_bytes(root)
    if existing + RESERVED_CONTINUATION_BYTES > MAX_EXPERIMENT_BYTES:
        raise ValueError("cumulative2GB_disk_budget_insufficient_for930MB_reserve")
    return existing


def validate_parent(parent_path, upstream):
    parent_path = Path(parent_path).resolve(strict=True)
    parent = json.loads(parent_path.read_text())
    if (parent.get("schema") != "mini.sifigan-corpus-pilot.v1"
            or parent.get("status") != "bounded_pilot_complete_not_perceptually_approved"
            or parent.get("completed_steps") != 500 or parent.get("seed") != SEED
            or parent.get("fit_groups") != 27 or parent.get("batch_size") != 1
            or parent.get("frames") != FRAMES or parent.get("public_weights_used") is not False):
        raise ValueError("exact_completed500_step_parent_required")
    bindings = dict(parent["input_bindings"])
    if len(bindings) != 35 or len(parent["upstream_bindings"]) != 56:
        raise ValueError("all35_inputs_and56_upstream_bindings_required")
    if any(base.sha256(path) != checksum for path, checksum in bindings.items()):
        raise ValueError("parent_bound_input_changed")
    if base.validate_upstream(upstream) != parent["upstream_bindings"]:
        raise ValueError("parent_pinned_clean_upstream_changed")
    checkpoint = parent_path.parent / "final_full_resume.pt"
    if (base.sha256(checkpoint) != parent["checkpoint_sha256"]
            or checkpoint.stat().st_size != parent["checkpoint_bytes"]):
        raise ValueError("parent_full_checkpoint_changed")
    bindings[str(parent_path)] = base.sha256(parent_path)
    bindings[str(checkpoint)] = parent["checkpoint_sha256"]
    for row in parent["reconstructions"]:
        path = parent_path.parent / row["file"]
        if base.sha256(path) != row["sha256"]:
            raise ValueError("parent_final_reconstruction_changed")
        bindings[str(path)] = row["sha256"]
    if len(parent["reconstructions"]) != 2 or {r["case"] for r in parent["reconstructions"]} != {"deepvib48", "arirang001"}:
        raise ValueError("two_fixed_parent_reconstructions_required")
    if float(parent["elapsed_seconds"]) + 720 > 1200:
        raise ValueError("cumulative1200_second_budget_would_be_exceeded")
    bindings[str(Path(__file__).resolve())] = base.sha256(__file__)
    return parent, checkpoint, bindings


def validate_sampler(state, groups):
    count, completed = len(groups), state["completed_steps"]
    expected = [[g[0]["case"], g[0]["pitch_bin"]] for g in groups]
    order = state["sampler_group_order"]
    if (completed != 500 or count != 27 or state["sampler_group_keys"] != expected
            or sorted(order) != list(range(count)) or any(type(i) is not int for i in order)
            or state["sampler_next_group_position"] != completed % count
            or state["sampler_cycle_boundary_rule"] != RULE
            or state["numpy_sampler_rng"].get("bit_generator") != "PCG64"):
        raise ValueError("exact_saved27_group_order_cursor_and_PCG64_required")
    return np.asarray(order, dtype=np.int64)


def next_sample(rng, groups, order, absolute_index):
    if absolute_index > 0 and absolute_index % len(groups) == 0:
        order = rng.permutation(len(groups))
    group = groups[int(order[absolute_index % len(groups)])]
    return group[int(rng.integers(len(group)))], order


def compare_evaluation(actual, expected):
    if set(actual) != set(expected):
        raise ValueError("resume_evaluation_split_mismatch")
    for split, row in expected.items():
        if (actual[split]["windows"] != row["windows"]
                or not np.isclose(actual[split]["mean_logmel_l1"], row["mean_logmel_l1"], rtol=1e-5, atol=1e-6)):
            raise ValueError("resumed_baseline_not_parent_final:" + split)


def strict_restore(state, generator, discriminator, opt_g, opt_d, sch_g, sch_d):
    for key, module in (("generator", generator), ("discriminator", discriminator)):
        module.load_state_dict(state[key], strict=True)
    for key, instance in (("optimizer_g", opt_g), ("optimizer_d", opt_d),
                          ("scheduler_g", sch_g), ("scheduler_d", sch_d)):
        instance.load_state_dict(state[key])
    restored = dict(generator=generator.state_dict(), discriminator=discriminator.state_dict(),
        optimizer_g=opt_g.state_dict(), optimizer_d=opt_d.state_dict(),
        scheduler_g=sch_g.state_dict(), scheduler_d=sch_d.state_dict())
    hashes = {}
    for key in STATE_KEYS:
        hashes[key] = tree_digest(state[key])
        if tree_digest(restored[key]) != hashes[key]:
            raise ValueError("numeric_typed_state_restore_mismatch:" + key)
    for optimizer in (opt_g, opt_d):
        counters = [float(value["step"].detach().cpu()) for value in optimizer.state.values() if "step" in value]
        if not counters or set(counters) != {500.}:
            raise ValueError("every_restored_Adam_counter_must_equal500")
    if sch_g.last_epoch != 500 or sch_d.last_epoch != 500:
        raise ValueError("restored_scheduler_epoch_must_equal500")
    return hashes


def run(parent_report, upstream, output, additional_steps=500):
    base.require_mps_environment()
    if type(additional_steps) is not int or not 1 <= additional_steps <= 500:
        raise ValueError("additional_step_ceiling500")
    output = Path(output).resolve()
    if output.exists():
        raise ValueError("fresh_private_output_required")
    output.mkdir(mode=0o700)
    started = time.monotonic()
    experiment_root = Path(parent_report).resolve().parent.parent
    report = dict(schema="mini.sifigan-corpus-resume.v1", status="started", phase="validate_parent",
        seed=SEED, completed_steps=500, additional_completed_steps=0, requested_additional_steps=additional_steps,
        max_seconds=720, soft_training_stop_seconds=570, cumulative_max_seconds=1200, trace=[],
        heldout_is_blind=False, evaluation_role="development_validation_informed_continuation_not_untouched_test",
        heldout_used_for_optimizer=False, hyperparameters_changed=False, public_weights_used=False,
        quality_approved=False, training_convergence_established=False, new_score_or_music=False,
        automatic_CPU_fallback=False, source_credit="국악기 음원 제공 — 국립국악원 (공공누리 제1유형)")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "foundation-model-trial"))
    from ace_limits import GIB, ResourceCaps, ResourceGuard
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=720, max_rss_bytes=8 * GIB)) as guard:
            upstream = Path(upstream).resolve(strict=True)
            parent, checkpoint, bindings = validate_parent(parent_report, upstream)
            report.update(initial_experiment_bytes=check_disk_budget(experiment_root, output),
                reserved_continuation_bytes=RESERVED_CONTINUATION_BYTES, cumulative_max_disk_bytes=MAX_EXPERIMENT_BYTES)
            gate_path = Path(parent["data_gate"])
            gate = json.loads(gate_path.read_text())
            if (gate.get("schema") != "mini.sifigan-window-gate.v1" or gate.get("status") != "complete"
                    or gate.get("training_eligible") is not True
                    or base.sha256(gate_path) != bindings[str(gate_path)]):
                raise ValueError("same_complete_eligible_gate_required")
            original = json.loads(Path(gate["source_manifest_path"]).read_text())
            files = validate_file_splits(gate["files"], original["files"])
            groups = select_groups(gate["windows"], files)
            datasets = {}
            for row in gate["files"]:
                with np.load(row["npz_path"], allow_pickle=False) as archive:
                    datasets[row["case"]] = {key: archive[key].copy() for key in archive.files}
            stats_path = gate_path.parent / gate.get("stats_file", "stats.npz")
            if base.sha256(stats_path) != gate["stats_sha256"]:
                raise ValueError("bound_fit_only_stats_changed")
            with np.load(stats_path, allow_pickle=False) as archive:
                mean, scale = archive["mean"].copy(), archive["scale"].copy()
            report.update(input_bindings=bindings, upstream_bindings=parent["upstream_bindings"],
                parent_report=str(Path(parent_report).resolve()), parent_checkpoint=str(checkpoint),
                parent_completed_steps=500, parent_elapsed_seconds=parent["elapsed_seconds"],
                data_gate=str(gate_path), evaluation_windows=parent["evaluation_windows"], initial_resources=guard.initial)
            socket.create_connection = base.block_network
            socket.socket.connect = base.block_network
            socket.socket.connect_ex = base.block_network
            import torch
            import yaml
            import prepare_corpus
            import pilot_metrics
            if not torch.backends.mps.is_available():
                raise RuntimeError("MPS_required_no_CPU_fallback")
            torch.set_num_threads(4)
            sys.path.insert(0, str(upstream))
            from sifigan.models import SiFiGANGenerator, UnivNetMultiResolutionMultiPeriodDiscriminator
            from sifigan.losses import MelSpectralLoss, ResidualLoss, AdversarialLoss, FeatureMatchLoss
            from sifigan.utils.features import SignalGenerator, dilated_factor
            with torch.serialization.safe_globals([Counter]):
                state = torch.load(checkpoint, map_location="cpu", weights_only=True)
            if state.get("format") != "private_sifigan_corpus_pilot_v1":
                raise ValueError("same_full_training_checkpoint_format_required")
            gc, dc = parent["generator_config"], parent["discriminator_config"]
            if (state["generator_config"] != gc or state["discriminator_config"] != dc
                    or state["data_gate_sha256"] != base.sha256(gate_path)):
                raise ValueError("checkpoint_model_or_exact_window_gate_mismatch")
            if (not np.array_equal(mean, np.asarray(state["normalizer_mean"]))
                    or not np.array_equal(scale, np.asarray(state["normalizer_scale"]))):
                raise ValueError("checkpoint_and_accepted_fit_normalizer_not_exact")
            order = validate_sampler(state, groups)
            def config(name):
                item = yaml.safe_load((upstream / "sifigan/bin/config" / name).read_text())
                item.pop("_target_", None)
                return item
            if gc != config("generator/sifigan.yaml") or dc != config("discriminator/univnet.yaml"):
                raise ValueError("parent_model_configuration_not_official")
            tc = config("train/sifigan.yaml")
            mc, rc = dict(tc["mel_loss"]), dict(tc["reg_loss"])
            mc.pop("_target_"); rc.pop("_target_"); rc.update(f0_floor=70, f0_ceil=1800)
            if mc != parent["mel_config"] or rc != parent["residual_config"]:
                raise ValueError("unchanged_parent_loss_configuration_required")
            generator = SiFiGANGenerator(**gc).to("mps").train()
            discriminator = UnivNetMultiResolutionMultiPeriodDiscriminator(**dc).to("mps").train()
            mel, residual = MelSpectralLoss(**mc).to("mps"), ResidualLoss(**rc).to("mps")
            ac, fc = dict(tc["adv_loss"]), dict(tc["fm_loss"])
            ac.pop("_target_"); fc.pop("_target_")
            adv, matching = AdversarialLoss(**ac), FeatureMatchLoss(**fc)
            go, do = dict(tc["generator_optimizer"]), dict(tc["discriminator_optimizer"])
            go.pop("_target_"); do.pop("_target_")
            opt_g, opt_d = torch.optim.Adam(generator.parameters(), **go), torch.optim.Adam(discriminator.parameters(), **do)
            schedule = dict(milestones=[100000, 200000, 300000, 400000], gamma=.5)
            sch_g, sch_d = torch.optim.lr_scheduler.MultiStepLR(opt_g, **schedule), torch.optim.lr_scheduler.MultiStepLR(opt_d, **schedule)
            report["restored_numeric_state_sha256"] = strict_restore(state, generator, discriminator, opt_g, opt_d, sch_g, sch_d)
            report.update(generator_config=gc, discriminator_config=dc, mel_config=mc, residual_config=rc,
                fit_groups=len(groups), fit_windows=sum(map(len, groups)), restored_sampler_next_position=500 % len(groups),
                device="MPS_G_D_all_losses; CPU_float64_excitation_then_float32_transfer")
            rng = np.random.default_rng()
            def restore_rng():
                rng.bit_generator.state = state["numpy_sampler_rng"]
                torch.set_rng_state(state["torch_cpu_rng"])
                torch.mps.set_rng_state(state["torch_mps_rng"])
            restore_rng()
            signal = SignalGenerator(sample_rate=RATE, hop_size=HOP, sine_amp=.1, noise_amp=.003, signal_types=["sine"])
            def inputs(case, start, frames=FRAMES):
                source = datasets[case]
                f0, cf0 = source["f0"][start:start + frames].copy(), source["cf0"][start:start + frames].copy()
                c = ((source["features"][start:start + frames] - mean) / scale).astype(np.float32)
                y = source["waveform"][start * HOP:(start + frames) * HOP].copy()
                if c.shape != (frames, 43) or y.shape != (frames * HOP,) or not np.isfinite(c).all():
                    raise ValueError("aligned_finite_corpus_crop_required")
                z = signal(torch.from_numpy(cf0).reshape(1, 1, -1)).float().to("mps")
                ds, cumulative = [], 1
                for factor, dense in zip(gc["upsample_scales"], [.5, 1, 4, 8]):
                    cumulative *= factor
                    d = np.repeat(dilated_factor(cf0.copy(), RATE, dense), cumulative).astype(np.float32)
                    ds.append(torch.from_numpy(d).reshape(1, 1, -1).to("mps"))
                return z, torch.from_numpy(c.T.copy()).unsqueeze(0).to("mps"), ds, \
                    torch.from_numpy(y).reshape(1, 1, -1).to("mps"), torch.from_numpy(f0).reshape(1, 1, -1).to("mps")
            evaluation = parent["evaluation_windows"]
            if Counter(row["split"] for row in evaluation) != {"fit": 27, "heldout": 15}:
                raise ValueError("same27fit15heldout_evaluation_windows_required")
            for row in evaluation:
                if row["split"] != files[row["case"]]["split"]:
                    raise ValueError("evaluation_window_split_changed")
            def evaluate():
                cpu_rng, mps_rng = torch.get_rng_state(), torch.mps.get_rng_state()
                generator.eval()
                values = defaultdict(list)
                try:
                    torch.manual_seed(SEED + 1)
                    with torch.no_grad():
                        for row in evaluation:
                            z, c, ds, y, _ = inputs(row["case"], row["start_frame"])
                            loss = float(mel(generator(z, c, ds)[0], y).cpu())
                            if not np.isfinite(loss):
                                raise RuntimeError("nonfinite_fixed_evaluation")
                            values[row["split"]].append(loss)
                    return {key: dict(windows=len(items), mean_logmel_l1=float(np.mean(items))) for key, items in values.items()}
                finally:
                    torch.set_rng_state(cpu_rng); torch.mps.set_rng_state(mps_rng)
                    generator.train()
            def reconstruct(label, verify_parent=False):
                cpu_rng, mps_rng = torch.get_rng_state(), torch.mps.get_rng_state()
                generator.eval()
                rows = []
                try:
                    torch.manual_seed(SEED + 2)
                    for case in ("deepvib48", "arirang001"):
                        with torch.no_grad():
                            z, c, ds, _, _ = inputs(case, 0, 960)
                            generated = generator(z, c, ds)[0].squeeze().cpu().numpy()
                        reference = datasets[case]["waveform"][:960 * HOP]
                        if not np.isfinite(generated).all():
                            raise RuntimeError("nonfinite_reconstruction")
                        if verify_parent:
                            item = next(row for row in parent["reconstructions"] if row["case"] == case)
                            with np.load(Path(parent_report).resolve().parent / item["file"], allow_pickle=False) as archive:
                                if (not np.array_equal(reference, archive["reference"])
                                        or not np.allclose(generated, archive["generated"], rtol=1e-5, atol=1e-6)):
                                    raise ValueError("restored_full_clip_not_parent_final:" + case)
                        rd, gd = prepare_corpus.diagnostics(reference), prepare_corpus.diagnostics(generated)
                        metrics = pilot_metrics.summary(generated, reference, rd["yin_hz"], rd["periodicity"],
                            gd["yin_hz"], gd["periodicity"], rd["rms_db"], gd["rms_db"])
                        archive_path = output / (label + "_" + case + "_reconstruction.npz")
                        with archive_path.open("xb") as handle:
                            np.savez_compressed(handle, generated=generated, reference=reference)
                        archive_path.chmod(0o600)
                        rows.append(dict(case=case, file=archive_path.name, sha256=base.sha256(archive_path),
                            metrics=metrics, perceptually_approved=False))
                    return rows
                finally:
                    torch.set_rng_state(cpu_rng); torch.mps.set_rng_state(mps_rng)
                    generator.train()
            report["phase"] = "verify_parent_final_baseline"
            report["baseline"] = evaluate()
            compare_evaluation(report["baseline"], parent["final"])
            report["baseline_reconstructions"] = reconstruct("baseline", verify_parent=True)
            report["parent_final_baseline_reproduced"] = True
            # Validation evaluations restore their own Torch RNG; explicitly restore all three
            # original streams once more before the first continuation sample/optimizer input.
            restore_rng()
            del state
            counts, pitch_counts = defaultdict(int), defaultdict(int)
            tick = time.monotonic()
            for index in range(500, 500 + additional_steps):
                if time.monotonic() - started > 570:
                    report["soft_stop_reason"] = "save_and_final_evaluation_time_reserve"
                    break
                row, order = next_sample(rng, groups, order, index)
                if files[row["case"]]["split"] != "fit" or row.get("accepted") is not True:
                    raise RuntimeError("optimizer_may_only_use_accepted_fit_windows")
                counts[row["case"]] += 1; pitch_counts[row["pitch_bin"]] += 1
                report["phase"] = "training"
                z, c, ds, y, f0 = inputs(row["case"], row["start_frame"])
                opt_g.zero_grad(set_to_none=True); opt_d.zero_grad(set_to_none=True)
                predicted, excitation = generator(z, c, ds)
                ml, rl = mel(predicted, y), residual(excitation, y, f0)
                fake, ff = discriminator(predicted, return_fmaps=True)
                with torch.no_grad():
                    real, rf = discriminator(y, return_fmaps=True)
                fl, al = matching(ff, rf), adv(fake)
                if len(fake) != 8:
                    raise RuntimeError("eight_full_discriminator_heads_required")
                gl = 45 * ml + rl + 2 * fl + al
                if not bool(torch.isfinite(gl).cpu()):
                    raise RuntimeError("nonfinite_generator_loss")
                gl.backward()
                torch.nn.utils.clip_grad_norm_(generator.parameters(), 10, error_if_nonfinite=True)
                opt_g.step(); sch_g.step()
                del predicted, excitation, ff, rf, fake, real, gl
                opt_d.zero_grad(set_to_none=True)
                with torch.no_grad():
                    predicted = generator(z, c, ds)[0]
                dl = sum(adv(discriminator(predicted.detach()), discriminator(y)))
                if not bool(torch.isfinite(dl).cpu()):
                    raise RuntimeError("nonfinite_discriminator_loss")
                dl.backward()
                torch.nn.utils.clip_grad_norm_(discriminator.parameters(), 10, error_if_nonfinite=True)
                opt_d.step(); sch_d.step()
                report["completed_steps"] = index + 1
                report["additional_completed_steps"] = index + 1 - 500
                if index == 500 or (index + 1) % 25 == 0 or index + 1 == 500 + additional_steps:
                    torch.mps.synchronize()
                    item = dict(step=index + 1, elapsed_training_seconds=time.monotonic() - tick,
                        mel=float(ml.detach().cpu()), residual=float(rl.detach().cpu()),
                        fm=float(fl.detach().cpu()), adv=float(al.detach().cpu()), D=float(dl.detach().cpu()))
                    report["trace"].append(item)
                    print(json.dumps({"phase": "training", **item}), flush=True)
            if report["additional_completed_steps"] < 1:
                raise RuntimeError("no_continuation_update_completed")
            report.update(sampled_cases=dict(counts), sampled_pitch_bins=dict(pitch_counts))
            report["phase"] = "fixed_final_evaluation"
            report["final"] = evaluate()
            completed = report["completed_steps"]
            state = dict(generator=generator.state_dict(), discriminator=discriminator.state_dict(),
                optimizer_g=opt_g.state_dict(), optimizer_d=opt_d.state_dict(), scheduler_g=sch_g.state_dict(), scheduler_d=sch_d.state_dict(),
                completed_steps=completed, torch_cpu_rng=torch.get_rng_state(), torch_mps_rng=torch.mps.get_rng_state(),
                numpy_sampler_rng=rng.bit_generator.state, sampler_group_order=order.tolist(),
                sampler_next_group_position=completed % len(groups), sampler_cycle_boundary_rule=RULE,
                sampler_group_keys=[[g[0]["case"], g[0]["pitch_bin"]] for g in groups],
                generator_config=gc, discriminator_config=dc, data_gate_sha256=base.sha256(gate_path),
                normalizer_mean=mean.tolist(), normalizer_scale=scale.tolist(), format="private_sifigan_corpus_pilot_v1")
            report["phase"] = "save_full_training_state"
            new_checkpoint = output / "final_full_resume.pt"
            with new_checkpoint.open("xb") as handle:
                torch.save(cpu_tree(state), handle)
            new_checkpoint.chmod(0o600)
            if new_checkpoint.stat().st_size > 850_000_000:
                raise RuntimeError("full_checkpoint_budget_exceeded")
            report.update(checkpoint_bytes=new_checkpoint.stat().st_size, checkpoint_sha256=base.sha256(new_checkpoint))
            del state
            inference = output / "final_generator.pt"
            with inference.open("xb") as handle:
                torch.save(dict(generator=cpu_tree(generator.state_dict()), generator_config=gc, completed_steps=completed,
                    normalizer_mean=mean.tolist(), normalizer_scale=scale.tolist(), data_gate_sha256=base.sha256(gate_path),
                    source_credit=report["source_credit"], quality_approved=False), handle)
            inference.chmod(0o600)
            report.update(inference_checkpoint_bytes=inference.stat().st_size, inference_checkpoint_sha256=base.sha256(inference))
            report["reconstructions"] = reconstruct("final")
            if any(base.sha256(path) != checksum for path, checksum in bindings.items()) or base.validate_upstream(upstream) != parent["upstream_bindings"]:
                raise RuntimeError("parent_input_checkpoint_source_or_code_changed")
            report.update(status="bounded_resume_complete_not_perceptually_approved", phase="complete",
                final_resources=guard.snapshot(), torch_version=str(torch.__version__), parent_all_inputs_preserved=True)
            report["final_experiment_bytes_before_report"] = experiment_bytes(experiment_root)
            if report["final_experiment_bytes_before_report"] > MAX_EXPERIMENT_BYTES:
                raise RuntimeError("cumulative2GB_disk_budget_exceeded")
    except Exception as error:
        report.update(status="failed", error_type=type(error).__name__, error_message=str(error), traceback=traceback.format_exc())
        raise
    finally:
        report["elapsed_seconds"] = time.monotonic() - started
        if "parent_elapsed_seconds" in report:
            report["cumulative_elapsed_seconds"] = report["parent_elapsed_seconds"] + report["elapsed_seconds"]
        base.write_report(output / "report.json", report)
        if experiment_root.exists() and experiment_bytes(experiment_root) > MAX_EXPERIMENT_BYTES:
            raise RuntimeError("cumulative2GB_disk_budget_exceeded_after_report")


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent-report", type=Path, required=True)
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--steps", type=int, default=500)
    args = parser.parse_args()
    run(args.parent_report, args.upstream, args.output, args.steps)
