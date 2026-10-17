"""Synthetic ablation controls only; no original recordings or pyworld import."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_aperiodicity_ablation as trial


def fixture():
    source = .05*np.sin(2*np.pi*300*np.arange(115200)/24000)
    f0 = np.full(961, 300., dtype=np.float64)
    f0[10:15] = 0
    controls = {"f0_hz": f0, "synthesis_f0_hz": f0.copy(), "time_seconds": np.arange(961)*.005,
                "spectral_envelope": np.ones((961, 17)), "aperiodicity": np.ones((961, 17))}
    return source, controls


class MockWorld:
    def d4c(self, source, f0, times, rate, **kwargs):
        self.arguments = kwargs
        return np.full((961, 17), .2)

    def synthesize(self, f0, sp, ap, rate, **kwargs):
        return .05*np.sin(2*np.pi*300*np.arange(961*120)/24000)


class AperiodicityTests(unittest.TestCase):
    def test_only_ap_is_recomputed_threshold_zero_with_exact_controls(self):
        source, controls = fixture()
        before = {k: trial.parent.array_digest(v) for k, v in controls.items()}
        world = MockWorld()
        y, ap, facts = trial.ablate_aperiodicity(controls, source, world=world)
        self.assertEqual(world.arguments, {"threshold": 0., "fft_size": 32})
        self.assertEqual(y.shape, (115200,))
        self.assertEqual(facts["right_trimmed_samples"], 120)
        self.assertEqual(facts["voiced_ap_all_approximately_one_fraction_before"], 1.)
        self.assertEqual(facts["voiced_ap_all_approximately_one_fraction_after"], 0.)
        self.assertTrue((ap > 0).all())  # not an all-noise-removal operation
        self.assertEqual(before, {k: trial.parent.array_digest(v) for k, v in controls.items()})
        self.assertEqual(len(trial.rms_trace(y)), 480)

    def test_invalid_control_hash_shift_and_world_mutation_rejected(self):
        source, controls = fixture()
        hashes = {k: trial.parent.array_digest(v) for k, v in controls.items()}
        hashes["time_seconds"] = "0"*64
        with self.assertRaisesRegex(ValueError, "array_sha_mismatch"):
            trial.validate_controls(controls, source, hashes)
        controls["synthesis_f0_hz"][0] += 1
        with self.assertRaisesRegex(ValueError, "controls_invalid"):
            trial.ablate_aperiodicity(controls, source, world=MockWorld())
        source, controls = fixture()
        world = MockWorld()
        def mutate(f0, sp, ap, *args, **kwargs):
            sp[0, 0] = 2
            return np.ones(961*120)
        with patch.object(world, "synthesize", side_effect=mutate):
            with self.assertRaisesRegex(ValueError, "mutated"):
                trial.ablate_aperiodicity(controls, source, world=world)

    def test_bound_payload_sha_safe_paths_and_output_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            item = trial.save_payload(folder, "synthetic.bin", b"fixture")
            self.assertEqual(trial.bound_file(folder, item), folder/"synthetic.bin")
            (folder/"synthetic.bin").write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "sha_or_size_mismatch"):
                trial.bound_file(folder, item)
            with self.assertRaisesRegex(ValueError, "unsafe_bound_filename"):
                trial.bound_file(folder, {**item, "file": "../escape"})
            with patch.object(trial, "OUTPUT_BUDGET", 1):
                with self.assertRaisesRegex(ValueError, "40MB_all_output_budget"):
                    trial.save_payload(folder, "over.bin", b"abc")
            self.assertFalse((folder/"over.bin").exists())


if __name__ == "__main__":
    unittest.main()
