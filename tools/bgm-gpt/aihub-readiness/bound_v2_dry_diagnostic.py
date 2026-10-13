#!/usr/bin/env python3
"""Local-only, SHA-bound diagnostic for the frozen dry-only C001 V2 model.

The four songs have already been examined: this is a reused diagnostic set,
not a blind generalization test. Source-only crop selection and all numerical
gates are frozen before inference. Identical retries are permitted; changing
the checkpoint, crop bytes, normalizer, code, or gates in one trial is not.
No licensed audio or checkpoint bytes are printed or exported to a network.
"""

from __future__ import annotations

import argparse
from collections import Counter
from contextlib import ExitStack
import hashlib
import importlib
import json
import math
import os
from pathlib import Path
import re
import stat
import tempfile
import time

import numpy as np

import audit_vibrato_boundaries as audit
import bound_heldout_vibrato as vb
import mac_mps_ddsp_features as features
import mac_mps_ddsp_long_trial as v1
import mac_mps_ddsp_pilot as pilot
import mac_mps_ddsp_v2_dry_trial as v2


SCHEMA = "mini.aihub-71470-v2-dry-reused-diagnostic.v1"
REPORT_NAME = "v2_diagnostic_report.json"
BINDING_NAME = "v2_diagnostic_binding.json"
FREEZE_NAME = "v2_diagnostic_freeze.json"
MAX_JSON_BYTES = 1_048_576
MAX_MINUTES = 30
EXPECTED_FINAL_STEPS = 500
EXPECTED_INPUT_MODULATED = 20
GATES = {"general_quiet_leak_fraction_max": 0.05,
         "quiet_to_active_quiet_leak_fraction_max": 0.05,
         "vb01_quiet_leak_fraction_max": 0.05,
         "modulated_retained_min": 16, "retained_per_song_min": 1,
         "longest_quiet_leak_frames_max_exclusive": 10,
         "preview_raw_rms_abs_delta_db_max": 3.0}
SEEDS = {"general_sustain_offset": 100_000,
         "general_transition_offset": 200_000,
         "vb01_offset": 300_000, "base": v1.SEED}


class DiagnosticError(Exception):
    """A fixed non-private reason suitable for CLI output."""


def _digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _canonical(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      allow_nan=False).encode()


def _json(path: Path) -> tuple[dict, str]:
    payload = pilot._private_file(path, max_bytes=MAX_JSON_BYTES)
    value = json.loads(payload)
    if not isinstance(value, dict):
        raise DiagnosticError("private_json_invalid")
    return value, _digest(payload)


def _write_json(folder: Path, name: str, value: dict) -> None:
    # Detailed per-window diagnostics exceed V1's aggregate 16 KiB cap.
    payload = _canonical(value) + b"\n"
    if len(payload) > MAX_JSON_BYTES:
        raise DiagnosticError("private_diagnostic_report_size_limit")
    v1._atomic_private_bytes(folder, name, payload, replace=False)


def _code_hashes() -> dict:
    result = {name: _digest(Path(module.__file__).read_bytes()) for name, module in (
        ("evaluator", __import__(__name__)), ("trainer", v2),
        ("v1_helper", v1), ("features", features), ("vb01", vb),
        ("audit", audit), ("private_runtime", pilot))}
    result["protocol"] = _digest(Path(__file__).with_name("MAC_MPS_DDSP_V2_DRY_PROTOCOL.md").read_bytes())
    continuation_path = Path(__file__).with_name("mac_mps_ddsp_v2_continuation.py")
    if continuation_path.exists():
        result["continuation_trainer"] = _digest(continuation_path.read_bytes())
    return result


def _sha_valid(value) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def _local_paths_only(paths: list[Path]) -> None:
    for path in paths:
        # Permissions alone do not prevent a sync agent from uploading files.
        resolved = path.resolve(strict=True)
        parts = {part.casefold() for part in resolved.parts}
        if (parts & {"cloudstorage", "mobile documents", "dropbox", "google drive", "icloud drive"}
                or any(part.startswith("onedrive") for part in parts)):
            raise DiagnosticError("cloud_sync_path_not_allowed")


