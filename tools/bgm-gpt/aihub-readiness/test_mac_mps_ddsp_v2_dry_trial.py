"""Synthetic guards only: no AI Hub audio, torch import, or training."""

from __future__ import annotations

import collections
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mac_mps_ddsp_v2_dry_trial as v2


class PartitionTests(unittest.TestCase):
    def test_song_split_is_deterministic_and_disjoint(self):
        records = [{"song_index": index} for index in range(1, 16)]
        fit, validation = v2.partition_training_songs(records)
        again = v2.partition_training_songs(list(reversed(records)))
        self.assertEqual((fit, validation), again)
        self.assertEqual((len(fit), len(validation)), (12, 3))
        self.assertFalse(fit & validation)
        self.assertEqual(fit | validation, set(range(1, 16)))
        self.assertEqual(v2._song_partition_sha(fit, validation),
                         v2._song_partition_sha(*again))

    def test_requires_exactly_fifteen_training_song_groups(self):
        with self.assertRaisesRegex(v2.V2Error, "training_song_count_mismatch"):
            v2.partition_training_songs([{"song_index": index} for index in range(14)])


class DiskGateTests(unittest.TestCase):
    def test_start_requires_twelve_gib_and_run_requires_nine(self):
        usage = collections.namedtuple("usage", "total used free")
        with patch.object(v2.shutil, "disk_usage", return_value=usage(0, 0, 11 * 1024**3)):
            with self.assertRaisesRegex(v2.V2Error, "disk_below_12gib_start"):
                v2._free_space_gate(Path("/private"), starting=True)
            self.assertEqual(v2._free_space_gate(Path("/private"), starting=False),
                             11 * 1024**3)
        with patch.object(v2.shutil, "disk_usage", return_value=usage(0, 0, 8 * 1024**3)):
            with self.assertRaisesRegex(v2.V2Error, "disk_below_9gib_run"):
                v2._free_space_gate(Path("/private"), starting=False)


class WindowTests(unittest.TestCase):
    @staticmethod
    def _window():
        samples = np.zeros(64_000, dtype=np.float32)
        samples[16_000:] = 0.02
        return {"samples": samples,
                "pitch_hz": np.zeros(400, dtype=np.float32),
                "loudness": np.zeros(400, dtype=np.float32),
                "mask": np.ones(400, dtype=bool)}

    def test_internal_validation_is_train_side_and_two_per_kind_per_song(self):
        records = [{"song_index": song, "output_file": f"{song:02d}_{clip:02d}.wav"}
                   for song in range(1, 4) for clip in range(3)]
        with (patch.object(v2.v1, "_load_wav", return_value=np.zeros(64_000, dtype=np.float32)),
              patch.object(v2.v1, "select_nonoverlapping_windows",
                           side_effect=lambda _: [self._window(), self._window()]),
              patch.object(v2.v1, "select_rest_reattack_proxy_window",
                           side_effect=lambda _: self._window())):
            windows, counts = v2._windows_for_records(
                Path("/private/train"), records, validation=True, deadline=float("inf"))
        self.assertEqual(counts["songs"], 3)
        self.assertEqual(counts["windows"], 12)
        self.assertEqual(counts["transition_windows"], 6)
        self.assertEqual({item["song_index"] for item in windows}, {1, 2, 3})
        for song in range(1, 4):
            self.assertEqual([item["kind"] for item in windows if item["song_index"] == song].count(
                "sustain"), 2)
            self.assertEqual([item["kind"] for item in windows if item["song_index"] == song].count(
                "transition"), 2)

    def test_fit_uses_no_more_than_three_windows_per_clip(self):
        records = [{"song_index": song, "output_file": f"{song:02d}_{clip:02d}.wav"}
                   for song in range(1, 13) for clip in range(2)]
        with (patch.object(v2.v1, "_load_wav", return_value=np.zeros(64_000, dtype=np.float32)),
              patch.object(v2.v1, "select_nonoverlapping_windows",
                           side_effect=lambda _: [self._window()] * 4),
              patch.object(v2.v1, "select_rest_reattack_proxy_window",
                           side_effect=lambda _: self._window())):
            windows, counts = v2._windows_for_records(
                Path("/private/train"), records, validation=False, deadline=float("inf"))
        self.assertEqual(len(windows), 24 * v2.MAX_FIT_WINDOWS_PER_CLIP)
        self.assertEqual(counts["transition_windows"], 24)

    def test_attack_mask_focuses_only_near_source_reattack(self):
        samples = np.zeros(64_000, dtype=np.float32)
        samples[16_000:] = 0.02
        mask = v2.acoustic_attack_mask(samples)
        self.assertEqual(mask.shape, (396,))
        self.assertTrue(np.any(mask[70:120]))
        self.assertFalse(np.any(mask[:50]))
        self.assertFalse(np.any(mask[150:]))
        self.assertFalse(np.any(v2.acoustic_attack_mask(np.zeros_like(samples))))

    def test_quiet_overshoot_detects_hiss_below_old_minus40_gate(self):
        source = np.array([-70.0, -52.0, -45.0])
        rendered = np.array([-41.0, -49.0, -35.0])
        overshoot = v2.relative_quiet_overshoot_db(source, rendered)
        np.testing.assert_allclose(overshoot, [14.0, 0.0, 0.0])


