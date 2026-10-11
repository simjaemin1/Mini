"""Synthetic-only tests; neither AI Hub audio nor model weights are opened."""

from __future__ import annotations

import importlib.util
import math
from pathlib import Path
import unittest

import numpy as np


FEATURES = Path(__file__).with_name("mac_mps_ddsp_features.py")
SPEC = importlib.util.spec_from_file_location("mac_mps_ddsp_features_for_test", FEATURES)
assert SPEC is not None and SPEC.loader is not None
features = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(features)

SAMPLE_RATE = 16_000
FOUR_SECONDS = SAMPLE_RATE * 4


def sine(frequency_hz: float, amplitude: float = 0.1) -> np.ndarray:
    time = np.arange(FOUR_SECONDS) / SAMPLE_RATE
    return amplitude * np.sin(2 * math.pi * frequency_hz * time)


class MacMPSDDSPFeaturesTests(unittest.TestCase):
    def test_four_second_grid_sine_and_mono_contract(self) -> None:
        result = features.extract_features(sine(440.0))
        self.assertEqual(
            set(result), {"pitch_hz", "loudness", "voiced_mask", "rms_db"}
        )
        for key, values in result.items():
            self.assertEqual(values.shape, (400,), key)
            self.assertTrue(np.all(np.isfinite(values)), key)
        self.assertEqual(result["voiced_mask"].dtype, np.bool_)
        self.assertGreater(int(result["voiced_mask"].sum()), 390)
        self.assertLess(abs(float(np.median(result["pitch_hz"][20:-20])) - 440.0), 1.0)
        self.assertTrue(np.all(result["pitch_hz"][~result["voiced_mask"]] == 0))

    def test_five_hz_vibrato_follows_pitch_curve(self) -> None:
        time = np.arange(FOUR_SECONDS) / SAMPLE_RATE
        instantaneous_hz = 440.0 + 5.0 * np.sin(2 * math.pi * 5.0 * time)
        audio = 0.1 * np.sin(2 * math.pi * np.cumsum(instantaneous_hz) / SAMPLE_RATE)
        measured = features.extract_features(audio)
        expected = 440.0 + 5.0 * np.sin(2 * math.pi * 5.0 * np.arange(400) / 100)
        self.assertGreater(int(measured["voiced_mask"].sum()), 390)
        error = np.abs(measured["pitch_hz"][20:-20] - expected[20:-20])
        self.assertLess(float(np.median(error)), 1.0)
        self.assertGreater(float(np.percentile(measured["pitch_hz"][20:-20], 95)
                                 - np.percentile(measured["pitch_hz"][20:-20], 5)), 7.0)

    def test_yin_window_understates_fast_vibrato_depth(self) -> None:
        time = np.arange(FOUR_SECONDS) / SAMPLE_RATE
        for rate, reference_ratio in ((5, 0.86), (6, 0.80), (7, 0.73)):
            instantaneous_hz = 440.0 + 5.0 * np.sin(2 * math.pi * rate * time)
            audio = 0.1 * np.sin(2 * math.pi * np.cumsum(instantaneous_hz) / SAMPLE_RATE)
            measured = features.extract_features(audio)["pitch_hz"][20:-20]
            frame_time = np.arange(20, 380) / 100
            centered = measured - measured.mean()
            sine_basis = np.sin(2 * math.pi * rate * frame_time)
            cosine_basis = np.cos(2 * math.pi * rate * frame_time)
            amplitude = math.hypot(
                2 * float(np.dot(centered, sine_basis)) / len(centered),
                2 * float(np.dot(centered, cosine_basis)) / len(centered),
            )
            self.assertAlmostEqual(amplitude / 5.0, reference_ratio, delta=0.04)

    def test_silence_and_unpitched_noise_are_unvoiced(self) -> None:
        silence = features.extract_features(np.zeros(FOUR_SECONDS))
        noise = features.extract_features(
            np.random.default_rng(9).normal(0.0, 0.1, FOUR_SECONDS)
        )
        for result in (silence, noise):
            self.assertFalse(np.any(result["voiced_mask"]))
            self.assertTrue(np.all(result["pitch_hz"] == 0))
            self.assertTrue(np.all(np.isfinite(result["loudness"])))
        self.assertLess(float(np.max(silence["rms_db"])), -200.0)

    def test_loudness_matches_centered_hann_a_weighted_log_stft(self) -> None:
        audio = sine(440.0)
        result = features.extract_features(audio)
        padded = np.pad(audio, (1024, 1024), mode="constant")
        first_centered = padded[:2048]
        periodic_hann = np.hanning(2049)[:-1]
        magnitude = np.abs(np.fft.rfft(first_centered * periodic_hann))
        weights = features._a_weighting_db(np.fft.rfftfreq(2048, 1 / SAMPLE_RATE))
        expected_first = np.mean(np.log(magnitude + 1e-7) + weights)
        self.assertAlmostEqual(float(result["loudness"][0]), expected_first, places=5)
        self.assertEqual(float(features._a_weighting_db(np.array([0.0]))[0]), -80.0)
        self.assertAlmostEqual(
            float(features._a_weighting_db(np.array([1000.0]))[0]), 0.0, places=3
        )

    @unittest.skipUnless(importlib.util.find_spec("librosa"), "optional librosa 0.11 parity")
    def test_optional_librosa_011_loudness_parity(self) -> None:
        import librosa

        if librosa.__version__ != "0.11.0":
            self.skipTest("pilot parity pins librosa 0.11.0 semantics")
        time = np.arange(FOUR_SECONDS) / SAMPLE_RATE
        signals = (
            sine(440.0).astype(np.float32),
            (0.08 * np.sin(2 * np.pi * np.cumsum(
                440 + 6 * np.sin(2 * np.pi * 5 * time)
            ) / SAMPLE_RATE)).astype(np.float32),
            np.random.default_rng(71470).normal(0.0, 0.03, FOUR_SECONDS).astype(np.float32),
            np.zeros(FOUR_SECONDS, dtype=np.float32),
        )
        frequency_weights = librosa.A_weighting(
            librosa.fft_frequencies(sr=SAMPLE_RATE, n_fft=2048)
        )
        for signal in signals:
            reference = np.mean(
                np.log(np.abs(librosa.stft(signal, n_fft=2048, hop_length=160,
                                            win_length=2048, center=True)) + 1e-7)
                + frequency_weights[:, None], axis=0,
            )[:-1]
            ours = features.extract_features(signal)["loudness"]
            self.assertLess(float(np.max(np.abs(reference - ours))), 2e-5)

    def test_amplitude_doubling_changes_log_loudness_not_pitch(self) -> None:
        random_audio = np.random.default_rng(11).normal(0.0, 0.02, FOUR_SECONDS)
        low = features.extract_features(random_audio)
        high = features.extract_features(2.0 * random_audio)
        delta = high["loudness"] - low["loudness"]
        self.assertAlmostEqual(float(np.median(delta)), math.log(2.0), places=4)
        sine_low = features.extract_features(sine(440.0, 0.04))
        sine_high = features.extract_features(sine(440.0, 0.08))
        self.assertLess(
            float(np.median(np.abs(sine_low["pitch_hz"] - sine_high["pitch_hz"]))),
            0.05,
        )

    def test_partial_hop_and_invalid_inputs(self) -> None:
        self.assertEqual(len(features.extract_features(np.zeros(FOUR_SECONDS + 37))["pitch_hz"]), 400)
        self.assertEqual(len(features.extract_features(np.zeros(FOUR_SECONDS + 160))["pitch_hz"]), 401)
        with self.assertRaisesRegex(ValueError, "mono_audio"):
            features.extract_features(np.zeros((FOUR_SECONDS, 2)))
        with self.assertRaisesRegex(ValueError, "nonfinite_audio"):
            damaged = np.zeros(FOUR_SECONDS)
            damaged[300] = np.nan
            features.extract_features(damaged)
        with self.assertRaisesRegex(ValueError, "only_16khz"):
            features.extract_features(np.zeros(FOUR_SECONDS), sample_rate=48_000)

    def test_loudness_normalization_averages_segment_statistics(self) -> None:
        segments = [np.array([0.0, 2.0, 4.0]), np.array([10.0, 10.0, 16.0])]
        mean, std = features.normalize_loudness(segments)
        self.assertAlmostEqual(mean, (2.0 + 12.0) / 2)
        self.assertAlmostEqual(std, (2.0 + math.sqrt(12.0)) / 2)
        with self.assertRaisesRegex(ValueError, "loudness_has_no_variance"):
            features.normalize_loudness([np.ones(400)])
        with self.assertRaisesRegex(ValueError, "at_least_one"):
            features.normalize_loudness([])


if __name__ == "__main__":
    unittest.main()
