"""Bounded scratch NSF pilot, public NGC only; operator explicitly starts it.

No fallback, resume, external weights, uploads, or waveform pointwise loss.
The heldout selection is fixed first1s per heldout file and is not blind.
"""
import argparse
from dataclasses import asdict
import json
import math
import os
from pathlib import Path
import random
import sys
import time

import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "foundation-model-trial"))
from ace_limits import ResourceCaps, ResourceGuard
from prepare_inputs import fresh_private_dir
import nsf_lite
import nsf_losses
import nsf_pilot_data as data

SCHEMA = "mini.public-ngc-nsf-scratch-pilot.v1"


def write_json(path, value, exclusive=False):
    flags = os.O_WRONLY | os.O_CREAT | (os.O_EXCL if exclusive else os.O_TRUNC)
    with os.fdopen(os.open(path, flags, 0o600), "w") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)


def evaluate(model, heldout, gain):
    model.eval()
    results = []
    with torch.no_grad():
        for index, row in enumerate(heldout):
            frames = min(100, len(row["pitch_hz"]))
            target, controls = data.batch_from_windows([(row, 0, frames)], gain)
            predicted, _facts = model(*controls, noise_seed=data.SEED + 100000 + index)
            loss, terms = nsf_losses.nsf_loss(predicted, target)
            results.append({"source_sha256": row["source_sha256"], "start_frame": 0,
                "frames": frames, "noise_seed": data.SEED + 100000 + index,
                "total": float(loss), **{key: float(value) for key, value in terms.items()}})
    model.train()
    return {"total": sum(row["total"] for row in results) / len(results), "windows": results}


def save_checkpoint(output, name, model, step, metadata_sha, validation, metadata):
    path = output / f"{name}.pt"
    temporary = output / f".{name}.tmp"
    torch.save({"schema": SCHEMA, "step": step, "metadata_sha256": metadata_sha,
                "model_config": metadata["model_config"],
                "target_gain": metadata["data"]["target_gain"],
                "target_gain_db": metadata["data"]["target_gain_db"],
                "fit_voiced_rms_db_median_scaled": metadata["data"]["fit_voiced_rms_db_median_scaled"],
                "manifest_sha256": metadata["data"]["manifest_sha256"],
                "nsf_lite_sha256": metadata["code_sha256"][str(Path(nsf_lite.__file__))],
                "validation_total": validation, "state_dict": {
                    key: value.detach().cpu().clone() for key, value in model.state_dict().items()}}, temporary)
    os.replace(temporary, path)
    if sum(file.stat().st_size for file in output.glob("*.pt")) > 3_000_000:
        raise ValueError("two_checkpoint_budget_exceeded")
    return {"file": path.name, "step": step, "sha256": data.digest(path), "bytes": path.stat().st_size}


