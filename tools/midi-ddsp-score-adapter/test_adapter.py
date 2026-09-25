#!/usr/bin/env python3
"""Tests for the no-audio, no-MIDI-DDSP authorial score adapter."""

from __future__ import annotations

import ast
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
SCORE_EXPRESSION_DIR = HERE.parent / "score-expression"
for module_dir in (HERE, SCORE_EXPRESSION_DIR):
    if str(module_dir) not in sys.path:
        sys.path.insert(0, str(module_dir))

from adapter import (  # noqa: E402
    BRIDGE_FILENAME,
    GM_FLUTE_PROGRAM_ONE_BASED,
    GM_FLUTE_PROGRAM_ZERO_BASED,
    MIDI_DDSP_EXPRESSION_FIELDS,
    MIDI_DDSP_INSTRUMENT_ID,
    MIDI_DDSP_INSTRUMENT_NAME,
    MIDI_FILENAME,
    TICKS_PER_QUARTER,
    MidiDdspScoreAdapterError,
    build_adapter,
)


PLAN = SCORE_EXPRESSION_DIR / "plans" / "ari_source_led_response_r1.json"
AUDITION_PLAN = SCORE_EXPRESSION_DIR / "plans" / "ari_gyeonggi_policy_r1_audition.json"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _read_vlq(data: bytes, position: int) -> tuple[int, int]:
    value = 0
    for _ in range(4):
        if position >= len(data):
            raise AssertionError("truncated VLQ")
        byte = data[position]
        position += 1
        value = (value << 7) | (byte & 0x7F)
        if not byte & 0x80:
            return value, position
    raise AssertionError("VLQ exceeds four bytes")


def _parse_standard_midi(data: bytes) -> dict[str, object]:
    """A deliberately small SMF validator for the event subset this adapter emits."""

    if data[:4] != b"MThd":
        raise AssertionError("missing SMF header")
    header_length = int.from_bytes(data[4:8], "big")
    if header_length != 6:
        raise AssertionError("SMF header must be six bytes")
    smf_format = int.from_bytes(data[8:10], "big")
    track_count = int.from_bytes(data[10:12], "big")
    division = int.from_bytes(data[12:14], "big")
    if data[14:18] != b"MTrk":
        raise AssertionError("missing SMF track")
    length = int.from_bytes(data[18:22], "big")
    position = 22
    end = position + length
    if end != len(data):
        raise AssertionError("SMF track length does not match file payload")
    events: list[dict[str, object]] = []
    tick = 0
    while position < end:
        delta, position = _read_vlq(data, position)
        tick += delta
        if position >= end:
            raise AssertionError("missing SMF status")
        status = data[position]
        position += 1
        if status == 0xFF:
            if position >= end:
                raise AssertionError("truncated meta event")
            meta_type = data[position]
            position += 1
            size, position = _read_vlq(data, position)
            payload = data[position:position + size]
            if len(payload) != size:
                raise AssertionError("truncated meta payload")
            position += size
            events.append({"tick": tick, "kind": "meta", "type": meta_type, "payload": payload})
            continue
        family = status & 0xF0
        channel = status & 0x0F
        if family in (0x80, 0x90):
            payload = data[position:position + 2]
            if len(payload) != 2:
                raise AssertionError("truncated note event")
            position += 2
            events.append({
                "tick": tick,
                "kind": "note_off" if family == 0x80 else "note_on",
                "channel": channel,
                "note": payload[0],
                "velocity": payload[1],
            })
            continue
        if family == 0xC0:
            payload = data[position:position + 1]
            if len(payload) != 1:
                raise AssertionError("truncated program change")
            position += 1
            events.append({"tick": tick, "kind": "program_change", "channel": channel, "program": payload[0]})
            continue
        raise AssertionError(f"unexpected emitted SMF status: {status:02x}")
    return {
        "format": smf_format,
        "track_count": track_count,
        "division": division,
        "events": events,
    }