def checkpoint_snapshot(checkpoint_dir: Path) -> dict:
    """The selected checkpoint must be decided solely by internal validation."""
    pilot._private_dir(checkpoint_dir)
    child_report = checkpoint_dir / "v2_continuation_report.json"
    is_child = os.path.lexists(child_report)
    if is_child and os.path.lexists(checkpoint_dir / "v2_dry_trial_report.json"):
        raise DiagnosticError("ambiguous_checkpoint_trial_type")
    report, report_sha = _json(child_report if is_child else checkpoint_dir / "v2_dry_trial_report.json")
    child = importlib.import_module("mac_mps_ddsp_v2_continuation") if is_child else None
    schema = child.SCHEMA if is_child else v2.SCHEMA
    step = report.get("best_internal_validation_step")
    digest = report.get("best_checkpoint_sha256")
    target = report.get("steps_target")
    target_valid = (type(target) is int and 1000 <= target <= 2000
                    and target % 50 == 0) if is_child else target == EXPECTED_FINAL_STEPS
    if (report.get("schema") != schema or report.get("status") != "complete"
            or not target_valid or (is_child and report.get("feasible_checkpoint_selected") is not True)
            or type(step) is not int or not 50 <= step <= target
            or step % v2.VALIDATE_EVERY or not _sha_valid(digest)):
        raise DiagnosticError("complete_final_training_report_required")
    prefix = "child_step" if is_child else "v2_step"
    marker, marker_sha = _json(checkpoint_dir / f"{prefix}_{step:06d}.json")
    filename = f"{prefix}_{step:06d}_{digest[:12]}.pt"
    if (marker.get("schema") != schema or marker.get("step") != step
            or marker.get("sha256") != digest or marker.get("file") != filename):
        raise DiagnosticError("selected_checkpoint_marker_mismatch")
    total_step = report.get("best_internal_validation_total_step") if is_child else step
    if is_child and (type(report.get("parent_step")) is not int
                     or total_step != report["parent_step"] + step
                     or marker.get("total_step") != total_step):
        raise DiagnosticError("continuation_total_step_mismatch")
    path = checkpoint_dir / filename
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o077
            or not 0 < info.st_size <= v2.MAX_CHECKPOINT_BYTES
            or marker.get("bytes") != info.st_size):
        raise DiagnosticError("selected_checkpoint_file_invalid")
    with path.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != digest:
            raise DiagnosticError("selected_checkpoint_sha_mismatch")
    return {"step": step, "total_step": total_step, "_kind": "continuation" if is_child else "v2",
            "checkpoint_sha256": digest, "checkpoint_bytes": info.st_size,
            "checkpoint_marker_sha256": marker_sha, "training_report_sha256": report_sha,
            "_path": path, "_inode": (info.st_dev, info.st_ino), "_report": report}


def verify_contract(checkpoint: dict, snapshot: dict, *, source_sha: str,
                    split_sha: str, train_records: list[dict],
                    parent_snapshot: dict | None = None,
                    parent_checkpoint: dict | None = None) -> tuple[float, float]:
    is_child = snapshot.get("_kind") == "continuation"
    child = importlib.import_module("mac_mps_ddsp_v2_continuation") if is_child else None
    fit, validation = v2.partition_training_songs(train_records)
    expected = {"schema": child.SCHEMA if is_child else v2.SCHEMA, "step": snapshot["step"],
                "source_manifest_sha256": source_sha, "split_manifest_sha256": split_sha,
                "feature_sha256": v1.FEATURE_SHA256,
                "script_sha256": _digest(Path(child.__file__).read_bytes()) if is_child else v2._code_sha256(),
                "v1_helper_script_sha256": v1._script_sha256(),
                "upstream_commit": pilot.UPSTREAM_SHA, "architecture": v2.ARCHITECTURE,
                "model_config": v2.MODEL_CONFIG, "loss_weights": v2.LOSS_WEIGHTS,
                "sampler": v2.SAMPLER,
                "internal_partition_sha256": v2._song_partition_sha(fit, validation)}
    if is_child:
        if parent_snapshot is None or parent_checkpoint is None or parent_snapshot.get("_kind") != "v2":
            raise DiagnosticError("continuation_parent_binding_required")
        if (parent_snapshot["step"] != child.PARENT_STEP
                or parent_snapshot["checkpoint_sha256"] != child.PARENT_CHECKPOINT_SHA256):
            raise DiagnosticError("continuation_exact_parent_required")
        parent_normalizer = verify_contract(parent_checkpoint, parent_snapshot,
            source_sha=source_sha, split_sha=split_sha, train_records=train_records)
        expected.update({"total_step": snapshot["total_step"], "parent_step": parent_snapshot["step"],
                         "parent_checkpoint_sha256": parent_snapshot["checkpoint_sha256"],
                         "parent_checkpoint_marker_sha256": parent_snapshot["checkpoint_marker_sha256"],
                         "parent_training_report_sha256": parent_snapshot["training_report_sha256"],
                         "parent_trainer_script_sha256": v2._code_sha256(),
                         "parent_evaluator_script_sha256": _digest(Path(__file__).read_bytes()),
                         "private_runtime_script_sha256": _digest(Path(pilot.__file__).read_bytes()),
                         "fit_windows": parent_checkpoint.get("fit_windows"),
                         "validation_windows": parent_checkpoint.get("validation_windows"),
                         "internal_feasibility_criteria": child.INTERNAL_FEASIBILITY_CRITERIA,
                         "learning_rate": 3e-4})
    if any(checkpoint.get(key) != value for key, value in expected.items()):
        raise DiagnosticError("v2_checkpoint_contract_mismatch")
    report = snapshot["_report"]
    report_expected = {key: value for key, value in expected.items() if key not in ("step", "total_step")}
    report_expected.update({"fit_song_groups": 12, "validation_song_groups": 3,
                            "external_heldout_training_or_selection_songs": 0})
    if any(report.get(key) != value for key, value in report_expected.items()):
        raise DiagnosticError("v2_training_report_contract_mismatch")
    normalizer = checkpoint.get("normalizer_fit_only")
    if (not isinstance(normalizer, list) or len(normalizer) != 2
            or any(type(value) not in (int, float) or not math.isfinite(value)
                   for value in normalizer) or normalizer[1] <= 1e-5
            or report.get("normalizer_fit_only") != normalizer):
        raise DiagnosticError("v2_fit_only_normalizer_invalid")
    if (not isinstance(checkpoint.get("model_state"), dict)
            or any(key.startswith("reverb.") for key in checkpoint["model_state"])
            or not _sha_valid(checkpoint.get("v1_baseline_checkpoint_sha256"))
            or report.get("v1_baseline_checkpoint_sha256") != checkpoint["v1_baseline_checkpoint_sha256"]):
        raise DiagnosticError("v2_dry_state_invalid")
    if is_child:
        if (list(parent_normalizer) != normalizer
                or checkpoint["v1_baseline_checkpoint_sha256"] != parent_checkpoint["v1_baseline_checkpoint_sha256"]):
            raise DiagnosticError("continuation_parent_normalizer_or_baseline_changed")
        for key in ("fit_window_selection_sha256", "validation_window_selection_sha256"):
            if not _sha_valid(checkpoint.get(key)) or report.get(key) != checkpoint[key]:
                raise DiagnosticError("continuation_window_selection_binding_invalid")
        validation_metrics = checkpoint.get("validation")
        if not isinstance(validation_metrics, dict):
            raise DiagnosticError("continuation_validation_metrics_missing")
        feasibility = child.internal_feasibility(validation_metrics)
        if (feasibility.get("feasible") is not True
                or validation_metrics.get("internal_feasibility") != feasibility
                or report.get("feasible_checkpoint_selected") is not True):
            raise DiagnosticError("continuation_internally_feasible_checkpoint_required")
    return float(normalizer[0]), float(normalizer[1])