class BoundsTests(unittest.TestCase):
    def test_step_limit_blocks_before_private_io(self):
        common = {"source_manifest": Path("/unused/source.json"),
                  "split_manifest": Path("/unused/split.json"),
                  "upstream_root": Path("/unused/upstream"),
                  "baseline_dir": Path("/unused/baseline"),
                  "output_dir": Path("/unused/output"), "minutes": 30}
        for steps in (0, 25, 501):
            with self.assertRaisesRegex(v2.V2Error, "bounded_trial_limit"):
                v2._train(**common, steps=steps)


class CheckpointRetentionTests(unittest.TestCase):
    def test_pruning_removes_only_verified_owned_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            payload = b"synthetic checkpoint"
            digest = hashlib.sha256(payload).hexdigest()
            name = f"v2_step_000050_{digest[:12]}.pt"
            checkpoint = folder / name
            checkpoint.write_bytes(payload)
            checkpoint.chmod(0o600)
            marker = {"schema": v2.SCHEMA, "step": 50, "file": name,
                      "sha256": digest, "bytes": len(payload)}
            v2.v1._write_json(folder, "v2_step_000050.json", marker, replace=False)
            unrelated = folder / "unrelated.txt"
            unrelated.write_text("keep", encoding="utf-8")
            v2._remove_owned_checkpoint(folder, marker)
            self.assertFalse(checkpoint.exists())
            self.assertFalse((folder / "v2_step_000050.json").exists())
            self.assertEqual(unrelated.read_text(encoding="utf-8"), "keep")

    def test_pruning_refuses_changed_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            payload = b"synthetic checkpoint"
            digest = hashlib.sha256(payload).hexdigest()
            name = f"v2_step_000050_{digest[:12]}.pt"
            checkpoint = folder / name
            checkpoint.write_bytes(b"changed")
            checkpoint.chmod(0o600)
            marker = {"schema": v2.SCHEMA, "step": 50, "file": name,
                      "sha256": digest, "bytes": len(payload)}
            v2.v1._write_json(folder, "v2_step_000050.json", marker, replace=False)
            with self.assertRaisesRegex(v2.V2Error, "owned_checkpoint_changed"):
                v2._remove_owned_checkpoint(folder, marker)
            self.assertTrue(checkpoint.exists())
            self.assertTrue((folder / "v2_step_000050.json").exists())


class BaselineTests(unittest.TestCase):
    def test_baseline_is_verified_not_loaded_into_v2_model(self):
        checkpoint = {
            "schema": v2.v1.SCHEMA, "step": 1000,
            "source_manifest_sha256": "source", "split_manifest_sha256": "split",
            "feature_sha256": v2.v1.FEATURE_SHA256,
            "script_sha256": "old-code", "upstream_commit": v2.pilot.UPSTREAM_SHA,
            "model_config": v2.v1.MODEL_CONFIG, "model_state": {"x": object()},
        }
        marker = {"step": 1000, "sha256": "a" * 64}
        fake_torch = type("FakeTorch", (), {"load": staticmethod(lambda *a, **k: checkpoint)})()
        with (patch.object(v2.pilot, "_private_dir"),
              patch.object(v2.v1, "_checkpoint_marker", return_value=(marker, Path("/checkpoint"))),
              patch.object(v2.v1, "_script_sha256", return_value="old-code")):
            self.assertEqual(v2._verify_frozen_baseline(fake_torch, Path("/baseline"),
                                                          "source", "split"), "a" * 64)
            checkpoint["split_manifest_sha256"] = "wrong"
            with self.assertRaisesRegex(v2.V2Error,
                                        "frozen_baseline_configuration_mismatch"):
                v2._verify_frozen_baseline(fake_torch, Path("/baseline"), "source", "split")

    def test_model_is_scratch_dry_and_new_optimizer(self):
        class Identity:
            pass

        class Model:
            def __init__(self, **kwargs):
                self.config = kwargs

            def to(self, device):
                return self

            def parameters(self):
                return ["new_parameter"]

        class Optim:
            @staticmethod
            def Adam(parameters, lr):
                return (parameters, lr)

        torch = type("FakeTorch", (), {
            "manual_seed": staticmethod(lambda _: None),
            "nn": type("NN", (), {"Identity": Identity}),
            "device": staticmethod(lambda name: name),
            "optim": Optim,
        })()
        model, optimizer = v2._model_and_optimizer(torch, Model)
        self.assertIsInstance(model.reverb, Identity)
        self.assertEqual(model.config, v2.MODEL_CONFIG)
        self.assertEqual(optimizer, (["new_parameter"], 1e-3))


if __name__ == "__main__":
    unittest.main()
