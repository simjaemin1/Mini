"""Synthetic source-only policy tests: no model, original audio, or inference."""
import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prepare_level_windows as level


def arrays(frames=70):
    return dict(waveform=np.full(frames * 120, .01, np.float32), f0=np.full(frames, 440., np.float32),
        cf0=np.full(frames, 440., np.float32), features=np.ones((frames, 43), np.float32),
        rms_db=np.full(frames, -40., np.float32), ap_all_one=np.zeros(frames, bool),
        yin_hz=np.full(frames, 440., np.float32), periodicity=np.full(frames, .98, np.float32))


def quiet(values):
    values["waveform"][:] = 0
    for key in ("f0", "yin_hz", "periodicity"):
        values[key][:] = 0
    values["ap_all_one"][:] = True
    values["rms_db"][:] = -240
    return values


def fixture(root):
    corpus = root / "corpus"
    corpus.mkdir()
    rows = []
    for case in sorted(level.FIT_CASES | level.HELDOUT_CASES):
        source = corpus / (case + ".source")
        source.write_bytes(case.encode())
        values = arrays(210)
        values["waveform"][:70 * 120] = 0
        for key in ("f0", "yin_hz", "periodicity"):
            values[key][:70] = 0
        values["ap_all_one"][:70] = True
        values["features"][:] = 2 if case in level.FIT_CASES else 999
        path = corpus / (case + ".npz")
        np.savez_compressed(path, **values)
        rows.append(dict(case=case, split="fit" if case in level.FIT_CASES else "heldout",
            source_path=str(source), source_sha256=level.original.digest(source),
            npz_file=path.name, npz_sha256=level.original.digest(path), frames=210))
    manifest = corpus / "manifest.json"
    manifest.write_text(json.dumps(dict(schema="mini.sifigan-corpus.v1", status="complete", files=rows)))
    audit_path = root / "audit"
    level.original.audit(manifest, audit_path)
    return audit_path / "window_gate.json"


class SourceLevelPolicyTests(unittest.TestCase):
    def test_true_source_quiet_is_kept_without_defined_voiced_AP(self):
        result = level.assess(quiet(arrays()), 0)
        self.assertTrue(result["accepted"])
        self.assertEqual(result["category"], "quiet")
        self.assertIsNone(result["supported_voiced_ap_all_one_fraction"])
        self.assertIsNone(result["supported_harvest_agreement_fraction"])

    def test_quiet_requires_actual_wave_level_and_individual_quiet_frames(self):
        values = quiet(arrays())
        values["rms_db"][:] = -200  # misleading cached context cannot make a loud waveform quiet
        values["waveform"][:] = .1
        self.assertNotEqual(level.assess(values, 0)["category"], "quiet")

    def test_transition_supported_subset_checks_Harvest_and_only_its_AP(self):
        values = arrays()
        for key in ("f0", "yin_hz", "periodicity"):
            values[key][:35] = 0
        values["ap_all_one"][:35] = True
        values["waveform"][:35 * 120] = 0
        before = {key: value.copy() for key, value in values.items()}
        result = level.assess(values, 0)
        self.assertTrue(result["accepted"])
        self.assertEqual(result["category"], "transition")
        self.assertEqual(result["supported_voiced_ap_all_one_fraction"], 0.)
        for key in before:
            np.testing.assert_array_equal(values[key], before[key])
        values["f0"][35:] *= 2
        result = level.assess(values, 0)
        self.assertFalse(result["accepted"])
        self.assertIn("supported_harvest_reference_disagreement", result["rejection_reasons"])

    def test_no_reference_support_is_not_fabricated_breath_truth(self):
        values = quiet(arrays())
        values["waveform"][:] = .001
        result = level.assess(values, 0)
        self.assertTrue(result["accepted"])
        self.assertEqual(result["category"], "aperiodic_low_support")
        self.assertIsNone(result["supported_harvest_agreement_fraction"])

    def test_original_voiced_window_kept_and_rms_stratified(self):
        for amplitude, expected in ((.001, "lt_minus40"), (.02, "minus40_to_minus30"), (.1, "ge_minus30")):
            values = arrays()
            values["waveform"][:] = amplitude
            result = level.assess(values, 0, was_accepted=True)
            self.assertTrue(result["accepted"])
            self.assertEqual(result["category"], "voiced")
            self.assertEqual(result["rms_stratum"], expected)

    def test_invalid_values_rejected_not_silently_repaired(self):
        values = quiet(arrays())
        values["features"][0, 0] = np.nan
        self.assertFalse(level.assess(values, 0)["accepted"])
        values = quiet(arrays())
        values["cf0"][0] = -1
        self.assertFalse(level.assess(values, 0)["accepted"])

    def test_end_to_end_protected_splits_groups_unique_and_stats_not_recomputed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            gate_path = fixture(root)
            gate_before = gate_path.read_bytes()
            stats = gate_path.parent / "stats.npz"
            stats_before = stats.read_bytes()
            result = level.prepare(gate_path, root / "new_gate")
            self.assertEqual(result["schema"], "mini.sifigan-level-windows.v1")
            self.assertEqual(result["status"], "complete")
            self.assertFalse(result["normalization_changed"])
            self.assertEqual(stats.read_bytes(), stats_before)
            self.assertEqual(gate_path.read_bytes(), gate_before)
            self.assertEqual(set(row["case"] for row in result["fit_windows"]), level.FIT_CASES)
            self.assertEqual(set(row["case"] for row in result["heldout_windows"]), level.HELDOUT_CASES)
            self.assertIn("quiet", result["fit_category_counts"])
            self.assertIn("voiced", result["fit_category_counts"])
            keys = [(row["case"], row["start_frame"]) for row in result["fit_windows"]]
            self.assertEqual(len(keys), len(set(keys)))
            indices = [i for group in result["fit_groups"] for i in group["window_indices"]]
            self.assertEqual(sorted(indices), list(range(len(keys))))
            self.assertEqual(len(result["heldout_windows"]), 5 * 5)
            self.assertEqual(stat.S_IMODE((root / "new_gate").stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE((root / "new_gate/level_windows.json").stat().st_mode), 0o600)
            self.assertFalse((root / "new_gate/stats.npz").exists())

    def test_bound_original_stats_tamper_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            gate_path = fixture(root)
            (gate_path.parent / "stats.npz").write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "normalizer_changed"):
                level.validate_inputs(gate_path)


if __name__ == "__main__":
    unittest.main()
