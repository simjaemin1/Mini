#!/usr/bin/env python3
"""Read-only structural inspection of local AI Hub source TAR part(s).

The TARs may contain one .zip or contiguous .zip.partN byte slices. Source
WAV/MIDI payloads are never opened, decompressed, extracted, or emitted.
An optional small label ZIP supplies filename *candidates* for a conservative
name-linkage report; this does not establish an aligned training pair.
"""

from __future__ import annotations

import argparse
from bisect import bisect_right
from collections import Counter, defaultdict
from contextlib import ExitStack
from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import stat
import struct
import sys
import tarfile
import unicodedata
import zipfile
import zlib


MAX_TAR_BYTES = 8 * 1024**3
MAX_TARS = 128
MAX_TAR_MEMBERS = 128
MAX_PARTS = 128
MAX_PART_SUFFIX_DIGITS = 12
MAX_CENTRAL_DIRECTORY_BYTES = 16 * 1024**2
MAX_ZIP_MEMBERS = 50_000
MAX_REPORTED_ENTRIES = 64
MAX_ZIP_ENTRY_DECLARED_BYTES = 8 * 1024**3
MAX_ZIP_TOTAL_DECLARED_BYTES = 32 * 1024**3
MAX_LABEL_ZIP_BYTES = 32 * 1024**2
MAX_LABEL_MEMBERS = 10_000
MAX_LABEL_JSON_BYTES = 8 * 1024**2
MAX_LABEL_TOTAL_JSON_BYTES = 64 * 1024**2
MAX_LABEL_JSON_NODES = 250_000
MAX_LABEL_JSON_DEPTH = 80
MAX_LABEL_NAME_BYTES = 1024
MAX_LABEL_CANDIDATES = 100_000
READ_CHUNK = 1024 * 1024
PART_RE = re.compile(r"^(.+\.zip)\.part(0|[1-9][0-9]*)$")
LINK_SUFFIXES = {".wav", ".mid", ".midi", ".xml", ".musicxml", ".flac"}


class SourceInspectionError(Exception):
    """Fixed-category failure; never carries a private filename or content."""


def _safe_member_name(name: str, *, single_leading_slash: bool = False) -> bool:
    if not name or "\\" in name or "\x00" in name or name.startswith("//"):
        return False
    if name.startswith("/"):
        if not single_leading_slash:
            return False
        name = name[1:]
    parts = name.split("/")
    return bool(parts) and ":" not in parts[0] and all(part not in ("", ".", "..") for part in parts)


def _normalized_link_name(name: str) -> str | None:
    if not _safe_member_name(name, single_leading_slash=True):
        return None
    normalized = unicodedata.normalize("NFC", name.removeprefix("/"))
    if len(normalized.encode("utf-8")) > MAX_LABEL_NAME_BYTES:
        return None
    return normalized if Path(normalized).suffix.lower() in LINK_SUFFIXES else None


def _open_regular_readonly(path: Path, expected_suffix: str, max_bytes: int):
    if not path.is_absolute() or path.suffix.lower() != expected_suffix or path.is_symlink():
        raise SourceInspectionError("expected_absolute_regular_file")
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise SourceInspectionError("expected_absolute_regular_file")
        if not 0 < info.st_size <= max_bytes:
            raise SourceInspectionError("archive_size_limit")
        return os.fdopen(fd, "rb"), info
    except SourceInspectionError:
        try:
            os.close(fd)
        except OSError:
            pass
        raise
    except OSError as exc:
        raise SourceInspectionError("archive_unavailable") from exc


@dataclass(frozen=True)
class _TarPart:
    fd: int
    member: tarfile.TarInfo


class _JoinedTarParts:
    """Seekable ZIP byte view over regular TAR member extents, using pread."""

    def __init__(self, parts: list[_TarPart]):
        self.parts = parts
        self.starts = [0]
        for part in parts:
            self.starts.append(self.starts[-1] + part.member.size)
        self.size = self.starts[-1]
        self.position = 0

    def tell(self) -> int:
        return self.position

    def seek(self, offset: int, whence: int = os.SEEK_SET) -> int:
        if whence == os.SEEK_SET:
            position = offset
        elif whence == os.SEEK_CUR:
            position = self.position + offset
        elif whence == os.SEEK_END:
            position = self.size + offset
        else:
            raise ValueError("invalid seek mode")
        if position < 0:
            raise ValueError("negative seek position")
        self.position = position
        return position

    def read(self, length: int = -1) -> bytes:
        if length < 0:
            length = self.size - self.position
        remaining = min(length, max(0, self.size - self.position))
        chunks = []
        while remaining:
            index = bisect_right(self.starts, self.position) - 1
            part = self.parts[index]
            within = self.position - self.starts[index]
            count = min(remaining, part.member.size - within, READ_CHUNK)
            chunk = os.pread(part.fd, count, part.member.offset_data + within)
            if len(chunk) != count:
                raise SourceInspectionError("incomplete_tar_part")
            chunks.append(chunk)
            self.position += count
            remaining -= count
        return b"".join(chunks)


