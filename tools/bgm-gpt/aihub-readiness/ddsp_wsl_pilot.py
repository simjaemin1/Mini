#!/usr/bin/env python3
"""Private, song-held-out DDSP pilot gates; never trains or publishes audio.

``split`` checks a materialized AI Hub daegeum candidate and optionally makes
private hard links separated by whole song. ``environment`` refuses to bless a
WSL pilot until the exact legacy DDSP/TensorFlow versions and a working GPU are
visible. DDSP command-line training remains an explicit, later operation.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import itertools
import json
import os
from pathlib import Path
import platform
import re
import shutil
import stat
import subprocess
import sys
import wave


PREP_SCHEMA = "mini.aihub-71470-private-audio-prep.v1"
SPLIT_SCHEMA = "mini.aihub-71470-ddsp-song-split.v1"
REPO_ROOT = Path(__file__).resolve().parents[3]
MAX_MANIFEST_BYTES = 16 * 1024 * 1024
MAX_AUDIO_BYTES = 128 * 1024 * 1024
MAX_RECORDS = 256
MAX_SONG_GROUPS = 32
EXPECTED_DDSP = "3.7.0"
EXPECTED_TF = "2.11.0"


class PilotError(Exception):
    """Fixed, non-private error code for a failed safety gate."""


def _outside_repository(path: Path) -> bool:
    root = REPO_ROOT.resolve(strict=True)
    resolved = path.resolve(strict=False)
    return resolved != root and root not in resolved.parents


def _read_private_manifest(path: Path) -> tuple[dict, str]:
    if not path.is_absolute() or not _outside_repository(path):
        raise PilotError("private_manifest_path_required")
    try:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_MANIFEST_BYTES:
            raise PilotError("invalid_private_manifest")
        if stat.S_IMODE(info.st_mode) & 0o077:
            raise PilotError("private_manifest_permissions")
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(descriptor, "rb") as source:
            payload = source.read(MAX_MANIFEST_BYTES + 1)
        if len(payload) > MAX_MANIFEST_BYTES:
            raise PilotError("invalid_private_manifest")
        manifest = json.loads(payload)
    except (OSError, ValueError, UnicodeError) as exc:
        raise PilotError("invalid_private_manifest") from exc
    if not isinstance(manifest, dict) or manifest.get("schema") != PREP_SCHEMA:
        raise PilotError("unsupported_private_manifest")
    if manifest.get("split") != "training":
        raise PilotError("training_source_required")
    if manifest.get("resample") != {
        "sample_rate_hz": 16000, "channels": 1, "bit_depth": 16, "codec": "pcm_s16le"
    }:
        raise PilotError("expected_16k_mono_pcm16")
    if not re.fullmatch(r"C[0-9]{3,4}", str(manifest.get("cluster_id", ""))):
        raise PilotError("invalid_private_manifest")
    return manifest, hashlib.sha256(payload).hexdigest()


def _validate_input_dir(path: Path) -> None:
    try:
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or not _outside_repository(path):
            raise PilotError("private_audio_directory_required")
        if stat.S_IMODE(info.st_mode) & 0o077:
            raise PilotError("private_audio_permissions")
    except OSError as exc:
        raise PilotError("private_audio_directory_required") from exc


def _check_one_wav(directory: Path, record: dict) -> tuple[str, int, int]:
    name = record.get("output_file")
    if not isinstance(name, str) or not re.fullmatch(r"sample_[0-9]{3,4}\.wav", name):
        raise PilotError("invalid_private_audio_record")
    expected_size = record.get("output_bytes")
    expected_frames = record.get("output_frames")
    expected_hash = record.get("output_sha256")
    song_index = record.get("song_index")
    if (
        type(expected_size) is not int or not 44 <= expected_size <= MAX_AUDIO_BYTES
        or type(expected_frames) is not int or expected_frames <= 0
        or type(song_index) is not int or song_index <= 0
        or not isinstance(expected_hash, str)
        or not re.fullmatch(r"[0-9a-f]{64}", expected_hash)
    ):
        raise PilotError("invalid_private_audio_record")
    path = directory / name
    try:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_size != expected_size:
            raise PilotError("private_audio_size_mismatch")
        if stat.S_IMODE(info.st_mode) & 0o077:
            raise PilotError("private_audio_permissions")
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(descriptor, "rb") as source:
            with wave.open(source, "rb") as audio:
                if (
                    audio.getnchannels() != 1 or audio.getframerate() != 16000
                    or audio.getsampwidth() != 2 or audio.getcomptype() != "NONE"
                    or audio.getnframes() != expected_frames
                ):
                    raise PilotError("private_audio_format_mismatch")
            source.seek(0)
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        if digest != expected_hash:
            raise PilotError("private_audio_hash_mismatch")
    except (OSError, EOFError, wave.Error) as exc:
        raise PilotError("private_audio_unavailable") from exc
    return name, song_index, expected_frames


def _choose_heldout_songs(song_frames: dict[int, int]) -> set[int]:
    if len(song_frames) < 3:
        raise PilotError("insufficient_song_groups")
    if len(song_frames) > MAX_SONG_GROUPS:
        raise PilotError("song_group_limit")
    total = sum(song_frames.values())
    target = total * 0.15
    choices = []
    indexes = sorted(song_frames)
    for n in range(1, min(4, len(indexes) - 1) + 1):
        for combo in itertools.combinations(indexes, n):
            frames = sum(song_frames[index] for index in combo)
            if total * 0.08 <= frames <= total * 0.25:
                # A whole-song split is deterministic and cannot leak adjacent
                # clips from the same listed song into both partitions.
                choices.append((abs(frames - target), n, combo))
    if not choices:
        raise PilotError("no_safe_song_holdout")
    return set(min(choices)[2])


def split(manifest_path: Path, output_dir: Path, *, materialize: bool = False) -> dict:
    manifest, manifest_sha256 = _read_private_manifest(manifest_path)
    source_dir = manifest_path.parent
    _validate_input_dir(source_dir)
    records = manifest.get("records")
    if not isinstance(records, list) or not 3 <= len(records) <= MAX_RECORDS:
        raise PilotError("invalid_private_audio_records")
    if not output_dir.is_absolute() or not _outside_repository(output_dir):
        raise PilotError("private_output_path_required")
    if os.path.lexists(output_dir):
        raise PilotError("output_must_be_new")
    parent = output_dir.parent
    _validate_input_dir(parent)
    if output_dir == source_dir:
        raise PilotError("output_must_be_new")
    checked = []
    names: set[str] = set()
    audio_hashes: set[str] = set()
    songs: dict[int, int] = {}
    for record in records:
        if not isinstance(record, dict):
            raise PilotError("invalid_private_audio_record")
        name, song, frames = _check_one_wav(source_dir, record)
        if name in names:
            raise PilotError("duplicate_private_audio_record")
        audio_hash = record["output_sha256"]
        if audio_hash in audio_hashes:
            raise PilotError("duplicate_private_audio_hash")
        names.add(name)
        audio_hashes.add(audio_hash)
        checked.append((name, song, frames, audio_hash))
        songs[song] = songs.get(song, 0) + frames
    heldout_songs = _choose_heldout_songs(songs)
    heldout = [item for item in checked if item[1] in heldout_songs]
    training = [item for item in checked if item[1] not in heldout_songs]
    if not training or not heldout:
        raise PilotError("invalid_song_holdout")
    report = {
        "status": "ready" if not materialize else "materialized",
        "schema": SPLIT_SCHEMA,
        "cluster_id": manifest["cluster_id"],
        "training_wavs": len(training),
        "heldout_wavs": len(heldout),
        "training_song_groups": len(songs) - len(heldout_songs),
        "heldout_song_groups": len(heldout_songs),
        "training_seconds": round(sum(item[2] for item in training) / 16000, 3),
        "heldout_seconds": round(sum(item[2] for item in heldout) / 16000, 3),
        "note": "Candidate only; song grouping does not prove clean solo audio.",
    }
    if not materialize:
        return report
    # Hard links are local private references; no copy or network transfer.
    created_files: list[Path] = []
    created_dirs: list[Path] = []
    completed = False
    try:
        for directory in (output_dir, output_dir / "train", output_dir / "heldout"):
            directory.mkdir(mode=0o700)
            directory.chmod(0o700)
            created_dirs.append(directory)
        for split_name, items in (("train", training), ("heldout", heldout)):
            for name, _, _, expected_hash in items:
                target = output_dir / split_name / name
                os.link(source_dir / name, target, follow_symlinks=False)
                created_files.append(target)
                # Recheck the linked inode rather than trusting a source path
                # which could change between the preflight and os.link().
                descriptor = os.open(target, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
                with os.fdopen(descriptor, "rb") as linked:
                    if not stat.S_ISREG(os.fstat(linked.fileno()).st_mode):
                        raise PilotError("private_link_not_regular")
                    if hashlib.file_digest(linked, "sha256").hexdigest() != expected_hash:
                        raise PilotError("private_link_hash_mismatch")
        private_split = {
            **report,
            "source_manifest_sha256": manifest_sha256,
            "heldout_song_indices": sorted(heldout_songs),
            "training_files": [item[0] for item in training],
            "heldout_files": [item[0] for item in heldout],
        }
        target = output_dir / "private_split.json"
        descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
        created_files.append(target)
        with os.fdopen(descriptor, "w", encoding="utf-8") as sink:
            json.dump(private_split, sink, ensure_ascii=False, indent=2)
            sink.write("\n")
            sink.flush()
            os.fsync(sink.fileno())
        completed = True
    except OSError as exc:
        raise PilotError("private_split_creation_failed") from exc
    finally:
        if not completed:
            for file in reversed(created_files):
                try:
                    file.unlink(missing_ok=True)
                except OSError:
                    pass
            for directory in reversed(created_dirs):
                try:
                    directory.rmdir()
                except OSError:
                    pass
    return report


def environment() -> dict:
    if platform.system() != "Linux" or "microsoft" not in platform.release().lower():
        raise PilotError("wsl2_linux_required")
    if sys.version_info[:2] != (3, 10):
        raise PilotError("python_3_10_required")
    try:
        ddsp_version = importlib.metadata.version("ddsp")
        tf_version = importlib.metadata.version("tensorflow")
    except importlib.metadata.PackageNotFoundError as exc:
        raise PilotError("ddsp_or_tensorflow_missing") from exc
    if ddsp_version != EXPECTED_DDSP or tf_version != EXPECTED_TF:
        raise PilotError("legacy_version_mismatch")
    if not all(shutil.which(name) for name in ("nvidia-smi", "ddsp_prepare_tfrecord", "ddsp_run")):
        raise PilotError("required_executable_missing")
    try:
        device = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            check=True, capture_output=True, text=True, timeout=15,
        )
        if "4060" not in device.stdout:
            raise PilotError("rtx_4060_not_visible")
        import tensorflow as tf  # Imported only on the intended WSL host.

        gpus = tf.config.list_physical_devices("GPU")
        if not gpus:
            raise PilotError("tensorflow_gpu_not_visible")
        with tf.device("/GPU:0"):
            product = tf.matmul(tf.ones((64, 64)), tf.ones((64, 64)))
        if "GPU" not in product.device.upper() or float(product[0, 0]) != 64.0:
            raise PilotError("tensorflow_gpu_compute_failed")
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise PilotError("nvidia_gpu_probe_failed") from exc
    except PilotError:
        raise
    except Exception as exc:
        raise PilotError("tensorflow_gpu_compute_failed") from exc
    return {
        "status": "ready", "ddsp_version": ddsp_version,
        "tensorflow_version": tf_version, "gpu_count": len(gpus),
        "note": "Environment gate only; DDSP training and audio quality remain unverified.",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("environment", help="read-only WSL / 4060 / TensorFlow GPU gate")
    split_command = sub.add_parser("split", help="verify private WAVs and hold out whole songs")
    split_command.add_argument("--manifest", required=True, help="private_manifest.json")
    split_command.add_argument("--output-dir", required=True, help="new private sibling directory")
    split_command.add_argument("--materialize", action="store_true", help="make private hard links")
    args = parser.parse_args(argv)
    try:
        result = environment() if args.action == "environment" else split(
            Path(args.manifest), Path(args.output_dir), materialize=args.materialize
        )
    except PilotError as exc:
        print(json.dumps({"status": "error", "code": str(exc)}))
        return 2
    except Exception:
        print(json.dumps({"status": "error", "code": "unexpected_pilot_failure"}))
        return 2
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
