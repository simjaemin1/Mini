"""Synthetic-only metadata, privacy and boundary checks for Mac MPS pilot."""

from __future__ import annotations

import copy
from contextlib import redirect_stderr, redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import unittest
from unittest import mock

import numpy as np

import mac_mps_ddsp_pilot as pilot


def fixture_documents() -> tuple[dict, str, dict]:
    records = []
    for index in range(1, 8):
        records.append({
            "output_file": f"sample_{index:03d}.wav",
            "output_sha256": hashlib.sha256(f"synthetic-{index}".encode()).hexdigest(),
            "output_bytes": 640044,
            "output_frames": 320000,
            "song_index": index,
        })
    source = {
        "schema": pilot.PREP_SCHEMA,
        "split": "training",
        "cluster_id": "C001",
        "resample": {"sample_rate_hz": 16000, "channels": 1,
                     "bit_depth": 16, "codec": "pcm_s16le"},
        "records": records,
    }
    source_sha = hashlib.sha256(json.dumps(source).encode()).hexdigest()
    split = {
        "schema": pilot.SPLIT_SCHEMA,
        "status": "materialized",
        "cluster_id": "C001",
        "source_manifest_sha256": source_sha,
        "training_wavs": 6,
        "heldout_wavs": 1,
        "training_files": [f"sample_{index:03d}.wav" for index in range(1, 7)],
        "heldout_files": ["sample_007.wav"],
        "heldout_song_indices": [7],
    }
    return source, source_sha, split


class SelectionSafetyTests(unittest.TestCase):
    def test_one_per_train_song_and_no_heldout(self) -> None:
        source, source_sha, split = fixture_documents()
        selected = pilot.select_training_records(source, source_sha, split, clips=5)
        self.assertEqual(len(selected), 5)
        self.assertEqual(len({item["song_index"] for item in selected}), 5)
        self.assertFalse({item["output_file"] for item in selected} & set(split["heldout_files"]))

    def test_refuses_heldout_name_hash_song_and_manifest_mismatch(self) -> None:
        source, source_sha, split = fixture_documents()
        cases = []
        same_name = copy.deepcopy(split)
        same_name["heldout_files"] = ["sample_001.wav"]
        cases.append(same_name)
        same_hash_source = copy.deepcopy(source)
        same_hash_source["records"][6]["output_sha256"] = same_hash_source["records"][0]["output_sha256"]
        with self.assertRaisesRegex(pilot.PilotError, "train_heldout_hash_overlap"):
            pilot.select_training_records(same_hash_source, source_sha, split, clips=5)
        same_song_source = copy.deepcopy(source)
        same_song_source["records"][6]["song_index"] = 1
        with self.assertRaisesRegex(pilot.PilotError, "train_heldout_song_overlap"):
            pilot.select_training_records(same_song_source, source_sha, split, clips=5)
        for modified in cases:
            with self.assertRaises(pilot.PilotError):
                pilot.select_training_records(source, source_sha, modified, clips=5)
        with self.assertRaisesRegex(pilot.PilotError, "split_source_mismatch"):
            pilot.select_training_records(source, "0" * 64, split, clips=5)

    def test_refuses_validation_public_name_and_limits(self) -> None:
        source, source_sha, split = fixture_documents()
        source["split"] = "validation"
        with self.assertRaisesRegex(pilot.PilotError, "training_source_required"):
            pilot.select_training_records(source, source_sha, split, clips=5)
        source["split"] = "training"
        split["training_files"][0] = "../escape.wav"
        with self.assertRaisesRegex(pilot.PilotError, "invalid_audio_name"):
            pilot.select_training_records(source, source_sha, split, clips=5)
        split["training_files"][0] = "sample_001.wav"
        with self.assertRaisesRegex(pilot.PilotError, "clip_limit"):
            pilot.select_training_records(source, source_sha, split, clips=11)


