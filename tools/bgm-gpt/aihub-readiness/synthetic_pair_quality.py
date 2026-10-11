"""Offline, synthetic-only three-way WAV/MIDI/annotation quality smoke.

This is deliberately *not* an AI Hub data reader or a training permission
check.  The only command-line operation generates tiny examples in memory.
The normalized annotation shape below is invented for those examples; no
claim is made that it describes AI Hub 71470's actual annotation schema.
"""

from __future__ import annotations

from collections import defaultdict
import io
import json
import math
import struct
import sys
import wave

import numpy as np


SYNTHETIC_ANNOTATION_SCHEMA = "mini.synthetic-paired-note-smoke.v1"


class PairQualityError(ValueError):
    """The synthetic fixture is malformed or unsupported by this smoke."""


def _read_vlq(data: bytes, offset: int) -> tuple[int, int]:
    value = 0
    for _ in range(4):
        if offset >= len(data):
            raise PairQualityError("truncated MIDI variable-length quantity")
        byte = data[offset]
        offset += 1
        value = (value << 7) | (byte & 0x7F)
        if byte < 0x80:
            return value, offset
    raise PairQualityError("MIDI variable-length quantity exceeds four bytes")


def _midi_note_spans(data: bytes) -> list[dict[str, float | int]]:
    """Parse PPQ Standard MIDI notes and tempo, including type-1 tempo tracks."""

    if len(data) < 14 or data[:4] != b"MThd" or data[4:8] != b"\x00\x00\x00\x06":
        raise PairQualityError("expected a Standard MIDI header of length six")
    fmt, track_count, division = struct.unpack_from(">HHH", data, 8)
    if fmt not in (0, 1) or not track_count or division & 0x8000 or not division:
        raise PairQualityError("only nonempty PPQ MIDI type 0/1 is supported")
    if fmt == 0 and track_count != 1:
        raise PairQualityError("MIDI type 0 must contain exactly one track")

    offset = 14
    note_events: list[tuple[int, int, int, str, int, int]] = []
    tempo_events: list[tuple[int, int, int, int]] = []
    for track_index in range(track_count):
        if offset + 8 > len(data) or data[offset:offset + 4] != b"MTrk":
            raise PairQualityError("missing or truncated MIDI track")
        size = int.from_bytes(data[offset + 4:offset + 8], "big")
        offset += 8
        end = offset + size
        if end > len(data):
            raise PairQualityError("MIDI track exceeds file length")
        tick = 0
        order = 0
        running_status: int | None = None
        while offset < end:
            delta, offset = _read_vlq(data, offset)
            tick += delta
            if offset >= end:
                raise PairQualityError("truncated MIDI event")
            status = data[offset]
            if status & 0x80:
                offset += 1
                if status < 0xF0:
                    running_status = status
            elif running_status is not None:
                status = running_status
            else:
                raise PairQualityError("MIDI running status without a channel status")

            if status == 0xFF:
                running_status = None
                if offset >= end:
                    raise PairQualityError("truncated MIDI meta-event")
                kind = data[offset]
                offset += 1
                size, offset = _read_vlq(data, offset)
                payload = data[offset:offset + size]
                offset += size
                if offset > end:
                    raise PairQualityError("MIDI meta-event exceeds track")
                if kind == 0x51:
                    if len(payload) != 3 or int.from_bytes(payload, "big") == 0:
                        raise PairQualityError("invalid MIDI tempo")
                    tempo_events.append((tick, track_index, order, int.from_bytes(payload, "big")))
            elif status in (0xF0, 0xF7):
                running_status = None
                size, offset = _read_vlq(data, offset)
                offset += size
                if offset > end:
                    raise PairQualityError("MIDI system event exceeds track")
            elif 0x80 <= status < 0xF0:
                event = status >> 4
                count = 1 if event in (0xC, 0xD) else 2
                if offset + count > end:
                    raise PairQualityError("truncated MIDI channel event")
                values = data[offset:offset + count]
                if any(value & 0x80 for value in values):
                    raise PairQualityError("invalid MIDI channel data byte")
                offset += count
                if event in (0x8, 0x9):
                    action = "off" if event == 0x8 or values[1] == 0 else "on"
                    note_events.append((tick, track_index, order, action, status & 0x0F, values[0]))
            else:
                raise PairQualityError("unsupported MIDI system event")
            order += 1
        offset = end
    if offset != len(data):
        raise PairQualityError("unexpected bytes after declared MIDI tracks")

    tempo_events.sort()

    def seconds_at(target_tick: int) -> float:
        seconds = 0.0
        previous_tick = 0
        microseconds_per_beat = 500_000
        for tick, _, _, next_tempo in tempo_events:
            if tick > target_tick:
                break
            seconds += (tick - previous_tick) * microseconds_per_beat / (division * 1_000_000)
            previous_tick = tick
            microseconds_per_beat = next_tempo
        return seconds + (target_tick - previous_tick) * microseconds_per_beat / (division * 1_000_000)

    active: dict[tuple[int, int], list[int]] = defaultdict(list)
    spans: list[dict[str, float | int]] = []
    for tick, _, _, action, channel, pitch in sorted(note_events):
        key = (channel, pitch)
        if action == "on":
            active[key].append(tick)
        elif active[key]:
            onset_tick = active[key].pop(0)
            if tick <= onset_tick:
                raise PairQualityError("MIDI note has zero or negative duration")
            spans.append({
                "pitch": pitch,
                "onset_seconds": seconds_at(onset_tick),
                "offset_seconds": seconds_at(tick),
            })
        else:
            raise PairQualityError("MIDI note-off has no matching note-on")
    if any(active.values()):
        raise PairQualityError("MIDI note-on has no matching note-off")
    return sorted(spans, key=lambda span: (span["onset_seconds"], span["pitch"]))


