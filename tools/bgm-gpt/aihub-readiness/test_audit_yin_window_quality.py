"""Synthetic-only checks. No AI Hub audio, labels, or model weights are read."""

from __future__ import annotations

from contextlib import ExitStack, redirect_stderr, redirect_stdout
import importlib.util
import io
import json
import math
from pathlib import Path
import sys
import unittest
from unittest import mock

import numpy as np


HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
SPEC = importlib.util.spec_from_file_location(
    "audit_yin_window_quality_for_test", HERE / "audit_yin_window_quality.py"
)
assert SPEC is not None and SPEC.loader is not None
quality = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = quality
SPEC.loader.exec_module(quality)

SAMPLE_RATE = 16_000


def fm_audio(center_hz: float = 440.0, depth_hz: float = 5.0,
             rate_hz: float = 6.0, seconds: float = 4.0) -> np.ndarray:
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    f0 = center_hz + depth_hz * np.sin(2 * math.pi * rate_hz * t)
    phase = 2 * math.pi * np.cumsum(f0) / SAMPLE_RATE
    return (.10 * (np.sin(phase) + .5 * np.sin(2 * phase))).astype(np.float32)


def buckets() -> dict[str, quality.Bucket]:
    return {key: quality.Bucket() for key in quality.STRATA}