def _window_digest(item: dict | None) -> str | None:
    if item is None:
        return None
    digest = hashlib.sha256()
    for name in ("samples", "pitch_hz", "loudness", "mask"):
        array = np.ascontiguousarray(item[name])
        digest.update(name.encode())
        digest.update(str(array.dtype).encode())
        digest.update(str(array.shape).encode())
        digest.update(array.tobytes())
    return digest.hexdigest()


def freeze_or_retry(checkpoint_dir: Path, plan: dict) -> bool:
    """Permit an exact reproducibility retry, never altered frozen evaluation."""
    path = checkpoint_dir / FREEZE_NAME
    if os.path.lexists(path):
        previous, _ = _json(path)
        if previous != plan:
            raise DiagnosticError("frozen_diagnostic_configuration_changed")
        return True
    _write_json(checkpoint_dir, FREEZE_NAME, plan)
    return False


def _longest_true(mask: np.ndarray) -> int:
    longest = run = 0
    for value in mask:
        run = run + 1 if value else 0
        longest = max(longest, run)
    return longest


def acoustic_metrics(source: np.ndarray, rendered: np.ndarray) -> dict:
    if (source.shape != (pilot.WINDOW_SAMPLES,) or rendered.shape != source.shape
            or not np.all(np.isfinite(source)) or not np.all(np.isfinite(rendered))):
        raise DiagnosticError("rendered_window_invalid")
    source_db, output_db = vb._rms_db(source), vb._rms_db(rendered)
    quiet = source_db < -50.0
    leaking = quiet & (output_db > -40.0)
    attacks, matched = vb._attack_match(source, rendered)
    excess = v2.relative_quiet_overshoot_db(source_db, output_db)
    return {"quiet_frames": int(quiet.sum()), "leaking_frames": int(leaking.sum()),
            "longest_quiet_leak_frames": _longest_true(leaking),
            "quiet_relative_overshoot_db_mean": (float(excess[quiet].mean()) if quiet.any() else None),
            "envelope_mae_db": float(np.mean(np.abs(output_db - source_db))),
            "raw_rms_delta_db": vb._whole_rms_db(rendered) - vb._whole_rms_db(source),
            "attack_count": attacks, "attack_matched": matched,
            "active_frames": int(np.count_nonzero(source_db > -42.0)),
            "active_drop_frames": int(np.count_nonzero((source_db > -42.0) & (output_db < -50.0)))}


