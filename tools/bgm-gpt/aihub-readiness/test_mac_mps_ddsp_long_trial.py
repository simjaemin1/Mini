"""Synthetic-only privacy, split, window and checkpoint tests; no AI Hub audio."""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import wave

import numpy as np

import mac_mps_ddsp_long_trial as trial


def documents() -> tuple[dict, str, dict]:
    records = []
    for index in range(250):
        heldout = index >= 216
        song = 100 + (index - 216) % 4 if heldout else 1 + index % 15
        records.append({
            "output_file": f"sample_{index + 1:03d}.wav",
            "output_sha256": hashlib.sha256(f"synthetic-{index}".encode()).hexdigest(),
            "output_bytes": 640044,
            "output_frames": 320000,
            "song_index": song,
        })
    source = {
        "schema": trial.pilot.PREP_SCHEMA,
        "split": "training", "cluster_id": "C001",
        "resample": {"sample_rate_hz": 16000, "channels": 1,
                     "bit_depth": 16, "codec": "pcm_s16le"},
        "records": records,
    }
    source_sha = hashlib.sha256(json.dumps(source).encode()).hexdigest()
    split = {
        "schema": trial.pilot.SPLIT_SCHEMA, "status": "materialized",
        "cluster_id": "C001", "source_manifest_sha256": source_sha,
        "training_wavs": 216, "heldout_wavs": 34,
        "training_song_groups": 15, "heldout_song_groups": 4,
        "training_files": [record["output_file"] for record in records[:216]],
        "heldout_files": [record["output_file"] for record in records[216:]],
        "heldout_song_indices": [100, 101, 102, 103],
    }
    return source, source_sha, split


