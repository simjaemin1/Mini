#!/usr/bin/env python3
"""Two bounded real-data full GAN steps with disk checkpoint/resume validation.

Not a quality-trained instrument. No generated audio, pretrained weights,
data upload, reduced channels or automatic CPU fallback.
"""
import argparse
from collections import Counter
import copy
import hashlib
import json
import os
from pathlib import Path
import socket
import sys
import time
import traceback

import probe_generator_mps as base

FRAMES, HOP, SEED = 70, 120, 20261024
MAX_CHECKPOINT_BYTES = 850_000_000
FEATURE_SCHEMA = "mini.sifigan-real-features.v1"


def cpu_tree(value):
    """Device adapter only; retains tensor values and optimizer key structure."""
    import torch
    if isinstance(value, torch.Tensor):
        return value.detach().cpu()
    if isinstance(value, dict):
        result = copy.copy(value)
        for key, item in value.items():
            result[key] = cpu_tree(item)
        if hasattr(value, "_metadata"):
            result._metadata = cpu_tree(value._metadata)
        return result
    if isinstance(value, list):
        return [cpu_tree(item) for item in value]
    if isinstance(value, tuple):
        return tuple(cpu_tree(item) for item in value)
    return value


def tree_digest(value):
    """Hash numeric state independent of device or torch.save archive metadata."""
    import torch
    digest = hashlib.sha256()
    def visit(item):
        if isinstance(item, torch.Tensor):
            array = item.detach().cpu().contiguous().numpy()
            digest.update(json.dumps([str(array.dtype), list(array.shape)]).encode())
            digest.update(array.tobytes())
        elif isinstance(item, dict):
            digest.update(type(item).__name__.encode())
            for key in sorted(item, key=lambda k: (type(k).__name__, str(k))):
                visit(key)
                visit(item[key])
            if hasattr(item, "_metadata"):
                digest.update(b"state_dict_metadata")
                visit(item._metadata)
        elif isinstance(item, (list, tuple)):
            digest.update(type(item).__name__.encode())
            for child in item:
                visit(child)
        else:
            digest.update(json.dumps([type(item).__name__, item], allow_nan=False).encode())
        digest.update(b"\0")
    visit(value)
    return digest.hexdigest()


def validate_data(path):
    path = Path(path).resolve(strict=True)
    report = json.loads(path.read_text())
    if report.get("schema") != FEATURE_SCHEMA or report.get("status") != "complete":
        raise ValueError("completed_real_feature_manifest_required")
    bindings = {str(path): base.sha256(path)}
    for row in report["files"]:
        for file, expected in ((Path(row["source_path"]), row["source_sha256"]),
                               (path.parent / row["npz_file"], row["npz_sha256"])):
            if base.sha256(file) != expected:
                raise ValueError("original_or_feature_hash_changed")
            bindings[str(file)] = expected
    stats = path.parent / report.get("stats_file", "stats.npz")
    if base.sha256(stats) != report["stats_sha256"]:
        raise ValueError("fit_only_normalizer_hash_changed")
    bindings[str(stats)] = report["stats_sha256"]
    fits = {row["case"]: row for row in report["files"] if row["split"] == "fit"}
    holdouts = [row for row in report["files"] if row["split"] == "heldout"]
    if set(fits) != {"sus04", "vib39"} or len(holdouts) != 1:
        raise ValueError("fixed_two_fit_one_heldout_smoke_split_required")
    if {r["source_sha256"] for r in fits.values()} & {r["source_sha256"] for r in holdouts}:
        raise ValueError("source_file_split_leakage")
    return report, fits, bindings, stats


