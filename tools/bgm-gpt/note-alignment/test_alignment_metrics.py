"""Synthetic alignment tests; no real MIDI/audio, Torch, GPU or training."""
import unittest
import numpy as np
import alignment_metrics as metrics


def synthetic(offset=0., scale=1.):
    notes = [dict(start_seconds=a, end_seconds=b, pitch=p) for a, b, p in ((.2, .7, 60), (.8, 1.4, 64), (1.5, 2.3, 67), (2.5, 3., 62))]
    times = np.arange(0, 4., .01)
    pitch = np.zeros(len(times))
    for row in notes:
        mask = (times >= offset + scale * row["start_seconds"]) & (times < offset + scale * row["end_seconds"])
        pitch[mask] = 440 * 2 ** ((row["pitch"] - 69) / 12)
    return notes, times, pitch, pitch > 0, np.where(pitch > 0, -30., -100.)


class AlignmentMetricsTests(unittest.TestCase):
    def test_identity_vibrato_absolute_cents_not_an_acceptance_threshold(self):
        notes, times, pitch, voiced, rms = synthetic()
        pitch *= np.exp2(80 * np.sin(2 * np.pi * 5 * times) / 1200)
        row = metrics.evaluate(notes, times, pitch, voiced, rms)
        self.assertEqual(row["note_mapping_coverage"], 1)
        self.assertLess(row["near_fraction"]["50"], 1)
        self.assertEqual(row["near_fraction"]["100"], 1)
        self.assertFalse(row["training_accepted"])
        self.assertTrue(all(n["all"]["fixed_source_support_frames"] == n["boundary_outer10percent"]["fixed_source_support_frames"] +
            n["steady_inner80percent"]["fixed_source_support_frames"] for n in row["per_note"]))

    def test_known_offset_and_scale_recovered_without_modifying_inputs(self):
        values = synthetic(.2, 1.2)
        original = [v.tobytes() for v in values[1:]]
        result = metrics.search_affine(*values, scales=[.8, 1., 1.2], offsets=[-.2, 0., .2])
        self.assertAlmostEqual(result["best"]["offset_seconds"], .2)
        self.assertAlmostEqual(result["best"]["scale"], 1.2)
        self.assertLess(result["best"]["capped_absolute_200c_sum"], result["identity"]["capped_absolute_200c_sum"])
        count = result["identity"]["fixed_source_support_frames"]
        self.assertTrue(all(r["fixed_source_support_frames"] == count for r in result["candidates"]))
        self.assertEqual([v.tobytes() for v in values[1:]], original)

    def test_missing_no_overlap_and_outside_still_cost200_full_source_denominator(self):
        row = metrics.evaluate(*synthetic(), offset=100)
        count = row["fixed_source_support_frames"]
        self.assertEqual(row["no_note_frames_on_support"], count)
        self.assertEqual(row["outside_score_extent_frames_on_support"], count)
        self.assertEqual(row["capped_absolute_200c_sum"], 200 * count)
        self.assertEqual(row["near_fraction"]["200"], 0)

    def test_nested_overlapping_notes_ambiguous_counted_and_older_note_recovers(self):
        notes = [dict(start_seconds=0., end_seconds=3., pitch=60), dict(start_seconds=1., end_seconds=2., pitch=67)]
        t = np.array([.5, 1.5, 2.5])
        result = metrics.evaluate(notes, t, np.full(3, 440 * 2 ** ((60 - 69) / 12)), np.ones(3, bool), np.full(3, -30.))
        self.assertEqual(result["ambiguous_frames_on_support"], 1)
        self.assertEqual(result["unique_note_frames_on_support"], 2)
        self.assertEqual(result["near_fraction"]["50"], 2 / 3)
        self.assertEqual(result["capped_absolute_200c_sum"], 200)

    def test_octave_error_is_not_wrapped_or_applied_as_semitone_correction(self):
        notes, t, pitch, voiced, rms = synthetic()
        row = metrics.evaluate(notes, t, pitch * 2, voiced, rms)
        self.assertAlmostEqual(row["median_abs_cents"], 1200)
        self.assertEqual(row["near_fraction"]["200"], 0)
        self.assertEqual(row["octave_error_frames"], row["fixed_source_support_frames"])
        self.assertEqual(row["nearest_integer_semitones_diagnostic"], 12)
        self.assertFalse(row["pitch_transposition_applied"])

    def test_empty_notes_or_support_return_identity_without_claiming_alignment(self):
        notes, t, pitch, voiced, rms = synthetic()
        for values in (([], t, pitch, voiced, rms), (notes, t, pitch, np.zeros(len(t), bool), rms)):
            result = metrics.search_affine(*values)
            self.assertEqual(result["best"]["scale"], 1)
            self.assertEqual(result["best"]["offset_seconds"], 0)
            self.assertEqual(result["candidate_count"], 1)
            self.assertFalse(result["training_accepted"])

    def test_identity_preferred_on_tie_and_max2501_default_grid(self):
        notes = [dict(start_seconds=0., end_seconds=100., pitch=60)]
        t = np.arange(1., 2., .02)
        values = (notes, t, np.full(len(t), 440 * 2 ** ((60 - 69) / 12)), np.ones(len(t), bool), np.full(len(t), -30.))
        result = metrics.search_affine(*values)
        self.assertEqual(result["candidate_count"], 2501)
        self.assertEqual(len(result["top_candidates"]), 5)
        self.assertEqual((result["best"]["offset_seconds"], result["best"]["scale"]), (0, 1))
        import json
        compact = metrics.analyse(*values, scales=[1.], offsets=[0.])
        json.dumps(compact, allow_nan=False)

    def test_nonfinite_bounds_empty_frames_bad_notes_and_excess_grid_fail(self):
        notes, t, pitch, voiced, rms = synthetic()
        with self.assertRaises(ValueError): metrics.evaluate(notes, [], [], np.array([], bool), [])
        with self.assertRaises(ValueError): metrics.evaluate(notes, t[::-1], pitch, voiced, rms)
        with self.assertRaises(ValueError): metrics.evaluate(notes, t, pitch, voiced.astype(int), rms)
        bad = pitch.copy(); bad[0] = np.nan
        with self.assertRaises(ValueError): metrics.evaluate(notes, t, bad, voiced, rms)
        with self.assertRaises(ValueError): metrics.evaluate([dict(start_seconds=0, end_seconds=None, pitch=60, status="unmatched_note_on")], t, pitch, voiced, rms)
        with self.assertRaises(ValueError): metrics.search_affine(notes, t, pitch, voiced, rms, scales=[0, 1])
        with self.assertRaises(ValueError): metrics.search_affine(notes, t, pitch, voiced, rms, scales=np.linspace(.3, 1.5, 100), offsets=np.linspace(-1, 1, 100))
        with self.assertRaises(ValueError): metrics.search_affine(notes, t, pitch, voiced, rms, max_candidates=3001)


if __name__ == "__main__":
    unittest.main()