def _decode_pcm16_wav(data: bytes) -> tuple[np.ndarray, int]:
    try:
        with wave.open(io.BytesIO(data), "rb") as handle:
            if handle.getcomptype() != "NONE" or handle.getsampwidth() != 2:
                raise PairQualityError("synthetic smoke supports only uncompressed PCM16 WAV")
            channel_count = handle.getnchannels()
            sample_rate = handle.getframerate()
            frame_count = handle.getnframes()
            if channel_count not in (1, 2) or not 8_000 <= sample_rate <= 192_000:
                raise PairQualityError("unsupported synthetic WAV channels or sample rate")
            frames = handle.readframes(frame_count)
    except (EOFError, wave.Error) as exc:
        raise PairQualityError("invalid WAV container") from exc
    samples = np.frombuffer(frames, dtype="<i2")
    if len(samples) != frame_count * channel_count or not frame_count:
        raise PairQualityError("WAV frame count is empty or truncated")
    return samples.reshape(-1, channel_count).astype(np.float64) / 32768.0, sample_rate


def _dominant_frequency(samples: np.ndarray, sample_rate: int) -> float | None:
    if len(samples) < 2048:
        return None
    segment = samples - np.mean(samples)
    spectrum = np.abs(np.fft.rfft(segment * np.hanning(len(segment)), n=max(65536, 2 ** (len(segment) - 1).bit_length())))
    frequencies = np.fft.rfftfreq((len(spectrum) - 1) * 2, 1 / sample_rate)
    allowed = (frequencies >= 80) & (frequencies <= 2000)
    if not np.any(allowed) or np.max(spectrum[allowed]) < 1e-8:
        return None
    return float(frequencies[allowed][np.argmax(spectrum[allowed])])