class WindowQualityTests(unittest.TestCase):
    def test_64ms_pitch_matches_candidate_extractor_exactly(self) -> None:
        from mac_mps_ddsp_features import extract_features

        audio = fm_audio()
        pitch, voiced, rms, flatness = quality.extract_yin(audio, 1024)
        reference = extract_features(audio)
        self.assertTrue(np.array_equal(pitch, reference["pitch_hz"]))
        self.assertTrue(np.array_equal(voiced, reference["voiced_mask"]))
        self.assertTrue(np.array_equal(rms, reference["rms_db"]))
        self.assertIsNone(flatness)

    def test_32ms_retains_more_5_to_7_hz_modulation_on_clean_synthetic_tone(self) -> None:
        for rate in (5.0, 6.0, 7.0):
            with self.subTest(rate=rate):
                audio = fm_audio(rate_hz=rate)
                stats = buckets()
                ratio = quality.compare_audio(audio, quality.Event(.8, 1.8), stats)
                self.assertIsNotNone(ratio)
                self.assertGreater(ratio, 1.10)
                self.assertLess(ratio, 1.50)
                self.assertEqual(stats["all_frames"].frames, 400)
                self.assertGreaterEqual(stats["vb01_start_inside"].frames, 19)
                self.assertLessEqual(stats["vb01_start_inside"].frames, 21)
                self.assertGreaterEqual(stats["vb01_end_outside"].frames, 19)
                self.assertLessEqual(stats["vb01_end_outside"].frames, 21)
                self.assertGreater(stats["vb01_core"].frames, 70)

    def test_short_repeated_notes_show_less_gap_leakage_at_32ms(self) -> None:
        t = np.arange(4 * SAMPLE_RATE) / SAMPLE_RATE
        notes = ((.5, .6), (.8, .9), (1.1, 1.2), (1.4, 1.5))
        envelope = np.zeros_like(t)
        for start, end in notes:
            envelope += (
                np.clip((t - start) / .01, 0, 1)
                * np.clip((end - t) / .01, 0, 1)
                * ((t >= start) & (t < end))
            )
        audio = .1 * envelope * np.sin(2 * math.pi * 440 * t)
        audio += np.random.default_rng(1714).normal(0, .0003, t.size)
        pitch32, voiced32, _, _ = quality.extract_yin(audio, 512)
        pitch64, voiced64, _, _ = quality.extract_yin(audio, 1024)
        frame_times = np.arange(pitch32.size) / 100
        note_mask = np.zeros_like(frame_times, dtype=bool)
        for start, end in notes:
            note_mask |= (frame_times >= start) & (frame_times < end)
        gap = (frame_times >= .6) & (frame_times < 1.4) & ~note_mask
        self.assertGreater(np.mean(voiced32[note_mask]), .95)
        self.assertGreater(np.mean(voiced64[note_mask]), .95)
        self.assertLess(np.mean(voiced32[gap]), np.mean(voiced64[gap]))
        self.assertTrue(np.all(pitch32[~voiced32] == 0))
        self.assertTrue(np.all(pitch64[~voiced64] == 0))

    def test_low_reference_is_conditioned_on_64ms_not_truth(self) -> None:
        audio = fm_audio(center_hz=100.0)
        stats = buckets()
        quality.compare_audio(audio, None, stats)
        low = stats["low_80_to_150_hz_by_64ms_reference"]
        self.assertGreater(low.frames, 350)
        self.assertEqual(low.frames, low.voiced_64)
        self.assertGreater(low.voiced_32, 350)

    def test_noisy_low_pitch_exposes_short_window_tradeoff(self) -> None:
        t = np.arange(4 * SAMPLE_RATE) / SAMPLE_RATE
        truth = 90 + 5 * np.sin(2 * math.pi * 6 * t)
        phase = 2 * math.pi * np.cumsum(truth) / SAMPLE_RATE
        raw = np.sin(phase) + .7 * np.sin(2 * phase) + .35 * np.sin(3 * phase)
        signal = raw * .08 / np.sqrt(np.mean(raw * raw))
        rng = np.random.default_rng(71470)
        noise = rng.standard_normal(t.size)
        noise *= np.sqrt(np.mean(signal * signal)) * 10 ** (-10 / 20) / np.sqrt(np.mean(noise * noise))
        audio = signal + noise
        p32, v32, _, _ = quality.extract_yin(audio, 512)
        p64, v64, _, _ = quality.extract_yin(audio, 1024)
        target = truth[np.arange(400) * 160]
        selected = slice(20, 380)
        self.assertGreater(np.mean(v32[selected]), .95)
        self.assertGreater(np.mean(v64[selected]), .95)
        error32 = np.median(np.abs(p32[selected] - target[selected]))
        error64 = np.median(np.abs(p64[selected] - target[selected]))
        self.assertGreater(error32, error64)

    def test_noise_like_and_quiet_are_distinct_proxies(self) -> None:
        rng = np.random.default_rng(7)
        noise = rng.normal(0, .05, 4 * SAMPLE_RATE)
        stats = buckets()
        quality.compare_audio(noise, None, stats)
        self.assertGreater(stats["noise_like_spectrum_proxy"].frames, 300)
        self.assertEqual(stats["quiet_below_minus_50_dbfs"].frames, 0)
        self.assertLess(stats["all_frames"].voiced_32, 10)
        self.assertLess(stats["all_frames"].voiced_64, 10)
        silent = buckets()
        quality.compare_audio(np.zeros(4 * SAMPLE_RATE), None, silent)
        self.assertEqual(silent["near_silent_below_minus_60_dbfs"].frames, 400)
        self.assertEqual(silent["near_silent_below_minus_60_dbfs"].voiced_32, 0)
        self.assertEqual(silent["near_silent_below_minus_60_dbfs"].voiced_64, 0)

    def test_aggregate_report_contains_no_filenames_or_paths(self) -> None:
        names = [(f"sample_{i:03d}.wav", f"private-title-{i}") for i in range(5)]
        labels = {stem: (4.0, [(.8, 1.8, "VB01")]) for _, stem in names}
        audio = fm_audio()
        with ExitStack() as stack:
            stack.enter_context(mock.patch.object(quality, "_load_manifest", return_value=names))
            stack.enter_context(mock.patch.object(quality, "_load_labels", return_value=labels))
            stack.enter_context(mock.patch.object(quality, "_read_wav", return_value=audio))
            report = quality.audit(Path("/private/source"), Path("/private/labels.zip"), max_clips=5)
        encoded = json.dumps(report, ensure_ascii=False)
        self.assertEqual(report["clips"], 5)
        self.assertEqual(report["strata"]["all_frames"]["frames"], 2000)
        self.assertEqual(report["vb01_periodic_depth_ratio_32_over_64"]["accepted_events"], 5)
        self.assertNotIn("private-title", encoded)
        self.assertNotIn("sample_", encoded)
        self.assertNotIn("/private/", encoded)
        self.assertNotIn("pitch_hz", encoded)
        self.assertNotIn("waveform", encoded)
        self.assertLess(len(encoded), 10000)
        with self.assertRaisesRegex(quality.AuditError, "invalid_clip_limit"):
            quality.audit(Path("/private/source"), Path("/private/labels.zip"), max_clips=4)

    def test_private_path_is_not_echoed_on_error(self) -> None:
        private_path = "/not-existing-secret-71470/private-source"
        stderr, stdout = io.StringIO(), io.StringIO()
        with redirect_stderr(stderr), redirect_stdout(stdout):
            status = quality.main([
                "--prepared-dir", private_path,
                "--label-zip", "/not-existing-secret-71470/private-labels.zip",
                "--max-clips", "5",
            ])
        self.assertEqual(status, 2)
        self.assertEqual(stdout.getvalue(), "")
        self.assertNotIn("not-existing-secret", stderr.getvalue())
        self.assertIn("private_directory_unavailable", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
