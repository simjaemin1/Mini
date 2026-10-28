"""Synthetic exact-continuation/storage contracts; no audio/model/GPU run."""
from collections import Counter
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extend_corpus_training as extend


def groups():
    return [[dict(case="fit%d" % i, pitch_bin="bin%d" % (i % 5), item=j)
             for j in range(3)] for i in range(27)]


def sampler_state(items, completed=1000):
    rng = np.random.default_rng(extend.SEED)
    return dict(completed_steps=completed, sampler_group_keys=[[g[0]["case"], g[0]["pitch_bin"]] for g in items],
        sampler_group_order=list(range(27)), sampler_next_group_position=completed % 27,
        sampler_cycle_boundary_rule=extend.RULE, numpy_sampler_rng=rng.bit_generator.state)


class ExtensionContracts(unittest.TestCase):
    def test_saved_sampler1000_cursor1_and_next_redraw1026(self):
        items = groups()
        np.testing.assert_array_equal(extend.validate_sampler(sampler_state(items), items), np.arange(27))
        for key, value in (("completed_steps", 500), ("sampler_next_group_position", 14),
                ("sampler_group_order", [0] * 27), ("sampler_group_keys", []),
                ("sampler_cycle_boundary_rule", "other"), ("numpy_sampler_rng", {"bit_generator": "MT19937"})):
            state = sampler_state(items); state[key] = value
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "saved27_group"):
                extend.validate_sampler(state, items)
        class RNG:
            calls = 0
            def permutation(self, size):
                self.calls += 1
                return np.arange(size)
            def integers(self, size):
                return 0
        rng, order = RNG(), np.arange(27)
        for index in range(1000, 1026):
            _, order = extend.original_resume.next_sample(rng, items, order, index)
        self.assertEqual(rng.calls, 0)
        extend.original_resume.next_sample(rng, items, order, 1026)
        self.assertEqual(rng.calls, 1)

    def test_exact_sampler_continuation1000_through3000(self):
        items, rng = groups(), np.random.default_rng(extend.SEED)
        order = rng.permutation(27)
        for index in range(1000):
            _, order = extend.original_resume.next_sample(rng, items, order, index)
        saved_rng, saved_order = copy.deepcopy(rng.bit_generator.state), order.copy()
        expected = []
        for index in range(1000, 3000):
            row, order = extend.original_resume.next_sample(rng, items, order, index)
            expected.append(row)
        restored, actual = np.random.default_rng(), []
        restored.bit_generator.state = saved_rng
        for index in range(1000, 3000):
            row, saved_order = extend.original_resume.next_sample(restored, items, saved_order, index)
            actual.append(row)
        self.assertEqual(actual, expected)
        self.assertEqual(restored.bit_generator.state, rng.bit_generator.state)
        np.testing.assert_array_equal(saved_order, order)

    def test_resource_reserve_cannot_borrow12GiB_or1point5GB_budget(self):
        floor = 12 * extend.GIB
        self.assertTrue(extend.reserve_available("unused", 1_000_000_000,
            free_bytes=floor + 1_000_000_000, used_bytes=0))
        self.assertFalse(extend.reserve_available("unused", 1_000_000_000,
            free_bytes=floor + 999_999_999, used_bytes=0))
        self.assertFalse(extend.reserve_available("unused", 1_000_000_000,
            free_bytes=floor + 2_000_000_000, used_bytes=500_000_000))
        self.assertTrue(extend.reserve_available("unused", extend.GENERATOR_RESERVE,
            free_bytes=floor + extend.GENERATOR_RESERVE, used_bytes=1_400_000_000))

    def test_atomic_private_progress_replacement_keeps0600_and_no_partial(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "progress.json"
            extend.atomic_json(path, {"step": 1000})
            extend.atomic_json(path, {"step": 1500})
            self.assertEqual(json.loads(path.read_text()), {"step": 1500})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertFalse(path.with_name("progress.json.writing").exists())

    def test_torch_archive_crc_and_sha_no_overwrite(self):
        import torch
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "generator.pt"
            row = extend.save_torch_archive(path, {"tiny": torch.tensor([1., 2.])}, torch, 100_000)
            self.assertTrue(row["zip_crc_verified"])
            self.assertEqual(row["sha256"], extend.base.sha256(path))
            self.assertEqual(row["bytes"], path.stat().st_size)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaisesRegex(ValueError, "overwrite_forbidden"):
                extend.save_torch_archive(path, {}, torch, 100_000)
            tiny = Path(directory) / "too_big.pt"
            with self.assertRaisesRegex(RuntimeError, "size_ceiling"):
                extend.save_torch_archive(tiny, {"tiny": torch.tensor([1.])}, torch, 1)
            self.assertFalse(tiny.exists())
            self.assertTrue(tiny.with_name("too_big.pt.writing").exists())

    def test_full_weights_only_roundtrip_checks_rng_sampler_and_all_numeric_state(self):
        import torch
        items = groups()
        state = sampler_state(items, completed=1500)
        state.update(format="private_sifigan_corpus_pilot_v1", generator={"w": torch.tensor([1.])},
            discriminator={"w": torch.tensor([2.])},
            optimizer_g={"state": {0: {"step": torch.tensor(1500.), "exp_avg": torch.tensor([.1])}}},
            optimizer_d={"state": {0: {"step": torch.tensor(1500.), "exp_avg": torch.tensor([.2])}}},
            scheduler_g={"last_epoch": 1500, "milestones": Counter({100000: 1})},
            scheduler_d={"last_epoch": 1500, "milestones": Counter({100000: 1})},
            torch_cpu_rng=torch.tensor([1, 2], dtype=torch.uint8), torch_mps_rng=torch.tensor([3, 4], dtype=torch.uint8),
            normalizer_mean=[0., 1.], normalizer_scale=[1., 2.], generator_config={"test": True})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "full.pt"
            extend.save_torch_archive(path, state, torch, 100_000)
            digest = extend.tree_digest(state)
            self.assertTrue(extend.verify_full_roundtrip(path, torch, digest, items, 1500))
            with self.assertRaisesRegex(RuntimeError, "roundtrip_mismatch"):
                extend.verify_full_roundtrip(path, torch, "wrong", items, 1500)
            with self.assertRaisesRegex(RuntimeError, "completed_step"):
                extend.verify_full_roundtrip(path, torch, digest, items, 1501)
            state["torch_mps_rng"][0] = 99
            with self.assertRaisesRegex(RuntimeError, "roundtrip_mismatch"):
                extend.verify_full_roundtrip(path, torch, extend.tree_digest(state), items, 1500)

    def test_environment_invalid_steps_and_existing_output_fail_without_write(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(extend.base, "require_mps_environment"):
            output = Path(directory) / "missing"
            for count in (0, True, 2001):
                with self.assertRaisesRegex(ValueError, "ceiling2000"):
                    extend.run("missing", "missing", output, count)
            self.assertFalse(output.exists())
            existing = Path(directory)
            with self.assertRaisesRegex(ValueError, "fresh_private"):
                extend.run("missing", "missing", existing)
            self.assertEqual(list(existing.iterdir()), [])

    def test_typed_restore_all_six_and_every_Adam_counter1000(self):
        import torch
        class NumericObject:
            def load_state_dict(self, value, strict=None):
                self.value, self.strict = copy.deepcopy(value), strict
                self.state = self.value.get("state", {})
                self.last_epoch = self.value.get("last_epoch", 1000)
            def state_dict(self):
                return self.value
        objects = [NumericObject() for _ in range(6)]
        state = dict(format="private_sifigan_corpus_pilot_v1", completed_steps=1000,
            generator={"weight": torch.tensor([1.])}, discriminator={"weight": torch.tensor([2.])},
            optimizer_g={"state": {0: {"step": torch.tensor(1000.), "exp_avg": torch.tensor([.1])}}},
            optimizer_d={"state": {0: {"step": torch.tensor(1000.), "exp_avg": torch.tensor([.2])}}},
            scheduler_g={"last_epoch": 1000, "milestones": Counter({100000: 1})},
            scheduler_d={"last_epoch": 1000, "milestones": Counter({100000: 1})})
        self.assertEqual(set(extend.strict_restore(state, *objects)), set(extend.STATE_KEYS))
        self.assertTrue(objects[0].strict); self.assertTrue(objects[1].strict)
        bad = copy.deepcopy(state); bad["optimizer_d"]["state"][0]["step"] = torch.tensor(999.)
        with self.assertRaisesRegex(ValueError, "Adam_counters"):
            extend.strict_restore(bad, *objects)
        bad = copy.deepcopy(state); bad["scheduler_g"]["last_epoch"] = 999
        with self.assertRaisesRegex(ValueError, "scheduler_epochs"):
            extend.strict_restore(bad, *objects)
        bad = copy.deepcopy(state); bad["completed_steps"] = 500
        with self.assertRaisesRegex(ValueError, "exact_training_state"):
            extend.strict_restore(bad, *objects)

    def test_parent1000_requires_bound500_ancestry_and_original_gate_evaluation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            source = root / "bound.py"; source.write_bytes(b"unchanged")
            ancestor_path = root / "ancestor.json"; ancestor_path.write_text("{}")
            ancestor_cp = root / "ancestor_full.pt"; ancestor_cp.write_bytes(b"synthetic only")
            checkpoint = root / "final_full_resume.pt"; checkpoint.write_bytes(b"synthetic1000 only")
            recon = []
            for case in ("deepvib48", "arirang001"):
                file = root / (case + ".npz"); file.write_bytes(b"synthetic clip")
                recon.append(dict(case=case, file=file.name, sha256=extend.base.sha256(file)))
            bindings = {str(p): extend.base.sha256(p) for p in (source, ancestor_path, ancestor_cp)}
            ancestor = dict(data_gate="original_gate", evaluation_windows=[{"fixed": True}])
            official = {"official": "pinned"}
            parent = dict(schema="mini.sifigan-corpus-resume.v1",
                status="bounded_resume_complete_not_perceptually_approved", completed_steps=1000, seed=extend.SEED,
                fit_groups=27, public_weights_used=False, hyperparameters_changed=False, heldout_used_for_optimizer=False,
                quality_approved=False, parent_final_baseline_reproduced=True, input_bindings=bindings,
                upstream_bindings=official, parent_report=str(ancestor_path), parent_completed_steps=500,
                parent_checkpoint=str(ancestor_cp), data_gate=ancestor["data_gate"], evaluation_windows=ancestor["evaluation_windows"],
                checkpoint_sha256=extend.base.sha256(checkpoint), checkpoint_bytes=checkpoint.stat().st_size,
                reconstructions=recon)
            path = root / "report.json"; path.write_text(json.dumps(parent))
            with patch.object(extend.base, "validate_upstream", return_value=official), \
                    patch.object(extend.original_resume, "validate_parent", return_value=(ancestor, ancestor_cp, {})) as validate500:
                actual, cp, bound = extend.validate_parent(path, root)
                self.assertEqual(actual["completed_steps"], 1000)
                self.assertEqual(cp, checkpoint)
                self.assertEqual(bound[str(checkpoint)], extend.base.sha256(checkpoint))
                validate500.assert_called_once_with(ancestor_path, root)
                parent["evaluation_windows"] = []; path.write_text(json.dumps(parent))
                with self.assertRaisesRegex(ValueError, "ancestry_changed"):
                    extend.validate_parent(path, root)
                parent["evaluation_windows"] = ancestor["evaluation_windows"]; path.write_text(json.dumps(parent))
                source.write_bytes(b"changed")
                with self.assertRaisesRegex(ValueError, "bound_original"):
                    extend.validate_parent(path, root)


if __name__ == "__main__":
    unittest.main()
