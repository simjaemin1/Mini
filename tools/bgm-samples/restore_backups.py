#!/usr/bin/env python3
"""Safely restore the locally archived gugak BGM sample sources.

The source archives are deliberately ignored by Git.  This program never
downloads anything, never writes beside the source files, and requires an
explicit empty (or nonexistent) destination directory for extraction.

It restores the archive layout exactly as it was backed up:

    samples_daegeum/
    samples_jdae/          # includes the original _index.json and _hold.json

In particular, it does not scan, regenerate, or edit the jdae metadata.
"""

from __future__ import annotations

import argparse
import bisect
import hashlib
import io
import os
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import tempfile
from typing import BinaryIO, Iterator, Sequence
import zipfile


SCRIPT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE_DIR = SCRIPT_ROOT / "public" / "assets" / "audio" / "bgm"

# These are hashes of the known local backup set.  A source archive that has
# changed is rejected rather than silently restoring a different sample set.
KNOWN_SHA256 = {
    "bk_daegeum_a.zip": "6aa28487d0c9b3fc12be7d1aff48d379ebad0c6dd1cd43bd81766a04903b8f6b",
    "bk_daegeum_b.zip": "86e1e03e8612e8b03a66e72dec30f4ce4e052bec2c018fcab333670a365709bd",
    "bk_jdae_aa.part": "b28d93b5d7531b7463243cef7b9e1b8c13e3ad3571717042a743e34c5960dd6f",
    "bk_jdae_ab.part": "536aa5dbb9e0a807cfe183d9c41dca2b213d49e722e29803e0f7cb1fb0febd14",
}
KNOWN_JDAE_JOIN_SHA256 = "52b38f04601e0412c4cb8725507afab17406c9672a7569e3d06a4525a9c39ae7"

MAX_ARCHIVE_MEMBERS = 1_000
MAX_ARCHIVE_UNCOMPRESSED_BYTES = 512 * 1024 * 1024
MAX_COMPRESSION_RATIO = 1_000
COPY_BUFFER_BYTES = 1024 * 1024


class RestoreError(RuntimeError):
    """An input or output condition that makes a restore unsafe."""


@dataclass(frozen=True)
class ArchiveSpec:
    label: str
    source_names: tuple[str, ...]
    expected_top_level: str
    required_members: frozenset[str] = frozenset()


ARCHIVES = (
    ArchiveSpec("daegeum-a", ("bk_daegeum_a.zip",), "samples_daegeum"),
    ArchiveSpec("daegeum-b", ("bk_daegeum_b.zip",), "samples_daegeum"),
    ArchiveSpec(
        "jdae",
        ("bk_jdae_aa.part", "bk_jdae_ab.part"),
        "samples_jdae",
        frozenset({"samples_jdae/_index.json", "samples_jdae/_hold.json"}),
    ),
)


class MultipartReader(io.RawIOBase):
    """A seekable, read-only view of archive parts without making a joined ZIP.

    ``zipfile.ZipFile`` needs a seekable input.  This reader exposes the two
    jdae parts as one logical stream, so both verification and extraction stay
    local and do not leave an intermediate combined archive behind.
    """

    def __init__(self, paths: Sequence[Path]) -> None:
        super().__init__()
        self._paths = tuple(paths)
        self._files: list[BinaryIO] = [path.open("rb") for path in self._paths]
        self._sizes = [path.stat().st_size for path in self._paths]
        self._starts: list[int] = []
        total = 0
        for size in self._sizes:
            self._starts.append(total)
            total += size
        self._size = total
        self._position = 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self._position

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        if whence == io.SEEK_SET:
            position = offset
        elif whence == io.SEEK_CUR:
            position = self._position + offset
        elif whence == io.SEEK_END:
            position = self._size + offset
        else:
            raise ValueError(f"unsupported seek origin: {whence}")
        if position < 0:
            raise ValueError("cannot seek before the start of the joined archive")
        self._position = min(position, self._size)
        return self._position

    def readinto(self, buffer: bytearray | memoryview) -> int:
        if self.closed:
            raise ValueError("I/O operation on closed archive parts")
        if self._position >= self._size:
            return 0

        view = memoryview(buffer).cast("B")
        copied = 0
        while copied < len(view) and self._position < self._size:
            index = bisect.bisect_right(self._starts, self._position) - 1
            if index < 0:
                index = 0
            part_offset = self._position - self._starts[index]
            available = self._sizes[index] - part_offset
            wanted = min(len(view) - copied, available)
            source = self._files[index]
            source.seek(part_offset)
            chunk = source.read(wanted)
            if not chunk:
                raise RestoreError(
                    f"unexpected end of backup part: {self._paths[index].name}"
                )
            view[copied : copied + len(chunk)] = chunk
            copied += len(chunk)
            self._position += len(chunk)
        return copied

    def close(self) -> None:
        if not self.closed:
            for source in self._files:
                source.close()
        super().close()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(COPY_BUFFER_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_joined(paths: Sequence[Path]) -> str:
    digest = hashlib.sha256()
    for path in paths:
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(COPY_BUFFER_BYTES), b""):
                digest.update(chunk)
    return digest.hexdigest()


