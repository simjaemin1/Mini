"""Synthetic NumPy-only tests; no original audio, model or file I/O."""
import json
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import level_metrics as metrics


class QuietLevelMetricsTests(unittest.TestCase):
    def fixture(self, frames=100):
        t = np.arange(frames * metrics.HOP) / metrics.RATE
        wave = .02 * np.sin(2 * np.pi * 400 * t)
        rr = -30 + 2 * np.sin(2 * np.pi * np.arange(frames) / 20)
        return wave.copy(), wave.copy(), rr.copy(), rr.copy()

    def test_perfect_copy_and_computed_RMS_json_are_finite(self):
        values = self.fixture()
        before = [v.tobytes() for v in values]
        result = metrics.summary(*values)
        self.assertEqual(result["source_quiet_frames"], 0)
        self.assertEqual(result["loud"]["level_contour"]["residual_rms_after_single_median_offset_db"], 0)
        self.assertEqual(result["loud"]["level_contour"]["same_time_frame_level_pearson"], 1)
        self.assertFalse(result["whole_LUFS_match_analysis"]["available"])
        self.assertFalse(result["naturalness_approved"])
        self.assertEqual(before, [v.tobytes() for v in values])
        json.dumps(result, allow_nan=False)
        computed = metrics.summary(values[0], values[1])
        self.assertEqual(computed["feature_frames"], 100)
        self.assertAlmostEqual(computed["all_frames"]["generated_frame_p50_dbfs"], -36.99, places=1)
        json.dumps(computed, allow_nan=False)

    def test_source_fixed_quiet_denominator_includes_candidate_silence_and_leak(self):
        gen, ref, rr, gr = self.fixture()
        rr[:20] = -80
        gr[:10] = -40
        gr[10:20] = -240
        result = metrics.summary(gen, ref, rr, gr)
        self.assertEqual(result["source_quiet_frames"], 20)
        self.assertEqual(result["quiet"]["source_fixed_frames"], 20)
        self.assertEqual(result["quiet"]["generated_fraction_above_minus60"], .5)
        self.assertEqual(result["quiet"]["generated_frame_p50_dbfs"], -140)
        gr[:] = -240
        changed = metrics.summary(gen, ref, rr, gr)
        self.assertEqual(result["quiet_mask_sha256"], changed["quiet_mask_sha256"])
        self.assertEqual(changed["source_quiet_frames"], 20)
        self.assertEqual(changed["quiet"]["generated_fraction_above_minus60"], 0)

    def test_quiet_intervals_are_separate_leading_internal_and_trailing(self):
        gen, ref, rr, gr = self.fixture()
        for a, b in ((0, 5), (20, 24), (95, 100)):
            rr[a:b] = -60
        result = metrics.summary(gen, ref, rr, gr)
        intervals = result["source_fixed_quiet_intervals"]
        self.assertEqual([r["location"] for r in intervals], ["clip_start", "internal", "clip_end"])
        self.assertEqual([(r["start_frame"], r["end_frame_exclusive"]) for r in intervals], [(0, 5), (20, 24), (95, 100)])
        self.assertEqual(sum(r["source_fixed_frames"] for r in intervals), 14)
        self.assertEqual(intervals[1]["start_seconds"], .1)
        self.assertEqual(intervals[1]["end_seconds_exclusive"], .12)

    def test_whole_clip_silence_never_drops_all_metrics_or_fabricates_LUFS(self):
        ref = np.zeros(12000)
        gen = np.full(12000, .01)
        result = metrics.summary(gen, ref)
        self.assertEqual(result["source_quiet_frames"], 100)
        self.assertEqual(result["source_fixed_quiet_intervals"][0]["location"], "whole_clip")
        self.assertTrue(result["quiet"]["source_exactly_zero"])
        self.assertEqual(result["quiet"]["generated_fraction_above_minus60"], 1)
        self.assertIsNone(result["quiet"]["direct_sample_generated_minus_source_db"])
        self.assertFalse(result["whole_RMS_match_analysis"]["available"])
        self.assertFalse(result["whole_LUFS_match_analysis"]["available"])
        self.assertEqual(result["loud"]["source_fixed_frames"], 0)
        json.dumps(result, allow_nan=False)

    def test_entirely_silent_candidate_remains_in_level_and_quiet_denominators(self):
        gen, ref, rr, gr = self.fixture()
        gen[:] = 0
        rr[:30] = -90
        gr[:] = -240
        result = metrics.summary(gen, ref, rr, gr)
        self.assertTrue(result["quiet"]["generated_exactly_zero"])
        self.assertEqual(result["quiet"]["source_fixed_frames"], 30)
        self.assertEqual(result["loud"]["source_fixed_frames"], 70)
        self.assertGreater(result["loud"]["level_contour"]["raw_deviation_rms_db"], 200)
        self.assertFalse(result["whole_RMS_match_analysis"]["available"])

    def test_single_offset_does_not_flatten_variable_envelope(self):
        gen, ref, rr, gr = self.fixture()
        gr = rr + 6
        gr[0] += 10
        result = metrics.summary(gen, ref, rr, gr)["loud"]["level_contour"]
        self.assertEqual(result["single_median_generated_minus_source_offset_db"], 6)
        self.assertAlmostEqual(result["residual_rms_after_single_median_offset_db"], 1)
        self.assertGreater(result["same_time_adjacent_step_difference_rms_db"], .9)

    def test_actual_supplied_LUFS_only_controls_analytical_constant(self):
        gen, ref, rr, gr = self.fixture()
        rr[:20] = -80
        gr[:20] = -30
        before = gen.tobytes()
        result = metrics.summary(gen, ref, rr, gr, reference_lufs=-40, generated_lufs=-30)
        matched = result["whole_LUFS_match_analysis"]
        self.assertTrue(matched["available"])
        self.assertEqual(matched["constant_generated_gain_db"], -10)
        self.assertEqual(matched["quiet_generated_frame_p50_dbfs"], -40)
        self.assertEqual(matched["quiet_generated_fraction_above_minus60"], 1)
        self.assertFalse(matched["saved_waveform_modified"])
        self.assertEqual(gen.tobytes(), before)

    def test_RMS_matching_proxy_uses_entire_waveform_not_candidate_regions(self):
        gen, ref, rr, gr = self.fixture()
        gen *= 2
        gr += 20 * np.log10(2)
        result = metrics.summary(gen, ref, rr, gr)
        gain = result["whole_RMS_match_analysis"]["constant_generated_gain_db"]
        self.assertAlmostEqual(gain, -20 * np.log10(2))
        self.assertIn("not LUFS", result["whole_RMS_match_analysis"]["method"])
        self.assertFalse(result["whole_LUFS_match_analysis"]["available"])

    def test_mixed_windows_and_boundary_context_are_source_only(self):
        gen, ref, rr, gr = self.fixture(frames=140)
        rr[:60] = -80
        first = metrics.summary(gen, ref, rr, gr)
        gr[:] = -240
        second = metrics.summary(gen, ref, rr, gr)
        first_windows = [(r["start_frame"], r["source_quiet_frames"]) for r in first["source_fixed_mixed_windows"]]
        second_windows = [(r["start_frame"], r["source_quiet_frames"]) for r in second["source_fixed_mixed_windows"]]
        self.assertEqual(first_windows, second_windows)
        self.assertEqual(first_windows, [(0, 60), (35, 25)])
        boundary = first["source_level_boundary_proxies"][0]
        self.assertEqual(boundary["boundary_frame"], 60)
        self.assertEqual(boundary["direction"], "quiet_to_loud")
        self.assertIn("not annotated", boundary["classification"])

    def test_optional_voicing_proxy_never_controls_source_quiet_mask(self):
        gen, ref, rr, gr = self.fixture()
        rr[:20] = -80
        f0, confidence = np.full(100, 440.), np.ones(100)
        result = metrics.summary(gen, ref, rr, gr, ref_pitch=f0, ref_periodicity=confidence,
            gen_pitch=f0, gen_periodicity=confidence)
        proxy = result["optional_pitch_proxy"]
        self.assertEqual(proxy["generated_voiced_estimate_on_source_quiet_frames"], 20)
        self.assertTrue(proxy["quiet_mask_independent_of_all_pitch_proxies"])
        self.assertTrue(proxy["periodicity_is_not_calibrated_confidence"])

    def test_validation_nonfinite_grids_LUFS_and_partial_optional_features(self):
        gen, ref, rr, gr = self.fixture()
        calls = [lambda: metrics.summary(gen[:-1], ref),
            lambda: metrics.summary(gen, ref, rr),
            lambda: metrics.summary(gen, ref, rr[:-1], gr),
            lambda: metrics.summary(gen, ref, np.full(100, np.nan), gr),
            lambda: metrics.summary(gen, ref, rr, gr, reference_lufs=-20),
            lambda: metrics.summary(gen, ref, rr, gr, reference_lufs=True, generated_lufs=-30),
            lambda: metrics.summary(gen, ref, rr, gr, reference_lufs=np.inf, generated_lufs=-30),
            lambda: metrics.summary(gen, ref, rr, gr, ref_pitch=np.ones(100)),
            lambda: metrics.summary(gen, ref, rr, gr, ref_pitch=np.ones(100), ref_periodicity=np.ones(100),
                gen_pitch=np.ones(100), gen_periodicity=np.full(100, 1.1))]
        for call in calls:
            with self.subTest(call=call), self.assertRaises(ValueError):
                call()

    def test_constant_frame_level_correlation_is_undefined_not_perfect(self):
        gen, ref, rr, gr = self.fixture()
        rr[:] = gr[:] = -30
        result = metrics.summary(gen, ref, rr, gr)
        self.assertIsNone(result["loud"]["level_contour"]["same_time_frame_level_pearson"])

    def test_extreme_LUFS_or_nonscalar_values_cannot_break_JSON_safety(self):
        values = self.fixture()
        for first, second in ((1e308, -1e308), (1e308, 0.),
                              (np.array([-24.]), -25.), (-24., np.array([-25.]))):
            with self.subTest(reference_lufs=first, generated_lufs=second):
                with self.assertRaises(ValueError):
                    metrics.summary(*values, reference_lufs=first, generated_lufs=second)
        accepted = metrics.summary(*values, reference_lufs=np.float32(-24), generated_lufs=-25.)
        self.assertEqual(accepted["whole_LUFS_match_analysis"]["constant_generated_gain_db"], 1)
        json.dumps(accepted, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
