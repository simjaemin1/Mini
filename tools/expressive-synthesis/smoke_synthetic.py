#!/usr/bin/env python3
"""CPU-only deterministic synthetic smoke test for the R&D baseline.

It has no corpus input and writes neither checkpoints nor audio files.  Its
sole purpose is to make a small forward/backward pass catch incompatible
PyTorch installations before a separately approved experiment is considered.
"""

from __future__ import annotations

import argparse
import json

from baseline import BaselineConfig, build_score_to_source_filter, require_torch


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the CPU-only synthetic expressive-synthesis smoke test")
    parser.add_argument(
        "--device",
        choices=("cpu",),
        default="cpu",
        help="Intentionally restricted to CPU so this is never a GPU/train action",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    torch, _ = require_torch()
    torch.manual_seed(7)
    torch.set_num_threads(1)
    config = BaselineConfig(
        score_feature_dim=4,
        hidden_size=16,
        harmonic_count=6,
        sample_rate_hz=8_000,
        hop_size=40,
    )
    model = build_score_to_source_filter(config).to(args.device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1.0e-3)
    frames = 8
    # A fixed ramp is synthetic score-like input, not a transcription.
    score_features = torch.linspace(-1.0, 1.0, frames * config.score_feature_dim).reshape(
        1, frames, config.score_feature_dim
    )
    sample_count = frames * config.hop_size
    timeline = torch.arange(sample_count, dtype=torch.float32) / float(config.sample_rate_hz)
    target = (0.025 * torch.sin(2.0 * torch.pi * 220.0 * timeline)).reshape(1, -1)
    zero_noise = torch.zeros_like(target)
    losses: list[float] = []
    for _ in range(2):
        optimizer.zero_grad(set_to_none=True)
        output = model(score_features, noise=zero_noise)
        loss = torch.mean((output["waveform"] - target) ** 2)
        loss.backward()
        optimizer.step()
        losses.append(float(loss.detach().cpu()))
    print(
        json.dumps(
            {
                "schema": "mini.expressive-synthesis.synthetic-smoke.v1",
                "device": args.device,
                "uses_real_corpus": False,
                "writes_model_or_audio": False,
                "frames": frames,
                "sample_count": sample_count,
                "losses": losses,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
