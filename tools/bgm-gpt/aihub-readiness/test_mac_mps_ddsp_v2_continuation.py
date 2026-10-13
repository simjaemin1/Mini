"""Synthetic continuation invariants; no licensed input or GPU training."""

from __future__ import annotations

import copy
import hashlib
import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

import mac_mps_ddsp_v2_continuation as child


def valid_metrics():
    return {"windows": 12, "songs": 3, "raw_rms_delta_db_per_window": [-1.0] * 12,
            "active_frames": 2000, "active_drop_fraction": 0.02,
            "quiet_frames": 700, "quiet_leak_fraction": 0.03,
            "song_macro_objective": 5.0}


class FeasibilityTests(unittest.TestCase):
    def test_one_bad_song_cannot_be_hidden_by_good_median(self):
        metrics = valid_metrics()
        metrics["raw_rms_delta_db_per_window"] = [-1.0] * 8 + [-7.0] * 4
        self.assertEqual(float(np.median(metrics["raw_rms_delta_db_per_window"])), -1.0)
        result = child.internal_feasibility(metrics)
        self.assertFalse(result["feasible"])
        self.assertFalse(result["checks"]["all_twelve_window_levels"])

    def test_exact_boundaries_pass_but_any_excess_fails(self):
        metrics = valid_metrics()
        metrics.update({"raw_rms_delta_db_per_window": [-3.0, 3.0] * 6,
                        "active_drop_fraction": 0.05, "quiet_leak_fraction": 0.05})
        self.assertTrue(child.internal_feasibility(metrics)["feasible"])
        for name in ("active_drop_fraction", "quiet_leak_fraction"):
            changed = copy.deepcopy(metrics)
            changed[name] = 0.05000001
            self.assertFalse(child.internal_feasibility(changed)["feasible"])
        metrics["raw_rms_delta_db_per_window"][0] = -3.000001
        self.assertFalse(child.internal_feasibility(metrics)["feasible"])

    def test_missing_nonfinite_or_incomplete_metrics_fail_closed(self):
        for value in ([], [-1.0] * 11, [float("nan")] * 12, [True] * 12):
            metrics = valid_metrics()
            metrics["raw_rms_delta_db_per_window"] = value
            self.assertFalse(child.internal_feasibility(metrics)["feasible"])
        for name, value in (("active_frames", 0), ("quiet_frames", 0),
                            ("songs", 2), ("windows", 11),
                            ("quiet_leak_fraction", float("nan"))):
            metrics = valid_metrics()
            metrics[name] = value
            self.assertFalse(child.internal_feasibility(metrics)["feasible"])


class SelectionTests(unittest.TestCase):
    def test_lower_loss_infeasible_model_cannot_replace_feasible_model(self):
        best = {"step": 100}
        candidate = {"step": 150}
        metrics = valid_metrics()
        metrics["song_macro_objective"] = 1.0
        metrics["raw_rms_delta_db_per_window"][2] = -7.0
        self.assertEqual(child._choose_better(best, 5.0, candidate, metrics,
            require_feasible=True), (best, 5.0))
        self.assertEqual(child._choose_better(best, 5.0, candidate, metrics,
            require_feasible=False), (candidate, 1.0))

    def test_no_feasible_checkpoint_remains_explicitly_absent(self):
        metrics = valid_metrics()
        metrics["active_drop_fraction"] = 0.5
        self.assertEqual(child._choose_better(None, math.inf, {"step": 50}, metrics,
            require_feasible=True), (None, math.inf))


class SamplerTests(unittest.TestCase):
    def test_resuming_step400_continues_exact_pool_sequence(self):
        pools = {"transition": list(range(7)), "sustain": list(range(7, 24))}
        def sequence(start, stop):
            seen = child.sampler_seen_before(start)
            cache, rows = {}, []
            for step in range(start + 1, stop + 1):
                kind = "transition" if (step - 1) % 3 == 0 else "sustain"
                rows.append((kind, child._sample_index(pools, kind, seen[kind], cache)))
                seen[kind] += 1
            return rows
        self.assertEqual(sequence(400, 700), sequence(0, 700)[400:])
        self.assertEqual(child.sampler_seen_before(400), {"transition": 134, "sustain": 266})