def generated_tone(seconds: int = 16, *, onset_seconds: int = 0) -> np.ndarray:
    t = np.arange(seconds * 16000, dtype=np.float64) / 16000
    audio = (0.08 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    audio[:onset_seconds * 16000] = 0
    return audio


class SplitContractTests(unittest.TestCase):
    def test_exact_216_34_song_split_and_balanced_limit(self) -> None:
        source, sha, split = documents()
        training, heldout = trial.validate_documents(source, sha, split)
        self.assertEqual((len(training), len(heldout)), (216, 34))
        selected = trial._balanced_training_records(training, 15)
        self.assertEqual(len({item["song_index"] for item in selected}), 15)
        self.assertFalse({item["output_file"] for item in selected} & set(split["heldout_files"]))
        self.assertEqual(len(trial._balanced_training_records(training, 216)), 216)

    def test_rejects_heldout_song_hash_name_and_source_mismatch(self) -> None:
        source, sha, split = documents()
        mismatch = copy.deepcopy(split)
        mismatch["source_manifest_sha256"] = "0" * 64
        with self.assertRaisesRegex(trial.TrialError, "split_source_mismatch"):
            trial.validate_documents(source, sha, mismatch)
        same_song = copy.deepcopy(source)
        same_song["records"][216]["song_index"] = 1
        with self.assertRaisesRegex(trial.TrialError, "train_heldout_song_overlap"):
            trial.validate_documents(same_song, sha, split)
        same_hash = copy.deepcopy(source)
        same_hash["records"][216]["output_sha256"] = same_hash["records"][0]["output_sha256"]
        with self.assertRaisesRegex(trial.TrialError, "record_invalid"):
            trial.validate_documents(same_hash, sha, split)
        same_name = copy.deepcopy(split)
        same_name["heldout_files"][0] = same_name["training_files"][0]
        with self.assertRaisesRegex(trial.TrialError, "train_heldout_name_overlap"):
            trial.validate_documents(source, sha, same_name)

    def test_refuses_wrong_dataset_or_excess_clip_request(self) -> None:
        source, sha, split = documents()
        source["cluster_id"] = "C002"
        with self.assertRaisesRegex(trial.TrialError, "approved_cluster_required"):
            trial.validate_documents(source, sha, split)
        source["cluster_id"] = "C001"
        with self.assertRaisesRegex(trial.TrialError, "clip_limit"):
            trial._balanced_training_records(source["records"][:216], 217)


class AcousticWindowTests(unittest.TestCase):
    def test_three_nonoverlapping_four_second_windows(self) -> None:
        windows = trial.select_nonoverlapping_windows(generated_tone(16))
        self.assertEqual(len(windows), 3)
        for item in windows:
            self.assertEqual(item["samples"].shape, (64000,))
            self.assertEqual(item["pitch_hz"].shape, (400,))
            self.assertEqual(item["loudness"].shape, (400,))
            self.assertGreater(float(np.mean(item["mask"])), 0.75)
        # A 440 Hz stationary tone is periodic; disjointness is enforced by
        # the start-index selection, not by comparing identical samples.

    def test_quiet_to_active_proxy_and_leakage_metric(self) -> None:
        audio = generated_tone(8, onset_seconds=2)
        item = trial.select_rest_reattack_proxy_window(audio)
        self.assertIsNotNone(item)
        self.assertEqual(item["samples"].shape, (64000,))
        source = np.zeros(64000, dtype=np.float32)
        rendered = source.copy()
        rendered[:16000] = 0.02
        quiet, leaking = trial.quiet_leakage_counts(source, rendered)
        self.assertEqual(quiet, 400)
        self.assertEqual(leaking, 100)

    def test_private_pair_matches_rms_and_length_without_clipping(self) -> None:
        source = generated_tone(4)
        reconstruction = source * 0.5
        left, right, levels = trial._matched_pair(source, reconstruction)
        self.assertEqual(left.shape, right.shape)
        self.assertLess(np.max(np.abs(left)), 0.91)
        self.assertLess(np.max(np.abs(right)), 0.91)
        rms_left = float(np.sqrt(np.mean(left.astype(np.float64) ** 2)))
        rms_right = float(np.sqrt(np.mean(right.astype(np.float64) ** 2)))
        self.assertAlmostEqual(rms_left, rms_right, places=6)
        self.assertGreaterEqual(rms_left, 0.0349)
        self.assertIn("original_rms_dbfs", levels)
        self.assertIn("reconstruction_gain_db", levels)
        payload = trial._wav_bytes(right)
        with wave.open(io.BytesIO(payload), "rb") as audio:
            self.assertEqual(audio.getnframes(), 64000)
            self.assertEqual(audio.getframerate(), 16000)
        with self.assertRaisesRegex(trial.TrialError, "listening_pair_too_quiet"):
            trial._matched_pair(source, np.zeros_like(source))
        with self.assertRaisesRegex(trial.TrialError, "cannot_match_audibly"):
            trial._matched_pair(source, source * 0.001)
        chosen = trial._first_audible_pair([
            (source, source * 0.001), (source, reconstruction),
        ])
        self.assertIsNotNone(chosen)
        self.assertGreaterEqual(float(np.sqrt(np.mean(chosen[1] ** 2))), 0.0349)


class PrivateOutputTests(unittest.TestCase):
    @unittest.skipUnless(importlib.util.find_spec("torch") is not None,
                         "synthetic torch checkpoint test requires torch")
    def test_nonfinite_model_or_optimizer_state_is_never_saved(self) -> None:
        import torch

        model = torch.nn.Linear(2, 1)
        model.weight.grad = torch.tensor([[float("nan"), 0.0]])
        model.bias.grad = torch.tensor([0.0])
        with self.assertRaisesRegex(trial.TrialError, "nonfinite_gradient"):
            trial._assert_model_finite(torch, model, gradients=True)
        model.weight.grad.fill_(0.0)
        with torch.no_grad():
            model.bias.fill_(float("nan"))
        with self.assertRaisesRegex(trial.TrialError, "nonfinite_parameter"):
            trial._assert_model_finite(torch, model, gradients=False)
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            folder.chmod(0o700)
            payload = {"model_state": {"weight": torch.tensor([1.0])},
                       "optimizer_state": {"bad": torch.tensor([float("nan")])}}
            with self.assertRaisesRegex(trial.TrialError, "nonfinite_checkpoint_state"):
                trial._save_checkpoint(folder, torch, payload, 1)
            self.assertEqual(os.listdir(folder), [])

    def test_evaluation_report_and_pairs_commit_together_after_retry(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            folder.chmod(0o700)
            pair = [("pair_01_source_input_16k.wav", trial._wav_bytes(generated_tone(4)))]
            report = {"status": "synthetic_only"}
            with mock.patch.object(trial, "_write_json", side_effect=OSError("synthetic crash")):
                with self.assertRaises(OSError):
                    trial._commit_evaluation_result(folder, report, pair)
            self.assertFalse((folder / "result").exists())
            self.assertTrue(any(name.startswith(".pending_eval_") for name in os.listdir(folder)))
            trial._commit_evaluation_result(folder, report, pair)
            self.assertTrue((folder / "result" / "heldout_report.json").exists())
            self.assertTrue((folder / "result" / "pairs" / "pair_01_source_input_16k.wav").exists())
            self.assertEqual((folder / "result" / "heldout_report.json").stat().st_mode & 0o777, 0o600)
            self.assertEqual((folder / "result" / "pairs" / "pair_01_source_input_16k.wav").stat().st_mode & 0o777, 0o600)
            with self.assertRaisesRegex(trial.TrialError, "evaluation_output_already_committed"):
                trial._commit_evaluation_result(folder, report, pair)

    def test_private_manifest_audio_hashes_and_permissions_are_gated(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            root.chmod(0o700)
            source_dir = root / "source"
            split_dir = root / "split"
            train_dir = split_dir / "train"
            heldout_dir = split_dir / "heldout"
            output_dir = root / "checkpoint"
            upstream_dir = root / "upstream"
            for directory in (source_dir, split_dir, train_dir, heldout_dir,
                              output_dir, upstream_dir):
                directory.mkdir(mode=0o700)
            tone = generated_tone(4)
            payload = trial._wav_bytes(tone)
            records = []
            for index in range(6):
                name = f"sample_{index + 1:03d}.wav"
                folder = train_dir if index < 5 else heldout_dir
                path = folder / name
                path.write_bytes(payload if index == 0 else bytes(payload[:-2]) + index.to_bytes(2, "little"))
                path.chmod(0o600)
                records.append({
                    "output_file": name,
                    "output_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "output_bytes": path.stat().st_size,
                    "output_frames": 64000,
                    "song_index": index + 1,
                })
            source = {"schema": trial.pilot.PREP_SCHEMA, "split": "training",
                      "cluster_id": "C001",
                      "resample": {"sample_rate_hz": 16000, "channels": 1,
                                   "bit_depth": 16, "codec": "pcm_s16le"},
                      "records": records}
            source_bytes = json.dumps(source).encode()
            source_path = source_dir / "private_manifest.json"
            source_path.write_bytes(source_bytes)
            source_path.chmod(0o600)
            split = {"schema": trial.pilot.SPLIT_SCHEMA, "status": "materialized",
                     "cluster_id": "C001",
                     "source_manifest_sha256": hashlib.sha256(source_bytes).hexdigest(),
                     "training_wavs": 5, "heldout_wavs": 1,
                     "training_song_groups": 5, "heldout_song_groups": 1,
                     "training_files": [item["output_file"] for item in records[:5]],
                     "heldout_files": [records[5]["output_file"]],
                     "heldout_song_indices": [6]}
            split_path = split_dir / "private_split.json"
            split_path.write_text(json.dumps(split))
            split_path.chmod(0o600)
            small = {
                "SOURCE_RECORDS": 6, "TRAIN_RECORDS": 5, "HELDOUT_RECORDS": 1,
                "TRAIN_SONGS": 5, "HELDOUT_SONGS": 1,
            }
            with mock.patch.multiple(trial, **small):
                _, _, _, _, verified_train, verified_heldout = trial._private_inputs(
                    source_path, split_path, output_dir, upstream_dir)
                self.assertEqual((verified_train, verified_heldout),
                                 (train_dir.resolve(), heldout_dir.resolve()))
                (heldout_dir / "sample_006.wav").chmod(0o644)
                with self.assertRaisesRegex(trial.split_gate.PilotError, "private_audio_permissions"):
                    trial._private_inputs(source_path, split_path, output_dir, upstream_dir)
                (heldout_dir / "sample_006.wav").chmod(0o600)
                with (heldout_dir / "sample_006.wav").open("r+b") as handle:
                    handle.seek(-1, os.SEEK_END)
                    handle.write(b"Z")
                with self.assertRaisesRegex(trial.split_gate.PilotError, "private_audio_hash_mismatch"):
                    trial._private_inputs(source_path, split_path, output_dir, upstream_dir)

    def test_atomic_0600_output_and_latest_complete_checkpoint(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            folder.chmod(0o700)
            trial._atomic_private_bytes(folder, "aggregate.json", b"{}", replace=False)
            self.assertEqual((folder / "aggregate.json").stat().st_mode & 0o777, 0o600)
            with self.assertRaisesRegex(trial.TrialError, "private_output_exists"):
                trial._atomic_private_bytes(folder, "aggregate.json", b"bad", replace=False)
            trial._atomic_private_bytes(folder, "aggregate.json", b'{"step": 1}', replace=True)
            self.assertEqual((folder / "aggregate.json").read_bytes(), b'{"step": 1}')
            payload = b"synthetic-checkpoint-without-audio"
            digest = hashlib.sha256(payload).hexdigest()
            name = f"checkpoint_step_000100_{digest[:12]}.pt"
            trial._atomic_private_bytes(folder, name, payload, replace=False)
            marker = {"schema": trial.SCHEMA, "step": 100,
                      "checkpoint_file": name, "sha256": digest}
            trial._write_json(folder, "checkpoint_step_000100.json", marker, replace=False)
            # A crash can leave an uncommitted checkpoint; it must be ignored.
            trial._atomic_private_bytes(folder, "checkpoint_step_000200_orphan.pt",
                                        b"orphan", replace=False)
            found, path = trial._checkpoint_marker(folder)
            self.assertEqual(found["step"], 100)
            self.assertEqual(path.name, name)
            with path.open("r+b") as output:
                output.write(b"X")
            with self.assertRaisesRegex(trial.TrialError, "checkpoint_hash_mismatch"):
                trial._checkpoint_marker(folder)

    def test_non_private_error_cannot_reveal_secret_path(self) -> None:
        secret = "/SECRET_AI_HUB_PRIVATE/sample_999.wav"
        def boom(**_kwargs):
            raise RuntimeError(secret)
        with self.assertRaises(trial.TrialError) as captured:
            trial.safe_private_call(boom)
        self.assertEqual(str(captured.exception), "private_long_trial_internal_error")
        self.assertNotIn(secret, str(captured.exception))

    def test_mps_fallback_forbidden_before_model_import(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            folder.chmod(0o700)
            with mock.patch.object(trial.platform, "system", return_value="Darwin"), \
                 mock.patch.object(trial.platform, "machine", return_value="arm64"), \
                 mock.patch.dict(os.environ, {"PYTORCH_ENABLE_MPS_FALLBACK": "1"}):
                with self.assertRaisesRegex(trial.TrialError, "mps_fallback_forbidden"):
                    trial._mac_mps_gate(folder, folder)


if __name__ == "__main__":
    unittest.main()
