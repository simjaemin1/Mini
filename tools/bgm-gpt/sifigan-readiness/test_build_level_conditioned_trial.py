"""Synthetic exact-controller tests: no originals, models, or actual encoding."""
import inspect
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from scipy.io import wavfile

import build_level_conditioned_trial as trial
from test_export_corpus_audition import fixture


class FakeGuard:
    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def snapshot(self):
        return {"synthetic_fixture": True}


class ExplicitLevelConditionTests(unittest.TestCase):
    def test_curve_exact_centered20ms_grid_and_minus100_floor(self):
        wave = np.linspace(-.02, .04, 1200, dtype=np.float32)
        padded = np.pad(wave.astype(np.float64), (240, 240), mode="reflect")
        expected = [20 * np.log10(max(np.sqrt(np.mean(padded[i:i + 480] ** 2)), 1e-5))
                    for i in range(0, len(wave), 120)]
        np.testing.assert_array_equal(trial.extract_curve(wave), expected)
        np.testing.assert_array_equal(trial.extract_curve(np.zeros(1200)), np.full(10, -100.))
        np.testing.assert_allclose(trial.extract_curve(np.full(1200, .01)), -40., atol=1e-12)

    def test_separate_condition_gain_formula_clamp_smoothing_and_input_preservation(self):
        self.assertEqual(list(inspect.signature(trial.apply_curve).parameters), ["carrier", "desired_db"])
        carrier = np.full(1200, .01, np.float32)
        original = carrier.tobytes()
        raw = np.array([-90., -60., -30., 0., 30., 60., 90., 0., -20., 5.])
        desired = trial.extract_curve(carrier) + raw
        actual, controls = trial.apply_curve(carrier, desired)
        bounded = np.clip(raw, -60., 60.)
        smooth = np.convolve(np.pad(bounded, (1, 1), mode="edge"), [.25, .5, .25], mode="valid")
        gain = np.interp(np.arange(1200) / 120, np.arange(10), smooth)
        expected = (carrier.astype(np.float64) * 10 ** (gain / 20)).astype(np.float32)
        np.testing.assert_array_equal(actual, expected)
        np.testing.assert_allclose(controls["desired_gain_db"], raw, atol=1e-12)
        np.testing.assert_allclose(controls["bounded_gain_db"], bounded, atol=1e-12)
        np.testing.assert_allclose(controls["smoothed_gain_db"], smooth, atol=1e-12)
        self.assertEqual(carrier.tobytes(), original)
        self.assertTrue((actual > 0).all())

    def test_gain_only_preserves_zeros_and_sign_not_reference_pcm(self):
        t = np.arange(2400) / 24000
        carrier = (.01 * np.sin(2 * np.pi * 250 * t)).astype(np.float32)
        reference = (.02 * np.sin(2 * np.pi * 630 * t)).astype(np.float32)
        carrier[100] = 0
        actual, _ = trial.apply_curve(carrier, trial.extract_curve(reference))
        self.assertEqual(actual[100], 0.)
        np.testing.assert_array_equal(np.signbit(actual), np.signbit(carrier))
        self.assertFalse(np.array_equal(actual, reference))

    def test_invalid_wave_and_condition_rejected(self):
        for wave in (np.zeros((2, 120)), np.zeros(119), np.zeros(121), np.full(120, np.nan)):
            with self.subTest(shape=wave.shape), self.assertRaises(ValueError):
                trial.extract_curve(wave)
        for desired in (np.zeros(9), np.full(10, np.inf)):
            with self.assertRaises(ValueError):
                trial.apply_curve(np.zeros(1200), desired)

    def test_fresh_bound_report_pcm_and_two_static_comparisons(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            parent, _, arrays = fixture(root)
            calls = []

            def fake_compare(items, destination, seconds):
                calls.append((items, seconds))
                destination.mkdir(mode=0o700)
                outputs = []
                for number, item in enumerate(items, 1):
                    label, source = item.split("=", 1)
                    rate, wave = wavfile.read(source)
                    case = destination.name
                    reference, before = arrays[case]
                    expected = before if number == 1 else trial.apply_curve(before, trial.extract_curve(reference))[0]
                    self.assertEqual(rate, 24000)
                    self.assertEqual(wave.tobytes(), expected.tobytes())
                    encoded = destination / f"{number:02}.m4a"
                    encoded.write_bytes(b"synthetic fixture; not actual AAC")
                    outputs.append(dict(label=label, file=encoded.name, sha256=trial.saved.sha256(encoded)))
                result = dict(schema="mini.foundation-local-static-lufs-comparison.v1", status="ready", seconds=4.8,
                    no_compression_AGC_EQ_pitch_time_edits=True, outputs=outputs)
                (destination / "comparison.json").write_text(json.dumps(result))
                return result

            output = root / "trial"
            with patch.object(trial.saved, "PRIVATE_ROOT", root), patch.object(trial, "ResourceGuard", FakeGuard):
                result = trial.build(parent, output, compare_fn=fake_compare)
            self.assertEqual(len(calls), 2)
            self.assertTrue(all(seconds == 4.8 for _, seconds in calls))
            for key in ("reference_envelope_used", "sourcecurveused", "amplitude_condition_NOT_learned", "AGC", "output_postprocessing"):
                self.assertIs(result[key], True)
            for key in ("training", "model_loaded_or_run", "quality_approved", "perceptually_approved", "new_score_or_music",
                        "source_PCM_mixed_into_output", "hard_mute_or_gate", "heldout_is_blind"):
                self.assertIs(result[key], False)
            self.assertEqual(result["params"]["waveform_time_shift_samples"], 0)
            self.assertTrue(result["params"]["offline_noncausal"])
            for row in result["cases"]:
                reference, before = arrays[row["case"]]
                with np.load(output / row["before"]["file"], allow_pickle=False) as saved:
                    self.assertEqual(saved["generated"].tobytes(), before.tobytes())
                    self.assertEqual(saved["reference"].tobytes(), reference.tobytes())
                self.assertEqual((output / row["controls"]["file"]).stat().st_mode & 0o777, 0o600)
            self.assertEqual(output.stat().st_mode & 0o777, 0o700)
            self.assertEqual(json.loads((output / "report.json").read_text())["status"],
                "explicit_reference_condition_trial_ready_not_perceptually_approved")
            with self.assertRaisesRegex(ValueError, "fresh_absolute"):
                trial.build(parent, output, compare_fn=fake_compare)


if __name__ == "__main__":
    unittest.main()
