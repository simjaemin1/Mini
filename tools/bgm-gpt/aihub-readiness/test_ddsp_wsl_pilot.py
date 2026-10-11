"""Synthetic-only checks for the private WSL DDSP gates."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import wave


MODULE_PATH = Path(__file__).with_name("ddsp_wsl_pilot.py")
SPEC = importlib.util.spec_from_file_location("ddsp_wsl_pilot", MODULE_PATH)
assert SPEC and SPEC.loader
pilot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pilot)


def _fixture(root: Path) -> tuple[Path, Path]:
    source = root / "private_audio"
    source.mkdir(mode=0o700)
    source.chmod(0o700)
    records = []
    for number in range(1, 9):
        name = f"sample_{number:03d}.wav"
        path = source / name
        frames = number * 16000
        with wave.open(str(path), "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(16000)
            audio.writeframes(b"\x00\x00" * frames)
        path.chmod(0o600)
        records.append({
            "output_file": name,
            "output_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "output_bytes": path.stat().st_size,
            "output_frames": frames,
            "song_index": number,
        })
    manifest = source / "private_manifest.json"
    manifest.write_text(json.dumps({
        "schema": pilot.PREP_SCHEMA,
        "split": "training",
        "cluster_id": "C001",
        "resample": {
            "sample_rate_hz": 16000, "channels": 1,
            "bit_depth": 16, "codec": "pcm_s16le",
        },
        "records": records,
    }), encoding="utf-8")
    manifest.chmod(0o600)
    return source, manifest


class SongSplitTests(unittest.TestCase):
    def test_dry_run_and_materialization_keep_entire_songs_held_out(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            root.chmod(0o700)
            source, manifest = _fixture(root)
            output = root / "partition"
            preview = pilot.split(manifest, output)
            self.assertEqual(preview["status"], "ready")
            self.assertFalse(output.exists())
            completed = pilot.split(manifest, output, materialize=True)
            self.assertEqual(completed["status"], "materialized")
            self.assertEqual(completed["training_wavs"] + completed["heldout_wavs"], 8)
            self.assertEqual((output / "train").stat().st_mode & 0o777, 0o700)
            self.assertEqual((output / "private_split.json").stat().st_mode & 0o777, 0o600)
            detail = json.loads((output / "private_split.json").read_text())
            self.assertEqual(
                set(detail["training_files"]) | set(detail["heldout_files"]),
                {f"sample_{number:03d}.wav" for number in range(1, 9)},
            )
            self.assertFalse(set(detail["training_files"]) & set(detail["heldout_files"]))
            for name in detail["training_files"]:
                self.assertEqual((output / "train" / name).stat().st_ino, (source / name).stat().st_ino)
            with self.assertRaisesRegex(pilot.PilotError, "output_must_be_new"):
                pilot.split(manifest, output, materialize=True)

    def test_hash_tamper_and_validation_source_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            root.chmod(0o700)
            source, manifest = _fixture(root)
            data = json.loads(manifest.read_text())
            data["split"] = "validation"
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(pilot.PilotError, "training_source_required"):
                pilot.split(manifest, root / "partition")
            data["split"] = "training"
            manifest.write_text(json.dumps(data))
            wav = source / "sample_001.wav"
            with wav.open("r+b") as handle:
                handle.seek(-1, 2)
                handle.write(b"\x01")
            with self.assertRaisesRegex(pilot.PilotError, "private_audio_hash_mismatch"):
                pilot.split(manifest, root / "partition")

    def test_duplicate_record_and_public_output_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            root.chmod(0o700)
            _, manifest = _fixture(root)
            with self.assertRaisesRegex(pilot.PilotError, "private_output_path_required"):
                pilot.split(manifest, pilot.REPO_ROOT / "public")
            data = json.loads(manifest.read_text())
            data["records"].append(data["records"][0])
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(pilot.PilotError, "duplicate_private_audio_record"):
                pilot.split(manifest, root / "partition")

    def test_duplicate_audio_hash_cannot_cross_song_holdout(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            root.chmod(0o700)
            source, manifest = _fixture(root)
            first = (source / "sample_001.wav").read_bytes()
            second = source / "sample_002.wav"
            second.write_bytes(first)
            second.chmod(0o600)
            data = json.loads(manifest.read_text())
            data["records"][1]["output_sha256"] = data["records"][0]["output_sha256"]
            data["records"][1]["output_bytes"] = data["records"][0]["output_bytes"]
            data["records"][1]["output_frames"] = data["records"][0]["output_frames"]
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(pilot.PilotError, "duplicate_private_audio_hash"):
                pilot.split(manifest, root / "partition")

    def test_song_group_gate_requires_multiple_groups(self) -> None:
        with self.assertRaisesRegex(pilot.PilotError, "insufficient_song_groups"):
            pilot._choose_heldout_songs({1: 100, 2: 100})
        with self.assertRaisesRegex(pilot.PilotError, "song_group_limit"):
            pilot._choose_heldout_songs({n: 100 for n in range(1, pilot.MAX_SONG_GROUPS + 2)})

    def test_swapped_hardlink_is_rejected_and_new_output_cleaned(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            root.chmod(0o700)
            source, manifest = _fixture(root)
            output = root / "partition"
            wrong = root / "wrong.wav"
            payload = bytearray((source / "sample_001.wav").read_bytes())
            payload[-1] ^= 1
            wrong.write_bytes(payload)
            wrong.chmod(0o600)
            real_link = os.link

            def switched_link(src: object, dst: object, *, follow_symlinks: bool = True) -> None:
                real_link(wrong if Path(src).name == "sample_001.wav" else src,
                          dst, follow_symlinks=follow_symlinks)

            with mock.patch.object(pilot.os, "link", side_effect=switched_link):
                with self.assertRaisesRegex(pilot.PilotError, "private_link_hash_mismatch"):
                    pilot.split(manifest, output, materialize=True)
            self.assertFalse(output.exists())


class EnvironmentTests(unittest.TestCase):
    def test_non_wsl_cannot_be_reported_ready(self) -> None:
        with mock.patch.object(pilot.platform, "system", return_value="Darwin"):
            with self.assertRaisesRegex(pilot.PilotError, "wsl2_linux_required"):
                pilot.environment()


if __name__ == "__main__":
    unittest.main()
