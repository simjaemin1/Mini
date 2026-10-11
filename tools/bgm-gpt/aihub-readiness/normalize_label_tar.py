#!/usr/bin/env python3
"""Safely turn one local TAR-wrapped .zip.part0 label package into a private ZIP.

No network, extraction, API key, or dataset-specific content interpretation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import tarfile
import tempfile
import zipfile
import zlib


MAX_TAR_BYTES = 64 * 1024 * 1024
MAX_ZIP_BYTES = 32 * 1024 * 1024
MAX_ZIP_MEMBERS = 20_000
MAX_ZIP_ENTRY_BYTES = 16 * 1024 * 1024
MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 256 * 1024 * 1024
COPY_BYTES = 1024 * 1024
PROJECT_ROOT = Path(__file__).resolve().parents[3]


class NormalizationError(Exception):
    """Safe, fixed-category failure; never carries source names or content."""


def _safe_member_name(name: str) -> bool:
    if not name or "\\" in name or "\x00" in name:
        return False
    parts = name.split("/")
    return (
        not PurePosixPath(name).is_absolute()
        and ":" not in parts[0]
        and all(part not in ("", ".", "..") for part in parts)
    )


def _safe_zip_member_name(name: str) -> bool:
    # 71470 label ZIPs use one leading slash in their member names. We only
    # read members through zipfile (never extract), so treat that slash as a
    # removable archive-internal convention, not a filesystem destination.
    if name.startswith("//"):
        return False
    return _safe_member_name(name[1:] if name.startswith("/") else name)


def _regular_absolute_file(path: Path) -> int:
    if not path.is_absolute() or path.is_symlink():
        raise NormalizationError("expected_absolute_regular_tar")
    try:
        file_stat = path.stat()
    except OSError as exc:
        raise NormalizationError("tar_unavailable") from exc
    if not stat.S_ISREG(file_stat.st_mode):
        raise NormalizationError("expected_absolute_regular_tar")
    return file_stat.st_size


def _validate_zip(path: Path) -> int:
    """Bounded CRC scan; never extract a ZIP member."""
    try:
        with zipfile.ZipFile(path, "r") as archive:
            infos = archive.infolist()
            if not infos or len(infos) > MAX_ZIP_MEMBERS:
                raise NormalizationError("zip_member_limit")
            names: set[str] = set()
            declared_total = 0
            actual_total = 0
            regular_count = 0
            for info in infos:
                if stat.S_ISLNK(info.external_attr >> 16):
                    raise NormalizationError("unsafe_zip_member")
                if not _safe_zip_member_name(info.filename.rstrip("/")):
                    raise NormalizationError("unsafe_zip_member")
                if info.filename in names:
                    raise NormalizationError("duplicate_zip_member")
                names.add(info.filename)
                if info.is_dir():
                    continue
                if info.flag_bits & 1:
                    raise NormalizationError("encrypted_zip_member")
                regular_count += 1
                if info.file_size > MAX_ZIP_ENTRY_BYTES:
                    raise NormalizationError("zip_entry_size_limit")
                declared_total += info.file_size
                if declared_total > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES:
                    raise NormalizationError("zip_total_size_limit")
                with archive.open(info, "r") as member:
                    actual_entry = 0
                    while chunk := member.read(COPY_BYTES):
                        actual_entry += len(chunk)
                        actual_total += len(chunk)
                        if (
                            actual_entry > MAX_ZIP_ENTRY_BYTES
                            or actual_total > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES
                        ):
                            raise NormalizationError("zip_decompression_limit")
            if regular_count == 0:
                raise NormalizationError("empty_zip")
            return regular_count
    except (OSError, RuntimeError, EOFError, zipfile.BadZipFile, NotImplementedError, zlib.error) as exc:
        raise NormalizationError("invalid_zip") from exc


def normalize(tar_path: Path, output_path: Path) -> dict[str, object]:
    tar_bytes = _regular_absolute_file(tar_path)
    if tar_path.suffix.lower() != ".tar":
        raise NormalizationError("expected_tar_extension")
    if tar_bytes > MAX_TAR_BYTES:
        raise NormalizationError("tar_size_limit")
    if not output_path.is_absolute() or output_path.suffix.lower() != ".zip":
        raise NormalizationError("expected_absolute_zip_output")
    if not output_path.parent.is_dir() or output_path.parent.is_symlink():
        raise NormalizationError("output_directory_unavailable")
    if output_path.resolve(strict=False).is_relative_to(PROJECT_ROOT):
        raise NormalizationError("output_inside_repository")
    if os.path.lexists(output_path):
        raise NormalizationError("output_exists")

    stage_path: Path | None = None
    try:
        with tarfile.open(tar_path, "r:") as archive:
            member = archive.next()
            if member is None or archive.next() is not None:
                raise NormalizationError("tar_must_have_one_member")
            if (
                not member.isfile()
                or not _safe_member_name(member.name)
                or not PurePosixPath(member.name).name.endswith(".zip.part0")
            ):
                raise NormalizationError("unsafe_or_unexpected_tar_member")
            if member.size <= 0 or member.size > MAX_ZIP_BYTES:
                raise NormalizationError("zip_size_limit")
            source = archive.extractfile(member)
            if source is None:
                raise NormalizationError("unreadable_tar_member")

            fd, stage_name = tempfile.mkstemp(
                prefix=".aihub-label-stage-", suffix=".tmp", dir=output_path.parent
            )
            stage_path = Path(stage_name)
            try:
                os.fchmod(fd, 0o600)
            except OSError as exc:
                os.close(fd)
                raise NormalizationError("output_write_failed") from exc
            digest = hashlib.sha256()
            copied = 0
            with source, os.fdopen(fd, "wb") as target:
                while chunk := source.read(COPY_BYTES):
                    copied += len(chunk)
                    if copied > MAX_ZIP_BYTES or copied > member.size:
                        raise NormalizationError("zip_size_limit")
                    target.write(chunk)
                    digest.update(chunk)
                target.flush()
                os.fsync(target.fileno())
            if copied != member.size:
                raise NormalizationError("incomplete_tar_member")

        zip_members = _validate_zip(stage_path)
        try:
            os.link(stage_path, output_path)
        except FileExistsError as exc:
            raise NormalizationError("output_exists") from exc
        except OSError as exc:
            raise NormalizationError("output_write_failed") from exc
        return {
            "status": "ok",
            "zip_bytes": copied,
            "zip_sha256": digest.hexdigest(),
            "verified_zip_files": zip_members,
            "output_permissions": "0600",
        }
    except NormalizationError:
        raise
    except (OSError, tarfile.TarError, EOFError) as exc:
        raise NormalizationError("invalid_or_unreadable_tar") from exc
    finally:
        if stage_path is not None:
            try:
                stage_path.unlink()
            except FileNotFoundError:
                pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tar", required=True, help="absolute local .tar path")
    parser.add_argument("--output", required=True, help="new absolute private .zip path")
    args = parser.parse_args(argv)
    try:
        report = normalize(Path(args.tar), Path(args.output))
    except NormalizationError as exc:
        print(json.dumps({"status": "error", "code": str(exc)}))
        return 2
    except (OSError, RuntimeError):
        print(json.dumps({"status": "error", "code": "local_io_failure"}))
        return 2
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
