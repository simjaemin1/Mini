"""Synthetic fixed-control tests: no real recordings, torch, models or GPU."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import render_pitch_control as render


def controls():
    f0 = np.full(render.FRAMES, 440, np.float32)
    f0[:23] = 0
    cf0 = np.full(render.FRAMES, 440, np.float32)
    features = np.arange(render.FRAMES * 43, dtype=np.float32).reshape(render.FRAMES, 43) / 10000
    return f0, cf0, features


class PitchControlTests(unittest.TestCase):
    def test_exact_official_factor_zero_mask_and_source_bytes_untouched(self):
        f0, cf0, features = controls()
        originals = [v.tobytes() for v in (f0, cf0, features)]
        result = render.transpose_controls(f0, cf0, features)
        self.assertEqual(render.FACTOR, 2 ** (1 / 12))
        expected = cf0.copy()
        expected *= 2 ** (1 / 12)
        self.assertEqual(result["shifted_cf0"].tobytes(), expected.tobytes())
        self.assertEqual(result["features"].tobytes(), features.tobytes())
        np.testing.assert_array_equal(result["shifted_f0"] == 0, f0 == 0)
        self.assertEqual([v.tobytes() for v in (f0, cf0, features)], originals)
        for name, source in (("source_f0", f0), ("source_cf0", cf0), ("features", features)):
            self.assertFalse(np.shares_memory(result[name], source))

    def test_all_unvoiced_invalid_shapes_nonfinite_and_ranges_fail(self):
        for kind in ("allzero", "cf0zero", "high", "shiftedhigh", "negative", "NaN", "shape", "dtype"):
            f0, cf0, features = controls()
            if kind == "allzero": f0[:] = 0
            if kind == "cf0zero": cf0[0] = 0
            if kind == "high": f0[35] = 1801
            if kind == "shiftedhigh": cf0[35] = 1790
            if kind == "negative": f0[35] = -1
            if kind == "NaN": features[0, 0] = np.nan
            if kind == "shape": cf0 = cf0[:-1]
            if kind == "dtype": cf0 = cf0.astype(np.float64)
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                render.transpose_controls(f0, cf0, features)
        for shift in (0, -1, 12, float("nan"), True):
            with self.subTest(shift=shift), self.assertRaises(ValueError):
                render.transpose_controls(*controls(), semitones=shift)

    def test_normalizer_fixed_formula_and_invalid_stats(self):
        _, _, features = controls()
        mean, scale = np.arange(43, dtype=np.float64) / 10, np.full(43, 2.)
        before = [v.tobytes() for v in (features, mean, scale)]
        actual = render.normalize_features(features, mean, scale)
        self.assertEqual(actual.tobytes(), ((features - mean) / scale).astype(np.float32).tobytes())
        self.assertEqual([v.tobytes() for v in (features, mean, scale)], before)
        for bad in (np.zeros(43), np.full(43, np.nan), np.ones(42)):
            with self.assertRaises(ValueError): render.normalize_features(features, mean, bad)

    def test_strict_baseline_one_float_bit_change_is_not_tolerated(self):
        original = np.ones(render.SAMPLES, np.float32)
        render.require_baseline(original.copy(), original)
        changed = original.copy()
        changed[9] = np.nextafter(changed[9], np.float32(2))
        with self.assertRaisesRegex(ValueError, "not_byte_exact"):
            render.require_baseline(changed, original)

    def test_seed_sequence_repeats_per_variant_without_advancing_next_case(self):
        rng = np.random.default_rng(19)
        expected = np.random.default_rng(19)
        state = lambda: dict(rng.bit_generator.state)
        def restore(value): rng.bit_generator.state = value
        for case in render.CASES:
            baseline = expected.standard_normal(render.SAMPLES).astype(np.float32)
            calls = []
            def fake(shifted):
                noise = rng.standard_normal(render.SAMPLES).astype(np.float32)
                calls.append(noise.copy())
                return noise + np.float32(.1 if shifted else 0)
            a, b, _, _ = render.paired_inference(fake, state, restore, baseline)
            self.assertEqual(a.tobytes(), baseline.tobytes())
            self.assertEqual(calls[0].tobytes(), calls[1].tobytes())
            np.testing.assert_array_equal(b, baseline + np.float32(.1))
        self.assertEqual(rng.standard_normal(), expected.standard_normal())

    def test_mismatch_prevents_shift_and_shift_failure_restores_baseline_stream(self):
        rng = np.random.default_rng(5)
        reference = np.zeros(render.SAMPLES, np.float32)
        calls = []
        def mismatch(shifted):
            calls.append(shifted)
            return np.ones(render.SAMPLES, np.float32)
        with self.assertRaisesRegex(ValueError, "not_byte_exact"):
            render.paired_inference(mismatch, lambda: dict(rng.bit_generator.state),
                lambda s: setattr(rng.bit_generator, "state", s), reference)
        self.assertEqual(calls, [False])
        def failing(shifted):
            rng.standard_normal()
            if shifted: raise RuntimeError("synthetic")
            return reference.copy()
        expected = np.random.default_rng(5)
        expected.standard_normal()
        with self.assertRaisesRegex(RuntimeError, "synthetic"):
            render.paired_inference(failing, lambda: dict(rng.bit_generator.state),
                lambda s: setattr(rng.bit_generator, "state", s), reference)
        self.assertEqual(rng.standard_normal(), expected.standard_normal())

    def test_design_does_not_claim_new_score_source_mixing_or_noise_fix(self):
        flags = render.design_flags()
        for key in ("training", "weights_written", "public_weights_used", "source_PCM_mixed_into_output",
                "new_score_or_music", "denoising", "EQ", "waveform_pitch_warp", "output_processing",
                "source_amplitude_prediction_learned", "source_YIN_is_pitch_truth", "quality_approved"):
            self.assertIs(flags[key], False)
        self.assertTrue(flags["excitation_and_dilation_use_same_shifted_cf0"])

    def test_diagnostics_keep_fixed_source_denominator_and_virtual_target(self):
        import prepare_corpus
        wave = np.full(render.SAMPLES, .01, np.float32)
        source = dict(yin_hz=np.array([200, 200, 0, 200], np.float32),
            periodicity=np.ones(4, np.float32), rms_db=np.full(4, -30, np.float32))
        baseline = {k: v.copy() for k, v in source.items()}
        shifted = {k: v.copy() for k, v in source.items()}
        shifted["yin_hz"] *= render.FACTOR
        shifted["yin_hz"][3] = 0  # Dropout must not shrink source denominator3.
        with patch.object(prepare_corpus, "diagnostics", side_effect=[source, baseline, shifted]):
            report = render.raw_diagnostics(wave, wave.copy(), wave.copy())
        paired = report["baseline_to_shifted"]
        self.assertEqual(paired["reference_support_frames"], 3)
        self.assertEqual(paired["shared_confident_frames"], 2)
        self.assertEqual(paired["near50c_fraction_reference_support"], 2 / 3)
        self.assertAlmostEqual(paired["median_signed_shift_cents"], 100., places=3)
        self.assertEqual(report["shifted"]["pitch"]["reference_support_frames"], 3)
        self.assertEqual(report["shifted"]["pitch"]["generated_missing_frames_on_reference_support"], 1)
        self.assertEqual(report["shifted"]["pitch"]["near50c_fraction_reference_support"], 2 / 3)

    def test_archive_roundtrip_and_cap_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root, wave = Path(directory), np.zeros(render.SAMPLES, np.float32)
            arrays = dict(reference=wave, baseline=wave.copy(), shifted=wave + np.float32(.01))
            free = type("Usage", (), {"free": 14 * render.GIB})()
            with patch.object(render.shutil, "disk_usage", return_value=free):
                row = render.save_arrays(root / "case.npz", arrays)
                with np.load(root / row["file"], allow_pickle=False) as archive:
                    self.assertEqual(archive["baseline"].tobytes(), wave.tobytes())
                self.assertEqual((root / row["file"]).stat().st_mode & 0o777, 0o600)
                with self.assertRaises(FileExistsError): render.save_arrays(root / row["file"], arrays)
            with patch.object(render.shutil, "disk_usage", return_value=type("Usage", (), {"free": 12 * render.GIB})()):
                with self.assertRaisesRegex(RuntimeError, "disk_floor"):
                    render.ensure_capacity(root, 1)
            with patch.object(render, "MAX_BYTES", 1):
                with self.assertRaisesRegex(RuntimeError, "50MB"):
                    render.ensure_capacity(root)

    def test_state_requires_exact_global3000_gate_config_and_normalizer(self):
        with tempfile.TemporaryDirectory() as directory:
            gate = Path(directory) / "gate.json"
            gate.write_bytes(b"synthetic bound gate")
            gc, mean, scale = {"channels": 512}, np.zeros(43), np.ones(43)
            state = dict(format="private_sifigan_generator_only_v1", completed_steps=3000,
                full_resume_available=False, quality_approved=False, generator_config=gc,
                data_gate_sha256=render.lineage.saved.sha256(gate), normalizer_mean=mean.tolist(),
                normalizer_scale=scale.tolist(), generator={"synthetic": 1})
            render.validate_state(state, {"generator_config": gc}, mean, scale, gate)
            for key, wrong in (("completed_steps", 1000), ("generator_config", {}),
                    ("data_gate_sha256", "wrong"), ("normalizer_scale", [2] * 43), ("full_resume_available", True)):
                with self.subTest(key=key), self.assertRaises(ValueError):
                    render.validate_state({**state, key: wrong}, {"generator_config": gc}, mean, scale, gate)


if __name__ == "__main__":
    unittest.main()