class PrivateBoundaryTests(unittest.TestCase):
    def test_private_path_permission_symlink_and_report_mode(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            root.chmod(0o700)
            path = root / "private.json"
            path.write_text("{}", encoding="utf-8")
            path.chmod(0o600)
            self.assertEqual(pilot._private_file(path, max_bytes=10), b"{}")
            alias = root / "link.json"
            alias.symlink_to(path)
            with self.assertRaisesRegex(pilot.PilotError, "private_file_format"):
                pilot._private_file(alias, max_bytes=10)
            path.chmod(0o644)
            with self.assertRaisesRegex(pilot.PilotError, "private_file_permissions"):
                pilot._private_file(path, max_bytes=10)
            pilot._write_private_report(root, {"status": "synthetic_only"})
            report = root / pilot.REPORT_NAME
            self.assertEqual(report.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(report.read_text())["status"], "synthetic_only")
            with self.assertRaisesRegex(pilot.PilotError, "private_report_already_exists"):
                pilot._write_private_report(root, {})

    def test_private_dir_refuses_repository_and_world_readable(self) -> None:
        with self.assertRaises(pilot.PilotError):
            pilot._private_dir(pilot.REPO_ROOT)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            root.chmod(0o755)
            with self.assertRaisesRegex(pilot.PilotError, "private_directory_permissions"):
                pilot._private_dir(root)

    def test_report_folder_cannot_overlap_audio_or_upstream(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            root.chmod(0o700)
            audio = root / "audio"
            train = audio / "train"
            model = root / "upstream"
            report = root / "pilot_report"
            for directory in (audio, train, model, report):
                directory.mkdir(mode=0o700)
            pilot._check_disjoint_report_dir(report, [audio, train, model])
            for disallowed in (root, audio, train, model):
                with self.assertRaisesRegex(pilot.PilotError, "pilot_report_dir_overlap"):
                    pilot._check_disjoint_report_dir(disallowed, [audio, train, model])

    def test_network_guard_denies_inet_connect_without_connecting(self) -> None:
        with pilot._network_disabled():
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                with self.assertRaisesRegex(pilot.PilotError, "network_disabled"):
                    sock.connect(("127.0.0.1", 9))
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                with self.assertRaisesRegex(pilot.PilotError, "network_disabled"):
                    sock.sendto(b"synthetic", ("127.0.0.1", 9))
                if hasattr(sock, "sendmsg"):
                    with self.assertRaisesRegex(pilot.PilotError, "network_disabled"):
                        sock.sendmsg([b"synthetic"], [], 0, ("127.0.0.1", 9))
            with self.assertRaisesRegex(pilot.PilotError, "network_disabled"):
                socket.create_connection(("127.0.0.1", 9))

    def test_heldout_inode_overlap_is_rejected_without_audio_read(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            root.chmod(0o700)
            train = root / "train"
            heldout = root / "heldout"
            train.mkdir(mode=0o700)
            heldout.mkdir(mode=0o700)
            name = "sample_001.wav"
            train_file = train / name
            train_file.write_bytes(b"synthetic")
            train_file.chmod(0o600)
            os.link(train_file, heldout / "sample_007.wav")
            with self.assertRaisesRegex(pilot.PilotError, "train_heldout_inode_overlap"):
                pilot._exclude_heldout_inodes(
                    train, heldout, ["sample_007.wav"], [{"output_file": name}],
                )

    def test_missing_heldout_error_hides_private_path(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            root.chmod(0o700)
            heldout = root / "SECRET_HELDOUT_NAME"
            heldout.mkdir(mode=0o700)
            with self.assertRaises(pilot.PilotError) as captured:
                pilot._exclude_heldout_inodes(
                    root, heldout, ["sample_007.wav"],
                    [{"output_file": "sample_001.wav"}],
                )
            self.assertEqual(str(captured.exception), "heldout_file_unavailable")
            self.assertNotIn("SECRET", str(captured.exception))

    def test_unexpected_private_feature_error_is_sanitized(self) -> None:
        secret = "/SECRET_PRIVATE_AUDIO/sample_999.wav"
        with mock.patch.object(pilot, "_private_pilot_impl", side_effect=ValueError(secret)):
            with self.assertRaises(pilot.PilotError) as captured:
                pilot.private_pilot(
                    source_manifest=Path(secret), split_manifest=Path(secret),
                    upstream_root=Path(secret), output_dir=Path(secret), clips=5, steps=1,
                )
        self.assertEqual(str(captured.exception), "private_pilot_internal_error")
        self.assertNotIn(secret, str(captured.exception))

    def test_private_cli_error_never_prints_input_path(self) -> None:
        secret = "/SECRET_PRIVATE_AUDIO/sample_999.wav"
        argv = [
            "mac_mps_ddsp_pilot.py", "private",
            "--source-manifest", secret, "--split-manifest", secret,
            "--upstream-root", secret, "--output-dir", secret,
        ]
        output, errors = io.StringIO(), io.StringIO()
        with mock.patch.object(sys, "argv", argv), mock.patch.object(
            pilot, "private_pilot", side_effect=pilot.PilotError("private_pilot_internal_error"),
        ), redirect_stdout(output), redirect_stderr(errors):
            with self.assertRaises(SystemExit) as captured:
                pilot.main()
        self.assertEqual(captured.exception.code, 2)
        self.assertNotIn(secret, output.getvalue() + errors.getvalue())
        self.assertIn("private_pilot_internal_error", output.getvalue())


class WindowTests(unittest.TestCase):
    def test_four_second_generated_tone_is_one_model_window(self) -> None:
        t = np.arange(pilot.WINDOW_SAMPLES) / pilot.SAMPLE_RATE
        tone = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        item = pilot.choose_window(tone)
        self.assertEqual(item["samples"].shape, (64000,))
        self.assertEqual(item["pitch_hz"].shape, (400,))
        self.assertEqual(item["loudness"].shape, (400,))
        self.assertGreater(item["voiced_fraction"], 0.75)


if __name__ == "__main__":
    unittest.main()