def preview_gate(general: list[dict], vibrato: list[dict], previews: list[dict],
                 songs: set[int]) -> dict:
    def leak_fraction(rows):
        quiet = sum(row["quiet_frames"] for row in rows)
        return sum(row["leaking_frames"] for row in rows) / quiet if quiet else None
    # Match V1's general quiet denominator: quiet-to-active proxy windows,
    # not sustained windows that could dilute a failing transition metric.
    transitions = [row for row in general if row.get("kind") == "transition"]
    general_leak, transition_leak, vb_leak = leak_fraction(general), leak_fraction(transitions), leak_fraction(vibrato)
    positives = [row for row in vibrato if row["input64_state"] == "modulated"]
    retained = [row for row in positives if row["output64_state"] == "modulated"]
    retained_by_song = Counter(row["song_index"] for row in retained)
    longest = max((row["longest_quiet_leak_frames"] for row in general + vibrato), default=400)
    checks = {
        "general_quiet_leak": general_leak is not None and general_leak <= GATES["general_quiet_leak_fraction_max"],
        "quiet_to_active_quiet_leak": transition_leak is not None and transition_leak <= GATES["quiet_to_active_quiet_leak_fraction_max"],
        "general_window_denominators": len(transitions) == 34 and sum(row.get("kind") == "sustain" for row in general) == 34,
        "vb01_quiet_leak": vb_leak is not None and vb_leak <= GATES["vb01_quiet_leak_fraction_max"],
        "input_modulation_denominator": len(positives) == EXPECTED_INPUT_MODULATED,
        "modulation_retention": len(retained) >= GATES["modulated_retained_min"],
        "modulation_each_song": len(songs) == 4 and all(retained_by_song[song] >= GATES["retained_per_song_min"] for song in songs),
        "no_100ms_quiet_leak": longest < GATES["longest_quiet_leak_frames_max_exclusive"],
        "planned_preview_raw_levels": bool(previews) and all(abs(row["raw_rms_delta_db"]) <= GATES["preview_raw_rms_abs_delta_db_max"] for row in previews),
    }
    return {"numerically_eligible_for_local_preview": all(checks.values()),
            "checks": checks, "general_quiet_leak_fraction": general_leak,
            "quiet_to_active_quiet_leak_fraction": transition_leak,
            "vb01_quiet_leak_fraction": vb_leak, "input_modulated": len(positives),
            "modulated_retained": len(retained), "longest_quiet_leak_frames": longest,
            "human_echo_hiss_timbre_review": "pending", "game_suitability": "not_established"}


def common_source_gain(source: np.ndarray, rendered: np.ndarray) -> tuple[np.ndarray, np.ndarray, dict]:
    """Preserve raw relative RMS/envelope; never boost only a quiet output."""
    metrics = acoustic_metrics(source, rendered)
    if abs(metrics["raw_rms_delta_db"]) > GATES["preview_raw_rms_abs_delta_db_max"]:
        raise DiagnosticError("preview_raw_level_gate_failed")
    source_rms = math.sqrt(float(np.mean(source.astype(np.float64) ** 2)))
    if source_rms < 1e-5:
        raise DiagnosticError("preview_source_too_quiet")
    gain = 0.035 / source_rms
    if gain > 16 or max(float(np.max(np.abs(source))), float(np.max(np.abs(rendered)))) * gain > 0.9:
        raise DiagnosticError("preview_common_gain_peak_or_gain_limit")
    return source * gain, rendered * gain, {"common_gain_db": 20 * math.log10(gain),
                                            "raw_rms_delta_db": metrics["raw_rms_delta_db"]}


def _aggregate(rows: list[dict]) -> dict:
    quiet = sum(row["quiet_frames"] for row in rows)
    return {"windows": len(rows), "sustain_windows": sum(row.get("kind") == "sustain" for row in rows),
            "transition_windows": sum(row.get("kind") == "transition" for row in rows), "quiet_frames": quiet,
            "leaking_frames": sum(row["leaking_frames"] for row in rows),
            "quiet_leak_fraction": (sum(row["leaking_frames"] for row in rows) / quiet if quiet else None),
            "longest_quiet_leak_frames": max((row["longest_quiet_leak_frames"] for row in rows), default=0),
            "attack_count": sum(row["attack_count"] for row in rows),
            "attack_matched_within_200ms": sum(row["attack_matched"] for row in rows),
            "raw_rms_delta_db_median": float(np.median([row["raw_rms_delta_db"] for row in rows])) if rows else None,
            "envelope_mae_db_mean": float(np.mean([row["envelope_mae_db"] for row in rows])) if rows else None,
            "unmasked_spectral_loss_mean": float(np.mean([row["spectral_loss"] for row in rows])) if rows else None}


