#!/usr/bin/env python3
"""Bounded private IRCAM DDSP timbre trial, separate train/evaluate actions.

This is deliberately not a score-to-expression model. The licensed AI Hub
audio, its conditioning, checkpoints, and A/B excerpts stay in local private
0700 directories; only fixed aggregate JSON is printed. Run private actions
only after the F0 selection and this code have been reviewed.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import io
import json
import math
import os
from pathlib import Path
import platform
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import wave

import numpy as np

import ddsp_wsl_pilot as split_gate
import mac_mps_ddsp_pilot as pilot
from mac_mps_ddsp_features import (
    N_FFT, YIN_WINDOW, YIN_THRESHOLD, YIN_MIN_HZ, YIN_MAX_HZ,
    extract_features, normalize_loudness,
)


SCHEMA = "mini.aihub-71470-mac-mps-ddsp-long-trial.v1"
FEATURE_SHA256 = "388efc3d3c6e513cec1f69ae92bf0568818675ec6b73ef4fa42bccddc7147239"
SOURCE_RECORDS = 250
TRAIN_RECORDS = 216
HELDOUT_RECORDS = 34
TRAIN_SONGS = 15
HELDOUT_SONGS = 4
MAX_CLIPS = TRAIN_RECORDS
MAX_WINDOWS_PER_CLIP = 3
MAX_STEPS = 1000
MAX_MINUTES = 120
MAX_ANALYZED_SECONDS_PER_CLIP = 120
MAX_CHECKPOINT_BYTES = 512 * 1024 * 1024
SCALES = (4096, 2048, 1024, 512, 256, 128)
SEED = 71470
REPORT_NAME = "long_trial_report.json"
CONDITIONING = {
    "sample_rate_hz": 16000,
    "block_size_samples": 160,
    "frame_rate_hz": 100,
    "spectral_fft_size": N_FFT,
    "pitch_estimator": "local_fft_yin_cmnd",
    "yin_window_samples": YIN_WINDOW,
    "yin_threshold": YIN_THRESHOLD,
    "yin_min_hz": YIN_MIN_HZ,
    "yin_max_hz": YIN_MAX_HZ,
    "loudness_statistics": "mean of per-selected-4s-window means and unbiased standard deviations; training windows only",
}
MODEL_CONFIG = {
    "hidden_size": 512, "n_harmonic": 100, "n_bands": 65,
    "sampling_rate": 16000, "block_size": 160,
    "training_window_seconds": 4, "max_nonoverlapping_windows_per_clip": 3,
}


class TrialError(Exception):
    """A non-private failure code; never include input paths or filenames."""


def _verify_feature_version() -> str:
    path = Path(__file__).with_name("mac_mps_ddsp_features.py")
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != FEATURE_SHA256:
        raise TrialError("feature_extractor_version_mismatch")
    return actual


def _script_sha256() -> str:
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def _safe_names(values: object) -> list[str]:
    if not isinstance(values, list):
        raise TrialError("split_names_invalid")
    names = [pilot._safe_name(value) for value in values]
    if len(names) != len(set(names)):
        raise TrialError("duplicate_split_name")
    return names


def validate_documents(source: dict, source_sha: str, split: dict) -> tuple[list[dict], list[dict]]:
    """Require exactly the approved C001 song split, without loading audio."""
    if source.get("schema") != pilot.PREP_SCHEMA or source.get("split") != "training":
        raise TrialError("training_source_required")
    if source.get("cluster_id") != "C001" or split.get("cluster_id") != "C001":
        raise TrialError("approved_cluster_required")
    if source.get("resample") != {
        "sample_rate_hz": 16000, "channels": 1, "bit_depth": 16, "codec": "pcm_s16le",
    }:
        raise TrialError("expected_16k_mono_pcm16")
    if split.get("schema") != pilot.SPLIT_SCHEMA or split.get("status") != "materialized":
        raise TrialError("materialized_split_required")
    if split.get("source_manifest_sha256") != source_sha:
        raise TrialError("split_source_mismatch")
    records = source.get("records")
    if not isinstance(records, list) or len(records) != SOURCE_RECORDS:
        raise TrialError("source_count_mismatch")
    train_names = _safe_names(split.get("training_files"))
    heldout_names = _safe_names(split.get("heldout_files"))
    if (len(train_names) != TRAIN_RECORDS or len(heldout_names) != HELDOUT_RECORDS
            or split.get("training_wavs") != TRAIN_RECORDS
            or split.get("heldout_wavs") != HELDOUT_RECORDS
            or split.get("training_song_groups") != TRAIN_SONGS
            or split.get("heldout_song_groups") != HELDOUT_SONGS):
        raise TrialError("split_count_mismatch")
    if set(train_names) & set(heldout_names):
        raise TrialError("train_heldout_name_overlap")
    mapping: dict[str, dict] = {}
    hashes: set[str] = set()
    for record in records:
        if not isinstance(record, dict):
            raise TrialError("record_invalid")
        name = pilot._safe_name(record.get("output_file"))
        digest = record.get("output_sha256")
        song = record.get("song_index")
        size = record.get("output_bytes")
        frames = record.get("output_frames")
        if (name in mapping or not isinstance(digest, str)
                or not re.fullmatch(r"[0-9a-f]{64}", digest)
                or digest in hashes or type(song) is not int or song <= 0
                or type(size) is not int or not 44 <= size <= split_gate.MAX_AUDIO_BYTES
                or type(frames) is not int or frames <= 0):
            raise TrialError("record_invalid")
        mapping[name] = record
        hashes.add(digest)
    if set(mapping) != set(train_names) | set(heldout_names):
        raise TrialError("split_record_coverage")
    train_songs = {mapping[name]["song_index"] for name in train_names}
    heldout_songs = {mapping[name]["song_index"] for name in heldout_names}
    heldout_indices = split.get("heldout_song_indices")
    if (len(train_songs) != TRAIN_SONGS or len(heldout_songs) != HELDOUT_SONGS
            or train_songs & heldout_songs or not isinstance(heldout_indices, list)
            or any(type(index) is not int for index in heldout_indices)
            or sorted(heldout_indices) != sorted(heldout_songs)):
        raise TrialError("train_heldout_song_overlap")
    return [mapping[name] for name in train_names], [mapping[name] for name in heldout_names]


def _private_inputs(source_manifest: Path, split_manifest: Path,
                    output_dir: Path, upstream_root: Path) -> tuple[dict, str, dict, str, Path, Path]:
    pilot._private_dir(output_dir)
    pilot._check_free_space(output_dir)
    pilot._check_disjoint_report_dir(output_dir, [
        source_manifest.parent, split_manifest.parent,
        split_manifest.parent / "train", split_manifest.parent / "heldout", upstream_root,
    ])
    source, source_sha = pilot._read_json(source_manifest)
    split, split_sha = pilot._read_json(split_manifest)
    train_records, heldout_records = validate_documents(source, source_sha, split)
    train_dir = pilot._private_dir(split_manifest.parent / "train")
    heldout_dir = pilot._private_dir(split_manifest.parent / "heldout")
    if (set(os.listdir(train_dir)) != {record["output_file"] for record in train_records}
            or set(os.listdir(heldout_dir)) != {record["output_file"] for record in heldout_records}):
        raise TrialError("unexpected_split_directory_entry")
    train_inodes: set[tuple[int, int]] = set()
    heldout_inodes: set[tuple[int, int]] = set()
    for directory, records, seen in (
        (train_dir, train_records, train_inodes),
        (heldout_dir, heldout_records, heldout_inodes),
    ):
        for record in records:
            split_gate._check_one_wav(directory, record)  # SHA + PCM header; no ML features.
            info = (directory / record["output_file"]).lstat()
            if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o077:
                raise TrialError("private_audio_permissions")
            inode = (info.st_dev, info.st_ino)
            if inode in seen:
                raise TrialError("duplicate_split_inode")
            seen.add(inode)
    if train_inodes & heldout_inodes:
        raise TrialError("train_heldout_inode_overlap")
    return source, source_sha, split, split_sha, train_dir, heldout_dir


def _balanced_training_records(records: list[dict], clips: int) -> list[dict]:
    if not 5 <= clips <= MAX_CLIPS:
        raise TrialError("clip_limit")
    songs: dict[int, list[dict]] = {}
    for record in records:
        songs.setdefault(record["song_index"], []).append(record)
    for group in songs.values():
        group.sort(key=lambda item: item["output_file"])
    result: list[dict] = []
    while len(result) < clips:
        advanced = False
        for song in sorted(songs):
            if songs[song] and len(result) < clips:
                result.append(songs[song].pop(0))
                advanced = True
        if not advanced:
            raise TrialError("insufficient_training_clips")
    return result


def _load_wav(directory: Path, record: dict) -> np.ndarray:
    payload = pilot._private_file(directory / record["output_file"],
                                  max_bytes=split_gate.MAX_AUDIO_BYTES)
    if (len(payload) != record["output_bytes"]
            or hashlib.sha256(payload).hexdigest() != record["output_sha256"]):
        raise TrialError("private_wav_changed")
    try:
        with wave.open(io.BytesIO(payload), "rb") as reader:
            if (reader.getnchannels() != 1 or reader.getsampwidth() != 2
                    or reader.getframerate() != 16000 or reader.getcomptype() != "NONE"
                    or reader.getnframes() != record["output_frames"]):
                raise TrialError("private_wav_format")
            samples = reader.readframes(reader.getnframes())
    except (EOFError, wave.Error) as exc:
        raise TrialError("private_wav_unreadable") from exc
    if len(samples) != 2 * record["output_frames"]:
        raise TrialError("private_wav_truncated")
    return np.frombuffer(samples, dtype="<i2").astype(np.float32) / 32768.0


def select_nonoverlapping_windows(audio: np.ndarray) -> list[dict]:
    """At most three high-confidence, nonoverlapping 4 s windows per clip."""
    if audio.ndim != 1 or audio.size < pilot.WINDOW_SAMPLES:
        return []
    usable = audio[: audio.size // pilot.BLOCK_SIZE * pilot.BLOCK_SIZE]
    features = extract_features(usable, sample_rate=pilot.SAMPLE_RATE,
                                block_size=pilot.BLOCK_SIZE)
    pitch = features["pitch_hz"]
    loudness = features["loudness"]
    voiced = features["voiced_mask"]
    rms_db = features["rms_db"]
    candidates: list[tuple[float, float, int, np.ndarray]] = []
    for start in range(0, len(pitch) - pilot.WINDOW_FRAMES + 1, 100):
        frame_voiced = np.asarray(voiced[start:start + pilot.WINDOW_FRAMES], dtype=bool)
        if float(np.mean(frame_voiced)) < 0.85:
            continue
        mask = frame_voiced.copy()
        for shift in (1, 2):
            mask[shift:] &= frame_voiced[:-shift]
            mask[:-shift] &= frame_voiced[shift:]
        if float(np.mean(mask)) < 0.75:
            continue
        energy = float(np.median(rms_db[start:start + pilot.WINDOW_FRAMES][mask]))
        candidates.append((float(np.mean(mask)), energy, start, mask))
    candidates.sort(key=lambda item: (-item[0], -item[1], item[2]))
    chosen: list[tuple[int, np.ndarray]] = []
    for _, _, start, mask in candidates:
        if all(abs(start - previous) >= pilot.WINDOW_FRAMES for previous, _ in chosen):
            chosen.append((start, mask))
        if len(chosen) == MAX_WINDOWS_PER_CLIP:
            break
    windows = []
    for start, mask in sorted(chosen):
        stop = start + pilot.WINDOW_FRAMES
        sample_start, sample_stop = start * pilot.BLOCK_SIZE, stop * pilot.BLOCK_SIZE
        windows.append({
            "samples": np.ascontiguousarray(usable[sample_start:sample_stop], dtype=np.float32),
            "pitch_hz": np.where(mask, pitch[start:stop], 0).astype(np.float32),
            "loudness": np.ascontiguousarray(loudness[start:stop], dtype=np.float32),
            "mask": mask.copy(),
        })
    return windows


def select_rest_reattack_proxy_window(audio: np.ndarray) -> dict | None:
    """A 4 s acoustic quiet-to-active transition; not a breath annotation.

    This deliberately does not impose the training voiced-window threshold.
    It supplies an unmasked check of quiet leakage and re-entry behavior.
    """
    if audio.ndim != 1 or audio.size < pilot.WINDOW_SAMPLES:
        return None
    usable = audio[: audio.size // pilot.BLOCK_SIZE * pilot.BLOCK_SIZE]
    features = extract_features(usable, sample_rate=pilot.SAMPLE_RATE,
                                block_size=pilot.BLOCK_SIZE)
    rms = features["rms_db"]
    for transition in range(20, len(rms) - 20):
        if (float(np.median(rms[transition - 20:transition])) >= -50
                or float(np.median(rms[transition:transition + 20])) <= -42):
            continue
        start = max(0, min(transition - 100, len(rms) - pilot.WINDOW_FRAMES))
        stop = start + pilot.WINDOW_FRAMES
        voiced = np.asarray(features["voiced_mask"][start:stop], dtype=bool)
        pitch = np.where(voiced, features["pitch_hz"][start:stop], 0).astype(np.float32)
        return {
            "samples": np.ascontiguousarray(
                usable[start * pilot.BLOCK_SIZE:stop * pilot.BLOCK_SIZE], dtype=np.float32),
            "pitch_hz": pitch,
            "loudness": np.ascontiguousarray(features["loudness"][start:stop], dtype=np.float32),
            "mask": voiced.copy(),
        }
    return None


def quiet_leakage_counts(source: np.ndarray, reconstruction: np.ndarray) -> tuple[int, int]:
    """Source<-50 dBFS 10 ms blocks; count recon blocks>-40 dBFS."""
    if source.shape != (pilot.WINDOW_SAMPLES,) or reconstruction.shape != source.shape:
        raise TrialError("leakage_window_shape_invalid")
    source_blocks = source.reshape(pilot.WINDOW_FRAMES, pilot.BLOCK_SIZE)
    rendered_blocks = reconstruction.reshape(pilot.WINDOW_FRAMES, pilot.BLOCK_SIZE)
    source_rms = np.sqrt(np.mean(source_blocks.astype(np.float64) ** 2, axis=1))
    rendered_rms = np.sqrt(np.mean(rendered_blocks.astype(np.float64) ** 2, axis=1))
    quiet = source_rms < 10 ** (-50 / 20)
    leaking = rendered_rms > 10 ** (-40 / 20)
    return int(np.count_nonzero(quiet)), int(np.count_nonzero(quiet & leaking))


def _build_windows(directory: Path, records: list[dict], *, deadline: float) -> tuple[list[dict], int, int]:
    windows: list[dict] = []
    skipped = 0
    truncated = 0
    for record in records:
        if time.monotonic() >= deadline:
            raise TrialError("time_cap_during_preparation")
        audio = _load_wav(directory, record)
        cap = MAX_ANALYZED_SECONDS_PER_CLIP * pilot.SAMPLE_RATE
        if audio.size > cap:
            audio = audio[:cap]
            truncated += 1
        clip_windows = select_nonoverlapping_windows(audio)
        if clip_windows:
            windows.extend(clip_windows)
        else:
            skipped += 1
    return windows, skipped, truncated


def _mac_mps_gate(output_dir: Path, upstream_root: Path):
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise TrialError("mac_arm64_required")
    if os.environ.get("PYTORCH_ENABLE_MPS_FALLBACK", "0") not in ("", "0"):
        raise TrialError("mps_fallback_forbidden")
    os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "0"
    physical = subprocess.run(["sysctl", "-n", "hw.memsize"], check=True,
                              capture_output=True, text=True, timeout=10)
    if int(physical.stdout.strip()) < 16_000_000_000:
        raise TrialError("memory_below_16gb")
    pilot._check_free_space(output_dir)
    pilot._verify_upstream(upstream_root)
    sys.path.insert(0, str(upstream_root))
    try:
        import torch
        from ddsp.model import DDSP
        from ddsp.core import multiscale_fft, safe_log
    except ImportError as exc:
        raise TrialError("upstream_import_failed") from exc
    for module_name, filename in (("ddsp.model", "ddsp/model.py"),
                                  ("ddsp.core", "ddsp/core.py")):
        imported = sys.modules.get(module_name)
        actual = Path(getattr(imported, "__file__", "")).resolve(strict=False)
        if actual != (upstream_root / filename).resolve(strict=True):
            raise TrialError("upstream_import_path_mismatch")
    if torch.__version__ != "2.14.1" or not torch.backends.mps.is_available():
        raise TrialError("tested_mps_torch_required")
    torch.mps.set_per_process_memory_fraction(0.5)
    return torch, DDSP, multiscale_fft, safe_log


def _model_and_optimizer(torch, DDSP):
    torch.manual_seed(SEED)
    model = DDSP(**{key: MODEL_CONFIG[key] for key in (
        "hidden_size", "n_harmonic", "n_bands", "sampling_rate", "block_size")})
    model = model.to(torch.device("mps"))
    return model, torch.optim.Adam(model.parameters(), lr=1e-3)


def _loss(torch, multiscale_fft, safe_log, truth, prediction, mask):
    target = multiscale_fft(truth * mask, SCALES, 0.75)
    estimate = multiscale_fft(prediction * mask, SCALES, 0.75)
    value = torch.zeros((), device=truth.device)
    for a, b in zip(target, estimate):
        value = value + (a - b).abs().mean()
        value = value + (safe_log(a) - safe_log(b)).abs().mean()
    return value


def _tensors(torch, item: dict, mean: float, std: float):
    device = torch.device("mps")
    audio = torch.from_numpy(item["samples"].copy()).to(device).reshape(1, pilot.WINDOW_SAMPLES)
    pitch = torch.from_numpy(item["pitch_hz"].copy()).to(device).reshape(1, pilot.WINDOW_FRAMES, 1)
    loudness = ((torch.from_numpy(item["loudness"].copy()).to(device) - mean) / std).reshape(
        1, pilot.WINDOW_FRAMES, 1)
    mask = torch.from_numpy(np.repeat(item["mask"], pilot.BLOCK_SIZE).astype(np.float32)).to(
        device).reshape(1, pilot.WINDOW_SAMPLES)
    return audio, pitch, loudness, mask


def _cpu_state(value, torch):
    if isinstance(value, torch.Tensor):
        return value.detach().cpu()
    if isinstance(value, dict):
        return {key: _cpu_state(item, torch) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return type(value)(_cpu_state(item, torch) for item in value)
    return value


def _assert_model_finite(torch, model, *, gradients: bool) -> None:
    """One device synchronization for every gradient or parameter family."""
    tensors = []
    for parameter in model.parameters():
        value = parameter.grad if gradients else parameter
        if value is not None:
            tensors.append(torch.isfinite(value).all())
    if not tensors or not bool(torch.stack(tensors).all().item()):
        raise TrialError("nonfinite_gradient" if gradients else "nonfinite_parameter")


def _assert_checkpoint_state_finite(torch, payload: dict) -> None:
    """Refuse nonfinite model/optimizer tensors before any private disk write."""
    def walk(value):
        if isinstance(value, torch.Tensor):
            if not bool(torch.isfinite(value).all().item()):
                raise TrialError("nonfinite_checkpoint_state")
        elif isinstance(value, dict):
            for item in value.values():
                walk(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                walk(item)

    for name in ("model_state", "optimizer_state"):
        if name not in payload:
            raise TrialError("checkpoint_state_missing")
        walk(payload[name])


def _atomic_private_bytes(folder: Path, name: str, payload: bytes, *, replace: bool) -> None:
    pilot._private_dir(folder)
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
        raise TrialError("private_output_name_invalid")
    target = folder / name
    if not replace and os.path.lexists(target):
        raise TrialError("private_output_exists")
    descriptor, temp_name = tempfile.mkstemp(prefix=".pending_", dir=folder)
    temp = Path(temp_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb") as sink:
            sink.write(payload)
            sink.flush()
            os.fsync(sink.fileno())
        if replace and os.path.lexists(target):
            info = target.lstat()
            if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o077:
                raise TrialError("private_output_not_regular")
        os.replace(temp, target)
        os.chmod(target, 0o600)
        _fsync_directory(folder)
    finally:
        temp.unlink(missing_ok=True)


def _fsync_directory(folder: Path) -> None:
    descriptor = os.open(folder, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _write_json(folder: Path, name: str, value: dict, *, replace: bool) -> None:
    payload = json.dumps(value, sort_keys=True, ensure_ascii=False, indent=2).encode() + b"\n"
    if len(payload) > 16_384:
        raise TrialError("private_report_too_large")
    _atomic_private_bytes(folder, name, payload, replace=replace)


def _checkpoint_marker(folder: Path) -> tuple[dict, Path] | None:
    markers = sorted(folder.glob("checkpoint_step_??????.json"))
    if not markers:
        return None
    latest = markers[-1]
    marker_bytes = pilot._private_file(latest, max_bytes=4096)
    try:
        marker = json.loads(marker_bytes)
    except ValueError as exc:
        raise TrialError("checkpoint_marker_invalid") from exc
    if not isinstance(marker, dict):
        raise TrialError("checkpoint_marker_invalid")
    step = marker.get("step")
    name = marker.get("checkpoint_file")
    digest = marker.get("sha256")
    if (type(step) is not int or not 1 <= step <= MAX_STEPS
            or latest.name != f"checkpoint_step_{step:06d}.json"
            or not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest)
            or name != f"checkpoint_step_{step:06d}_{digest[:12]}.pt"):
        raise TrialError("checkpoint_marker_invalid")
    path = folder / name
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o077
            or not 0 < info.st_size <= MAX_CHECKPOINT_BYTES):
        raise TrialError("checkpoint_file_invalid")
    with path.open("rb") as source:
        actual = hashlib.file_digest(source, "sha256").hexdigest()
    if actual != digest:
        raise TrialError("checkpoint_hash_mismatch")
    return marker, path


def _save_checkpoint(folder: Path, torch, payload: dict, step: int) -> None:
    _assert_checkpoint_state_finite(torch, payload)
    descriptor, temp_name = tempfile.mkstemp(prefix=".pending_checkpoint_", dir=folder)
    temp = Path(temp_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb") as sink:
            torch.save(payload, sink)
            sink.flush()
            os.fsync(sink.fileno())
        if temp.stat().st_size > MAX_CHECKPOINT_BYTES:
            raise TrialError("checkpoint_too_large")
        pilot._check_free_space(folder)  # Include the staged checkpoint in the 8 GiB floor.
        with temp.open("rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        name = f"checkpoint_step_{step:06d}_{digest[:12]}.pt"
        final = folder / name
        if os.path.lexists(final):
            with final.open("rb") as source:
                if hashlib.file_digest(source, "sha256").hexdigest() != digest:
                    raise TrialError("checkpoint_name_collision")
        else:
            os.replace(temp, final)
            _fsync_directory(folder)
        _write_json(folder, f"checkpoint_step_{step:06d}.json",
                    {"schema": SCHEMA, "step": step, "checkpoint_file": name,
                     "sha256": digest}, replace=False)
    finally:
        temp.unlink(missing_ok=True)


@contextmanager
def _exclusive_private_lock(folder: Path):
    pilot._private_dir(folder)
    path = folder / ".trial.lock"
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o077:
            raise TrialError("private_lock_invalid")
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise TrialError("private_trial_already_running") from exc
        yield
    finally:
        os.close(descriptor)


def _dataset_digest(records: list[dict], windows: list[dict]) -> str:
    payload = "\n".join(record["output_sha256"] for record in records)
    payload += f"\nwindows={len(windows)}\n"
    return hashlib.sha256(payload.encode()).hexdigest()


def _train_impl(*, source_manifest: Path, split_manifest: Path, upstream_root: Path,
                output_dir: Path, clips: int, steps: int, minutes: int,
                save_every: int, resume: bool) -> dict:
    if not 5 <= clips <= MAX_CLIPS or not 1 <= steps <= MAX_STEPS:
        raise TrialError("trial_limit")
    if not 1 <= minutes <= MAX_MINUTES or not 10 <= save_every <= 100:
        raise TrialError("trial_limit")
    started = time.monotonic()
    deadline = started + minutes * 60
    with pilot._network_disabled(), _exclusive_private_lock(output_dir):
        _verify_feature_version()
        code_sha = _script_sha256()
        source, source_sha, split, split_sha, train_dir, _ = _private_inputs(
            source_manifest, split_manifest, output_dir, upstream_root)
        training_names = set(split["training_files"])
        records = _balanced_training_records(
            [record for record in source["records"]
             if record["output_file"] in training_names], clips)
        # The helper above was constructed only after exact full-split validation.
        torch, DDSP, multiscale_fft, safe_log = _mac_mps_gate(output_dir, upstream_root)
        existing = _checkpoint_marker(output_dir)
        if resume != (existing is not None):
            raise TrialError("resume_flag_mismatch")
        if not resume and os.path.lexists(output_dir / REPORT_NAME):
            raise TrialError("existing_trial_requires_new_folder")
        windows, skipped, truncated = _build_windows(train_dir, records, deadline=deadline)
        if len(windows) < 5:
            raise TrialError("insufficient_confident_training_windows")
        mean, std = normalize_loudness([item["loudness"] for item in windows])
        if not math.isfinite(mean) or not math.isfinite(std) or std <= 1e-5:
            raise TrialError("loudness_normalizer_invalid")
        dataset_digest = _dataset_digest(records, windows)
        model, optimizer = _model_and_optimizer(torch, DDSP)
        current_step = 0
        if existing is not None:
            marker, checkpoint_path = existing
            checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
            expected = {
                "schema": SCHEMA, "source_manifest_sha256": source_sha,
                "split_manifest_sha256": split_sha, "feature_sha256": FEATURE_SHA256,
                "script_sha256": code_sha, "dataset_digest": dataset_digest,
                "upstream_commit": pilot.UPSTREAM_SHA, "clips_requested": clips,
                "windows": len(windows), "loudness_mean": mean, "loudness_std": std,
                "conditioning": CONDITIONING, "model_config": MODEL_CONFIG,
            }
            if any(checkpoint.get(key) != value for key, value in expected.items()):
                raise TrialError("resume_configuration_mismatch")
            if checkpoint.get("step") != marker["step"]:
                raise TrialError("resume_step_mismatch")
            model.load_state_dict(checkpoint["model_state"])
            optimizer.load_state_dict(checkpoint["optimizer_state"])
            current_step = marker["step"]
            if current_step > steps:
                raise TrialError("resume_target_before_checkpoint")
        if current_step == steps:
            return {"status": "already_complete", "steps": current_step,
                    "windows": len(windows), "heldout_training_clips": 0}
        first_loss = None
        last_loss = None
        stopped_by_time = False
        saved_step = current_step

        def persist(step: int) -> None:
            nonlocal saved_step
            torch.mps.synchronize()
            pilot._check_free_space(output_dir)
            checkpoint = {
                "schema": SCHEMA, "step": step,
                "source_manifest_sha256": source_sha,
                "split_manifest_sha256": split_sha,
                "feature_sha256": FEATURE_SHA256, "script_sha256": code_sha,
                "dataset_digest": dataset_digest,
                "upstream_commit": pilot.UPSTREAM_SHA,
                "conditioning": CONDITIONING, "model_config": MODEL_CONFIG,
                "clips_requested": clips, "windows": len(windows),
                "loudness_mean": mean, "loudness_std": std,
                "model_state": _cpu_state(model.state_dict(), torch),
                "optimizer_state": _cpu_state(optimizer.state_dict(), torch),
            }
            _save_checkpoint(output_dir, torch, checkpoint, step)
            _write_json(output_dir, REPORT_NAME, {
                "schema": SCHEMA,
                "status": ("bounded_trial_completed" if step == steps
                           else "bounded_trial_checkpoint"),
                "device": "mps", "torch_version": torch.__version__,
                "upstream_repo": "acids-ircam/ddsp_pytorch",
                "upstream_commit": pilot.UPSTREAM_SHA,
                "upstream_license": "Apache-2.0",
                "feature_sha256": FEATURE_SHA256,
                "conditioning": CONDITIONING,
                "model_config": MODEL_CONFIG,
                "source_manifest_sha256": source_sha,
                "split_manifest_sha256": split_sha,
                "clips_requested": clips, "clips_without_qualifying_window": skipped,
                "clips_analyzed_up_to_120s": truncated,
                "training_windows": len(windows), "training_window_seconds": len(windows) * 4,
                "heldout_training_clips": 0, "steps_completed": step,
                "steps_target": steps, "loss_first_in_this_run": round(first_loss, 6),
                "loss_last_in_this_run": round(last_loss, 6),
                "wall_seconds_this_run": round(time.monotonic() - started, 2),
                "interpretation": "A timed acoustic training run, not a timbre-quality or score-fit result.",
                "private_checkpoint_only": True,
            }, replace=True)
            saved_step = step

        model.train()
        for step in range(current_step + 1, steps + 1):
            if time.monotonic() >= deadline:
                stopped_by_time = True
                break
            epoch, offset = divmod(step - 1, len(windows))
            index = int(np.random.default_rng(SEED + epoch).permutation(len(windows))[offset])
            item = windows[index]
            torch.manual_seed(SEED + step)  # Reproducible model noise across explicit resumes.
            samples, pitch, loudness, mask = _tensors(torch, item, mean, std)
            prediction = model(pitch, loudness).squeeze(-1)
            if prediction.shape != samples.shape or prediction.device.type != "mps":
                raise TrialError("mps_output_mismatch")
            loss = _loss(torch, multiscale_fft, safe_log, samples, prediction, mask)
            if not torch.isfinite(loss).item():
                raise TrialError("nonfinite_loss")
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            _assert_model_finite(torch, model, gradients=True)
            optimizer.step()
            _assert_model_finite(torch, model, gradients=False)
            value = float(loss.item())
            if first_loss is None:
                first_loss = value
            last_loss = value
            current_step = step
            if step % save_every == 0 or step == steps or time.monotonic() >= deadline:
                persist(step)
        if stopped_by_time and current_step > saved_step:
            persist(current_step)
        return {"status": "completed" if current_step == steps else "time_cap_reached",
                "steps": current_step, "windows": len(windows),
                "clips_without_qualifying_window": skipped,
                "clips_analyzed_up_to_120s": truncated,
                "heldout_training_clips": 0}


def _matched_pair(source: np.ndarray, reconstruction: np.ndarray) -> tuple[np.ndarray, np.ndarray, dict]:
    """Equal audible 4 s RMS or fail; never hand off a whisper-quiet pair."""
    if (source.shape != (pilot.WINDOW_SAMPLES,)
            or reconstruction.shape != source.shape
            or not np.all(np.isfinite(source)) or not np.all(np.isfinite(reconstruction))):
        raise TrialError("listening_pair_shape_invalid")
    left = source.astype(np.float64)
    right = reconstruction.astype(np.float64)
    rms_left = float(np.sqrt(np.mean(left * left)))
    rms_right = float(np.sqrt(np.mean(right * right)))
    peak_left = float(np.max(np.abs(left)))
    peak_right = float(np.max(np.abs(right)))
    if min(rms_left, rms_right) < 1e-5 or min(peak_left, peak_right) <= 0:
        raise TrialError("listening_pair_too_quiet")
    target = 0.035  # -29.1 dBFS RMS, audible without interface volume tricks.
    gain_left = target / rms_left
    gain_right = target / rms_right
    if (gain_left > 16 or gain_right > 16
            or peak_left * gain_left > 0.9 or peak_right * gain_right > 0.9):
        raise TrialError("listening_pair_cannot_match_audibly_without_excess_gain")
    metrics = {
        "original_rms_dbfs": round(20 * math.log10(rms_left), 2),
        "reconstruction_rms_dbfs": round(20 * math.log10(rms_right), 2),
        "original_gain_db": round(20 * math.log10(gain_left), 2),
        "reconstruction_gain_db": round(20 * math.log10(gain_right), 2),
        "matched_rms_dbfs": round(20 * math.log10(target), 2),
        "largest_matched_peak": round(max(peak_left * gain_left, peak_right * gain_right), 4),
    }
    return (left * gain_left).astype(np.float32), (right * gain_right).astype(np.float32), metrics


def _first_audible_pair(items: list[tuple[np.ndarray, np.ndarray]]):
    for original, rendered in items:
        try:
            return _matched_pair(original, rendered)
        except TrialError as exc:
            if str(exc) not in (
                "listening_pair_too_quiet",
                "listening_pair_cannot_match_audibly_without_excess_gain",
            ):
                raise
    return None


def _wav_bytes(samples: np.ndarray) -> bytes:
    if samples.shape != (pilot.WINDOW_SAMPLES,) or np.max(np.abs(samples)) > 0.91:
        raise TrialError("listening_wav_invalid")
    pcm = np.rint(samples * 32767).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(pilot.SAMPLE_RATE)
        writer.writeframes(pcm.tobytes())
    return buffer.getvalue()


def _commit_evaluation_result(output_dir: Path, report: dict,
                              pair_payloads: list[tuple[str, bytes]]) -> None:
    """Publish report and private A/B as one directory rename."""
    pilot._private_dir(output_dir)
    if any(not name.startswith(".pending_eval_") for name in os.listdir(output_dir)):
        raise TrialError("evaluation_output_already_committed")
    pending = Path(tempfile.mkdtemp(prefix=".pending_eval_", dir=output_dir))
    pending.chmod(0o700)
    if pair_payloads:
        pair_dir = pending / "pairs"
        pair_dir.mkdir(mode=0o700)
        for filename, data in pair_payloads:
            _atomic_private_bytes(pair_dir, filename, data, replace=False)
    _write_json(pending, "heldout_report.json", report, replace=False)
    _fsync_directory(pending)
    os.replace(pending, output_dir / "result")
    _fsync_directory(output_dir)


def _evaluate_impl(*, source_manifest: Path, split_manifest: Path, upstream_root: Path,
                   checkpoint_dir: Path, output_dir: Path, pairs: int,
                   minutes: int) -> dict:
    if not 0 <= pairs <= 3 or not 1 <= minutes <= MAX_MINUTES:
        raise TrialError("evaluation_limit")
    started = time.monotonic()
    deadline = started + minutes * 60
    with pilot._network_disabled(), _exclusive_private_lock(checkpoint_dir):
        _verify_feature_version()
        code_sha = _script_sha256()
        source, source_sha, split, split_sha, _, heldout_dir = _private_inputs(
            source_manifest, split_manifest, checkpoint_dir, upstream_root)
        pilot._private_dir(output_dir)
        pilot._check_disjoint_report_dir(output_dir, [
            source_manifest.parent, split_manifest.parent,
            split_manifest.parent / "train", heldout_dir, upstream_root, checkpoint_dir,
        ])
        # A prior crash may leave only a private, uncommitted staging folder.
        # It is ignored, never published, and a new attempt may commit beside it.
        if any(not name.startswith(".pending_eval_") for name in os.listdir(output_dir)):
            raise TrialError("evaluation_output_already_committed")
        _, heldout_records = validate_documents(source, source_sha, split)
        torch, DDSP, multiscale_fft, safe_log = _mac_mps_gate(output_dir, upstream_root)
        located = _checkpoint_marker(checkpoint_dir)
        if located is None:
            raise TrialError("checkpoint_missing")
        marker, checkpoint_path = located
        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
        expected = {"schema": SCHEMA, "step": marker["step"],
                    "source_manifest_sha256": source_sha,
                    "split_manifest_sha256": split_sha,
                    "feature_sha256": FEATURE_SHA256, "script_sha256": code_sha,
                    "upstream_commit": pilot.UPSTREAM_SHA,
                    "conditioning": CONDITIONING, "model_config": MODEL_CONFIG}
        if any(checkpoint.get(key) != value for key, value in expected.items()):
            raise TrialError("checkpoint_configuration_mismatch")
        mean, std = checkpoint.get("loudness_mean"), checkpoint.get("loudness_std")
        if (type(mean) not in (float, int) or type(std) not in (float, int)
                or not math.isfinite(mean) or not math.isfinite(std) or std <= 1e-5):
            raise TrialError("checkpoint_normalizer_invalid")
        model, _ = _model_and_optimizer(torch, DDSP)
        model.load_state_dict(checkpoint["model_state"])
        model.eval()
        losses: list[float] = []
        diagnostic_losses: list[float] = []
        skipped = 0
        truncated = 0
        candidates: dict[int, list[tuple[np.ndarray, np.ndarray]]] = {}
        diagnostic_candidates: dict[int, list[tuple[np.ndarray, np.ndarray]]] = {}
        quiet_frames = 0
        leaking_frames = 0

        def render_item(item: dict, seed: int) -> tuple[float, np.ndarray]:
            torch.manual_seed(seed)  # Upstream eval() still uses random noise.
            with torch.no_grad():
                samples, pitch, loudness, _ = _tensors(torch, item, mean, std)
                prediction = model(pitch, loudness).squeeze(-1)
                if prediction.shape != samples.shape or prediction.device.type != "mps":
                    raise TrialError("mps_output_mismatch")
                # Never mask the held-out output: rest/attack errors stay audible.
                loss = _loss(torch, multiscale_fft, safe_log, samples, prediction,
                             torch.ones_like(samples))
                if not torch.isfinite(loss).item() or not torch.isfinite(prediction).all().item():
                    raise TrialError("nonfinite_heldout_output")
                return float(loss.item()), prediction.detach().cpu().numpy().reshape(-1)

        for index, record in enumerate(heldout_records):
            if time.monotonic() >= deadline:
                raise TrialError("time_cap_during_evaluation")
            audio = _load_wav(heldout_dir, record)
            cap = MAX_ANALYZED_SECONDS_PER_CLIP * pilot.SAMPLE_RATE
            if audio.size > cap:
                audio = audio[:cap]
                truncated += 1
            clip_windows = select_nonoverlapping_windows(audio)
            if not clip_windows:
                skipped += 1
            else:
                item = clip_windows[0]
                loss, rendered = render_item(item, SEED + 100_000 + index)
                losses.append(loss)
                group = candidates.setdefault(record["song_index"], [])
                if len(group) < 3:
                    group.append((item["samples"].copy(), rendered))
            diagnostic = select_rest_reattack_proxy_window(audio)
            if diagnostic is not None:
                loss, rendered = render_item(diagnostic, SEED + 200_000 + index)
                diagnostic_losses.append(loss)
                quiet, leaking = quiet_leakage_counts(diagnostic["samples"], rendered)
                quiet_frames += quiet
                leaking_frames += leaking
                group = diagnostic_candidates.setdefault(record["song_index"], [])
                if len(group) < 3:
                    group.append((diagnostic["samples"].copy(), rendered))
        if not losses:
            raise TrialError("no_heldout_windows")
        pair_selection: list[tuple[np.ndarray, np.ndarray, dict]] = []
        pair_problems: list[str] = []
        selected_songs: set[int] = set()
        diagnostic_pairs = 0

        if pairs:
            if not diagnostic_candidates:
                pair_problems.append("no_heldout_rest_reattack_proxy")
            else:
                for song in sorted(diagnostic_candidates):
                    matched = _first_audible_pair(diagnostic_candidates[song])
                    if matched is not None:
                        pair_selection.append(matched)
                        selected_songs.add(song)
                        diagnostic_pairs = 1
                        break
                if not pair_selection:
                    pair_problems.append("no_audible_rest_reattack_pair")
            for song in sorted(candidates):
                if song in selected_songs or len(pair_selection) == pairs:
                    continue
                matched = _first_audible_pair(candidates[song])
                if matched is not None:
                    pair_selection.append(matched)
                    selected_songs.add(song)
            if len(pair_selection) < pairs:
                pair_problems.append("fewer_audible_distinct_heldout_groups_than_requested")
        pair_payloads: list[tuple[str, bytes]] = []
        pair_level_metrics: list[dict] = []
        for number, (original, rendered, levels) in enumerate(pair_selection, start=1):
            pair_level_metrics.append(levels)
            pair_payloads.extend([
                (f"pair_{number:02d}_source_input_16k.wav", _wav_bytes(original)),
                (f"pair_{number:02d}_reconstruction.wav", _wav_bytes(rendered)),
            ])
        torch.mps.synchronize()
        pilot._check_free_space(output_dir)
        report = {
            "schema": SCHEMA, "status": "heldout_reconstruction_evaluated",
            "checkpoint_step": marker["step"],
            "heldout_clips_evaluated": len(losses),
            "heldout_clips_without_qualifying_window": skipped,
            "heldout_clips_analyzed_up_to_120s": truncated,
            "quiet_to_active_proxy_clips_evaluated": len(diagnostic_losses),
            "quiet_source_10ms_frames": quiet_frames,
            "reconstruction_leakage_frames_above_minus40dbfs": leaking_frames,
            "leakage_fraction_of_quiet_frames": (
                round(leaking_frames / quiet_frames, 6) if quiet_frames else None),
            "heldout_song_groups_for_private_pairs": len(pair_selection),
            "private_diagnostic_pair_count": diagnostic_pairs,
            "private_pairs_requested": pairs,
            "private_pair_limitations": pair_problems,
            "heldout_unmasked_spectral_loss_mean": round(float(np.mean(losses)), 6),
            "heldout_unmasked_spectral_loss_median": round(float(np.median(losses)), 6),
            "quiet_to_active_unmasked_spectral_loss_mean": (
                round(float(np.mean(diagnostic_losses)), 6) if diagnostic_losses else None),
            "window_seconds": 4, "pair_sample_rate_hz": pilot.SAMPLE_RATE,
            "pair_loudness": "same 4 s 16 kHz resampled AI Hub model input versus DDSP reconstruction, both RMS-matched without clipping; local private R&D only; not the 48 kHz original",
            "private_pair_level_metrics": pair_level_metrics,
            "pair_01_context": (
                "acoustic quiet-to-active proxy, not a breath annotation"
                if diagnostic_pairs else (
                    "sustained-tone fallback only; rest/attack unverified"
                    if pair_selection else None)),
            "source_manifest_sha256": source_sha,
            "split_manifest_sha256": split_sha,
            "upstream_repo": "acids-ircam/ddsp_pytorch",
            "upstream_commit": pilot.UPSTREAM_SHA,
            "upstream_license": "Apache-2.0",
            "feature_sha256": FEATURE_SHA256,
            "conditioning": CONDITIONING,
            "model_config": MODEL_CONFIG,
            "interpretation": "Unmasked spectral loss and quiet leakage do not establish audible naturalness or 19.2 s score fit. Upstream eval has seeded stochastic noise; 4 s crops truncate context and reverb tails.",
            "wall_seconds": round(time.monotonic() - started, 2),
        }
        _commit_evaluation_result(output_dir, report, pair_payloads)
        return {key: report[key] for key in (
            "status", "checkpoint_step", "heldout_clips_evaluated",
            "heldout_clips_without_qualifying_window",
            "quiet_to_active_proxy_clips_evaluated",
            "heldout_song_groups_for_private_pairs", "private_diagnostic_pair_count",
            "private_pair_limitations")}


def safe_private_call(action, **kwargs) -> dict:
    """Sanitize all third-party and filesystem errors before CLI output."""
    try:
        return action(**kwargs)
    except (TrialError, pilot.PilotError, split_gate.PilotError) as exc:
        raise TrialError(str(exc)) from None
    except Exception:
        raise TrialError("private_long_trial_internal_error") from None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    for action in ("train", "evaluate"):
        command = sub.add_parser(action)
        command.add_argument("--source-manifest", type=Path, required=True)
        command.add_argument("--split-manifest", type=Path, required=True)
        command.add_argument("--upstream-root", type=Path, required=True)
        command.add_argument("--output-dir", type=Path, required=True,
                             help="existing private 0700 directory, outside Git and audio roots")
        command.add_argument("--minutes", type=int, default=90 if action == "train" else 30)
        if action == "train":
            command.add_argument("--clips", type=int, default=TRAIN_RECORDS)
            command.add_argument("--steps", type=int, default=MAX_STEPS)
            command.add_argument("--save-every", type=int, default=100)
            command.add_argument("--resume", action="store_true")
        else:
            command.add_argument("--checkpoint-dir", type=Path, required=True)
            command.add_argument("--pairs", type=int, default=3)
    args = parser.parse_args()
    try:
        common = {"source_manifest": args.source_manifest,
                  "split_manifest": args.split_manifest,
                  "upstream_root": args.upstream_root,
                  "output_dir": args.output_dir,
                  "minutes": args.minutes}
        if args.action == "train":
            result = safe_private_call(_train_impl, **common, clips=args.clips,
                                       steps=args.steps, save_every=args.save_every,
                                       resume=args.resume)
        else:
            result = safe_private_call(_evaluate_impl, **common,
                                       checkpoint_dir=args.checkpoint_dir, pairs=args.pairs)
    except TrialError as exc:
        print(json.dumps({"status": "blocked", "reason": str(exc)}))
        raise SystemExit(2) from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
