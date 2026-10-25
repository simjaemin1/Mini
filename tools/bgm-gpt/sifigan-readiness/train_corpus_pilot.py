#!/usr/bin/env python3
"""Bounded scratch full SiFi-GAN pilot on audited recording-disjoint data.

No public weights, score generation, automatic CPU fallback, source mixing,
gain automation, or perceptual approval. Evaluation never selects weights.
"""
import argparse
from collections import defaultdict
import json
import os
from pathlib import Path
import socket
import sys
import time
import traceback

import numpy as np
import probe_generator_mps as base
from train_real_gate import cpu_tree

FRAMES, HOP, RATE, SEED = 70, 120, 24000, 20261025


def validate_file_splits(rows, corpus_rows):
    files = {row["case"]: row for row in rows}
    originals = {row["case"]: row for row in corpus_rows}
    if len(files) != len(rows) or set(files) != set(originals):
        raise ValueError("unique_cases_matching_bound_corpus_required")
    seen = set()
    for case, row in files.items():
        original = originals[case]
        if any(row[key] != original[key] for key in ("source_path", "source_sha256", "npz_sha256", "split")):
            raise ValueError("gate_file_does_not_match_bound_corpus")
        if row["source_sha256"] in seen:
            raise ValueError("duplicate_or_split_leaking_source_SHA")
        seen.add(row["source_sha256"])
        identity = (case + " " + row["source_path"]).lower()
        if any(token in identity for token in ("arirang", "아리랑", "deepvib", "deep_vib")) and row["split"] != "heldout":
            raise ValueError("protected_recordings_must_stay_heldout")
    return files


def select_groups(windows, files):
    groups = defaultdict(list)
    for row in windows:
        if row["case"] not in files or row["split"] != files[row["case"]]["split"]:
            raise ValueError("window_and_recording_split_must_match")
        if row["split"] == "fit":
            if row.get("accepted") is not True or row["start_frame"] < 0:
                raise ValueError("only_accepted_nonnegative_training_windows")
            groups[(row["case"], row["pitch_bin"])].append(row)
    if len({key[0] for key in groups}) < 4 or len({key[1] for key in groups}) < 3:
        raise ValueError("at_least_four_fit_cases_and_three_pitch_bins_required")
    if sum(map(len, groups.values())) < 100:
        raise ValueError("at_least_100_audited_fit_windows_required")
    return [groups[key] for key in sorted(groups)]


