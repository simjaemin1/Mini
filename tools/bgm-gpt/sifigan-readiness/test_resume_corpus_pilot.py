"""Synthetic resume-contract tests. No original audio, model, or GPU runs."""
import copy
from collections import Counter
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import resume_corpus_pilot as resume


def groups():
    return [[dict(case=f"fit{i}", pitch_bin=f"bin{i % 5}", item=j) for j in range(3)] for i in range(27)]


def sampler_state(items):
    rng = np.random.default_rng(resume.SEED)
    return dict(completed_steps=500, sampler_group_keys=[[g[0]["case"], g[0]["pitch_bin"]] for g in items],
        sampler_group_order=list(range(27)), sampler_next_group_position=14,
        sampler_cycle_boundary_rule=resume.RULE, numpy_sampler_rng=rng.bit_generator.state)


class SamplerTests(unittest.TestCase):
    def test_split_run_matches_uninterrupted_sampler_through1000(self):
        items = groups()
        rng = np.random.default_rng(resume.SEED)
        order = rng.permutation(27)
        for index in range(500):
            _, order = resume.next_sample(rng, items, order, index)
        saved_rng, saved_order = copy.deepcopy(rng.bit_generator.state), order.copy()
        expected = []
        for index in range(500, 1000):
            row, order = resume.next_sample(rng, items, order, index)
            expected.append(row)
        restored = np.random.default_rng()
        restored.bit_generator.state = saved_rng
        actual = []
        for index in range(500, 1000):
            row, saved_order = resume.next_sample(restored, items, saved_order, index)
            actual.append(row)
        self.assertEqual(actual, expected)
        self.assertEqual(restored.bit_generator.state, rng.bit_generator.state)
        np.testing.assert_array_equal(saved_order, order)

    def test_permutation_draws_at513_not500_or540(self):
        class RNG:
            calls = 0
            def permutation(self, size):
                self.calls += 1
                return np.arange(size)
            def integers(self, _size):
                return 0
        rng, items, order = RNG(), groups(), np.arange(27)
        for index in range(500, 513):
            _, order = resume.next_sample(rng, items, order, index)
        self.assertEqual(rng.calls, 0)
        _, _ = resume.next_sample(rng, items, order, 513)
        self.assertEqual(rng.calls, 1)

    def test_saved_group_order_keys_cursor_and_rng_are_required(self):
        items = groups()
        np.testing.assert_array_equal(resume.validate_sampler(sampler_state(items), items), np.arange(27))
        for key, value in (("sampler_next_group_position", 0), ("completed_steps", 499),
                ("sampler_group_order", [0] * 27), ("sampler_cycle_boundary_rule", "different"),
                ("sampler_group_keys", []), ("numpy_sampler_rng", {"bit_generator": "MT19937"})):
            state = sampler_state(items)
            state[key] = value
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "saved27_group"):
                resume.validate_sampler(state, items)


