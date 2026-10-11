#!/usr/bin/env python3
"""Bounded, read-only WN01 WAV/MIDI/label triage for one authorized local pair.

Only aggregate counts are printed. A filename match or sensible header is NOT
evidence of note-level synchronization, solo instrumentation, or music quality.
Nothing is extracted, written, uploaded, or included in an exception message.
"""

from __future__ import annotations

import sys

# The command is a read-only audit, including no __pycache__ side effects.
sys.dont_write_bytecode = True

import argparse
from collections import Counter, defaultdict
from contextlib import ExitStack
import io
import json
import math
from pathlib import Path
import stat
import struct
import tarfile
import unicodedata
import wave
import zipfile
import zlib

import inspect_source_tar as source_reader


MAX_WAV_BYTES = 64 * 1024 * 1024
MAX_MIDI_BYTES = 8 * 1024 * 1024
MAX_TOTAL_PAYLOAD_BYTES = 2 * 1024 * 1024 * 1024
MAX_LABEL_JSON_BYTES = 8 * 1024 * 1024
MAX_TOTAL_LABEL_JSON_BYTES = 64 * 1024 * 1024
MAX_SAMPLE_FRAMES = 200_000
MAX_MIDI_EVENTS = 500_000
MAX_MIDI_TRACKS = 128


class AuditError(Exception):
    """Fixed-category failure without source names or source content."""


class _ReadableJoinedTarParts(source_reader._JoinedTarParts):
    """Add the seekability method required when ZipFile opens payloads."""

    def seekable(self) -> bool:
        return True


def _bounded_json_shape(document: object) -> None:
    stack = [(document, 0)]
    nodes = 0
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if nodes > source_reader.MAX_LABEL_JSON_NODES or depth > source_reader.MAX_LABEL_JSON_DEPTH:
            raise AuditError("label_json_structure_limit")
        if isinstance(item, dict):
            stack.extend((value, depth + 1) for value in item.values())
        elif isinstance(item, list):
            stack.extend((value, depth + 1) for value in item)