class ParentOptimizerTests(unittest.TestCase):
    def test_parent_reproduction_allows_only_tiny_explicit_float_variation(self):
        expected = {"windows": 12, "songs": 3, "quiet_frames": 716,
                    "active_frames": 2028, "raw_rms_delta_db_median": -2.3511,
                    "quiet_leak_fraction": 0.040503,
                    "song_macro_objective": 5.673601,
                    "song_macro_objectives": [5.0, 6.0, 6.020803]}
        actual = copy.deepcopy(expected)
        actual["raw_rms_delta_db_median"] += 0.0009
        actual["song_macro_objective"] += 0.00009
        actual["song_macro_objectives"][1] += 0.00009
        self.assertTrue(child._parent_validation_matches(actual, expected))
        for name, value in (("quiet_frames", 715), ("windows", 12.0),
                            ("raw_rms_delta_db_median", -2.349),
                            ("song_macro_objective", 5.674),
                            ("quiet_leak_fraction", 0.041),
                            ("song_macro_objective", float("nan"))):
            changed = copy.deepcopy(actual)
            changed[name] = value
            self.assertFalse(child._parent_validation_matches(changed, expected))

    def test_resumes_dry_weights_and_adam_then_changes_only_learning_rate(self):
        class Model:
            def load_state_dict(self, state, strict):
                self.loaded = state
                self.strict = strict
        class Optimizer:
            def load_state_dict(self, state):
                self.loaded = copy.deepcopy(state)
                self.param_groups = self.loaded["param_groups"]
        model, optimizer = Model(), Optimizer()
        parent = {"schema": child.v2.SCHEMA, "step": 400,
                  "architecture": child.v2.ARCHITECTURE,
                  "model_config": child.v2.MODEL_CONFIG,
                  "model_state": {"layer.weight": "dry_parent_weight"},
                  "optimizer_state": {"state": {1: {"step": 400, "exp_avg": "old_momentum"}},
                                      "param_groups": [{"lr": 1e-3}]}}
        with (patch.object(child.v1, "_assert_checkpoint_state_finite"),
              patch.object(child.v2, "_model_and_optimizer", return_value=(model, optimizer))):
            self.assertEqual(child._model_and_optimizer(object(), object(), parent),
                             (model, optimizer))
        self.assertIs(model.loaded, parent["model_state"])
        self.assertTrue(model.strict)
        self.assertEqual(optimizer.loaded["state"], parent["optimizer_state"]["state"])
        self.assertEqual(optimizer.param_groups[0]["lr"], 3e-4)
        self.assertEqual(parent["optimizer_state"]["param_groups"][0]["lr"], 1e-3)

    def test_wet_or_wrong_parent_is_rejected_before_model_load(self):
        for state in ({"schema": child.v1.SCHEMA, "step": 1000},
                      {"schema": child.v2.SCHEMA, "step": 400,
                       "architecture": child.v2.ARCHITECTURE,
                       "model_config": child.v2.MODEL_CONFIG,
                       "model_state": {"reverb.wet": 1}}):
            with self.assertRaisesRegex(child.ContinuationError, "dry_parent_required"):
                child._model_and_optimizer(object(), object(), state)


class IntegrityTests(unittest.TestCase):
    def test_window_digest_binds_conditioning_and_source_window(self):
        item = {"song_index": 1, "kind": "sustain",
                "samples": np.zeros(4, dtype=np.float32),
                "pitch_hz": np.ones(2, dtype=np.float32),
                "loudness": np.zeros(2, dtype=np.float32),
                "mask": np.ones(2, dtype=bool), "attack_mask": np.zeros(2, dtype=bool)}
        before = child._windows_sha256([item])
        changed = copy.deepcopy(item)
        changed["loudness"][0] = 0.001
        self.assertNotEqual(before, child._windows_sha256([changed]))
        changed = copy.deepcopy(item)
        changed["attack_mask"][0] = True
        self.assertNotEqual(before, child._windows_sha256([changed]))

    def test_retention_removes_exact_child_only_and_refuses_tampering(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            folder.chmod(0o700)
            data = b"synthetic child checkpoint"
            digest = hashlib.sha256(data).hexdigest()
            name = f"child_step_000050_{digest[:12]}.pt"
            path = folder / name
            path.write_bytes(data)
            path.chmod(0o600)
            marker = {"schema": child.SCHEMA, "step": 50, "total_step": 450,
                      "file": name, "sha256": digest, "bytes": len(data)}
            child._write_json(folder, "child_step_000050.json", marker, replace=False)
            unrelated = folder / "parent_checkpoint.pt"
            unrelated.write_bytes(b"preserve parent")
            path.write_bytes(b"x" * len(data))
            with self.assertRaisesRegex(child.ContinuationError, "owned_checkpoint_changed"):
                child._remove_owned_checkpoint(folder, marker)
            self.assertTrue(path.exists())
            path.write_bytes(data)
            child._remove_owned_checkpoint(folder, marker)
            self.assertFalse(path.exists())
            self.assertEqual(unrelated.read_bytes(), b"preserve parent")

    def test_limits_reject_before_private_io(self):
        common = {"source_manifest": Path("/unused/source.json"),
                  "split_manifest": Path("/unused/split.json"),
                  "upstream_root": Path("/unused/upstream"),
                  "parent_checkpoint_dir": Path("/unused/parent"),
                  "output_dir": Path("/unused/output"), "minutes": 30}
        for steps in (0, 49, 75, 2001):
            with self.assertRaisesRegex(child.ContinuationError, "bounded_continuation_limit"):
                child._train(**common, steps=steps)


if __name__ == "__main__":
    unittest.main()