def audit_synthetic_pair(wav_bytes: bytes, midi_bytes: bytes, annotation: dict) -> dict:
    """Audit one synthetic fixture; never infer actual dataset/training rights."""

    if annotation.get("schema") != SYNTHETIC_ANNOTATION_SCHEMA or annotation.get("synthetic_fixture") is not True:
        raise PairQualityError("explicit synthetic annotation schema and fixture flag required")
    annotations = annotation.get("notes")
    if not isinstance(annotations, list):
        raise PairQualityError("synthetic annotation notes must be a list")
    normalized = []
    for note in annotations:
        if not isinstance(note, dict):
            raise PairQualityError("synthetic annotation note must be an object")
        pitch = note.get("pitch")
        onset = note.get("onset_seconds")
        ending = note.get("offset_seconds")
        if type(pitch) is not int or not 0 <= pitch <= 127 or not all(
            isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
            for value in (onset, ending)
        ) or onset < 0 or ending <= onset:
            raise PairQualityError("synthetic annotation has invalid note pitch or times")
        normalized.append({"pitch": pitch, "onset_seconds": float(onset), "offset_seconds": float(ending)})
    normalized.sort(key=lambda note: (note["onset_seconds"], note["pitch"]))

    channels, sample_rate = _decode_pcm16_wav(wav_bytes)
    mono = channels.mean(axis=1)
    midi_notes = _midi_note_spans(midi_bytes)
    duration = len(mono) / sample_rate
    rms = float(np.sqrt(np.mean(mono ** 2)))
    peak = float(np.max(np.abs(channels)))
    clipped_fraction = float(np.mean(np.abs(channels) >= 32760 / 32768))
    frame_size = max(1, round(sample_rate * .01))
    blocks = [mono[index:index + frame_size] for index in range(0, len(mono), frame_size)]
    audible = [index for index, block in enumerate(blocks) if np.sqrt(np.mean(block ** 2)) > 0.005]
    first_audio_onset = audible[0] * frame_size / sample_rate if audible else None

    flags: list[str] = []
    if not midi_notes:
        flags.append("midi_has_no_notes")
    if rms < 0.003:
        flags.append("audio_near_silent")
    if clipped_fraction > 0.001:
        flags.append("audio_clipped")
    if midi_notes and duration + 0.05 < max(note["offset_seconds"] for note in midi_notes):
        flags.append("audio_ends_before_midi")
    if len(normalized) != len(midi_notes) or any(
        annotation_note["pitch"] != midi_note["pitch"]
        or abs(annotation_note["onset_seconds"] - midi_note["onset_seconds"]) > 0.05
        or abs(annotation_note["offset_seconds"] - midi_note["offset_seconds"]) > 0.05
        for annotation_note, midi_note in zip(normalized, midi_notes)
    ):
        flags.append("annotation_midi_mismatch")
    first_note_onset = min((note["onset_seconds"] for note in midi_notes), default=None)
    onset_offset = None if first_note_onset is None or first_audio_onset is None else first_audio_onset - first_note_onset
    if onset_offset is not None and abs(onset_offset) > 0.12:
        flags.append("first_audio_midi_onset_review")

    dominant_cents: list[float] = []
    for note in midi_notes:
        onset, ending = note["onset_seconds"], note["offset_seconds"]
        if ending - onset < 0.18:
            continue
        center = (onset + ending) / 2
        start = max(0, round((center - 0.08) * sample_rate))
        stop = min(len(mono), round((center + 0.08) * sample_rate))
        dominant = _dominant_frequency(mono[start:stop], sample_rate)
        if dominant is not None:
            expected = 440.0 * 2 ** ((note["pitch"] - 69) / 12)
            dominant_cents.append(round(1200 * math.log2(dominant / expected), 1))
    if any(abs(cents) > 250 for cents in dominant_cents):
        flags.append("dominant_spectral_peak_midi_review")

    return {
        "schema": "mini.synthetic-pair-quality-smoke-report.v1",
        "scope": "generated_synthetic_examples_only_no_real_data_ingest",
        "sample_rate": sample_rate,
        "channels": channels.shape[1],
        "audio_duration_seconds": round(duration, 4),
        "audio_rms_dbfs": round(20 * math.log10(max(rms, 1e-12)), 2),
        "audio_peak_dbfs": round(20 * math.log10(max(peak, 1e-12)), 2),
        "clipped_sample_fraction": round(clipped_fraction, 6),
        "midi_note_count": len(midi_notes),
        "annotation_note_count": len(normalized),
        "first_audio_minus_midi_onset_seconds": None if onset_offset is None else round(onset_offset, 4),
        "dominant_spectral_peak_minus_midi_cents": dominant_cents,
        "review_flags": flags,
        "synthetic_smoke_pass": not flags,
        "actual_ai_hub_schema_verified": False,
        "real_data_ready": False,
        "model_training_or_game_use_authorized": False,
    }


