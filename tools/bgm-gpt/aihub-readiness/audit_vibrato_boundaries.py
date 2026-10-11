#!/usr/bin/env python3
"""Read-only, conservative acoustic check of private AI Hub VB01 timing labels.

This is *not* a ground-truth label validator or an expression model. It samples
one isolated VB01 event per recording, compares pitch modulation just inside
and outside its boundaries, and chooses one unannotated control from the same
recording when available. Only aggregate counts are printed. No audio, names,
per-event times, or pitch traces are written or printed.

An 80 ms YIN-like difference function estimates F0 every 10 ms. A 500 ms
window is called modulated only when a 3.5--8.5 Hz sinusoidal component exceeds
12 cents, improves a linear-trend fit by at least 40%, and has at least two
prominent pitch turns. Noisy, unvoiced, or pitch-discontinuous windows are
indeterminate, not negative. Boundaries are tested with windows centered
0.30 s on either side, so temporal precision is roughly +/-0.30 s at best.
"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
import json
import math
import os
from pathlib import Path
import random
import re
import stat
import sys
import wave
import zipfile

import numpy as np
from scipy.signal import find_peaks


SAMPLE_HZ = 16_000
FRAME_SECONDS = 0.080
HOP_SECONDS = 0.010
WINDOW_SECONDS = 0.50
EDGE_SECONDS = 0.30
MIN_EVENT_SECONDS = 0.75
MAX_EVENT_SECONDS = 1.60
MARGIN_SECONDS = 0.55
MAX_LABEL_ZIP_BYTES = 32 * 1024**2
MAX_LABEL_JSON_BYTES = 256 * 1024
MAX_LABEL_UNCOMPRESSED_BYTES = 64 * 1024**2
MAX_PREP_MANIFEST_BYTES = 8 * 1024**2
MAX_WAV_BYTES = 16 * 1024**2
MAX_LABEL_ENTRIES = 10_000
MAX_RECORDS = 256
ABSOLUTE_MIDI_MIN = 55
ABSOLUTE_MIDI_MAX = 90
SCHEMA = "mini.aihub-71470-private-audio-prep.v1"
REPO_ROOT = Path(__file__).resolve().parents[3]


class AuditError(Exception):
    """An intentionally nonspecific public error; never includes private data."""


@dataclass(frozen=True)
class Event:
    start: float
    end: float


@dataclass(frozen=True)
class WindowResult:
    state: str  # "modulated", "not_modulated", or "indeterminate"
    reason: str  # fixed category, no private values
    amplitude_cents: float | None = None
    improvement: float | None = None
    pitch_class_frames: tuple[int, ...] | None = None
    absolute_midi_frames: tuple[int, ...] | None = None


def _private_regular_file(path: Path, max_bytes: int, suffix: str) -> bytes:
    if not path.is_absolute() or path.suffix.casefold() != suffix:
        raise AuditError("invalid_private_input_path")
    try:
        resolved = path.resolve(strict=True)
        repo = REPO_ROOT.resolve(strict=True)
        if resolved == repo or repo in resolved.parents or path.is_symlink():
            raise AuditError("input_inside_repository_or_symlink")
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(path, flags)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_size > max_bytes or info.st_size == 0:
                raise AuditError("private_input_size_or_type")
            if stat.S_IMODE(info.st_mode) & 0o077:
                raise AuditError("private_input_permissions")
            with os.fdopen(fd, "rb", closefd=False) as handle:
                data = handle.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise AuditError("private_input_size_or_type")
            return data
        finally:
            os.close(fd)
    except OSError as exc:
        raise AuditError("private_input_unavailable") from exc


def _private_dir(path: Path) -> None:
    if not path.is_absolute():
        raise AuditError("expected_absolute_private_directory")
    try:
        resolved = path.resolve(strict=True)
        repo = REPO_ROOT.resolve(strict=True)
        if resolved == repo or repo in resolved.parents or path.is_symlink():
            raise AuditError("directory_inside_repository_or_symlink")
        info = path.stat()
        if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o077:
            raise AuditError("private_directory_permissions")
    except OSError as exc:
        raise AuditError("private_directory_unavailable") from exc


def _load_manifest(prepared_dir: Path) -> list[tuple[str, str]]:
    _private_dir(prepared_dir)
    raw = _private_regular_file(prepared_dir / "private_manifest.json", MAX_PREP_MANIFEST_BYTES, ".json")
    try:
        doc = json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        raise AuditError("invalid_prepared_manifest") from exc
    if not isinstance(doc, dict) or doc.get("schema") != SCHEMA or doc.get("split") != "training":
        raise AuditError("wrong_prepared_manifest")
    records = doc.get("records")
    if not isinstance(records, list) or not 1 <= len(records) <= MAX_RECORDS:
        raise AuditError("invalid_prepared_records")
    result: list[tuple[str, str]] = []
    used_files: set[str] = set()
    used_stems: set[str] = set()
    for rec in records:
        if not isinstance(rec, dict):
            raise AuditError("invalid_prepared_records")
        filename, stem = rec.get("output_file"), rec.get("source_stem")
        if not isinstance(filename, str) or not re.fullmatch(r"sample_[0-9]{3,4}\.wav", filename):
            raise AuditError("invalid_prepared_record_path")
        if not isinstance(stem, str) or not stem or len(stem.encode("utf-8")) > 200:
            raise AuditError("invalid_prepared_record_stem")
        if filename in used_files or stem.casefold() in used_stems:
            raise AuditError("duplicate_prepared_record")
        used_files.add(filename)
        used_stems.add(stem.casefold())
        result.append((filename, stem))
    return result


def _parse_event_list(doc: dict) -> tuple[float, list[tuple[float, float, str]]] | None:
    source = doc.get("music_source_info")
    annotation = doc.get("annotation_data_info")
    if not isinstance(source, dict) or not isinstance(annotation, dict):
        return None
    try:
        duration = float(source.get("play_time"))
    except (ValueError, TypeError):
        return None
    if not math.isfinite(duration) or duration <= 0 or duration > 600:
        return None
    entries = annotation.get("single_tonguing_cd")
    if not isinstance(entries, list) or len(entries) > 1000:
        return None
    events = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        try:
            start, end = float(entry.get("start_time")), float(entry.get("end_time"))
        except (ValueError, TypeError):
            continue
        code = entry.get("annotation_code")
        if not math.isfinite(start) or not math.isfinite(end) or not (0 <= start < end <= duration + 0.01):
            continue
        if not isinstance(code, str) or len(code) > 16:
            continue
        events.append((start, end, code))
    events.sort()
    return duration, events


def _load_labels(label_zip: Path, target_stems: set[str]) -> dict[str, tuple[float, list[tuple[float, float, str]]]]:
    raw = _private_regular_file(label_zip, MAX_LABEL_ZIP_BYTES, ".zip")
    import io

    result = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        infos = archive.infolist()
        if len(infos) > MAX_LABEL_ENTRIES:
            raise AuditError("label_archive_entry_limit")
        if sum(info.file_size for info in infos) > MAX_LABEL_UNCOMPRESSED_BYTES:
            raise AuditError("label_archive_uncompressed_limit")
        for info in infos:
            if info.is_dir() or not info.filename.casefold().endswith(".json"):
                continue
            if info.file_size > MAX_LABEL_JSON_BYTES:
                raise AuditError("label_json_size_limit")
            try:
                document = json.loads(archive.read(info))
            except (ValueError, UnicodeError, RuntimeError, zipfile.BadZipFile) as exc:
                raise AuditError("invalid_label_json") from exc
            if not isinstance(document, dict):
                continue
            source = document.get("music_source_info")
            stem = source.get("music_src_nm") if isinstance(source, dict) else None
            if stem not in target_stems:
                continue
            kind = document.get("music_type_info")
            if not isinstance(kind, dict) or kind.get("instrument_cd") != "WN01":
                raise AuditError("prepared_record_not_daegeum")
            parsed = _parse_event_list(document)
            if parsed is None or stem in result:
                raise AuditError("duplicate_or_invalid_target_label")
            result[stem] = parsed
    if result.keys() != target_stems:
        raise AuditError("prepared_label_match_incomplete")
    return result


def _read_wav(path: Path) -> np.ndarray:
    raw = _private_regular_file(path, MAX_WAV_BYTES, ".wav")
    import io

    try:
        with wave.open(io.BytesIO(raw), "rb") as reader:
            if (
                reader.getnchannels() != 1 or reader.getframerate() != SAMPLE_HZ
                or reader.getsampwidth() != 2 or reader.getcomptype() != "NONE"
            ):
                raise AuditError("unexpected_prepared_wav_format")
            if reader.getnframes() > 10 * 60 * SAMPLE_HZ:
                raise AuditError("prepared_wav_duration_limit")
            payload = reader.readframes(reader.getnframes())
    except (wave.Error, EOFError) as exc:
        raise AuditError("invalid_prepared_wav") from exc
    samples = np.frombuffer(payload, dtype="<i2").astype(np.float32) / 32768.0
    if samples.size == 0 or not np.all(np.isfinite(samples)):
        raise AuditError("invalid_prepared_wav")
    return samples


def _yin_frame(frame: np.ndarray, min_hz: float = 100.0, max_hz: float = 1100.0) -> tuple[float, float]:
    """Return F0 and CMNDF trough; NaN F0 means no reliable periodicity."""
    n = frame.size
    centered = np.asarray(frame, dtype=np.float64) - float(np.mean(frame))
    rms = math.sqrt(float(np.mean(centered * centered)))
    if n < 4 * SAMPLE_HZ // int(min_hz) or rms < 0.0001:
        return math.nan, 1.0
    min_lag = max(2, math.ceil(SAMPLE_HZ / max_hz))
    max_lag = min(n // 3, math.floor(SAMPLE_HZ / min_hz))
    fft_size = 1 << (2 * n - 1).bit_length()
    spectrum = np.fft.rfft(centered, n=fft_size)
    autocorrelation = np.fft.irfft(spectrum * spectrum.conjugate(), n=fft_size)[: max_lag + 1]
    power = np.concatenate(([0.0], np.cumsum(centered * centered)))
    lags = np.arange(max_lag + 1)
    diff = power[n - lags] + power[n] - power[lags] - 2 * autocorrelation
    diff = np.maximum(diff, 0.0)
    cumsum = np.cumsum(diff)
    cmndf = np.ones_like(diff)
    cmndf[1:] = diff[1:] * lags[1:] / np.maximum(cumsum[1:], 1e-20)
    zone = np.arange(min_lag, max_lag + 1)
    local = zone[(cmndf[zone] <= np.roll(cmndf, 1)[zone]) & (cmndf[zone] <= np.roll(cmndf, -1)[zone])]
    good = local[cmndf[local] <= 0.18]
    if good.size == 0:
        return math.nan, float(np.min(cmndf[zone]))
    lag = int(good[0])
    trough = float(cmndf[lag])
    if 1 <= lag < max_lag:
        left, center, right = cmndf[lag - 1], cmndf[lag], cmndf[lag + 1]
        denominator = left - 2 * center + right
        if abs(denominator) > 1e-12:
            lag += float(np.clip(0.5 * (left - right) / denominator, -0.5, 0.5))
    return SAMPLE_HZ / lag, trough


def analyze_window(samples: np.ndarray, start: float, end: float) -> WindowResult:
    """Pitch-periodic modulation in a fixed 0.50 s window; not an instrument ID."""
    if end - start < WINDOW_SECONDS - 0.002 or start < 0 or end > len(samples) / SAMPLE_HZ:
        return WindowResult("indeterminate", "out_of_bounds")
    half = round(FRAME_SECONDS * SAMPLE_HZ / 2)
    centers = np.arange(start + FRAME_SECONDS / 2, end - FRAME_SECONDS / 2 + 1e-8, HOP_SECONDS)
    f0 = np.empty(centers.size, dtype=float)
    troughs = np.empty(centers.size, dtype=float)
    for index, center in enumerate(centers):
        midpoint = round(center * SAMPLE_HZ)
        chunk = samples[midpoint - half: midpoint + half]
        f0[index], troughs[index] = _yin_frame(chunk)
    voiced = np.isfinite(f0)
    if voiced.size < 35 or float(np.mean(voiced)) < 0.78:
        return WindowResult("indeterminate", "insufficient_voiced_frames")
    if float(np.median(troughs[voiced])) > 0.14:
        return WindowResult("indeterminate", "low_pitch_confidence")
    valid_indices = np.flatnonzero(voiced)
    if valid_indices.size and np.max(np.diff(valid_indices), initial=0) > 5:
        return WindowResult("indeterminate", "long_pitch_gap")
    pitch = 1200.0 * np.log2(f0[voiced] / np.median(f0[voiced]))
    high_confidence_f0 = f0[voiced & (troughs <= 0.14)]
    if high_confidence_f0.size:
        midi = np.floor(69.0 + 12.0 * np.log2(high_confidence_f0 / 440.0) + 0.5).astype(int)
        pitch_classes = tuple(int(value) for value in np.bincount(midi % 12, minlength=12))
        in_range = midi[(midi >= ABSOLUTE_MIDI_MIN) & (midi <= ABSOLUTE_MIDI_MAX)]
        absolute_midi = tuple(int(value) for value in np.bincount(
            in_range - ABSOLUTE_MIDI_MIN, minlength=ABSOLUTE_MIDI_MAX - ABSOLUTE_MIDI_MIN + 1
        ))
    else:
        pitch_classes = tuple(0 for _ in range(12))
        absolute_midi = tuple(0 for _ in range(ABSOLUTE_MIDI_MAX - ABSOLUTE_MIDI_MIN + 1))
    local_jumps = np.abs(np.diff(pitch) / np.maximum(np.diff(centers[voiced]) / HOP_SECONDS, 1.0))
    if local_jumps.size and float(np.mean(local_jumps > 120.0)) > 0.05:
        return WindowResult("indeterminate", "pitch_discontinuity")
    t = centers[voiced] - float(np.mean(centers[voiced]))
    baseline = np.column_stack((np.ones(t.size), t))
    baseline_coeff, *_ = np.linalg.lstsq(baseline, pitch, rcond=None)
    baseline_resid = pitch - baseline @ baseline_coeff
    baseline_sse = float(np.dot(baseline_resid, baseline_resid))
    if baseline_sse < 0.01 * t.size:
        return WindowResult("not_modulated", "nearly_flat", 0.0, 0.0, pitch_classes, absolute_midi)
    best_amp = 0.0
    best_improvement = 0.0
    for frequency in np.arange(3.5, 8.501, 0.25):
        phase = 2 * math.pi * frequency * t
        design = np.column_stack((baseline, np.sin(phase), np.cos(phase)))
        coeff, *_ = np.linalg.lstsq(design, pitch, rcond=None)
        residual = pitch - design @ coeff
        improvement = max(0.0, 1.0 - float(np.dot(residual, residual)) / baseline_sse)
        amplitude = math.hypot(float(coeff[-2]), float(coeff[-1]))
        if improvement > best_improvement:
            best_amp, best_improvement = amplitude, improvement
    residual_series = pitch - baseline @ baseline_coeff
    smoothed = np.convolve(residual_series, np.ones(3) / 3.0, mode="same")
    peaks, _ = find_peaks(smoothed, prominence=8.0, distance=6)
    trough_peaks, _ = find_peaks(-smoothed, prominence=8.0, distance=6)
    turns = len(peaks) + len(trough_peaks)
    if best_amp >= 12.0 and best_improvement >= 0.40 and turns >= 2:
        return WindowResult("modulated", "strict_periodic_modulation", best_amp, best_improvement,
                            pitch_classes, absolute_midi)
    return WindowResult("not_modulated", "no_strict_modulation", best_amp, best_improvement,
                        pitch_classes, absolute_midi)


def _eligible_events(duration: float, all_events: list[tuple[float, float, str]]) -> list[Event]:
    selected = []
    for index, (start, end, code) in enumerate(all_events):
        if code != "VB01" or not MIN_EVENT_SECONDS <= end - start <= MAX_EVENT_SECONDS:
            continue
        if start < MARGIN_SECONDS or end + MARGIN_SECONDS > duration:
            continue
        if any(
            other_start < end + MARGIN_SECONDS and other_end > start - MARGIN_SECONDS
            for other_index, (other_start, other_end, _) in enumerate(all_events) if other_index != index
        ):
            continue
        selected.append(Event(start, end))
    return selected


def _control_start(duration: float, events: list[tuple[float, float, str]], rng: random.Random) -> float | None:
    candidates = []
    for tick in range(6, int((duration - 0.55) / 0.05)):
        start = tick * 0.05
        end = start + WINDOW_SECONDS
        if end > duration:
            break
        if not any(other_start < end + 0.20 and other_end > start - 0.20 for other_start, other_end, _ in events):
            candidates.append(start)
    return rng.choice(candidates) if candidates else None


def _same_register_five_note_support(absolute_counts: Counter[int]) -> dict[str, int]:
    """Correlated frame counts only; deliberately not a score-match probability."""
    current_score_notes = (67, 69, 72, 74, 76)  # G4 A4 C5 D5 E5.
    plus_two_notes = tuple(note + 2 for note in current_score_notes)  # A4 B4 D5 E5 F#5.
    return {
        "current_score_G4_A4_C5_D5_E5": sum(absolute_counts[note] for note in current_score_notes),
        "score_plus_two_A4_B4_D5_E5_Fsharp5": sum(absolute_counts[note] for note in plus_two_notes),
    }


def _aggregate_pitch_coverage(prepared_dir: Path, records: list[tuple[str, str]], *,
                              windows_per_clip: int = 8) -> dict:
    """Stratified half-second sample; aggregate uncertain absolute and pitch-class F0."""
    counts: Counter[int] = Counter()
    absolute_counts: Counter[int] = Counter()
    planned, trackable, total_seconds = 0, 0, 0.0
    for filename, _ in records:
        samples = _read_wav(prepared_dir / filename)
        duration = len(samples) / SAMPLE_HZ
        total_seconds += duration
        if duration < WINDOW_SECONDS:
            continue
        for index in range(windows_per_clip):
            center = duration * (index + 0.5) / windows_per_clip
            start = min(max(center - WINDOW_SECONDS / 2, 0.0), duration - WINDOW_SECONDS)
            planned += 1
            result = analyze_window(samples, start, start + WINDOW_SECONDS)
            if (result.state == "indeterminate" or result.pitch_class_frames is None
                    or result.absolute_midi_frames is None):
                continue
            trackable += 1
            counts.update({index: count for index, count in enumerate(result.pitch_class_frames)})
            absolute_counts.update({
                ABSOLUTE_MIDI_MIN + index: count
                for index, count in enumerate(result.absolute_midi_frames)
            })
    names = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
    return {
        "clips": len(records),
        "windows_per_clip": windows_per_clip,
        "planned_windows": planned,
        "trackable_windows": trackable,
        "high_confidence_pitch_frames": sum(counts.values()),
        "sampled_seconds": round(planned * WINDOW_SECONDS, 1),
        "total_prepared_seconds": round(total_seconds, 1),
        "pitch_class_frame_counts": {name: counts[index] for index, name in enumerate(names)},
        "absolute_midi_note_range": [ABSOLUTE_MIDI_MIN, ABSOLUTE_MIDI_MAX],
        "absolute_midi_frame_counts": {
            str(note): absolute_counts[note] for note in range(ABSOLUTE_MIDI_MIN, ABSOLUTE_MIDI_MAX + 1)
        },
        "same_register_five_note_frame_support": _same_register_five_note_support(absolute_counts),
        "caveat": (
            "This is a stratified half-second sample of autocorrelated frames, not a complete pitch inventory. "
            "YIN can have octave and overtone errors even in high-confidence frames; its 100-1100 Hz search "
            "also makes upper MIDI bins structurally unreachable. The two five-note sums compare the same fixed "
            "register, not model likelihoods or independent observations. Audio and score events are unaligned; "
            "neither count establishes compatibility or transposition."
        ),
    }


def audit(prepared_dir: Path, label_zip: Path, *, limit: int = 160, seed: int = 71470) -> dict:
    if not 1 <= limit <= 200:
        raise AuditError("invalid_sample_limit")
    records = _load_manifest(prepared_dir)
    labels = _load_labels(label_zip, {stem for _, stem in records})
    rng = random.Random(seed)
    candidates = []
    event_total = 0
    for filename, stem in records:
        duration, all_events = labels[stem]
        event_total += sum(code == "VB01" for _, _, code in all_events)
        eligible = _eligible_events(duration, all_events)
        if eligible:
            candidates.append((filename, duration, all_events, rng.choice(eligible)))
    rng.shuffle(candidates)
    chosen = candidates[:limit]
    counts: Counter[str] = Counter()
    counts["prepared_clips"] = len(records)
    counts["vb01_labels_in_prepared_clips"] = event_total
    counts["clips_with_isolated_eligible_event"] = len(candidates)
    counts["sampled_clips_and_events"] = len(chosen)
    amplitudes = []
    for filename, duration, all_events, event in chosen:
        samples = _read_wav(prepared_dir / filename)
        if abs(len(samples) / SAMPLE_HZ - duration) > 0.05:
            counts["wav_label_duration_mismatch"] += 1
            continue
        windows = {
            "pre": (event.start - 0.55, event.start - 0.05),
            "start_inside": (event.start + 0.05, event.start + 0.55),
            "middle_inside": ((event.start + event.end) / 2 - 0.25, (event.start + event.end) / 2 + 0.25),
            "end_inside": (event.end - 0.55, event.end - 0.05),
            "post": (event.end + 0.05, event.end + 0.55),
        }
        observed = {key: analyze_window(samples, *bounds) for key, bounds in windows.items()}
        for key, outcome in observed.items():
            counts[f"{key}_{outcome.state}"] += 1
            if outcome.state == "indeterminate":
                counts[f"{key}_indeterminate_{outcome.reason}"] += 1
        middle = observed["middle_inside"]
        if middle.amplitude_cents is not None and middle.state != "indeterminate":
            amplitudes.append(middle.amplitude_cents)
        if observed["pre"].state != "indeterminate" and observed["start_inside"].state != "indeterminate":
            counts["onset_pair_analyzable"] += 1
            if observed["pre"].state == "not_modulated" and observed["start_inside"].state == "modulated":
                counts["onset_flat_to_modulated_near_label"] += 1
            if observed["pre"].state == "modulated" and observed["start_inside"].state == "modulated":
                counts["onset_already_modulated"] += 1
        if observed["end_inside"].state != "indeterminate" and observed["post"].state != "indeterminate":
            counts["offset_pair_analyzable"] += 1
            if observed["end_inside"].state == "modulated" and observed["post"].state == "not_modulated":
                counts["offset_modulated_to_flat_near_label"] += 1
            if observed["end_inside"].state == "modulated" and observed["post"].state == "modulated":
                counts["offset_still_modulated"] += 1
        control = _control_start(duration, all_events, rng)
        if control is None:
            counts["no_unannotated_control_in_same_clip"] += 1
        else:
            outcome = analyze_window(samples, control, control + WINDOW_SECONDS)
            counts[f"control_{outcome.state}"] += 1
            if outcome.state == "indeterminate":
                counts[f"control_indeterminate_{outcome.reason}"] += 1
    amplitude_quantiles = (
        [round(float(x), 1) for x in np.quantile(amplitudes, [0.1, 0.5, 0.9])]
        if amplitudes else None
    )
    pitch_coverage = _aggregate_pitch_coverage(prepared_dir, records)
    return {
        "schema": "mini.aihub-71470-vb01-boundary-audit.v1",
        "read_only": True,
        "sample_seed": seed,
        "window_seconds": WINDOW_SECONDS,
        "boundary_center_distance_seconds": EDGE_SECONDS,
        "counts": dict(sorted(counts.items())),
        "middle_amplitude_cents_p10_p50_p90_in_analyzable": amplitude_quantiles,
        "sampled_acoustic_pitch_coverage": pitch_coverage,
        "interpretation_limits": [
            "Only one eligible event per clip; not a random sample of all VB01 events.",
            "Unannotated controls are not verified flat notes or non-vibrato ground truth.",
            "YIN pitch tracking may fail on breath noise, overtones, attacks, and low-level audio.",
            "Strict 3.5-8.5 Hz detector misses slow or irregular Korean ornamentation.",
            "Windows smear acoustic boundaries by approximately 0.30 seconds; no sample-accurate alignment claim.",
            "This assesses pitch modulation only, not authentic tone, timbre, breath, slur, or playable score alignment.",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepared-dir", type=Path, required=True)
    parser.add_argument("--label-zip", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=160)
    parser.add_argument("--seed", type=int, default=71470)
    args = parser.parse_args(argv)
    try:
        result = audit(args.prepared_dir, args.label_zip, limit=args.limit, seed=args.seed)
    except (AuditError, zipfile.BadZipFile) as exc:
        print(json.dumps({"error": str(exc) if isinstance(exc, AuditError) else "invalid_label_zip"}), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
