#!/usr/bin/env python3
"""Bounded, read-only inventory of WN01 markers in one local label ZIP.

This is not an AI Hub schema adapter and never extracts archive members.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile
import zlib


MAX_ARCHIVE_BYTES = 32 * 1024 * 1024
MAX_MEMBERS = 10_000
MAX_JSON_MEMBER_BYTES = 8 * 1024 * 1024
MAX_TOTAL_JSON_BYTES = 64 * 1024 * 1024
MAX_JSONL_LINES = 50_000
MAX_JSONL_LINE_BYTES = 1024 * 1024
MAX_JSON_NODES = 250_000
MAX_JSON_DEPTH = 80


class InventoryError(Exception):
    """Expected invalid-input or safety-limit failure without source content."""


def _safe_member_name(name: str) -> bool:
    if not name or "\\" in name or "\x00" in name:
        return False
    # AI Hub label ZIPs can use a single leading slash. We only read entries
    # through ZipFile.open(ZipInfo), never extract them to filesystem paths.
    if name.startswith("//"):
        return False
    path = PurePosixPath(name)
    parts = name.split("/")
    if path.is_absolute():
        parts = parts[1:]
    return (
        bool(parts)
        and ":" not in parts[0]
        and all(part not in ("", ".", "..") for part in parts)
    )


def _member_kind(name: str) -> str | None:
    lowered = name.lower()
    if lowered.endswith(".json"):
        return "json"
    if lowered.endswith((".jsonl", ".ndjson")):
        return "jsonl"
    return None


def _counts_in_document(document: object) -> tuple[int, int]:
    exact_values = 0
    instrument_fields = 0
    nodes = 0
    stack: list[tuple[object, int]] = [(document, 0)]
    while stack:
        value, depth = stack.pop()
        nodes += 1
        if nodes > MAX_JSON_NODES or depth > MAX_JSON_DEPTH:
            raise InventoryError("json_structure_limit")
        if isinstance(value, dict):
            if value.get("instrument_cd") == "WN01":
                instrument_fields += 1
            stack.extend((item, depth + 1) for item in value.values())
        elif isinstance(value, list):
            stack.extend((item, depth + 1) for item in value)
        elif isinstance(value, str) and value == "WN01":
            exact_values += 1
    return exact_values, instrument_fields


def _scan_json(raw: bytes, kind: str) -> tuple[int, int, int]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeError as exc:
        raise InventoryError("invalid_utf8") from exc

    try:
        if kind == "json":
            documents = [json.loads(text)]
        else:
            lines = text.splitlines()
            if len(lines) > MAX_JSONL_LINES:
                raise InventoryError("jsonl_line_limit")
            if any(len(line.encode("utf-8")) > MAX_JSONL_LINE_BYTES for line in lines):
                raise InventoryError("jsonl_line_size_limit")
            documents = [json.loads(line) for line in lines if line.strip()]
        if not documents:
            raise InventoryError("empty_document")
        exact_values = 0
        instrument_fields = 0
        for document in documents:
            exact, fields = _counts_in_document(document)
            exact_values += exact
            instrument_fields += fields
        return len(documents), exact_values, instrument_fields
    except (ValueError, RecursionError) as exc:
        raise InventoryError("invalid_json") from exc


def _is_symlink(info: zipfile.ZipInfo) -> bool:
    return stat.S_ISLNK(info.external_attr >> 16)


def inspect_zip(path: Path) -> dict[str, object]:
    """Return bounded metadata only; no external or archive member path is emitted."""
    if not path.is_absolute() or path.suffix.lower() != ".zip" or path.is_symlink():
        raise InventoryError("expected_absolute_regular_zip_path")
    try:
        file_stat = path.stat()
    except OSError as exc:
        raise InventoryError("zip_unavailable") from exc
    if not stat.S_ISREG(file_stat.st_mode):
        raise InventoryError("expected_regular_file")
    if file_stat.st_size > MAX_ARCHIVE_BYTES:
        raise InventoryError("archive_size_limit")

    files: list[dict[str, object]] = []
    archive_members = 0
    json_members = 0
    skipped_unsafe_names = 0
    read_only_absolute_names = 0
    skipped_non_json = 0
    examined_bytes = 0
    exact_values_total = 0
    instrument_fields_total = 0
    documents_total = 0
    files_with_wn01 = 0

    try:
        with zipfile.ZipFile(path, "r", allowZip64=True) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_MEMBERS:
                raise InventoryError("archive_member_limit")
            archive_members = len(infos)
            for index, info in enumerate(infos):
                if info.is_dir():
                    continue
                if not _safe_member_name(info.filename) or _is_symlink(info):
                    skipped_unsafe_names += 1
                    continue
                if info.filename.startswith("/"):
                    read_only_absolute_names += 1
                kind = _member_kind(info.filename)
                if kind is None:
                    skipped_non_json += 1
                    continue
                json_members += 1
                item: dict[str, object] = {
                    "member_index": index,
                    "kind": kind,
                    "declared_uncompressed_bytes": info.file_size,
                    "parsed_documents": 0,
                    "exact_wn01_string_values": 0,
                    "instrument_cd_wn01_fields": 0,
                }
                files.append(item)
                if info.flag_bits & 1:
                    item["status"] = "skipped_encrypted"
                    continue
                if info.file_size > MAX_JSON_MEMBER_BYTES:
                    item["status"] = "skipped_member_size_limit"
                    continue
                if examined_bytes + info.file_size > MAX_TOTAL_JSON_BYTES:
                    item["status"] = "skipped_total_size_limit"
                    continue
                try:
                    with archive.open(info, "r") as member:
                        raw = member.read(MAX_JSON_MEMBER_BYTES + 1)
                    if len(raw) > MAX_JSON_MEMBER_BYTES:
                        item["status"] = "skipped_member_size_limit"
                        continue
                    examined_bytes += len(raw)
                    parsed_documents, exact_values, instrument_fields = _scan_json(raw, kind)
                except InventoryError as exc:
                    item["status"] = str(exc)
                    continue
                except (
                    OSError,
                    RuntimeError,
                    EOFError,
                    zipfile.BadZipFile,
                    NotImplementedError,
                    zlib.error,
                ):
                    item["status"] = "unreadable_member"
                    continue
                item.update(
                    status="parsed",
                    parsed_documents=parsed_documents,
                    exact_wn01_string_values=exact_values,
                    instrument_cd_wn01_fields=instrument_fields,
                )
                documents_total += parsed_documents
                exact_values_total += exact_values
                instrument_fields_total += instrument_fields
                files_with_wn01 += int(exact_values > 0)
    except (OSError, zipfile.BadZipFile) as exc:
        raise InventoryError("invalid_zip") from exc

    return {
        "schema": "mini.aihub-71470-label-zip-inventory.v1",
        "archive": {
            "compressed_bytes": file_stat.st_size,
            "members": archive_members,
            "json_or_jsonl_members": json_members,
            "skipped_unsafe_members": skipped_unsafe_names,
            "read_only_absolute_name_members": read_only_absolute_names,
            "skipped_non_json_members": skipped_non_json,
            "json_bytes_read": examined_bytes,
        },
        "wn01_evidence": {
            "parsed_documents": documents_total,
            "exact_wn01_string_values": exact_values_total,
            "instrument_cd_wn01_fields": instrument_fields_total,
            "files_with_wn01_values": files_with_wn01,
            "interpretation": (
                "Counts are exact WN01 string values and known instrument_cd fields "
                "in successfully parsed files, not unique clips or usable WAV/MIDI pairs. "
                "Skipped or invalid files make totals lower bounds for this archive."
            ),
        },
        "files": files,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip_path", help="absolute path to one existing local .zip label archive")
    args = parser.parse_args(argv)
    try:
        report = inspect_zip(Path(args.zip_path))
    except InventoryError as exc:
        print(json.dumps({"status": "error", "code": str(exc)}, ensure_ascii=False))
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