def _tar_parts(
    archives: list[tuple[tarfile.TarFile, int, int]],
) -> tuple[list[_TarPart], list[dict[str, int | str]], list[dict[str, int]]]:
    found: dict[int, _TarPart] = {}
    part_rows: list[dict[str, int | str]] = []
    tar_rows: list[dict[str, int]] = []
    zip_base: str | None = None
    global_member_count = 0
    direct_zip = False
    for tar_index, (archive, tar_size, fd) in enumerate(archives):
        member_index = 0
        while (member := archive.next()) is not None:
            if global_member_count >= MAX_TAR_MEMBERS:
                raise SourceInspectionError("tar_member_limit")
            name = member.name
            if not member.isfile() or member.sparse is not None or not _safe_member_name(name):
                raise SourceInspectionError("unsafe_tar_member")
            if not 0 < member.size <= MAX_TAR_BYTES or member.offset_data + member.size > tar_size:
                raise SourceInspectionError("invalid_tar_member_extent")
            match = PART_RE.fullmatch(name)
            if match:
                base, index_text = match.groups()
                if len(index_text) > MAX_PART_SUFFIX_DIGITS:
                    raise SourceInspectionError("zip_part_limit")
                part_number = int(index_text)
            elif name.endswith(".zip"):
                base, part_number, direct_zip = name, 0, True
            else:
                raise SourceInspectionError("unexpected_tar_member")
            if zip_base is None:
                zip_base = base
            if base != zip_base or part_number in found or (direct_zip and global_member_count != 0):
                raise SourceInspectionError("mixed_or_duplicate_zip_parts")
            if len(found) >= MAX_PARTS or part_number > MAX_TAR_BYTES:
                raise SourceInspectionError("zip_part_limit")
            found[part_number] = _TarPart(fd, member)
            part_rows.append({
                "tar_index": tar_index,
                "tar_member_index": member_index,
                "part_number": part_number,
                "bytes": member.size,
            })
            member_index += 1
            global_member_count += 1
        tar_rows.append({"tar_index": tar_index, "bytes": tar_size, "members": member_index})
    if not found:
        raise SourceInspectionError("empty_tar")
    if direct_zip and len(found) != 1:
        raise SourceInspectionError("mixed_or_duplicate_zip_parts")
    ordered_suffixes = sorted(found)
    ordinal_contiguous = ordered_suffixes == list(range(len(found)))
    byte_offset_contiguous = True
    next_byte_offset = 0
    for suffix in ordered_suffixes:
        if suffix != next_byte_offset:
            byte_offset_contiguous = False
            break
        next_byte_offset += found[suffix].member.size
    if not ordinal_contiguous and not byte_offset_contiguous:
        raise SourceInspectionError("missing_zip_part")
    numbering_scheme = (
        "direct_zip" if direct_zip else
        "single_part" if len(found) == 1 else
        "ordinal" if ordinal_contiguous else "byte_offset"
    )
    ordered_parts = [found[suffix] for suffix in ordered_suffixes]
    ordered_rows = sorted(part_rows, key=lambda row: int(row["part_number"]))
    for part_index, row in enumerate(ordered_rows):
        row["part_index"] = part_index
        row["numbering_scheme"] = numbering_scheme
    return ordered_parts, ordered_rows, tar_rows


