#!/usr/bin/env python3
"""Same-recipe full-state global3000 continuation, targeting global6000.

No data, sampler, loss, architecture, normalization, AP/F0 or output changes.
Fixed development validation, not a blind test or promise of better sound.
"""
import argparse
from collections import Counter, defaultdict
import copy
import json
import os
from pathlib import Path
import shutil
import socket
import sys
import time
import traceback

import numpy as np
import extend_corpus_training as previous
import export_extended_training as lineage
import probe_generator_mps as base
import resume_corpus_pilot as original_resume
from train_real_gate import cpu_tree, tree_digest
from train_corpus_pilot import FRAMES, HOP, RATE, SEED, select_groups, validate_file_splits

PARENT_STEP, MAX_STEPS = 3000, 3000
MAX_SECONDS, SOFT_SECONDS = 2700, 2400
GIB = 1024 ** 3
MAX_BYTES, FULL_MAX_BYTES, GENERATOR_RESERVE = 900_000_000, 700_000_000, 50_000_000
AUX_RESERVE, REPORT_RESERVE, STOP_CUSHION = 20_000_000, 2_000_000, 50_000_000
INITIAL_RESERVE = FULL_MAX_BYTES + 2 * GENERATOR_RESERVE + AUX_RESERVE + STOP_CUSHION
RULE, STATE_KEYS = original_resume.RULE, original_resume.STATE_KEYS
bytes_used = previous.bytes_used
atomic_json = previous.atomic_json
verify_bindings = previous.verify_bindings
save_torch_archive = previous.save_torch_archive
verify_full_roundtrip = previous.verify_full_roundtrip


def planned_reserve(snapshot_count, *, include_generators=True, stop_cushion=True):
    if type(snapshot_count) is not int or not 0 <= snapshot_count <= 2:
        raise ValueError("zero_to_two_existing_generator_snapshots_required")
    return (FULL_MAX_BYTES + AUX_RESERVE + ((2 - snapshot_count) * GENERATOR_RESERVE if include_generators else 0)
            + (STOP_CUSHION if stop_cushion else 0))


def reserve_available(root, reserve, *, free_bytes=None, used_bytes=None):
    free = shutil.disk_usage(root).free if free_bytes is None else free_bytes
    used = bytes_used(root) if used_bytes is None else used_bytes
    return free >= 12 * GIB + reserve and used + reserve <= MAX_BYTES


def planned_available(root, snapshot_count, *, include_generators=True, stop_cushion=True, **measurements):
    return reserve_available(root, planned_reserve(snapshot_count, include_generators=include_generators,
        stop_cushion=stop_cushion), **measurements)


def verify_final_generator(path, torch, expected_hash, completed, gc, mean, scale, gate_sha256):
    state = torch.load(path, map_location="cpu", weights_only=True)
    if (state.get("format") != "private_sifigan_generator_only_v1" or state.get("completed_steps") != completed
            or state.get("generator_config") != gc or state.get("data_gate_sha256") != gate_sha256
            or not np.array_equal(np.asarray(state.get("normalizer_mean")), mean)
            or not np.array_equal(np.asarray(state.get("normalizer_scale")), scale)
            or tree_digest(state["generator"]) != expected_hash):
        raise ValueError("final_generator_not_same_numeric_G_as_verified_full_checkpoint")
    return True


def validate_parent(path, upstream):
    path = lineage.saved.regular(path, 5_000_000)
    claimed = json.loads(path.read_text())
    ancestor_path = lineage.saved.regular(claimed["parent_report"], 5_000_000)
    ancestor, _, ancestor_bindings = previous.validate_parent(ancestor_path, upstream)
    parent, _, bindings, checkpoints = lineage.validate_inputs(ancestor_path, path)
    if (parent.get("completed_steps") != PARENT_STEP
            or parent.get("status") != "bounded_extension_complete_not_perceptually_approved"
            or parent.get("full_resume_available") is not True
            or parent.get("full_checkpoint_numeric_roundtrip_verified") is not True
            or parent.get("seed") != SEED or parent.get("fit_groups") != 27
            or parent.get("evaluation_windows") != ancestor["evaluation_windows"]
            or any(parent.get(key) != ancestor.get(key) for key in
                   ("generator_config", "discriminator_config", "mel_config", "residual_config", "upstream_bindings"))):
        raise ValueError("complete_unchanged_full_global3000_parent_required")
    checkpoint = Path(checkpoints["extended"][parent["checkpoint_file"]]["path"])
    bindings.update(ancestor_bindings)
    for code in (Path(__file__).resolve(), Path(previous.__file__).resolve(), Path(lineage.__file__).resolve()):
        bindings[str(code)] = base.sha256(code)
    return parent, checkpoint, bindings


