"""Synthetic-only safety tests for private, selective AI Hub WAV preparation."""

from __future__ import annotations

import io
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import wave
import zipfile


SCRIPT = Path(__file__).with_name("prepare_selected_audio.py")
sys.path.insert(0, str(SCRIPT.parent))
import prepare_selected_audio as prep  # noqa: E402


def _wav_bytes(*, channels: int = 1, rate: int = 44_100) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        frame = struct.pack("<h", 6000) * channels
        handle.writeframes(frame * (rate // 5))
    return output.getvalue()


def _wav24_with_partial_frame() -> bytes:
    rate = 48_000
    samples = rate // 5
    payload = b"\x00\x10\x00" * samples + b"\x00"
    fmt = struct.pack("<HHIIHH", 1, 1, rate, rate * 3, 3, 24)
    chunks = b"fmt " + struct.pack("<I", len(fmt)) + fmt
    chunks += b"data" + struct.pack("<I", len(payload)) + payload + b"\x00"
    return b"RIFF" + struct.pack("<I", len(chunks) + 4) + b"WAVE" + chunks


def _wav24_with_unpadded_metadata() -> bytes:
    rate = 48_000
    payload = b"\x00\x10\x00" * (rate // 5) + b"\x00"
    fmt = struct.pack("<HHIIHH", 1, 1, rate, rate * 3, 3, 24)
    chunks = b"fmt " + struct.pack("<I", len(fmt)) + fmt
    chunks += b"data" + struct.pack("<I", len(payload)) + payload
    chunks += b"iXML" + struct.pack("<I", 4) + b"test"
    return b"RIFF" + struct.pack("<I", len(chunks) + 4) + b"WAVE" + chunks


def _archive(path: Path, members: list[tuple[str, bytes]]) -> None:
    zip_output = io.BytesIO()
    with zipfile.ZipFile(zip_output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in members:
            archive.writestr(name, content)
    payload = zip_output.getvalue()
    with tarfile.open(path, "w") as archive:
        part = tarfile.TarInfo("source.zip.part0")
        part.size = len(payload)
        archive.addfile(part, io.BytesIO(payload))


def _manifest(path: Path, stems: list[str], *, split: str = "training") -> None:
    document = {
        "schema": "mini.aihub-71470-daegeum-clusters.v1",
        "split": split,
        "clusters": [{
            "cluster_id": "C001", "performer": "private performer", "place": "private place",
            "channel": "private channel", "total_seconds": 0.2 * len(stems),
            "songs": [{
                "title": "private song", "records": [{
                    "stem": stem, "duration_seconds": 0.2, "sample_rate_hz": 44_100,
                    "bit_depth": 16, "source_format": "wav",
                } for stem in stems],
            }],
        }],
    }
    path.write_text(json.dumps(document), encoding="utf-8")
    path.chmod(0o600)


def _run(source: Path, manifest: Path, output: Path, materialize: bool = False) -> subprocess.CompletedProcess[str]:
    command = [
        sys.executable, str(SCRIPT), "--tar", str(source), "--manifest", str(manifest),
        "--cluster-id", "C001", "--output-dir", str(output),
    ]
    if materialize:
        command.append("--materialize")
    return subprocess.run(command, capture_output=True, text=True, check=False)


class PrepareSelectedAudioTests(unittest.TestCase):
    def test_split_byte_offset_tars_are_read_without_reassembly(self) -> None:
        if shutil.which("ffprobe") is None:
            self.skipTest("ffprobe required")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            first, second = root / "first.tar", root / "second.tar"
            manifest = root / "clusters.json"
            private_parent = root / "private"
            private_parent.mkdir(mode=0o700)
            output = private_parent / "new-prep"
            zipped = io.BytesIO()
            with zipfile.ZipFile(zipped, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("data/private_stem.wav", _wav_bytes())
            payload = zipped.getvalue()
            cut = len(payload) // 2
            for path, suffix, part in ((first, 0, payload[:cut]), (second, cut, payload[cut:])):
                with tarfile.open(path, "w") as archive:
                    member = tarfile.TarInfo(f"source.zip.part{suffix}")
                    member.size = len(part)
                    archive.addfile(member, io.BytesIO(part))
            _manifest(manifest, ["private_stem"])
            result = prep.prepare([second, first], manifest, "C001", output)
            self.assertEqual(result["status"], "ready")
            self.assertFalse(output.exists())

    def test_default_is_read_only_and_materialization_is_private_mono_pcm16(self) -> None:
        if shutil.which("ffprobe") is None or shutil.which("ffmpeg") is None:
            self.skipTest("ffmpeg and ffprobe are required for audio verification")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.tar"
            manifest = root / "clusters.json"
            private_parent = root / "private"
            private_parent.mkdir(mode=0o700)
            output = private_parent / "new-prep"
            _archive(source, [("/data/a/private_stem.wav", _wav_bytes())])
            _manifest(manifest, ["private_stem"])
            dry = _run(source, manifest, output)
            self.assertEqual(dry.returncode, 0, dry.stderr + dry.stdout)
            self.assertFalse(output.exists())
            self.assertEqual(json.loads(dry.stdout)["records"], 1)
            self.assertNotIn("private_stem", dry.stdout + dry.stderr)
            self.assertNotIn("private performer", dry.stdout + dry.stderr)

            made = _run(source, manifest, output, materialize=True)
            self.assertEqual(made.returncode, 0, made.stderr + made.stdout)
            self.assertNotIn("private_stem", made.stdout + made.stderr)
            self.assertEqual(os.stat(output).st_mode & 0o777, 0o700)
            wav = output / "sample_001.wav"
            private_json = output / "private_manifest.json"
            self.assertEqual(os.stat(wav).st_mode & 0o777, 0o600)
            self.assertEqual(os.stat(private_json).st_mode & 0o777, 0o600)
            with wave.open(str(wav), "rb") as audio:
                self.assertEqual((audio.getnchannels(), audio.getframerate(), audio.getsampwidth()), (1, 16000, 2))
                self.assertGreater(audio.getnframes(), 1000)
            record = json.loads(private_json.read_text(encoding="utf-8"))["records"][0]
            self.assertEqual(record["source_stem"], "private_stem")
            self.assertEqual(record["original"]["sample_rate_hz"], 44100)
            self.assertEqual(record["original"]["bit_depth"], 16)

    def test_no_overwrite_of_existing_output(self) -> None:
        if shutil.which("ffprobe") is None:
            self.skipTest("ffprobe required")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.tar"
            manifest = root / "clusters.json"
            output = root / "already-here"
            output.mkdir(mode=0o700)
            marker = output / "keep.txt"
            marker.write_text("do not touch")
            _archive(source, [("private_stem.wav", _wav_bytes())])
            _manifest(manifest, ["private_stem"])
            result = _run(source, manifest, output, materialize=True)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(json.loads(result.stdout)["code"], "output_must_be_new_absolute_directory")
            self.assertEqual(marker.read_text(), "do not touch")

    def test_traversal_ambiguous_basename_and_stereo_are_rejected(self) -> None:
        if shutil.which("ffprobe") is None:
            self.skipTest("ffprobe required")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.tar"
            manifest = root / "clusters.json"
            private_parent = root / "private"
            private_parent.mkdir(mode=0o700)
            output = private_parent / "new-prep"
            _archive(source, [("ok.wav", _wav_bytes())])
            _manifest(manifest, ["../bad"])
            result = _run(source, manifest, output)
            self.assertEqual(json.loads(result.stdout)["code"], "invalid_source_stem")
            self.assertFalse(output.exists())

            _manifest(manifest, ["private_stem"])
            _archive(source, [("a/private_stem.wav", _wav_bytes()), ("b/private_stem.wav", _wav_bytes())])
            result = _run(source, manifest, output)
            self.assertEqual(json.loads(result.stdout)["code"], "selected_wav_missing_or_ambiguous")
            self.assertNotIn("private_stem", result.stdout + result.stderr)
            self.assertFalse(output.exists())

            _archive(source, [("private_stem.wav", _wav_bytes(channels=2))])
            result = _run(source, manifest, output)
            self.assertEqual(json.loads(result.stdout)["code"], "mono_source_required")
            self.assertFalse(output.exists())

    def test_training_only_disk_preflight_and_output_outside_repository(self) -> None:
        if shutil.which("ffprobe") is None:
            self.skipTest("ffprobe required")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.tar"
            manifest = root / "clusters.json"
            parent = root / "private"
            parent.mkdir(mode=0o700)
            output = parent / "prepared"
            _archive(source, [("private_stem.wav", _wav_bytes())])
            _manifest(manifest, ["private_stem"], split="validation")
            result = _run(source, manifest, output)
            self.assertEqual(json.loads(result.stdout)["code"], "training_split_required")
            _manifest(manifest, ["private_stem"])
            with patch.object(prep.shutil, "disk_usage", return_value=shutil._ntuple_diskusage(100, 100, 0)):
                with self.assertRaisesRegex(prep.PreparationError, "insufficient_private_disk_space"):
                    prep.prepare([source], manifest, "C001", output)
            self.assertFalse(output.exists())
            inside_repo = prep.REPO_ROOT / "synthetic-should-never-exist"
            with self.assertRaisesRegex(prep.PreparationError, "private_parent_permissions|output_inside_repository"):
                prep.prepare([source], manifest, "C001", inside_repo)

    def test_label_duration_is_checked_before_materialization(self) -> None:
        if shutil.which("ffprobe") is None:
            self.skipTest("ffprobe required")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, manifest = root / "source.tar", root / "clusters.json"
            parent = root / "private"
            parent.mkdir(mode=0o700)
            output = parent / "prepared"
            _archive(source, [("private_stem.wav", _wav_bytes())])
            _manifest(manifest, ["private_stem"])
            document = json.loads(manifest.read_text(encoding="utf-8"))
            document["clusters"][0]["songs"][0]["records"][0]["duration_seconds"] = 0.4
            manifest.write_text(json.dumps(document), encoding="utf-8")
            result = _run(source, manifest, output)
            self.assertEqual(json.loads(result.stdout)["code"], "label_source_duration_mismatch")
            self.assertFalse(output.exists())

    def test_one_partial_24bit_frame_does_not_discard_valid_recording(self) -> None:
        if shutil.which("ffprobe") is None:
            self.skipTest("ffprobe required")
        data = _wav24_with_partial_frame()
        self.assertEqual(prep._riff_pcm_metadata(data), (1, 48_000, 24, 0.2, 1))
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, manifest = root / "source.tar", root / "clusters.json"
            parent = root / "private"
            parent.mkdir(mode=0o700)
            output = parent / "prepared"
            _archive(source, [("private_stem.wav", data)])
            _manifest(manifest, ["private_stem"])
            document = json.loads(manifest.read_text(encoding="utf-8"))
            record = document["clusters"][0]["songs"][0]["records"][0]
            record["sample_rate_hz"], record["bit_depth"] = 48_000, 24
            manifest.write_text(json.dumps(document), encoding="utf-8")
            result = _run(source, manifest, output)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertFalse(output.exists())

    def test_unpadded_trailing_metadata_is_tolerated(self) -> None:
        self.assertEqual(
            prep._riff_pcm_metadata(_wav24_with_unpadded_metadata()),
            (1, 48_000, 24, 0.2, 1),
        )

    def test_canonical_validation_source_cannot_enter_training_prep(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, manifest = root / "VS_R_validation.tar", root / "clusters.json"
            parent = root / "private"
            parent.mkdir(mode=0o700)
            output = parent / "prepared"
            _archive(source, [("private_stem.wav", _wav_bytes())])
            _manifest(manifest, ["private_stem"])
            result = _run(source, manifest, output)
            self.assertEqual(json.loads(result.stdout)["code"], "training_source_tar_required")
            self.assertFalse(output.exists())

    def test_failed_exclusive_create_does_not_delete_another_files_wav(self) -> None:
        if shutil.which("ffprobe") is None:
            self.skipTest("ffprobe required")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, manifest = root / "source.tar", root / "clusters.json"
            parent = root / "private"
            parent.mkdir(mode=0o700)
            output = parent / "prepared"
            _archive(source, [("private_stem.wav", _wav_bytes())])
            _manifest(manifest, ["private_stem"])
            real_open = os.open

            def conflicting_create(path: object, flags: int, mode: int = 0o777) -> int:
                if Path(path).resolve() == (output / "sample_001.wav").resolve() and flags & os.O_EXCL:
                    other_fd = real_open(path, flags, mode)
                    os.write(other_fd, b"other-owner")
                    os.close(other_fd)
                    raise FileExistsError("synthetic output race")
                return real_open(path, flags, mode)

            with patch.object(prep.os, "open", side_effect=conflicting_create):
                with self.assertRaises(prep.PreparationError):
                    prep.prepare([source], manifest, "C001", output, materialize=True)
            self.assertEqual((output / "sample_001.wav").read_bytes(), b"other-owner")


if __name__ == "__main__":
    unittest.main()
