"""Synthetic sampler/restore boundaries; no models, originals, torch, or GPU."""
import copy
import hashlib
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("train_level_fix", HERE / "train_level_fix.py")
trainer = importlib.util.module_from_spec(SPEC)
with patch.object(sys, "path", [str(HERE), *sys.path]):
    SPEC.loader.exec_module(trainer)


def gate_fixture():
    rows = [dict(case="fit" + str(i), split="fit", accepted=True, start_frame=i * 70,
                 frame_count=70, category=category, pitch_bin="test-bin", rms_stratum="test-level")
            for i, category in enumerate(trainer.CATEGORY_WEIGHTS)]
    return {"fit_windows": rows}, {row["case"]: {"split": "fit"} for row in rows}


class Scalar(float):
    def detach(self):
        return self

    def cpu(self):
        return self


class StateObject:
    def __init__(self):
        self.value = None
        self.state = {}
        self.last_epoch = None
        self.strict = None

    def load_state_dict(self, value, strict=None):
        self.value = copy.deepcopy(value)
        self.strict = strict
        self.state = self.value.get("state", {})
        self.last_epoch = self.value.get("last_epoch")

    def state_dict(self):
        return copy.deepcopy(self.value)


def training_state():
    return dict(completed_steps=1000, format="private_sifigan_corpus_pilot_v1",
        generator={"weight": 1.25}, discriminator={"weight": -.5},
        optimizer_g={"state": {0: {"step": Scalar(1000), "moment": .1}}},
        optimizer_d={"state": {0: {"step": Scalar(1000), "moment": -.1}}},
        scheduler_g={"last_epoch": 1000}, scheduler_d={"last_epoch": 1000})


def numeric_digest(value):
    return hashlib.sha256(repr(value).encode()).hexdigest()


class LevelFixContracts(unittest.TestCase):
    def test_fit_sampler_categories_and_deterministic_new_seed(self):
        gate, files = gate_fixture()
        groups = trainer.sampler_groups(gate, files)
        self.assertEqual(set(groups), set(trainer.CATEGORY_WEIGHTS))
        def draws():
            rng = np.random.default_rng(trainer.SAMPLER_SEED)
            return [(trainer.sample(rng, groups)["case"]) for _ in range(100)]
        self.assertEqual(draws(), draws())
        self.assertEqual(set(draws()), set(files))
        self.assertEqual(trainer.SAMPLER_SEED, 20261026)

    def test_heldout_unaccepted_unknown_and_invalid_crop_never_enter_sampler(self):
        for change in ({"split": "heldout"}, {"accepted": False}, {"case": "unknown"},
                       {"start_frame": -1}, {"start_frame": 0.5}, {"frame_count": 69},
                       {"category": "unannounced"}):
            gate, files = gate_fixture()
            gate["fit_windows"][0].update(change)
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, "eligible_fit_state"):
                trainer.sampler_groups(gate, files)
        gate, files = gate_fixture()
        files[gate["fit_windows"][0]["case"]]["split"] = "heldout"
        with self.assertRaisesRegex(ValueError, "eligible_fit_state"):
            trainer.sampler_groups(gate, files)

    def test_duplicate_windows_and_missing_quiet_or_voiced_are_rejected(self):
        gate, files = gate_fixture()
        gate["fit_windows"].append(dict(gate["fit_windows"][0]))
        with self.assertRaisesRegex(ValueError, "duplicate_optimizer_window"):
            trainer.sampler_groups(gate, files)
        for missing in ("quiet", "voiced"):
            gate, files = gate_fixture()
            gate["fit_windows"] = [row for row in gate["fit_windows"] if row["category"] != missing]
            with self.subTest(missing=missing), self.assertRaisesRegex(ValueError, "voiced_and_quiet"):
                trainer.sampler_groups(gate, files)

    def test_all_six_parent_states_are_restored_with_1000_counters(self):
        objects = [StateObject() for _ in range(6)]
        with patch.object(trainer, "tree_digest", side_effect=numeric_digest):
            result = trainer.restore1000(training_state(), *objects)
        self.assertEqual(set(result), set(trainer.STATE_KEYS))
        self.assertTrue(objects[0].strict)
        self.assertTrue(objects[1].strict)
        self.assertTrue(all(obj.value is not None for obj in objects))
        self.assertEqual(objects[-1].last_epoch, 1000)

    def test_wrong_parent_step_optimizer_or_scheduler_counters_are_rejected(self):
        for mutate, expected in ((lambda s: s.update(completed_steps=500), "full1000"),
                (lambda s: s["optimizer_g"]["state"][0].update(step=Scalar(999)), "Adam_counters"),
                (lambda s: s["scheduler_d"].update(last_epoch=999), "scheduler_epochs")):
            state = training_state(); mutate(state)
            with self.subTest(expected=expected), patch.object(trainer, "tree_digest", side_effect=numeric_digest):
                with self.assertRaisesRegex(ValueError, expected):
                    trainer.restore1000(state, *[StateObject() for _ in range(6)])

    def test_original_binding_tamper_is_detected_using_only_synthetic_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fixture"
            path.write_bytes(b"synthetic, not an original")
            bindings = {str(path): trainer.base.sha256(path)}
            trainer.verify_bindings(bindings)
            path.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "bound_original_feature_code"):
                trainer.verify_bindings(bindings)
            with self.assertRaises(ValueError):
                trainer.verify_bindings({})

    def test_invalid_environment_and_step_limits_stop_before_any_run(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "MPS_fallback"):
                trainer.run("unused", "unused", "unused", "unused")
        for steps in (0, 1001, True):
            with self.subTest(steps=steps), patch.object(trainer.base, "require_mps_environment"):
                with self.assertRaisesRegex(ValueError, "additional_step_limit"):
                    trainer.run("unused", "unused", "unused", "unused", steps)

    def test_existing_output_is_preserved_and_storage_count_is_read_only(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder).resolve()
            sentinel = output / "sentinel"
            sentinel.write_bytes(b"keep")
            with patch.object(trainer.base, "require_mps_environment"):
                with self.assertRaisesRegex(ValueError, "fresh_private_output"):
                    trainer.run("unused", "unused", "unused", output)
            self.assertEqual(trainer.bytes_used(output), 4)
            self.assertEqual(sentinel.read_bytes(), b"keep")


if __name__ == "__main__":
    unittest.main()