def run(upstream, manifest, output):
    base.require_mps_environment()
    output = Path(output).resolve()
    if output.exists():
        raise ValueError("fresh_output_required")
    output.mkdir(mode=0o700)
    started = time.monotonic()
    report = {"schema": "mini.sifigan-real-GAN-smoke.v1", "status": "started",
              "pretrained_weights_loaded": 0, "generated_audio_written": 0,
              "quality_approved": False, "training_convergence_established": False,
              "batch_size": 1, "frames": FRAMES, "sample_rate": 24000,
              "generator_updates": 0, "discriminator_updates": 0,
              "automatic_CPU_fallback": False, "max_seconds": 600,
              "steps": [], "phase": "validation"}
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "foundation-model-trial"))
    from ace_limits import GIB, ResourceCaps, ResourceGuard
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=600, max_rss_bytes=8 * GIB)) as guard:
            upstream = Path(upstream).resolve(strict=True)
            official = base.validate_upstream(upstream)
            data_report, fits, bindings, stats_path = validate_data(manifest)
            bindings[str(Path(__file__).resolve())] = base.sha256(__file__)
            bindings[str(Path(base.__file__).resolve())] = base.sha256(base.__file__)
            feature_code = Path(__file__).with_name("prepare_real_features.py").resolve()
            bindings[str(feature_code)] = base.sha256(feature_code)
            report.update(input_bindings=bindings, upstream_bindings=official,
                          source_credit="국악기 음원 제공 — 국립국악원 (공공누리 제1유형)")
            socket.create_connection = base.block_network
            socket.socket.connect = base.block_network
            socket.socket.connect_ex = base.block_network
            import numpy as np
            import torch
            import yaml
            if not torch.backends.mps.is_available():
                raise RuntimeError("MPS_required_no_CPU_fallback")
            torch.set_num_threads(4)
            torch.manual_seed(SEED)
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
            # Instrument-range override, not a change to the residual formula.
            rc = dict(tc["reg_loss"])
            rc.pop("_target_")
            rc.update(f0_floor=70, f0_ceil=1800)
            mc = dict(tc["mel_loss"])
            mc.pop("_target_")
            report.update(generator_config=gc, discriminator_config=dc,
                          residual_config=rc, mel_config=mc,
                          adaptation="B1 vs official B16; CPU excitation phase only; F0 70..1800; all G/D/losses MPS")
            report["phase"] = "model_and_loss_initialization"
            generator = SiFiGANGenerator(**gc).to("mps").train()
            discriminator = UnivNetMultiResolutionMultiPeriodDiscriminator(**dc).to("mps").train()
            mel = MelSpectralLoss(**mc).to("mps")
            residual = ResidualLoss(**rc).to("mps")
            ac, fc = dict(tc["adv_loss"]), dict(tc["fm_loss"])
            ac.pop("_target_"); fc.pop("_target_")
            adversarial, matching = AdversarialLoss(**ac), FeatureMatchLoss(**fc)
            go, do = dict(tc["generator_optimizer"]), dict(tc["discriminator_optimizer"])
            go.pop("_target_"); do.pop("_target_")
            opt_g, opt_d = torch.optim.Adam(generator.parameters(), **go), torch.optim.Adam(discriminator.parameters(), **do)
            schedule = {"milestones": [100000, 200000, 300000, 400000], "gamma": 0.5}
            sch_g, sch_d = torch.optim.lr_scheduler.MultiStepLR(opt_g, **schedule), torch.optim.lr_scheduler.MultiStepLR(opt_d, **schedule)
            report.update(generator_parameters=sum(p.numel() for p in generator.parameters()),
                          discriminator_parameters=sum(p.numel() for p in discriminator.parameters()))
            print(json.dumps({"phase": "full_models_initialized", "G_parameters": report["generator_parameters"],
                              "D_parameters": report["discriminator_parameters"]}), flush=True)
            projected = 12 * (report["generator_parameters"] + report["discriminator_parameters"])
            if projected > MAX_CHECKPOINT_BYTES:
                raise RuntimeError("predicted_full_resume_checkpoint_exceeds_disk_budget")
            with np.load(stats_path, allow_pickle=False) as archive:
                mean, scale = archive["mean"].copy(), archive["scale"].copy()
            if mean.shape != (43,) or scale.shape != (43,) or np.any(scale <= 0):
                raise ValueError("43_dimension_fit_only_normalizer_required")
            signal = SignalGenerator(sample_rate=24000, hop_size=HOP, sine_amp=.1, noise_amp=.003, signal_types=["sine"])
            def batch(case):
                row = fits[case]
                with np.load(Path(manifest).parent / row["npz_file"], allow_pickle=False) as archive:
                    begin = 20
                    f = archive["f0"][begin:begin + FRAMES].copy()
                    cf = archive["cf0"][begin:begin + FRAMES].copy()
                    c = ((archive["features"][begin:begin + FRAMES] - mean) / scale).astype(np.float32)
                    y = archive["waveform"][begin * HOP:(begin + FRAMES) * HOP].copy()
                if c.shape != (FRAMES, 43) or y.shape != (FRAMES * HOP,) or not np.isfinite(c).all():
                    raise ValueError("exact_real_audio_feature_crop_required")
                z = signal(torch.from_numpy(cf).reshape(1, 1, -1)).float().to("mps")
                ds, cumulative = [], 1
                for factor, dense in zip(gc["upsample_scales"], [.5, 1, 4, 8]):
                    cumulative *= factor
                    d = np.repeat(dilated_factor(cf.copy(), 24000, dense), cumulative).astype(np.float32)
                    ds.append(torch.from_numpy(d).reshape(1, 1, -1).to("mps"))
                return z, torch.from_numpy(c.T.copy()).unsqueeze(0).to("mps"), ds, torch.from_numpy(y).reshape(1, 1, -1).to("mps"), torch.from_numpy(f).reshape(1, 1, -1).to("mps")
            def finite_gradients(model):
                count = 0
                for name, parameter in model.named_parameters():
                    if parameter.grad is not None:
                        if not bool(torch.isfinite(parameter.grad).all().cpu()):
                            raise RuntimeError("nonfinite_gradient:" + name)
                        count += 1
                if not count:
                    raise RuntimeError("missing_all_gradients")
                return count
            def step(case, number):
                tick = time.monotonic()
                report["phase"] = "full_G_D_step_" + str(number)
                z, c, ds, y, f0 = batch(case)
                opt_g.zero_grad(set_to_none=True)
                opt_d.zero_grad(set_to_none=True)
                predicted, source = generator(z, c, ds)
                ml, rl = mel(predicted, y), residual(source, y, f0)
                fake, ff = discriminator(predicted, return_fmaps=True)
                with torch.no_grad():
                    real, rf = discriminator(y, return_fmaps=True)
                fl, al = matching(ff, rf), adversarial(fake)
                if len(fake) != 8:
                    raise RuntimeError("full_eight_discriminator_heads_required")
                total = 45 * ml + rl + 2 * fl + al
                if not bool(torch.isfinite(total).cpu()):
                    raise RuntimeError("nonfinite_generator_loss")
                before_g = next(generator.parameters()).detach().clone()
                total.backward()
                ng = finite_gradients(generator)
                torch.nn.utils.clip_grad_norm_(generator.parameters(), 10, error_if_nonfinite=True)
                opt_g.step(); sch_g.step()
                changed_g = not torch.equal(before_g, next(generator.parameters()))
                report["generator_updates"] += 1
                del predicted, source, fake, real, ff, rf, total
                opt_d.zero_grad(set_to_none=True)
                with torch.no_grad():
                    predicted = generator(z, c, ds)[0]
                fake_loss, real_loss = adversarial(discriminator(predicted.detach()), discriminator(y))
                dl = fake_loss + real_loss
                if not bool(torch.isfinite(dl).cpu()):
                    raise RuntimeError("nonfinite_discriminator_loss")
                before_d = next(discriminator.parameters()).detach().clone()
                dl.backward()
                nd = finite_gradients(discriminator)
                torch.nn.utils.clip_grad_norm_(discriminator.parameters(), 10, error_if_nonfinite=True)
                opt_d.step(); sch_d.step()
                report["discriminator_updates"] += 1
                changed_d = not torch.equal(before_d, next(discriminator.parameters()))
                torch.mps.synchronize()
                if not changed_g or not changed_d:
                    raise RuntimeError("G_and_D_parameter_update_required")
                report["steps"].append({"step": number, "case": case, "seconds": time.monotonic() - tick,
                    "mel": float(ml.detach().cpu()), "residual": float(rl.detach().cpu()),
                    "feature_matching": float(fl.detach().cpu()), "generator_adversarial": float(al.detach().cpu()),
                    "discriminator": float(dl.detach().cpu()), "G_gradient_tensors": ng, "D_gradient_tensors": nd,
                    "G_parameter_changed": changed_g, "D_parameter_changed": changed_d})
                print(json.dumps({"phase": "real_G_D_step_complete", **report["steps"][-1]}), flush=True)
            # Explicit adversarial-active step1, not upstream step0's mel-only warmup.
            step("vib39", 1)
            report["phase"] = "checkpoint_save_and_reload"
            state = {"generator": generator.state_dict(), "discriminator": discriminator.state_dict(),
                     "optimizer_g": opt_g.state_dict(), "optimizer_d": opt_d.state_dict(),
                     "scheduler_g": sch_g.state_dict(), "scheduler_d": sch_d.state_dict(),
                     "completed_steps": 1, "torch_cpu_rng": torch.get_rng_state(),
                     "torch_mps_rng": torch.mps.get_rng_state(), "format": "private_full_G_D_resume_smoke_v1"}
            expected = tree_digest(state)
            checkpoint = output / "step1_full_resume.pt"
            with checkpoint.open("xb") as handle:
                torch.save(cpu_tree(state), handle)
            checkpoint.chmod(0o600)
            if checkpoint.stat().st_size > MAX_CHECKPOINT_BYTES:
                raise RuntimeError("checkpoint_disk_budget_exceeded")
            # Our own just-written checkpoint; allow only stdlib Counter for scheduler milestones.
            with torch.serialization.safe_globals([Counter]):
                restored = torch.load(checkpoint, map_location="cpu", weights_only=True)
            if tree_digest(restored) != expected:
                raise RuntimeError("serialized_state_not_identical")
            with torch.no_grad():
                next(generator.parameters()).add_(1)
            generator.load_state_dict(restored["generator"], strict=True)
            discriminator.load_state_dict(restored["discriminator"], strict=True)
            opt_g.load_state_dict(restored["optimizer_g"]); opt_d.load_state_dict(restored["optimizer_d"])
            sch_g.load_state_dict(restored["scheduler_g"]); sch_d.load_state_dict(restored["scheduler_d"])
            torch.set_rng_state(restored["torch_cpu_rng"])
            torch.mps.set_rng_state(restored["torch_mps_rng"])
            actual = {"generator": generator.state_dict(), "discriminator": discriminator.state_dict(),
                      "optimizer_g": opt_g.state_dict(), "optimizer_d": opt_d.state_dict(),
                      "scheduler_g": sch_g.state_dict(), "scheduler_d": sch_d.state_dict(),
                      "completed_steps": 1, "torch_cpu_rng": torch.get_rng_state(),
                      "torch_mps_rng": torch.mps.get_rng_state(), "format": state["format"]}
            if tree_digest(actual) != expected:
                raise RuntimeError("live_resumed_training_state_not_identical")
            report.update(checkpoint_bytes=checkpoint.stat().st_size, checkpoint_sha256=base.sha256(checkpoint),
                          checkpoint_full_state_sha256=expected, checkpoint_exact_reload=True,
                          deliberately_perturbed_G_weight_restored=True)
            print(json.dumps({"phase": "full_checkpoint_exactly_reloaded", "bytes": report["checkpoint_bytes"]}), flush=True)
            del state, restored, actual
            step("sus04", 2)
            for optimizer in (opt_g, opt_d):
                if any(float(item["step"].cpu()) != 2 for item in optimizer.state.values()):
                    raise RuntimeError("resumed_Adam_step_counter_not_two")
            if any(base.sha256(path) != digest for path, digest in bindings.items()) or base.validate_upstream(upstream) != official:
                raise RuntimeError("immutable_input_or_code_changed")
            report.update(status="full_real_GAN_steps_and_disk_resume_passed_not_quality_trained",
                          phase="complete", final_resources=guard.snapshot(),
                          torch_version=str(torch.__version__), heldout_consumed_by_optimizer=False)
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
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    run(args.upstream, args.manifest, args.output)
