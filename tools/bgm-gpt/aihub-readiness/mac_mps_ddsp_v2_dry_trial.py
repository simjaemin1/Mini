#!/usr/bin/env python3
"""Private, bounded *training-only* dry DDSP trial for AI Hub C001 daegeum.

V1's reverb can amplify its dry signal without a bound. V2 removes that
reverb completely and trains a new model/Adam state from scratch. The V1
checkpoint is verified and recorded as a frozen comparison, never loaded into
V2's model. The four external heldout songs are integrity-checked only; all
checkpoint choice uses three other songs from the original 15 training songs.

This script cannot render a game score or export audio. Review the protocol
and source before running it; the CLI deliberately has no heldout action.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import stat
import tempfile
import time

import numpy as np

import mac_mps_ddsp_long_trial as v1
import mac_mps_ddsp_pilot as pilot


SCHEMA = "mini.aihub-71470-mac-mps-ddsp-dry-v2-trial.v1"
START_FREE_BYTES = 12 * 1024**3
RUN_FREE_BYTES = 9 * 1024**3  # Includes a >1 GiB margin above V1's 8 GiB floor.
MAX_CHECKPOINT_BYTES = 512 * 1024**2
MAX_STEPS = 500
VALIDATE_EVERY = 50
MAX_MINUTES = 120
MAX_ANALYZED_SECONDS_PER_CLIP = 120
SEED = 71472
LOSS_WEIGHTS = {"spectral": 1.0, "envelope_db": 0.5,
                "quiet_overshoot_db": 0.5, "transition_delta_db": 0.25}
VAL_SONGS = 3
FIT_SONGS = 12
MAX_FIT_WINDOWS_PER_CLIP = 3  # Two sustained, one quiet-to-active proxy.
VAL_WINDOWS_PER_KIND_PER_SONG = 2
SAMPLER = "deterministic_three_step_cycle_one_transition_two_sustain"
MODEL_CONFIG = {key: v1.MODEL_CONFIG[key] for key in (
    "hidden_size", "n_harmonic", "n_bands", "sampling_rate", "block_size")}
ARCHITECTURE = "upstream_DDSP_with_reverb_replaced_by_Identity_dry_only"


class V2Error(Exception):
    """A fixed, non-private error code; never include a private filename."""


def _code_sha256() -> str:
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def _free_space_gate(folder: Path, *, starting: bool) -> int:
    free = shutil.disk_usage(folder).free
    if free < (START_FREE_BYTES if starting else RUN_FREE_BYTES):
        raise V2Error("disk_below_12gib_start" if starting else "disk_below_9gib_run")
    return free


def partition_training_songs(records: list[dict]) -> tuple[set[int], set[int]]:
    """Fix internal validation before looking at waveforms or model metrics."""
    song_ids = {record["song_index"] for record in records}
    if len(song_ids) != v1.TRAIN_SONGS:
        raise V2Error("training_song_count_mismatch")
    ranked = sorted(song_ids, key=lambda song: (
        hashlib.sha256(f"{SEED}:internal-val:{song}".encode()).digest(), song))
    validation = set(ranked[:VAL_SONGS])
    fit = song_ids - validation
    if len(fit) != FIT_SONGS or fit & validation:
        raise V2Error("internal_song_partition_invalid")
    return fit, validation


def _song_partition_sha(fit: set[int], validation: set[int]) -> str:
    payload = json.dumps({"fit": sorted(fit), "validation": sorted(validation)},
                         sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()


def acoustic_attack_mask(samples: np.ndarray) -> np.ndarray:
    """Source-only 40 ms rises from near-quiet to active, ±200 ms context."""
    if samples.shape != (pilot.WINDOW_SAMPLES,) or not np.all(np.isfinite(samples)):
        raise V2Error("attack_source_shape_invalid")
    blocks = samples.reshape(pilot.WINDOW_FRAMES, pilot.BLOCK_SIZE).astype(np.float64)
    rms = np.sqrt(np.mean(blocks * blocks, axis=1))
    db = 20.0 * np.log10(np.maximum(rms, 1e-5))
    event = ((db[4:] - db[:-4] > 6.0) & (db[:-4] < -48.0)
             & (db[4:] > -44.0))
    mask = np.zeros(pilot.WINDOW_FRAMES - 4, dtype=bool)
    for index in np.flatnonzero(event):
        mask[max(0, index - 20):min(len(mask), index + 21)] = True
    return mask


def relative_quiet_overshoot_db(source_db: np.ndarray,
                                rendered_db: np.ndarray) -> np.ndarray:
    """CPU diagnostic mirror of the differentiable source-relative quiet loss."""
    if source_db.shape != rendered_db.shape:
        raise V2Error("quiet_diagnostic_shape_invalid")
    ceiling = np.maximum(source_db + 6.0, -55.0)
    return np.where(source_db < -50.0,
                    np.maximum(rendered_db - ceiling, 0.0), 0.0)


def _windows_for_records(directory: Path, records: list[dict],
                         *, validation: bool, deadline: float) -> tuple[list[dict], dict]:
    """All examples come from train-side songs; no external heldout features."""
    selected: list[dict] = []
    kinds_by_song: dict[int, dict[str, int]] = {}
    skipped = 0
    transition_count = 0
    for record in sorted(records, key=lambda row: (row["song_index"], row["output_file"])):
        if time.monotonic() >= deadline:
            raise V2Error("time_cap_during_preparation")
        song = record["song_index"]
        counts = kinds_by_song.get(song, {})
        if (validation and all(counts.get(kind, 0) >= VAL_WINDOWS_PER_KIND_PER_SONG
                               for kind in ("sustain", "transition"))):
            continue
        audio = v1._load_wav(directory, record)
        audio = audio[:MAX_ANALYZED_SECONDS_PER_CLIP * pilot.SAMPLE_RATE]
        items: list[tuple[str, dict]] = []
        if not validation or counts.get("sustain", 0) < VAL_WINDOWS_PER_KIND_PER_SONG:
            items.extend(("sustain", window)
                         for window in v1.select_nonoverlapping_windows(audio)[
                             :1 if validation else 2])
        if not validation or counts.get("transition", 0) < VAL_WINDOWS_PER_KIND_PER_SONG:
            transition = v1.select_rest_reattack_proxy_window(audio)
            if transition is not None:
                items.append(("transition", transition))
        if not items:
            skipped += 1
        for kind, window in items:
            if validation and counts.get(kind, 0) >= VAL_WINDOWS_PER_KIND_PER_SONG:
                continue
            window = dict(window)
            mask = acoustic_attack_mask(window["samples"])
            if kind == "transition" and not mask.any():
                continue
            window["attack_mask"] = mask
            window["kind"] = kind
            window["song_index"] = song
            selected.append(window)
            song_counts = kinds_by_song.setdefault(song, {})
            song_counts[kind] = song_counts.get(kind, 0) + 1
            transition_count += kind == "transition"
    transition_songs = sum(kinds.get("transition", 0) > 0
                           for kinds in kinds_by_song.values())
    if validation:
        if (len(kinds_by_song) != VAL_SONGS
                or any(kinds.get("sustain", 0) < VAL_WINDOWS_PER_KIND_PER_SONG
                       or kinds.get("transition", 0) < VAL_WINDOWS_PER_KIND_PER_SONG
                       for kinds in kinds_by_song.values())):
            raise V2Error("internal_validation_coverage_insufficient")
    elif (len(kinds_by_song) != FIT_SONGS or transition_count < 24
          or transition_songs < 6):
        raise V2Error("training_transition_coverage_insufficient")
    if validation:
        quiet_by_song: dict[int, int] = {}
        for item in selected:
            block = item["samples"].reshape(pilot.WINDOW_FRAMES, pilot.BLOCK_SIZE)
            rms = np.sqrt(np.mean(block.astype(np.float64) ** 2, axis=1))
            quiet_by_song[item["song_index"]] = (quiet_by_song.get(item["song_index"], 0)
                                                   + int(np.count_nonzero(rms < 10 ** (-50 / 20))))
        if any(count < 20 for count in quiet_by_song.values()) or sum(quiet_by_song.values()) < 100:
            raise V2Error("internal_validation_quiet_coverage_insufficient")
    return selected, {"windows": len(selected), "transition_windows": transition_count,
                      "song_groups_with_transition": transition_songs,
                      "clips_without_selected_window": skipped,
                      "songs": len(kinds_by_song)}


def _frame_db(torch, audio):
    if audio.ndim != 2 or audio.shape[1] != pilot.WINDOW_SAMPLES:
        raise V2Error("loss_audio_shape_invalid")
    blocks = audio.reshape(audio.shape[0], pilot.WINDOW_FRAMES, pilot.BLOCK_SIZE)
    rms = torch.sqrt(torch.mean(blocks * blocks, dim=-1) + 1e-12)
    return 20.0 * torch.log10(torch.clamp(rms, min=1e-5))


def _loss_components(torch, multiscale_fft, safe_log, truth, prediction,
                     *, transition: bool, attack_mask) -> dict:
    """Full-waveform loss; no voicing mask at rest or attack frames."""
    if truth.shape != prediction.shape:
        raise V2Error("loss_output_shape_invalid")
    spectral = v1._loss(torch, multiscale_fft, safe_log, truth, prediction,
                        torch.ones_like(truth))
    target_db, predicted_db = _frame_db(torch, truth), _frame_db(torch, prediction)
    envelope = torch.mean(torch.abs(predicted_db - target_db)) / 20.0
    quiet = target_db < -50.0
    # A fixed -40 dBFS gate alone would ignore audible hiss just below -40
    # even when the source is near -70. Penalize source-relative overshoot.
    quiet_ceiling = torch.maximum(target_db + 6.0,
                                  torch.full_like(target_db, -55.0))
    quiet_excess = torch.relu(predicted_db - quiet_ceiling) * quiet
    quiet_loss = quiet_excess.sum() / quiet.sum().clamp(min=1) / 10.0
    # Four-hop (~40 ms) envelope change penalizes smeared re-attacks. This is
    # deliberately acoustic, not a score-aligned onset or breath label.
    target_delta = target_db[:, 4:] - target_db[:, :-4]
    predicted_delta = predicted_db[:, 4:] - predicted_db[:, :-4]
    if transition:
        if attack_mask.shape != target_delta.shape or not bool(attack_mask.any().item()):
            raise V2Error("transition_attack_mask_invalid")
        attack = ((torch.abs(predicted_delta - target_delta) * attack_mask).sum()
                  / attack_mask.sum().clamp(min=1) / 20.0)
    else:
        attack = spectral.new_zeros(())
    return {"spectral": spectral, "envelope_db": envelope,
            "quiet_overshoot_db": quiet_loss, "transition_delta_db": attack}


def _objective(components: dict):
    return sum(LOSS_WEIGHTS[name] * components[name] for name in LOSS_WEIGHTS)


def _model_and_optimizer(torch, DDSP):
    torch.manual_seed(SEED)
    model = DDSP(**MODEL_CONFIG)
    model.reverb = torch.nn.Identity()  # Explicit zero-wet path, no IR gain.
    model = model.to(torch.device("mps"))
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    return model, optimizer


def _verify_frozen_baseline(torch, baseline_dir: Path, source_sha: str,
                            split_sha: str) -> str:
    pilot._private_dir(baseline_dir)
    located = v1._checkpoint_marker(baseline_dir)
    if located is None:
        raise V2Error("frozen_baseline_missing")
    marker, path = located
    if marker["step"] != 1000:
        raise V2Error("frozen_baseline_step_mismatch")
    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    expected = {"schema": v1.SCHEMA, "step": 1000,
                "source_manifest_sha256": source_sha,
                "split_manifest_sha256": split_sha,
                "feature_sha256": v1.FEATURE_SHA256,
                "script_sha256": v1._script_sha256(),
                "upstream_commit": pilot.UPSTREAM_SHA,
                "model_config": v1.MODEL_CONFIG}
    if any(checkpoint.get(name) != value for name, value in expected.items()):
        raise V2Error("frozen_baseline_configuration_mismatch")
    if not isinstance(checkpoint.get("model_state"), dict):
        raise V2Error("frozen_baseline_model_state_missing")
    # Never return checkpoint tensors. A new dry model and Adam start at step 0.
    return marker["sha256"]


def _validation_metrics(torch, model, windows: list[dict], normalizer: tuple[float, float],
                        multiscale_fft, safe_log) -> dict:
    model.eval()
    by_song: dict[int, list[dict]] = {}
    with torch.no_grad():
        for index, item in enumerate(windows):
            torch.manual_seed(SEED + 50_000 + index)
            samples, pitch, loudness, _ = v1._tensors(torch, item, *normalizer)
            attack_mask = torch.from_numpy(item["attack_mask"].copy()).to(samples.device).reshape(1, -1)
            prediction = model(pitch, loudness).squeeze(-1)
            if prediction.shape != samples.shape or prediction.device.type != "mps":
                raise V2Error("mps_output_mismatch")
            components = _loss_components(torch, multiscale_fft, safe_log, samples,
                                          prediction, transition=item["kind"] == "transition",
                                          attack_mask=attack_mask)
            if not bool(torch.isfinite(_objective(components)).item()):
                raise V2Error("nonfinite_validation_loss")
            source_db, rendered_db = _frame_db(torch, samples), _frame_db(torch, prediction)
            quiet = source_db < -50.0
            active = source_db > -40.0
            source_rms = torch.sqrt(torch.mean(samples * samples) + 1e-12)
            render_rms = torch.sqrt(torch.mean(prediction * prediction) + 1e-12)
            metrics = {
                "objective": float(_objective(components).item()),
                "spectral": float(components["spectral"].item()),
                "envelope_mae_db": float(torch.mean(torch.abs(rendered_db - source_db)).item()),
                "quiet_frames": int(quiet.sum().item()),
                "quiet_leaking_frames": int((quiet & (rendered_db > -40.0)).sum().item()),
                "quiet_relative_overshoot_db_mean": float((
                    (torch.relu(rendered_db - torch.maximum(
                        source_db + 6.0, torch.full_like(source_db, -55.0))) * quiet).sum()
                    / quiet.sum().clamp(min=1)).item()),
                "active_frames": int(active.sum().item()),
                "active_drop_frames": int((active & (rendered_db < -50.0)).sum().item()),
                "raw_rms_delta_db": float((20.0 * torch.log10(render_rms / source_rms)).item()),
                "transition_delta_loss": float(components["transition_delta_db"].item()),
            }
            by_song.setdefault(item["song_index"], []).append(metrics)
    if len(by_song) != VAL_SONGS:
        raise V2Error("validation_song_coverage_changed")
    # Song-macro means prevent one song's many clips from deciding checkpoint.
    per_song_objective = [float(np.mean([row["objective"] for row in group]))
                          for _, group in sorted(by_song.items())]
    all_rows = [row for group in by_song.values() for row in group]
    quiet_frames = sum(row["quiet_frames"] for row in all_rows)
    active_frames = sum(row["active_frames"] for row in all_rows)
    result = {
        "song_macro_objective": round(float(np.mean(per_song_objective)), 6),
        "song_macro_objectives": [round(value, 6) for value in per_song_objective],
        "unmasked_spectral_loss_mean": round(float(np.mean([row["spectral"] for row in all_rows])), 6),
        "envelope_mae_db_mean": round(float(np.mean([row["envelope_mae_db"] for row in all_rows])), 4),
        "quiet_frames": quiet_frames,
        "quiet_leak_fraction": (round(sum(row["quiet_leaking_frames"] for row in all_rows)
                                      / quiet_frames, 6) if quiet_frames else None),
        "quiet_relative_overshoot_db_mean": (round(sum(
            row["quiet_relative_overshoot_db_mean"] * row["quiet_frames"] for row in all_rows)
            / quiet_frames, 4) if quiet_frames else None),
        "active_frames": active_frames,
        "active_drop_fraction": (round(sum(row["active_drop_frames"] for row in all_rows)
                                       / active_frames, 6) if active_frames else None),
        "raw_rms_delta_db_median": round(float(np.median(
            [row["raw_rms_delta_db"] for row in all_rows])), 4),
        "transition_delta_loss_mean": round(float(np.mean(
            [row["transition_delta_loss"] for row in all_rows])), 6),
        "windows": len(all_rows), "songs": len(by_song),
    }
    model.train()
    return result


def _save_checkpoint(folder: Path, torch, payload: dict, step: int) -> dict:
    v1._assert_checkpoint_state_finite(torch, payload)
    _free_space_gate(folder, starting=False)
    descriptor, name = tempfile.mkstemp(prefix=".pending_v2_", dir=folder)
    pending = Path(name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb") as sink:
            torch.save(payload, sink)
            sink.flush()
            os.fsync(sink.fileno())
        if not 0 < pending.stat().st_size <= MAX_CHECKPOINT_BYTES:
            raise V2Error("checkpoint_size_limit")
        _free_space_gate(folder, starting=False)  # Staged file included.
        with pending.open("rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        final_name = f"v2_step_{step:06d}_{digest[:12]}.pt"
        final = folder / final_name
        if os.path.lexists(final):
            raise V2Error("checkpoint_name_collision")
        os.replace(pending, final)
        v1._fsync_directory(folder)
        marker = {"schema": SCHEMA, "step": step, "file": final_name,
                  "sha256": digest, "bytes": final.stat().st_size}
        v1._write_json(folder, f"v2_step_{step:06d}.json", marker, replace=False)
        return marker
    finally:
        pending.unlink(missing_ok=True)


def _remove_owned_checkpoint(folder: Path, marker: dict) -> None:
    """Remove only an exact checkpoint created in this fresh V2 output folder."""
    step, name, digest = marker["step"], marker["file"], marker["sha256"]
    if (type(step) is not int or step % VALIDATE_EVERY
            or not 1 <= step <= MAX_STEPS
            or name != f"v2_step_{step:06d}_{digest[:12]}.pt"):
        raise V2Error("owned_checkpoint_marker_invalid")
    marker_path = folder / f"v2_step_{step:06d}.json"
    saved = json.loads(pilot._private_file(marker_path, max_bytes=4096))
    if saved != marker:
        raise V2Error("owned_checkpoint_marker_changed")
    checkpoint_path = folder / name
    info = checkpoint_path.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o077:
        raise V2Error("owned_checkpoint_file_invalid")
    with checkpoint_path.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != digest:
            raise V2Error("owned_checkpoint_changed")
    checkpoint_path.unlink()
    marker_path.unlink()
    v1._fsync_directory(folder)


def _train(*, source_manifest: Path, split_manifest: Path, upstream_root: Path,
           baseline_dir: Path, output_dir: Path, minutes: int, steps: int) -> dict:
    if not 1 <= minutes <= MAX_MINUTES or not 50 <= steps <= MAX_STEPS or steps % 50:
        raise V2Error("bounded_trial_limit")
    started = time.monotonic()
    deadline = started + minutes * 60
    with pilot._network_disabled(), v1._exclusive_private_lock(output_dir):
        pilot._private_dir(output_dir)
        if set(os.listdir(output_dir)) != {".trial.lock"}:
            raise V2Error("fresh_empty_output_required")
        _free_space_gate(output_dir, starting=True)
        v1._verify_feature_version()
        code_sha = _code_sha256()
        helper_sha = v1._script_sha256()
        source, source_sha, split, split_sha, train_dir, _ = v1._private_inputs(
            source_manifest, split_manifest, output_dir, upstream_root)
        pilot._check_disjoint_report_dir(output_dir, [baseline_dir])
        records, _ = v1.validate_documents(source, source_sha, split)
        fit_songs, val_songs = partition_training_songs(records)
        fit_records = [row for row in records if row["song_index"] in fit_songs]
        val_records = [row for row in records if row["song_index"] in val_songs]
        torch, DDSP, multiscale_fft, safe_log = v1._mac_mps_gate(output_dir, upstream_root)
        baseline_sha = _verify_frozen_baseline(torch, baseline_dir, source_sha, split_sha)
        fit_windows, fit_counts = _windows_for_records(train_dir, fit_records,
                                                        validation=False, deadline=deadline)
        val_windows, val_counts = _windows_for_records(train_dir, val_records,
                                                       validation=True, deadline=deadline)
        _free_space_gate(output_dir, starting=True)  # Includes preparation-time swap.
        normalizer = v1.normalize_loudness([row["loudness"] for row in fit_windows])
        if not all(math.isfinite(value) for value in normalizer) or normalizer[1] <= 1e-5:
            raise V2Error("fit_only_normalizer_invalid")
        model, optimizer = _model_and_optimizer(torch, DDSP)
        history: list[dict] = []
        best_step = None
        best_objective = math.inf
        best_marker = None
        latest_marker = None
        owned_markers: list[dict] = []
        pools = {kind: [index for index, item in enumerate(fit_windows)
                        if item["kind"] == kind]
                 for kind in ("sustain", "transition")}
        if any(not pool for pool in pools.values()):
            raise V2Error("kind_balanced_pool_missing")
        kind_seen = {kind: 0 for kind in pools}
        cached_permutations: dict[tuple[str, int], np.ndarray] = {}
        model.train()
        for step in range(1, steps + 1):
            if time.monotonic() >= deadline:
                break
            _free_space_gate(output_dir, starting=False)
            kind = "transition" if (step - 1) % 3 == 0 else "sustain"
            seen = kind_seen[kind]
            epoch, offset = divmod(seen, len(pools[kind]))
            key = (kind, epoch)
            if key not in cached_permutations:
                salt = 1 if kind == "transition" else 2
                cached_permutations[key] = np.random.default_rng(
                    SEED + 10_000 * salt + epoch).permutation(len(pools[kind]))
            index = pools[kind][int(cached_permutations[key][offset])]
            kind_seen[kind] += 1
            item = fit_windows[index]
            torch.manual_seed(SEED + step)
            samples, pitch, loudness, _ = v1._tensors(torch, item, *normalizer)
            attack_mask = torch.from_numpy(item["attack_mask"].copy()).to(samples.device).reshape(1, -1)
            prediction = model(pitch, loudness).squeeze(-1)
            if prediction.shape != samples.shape or prediction.device.type != "mps":
                raise V2Error("mps_output_mismatch")
            components = _loss_components(torch, multiscale_fft, safe_log, samples,
                                          prediction, transition=item["kind"] == "transition",
                                          attack_mask=attack_mask)
            loss = _objective(components)
            if not bool(torch.isfinite(loss).item()):
                raise V2Error("nonfinite_training_loss")
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            v1._assert_model_finite(torch, model, gradients=True)
            optimizer.step()
            v1._assert_model_finite(torch, model, gradients=False)
            if step % VALIDATE_EVERY:
                continue
            if (_code_sha256() != code_sha or v1._script_sha256() != helper_sha):
                raise V2Error("script_changed_during_training")
            v1._verify_feature_version()
            validation = _validation_metrics(torch, model, val_windows, normalizer,
                                             multiscale_fft, safe_log)
            improved = validation["song_macro_objective"] < best_objective
            torch.mps.synchronize()
            checkpoint = {
                "schema": SCHEMA, "step": step, "source_manifest_sha256": source_sha,
                "split_manifest_sha256": split_sha,
                "feature_sha256": v1.FEATURE_SHA256,
                "script_sha256": code_sha,
                "v1_baseline_checkpoint_sha256": baseline_sha,
                "upstream_commit": pilot.UPSTREAM_SHA,
                "architecture": ARCHITECTURE, "model_config": MODEL_CONFIG,
                "loss_weights": LOSS_WEIGHTS,
                "sampler": SAMPLER,
                "v1_helper_script_sha256": helper_sha,
                "internal_partition_sha256": _song_partition_sha(fit_songs, val_songs),
                "normalizer_fit_only": list(normalizer),
                "fit_windows": fit_counts["windows"],
                "validation_windows": val_counts["windows"],
                "validation": validation,
                "model_state": v1._cpu_state(model.state_dict(), torch),
                "optimizer_state": v1._cpu_state(optimizer.state_dict(), torch),
            }
            marker = _save_checkpoint(output_dir, torch, checkpoint, step)
            owned_markers.append(marker)
            latest_marker = marker
            if improved:
                best_objective = validation["song_macro_objective"]
                best_step = step
                best_marker = marker
            keep = {best_marker["step"], latest_marker["step"]}
            for old in list(owned_markers):
                if old["step"] not in keep:
                    _remove_owned_checkpoint(output_dir, old)
                    owned_markers.remove(old)
            if len(owned_markers) > 2:
                raise V2Error("checkpoint_retention_limit")
            history.append({"step": step, "validation": validation})
            report = {
                "schema": SCHEMA,
                "status": "complete" if step == steps else "checkpoint",
                "interpretation": "Dry-only from-scratch diagnostic; no score conditioning, no game suitability claim.",
                "source_manifest_sha256": source_sha,
                "split_manifest_sha256": split_sha,
                "v1_baseline_checkpoint_sha256": baseline_sha,
                "feature_sha256": v1.FEATURE_SHA256,
                "script_sha256": code_sha,
                "upstream_commit": pilot.UPSTREAM_SHA,
                "architecture": ARCHITECTURE, "model_config": MODEL_CONFIG,
                "loss_weights": LOSS_WEIGHTS,
                "sampler": SAMPLER,
                "v1_helper_script_sha256": helper_sha,
                "internal_partition_sha256": _song_partition_sha(fit_songs, val_songs),
                "fit_song_groups": FIT_SONGS, "validation_song_groups": VAL_SONGS,
                "external_heldout_training_or_selection_songs": 0,
                "fit_counts": fit_counts, "validation_counts": val_counts,
                "normalizer_fit_only": list(normalizer),
                "best_internal_validation_step": best_step,
                "best_checkpoint_sha256": best_marker["sha256"],
                "latest_checkpoint_sha256": latest_marker["sha256"],
                "retained_checkpoint_count": len(owned_markers),
                "steps_target": steps,
                "history": history,
                "wall_seconds": round(time.monotonic() - started, 2),
                "private_checkpoint_only": True,
            }
            v1._write_json(output_dir, "v2_dry_trial_report.json", report, replace=True)
        return {"status": "complete" if history and history[-1]["step"] == steps
                else "time_cap_or_no_checkpoint", "last_checkpoint_step": (
                    history[-1]["step"] if history else 0),
                "best_internal_validation_step": best_step,
                "fit_song_groups": FIT_SONGS,
                "validation_song_groups": VAL_SONGS,
                "external_heldout_training_or_selection_songs": 0}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-manifest", required=True, type=Path)
    parser.add_argument("--split-manifest", required=True, type=Path)
    parser.add_argument("--upstream-root", required=True, type=Path)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--minutes", type=int, default=90)
    parser.add_argument("--steps", type=int, default=50,
                        help="50-step smoke by default; maximum 500 in increments of 50")
    args = parser.parse_args()
    try:
        result = _train(**vars(args))
    except (V2Error, v1.TrialError, pilot.PilotError) as exc:
        print(json.dumps({"status": "blocked", "reason": str(exc)}))
        raise SystemExit(2) from None
    except Exception:
        print(json.dumps({"status": "blocked", "reason": "private_v2_internal_error"}))
        raise SystemExit(2) from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
