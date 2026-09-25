#!/usr/bin/env python3
"""Pure CPU-only synthetic smoke check for the transfer configuration.

It does not import TensorFlow, DDSP, MIDI-DDSP, a checkpoint, or any dataset.
The arithmetic only verifies that the 8GiB profile's micro-batch accumulation
contract is internally consistent before a separately approved WSL dry-run.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

from transfer_readiness import EXPECTED_MEMORY_PROFILE, validate_fine_tune_config


def run_cpu_synthetic_smoke(config_path: Path) -> dict[str, object]:
    config = validate_fine_tune_config(config_path)
    profile = config["memory_profile"]
    accumulation = int(profile["gradient_accumulation_steps"])
    batch_size = int(profile["batch_size_per_gpu"])
    synthetic_micro_losses = [float(index + 1) / 100.0 for index in range(accumulation)]
    accumulated_mean = sum(synthetic_micro_losses) / accumulation
    effective_examples = batch_size * accumulation
    if effective_examples != EXPECTED_MEMORY_PROFILE["effective_batch_size"]:
        raise RuntimeError("synthetic effective batch does not equal the fixed 8GiB profile")
    if not 0.0 < accumulated_mean < 1.0:
        raise RuntimeError("synthetic accumulation arithmetic is invalid")
    return {
        "schema": "mini.midi-ddsp-transfer-train.cpu-synthetic-smoke.v1",
        "passed": True,
        "device": "cpu",
        "synthetic_micro_batch_count": accumulation,
        "synthetic_effective_examples": effective_examples,
        "synthetic_mean_loss": accumulated_mean,
        "model_checkpoint_dataset_or_audio_loaded": False,
        "model_training_performed": False,
        "default_bgm_changed": False,
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args(argv)
    print(json.dumps(run_cpu_synthetic_smoke(args.config), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
