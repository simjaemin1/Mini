#!/usr/bin/env python3
"""Bounded training-length-only continuation of the complete global1000 pilot.

No new data, sampling, normalization, loss, architecture, or output processing.
This adaptively chosen development experiment is not an untouched test.
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
import zipfile

import numpy as np
import probe_generator_mps as base
import resume_corpus_pilot as original_resume
from train_real_gate import cpu_tree, tree_digest
from train_corpus_pilot import FRAMES, HOP, RATE, SEED, select_groups, validate_file_splits

PARENT_STEP, MAX_STEPS = 1000, 2000
MAX_SECONDS, SOFT_SECONDS = 2100, 1800
GIB = 1024 ** 3
MAX_BYTES, UPDATE_RESERVE = 1_500_000_000, 1_000_000_000
FULL_MAX_BYTES, GENERATOR_RESERVE = 850_000_000, 70_000_000
REPORT_RESERVE = 2_000_000
RULE, STATE_KEYS = original_resume.RULE, original_resume.STATE_KEYS


def bytes_used(root):
    return sum(p.stat().st_size for p in Path(root).rglob("*") if p.is_file())


def reserve_available(root, reserve, *, free_bytes=None, used_bytes=None):
    """Conservative reserve; never deletes, borrows disk floor, or mutates caps."""
    free = shutil.disk_usage(root).free if free_bytes is None else free_bytes
    used = bytes_used(root) if used_bytes is None else used_bytes
    return (free >= 12 * GIB + reserve
            and used + reserve + REPORT_RESERVE <= MAX_BYTES)


def atomic_json(path, report):
    """Only own fresh-output progress/report files may be atomically replaced."""
    path = Path(path)
    temporary = path.with_name(path.name + ".writing")
    with temporary.open("x", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    temporary.chmod(0o600)
    os.replace(temporary, path)


def verify_bindings(bindings):
    if not bindings or any(base.sha256(p) != h for p, h in bindings.items()):
        raise ValueError("bound_original_code_data_or_checkpoint_changed")


def validate_parent(path, upstream):
    path = Path(path).resolve(strict=True)
    parent = json.loads(path.read_text())
    if (parent.get("schema") != "mini.sifigan-corpus-resume.v1"
            or parent.get("status") != "bounded_resume_complete_not_perceptually_approved"
            or parent.get("completed_steps") != PARENT_STEP or parent.get("seed") != SEED
            or parent.get("fit_groups") != 27 or parent.get("public_weights_used") is not False
            or parent.get("hyperparameters_changed") is not False
            or parent.get("heldout_used_for_optimizer") is not False
            or parent.get("quality_approved") is not False
            or parent.get("parent_final_baseline_reproduced") is not True):
        raise ValueError("complete_unchanged_global1000_parent_required")
    bindings = dict(parent["input_bindings"])
    verify_bindings(bindings)
    if base.validate_upstream(upstream) != parent["upstream_bindings"]:
        raise ValueError("bound_official_upstream_changed")
    # Existing original validator checks the bound 500-step ancestry, all35
    # inputs, original full checkpoint, official56 files and two original clips.
    ancestor_path = Path(parent["parent_report"]).resolve(strict=True)
    if str(ancestor_path) not in bindings:
        raise ValueError("bound_original500_ancestry_required")
    ancestor, ancestor_cp, _ = original_resume.validate_parent(ancestor_path, upstream)
    if (parent.get("parent_completed_steps") != 500
            or parent.get("parent_checkpoint") != str(ancestor_cp)
            or parent["data_gate"] != ancestor["data_gate"]
            or parent["evaluation_windows"] != ancestor["evaluation_windows"]):
        raise ValueError("original_sampler_gate_evaluation_ancestry_changed")
    checkpoint = path.parent / "final_full_resume.pt"
    if (base.sha256(checkpoint) != parent["checkpoint_sha256"]
            or checkpoint.stat().st_size != parent["checkpoint_bytes"]):
        raise ValueError("complete_parent1000_checkpoint_changed")
    recon = parent["reconstructions"]
    if len(recon) != 2 or {r["case"] for r in recon} != {"deepvib48", "arirang001"}:
        raise ValueError("two_fixed_parent_reconstructions_required")
    for row in recon:
        item = (path.parent / row["file"]).resolve(strict=True)
        if item.parent != path.parent or base.sha256(item) != row["sha256"]:
            raise ValueError("parent_reconstruction_changed")
        bindings[str(item)] = row["sha256"]
    bindings[str(path)], bindings[str(checkpoint)] = base.sha256(path), parent["checkpoint_sha256"]
    bindings[str(Path(__file__).resolve())] = base.sha256(__file__)
    return parent, checkpoint, bindings


def validate_sampler(state, groups, expected_step=PARENT_STEP):
    count, completed = len(groups), state["completed_steps"]
    order = state["sampler_group_order"]
    if (completed != expected_step or count != 27
            or state["sampler_group_keys"] != [[g[0]["case"], g[0]["pitch_bin"]] for g in groups]
            or sorted(order) != list(range(count)) or any(type(i) is not int for i in order)
            or state["sampler_next_group_position"] != completed % count
            or state["sampler_cycle_boundary_rule"] != RULE
            or state["numpy_sampler_rng"].get("bit_generator") != "PCG64"):
        raise ValueError("exact_saved27_group_sampler_rng_cursor_required")
    return np.asarray(order, dtype=np.int64)


def strict_restore(state, generator, discriminator, opt_g, opt_d, sch_g, sch_d,
                   expected_step=PARENT_STEP):
    if (state.get("completed_steps") != expected_step
            or state.get("format") != "private_sifigan_corpus_pilot_v1"):
        raise ValueError("complete_exact_training_state_required")
    objects = (generator, discriminator, opt_g, opt_d, sch_g, sch_d)
    for key, obj in zip(STATE_KEYS, objects):
        obj.load_state_dict(state[key], **({"strict": True} if key in STATE_KEYS[:2] else {}))
    hashes = {key: tree_digest(state[key]) for key in STATE_KEYS}
    if any(tree_digest(obj.state_dict()) != hashes[key] for key, obj in zip(STATE_KEYS, objects)):
        raise ValueError("typed_numeric_state_restore_mismatch")
    for optimizer in (opt_g, opt_d):
        counters = [float(v["step"].detach().cpu()) for v in optimizer.state.values() if "step" in v]
        if not counters or set(counters) != {float(expected_step)}:
            raise ValueError("all_Adam_counters_must_match_exact_global_step")
    if sch_g.last_epoch != expected_step or sch_d.last_epoch != expected_step:
        raise ValueError("scheduler_epochs_must_match_exact_global_step")
    return hashes


def save_torch_archive(path, payload, torch, maximum):
    """Finalize only complete CRC-verified new files; partial files are evidence."""
    path = Path(path)
    if path.exists():
        raise ValueError("checkpoint_overwrite_forbidden")
    partial = path.with_name(path.name + ".writing")
    with partial.open("xb") as handle:
        torch.save(payload, handle)
        handle.flush()
        os.fsync(handle.fileno())
    partial.chmod(0o600)
    if partial.stat().st_size > maximum:
        raise RuntimeError("checkpoint_size_ceiling_exceeded_partial_preserved")
    with zipfile.ZipFile(partial) as archive:
        if archive.testzip() is not None:
            raise RuntimeError("checkpoint_zip_CRC_failed_partial_preserved")
    checksum, size = base.sha256(partial), partial.stat().st_size
    os.replace(partial, path)
    if base.sha256(path) != checksum:
        raise RuntimeError("checkpoint_post_finalize_hash_changed")
    return dict(file=path.name, sha256=checksum, bytes=size, zip_crc_verified=True)


def verify_full_roundtrip(path, torch, expected_digest, groups, completed):
    """Reload only our finalized numeric archive, never untrusted pickle globals."""
    with torch.serialization.safe_globals([Counter]):
        restored = torch.load(path, map_location="cpu", weights_only=True)
    if tree_digest(restored) != expected_digest:
        raise RuntimeError("full_checkpoint_typed_numeric_roundtrip_mismatch")
    if (restored.get("format") != "private_sifigan_corpus_pilot_v1"
            or restored.get("completed_steps") != completed):
        raise RuntimeError("full_checkpoint_completed_step_or_format_mismatch")
    validate_sampler(restored, groups, expected_step=completed)
    for key in ("optimizer_g", "optimizer_d"):
        counters = [float(v["step"].detach().cpu()) for v in restored[key]["state"].values() if "step" in v]
        if not counters or set(counters) != {float(completed)}:
            raise RuntimeError("saved_full_checkpoint_Adam_counter_mismatch")
    if any(restored[key]["last_epoch"] != completed for key in ("scheduler_g", "scheduler_d")):
        raise RuntimeError("saved_full_checkpoint_scheduler_epoch_mismatch")
    del restored
    return True


def run(parent_report, upstream, output, additional_steps=MAX_STEPS):
    base.require_mps_environment()
    if type(additional_steps) is not int or not 1 <= additional_steps <= MAX_STEPS:
        raise ValueError("additional_step_ceiling2000")
    output = Path(output).resolve()
    private_root = (Path.home() / "Mini/_bgm/gpt").resolve()
    if output.exists() or not output.is_relative_to(private_root) or output.parent == private_root:
        raise ValueError("fresh_private_output_required")
    output.mkdir(mode=0o700)
    experiment_root = output.parent
    started = time.monotonic()
    report = dict(schema="mini.sifigan-corpus-extension.v1", status="started", phase="validate",
        seed=SEED, batch_size=1, frames=FRAMES, parent_completed_steps=PARENT_STEP, completed_steps=PARENT_STEP,
        additional_completed_steps=0, requested_additional_steps=additional_steps,
        max_seconds=MAX_SECONDS, soft_training_stop_seconds=SOFT_SECONDS, max_experiment_bytes=MAX_BYTES,
        update_disk_reserve_bytes=UPDATE_RESERVE, unchanged_training_recipe=True,
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
            if not reserve_available(experiment_root, UPDATE_RESERVE):
                raise ValueError("free_disk_must_include1GB_reserve_above12GiB")
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
            order = validate_sampler(state, groups)
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
            report["restored_numeric_state_sha256"] = strict_restore(state, generator, discriminator, opt_g, opt_d, sch_g, sch_d)
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
                                        or not np.allclose(generated, saved["generated"], rtol=1e-5, atol=1e-6)):
                                    raise ValueError("restored_baseline_not_parent1000:" + case)
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
            def save_generator():
                completed = report["completed_steps"]
                old = next((r for r in report["generator_snapshots"] if r["completed_steps"] == completed), None)
                if old:
                    if base.sha256(output / old["file"]) != old["sha256"]:
                        raise RuntimeError("existing_generator_snapshot_changed")
                    return old
                if not reserve_available(experiment_root, GENERATOR_RESERVE):
                    raise RuntimeError("insufficient_safe_generator_recovery_reserve")
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
            report["phase"] = "verify_parent1000_baseline"
            report["baseline"] = evaluate()
            original_resume.compare_evaluation(report["baseline"], parent["final"])
            report["baseline_reconstructions"] = reconstruct("baseline", verify=True)
            report["parent_final_baseline_reproduced"] = True
            restore_parent_rng(); del state
            atomic_json(output / "progress.json", report)
            counts, pitch_counts = Counter(), Counter()
            tick = time.monotonic()
            for index in range(PARENT_STEP, PARENT_STEP + additional_steps):
                if time.monotonic() - started > SOFT_SECONDS:
                    report["soft_stop_reason"] = "reserve_final_evaluation_and_recovery_time"; break
                if not reserve_available(experiment_root, UPDATE_RESERVE):
                    report["soft_stop_reason"] = "reserve1GB_above12GiB_before_update"; break
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
                if report["additional_completed_steps"] % 500 == 0:
                    save_generator()  # recovery survives later evaluation/full-save failure
                    report["intermediate_evaluations"].append(dict(step=index + 1, metrics=evaluate()))
                    atomic_json(output / "progress.json", report)
            if not report["additional_completed_steps"]:
                report.update(status="no_updates_resource_reserve_not_training_completion", phase="stopped")
                return report
            report.update(sampled_cases=dict(counts), sampled_pitch_bins=dict(pitch_counts), phase="save_generator_first")
            final_generator = save_generator()
            report.update(inference_checkpoint_file=final_generator["file"],
                inference_checkpoint_sha256=final_generator["sha256"], inference_checkpoint_bytes=final_generator["bytes"])
            report["phase"] = "fixed_final_evaluation"
            report["final"] = evaluate()
            report["reconstructions"] = reconstruct("final")
            atomic_json(output / "progress.json", report)
            # Capture RNG only after evaluations restored all three training streams.
            if reserve_available(experiment_root, UPDATE_RESERVE):
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
                report.update(checkpoint_file=saved["file"], checkpoint_sha256=saved["sha256"], checkpoint_bytes=saved["bytes"],
                    full_checkpoint_zip_crc_verified=saved["zip_crc_verified"], full_resume_available=True,
                    full_checkpoint_typed_state_sha256=full_digest, full_checkpoint_numeric_roundtrip_verified=True)
                report["status"] = "bounded_extension_complete_not_perceptually_approved"
            else:
                report.update(status="generator_only_not_full_resume", full_checkpoint_skip_reason="insufficient1GB_safe_save_reserve")
            verify_bindings(bindings)
            if base.validate_upstream(upstream) != parent["upstream_bindings"]:
                raise RuntimeError("official_upstream_changed")
            report.update(phase="complete", final_resources=guard.snapshot(), parent_all_inputs_preserved=True,
                torch_version=str(torch.__version__), final_experiment_bytes_before_report=bytes_used(experiment_root))
            if report["final_experiment_bytes_before_report"] + REPORT_RESERVE > MAX_BYTES:
                raise RuntimeError("new1point5GB_disk_budget_exceeded")
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