def _zip_directory_preflight(view, size: int, max_members: int, max_directory_bytes: int) -> tuple[int, int]:
    """Cap central-directory allocation before Python's ZipFile parses it."""
    tail_size = min(size, 22 + 65535)
    view.seek(size - tail_size)
    tail = view.read(tail_size)
    end_offset = tail.rfind(b"PK\x05\x06")
    if end_offset < 0 or end_offset + 22 > len(tail):
        raise SourceInspectionError("zip_end_record_missing")
    _, disk, directory_disk, disk_entries, entries, directory_bytes, directory_offset, comment_bytes = struct.unpack_from(
        "<4sHHHHIIH", tail, end_offset
    )
    if end_offset + 22 + comment_bytes != len(tail):
        raise SourceInspectionError("zip_end_record_invalid")
    if disk or directory_disk or disk_entries != entries:
        raise SourceInspectionError("multidisk_zip_unsupported")
    absolute_end_offset = size - tail_size + end_offset
    directory_end_limit = absolute_end_offset
    if entries == 0xFFFF or directory_bytes == 0xFFFFFFFF or directory_offset == 0xFFFFFFFF:
        if absolute_end_offset < 20:
            raise SourceInspectionError("zip64_locator_missing")
        view.seek(absolute_end_offset - 20)
        locator = view.read(20)
        if len(locator) != 20 or locator[:4] != b"PK\x06\x07":
            raise SourceInspectionError("zip64_locator_missing")
        _, zip64_disk, zip64_offset, total_disks = struct.unpack("<4sIQI", locator)
        if zip64_disk != 0 or total_disks != 1 or zip64_offset + 56 > absolute_end_offset - 20:
            raise SourceInspectionError("multidisk_or_invalid_zip64")
        view.seek(zip64_offset)
        zip64_record = view.read(56)
        if len(zip64_record) != 56 or zip64_record[:4] != b"PK\x06\x06":
            raise SourceInspectionError("zip64_end_record_invalid")
        record_bytes = struct.unpack_from("<Q", zip64_record, 4)[0]
        # Python's ZipFile assumes the minimum ZIP64 record without an
        # extensible data sector. Reject that unsupported variant explicitly.
        if record_bytes != 44 or zip64_offset + 12 + record_bytes != absolute_end_offset - 20:
            raise SourceInspectionError("zip64_end_record_invalid")
        _, _, _, _, disk64, directory_disk64, disk_entries64, entries64, directory_bytes64, directory_offset64 = struct.unpack(
            "<4sQHHIIQQQQ", zip64_record
        )
        if disk64 or directory_disk64 or disk_entries64 != entries64:
            raise SourceInspectionError("multidisk_zip_unsupported")
        entries, directory_bytes, directory_offset = entries64, directory_bytes64, directory_offset64
        directory_end_limit = zip64_offset
    if entries == 0 or entries > max_members or directory_bytes > max_directory_bytes:
        raise SourceInspectionError("zip_directory_limit")
    if directory_offset + directory_bytes > directory_end_limit:
        raise SourceInspectionError("zip_directory_extent_invalid")
    view.seek(0)
    return entries, directory_bytes


