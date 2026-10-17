"""Only synthetic WAVs/feature fixtures; no NGC data, WORLD call, or torch."""
import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import evaluate_world_pitch as evaluator


def fixture(path, hz=440, seconds=1., phase=0., amplitude=.1):
    time = np.arange(round(seconds * 24000)) / 24000
    signal = amplitude * np.sin(2 * np.pi * hz * time + phase) if hz else np.zeros(len(time))
    sf.write(path, signal, 24000, subtype="FLOAT")


class IndependentPitchTests(unittest.TestCase):
    def test_same_pitch_different_phase_and_plus1_semitone(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source, copy, shifted = base / "source.wav", base / "copy.wav", base / "shift.wav"
            fixture(source)
            fixture(copy, phase=1.2)
            fixture(shifted, hz=440 * 2**(1 / 12), phase=.7)
            plain = evaluator.evaluate(source, copy, 0)
            transposed = evaluator.evaluate(source, shifted, 1)
            for result in (plain, transposed):
                pitch = result["pitch"]
                self.assertTrue(pitch["numerical_eligible_provisional"])
                self.assertGreaterEqual(pitch["source_valid_stable_frames"], 85)
                self.assertLess(pitch["p95_abs_cents"], 2)
                self.assertEqual(pitch["near50c_fraction_source_valid"], 1)
                self.assertFalse(result["natural_timbre_approved"])
            wrong_target = evaluator.evaluate(source, shifted, 0)
            self.assertFalse(wrong_target["pitch"]["numerical_eligible_provisional"])
            self.assertAlmostEqual(wrong_target["pitch"]["median_signed_cents"], 100, delta=2)

    def test_octave_error_never_hidden_by_pitch_class_or_candidate_mask(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source, candidate = base / "source.wav", base / "octave.wav"
            fixture(source)
            fixture(candidate, hz=880)
            result = evaluator.evaluate(source, candidate, 0)["pitch"]
            self.assertFalse(result["numerical_eligible_provisional"])
            self.assertEqual(result["octave_error_frames"], result["source_valid_stable_frames"])
            self.assertEqual(result["octave_up_frames"], result["source_valid_stable_frames"])
            self.assertEqual(result["near50c_fraction_source_valid"], 0)

    def test_silent_source_and_silent_candidate_are_null_safe(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            tone, silence = base / "tone.wav", base / "silence.wav"
            fixture(tone)
            fixture(silence, hz=0)
            silent_report = evaluator.evaluate(silence, tone, 0)
            self.assertEqual(silent_report["analysis_level_calibration"]["common_analysis_gain"], 1)
            self.assertIsNone(silent_report["analysis_level_calibration"]["raw_source_rms_dbfs"])
            source_silent = silent_report["pitch"]
            self.assertEqual(source_silent["source_valid_stable_frames"], 0)
            self.assertIsNone(source_silent["median_abs_cents"])
            self.assertIsNone(source_silent["candidate_voicing_coverage"])
            candidate_silent = evaluator.evaluate(tone, silence, 0)["pitch"]
            self.assertEqual(candidate_silent["candidate_voicing_coverage"], 0)
            self.assertEqual(candidate_silent["near50c_fraction_source_valid"], 0)
            self.assertIsNone(candidate_silent["p95_abs_cents"])
            self.assertFalse(candidate_silent["numerical_eligible_provisional"])
            json.dumps([source_silent, candidate_silent], allow_nan=False)

    def test_quiet_source_common_gain_and_candidate_dropout_denominator(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source, copy, dropout = base / "source.wav", base / "copy.wav", base / "dropout.wav"
            amplitude = np.sqrt(2) * 10 ** (-65 / 20)
            fixture(source, amplitude=amplitude)
            fixture(copy, amplitude=amplitude, phase=.5)
            signal, rate = sf.read(source, dtype="float64")
            signal[len(signal) // 2:] = 0
            sf.write(dropout, signal, rate, subtype="FLOAT")
            before = [evaluator.sha256(path) for path in (source, copy, dropout)]
            copied = evaluator.evaluate(source, copy, 0)
            dropped = evaluator.evaluate(source, dropout, 0)
            level = copied["analysis_level_calibration"]
            self.assertAlmostEqual(level["raw_source_rms_dbfs"], -65, places=4)
            self.assertAlmostEqual(level["common_analysis_gain_db"], 35, places=4)
            self.assertAlmostEqual(level["raw_rms_delta_db"], 0, places=4)
            self.assertTrue(copied["pitch"]["numerical_eligible_provisional"])
            self.assertGreaterEqual(copied["pitch"]["source_valid_stable_frames"], 85)
            self.assertEqual(copied["pitch"]["source_mask_sha256"], dropped["pitch"]["source_mask_sha256"])
            self.assertAlmostEqual(dropped["analysis_level_calibration"]["raw_rms_delta_db"], -3.0103, places=3)
            self.assertEqual(level["common_analysis_gain"], dropped["analysis_level_calibration"]["common_analysis_gain"])
            self.assertLess(dropped["pitch"]["candidate_voicing_coverage"], .8)
            self.assertLess(dropped["pitch"]["near50c_fraction_source_valid"], .8)
            self.assertFalse(dropped["pitch"]["numerical_eligible_provisional"])
            self.assertEqual(before, [evaluator.sha256(path) for path in (source, copy, dropout)])

    def test_source_only_stability_and_voiced_boundary_guard(self):
        pitch = np.full(100, 440.)
        voice = np.ones(100, bool)
        pitch[50:] = 660
        voice[20] = False
        pitch[20] = 0
        mask = evaluator.source_stable_mask({"pitch_hz": pitch, "voiced_mask": voice})
        self.assertFalse(mask[:5].any())
        self.assertFalse(mask[-5:].any())
        self.assertFalse(mask[15:26].any())
        self.assertFalse(mask[48:52].any())
        self.assertTrue(mask[35])
        source = {"pitch_hz": pitch, "voiced_mask": voice}
        silent = {"pitch_hz": np.zeros(100), "voiced_mask": np.zeros(100, bool)}
        result = evaluator.pitch_metrics(source, silent, 0)
        self.assertEqual(result["source_mask_indices"], np.flatnonzero(mask).tolist())
        self.assertEqual(result["candidate_voicing_coverage"], 0)

    def test_full4p8s_private_json_source_integrity_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source, candidate = base / "source.wav", base / "candidate.wav"
            fixture(source, seconds=4.8)
            fixture(candidate, seconds=4.8, phase=.3)
            before = [evaluator.sha256(path) for path in (source, candidate)]
            report = evaluator.evaluate(source, candidate, 0)
            self.assertEqual(report["samples"], 115200)
            self.assertTrue(report["inputs_unchanged"])
            self.assertEqual(before, [evaluator.sha256(path) for path in (source, candidate)])
            destination = base / "report.json"
            with patch.object(evaluator, "PRIVATE_ROOT", base):
                evaluator.write_private_json(destination, report)
                with self.assertRaises(FileExistsError): evaluator.write_private_json(destination, report)
                with self.assertRaises(ValueError): evaluator.write_private_json(base.parent / "outside.json", report)
                link = base / "link.json"
                link.symlink_to(base / "absent.json")
                with self.assertRaises(FileExistsError): evaluator.write_private_json(link, report)
            self.assertEqual(stat.S_IMODE(destination.stat().st_mode), 0o600)
            self.assertEqual(json.loads(destination.read_text()), report)


if __name__ == "__main__":
    unittest.main()
