"""Bounded, pure SMF0/1 note-event parsing, not acoustic alignment.

No file, audio, model, package-install or network access. MIDI ticks are mapped
through an exact integer-integrated tempo map, then exposed as seconds. Key-down
durations are not acoustic sounding durations, especially with pedal or bends.
"""
from bisect import bisect_right
from collections import Counter, defaultdict, deque
from itertools import groupby
import struct

MAX_BYTES = 8 * 1024 * 1024
MAX_EVENTS, MAX_TRACKS = 500_000, 128
MAX_HEADER_BYTES, MAX_EVENT_PAYLOAD_BYTES = 1024, 1024 * 1024
DEFAULT_TEMPO = 500_000


class MidiParseError(ValueError):
    """A fixed error category, never a private path or source payload."""


def _vlq(data, position, end):
    value = 0
    for _ in range(4):
        if position >= end:
            raise MidiParseError("truncated_variable_length_quantity")
        byte = data[position]
        position += 1
        value = (value << 7) | (byte & 127)
        if not byte & 128:
            return value, position
    raise MidiParseError("variable_length_quantity_exceeds_four_bytes")


def _seconds_function(tempo_events, division):
    by_tick = {}
    duplicates = 0
    for tick, tempo in tempo_events:
        if tick in by_tick:
            if by_tick[tick] != tempo:
                raise MidiParseError("conflicting_tempos_at_same_tick")
            duplicates += 1
        by_tick[tick] = tempo
    by_tick.setdefault(0, DEFAULT_TEMPO)
    rows, numerator, previous_tick, previous_tempo = [], 0, 0, DEFAULT_TEMPO
    for tick, tempo in sorted(by_tick.items()):
        numerator += (tick - previous_tick) * previous_tempo
        rows.append(dict(tick=tick, microseconds_per_quarter=tempo,
            seconds=numerator / (division * 1_000_000), _numerator=numerator))
        previous_tick, previous_tempo = tick, tempo
    ticks = [row["tick"] for row in rows]

    def seconds(tick):
        row = rows[bisect_right(ticks, tick) - 1]
        exact_numerator = row["_numerator"] + (tick - row["tick"]) * row["microseconds_per_quarter"]
        return exact_numerator / (division * 1_000_000)

    public = [{key: value for key, value in row.items() if key != "_numerator"} for row in rows]
    return seconds, public, duplicates


def _polyphony(notes, seconds):
    # End-before-start at identical ticks: a touching reattack is not overlap.
    edges = [(n["start_tick"], 1) for n in notes if n["status"] == "paired" and n["end_tick"] > n["start_tick"]]
    edges += [(n["end_tick"], -1) for n in notes if n["status"] == "paired" and n["end_tick"] > n["start_tick"]]
    active, peak, previous, overlap_seconds, overlap_regions, overlapping = 0, 0, 0, 0., 0, False
    for tick, values in groupby(sorted(edges), key=lambda value: value[0]):
        if active > 1 and tick > previous:
            overlap_seconds += seconds(tick) - seconds(previous)
            if not overlapping:
                overlap_regions += 1
            overlapping = True
        elif tick > previous:
            overlapping = False
        active += sum(delta for _, delta in values)
        peak = max(peak, active)
        previous = tick
    return dict(max_simultaneous_paired_notes=peak, positive_overlap_regions=overlap_regions,
        positive_overlap_seconds=overlap_seconds, unmatched_notes_excluded_and_reported_separately=True)


