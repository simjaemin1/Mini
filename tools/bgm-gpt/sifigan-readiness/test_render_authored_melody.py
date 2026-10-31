"""Synthetic authored-score/control tests; no real audio, model, GPU or encoder."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from scipy.io import wavfile
import render_authored_melody as melody


def synthetic_score():
    # Timing/articulation contract, with synthetic pitches only.
    durations = [[2, 1, 3, 3], [2, 1, 3, 2, 1], [3, 2, 3, 1], [2, 1, 4, 2],
        [2, 1, 3, 3], [3, 2, 1, 2, 1], [3, 1, 2, 3], [7, 2]]
    rests = {(1, 4), (3, 3), (5, 4), (7, 1)}
    reattacks = {(1, 0), (1, 2), (4, 3), (5, 0), (5, 3), (7, 0)}
    bars, note = [], 0
    for bar, values in enumerate(durations):
        events, cursor = [], 0
        for index, duration in enumerate(values):
            event = dict(onset_sobak=cursor, duration_sobak=duration)
            if (bar, index) in rests:
                event["rest"] = True
            else:
                event["pitch"] = ("G4", "A4", "C5", "D5", "E5")[note % 5]
                event["articulation"] = ("breath_start" if index == 0 and bar in (0, 2, 4, 6)
                    else "rearticulate" if (bar, index) in reattacks else "slur")
                note += 1
            events.append(event)
            cursor += duration
        bars.append(dict(bar=bar + 1, events=events))
    return dict(schema="mini.bgm-gpt.original-variation.v1", bar_count=8, duration_seconds=19.2,
        beats_per_bar=3, sobak_per_beat=3, sobak_seconds=4 / 15, bars=bars)


def controls():
    t = np.arange(1500) / 200.
    cf0 = (300 * np.exp2(25 * np.sin(2 * np.pi * 5 * t) / 1200)).astype(np.float32)
    features = np.arange(1500 * 43, dtype=np.float32).reshape(1500, 43) / 100000
    mean, scale = np.arange(43, dtype=np.float64) / 100, np.ones(43)
    return cf0, features, mean, scale


class AuthoredMelodyTests(unittest.TestCase):
    def test_exact_score_count_transpose_joint5ms_and_native_rest_bounds(self):
        events = melody.parse_score(synthetic_score())
        self.assertEqual(len(events), 32)
        notes, rests = [r for r in events if not r["rest"]], [r for r in events if r["rest"]]
        self.assertEqual(len(notes), 28)
        self.assertEqual([r["note_index"] for r in notes], list(range(28)))
        self.assertTrue(all(r["transposed_midi"] == r["original_midi"] - 12 for r in notes))
        self.assertEqual([(r["start_sample"], r["end_sample"]) for r in rests],
            [(108800, 115200), (217600, 230400), (339200, 345600), (448000, 460800)])
        self.assertEqual(sum(r["end_sample"] - r["start_sample"] for r in rests), 38400)
        self.assertTrue(all(abs(r[key]) <= .0025 for r in events for key in
            ("quantization_start_error_seconds", "quantization_end_error_seconds")))
        self.assertTrue(all(a["end_frame"] == b["start_frame"] for a, b in zip(events, events[1:])))
        self.assertEqual([r["note_index"] + 1 for r in notes if r["duration_sobak"] >= 3],
            [3, 4, 7, 9, 11, 15, 18, 19, 20, 24, 27, 28])

    def test_clean_indexmap_only_full_features_normalization_and_input_unchanged(self):
        cf0, features, mean, scale = controls()
        original = [a.tobytes() for a in (cf0, features, mean, scale)]
        arrays, events = melody.build_controls(synthetic_score(), cf0, features, mean, scale)
        indices = 240 + ((np.arange(3840) + 16) % 960)
        np.testing.assert_array_equal(arrays["template_index_map"], indices)
        self.assertEqual(arrays["features"].tobytes(), features[indices].tobytes())
        self.assertEqual(arrays["normalized_features"].tobytes(), ((features[indices] - mean) / scale).astype(np.float32).tobytes())
        wraps = np.flatnonzero(np.diff(indices) < 0) + 1
        np.testing.assert_array_equal(wraps, [944, 1904, 2864, 3824])
        self.assertTrue(np.all(arrays["rest_mask"][wraps]))
        self.assertEqual([a.tobytes() for a in (cf0, features, mean, scale)], original)
        expected_micro = 1200 * np.log2(cf0[indices].astype(np.float64) / np.median(cf0[240:1200].astype(np.float64)))
        self.assertEqual(arrays["borrowed_microcurve_cents"].tobytes(), expected_micro.tobytes())

    def test_late_long_micro_envelope_delayed_ramped_tapered_shortnotes_zero(self):
        arrays, events = melody.build_controls(synthetic_score(), *controls())
        a, b = [arrays["microcurve_envelope_" + v] for v in melody.VARIANTS]
        np.testing.assert_array_equal(a, arrays["sounding_mask"].astype(np.float64))
        for row in events:
            start, end = row["start_frame"], row["end_frame"]
            if row["rest"] or row["duration_sobak"] < 3:
                self.assertTrue(np.all(b[start:end] == 0))
            else:
                self.assertTrue(np.all(b[start:start + 61] == 0))
                self.assertEqual(b[start + 90], 1.)
                self.assertGreater(b[start + 75], 0)
                self.assertLess(b[end - 1], .001)
        for variant in melody.VARIANTS:
            expected = (arrays["center_hz"] * np.exp2(arrays["borrowed_microcurve_cents"] *
                arrays["microcurve_envelope_" + variant] / 1200.)).astype(np.float32)
            self.assertEqual(expected.tobytes(), arrays["target_hz_" + variant].tobytes())
            self.assertTrue(np.all(expected > 0))  # Continuous excitation cf0, including rests.

    def test_native_gate_start40ms_no575cut_release_only_rests_and_reattack_notches(self):
        arrays, events = melody.build_controls(synthetic_score(), *controls())
        gate = arrays["gate"]
        self.assertEqual(gate.shape, (460800,))
        self.assertEqual(gate.dtype, np.float64)
        self.assertEqual(gate[0], 0)
        self.assertGreater(gate[480], 0)
        self.assertEqual(gate[960], 1)
        self.assertEqual(gate[2400], 1)  # First note starts at0, not old.575s.
        for index, row in enumerate(events):
            start, end = row["start_sample"], row["end_sample"]
            if row["rest"]:
                self.assertTrue(np.all(gate[start:end] == 0))
                self.assertEqual(gate[start - 960], 1)
                self.assertAlmostEqual(gate[start - 480], .5)
            elif row["articulation"] == "slur":
                self.assertTrue(np.all(gate[start - 240:start + 481] == 1))
            elif row["articulation"] == "rearticulate":
                self.assertEqual(gate[start - 240], 1)
                self.assertEqual(gate[start], 0)
                self.assertEqual(gate[start + 480], 1)
        self.assertTrue(np.isfinite(gate).all())
        self.assertTrue(np.all((gate >= 0) & (gate <= 1)))

    def test20ms_log_center_only_touching_boundaries_and_rest_held(self):
        arrays, events = melody.build_controls(synthetic_score(), *controls())
        for index, row in enumerate(events):
            start, end = row["start_frame"], row["end_frame"]
            if row["rest"]:
                self.assertTrue(np.all(arrays["center_hz"][start:end] == arrays["center_hz"][start]))
            elif index and not events[index - 1]["rest"]:
                old_note = events[index - 1]["transposed_midi"]
                new_note = row["transposed_midi"]
                expected_midi = old_note + (new_note - old_note) * melody.smootherstep(np.arange(5) / 4.)
                expected = 440 * np.exp2((expected_midi - 69) / 12.)
                np.testing.assert_allclose(arrays["center_hz"][start - 2:start + 3], expected, rtol=1e-14)

    def test_bad_score_input_and_ranges_rejected(self):
        for key, value in (("duration_seconds", 4.8), ("bar_count", 7), ("sobak_seconds", .25)):
            score = synthetic_score()
            score[key] = value
            with self.assertRaises(ValueError): melody.parse_score(score)
        score = synthetic_score()
        score["bars"][0]["events"][0]["duration_sobak"] = 0
        with self.assertRaises(ValueError): melody.parse_score(score)
        cf0, features, mean, scale = controls()
        with self.assertRaises(ValueError): melody.build_controls(synthetic_score(), cf0[:1000], features[:1000], mean, scale)
        with self.assertRaises(ValueError): melody.build_controls(synthetic_score(), cf0, features, mean, scale * 0)

    def test_one_baseline_two_long_forwards_same_noise_and_strict_baseline(self):
        rng, expected = np.random.default_rng(17), np.random.default_rng(17)
        saved = expected.normal(size=115200).astype(np.float32)
        calls, prefix = [], []
        def render(variant):
            calls.append(variant)
            n = 115200 if variant == "baseline" else 460800
            wave = rng.normal(size=n).astype(np.float32)
            prefix.append(wave[:100].copy())
            return wave
        baseline, waves, before, after, states = melody.inference(render, lambda: dict(rng.bit_generator.state),
            lambda state: setattr(rng.bit_generator, "state", state), saved)
        self.assertEqual(calls, ["baseline", *melody.VARIANTS])
        self.assertEqual(baseline.tobytes(), saved.tobytes())
        self.assertEqual(prefix[0].tobytes(), prefix[1].tobytes())
        self.assertEqual(prefix[1].tobytes(), prefix[2].tobytes())
        self.assertEqual(rng.bit_generator.state, after)
        self.assertTrue(all(state == before for state in states.values()))
        self.assertTrue(all(w.shape == (460800,) for w in waves.values()))
        with self.assertRaisesRegex(ValueError, "not_byte_exact"):
            melody.inference(lambda _: saved + .1, lambda: None, lambda _: None, saved)

    def test_native_float_wav_roundtrip_and_caps_synthetic(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            wave = np.zeros(460800, np.float32)
            record = melody.write_raw_wav(folder / "raw.wav", wave)
            rate, saved = wavfile.read(folder / record["file"])
            self.assertEqual(rate, 24000)
            self.assertEqual(saved.dtype, np.float32)
            self.assertEqual(saved.tobytes(), wave.tobytes())
            self.assertEqual((folder / record["file"]).stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError): melody.write_raw_wav(folder / "raw.wav", wave)
            with patch.object(melody, "MAX_BYTES", 1), self.assertRaises(RuntimeError): melody.capacity(folder)
            with patch.object(melody.shutil, "disk_usage", return_value=type("Disk", (), {"free": 0})()), self.assertRaises(RuntimeError):
                melody.capacity(folder)

    def test_minus7_register_only_shifts_pitch_five_semitones_from_historical_minus12(self):
        old, old_events = melody.build_controls(synthetic_score(), *controls())
        new, new_events = melody.build_controls(synthetic_score(), *controls(), transpose_semitones=-7)
        factor = 2 ** (5 / 12)
        for key in ("gate", "sounding_mask", "rest_mask", "steady_mask", "template_index_map", "note_index",
                "features", "normalized_features", "borrowed_microcurve_cents",
                "microcurve_envelope_all_microcurve", "microcurve_envelope_late_long_microcurve"):
            self.assertEqual(old[key].tobytes(), new[key].tobytes())
        np.testing.assert_allclose(new["center_hz"], old["center_hz"] * factor, rtol=1e-14)
        for variant in melody.VARIANTS:
            np.testing.assert_allclose(new["target_hz_" + variant], old["target_hz_" + variant] * factor, rtol=2e-7)
        for before, after in zip(old_events, new_events):
            if not before["rest"]:
                self.assertEqual(after["transposed_midi"], before["transposed_midi"] + 5)
            for key in set(before) - {"transposed_midi"}:
                self.assertEqual(before[key], after[key])

    def test_nonfrozen_register_parameter_rejected(self):
        for value in (-5, 0, -12., True, None):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "minus12_or_minus7"):
                melody.parse_score(synthetic_score(), value)
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "minus12_or_minus7"):
                melody.build_controls(synthetic_score(), *controls(), transpose_semitones=value)


if __name__ == "__main__":
    unittest.main()
