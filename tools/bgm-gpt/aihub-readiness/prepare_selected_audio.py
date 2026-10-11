#!/usr/bin/env python3
"""Privately prepare one approved AI Hub daegeum cluster for a local model pilot.

This never publishes source audio. It reads explicitly named source TAR parts and
an explicitly named private cluster manifest. The default is a read-only probe;
``--materialize`` creates a *new* private directory of 16 kHz mono PCM16 WAVs.
Only already-mono PCM sources are accepted; a stereo downmix requires a separate
musical decision. Validation-split records are deliberately refused for training.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from contextlib import ExitStack
import hashlib
import json
import math
import os
from pathlib import Path
import re
import resource
import shutil
import stat
import struct
import subprocess
import sys
import tarfile
import unicodedata
import wave
import zipfile

from inspect_source_tar import (
    MAX_TARS,
    MAX_TAR_BYTES,
    SourceInspectionError,
    _JoinedTarParts,
    _open_regular_readonly,
    _tar_parts,
    _zip_structure,
)


SCHEMA = "mini.aihub-71470-daegeum-clusters.v1"
OUTPUT_SCHEMA = "mini.aihub-71470-private-audio-prep.v1"
MAX_MANIFEST_BYTES = 16 * 1024**2
MAX_RECORDS = 256
MAX_INPUT_WAV_BYTES = 256 * 1024**2
MAX_TOTAL_INPUT_WAV_BYTES = 2 * 1024**3
MAX_OUTPUT_WAV_BYTES = 128 * 1024**2
MAX_TOTAL_OUTPUT_WAV_BYTES = 2 * 1024**3
READ_CHUNK = 1024 * 1024
TARGET_HZ = 16_000
REPO_ROOT = Path(__file__).resolve().parents[3]


class PreparationError(Exception):
    """Fixed public error category; must not contain a private name or content."""


class _ReadableJoinedTarParts(_JoinedTarParts):
    # ZipFile.open() needs this file-object attribute when reading payloads;
    # the structural inspector only reads central-directory metadata.

    def seekable(self) -> bool:
        return True


def _regular_private_input(path: Path, suffix: str, max_bytes: int) -> bytes:
    try:
        resolved = path.resolve(strict=True)
        repo_resolved = REPO_ROOT.resolve(strict=True)
        if resolved == repo_resolved or repo_resolved in resolved.parents:
            raise PreparationError("manifest_inside_repository")
        if stat.S_IMODE(path.stat().st_mode) & 0o077:
            raise PreparationError("manifest_not_private")
        handle, _ = _open_regular_readonly(path, suffix, max_bytes)
        with handle:
            return handle.read(max_bytes + 1)
    except OSError as exc:
        raise PreparationError("manifest_unavailable") from exc
    except SourceInspectionError as exc:
        raise PreparationError(str(exc)) from exc


def _validate_manifest(path: Path, cluster_id: str) -> tuple[dict, list[dict]]:
    if not re.fullmatch(r"C[0-9]{3,4}", cluster_id):
        raise PreparationError("invalid_cluster_id")
    try:
        manifest = json.loads(_regular_private_input(path, ".json", MAX_MANIFEST_BYTES))
    except (ValueError, UnicodeError, json.JSONDecodeError) as exc:
        raise PreparationError("invalid_cluster_manifest") from exc
    if not isinstance(manifest, dict) or manifest.get("schema") != SCHEMA:
        raise PreparationError("unsupported_cluster_manifest")
    if manifest.get("split") != "training":
        raise PreparationError("training_split_required")
    clusters = manifest.get("clusters")
    if not isinstance(clusters, list) or len(clusters) > 1000:
        raise PreparationError("invalid_cluster_manifest")
    matches = [item for item in clusters if isinstance(item, dict) and item.get("cluster_id") == cluster_id]
    if len(matches) != 1:
        raise PreparationError("cluster_missing_or_duplicate")
    cluster = matches[0]
    songs = cluster.get("songs")
    if not isinstance(songs, list) or not songs:
        raise PreparationError("invalid_cluster_records")
    records: list[dict] = []
    seen: set[str] = set()
    for song_index, song in enumerate(songs, 1):
        if not isinstance(song, dict) or not isinstance(song.get("records"), list):
            raise PreparationError("invalid_cluster_records")
        for record in song["records"]:
            if not isinstance(record, dict):
                raise PreparationError("invalid_cluster_records")
            stem = record.get("stem")
            if not isinstance(stem, str):
                raise PreparationError("invalid_source_stem")
            stem = unicodedata.normalize("NFC", stem)
            if (
                not stem or stem != stem.strip() or stem.startswith(".") or "/" in stem
                or "\\" in stem or ":" in stem or Path(stem).suffix
                or any(ord(char) < 32 or ord(char) == 127 for char in stem)
                or len(stem.encode("utf-8")) > 200
            ):
                raise PreparationError("invalid_source_stem")
            if stem in seen:
                raise PreparationError("duplicate_source_stem")
            seen.add(stem)
            if record.get("source_format") != "wav":
                raise PreparationError("wav_source_required")
            rate, depth, duration = (
                record.get("sample_rate_hz"), record.get("bit_depth"), record.get("duration_seconds")
            )
            if type(rate) is not int or not 8_000 <= rate <= 192_000:
                raise PreparationError("invalid_label_audio_metadata")
            if type(depth) is not int or depth not in (8, 16, 24, 32):
                raise PreparationError("invalid_label_audio_metadata")
            if type(duration) not in (int, float) or not math.isfinite(duration) or not 0 < duration <= 3600:
                raise PreparationError("invalid_label_audio_metadata")
            records.append({"stem": stem, "song_index": song_index, "label": record})
            if len(records) > MAX_RECORDS:
                raise PreparationError("record_count_limit")
    if not records:
        raise PreparationError("invalid_cluster_records")
    return cluster, records


def _validate_output_path(path: Path) -> Path:
    if not path.is_absolute() or path.exists() or path.is_symlink():
        raise PreparationError("output_must_be_new_absolute_directory")
    parent = path.parent
    try:
        parent_info = parent.stat()
        parent_resolved = parent.resolve(strict=True)
        repo_resolved = REPO_ROOT.resolve(strict=True)
    except OSError as exc:
        raise PreparationError("private_parent_unavailable") from exc
    if not stat.S_ISDIR(parent_info.st_mode) or parent.is_symlink():
        raise PreparationError("private_parent_unavailable")
    if parent_info.st_uid != os.getuid() or stat.S_IMODE(parent_info.st_mode) & 0o077:
        raise PreparationError("private_parent_permissions")
    if parent_resolved == repo_resolved or repo_resolved in parent_resolved.parents:
        raise PreparationError("output_inside_repository")
    if path.name in ("", ".", ".."):
        raise PreparationError("output_must_be_new_absolute_directory")
    return parent_resolved / path.name


def _read_selected_wav(archive: zipfile.ZipFile, info: zipfile.ZipInfo) -> bytes:
    if info.file_size <= 0 or info.file_size > MAX_INPUT_WAV_BYTES:
        raise PreparationError("input_wav_size_limit")
    chunks: list[bytes] = []
    total = 0
    try:
        with archive.open(info, "r") as source:
            while chunk := source.read(READ_CHUNK):
                total += len(chunk)
                if total > MAX_INPUT_WAV_BYTES:
                    raise PreparationError("input_wav_size_limit")
                chunks.append(chunk)
    except (OSError, RuntimeError, EOFError, zipfile.BadZipFile) as exc:
        raise PreparationError("input_wav_crc_or_decompression_error") from exc
    if total != info.file_size:
        raise PreparationError("input_wav_size_mismatch")
    return b"".join(chunks)


def _riff_pcm_metadata(data: bytes) -> tuple[int, int, int, float, int]:
    # ffprobe cannot always report WAV duration from a non-seekable stdin. Read
    # bounded RIFF chunk headers instead of trusting a duration in the label.
    if len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise PreparationError("invalid_wav_header")
    riff_end = struct.unpack_from("<I", data, 4)[0] + 8
    if riff_end > len(data) or riff_end < 44:
        raise PreparationError("invalid_wav_header")
    offset = 12
    fmt: tuple[int, int, int, int] | None = None
    data_bytes: int | None = None
    while offset + 8 <= riff_end:
        kind, length = struct.unpack_from("<4sI", data, offset)
        start = offset + 8
        end = start + length
        if end > riff_end:
            raise PreparationError("invalid_wav_chunk")
        if kind == b"fmt ":
            if fmt is not None or length < 16:
                raise PreparationError("invalid_wav_format")
            format_tag, channels, sample_rate, _, block_align, bit_depth = struct.unpack_from(
                "<HHIIHH", data, start
            )
            if format_tag not in (1, 3, 0xFFFE):
                raise PreparationError("unsupported_wav_codec")
            fmt = (channels, sample_rate, block_align, bit_depth)
        elif kind == b"data":
            if data_bytes is not None:
                raise PreparationError("multiple_wav_data_chunks")
            data_bytes = length
        next_offset = end + (length & 1)
        if length & 1 and next_offset + 8 <= riff_end:
            # A few source files omit the RIFF pad byte before a trailing
            # metadata chunk. Accept that only when the standard padded
            # position is impossible and the unpadded header is plausible.
            _, padded_length = struct.unpack_from("<4sI", data, next_offset)
            unpadded_kind, unpadded_length = struct.unpack_from("<4sI", data, end)
            padded_fits = next_offset + 8 + padded_length <= riff_end
            unpadded_fits = (
                all(32 <= value <= 126 for value in unpadded_kind)
                and end + 8 + unpadded_length <= riff_end
            )
            if not padded_fits and unpadded_fits:
                next_offset = end
        offset = next_offset
    if fmt is None or data_bytes is None:
        raise PreparationError("invalid_wav_header")
    channels, sample_rate, block_align, bit_depth = fmt
    if not 1 <= channels <= 32 or not 8_000 <= sample_rate <= 192_000 or not 1 <= block_align <= 256:
        raise PreparationError("invalid_wav_metadata")
    if bit_depth not in (8, 16, 24, 32) or data_bytes < block_align:
        raise PreparationError("invalid_wav_metadata")
    # Some official 24-bit WAVs contain one incomplete trailing frame. FFmpeg
    # drops that byte; reject malformed core metadata, not this harmless tail.
    partial_frame_bytes = data_bytes % block_align
    duration = (data_bytes // block_align) / sample_rate
    if not math.isfinite(duration) or not 0 < duration <= 3600:
        raise PreparationError("invalid_wav_duration")
    return channels, sample_rate, bit_depth, duration, partial_frame_bytes


def _probe_wav(data: bytes) -> dict:
    command = [
        "ffprobe", "-v", "error", "-show_entries",
        "stream=codec_type,codec_name,channels,sample_rate,bits_per_sample,duration:format=duration",
        "-of", "json", "-i", "pipe:0",
    ]
    try:
        result = subprocess.run(command, input=data, capture_output=True, timeout=60, check=False)
        if result.returncode or len(result.stdout) > 64 * 1024:
            raise PreparationError("wav_probe_failed")
        report = json.loads(result.stdout)
    except (OSError, subprocess.TimeoutExpired, ValueError) as exc:
        raise PreparationError("wav_probe_failed") from exc
    streams = report.get("streams") if isinstance(report, dict) else None
    if not isinstance(streams, list) or len(streams) != 1 or not isinstance(streams[0], dict):
        raise PreparationError("wav_stream_count")
    audio = streams[0]
    if audio.get("codec_type") != "audio" or audio.get("codec_name") not in {
        "pcm_u8", "pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le"
    }:
        raise PreparationError("unsupported_wav_codec")
    if audio.get("channels") != 1:
        raise PreparationError("mono_source_required")
    riff_channels, riff_rate, riff_depth, duration, partial_frame_bytes = _riff_pcm_metadata(data)
    try:
        sample_rate = int(audio["sample_rate"])
        bit_depth = int(audio["bits_per_sample"])
    except (KeyError, TypeError, ValueError, OverflowError) as exc:
        raise PreparationError("invalid_wav_metadata") from exc
    if not 8000 <= sample_rate <= 192000 or bit_depth not in (8, 16, 24, 32):
        raise PreparationError("invalid_wav_metadata")
    if (riff_channels, riff_rate, riff_depth) != (1, sample_rate, bit_depth):
        raise PreparationError("wav_header_probe_mismatch")
    return {
        "sample_rate_hz": sample_rate,
        "bit_depth": bit_depth,
        "channels": 1,
        "codec": audio["codec_name"],
        "duration_seconds": duration,
        "partial_frame_bytes": partial_frame_bytes,
    }


def _check_disk(parent: Path, expected_bytes: int) -> None:
    # A substantial reserve remains untouched for the user's other work.
    reserve = max(256 * 1024**2, int(expected_bytes * 0.25))
    try:
        free_bytes = shutil.disk_usage(parent).free
    except OSError as exc:
        raise PreparationError("disk_preflight_unavailable") from exc
    if expected_bytes + reserve > free_bytes:
        raise PreparationError("insufficient_private_disk_space")


def _set_output_limit() -> None:
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_OUTPUT_WAV_BYTES, MAX_OUTPUT_WAV_BYTES))


def _convert_wav(data: bytes, target: Path, expected_seconds: float) -> tuple[int, int, str]:
    # The caller has exclusively created this path in its new private directory.
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-i", "pipe:0", "-map", "0:a:0", "-ac", "1", "-ar", str(TARGET_HZ),
        "-c:a", "pcm_s16le", "-f", "wav", str(target),
    ]
    try:
        result = subprocess.run(
            command, input=data, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
            timeout=180, check=False, preexec_fn=_set_output_limit,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise PreparationError("wav_conversion_failed") from exc
    if result.returncode:
        raise PreparationError("wav_conversion_failed")
    try:
        output_stat = target.lstat()
        if not stat.S_ISREG(output_stat.st_mode):
            raise PreparationError("invalid_output_wav")
        os.chmod(target, 0o600)
        size = output_stat.st_size
        if not 44 <= size <= MAX_OUTPUT_WAV_BYTES:
            raise PreparationError("output_wav_size_limit")
        with wave.open(str(target), "rb") as output:
            if output.getnchannels() != 1 or output.getframerate() != TARGET_HZ or output.getsampwidth() != 2:
                raise PreparationError("invalid_output_wav")
            frames = output.getnframes()
        if abs(frames / TARGET_HZ - expected_seconds) > max(0.05, expected_seconds * 0.01):
            raise PreparationError("converted_duration_mismatch")
        with target.open("rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        return size, frames, digest
    except (OSError, EOFError, wave.Error) as exc:
        raise PreparationError("invalid_output_wav") from exc


def prepare(
    tar_paths: list[Path], manifest_path: Path, cluster_id: str, output_dir: Path, *, materialize: bool = False
) -> dict:
    if not 1 <= len(tar_paths) <= MAX_TARS:
        raise PreparationError("tar_count_limit")
    output_dir = _validate_output_path(output_dir)
    cluster, records = _validate_manifest(manifest_path, cluster_id)
    created: list[Path] = []
    directory_created = False
    completed = False
    try:
        with ExitStack() as stack:
            archives = []
            tar_bytes = 0
            for tar_path in tar_paths:
                if tar_path.name[:3].upper() == "VS_":
                    raise PreparationError("training_source_tar_required")
                try:
                    handle, file_stat = _open_regular_readonly(tar_path, ".tar", MAX_TAR_BYTES)
                    stack.enter_context(handle)
                    tar = stack.enter_context(tarfile.open(fileobj=handle, mode="r:"))
                except (SourceInspectionError, OSError, tarfile.TarError) as exc:
                    raise PreparationError("source_tar_unavailable") from exc
                tar_bytes += file_stat.st_size
                if tar_bytes > MAX_TAR_BYTES:
                    raise PreparationError("tar_total_size_limit")
                archives.append((tar, file_stat.st_size, handle.fileno()))
            try:
                parts, _, _ = _tar_parts(archives)
                view = _ReadableJoinedTarParts(parts)
                _, source_paths = _zip_structure(view)
            except SourceInspectionError as exc:
                raise PreparationError(str(exc)) from exc
            by_basename: dict[str, list[tuple[str, int]]] = defaultdict(list)
            for path, indexes in source_paths.items():
                if path.lower().endswith(".wav"):
                    by_basename[path.rsplit("/", 1)[-1]].extend((path, index) for index in indexes)
            selected: list[tuple[dict, str, int]] = []
            total_input_declared = 0
            for record in records:
                matches = by_basename.get(record["stem"] + ".wav", [])
                if len(matches) != 1:
                    raise PreparationError("selected_wav_missing_or_ambiguous")
                path, index = matches[0]
                selected.append((record, path, index))
            with zipfile.ZipFile(view, "r") as source_zip:
                infos = source_zip.infolist()
                inspections: list[dict] = []
                expected_output_bytes = 0
                for record, path, index in selected:
                    info = infos[index]
                    total_input_declared += info.file_size
                    if total_input_declared > MAX_TOTAL_INPUT_WAV_BYTES:
                        raise PreparationError("total_input_wav_size_limit")
                    data = _read_selected_wav(source_zip, info)
                    audio = _probe_wav(data)
                    if audio["sample_rate_hz"] != record["label"]["sample_rate_hz"] or audio["bit_depth"] != record["label"]["bit_depth"]:
                        raise PreparationError("label_source_metadata_mismatch")
                    label_seconds = record["label"]["duration_seconds"]
                    if abs(audio["duration_seconds"] - label_seconds) > max(0.05, label_seconds * 0.01):
                        raise PreparationError("label_source_duration_mismatch")
                    output_estimate = math.ceil(audio["duration_seconds"] * TARGET_HZ) * 2 + 65536
                    if output_estimate > MAX_OUTPUT_WAV_BYTES:
                        raise PreparationError("output_wav_size_limit")
                    expected_output_bytes += output_estimate
                    if expected_output_bytes > MAX_TOTAL_OUTPUT_WAV_BYTES:
                        raise PreparationError("total_output_wav_size_limit")
                    inspections.append({"record": record, "source_member": path, "audio": audio, "zip_index": index})
                _check_disk(output_dir.parent, expected_output_bytes)
                result = {
                    "status": "ready" if not materialize else "materialized",
                    "schema": OUTPUT_SCHEMA,
                    "split": "training",
                    "cluster_id": cluster_id,
                    "records": len(inspections),
                    "source_declared_bytes": total_input_declared,
                    "estimated_output_bytes": expected_output_bytes,
                    "output_rate_hz": TARGET_HZ,
                    "note": "Private model-input candidates only; no training or music generation performed.",
                }
                if not materialize:
                    return result
                os.mkdir(output_dir, 0o700)
                directory_created = True
                os.chmod(output_dir, 0o700)
                private_records: list[dict] = []
                total_written = 0
                for number, item in enumerate(inspections, 1):
                    output_name = f"sample_{number:03d}.wav"
                    output_path = output_dir / output_name
                    data = _read_selected_wav(source_zip, infos[item["zip_index"]])
                    fd = os.open(
                        output_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600
                    )
                    created.append(output_path)
                    os.close(fd)
                    output_bytes, frames, digest = _convert_wav(
                        data, output_path, item["audio"]["duration_seconds"]
                    )
                    total_written += output_bytes
                    if total_written > MAX_TOTAL_OUTPUT_WAV_BYTES:
                        raise PreparationError("total_output_wav_size_limit")
                    private_records.append({
                        "output_file": output_name,
                        "output_sha256": digest,
                        "output_bytes": output_bytes,
                        "output_frames": frames,
                        "source_stem": item["record"]["stem"],
                        "source_zip_member": item["source_member"],
                        "song_index": item["record"]["song_index"],
                        "label_duration_seconds": item["record"]["label"]["duration_seconds"],
                        "original": item["audio"],
                    })
                private_manifest = {
                    "schema": OUTPUT_SCHEMA,
                    "cluster_id": cluster_id,
                    "split": "training",
                    "cluster": cluster,
                    "source_tar_count": len(tar_paths),
                    "resample": {"sample_rate_hz": TARGET_HZ, "channels": 1, "bit_depth": 16, "codec": "pcm_s16le"},
                    "records": private_records,
                }
                manifest_output = output_dir / "private_manifest.json"
                fd = os.open(manifest_output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
                created.append(manifest_output)
                with os.fdopen(fd, "w", encoding="utf-8") as handle:
                    json.dump(private_manifest, handle, ensure_ascii=False, indent=2)
                    handle.write("\n")
                result["output_bytes"] = total_written
                completed = True
                return result
    except (SourceInspectionError, OSError, EOFError, tarfile.TarError, zipfile.BadZipFile) as exc:
        raise PreparationError("source_or_output_io_error") from exc
    finally:
        # On failure, remove only files made by this invocation, never a pre-existing path.
        if directory_created and not completed:
            for path in reversed(created):
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
            try:
                output_dir.rmdir()
            except OSError:
                pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tar", action="append", required=True, help="absolute authorized source .tar; repeat for parts")
    parser.add_argument("--manifest", required=True, help="absolute private cluster manifest .json")
    parser.add_argument("--cluster-id", required=True, help="one cluster ID, e.g. C001")
    parser.add_argument("--output-dir", required=True, help="new absolute private directory outside this repository")
    parser.add_argument("--materialize", action="store_true", help="create resampled WAVs after full read-only preflight")
    args = parser.parse_args(argv)
    try:
        report = prepare(
            [Path(value) for value in args.tar], Path(args.manifest), args.cluster_id,
            Path(args.output_dir), materialize=args.materialize,
        )
    except PreparationError as exc:
        print(json.dumps({"status": "error", "code": str(exc)}))
        return 2
    except Exception:
        # A dependency error must never turn a private source/member path or
        # performer string into a traceback on a shared terminal or log.
        print(json.dumps({"status": "error", "code": "unexpected_private_processing_failure"}))
        return 2
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
