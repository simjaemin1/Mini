"""Synthetic NumPy-only diagnostics tests; no model, real data or audio I/O."""
import json
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pilot_metrics as metrics


class PilotMetricsTests(unittest.TestCase):
    def inputs(self, frames=100):
        t = np.arange(frames)
        pitch = 440 * 2 ** ((12 * np.sin(2 * np.pi * t / 20)) / 1200)
        wave = .02 * np.sin(2 * np.pi * np.arange(2400) / 55)
        level = -30 + 2 * np.sin(2 * np.pi * t / 31)
        return [wave.copy(), wave.copy(), pitch.copy(), np.ones(frames),
                pitch.copy(), np.ones(frames), level.copy(), level.copy()]

    def test_perfect_copy_has_fixed_support_zero_errors_and_json_safe_output(self):
        inputs = self.inputs()
        before = [v.tobytes() for v in inputs]
        r = metrics.summary(*inputs)
        self.assertEqual(r["pitch"]["reference_support_frames"], 100)
        self.assertEqual(r["pitch"]["candidate_voicing_coverage"], 1)
        self.assertEqual(r["pitch"]["near50c_fraction_reference_support"], 1)
        self.assertEqual(r["pitch"]["p95_abs_cents"], 0)
        self.assertAlmostEqual(r["pitch_contour"]["same_time_centered_correlation"], 1)
        self.assertEqual(r["adjacent_frame_pitch_proxy"]["same_time_step_difference_rms_cents"], 0)
        self.assertEqual(r["level_contour"]["residual_rms_after_single_median_offset_db"], 0)
        self.assertFalse(r["naturalness_approved"])
        json.dumps(r, allow_nan=False)
        self.assertEqual(before, [v.tobytes() for v in inputs])

    def test_octave_error_is_not_hidden_by_pitch_class_or_centered_contour(self):
        values = self.inputs()
        values[4] *= 2
        r = metrics.summary(*values)
        self.assertEqual(r["pitch"]["candidate_voicing_coverage"], 1)
        self.assertEqual(r["pitch"]["near50c_fraction_reference_support"], 0)
        self.assertEqual(r["pitch"]["octave_up_frames"], 100)
        self.assertAlmostEqual(r["pitch"]["median_abs_cents"], 1200)
        self.assertLess(r["pitch_contour"]["same_time_residual_rms_after_single_median_offset_cents"], 1e-10)

    def test_candidate_dropouts_cannot_shrink_denominator_or_source_mask(self):
        values = self.inputs()
        baseline = metrics.summary(*values)
        values[4][20:40] = 0
        values[5][40:50] = .89
        values[7][50:60] = -60
        r = metrics.summary(*values)
        p = r["pitch"]
        self.assertEqual(p["reference_support_mask_sha256"], baseline["pitch"]["reference_support_mask_sha256"])
        self.assertEqual(p["reference_support_frames"], 100)
        self.assertEqual(p["shared_confident_voiced_frames"], 60)
        self.assertEqual(p["candidate_voicing_coverage"], .6)
        self.assertEqual(p["near50c_fraction_reference_support"], .6)
        self.assertEqual(p["p95_abs_cents"], 0)
        self.assertFalse(r["pitch_contour"]["complete_generated_support"])
        self.assertEqual(r["pitch_contour"]["source_only_support_frames"], 100)

    def test_reference_boundaries_and_unvoiced_estimates_separately_counted(self):
        values = self.inputs(frames=10)
        values[2][0] = 0
        values[3][1] = .8999
        values[3][2] = .90
        values[6][3] = -60
        values[6][4] = -59.999
        r = metrics.summary(*values)["pitch"]
        self.assertEqual(r["reference_support_frames"], 7)
        self.assertEqual(r["reference_unvoiced_estimate_frames"], 1)
        self.assertEqual(r["reference_other_uncertain_or_quiet_frames"], 2)
        self.assertEqual(r["generated_voicing_on_reference_unvoiced_estimates"], 1)

    def test_no_reference_support_has_no_division_by_zero_or_nan(self):
        values = self.inputs()
        values[2][:] = 0
        r = metrics.summary(*values)
        self.assertIsNone(r["pitch"]["candidate_voicing_coverage"])
        self.assertIsNone(r["pitch"]["near50c_fraction_reference_support"])
        self.assertIsNone(r["pitch_contour"]["source_detrended_rms_cents"])
        self.assertIsNone(r["adjacent_frame_pitch_proxy"]["source_step_rms_cents"])
        self.assertEqual(r["level_contour"]["reference_support_frames"], 100)
        json.dumps(r, allow_nan=False)

    def test_constant_pitch_correlation_is_undefined_not_perfect(self):
        values = self.inputs()
        values[2][:] = values[4][:] = 440
        r = metrics.summary(*values)["pitch_contour"]
        self.assertIsNone(r["same_time_centered_correlation"])
        self.assertIsNone(r["same_time_detrended_correlation"])

    def test_pitch_proxies_never_bridge_missing_reference_frames(self):
        values = self.inputs(frames=10)
        values[3][:] = 0
        values[3][[1, 2, 6, 7]] = 1
        r = metrics.summary(*values)["adjacent_frame_pitch_proxy"]
        self.assertEqual(r["source_consecutive_pairs"], 2)
        self.assertEqual(r["shared_measured_consecutive_pairs"], 2)
        self.assertEqual(r["same_time_step_difference_rms_cents"], 0)

    def test_level_contour_removes_only_one_global_offset_and_retains_dropouts(self):
        values = self.inputs(frames=10)
        values[7] = values[6] + 3
        values[7][0] += 2
        r = metrics.summary(*values)["level_contour"]
        self.assertEqual(r["single_median_generated_minus_reference_offset_db"], 3)
        self.assertAlmostEqual(r["residual_rms_after_single_median_offset_db"], np.sqrt(.4))
        values[7][0] = -120
        r = metrics.summary(*values)["level_contour"]
        self.assertEqual(r["reference_support_frames"], 10)
        self.assertEqual(r["generated_frames_at_or_below_minus60_on_reference_support"], 1)
        self.assertGreater(r["residual_rms_after_single_median_offset_db"], 20)

    def test_silence_and_unit_peak_are_reported_without_audio_repair(self):
        values = self.inputs()
        values[0][:] = 0
        values[4][:] = 0
        r = metrics.summary(*values)
        self.assertTrue(r["generated_waveform"]["effectively_silent_rms_below_1e_minus8"])
        self.assertIsNone(r["generated_waveform"]["rms_dbfs"])
        self.assertEqual(r["pitch"]["candidate_voicing_coverage"], 0)
        values[0][0] = 2
        r = metrics.summary(*values)
        self.assertEqual(r["generated_waveform"]["samples_at_or_above_unit_peak"], 1)
        self.assertEqual(r["generated_waveform"]["peak"], 2)

    def test_shape_nonfinite_and_feature_domain_errors_rejected(self):
        changes = [(0, np.zeros((1, 2400))), (0, np.array([])),
                   (0, np.zeros(2399)), (2, np.zeros(99)),
                   (2, np.full(100, np.nan)), (4, np.full(100, -1.)),
                   (3, np.full(100, 1.01)), (5, np.full(100, -.01)),
                   (7, np.full(100, np.inf))]
        for index, value in changes:
            with self.subTest(index=index, shape=value.shape):
                inputs = self.inputs()
                inputs[index] = value
                with self.assertRaises(ValueError):
                    metrics.summary(*inputs)


if __name__ == "__main__":
    unittest.main()
