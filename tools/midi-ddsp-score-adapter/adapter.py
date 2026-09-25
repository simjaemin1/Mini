#!/usr/bin/env python3
"""Build a standard monophonic MIDI + authorial MIDI-DDSP expression bridge.

This adapter is deliberately only a score/control bridge.  It accepts an
explicit ``mini.score-expression.plan.v1`` (normally the Ari b08--b10 plan),
uses the existing score-expression validator/compiler, and writes:

* a standards-valid Type-0 Standard MIDI File with one monophonic channel and
  an explicit General MIDI Flute program change; and
* a deterministic JSON sidecar carrying the six documented MIDI-DDSP
  note-expression field names: ``volume``, ``vol_fluc``, ``vibrato``,
  ``brightness``, ``attack``, and ``vol_peak_pos``.

It does *not* install, import, invoke, or require MIDI-DDSP.  It does not read
or write source audio.  The JSON values are a declared, deterministic
authorial starting policy awaiting actual western-model inference; they are
not inferred Daegeum performance, a Daegeum model, an acoustic transcription,
or a claim that MIDI-DDSP will render Korean traditional performance naturally.

MIDI itself has no universal semantic slur event.  Every pitch-bearing score
event remains a MIDI note.  At an exact boundary the file orders Note Off
before Note On; the JSON preserves an ``explicit_authorial_slur`` only when the
input plan explicitly names it.  Touching timestamps never create a slur.

Example:

    /tmp/durango-bgm-rnd-venv/bin/python tools/midi-ddsp-score-adapter/adapter.py \
      --plan tools/score-expression/plans/ari_source_led_response_r1.json \
      --output-dir _bgm_rnd/ari-midi-ddsp-score-adapter-YYYYMMDD
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
from typing import Any, Mapping, Sequence


HERE = Path(__file__).resolve().parent
SCORE_EXPRESSION_DIR = HERE.parent / "score-expression"
if str(SCORE_EXPRESSION_DIR) not in sys.path:
    sys.path.insert(0, str(SCORE_EXPRESSION_DIR))

from compile_expression import (  # noqa: E402
    PLAN_SCHEMA,
    ScoreExpressionError,
    compile_plan,
)


ADAPTER_SCHEMA = "mini.midi-ddsp-score-adapter.v1"
MIDI_FILENAME = "authorial_score.mid"
BRIDGE_FILENAME = "midi_ddsp_authorial_bridge.json"

# Standard MIDI File: format 0 / one track / 3,000 ticks per quarter note.
# 720,000 µs/qn means a 0.72-second authored beat is exactly 3,000 ticks and
# every time in the Ari slice (a multiple of 0.24 seconds) is represented
# exactly without an audio time stretch or a rounding drift.
SMF_FORMAT = 0
SMF_TRACK_COUNT = 1
TICKS_PER_QUARTER = 3_000
TEMPO_MICROSECONDS_PER_QUARTER = 720_000
MIDI_CHANNEL = 0
GM_FLUTE_PROGRAM_ZERO_BASED = 73
GM_FLUTE_PROGRAM_ONE_BASED = 74

# MIDI-DDSP's archived official source maps ``flute`` to ID 4.  This is *not*
# a General MIDI program number and remains sidecar provenance only: the
# adapter never imports MIDI-DDSP to resolve or invoke it.
MIDI_DDSP_INSTRUMENT_NAME = "flute"
MIDI_DDSP_INSTRUMENT_ID = 4
MIDI_DDSP_README_URI = "https://github.com/magenta/midi-ddsp/blob/main/README.md"
MIDI_DDSP_EXPRESSION_URI = "https://midi-ddsp.github.io/note_expression_control.html"
MIDI_DDSP_INSTRUMENT_MAPPING_URI = (
    "https://github.com/magenta/midi-ddsp/blob/main/midi_ddsp/data_handling/instrument_name_utils.py"
)
MIDI_DDSP_EXPRESSION_FIELDS = (
    "volume",
    "vol_fluc",
    "vibrato",
    "brightness",
    "attack",
    "vol_peak_pos",
)

LOUDNESS_DB_FLOOR = -60.0
LOUDNESS_DB_CEILING = -6.0
VIBRATO_DEPTH_REFERENCE_CENTS = 45.0
ARTICULATION_POLICY: dict[str, dict[str, float]] = {
    # These are authorial bridge defaults only, deliberately not values learned
    # from the Daegeum corpus. ``attack`` names MIDI-DDSP's documented attack
    # noise control; it is not a claim about actual breath or tonguing noise.
    "breath_start": {
        "vol_fluc": 0.28,
        "brightness": 0.50,
        "attack": 0.65,
        "vol_peak_pos": 0.28,
    },
    "rearticulate": {
        "vol_fluc": 0.34,
        "brightness": 0.50,
        "attack": 0.78,
        "vol_peak_pos": 0.22,
    },
    "slur": {
        "vol_fluc": 0.12,
        "brightness": 0.50,
        "attack": 0.12,
        "vol_peak_pos": 0.50,
    },
}


class MidiDdspScoreAdapterError(RuntimeError):
    """The explicit score cannot be safely represented by this narrow bridge."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _round(value: float) -> float:
    return round(float(value), 6)