class ResumeContractTests(unittest.TestCase):
    def test_evaluation_must_match_parent_final_not_just_improve(self):
        expected = dict(fit=dict(windows=27, mean_logmel_l1=.5), heldout=dict(windows=15, mean_logmel_l1=.6))
        resume.compare_evaluation(copy.deepcopy(expected), expected)
        for change in (dict(windows=27, mean_logmel_l1=.49), dict(windows=26, mean_logmel_l1=.5),
                       dict(windows=27, mean_logmel_l1=float("nan"))):
            actual = copy.deepcopy(expected)
            actual["fit"] = change
            with self.assertRaisesRegex(ValueError, "not_parent_final"):
                resume.compare_evaluation(actual, expected)

    def test_environment_and_budget_fail_before_output_creation(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "new"
            with patch.dict(os.environ, {}, clear=True):
                with self.assertRaisesRegex(ValueError, "MPS_fallback"):
                    resume.run("missing", "missing", output)
            self.assertFalse(output.exists())
            with patch.object(resume.base, "require_mps_environment"):
                for steps in (0, 501, True):
                    with self.assertRaisesRegex(ValueError, "step_ceiling"):
                        resume.run("missing", "missing", output, steps)
            self.assertFalse(output.exists())

    def test_existing_output_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(resume.base, "require_mps_environment"):
            path = Path(directory)
            (path / "keep").write_bytes(b"keep")
            with self.assertRaisesRegex(ValueError, "fresh_private"):
                resume.run("missing", "missing", path)
            self.assertEqual((path / "keep").read_bytes(), b"keep")

    def test_cumulative_disk_budget_reserves930MB_without_deletion(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "continuation"
            with patch.object(resume, "experiment_bytes", return_value=780835953):
                self.assertEqual(resume.check_disk_budget(root, output), 780835953)
            with patch.object(resume, "experiment_bytes", return_value=1070000001):
                with self.assertRaisesRegex(ValueError, "cumulative2GB"):
                    resume.check_disk_budget(root, output)
            with self.assertRaisesRegex(ValueError, "parent_experiment"):
                resume.check_disk_budget(root, root.parent / "other")

    def test_parent_all35_files_checkpoint_reconstructions_and_time_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bindings = {}
            for i in range(35):
                path = root / f"input{i}"
                path.write_bytes(str(i).encode())
                bindings[str(path)] = resume.base.sha256(path)
            cp = root / "final_full_resume.pt"
            cp.write_bytes(b"synthetic numeric-state placeholder, not a model")
            reconstructions = []
            for case in ("deepvib48", "arirang001"):
                path = root / (case + ".npz")
                path.write_bytes(b"synthetic")
                reconstructions.append(dict(case=case, file=path.name, sha256=resume.base.sha256(path)))
            official = {str(i): str(i) for i in range(56)}
            parent = dict(schema="mini.sifigan-corpus-pilot.v1", status="bounded_pilot_complete_not_perceptually_approved",
                completed_steps=500, seed=resume.SEED, fit_groups=27, batch_size=1, frames=70,
                public_weights_used=False, input_bindings=bindings, upstream_bindings=official,
                checkpoint_sha256=resume.base.sha256(cp), checkpoint_bytes=cp.stat().st_size,
                reconstructions=reconstructions, elapsed_seconds=413.346)
            report = root / "report.json"
            report.write_text(json.dumps(parent))
            with patch.object(resume.base, "validate_upstream", return_value=official):
                _, actual_cp, actual_bindings = resume.validate_parent(report, root)
                self.assertEqual(actual_cp, cp.resolve())
                self.assertEqual(len(actual_bindings), 40)
                (root / "input0").write_bytes(b"tampered")
                with self.assertRaisesRegex(ValueError, "bound_input_changed"):
                    resume.validate_parent(report, root)
                (root / "input0").write_bytes(b"0")
                parent["elapsed_seconds"] = 481
                report.write_text(json.dumps(parent))
                with self.assertRaisesRegex(ValueError, "cumulative1200"):
                    resume.validate_parent(report, root)

    def test_typed_state_digest_is_not_json_float_coercion(self):
        self.assertNotEqual(resume.tree_digest({"steps": 500}), resume.tree_digest({"steps": 500.}))
        self.assertNotEqual(resume.tree_digest({"v": [1, 2]}), resume.tree_digest({"v": (1, 2)}))

    def test_typed_restore_and_every_Adam_counter(self):
        import torch
        class NumericObject:
            def load_state_dict(self, value, strict=None):
                self.value = copy.deepcopy(value)
                self.strict = strict
                self.state = self.value.get("state", {})
                self.last_epoch = self.value.get("last_epoch", 500)
            def state_dict(self):
                return self.value
        objects = [NumericObject() for _ in range(6)]
        state = dict(generator={"weight": torch.tensor([1.], dtype=torch.float32)},
            discriminator={"weight": torch.tensor([2.], dtype=torch.float32)},
            optimizer_g={"state": {0: {"step": torch.tensor(500.), "exp_avg": torch.tensor([.1])}}},
            optimizer_d={"state": {0: {"step": torch.tensor(500.), "exp_avg": torch.tensor([.2])}}},
            scheduler_g={"last_epoch": 500, "milestones": Counter({100000: 1})},
            scheduler_d={"last_epoch": 500, "milestones": Counter({100000: 1})})
        result = resume.strict_restore(state, *objects)
        self.assertEqual(set(result), set(resume.STATE_KEYS))
        self.assertTrue(objects[0].strict)
        self.assertTrue(objects[1].strict)
        state["optimizer_d"]["state"][0]["step"] = torch.tensor(499.)
        with self.assertRaisesRegex(ValueError, "counter_must_equal500"):
            resume.strict_restore(state, *objects)

    def test_Counter_weights_only_allowlist_is_scoped(self):
        import torch
        before = list(torch.serialization.get_safe_globals())
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.pt"
            torch.save({"milestones": Counter({100000: 1}), "rng": torch.tensor([1], dtype=torch.uint8)}, path)
            with torch.serialization.safe_globals([Counter]):
                restored = torch.load(path, map_location="cpu", weights_only=True)
            self.assertIsInstance(restored["milestones"], Counter)
            self.assertEqual(restored["milestones"], Counter({100000: 1}))
        self.assertCountEqual(torch.serialization.get_safe_globals(), before)


if __name__ == "__main__":
    unittest.main()