def _zip_structure(view: _JoinedTarParts) -> tuple[dict[str, object], dict[str, list[int]]]:
    expected_entries, directory_bytes = _zip_directory_preflight(
        view, view.size, MAX_ZIP_MEMBERS, MAX_CENTRAL_DIRECTORY_BYTES
    )
    records: list[dict[str, object]] = []
    source_paths: dict[str, list[int]] = defaultdict(list)
    suffixes: Counter[str] = Counter()
    declared_total = 0
    compressed_total = 0
    directories = 0
    try:
        with zipfile.ZipFile(view, "r") as archive:
            infos = archive.infolist()
            if len(infos) != expected_entries:
                raise SourceInspectionError("zip_directory_count_mismatch")
            seen: set[str] = set()
            for index, info in enumerate(infos):
                name = info.filename
                is_dir = info.is_dir()
                checked = name[:-1] if is_dir else name
                if not _safe_member_name(checked, single_leading_slash=True):
                    raise SourceInspectionError("unsafe_zip_member")
                if stat.S_ISLNK(info.external_attr >> 16):
                    raise SourceInspectionError("zip_symlink_unsupported")
                normalized = unicodedata.normalize("NFC", checked.removeprefix("/"))
                if normalized in seen:
                    raise SourceInspectionError("duplicate_zip_member")
                seen.add(normalized)
                if info.flag_bits & 1:
                    raise SourceInspectionError("encrypted_zip_member")
                if info.header_offset < 0 or info.header_offset + 30 > view.size:
                    raise SourceInspectionError("zip_local_header_extent_invalid")
                view.seek(info.header_offset)
                local_header = view.read(30)
                if len(local_header) != 30 or local_header[:4] != b"PK\x03\x04":
                    raise SourceInspectionError("zip_local_header_invalid")
                filename_bytes, extra_bytes = struct.unpack_from("<HH", local_header, 26)
                if info.header_offset + 30 + filename_bytes + extra_bytes + info.compress_size > view.size:
                    raise SourceInspectionError("zip_member_data_extent_invalid")
                if info.file_size > MAX_ZIP_ENTRY_DECLARED_BYTES:
                    raise SourceInspectionError("zip_entry_declared_size_limit")
                declared_total += info.file_size
                compressed_total += info.compress_size
                if declared_total > MAX_ZIP_TOTAL_DECLARED_BYTES:
                    raise SourceInspectionError("zip_total_declared_size_limit")
                if compressed_total > view.size:
                    raise SourceInspectionError("zip_total_compressed_size_invalid")
                raw_suffix = Path(normalized).suffix.lower() if not is_dir else ""
                suffix = (
                    raw_suffix if raw_suffix in LINK_SUFFIXES
                    else "(other)" if raw_suffix else "(none)"
                ) if not is_dir else ""
                if is_dir:
                    directories += 1
                else:
                    suffixes[suffix] += 1
                    if raw_suffix in LINK_SUFFIXES:
                        source_paths[normalized].append(index)
                if index < MAX_REPORTED_ENTRIES:
                    records.append({
                        "index": index,
                        "path_depth": normalized.count("/") + 1,
                        "kind": "directory" if is_dir else "file",
                        "suffix": suffix,
                        "compressed_bytes": info.compress_size,
                        "declared_uncompressed_bytes": info.file_size,
                    })
    except (OSError, EOFError, RuntimeError, UnicodeError, ValueError, zipfile.BadZipFile, NotImplementedError) as exc:
        raise SourceInspectionError("invalid_or_unreadable_zip") from exc
    return ({
        "bytes": view.size,
        "central_directory_bytes": directory_bytes,
        "members": expected_entries,
        "directories": directories,
        "file_suffix_counts": dict(sorted(suffixes.items())),
        "total_member_compressed_bytes": compressed_total,
        "declared_uncompressed_bytes": declared_total,
        "validation": "structure_only; WAV/MIDI payload and CRC not read",
        "entry_sample": records,
        "entry_sample_truncated": expected_entries > MAX_REPORTED_ENTRIES,
    }, source_paths)


def _normalized_wn01_stem(source_info: object) -> str | None:
    if not isinstance(source_info, dict):
        return None
    stem = source_info.get("music_src_nm")
    fmt = source_info.get("music_src_fmt")
    if not isinstance(stem, str) or not isinstance(fmt, str) or fmt.lower() != "wav":
        return None
    if not _safe_member_name(stem, single_leading_slash=True):
        return None
    normalized = unicodedata.normalize("NFC", stem.removeprefix("/"))
    if len(normalized.encode("utf-8")) > MAX_LABEL_NAME_BYTES or Path(normalized).suffix:
        return None
    return normalized


