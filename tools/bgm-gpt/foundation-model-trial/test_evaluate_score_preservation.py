"""Synthetic-only preservation tests; no private audio, models or network."""
import copy
import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import evaluate_score_preservation as evaluator

PUBLIC_PLAN = Path(__file__).resolve().parent.parent / "new-arirang-score/new_ari_8bar_expression_b0_r1.json"


def synthesize(plan, *, wrong_note=None, constant=False, octave=False, leak=False, cents=0., vibrato=True):
    size = round(evaluator.DURATION * evaluator.SR)
    frequency = np.full(size, 440.)
    amplitude = np.zeros(size)
    number = 0
    for event in plan["events"]:
        a, b = (round(event[k] * evaluator.SR) for k in ("start_seconds", "end_seconds"))
        if event["articulation"] == "release":
            continue
        hz = event["pitch_hz"] * 2**(2 / 12)
        if constant:
            hz = 440.
        if octave:
            hz /= 2
        if number == wrong_note:
            hz *= 2**(5 / 12)
        frequency[a:b] = hz
        amplitude[a:b] = .06
        if number == 27 and vibrato:
            t = np.arange(b - a) / evaluator.SR
            frequency[a:b] *= 2**(18 * np.sin(2 * np.pi * 3.45 * t) / 1200)
        number += 1
    phase = np.cumsum(2 * np.pi * frequency * 2**(cents / 1200) / evaluator.SR)
    audio = np.sin(phase) * amplitude
    if leak:
        audio[amplitude == 0] = 1e-4
    return audio


class PreservationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.plan = json.loads(PUBLIC_PLAN.read_text())
        self.plan_path = self.root / "plan.json"
        self.plan_path.write_text(json.dumps(self.plan))
        self.guide = self.root / "guide.wav"
        self.candidate = self.root / "candidate.wav"
        self.original = synthesize(self.plan)
        sf.write(self.guide, self.original, evaluator.SR, subtype="FLOAT")

    def tearDown(self):
        self.temporary.cleanup()

    def evaluate(self, audio):
        sf.write(self.candidate, audio, evaluator.SR, subtype="FLOAT")
        return evaluator.evaluate(self.guide, self.candidate, self.plan_path)

    def test_identical_synthetic_phrase_passes_both_scopes_without_claiming_quality(self):
        before = self.guide.read_bytes()
        report = self.evaluate(self.original)
        self.assertTrue(report["numerical_preview_eligible"])
        self.assertFalse(report["auditory_quality_or_instrument_identity_approved"])
        self.assertEqual(report["full_19p2s"]["pitch"]["frames"], 1426)
        self.assertEqual(len(report["full_19p2s"]["notes"]), 28)
        self.assertEqual(len(report["full_19p2s"]["rests"]), 4)
        self.assertEqual(len(report["first_4p8s"]["rests"]), 1)
        self.assertEqual(self.guide.read_bytes(), before)
        self.assertEqual(report["binding"]["guide_sha256"], evaluator.digest(self.guide))

    def test_short_wrong_note_cannot_hide_behind_global_95percent(self):
        report = self.evaluate(synthesize(self.plan, wrong_note=1))
        full = report["full_19p2s"]
        self.assertTrue(full["pitch"]["passed"])
        self.assertFalse(full["notes"][1]["passed"])
        self.assertFalse(full["pitch_passed"])
        self.assertFalse(report["first_4p8s"]["passed"])
        self.assertFalse(report["numerical_preview_eligible"])

    def test_48k_stereo_candidate_and_16k_mono_guide_share_fixed_grid(self):
        from scipy.signal import resample_poly
        high_rate = resample_poly(self.original, 3, 1)
        sf.write(self.candidate, np.repeat(high_rate[:, None], 2, axis=1), 48000, subtype="FLOAT")
        report = evaluator.evaluate(self.guide, self.candidate, self.plan_path)
        self.assertTrue(report["numerical_preview_eligible"])
        self.assertEqual(report["full_19p2s"]["pitch"]["frames"], 1426)

    def test_monotone_and_octave_only_candidates_fail_unfolded_pitch_gate(self):
        for options in ({"constant": True}, {"octave": True}):
            report = self.evaluate(synthesize(self.plan, **options))
            self.assertFalse(report["full_19p2s"]["pitch_passed"])
            self.assertFalse(report["numerical_preview_eligible"])
            if "octave" in options:
                self.assertGreater(report["full_19p2s"]["pitch"]["octave_ambiguous_fraction_all"], .95)

    def test_matched_wrong_monotone_guide_is_not_the_authorial_plan(self):
        wrong = synthesize(self.plan, constant=True)
        sf.write(self.guide, wrong, evaluator.SR, subtype="FLOAT")
        report = self.evaluate(wrong)
        self.assertEqual(report["full_19p2s"]["pitch"]["near_50c_fraction_all"], 1.)
        self.assertFalse(report["full_19p2s"]["pitch_passed"])

    def test_guide_plus40_candidate_another40_cannot_compound_two_tolerances(self):
        sf.write(self.guide, synthesize(self.plan, cents=40, vibrato=False), evaluator.SR, subtype="FLOAT")
        report = self.evaluate(synthesize(self.plan, cents=80, vibrato=False))
        full = report["full_19p2s"]
        self.assertTrue(full["pitch"]["near_50c_fraction_all"] >= .95)
        self.assertTrue(all(row["guide_matches_plan_plus2_fraction_all"] >= .95 for row in full["notes"]))
        self.assertLess(full["pitch"]["candidate_matches_plan_plus2_fraction_all"], .95)
        self.assertFalse(full["pitch_passed"])
        self.assertFalse(report["numerical_preview_eligible"])

    def test_quiet_rest_leak_below_minus35_still_fails_exact_zero_guide_plus6(self):
        report = self.evaluate(synthesize(self.plan, leak=True))
        self.assertTrue(report["full_19p2s"]["pitch_passed"])
        for rest in report["full_19p2s"]["rests"]:
            self.assertLess(rest["candidate_db_vs_active"], -35)
            self.assertEqual(rest["guide_db_vs_active"], -120)
            self.assertGreater(rest["leak_delta_db"], 6)
            self.assertFalse(rest["passed"])
        self.assertFalse(report["numerical_preview_eligible"])

    def test_good_first_phrase_does_not_license_bad_later_notes(self):
        report = self.evaluate(synthesize(self.plan, wrong_note=23))
        self.assertTrue(report["first_4p8s"]["passed"])
        self.assertFalse(report["full_19p2s"]["passed"])
        self.assertFalse(report["numerical_preview_eligible"])

    def test_nonfinite_or_short_audio_and_invalid_plan_rejected(self):
        for audio in (self.original[:-1], np.full_like(self.original, np.nan)):
            with self.assertRaises(ValueError):
                self.evaluate(audio)
        altered = copy.deepcopy(self.plan)
        altered["events"][1]["start_seconds"] += .01
        self.plan_path.write_text(json.dumps(altered))
        with self.assertRaises(ValueError):
            self.evaluate(self.original)

    def test_fresh_private_report_is_0600_and_never_overwrites(self):
        sf.write(self.candidate, self.original, evaluator.SR, subtype="FLOAT")
        output = self.root / "private"
        output.mkdir(mode=0o700)
        report_path = output / "report.json"
        args = ["evaluator", "--guide", str(self.guide), "--candidate", str(self.candidate),
                "--plan", str(self.plan_path), "--output-report", str(report_path)]
        with patch.object(evaluator, "PRIVATE_ROOT", self.root), patch.object(sys, "argv", args):
            evaluator.main()
            with self.assertRaises(FileExistsError):
                evaluator.main()
        self.assertEqual(stat.S_IMODE(report_path.stat().st_mode), 0o600)
        saved = json.loads(report_path.read_text())
        self.assertTrue(saved["numerical_preview_eligible"])


if __name__ == "__main__":
    unittest.main()