def _clamp_unit(value: float, *, label: str) -> float:
    if not math.isfinite(value):
        raise MidiDdspScoreAdapterError(f"{label} must be finite")
    return min(1.0, max(0.0, value))


def _json_load(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise MidiDdspScoreAdapterError("--plan does not exist") from exc
    except json.JSONDecodeError as exc:
        raise MidiDdspScoreAdapterError("--plan is not valid JSON") from exc
    if not isinstance(value, Mapping):
        raise MidiDdspScoreAdapterError("--plan must be a JSON object")
    return dict(value)


def _json_dump(path: Path, value: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _raw_events_by_id(plan: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    if plan.get("schema") != PLAN_SCHEMA:
        raise MidiDdspScoreAdapterError(f"plan.schema must be {PLAN_SCHEMA}")
    events = plan.get("events")
    if not isinstance(events, list):
        raise MidiDdspScoreAdapterError("plan.events must be a list")
    result: dict[str, dict[str, Any]] = {}
    for index, event in enumerate(events):
        if not isinstance(event, Mapping):
            raise MidiDdspScoreAdapterError(f"plan.events[{index}] must be an object")
        event_id = event.get("id")
        if not isinstance(event_id, str) or not event_id or event_id in result:
            raise MidiDdspScoreAdapterError("plan events must have unique non-empty IDs")
        result[event_id] = dict(event)
    return result


def _seconds_to_tick(seconds: float) -> int:
    if not math.isfinite(seconds) or seconds < 0.0:
        raise MidiDdspScoreAdapterError("score time must be finite and non-negative")
    raw = seconds * TICKS_PER_QUARTER * 1_000_000.0 / TEMPO_MICROSECONDS_PER_QUARTER
    tick = int(round(raw))
    if abs(raw - tick) > 1.0e-6:
        raise MidiDdspScoreAdapterError(
            "score time cannot be represented exactly by the fixed standard-MIDI timing grid"
        )
    return tick


def _midi_note_from_hz(pitch_hz: Any, *, event_id: str) -> tuple[int, float]:
    try:
        hz = float(pitch_hz)
    except (TypeError, ValueError) as exc:
        raise MidiDdspScoreAdapterError(f"{event_id}.pitch_hz must be finite") from exc
    if not math.isfinite(hz) or hz <= 0.0:
        raise MidiDdspScoreAdapterError(f"{event_id}.pitch_hz must be positive")
    continuous = 69.0 + 12.0 * math.log2(hz / 440.0)
    rounded = int(round(continuous))
    # This bridge intentionally does not invent pitch bends.  The authored
    # plan's current pitches are equal-tempered MIDI values to much tighter
    # than this 0.01-cent tolerance.
    cents_error = (continuous - rounded) * 100.0
    if not 0 <= rounded <= 127 or abs(cents_error) > 0.01:
        raise MidiDdspScoreAdapterError(
            f"{event_id}.pitch_hz is not an exact standard-MIDI semitone; the bridge will not add inferred pitch bend"
        )
    return rounded, cents_error


def _volume_from_loudness_db(value: Any, *, event_id: str) -> float:
    try:
        loudness = float(value)
    except (TypeError, ValueError) as exc:
        raise MidiDdspScoreAdapterError(f"{event_id}.steady_loudness_db must be finite") from exc
    if not math.isfinite(loudness):
        raise MidiDdspScoreAdapterError(f"{event_id}.steady_loudness_db must be finite")
    return _clamp_unit(
        (loudness - LOUDNESS_DB_FLOOR) / (LOUDNESS_DB_CEILING - LOUDNESS_DB_FLOOR),
        label=f"{event_id}.volume",
    )


def _expression_for_event(event: Mapping[str, Any]) -> tuple[dict[str, float], dict[str, Any]]:
    event_id = str(event["id"])
    articulation = event.get("articulation")
    if articulation not in ARTICULATION_POLICY:
        raise MidiDdspScoreAdapterError(f"{event_id} does not name a pitch-bearing articulation")
    policy = ARTICULATION_POLICY[str(articulation)]
    raw_vibrato = event.get("vibrato")
    if not isinstance(raw_vibrato, Mapping):
        raise MidiDdspScoreAdapterError(f"{event_id}.vibrato is missing from compiled plan")
    enabled = raw_vibrato.get("enabled") is True
    if enabled:
        try:
            source_depth = float(raw_vibrato.get("depth_cents"))
            source_rate = float(raw_vibrato.get("rate_hz"))
            source_onset = float(raw_vibrato.get("onset_seconds"))
            source_ramp = float(raw_vibrato.get("ramp_seconds"))
            source_end_fade = float(raw_vibrato.get("end_fade_seconds", 0.0))
        except (TypeError, ValueError) as exc:
            raise MidiDdspScoreAdapterError(f"{event_id}.vibrato is malformed") from exc
        if not all(
            math.isfinite(item)
            for item in (source_depth, source_rate, source_onset, source_ramp, source_end_fade)
        ):
            raise MidiDdspScoreAdapterError(f"{event_id}.vibrato must be finite")
        midi_ddsp_vibrato = _clamp_unit(
            source_depth / VIBRATO_DEPTH_REFERENCE_CENTS,
            label=f"{event_id}.vibrato",
        )
    else:
        source_depth = 0.0
        source_rate = 0.0
        source_onset = 0.0
        source_ramp = 0.0
        source_end_fade = 0.0
        midi_ddsp_vibrato = 0.0
    expression = {
        "volume": _round(_volume_from_loudness_db(event.get("steady_loudness_db"), event_id=event_id)),
        "vol_fluc": _round(_clamp_unit(policy["vol_fluc"], label=f"{event_id}.vol_fluc")),
        "vibrato": _round(midi_ddsp_vibrato),
        "brightness": _round(_clamp_unit(policy["brightness"], label=f"{event_id}.brightness")),
        "attack": _round(_clamp_unit(policy["attack"], label=f"{event_id}.attack")),
        "vol_peak_pos": _round(_clamp_unit(policy["vol_peak_pos"], label=f"{event_id}.vol_peak_pos")),
    }
    if tuple(expression) != MIDI_DDSP_EXPRESSION_FIELDS:
        raise MidiDdspScoreAdapterError("internal expression-field order drifted from the documented MIDI-DDSP API")
    return expression, {
        "enabled": enabled,
        "source_rate_hz": _round(source_rate),
        "source_depth_cents": _round(source_depth),
        "source_onset_seconds": _round(source_onset),
        "source_ramp_seconds": _round(source_ramp),
        "source_end_fade_seconds": _round(source_end_fade),
        "midi_ddsp_vibrato_value": expression["vibrato"],
        "source_rate_is_preserved_as_authorial_metadata_not_a_documented_midi_ddsp_note_field": True,
        "source_onset_ramp_and_end_fade_are_metadata_not_representable_by_one_midi_ddsp_vibrato_scalar": True,
        "depth_to_midi_ddsp_value_policy": (
            "0 when disabled; otherwise source depth cents divided by the explicit 45-cent authorial reference"
        ),
    }


def _velocity_from_volume(volume: float) -> int:
    return min(127, max(1, int(round(volume * 127.0))))


def _articulation_relation(
    event: Mapping[str, Any],
    raw_event: Mapping[str, Any],
    previous_note: Mapping[str, Any] | None,
) -> dict[str, Any]:
    if previous_note is None:
        return {
            "relation_to_previous_note": "first_note_or_after_written_rest",
            "touching_timestamp_is_not_a_slur_rule": True,
        }
    start = float(event["start_seconds"])
    previous_end = float(previous_note["offset_seconds"])
    touching = abs(start - previous_end) <= (1.0 / 48_000.0)
    articulation = str(event["articulation"])
    if articulation == "slur":
        if raw_event.get("slur_from_previous") is not True:
            raise MidiDdspScoreAdapterError(
                f"{event['id']} is compiled as slur but raw plan lacks explicit slur_from_previous"
            )
        return {
            "relation_to_previous_note": "explicit_authorial_slur",
            "previous_plan_event_id": previous_note["plan_event_id"],
            "timestamps_touch": touching,
            "slur_is_explicit_in_source_plan": True,
            "touching_timestamp_is_not_a_slur_rule": True,
            "standard_midi_has_no_universal_slur_semantic": True,
        }
    if articulation == "rearticulate":
        return {
            "relation_to_previous_note": "explicit_authorial_rearticulate",
            "previous_plan_event_id": previous_note["plan_event_id"],
            "timestamps_touch": touching,
            "touching_timestamp_is_not_a_slur_rule": True,
            "midi_note_off_then_note_on_forces_an_explicit_boundary": True,
        }
    return {
        "relation_to_previous_note": (
            "touching_timestamp_but_not_explicit_slur" if touching else "separate_note_after_gap_or_rest"
        ),
        "previous_plan_event_id": previous_note["plan_event_id"],
        "timestamps_touch": touching,
        "touching_timestamp_is_not_a_slur_rule": True,
    }


def _build_note_rows(
    compiled: Mapping[str, Any],
    raw_by_id: Mapping[str, Mapping[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    note_rows: list[dict[str, Any]] = []
    release_rows: list[dict[str, Any]] = []
    previous_note: dict[str, Any] | None = None
    for event in compiled["events"]:
        event_id = event.get("id")
        if not isinstance(event_id, str) or event_id not in raw_by_id:
            raise MidiDdspScoreAdapterError("compiled event cannot be reconciled with raw plan event")
        articulation = str(event["articulation"])
        start_seconds = float(event["start_seconds"])
        end_seconds = float(event["end_seconds"])
        start_tick = _seconds_to_tick(start_seconds)
        end_tick = _seconds_to_tick(end_seconds)
        if not end_tick > start_tick:
            raise MidiDdspScoreAdapterError(f"{event_id} collapses on the standard-MIDI timing grid")
        if articulation == "release":
            release_rows.append({
                "plan_event_id": event_id,
                "authorial_articulation": "release",
                "onset_seconds": _round(start_seconds),
                "offset_seconds": _round(end_seconds),
                "onset_tick": start_tick,
                "offset_tick": end_tick,
                "midi_encoding": "no_pitch_note; preserved as an authorial release segment before end-of-track",
                "midi_ddsp_expression_row": None,
                "release_is_not_inferred_from_source_audio": True,
            })
            continue
        midi_note, cents_error = _midi_note_from_hz(event.get("pitch_hz"), event_id=event_id)
        expression, vibrato_source = _expression_for_event(event)
        row: dict[str, Any] = {
            "note_index": len(note_rows),
            "plan_event_id": event_id,
            "authorial_articulation": articulation,
            "onset_seconds": _round(start_seconds),
            "offset_seconds": _round(end_seconds),
            "onset_tick": start_tick,
            "offset_tick": end_tick,
            "duration_ticks": end_tick - start_tick,
            "pitch_hz": _round(float(event["pitch_hz"])),
            "midi_note": midi_note,
            "pitch_rounding_error_cents": _round(cents_error),
            "midi_velocity": _velocity_from_volume(expression["volume"]),
            "midi_event_encoding": {
                "channel_zero_based": MIDI_CHANNEL,
                "note_on_status_hex": "90",
                "note_off_status_hex": "80",
                "same_tick_event_order": "Note Off before Note On",
                "pitch_bend_not_added": True,
            },
            "midi_ddsp_expression": expression,
            "source_vibrato": vibrato_source,
        }
        row["articulation_preservation"] = _articulation_relation(event, raw_by_id[event_id], previous_note)
        note_rows.append(row)
        previous_note = row
    if not note_rows:
        raise MidiDdspScoreAdapterError("plan has no pitch-bearing notes to encode")
    return note_rows, release_rows


def _vlq(value: int) -> bytes:
    if type(value) is not int or not 0 <= value <= 0x0FFFFFFF:
        raise MidiDdspScoreAdapterError("standard-MIDI variable-length quantity is out of range")
    bytes_reversed = [value & 0x7F]
    value >>= 7
    while value:
        bytes_reversed.append((value & 0x7F) | 0x80)
        value >>= 7
    return bytes(reversed(bytes_reversed))


def _meta_event(meta_type: int, payload: bytes) -> bytes:
    if not 0 <= meta_type <= 0x7F:
        raise MidiDdspScoreAdapterError("MIDI meta event type is out of range")
    return bytes((0xFF, meta_type)) + _vlq(len(payload)) + payload


def _build_standard_midi(note_rows: Sequence[Mapping[str, Any]], *, total_duration_tick: int) -> bytes:
    """Encode a format-0 SMF without relying on a MIDI package/runtime."""

    if total_duration_tick < 0:
        raise MidiDdspScoreAdapterError("total duration tick must be non-negative")
    events: list[tuple[int, int, int, bytes]] = []
    sequence = 0

    def add(tick: int, priority: int, payload: bytes) -> None:
        nonlocal sequence
        if tick < 0:
            raise MidiDdspScoreAdapterError("MIDI event tick must be non-negative")
        events.append((tick, priority, sequence, payload))
        sequence += 1

    add(0, 0, _meta_event(0x03, b"Ari authorial score R&D"))
    add(0, 1, _meta_event(0x51, TEMPO_MICROSECONDS_PER_QUARTER.to_bytes(3, "big")))
    add(0, 2, bytes((0xC0 | MIDI_CHANNEL, GM_FLUTE_PROGRAM_ZERO_BASED)))
    for row in note_rows:
        onset = int(row["onset_tick"])
        offset = int(row["offset_tick"])
        note = int(row["midi_note"])
        velocity = int(row["midi_velocity"])
        # Note Off comes first at a shared tick, preserving explicit
        # reattacks. A slur remains a separate authorial JSON relation rather
        # than pretending standard MIDI universally encodes a slur.
        add(offset, 10, bytes((0x80 | MIDI_CHANNEL, note, 0)))
        add(onset, 20, bytes((0x90 | MIDI_CHANNEL, note, velocity)))
    add(total_duration_tick, 100, _meta_event(0x2F, b""))
    events.sort(key=lambda item: (item[0], item[1], item[2]))
    previous_tick = 0
    track = bytearray()
    for tick, _priority, _sequence, payload in events:
        if tick < previous_tick:
            raise MidiDdspScoreAdapterError("MIDI event ordering regressed")
        track.extend(_vlq(tick - previous_tick))
        track.extend(payload)
        previous_tick = tick
    header = b"MThd" + struct.pack(
        ">IHHH",
        6,
        SMF_FORMAT,
        SMF_TRACK_COUNT,
        TICKS_PER_QUARTER,
    )
    return header + b"MTrk" + struct.pack(">I", len(track)) + bytes(track)


def _scope(compiled: Mapping[str, Any]) -> dict[str, bool]:
    scope = compiled.get("scope")
    if not isinstance(scope, Mapping):
        raise MidiDdspScoreAdapterError("compiled plan lacks R&D scope")
    required = ("r_and_d_only", "no_default_assets", "no_runtime_bgm", "no_game_output", "no_public_release")
    if any(scope.get(key) is not True for key in required):
        raise MidiDdspScoreAdapterError("compiled plan lost its strict R&D scope")
    return {key: True for key in required}


def _bridge_manifest(
    *,
    compiled: Mapping[str, Any],
    note_rows: Sequence[Mapping[str, Any]],
    release_rows: Sequence[Mapping[str, Any]],
    midi_bytes: bytes,
    total_duration_tick: int,
) -> dict[str, Any]:
    return {
        "schema": ADAPTER_SCHEMA,
        "artifact_kind": "authorial_score_to_standard_midi_and_midi_ddsp_expression_bridge",
        "r_and_d_scope": _scope(compiled),
        "source_plan": {
            "basename": Path(compiled["plan_path"]).name,
            "sha256": compiled["plan_sha256"],
            "instrument_id": "daegeum",
            "source_is_explicit_authorial_score_expression_plan": True,
            "source_audio_not_read_or_modified": True,
        },
        "standard_midi": {
            "filename": MIDI_FILENAME,
            "sha256": _sha256_bytes(midi_bytes),
            "smf_format": SMF_FORMAT,
            "track_count": SMF_TRACK_COUNT,
            "ticks_per_quarter_note": TICKS_PER_QUARTER,
            "tempo_microseconds_per_quarter_note": TEMPO_MICROSECONDS_PER_QUARTER,
            "channel_zero_based": MIDI_CHANNEL,
            "monophonic": True,
            "end_of_track_tick": total_duration_tick,
            "general_midi_program": {
                "display_name": "Flute",
                "one_based_program_number": GM_FLUTE_PROGRAM_ONE_BASED,
                "zero_based_program_change_data_byte": GM_FLUTE_PROGRAM_ZERO_BASED,
                "program_change_status_hex": "C0",
                "is_distinct_from_midi_ddsp_instrument_id": True,
            },
            "standard_midi_slur_limit": (
                "No universal semantic slur event is written; Note Off precedes Note On and explicit slur "
                "relationships remain in this JSON bridge."
            ),
        },
        "midi_ddsp_reference": {
            "official_readme_uri": MIDI_DDSP_README_URI,
            "official_expression_control_uri": MIDI_DDSP_EXPRESSION_URI,
            "official_instrument_mapping_uri": MIDI_DDSP_INSTRUMENT_MAPPING_URI,
            "documented_expression_fields": list(MIDI_DDSP_EXPRESSION_FIELDS),
            "documented_expression_field_range": [0.0, 1.0],
            "documented_instrument_name": MIDI_DDSP_INSTRUMENT_NAME,
            "documented_instrument_id": MIDI_DDSP_INSTRUMENT_ID,
            "midi_ddsp_instrument_id_is_not_general_midi_program": True,
            "midi_ddsp_not_imported_installed_or_invoked_by_this_adapter": True,
            "actual_western_model_inference_is_pending": True,
        },
        "authorial_mapping_policy": {
            "bridge_is_authorial_initial_conditioning_not_learned_prediction": True,
            "not_inferred_daegeum_performance": True,
            "not_a_daegeum_renderer_or_training_result": True,
            "not_an_acoustic_transcription_or_source_audio_alignment": True,
            "touching_timestamp_is_not_a_slur_rule": True,
            "loudness_to_volume": {
                "formula": "clamp((steady_loudness_db - (-60)) / ((-6) - (-60)), 0, 1)",
                "source_db_floor": LOUDNESS_DB_FLOOR,
                "source_db_ceiling": LOUDNESS_DB_CEILING,
            },
            "articulation_defaults": ARTICULATION_POLICY,
            "vibrato_policy": {
                "disabled_value": 0.0,
                "enabled_value_formula": "source_depth_cents / 45",
                "source_rate_preserved_separately_not_converted_to_a_documented_note_field": True,
                "source_onset_ramp_and_end_fade_preserved_as_metadata_not_note_expression_fields": True,
            },
            "brightness_policy": "neutral 0.50 unless a future explicitly authored policy changes it",
            "midi_velocity_policy": "round(volume * 127), clamped to [1, 127]; auxiliary standard-MIDI encoding only",
            "no_pitch_bend_or_midi_cc_expression_is_invented": True,
        },
        "timeline": {
            "score_duration_seconds": _round(float(compiled["duration_seconds"])),
            "note_count": len(note_rows),
            "release_segment_count": len(release_rows),
            "note_rows_are_in_plan_order": True,
        },
        "notes": list(note_rows),
        "release_segments": list(release_rows),
        "interpretation_limits": {
            "each_numeric_expression_value_is_an_authorial_bridge_value_not_a_model_output": True,
            "source_plan_breath_rearticulate_slur_release_are_preserved_not_inferred": True,
            "numeric_fit_or_midi_encoding_does_not_approve_phrase_slur_legato_or_performance_quality": True,
            "no_default_runtime_bgm_or_public_asset_is_changed": True,
        },
    }


def build_adapter(
    plan_path: str | Path,
    output_dir: str | Path,
) -> dict[str, Any]:
    """Compile one explicit plan into a fresh standard-MIDI/JSON R&D bundle."""

    plan = Path(plan_path).expanduser().resolve()
    output = Path(output_dir).expanduser().resolve()
    if not plan.is_file():
        raise MidiDdspScoreAdapterError("--plan must name an existing score-expression plan")
    if output.exists():
        raise MidiDdspScoreAdapterError("--output-dir must be fresh; refusing to overwrite an R&D artifact")
    raw_plan = _json_load(plan)
    raw_by_id = _raw_events_by_id(raw_plan)
    try:
        compiled = compile_plan(plan)
    except ScoreExpressionError as exc:
        raise MidiDdspScoreAdapterError(str(exc)) from exc
    note_rows, release_rows = _build_note_rows(compiled, raw_by_id)
    total_duration_tick = _seconds_to_tick(float(compiled["duration_seconds"]))
    if release_rows and max(int(row["offset_tick"]) for row in release_rows) != total_duration_tick:
        raise MidiDdspScoreAdapterError("release timeline does not end at the explicit score duration")
    midi_bytes = _build_standard_midi(note_rows, total_duration_tick=total_duration_tick)
    manifest = _bridge_manifest(
        compiled=compiled,
        note_rows=note_rows,
        release_rows=release_rows,
        midi_bytes=midi_bytes,
        total_duration_tick=total_duration_tick,
    )
    output.mkdir(parents=True, exist_ok=False)
    (output / MIDI_FILENAME).write_bytes(midi_bytes)
    _json_dump(output / BRIDGE_FILENAME, manifest)
    return manifest


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", help="explicit score-expression plan JSON")
    parser.add_argument("--output-dir", help="fresh ignored R&D-only artifact directory")
    parser.add_argument("--dry-run", action="store_true", help="print the no-audio/no-MIDI-DDSP-inference contract")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.dry_run:
        print(
            "midi-ddsp-score-adapter: would write standard monophonic MIDI plus an authorial MIDI-DDSP expression "
            "bridge; it will not install/import/invoke MIDI-DDSP, read source audio, infer Daegeum performance, "
            "or change runtime BGM."
        )
        return 0
    missing = [name for name in ("plan", "output_dir") if not getattr(args, name)]
    if missing:
        _parser().error("required unless --dry-run: " + ", ".join("--" + name.replace("_", "-") for name in missing))
    try:
        manifest = build_adapter(args.plan, args.output_dir)
    except MidiDdspScoreAdapterError as exc:
        print(f"midi-ddsp-score-adapter: error: {exc}", file=sys.stderr)
        return 2
    print(
        "midi-ddsp-score-adapter: wrote "
        f"{MIDI_FILENAME} + {BRIDGE_FILENAME}; notes={manifest['timeline']['note_count']}; "
        f"MIDI-DDSP instrument={manifest['midi_ddsp_reference']['documented_instrument_name']} "
        f"id={manifest['midi_ddsp_reference']['documented_instrument_id']} (not GM program)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