def parse_midi(data: bytes) -> dict:
    """Return every track/channel's nominal notes, retaining unsafe ambiguities.

    Format1 uses conductor track0 tempo ONLY; any other track's tempo is rejected
    rather than silently merged. Repeated same-key note-ons pair FIFO with offs,
    are retained and warned. An unmatched on has end/duration None. Sustain and
    pitch bends are reported, never applied or ignored as performance timing.
    """
    if not isinstance(data, bytes) or not 14 <= len(data) <= MAX_BYTES or data[:4] != b"MThd":
        raise MidiParseError("bounded_bytes_SMF_header_required")
    header_size = int.from_bytes(data[4:8], "big")
    if not 6 <= header_size <= MAX_HEADER_BYTES or 8 + header_size > len(data):
        raise MidiParseError("bounded_complete_SMF_header_required")
    fmt, track_count, division = struct.unpack_from(">HHH", data, 8)
    if fmt not in (0, 1):
        raise MidiParseError("SMF_format0_or1_only")
    if not 1 <= track_count <= MAX_TRACKS or (fmt == 0 and track_count != 1):
        raise MidiParseError("bounded_track_count_or_format0_single_track_required")
    if division & 0x8000:
        raise MidiParseError("SMPTE_time_division_unsupported")
    if not division:
        raise MidiParseError("positive_PPQN_required")
    position, event_count = 8 + header_size, 0
    notes, offs, tracks, tempos, pedals, bends, lifecycle_controls = [], [], [], [], [], [], []
    warnings, metadata_counts = Counter(), Counter()
    sysex_count = 0
    for track in range(track_count):
        if position + 8 > len(data) or data[position:position + 4] != b"MTrk":
            raise MidiParseError("complete_declared_MTrk_chunk_required")
        end = position + 8 + int.from_bytes(data[position + 4:position + 8], "big")
        if end > len(data):
            raise MidiParseError("truncated_track_chunk")
        position += 8
        tick, running, track_events, eot, track_note_start = 0, None, 0, False, len(notes)
        active = defaultdict(deque)
        track_meta, channel_counts = Counter(), Counter()
        while position < end:
            event_count += 1
            track_events += 1
            if event_count > MAX_EVENTS:
                raise MidiParseError("MIDI_event_limit")
            delta, position = _vlq(data, position, end)
            tick += delta
            if position >= end:
                raise MidiParseError("truncated_event_status")
            status = data[position]
            if status & 128:
                position += 1
                if status < 0xf0:
                    running = status
            elif running is not None:
                status = running
            else:
                raise MidiParseError("running_status_without_channel_status")
            if status == 0xff:
                running = None
                if position >= end:
                    raise MidiParseError("truncated_meta_type")
                kind = data[position]
                position += 1
                size, position = _vlq(data, position, end)
                if size > MAX_EVENT_PAYLOAD_BYTES or position + size > end:
                    raise MidiParseError("bounded_complete_meta_payload_required")
                track_meta[f"0x{kind:02x}"] += 1
                metadata_counts[f"0x{kind:02x}"] += 1
                if kind == 0x51:
                    if size != 3 or not int.from_bytes(data[position:position + size], "big"):
                        raise MidiParseError("positive_three_byte_tempo_required")
                    if fmt == 1 and track != 0:
                        raise MidiParseError("format1_tempo_outside_conductor_track0_unsupported")
                    tempos.append((tick, int.from_bytes(data[position:position + size], "big")))
                elif kind == 0x2f:
                    if size != 0 or position != end:
                        raise MidiParseError("zero_size_final_EOT_required")
                    eot = True
                position += size
            elif status in (0xf0, 0xf7):
                running = None
                size, position = _vlq(data, position, end)
                if size > MAX_EVENT_PAYLOAD_BYTES or position + size > end:
                    raise MidiParseError("bounded_complete_sysex_payload_required")
                position += size
                sysex_count += 1
            elif 0x80 <= status <= 0xef:
                kind, channel = status >> 4, status & 15
                size = 1 if kind in (0xc, 0xd) else 2
                if position + size > end or any(byte & 128 for byte in data[position:position + size]):
                    raise MidiParseError("complete_seven_bit_channel_data_required")
                a, b = data[position], data[position + 1] if size == 2 else None
                position += size
                channel_counts[str(channel)] += 1
                if kind == 0x9 and b > 0:
                    key = channel, a
                    if active[key]:
                        warnings["same_key_note_on_before_previous_note_off_FIFO_pairing"] += 1
                    row = dict(note_index=len(notes), track=track, channel=channel, pitch=a, velocity=b,
                        start_tick=tick, end_tick=None, start_seconds=None, end_seconds=None, duration_seconds=None,
                        release_velocity=None, note_off_kind=None, status="unmatched_note_on")
                    active[key].append(row)
                    notes.append(row)
                elif kind == 0x8 or (kind == 0x9 and b == 0):
                    key = channel, a
                    off_kind = "note_off" if kind == 0x8 else "note_on_velocity_zero"
                    if active[key]:
                        row = active[key].popleft()
                        row.update(end_tick=tick, release_velocity=b, note_off_kind=off_kind, status="paired")
                        if tick == row["start_tick"]:
                            warnings["zero_duration_paired_note"] += 1
                    else:
                        offs.append(dict(track=track, channel=channel, pitch=a, tick=tick, release_velocity=b,
                            note_off_kind=off_kind))
                        warnings["unmatched_note_off"] += 1
                elif kind == 0xb:
                    event = dict(track=track, channel=channel, tick=tick, controller=a, value=b)
                    if a == 64:
                        pedals.append(event)
                    elif a in (66, 69, 120, 121, 123):
                        lifecycle_controls.append(event)
                elif kind == 0xe:
                    bends.append(dict(track=track, channel=channel, tick=tick, value14=a + (b << 7)))
            else:
                raise MidiParseError("unsupported_system_event_status")
        if not eot:
            raise MidiParseError("explicit_final_end_of_track_required")
        track_notes = notes[track_note_start:]
        tracks.append(dict(track=track, start_tick=0, end_tick=tick, events=track_events,
            note_on_count=len(track_notes), channels=sorted(map(int, channel_counts)),
            channel_event_counts=dict(channel_counts), meta_counts=dict(track_meta),
            first_note_start_tick=min((n["start_tick"] for n in track_notes), default=None),
            last_paired_note_end_tick=max((n["end_tick"] for n in track_notes if n["end_tick"] is not None), default=None)))
    if position != len(data):
        raise MidiParseError("unexpected_bytes_after_declared_tracks")
    seconds, tempo_map, duplicate_tempos = _seconds_function(tempos, division)
    if duplicate_tempos:
        warnings["duplicate_identical_same_tick_tempo_collapsed"] = duplicate_tempos
    for note in notes:
        note["start_seconds"] = seconds(note["start_tick"])
        if note["end_tick"] is None:
            warnings["unmatched_note_on"] += 1
        else:
            note["end_seconds"] = seconds(note["end_tick"])
            note["duration_seconds"] = note["end_seconds"] - note["start_seconds"]
    for event in offs + pedals + bends + lifecycle_controls:
        event["seconds"] = seconds(event["tick"])
    for track in tracks:
        track["start_seconds"] = 0.
        track["end_seconds"] = seconds(track["end_tick"])
        track["duration_seconds"] = track["end_seconds"]
        for name in ("first_note_start", "last_paired_note_end"):
            tick = track[name + "_tick"]
            track[name + "_seconds"] = seconds(tick) if tick is not None else None
    if pedals:
        warnings["sustain_pedal_present_acoustic_release_not_resolved"] = len(pedals)
    if bends:
        warnings["pitch_bend_present_nominal_note_pitch_not_performed_F0"] = len(bends)
    if lifecycle_controls:
        warnings["note_lifecycle_controller_present_not_applied"] = len(lifecycle_controls)
    if sysex_count:
        warnings["sysex_present_device_effect_not_interpreted"] = sysex_count
    polyphony = _polyphony(notes, seconds)
    if polyphony["max_simultaneous_paired_notes"] > 1:
        warnings["overlapping_notes_not_a_monophonic_score_anchor"] = polyphony["positive_overlap_regions"]
    if not notes:
        warnings["no_note_on_events"] = 1
    end_tick = max(track["end_tick"] for track in tracks)
    usable = not any(code != "duplicate_identical_same_tick_tempo_collapsed" for code in warnings)
    return dict(schema="mini.exact-SMF-note-events.v1", status="parsed_nominal_notes_not_acoustically_aligned",
        format=fmt, tracks_count=track_count, ppqn=division, input_bytes=len(data), events=event_count,
        header_extension_bytes=header_size - 6, tempo_policy="SMF0 track0; SMF1 conductor track0 only; default500000us/qn",
        tempo_map=tempo_map, tempo_event_count=len(tempos), duplicate_identical_tempo_events=duplicate_tempos,
        time_integration="integer sum(delta_tick * microseconds_per_quarter) / (PPQN * 1000000)",
        start_tick=0, end_tick=end_tick, start_seconds=0., end_seconds=seconds(end_tick), duration_seconds=seconds(end_tick),
        first_note_start_seconds=min((n["start_seconds"] for n in notes), default=None),
        last_paired_note_end_seconds=max((n["end_seconds"] for n in notes if n["end_seconds"] is not None), default=None),
        note_on_count=len(notes), paired_note_count=sum(n["status"] == "paired" for n in notes),
        unmatched_note_on_count=warnings["unmatched_note_on"], unmatched_note_off_count=len(offs),
        pitch_min=min((n["pitch"] for n in notes), default=None), pitch_max=max((n["pitch"] for n in notes), default=None),
        notes=notes, tracks=tracks, unmatched_note_offs=offs, sustain_events=pedals,
        pitch_bend_events=bends, unsupported_lifecycle_controllers=lifecycle_controls,
        sysex_event_count=sysex_count, meta_counts=dict(metadata_counts), polyphony=polyphony,
        warnings=[dict(code=code, count=count) for code, count in sorted(warnings.items()) if count],
        note_pairing_policy="FIFO within exact(track,channel,pitch); unmatched events retained; pedal never extends key-down durations",
        alignment_candidate=usable, acoustic_alignment_validated=False, solo_verified=False,
        note_pitch_is_nominal_not_performed_F0=True, audio_or_model_loaded=False,
        limits=["A structurally usable nominal note table is not proof of MIDI/audio synchronization or solo daegeum.",
            "Tempo/offset/scale follow score metadata only until measured against the recording.",
            "Attack/release, breath and vibrato boundaries cannot be inferred from MIDI key events alone.",
            "All tracks/channels are retained; no melody track or register is silently selected."])
