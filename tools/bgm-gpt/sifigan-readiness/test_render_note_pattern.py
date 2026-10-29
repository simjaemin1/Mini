"""Pure synthetic four-note control/RNG/mask tests; no model, GPU or original."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import render_note_pattern as pattern


def source_controls():
    time = np.arange(pattern.FRAMES) / 200.
    cf0 = (440 * 2 ** (.1 * np.sin(2 * np.pi * 5 * time))).astype(np.float32)
    f0 = cf0.copy()
    f0[:139] = 0
    features = np.arange(pattern.FRAMES * 43, dtype=np.float32).reshape(pattern.FRAMES, 43) / 1000.
    return f0, cf0, features


class NotePatternTests(unittest.TestCase):
    def test_hard_curve_exact_fixed_four_notes(self):
        expected = np.repeat(np.array([0., 2., 5., 2.]), [300, 220, 220, 220])
        curve = pattern.build_offset_curve("0ms")
        self.assertEqual(curve.dtype, np.float64)
        self.assertEqual(curve.tobytes(), expected.tobytes())
        self.assertEqual(pattern.note_slices(), [(0, 300), (300, 520), (520, 740), (740, 960)])
        with self.assertRaises(ValueError): pattern.build_offset_curve("100ms")

    def test_centered20ms_exact_quintic_endpoints_only_near_boundaries(self):
        hard, smooth = [pattern.build_offset_curve(v) for v in pattern.VARIANTS]
        progress = np.array([0., .103515625, .5, .896484375, 1.])
        changed = []
        for index, boundary in enumerate(pattern.BOUNDARIES):
            expected = pattern.OFFSETS[index] + (pattern.OFFSETS[index + 1] - pattern.OFFSETS[index]) * progress
            np.testing.assert_array_equal(smooth[boundary - 2:boundary + 3], expected)
            self.assertEqual(smooth[boundary - 2], pattern.OFFSETS[index])
            self.assertEqual(smooth[boundary + 2], pattern.OFFSETS[index + 1])
            changed.extend([boundary - 1, boundary, boundary + 1])
        self.assertEqual(np.flatnonzero(hard != smooth).tolist(), changed)
        self.assertGreaterEqual(float(smooth.min()), 0)
        self.assertLessEqual(float(smooth.max()), 5)

    def test_source_bytes_and_zero_mask_unchanged_exact_ratio_and_factor(self):
        f0, cf0, features = source_controls()
        original = [v.tobytes() for v in (f0, cf0, features)]
        for variant in pattern.VARIANTS:
            result = pattern.pattern_controls(f0, cf0, features, variant)
            expected_factor = np.power(2., result["offset_semitones"] / 12.)
            np.testing.assert_array_equal(result["factor"], expected_factor)
            for name, source in (("f0", f0), ("cf0", cf0)):
                expected = (source.astype(np.float64) * expected_factor).astype(np.float32)
                self.assertEqual(result[name].tobytes(), expected.tobytes())
            np.testing.assert_array_equal(result["f0"] == 0, f0 == 0)
            self.assertEqual(result["cf0"][:298].tobytes(), cf0[:298].tobytes())
            self.assertTrue(np.allclose(result["cf0"][600:700] / cf0[600:700], 2 ** (5 / 12)))
        self.assertEqual([v.tobytes() for v in (f0, cf0, features)], original)

    def test_invalid_control_shapes_allzero_nonfinite_and_range_rejected(self):
        for kind in ("shape", "allzero", "negative", "cf0zero", "NaN", "dtype", "shiftedhigh"):
            f0, cf0, features = source_controls()
            if kind == "shape": f0 = f0[:-1]
            if kind == "allzero": f0[:] = 0
            if kind == "negative": f0[150] = -1
            if kind == "cf0zero": cf0[150] = 0
            if kind == "NaN": features[150, 2] = np.nan
            if kind == "dtype": cf0 = cf0.astype(np.float64)
            if kind == "shiftedhigh": cf0[600] = 1700
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                pattern.pattern_controls(f0, cf0, features, "20ms")

    def test_boundary_masks_halfopen_complementary_nonoverlapping(self):
        masks = pattern.boundary_masks()
        self.assertEqual(int(masks["boundary"].sum()), 96)
        self.assertEqual(int(masks["steady"].sum()), 864)
        self.assertTrue(np.all(masks["boundary"] ^ masks["steady"]))
        for boundary in pattern.BOUNDARIES:
            self.assertTrue(masks["boundary"][boundary - 16])
            self.assertTrue(masks["boundary"][boundary + 15])
            self.assertFalse(masks["boundary"][boundary + 16])
        for invalid in ((300, 310, 740), (1, 520, 740), (300, 520, 959)):
            with patch.object(pattern, "BOUNDARIES", invalid), self.assertRaises(ValueError):
                pattern.boundary_masks()

    def test_three_forward_rng_repeat_and_after_baseline_restored(self):
        rng, expected = np.random.default_rng(20261027), np.random.default_rng(20261027)
        original = expected.standard_normal(pattern.SAMPLES).astype(np.float32)
        calls, noise = [], []
        def render(variant):
            calls.append(variant)
            value = rng.standard_normal(pattern.SAMPLES).astype(np.float32)
            noise.append(value.copy())
            return value + np.float32(0 if variant == "baseline" else .01)
        baseline, variants, before, after, states = pattern.pattern_inference(render,
            lambda: dict(rng.bit_generator.state), lambda state: setattr(rng.bit_generator, "state", state), original)
        self.assertEqual(calls, ["baseline", "0ms", "20ms"])
        self.assertEqual(baseline.tobytes(), original.tobytes())
        self.assertEqual(noise[0].tobytes(), noise[1].tobytes())
        self.assertEqual(noise[0].tobytes(), noise[2].tobytes())
        self.assertEqual(states["0ms"], before)
        self.assertEqual(states["20ms"], before)
        self.assertEqual(rng.bit_generator.state, after)
        self.assertEqual(rng.standard_normal(), expected.standard_normal())
        self.assertEqual(set(variants), set(pattern.VARIANTS))

    def test_bad_baseline_stops_before_variants_and_fail_restores_rng(self):
        zero, calls = np.zeros(pattern.SAMPLES, np.float32), []
        def mismatch(variant):
            calls.append(variant)
            return zero + np.float32(.001)
        with self.assertRaisesRegex(ValueError, "not_byte_exact"):
            pattern.pattern_inference(mismatch, lambda: None, lambda state: None, zero)
        self.assertEqual(calls, ["baseline"])
        rng, expected = np.random.default_rng(7), np.random.default_rng(7)
        expected.standard_normal()
        def fail(variant):
            rng.standard_normal()
            if variant != "baseline": raise RuntimeError("variant failed")
            return zero.copy()
        with self.assertRaisesRegex(RuntimeError, "variant failed"):
            pattern.pattern_inference(fail, lambda: dict(rng.bit_generator.state),
                lambda state: setattr(rng.bit_generator, "state", state), zero)
        self.assertEqual(rng.standard_normal(), expected.standard_normal())

    def test_fixed_source_counts_boundary_exclusion_and_pernote_metrics(self):
        import prepare_corpus
        f0, _, _ = source_controls()
        rd = dict(yin_hz=f0.copy(), periodicity=np.ones(pattern.FRAMES, np.float32),
            rms_db=np.full(pattern.FRAMES, -30, np.float32))
        wave = np.full(pattern.SAMPLES, .01, np.float32)
        curves = {v: pattern.build_offset_curve(v) for v in pattern.VARIANTS}
        measured = []
        for variant in pattern.VARIANTS:
            candidate = {k: val.copy() for k, val in rd.items()}
            candidate["yin_hz"] = (f0.astype(np.float64) * np.power(2., curves[variant] / 12.)).astype(np.float32)
            candidate["yin_hz"][[200, 300]] = 0  # One steady and one boundary missing.
            measured.append(candidate)
        with patch.object(prepare_corpus, "diagnostics", side_effect=[rd, rd, *measured]):
            report = pattern.raw_diagnostics(wave, wave, {v: wave.copy() for v in pattern.VARIANTS}, curves)
        for variant in pattern.VARIANTS:
            rows = report["variants"][variant]
            scopes = rows["source_fixed_scopes"]
            self.assertEqual(scopes["all"]["reference_support_frames"], 821)
            self.assertEqual(scopes["steady"]["reference_support_frames"], 725)
            self.assertEqual(scopes["boundary"]["reference_support_frames"], 96)
            self.assertEqual(scopes["all"]["candidate_missing_frames"], 2)
            self.assertEqual(scopes["steady"]["candidate_missing_frames"], 1)
            self.assertEqual(scopes["boundary"]["candidate_missing_frames"], 1)
            self.assertEqual(scopes["all"]["near50c_fraction_reference_support"], 819 / 821)
            self.assertEqual([n["steady_relative_to_baseline"]["reference_support_frames"] for n in rows["per_note"]], [145, 188, 188, 204])
            self.assertEqual([n["relative_to_baseline"]["target_offset_median_cents_on_fixed_source"] for n in rows["per_note"]], [0, 200, 500, 200])
            self.assertEqual([b["source_fixed"]["reference_support_frames"] for b in rows["per_boundary"]], [32, 32, 32])
            for row in rows["per_note"]:
                self.assertLess(row["relative_to_baseline"]["median_abs_error_cents"], .001)
            self.assertIn("cannot prove20ms", rows["analysis_limit"])

    def test_save_private_mixed_control_dtypes_and_resource_contract(self):
        f0, cf0, features = source_controls()
        controls = pattern.pattern_controls(f0, cf0, features, "20ms")
        masks = pattern.boundary_masks()
        arrays = dict(controls, boundary_mask=masks["boundary"], features=features)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pattern.npz"
            with patch.object(pattern.prior.shutil, "disk_usage", return_value=type("Usage", (), {"free": 14 * pattern.GIB})()):
                row = pattern.prior.save_arrays(path, arrays)
            with np.load(path, allow_pickle=False) as archive:
                for key, value in arrays.items():
                    self.assertEqual(archive[key].dtype, value.dtype)
                    self.assertEqual(archive[key].tobytes(), value.tobytes())
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(set(row["array_sha256"]), set(arrays))
        self.assertEqual(pattern.MAX_SECONDS, 300)
        self.assertEqual(pattern.MAX_BYTES, 50_000_000)
        flags = pattern.design_flags()
        for key in ("training", "output_processing", "new_score_or_music", "denoising", "source_PCM_mixed_into_output", "weights_written"):
            self.assertIs(flags[key], False)
        for key in ("borrowed_source_vibrato", "borrowed_source_articulation", "no_second_lowpass", "three_forwards_only"):
            self.assertIs(flags[key], True)

    def test_boundary_waveform_levels_finite_zero_floor_and_exact_common_region(self):
        zero = np.zeros(pattern.SAMPLES, np.float32)
        baseline, candidate = np.full_like(zero, 2), np.full_like(zero, 3)
        start, end = 284 * pattern.HOP, 316 * pattern.HOP
        baseline[start:end], candidate[start:end] = .1, .2
        report = pattern.boundary_waveform_stats(zero, baseline, candidate, 284, 316)
        self.assertEqual(report["samples"], 32 * pattern.HOP)
        self.assertEqual(report["rms_amplitude_floor"], 1e-12)
        self.assertEqual(report["roles"]["reference"]["region_rms_dbfs"], -240.)
        self.assertAlmostEqual(report["roles"]["baseline"]["peak"], .1, places=7)
        self.assertAlmostEqual(report["roles"]["candidate"]["peak"], .2, places=7)
        self.assertAlmostEqual(report["roles"]["baseline"]["region_rms_dbfs"], -20., places=6)
        for row in report["roles"].values():
            self.assertEqual(row["samples_at_or_above_unit_peak"], 0)
            self.assertEqual(row["max_abs_adjacent_chunk_rms_step_db"], 0.)
            self.assertTrue(all(np.isfinite(value) for value in row.values()))
        self.assertTrue(report["descriptive_only_not_artifact_detector_or_quality_pass"])
        with self.assertRaises(ValueError):
            pattern.boundary_waveform_stats(zero, baseline, candidate, -1, 316)


if __name__ == "__main__":
    unittest.main()
