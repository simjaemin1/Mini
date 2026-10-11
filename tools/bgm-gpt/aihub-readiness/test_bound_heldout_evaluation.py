"""Synthetic metadata and checkpoint-binding tests; no licensed audio or GPU."""

from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest import mock
import wave

import bound_heldout_evaluation as bound
import mac_mps_ddsp_long_trial as trial
import mac_mps_ddsp_pilot as pilot


def _write_private(path: Path, payload: bytes) -> None:
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "wb") as sink:
        sink.write(payload)


def _json_bytes(value: dict) -> bytes:
    return (json.dumps(value, sort_keys=True, ensure_ascii=False) + "\n").encode()


class SyntheticFixture:
    def __init__(self, root: Path):
        self.root = root
        self.source_dir = self._dir("source")
        self.split_dir = self._dir("split")
        self._dir("split/train")
        self._dir("split/heldout")
        self.upstream = self._dir("upstream")
        self.checkpoints = self._dir("checkpoints")
        self.output = self._dir("evaluation")
        self.source_manifest = self.source_dir / "manifest.json"
        self.split_manifest = self.split_dir / "split.json"
        records = []
        for index in range(250):
            heldout = index >= 216
            song = 100 + (index - 216) % 4 if heldout else 1 + index % 15
            records.append({
                "output_file": f"sample_{index + 1:03d}.wav",
                "output_sha256": hashlib.sha256(f"synthetic-{index}".encode()).hexdigest(),
                "output_bytes": 640_044,
                "output_frames": 320_000,
                "song_index": song,
            })
        source = {
            "schema": pilot.PREP_SCHEMA, "split": "training", "cluster_id": "C001",
            "resample": {"sample_rate_hz": 16000, "channels": 1,
                         "bit_depth": 16, "codec": "pcm_s16le"},
            "records": records,
        }
        source_payload = _json_bytes(source)
        self.source_sha = hashlib.sha256(source_payload).hexdigest()
        _write_private(self.source_manifest, source_payload)
        split = {
            "schema": pilot.SPLIT_SCHEMA, "status": "materialized",
            "cluster_id": "C001", "source_manifest_sha256": self.source_sha,
            "training_wavs": 216, "heldout_wavs": 34,
            "training_song_groups": 15, "heldout_song_groups": 4,
            "training_files": [item["output_file"] for item in records[:216]],
            "heldout_files": [item["output_file"] for item in records[216:]],
            "heldout_song_indices": [100, 101, 102, 103],
        }
        split_payload = _json_bytes(split)
        self.split_sha = hashlib.sha256(split_payload).hexdigest()
        _write_private(self.split_manifest, split_payload)
        self.contract = {
            "schema": trial.SCHEMA,
            "step": bound.EXPECTED_STEP,
            "source_manifest_sha256": self.source_sha,
            "split_manifest_sha256": self.split_sha,
            "feature_sha256": trial.FEATURE_SHA256,
            "script_sha256": bound._script_digest(),
            "dataset_digest": "a" * 64,
            "upstream_commit": pilot.UPSTREAM_SHA,
            "conditioning": trial.CONDITIONING,
            "model_config": trial.MODEL_CONFIG,
            "clips_requested": 216,
            "windows": 500,
            "loudness_mean": -27.5,
            "loudness_std": 1.25,
        }
        self.checkpoint_sha = self.set_checkpoint(b"synthetic-checkpoint-bytes")
        training_report = {
            "schema": trial.SCHEMA, "status": "bounded_trial_completed",
            "steps_completed": bound.EXPECTED_STEP,
            "source_manifest_sha256": self.source_sha,
            "split_manifest_sha256": self.split_sha,
            "feature_sha256": trial.FEATURE_SHA256,
            "upstream_commit": pilot.UPSTREAM_SHA,
            "conditioning": trial.CONDITIONING,
            "model_config": trial.MODEL_CONFIG,
            "clips_requested": 216,
            "training_windows": 500,
            "heldout_training_clips": 0,
        }
        _write_private(self.checkpoints / trial.REPORT_NAME, _json_bytes(training_report))

    def _dir(self, relative: str) -> Path:
        path = self.root / relative
        path.mkdir(mode=0o700, parents=True, exist_ok=False)
        return path

    def set_checkpoint(self, payload: bytes) -> str:
        digest = hashlib.sha256(payload).hexdigest()
        name = f"checkpoint_step_{bound.EXPECTED_STEP:06d}_{digest[:12]}.pt"
        _write_private(self.checkpoints / name, payload)
        marker = {
            "schema": trial.SCHEMA,
            "step": bound.EXPECTED_STEP,
            "checkpoint_file": name,
            "sha256": digest,
        }
        marker_path = self.checkpoints / f"checkpoint_step_{bound.EXPECTED_STEP:06d}.json"
        if marker_path.exists():
            marker_path.unlink()
        _write_private(marker_path, _json_bytes(marker))
        return digest

    def evaluation_report(self, *, source_sha: str | None = None) -> None:
        result = self.output / "result"
        result.mkdir(mode=0o700)
        pairs = result / "pairs"
        pairs.mkdir(mode=0o700)
        for suffix, value in (("source_input_16k", 0), ("reconstruction", 1)):
            stream = io.BytesIO()
            with wave.open(stream, "wb") as writer:
                writer.setnchannels(1)
                writer.setsampwidth(2)
                writer.setframerate(16_000)
                writer.writeframes(bytes([value, 0]) * bound.PAIR_SAMPLES)
            _write_private(pairs / f"pair_01_{suffix}.wav", stream.getvalue())
        report = {
            "schema": trial.SCHEMA,
            "status": "heldout_reconstruction_evaluated",
            "checkpoint_step": bound.EXPECTED_STEP,
            "source_manifest_sha256": source_sha or self.source_sha,
            "split_manifest_sha256": self.split_sha,
            "feature_sha256": trial.FEATURE_SHA256,
            "upstream_commit": pilot.UPSTREAM_SHA,
            "conditioning": trial.CONDITIONING,
            "model_config": trial.MODEL_CONFIG,
            "heldout_clips_evaluated": 20,
            "heldout_song_groups_for_private_pairs": 1,
            "private_pairs_requested": 1,
        }
        _write_private(result / bound.REPORT_NAME, _json_bytes(report))

    def arguments(self) -> dict:
        return {
            "source_manifest": self.source_manifest,
            "split_manifest": self.split_manifest,
            "upstream_root": self.upstream,
            "checkpoint_dir": self.checkpoints,
            "output_dir": self.output,
            "minutes": 10,
            "pairs": 1,
        }


class BoundHeldoutEvaluationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.fixture = SyntheticFixture(Path(self.temporary.name))
        upstream_patch = mock.patch.object(pilot, "_verify_upstream", return_value=None)
        upstream_patch.start()
        self.addCleanup(upstream_patch.stop)

    def test_exact_checkpoint_and_report_bound_without_private_names(self) -> None:
        fixture = self.fixture

        def evaluator(**kwargs) -> None:
            self.assertEqual(kwargs["pairs"], 1)
            fixture.evaluation_report()

        result = bound.evaluate_and_bind(
            **fixture.arguments(), evaluator=evaluator,
            contract_reader=lambda path: fixture.contract)
        self.assertEqual(result["status"], "complete_bound_to_checkpoint")
        path = fixture.output / "result" / bound.BINDING_NAME
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        binding = json.loads(path.read_text())
        self.assertEqual(binding["checkpoint_sha256"], fixture.checkpoint_sha)
        self.assertEqual(binding["loudness_mean"], -27.5)
        self.assertEqual(binding["loudness_std"], 1.25)
        self.assertEqual(binding["training_script_sha256"], bound._script_digest())
        self.assertEqual(len(binding["private_pair_wav_digests"]), 2)
        self.assertNotIn("sample_001.wav", path.read_text())
        self.assertNotIn(str(fixture.root), path.read_text())
        self.assertEqual(
            bound.inspect_result_binding(
                fixture.output, expected_checkpoint_sha256=fixture.checkpoint_sha),
            "complete_bound_to_checkpoint")
        self.assertEqual(
            bound.inspect_current_checkpoint(fixture.output, fixture.checkpoints),
            "complete_bound_to_checkpoint")

    def test_inspect_detects_checkpoint_changed_after_binding(self) -> None:
        fixture = self.fixture
        bound.evaluate_and_bind(**fixture.arguments(),
                                evaluator=lambda **kwargs: fixture.evaluation_report(),
                                contract_reader=lambda path: fixture.contract)
        fixture.set_checkpoint(b"changed-after-binding")
        self.assertEqual(
            bound.inspect_current_checkpoint(fixture.output, fixture.checkpoints),
            "binding_checkpoint_mismatch")

    def test_changed_checkpoint_after_evaluation_stays_unbound(self) -> None:
        fixture = self.fixture

        def evaluator(**kwargs) -> None:
            fixture.evaluation_report()
            fixture.set_checkpoint(b"different-synthetic-checkpoint")

        with self.assertRaisesRegex(bound.BindingError, "checkpoint_changed_during_evaluation"):
            bound.evaluate_and_bind(**fixture.arguments(), evaluator=evaluator,
                                    contract_reader=lambda path: fixture.contract)
        self.assertEqual(bound.inspect_result_binding(fixture.output), "incomplete_unbound")

    def test_wrong_report_source_hash_stays_unbound(self) -> None:
        fixture = self.fixture

        def evaluator(**kwargs) -> None:
            fixture.evaluation_report(source_sha="0" * 64)

        with self.assertRaisesRegex(bound.BindingError, "evaluation_report_contract_mismatch"):
            bound.evaluate_and_bind(**fixture.arguments(), evaluator=evaluator,
                                    contract_reader=lambda path: fixture.contract)
        self.assertEqual(bound.inspect_result_binding(fixture.output), "incomplete_unbound")

    def test_report_modified_after_binding_is_not_complete(self) -> None:
        fixture = self.fixture
        bound.evaluate_and_bind(**fixture.arguments(),
                                evaluator=lambda **kwargs: fixture.evaluation_report(),
                                contract_reader=lambda path: fixture.contract)
        report_path = fixture.output / "result" / bound.REPORT_NAME
        report = json.loads(report_path.read_text())
        report["heldout_clips_evaluated"] += 1
        report_path.write_bytes(_json_bytes(report))
        self.assertEqual(bound.inspect_result_binding(fixture.output), "binding_report_mismatch")

    def test_pair_replacement_after_binding_is_not_complete(self) -> None:
        fixture = self.fixture
        bound.evaluate_and_bind(**fixture.arguments(),
                                evaluator=lambda **kwargs: fixture.evaluation_report(),
                                contract_reader=lambda path: fixture.contract)
        pair_path = fixture.output / "result" / "pairs" / "pair_01_reconstruction.wav"
        payload = bytearray(pair_path.read_bytes())
        payload[-1] ^= 1
        pair_path.write_bytes(payload)
        self.assertEqual(bound.inspect_result_binding(fixture.output), "binding_pair_mismatch")

    def test_existing_or_missing_result_is_explicitly_incomplete(self) -> None:
        fixture = self.fixture
        self.assertEqual(bound.inspect_result_binding(fixture.output), "evaluation_result_missing")
        fixture.evaluation_report()
        self.assertEqual(bound.inspect_result_binding(fixture.output), "incomplete_unbound")
        with self.assertRaisesRegex(bound.BindingError, "evaluation_output_not_fresh"):
            bound.evaluate_and_bind(**fixture.arguments(),
                                    evaluator=lambda **kwargs: None,
                                    contract_reader=lambda path: fixture.contract)

    def test_child_error_does_not_reveal_private_path(self) -> None:
        fixture = self.fixture
        secret = b"/private/secret/sample_001.wav"
        completed = mock.Mock(returncode=2, stdout=b"", stderr=secret)
        with mock.patch.object(bound.subprocess, "run", return_value=completed):
            with self.assertRaises(bound.BindingError) as caught:
                bound._run_unmodified_evaluator(**fixture.arguments())
        self.assertEqual(str(caught.exception), "evaluation_subprocess_failed")
        self.assertNotIn("secret", str(caught.exception))

    def test_child_success_is_accepted_only_as_aggregate_json(self) -> None:
        fixture = self.fixture
        completed = mock.Mock(
            returncode=0,
            stdout=b'{"status":"heldout_reconstruction_evaluated","checkpoint_step":1000}',
            stderr=b"",
        )
        with mock.patch.object(bound.subprocess, "run", return_value=completed) as run:
            bound._run_unmodified_evaluator(**fixture.arguments())
        command = run.call_args.args[0]
        self.assertEqual(command[2], "evaluate")
        self.assertIn("--checkpoint-dir", command)
        self.assertTrue(run.call_args.kwargs["capture_output"])
        self.assertEqual(run.call_args.kwargs["env"]["PYTORCH_ENABLE_MPS_FALLBACK"], "0")

    def test_training_code_hash_mismatch_fails_before_evaluator(self) -> None:
        fixture = self.fixture
        contract = {**fixture.contract, "script_sha256": "0" * 64}
        evaluator = mock.Mock()
        with self.assertRaisesRegex(bound.BindingError, "checkpoint_contract_mismatch"):
            bound.evaluate_and_bind(**fixture.arguments(), evaluator=evaluator,
                                    contract_reader=lambda path: contract)
        evaluator.assert_not_called()


if __name__ == "__main__":
    unittest.main()
