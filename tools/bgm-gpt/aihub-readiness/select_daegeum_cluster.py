#!/usr/bin/env python3
"""Rank metadata-homogeneous WN01 groups in one authorized private label ZIP.

This is a planning aid, not audio extraction, solo verification, alignment, or
training. Standard output contains aggregates only. An optional detailed
manifest is written outside this repository, privately and without overwrite.
"""

from __future__ import annotations

import sys

# Even a read-only invocation should not leave private ZIP-derived bytecode.
sys.dont_write_bytecode = True

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import tempfile
import unicodedata
import zipfile
import zlib


PROJECT_ROOT = Path(__file__).resolve().parents[3]
MAX_ZIP_BYTES = 32 * 1024 * 1024
MAX_MEMBERS = 20_000
MAX_JSON_BYTES = 8 * 1024 * 1024
MAX_TOTAL_JSON_BYTES = 64 * 1024 * 1024
MAX_JSON_NODES = 250_000
MAX_JSON_DEPTH = 80
MAX_STEM_BYTES = 255


class SelectionError(Exception):
    """Fixed-category error; never contains a label value or private path."""


@dataclass(frozen=True)
class Record:
    stem: str
    performer: str
    place: str
    channel: str
    title: str
    duration_seconds: float
    sample_rate_hz: int
    bit_depth: int
    has_single_tonguing_label: bool


def _safe_member_name(value: str) -> str | None:
    if not value or value.startswith("//") or "\\" in value or "\x00" in value:
        return None
    normalized = unicodedata.normalize("NFC", value.removeprefix("/"))
    parts = normalized.split("/")
    if not parts or ":" in parts[0] or any(part in ("", ".", "..") for part in parts):
        return None
    if any(ord(char) < 32 for char in normalized):
        return None
    return normalized


