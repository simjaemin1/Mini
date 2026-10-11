"""Synthetic-only tests for memory-only analysis level matching."""

from __future__ import annotations

import unittest

import numpy as np

import diagnose_vibrato_components_levelled as levelled
import mac_mps_ddsp_pilot as pilot


class LevelledComponentsTests(unittest.TestCase):
    def test_rms_match_changes_only_copy_and_reports_gain(self):
        t = np.arange(pilot.WINDOW_SAMPLES) / pilot.SAMPLE_RATE
        source = (0.05 * np.sin(2 * np.pi * 400 * t)).astype(np.float32)
        component = source / 20
        before = component.copy()
        aligned, audit = levelled._analysis_match(source, component)
        self.assertTrue(audit["matched"])
        self.assertEqual(audit["limit"], "target")
        self.assertAlmostEqual(audit["gain"], 20.0, places=4)
        self.assertAlmostEqual(audit["difference_after_db"], 0.0, places=4)
        np.testing.assert_array_equal(component, before)
        np.testing.assert_allclose(aligned, source, atol=1e-7)

    def test_gain_cap_is_explicit_and_does_not_invent_a_match(self):
        source = np.full(pilot.WINDOW_SAMPLES, 0.05, np.float32)
        component = np.full(pilot.WINDOW_SAMPLES, 1e-5, np.float32)
        aligned, audit = levelled._analysis_match(source, component)
        self.assertFalse(audit["matched"])
        self.assertEqual(audit["limit"], "gain_cap")
        self.assertEqual(audit["gain"], levelled.MAX_GAIN)
        self.assertLess(levelled._rms(aligned), levelled._rms(source))

    def test_peak_cap_is_explicit_and_prevents_clipping(self):
        source = np.full(pilot.WINDOW_SAMPLES, 0.05, np.float32)
        component = np.full(pilot.WINDOW_SAMPLES, 1e-3, np.float32)
        component[0] = 0.5
        aligned, audit = levelled._analysis_match(source, component)
        self.assertFalse(audit["matched"])
        self.assertEqual(audit["limit"], "peak_cap")
        self.assertLessEqual(float(np.max(np.abs(aligned))), levelled.MAX_PEAK + 1e-6)


if __name__ == "__main__":
    unittest.main()