def run(upstream, gate_path, output, max_steps=500):
    base.require_mps_environment()
    if not 1 <= max_steps <= 500:
        raise ValueError("pilot_step_ceiling_500")
    output, gate_path = Path(output).resolve(), Path(gate_path).resolve(strict=True)
    if output.exists():
        raise ValueError("fresh_private_output_required")
    output.mkdir(mode=0o700)
    started = time.monotonic()
    report = dict(schema="mini.sifigan-corpus-pilot.v1", status="started", phase="validation",
        seed=SEED, requested_steps=max_steps, completed_steps=0, batch_size=1, frames=FRAMES,
        source_credit="국악기 음원 제공 — 국립국악원 (공공누리 제1유형)",
        public_weights_used=False, initialization="scratch_new_fit_normalizer",
        heldout_is_blind=False, heldout_used_for_optimizer_or_selection=False,
        quality_approved=False, training_convergence_established=False,
        new_score_or_music=False, automatic_CPU_fallback=False,
        max_seconds=1200, soft_training_stop_seconds=1050, trace=[])
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "foundation-model-trial"))
    from ace_limits import GIB, ResourceCaps, ResourceGuard
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=1200, max_rss_bytes=8 * GIB)) as guard:
            upstream = Path(upstream).resolve(strict=True)
            official = base.validate_upstream(upstream)
            gate = json.loads(gate_path.read_text())
            if gate.get("schema") != "mini.sifigan-window-gate.v1" or gate.get("status") != "complete":
                raise ValueError("complete_audited_corpus_gate_required")
            if gate.get("training_eligible") is not True:
                raise ValueError("auditor_found_no_eligible_training_data")
            bindings = {str(gate_path): base.sha256(gate_path)}
            for name in ("train_corpus_pilot.py", "probe_generator_mps.py", "train_real_gate.py",
                         "prepare_corpus.py", "audit_corpus.py", "pilot_metrics.py"):
                path = Path(__file__).with_name(name).resolve()
                bindings[str(path)] = base.sha256(path)
            original_manifest = Path(gate["source_manifest_path"])
            if base.sha256(original_manifest) != gate["source_manifest_sha256"]:
                raise ValueError("corpus_manifest_changed")
            original_corpus = json.loads(original_manifest.read_text())
            validated_files = validate_file_splits(gate["files"], original_corpus["files"])
            groups = select_groups(gate["windows"], validated_files)
            bindings[str(original_manifest)] = gate["source_manifest_sha256"]
            datasets, files = {}, {}
            for row in gate["files"]:
                path = Path(row["npz_path"])
                original = Path(row["source_path"])
                for file, digest in ((path, row["npz_sha256"]), (original, row["source_sha256"])):
                    if base.sha256(file) != digest:
                        raise ValueError("corpus_or_original_changed")
                    bindings[str(file)] = digest
                with np.load(path, allow_pickle=False) as archive:
                    datasets[row["case"]] = {key: archive[key].copy() for key in archive.files}
                files[row["case"]] = row
            stats_path = gate_path.parent / gate.get("stats_file", "stats.npz")
            if base.sha256(stats_path) != gate["stats_sha256"]:
                raise ValueError("accepted_fit_only_stats_changed")
            bindings[str(stats_path)] = gate["stats_sha256"]
            with np.load(stats_path, allow_pickle=False) as stats:
                mean, scale = stats["mean"].copy(), stats["scale"].copy()
            if (mean.shape != (43,) or scale.shape != (43,) or not np.isfinite(mean).all()
                    or not np.isfinite(scale).all() or np.any(scale <= 0)):
                raise ValueError("finite_43_channel_positive_scale_required")
            report.update(input_bindings=bindings, upstream_bindings=official,
                          fit_groups=len(groups), fit_windows=sum(map(len, groups)),
                          data_gate=str(gate_path), initial_resources=guard.initial)
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
            torch.manual_seed(SEED)
            rng = np.random.default_rng(SEED)
            sys.path.insert(0, str(upstream))
            from sifigan.models import SiFiGANGenerator, UnivNetMultiResolutionMultiPeriodDiscriminator
            from sifigan.losses import MelSpectralLoss, ResidualLoss, AdversarialLoss, FeatureMatchLoss
            from sifigan.utils.features import SignalGenerator, dilated_factor
            config_root = upstream / "sifigan/bin/config"
            def config(name):
                item = yaml.safe_load((config_root / name).read_text())
                item.pop("_target_", None)
                return item
            gc, dc, tc = config("generator/sifigan.yaml"), config("discriminator/univnet.yaml"), config("train/sifigan.yaml")
            mc, rc = dict(tc["mel_loss"]), dict(tc["reg_loss"])
            mc.pop("_target_"); rc.pop("_target_")
            rc.update(f0_floor=70, f0_ceil=1800)
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
            sch_g = torch.optim.lr_scheduler.MultiStepLR(opt_g, **schedule)
            sch_d = torch.optim.lr_scheduler.MultiStepLR(opt_d, **schedule)
            report.update(generator_config=gc, discriminator_config=dc, mel_config=mc, residual_config=rc,
                generator_parameters=sum(p.numel() for p in generator.parameters()),
                discriminator_parameters=sum(p.numel() for p in discriminator.parameters()),
                device="MPS_G_D_all_losses; CPU_float64_excitation_then_float32_transfer")
            signal = SignalGenerator(sample_rate=RATE, hop_size=HOP, sine_amp=.1, noise_amp=.003, signal_types=["sine"])
            def inputs(case, start, frames=FRAMES):
                source = datasets[case]
                f0 = source["f0"][start:start + frames].copy()
                cf0 = source["cf0"][start:start + frames].copy()
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
            def reconstruct(label):
                """Same full clips/noise/analysis both times, no weight selection."""
                cpu_rng, mps_rng = torch.get_rng_state(), torch.mps.get_rng_state()
                was_training = generator.training
                generator.eval()
                results = []
                try:
                    torch.manual_seed(SEED + 2)
                    for case in ("deepvib48", "arirang001"):
                        source, n = datasets[case], 960
                        if len(source["f0"]) < n:
                            raise RuntimeError("full4p8s_heldout_reconstruction_required")
                        with torch.no_grad():
                            z, c, ds, y, f0 = inputs(case, 0, n)
                            generated = generator(z, c, ds)[0].squeeze().cpu().numpy()
                        reference = source["waveform"][:n * HOP]
                        ref_diag = prepare_corpus.diagnostics(reference)
                        gen_diag = prepare_corpus.diagnostics(generated)
                        metrics = pilot_metrics.summary(generated, reference,
                            ref_diag["yin_hz"], ref_diag["periodicity"],
                            gen_diag["yin_hz"], gen_diag["periodicity"],
                            ref_diag["rms_db"], gen_diag["rms_db"])
                        archive = output / (label + "_" + case + "_reconstruction.npz")
                        with archive.open("xb") as handle:
                            np.savez_compressed(handle, generated=generated, reference=reference)
                        archive.chmod(0o600)
                        results.append(dict(case=case, file=archive.name,
                            sha256=base.sha256(archive), metrics=metrics, perceptually_approved=False))
                    return results
                finally:
                    torch.set_rng_state(cpu_rng); torch.mps.set_rng_state(mps_rng)
                    generator.train(was_training)
            evaluation = [group[0] for group in groups]
            held = gate.get("heldout_windows", [])
            for case in sorted({row["case"] for row in held}):
                choices = [row for row in held if row["case"] == case]
                evaluation.extend(choices[i] for i in sorted({0, len(choices) // 2, len(choices) - 1}))
            def evaluate():
                cpu_rng, mps_rng = torch.get_rng_state(), torch.mps.get_rng_state()
                generator.eval()
                values = defaultdict(list)
                try:
                    torch.manual_seed(SEED + 1)
                    with torch.no_grad():
                        for row in evaluation:
                            z, c, ds, y, f0 = inputs(row["case"], row["start_frame"])
                            prediction = generator(z, c, ds)[0]
                            loss = float(mel(prediction, y).cpu())
                            if not np.isfinite(loss):
                                raise RuntimeError("nonfinite_fixed_evaluation")
                            values[row["split"]].append(loss)
                    return {key: dict(windows=len(items), mean_logmel_l1=float(np.mean(items))) for key, items in values.items()}
                finally:
                    torch.set_rng_state(cpu_rng); torch.mps.set_rng_state(mps_rng)
                    generator.train()
            report["phase"] = "fixed_baseline"
            report["evaluation_windows"] = evaluation
            report["baseline"] = evaluate()
            report["baseline_reconstructions"] = reconstruct("baseline")
            print(json.dumps({"phase": "baseline", "metrics": report["baseline"]}), flush=True)
            counts, pitch_counts = defaultdict(int), defaultdict(int)
            group_order = rng.permutation(len(groups))
            tick = time.monotonic()
            for index in range(max_steps):
                if time.monotonic() - started > 1050:
                    report["soft_stop_reason"] = "save_and_evaluation_time_reserve"
                    break
                if index and index % len(groups) == 0:
                    group_order = rng.permutation(len(groups))
                group = groups[int(group_order[index % len(groups)])]
                row = group[int(rng.integers(len(group)))]
                counts[row["case"]] += 1; pitch_counts[row["pitch_bin"]] += 1
                report["phase"] = "training"
                z, c, ds, y, f0 = inputs(row["case"], row["start_frame"])
                if index == 0:
                    before_g = next(generator.parameters()).detach().clone()
                    before_d = next(discriminator.parameters()).detach().clone()
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
                fake_loss, real_loss = adv(discriminator(predicted.detach()), discriminator(y))
                dl = fake_loss + real_loss
                if not bool(torch.isfinite(dl).cpu()):
                    raise RuntimeError("nonfinite_discriminator_loss")
                dl.backward()
                torch.nn.utils.clip_grad_norm_(discriminator.parameters(), 10, error_if_nonfinite=True)
                opt_d.step(); sch_d.step()
                if index == 0:
                    changed_g = not torch.equal(before_g, next(generator.parameters()))
                    changed_d = not torch.equal(before_d, next(discriminator.parameters()))
                    if not changed_g or not changed_d:
                        raise RuntimeError("actual_G_D_weight_updates_required")
                    report.update(first_G_update_changed_weight=changed_g, first_D_update_changed_weight=changed_d)
                report["completed_steps"] = index + 1
                if index == 0 or (index + 1) % 25 == 0 or index + 1 == max_steps:
                    torch.mps.synchronize()
                    entry = dict(step=index + 1, elapsed_training_seconds=time.monotonic() - tick,
                        mel=float(ml.detach().cpu()), residual=float(rl.detach().cpu()),
                        fm=float(fl.detach().cpu()), adv=float(al.detach().cpu()), D=float(dl.detach().cpu()))
                    report["trace"].append(entry)
                    print(json.dumps({"phase": "training", **entry}), flush=True)
            report.update(sampled_cases=dict(counts), sampled_pitch_bins=dict(pitch_counts))
            if report["completed_steps"] < 1:
                raise RuntimeError("no_training_update_completed")
            report["phase"] = "fixed_final_evaluation"
            report["final"] = evaluate()
            print(json.dumps({"phase": "final", "metrics": report["final"]}), flush=True)
            report["phase"] = "save_full_training_state"
            state = dict(generator=generator.state_dict(), discriminator=discriminator.state_dict(),
                optimizer_g=opt_g.state_dict(), optimizer_d=opt_d.state_dict(),
                scheduler_g=sch_g.state_dict(), scheduler_d=sch_d.state_dict(),
                completed_steps=report["completed_steps"], torch_cpu_rng=torch.get_rng_state(),
                torch_mps_rng=torch.mps.get_rng_state(), numpy_sampler_rng=rng.bit_generator.state,
                sampler_group_order=group_order.tolist(),
                sampler_next_group_position=report["completed_steps"] % len(groups),
                sampler_cycle_boundary_rule="At positive completed_steps divisible by group count, draw next permutation before next group",
                sampler_group_keys=[list((group[0]["case"], group[0]["pitch_bin"])) for group in groups],
                generator_config=gc, discriminator_config=dc, data_gate_sha256=bindings[str(gate_path)],
                normalizer_mean=mean.tolist(), normalizer_scale=scale.tolist(),
                format="private_sifigan_corpus_pilot_v1")
            checkpoint = output / "final_full_resume.pt"
            with checkpoint.open("xb") as handle:
                torch.save(cpu_tree(state), handle)
            checkpoint.chmod(0o600)
            if checkpoint.stat().st_size > 850_000_000:
                raise RuntimeError("full_checkpoint_budget_exceeded")
            report.update(checkpoint_bytes=checkpoint.stat().st_size, checkpoint_sha256=base.sha256(checkpoint))
            del state
            inference = output / "final_generator.pt"
            with inference.open("xb") as handle:
                torch.save(dict(generator=cpu_tree(generator.state_dict()), generator_config=gc,
                    completed_steps=report["completed_steps"], normalizer_mean=mean.tolist(),
                    normalizer_scale=scale.tolist(), data_gate_sha256=bindings[str(gate_path)],
                    source_credit=report["source_credit"], quality_approved=False), handle)
            inference.chmod(0o600)
            report.update(inference_checkpoint_bytes=inference.stat().st_size,
                          inference_checkpoint_sha256=base.sha256(inference))
            report["phase"] = "heldout_reconstruction_diagnostics"
            report["reconstructions"] = reconstruct("final")
            if any(base.sha256(path) != digest for path, digest in bindings.items()) or base.validate_upstream(upstream) != official:
                raise RuntimeError("immutable_corpus_source_or_code_changed")
            report.update(status="bounded_pilot_complete_not_perceptually_approved", phase="complete",
                          final_resources=guard.snapshot(), torch_version=str(torch.__version__))
    except Exception as exc:
        report.update(status="failed", error_type=type(exc).__name__, error_message=str(exc), traceback=traceback.format_exc())
        raise
    finally:
        report["elapsed_seconds"] = time.monotonic() - started
        base.write_report(output / "report.json", report)


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--gate", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--steps", type=int, default=500)
    args = parser.parse_args()
    run(args.upstream, args.gate, args.output, args.steps)
