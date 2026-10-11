#!/usr/bin/env python3
"""Bounded, offline Mac MPS DDSP pilot. No checkpoint or audio is exported.

The ``synthetic`` subcommand is safe without private material. ``private`` is
deliberately a separate, explicit action; it must not be run before review of
the approved AI Hub data use and this script. The IRCAM upstream code remains
in a private checkout, not copied into this repository.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import re
import shutil
import socket
import stat
import subprocess
import sys
import time
import wave

import numpy as np

from mac_mps_ddsp_features import extract_features, normalize_loudness


REPO_ROOT = Path(__file__).resolve().parents[3]
PREP_SCHEMA = "mini.aihub-71470-private-audio-prep.v1"
SPLIT_SCHEMA = "mini.aihub-71470-ddsp-song-split.v1"
UPSTREAM_SHA = "9db246f48dba66e9b2133691d7abf4af6ede0279"
CORE_PATCH_SHA256 = "80aa68529a21ce3424b2c5bf32d86c92aed02cc8ef315737fc6c6961f30b9c10"
MODEL_SHA256 = "8f4298924caed16b4ff92740f1fdcaeb1641912fdc9365cd64e5014f0af42c08"
LICENSE_SHA256 = "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4"
PACKAGE_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
SAMPLE_RATE = 16000
BLOCK_SIZE = 160
WINDOW_FRAMES = 400
WINDOW_SAMPLES = WINDOW_FRAMES * BLOCK_SIZE
MAX_STEPS = 20
MIN_CLIPS = 5
MAX_CLIPS = 10
MAX_CLIP_SECONDS = 40
MAX_MANIFEST_BYTES = 16 * 1024 * 1024
MIN_FREE_BYTES = 8 * 1024**3
REPORT_NAME = "mac_mps_pilot_report.json"


class PilotError(Exception):
    """A fixed, non-private error code for safe reporting."""


def _private_dir(path: Path) -> Path:
    if not path.is_absolute():
        raise PilotError("absolute_private_path_required")
    try:
        info = path.lstat()
        resolved = path.resolve(strict=True)
    except OSError as exc:
        raise PilotError("private_directory_missing") from exc
    root = REPO_ROOT.resolve(strict=True)
    if not stat.S_ISDIR(info.st_mode) or resolved == root or root in resolved.parents:
        raise PilotError("private_directory_required")
    if stat.S_IMODE(info.st_mode) & 0o077:
        raise PilotError("private_directory_permissions")
    return resolved


def _private_file(path: Path, *, max_bytes: int) -> bytes:
    if not path.is_absolute():
        raise PilotError("absolute_private_path_required")
    _private_dir(path.parent)
    try:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= max_bytes:
            raise PilotError("private_file_format")
        if stat.S_IMODE(info.st_mode) & 0o077:
            raise PilotError("private_file_permissions")
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(descriptor, "rb") as source:
            opened = os.fstat(source.fileno())
            if (not stat.S_ISREG(opened.st_mode) or opened.st_size != info.st_size
                    or stat.S_IMODE(opened.st_mode) & 0o077):
                raise PilotError("private_file_changed")
            payload = source.read(max_bytes + 1)
        if len(payload) != info.st_size:
            raise PilotError("private_file_changed")
        return payload
    except OSError as exc:
        raise PilotError("private_file_unavailable") from exc


def _read_json(path: Path) -> tuple[dict, str]:
    payload = _private_file(path, max_bytes=MAX_MANIFEST_BYTES)
    try:
        document = json.loads(payload)
    except (ValueError, UnicodeError) as exc:
        raise PilotError("private_json_invalid") from exc
    if not isinstance(document, dict):
        raise PilotError("private_json_invalid")
    return document, hashlib.sha256(payload).hexdigest()


def _safe_name(name: object) -> str:
    if not isinstance(name, str) or not re.fullmatch(r"sample_[0-9]{3,4}\.wav", name):
        raise PilotError("invalid_audio_name")
    return name


def select_training_records(source: dict, source_sha: str, split: dict, *, clips: int) -> list[dict]:
    """Metadata-only selection; one 4–40 s train WAV per distinct song."""
    if not MIN_CLIPS <= clips <= MAX_CLIPS:
        raise PilotError("clip_limit")
    if source.get("schema") != PREP_SCHEMA or source.get("split") != "training":
        raise PilotError("training_source_required")
    if source.get("resample") != {
        "sample_rate_hz": SAMPLE_RATE, "channels": 1,
        "bit_depth": 16, "codec": "pcm_s16le",
    }:
        raise PilotError("expected_16k_mono_pcm16")
    if split.get("schema") != SPLIT_SCHEMA or split.get("status") != "materialized":
        raise PilotError("materialized_split_required")
    if split.get("source_manifest_sha256") != source_sha:
        raise PilotError("split_source_mismatch")
    if split.get("cluster_id") != source.get("cluster_id"):
        raise PilotError("split_cluster_mismatch")
    training_names = split.get("training_files")
    heldout_names = split.get("heldout_files")
    records = source.get("records")
    heldout_songs = split.get("heldout_song_indices")
    if not all(isinstance(v, list) for v in (training_names, heldout_names, records, heldout_songs)):
        raise PilotError("split_records_invalid")
    if not training_names or not heldout_names or len(records) > 256:
        raise PilotError("split_records_invalid")
    names_train = [_safe_name(name) for name in training_names]
    names_hold = [_safe_name(name) for name in heldout_names]
    if len(set(names_train)) != len(names_train) or len(set(names_hold)) != len(names_hold):
        raise PilotError("duplicate_split_name")
    if set(names_train) & set(names_hold):
        raise PilotError("train_heldout_name_overlap")
    if (split.get("training_wavs") != len(names_train)
            or split.get("heldout_wavs") != len(names_hold)):
        raise PilotError("split_count_mismatch")
    if not all(type(song) is int and song > 0 for song in heldout_songs):
        raise PilotError("heldout_songs_invalid")
    if len(set(heldout_songs)) != len(heldout_songs):
        raise PilotError("heldout_songs_invalid")
    record_map: dict[str, dict] = {}
    for record in records:
        if not isinstance(record, dict):
            raise PilotError("private_record_invalid")
        name = _safe_name(record.get("output_file"))
        song = record.get("song_index")
        frames = record.get("output_frames")
        size = record.get("output_bytes")
        digest = record.get("output_sha256")
        if (type(song) is not int or song <= 0 or type(frames) is not int or frames <= 0
                or type(size) is not int or size < 44 or not isinstance(digest, str)
                or not re.fullmatch(r"[0-9a-f]{64}", digest)):
            raise PilotError("private_record_invalid")
        if name in record_map:
            raise PilotError("duplicate_record_name")
        record_map[name] = record
    if set(record_map) != set(names_train) | set(names_hold):
        raise PilotError("split_record_coverage")
    train_hashes = {record_map[name]["output_sha256"] for name in names_train}
    hold_hashes = {record_map[name]["output_sha256"] for name in names_hold}
    train_songs = {record_map[name]["song_index"] for name in names_train}
    hold_songs = {record_map[name]["song_index"] for name in names_hold}
    if (train_hashes & hold_hashes or len(train_hashes) != len(names_train)
            or len(hold_hashes) != len(names_hold)):
        raise PilotError("train_heldout_hash_overlap")
    if train_songs & hold_songs or hold_songs != set(heldout_songs):
        raise PilotError("train_heldout_song_overlap")
    candidates: dict[int, list[dict]] = {}
    for name in names_train:
        record = record_map[name]
        if WINDOW_SAMPLES <= record["output_frames"] <= MAX_CLIP_SECONDS * SAMPLE_RATE:
            candidates.setdefault(record["song_index"], []).append(record)
    if len(candidates) < clips:
        raise PilotError("insufficient_train_song_clips")
    selected = []
    for song in sorted(candidates)[:clips]:
        selected.append(min(
            candidates[song],
            key=lambda item: (abs(item["output_frames"] - 20 * SAMPLE_RATE), item["output_file"]),
        ))
    return selected


def _load_training_wav(train_dir: Path, record: dict) -> np.ndarray:
    name = _safe_name(record["output_file"])
    expected_bytes = record["output_bytes"]
    if expected_bytes > 44 + 2 * MAX_CLIP_SECONDS * SAMPLE_RATE + 4096:
        raise PilotError("selected_wav_too_large")
    payload = _private_file(train_dir / name, max_bytes=expected_bytes)
    if len(payload) != expected_bytes:
        raise PilotError("selected_wav_size_mismatch")
    if hashlib.sha256(payload).hexdigest() != record["output_sha256"]:
        raise PilotError("selected_wav_hash_mismatch")
    try:
        with wave.open(io.BytesIO(payload), "rb") as source:
            if (source.getnchannels() != 1 or source.getsampwidth() != 2
                    or source.getframerate() != SAMPLE_RATE or source.getcomptype() != "NONE"
                    or source.getnframes() != record["output_frames"]):
                raise PilotError("selected_wav_format_mismatch")
            samples = source.readframes(source.getnframes())
    except (wave.Error, EOFError) as exc:
        raise PilotError("selected_wav_unreadable") from exc
    if len(samples) != record["output_frames"] * 2:
        raise PilotError("selected_wav_truncated")
    return np.frombuffer(samples, dtype="<i2").astype(np.float32) / 32768.0


def _exclude_heldout_inodes(train_dir: Path, heldout_dir: Path,
                            heldout_names: list[str], selected: list[dict]) -> None:
    """Stat, but never open, held-out files to forbid physical-link overlap."""
    heldout_inodes = set()
    for name in heldout_names:
        try:
            info = (heldout_dir / _safe_name(name)).lstat()
        except OSError as exc:
            raise PilotError("heldout_file_unavailable") from exc
        if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o077:
            raise PilotError("heldout_file_invalid")
        heldout_inodes.add((info.st_dev, info.st_ino))
    for record in selected:
        try:
            info = (train_dir / _safe_name(record["output_file"])).lstat()
        except OSError as exc:
            raise PilotError("train_file_unavailable") from exc
        if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o077:
            raise PilotError("train_file_invalid")
        if (info.st_dev, info.st_ino) in heldout_inodes:
            raise PilotError("train_heldout_inode_overlap")


def choose_window(audio: np.ndarray) -> dict[str, np.ndarray | float]:
    """One 4 s, mostly-confident voiced window; all arrays remain in RAM."""
    if audio.ndim != 1 or len(audio) < WINDOW_SAMPLES:
        raise PilotError("clip_too_short")
    usable = audio[: len(audio) // BLOCK_SIZE * BLOCK_SIZE]
    features = extract_features(usable, sample_rate=SAMPLE_RATE, block_size=BLOCK_SIZE)
    best: tuple[float, float, int] | None = None
    for start in range(0, len(features["pitch_hz"]) - WINDOW_FRAMES + 1, 100):
        voiced = np.asarray(features["voiced_mask"][start:start + WINDOW_FRAMES], dtype=bool)
        ratio = float(np.mean(voiced))
        if ratio < 0.85:
            continue
        # The 4 s window is scored only on confidence and signal energy.
        energy = float(np.median(features["rms_db"][start:start + WINDOW_FRAMES][voiced]))
        candidate = (ratio, energy, -start)
        if best is None or candidate > best:
            best = candidate
    if best is None:
        raise PilotError("no_confident_4s_window")
    start = -best[2]
    samples = usable[start * BLOCK_SIZE:(start + WINDOW_FRAMES) * BLOCK_SIZE]
    pitch = features["pitch_hz"][start:start + WINDOW_FRAMES]
    loudness = features["loudness"][start:start + WINDOW_FRAMES]
    voiced = np.asarray(features["voiced_mask"][start:start + WINDOW_FRAMES], dtype=bool)
    if (samples.shape != (WINDOW_SAMPLES,) or pitch.shape != (WINDOW_FRAMES,)
            or loudness.shape != (WINDOW_FRAMES,) or voiced.shape != (WINDOW_FRAMES,)):
        raise PilotError("feature_shape_mismatch")
    # Erode two frames around uncertain boundaries to avoid training artifacts.
    mask = voiced.copy()
    for shift in (1, 2):
        mask[shift:] &= voiced[:-shift]
        mask[:-shift] &= voiced[shift:]
    if float(mask.mean()) < 0.75:
        raise PilotError("insufficient_confident_frames")
    pitch = np.where(mask, pitch, 0.0).astype(np.float32)
    return {"samples": samples, "pitch_hz": pitch,
            "loudness": loudness.astype(np.float32), "mask": mask,
            "voiced_fraction": float(mask.mean())}


@contextmanager
def _network_disabled():
    """Fail closed for ordinary Python socket connects and writes.

    This is a code-level guard, not an operating-system network sandbox.
    The pilot itself invokes no network clients or external model loaders.
    """
    socket_methods = (
        "connect", "connect_ex", "send", "sendall", "sendto", "sendmsg", "sendfile",
    )
    original_methods = {
        name: getattr(socket.socket, name) for name in socket_methods
        if hasattr(socket.socket, name)
    }
    original_create_connection = socket.create_connection

    def deny_network(*args, **kwargs):
        raise PilotError("network_disabled")

    for name in original_methods:
        setattr(socket.socket, name, deny_network)
    socket.create_connection = deny_network
    try:
        yield
    finally:
        for name, original in original_methods.items():
            setattr(socket.socket, name, original)
        socket.create_connection = original_create_connection


def _check_free_space(private_root: Path) -> None:
    if shutil.disk_usage(private_root).free < MIN_FREE_BYTES:
        raise PilotError("disk_below_8gib_floor")


def _check_disjoint_report_dir(output_dir: Path, input_dirs: list[Path]) -> None:
    """A report folder must not contain, or live inside, audio/source folders."""
    output = _private_dir(output_dir)
    for directory in input_dirs:
        source = _private_dir(directory)
        if output == source or output in source.parents or source in output.parents:
            raise PilotError("pilot_report_dir_overlap")


def _verify_upstream(root: Path) -> None:
    _private_dir(root)
    for name, expected in (
        ("ddsp/core.py", CORE_PATCH_SHA256),
        ("ddsp/model.py", MODEL_SHA256),
        ("ddsp/__init__.py", PACKAGE_SHA256),
        ("LICENSE", LICENSE_SHA256),
    ):
        payload = (root / name).read_bytes()
        if hashlib.sha256(payload).hexdigest() != expected:
            raise PilotError("upstream_source_mismatch")
    result = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "HEAD"],
        check=True, capture_output=True, text=True, timeout=10,
    )
    if result.stdout.strip() != UPSTREAM_SHA:
        raise PilotError("upstream_commit_mismatch")


def _train_ram_only(windows: list[dict], *, upstream_root: Path, steps: int) -> dict:
    if not 1 <= steps <= MAX_STEPS or not MIN_CLIPS <= len(windows) <= MAX_CLIPS:
        raise PilotError("pilot_limit")
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise PilotError("mac_arm64_required")
    if os.environ.get("PYTORCH_ENABLE_MPS_FALLBACK", "0") not in ("", "0"):
        raise PilotError("mps_fallback_forbidden")
    os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "0"
    _verify_upstream(upstream_root)
    sys.path.insert(0, str(upstream_root))
    try:
        import torch
        from ddsp.model import DDSP
        from ddsp.core import multiscale_fft, safe_log
    except ImportError as exc:
        raise PilotError("upstream_import_failed") from exc
    for module_name, relative_file in (
        ("ddsp.core", "ddsp/core.py"), ("ddsp.model", "ddsp/model.py"),
    ):
        imported = sys.modules.get(module_name)
        actual = Path(getattr(imported, "__file__", "")).resolve(strict=False)
        if actual != (upstream_root / relative_file).resolve(strict=True):
            raise PilotError("upstream_import_path_mismatch")
    if torch.__version__ != "2.14.1" or not torch.backends.mps.is_available():
        raise PilotError("tested_mps_torch_required")
    torch.mps.set_per_process_memory_fraction(0.5)
    torch.manual_seed(71470)
    device = torch.device("mps")
    mean, std = normalize_loudness([item["loudness"] for item in windows])
    if not np.isfinite(mean) or not np.isfinite(std) or std <= 1e-5:
        raise PilotError("loudness_normalizer_invalid")
    model = DDSP(hidden_size=512, n_harmonic=100, n_bands=65,
                 sampling_rate=SAMPLE_RATE, block_size=BLOCK_SIZE).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    loss_first = None
    loss_last = None
    start = time.perf_counter()
    for step in range(steps):
        item = windows[step % len(windows)]
        samples = torch.from_numpy(item["samples"].copy()).to(device).reshape(1, WINDOW_SAMPLES)
        pitch = torch.from_numpy(item["pitch_hz"].copy()).to(device).reshape(1, WINDOW_FRAMES, 1)
        loudness = ((torch.from_numpy(item["loudness"].copy()).to(device) - mean) / std).reshape(1, WINDOW_FRAMES, 1)
        mask = torch.from_numpy(np.repeat(item["mask"], BLOCK_SIZE).astype(np.float32)).to(device).reshape(1, WINDOW_SAMPLES)
        predicted = model(pitch, loudness).squeeze(-1)
        if predicted.device.type != "mps" or predicted.shape != samples.shape:
            raise PilotError("mps_output_mismatch")
        truth_spectra = multiscale_fft(samples * mask, [4096, 2048, 1024, 512, 256, 128], 0.75)
        predicted_spectra = multiscale_fft(predicted * mask, [4096, 2048, 1024, 512, 256, 128], 0.75)
        loss = torch.zeros((), device=device)
        for truth, estimate in zip(truth_spectra, predicted_spectra):
            loss = loss + (truth - estimate).abs().mean()
            loss = loss + (safe_log(truth) - safe_log(estimate)).abs().mean()
        if not torch.isfinite(loss).item():
            raise PilotError("nonfinite_loss")
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        gradient = model.proj_matrices[0].weight.grad
        if gradient is None or not torch.isfinite(gradient).all().item():
            raise PilotError("nonfinite_gradient")
        optimizer.step()
        value = float(loss.item())
        if loss_first is None:
            loss_first = value
        loss_last = value
        if (step + 1) % 5 == 0:
            _check_free_space(upstream_root)
    torch.mps.synchronize()
    return {
        "torch_version": torch.__version__,
        "device": "mps",
        "batch_size": 1,
        "window_seconds": 4,
        "steps": steps,
        "loss_first": round(loss_first, 6),
        "loss_last": round(loss_last, 6),
        "seconds": round(time.perf_counter() - start, 3),
        "loudness_mean": round(mean, 6),
        "loudness_std": round(std, 6),
    }


def _write_private_report(output_dir: Path, report: dict) -> None:
    _private_dir(output_dir)
    target = output_dir / REPORT_NAME
    if os.path.lexists(target):
        raise PilotError("private_report_already_exists")
    payload = json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2).encode("utf-8") + b"\n"
    if len(payload) > 16384:
        raise PilotError("private_report_too_large")
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(descriptor, "wb") as sink:
        sink.write(payload)
        sink.flush()
        os.fsync(sink.fileno())


def _private_pilot_impl(*, source_manifest: Path, split_manifest: Path, upstream_root: Path,
                        output_dir: Path, clips: int, steps: int) -> dict:
    with _network_disabled():
        _private_dir(output_dir)
        _check_free_space(output_dir)
        split_dir = split_manifest.parent
        _check_disjoint_report_dir(output_dir, [
            source_manifest.parent, split_dir, split_dir / "train",
            split_dir / "heldout", upstream_root,
        ])
        if os.path.lexists(output_dir / REPORT_NAME):
            raise PilotError("private_report_already_exists")
        source, source_sha = _read_json(source_manifest)
        split, split_sha = _read_json(split_manifest)
        selected = select_training_records(source, source_sha, split, clips=clips)
        split_dir = _private_dir(split_manifest.parent)
        train_dir = _private_dir(split_dir / "train")
        heldout_dir = _private_dir(split_dir / "heldout")
        _exclude_heldout_inodes(train_dir, heldout_dir, split["heldout_files"], selected)
        windows = [choose_window(_load_training_wav(train_dir, record)) for record in selected]
        training = _train_ram_only(windows, upstream_root=upstream_root, steps=steps)
        report = {
            "schema": "mini.aihub-71470-mac-mps-pilot.v1",
            "status": "bounded_pilot_completed",
            "source_manifest_sha256": source_sha,
            "split_manifest_sha256": split_sha,
            "selected_clips": len(selected),
            "distinct_training_song_groups": len(selected),
            "heldout_training_clips": 0,
            "upstream_repo": "acids-ircam/ddsp_pytorch",
            "upstream_commit": UPSTREAM_SHA,
            "upstream_license": "Apache-2.0",
            "local_core_patch": "librosa/crepe imports delayed to extraction functions only",
            "feature_note": "IRCAM 16k/160=100Hz loudness with librosa-0.11-compatible constant padding; local YIN pitch differs from CREPE",
            "yin_limit": "On synthetic 440Hz +/-5Hz modulation, 64ms YIN retained only 0.86/0.80/0.73 of 5/6/7Hz vibrato depth; not a vibrato-style label",
            "model_scope": "20-step acoustics feasibility only; no score-to-expression or vibrato timing learned",
            "loss_interpretation": "finite_loss_only; no quality or convergence inference from a 20-step pilot",
            "no_checkpoint_or_audio_export": True,
            "torch_version": training["torch_version"],
            "device": training["device"],
            "batch_size": training["batch_size"],
            "window_seconds": training["window_seconds"],
            "steps": training["steps"],
            "seconds": training["seconds"],
            "loss_finite": True,
        }
        _check_free_space(output_dir)
        _write_private_report(output_dir, report)
        return {key: report[key] for key in (
            "status", "selected_clips", "distinct_training_song_groups", "device", "steps",
            "seconds", "loss_finite", "no_checkpoint_or_audio_export",
        )}


def private_pilot(*, source_manifest: Path, split_manifest: Path, upstream_root: Path,
                  output_dir: Path, clips: int, steps: int) -> dict:
    """Explicit private mode. No exception text containing paths may escape."""
    try:
        return _private_pilot_impl(
            source_manifest=source_manifest, split_manifest=split_manifest,
            upstream_root=upstream_root, output_dir=output_dir, clips=clips, steps=steps,
        )
    except PilotError as exc:
        # The code itself is fixed and non-private; suppress chained paths.
        raise PilotError(str(exc)) from None
    except Exception:
        # File, feature, MPS and third-party errors can contain private names.
        raise PilotError("private_pilot_internal_error") from None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("synthetic", help="run no private-data checks using generated tones")
    synthetic_mps = sub.add_parser("synthetic-mps", help="one generated-tone MPS model step; no private audio")
    synthetic_mps.add_argument("--upstream-root", required=True, type=Path)
    private = sub.add_parser("private", help="EXPLICIT, REVIEWED private AI Hub bounded pilot")
    private.add_argument("--source-manifest", required=True, type=Path)
    private.add_argument("--split-manifest", required=True, type=Path)
    private.add_argument("--upstream-root", required=True, type=Path)
    private.add_argument("--output-dir", required=True, type=Path)
    private.add_argument("--clips", type=int, default=8)
    private.add_argument("--steps", type=int, default=20)
    args = parser.parse_args()
    try:
        if args.action == "synthetic":
            t = np.arange(WINDOW_SAMPLES) / SAMPLE_RATE
            tone = (0.08 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
            features = extract_features(tone, sample_rate=SAMPLE_RATE, block_size=BLOCK_SIZE)
            result = {"status": "synthetic_features_ready",
                      "frames": len(features["pitch_hz"]),
                      "voiced_fraction": round(float(np.mean(features["voiced_mask"])), 3)}
        elif args.action == "synthetic-mps":
            t = np.arange(WINDOW_SAMPLES) / SAMPLE_RATE
            carrier = np.sin(2 * np.pi * (440 * t + 6 / (2 * np.pi * 5) * np.sin(2 * np.pi * 5 * t)))
            envelope = 0.04 + 0.03 * np.sin(np.pi * t / 4) ** 2
            tone = (envelope * carrier).astype(np.float32)
            window = choose_window(tone)
            with _network_disabled():
                result = {"status": "synthetic_mps_step_completed",
                          **_train_ram_only([window] * MIN_CLIPS, upstream_root=args.upstream_root, steps=1)}
        else:
            result = private_pilot(
                source_manifest=args.source_manifest, split_manifest=args.split_manifest,
                upstream_root=args.upstream_root, output_dir=args.output_dir,
                clips=args.clips, steps=args.steps,
            )
    except PilotError as exc:
        print(json.dumps({"status": "blocked", "reason": str(exc)}))
        raise SystemExit(2) from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
