#!/usr/bin/env python3
"""Deliberate R&D-only train entry point for the small PyTorch baseline.

It refuses implicit corpus discovery and requires the same explicit manifest
gate as the launcher.  Its outputs are experimental checkpoints/reports only.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path, PurePosixPath
import sys
from typing import Any

from baseline import BaselineConfig, build_score_to_source_filter, require_torch
from manifest import ManifestValidationError, validate_manifest_file


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train the R&D-only expressive-synthesis baseline")
    parser.add_argument("--manifest", required=True, help="One explicit R&D corpus JSON manifest")
    parser.add_argument("--output-dir", required=True, help="A new R&D-only output directory")
    parser.add_argument(
        "--confirm-rnd-only",
        action="store_true",
        help="Required acknowledgement: outputs are not default/game/public assets",
    )
    parser.add_argument("--device", default="cuda", help="PyTorch device, normally cuda on the RTX 4060")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--max-frames", type=int, default=128)
    parser.add_argument("--learning-rate", type=float, default=1.0e-3)
    parser.add_argument("--score-feature-dim", type=int, default=8)
    parser.add_argument("--hidden-size", type=int, default=96)
    parser.add_argument("--harmonic-count", type=int, default=16)
    parser.add_argument("--sample-rate-hz", type=int, default=16_000)
    parser.add_argument("--hop-size", type=int, default=160)
    return parser


def _inside_manifest_root(root: Path, relative_path: str) -> Path:
    candidate = (root / PurePosixPath(relative_path)).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise RuntimeError("validated tensor path unexpectedly escapes manifest root") from exc
    return candidate


def _require_array(archive: Any, key: str, *, dimensions: int) -> Any:
    if key not in archive.files:
        raise RuntimeError(f"explicit tensor archive is missing {key}")
    value = archive[key]
    if value.ndim != dimensions:
        raise RuntimeError(f"{key} must have {dimensions} dimensions")
    return value


def _load_entry(
    entry: dict[str, Any],
    *,
    manifest_root: Path,
    config: BaselineConfig,
    max_frames: int,
    numpy: Any,
) -> tuple[Any, Any, Any, Any]:
    if entry["native_source_span"]["sample_rate_hz"] != config.sample_rate_hz:
        raise RuntimeError(
            f"{entry['entry_id']} source sample rate does not match --sample-rate-hz; "
            "this baseline does not silently resample R&D tensors"
        )
    controls_path = _inside_manifest_root(manifest_root, entry["controls_npz"]["relative_path"])
    target_path = _inside_manifest_root(manifest_root, entry["target_npz"]["relative_path"])
    with numpy.load(controls_path, allow_pickle=False) as controls_archive:
        score_features = _require_array(controls_archive, "score_features", dimensions=2).astype(
            numpy.float32, copy=False
        )
        target_f0_hz = _require_array(controls_archive, "target_f0_hz", dimensions=1).astype(
            numpy.float32, copy=False
        )
        target_loudness_db = _require_array(
            controls_archive, "target_loudness_db", dimensions=1
        ).astype(numpy.float32, copy=False)
    with numpy.load(target_path, allow_pickle=False) as target_archive:
        waveform = _require_array(target_archive, "waveform", dimensions=1).astype(
            numpy.float32, copy=False
        )
    total_frames = score_features.shape[0]
    if score_features.shape[1] != config.score_feature_dim:
        raise RuntimeError(f"{entry['entry_id']} score_features has the wrong feature dimension")
    if target_f0_hz.shape[0] != total_frames or target_loudness_db.shape[0] != total_frames:
        raise RuntimeError(f"{entry['entry_id']} controls do not share the score_features frame count")
    if waveform.shape[0] != total_frames * config.hop_size:
        raise RuntimeError(
            f"{entry['entry_id']} waveform length must equal frames * hop_size; "
            "the baseline does not infer or pad timing"
        )
    frames = min(total_frames, max_frames)
    if frames < 2:
        raise RuntimeError(f"{entry['entry_id']} needs at least two frames")
    sample_count = frames * config.hop_size
    return (
        score_features[:frames],
        target_f0_hz[:frames],
        target_loudness_db[:frames],
        waveform[:sample_count],
    )


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.confirm_rnd_only:
        print("refusing train: pass --confirm-rnd-only after reviewing the R&D/rights gates", file=sys.stderr)
        return 2
    if args.epochs < 1 or args.max_frames < 2 or args.learning_rate <= 0.0:
        print("refusing train: epochs/max-frames/learning-rate are out of range", file=sys.stderr)
        return 2
    try:
        report = validate_manifest_file(args.manifest, verify_files=True)
    except ManifestValidationError as exc:
        print(f"refusing train: manifest rejected: {exc}", file=sys.stderr)
        return 2
    output_dir = Path(args.output_dir).expanduser().resolve()
    if output_dir.exists():
        print("refusing train: --output-dir must be a new directory", file=sys.stderr)
        return 2
    try:
        import numpy

        torch, _ = require_torch()
        config = BaselineConfig(
            score_feature_dim=args.score_feature_dim,
            hidden_size=args.hidden_size,
            harmonic_count=args.harmonic_count,
            sample_rate_hz=args.sample_rate_hz,
            hop_size=args.hop_size,
        )
        config.validate()
        if not args.device.startswith("cuda") or not torch.cuda.is_available():
            raise RuntimeError("this deliberate train entry point requires an available CUDA device")
        manifest_root = Path(args.manifest).expanduser().resolve().parent
        prepared_entries = [
            _load_entry(
                entry,
                manifest_root=manifest_root,
                config=config,
                max_frames=args.max_frames,
                numpy=numpy,
            )
            for entry in report["entries"]
        ]
        torch.manual_seed(17)
        model = build_score_to_source_filter(config).to(args.device)
        optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate)
    except (RuntimeError, ValueError) as exc:
        print(f"refusing train: {exc}", file=sys.stderr)
        return 2

    # Output creation happens only after all static gates, hardware checks, and
    # explicit tensor-shape checks have passed.
    try:
        output_dir.mkdir(parents=True, exist_ok=False)
    except FileExistsError:
        print("refusing train: --output-dir was created concurrently", file=sys.stderr)
        return 2
    history: list[float] = []
    for _ in range(args.epochs):
        epoch_losses: list[float] = []
        for score, target_f0, target_loudness, target_waveform in prepared_entries:
            score_tensor = torch.from_numpy(score).unsqueeze(0).to(args.device)
            f0_tensor = torch.from_numpy(target_f0).unsqueeze(0).to(args.device)
            loudness_tensor = torch.from_numpy(target_loudness).unsqueeze(0).to(args.device)
            waveform_tensor = torch.from_numpy(target_waveform).unsqueeze(0).to(args.device)
            # Fixed zero noise makes this minimal baseline's optimization path
            # reproducible; it is not an attempt to model a real performance.
            output = model(score_tensor, noise=torch.zeros_like(waveform_tensor))
            waveform_loss = torch.mean((output["waveform"] - waveform_tensor) ** 2)
            f0_loss = torch.mean(((output["f0_hz"] - f0_tensor) / config.f0_max_hz) ** 2)
            loudness_loss = torch.mean(
                ((output["loudness_db"] - loudness_tensor) / 80.0) ** 2
            )
            loss = waveform_loss + 0.05 * (f0_loss + loudness_loss)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            epoch_losses.append(float(loss.detach().cpu()))
        history.append(sum(epoch_losses) / len(epoch_losses))
    checkpoint_path = output_dir / "rnd_baseline_checkpoint.pt"
    torch.save(
        {
            "kind": "R&D-only expressive-synthesis baseline checkpoint; not a game asset",
            "config": config.__dict__,
            "state_dict": model.state_dict(),
            "manifest_sha256": report["manifest_sha256"],
        },
        checkpoint_path,
    )
    train_report = {
        "schema": "mini.expressive-synthesis.rnd-train-report.v1",
        "r_and_d_only": True,
        "not_default_asset": True,
        "not_runtime_bgm": True,
        "not_game_output": True,
        "not_public_release": True,
        "manifest_sha256": report["manifest_sha256"],
        "instrument": report["instrument"],
        "entry_count": len(prepared_entries),
        "epochs": args.epochs,
        "epoch_losses": history,
        "checkpoint_basename": checkpoint_path.name,
    }
    (output_dir / "rnd_train_report.json").write_text(
        json.dumps(train_report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(train_report, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