def _label_candidates(label_path: Path) -> tuple[set[str], set[str], dict[str, object]]:
    handle, file_stat = _open_regular_readonly(label_path, ".zip", MAX_LABEL_ZIP_BYTES)
    candidates: set[str] = set()
    wn01_stems: set[str] = set()
    wn01_documents = 0
    wn01_documents_with_stem = 0
    wn01_documents_ambiguous_scope = 0
    json_files = 0
    examined_bytes = 0
    try:
        _zip_directory_preflight(handle, file_stat.st_size, MAX_LABEL_MEMBERS, MAX_CENTRAL_DIRECTORY_BYTES)
        with handle, zipfile.ZipFile(handle, "r") as archive:
            infos = archive.infolist()
            if not infos or len(infos) > MAX_LABEL_MEMBERS:
                raise SourceInspectionError("label_member_limit")
            seen_names: set[str] = set()
            for info in infos:
                checked = info.filename[:-1] if info.is_dir() else info.filename
                if not _safe_member_name(checked, single_leading_slash=True) or stat.S_ISLNK(info.external_attr >> 16):
                    raise SourceInspectionError("unsafe_label_member")
                normalized = unicodedata.normalize("NFC", checked.removeprefix("/"))
                if normalized in seen_names:
                    raise SourceInspectionError("duplicate_label_member")
                seen_names.add(normalized)
                if info.is_dir() or not info.filename.lower().endswith(".json"):
                    continue
                if info.flag_bits & 1 or info.file_size > MAX_LABEL_JSON_BYTES:
                    raise SourceInspectionError("label_json_limit")
                if examined_bytes + info.file_size > MAX_LABEL_TOTAL_JSON_BYTES:
                    raise SourceInspectionError("label_total_json_limit")
                with archive.open(info) as source:
                    raw = source.read(MAX_LABEL_JSON_BYTES + 1)
                if len(raw) > MAX_LABEL_JSON_BYTES:
                    raise SourceInspectionError("label_json_limit")
                examined_bytes += len(raw)
                json_files += 1
                document = json.loads(raw.decode("utf-8-sig"))
                stack: list[tuple[object, int]] = [(document, 0)]
                nodes = 0
                wn01_present = False
                source_infos: list[object] = []
                while stack:
                    item, depth = stack.pop()
                    nodes += 1
                    if nodes > MAX_LABEL_JSON_NODES or depth > MAX_LABEL_JSON_DEPTH:
                        raise SourceInspectionError("label_json_structure_limit")
                    if isinstance(item, dict):
                        if item.get("instrument_cd") == "WN01":
                            wn01_present = True
                        if "music_source_info" in item:
                            source_infos.append(item["music_source_info"])
                        stack.extend((value, depth + 1) for value in item.values())
                    elif isinstance(item, list):
                        stack.extend((value, depth + 1) for value in item)
                    elif isinstance(item, str):
                        candidate = _normalized_link_name(item)
                        if candidate is not None:
                            candidates.add(candidate)
                            if len(candidates) > MAX_LABEL_CANDIDATES:
                                raise SourceInspectionError("label_candidate_limit")
                if wn01_present:
                    wn01_documents += 1
                    flattened_infos: list[object] = []
                    for source_info in source_infos:
                        flattened_infos.extend(source_info if isinstance(source_info, list) else [source_info])
                    if len(flattened_infos) > 1:
                        # A JSON holding multiple pieces of music cannot safely
                        # associate a WN01 marker with every source-info object.
                        wn01_documents_ambiguous_scope += 1
                    elif flattened_infos:
                        stem = _normalized_wn01_stem(flattened_infos[0])
                        if stem is not None:
                            wn01_stems.add(stem)
                            wn01_documents_with_stem += 1
                    if len(wn01_stems) > MAX_LABEL_CANDIDATES:
                        raise SourceInspectionError("label_candidate_limit")
    except SourceInspectionError:
        raise
    except (OSError, EOFError, RuntimeError, RecursionError, UnicodeError, ValueError, zipfile.BadZipFile, NotImplementedError, zlib.error) as exc:
        raise SourceInspectionError("invalid_or_unreadable_label_zip") from exc
    finally:
        handle.close()
    if not json_files:
        raise SourceInspectionError("no_label_json")
    return candidates, wn01_stems, {
        "compressed_bytes": file_stat.st_size,
        "json_members": json_files,
        "json_bytes_read": examined_bytes,
        "filename_candidates": len(candidates),
        "wn01_label_documents": wn01_documents,
        "wn01_documents_with_valid_wav_stem": wn01_documents_with_stem,
        "wn01_documents_ambiguous_source_scope": wn01_documents_ambiguous_scope,
        "unique_wn01_wav_stems": len(wn01_stems),
    }


def _match_name(name: str, source_paths: dict[str, list[int]], by_basename: dict[str, set[str]]) -> str:
    if name in source_paths and len(source_paths[name]) == 1:
        return "exact_path"
    paths = by_basename.get(name.rsplit("/", 1)[-1], set())
    return "unique_basename" if len(paths) == 1 else "ambiguous_basename" if paths else "missing"


def _source_basename_index(source_paths: dict[str, list[int]]) -> dict[str, set[str]]:
    by_basename: dict[str, set[str]] = defaultdict(set)
    for name in source_paths:
        by_basename[name.rsplit("/", 1)[-1]].add(name)
    return by_basename