def _safe_stem(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    stem = unicodedata.normalize("NFC", value)
    if (
        not stem or stem != stem.strip() or stem.startswith(".")
        or stem in (".", "..") or "/" in stem or "\\" in stem
        or ":" in stem or "\x00" in stem or Path(stem).suffix
        or any(ord(char) < 32 for char in stem)
        or len(stem.encode("utf-8")) > MAX_STEM_BYTES
    ):
        return None
    return stem


def _safe_text(value: object, *, max_bytes: int = 512) -> str | None:
    if not isinstance(value, str):
        return None
    result = unicodedata.normalize("NFC", value).strip()
    if (
        not result or any(ord(char) < 32 for char in result)
        or len(result.encode("utf-8")) > max_bytes
    ):
        return None
    return result


def _channel(value: object) -> str | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return str(value) if 1 <= value <= 8 else None
    result = _safe_text(value, max_bytes=64)
    return result.casefold() if result else None


def _integer(value: object, *, minimum: int, maximum: int) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        number = value
    elif isinstance(value, str) and value.strip().isdecimal():
        try:
            number = int(value.strip())
        except ValueError:
            return None
    else:
        return None
    return number if minimum <= number <= maximum else None


def _duration(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    return number if math.isfinite(number) and 0 < number <= 3600 else None


def _bounded_json_shape(value: object) -> None:
    stack = [(value, 0)]
    nodes = 0
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if nodes > MAX_JSON_NODES or depth > MAX_JSON_DEPTH:
            raise SelectionError("json_structure_limit")
        if isinstance(item, dict):
            stack.extend((child, depth + 1) for child in item.values())
        elif isinstance(item, list):
            stack.extend((child, depth + 1) for child in item)


def _unique_json_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise SelectionError("duplicate_json_key")
        result[key] = value
    return result


def _parse_wn01(document: dict[str, object], counts: Counter[str]) -> Record | None:
    kind = document.get("music_type_info")
    if not isinstance(kind, dict) or kind.get("instrument_cd") != "WN01":
        counts["other_or_unknown_instrument"] += 1
        return None
    counts["wn01_labels"] += 1
    source = document.get("music_source_info")
    get_info = document.get("get_info")
    if not isinstance(source, dict) or not isinstance(get_info, dict):
        counts["missing_metadata_objects"] += 1
        return None
    stem = _safe_stem(source.get("music_src_nm"))
    if stem is None:
        counts["invalid_stem"] += 1
        return None
    source_format = source.get("music_src_fmt")
    if not isinstance(source_format, str) or source_format.casefold() != "wav":
        counts["not_declared_wav"] += 1
        return None
    performer = _safe_text(kind.get("main_instr_player"))
    place = _safe_text(get_info.get("get_place"))
    channel = _channel(source.get("channel"))
    if performer is None or place is None or channel is None:
        counts["incomplete_cluster_key"] += 1
        return None
    title = _safe_text(source.get("music_nm_kor"))
    if title is None:
        counts["missing_song_title"] += 1
        return None
    duration = _duration(source.get("play_time"))
    if duration is None:
        counts["invalid_duration"] += 1
        return None
    sample_rate = _integer(source.get("samplingRate"), minimum=8_000, maximum=384_000)
    bit_depth = _integer(source.get("bitDepth"), minimum=8, maximum=64)
    if sample_rate is None or bit_depth not in (8, 16, 24, 32, 64):
        counts["invalid_audio_format_metadata"] += 1
        return None
    annotation = document.get("annotation_data_info")
    tonguing = annotation.get("single_tonguing_cd") if isinstance(annotation, dict) else None
    has_tonguing = isinstance(tonguing, (str, list, dict)) and bool(tonguing)
    if tonguing is not None and not isinstance(tonguing, (str, list, dict)):
        counts["unrecognized_optional_tonguing_shape"] += 1
    return Record(
        stem=stem,
        performer=performer,
        place=place,
        channel=channel,
        title=title,
        duration_seconds=duration,
        sample_rate_hz=sample_rate,
        bit_depth=bit_depth,
        has_single_tonguing_label=has_tonguing,
    )


def _open_zip(path: Path) -> tuple[object, int]:
    if not path.is_absolute() or path.suffix.casefold() != ".zip":
        raise SelectionError("expected_absolute_label_zip")
    if path.is_symlink() or path.resolve(strict=False).is_relative_to(PROJECT_ROOT):
        raise SelectionError("label_zip_not_private_regular_file")
    try:
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(path, flags)
        file_stat = os.fstat(descriptor)
        if not stat.S_ISREG(file_stat.st_mode) or file_stat.st_size > MAX_ZIP_BYTES:
            os.close(descriptor)
            raise SelectionError("label_zip_size_or_type_limit")
        return os.fdopen(descriptor, "rb"), file_stat.st_size
    except OSError as exc:
        raise SelectionError("label_zip_unavailable") from exc


def _read_records(path: Path) -> tuple[list[Record], Counter[str], str]:
    handle, _ = _open_zip(path)
    records: list[Record] = []
    all_label_stems: Counter[str] = Counter()
    counts: Counter[str] = Counter()
    seen_names: set[str] = set()
    json_bytes = 0
    digest = hashlib.sha256()
    try:
        with handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
            handle.seek(0)
            with zipfile.ZipFile(handle, "r") as archive:
                infos = archive.infolist()
                if not infos or len(infos) > MAX_MEMBERS:
                    raise SelectionError("label_member_limit")
                for info in infos:
                    name = _safe_member_name(info.filename[:-1] if info.is_dir() else info.filename)
                    if name is None or stat.S_ISLNK(info.external_attr >> 16) or info.flag_bits & 1:
                        raise SelectionError("unsafe_label_member")
                    if name in seen_names:
                        raise SelectionError("duplicate_label_member")
                    seen_names.add(name)
                    if info.is_dir() or not name.casefold().endswith(".json"):
                        continue
                    counts["json_members"] += 1
                    if info.file_size > MAX_JSON_BYTES or json_bytes + info.file_size > MAX_TOTAL_JSON_BYTES:
                        raise SelectionError("label_json_size_limit")
                    with archive.open(info) as member:
                        raw = member.read(MAX_JSON_BYTES + 1)
                    if len(raw) > MAX_JSON_BYTES:
                        raise SelectionError("label_json_size_limit")
                    json_bytes += len(raw)
                    document = json.loads(
                        raw.decode("utf-8-sig"), object_pairs_hook=_unique_json_object
                    )
                    _bounded_json_shape(document)
                    if not isinstance(document, dict):
                        counts["invalid_label_document"] += 1
                        continue
                    source = document.get("music_source_info")
                    if isinstance(source, dict):
                        any_instrument_stem = _safe_stem(source.get("music_src_nm"))
                        if any_instrument_stem is not None:
                            all_label_stems[any_instrument_stem.casefold()] += 1
                    record = _parse_wn01(document, counts)
                    if record is not None:
                        records.append(record)
    except SelectionError:
        raise
    except (OSError, EOFError, RuntimeError, UnicodeError, ValueError, RecursionError,
            zipfile.BadZipFile, NotImplementedError, zlib.error) as exc:
        raise SelectionError("invalid_or_unreadable_label_zip") from exc
    if not counts["json_members"]:
        raise SelectionError("no_label_json")
    counts["candidate_before_dedup"] = len(records)
    duplicate_stems = {stem for stem, count in all_label_stems.items() if count > 1}
    counts["duplicate_stem_values"] = len(duplicate_stems)
    counts["duplicate_stem_records_removed"] = sum(
        record.stem.casefold() in duplicate_stems for record in records
    )
    records = [record for record in records if record.stem.casefold() not in duplicate_stems]
    counts["candidate_records"] = len(records)
    return records, counts, digest.hexdigest()


def select(path: Path, split: str) -> tuple[dict[str, object], dict[str, object]]:
    if split not in ("training", "validation"):
        raise SelectionError("invalid_split")
    # AI Hub's canonical TL_/VL_ naming offers a cheap guard against calling
    # validation labels training. Arbitrarily renamed files remain unproven.
    canonical_prefix = path.name[:3].upper()
    if (canonical_prefix == "TL_" and split != "training") or (
        canonical_prefix == "VL_" and split != "validation"
    ):
        raise SelectionError("label_archive_split_mismatch")
    records, counts, zip_sha256 = _read_records(path)
    grouped: dict[tuple[str, str, str], list[Record]] = defaultdict(list)
    for record in records:
        grouped[(record.performer, record.place, record.channel)].append(record)
    ranked = sorted(
        grouped.items(),
        key=lambda pair: (-math.fsum(item.duration_seconds for item in pair[1]),
                          -len(pair[1]), pair[0]),
    )
    manifest_clusters: list[dict[str, object]] = []
    summary_clusters: list[dict[str, object]] = []
    for index, ((performer, place, channel), items) in enumerate(ranked, 1):
        cluster_id = f"C{index:03d}"
        total = math.fsum(item.duration_seconds for item in items)
        songs: dict[str, list[Record]] = defaultdict(list)
        for item in items:
            songs[item.title].append(item)
        private_songs = []
        for title, song_records in sorted(
            songs.items(),
            key=lambda pair: (-math.fsum(item.duration_seconds for item in pair[1]), pair[0]),
        ):
            private_songs.append({
                "title": title,
                "records": [
                    {
                        "stem": item.stem,
                        "duration_seconds": item.duration_seconds,
                        "sample_rate_hz": item.sample_rate_hz,
                        "bit_depth": item.bit_depth,
                        "source_format": "wav",
                        "has_single_tonguing_label": item.has_single_tonguing_label,
                    }
                    for item in sorted(song_records, key=lambda record: record.stem)
                ],
            })
        formats = Counter((item.sample_rate_hz, item.bit_depth) for item in items)
        manifest_clusters.append({
            "cluster_id": cluster_id,
            "performer": performer,
            "place": place,
            "channel": channel,
            "total_seconds": round(total, 6),
            "songs": private_songs,
        })
        summary_clusters.append({
            "cluster_id": cluster_id,
            "records": len(items),
            "songs": len(songs),
            "total_seconds": round(total, 3),
            "format_variants": len(formats),
            "with_optional_tonguing_label": sum(item.has_single_tonguing_label for item in items),
        })
    manifest = {
        "schema": "mini.aihub-71470-daegeum-clusters.v1",
        "split": split,
        "label_zip_sha256": zip_sha256,
        "clusters": manifest_clusters,
        "notice": (
            "Private selection metadata only. A common performer/place/channel does not prove "
            "solo recording, clean tone, note alignment, or publication rights. "
            "Do not train on validation split."
        ),
    }
    summary = {
        "schema": "mini.aihub-71470-daegeum-cluster-summary.v1",
        "split": split,
        "counts": dict(sorted(counts.items())),
        "ranked_clusters": len(summary_clusters),
        "top_clusters": summary_clusters[:10],
        "interpretation": (
            "Ranked by labeled duration; the largest homogeneous metadata group is only "
            "a listening and WAV-quality candidate, not an automatically clean solo dataset."
        ),
    }
    return summary, manifest


def _save_private_json(path: Path, document: dict[str, object]) -> None:
    if not path.is_absolute() or path.suffix.casefold() != ".json":
        raise SelectionError("expected_absolute_json_output")
    if (
        not path.parent.is_dir() or path.parent.is_symlink()
        or path.resolve(strict=False).is_relative_to(PROJECT_ROOT)
    ):
        raise SelectionError("output_not_private_directory")
    if os.path.lexists(path):
        raise SelectionError("output_exists")
    stage: Path | None = None
    try:
        descriptor, name = tempfile.mkstemp(prefix=".daegeum-cluster-", suffix=".tmp", dir=path.parent)
        stage = Path(name)
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(document, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.link(stage, path)
    except FileExistsError as exc:
        raise SelectionError("output_exists") from exc
    except OSError as exc:
        raise SelectionError("output_write_failed") from exc
    finally:
        if stage is not None:
            try:
                stage.unlink()
            except FileNotFoundError:
                pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label-zip", required=True, help="absolute private label ZIP path")
    parser.add_argument("--split", required=True, choices=("training", "validation"))
    parser.add_argument("--output", help="optional absolute private manifest .json path; must not exist")
    arguments = parser.parse_args(argv)
    try:
        summary, manifest = select(Path(arguments.label_zip), arguments.split)
        if arguments.output is not None:
            _save_private_json(Path(arguments.output), manifest)
    except SelectionError as exc:
        print(json.dumps({"status": "error", "code": str(exc)}, ensure_ascii=False))
        return 2
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