def _vlq(value: int) -> bytes:
    if value < 0:
        raise ValueError("negative MIDI delta")
    result = [value & 0x7F]
    value >>= 7
    while value:
        result.insert(0, (value & 0x7F) | 0x80)
        value >>= 7
    return bytes(result)


def make_synthetic_fixture(
    *, frequency_hz: float = 440.0, amplitude: float = 0.45,
    audio_onset_seconds: float = 0.1, midi_onset_seconds: float = 0.1,
    midi_pitch: int = 69,
) -> tuple[bytes, bytes, dict]:
    """Make an in-memory, non-musical synthetic pair with one note."""

    sample_rate = 16_000
    length = round(0.8 * sample_rate)
    time = np.arange(length) / sample_rate
    samples = np.where((time >= audio_onset_seconds) & (time < 0.6),
                       amplitude * np.sin(2 * np.pi * frequency_hz * time), 0.0)
    pcm = np.round(np.clip(samples, -1, 1) * 32767).astype("<i2")
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())

    ticks_per_beat = 480
    onset_tick = round(midi_onset_seconds * 2 * ticks_per_beat)
    ending_tick = round(0.6 * 2 * ticks_per_beat)
    track = _vlq(onset_tick) + bytes([0x90, midi_pitch, 96])
    track += _vlq(ending_tick - onset_tick) + bytes([0x80, midi_pitch, 0])
    track += b"\x00\xff\x2f\x00"
    midi = b"MThd" + struct.pack(">IHHH", 6, 0, 1, ticks_per_beat)
    midi += b"MTrk" + struct.pack(">I", len(track)) + track
    annotation = {
        "schema": SYNTHETIC_ANNOTATION_SCHEMA,
        "synthetic_fixture": True,
        "notes": [{"pitch": midi_pitch, "onset_seconds": midi_onset_seconds, "offset_seconds": 0.6}],
    }
    return wav_buffer.getvalue(), midi, annotation


def main() -> None:
    """Run a fixed smoke matrix without accepting any file path or network URL."""

    if len(sys.argv) != 1:
        raise SystemExit("synthetic-only smoke accepts no arguments or input paths")
    scenarios = {
        "aligned_tone": {},
        "silent_audio": {"amplitude": 0.0},
        "clipped_audio": {"amplitude": 1.8},
        "wrong_spectral_pitch": {"frequency_hz": 523.25},
        "late_midi_onset": {"midi_onset_seconds": 0.34},
    }
    reports = {name: audit_synthetic_pair(*make_synthetic_fixture(**settings))
               for name, settings in scenarios.items()}
    expected = {
        "aligned_tone": [],
        "silent_audio": ["audio_near_silent"],
        "clipped_audio": ["audio_clipped"],
        "wrong_spectral_pitch": ["dominant_spectral_peak_midi_review"],
        "late_midi_onset": ["first_audio_midi_onset_review"],
    }
    for name, required_flags in expected.items():
        missing = set(required_flags) - set(reports[name]["review_flags"])
        if missing or (name == "aligned_tone" and reports[name]["review_flags"]):
            raise SystemExit(f"synthetic smoke failed for {name}: {sorted(missing)}")
    print(json.dumps({"scope": "synthetic_only", "scenarios": reports}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