def evaluate(*, source_manifest: Path, split_manifest: Path, label_zip: Path,
             frozen_vb_selection: Path, upstream_root: Path, checkpoint_dir: Path,
             output_dir: Path, parent_checkpoint_dir: Path | None = None,
             minutes: int = MAX_MINUTES,
             export_numerically_gated_preview: bool = False) -> dict:
    if not 1 <= minutes <= MAX_MINUTES:
        raise DiagnosticError("evaluation_limit")
    started = time.monotonic()
    deadline = started + minutes * 60
    _local_paths_only([source_manifest, split_manifest, label_zip, frozen_vb_selection,
                       upstream_root, checkpoint_dir, output_dir] + ([parent_checkpoint_dir] if parent_checkpoint_dir else []))
    with pilot._network_disabled(), v1._exclusive_private_lock(checkpoint_dir), v1._exclusive_private_lock(output_dir), ExitStack() as parent_locks:
        if set(os.listdir(output_dir)) != {".trial.lock"}:
            raise DiagnosticError("fresh_private_output_required")
        pilot._check_disjoint_report_dir(output_dir, [checkpoint_dir, label_zip.parent, frozen_vb_selection.parent])
        v2._free_space_gate(output_dir, starting=False)
        v1._verify_feature_version()
        source, source_sha, split, split_sha, _, heldout_dir = v1._private_inputs(source_manifest, split_manifest, output_dir, upstream_root)
        train_records, heldout_records = v1.validate_documents(source, source_sha, split)
        before = checkpoint_snapshot(checkpoint_dir)
        parent_before = None
        if before["_kind"] == "continuation":
            if parent_checkpoint_dir is None:
                raise DiagnosticError("continuation_parent_binding_required")
            pilot._check_disjoint_report_dir(output_dir, [parent_checkpoint_dir])
            parent_locks.enter_context(v1._exclusive_private_lock(parent_checkpoint_dir))
            parent_before = checkpoint_snapshot(parent_checkpoint_dir)
        code_hashes = _code_hashes()
        label_sha = vb._label_sha(label_zip)
        old_selection, old_selection_sha = _json(frozen_vb_selection)
        if any(old_selection.get(key) != value for key, value in (
            ("source_manifest_sha256", source_sha), ("split_manifest_sha256", split_sha),
            ("label_zip_sha256", label_sha), ("feature_sha256", v1.FEATURE_SHA256))):
            raise DiagnosticError("existing_vb01_selection_input_binding_mismatch")
        selection = vb._source_selection(heldout_records, heldout_dir, label_zip, deadline)
        for key in ("schema", "selection_rule", "central_detector", "counts", "records"):
            if old_selection.get(key) != selection.get(key):
                raise DiagnosticError("existing_vb01_crops_changed")
        if selection["counts"].get("input64_modulated") != EXPECTED_INPUT_MODULATED:
            raise DiagnosticError("vb01_input_modulation_denominator_changed")
        general_plan = []
        general_items = []
        for index, record in enumerate(heldout_records):
            if time.monotonic() >= deadline:
                raise DiagnosticError("evaluation_time_cap")
            audio = v1._load_wav(heldout_dir, record)[:120 * pilot.SAMPLE_RATE]
            sustained = v1.select_nonoverlapping_windows(audio)
            transition = v1.select_rest_reattack_proxy_window(audio)
            item = sustained[0] if sustained else None
            general_items.append((record, item, transition, index))
            general_plan.append({"source_sha256": record["output_sha256"], "song_index": record["song_index"],
                                 "sustain_window_sha256": _window_digest(item),
                                 "transition_window_sha256": _window_digest(transition)})
        if len(general_items) != v1.HELDOUT_RECORDS or any(item is None for _, item, _, _ in general_items):
            raise DiagnosticError("34_clip_sustain_denominator_incomplete")
        torch, DDSP, multiscale_fft, safe_log = v1._mac_mps_gate(output_dir, upstream_root)
        checkpoint = torch.load(before["_path"], map_location="cpu", weights_only=True)
        parent_checkpoint = (torch.load(parent_before["_path"], map_location="cpu", weights_only=True)
                             if parent_before is not None else None)
        normalizer = verify_contract(checkpoint, before, source_sha=source_sha, split_sha=split_sha,
            train_records=train_records, parent_snapshot=parent_before, parent_checkpoint=parent_checkpoint)
        v1._assert_checkpoint_state_finite(torch, checkpoint)
        model = DDSP(**v2.MODEL_CONFIG)
        model.reverb = torch.nn.Identity()
        model.load_state_dict(checkpoint["model_state"], strict=True)
        model = model.to(torch.device("mps"))
        model.eval()
        plan = {"schema": SCHEMA, "checkpoint_sha256": before["checkpoint_sha256"],
                "training_report_sha256": before["training_report_sha256"],
                "checkpoint_marker_sha256": before["checkpoint_marker_sha256"],
                "source_manifest_sha256": source_sha, "split_manifest_sha256": split_sha,
                "label_zip_sha256": label_sha, "existing_vb_selection_sha256": old_selection_sha,
                "general_source_selection": general_plan, "normalizer_fit_only": list(normalizer),
                "architecture": v2.ARCHITECTURE, "model_config": v2.MODEL_CONFIG,
                "code_sha256": code_hashes, "seeds": SEEDS, "gates": GATES,
                "checkpoint_trial_kind": before["_kind"], "checkpoint_total_step": before["total_step"],
                "reused_diagnostic_not_blind": True}
        if parent_before:
            plan.update({"parent_checkpoint_sha256": parent_before["checkpoint_sha256"],
                         "parent_checkpoint_marker_sha256": parent_before["checkpoint_marker_sha256"],
                         "parent_training_report_sha256": parent_before["training_report_sha256"],
                         "parent_step": parent_before["step"]})
        identical_retry = freeze_or_retry(checkpoint_dir, plan)
        _write_json(output_dir, "evaluation_plan.json", plan)
        plan_sha = _json(output_dir / "evaluation_plan.json")[1]
        general_scores, vibrato_scores, preview_scores, previews = [], [], [], []

        def render(item, seed):
            if time.monotonic() >= deadline:
                raise DiagnosticError("evaluation_time_cap")
            v2._free_space_gate(output_dir, starting=False)
            torch.manual_seed(seed)
            with torch.no_grad():
                samples, pitch, loudness, _ = v1._tensors(torch, item, *normalizer)
                prediction = model(pitch, loudness).squeeze(-1)
                if prediction.shape != samples.shape or prediction.device.type != "mps":
                    raise DiagnosticError("mps_output_invalid")
                loss = v1._loss(torch, multiscale_fft, safe_log, samples, prediction, torch.ones_like(samples))
                if not bool(torch.isfinite(prediction).all().item()) or not bool(torch.isfinite(loss).item()):
                    raise DiagnosticError("nonfinite_model_output")
                rendered = prediction.detach().cpu().numpy().reshape(-1)
            return rendered, float(loss.item())

        for record, sustain, transition, index in general_items:
            for kind, item, offset in (("sustain", sustain, 100_000), ("transition", transition, 200_000)):
                if item is None:
                    continue
                rendered, loss = render(item, v1.SEED + offset + index)
                score = acoustic_metrics(item["samples"], rendered)
                score.update({"song_index": record["song_index"], "kind": kind, "spectral_loss": loss})
                general_scores.append(score)
                if kind == "transition" and not previews:
                    previews.append(("quiet_reattack", item["samples"].copy(), rendered.copy()))
                    preview_scores.append(score)
        by_name = {row["output_file"]: row for row in heldout_records}
        for index, selected in enumerate(selection["records"]):
            audio = v1._load_wav(heldout_dir, by_name[selected["output_file"]])
            frame = selected["crop_start_frame_100hz"]
            excerpt = audio[frame * pilot.BLOCK_SIZE:(frame + pilot.WINDOW_FRAMES) * pilot.BLOCK_SIZE]
            midpoint = (selected["event_start_seconds"] + selected["event_end_seconds"]) / 2
            item, input64 = vb._conditioning(excerpt, frame, midpoint)
            if input64["state"] != selected["input64_state"]:
                raise DiagnosticError("source_conditioning_changed")
            rendered, loss = render(item, v1.SEED + 300_000 + index)
            output_features = features.extract_features(rendered)
            output_mask = vb._erode_voicing(output_features["voiced_mask"])
            middle = vb._center_indices(frame, midpoint)
            times = (frame + np.arange(pilot.WINDOW_FRAMES)) / 100.0
            modulation = vb._modulation(output_features["pitch_hz"][middle], output_mask[middle], times[middle])
            common, f0_error, missing = vb._f0_comparison(item["pitch_hz"], item["mask"], output_features["pitch_hz"], output_mask, middle)
            score = acoustic_metrics(excerpt, rendered)
            score.update({"song_index": selected["song_index"], "spectral_loss": loss,
                          "input64_state": input64["state"], "output64_state": modulation["state"],
                          "input_amplitude_cents": input64.get("amplitude_cents"),
                          "output_amplitude_cents": modulation.get("amplitude_cents"),
                          "common_voiced_frames": common, "median_f0_error_cents": f0_error,
                          "longest_pitch_missing_frames": missing})
            vibrato_scores.append(score)
            if selected["planned_pair_rank"]:
                previews.append((f"vb01_song_{selected['planned_pair_rank']}", excerpt.copy(), rendered.copy()))
                preview_scores.append(score)
        songs = {row["song_index"] for row in heldout_records}
        if len(vibrato_scores) != vb.EXPECTED_SELECTED or len(songs) != 4:
            raise DiagnosticError("evaluation_population_incomplete")
        gate = preview_gate(general_scores, vibrato_scores, preview_scores, songs)
        source_after, source_sha_after, split_after, split_sha_after, _, _ = v1._private_inputs(source_manifest, split_manifest, output_dir, upstream_root)
        if source_sha_after != source_sha or split_sha_after != split_sha or vb._label_sha(label_zip) != label_sha or _json(frozen_vb_selection)[1] != old_selection_sha or _code_hashes() != code_hashes:
            raise DiagnosticError("inputs_or_code_changed_during_evaluation")
        after = checkpoint_snapshot(checkpoint_dir)
        if any(before[key] != after[key] for key in ("step", "checkpoint_sha256", "checkpoint_bytes", "checkpoint_marker_sha256", "training_report_sha256", "_inode")):
            raise DiagnosticError("checkpoint_changed_during_evaluation")
        if parent_before:
            parent_after = checkpoint_snapshot(parent_checkpoint_dir)
            if any(parent_before[key] != parent_after[key] for key in ("step", "checkpoint_sha256", "checkpoint_bytes", "checkpoint_marker_sha256", "training_report_sha256", "_inode")):
                raise DiagnosticError("continuation_parent_changed_during_evaluation")
        pilot._verify_upstream(upstream_root)
        v1._verify_feature_version()
        v2._free_space_gate(output_dir, starting=False)
        song_rows = []
        for ordinal, song in enumerate(sorted(songs), 1):
            general_group = [row for row in general_scores if row["song_index"] == song]
            vb_group = [row for row in vibrato_scores if row["song_index"] == song]
            song_rows.append({"song_ordinal": ordinal, "general": _aggregate(general_group), "vb01": _aggregate(vb_group),
                              "modulated_retained": sum(row["input64_state"] == "modulated" and row["output64_state"] == "modulated" for row in vb_group)})
        report = {"schema": SCHEMA, "status": "reused_diagnostic_complete", "checkpoint_step": before["step"],
                  "checkpoint_total_step": before["total_step"], "checkpoint_trial_kind": before["_kind"],
                  "heldout_clips_accounted": 34, "vb01_crops": 24, "song_groups": 4,
                  "general": _aggregate(general_scores), "vb01": _aggregate(vibrato_scores),
                  "quiet_to_active": _aggregate([row for row in general_scores if row["kind"] == "transition"]),
                  "per_song": song_rows, "numerical_preview_gate": gate,
                  "general_clip_crop_selection": general_plan, "general_scores_private": general_scores,
                  "vb01_scores_private": vibrato_scores, "planned_preview_metrics": preview_scores,
                  "identical_frozen_retry": identical_retry, "wall_seconds": round(time.monotonic() - started, 2),
                  "limitations": ["Already examined four-song diagnostic; not blind or independent generalization.",
                                  "Model receives performed F0; no learning of where vibrato belongs.",
                                  "Four-second windows and acoustic onset proxies are not score alignment.",
                                  "Numerical gates do not establish daegeum timbre, absence of hiss, or game suitability."]}
        pending = Path(tempfile.mkdtemp(prefix=".pending_v2_diag_", dir=output_dir))
        pending.chmod(0o700)
        preview_digests = {}
        if export_numerically_gated_preview and gate["numerically_eligible_for_local_preview"]:
            pair_dir = pending / "pairs"
            pair_dir.mkdir(mode=0o700)
            for name, source_audio, output_audio in previews:
                left, right, level = common_source_gain(source_audio, output_audio)
                for suffix, samples in (("source_input_16k", left), ("v2_dry", right)):
                    filename = f"{name}_{suffix}.wav"
                    payload = v1._wav_bytes(samples)
                    v1._atomic_private_bytes(pair_dir, filename, payload, replace=False)
                    preview_digests[filename] = _digest(payload)
            v1._fsync_directory(pair_dir)
        report["private_preview_wavs"] = len(preview_digests)
        _write_json(pending, REPORT_NAME, report)
        report_sha = _json(pending / REPORT_NAME)[1]
        binding = {"schema": SCHEMA, "status": "complete_bound_to_frozen_v2", "evaluation_plan_sha256": plan_sha,
                   "report_sha256": report_sha, "checkpoint_sha256": before["checkpoint_sha256"],
                   "training_report_sha256": before["training_report_sha256"], "normalizer_fit_only": list(normalizer),
                   "architecture": v2.ARCHITECTURE, "source_manifest_sha256": source_sha,
                   "split_manifest_sha256": split_sha, "label_zip_sha256": label_sha,
                   "existing_vb_selection_sha256": old_selection_sha, "code_sha256": code_hashes,
                   "private_preview_wav_digests": preview_digests}
        for key in ("checkpoint_trial_kind", "checkpoint_total_step", "parent_checkpoint_sha256",
                    "parent_checkpoint_marker_sha256", "parent_training_report_sha256", "parent_step"):
            if key in plan:
                binding[key] = plan[key]
        _write_json(pending, BINDING_NAME, binding)
        v1._fsync_directory(pending)
        os.replace(pending, output_dir / "result")
        v1._fsync_directory(output_dir)
        return {"status": "complete_bound_to_frozen_v2", "clips": 34, "vb01_crops": 24,
                "songs": 4, "numerical_preview_gate_passed": gate["numerically_eligible_for_local_preview"],
                "private_preview_wavs": len(preview_digests), "game_suitability": "not_established"}