def run(parent_report, upstream, output, additional_steps=MAX_STEPS):
    base.require_mps_environment()
    if type(additional_steps) is not int or not 1 <= additional_steps <= MAX_STEPS:
        raise ValueError("additional_step_ceiling3000")
    output = Path(output)
    if not output.is_absolute() or output.is_symlink():
        raise ValueError("absolute_nonsymlink_private_output_required")
    output = output.resolve()
    private_root = (Path.home() / "Mini/_bgm/gpt").resolve()
    if output.exists() or not output.is_relative_to(private_root) or output.parent == private_root:
        raise ValueError("fresh_private_output_required")
    output.mkdir(mode=0o700)
    experiment_root = output.parent
    started = time.monotonic()
    report = dict(schema="mini.sifigan-reconstruction-continuation.v1", status="started", phase="validate",
        seed=SEED, batch_size=1, frames=FRAMES, parent_completed_steps=PARENT_STEP, completed_steps=PARENT_STEP,
        additional_completed_steps=0, requested_additional_steps=additional_steps,
        max_seconds=MAX_SECONDS, soft_training_stop_seconds=SOFT_SECONDS, max_experiment_bytes=MAX_BYTES,
        initial_planned_save_reserve_bytes=INITIAL_RESERVE, full_save_reserve_bytes=FULL_MAX_BYTES,
        update_stop_cushion_bytes=STOP_CUSHION, final_generator_and_full_reserve_bytes=770_000_000,
        max_generator_snapshots=2, planned_save_reserve_checked_before_every_update=True, unchanged_training_recipe=True,
        hyperparameters_changed=False, sampler_changed=False, normalizer_changed=False,
        input_gain_changed=False, AP_or_cf0_changed=False, optimizer_or_scheduler_reset=False,
        loss_changed=False, heldout_used_for_optimizer=False, heldout_is_blind=False,
        evaluation_role="adaptive_development_validation_not_untouched_test",
        public_weights_used=False, automatic_CPU_fallback=False, output_processing=False,
        quality_approved=False, training_convergence_established=False, new_score_or_music=False,
        full_resume_available=False, trace=[], generator_snapshots=[], intermediate_evaluations=[],
        source_credit="국악기 음원 제공 — 국립국악원 (공공누리 제1유형)")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "foundation-model-trial"))
    from ace_limits import ResourceCaps, ResourceGuard
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=MAX_SECONDS, max_rss_bytes=8 * GIB)) as guard:
            if not planned_available(experiment_root, 0):
                raise ValueError("reserve870MB_planned_saves_above12GiB_before_training")
            upstream = Path(upstream).resolve(strict=True)
            parent, checkpoint, bindings = validate_parent(parent_report, upstream)
            metric_code = Path(__file__).with_name("level_metrics.py").resolve()
            bindings[str(metric_code)] = base.sha256(metric_code)
            resource_code = Path(__file__).resolve().parents[1] / "foundation-model-trial/ace_limits.py"
            bindings[str(resource_code)] = base.sha256(resource_code)
            gate_path = Path(parent["data_gate"])
            gate = json.loads(gate_path.read_text())
            if (gate.get("schema") != "mini.sifigan-window-gate.v1" or gate.get("status") != "complete"
                    or gate.get("training_eligible") is not True or base.sha256(gate_path) != bindings[str(gate_path)]):
                raise ValueError("same_original_eligible_window_gate_required")
            manifest = json.loads(Path(gate["source_manifest_path"]).read_text())
            files = validate_file_splits(gate["files"], manifest["files"])
            groups = select_groups(gate["windows"], files)
            datasets = {}
            for row in gate["files"]:
                with np.load(row["npz_path"], allow_pickle=False) as archive:
                    datasets[row["case"]] = {key: archive[key].copy() for key in archive.files}
            stats_path = gate_path.parent / gate.get("stats_file", "stats.npz")
            if base.sha256(stats_path) != gate["stats_sha256"]:
                raise ValueError("same_accepted_fit_only_stats_required")
            with np.load(stats_path, allow_pickle=False) as archive:
                mean, scale = archive["mean"].copy(), archive["scale"].copy()
            report.update(parent_report=str(Path(parent_report).resolve()), parent_checkpoint=str(checkpoint),
                input_bindings=bindings, upstream_bindings=parent["upstream_bindings"], data_gate=str(gate_path),
                evaluation_windows=parent["evaluation_windows"], initial_resources=guard.initial,
                experiment_root=str(experiment_root))
            atomic_json(output / "progress.json", report)
            socket.create_connection = base.block_network
            socket.socket.connect = base.block_network
            socket.socket.connect_ex = base.block_network
            import torch
            import yaml
            import prepare_corpus
            import pilot_metrics
            import level_metrics
            if not torch.backends.mps.is_available():
                raise RuntimeError("MPS_required_no_CPU_fallback")
            torch.set_num_threads(4)
            sys.path.insert(0, str(upstream))
            from sifigan.models import SiFiGANGenerator, UnivNetMultiResolutionMultiPeriodDiscriminator
            from sifigan.losses import MelSpectralLoss, ResidualLoss, AdversarialLoss, FeatureMatchLoss
            from sifigan.utils.features import SignalGenerator, dilated_factor
            with torch.serialization.safe_globals([Counter]):
                state = torch.load(checkpoint, map_location="cpu", weights_only=True)
            gc, dc = parent["generator_config"], parent["discriminator_config"]
            if (state["generator_config"] != gc or state["discriminator_config"] != dc
                    or state["data_gate_sha256"] != base.sha256(gate_path)
                    or not np.array_equal(mean, np.asarray(state["normalizer_mean"]))
                    or not np.array_equal(scale, np.asarray(state["normalizer_scale"]))):
                raise ValueError("checkpoint_config_gate_or_normalizer_mismatch")
            order = previous.validate_sampler(state, groups, expected_step=PARENT_STEP)
            def config(name):
                value = yaml.safe_load((upstream / "sifigan/bin/config" / name).read_text())
                value.pop("_target_", None)
                return value
            if gc != config("generator/sifigan.yaml") or dc != config("discriminator/univnet.yaml"):
                raise ValueError("official_parent_architectures_required")
            tc = config("train/sifigan.yaml")
            mc, rc = dict(tc["mel_loss"]), dict(tc["reg_loss"])
            mc.pop("_target_"); rc.pop("_target_"); rc.update(f0_floor=70, f0_ceil=1800)
            if mc != parent["mel_config"] or rc != parent["residual_config"]:
                raise ValueError("same_original_loss_configuration_required")
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
            if tree_digest(state) != parent["full_checkpoint_typed_state_sha256"]:
                raise ValueError("parent3000_full_typed_numeric_state_changed")
            report["restored_numeric_state_sha256"] = previous.strict_restore(state, generator, discriminator, opt_g, opt_d, sch_g, sch_d, expected_step=PARENT_STEP)
            if report["restored_numeric_state_sha256"] != parent["final_numeric_state_sha256"]:
                raise ValueError("parent3000_six_numeric_states_not_exact")
            report.update(generator_config=gc, discriminator_config=dc, mel_config=mc, residual_config=rc,
                fit_groups=len(groups), fit_windows=sum(map(len, groups)), restored_sampler_next_position=PARENT_STEP % len(groups),
                device="MPS_G_D_all_losses; CPU_float64_excitation_then_float32_transfer")
            rng = np.random.default_rng()
            def restore_parent_rng():
                rng.bit_generator.state = copy.deepcopy(state["numpy_sampler_rng"])
                torch.set_rng_state(state["torch_cpu_rng"]); torch.mps.set_rng_state(state["torch_mps_rng"])
            restore_parent_rng()
            signal = SignalGenerator(sample_rate=RATE, hop_size=HOP, sine_amp=.1, noise_amp=.003, signal_types=["sine"])
            def inputs(case, start, frames=FRAMES):
                source = datasets[case]
                f0, cf0 = source["f0"][start:start + frames].copy(), source["cf0"][start:start + frames].copy()
                c = ((source["features"][start:start + frames] - mean) / scale).astype(np.float32)
                y = source["waveform"][start * HOP:(start + frames) * HOP].copy()
                if (c.shape != (frames, 43) or y.shape != (frames * HOP,) or not np.isfinite(c).all()
                        or not np.isfinite(y).all() or not np.isfinite(cf0).all() or np.any(cf0 <= 0)):
                    raise ValueError("same_finite_aligned_original_crop_required")
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
                raise ValueError("same42_evaluation_windows_required")
            if any(row["split"] != files[row["case"]]["split"] for row in evaluation):
                raise ValueError("evaluation_split_changed")
            def evaluate():
                cpu_rng, mps_rng, np_rng = torch.get_rng_state(), torch.mps.get_rng_state(), copy.deepcopy(rng.bit_generator.state)
                generator.eval(); values = defaultdict(list)
                try:
                    torch.manual_seed(SEED + 1)
                    with torch.no_grad():
                        for row in evaluation:
                            z, c, ds, y, _ = inputs(row["case"], row["start_frame"])
                            value = float(mel(generator(z, c, ds)[0], y).cpu())
                            if not np.isfinite(value):
                                raise RuntimeError("nonfinite_fixed_evaluation")
                            values[row["split"]].append(value)
                    return {k: dict(windows=len(v), mean_logmel_l1=float(np.mean(v))) for k, v in values.items()}
                finally:
                    torch.set_rng_state(cpu_rng); torch.mps.set_rng_state(mps_rng)
                    rng.bit_generator.state = np_rng; generator.train()
            def reconstruct(label, verify=False):
                cpu_rng, mps_rng, np_rng = torch.get_rng_state(), torch.mps.get_rng_state(), copy.deepcopy(rng.bit_generator.state)
                generator.eval(); rows = []
                try:
                    torch.manual_seed(SEED + 2)
                    for case in ("deepvib48", "arirang001"):
                        with torch.no_grad():
                            z, c, ds, _, _ = inputs(case, 0, 960)
                            generated = generator(z, c, ds)[0].squeeze().cpu().numpy()
                        reference = datasets[case]["waveform"][:960 * HOP]
                        if not np.isfinite(generated).all():
                            raise RuntimeError("nonfinite_reconstruction")
                        if verify:
                            item = next(row for row in parent["reconstructions"] if row["case"] == case)
                            with np.load(Path(parent_report).resolve().parent / item["file"], allow_pickle=False) as saved:
                                if (not np.array_equal(reference, saved["reference"])
                                        or generated.tobytes() != saved["generated"].tobytes()):
                                    raise ValueError("restored_baseline_not_parent3000:" + case)
                        rd, gd = prepare_corpus.diagnostics(reference), prepare_corpus.diagnostics(generated)
                        metrics = pilot_metrics.summary(generated, reference, rd["yin_hz"], rd["periodicity"],
                            gd["yin_hz"], gd["periodicity"], rd["rms_db"], gd["rms_db"])
                        levels = level_metrics.summary(generated, reference, rd["rms_db"], gd["rms_db"])
                        destination = output / (label + "_" + case + "_reconstruction.npz")
                        with destination.open("xb") as handle:
                            np.savez_compressed(handle, generated=generated, reference=reference)
                        destination.chmod(0o600)
                        rows.append(dict(case=case, file=destination.name, sha256=base.sha256(destination),
                            metrics=metrics, level_metrics=levels, perceptually_approved=False))
                    return rows
                finally:
                    torch.set_rng_state(cpu_rng); torch.mps.set_rng_state(mps_rng)
                    rng.bit_generator.state = np_rng; generator.train()
            def save_generator(final=False):
                completed = report["completed_steps"]
                old = next((r for r in report["generator_snapshots"] if r["completed_steps"] == completed), None)
                if old:
                    if base.sha256(output / old["file"]) != old["sha256"]:
                        raise RuntimeError("existing_generator_snapshot_changed")
                    return old
                reserve = (FULL_MAX_BYTES + GENERATOR_RESERVE + AUX_RESERVE if final else
                    planned_reserve(len(report["generator_snapshots"]), stop_cushion=False))
                if len(report["generator_snapshots"]) >= 2 or not reserve_available(experiment_root, reserve):
                    raise RuntimeError("two_snapshot_ceiling_or_final_full_reserve_not_safe")
                destination = output / ("generator_step_%06d.pt" % completed)
                payload = dict(generator=cpu_tree(generator.state_dict()), generator_config=gc,
                    completed_steps=completed, normalizer_mean=mean.tolist(), normalizer_scale=scale.tolist(),
                    data_gate_sha256=base.sha256(gate_path), source_credit=report["source_credit"], quality_approved=False,
                    full_resume_available=False, format="private_sifigan_generator_only_v1")
                item = save_torch_archive(destination, payload, torch, GENERATOR_RESERVE)
                item.update(completed_steps=completed, optimizer_resume=False)
                report["generator_snapshots"].append(item)
                atomic_json(output / "progress.json", report)
                return item
            report["phase"] = "verify_parent3000_baseline"
            report["baseline"] = evaluate()
            original_resume.compare_evaluation(report["baseline"], parent["final"])
            report["baseline_reconstructions"] = reconstruct("baseline", verify=True)
            report["parent_final_baseline_reproduced"] = True
            report["parent_reconstructions_byte_exact"] = True
            restore_parent_rng(); del state
            atomic_json(output / "progress.json", report)
            counts, pitch_counts = Counter(), Counter()
            tick = time.monotonic()
            for index in range(PARENT_STEP, PARENT_STEP + additional_steps):
                if time.monotonic() - started > SOFT_SECONDS:
                    report["soft_stop_reason"] = "reserve_final_evaluation_and_recovery_time"; break
                if not planned_available(experiment_root, len(report["generator_snapshots"])):
                    report["soft_stop_reason"] = "remaining_planned_saves_reserve_above12GiB_before_update"; break
                row, order = original_resume.next_sample(rng, groups, order, index)
                if files[row["case"]]["split"] != "fit" or row.get("accepted") is not True:
                    raise RuntimeError("optimizer_only_accepted_original_fit_windows")
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
                gl.backward(); torch.nn.utils.clip_grad_norm_(generator.parameters(), 10, error_if_nonfinite=True)
                opt_g.step(); sch_g.step()
                del predicted, excitation, ff, rf, fake, real, gl
                opt_d.zero_grad(set_to_none=True)
                with torch.no_grad():
                    predicted = generator(z, c, ds)[0]
                dl = sum(adv(discriminator(predicted.detach()), discriminator(y)))
                if not bool(torch.isfinite(dl).cpu()):
                    raise RuntimeError("nonfinite_discriminator_loss")
                dl.backward(); torch.nn.utils.clip_grad_norm_(discriminator.parameters(), 10, error_if_nonfinite=True)
                opt_d.step(); sch_d.step()
                report.update(completed_steps=index + 1, additional_completed_steps=index + 1 - PARENT_STEP)
                if index == PARENT_STEP or (index + 1) % 50 == 0 or index + 1 == PARENT_STEP + additional_steps:
                    torch.mps.synchronize()
                    item = dict(step=index + 1, elapsed_training_seconds=time.monotonic() - tick,
                        mel=float(ml.detach().cpu()), residual=float(rl.detach().cpu()),
                        fm=float(fl.detach().cpu()), adv=float(al.detach().cpu()), D=float(dl.detach().cpu()))
                    report["trace"].append(item)
                    atomic_json(output / "progress.json", report)
                    print(json.dumps({"phase": "training", **item}), flush=True)
                if report["additional_completed_steps"] == 1500 and report["additional_completed_steps"] < additional_steps:
                    if planned_available(experiment_root, len(report["generator_snapshots"]), stop_cushion=False):
                        save_generator()  # recovery survives later evaluation/full-save failure
                        report["intermediate_evaluations"].append(dict(step=index + 1, metrics=evaluate()))
                    else:
                        report["midpoint_snapshot_skipped"] = "preserve_actual_final_generator_and_full_reserve"
                    atomic_json(output / "progress.json", report)
            if not report["additional_completed_steps"]:
                report.update(status="no_updates_resource_reserve_not_training_completion", phase="stopped")
                return report
            report.update(sampled_cases=dict(counts), sampled_pitch_bins=dict(pitch_counts), phase="save_generator_first")
            final_generator = save_generator(final=True)
            report.update(inference_checkpoint_file=final_generator["file"],
                inference_checkpoint_sha256=final_generator["sha256"], inference_checkpoint_bytes=final_generator["bytes"])
            report["phase"] = "fixed_final_evaluation"
            report["final"] = evaluate()
            report["reconstructions"] = reconstruct("final")
            atomic_json(output / "progress.json", report)
            # Capture RNG only after evaluations restored all three training streams.
            if planned_available(experiment_root, len(report["generator_snapshots"]), include_generators=False, stop_cushion=False):
                report["phase"] = "save_full_training_state_after_generator_and_renders"
                atomic_json(output / "progress.json", report)
                completed = report["completed_steps"]
                full = dict(generator=generator.state_dict(), discriminator=discriminator.state_dict(),
                    optimizer_g=opt_g.state_dict(), optimizer_d=opt_d.state_dict(), scheduler_g=sch_g.state_dict(), scheduler_d=sch_d.state_dict(),
                    completed_steps=completed, torch_cpu_rng=torch.get_rng_state(), torch_mps_rng=torch.mps.get_rng_state(),
                    numpy_sampler_rng=copy.deepcopy(rng.bit_generator.state), sampler_group_order=order.tolist(),
                    sampler_next_group_position=completed % len(groups), sampler_cycle_boundary_rule=RULE,
                    sampler_group_keys=[[g[0]["case"], g[0]["pitch_bin"]] for g in groups],
                    generator_config=gc, discriminator_config=dc, data_gate_sha256=base.sha256(gate_path),
                    normalizer_mean=mean.tolist(), normalizer_scale=scale.tolist(), format="private_sifigan_corpus_pilot_v1")
                report["final_numeric_state_sha256"] = {key: tree_digest(full[key]) for key in STATE_KEYS}
                # The exact serialized payload preserves all six typed states,
                # training RNG streams and the original sampler cursor/rule.
                cpu_full = cpu_tree(full)
                full_digest = tree_digest(cpu_full)
                saved = save_torch_archive(output / "final_full_resume.pt", cpu_full, torch, FULL_MAX_BYTES)
                del full, cpu_full  # avoid retaining a second CPU copy during reload
                verify_full_roundtrip(output / saved["file"], torch, full_digest, groups, completed)
                report["final_generator_matches_full_state"] = verify_final_generator(
                    output / final_generator["file"], torch, report["final_numeric_state_sha256"]["generator"],
                    completed, gc, mean, scale, base.sha256(gate_path))
                report.update(checkpoint_file=saved["file"], checkpoint_sha256=saved["sha256"], checkpoint_bytes=saved["bytes"],
                    full_checkpoint_zip_crc_verified=saved["zip_crc_verified"], full_resume_available=True,
                    full_checkpoint_typed_state_sha256=full_digest, full_checkpoint_numeric_roundtrip_verified=True)
                report["status"] = "bounded_reconstruction_continuation_complete_not_perceptually_approved"
            else:
                report.update(status="generator_only_not_full_resume", full_checkpoint_skip_reason="insufficient700MB_full_plus20MB_aux_reserve_above12GiB")
            verify_bindings(bindings)
            if base.validate_upstream(upstream) != parent["upstream_bindings"]:
                raise RuntimeError("official_upstream_changed")
            report.update(phase="complete", final_resources=guard.snapshot(), parent_all_inputs_preserved=True,
                torch_version=str(torch.__version__), final_experiment_bytes_before_report=bytes_used(experiment_root))
            if report["final_experiment_bytes_before_report"] + REPORT_RESERVE > MAX_BYTES:
                raise RuntimeError("new900MB_disk_budget_exceeded")
            return report
    except Exception as error:
        report.update(status="failed", error_type=type(error).__name__, error_message=str(error), traceback=traceback.format_exc())
        raise
    finally:
        report["elapsed_seconds"] = time.monotonic() - started
        atomic_json(output / "report.json", report)


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent-report", type=Path, required=True)
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--steps", type=int, default=MAX_STEPS)
    args = parser.parse_args()
    run(args.parent_report, args.upstream, args.output, args.steps)
