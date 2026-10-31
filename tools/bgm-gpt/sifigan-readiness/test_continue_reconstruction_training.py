"""Synthetic3000->6000 sampler/state/storage tests; no model, GPU or audio."""
from collections import Counter
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import continue_reconstruction_training as continuation
from test_extend_corpus_training import groups, sampler_state


def numeric_state(completed):
    import torch
    state = sampler_state(groups(), completed)
    state.update(format="private_sifigan_corpus_pilot_v1", generator={"w": torch.tensor([1.])},
        discriminator={"w": torch.tensor([2.])},
        optimizer_g={"state": {0: {"step": torch.tensor(float(completed)), "exp_avg": torch.tensor([.1])}}},
        optimizer_d={"state": {0: {"step": torch.tensor(float(completed)), "exp_avg": torch.tensor([.2])}}},
        scheduler_g={"last_epoch": completed, "milestones": Counter({100000: 1})},
        scheduler_d={"last_epoch": completed, "milestones": Counter({100000: 1})},
        torch_cpu_rng=torch.tensor([1, 2], dtype=torch.uint8), torch_mps_rng=torch.tensor([3, 4], dtype=torch.uint8),
        normalizer_mean=[0., 1.], normalizer_scale=[1., 2.], generator_config={"synthetic": True})
    return state