def inspect_binding(*, source_manifest: Path, split_manifest: Path, label_zip: Path,
                    frozen_vb_selection: Path, upstream_root: Path,
                    checkpoint_dir: Path, output_dir: Path,
                    parent_checkpoint_dir: Path | None = None, **unused) -> dict:
    """Read-only rehash of private checkpoint, local input, plan, report and WAVs."""
    _local_paths_only([source_manifest, split_manifest, label_zip, frozen_vb_selection,
                       upstream_root, checkpoint_dir, output_dir] + ([parent_checkpoint_dir] if parent_checkpoint_dir else []))
    with pilot._network_disabled(), v1._exclusive_private_lock(checkpoint_dir), v1._exclusive_private_lock(output_dir), ExitStack() as parent_locks:
        v1._verify_feature_version()
        pilot._private_dir(output_dir / "result")
        plan, plan_sha = _json(output_dir / "evaluation_plan.json")
        report, report_sha = _json(output_dir / "result" / REPORT_NAME)
        binding, _ = _json(output_dir / "result" / BINDING_NAME)
        freeze, _ = _json(checkpoint_dir / FREEZE_NAME)
        if (freeze != plan or plan.get("schema") != SCHEMA
                or binding.get("schema") != SCHEMA or binding.get("status") != "complete_bound_to_frozen_v2"
                or binding.get("report_sha256") != report_sha or binding.get("evaluation_plan_sha256") != plan_sha
                or report.get("schema") != SCHEMA or report.get("status") != "reused_diagnostic_complete"
                or report.get("heldout_clips_accounted") != 34 or report.get("vb01_crops") != 24
                or report.get("song_groups") != 4):
            raise DiagnosticError("diagnostic_result_binding_invalid")
        source, source_sha, split, split_sha, _, _ = v1._private_inputs(source_manifest, split_manifest, output_dir, upstream_root)
        train_records, _ = v1.validate_documents(source, source_sha, split)
        snapshot = checkpoint_snapshot(checkpoint_dir)
        parent_snapshot = None
        if snapshot["_kind"] == "continuation":
            if parent_checkpoint_dir is None:
                raise DiagnosticError("continuation_parent_binding_required")
            parent_locks.enter_context(v1._exclusive_private_lock(parent_checkpoint_dir))
            parent_snapshot = checkpoint_snapshot(parent_checkpoint_dir)
        import torch
        checkpoint = torch.load(snapshot["_path"], map_location="cpu", weights_only=True)
        parent_checkpoint = (torch.load(parent_snapshot["_path"], map_location="cpu", weights_only=True)
                             if parent_snapshot is not None else None)
        normalizer = verify_contract(checkpoint, snapshot, source_sha=source_sha, split_sha=split_sha,
            train_records=train_records, parent_snapshot=parent_snapshot, parent_checkpoint=parent_checkpoint)
        expected = {"source_manifest_sha256": source_sha, "split_manifest_sha256": split_sha,
                    "label_zip_sha256": vb._label_sha(label_zip),
                    "existing_vb_selection_sha256": _json(frozen_vb_selection)[1],
                    "checkpoint_sha256": snapshot["checkpoint_sha256"],
                    "training_report_sha256": snapshot["training_report_sha256"],
                    "normalizer_fit_only": list(normalizer), "architecture": v2.ARCHITECTURE,
                    "code_sha256": _code_hashes(), "checkpoint_trial_kind": snapshot["_kind"],
                    "checkpoint_total_step": snapshot["total_step"]}
        if parent_snapshot:
            expected.update({"parent_checkpoint_sha256": parent_snapshot["checkpoint_sha256"],
                             "parent_checkpoint_marker_sha256": parent_snapshot["checkpoint_marker_sha256"],
                             "parent_training_report_sha256": parent_snapshot["training_report_sha256"],
                             "parent_step": parent_snapshot["step"]})
        if any(binding.get(key) != value or plan.get(key) != value for key, value in expected.items()):
            raise DiagnosticError("diagnostic_input_or_checkpoint_binding_mismatch")
        if plan.get("seeds") != SEEDS or plan.get("gates") != GATES or plan.get("model_config") != v2.MODEL_CONFIG:
            raise DiagnosticError("diagnostic_frozen_configuration_mismatch")
        general, vibrato, preview = (report.get(name) for name in ("general_scores_private", "vb01_scores_private", "planned_preview_metrics"))
        if (not isinstance(general, list) or not isinstance(vibrato, list) or not isinstance(preview, list)
                or sum(row.get("kind") == "sustain" for row in general) != 34 or len(vibrato) != 24):
            raise DiagnosticError("diagnostic_population_binding_mismatch")
        songs = {row["song_index"] for row in plan["general_source_selection"]}
        if preview_gate(general, vibrato, preview, songs) != report.get("numerical_preview_gate"):
            raise DiagnosticError("diagnostic_gate_binding_mismatch")
        pair_digests = binding.get("private_preview_wav_digests")
        if not isinstance(pair_digests, dict) or report.get("private_preview_wavs") != len(pair_digests):
            raise DiagnosticError("diagnostic_preview_binding_mismatch")
        pair_dir = output_dir / "result" / "pairs"
        if pair_digests:
            pilot._private_dir(pair_dir)
            if set(os.listdir(pair_dir)) != set(pair_digests):
                raise DiagnosticError("diagnostic_preview_binding_mismatch")
            for name, digest in pair_digests.items():
                if Path(name).name != name or not name.endswith(".wav") or not _sha_valid(digest):
                    raise DiagnosticError("diagnostic_preview_binding_mismatch")
                if _digest(pilot._private_file(pair_dir / name, max_bytes=2 * pilot.WINDOW_SAMPLES + 4096)) != digest:
                    raise DiagnosticError("diagnostic_preview_binding_mismatch")
        elif pair_dir.exists():
            raise DiagnosticError("diagnostic_preview_binding_mismatch")
        pilot._verify_upstream(upstream_root)
        return {"status": "complete_bound_to_frozen_v2", "clips": 34, "vb01_crops": 24,
                "songs": 4, "numerical_preview_gate_passed": report["numerical_preview_gate"]["numerically_eligible_for_local_preview"],
                "private_preview_wavs": len(pair_digests), "game_suitability": "not_established"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source-manifest", "split-manifest", "label-zip", "frozen-vb-selection",
                 "upstream-root", "checkpoint-dir", "output-dir"):
        parser.add_argument(f"--{name}", required=True, type=Path)
    parser.add_argument("--minutes", type=int, default=MAX_MINUTES)
    parser.add_argument("--parent-checkpoint-dir", type=Path)
    parser.add_argument("--export-numerically-gated-preview", action="store_true")
    parser.add_argument("--inspect-only", action="store_true")
    args = parser.parse_args()
    try:
        kwargs = vars(args)
        inspect_only = kwargs.pop("inspect_only")
        result = inspect_binding(**kwargs) if inspect_only else evaluate(**kwargs)
    except (DiagnosticError, v2.V2Error, v1.TrialError, pilot.PilotError) as exc:
        print(json.dumps({"status": "blocked", "reason": str(exc)}))
        raise SystemExit(2) from None
    except Exception:
        print(json.dumps({"status": "blocked", "reason": "private_v2_diagnostic_internal_error"}))
        raise SystemExit(2) from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