def run(args):
    if not 1 <= args.steps <= 1500 or not 0 < args.max_seconds <= 900:
        raise ValueError("pilot_limit_1500steps_900seconds")
    if args.device == "mps" and not torch.backends.mps.is_available():
        raise ValueError("requested_mps_unavailable_no_fallback")
    os.umask(0o077)
    output = fresh_private_dir(args.output)
    started = time.monotonic()
    caps = ResourceCaps(max_seconds=args.max_seconds)
    report = {"schema": SCHEMA, "status": "started", "training_steps_completed": 0,
              "history": [], "training_crop_audit": [], "quality_approved": False}
    write_json(output / "report.json", report)
    try:
        with ResourceGuard(output, caps):
            fit, heldout, binding = data.load_dataset(args.manifest)
            torch.manual_seed(data.SEED)
            torch.set_num_threads(1)
            model = nsf_lite.NSFLite().to(args.device)
            optimizer = torch.optim.Adam(model.parameters(), lr=.001)
            code = {str(path): data.digest(path) for path in
                    (Path(__file__), Path(nsf_lite.__file__), Path(nsf_losses.__file__),
                     Path(data.__file__), HERE.parent / "foundation-model-trial/ace_limits.py")}
            config = {"channels": 16, "dilations": [1, 2, 4, 8, 16, 32], "harmonics": 8,
                      "fir_taps": 65, "sample_rate": 24000, "control_hz": 100}
            metadata = {"schema": SCHEMA, "data": binding, "model_config": config,
                "parameter_count": sum(p.numel() for p in model.parameters()), "device": args.device,
                "torch_version": str(torch.__version__), "steps_requested": args.steps,
                "caps": asdict(caps), "batch_size": data.BATCH_SIZE, "crop_frames": data.CROP_FRAMES,
                "crop_seed": data.SEED, "noise_seed_formula": "20261016 + training step (1-based)",
                "sampler": "uniform over all valid fit32-frame window starts; heldout never sampled",
                "validation": "fixed first100frames per heldout file; separate fixed seeds; not blind",
                "optimizer": {"name": "Adam", "lr": .001, "gradient_norm_cap": 1.},
                "loss_weights": nsf_losses.LOSS_WEIGHTS, "spectral_loss_device": "cpu_with_autograd_copy",
                "pointwise_waveform_loss": False, "code_sha256": code,
                "external_weights_or_AIHub_used": False, "checkpoint_policy": "best.pt+latest.pt; own weights only"}
            write_json(output / "metadata.json", metadata, exclusive=True)
            metadata_sha = data.digest(output / "metadata.json")
            report.update(metadata_sha256=metadata_sha, model_config=config, target_gain=binding["target_gain"])
            rng, best = random.Random(data.SEED), math.inf
            for step in range(args.steps + 1):
                if step:
                    if time.monotonic() - started > args.max_seconds - 25:
                        report["status"] = "time_limit_partial_no_auto_continuation"
                        break
                    windows = data.sample_fit_windows(fit, rng)
                    target, controls = data.batch_from_windows(windows, binding["target_gain"])
                    optimizer.zero_grad(set_to_none=True)
                    predicted, _facts = model(*controls, noise_seed=data.SEED + step)
                    loss, terms = nsf_losses.nsf_loss(predicted, target)
                    loss.backward()
                    norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1., error_if_nonfinite=True)
                    optimizer.step()
                    report["training_steps_completed"] = step
                    report["training_crop_audit"].append({"step": step, "noise_seed": data.SEED + step,
                        "crops": [{"source_sha256": row["source_sha256"], "start_frame": start}
                                  for row, start, _frames in windows]})
                if step % 100 == 0 or step == args.steps:
                    validation = evaluate(model, heldout, binding["target_gain"])
                    entry = {"step": step, "elapsed_seconds": time.monotonic() - started,
                             "validation": validation}
                    if step: entry.update(train_total=float(loss.detach()), gradient_norm_before_clip=float(norm),
                        train_terms={key: float(value.detach()) for key, value in terms.items()})
                    report["history"].append(entry)
                    report["latest"] = save_checkpoint(output, "latest", model, step, metadata_sha, validation["total"], metadata)
                    if validation["total"] < best:
                        best = validation["total"]
                        report["best"] = save_checkpoint(output, "best", model, step, metadata_sha, best, metadata)
                    write_json(output / "report.json", report)
                    print(json.dumps({"step": step, "validation_total": validation["total"],
                                      "elapsed_seconds": entry["elapsed_seconds"]}), flush=True)
            else:
                report["status"] = "completed_not_quality_approved"
            data.verify_bindings({**binding["input_bindings"], **code,
                                  str(output / "metadata.json"): metadata_sha})
            report["immutable_inputs_and_code_unchanged"] = True
    except BaseException as exc:
        report.update(status="failed", error_type=type(exc).__name__, error=str(exc)[:1500])
        raise
    finally:
        report["elapsed_seconds"] = time.monotonic() - started
        write_json(output / "report.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--device", choices=("cpu", "mps"), required=True)
    parser.add_argument("--steps", type=int, default=500)
    parser.add_argument("--max-seconds", type=float, default=900)
    run(parser.parse_args())
