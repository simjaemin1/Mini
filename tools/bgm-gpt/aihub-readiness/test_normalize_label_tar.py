"""Synthetic-only safety tests for TAR-wrapped AI Hub label ZIP normalization."""

from __future__ import annotations

import io
import json
from pathlib import Path
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zipfile


SCRIPT = Path(__file__).with_name("normalize_label_tar.py")


def zip_bytes(members: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, contents in members.items():
            archive.writestr(name, contents)
    return buffer.getvalue()


def write_tar(path: Path, entries: list[tuple[str, bytes, bytes | None]]) -> None:
    with tarfile.open(path, "w") as archive:
        for name, payload, kind in entries:
            info = tarfile.TarInfo(name)
            info.type = kind or tarfile.REGTYPE
            info.size = len(payload) if info.isfile() else 0
            archive.addfile(info, io.BytesIO(payload) if info.isfile() else None)


def run_normalizer(source: Path, output: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--tar", str(source), "--output", str(output)],
        capture_output=True,
        text=True,
        check=False,
    )


class NormalizeLabelTarTests(unittest.TestCase):
    def test_valid_single_part_becomes_private_verified_zip(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            source = directory / "incoming.tar"
            output = directory / "private.zip"
            payload = zip_bytes({"/labels/record.json": b'{"instrument_cd":"WN01"}'})
            write_tar(source, [("safe/private-labels.zip.part0", payload, None)])
            result = run_normalizer(source, output)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(result.stdout)
            self.assertEqual(report["status"], "ok")
            self.assertEqual(report["zip_bytes"], len(payload))
            self.assertEqual(report["verified_zip_files"], 1)
            self.assertEqual(output.read_bytes(), payload)
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
            self.assertEqual(sorted(p.name for p in directory.iterdir()), ["incoming.tar", "private.zip"])
            self.assertNotIn("WN01", result.stdout)
            self.assertNotIn("record.json", result.stdout)
            self.assertNotIn(str(directory), result.stdout)

    def test_existing_output_is_never_overwritten(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            source = directory / "incoming.tar"
            output = directory / "private.zip"
            write_tar(source, [("labels.zip.part0", zip_bytes({"x.json": b"{}"}), None)])
            output.write_bytes(b"DO NOT REPLACE")
            result = run_normalizer(source, output)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(json.loads(result.stdout)["code"], "output_exists")
            self.assertEqual(output.read_bytes(), b"DO NOT REPLACE")
            self.assertEqual(sorted(p.name for p in directory.iterdir()), ["incoming.tar", "private.zip"])

    def test_multiple_or_unsafe_tar_entries_never_create_output(self) -> None:
        for entries in (
            [("a.zip.part0", b"one", None), ("b.zip.part0", b"two", None)],
            [("../escape.zip.part0", b"bad", None)],
            [("/absolute.zip.part0", b"bad", None)],
            [("wrong.zip", b"bad", None)],
            [("link.zip.part0", b"", tarfile.SYMTYPE)],
        ):
            with self.subTest(entries=entries), tempfile.TemporaryDirectory() as temp:
                directory = Path(temp)
                source = directory / "incoming.tar"
                output = directory / "private.zip"
                write_tar(source, entries)
                result = run_normalizer(source, output)
                self.assertEqual(result.returncode, 2)
                self.assertFalse(output.exists())
                self.assertEqual(sorted(p.name for p in directory.iterdir()), ["incoming.tar"])
                self.assertNotIn("escape.zip.part0", result.stdout)

    def test_bad_zip_crc_or_unsafe_zip_member_is_rejected(self) -> None:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr("secret.json", b"HELLO_SECRET")
        valid = buffer.getvalue()
        broken = valid.replace(b"HELLO_SECRET", b"HELLO_XECRET", 1)
        self.assertNotEqual(valid, broken)
        for payload in (
            broken,
            zip_bytes({"../escape.json": b"{}"}),
            zip_bytes({"/../escape.json": b"{}"}),
            zip_bytes({"//double-slash.json": b"{}"}),
            zip_bytes({"/C:/drive.json": b"{}"}),
        ):
            with self.subTest(payload=payload[:8]), tempfile.TemporaryDirectory() as temp:
                directory = Path(temp)
                source = directory / "incoming.tar"
                output = directory / "private.zip"
                write_tar(source, [("labels.zip.part0", payload, None)])
                result = run_normalizer(source, output)
                self.assertEqual(result.returncode, 2)
                self.assertFalse(output.exists())
                self.assertEqual(sorted(p.name for p in directory.iterdir()), ["incoming.tar"])
                self.assertNotIn("HELLO_SECRET", result.stdout)
                self.assertNotIn("escape.json", result.stdout)

    def test_broken_deflate_returns_fixed_error_without_traceback(self) -> None:
        payload = bytearray(zip_bytes({"secret.json": b"HELLO_SECRET" * 100}))
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            info = archive.infolist()[0]
        offset = info.header_offset
        name_bytes = int.from_bytes(payload[offset + 26 : offset + 28], "little")
        extra_bytes = int.from_bytes(payload[offset + 28 : offset + 30], "little")
        compressed_start = offset + 30 + name_bytes + extra_bytes
        payload[compressed_start : compressed_start + info.compress_size] = b"\xff" * info.compress_size
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            source = directory / "incoming.tar"
            output = directory / "private.zip"
            write_tar(source, [("labels.zip.part0", bytes(payload), None)])
            result = run_normalizer(source, output)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(json.loads(result.stdout)["code"], "invalid_zip")
            self.assertEqual(result.stderr, "")
            self.assertFalse(output.exists())

    def test_relative_paths_are_rejected_without_leaking_paths(self) -> None:
        result = run_normalizer(Path("private-input.tar"), Path("private-output.zip"))
        self.assertEqual(result.returncode, 2)
        self.assertEqual(json.loads(result.stdout)["code"], "expected_absolute_regular_tar")
        self.assertNotIn("private-input.tar", result.stdout)


if __name__ == "__main__":
    unittest.main()