def _safe_stem(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    stem = unicodedata.normalize("NFC", value)
    if (
        not stem or stem in (".", "..") or "/" in stem or "\\" in stem
        or ":" in stem or "\x00" in stem or stem != stem.strip()
        or any(ord(char) < 32 for char in stem)
        or len(stem.encode("utf-8")) > source_reader.MAX_LABEL_NAME_BYTES
    ):
        return None
    return stem


def _label_records(label_path: Path) -> tuple[dict[str, float | None], dict[str, int]]:
    handle, file_stat = source_reader._open_regular_readonly(
        label_path, ".zip", source_reader.MAX_LABEL_ZIP_BYTES
    )
    stems: dict[str, float | None] = {}
    duplicate_stems: set[str] = set()
    counts: Counter[str] = Counter()
    total_bytes = 0
    try:
        with handle:
            source_reader._zip_directory_preflight(
                handle, file_stat.st_size,
                source_reader.MAX_LABEL_MEMBERS,
                source_reader.MAX_CENTRAL_DIRECTORY_BYTES,
            )
            with zipfile.ZipFile(handle) as archive:
                infos = archive.infolist()
                seen_names: set[str] = set()
                for info in infos:
                    checked = info.filename[:-1] if info.is_dir() else info.filename
                    if (
                        not source_reader._safe_member_name(checked, single_leading_slash=True)
                        or stat.S_ISLNK(info.external_attr >> 16)
                        or info.flag_bits & 1
                    ):
                        raise AuditError("unsafe_label_member")
                    name = unicodedata.normalize("NFC", checked.removeprefix("/"))
                    if name in seen_names:
                        raise AuditError("duplicate_label_member")
                    seen_names.add(name)
                    if info.is_dir() or not name.lower().endswith(".json"):
                        continue
                    counts["json_members"] += 1
                    if (
                        info.file_size > MAX_LABEL_JSON_BYTES
                        or total_bytes + info.file_size > MAX_TOTAL_LABEL_JSON_BYTES
                    ):
                        raise AuditError("label_json_size_limit")
                    with archive.open(info) as member:
                        raw = member.read(MAX_LABEL_JSON_BYTES + 1)
                    if len(raw) > MAX_LABEL_JSON_BYTES:
                        raise AuditError("label_json_size_limit")
                    total_bytes += len(raw)
                    document = json.loads(raw.decode("utf-8-sig"))
                    _bounded_json_shape(document)
                    if not isinstance(document, dict):
                        raise AuditError("invalid_label_document")
                    kind = document.get("music_type_info")
                    if not isinstance(kind, dict) or kind.get("instrument_cd") != "WN01":
                        continue
                    counts["wn01_labels"] += 1
                    source = document.get("music_source_info")
                    if not isinstance(source, dict):
                        counts["invalid_source_info"] += 1
                        continue
                    stem = _safe_stem(source.get("music_src_nm"))
                    if stem is None:
                        counts["invalid_stem"] += 1
                        continue
                    source_format = source.get("music_src_fmt")
                    if not isinstance(source_format, str) or source_format.lower() != "wav":
                        counts["unsupported_label_source_format"] += 1
                        continue
                    duration = source.get("play_time")
                    if (
                        not isinstance(duration, (int, float)) or isinstance(duration, bool)
                        or not math.isfinite(duration) or duration <= 0
                    ):
                        duration = None
                        counts["invalid_label_duration"] += 1
                    if stem in stems:
                        duplicate_stems.add(stem)
                    else:
                        stems[stem] = float(duration) if duration is not None else None
    except (AuditError, source_reader.SourceInspectionError):
        raise
    except (OSError, RuntimeError, EOFError, UnicodeError, ValueError, RecursionError,
            zipfile.BadZipFile, NotImplementedError, zlib.error) as exc:
        raise AuditError("invalid_or_unreadable_label_zip") from exc
    if not counts["json_members"]:
        raise AuditError("no_label_json")
    for stem in duplicate_stems:
        stems.pop(stem, None)
    counts["duplicate_label_stems"] = len(duplicate_stems)
    counts["unique_wn01_stems"] = len(stems)
    return stems, dict(counts)


def _wav_overview(data: bytes) -> dict[str, float | int | bool]:
    try:
        with wave.open(io.BytesIO(data), "rb") as audio:
            if audio.getcomptype() != "NONE":
                raise AuditError("unsupported_wav_codec")
            channels = audio.getnchannels()
            rate = audio.getframerate()
            width = audio.getsampwidth()
            frames_count = audio.getnframes()
            if (
                not 1 <= channels <= 8 or not 8_000 <= rate <= 384_000
                or width not in (1, 2, 3, 4) or frames_count <= 0
            ):
                raise AuditError("unsupported_wav_format")
            frames = audio.readframes(frames_count)
        if len(frames) != frames_count * channels * width:
            raise AuditError("truncated_wav_frames")
        step = max(1, (frames_count + MAX_SAMPLE_FRAMES - 1) // MAX_SAMPLE_FRAMES)
        energy = 0.0
        clipped = 0
        sampled = 0
        for frame in range(0, frames_count, step):
            for channel in range(channels):
                offset = (frame * channels + channel) * width
                if width == 1:
                    sample = (frames[offset] - 128) / 128
                    is_clipped = frames[offset] in (0, 255)
                else:
                    sample = int.from_bytes(frames[offset:offset + width], "little", signed=True) / (1 << (8 * width - 1))
                    is_clipped = abs(sample) >= 0.999
                energy += sample * sample
                clipped += is_clipped
                sampled += 1
        rms = math.sqrt(energy / sampled)
        clipped_fraction = clipped / sampled
        return {
            "channels": channels,
            "sample_rate_hz": rate,
            "sample_width_bits": width * 8,
            "duration_seconds": frames_count / rate,
            "near_silent": rms < 0.003,
            "obvious_clipping": clipped_fraction >= 0.001,
        }
    except AuditError:
        raise
    except (EOFError, wave.Error, ValueError, OSError) as exc:
        raise AuditError("invalid_wav") from exc


def _vlq(data: bytes, offset: int, end: int) -> tuple[int, int]:
    value = 0
    for _ in range(4):
        if offset >= end:
            raise AuditError("invalid_midi")
        byte = data[offset]
        offset += 1
        value = (value << 7) | (byte & 0x7f)
        if not byte & 0x80:
            return value, offset
    raise AuditError("invalid_midi")


def _midi_overview(data: bytes) -> dict[str, float | int]:
    if len(data) < 14 or data[:4] != b"MThd":
        raise AuditError("invalid_midi")
    header_size = int.from_bytes(data[4:8], "big")
    if not 6 <= header_size <= 1024 or 8 + header_size > len(data):
        raise AuditError("invalid_midi")
    fmt, track_count, division = struct.unpack_from(">HHH", data, 8)
    if fmt not in (0, 1) or not 1 <= track_count <= MAX_MIDI_TRACKS or division & 0x8000 or not division:
        raise AuditError("unsupported_midi_format")
    if fmt == 0 and track_count != 1:
        raise AuditError("invalid_midi")
    offset = 8 + header_size
    max_tick = 0
    note_count = 0
    events = 0
    tempo_events: list[tuple[int, int, int, int]] = []
    for track in range(track_count):
        if offset + 8 > len(data) or data[offset:offset + 4] != b"MTrk":
            raise AuditError("invalid_midi")
        end = offset + 8 + int.from_bytes(data[offset + 4:offset + 8], "big")
        if end > len(data):
            raise AuditError("invalid_midi")
        offset += 8
        tick = 0
        running: int | None = None
        order = 0
        while offset < end:
            events += 1
            if events > MAX_MIDI_EVENTS:
                raise AuditError("midi_event_limit")
            delta, offset = _vlq(data, offset, end)
            tick += delta
            if offset >= end:
                raise AuditError("invalid_midi")
            status = data[offset]
            if status & 0x80:
                offset += 1
                if status < 0xf0:
                    running = status
            elif running is not None:
                status = running
            else:
                raise AuditError("invalid_midi")
            if status == 0xff:
                running = None
                if offset >= end:
                    raise AuditError("invalid_midi")
                kind = data[offset]
                offset += 1
                size, offset = _vlq(data, offset, end)
                if offset + size > end:
                    raise AuditError("invalid_midi")
                if kind == 0x51 and size == 3:
                    tempo = int.from_bytes(data[offset:offset + size], "big")
                    if tempo:
                        tempo_events.append((tick, track, order, tempo))
                offset += size
            elif status in (0xf0, 0xf7):
                running = None
                size, offset = _vlq(data, offset, end)
                if offset + size > end:
                    raise AuditError("invalid_midi")
                offset += size
            elif 0x80 <= status < 0xf0:
                kind = status >> 4
                size = 1 if kind in (0xc, 0xd) else 2
                if offset + size > end or any(byte & 0x80 for byte in data[offset:offset + size]):
                    raise AuditError("invalid_midi")
                if kind == 0x9 and data[offset + 1] > 0:
                    note_count += 1
                offset += size
            else:
                raise AuditError("unsupported_midi_format")
            order += 1
        max_tick = max(max_tick, tick)
    if offset != len(data):
        raise AuditError("invalid_midi")
    previous_tick = 0
    microseconds = 500_000
    duration_us = 0.0
    for tick, _, _, tempo in sorted(tempo_events):
        if tick > max_tick:
            break
        duration_us += (tick - previous_tick) * microseconds / division
        previous_tick = tick
        microseconds = tempo
    duration_us += (max_tick - previous_tick) * microseconds / division
    return {"format": fmt, "tracks": track_count, "note_on_count": note_count,
            "rough_duration_seconds": duration_us / 1_000_000}


def _read_entry(archive: zipfile.ZipFile, info: zipfile.ZipInfo, limit: int) -> bytes:
    if info.flag_bits & 1 or info.file_size > limit:
        raise AuditError("source_entry_size_or_encryption_limit")
    try:
        with archive.open(info) as member:
            data = member.read(limit + 1)
    except (OSError, RuntimeError, EOFError, zipfile.BadZipFile, NotImplementedError, zlib.error) as exc:
        raise AuditError("unreadable_source_entry") from exc
    if len(data) > limit or len(data) != info.file_size:
        raise AuditError("source_entry_size_limit")
    return data


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    return round(ordered[midpoint] if len(ordered) % 2 else (ordered[midpoint - 1] + ordered[midpoint]) / 2, 3)


def audit(source_tar_paths: Path | list[Path], label_zip_path: Path) -> dict[str, object]:
    stems, label_counts = _label_records(label_zip_path)
    paths = [source_tar_paths] if isinstance(source_tar_paths, Path) else source_tar_paths
    if not 1 <= len(paths) <= source_reader.MAX_TARS:
        raise AuditError("tar_count_limit")
    matching: Counter[str] = Counter()
    wav_counts: Counter[str] = Counter()
    midi_counts: Counter[str] = Counter()
    rate_counts: Counter[int] = Counter()
    channel_counts: Counter[int] = Counter()
    width_counts: Counter[int] = Counter()
    wav_durations: list[float] = []
    midi_durations: list[float] = []
    note_counts: list[float] = []
    payload_bytes = 0
    try:
        with ExitStack() as stack:
            archives: list[tuple[tarfile.TarFile, int, int]] = []
            total_tar_bytes = 0
            for path in paths:
                handle, source_stat = source_reader._open_regular_readonly(
                    path, ".tar", source_reader.MAX_TAR_BYTES
                )
                stack.enter_context(handle)
                tar_archive = stack.enter_context(tarfile.open(fileobj=handle, mode="r:"))
                total_tar_bytes += source_stat.st_size
                if total_tar_bytes > source_reader.MAX_TAR_BYTES:
                    raise AuditError("tar_total_size_limit")
                archives.append((tar_archive, source_stat.st_size, handle.fileno()))
            parts, _, _ = source_reader._tar_parts(archives)
            if parts:
                view = _ReadableJoinedTarParts(parts)
                _, source_paths = source_reader._zip_structure(view)
                by_basename: dict[str, list[int]] = defaultdict(list)
                for name, indices in source_paths.items():
                    by_basename[name.rsplit("/", 1)[-1]].extend(indices)
                with zipfile.ZipFile(view) as source_zip:
                    infos = source_zip.infolist()
                    for stem, label_duration in stems.items():
                        wav_indices = by_basename.get(stem + ".wav", [])
                        midi_indices = by_basename.get(stem + ".mid", []) + by_basename.get(stem + ".midi", [])
                        if len(wav_indices) == 1 and len(midi_indices) == 1:
                            matching["unique_wav_midi_basename"] += 1
                        elif len(wav_indices) > 1 or len(midi_indices) > 1:
                            matching["ambiguous_basename"] += 1
                            continue
                        elif wav_indices:
                            matching["wav_only"] += 1
                            continue
                        elif midi_indices:
                            matching["midi_only"] += 1
                            continue
                        else:
                            matching["neither_found"] += 1
                            continue
                        wav_info = infos[wav_indices[0]]
                        midi_info = infos[midi_indices[0]]
                        if (
                            wav_info.file_size > MAX_WAV_BYTES
                            or midi_info.file_size > MAX_MIDI_BYTES
                            or payload_bytes + wav_info.file_size + midi_info.file_size > MAX_TOTAL_PAYLOAD_BYTES
                        ):
                            matching["skipped_payload_size_limit"] += 1
                            continue
                        parsed_pair: dict[str, dict[str, float | int | bool]] = {}
                        for info, limit, parser, counters in (
                            (wav_info, MAX_WAV_BYTES, _wav_overview, wav_counts),
                            (midi_info, MAX_MIDI_BYTES, _midi_overview, midi_counts),
                        ):
                            payload_bytes += info.file_size
                            try:
                                overview = parser(_read_entry(source_zip, info, limit))
                            except AuditError as exc:
                                counters[str(exc)] += 1
                                continue
                            counters["parsed"] += 1
                            if parser is _wav_overview:
                                parsed_pair["wav"] = overview
                                rate_counts[int(overview["sample_rate_hz"])] += 1
                                channel_counts[int(overview["channels"])] += 1
                                width_counts[int(overview["sample_width_bits"])] += 1
                                wav_durations.append(float(overview["duration_seconds"]))
                                counters["near_silent"] += bool(overview["near_silent"])
                                counters["obvious_clipping"] += bool(overview["obvious_clipping"])
                                if label_duration is not None:
                                    counters["compared_to_label_duration"] += 1
                                    delta = abs(float(overview["duration_seconds"]) - label_duration)
                                    counters["duration_delta_gt_0_1s"] += delta > 0.1
                                    counters["duration_delta_gt_1s"] += delta > 1.0
                            else:
                                parsed_pair["midi"] = overview
                                midi_counts["note_on_total"] += int(overview["note_on_count"])
                                midi_counts["zero_note_files"] += int(overview["note_on_count"] == 0)
                                midi_durations.append(float(overview["rough_duration_seconds"]))
                                note_counts.append(float(overview["note_on_count"]))
                        if "wav" in parsed_pair and "midi" in parsed_pair:
                            matching["both_payloads_parsed"] += 1
                            delta = abs(
                                float(parsed_pair["wav"]["duration_seconds"])
                                - float(parsed_pair["midi"]["rough_duration_seconds"])
                            )
                            matching["rough_midi_wav_duration_delta_gt_1s"] += delta > 1.0
    except (AuditError, source_reader.SourceInspectionError):
        raise
    except (OSError, RuntimeError, EOFError, tarfile.TarError, zipfile.BadZipFile, zlib.error) as exc:
        raise AuditError("invalid_or_unreadable_source_tar") from exc
    return {
        "schema": "mini.aihub-71470-wn01-pair-quality-audit.v1",
        "scope": "local authorized WN01 label ZIP and source TAR part(s); read-only aggregate triage",
        "labels": label_counts,
        "basename_matching": dict(sorted(matching.items())),
        "wav": {
            "counts": dict(sorted(wav_counts.items())),
            "sample_rate_hz_counts": dict(sorted(rate_counts.items())),
            "channel_counts": dict(sorted(channel_counts.items())),
            "sample_width_bits_counts": dict(sorted(width_counts.items())),
            "median_duration_seconds": _median(wav_durations),
        },
        "midi": {
            "counts": dict(sorted(midi_counts.items())),
            "median_note_on_count": _median(note_counts),
            "median_rough_duration_seconds": _median(midi_durations),
        },
        "limits": {
            "max_wav_bytes": MAX_WAV_BYTES,
            "max_midi_bytes": MAX_MIDI_BYTES,
            "max_total_payload_bytes": MAX_TOTAL_PAYLOAD_BYTES,
            "max_sampled_frames_per_wav": MAX_SAMPLE_FRAMES,
        },
        "interpretation": (
            "Unique basenames and plausible headers are only pair candidates. "
            "They do not prove note-level WAV/MIDI alignment, solo daegeum, "
            "authentic timbre, usable training data, or release rights. "
            "Silence/clipping are approximate uniformly sampled triage flags."
        ),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-tar", required=True, action="append",
                        help="absolute local source TAR; repeat for split parts")
    parser.add_argument("--label-zip", required=True, help="absolute local label ZIP")
    args = parser.parse_args(argv)
    try:
        report = audit([Path(path) for path in args.source_tar], Path(args.label_zip))
    except (AuditError, source_reader.SourceInspectionError) as exc:
        print(json.dumps({"status": "error", "code": str(exc)}))
        return 2
    except Exception:
        print(json.dumps({"status": "error", "code": "local_io_failure"}))
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