def source_paths(source_dir: Path) -> dict[str, Path]:
    source_dir = source_dir.expanduser().resolve()
    if not source_dir.is_dir():
        raise RestoreError(f"source directory does not exist: {source_dir}")

    paths: dict[str, Path] = {}
    for name in KNOWN_SHA256:
        path = source_dir / name
        if not path.is_file():
            raise RestoreError(f"missing required backup: {path}")
        paths[name] = path
    return paths


def validate_source_hashes(paths: dict[str, Path]) -> None:
    for name, expected in KNOWN_SHA256.items():
        actual = sha256_file(paths[name])
        if actual != expected:
            raise RestoreError(
                f"SHA-256 mismatch for {name}: expected {expected}, got {actual}"
            )

    joined_names = ARCHIVES[2].source_names
    joined_actual = sha256_joined([paths[name] for name in joined_names])
    if joined_actual != KNOWN_JDAE_JOIN_SHA256:
        raise RestoreError(
            "SHA-256 mismatch for the joined jdae backup parts; "
            "check their order and completeness"
        )


@contextmanager
def open_archive(spec: ArchiveSpec, paths: dict[str, Path]) -> Iterator[zipfile.ZipFile]:
    part_paths = [paths[name] for name in spec.source_names]
    if len(part_paths) == 1:
        with zipfile.ZipFile(part_paths[0], "r") as archive:
            yield archive
        return

    with MultipartReader(part_paths) as joined:
        with zipfile.ZipFile(joined, "r") as archive:
            yield archive


def normalized_member_name(name: str) -> PurePosixPath:
    # Treat a backslash as a path separator too: it is harmless on POSIX but
    # could escape a destination on a Windows extraction implementation.
    if not name or "\x00" in name or name.startswith(("/", "\\")):
        raise RestoreError(f"unsafe ZIP member name: {name!r}")
    normalized = name.replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        raise RestoreError(f"unsafe ZIP member path: {name!r}")
    if path.parts and path.parts[0].endswith(":"):
        raise RestoreError(f"unsafe drive-qualified ZIP member path: {name!r}")
    return path


def is_symlink(info: zipfile.ZipInfo) -> bool:
    mode = info.external_attr >> 16
    return stat.S_ISLNK(mode)


def inspect_archive(
    archive: zipfile.ZipFile, spec: ArchiveSpec
) -> tuple[list[tuple[zipfile.ZipInfo, PurePosixPath]], int]:
    infos = archive.infolist()
    if len(infos) > MAX_ARCHIVE_MEMBERS:
        raise RestoreError(
            f"{spec.label} has too many ZIP members ({len(infos)} > {MAX_ARCHIVE_MEMBERS})"
        )

    total_uncompressed = 0
    files: list[tuple[zipfile.ZipInfo, PurePosixPath]] = []
    seen_files: set[str] = set()
    seen_dirs: set[str] = set()
    for info in infos:
        if info.flag_bits & 0x1:
            raise RestoreError(f"{spec.label} contains an encrypted ZIP member: {info.filename!r}")
        if is_symlink(info):
            raise RestoreError(f"{spec.label} contains a symlink ZIP member: {info.filename!r}")

        relative = normalized_member_name(info.filename.rstrip("/"))
        if not relative.parts or relative.parts[0] != spec.expected_top_level:
            raise RestoreError(
                f"{spec.label} member is outside expected {spec.expected_top_level}/: "
                f"{info.filename!r}"
            )

        relative_name = relative.as_posix()
        if info.is_dir():
            seen_dirs.add(relative_name)
            continue
        if relative_name in seen_files or relative_name in seen_dirs:
            raise RestoreError(f"{spec.label} has a duplicate or conflicting member: {info.filename!r}")

        total_uncompressed += info.file_size
        if total_uncompressed > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
            raise RestoreError(
                f"{spec.label} expands beyond the {MAX_ARCHIVE_UNCOMPRESSED_BYTES // (1024 * 1024)} MiB safety limit"
            )
        if info.file_size and not info.compress_size:
            raise RestoreError(f"{spec.label} has an invalid compressed size: {info.filename!r}")
        if info.compress_size and info.file_size / info.compress_size > MAX_COMPRESSION_RATIO:
            raise RestoreError(f"{spec.label} exceeds the compression-ratio safety limit: {info.filename!r}")

        seen_files.add(relative_name)
        files.append((info, relative))

    missing = spec.required_members - seen_files
    if missing:
        raise RestoreError(
            f"{spec.label} is missing original metadata: {', '.join(sorted(missing))}"
        )

    # Read every member once here to make --verify a full CRC check.  This
    # neither extracts nor modifies any sample or metadata file.
    corrupted = archive.testzip()
    if corrupted is not None:
        raise RestoreError(f"CRC validation failed in {spec.label}: {corrupted!r}")
    return files, total_uncompressed


