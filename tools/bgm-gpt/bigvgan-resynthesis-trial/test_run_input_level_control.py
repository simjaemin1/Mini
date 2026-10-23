"""Synthetic tests of one source-only static gain, without any model reads."""
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_input_level_control as trial


def synthetic_source():
    times = np.arange(115200, dtype=np.float64) / 24000
    envelope = np.linspace(0.1, 1.0, 115200)
    waveform = (0.075 * envelope * np.sin(2 * np.pi * 700 * times)
                + 0.009 * np.sin(2 * np.pi * 1470 * times)).astype(np.float32)
    waveform[123] = 0.125
    waveform[37] = -0.0
    return waveform


class InputLevelControlTests(unittest.TestCase):
    def test_exact_shape_dtype_target_and_source_only_positive_constant(self):
        source = synthetic_source()
        before = source.tobytes()
        scaled, gain = trial.fixed_level(source)
        self.assertEqual(scaled.shape, (115200,))
        self.assertEqual(scaled.dtype, np.float32)
        self.assertEqual(gain, 0.5 / float(np.abs(source).max()))
        self.assertEqual(gain, 4.0)
        self.assertEqual(float(np.abs(scaled).max()), 0.5)
        self.assertEqual(source.tobytes(), before)
        self.assertFalse(np.shares_memory(source, scaled))
        expected = (source.astype(np.float64) * gain).astype(np.float32)
        self.assertEqual(scaled.tobytes(), expected.tobytes())

    def test_no_time_phase_or_framewise_envelope_change(self):
        source = synthetic_source()
        scaled, gain = trial.fixed_level(source)
        np.testing.assert_array_equal(np.signbit(scaled), np.signbit(source))
        np.testing.assert_array_equal(np.flatnonzero(scaled == 0), np.flatnonzero(source == 0))
        self.assertEqual(int(np.argmax(np.abs(scaled))), int(np.argmax(np.abs(source))))
        nonzero = source != 0
        ratios = scaled[nonzero].astype(np.float64) / source[nonzero].astype(np.float64)
        np.testing.assert_allclose(ratios, gain, rtol=1e-7, atol=0)
        for start in (0, 24000, 48000, 72000, 96000):
            with self.subTest(start=start):
                source_rms = np.sqrt(np.mean(source[start:start+12000].astype(float) ** 2))
                scaled_rms = np.sqrt(np.mean(scaled[start:start+12000].astype(float) ** 2))
                self.assertAlmostEqual(scaled_rms / source_rms, gain, places=6)

    def test_inverse_constant_recovers_source_to_float32_precision(self):
        source = synthetic_source()
        # Use a non-power-of-two gain so this is not merely exact exponent scaling.
        source[123] = np.float32(0.137)
        scaled, gain = trial.fixed_level(source)
        restored = (scaled.astype(np.float64) / gain).astype(np.float32)
        np.testing.assert_allclose(restored, source, rtol=1.3e-7, atol=1e-9)
        self.assertEqual(restored.shape, source.shape)
        self.assertTrue(np.isfinite(restored).all())

    def test_two_source_levels_have_expected_reciprocal_gain_and_same_model_input(self):
        quiet = synthetic_source()
        louder = quiet * np.float32(2)
        quiet_scaled, quiet_gain = trial.fixed_level(quiet)
        louder_scaled, louder_gain = trial.fixed_level(louder)
        self.assertEqual(quiet_gain, 4.0)
        self.assertEqual(louder_gain, 2.0)
        self.assertEqual(quiet_scaled.tobytes(), louder_scaled.tobytes())
        # A high-level finite synthetic source is attenuated, not clipped.
        high = quiet * np.float32(16)
        high_scaled, high_gain = trial.fixed_level(high)
        self.assertEqual(high_gain, 0.25)
        self.assertEqual(high_scaled.tobytes(), quiet_scaled.tobytes())

    def test_bad_shape_dtype_nonfinite_and_inaudible_sources_are_rejected(self):
        valid = synthetic_source()
        invalid = (valid[:-1], valid.reshape(1, -1), valid.reshape(-1, 1),
                   np.zeros(0, dtype=np.float32), valid.astype(np.float64),
                   valid.astype(np.float16), valid.astype(np.int32),
                   valid.astype(np.complex64), np.zeros_like(valid),
                   np.full_like(valid, 1e-9), np.full_like(valid, np.nan),
                   np.full_like(valid, np.inf), np.full_like(valid, -np.inf))
        for source in invalid:
            with self.subTest(shape=source.shape, dtype=source.dtype), self.assertRaises(ValueError):
                trial.fixed_level(source)

    def test_already_target_peak_keeps_every_float32_bit_including_signed_zero(self):
        source = synthetic_source() * np.float32(4)
        before = source.tobytes()
        scaled, gain = trial.fixed_level(source)
        self.assertEqual(gain, 1.0)
        self.assertEqual(scaled.tobytes(), before)
        self.assertEqual(source.tobytes(), before)


if __name__ == "__main__":
    unittest.main()
