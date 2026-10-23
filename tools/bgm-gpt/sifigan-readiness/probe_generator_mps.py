#!/usr/bin/env python3
"""Bounded, synthetic full SiFi-GAN generator MPS forward/backward probe.

No recordings, pretrained weights, optimizer steps, saved audio or checkpoints.
Passing this probe does not establish full training readiness or sound quality.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import traceback

REVISION = "cdb20daeb4da4a126077819091706ee90522c7a8"
FRAMES = 32
SEED = 20261023


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def validate_upstream(root):
    root = Path(root).resolve(strict=True)
    head = subprocess.check_output(
        ["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    state = subprocess.check_output(
        ["git", "-C", str(root), "status", "--porcelain"], text=True)
    if head != REVISION or state:
        raise ValueError("clean_pinned_official_checkout_required")
    paths = subprocess.check_output(
        ["git", "-C", str(root), "ls-files", "-z"]).decode().split("\0")
    return {p: sha256(root / p) for p in paths if p}


def block_network(*_args, **_kwargs):
    raise RuntimeError("network_disabled_for_synthetic_probe")


def require_mps_environment():
    if os.environ.get("PYTORCH_ENABLE_MPS_FALLBACK") != "0":
        raise ValueError("explicit_MPS_fallback_disabled_required")
    if os.environ.get("PYTHONDONTWRITEBYTECODE") != "1":
        raise ValueError("disable_upstream_bytecode_writes_required")


def write_report(path, report):
    with path.open("x", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")
    path.chmod(0o600)


def run(root, output):
    require_mps_environment()
    root = Path(root).resolve(strict=True)
    output = Path(output).resolve()
    if output.exists():
        raise ValueError("new_output_directory_required")
    output.mkdir(mode=0o700)
    started = time.monotonic()
    report = {
        "schema": "mini.sifigan-synthetic-generator-mps.v1",
        "status": "started", "upstream_revision": REVISION,
        "synthetic_only": True, "recordings_read": 0,
        "pretrained_weights_loaded": 0, "optimizer_steps": 0,
        "audio_files_written": 0, "checkpoints_written": 0,
        "full_training_readiness_established": False,
        "sound_quality_established": False, "frames": FRAMES, "seed": SEED,
        "backend_fallback_enabled": False,
    }
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "foundation-model-trial"))
    from ace_limits import GIB, ResourceCaps, ResourceGuard
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=300, max_rss_bytes=8 * GIB)) as guard:
            bindings = validate_upstream(root)
            report["input_bindings"] = bindings
            report["probe_sha256"] = sha256(__file__)
            socket.create_connection = block_network
            socket.socket.connect = block_network
            socket.socket.connect_ex = block_network
            import numpy as np
            import torch
            import yaml
            if not torch.backends.mps.is_available():
                raise RuntimeError("MPS_unavailable_no_CPU_fallback")
            sys.path.insert(0, str(root))
            from sifigan.models import SiFiGANGenerator
            from sifigan.utils.features import SignalGenerator, dilated_factor
            config = yaml.safe_load((root / "sifigan/bin/config/generator/sifigan.yaml").read_text())
            data = yaml.safe_load((root / "sifigan/bin/config/data/namine_ritsu.yaml").read_text())
            if config.pop("_target_") != "sifigan.models.SiFiGANGenerator":
                raise ValueError("official_full_generator_config_required")
            report["generator_config"] = config
            rate, hop = data["sample_rate"], data["hop_size"]
            if (rate, hop, config["in_channels"], config["channels"]) != (24000, 120, 43, 512):
                raise ValueError("expected_full_size_24k_configuration_required")
            torch.set_num_threads(4)
            torch.manual_seed(SEED)
            np.random.seed(SEED)
            control_time = torch.arange(FRAMES, dtype=torch.float64) * hop / rate
            f0_cpu = (220 * torch.pow(2.0, 12 * torch.sin(2 * torch.pi * 5 * control_time) / 1200))
            f0_cpu = f0_cpu.float().reshape(1, 1, FRAMES)
            # Official training Collater makes phase on CPU (float64), then transfers inputs.
            excitation_cpu = SignalGenerator(
                sample_rate=rate, hop_size=hop, sine_amp=data["sine_amp"],
                noise_amp=data["noise_amp"], signal_types=data["signal_types"])(f0_cpu)
            excitation = excitation_cpu.float().to("mps")
            conditioning = (0.1 * torch.randn(1, config["in_channels"], FRAMES)).to("mps")
            factors, cumulative = [], 1
            f0_numpy = f0_cpu.numpy().reshape(-1)
            for scale, dense in zip(config["upsample_scales"], data["dense_factors"]):
                cumulative *= scale
                # Mirrors Collater: full sample_rate in dilated_factor, then repeat per stage.
                values = np.repeat(dilated_factor(f0_numpy.copy(), rate, dense), cumulative)
                factors.append(torch.from_numpy(values.astype(np.float32)).reshape(1, 1, -1).to("mps"))
            model = SiFiGANGenerator(**config).to("mps").train()
            if any(p.device.type != "mps" for p in model.parameters()):
                raise RuntimeError("all_generator_parameters_must_be_on_MPS")
            report.update({"torch_version": torch.__version__, "device": "mps",
                           "parameter_count": sum(p.numel() for p in model.parameters()),
                           "sample_rate": rate, "hop_size": hop,
                           "dilation_shapes": [list(d.shape) for d in factors],
                           "excitation_phase_device": "cpu_float64_then_float32_MPS",
                           "initial_resources": guard.initial})
            torch.mps.synchronize()
            step_start = time.monotonic()
            waveform, source = model(excitation, conditioning, factors)
            for tensor in (waveform, source):
                if tensor.device.type != "mps" or tuple(tensor.shape) != (1, 1, FRAMES * hop):
                    raise RuntimeError("MPS_output_shape_mismatch")
                if not bool(torch.isfinite(tensor).all().cpu()):
                    raise RuntimeError("nonfinite_synthetic_output")
            # Diagnostic loss only: not the official GAN/residual/mel training criterion.
            loss = (waveform - excitation).square().mean() + (source - excitation).square().mean()
            loss.backward()
            torch.mps.synchronize()
            report["forward_backward_seconds"] = time.monotonic() - step_start
            missing, zero, finite = [], [], []
            for name, parameter in model.named_parameters():
                if parameter.grad is None:
                    missing.append(name)
                    continue
                grad = parameter.grad.detach().cpu()
                if not bool(torch.isfinite(grad).all()):
                    raise RuntimeError("nonfinite_gradient:" + name)
                (finite if bool(torch.count_nonzero(grad)) else zero).append(name)
            if not finite:
                raise RuntimeError("no_nonzero_finite_generator_gradients")
            report.update({"output_shapes": [list(waveform.shape), list(source.shape)],
                           "diagnostic_loss": float(loss.detach().cpu()),
                           "nonzero_finite_gradient_tensors": len(finite),
                           "zero_gradient_tensors": zero, "no_gradient_tensors": missing,
                           "final_resources": guard.snapshot()})
            if bindings != validate_upstream(root):
                raise RuntimeError("official_checkout_changed")
            report["status"] = "synthetic_generator_forward_backward_passed_not_training_ready"
    except Exception as exc:
        report.update({"status": "synthetic_probe_failed", "error_type": type(exc).__name__,
                       "error_message": str(exc), "traceback": traceback.format_exc()})
        raise
    finally:
        report["elapsed_seconds"] = time.monotonic() - started
        write_report(output / "report.json", report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    run(args.upstream, args.output)


if __name__ == "__main__":
    os.umask(0o077)
    main()