def _linkage(candidates: set[str], source_paths: dict[str, list[int]]) -> dict[str, object]:
    by_basename = _source_basename_index(source_paths)
    counts: Counter[str] = Counter()
    by_suffix: dict[str, Counter[str]] = defaultdict(Counter)
    for candidate in candidates:
        suffix = Path(candidate).suffix.lower()
        result = _match_name(candidate, source_paths, by_basename)
        counts[result] += 1
        by_suffix[suffix][result] += 1
    return {
        "candidate_strings": len(candidates),
        "exact_path": counts["exact_path"],
        "unique_basename": counts["unique_basename"],
        "ambiguous_basename": counts["ambiguous_basename"],
        "missing": counts["missing"],
        "by_suffix": {suffix: dict(sorted(values.items())) for suffix, values in sorted(by_suffix.items())},
        "interpretation": "Filename-string matches only; not audio/score alignment or usable solo evidence.",
    }


def _wn01_pair_linkage(stems: set[str], source_paths: dict[str, list[int]]) -> dict[str, object]:
    by_basename = _source_basename_index(source_paths)
    wav_status: Counter[str] = Counter()
    mid_status: Counter[str] = Counter()
    both_unique = 0
    for stem in stems:
        wav = _match_name(stem + ".wav", source_paths, by_basename)
        mid_alternatives = [
            _match_name(stem + extension, source_paths, by_basename)
            for extension in (".mid", ".midi")
        ]
        found_mid = [status for status in mid_alternatives if status != "missing"]
        mid = "ambiguous_basename" if len(found_mid) > 1 else found_mid[0] if found_mid else "missing"
        wav_status[wav] += 1
        mid_status[mid] += 1
        if wav in ("exact_path", "unique_basename") and mid in ("exact_path", "unique_basename"):
            both_unique += 1
    return {
        "unique_wn01_stems": len(stems),
        "both_wav_and_mid_uniquely_named": both_unique,
        "not_both_uniquely_named": len(stems) - both_unique,
        "wav_name_status": dict(sorted(wav_status.items())),
        "mid_name_status": dict(sorted(mid_status.items())),
        "interpretation": "Two filename links only; MIDI/audio timing, solo instrumentation, and audio quality remain unverified.",
    }


def inspect_source_tar(tar_paths: Path | list[Path], label_zip_path: Path | None = None) -> dict[str, object]:
    paths = [tar_paths] if isinstance(tar_paths, Path) else tar_paths
    if not 1 <= len(paths) <= MAX_TARS:
        raise SourceInspectionError("tar_count_limit")
    try:
        with ExitStack() as stack:
            archives: list[tuple[tarfile.TarFile, int, int]] = []
            total_tar_bytes = 0
            for path in paths:
                handle, file_stat = _open_regular_readonly(path, ".tar", MAX_TAR_BYTES)
                stack.enter_context(handle)
                archive = stack.enter_context(tarfile.open(fileobj=handle, mode="r:"))
                total_tar_bytes += file_stat.st_size
                if total_tar_bytes > MAX_TAR_BYTES:
                    raise SourceInspectionError("tar_total_size_limit")
                archives.append((archive, file_stat.st_size, handle.fileno()))
            parts, part_rows, tar_rows = _tar_parts(archives)
            view = _JoinedTarParts(parts)
            zip_report, source_paths = _zip_structure(view)
        report: dict[str, object] = {
            "schema": "mini.aihub-71470-source-tar-inspection.v1",
            "tar_bytes": total_tar_bytes,
            "tar_members": len(part_rows),
            "zip_part_numbering": part_rows[0]["numbering_scheme"],
            "tars": tar_rows,
            "parts": part_rows,
            "zip": zip_report,
        }
        if label_zip_path is not None:
            candidates, wn01_stems, label_report = _label_candidates(label_zip_path)
            report["label"] = label_report
            report["filename_linkage"] = _linkage(candidates, source_paths)
            report["wn01_pair_linkage"] = _wn01_pair_linkage(wn01_stems, source_paths)
        return report
    except SourceInspectionError:
        raise
    except (OSError, EOFError, tarfile.TarError) as exc:
        raise SourceInspectionError("invalid_or_unreadable_tar") from exc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tar", required=True, action="append", help="absolute source .tar path; repeat for split parts")
    parser.add_argument("--label-zip", help="optional absolute local label .zip path")
    args = parser.parse_args(argv)
    try:
        report = inspect_source_tar([Path(path) for path in args.tar], Path(args.label_zip) if args.label_zip else None)
    except SourceInspectionError as exc:
        print(json.dumps({"status": "error", "code": str(exc)}))
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
