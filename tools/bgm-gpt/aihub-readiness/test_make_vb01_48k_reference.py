#!/usr/bin/env python3
"""Synthetic checks for private 48 kHz source-reference construction."""

from __future__ import annotations

import io
import unittest
import wave

import numpy as np

import make_vb01_48k_reference as reference


def wav_bytes(samples: np.ndarray, rate: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(rate)
        writer.writeframes(samples.astype("<i2").tobytes())
    return buffer.getvalue()


class ReferenceTests(unittest.TestCase):
    def test_crop_preserves_exact_48k_pcm_interval(self) -> None:
        samples = (np.arange(6 * reference.RATE, dtype=np.int32) % 30_001 - 15_000).astype("<i2")
        payload, first = reference._crop_original(wav_bytes(samples, reference.RATE), 83)
        actual, frames = reference._pcm_wav(payload, rate=reference.RATE,
                                            expected_frames=reference.FRAMES)
        self.assertEqual(first, 83 * 480)
        self.assertEqual(frames, reference.FRAMES)
        self.assertEqual(actual, samples[first:first + frames].tobytes())

    def test_bound_input_pcm_must_match_exact_gain_and_crop(self) -> None:
        samples = np.rint(800 * np.sin(np.arange(7 * 16_000) * 2 * np.pi * 220 / 16_000)).astype("<i2")
        pcm = samples.tobytes()
        excerpt = samples[160:160 + 64_000].astype(np.float32) / 32768
        rms = np.sqrt(np.mean(excerpt.astype(np.float64) ** 2))
        matched = (excerpt.astype(np.float64) * (0.035 / rms)).astype(np.float32)
        pair = wav_bytes(np.rint(matched * 32767).astype("<i2"), 16_000)
        reference._check_existing_pair(pcm, 1, pair)
        wrong = bytearray(pair)
        wrong[-1] ^= 1
        with self.assertRaisesRegex(reference.ReferenceError, "prepared_crop_to_pair_not_identical"):
            reference._check_existing_pair(pcm, 1, bytes(wrong))

    def test_listening_page_distinguishes_original_and_rms_matched(self) -> None:
        page = reference._html_page("../../bound-folder").decode("utf-8")
        self.assertEqual(page.count("original_48k.wav"), 3)
        self.assertIn("원본 PCM 샘플과 원래 음량", page)
        self.assertIn("각각 전체 RMS 음량", page)
        self.assertIn("../../bound-folder/result/pairs/pair_03_reconstruction.wav", page)


if __name__ == "__main__":
    unittest.main()
