"""Pure synthetic DSP tests; no original audio, model, file output or rendering."""
import json
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_local_transient_trial as local

SR, N = 24000, 115200
START, END, PLATEAU_START, PLATEAU_END = 48960, 50400, 49320, 50040
TIME = np.arange(N)/SR


def amplitude(samples, frequency):
    t = TIME[PLATEAU_START:PLATEAU_END]
    design = np.column_stack((np.sin(2*np.pi*frequency*t), np.cos(2*np.pi*frequency*t), np.ones(len(t))))
    coefficient = np.linalg.lstsq(design, samples[PLATEAU_START:PLATEAU_END], rcond=None)[0]
    return float(np.hypot(coefficient[0], coefficient[1]))


class LocalTransientTests(unittest.TestCase):
    def test_outside_window_float32_bitexact_and_input_unchanged(self):
        rng = np.random.default_rng(20261018)
        for dtype in (np.float32, np.float64):
            x = (rng.normal(size=N)*.02).astype(dtype)
            x[0], x[-1] = -0., 0.
            original = x.tobytes()
            for depth in (2., 4.):
                y, facts = local.soften(x, depth)
                self.assertEqual(y.dtype, np.float32)
                self.assertEqual(y.shape, (N,))
                self.assertTrue(np.isfinite(y).all())
                outside = np.r_[0:START, END:N]
                np.testing.assert_array_equal(y[outside].view(np.uint32), x.astype(np.float32)[outside].view(np.uint32))
                self.assertEqual(x.tobytes(), original)
                self.assertIsInstance(facts, dict)
                json.dumps(facts, allow_nan=False)

    def test_burst_6k_plateau_attenuated_by_requested_depth_not_fullband_assumption(self):
        burst = ((TIME >= 2.02) & (TIME < 2.12)).astype(float)
        x = .04*np.sin(2*np.pi*1000*TIME) + .03*np.sin(2*np.pi*6000*TIME)*burst
        for depth in (2., 4.):
            y, _ = local.soften(x, depth)
            actual = 20*np.log10(amplitude(y, 6000)/amplitude(x, 6000))
            self.assertAlmostEqual(actual, -depth, delta=.01)
            low_change = 20*np.log10(amplitude(y, 1000)/amplitude(x, 1000))
            self.assertAlmostEqual(low_change, 0., delta=.001)

    def test_whole_one_kilohertz_change_is_negligible_not_a_whole_clip_eq(self):
        x = (.1*np.sin(2*np.pi*1000*TIME)).astype(np.float32)
        y, _ = local.soften(x, 4.)
        error = y[START:END].astype(float)-x[START:END]
        relative_rms = np.sqrt(np.mean(error**2))/np.sqrt(np.mean(x[START:END].astype(float)**2))
        self.assertLess(relative_rms, 1e-4)
        self.assertLess(float(np.max(np.abs(error))), 2e-6)

    def test_recovered_high_frequency_envelope_is_fixed_minimum_jerk(self):
        x = np.sin(2*np.pi*6000*TIME)
        y, _ = local.soften(x, 4.)
        # At6kHz all odd samples have |sin|=1; normalize by the measured plateau.
        index = np.arange(START+1, END, 2)
        attenuation = (x[index]-y[index])/x[index]
        plateau = (index >= PLATEAU_START) & (index < PLATEAU_END)
        observed = attenuation/np.median(attenuation[plateau])
        expected = np.ones(len(index))
        up = index < PLATEAU_START
        down = index >= PLATEAU_END
        for mask, u in ((up, (index[up]-START)/(PLATEAU_START-START)),
                        (down, (END-index[down])/(END-PLATEAU_END))):
            expected[mask] = u**3*(10-15*u+6*u*u)
        np.testing.assert_allclose(observed, expected, atol=2e-5, rtol=0)

    def test_zero_input_and_invalid_shapes_dtype_depth_or_nonfinite(self):
        zeros = np.zeros(N, dtype=np.float64)
        y, facts = local.soften(zeros, 2.)
        np.testing.assert_array_equal(y, zeros.astype(np.float32))
        json.dumps(facts, allow_nan=False)
        invalid = [zeros[:-1], zeros[:, None], zeros.astype(np.int16), zeros.astype(np.float16),
                   np.full(N, np.nan), np.full(N, np.inf)]
        for value in invalid:
            with self.subTest(shape=value.shape, dtype=value.dtype), self.assertRaises(ValueError):
                local.soften(value, 2.)
        for depth in (0., -2., 3., float("nan"), float("inf")):
            with self.subTest(depth=depth), self.assertRaises(ValueError):
                local.soften(zeros, depth)

    def test_centered_129tap_dependency_does_not_extend_beyond_64_samples(self):
        x = (.04*np.sin(2*np.pi*1000*TIME)+.03*np.sin(2*np.pi*6000*TIME)).astype(np.float64)
        changed = x.copy()
        changed[START-65] += .5
        changed[END+64] -= .5
        first, _ = local.soften(x, 4.)
        second, _ = local.soften(changed, 4.)
        # FFT rounding may be global at tiny numerical precision; no physical filter tail beyond64.
        np.testing.assert_allclose(first[START:END], second[START:END], atol=1e-7, rtol=0)


if __name__ == "__main__":
    unittest.main()