class MidiDdspScoreAdapterTests(unittest.TestCase):
    def test_ari_plan_writes_deterministic_valid_monophonic_midi_and_explicit_bridge(self) -> None:
        self.assertTrue(PLAN.is_file())
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            before = _sha256(PLAN)
            first = root / "first"
            second = root / "second"
            one = build_adapter(PLAN, first)
            two = build_adapter(PLAN, second)

            self.assertEqual(one, two)
            self.assertEqual(before, _sha256(PLAN))
            self.assertEqual((first / MIDI_FILENAME).read_bytes(), (second / MIDI_FILENAME).read_bytes())
            self.assertEqual(
                (first / BRIDGE_FILENAME).read_text(encoding="utf-8"),
                (second / BRIDGE_FILENAME).read_text(encoding="utf-8"),
            )
            self.assertNotIn(str(root), (first / BRIDGE_FILENAME).read_text(encoding="utf-8"))

            parsed = _parse_standard_midi((first / MIDI_FILENAME).read_bytes())
            self.assertEqual(parsed["format"], 0)
            self.assertEqual(parsed["track_count"], 1)
            self.assertEqual(parsed["division"], TICKS_PER_QUARTER)
            events = parsed["events"]
            assert isinstance(events, list)
            program = [event for event in events if event["kind"] == "program_change"]
            self.assertEqual(program, [{"tick": 0, "kind": "program_change", "channel": 0, "program": 73}])
            note_ons = [event for event in events if event["kind"] == "note_on"]
            note_offs = [event for event in events if event["kind"] == "note_off"]
            self.assertEqual([event["note"] for event in note_ons], [70, 77, 77, 77, 74, 72])
            self.assertEqual([event["tick"] for event in note_ons], [0, 9000, 15000, 18000, 21000, 24000])
            self.assertEqual([event["tick"] for event in note_offs], [6000, 15000, 18000, 21000, 24000, 27000])
            end_of_track = [event for event in events if event["kind"] == "meta" and event["type"] == 0x2F]
            self.assertEqual(end_of_track, [{"tick": 28000, "kind": "meta", "type": 0x2F, "payload": b""}])

            # A mono event walk also verifies Note Off precedes Note On at every
            # same-tick reattack/slur boundary; MIDI itself is not asked to
            # infer which of those boundaries is a slur.
            active: int | None = None
            for event in events:
                if event["kind"] == "note_on":
                    self.assertIsNone(active)
                    active = int(event["note"])
                elif event["kind"] == "note_off":
                    self.assertEqual(active, int(event["note"]))
                    active = None
            self.assertIsNone(active)

            gm = one["standard_midi"]["general_midi_program"]
            self.assertEqual(gm["display_name"], "Flute")
            self.assertEqual(gm["one_based_program_number"], GM_FLUTE_PROGRAM_ONE_BASED)
            self.assertEqual(gm["zero_based_program_change_data_byte"], GM_FLUTE_PROGRAM_ZERO_BASED)
            reference = one["midi_ddsp_reference"]
            self.assertEqual(reference["documented_instrument_name"], MIDI_DDSP_INSTRUMENT_NAME)
            self.assertEqual(reference["documented_instrument_id"], MIDI_DDSP_INSTRUMENT_ID)
            self.assertNotEqual(reference["documented_instrument_id"], gm["zero_based_program_change_data_byte"])
            self.assertTrue(reference["midi_ddsp_instrument_id_is_not_general_midi_program"])
            self.assertTrue(reference["midi_ddsp_not_imported_installed_or_invoked_by_this_adapter"])

            rows = one["notes"]
            self.assertEqual([row["plan_event_id"] for row in rows], [
                "b08_e0_breath",
                "b09_e0_breath",
                "b09_e1_rearticulate",
                "b10_e0_slur",
                "b10_e1_slur",
                "b10_e2_slur_explicit_vibrato",
            ])
            self.assertEqual(
                tuple(rows[0]["midi_ddsp_expression"]),
                MIDI_DDSP_EXPRESSION_FIELDS,
            )
            for row in rows:
                for name, value in row["midi_ddsp_expression"].items():
                    self.assertIn(name, MIDI_DDSP_EXPRESSION_FIELDS)
                    self.assertGreaterEqual(value, 0.0)
                    self.assertLessEqual(value, 1.0)
                self.assertTrue(row["articulation_preservation"]["touching_timestamp_is_not_a_slur_rule"])
            self.assertEqual(rows[2]["articulation_preservation"]["relation_to_previous_note"], "explicit_authorial_rearticulate")
            self.assertEqual(rows[3]["articulation_preservation"]["relation_to_previous_note"], "explicit_authorial_slur")
            self.assertEqual(rows[4]["articulation_preservation"]["relation_to_previous_note"], "explicit_authorial_slur")
            self.assertEqual(rows[5]["articulation_preservation"]["relation_to_previous_note"], "explicit_authorial_slur")
            self.assertTrue(all(row["midi_ddsp_expression"]["vibrato"] == 0.0 for row in rows))
            self.assertTrue(all(row["source_vibrato"]["source_end_fade_seconds"] == 0.0 for row in rows))
            self.assertEqual(one["release_segments"][0]["plan_event_id"], "b10_release")
            self.assertIsNone(one["release_segments"][0]["midi_ddsp_expression_row"])
            self.assertTrue(one["authorial_mapping_policy"]["not_inferred_daegeum_performance"])
            self.assertTrue(one["interpretation_limits"]["source_plan_breath_rearticulate_slur_release_are_preserved_not_inferred"])

    def test_explicit_audition_preserves_late_yoseong_metadata_without_inventing_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            manifest = build_adapter(AUDITION_PLAN, Path(temporary) / "audition")
        rows = manifest["notes"]
        selected = rows[0]
        self.assertEqual(selected["plan_event_id"], "b08_e0_breath")
        self.assertEqual(selected["midi_ddsp_expression"]["vibrato"], 0.4)
        self.assertEqual(selected["source_vibrato"]["source_rate_hz"], 3.45)
        self.assertEqual(selected["source_vibrato"]["source_onset_seconds"], 0.72)
        self.assertEqual(selected["source_vibrato"]["source_ramp_seconds"], 0.18)
        self.assertEqual(selected["source_vibrato"]["source_end_fade_seconds"], 0.18)
        self.assertTrue(
            selected["source_vibrato"]
            ["source_onset_ramp_and_end_fade_are_metadata_not_representable_by_one_midi_ddsp_vibrato_scalar"]
        )
        self.assertTrue(all(row["midi_ddsp_expression"]["vibrato"] == 0.0 for row in rows[1:]))

    def test_adapter_refuses_output_overwrite_and_unrepresentable_microtonal_pitch(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            existing = root / "existing"
            existing.mkdir()
            with self.assertRaisesRegex(MidiDdspScoreAdapterError, "fresh"):
                build_adapter(PLAN, existing)

            payload = json.loads(PLAN.read_text(encoding="utf-8"))
            altered = copy.deepcopy(payload)
            altered["events"][0]["pitch_hz"] = 440.01
            microtonal = root / "microtonal.json"
            microtonal.write_text(json.dumps(altered), encoding="utf-8")
            output = root / "microtonal-output"
            with self.assertRaisesRegex(MidiDdspScoreAdapterError, "pitch bend"):
                build_adapter(microtonal, output)
            self.assertFalse(output.exists())

    def test_adapter_has_no_midi_ddsp_python_import(self) -> None:
        tree = ast.parse((HERE / "adapter.py").read_text(encoding="utf-8"))
        imported: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module)
        self.assertFalse(any(name == "midi_ddsp" or name.startswith("midi_ddsp.") for name in imported))


if __name__ == "__main__":
    unittest.main()
