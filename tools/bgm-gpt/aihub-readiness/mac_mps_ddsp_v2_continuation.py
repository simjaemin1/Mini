#!/usr/bin/env python3
"""Bounded local continuation of the exact, dry V2 step-400 checkpoint.

This changes only the learning rate and the internal checkpoint eligibility
rule. The parent V2 trainer is immutable, and its source-only windows,
normalizer, loss, model, song partition and sampler are reused exactly.
External diagnostic songs are never inferred or used for selection here.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import tempfile
import time

import numpy as np

import bound_v2_dry_diagnostic as diagnostic
import mac_mps_ddsp_features as features
import mac_mps_ddsp_long_trial as v1
import mac_mps_ddsp_pilot as pilot
import mac_mps_ddsp_v2_dry_trial as v2


SCHEMA = "mini.aihub-71470-mac-mps-ddsp-dry-v2-continuation.v1"
REPORT_NAME = "v2_continuation_report.json"
MAX_JSON_BYTES = 1_048_576
MAX_STEPS = 2000
MAX_MINUTES = 60
VALIDATE_EVERY = 50
PARENT_STEP = 400
PARENT_CHECKPOINT_SHA256 = "256596f78be622782bd262a620ee58fa65eaac6e2798876aef7c806f4a5cbddc"
LEARNING_RATE = 3e-4
INTERNAL_FEASIBILITY_CRITERIA = {
    "validation_windows": 12,
    "all_window_raw_rms_abs_delta_db_max": 3.0,
    "active_drop_fraction_max": 0.05,
    "quiet_leak_fraction_max": 0.05,
}
TRAIN_ONLY_LOW_REGISTER_COVERAGE = {
    "confident_fit_pitch_frames": 139834,
    "fit_pitch_frames_below_300hz": 2524,
    "fit_pitch_frames_220_to_270hz": 1194,
    "frames_220_to_270hz_in_one_fit_song": 728,
    "interpretation": "Low register is sparse and song-concentrated; continuation adds no new pitch coverage.",
}
PARENT_VALIDATION_FLOAT_TOLERANCES = {
    "objective_or_spectral": 1e-4,
    "decibels": 1e-3,
    "fraction": 1e-6,
}


class ContinuationError(Exception):
    """A fixed, non-private error code."""


def _script_sha256() -> str:
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def _code_hashes() -> dict:
    return {
        "script_sha256": _script_sha256(),
        "parent_trainer_script_sha256": v2._code_sha256(),
        "parent_evaluator_script_sha256": hashlib.sha256(
            Path(diagnostic.__file__).read_bytes()).hexdigest(),
        "v1_helper_script_sha256": v1._script_sha256(),
        "private_runtime_script_sha256": hashlib.sha256(
            Path(pilot.__file__).read_bytes()).hexdigest(),
        "feature_sha256": hashlib.sha256(Path(features.__file__).read_bytes()).hexdigest(),
    }


def _write_json(folder: Path, name: str, value: dict, *, replace: bool) -> None:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"),
                         allow_nan=False).encode() + b"\n"
    if len(payload) > MAX_JSON_BYTES:
        raise ContinuationError("continuation_report_size_limit")
    v1._atomic_private_bytes(folder, name, payload, replace=replace)


def internal_feasibility(metrics: dict) -> dict:
    """Every validation window must pass; a good median cannot hide a song."""
    deltas = metrics.get("raw_rms_delta_db_per_window")
    valid_deltas = (isinstance(deltas, list)
                    and len(deltas) == INTERNAL_FEASIBILITY_CRITERIA["validation_windows"]
                    and all(type(value) in (int, float) and math.isfinite(value)
                            for value in deltas))
    def fraction_valid(name: str, denominator: str, maximum: float) -> bool:
        value = metrics.get(name)
        count = metrics.get(denominator)
        return (type(value) in (int, float) and math.isfinite(value)
                and 0 <= value <= maximum and type(count) is int and count > 0)
    checks = {
        "all_twelve_window_levels": bool(valid_deltas and all(
            abs(value) <= INTERNAL_FEASIBILITY_CRITERIA["all_window_raw_rms_abs_delta_db_max"]
            for value in deltas)),
        "active_drop": fraction_valid("active_drop_fraction", "active_frames",
            INTERNAL_FEASIBILITY_CRITERIA["active_drop_fraction_max"]),
        "quiet_leak": fraction_valid("quiet_leak_fraction", "quiet_frames",
            INTERNAL_FEASIBILITY_CRITERIA["quiet_leak_fraction_max"]),
        "complete_internal_population": (metrics.get("windows") == 12
                                         and metrics.get("songs") == 3),
    }
    return {"feasible": all(checks.values()), "checks": checks}


def sampler_seen_before(step: int) -> dict[str, int]:
    """Number of draws in each pool after exactly `step` original V2 steps."""
    if type(step) is not int or step < 0:
        raise ContinuationError("sampler_step_invalid")
    transitions = (step + 2) // 3
    return {"transition": transitions, "sustain": step - transitions}


def _sample_index(pools: dict, kind: str, seen: int, cache: dict) -> int:
    if kind not in pools or not pools[kind]:
        raise ContinuationError("kind_balanced_pool_missing")
    epoch, offset = divmod(seen, len(pools[kind]))
    key = (kind, epoch)
    if key not in cache:
        salt = 1 if kind == "transition" else 2
        cache[key] = np.random.default_rng(
            v2.SEED + 10_000 * salt + epoch).permutation(len(pools[kind]))
    return pools[kind][int(cache[key][offset])]


def _windows_sha256(windows: list[dict]) -> str:
    digest = hashlib.sha256()
    for item in windows:
        digest.update(json.dumps({"song": item["song_index"], "kind": item["kind"]},
                                 sort_keys=True, separators=(",", ":")).encode())
        for name in ("samples", "pitch_hz", "loudness", "mask", "attack_mask"):
            array = np.ascontiguousarray(item[name])
            digest.update(name.encode())
            digest.update(str(array.dtype).encode())
            digest.update(str(array.shape).encode())
            digest.update(array.tobytes())
    return digest.hexdigest()


def _model_and_optimizer(torch, DDSP, parent: dict):
    if (parent.get("schema") != v2.SCHEMA or parent.get("step") != PARENT_STEP
            or parent.get("architecture") != v2.ARCHITECTURE
            or parent.get("model_config") != v2.MODEL_CONFIG
            or any(name.startswith("reverb.") for name in parent.get("model_state", {}))):
        raise ContinuationError("dry_parent_required")
    v1._assert_checkpoint_state_finite(torch, parent)
    model, optimizer = v2._model_and_optimizer(torch, DDSP)
    model.load_state_dict(parent["model_state"], strict=True)
    optimizer.load_state_dict(parent["optimizer_state"])
    if not optimizer.param_groups or any(group.get("lr") != 1e-3
                                         for group in optimizer.param_groups):
        raise ContinuationError("parent_optimizer_learning_rate_mismatch")
    for group in optimizer.param_groups:
        group["lr"] = LEARNING_RATE
    return model, optimizer


def _parent_validation_matches(actual: dict, expected: dict) -> bool:
    """Counts match exactly; permit only explicit, tiny MPS float variation."""
    if not isinstance(expected, dict) or set(actual) != set(expected):
        return False
    count_names = {"active_frames", "quiet_frames", "windows", "songs"}
    def float_match(left, right, tolerance):
        return (type(left) in (int, float) and type(right) in (int, float)
                and math.isfinite(left) and math.isfinite(right)
                and math.isclose(left, right, rel_tol=0.0, abs_tol=tolerance))
    for name, value in expected.items():
        candidate = actual[name]
        if name in count_names:
            if type(candidate) is not int or type(value) is not int or candidate != value:
                return False
            continue
        if value is None:
            if candidate is not None:
                return False
            continue
        if "db" in name:
            tolerance = PARENT_VALIDATION_FLOAT_TOLERANCES["decibels"]
        elif "fraction" in name:
            tolerance = PARENT_VALIDATION_FLOAT_TOLERANCES["fraction"]
        else:
            tolerance = PARENT_VALIDATION_FLOAT_TOLERANCES["objective_or_spectral"]
        if isinstance(value, list):
            if (not isinstance(candidate, list) or len(candidate) != len(value)
                    or not all(float_match(left, right, tolerance)
                               for left, right in zip(candidate, value))):
                return False
        elif not float_match(candidate, value, tolerance):
            return False
    return True


def _choose_better(current: dict | None, current_objective: float,
                   marker: dict, validation: dict, *, require_feasible: bool) -> tuple:
    objective = validation.get("song_macro_objective")
    if type(objective) not in (float, int) or not math.isfinite(objective):
        raise ContinuationError("validation_objective_invalid")
    if require_feasible and not internal_feasibility(validation)["feasible"]:
        return current, current_objective
    if objective < current_objective:
        return marker, objective
    return current, current_objective


def _validation_metrics(torch, model, windows: list[dict], normalizer: tuple,
                        multiscale_fft, safe_log) -> dict:
    # The immutable parent's exact loss and scalar objective remain unchanged.
    metrics = v2._validation_metrics(torch, model, windows, normalizer,
                                     multiscale_fft, safe_log)
    raw_deltas = []
    active = drops = quiet = leaks = 0
    model.eval()
    with torch.no_grad():
        for index, item in enumerate(windows):
            torch.manual_seed(v2.SEED + 50_000 + index)
            samples, pitch, loudness, _ = v1._tensors(torch, item, *normalizer)
            prediction = model(pitch, loudness).squeeze(-1)
            if (prediction.shape != samples.shape or prediction.device.type != "mps"
                    or not bool(torch.isfinite(prediction).all().item())):
                raise ContinuationError("validation_output_invalid")
            source_db = v2._frame_db(torch, samples)
            output_db = v2._frame_db(torch, prediction)
            is_active, is_quiet = source_db > -40.0, source_db < -50.0
            active += int(is_active.sum().item())
            drops += int((is_active & (output_db < -50.0)).sum().item())
            quiet += int(is_quiet.sum().item())
            leaks += int((is_quiet & (output_db > -40.0)).sum().item())
            source_rms = torch.sqrt(torch.mean(samples * samples) + 1e-12)
            output_rms = torch.sqrt(torch.mean(prediction * prediction) + 1e-12)
            delta = float((20.0 * torch.log10(output_rms / source_rms)).item())
            if not math.isfinite(delta):
                raise ContinuationError("validation_level_nonfinite")
            raw_deltas.append(delta)
    model.train()
    if metrics["active_frames"] != active or metrics["quiet_frames"] != quiet:
        raise ContinuationError("validation_population_changed")
    metrics.update({"raw_rms_delta_db_per_window": raw_deltas,
                    "raw_rms_abs_delta_db_max": max(map(abs, raw_deltas), default=math.inf),
                    "active_drop_frames": drops, "quiet_leaking_frames": leaks,
                    "active_drop_fraction": drops / active if active else None,
                    "quiet_leak_fraction": leaks / quiet if quiet else None})
    metrics["internal_feasibility"] = internal_feasibility(metrics)
    return metrics


def _save_checkpoint(folder: Path, torch, payload: dict, step: int) -> dict:
    v1._assert_checkpoint_state_finite(torch, payload)
    v2._free_space_gate(folder, starting=False)
    descriptor, name = tempfile.mkstemp(prefix=".pending_child_", dir=folder)
    pending = Path(name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb") as sink:
            torch.save(payload, sink)
            sink.flush()
            os.fsync(sink.fileno())
        if not 0 < pending.stat().st_size <= v2.MAX_CHECKPOINT_BYTES:
            raise ContinuationError("checkpoint_size_limit")
        v2._free_space_gate(folder, starting=False)
        with pending.open("rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        filename = f"child_step_{step:06d}_{digest[:12]}.pt"
        final = folder / filename
        if os.path.lexists(final):
            raise ContinuationError("checkpoint_name_collision")
        os.replace(pending, final)
        v1._fsync_directory(folder)
        marker = {"schema": SCHEMA, "step": step, "total_step": PARENT_STEP + step,
                  "file": filename, "sha256": digest, "bytes": final.stat().st_size}
        _write_json(folder, f"child_step_{step:06d}.json", marker, replace=False)
        return marker
    finally:
        pending.unlink(missing_ok=True)


def _remove_owned_checkpoint(folder: Path, marker: dict) -> None:
    step, name, digest = marker.get("step"), marker.get("file"), marker.get("sha256")
    if (marker.get("schema") != SCHEMA or type(step) is not int
            or not 50 <= step <= MAX_STEPS or step % VALIDATE_EVERY
            or not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest)
            or marker.get("total_step") != PARENT_STEP + step
            or name != f"child_step_{step:06d}_{digest[:12]}.pt"):
        raise ContinuationError("owned_checkpoint_marker_invalid")
    marker_path = folder / f"child_step_{step:06d}.json"
    saved = json.loads(pilot._private_file(marker_path, max_bytes=4096))
    if saved != marker:
        raise ContinuationError("owned_checkpoint_marker_changed")
    path = folder / name
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o077
            or info.st_size != marker.get("bytes")):
        raise ContinuationError("owned_checkpoint_file_invalid")
    with path.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != digest:
            raise ContinuationError("owned_checkpoint_changed")
    path.unlink()
    marker_path.unlink()
    v1._fsync_directory(folder)


def _train(*, source_manifest: Path, split_manifest: Path, upstream_root: Path,
           parent_checkpoint_dir: Path, output_dir: Path, minutes: int, steps: int) -> dict:
    if (not 1 <= minutes <= MAX_MINUTES or not 50 <= steps <= MAX_STEPS
            or steps % VALIDATE_EVERY):
        raise ContinuationError("bounded_continuation_limit")
    started = time.monotonic()
    deadline = started + minutes * 60
    diagnostic._local_paths_only([source_manifest, split_manifest, upstream_root,
                                  parent_checkpoint_dir, output_dir])
    with (pilot._network_disabled(), v1._exclusive_private_lock(parent_checkpoint_dir),
          v1._exclusive_private_lock(output_dir)):
        if set(os.listdir(output_dir)) != {".trial.lock"}:
            raise ContinuationError("fresh_empty_output_required")
        v2._free_space_gate(output_dir, starting=True)
        v1._verify_feature_version()
        code_hashes = _code_hashes()
        source, source_sha, split, split_sha, train_dir, _ = v1._private_inputs(
            source_manifest, split_manifest, output_dir, upstream_root)
        pilot._check_disjoint_report_dir(output_dir, [parent_checkpoint_dir])
        records, _ = v1.validate_documents(source, source_sha, split)
        fit_songs, val_songs = v2.partition_training_songs(records)
        parent_snapshot = diagnostic.checkpoint_snapshot(parent_checkpoint_dir)
        if (parent_snapshot["step"] != PARENT_STEP
                or parent_snapshot["checkpoint_sha256"] != PARENT_CHECKPOINT_SHA256):
            raise ContinuationError("exact_step400_parent_required")
        torch, DDSP, multiscale_fft, safe_log = v1._mac_mps_gate(output_dir, upstream_root)
        parent = torch.load(parent_snapshot["_path"], map_location="cpu", weights_only=True)
        normalizer = diagnostic.verify_contract(parent, parent_snapshot,
            source_sha=source_sha, split_sha=split_sha, train_records=records)
        fit_windows, fit_counts = v2._windows_for_records(train_dir,
            [row for row in records if row["song_index"] in fit_songs],
            validation=False, deadline=deadline)
        val_windows, val_counts = v2._windows_for_records(train_dir,
            [row for row in records if row["song_index"] in val_songs],
            validation=True, deadline=deadline)
        recomputed_normalizer = v1.normalize_loudness([row["loudness"] for row in fit_windows])
        if (tuple(normalizer) != tuple(recomputed_normalizer)
                or parent.get("fit_windows") != fit_counts["windows"]
                or parent.get("validation_windows") != val_counts["windows"]
                or parent_snapshot["_report"].get("fit_counts") != fit_counts
                or parent_snapshot["_report"].get("validation_counts") != val_counts):
            raise ContinuationError("parent_windows_or_normalizer_changed")
        v2._free_space_gate(output_dir, starting=True)
        model, optimizer = _model_and_optimizer(torch, DDSP, parent)
        parent_validation = v2._validation_metrics(torch, model, val_windows, normalizer,
                                                  multiscale_fft, safe_log)
        if not _parent_validation_matches(parent_validation, parent.get("validation")):
            raise ContinuationError("parent_validation_not_reproducible")
        parent_binding = {
            "parent_step": PARENT_STEP,
            "parent_checkpoint_sha256": parent_snapshot["checkpoint_sha256"],
            "parent_checkpoint_marker_sha256": parent_snapshot["checkpoint_marker_sha256"],
            "parent_training_report_sha256": parent_snapshot["training_report_sha256"],
            "v1_baseline_checkpoint_sha256": parent["v1_baseline_checkpoint_sha256"],
        }
        del parent
        metadata = {
            "schema": SCHEMA, "source_manifest_sha256": source_sha,
            "split_manifest_sha256": split_sha, **code_hashes, **parent_binding,
            "upstream_commit": pilot.UPSTREAM_SHA, "architecture": v2.ARCHITECTURE,
            "model_config": v2.MODEL_CONFIG, "loss_weights": v2.LOSS_WEIGHTS,
            "sampler": v2.SAMPLER, "learning_rate": LEARNING_RATE,
            "internal_partition_sha256": v2._song_partition_sha(fit_songs, val_songs),
            "normalizer_fit_only": list(normalizer), "fit_windows": fit_counts["windows"],
            "validation_windows": val_counts["windows"],
            "fit_window_selection_sha256": _windows_sha256(fit_windows),
            "validation_window_selection_sha256": _windows_sha256(val_windows),
            "internal_feasibility_criteria": INTERNAL_FEASIBILITY_CRITERIA,
            "train_only_low_register_coverage": TRAIN_ONLY_LOW_REGISTER_COVERAGE,
            "parent_validation_float_tolerances": PARENT_VALIDATION_FLOAT_TOLERANCES,
        }
        pools = {kind: [index for index, item in enumerate(fit_windows) if item["kind"] == kind]
                 for kind in ("sustain", "transition")}
        if any(not pool for pool in pools.values()):
            raise ContinuationError("kind_balanced_pool_missing")
        kind_seen = sampler_seen_before(PARENT_STEP)
        permutations = {}
        history, owned_markers = [], []
        latest = feasible_best = diagnostic_best = None
        feasible_objective = diagnostic_objective = math.inf
        model.train()
        for step in range(1, steps + 1):
            if time.monotonic() >= deadline:
                break
            v2._free_space_gate(output_dir, starting=False)
            total_step = PARENT_STEP + step
            kind = "transition" if (total_step - 1) % 3 == 0 else "sustain"
            index = _sample_index(pools, kind, kind_seen[kind], permutations)
            kind_seen[kind] += 1
            item = fit_windows[index]
            torch.manual_seed(v2.SEED + total_step)
            samples, pitch, loudness, _ = v1._tensors(torch, item, *normalizer)
            mask = torch.from_numpy(item["attack_mask"].copy()).to(samples.device).reshape(1, -1)
            prediction = model(pitch, loudness).squeeze(-1)
            if prediction.shape != samples.shape or prediction.device.type != "mps":
                raise ContinuationError("mps_output_invalid")
            components = v2._loss_components(torch, multiscale_fft, safe_log, samples,
                prediction, transition=kind == "transition", attack_mask=mask)
            loss = v2._objective(components)
            if not bool(torch.isfinite(loss).item()):
                raise ContinuationError("nonfinite_training_loss")
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            v1._assert_model_finite(torch, model, gradients=True)
            optimizer.step()
            v1._assert_model_finite(torch, model, gradients=False)
            if step % VALIDATE_EVERY:
                continue
            if _code_hashes() != code_hashes:
                raise ContinuationError("code_changed_during_continuation")
            v1._verify_feature_version()
            validation = _validation_metrics(torch, model, val_windows, normalizer,
                                             multiscale_fft, safe_log)
            torch.mps.synchronize()
            payload = {**metadata, "step": step, "total_step": total_step,
                "validation": validation, "model_state": v1._cpu_state(model.state_dict(), torch),
                "optimizer_state": v1._cpu_state(optimizer.state_dict(), torch)}
            marker = _save_checkpoint(output_dir, torch, payload, step)
            owned_markers.append(marker)
            latest = marker
            diagnostic_best, diagnostic_objective = _choose_better(
                diagnostic_best, diagnostic_objective, marker, validation,
                require_feasible=False)
            feasible_best, feasible_objective = _choose_better(
                feasible_best, feasible_objective, marker, validation,
                require_feasible=True)
            selected = feasible_best if feasible_best is not None else diagnostic_best
            keep = {selected["step"], latest["step"]}
            for old in list(owned_markers):
                if old["step"] not in keep:
                    _remove_owned_checkpoint(output_dir, old)
                    owned_markers.remove(old)
            if len(owned_markers) > 2:
                raise ContinuationError("checkpoint_retention_limit")
            history.append({"step": step, "total_step": total_step, "validation": validation})
            report = {**metadata, "status": "complete" if step == steps else "checkpoint",
                "interpretation": "Train-side dry V2 continuation; no external diagnostic inference or game claim.",
                "fit_song_groups": 12, "validation_song_groups": 3,
                "external_heldout_training_or_selection_songs": 0,
                "fit_counts": fit_counts, "validation_counts": val_counts,
                "steps_target": steps, "additional_steps_completed": step,
                "total_steps_completed": total_step, "history": history,
                "best_internal_validation_step": selected["step"],
                "best_internal_validation_total_step": selected["total_step"],
                "best_checkpoint_sha256": selected["sha256"],
                "feasible_checkpoint_selected": feasible_best is not None,
                "diagnostic_best_step": diagnostic_best["step"],
                "diagnostic_best_scalar_objective": diagnostic_objective,
                "feasible_best_scalar_objective": feasible_objective if feasible_best else None,
                "latest_checkpoint_sha256": latest["sha256"],
                "retained_checkpoint_count": len(owned_markers),
                "wall_seconds": round(time.monotonic() - started, 2),
                "private_checkpoint_only": True}
            _write_json(output_dir, REPORT_NAME, report, replace=True)
        after = diagnostic.checkpoint_snapshot(parent_checkpoint_dir)
        if any(after[key] != parent_snapshot[key] for key in (
                "step", "checkpoint_sha256", "checkpoint_marker_sha256",
                "training_report_sha256", "_inode")):
            raise ContinuationError("parent_changed_during_continuation")
        if _code_hashes() != code_hashes:
            raise ContinuationError("code_changed_during_continuation")
        # Rehash all source bytes; only integrity, never external ML features.
        _, source_after, _, split_after, _, _ = v1._private_inputs(
            source_manifest, split_manifest, output_dir, upstream_root)
        if source_after != source_sha or split_after != split_sha:
            raise ContinuationError("inputs_changed_during_continuation")
        return {"status": "complete" if history and history[-1]["step"] == steps
                else "time_cap_or_no_checkpoint",
                "additional_steps_completed": history[-1]["step"] if history else 0,
                "feasible_checkpoint_selected": feasible_best is not None,
                "best_internal_validation_step": (feasible_best or diagnostic_best or {}).get("step"),
                "external_heldout_inference_windows": 0}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source-manifest", "split-manifest", "upstream-root",
                 "parent-checkpoint-dir", "output-dir"):
        parser.add_argument(f"--{name}", required=True, type=Path)
    parser.add_argument("--steps", type=int, default=1000)
    parser.add_argument("--minutes", type=int, default=60)
    args = parser.parse_args()
    try:
        result = _train(**vars(args))
    except (ContinuationError, diagnostic.DiagnosticError, v2.V2Error,
            v1.TrialError, pilot.PilotError) as exc:
        print(json.dumps({"status": "blocked", "reason": str(exc)}))
        raise SystemExit(2) from None
    except Exception:
        print(json.dumps({"status": "blocked", "reason": "private_continuation_internal_error"}))
        raise SystemExit(2) from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
