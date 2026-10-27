import unittest

import numpy as np

import timbre_metrics as metric


def tone(hz=440., amplitude=.1):
    return amplitude * np.sin(2 * np.pi * hz * np.arange(11520) / 24000)


class TimbreMetricTests(unittest.TestCase):
    def test_identity_and_same_support(self):
        x = tone()
        result = metric.summary(x, x)
        self.assertEqual(result["unit_magnitude_L2_distance_on_support"]["maximum"], 0.)
        self.assertEqual(result["source_support_frames"], 96)
        self.assertEqual(result["candidate_zero_spectral_norm_on_source_support"], 0)
        self.assertFalse(result["audio_modified"])
        self.assertFalse(result["perceptually_approved"])

    def test_constant_gain_invariance_of_analysis_not_audio(self):
        x = tone()
        result = metric.summary(x * 17, x)
        self.assertLess(result["unit_magnitude_L2_distance_on_support"]["maximum"], 1e-12)
        self.assertGreater(result["cosine_similarity_on_support"]["mean"], 1 - 1e-12)

    def test_wrong_spectrum_separates_and_silence_not_excluded(self):
        x = tone()
        wrong = metric.summary(tone(1760), x)
        silent = metric.summary(np.zeros_like(x), x)
        self.assertGreater(wrong["unit_magnitude_L2_distance_on_support"]["mean"], 1.3)
        self.assertEqual(silent["candidate_zero_spectral_norm_on_source_support"], 96)
        self.assertAlmostEqual(silent["unit_magnitude_L2_distance_on_support"]["mean"], 1.)
        self.assertEqual(wrong["source_support_mask_sha256"], silent["source_support_mask_sha256"])

    def test_source_quiet_retained_and_candidate_cannot_change_mask(self):
        x = np.concatenate((np.zeros(5760), tone()[:5760]))
        result = metric.summary(np.full_like(x, .2), x)
        self.assertGreater(result["source_quiet_frames"], 0)
        self.assertEqual(result["unit_magnitude_L2_distance_all_frames"]["count"], 96)
        self.assertEqual(result["source_quiet_frames"] + result["source_support_frames"], 96)

    def test_invalid_data_rejected(self):
        for y, x in ((np.zeros(120), np.zeros(120)), (tone(), tone()[:-1]),
                     (tone(), np.full(11520, np.nan)), (tone().reshape(2, -1), tone())):
            with self.assertRaises(ValueError):
                metric.summary(y, x)

    def test_one_sided_energy_doubles_interior_not_DC(self):
        x = .1 + tone(3750, np.sqrt(2) * .1)
        result = metric.summary(x, x)
        bands = result["spectral_energy_bands_on_support"]
        self.assertAlmostEqual(bands["0_1k"]["source_fraction"]["mean"], .5, delta=.01)
        self.assertAlmostEqual(bands["3_6k"]["source_fraction"]["mean"], .5, delta=.01)

    def test_parameter_power_units_and_AP_amplitude(self):
        sp = np.ones((4, 1025))
        ap = np.full_like(sp, .1)
        result = metric.parameter_summary(sp, sp * 10, ap, ap * 10, np.ones(4, bool))
        self.assertAlmostEqual(result["power_abs_db_on_support"]["mean"], 10.)
        self.assertAlmostEqual(result["bands"]["3_6k"]["AP_abs_amplitude_db"]["mean"], 20.)
        self.assertEqual(result["power_shape_abs_db_after_per_frame_median_offset_on_support"]["maximum"], 0.)
        self.assertFalse(result["representation_sufficiency_proven"])
        with self.assertRaises(ValueError):
            metric.parameter_summary(sp, sp, ap, ap, np.zeros(4))
        with self.assertRaises(ValueError):
            metric.parameter_summary(sp[:0], sp[:0], ap[:0], ap[:0], np.zeros(0, bool))


if __name__ == "__main__":
    unittest.main()