class ReconstructionContinuationTests(unittest.TestCase):
    def test_remaining_planned_saves870_820_770_and_no_floor_or_budget_borrowing(self):
        floor = 12 * continuation.GIB
        self.assertEqual([continuation.planned_reserve(n) for n in range(3)], [870_000_000, 820_000_000, 770_000_000])
        for snapshots, used in ((0, 0), (1, 45_317_183), (2, 90_634_366)):
            reserve = continuation.planned_reserve(snapshots)
            self.assertTrue(continuation.planned_available("unused", snapshots, free_bytes=floor + reserve, used_bytes=used))
            self.assertFalse(continuation.planned_available("unused", snapshots, free_bytes=floor + reserve - 1, used_bytes=used))
            self.assertFalse(continuation.planned_available("unused", snapshots, free_bytes=floor + reserve, used_bytes=900_000_000 - reserve + 1))
        for bad in (-1, 3, True):
            with self.assertRaises(ValueError): continuation.planned_reserve(bad)

    def test_update_softstop_still_allows_actual_final_G_and_full_recovery(self):
        floor = 12 * continuation.GIB
        for snapshots, free, used in ((0, 850_000_000, 0), (1, 800_000_000, 45_317_183)):
            self.assertFalse(continuation.planned_available("unused", snapshots, free_bytes=floor + free, used_bytes=used))
            self.assertTrue(continuation.reserve_available("unused", 770_000_000, free_bytes=floor + free, used_bytes=used))
            # Final G's full50MB reserve consumed;700MB full +20MB aux still fits.
            self.assertTrue(continuation.planned_available("unused", min(snapshots + 1, 2), include_generators=False,
                stop_cushion=False, free_bytes=floor + free - 50_000_000, used_bytes=used + 50_000_000))

    def test4500_midpoint_save_and_same_step_final_reuse_leave_full_reserve(self):
        floor, actual_G_bytes = 12 * continuation.GIB, 45_317_183
        # At4500 a disk-margin stop may follow a valid midpoint snapshot.
        self.assertFalse(continuation.planned_available("unused", 0, free_bytes=floor + 850_000_000, used_bytes=0))
        self.assertTrue(continuation.planned_available("unused", 0, stop_cushion=False,
            free_bytes=floor + 850_000_000, used_bytes=0))
        # save_generator checks an existing same-step SHA and returns it before
        # reserving/writing another snapshot; no final-G reserve is consumed.
        self.assertTrue(continuation.planned_available("unused", 1, include_generators=False, stop_cushion=False,
            free_bytes=floor + 850_000_000 - actual_G_bytes, used_bytes=actual_G_bytes))
        self.assertFalse(continuation.reserve_available("unused", 720_000_000,
            free_bytes=floor + 720_000_000, used_bytes=180_000_001))

    def test_exact_PCGrng_sampler3000_to6000_no_cursor_or_cycle_reset(self):
        items, rng = groups(), np.random.default_rng(continuation.SEED)
        order = rng.permutation(27)
        for index in range(3000):
            _, order = continuation.original_resume.next_sample(rng, items, order, index)
        restored = np.random.default_rng()
        restored.bit_generator.state = copy.deepcopy(rng.bit_generator.state)
        saved_order, expected, actual = order.copy(), [], []
        state = sampler_state(items, 3000)
        self.assertEqual(state["sampler_next_group_position"], 3)
        continuation.previous.validate_sampler(state, items, expected_step=3000)
        for index in range(3000, 6000):
            row, order = continuation.original_resume.next_sample(rng, items, order, index)
            expected.append(row)
            row, saved_order = continuation.original_resume.next_sample(restored, items, saved_order, index)
            actual.append(row)
        self.assertEqual(actual, expected)
        self.assertEqual(restored.bit_generator.state, rng.bit_generator.state)
        np.testing.assert_array_equal(order, saved_order)
        with self.assertRaises(ValueError): continuation.previous.validate_sampler(state, items, expected_step=1000)

    def test_six_typed_states_and_every_counter_restore_at3000(self):
        import torch
        class NumericObject:
            def load_state_dict(self, value, strict=None):
                self.value = copy.deepcopy(value)
                self.state, self.last_epoch = self.value.get("state", {}), self.value.get("last_epoch", 3000)
            def state_dict(self): return self.value
        objects = [NumericObject() for _ in range(6)]
        state = numeric_state(3000)
        actual = continuation.previous.strict_restore(state, *objects, expected_step=3000)
        self.assertEqual(actual, {key: continuation.tree_digest(state[key]) for key in continuation.STATE_KEYS})
        bad = copy.deepcopy(state)
        bad["optimizer_d"]["state"][0]["step"] = torch.tensor(2999.)
        with self.assertRaisesRegex(ValueError, "Adam_counters"):
            continuation.previous.strict_restore(bad, *objects, expected_step=3000)
        bad = copy.deepcopy(state); bad["scheduler_g"]["last_epoch"] = 2999
        with self.assertRaisesRegex(ValueError, "scheduler_epochs"):
            continuation.previous.strict_restore(bad, *objects, expected_step=3000)

    def test_saved_full_roundtrip6000_and_final_G_must_match_same_typed_state(self):
        import torch
        with tempfile.TemporaryDirectory() as directory:
            root, state = Path(directory), numeric_state(6000)
            full = continuation.save_torch_archive(root / "full.pt", state, torch, 100_000)
            digest = continuation.tree_digest(state)
            self.assertTrue(continuation.verify_full_roundtrip(root / full["file"], torch, digest, groups(), 6000))
            payload = dict(format="private_sifigan_generator_only_v1", generator=state["generator"],
                completed_steps=6000, generator_config=state["generator_config"], data_gate_sha256="bound-gate",
                normalizer_mean=state["normalizer_mean"], normalizer_scale=state["normalizer_scale"])
            generator = root / "generator.pt"
            continuation.save_torch_archive(generator, payload, torch, 100_000)
            arguments = (generator, torch, continuation.tree_digest(state["generator"]), 6000,
                state["generator_config"], np.array([0., 1.]), np.array([1., 2.]), "bound-gate")
            self.assertTrue(continuation.verify_final_generator(*arguments))
            with self.assertRaisesRegex(ValueError, "same_numeric_G"):
                continuation.verify_final_generator(generator, torch, "changed", *arguments[3:])
            with self.assertRaisesRegex(RuntimeError, "roundtrip_mismatch"):
                continuation.verify_full_roundtrip(root / full["file"], torch, "changed", groups(), 6000)

    def test_complete3000_parent_requires1000_ancestry_and_same_evaluation_and_configs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            ancestor_path, parent_path = root / "parent1000.json", root / "parent3000.json"
            ancestor_path.write_text("{}")
            parent_path.write_text(json.dumps({"parent_report": str(ancestor_path)}))
            checkpoint = root / "full3000.pt"; checkpoint.write_bytes(b"synthetic only")
            ancestor = dict(evaluation_windows=[{"split": "fit"}], generator_config={"g": 1}, discriminator_config={"d": 1},
                mel_config={"m": 1}, residual_config={"r": 1}, upstream_bindings={"same": "sha"})
            parent = dict(ancestor, completed_steps=3000, status="bounded_extension_complete_not_perceptually_approved",
                full_resume_available=True, full_checkpoint_numeric_roundtrip_verified=True, seed=continuation.SEED,
                fit_groups=27, checkpoint_file=checkpoint.name)
            checkpoints = {"extended": {checkpoint.name: {"path": str(checkpoint)}}}
            with patch.object(continuation.previous, "validate_parent", return_value=(ancestor, root / "unused", {})) as validated1000:
                with patch.object(continuation.lineage, "validate_inputs", return_value=(parent, [], {}, checkpoints)):
                    actual, path, bindings = continuation.validate_parent(parent_path, root)
                self.assertEqual(actual["completed_steps"], 3000)
                self.assertEqual(path, checkpoint)
                self.assertIn(str(Path(continuation.__file__).resolve()), bindings)
                validated1000.assert_called_once_with(ancestor_path, root)
                for key, changed in (("completed_steps", 2999), ("full_resume_available", False),
                        ("evaluation_windows", []), ("generator_config", {}), ("full_checkpoint_numeric_roundtrip_verified", False)):
                    with self.subTest(key=key), patch.object(continuation.lineage, "validate_inputs", return_value=({**parent, key: changed}, [], {}, checkpoints)), self.assertRaises(ValueError):
                        continuation.validate_parent(parent_path, root)

    def test_invalid_step_range_existing_output_no_write_and_atomic_progress_permissions(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(continuation.base, "require_mps_environment"):
            output = Path(directory) / "missing"
            for count in (0, True, 3001):
                with self.assertRaisesRegex(ValueError, "ceiling3000"):
                    continuation.run("missing", "missing", output, count)
            self.assertFalse(output.exists())
            with self.assertRaisesRegex(ValueError, "fresh_private"):
                continuation.run("missing", "missing", Path(directory))
            progress = Path(directory) / "progress.json"
            continuation.atomic_json(progress, {"completed_steps": 3000})
            continuation.atomic_json(progress, {"completed_steps": 3500})
            self.assertEqual(json.loads(progress.read_text())["completed_steps"], 3500)
            self.assertEqual(progress.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
