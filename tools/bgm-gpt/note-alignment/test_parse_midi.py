"""Synthetic-only pure SMF parser tests; no files, originals or audio/model use."""
import struct
import unittest
from unittest.mock import patch

import parse_midi as parser


def vlq(value):
    output = [value & 127]
    value >>= 7
    while value:
        output.insert(0, (value & 127) | 128)
        value >>= 7
    return bytes(output)


def event(delta, payload):
    return vlq(delta) + payload


def tempo(delta, micros):
    return event(delta, b"\xff\x51\x03" + micros.to_bytes(3, "big"))


def track(events, eot=True):
    data = b"".join(events) + (event(0, b"\xff\x2f\x00") if eot else b"")
    return b"MTrk" + len(data).to_bytes(4, "big") + data


def smf(*tracks, fmt=0, ppqn=480):
    return b"MThd\x00\x00\x00\x06" + struct.pack(">HHH", fmt, len(tracks), ppqn) + b"".join(tracks)


class ExactMidiTests(unittest.TestCase):
    def test_default_tempo_delayed_first_note_velocity_zero_off_and_trailing_rest(self):
        result = parser.parse_midi(smf(track([event(240, b"\x90\x3c\x64"), event(480, b"\x90\x3c\x00"),
            event(240, b"\xff\x01\x00")])))
        note = result["notes"][0]
        self.assertEqual((note["start_tick"], note["end_tick"]), (240, 720))
        self.assertEqual((note["start_seconds"], note["end_seconds"], note["duration_seconds"]), (.25, .75, .5))
        self.assertEqual(note["note_off_kind"], "note_on_velocity_zero")
        self.assertEqual(result["duration_seconds"], 1.)
        self.assertEqual(result["last_paired_note_end_seconds"], .75)
        self.assertTrue(result["alignment_candidate"])
        self.assertFalse(result["acoustic_alignment_validated"])
        self.assertFalse(result["solo_verified"])

    def test_exact_piecewise_tempo_integration_and_conductor_track(self):
        conductor = track([tempo(0, 600_000), tempo(480, 300_000), event(480, b"\xff\x01\x00")])
        melody = track([event(240, b"\x92\x45\x55"), event(480, b"\x82\x45\x37")])
        result = parser.parse_midi(smf(conductor, melody, fmt=1))
        note = result["notes"][0]
        self.assertEqual((note["start_seconds"], note["end_seconds"]), (.3, .75))
        self.assertAlmostEqual(note["duration_seconds"], .45)
        self.assertEqual((note["track"], note["channel"], note["pitch"], note["velocity"], note["release_velocity"]),
                         (1, 2, 69, 85, 55))
        self.assertEqual(result["duration_seconds"], .9)

    def test_running_status_pairing_tracks_channels_and_pitch_extremes(self):
        result = parser.parse_midi(smf(track([event(0, b"\x90\x00\x40"), event(240, b"\x00\x00"),
            event(0, b"\x91\x7f\x7f"), event(240, b"\x7f\x00")])))
        self.assertEqual([n["pitch"] for n in result["notes"]], [0, 127])
        self.assertEqual([n["channel"] for n in result["notes"]], [0, 1])
        self.assertEqual(result["paired_note_count"], 2)
        self.assertTrue(result["alignment_candidate"])

    def test_polyphony_same_key_overlap_retained_FIFO_and_warned(self):
        result = parser.parse_midi(smf(track([event(0, b"\x90\x3c\x40"), event(120, b"\x90\x3c\x50"),
            event(120, b"\x80\x3c\x00"), event(120, b"\x80\x3c\x00")])))
        self.assertEqual([(n["start_tick"], n["end_tick"]) for n in result["notes"]], [(0, 240), (120, 360)])
        self.assertEqual(result["polyphony"]["max_simultaneous_paired_notes"], 2)
        self.assertEqual(result["polyphony"]["positive_overlap_seconds"], .125)
        codes = {w["code"] for w in result["warnings"]}
        self.assertIn("same_key_note_on_before_previous_note_off_FIFO_pairing", codes)
        self.assertIn("overlapping_notes_not_a_monophonic_score_anchor", codes)
        self.assertFalse(result["alignment_candidate"])

    def test_note_touching_is_not_positive_overlap(self):
        result = parser.parse_midi(smf(track([event(0, b"\x90\x3c\x40"), event(240, b"\x80\x3c\x00"),
            event(0, b"\x90\x40\x40"), event(240, b"\x80\x40\x00")])))
        self.assertEqual(result["polyphony"]["max_simultaneous_paired_notes"], 1)
        self.assertEqual(result["polyphony"]["positive_overlap_regions"], 0)

    def test_unmatched_events_and_zero_duration_not_silently_dropped(self):
        result = parser.parse_midi(smf(track([event(0, b"\x80\x3c\x00"), event(0, b"\x90\x3d\x40"),
            event(10, b"\x90\x3e\x40"), event(0, b"\x80\x3e\x00")])))
        self.assertEqual(result["unmatched_note_off_count"], 1)
        self.assertEqual(result["unmatched_note_on_count"], 1)
        self.assertIsNone(result["notes"][0]["end_seconds"])
        self.assertEqual(result["notes"][1]["duration_seconds"], 0.)
        self.assertEqual(result["note_on_count"], 2)
        self.assertFalse(result["alignment_candidate"])

    def test_sustain_bends_lifecycle_controls_sysex_explicit_not_applied(self):
        result = parser.parse_midi(smf(track([event(0, b"\xb0\x40\x7f"), event(0, b"\xe0\x01\x40"),
            event(0, b"\xb0\x7b\x00"), event(0, b"\xf0\x02\x01\xf7"),
            event(0, b"\x90\x3c\x50"), event(480, b"\x80\x3c\x00"), event(480, b"\xb0\x40\x00")])))
        self.assertEqual(result["notes"][0]["end_seconds"], .5)  # Not extended to pedal-up1s.
        self.assertEqual(len(result["sustain_events"]), 2)
        self.assertEqual(result["sustain_events"][-1]["seconds"], 1.)
        self.assertEqual(result["pitch_bend_events"][0]["value14"], 8193)
        self.assertEqual(result["sysex_event_count"], 1)
        self.assertEqual(len(result["unsupported_lifecycle_controllers"]), 1)
        self.assertFalse(result["alignment_candidate"])

    def test_duplicate_same_tempo_collapses_but_conflict_and_nonconductor_refused(self):
        result = parser.parse_midi(smf(track([tempo(0, 600000), tempo(0, 600000),
            event(0, b"\x90\x3c\x40"), event(480, b"\x80\x3c\x00")])))
        self.assertEqual(result["duplicate_identical_tempo_events"], 1)
        self.assertEqual(result["notes"][0]["end_seconds"], .6)
        self.assertTrue(result["alignment_candidate"])
        for data in (smf(track([tempo(0, 500000), tempo(0, 600000)])),
                smf(track([]), track([tempo(0, 500000)]), fmt=1)):
            with self.assertRaises(parser.MidiParseError):
                parser.parse_midi(data)

    def test_default_then_late_tempo_and_header_extension(self):
        data = smf(track([event(0, b"\x90\x3c\x40"), tempo(480, 1000000), event(480, b"\x80\x3c\x00")]))
        extended_header = data[:4] + (8).to_bytes(4, "big") + data[8:14] + b"xx" + data[14:]
        result = parser.parse_midi(extended_header)
        self.assertEqual(result["header_extension_bytes"], 2)
        self.assertEqual(result["notes"][0]["duration_seconds"], 1.5)

    def test_no_notes_and_independent_track_same_pitch_unmatched_not_crosspaired(self):
        empty = parser.parse_midi(smf(track([])))
        self.assertEqual(empty["note_on_count"], 0)
        self.assertFalse(empty["alignment_candidate"])
        result = parser.parse_midi(smf(track([event(0, b"\x90\x3c\x40")]),
            track([event(480, b"\x80\x3c\x00")]), fmt=1))
        self.assertEqual(result["unmatched_note_on_count"], 1)
        self.assertEqual(result["unmatched_note_off_count"], 1)
        self.assertEqual(result["paired_note_count"], 0)

    def test_unsupported_format_SMPTE_zero_division_track_bounds_and_bad_header(self):
        cases = [smf(track([]), fmt=2), smf(track([]), ppqn=0xE728), smf(track([]), ppqn=0),
            smf(track([]), track([]), fmt=0), b"garbage", bytearray(smf(track([]))), smf(track([])) + b"extra"]
        for data in cases:
            with self.subTest(data=bytes(data)[:20]), self.assertRaises(parser.MidiParseError):
                parser.parse_midi(data)
        with patch.object(parser, "MAX_TRACKS", 1), self.assertRaises(parser.MidiParseError):
            parser.parse_midi(smf(track([]), track([]), fmt=1))

    def test_missing_EOT_EOT_payload_post_EOT_and_all_truncations_failclosed(self):
        good = smf(track([event(0, b"\x90\x3c\x40"), event(480, b"\x80\x3c\x00")]))
        for length in range(len(good)):
            with self.subTest(length=length), self.assertRaises(parser.MidiParseError):
                parser.parse_midi(good[:length])
        for chunk in (track([event(0, b"\x90\x3c\x40")], eot=False),
                track([event(0, b"\xff\x2f\x01\x00")], eot=False),
                track([event(0, b"\xff\x2f\x00"), event(0, b"\x90\x3c\x40")])):
            with self.assertRaises(parser.MidiParseError):
                parser.parse_midi(smf(chunk))

    def test_running_status_reset_and_bad_channel_data_failclosed(self):
        for events in ([event(0, b"\x3c\x40")],
                [event(0, b"\x90\x3c\x40"), event(0, b"\xff\x01\x00"), event(1, b"\x3c\x00")],
                [event(0, b"\x90\x3c\x40"), event(0, b"\xf7\x00"), event(1, b"\x3c\x00")],
                [event(0, b"\x90\x80\x40")], [event(0, b"\xf1\x00")]):
            with self.assertRaises(parser.MidiParseError):
                parser.parse_midi(smf(track(events)))

    def test_event_payload_byte_limits_and_VLQ_overflow(self):
        good = smf(track([event(0, b"\x90\x3c\x40"), event(480, b"\x80\x3c\x00")]))
        with patch.object(parser, "MAX_EVENTS", 2), self.assertRaises(parser.MidiParseError):
            parser.parse_midi(good)
        with patch.object(parser, "MAX_BYTES", len(good) - 1), self.assertRaises(parser.MidiParseError):
            parser.parse_midi(good)
        for payload in (b"\xff\x01\x05hello", b"\xf0\x05hello"):
            with patch.object(parser, "MAX_EVENT_PAYLOAD_BYTES", 4), self.assertRaises(parser.MidiParseError):
                parser.parse_midi(smf(track([event(0, payload)])))
        for events in ([b"\x81\x80\x80\x80\x00\x90\x3c\x40"],
                [event(0, b"\xff\x51\x02\x01\x02")], [tempo(0, 0)]):
            with self.assertRaises(parser.MidiParseError):
                parser.parse_midi(smf(track(events)))


if __name__ == "__main__":
    unittest.main()