def inspect_all(paths: dict[str, Path]) -> list[tuple[ArchiveSpec, list[tuple[zipfile.ZipInfo, PurePosixPath]], int]]:
    inspected: list[tuple[ArchiveSpec, list[tuple[zipfile.ZipInfo, PurePosixPath]], int]] = []
    output_files: set[str] = set()
    for spec in ARCHIVES:
        with open_archive(spec, paths) as archive:
            members, byte_count = inspect_archive(archive, spec)
        for _info, relative in members:
            name = relative.as_posix()
            if name in output_files:
                raise RestoreError(f"backup archives would overwrite one another: {name}")
            output_files.add(name)
        inspected.append((spec, members, byte_count))
    return inspected


def safe_stage_target(stage: Path, relative: PurePosixPath) -> Path:
    target = stage.joinpath(*relative.parts)
    stage_resolved = stage.resolve()
    target_resolved = target.resolve(strict=False)
    try:
        target_resolved.relative_to(stage_resolved)
    except ValueError as exc:
        raise RestoreError(f"ZIP member escapes staging directory: {relative.as_posix()!r}") from exc
    return target


def extract_archive(
    archive: zipfile.ZipFile,
    members: Sequence[tuple[zipfile.ZipInfo, PurePosixPath]],
    stage: Path,
) -> None:
    for info, relative in members:
        target = safe_stage_target(stage, relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation turns an unexpected duplicate into a failure,
        # rather than allowing ZIP extraction to overwrite a prior member.
        with archive.open(info, "r") as source, target.open("xb") as destination:
            shutil.copyfileobj(source, destination, COPY_BUFFER_BYTES)


def ensure_safe_destination(destination: Path) -> Path:
    destination = destination.expanduser().absolute()
    if destination.exists():
        if destination.is_symlink() or not destination.is_dir():
            raise RestoreError(f"destination must be a real directory: {destination}")
        try:
            next(destination.iterdir())
        except StopIteration:
            return destination
        raise RestoreError(
            f"refusing to overwrite nonempty destination: {destination}\n"
            "Choose a new empty directory."
        )
    if not destination.parent.is_dir():
        raise RestoreError(
            f"destination parent must already exist: {destination.parent}\n"
            "Create it explicitly, then rerun the restore."
        )
    return destination


def restore(paths: dict[str, Path], destination: Path) -> None:
    destination = ensure_safe_destination(destination)
    inspected = inspect_all(paths)
    stage = Path(
        tempfile.mkdtemp(prefix=f".{destination.name}.restore-", dir=str(destination.parent))
    )
    try:
        for spec, members, _byte_count in inspected:
            with open_archive(spec, paths) as archive:
                extract_archive(archive, members, stage)

        if destination.exists():
            # It was empty when checked.  rmdir refuses to proceed if another
            # process has placed anything there, so this cannot erase content.
            destination.rmdir()
        os.replace(stage, destination)
    except Exception:
        # The staging directory was created by this invocation and is never a
        # caller-selected path.  Clean it rather than leaving partial samples.
        if stage.exists():
            shutil.rmtree(stage)
        raise


def print_verification_summary(
    source_dir: Path,
    inspected: Sequence[tuple[ArchiveSpec, Sequence[tuple[zipfile.ZipInfo, PurePosixPath]], int]],
) -> None:
    total_files = sum(len(members) for _spec, members, _bytes in inspected)
    total_bytes = sum(byte_count for _spec, _members, byte_count in inspected)
    print(f"Verified local BGM backups: {source_dir}")
    for spec, members, byte_count in inspected:
        print(f"  {spec.label}: {len(members)} files, {byte_count:,} uncompressed bytes")
    print(f"  total: {total_files} files, {total_bytes:,} uncompressed bytes")
    print("  jdae _index.json and _hold.json are present and will be preserved unchanged.")


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify or safely restore local Daegeum/Jungak-Daegeum sample backups."
    )
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=DEFAULT_SOURCE_DIR,
        help=f"directory holding ignored bk_* files (default: {DEFAULT_SOURCE_DIR})",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="validate hashes, ZIP structure, and CRCs without extracting anything",
    )
    parser.add_argument(
        "--dest",
        type=Path,
        help="new or empty destination directory for a restore",
    )
    args = parser.parse_args(argv)
    if args.verify and args.dest is not None:
        parser.error("--verify does not accept --dest because it never writes output")
    if not args.verify and args.dest is None:
        parser.error("--dest is required unless --verify is used")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        paths = source_paths(args.source_dir)
        validate_source_hashes(paths)
        if args.verify:
            inspected = inspect_all(paths)
            print_verification_summary(args.source_dir.expanduser().resolve(), inspected)
            return 0
        restore(paths, args.dest)
        print(f"Restored local BGM samples into: {args.dest.expanduser().absolute()}")
        print("No sample index was regenerated; samples_jdae/_index.json and _hold.json were copied from backup.")
        return 0
    except (RestoreError, OSError, zipfile.BadZipFile) as exc:
        print(f"restore failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
