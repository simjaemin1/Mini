"""Synthetic-only VB01 selection, acoustic metric, and binding tests."""

from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest import mock
import wave

import numpy as np

import audit_vibrato_boundaries as audit
import bound_heldout_evaluation as bound
import bound_heldout_vibrato as vb
import mac_mps_ddsp_long_trial as trial
import mac_mps_ddsp_pilot as pilot


def _write_private(path: Path, payload: bytes) -> None:
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "wb") as sink:
        sink.write(payload)


def _json_bytes(value: dict) -> bytes:
    return (json.dumps(value, sort_keys=True, ensure_ascii=False) + "\n").encode()


def _four_second_wav(value: int) -> bytes:
    stream = io.BytesIO()
    with wave.open(stream, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(16_000)
        writer.writeframes(bytes([value, 0]) * bound.PAIR_SAMPLES)
    return stream.getvalue()


class BoundHeldoutVibratoTests(unittest.TestCase):
    def test_strict_modulation_rejects_flat_glissando_and_unvoiced(self) -> None:
        times = np.arange(50) / 100.0
        voiced = np.ones(50, dtype=bool)
        vibrato = 440 * 2 ** ((25 * np.sin(2 * np.pi * 5.5 * times)) / 1200)
        glissando = 440 * 2 ** ((400 * times) / 1200)
        self.assertEqual(vb._modulation(vibrato, voiced, times)["state"], "modulated")
        self.assertEqual(vb._modulation(np.full(50, 440.0), voiced, times)["state"], "not_modulated")
        self.assertEqual(vb._modulation(glissando, voiced, times)["state"], "not_modulated")
        self.assertEqual(vb._modulation(vibrato, np.zeros(50, bool), times)["state"], "indeterminate")

    def test_crop_is_bounded_and_keeps_label_context(self) -> None:
        self.assertEqual(vb._crop_frame(3.0, 8 * 16_000, 2.5, 3.5), 100)
        self.assertEqual(vb._crop_frame(118.0, 120 * 16_000, 117.5, 118.5), 11_600)
        with self.assertRaisesRegex(vb.VibratoError, "lacks_four_second_context"):
            vb._crop_frame(1.0, 8 * 16_000, 0.2, 1.8)

    def test_source_selection_is_fixed_before_any_model_output(self) -> None:
        records = [{
            "output_file": f"sample_{index + 1:03d}.wav",
            "source_stem": f"synthetic_{index:03d}",
            "output_sha256": hashlib.sha256(f"synthetic-{index}".encode()).hexdigest(),
            "song_index": 1 + index % 4,
        } for index in range(34)]
        labels = {
            item["source_stem"]: (8.0, [(2.0, 3.0, "VB01")] if index < 24 else [])
            for index, item in enumerate(records)
        }
        audio = np.zeros(8 * 16_000, dtype=np.float32)
        modulated = {"state": "modulated", "amplitude_cents": 25.0, "frequency_hz": 5.5}
        with (mock.patch.object(audit, "_load_labels", return_value=labels),
              mock.patch.object(trial, "_load_wav", return_value=audio),
              mock.patch.object(vb, "_conditioning", return_value=({}, modulated)),
              mock.patch.object(audit, "analyze_window", return_value=audit.WindowResult(
                  "modulated", "strict_periodic_modulation", 24.0, 0.8)),
              mock.patch.object(vb, "EXPECTED_VB01", 24),
              mock.patch.object(vb, "EXPECTED_ELIGIBLE", 24),
              mock.patch.object(trial, "_mac_mps_gate", side_effect=AssertionError("model called during selection"))):
            selection = vb._source_selection(records, Path("/synthetic/heldout"),
                                             Path("/synthetic/labels.zip"), time.monotonic() + 60)
        self.assertEqual(selection["counts"]["heldout_clips"], 34)
        self.assertEqual(selection["counts"]["selected_clips"], 24)
        self.assertEqual(selection["counts"]["clips_without_eligible_vb01"], 10)
        self.assertEqual(len(selection["records"]), 24)
        self.assertEqual(sorted(item["planned_pair_rank"] for item in selection["records"] if item["planned_pair_rank"]),
                         [1, 2, 3])
        self.assertTrue(all(item["event_start_seconds"] == 2.0 for item in selection["records"]))

    def test_f0_and_level_dropouts_are_separate(self) -> None:
        middle = np.zeros(400, bool)
        middle[100:150] = True
        source_pitch = np.full(400, 440.0, np.float32)
        output_pitch = source_pitch.copy()
        source_mask = np.ones(400, bool)
        output_mask = np.ones(400, bool)
        output_mask[120:125] = False
        common, error, gap = vb._f0_comparison(source_pitch, source_mask,
                                                output_pitch, output_mask, middle)
        self.assertEqual(common, 45)
        self.assertEqual(error, 0.0)
        self.assertEqual(gap, 5)
        source = np.full(64_000, 0.03, np.float32)
        rendered = source.copy()
        rendered[120 * 160:125 * 160] = 0.0
        active, quiet, audible_gap = vb._audible_dropouts(source, rendered, middle)
        self.assertEqual((active, quiet, audible_gap), (50, 5, 5))

    def test_all_24_scores_and_four_song_groups_remain_in_report(self) -> None:
        selected = [{
            "song_index": 1 + index % 4,
            "source80_state": "modulated",
            "source80_amplitude_cents": 25.0,
            "output_file": f"synthetic_secret_{index}.wav",
        } for index in range(24)]
        selection = {"counts": {"heldout_clips": 34, "selected_clips": 24}, "records": selected}
        scores = []
        for index in range(24):
            scores.append({
                "song_index": 1 + index % 4,
                "input64_state": "modulated" if index < 20 else "not_modulated",
                "output64_state": "modulated" if index % 2 == 0 else "not_modulated",
                "input_amplitude_cents": 25.0,
                "output_amplitude_cents": 22.0,
                "input_frequency_hz": 5.5,
                "output_frequency_hz": 5.5,
                "spectral_loss": 5.0,
                "rms_level_difference_db": -1.0,
                "common_voiced_frames": 45,
                "median_f0_error_cents": 3.0,
                "longest_missing_frames": 0,
                "central_source_active_frames": 50,
                "central_quiet_frames": 0,
                "longest_audible_gap_frames": 0,
                "quiet_frames": 2,
                "leaking_frames": 1,
                "attack_count": 0,
                "attack_matched": 0,
            })
        report = vb._aggregate_report(selection, source_sha="a" * 64, split_sha="b" * 64,
            label_sha="c" * 64, checkpoint_sha="d" * 64, training_report_sha="e" * 64,
            selection_sha="f" * 64, scores=scores, pair_notes=[], elapsed=1.0)
        self.assertEqual(report["heldout_crops_evaluated"], 24)
        self.assertEqual(report["counts"]["input64_positive_evaluated"], 20)
        self.assertEqual(len(report["heldout_song_group_aggregates"]), 4)
        self.assertEqual(sum(group["selected_crops"] for group in report["heldout_song_group_aggregates"]), 24)
        self.assertNotIn("synthetic_secret", json.dumps(report))
        self.assertNotIn("song_index", json.dumps(report))

    def test_inspect_detects_pair_report_selection_or_label_tampering(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / "output"
            result = output / "result"
            pairs = result / "pairs"
            checkpoint = root / "checkpoints"
            for folder in (output, result, pairs, checkpoint):
                folder.mkdir(mode=0o700)
            selection_data = _json_bytes({
                "schema": vb.SELECTION_SCHEMA,
                "records": [{} for _ in range(vb.EXPECTED_SELECTED)],
                "counts": {"heldout_clips": 34, "selected_clips": 24,
                           "vb01_labels": vb.EXPECTED_VB01,
                           "eligible_vb01_labels": vb.EXPECTED_ELIGIBLE},
                "source_manifest_sha256": "e" * 64,
                "split_manifest_sha256": "f" * 64,
                "label_zip_sha256": "1" * 64,
                "feature_sha256": trial.FEATURE_SHA256,
            })
            report_data = _json_bytes({"schema": vb.SCHEMA,
                "status": "heldout_vb01_reproduction_evaluated",
                "heldout_crops_evaluated": vb.EXPECTED_SELECTED,
                "counts": {"selected_clips": vb.EXPECTED_SELECTED},
                "heldout_song_group_aggregates": [{} for _ in range(trial.HELDOUT_SONGS)],
                "source_manifest_sha256": "e" * 64,
                "split_manifest_sha256": "f" * 64,
                "label_zip_sha256": "1" * 64,
                "feature_sha256": trial.FEATURE_SHA256,
                "private_pair_notes": [{"status": "saved"}]})
            _write_private(output / vb.SELECTION_NAME, selection_data)
            _write_private(result / vb.REPORT_NAME, report_data)
            for suffix, value in (("source_input_16k", 0), ("reconstruction", 1)):
                _write_private(pairs / f"pair_01_{suffix}.wav", _four_second_wav(value))
            contract = {
                "script_sha256": "a" * 64, "dataset_digest": "b" * 64,
                "conditioning": trial.CONDITIONING, "model_config": trial.MODEL_CONFIG,
                "loudness_mean": -25.0, "loudness_std": 2.0,
            }
            snapshot = {"_path": checkpoint / "synthetic.pt", "marker_sha256": "c" * 64,
                        "checkpoint_sha256": "d" * 64, "checkpoint_bytes": 45_000_000}
            binding = {
                "schema": vb.SCHEMA, "status": "complete_bound_to_checkpoint",
                "source_manifest_sha256": "e" * 64, "split_manifest_sha256": "f" * 64,
                "label_zip_sha256": "1" * 64,
                "evaluation_script_sha256": vb._script_sha(Path(vb.__file__)),
                "audit_script_sha256": vb._script_sha(Path(audit.__file__)),
                "binding_helper_sha256": vb._script_sha(Path(bound.__file__)),
                "feature_sha256": trial.FEATURE_SHA256, "upstream_commit": pilot.UPSTREAM_SHA,
                "checkpoint_marker_sha256": snapshot["marker_sha256"],
                "checkpoint_sha256": snapshot["checkpoint_sha256"],
                "checkpoint_bytes": snapshot["checkpoint_bytes"],
                "training_report_sha256": "2" * 64,
                "training_script_sha256": contract["script_sha256"],
                "dataset_digest": contract["dataset_digest"],
                "conditioning": contract["conditioning"],
                "model_config": contract["model_config"],
                "loudness_mean": contract["loudness_mean"],
                "loudness_std": contract["loudness_std"],
                "selection_sha256": hashlib.sha256(selection_data).hexdigest(),
                "reproduction_report_sha256": hashlib.sha256(report_data).hexdigest(),
                "private_pair_wav_digests": bound._pair_digests(result, 1),
                "selected_crops": vb.EXPECTED_SELECTED,
                "heldout_clips": trial.HELDOUT_RECORDS,
            }
            _write_private(result / vb.BINDING_NAME, _json_bytes(binding))
            kwargs = dict(source_manifest=root / "source.json", split_manifest=root / "split.json",
                          label_zip=root / "labels.zip", upstream_root=root / "upstream",
                          checkpoint_dir=checkpoint, output_dir=output, _already_locked=True)
            patches = (
                mock.patch.object(trial, "_private_inputs", return_value=({}, "e" * 64, {}, "f" * 64, None, None)),
                mock.patch.object(trial, "validate_documents", return_value=([], [])),
                mock.patch.object(vb, "_label_sha", return_value="1" * 64),
                mock.patch.object(trial, "_verify_feature_version", return_value=trial.FEATURE_SHA256),
                mock.patch.object(pilot, "_verify_upstream", return_value=None),
                mock.patch.object(bound, "_checkpoint_snapshot", return_value=snapshot),
                mock.patch.object(bound, "_checkpoint_contract", return_value=contract),
                mock.patch.object(bound, "_verify_contract", return_value=None),
                mock.patch.object(bound, "_verify_training_report", return_value="2" * 64),
            )
            with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
                self.assertEqual(vb.inspect_current_binding(**kwargs), "complete_bound_to_checkpoint")
                pair_path = pairs / "pair_01_reconstruction.wav"
                with pair_path.open("r+b") as handle:
                    handle.seek(44)
                    handle.write(b"x")
                self.assertEqual(vb.inspect_current_binding(**kwargs), "binding_pair_or_population_mismatch")
                with pair_path.open("r+b") as handle:
                    handle.seek(44)
                    handle.write(bytes([1]))
                with (result / vb.REPORT_NAME).open("ab") as handle:
                    handle.write(b" ")
                self.assertEqual(vb.inspect_current_binding(**kwargs), "binding_invalid")
                with (result / vb.REPORT_NAME).open("r+b") as handle:
                    handle.truncate(len(report_data))
                with (output / vb.SELECTION_NAME).open("ab") as handle:
                    handle.write(b" ")
                self.assertEqual(vb.inspect_current_binding(**kwargs), "binding_invalid")
                with (output / vb.SELECTION_NAME).open("r+b") as handle:
                    handle.truncate(len(selection_data))
                with mock.patch.object(vb, "_label_sha", return_value="0" * 64):
                    self.assertEqual(vb.inspect_current_binding(**kwargs), "binding_input_mismatch")

    def test_unexpected_exception_does_not_expose_private_path(self) -> None:
        secret = "/private/do-not-print/source.wav"
        with mock.patch.object(trial, "_exclusive_private_lock", side_effect=RuntimeError(secret)):
            with self.assertRaises(vb.VibratoError) as caught:
                vb.evaluate_and_bind(source_manifest=Path(secret), split_manifest=Path(secret),
                    label_zip=Path(secret), upstream_root=Path(secret), checkpoint_dir=Path(secret),
                    output_dir=Path(secret))
        self.assertEqual(str(caught.exception), "private_evaluation_internal_error")
        self.assertNotIn(secret, str(caught.exception))


if __name__ == "__main__":
    unittest.main()
