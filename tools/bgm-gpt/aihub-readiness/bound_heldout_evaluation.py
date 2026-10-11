#!/usr/bin/env python3
"""Bind an unmodified private held-out evaluation to its exact checkpoint.

The ongoing training script is intentionally not changed: its own SHA-256 is
part of every checkpoint.  This wrapper checks the checkpoint immediately
before and after a fresh evaluation, then writes a separate 0600 binding into
the private result directory.  An evaluation result without that binding is
*incomplete*, even when ``heldout_report.json`` exists.

No AI Hub audio, checkpoint tensor, source name, or private path is printed.
Only aggregate status codes leave this process.  This is local R&D, not a
game-asset or publication path.  The Python socket guard in the evaluator is
not an operating-system network sandbox.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from typing import Any, Callable
import wave

import mac_mps_ddsp_long_trial as trial
import mac_mps_ddsp_pilot as pilot


SCHEMA = "mini.aihub-71470-heldout-checkpoint-binding.v1"
BINDING_NAME = "checkpoint_binding.json"
REPORT_NAME = "heldout_report.json"
MAX_REPORT_BYTES = 16_384
MAX_CHILD_OUTPUT_BYTES = 4_096
EXPECTED_STEP = 1_000
PAIR_SAMPLES = 4 * 16_000
MAX_PAIR_BYTES = 2 * PAIR_SAMPLES + 4_096


class BindingError(Exception):
    """A fixed, non-private reason that is safe to print."""


def _digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _json_private(path: Path, *, max_bytes: int) -> tuple[dict[str, Any], str]:
    try:
        payload = pilot._private_file(path, max_bytes=max_bytes)
        value = json.loads(payload)
    except (pilot.PilotError, ValueError, UnicodeError) as exc:
        raise BindingError("private_json_invalid") from exc
    if not isinstance(value, dict):
        raise BindingError("private_json_invalid")
    return value, _digest(payload)


def _script_digest() -> str:
    return _digest(Path(trial.__file__).read_bytes())


def _checkpoint_snapshot(folder: Path) -> dict[str, Any]:
    """Read only the latest marker and hash the matching private .pt bytes."""
    try:
        pilot._private_dir(folder)
        located = trial._checkpoint_marker(folder)
        if located is None:
            raise BindingError("checkpoint_missing")
        marker, checkpoint_path = located
        step = marker["step"]
        if step != EXPECTED_STEP:
            raise BindingError("checkpoint_not_1000_steps")
        marker_path = folder / f"checkpoint_step_{step:06d}.json"
        marker_payload = pilot._private_file(marker_path, max_bytes=4_096)
        checkpoint_info = checkpoint_path.lstat()
        if (not stat.S_ISREG(checkpoint_info.st_mode)
                or stat.S_IMODE(checkpoint_info.st_mode) & 0o077):
            raise BindingError("checkpoint_permissions_invalid")
        return {
            "step": step,
            "marker_sha256": _digest(marker_payload),
            "checkpoint_sha256": marker["sha256"],
            "checkpoint_bytes": checkpoint_info.st_size,
            # An inode is compared locally across the evaluation but not exported.
            "_inode": (checkpoint_info.st_dev, checkpoint_info.st_ino),
            "_path": checkpoint_path,
        }
    except (pilot.PilotError, trial.TrialError, OSError, KeyError, TypeError) as exc:
        raise BindingError("checkpoint_snapshot_invalid") from exc


def _same_checkpoint(before: dict[str, Any], after: dict[str, Any]) -> None:
    for key in ("step", "marker_sha256", "checkpoint_sha256", "checkpoint_bytes", "_inode"):
        if before[key] != after[key]:
            raise BindingError("checkpoint_changed_during_evaluation")


def _checkpoint_contract(path: Path) -> dict[str, Any]:
    """Load metadata with PyTorch weights-only; never return model tensors."""
    try:
        import torch

        payload = torch.load(path, map_location="cpu", weights_only=True)
        if not isinstance(payload, dict):
            raise BindingError("checkpoint_contract_invalid")
        keys = (
            "schema", "step", "source_manifest_sha256", "split_manifest_sha256",
            "feature_sha256", "script_sha256", "dataset_digest", "upstream_commit",
            "conditioning", "model_config", "clips_requested", "windows",
            "loudness_mean", "loudness_std",
        )
        result = {key: payload.get(key) for key in keys}
        if "model_state" not in payload or "optimizer_state" not in payload:
            raise BindingError("checkpoint_contract_invalid")
        return result
    except BindingError:
        raise
    except Exception as exc:
        raise BindingError("checkpoint_contract_invalid") from exc


def _verify_contract(contract: dict[str, Any], *, source_sha: str,
                     split_sha: str) -> None:
    expected = {
        "schema": trial.SCHEMA,
        "step": EXPECTED_STEP,
        "source_manifest_sha256": source_sha,
        "split_manifest_sha256": split_sha,
        "feature_sha256": trial.FEATURE_SHA256,
        "script_sha256": _script_digest(),
        "upstream_commit": pilot.UPSTREAM_SHA,
        "conditioning": trial.CONDITIONING,
        "model_config": trial.MODEL_CONFIG,
    }
    if any(contract.get(key) != value for key, value in expected.items()):
        raise BindingError("checkpoint_contract_mismatch")
    for key in ("dataset_digest",):
        value = contract.get(key)
        if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
            raise BindingError("checkpoint_contract_invalid")
    for key in ("clips_requested", "windows"):
        value = contract.get(key)
        if type(value) is not int or value <= 0:
            raise BindingError("checkpoint_contract_invalid")
    mean, std = contract.get("loudness_mean"), contract.get("loudness_std")
    if (type(mean) not in (float, int) or type(std) not in (float, int)
            or not math.isfinite(mean) or not math.isfinite(std) or std <= 1e-5):
        raise BindingError("checkpoint_normalizer_invalid")


def _verify_training_report(folder: Path, contract: dict[str, Any]) -> str:
    report, report_sha = _json_private(folder / trial.REPORT_NAME,
                                       max_bytes=MAX_REPORT_BYTES)
    expected = {
        "schema": trial.SCHEMA,
        "status": "bounded_trial_completed",
        "steps_completed": EXPECTED_STEP,
        "source_manifest_sha256": contract["source_manifest_sha256"],
        "split_manifest_sha256": contract["split_manifest_sha256"],
        "feature_sha256": contract["feature_sha256"],
        "upstream_commit": contract["upstream_commit"],
        "conditioning": contract["conditioning"],
        "model_config": contract["model_config"],
        "clips_requested": contract["clips_requested"],
        "training_windows": contract["windows"],
        "heldout_training_clips": 0,
    }
    if any(report.get(key) != value for key, value in expected.items()):
        raise BindingError("training_report_contract_mismatch")
    return report_sha


def _pair_digests(result_dir: Path, pair_count: int) -> list[dict[str, Any]]:
    """Bind the exact local 4 s 16 kHz A/B bytes, never the waveform itself."""
    pair_dir = result_dir / "pairs"
    if pair_count == 0:
        if os.path.lexists(pair_dir):
            raise BindingError("unexpected_evaluation_pairs")
        return []
    try:
        pilot._private_dir(pair_dir)
    except pilot.PilotError as exc:
        raise BindingError("evaluation_pairs_missing") from exc
    names = [
        f"pair_{number:02d}_{suffix}.wav"
        for number in range(1, pair_count + 1)
        for suffix in ("source_input_16k", "reconstruction")
    ]
    if set(os.listdir(pair_dir)) != set(names):
        raise BindingError("evaluation_pairs_set_mismatch")
    digests: list[dict[str, Any]] = []
    for name in names:
        try:
            payload = pilot._private_file(pair_dir / name, max_bytes=MAX_PAIR_BYTES)
            if len(payload) != 44 + 2 * PAIR_SAMPLES:
                raise BindingError("evaluation_pair_format_invalid")
            with wave.open(io.BytesIO(payload), "rb") as reader:
                if (reader.getnchannels() != 1 or reader.getsampwidth() != 2
                        or reader.getframerate() != 16_000 or reader.getnframes() != PAIR_SAMPLES
                        or reader.getcomptype() != "NONE"):
                    raise BindingError("evaluation_pair_format_invalid")
                samples = reader.readframes(PAIR_SAMPLES)
            if len(samples) != 2 * PAIR_SAMPLES:
                raise BindingError("evaluation_pair_format_invalid")
        except (pilot.PilotError, wave.Error, EOFError, OSError) as exc:
            raise BindingError("evaluation_pair_format_invalid") from exc
        digests.append({"name": name, "bytes": len(payload), "sha256": _digest(payload)})
    return digests


def _verify_evaluation_report(folder: Path, contract: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    result_dir = pilot._private_dir(folder / "result")
    report, report_sha = _json_private(result_dir / REPORT_NAME,
                                       max_bytes=MAX_REPORT_BYTES)
    expected = {
        "schema": trial.SCHEMA,
        "status": "heldout_reconstruction_evaluated",
        "checkpoint_step": EXPECTED_STEP,
        "source_manifest_sha256": contract["source_manifest_sha256"],
        "split_manifest_sha256": contract["split_manifest_sha256"],
        "feature_sha256": contract["feature_sha256"],
        "upstream_commit": contract["upstream_commit"],
        "conditioning": contract["conditioning"],
        "model_config": contract["model_config"],
    }
    if any(report.get(key) != value for key, value in expected.items()):
        raise BindingError("evaluation_report_contract_mismatch")
    if (type(report.get("heldout_clips_evaluated")) is not int
            or report["heldout_clips_evaluated"] <= 0):
        raise BindingError("evaluation_report_contract_mismatch")
    pair_count = report.get("heldout_song_groups_for_private_pairs")
    requested = report.get("private_pairs_requested")
    if (type(pair_count) is not int or type(requested) is not int
            or not 0 <= pair_count <= requested <= 3):
        raise BindingError("evaluation_report_pair_count_invalid")
    return report_sha, _pair_digests(result_dir, pair_count)


def _private_inputs(source_manifest: Path, split_manifest: Path,
                    upstream_root: Path, checkpoint_dir: Path,
                    output_dir: Path) -> tuple[str, str]:
    for directory in (upstream_root, checkpoint_dir, output_dir):
        pilot._private_dir(directory)
    pilot._check_disjoint_report_dir(output_dir, [
        source_manifest.parent, split_manifest.parent,
        split_manifest.parent / "train", split_manifest.parent / "heldout",
        upstream_root, checkpoint_dir,
    ])
    if os.listdir(output_dir):
        raise BindingError("evaluation_output_not_fresh")
    source, source_sha = _json_private(source_manifest, max_bytes=pilot.MAX_MANIFEST_BYTES)
    split, split_sha = _json_private(split_manifest, max_bytes=pilot.MAX_MANIFEST_BYTES)
    trial.validate_documents(source, source_sha, split)
    pilot._verify_upstream(upstream_root)
    trial._verify_feature_version()
    return source_sha, split_sha


def _run_unmodified_evaluator(*, source_manifest: Path, split_manifest: Path,
                              upstream_root: Path, checkpoint_dir: Path,
                              output_dir: Path, minutes: int, pairs: int) -> None:
    if not 1 <= minutes <= trial.MAX_MINUTES or not 0 <= pairs <= 3:
        raise BindingError("evaluation_limit")
    command = [
        sys.executable, str(Path(trial.__file__).resolve(strict=True)), "evaluate",
        "--source-manifest", str(source_manifest),
        "--split-manifest", str(split_manifest),
        "--upstream-root", str(upstream_root),
        "--checkpoint-dir", str(checkpoint_dir),
        "--output-dir", str(output_dir),
        "--minutes", str(minutes), "--pairs", str(pairs),
    ]
    environment = dict(os.environ)
    environment["PYTORCH_ENABLE_MPS_FALLBACK"] = "0"
    environment["PYTHONNOUSERSITE"] = "1"
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    try:
        completed = subprocess.run(
            command, check=False, capture_output=True, env=environment,
            timeout=minutes * 60 + 120,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise BindingError("evaluation_subprocess_failed") from exc
    if (completed.returncode != 0 or len(completed.stdout) > MAX_CHILD_OUTPUT_BYTES
            or len(completed.stderr) > MAX_CHILD_OUTPUT_BYTES):
        raise BindingError("evaluation_subprocess_failed")
    try:
        result = json.loads(completed.stdout)
    except (ValueError, UnicodeError) as exc:
        raise BindingError("evaluation_subprocess_failed") from exc
    if not isinstance(result, dict) or result.get("status") != "heldout_reconstruction_evaluated":
        raise BindingError("evaluation_subprocess_failed")


def _manifest(*, before: dict[str, Any], contract: dict[str, Any],
              source_sha: str, split_sha: str, training_report_sha: str,
              evaluation_report_sha: str, pair_digests: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "status": "complete_bound_to_checkpoint",
        "scope": "private_local_r_and_d_only_not_game_output",
        "binding_method": "fresh_evaluation_checkpoint_marker_and_pt_sha_equal_before_and_after",
        "checkpoint_step": before["step"],
        "checkpoint_marker_sha256": before["marker_sha256"],
        "checkpoint_sha256": before["checkpoint_sha256"],
        "checkpoint_bytes": before["checkpoint_bytes"],
        "training_report_sha256": training_report_sha,
        "heldout_report_sha256": evaluation_report_sha,
        "private_pair_wav_digests": pair_digests,
        "source_manifest_sha256": source_sha,
        "split_manifest_sha256": split_sha,
        "feature_sha256": contract["feature_sha256"],
        "training_script_sha256": contract["script_sha256"],
        "binding_script_sha256": _digest(Path(__file__).read_bytes()),
        "dataset_digest": contract["dataset_digest"],
        "upstream_commit": contract["upstream_commit"],
        "conditioning": contract["conditioning"],
        "model_config": contract["model_config"],
        "clips_requested": contract["clips_requested"],
        "training_windows": contract["windows"],
        "loudness_mean": contract["loudness_mean"],
        "loudness_std": contract["loudness_std"],
        "limitations": [
            "binding_does_not_prove_audible_naturalness_or_score_fit",
            "evaluator_still_uses_seeded_stochastic_noise",
            "python_socket_guard_is_not_an_os_network_sandbox",
        ],
    }


def inspect_result_binding(output_dir: Path, *, expected_checkpoint_sha256: str | None = None) -> str:
    """A missing binding never silently promotes an evaluation to complete."""
    try:
        pilot._private_dir(output_dir)
        result = output_dir / "result"
        if not result.exists():
            return "evaluation_result_missing"
        pilot._private_dir(result)
        binding_path = result / BINDING_NAME
        if not binding_path.exists():
            return "incomplete_unbound"
        binding, _ = _json_private(binding_path, max_bytes=MAX_REPORT_BYTES)
        if (binding.get("schema") != SCHEMA
                or binding.get("status") != "complete_bound_to_checkpoint"
                or binding.get("checkpoint_step") != EXPECTED_STEP):
            return "binding_invalid"
        if expected_checkpoint_sha256 is not None and binding.get("checkpoint_sha256") != expected_checkpoint_sha256:
            return "binding_checkpoint_mismatch"
        report, report_sha = _json_private(result / REPORT_NAME,
                                           max_bytes=MAX_REPORT_BYTES)
        if binding.get("heldout_report_sha256") != report_sha:
            return "binding_report_mismatch"
        pair_count = report.get("heldout_song_groups_for_private_pairs")
        requested = report.get("private_pairs_requested")
        if (type(pair_count) is not int or type(requested) is not int
                or not 0 <= pair_count <= requested <= 3):
            return "binding_report_mismatch"
        if binding.get("private_pair_wav_digests") != _pair_digests(result, pair_count):
            return "binding_pair_mismatch"
        return "complete_bound_to_checkpoint"
    except (pilot.PilotError, BindingError, OSError):
        return "binding_invalid"


def inspect_current_checkpoint(output_dir: Path, checkpoint_dir: Path) -> str:
    """Recheck the checkpoint itself as well as the locally bound result bytes."""
    try:
        with trial._exclusive_private_lock(checkpoint_dir):
            current = _checkpoint_snapshot(checkpoint_dir)
            binding, _ = _json_private(
                output_dir / "result" / BINDING_NAME, max_bytes=MAX_REPORT_BYTES)
            if (binding.get("checkpoint_marker_sha256") != current["marker_sha256"]
                    or binding.get("checkpoint_bytes") != current["checkpoint_bytes"]):
                return "binding_checkpoint_mismatch"
            return inspect_result_binding(
                output_dir, expected_checkpoint_sha256=current["checkpoint_sha256"])
    except (pilot.PilotError, trial.TrialError, BindingError, OSError):
        return "binding_checkpoint_missing_or_invalid"


def evaluate_and_bind(*, source_manifest: Path, split_manifest: Path,
                      upstream_root: Path, checkpoint_dir: Path,
                      output_dir: Path, minutes: int = 30, pairs: int = 3,
                      evaluator: Callable[..., None] = _run_unmodified_evaluator,
                      contract_reader: Callable[[Path], dict[str, Any]] = _checkpoint_contract) -> dict[str, Any]:
    """Run once in a fresh private folder; refuse any ambiguous binding."""
    try:
        source_sha, split_sha = _private_inputs(
            source_manifest, split_manifest, upstream_root, checkpoint_dir, output_dir)
        with trial._exclusive_private_lock(checkpoint_dir):
            before = _checkpoint_snapshot(checkpoint_dir)
            contract = contract_reader(before["_path"])
            _verify_contract(contract, source_sha=source_sha, split_sha=split_sha)
            training_report_sha = _verify_training_report(checkpoint_dir, contract)
        evaluator(source_manifest=source_manifest, split_manifest=split_manifest,
                  upstream_root=upstream_root, checkpoint_dir=checkpoint_dir,
                  output_dir=output_dir, minutes=minutes, pairs=pairs)
        with trial._exclusive_private_lock(checkpoint_dir):
            after = _checkpoint_snapshot(checkpoint_dir)
            _same_checkpoint(before, after)
            if _verify_training_report(checkpoint_dir, contract) != training_report_sha:
                raise BindingError("training_report_changed_during_evaluation")
            report_sha, pair_digests = _verify_evaluation_report(output_dir, contract)
            result_dir = output_dir / "result"
            binding = _manifest(
                before=before, contract=contract, source_sha=source_sha,
                split_sha=split_sha, training_report_sha=training_report_sha,
                evaluation_report_sha=report_sha, pair_digests=pair_digests)
            trial._write_json(result_dir, BINDING_NAME, binding, replace=False)
            if inspect_result_binding(
                    output_dir, expected_checkpoint_sha256=before["checkpoint_sha256"]
            ) != "complete_bound_to_checkpoint":
                raise BindingError("binding_self_check_failed")
        return {"status": "complete_bound_to_checkpoint", "checkpoint_step": EXPECTED_STEP}
    except BindingError:
        raise
    except Exception as exc:
        # Keep all third-party paths and exception text out of public output.
        raise BindingError("private_binding_internal_error") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    bind = sub.add_parser("evaluate-and-bind")
    bind.add_argument("--source-manifest", type=Path, required=True)
    bind.add_argument("--split-manifest", type=Path, required=True)
    bind.add_argument("--upstream-root", type=Path, required=True)
    bind.add_argument("--checkpoint-dir", type=Path, required=True)
    bind.add_argument("--output-dir", type=Path, required=True)
    bind.add_argument("--minutes", type=int, default=30)
    bind.add_argument("--pairs", type=int, default=3)
    inspect = sub.add_parser("inspect")
    inspect.add_argument("--output-dir", type=Path, required=True)
    inspect.add_argument("--checkpoint-dir", type=Path, required=True)
    args = parser.parse_args()
    if args.action == "inspect":
        print(json.dumps({"status": inspect_current_checkpoint(
            args.output_dir, args.checkpoint_dir)}))
        return
    try:
        result = evaluate_and_bind(
            source_manifest=args.source_manifest, split_manifest=args.split_manifest,
            upstream_root=args.upstream_root, checkpoint_dir=args.checkpoint_dir,
            output_dir=args.output_dir, minutes=args.minutes, pairs=args.pairs)
    except BindingError as exc:
        print(json.dumps({"status": "incomplete_unbound", "reason": str(exc)}))
        raise SystemExit(2) from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
