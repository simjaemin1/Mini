"""Synthetic-only regression tests; no corpus paths or external services."""

from __future__ import annotations

import io
from pathlib import Path
import sys
import unittest
import wave


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from synthetic_pair_quality import (  # noqa: E402
    PairQualityError,
    audit_synthetic_pair,
    make_synthetic_fixture,
)


class SyntheticPairQualityTests(unittest.TestCase):
    def test_clean_tone_has_no_review_flags_but_no_rights_claim(self) -> None:
        report = audit_synthetic_pair(*make_synthetic_fixture())
        self.assertEqual(report["review_flags"], [])
        self.assertTrue(report["synthetic_smoke_pass"])
        self.assertFalse(report["real_data_ready"])
        self.assertFalse(report["actual_ai_hub_schema_verified"])
        self.assertFalse(report["model_training_or_game_use_authorized"])

    def test_silence_clipping_and_wrong_frequency_are_separate_flags(self) -> None:
        cases = (
            ({"amplitude": 0.0}, "audio_near_silent"),
            ({"amplitude": 1.8}, "audio_clipped"),
            ({"frequency_hz": 523.25}, "dominant_spectral_peak_midi_review"),
        )
        for settings, expected in cases:
            with self.subTest(settings=settings):
                report = audit_synthetic_pair(*make_synthetic_fixture(**settings))
                self.assertIn(expected, report["review_flags"])
                self.assertFalse(report["synthetic_smoke_pass"])

    def test_audio_midi_onset_shift_is_found(self) -> None:
        report = audit_synthetic_pair(*make_synthetic_fixture(midi_onset_seconds=0.34))
        self.assertIn("first_audio_midi_onset_review", report["review_flags"])
        self.assertAlmostEqual(report["first_audio_minus_midi_onset_seconds"], -0.24, places=2)

    def test_annotation_midi_mismatch_is_found(self) -> None:
        wav, midi, annotation = make_synthetic_fixture()
        annotation["notes"][0]["pitch"] = 71
        report = audit_synthetic_pair(wav, midi, annotation)
        self.assertIn("annotation_midi_mismatch", report["review_flags"])

    def test_audio_shorter_than_midi_is_found(self) -> None:
        wav, midi, annotation = make_synthetic_fixture()
        with wave.open(io.BytesIO(wav), "rb") as source:
            frames = source.readframes(round(source.getframerate() * 0.4))
            rate = source.getframerate()
        short = io.BytesIO()
        with wave.open(short, "wb") as target:
            target.setnchannels(1)
            target.setsampwidth(2)
            target.setframerate(rate)
            target.writeframes(frames)
        report = audit_synthetic_pair(short.getvalue(), midi, annotation)
        self.assertIn("audio_ends_before_midi", report["review_flags"])

    def test_non_synthetic_annotation_and_malformed_midi_are_rejected(self) -> None:
        wav, midi, annotation = make_synthetic_fixture()
        annotation["synthetic_fixture"] = False
        with self.assertRaisesRegex(PairQualityError, "synthetic"):
            audit_synthetic_pair(wav, midi, annotation)
        annotation["synthetic_fixture"] = True
        with self.assertRaisesRegex(PairQualityError, "MIDI"):
            audit_synthetic_pair(wav, midi[:-1], annotation)


if __name__ == "__main__":
    unittest.main()
