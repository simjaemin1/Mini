#!/usr/bin/env python3
"""Render an actual-recording-only Daegeum articulation audition.

This is an offline R&D renderer for the exact core score used by the browser
``village_day / ari`` scene: bars 8--10 at ``do=70`` and ``beat=0.72``.  It
does not make a new synthetic Daegeum, call ``sampler.Voices``/``install``,
or route to an oscillator fallback.  Instead it compares three deliberately
plain realizations from the locally restored *Sanjo Daegeum* archive:

``01_all_sustain_heads.wav``
    Every note starts with a full recorded sustain head.  This is the
    intentionally choppy reference.
``02_all_steady_crossfades.wav``
    Every touching note after a breath enters a recorded steady body.  This is
    the intentionally over-connected reference.
``03_score_articulated.wav``
    A score-aware middle case: full head for a new breath, a short recorded
    ``staccato`` onset followed by a sustain body for a re-articulation, and
    steady-body crossfades only where the performance score explicitly marks
    a slur.

The result is a listening gate, not a claim that isolated samples equal a
recorded natural fingering transition.  The accompanying provenance names
every source WAV and pitch move and states that limitation plainly.

The raw archive is intentionally not committed or served by the game.  Pass
an explicit, locally restored ``samples_daegeum`` directory instead:

    python3 render_village_day_ari_sanjo_audition.py --dry-run
    python3 render_village_day_ari_sanjo_audition.py \\
      --samples-sanjo /tmp/restored/samples_daegeum \\
      --output-dir /tmp/village-day-ari-audition
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import tempfile
import wave
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any, Mapping, Sequence


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from articulation import BREATH_START, REARTICULATE, SLUR, plan_articulations  # noqa: E402


class AuditionError(RuntimeError):
    """The audition must fail rather than substitute a non-recorded sound."""


SCHEMA = "durango.village-day-ari-sanjo-articulation-audition.v1"
SOURCE_LABEL = "National Gugak Center digital instrument sound archive (local restored Sanjo Daegeum bank)"

# Exact browser scene constants; do not substitute arirang.py's offline do=72.
BROWSER_DO = 70.0
BROWSER_BEAT_S = 0.72
# ``P.ariBar`` indexes ARIRANG from zero; score discussion and the source
# comments number bars from one.  Preserve both values so an audit cannot
# quietly slide the phrase by one bar.
SCORE_BAR_START_ONE_BASED = 8
SCORE_BAR_END_ONE_BASED = 10
ARIRANG_INDEX_START_ZERO_BASED = 7
ARIRANG_INDEX_END_ZERO_BASED = 9

# Musical / audio policy.  These are fixed and logged so a listening result
# does not depend on a hidden randomization pass.
MAX_PITCH_SHIFT_CENTS = 225.0
STEADY_MIN_SOURCE_OFFSET_S = 0.24
STEADY_TARGET_RMS = 0.105
SLUR_XFADE_S = 0.070
REARTICULATE_RELEASE_S = 0.028
REST_RELEASE_S = 0.100
FINAL_RELEASE_S = 0.160
TONGUE_BODY_START_S = 0.070
TONGUE_XFADE_S = 0.045
TONGUE_TRANSIENT_S = TONGUE_BODY_START_S + TONGUE_XFADE_S
# Scanner trims can begin on a non-zero waveform phase.  This is not an
# artistic attack envelope: it is the smallest boundary repair needed to keep
# a cut WAV from jumping from digital zero to an arbitrary sample value.
ONSET_DECLICK_S = 0.0025
OUTPUT_PEAK_LIMIT = 0.92


# The score slice begins at browser bar 8.  Its b08 rest and b09 repeat make
# the three onset cases audible without adding arbitrary notes.  Every slur
# below and b09_e1's re-articulation are conscious *manual R&D* performance
# annotations; timestamps alone never imply them.  They are intentionally not
# read from, or asserted to match, bgm.js's legacy time-based phrase planner.
# No random ornaments are used in this first articulation-only audition.
DEFAULT_SCORE: tuple[dict[str, Any], ...] = (
    {
        "id": "b08_e0",
        "score_bar_one_based": 8,
        "browser_arirang_index_zero_based": 7,
        "degree": 0,
        "start": 0.000,
        "end": 1.440,
        "midi": 70.0,
        "phrase_start": True,
        "release_to_rest": True,
    },
    {
        "id": "b08_rest",
        "score_bar_one_based": 8,
        "browser_arirang_index_zero_based": 7,
        "start": 1.440,
        "end": 2.160,
        "rest": True,
    },
    {
        "id": "b09_e0",
        "score_bar_one_based": 9,
        "browser_arirang_index_zero_based": 8,
        "degree": 3,
        "start": 2.160,
        "end": 3.600,
        "midi": 77.0,
        "breath_before": True,
    },
    {
        "id": "b09_e1",
        "score_bar_one_based": 9,
        "browser_arirang_index_zero_based": 8,
        "degree": 3,
        "start": 3.600,
        "end": 4.320,
        "midi": 77.0,
        "articulation": REARTICULATE,
    },
    {
        "id": "b10_e0",
        "score_bar_one_based": 10,
        "browser_arirang_index_zero_based": 9,
        "degree": 3,
        "start": 4.320,
        "end": 5.040,
        "midi": 77.0,
        "slur_from_previous": True,
    },
    {
        "id": "b10_e1",
        "score_bar_one_based": 10,
        "browser_arirang_index_zero_based": 9,
        "degree": 2,
        "start": 5.040,
        "end": 5.760,
        "midi": 74.0,
        "slur_from_previous": True,
    },
    {
        "id": "b10_e2",
        "score_bar_one_based": 10,
        "browser_arirang_index_zero_based": 9,
        "degree": 1,
        "start": 5.760,
        "end": 6.480,
        "midi": 72.0,
        "slur_from_previous": True,
    },
)


# The restored Sanjo archive supplies three useful plain sustain takes.  The
# browser slice below needs at most 1.84 semitones of static resampling; that
# is intentionally capped.  We do *not* pretend the JDAE set is viable here:
# it would force several notes beyond this cap.
SUSTAIN_SOURCES: dict[float, dict[str, Any]] = {
    70.0: {
        "wav": "_trimmed/대금_sanjo_deageum_scale_sus_04__001.wav",
        "midi": 71.18,
    },
    72.0: {
        "wav": "_trimmed/대금_sanjo_deageum_scale_sus_04__001.wav",
        "midi": 71.18,
    },
    74.0: {
        "wav": "_trimmed/대금_sanjo_deageum_scale_sus_04__002.wav",
        "midi": 75.16,
    },
    77.0: {
        "wav": "_trimmed/대금_sanjo_deageum_scale_sus_04__002.wav",
        "midi": 75.16,
    },
}
TONGUE_SOURCES: dict[float, dict[str, Any]] = {
    77.0: {
        # The archived index's ``__003`` trim contains *three* consecutive
        # staccato notes (about 72, 75, and 77).  Its one MIDI tag is therefore
        # not a valid note selector.  This is a human-audited crop of the 77
        # onset in the original recording, not an automatic split guess.
        "raw_wav": "대금_sanjo_deageum_stacatto_60.wav",
        "midi": 77.04,
        # Start 56 ms earlier than the old 10.786 s cut.  The measurable 77
        # attack begins about 10.734 s, so this keeps ~4 ms of quiet lead-in
        # plus the real attack ramp instead of fading in from its middle.
        "start_s": 10.730,
        "end_s": 11.050,
    },
}


@dataclass(frozen=True)
class Material:
    """One selected recorded fragment plus immutable audit metadata."""

    role: str
    path: Path
    meta: Mapping[str, Any]
    source_midi: float
    signal: Any
    sample_rate: int
    body_start_s: float | None
    body_end_s: float | None
    calibration_gain: float
    calibration_rms: float


def default_score() -> list[dict[str, Any]]:
    """Return a fresh score copy so callers cannot mutate the canonical grid."""
    return [dict(event) for event in DEFAULT_SCORE]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _json_value(value: Any) -> Any:
    if hasattr(value, "item"):
        try:
            return value.item()
        except (TypeError, ValueError):
            pass
    if isinstance(value, Mapping):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    return value


def _relative_file(root: Path, rel: str) -> Path:
    path = (root / rel).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise AuditionError(f"sample path escapes explicit source root: {rel}") from exc
    if not path.is_file():
        raise AuditionError(f"required recorded sample is missing: {rel}")
    return path


def _load_index(root: str | Path) -> tuple[Path, dict[str, Any], dict[str, Mapping[str, Any]]]:
    bank_root = Path(root).expanduser().resolve()
    index_path = bank_root / "_index.json"
    if not bank_root.is_dir() or not index_path.is_file():
        raise AuditionError(
            "--samples-sanjo must be an explicitly restored samples_daegeum directory "
            "containing _index.json"
        )
    try:
        index = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AuditionError(f"cannot read source index: {index_path}: {exc}") from exc
    entries = index.get("entries")
    if not isinstance(entries, list):
        raise AuditionError(f"source index has no entries list: {index_path}")
    by_wav: dict[str, Mapping[str, Any]] = {}
    for ordinal, raw in enumerate(entries):
        if not isinstance(raw, Mapping):
            raise AuditionError(f"source index entry {ordinal} is not an object")
        wav = raw.get("wav")
        if not isinstance(wav, str) or not wav:
            raise AuditionError(f"source index entry {ordinal} has no WAV path")
        if wav in by_wav:
            raise AuditionError(f"source index repeats a WAV path: {wav}")
        by_wav[wav] = raw
    return bank_root, index, by_wav


def _load_audio_modules() -> tuple[Any, Any, Any]:
    """Load existing offline audio helpers only when an actual render starts."""
    try:
        import numpy as np  # type: ignore
        from scipy import signal as sps  # type: ignore
        import sampler  # type: ignore
    except ModuleNotFoundError as exc:
        raise AuditionError(
            "actual audition needs NumPy/SciPy plus the existing sampler reader; "
            f"missing module: {exc.name}. Run --dry-run or use the BGM R&D environment."
        ) from exc
    return np, sps, sampler


def _rms(signal: Any) -> float:
    if len(signal) == 0:
        return 0.0
    return float((signal.astype("float64") ** 2).mean() ** 0.5)


def _validate_source_entry(
    root: Path,
    entries: Mapping[str, Mapping[str, Any]],
    spec: Mapping[str, Any],
    *,
    wanted_articulation: str,
) -> tuple[Path, Mapping[str, Any], float]:
    wav = str(spec["wav"])
    try:
        meta = entries[wav]
    except KeyError as exc:
        raise AuditionError(f"required archive entry is absent: {wav}") from exc
    path = _relative_file(root, wav)
    if meta.get("inst") != "daegeum":
        raise AuditionError(f"{wav}: expected a Daegeum recording, got {meta.get('inst')!r}")
    if meta.get("art") != wanted_articulation:
        raise AuditionError(
            f"{wav}: expected recorded {wanted_articulation!r}, got {meta.get('art')!r}"
        )
    if not meta.get("src"):
        raise AuditionError(f"{wav}: source-recording provenance is absent")
    try:
        actual_midi = float(meta["midi"])
        expected_midi = float(spec["midi"])
    except (KeyError, TypeError, ValueError) as exc:
        raise AuditionError(f"{wav}: source pitch metadata is invalid") from exc
    if abs(actual_midi - expected_midi) > 0.03:
        raise AuditionError(
            f"{wav}: source pitch changed ({actual_midi:.2f}); update the explicit audit map"
        )
    return path, meta, actual_midi


def _pitch_shift(signal: Any, source_midi: float, target_midi: float, sps: Any) -> tuple[Any, float]:
    ratio = 2 ** ((float(target_midi) - float(source_midi)) / 12.0)
    cents = 1200.0 * math.log2(ratio)
    if abs(cents) > MAX_PITCH_SHIFT_CENTS + 1e-9:
        raise AuditionError(
            f"target MIDI {target_midi:.2f} would move source {source_midi:.2f} by "
            f"{cents:.1f} cents; cap is {MAX_PITCH_SHIFT_CENTS:.0f}"
        )
    fraction = Fraction(1.0 / ratio).limit_denominator(220)
    rendered = sps.resample_poly(signal, fraction.numerator, fraction.denominator).astype("float32")
    return rendered, cents


def _fade_in(signal: Any, start: int, length: int, np: Any) -> None:
    if length <= 1 or start >= len(signal):
        return
    stop = min(len(signal), start + length)
    u = np.linspace(0.0, 1.0, stop - start, dtype=np.float32)
    gain = np.sqrt(0.5 - 0.5 * np.cos(np.pi * u)).astype(np.float32)
    signal[start:stop] *= gain


def _fade_out(signal: Any, start: int, length: int, np: Any) -> None:
    if length <= 1 or start >= len(signal):
        return
    stop = min(len(signal), start + length)
    u = np.linspace(0.0, 1.0, stop - start, dtype=np.float32)
    gain = np.sqrt(0.5 + 0.5 * np.cos(np.pi * u)).astype(np.float32)
    signal[start:stop] *= gain
    if stop < len(signal):
        signal[stop:] = 0.0


def _take(signal: Any, seconds: float, sample_rate: int, np: Any, *, label: str) -> Any:
    wanted = int(round(seconds * sample_rate))
    if wanted <= 0:
        raise AuditionError(f"{label}: requested non-positive duration")
    if len(signal) < wanted:
        raise AuditionError(
            f"{label}: recorded material is only {len(signal) / sample_rate:.3f}s, "
            f"need {seconds:.3f}s; looping/oscillator extension is forbidden in this audition"
        )
    return signal[:wanted].copy().astype(np.float32)


def _material_from_source(
    *,
    role: str,
    root: Path,
    entries: Mapping[str, Mapping[str, Any]],
    spec: Mapping[str, Any],
    wanted_articulation: str,
    sampler_module: Any,
    np: Any,
) -> Material:
    path, meta, source_midi = _validate_source_entry(
        root, entries, spec, wanted_articulation=wanted_articulation
    )
    signal = sampler_module.read_wav(str(path), stereo=False)
    if getattr(signal, "ndim", 1) != 1 or len(signal) < int(0.5 * sampler_module.SR):
        raise AuditionError(f"{path.name}: expected a usable mono recorded sample")
    signal = signal.astype(np.float32)

    body_start: float | None = None
    body_end: float | None = None
    if wanted_articulation == "sus":
        try:
            hold_start, hold_end, _width = sampler_module.hold_span(signal)
        except Exception as exc:  # pragma: no cover - delegated analysis diagnostic
            raise AuditionError(f"{path.name}: cannot identify a recorded steady span: {exc}") from exc
        body_start = max(float(hold_start), STEADY_MIN_SOURCE_OFFSET_S)
        body_end = float(hold_end)
        if body_end - body_start < 0.70:
            raise AuditionError(
                f"{path.name}: recorded steady span {body_start:.3f}--{body_end:.3f}s is too short"
            )
        probe_start = int(round(body_start * sampler_module.SR))
        probe_end = min(int(round((body_start + 0.60) * sampler_module.SR)), len(signal))
    else:
        # The staccato take supplies only a short onset layer; use its actual
        # early energy for calibration and never treat its later material as a
        # fake sustained body.
        probe_start = int(round(0.025 * sampler_module.SR))
        probe_end = min(int(round(0.105 * sampler_module.SR)), len(signal))
    measured_rms = _rms(signal[probe_start:probe_end])
    if measured_rms < 1e-5:
        raise AuditionError(f"{path.name}: recorded calibration window is silent")
    gain = float(np.clip(STEADY_TARGET_RMS / measured_rms, 0.35, 3.0))
    return Material(
        role=role,
        path=path,
        meta=meta,
        source_midi=source_midi,
        signal=signal,
        sample_rate=int(sampler_module.SR),
        body_start_s=body_start,
        body_end_s=body_end,
        calibration_gain=gain,
        calibration_rms=measured_rms,
    )


def _material_from_raw_onset_slice(
    *,
    role: str,
    root: Path,
    entries: Mapping[str, Mapping[str, Any]],
    spec: Mapping[str, Any],
    sampler_module: Any,
    np: Any,
) -> Material:
    """Load one audited onset from a raw multi-note staccato demonstration.

    ``sampler.scan`` is intentionally useful for most isolated notes, but the
    Sanjo staccato recording contains several attacks inside one scanner
    segment.  Selecting that whole segment by its one index MIDI would put a
    different attack under the requested note.  A fixed source-time crop is
    the more honest route until a separately checked transition/attack bank
    exists.
    """
    try:
        raw_wav = str(spec["raw_wav"])
        start_s = float(spec["start_s"])
        end_s = float(spec["end_s"])
        source_midi = float(spec["midi"])
    except (KeyError, TypeError, ValueError) as exc:
        raise AuditionError("raw staccato onset specification is invalid") from exc
    if not (0 <= start_s < end_s):
        raise AuditionError(f"{raw_wav}: invalid audited onset crop {start_s}--{end_s}")
    # The raw file itself is the source record.  Require at least one matching
    # staccato index entry so a renamed or unrelated recording cannot enter
    # the audition just because it happens to live beside the bank.
    if not any(entry.get("src") == raw_wav and entry.get("inst") == "daegeum"
               and entry.get("art") == "staccato" for entry in entries.values()):
        raise AuditionError(f"{raw_wav}: not evidenced by a Daegeum staccato archive entry")
    path = _relative_file(root, raw_wav)
    source = sampler_module.read_wav(str(path), stereo=False)
    if getattr(source, "ndim", 1) != 1:
        raise AuditionError(f"{raw_wav}: expected a mono raw recording")
    a = int(round(start_s * sampler_module.SR))
    b = int(round(end_s * sampler_module.SR))
    if b > len(source):
        raise AuditionError(f"{raw_wav}: audited onset crop exceeds source duration")
    signal = source[a:b].astype(np.float32)
    if len(signal) < int(0.12 * sampler_module.SR):
        raise AuditionError(f"{raw_wav}: audited onset crop is too short")
    probe_start = int(round(0.020 * sampler_module.SR))
    probe_end = min(int(round(0.100 * sampler_module.SR)), len(signal))
    measured_rms = _rms(signal[probe_start:probe_end])
    if measured_rms < 1e-5:
        raise AuditionError(f"{raw_wav}: audited onset calibration window is silent")
    gain = float(np.clip(STEADY_TARGET_RMS / measured_rms, 0.35, 3.0))
    return Material(
        role=role,
        path=path,
        meta={
            "wav": raw_wav,
            "src": raw_wav,
            "inst": "daegeum",
            "art": "staccato",
            "source_crop_s": [start_s, end_s],
        },
        source_midi=source_midi,
        signal=signal,
        sample_rate=int(sampler_module.SR),
        body_start_s=None,
        body_end_s=None,
        calibration_gain=gain,
        calibration_rms=measured_rms,
    )


def _material_provenance(material: Material, target_midi: float, cents: float) -> dict[str, Any]:
    return {
        "role": material.role,
        "wav": str(material.meta.get("wav")),
        "wav_sha256": sha256_file(material.path),
        "source_recording": material.meta.get("src"),
        "instrument": material.meta.get("inst"),
        "recorded_articulation": material.meta.get("art"),
        "recorded_source_crop_s": material.meta.get("source_crop_s"),
        "source_midi": material.source_midi,
        "target_midi": float(target_midi),
        "pitch_shift_cents": round(float(cents), 3),
        "recorded_steady_span_s": (
            None if material.body_start_s is None else [material.body_start_s, material.body_end_s]
        ),
        "calibration": {
            "window_rms": material.calibration_rms,
            "gain": material.calibration_gain,
            "target_rms": STEADY_TARGET_RMS,
        },
    }


def _head_audio(
    material: Material,
    target_midi: float,
    duration_s: float,
    tail_s: float,
    release_inside_s: float,
    *,
    np: Any,
    sps: Any,
) -> tuple[Any, dict[str, Any]]:
    rendered, cents = _pitch_shift(material.signal, material.source_midi, target_midi, sps)
    out = _take(
        rendered,
        duration_s + tail_s,
        material.sample_rate,
        np,
        label=f"{material.path.name} full recorded head",
    )
    out *= material.calibration_gain
    _fade_in(out, 0, int(round(ONSET_DECLICK_S * material.sample_rate)), np)
    nominal = int(round(duration_s * material.sample_rate))
    if release_inside_s > 0:
        _fade_out(out, max(0, nominal - int(round(release_inside_s * material.sample_rate))),
                  int(round(release_inside_s * material.sample_rate)), np)
    elif tail_s > 0:
        _fade_out(out, nominal, int(round(tail_s * material.sample_rate)), np)
    return out, {
        "component": "recorded_full_sustain_head",
        "timeline_offset_s": 0.0,
        "rendered_seconds": round(len(out) / material.sample_rate, 6),
        "onset_declick_s": ONSET_DECLICK_S,
        "fade_in_s": 0.0,
        "tail_after_score_s": tail_s,
        "release_inside_score_s": release_inside_s,
        "sample": _material_provenance(material, target_midi, cents),
    }


def _steady_audio(
    material: Material,
    target_midi: float,
    duration_s: float,
    tail_s: float,
    fade_in_s: float,
    *,
    np: Any,
    sps: Any,
) -> tuple[Any, dict[str, Any]]:
    if material.body_start_s is None or material.body_end_s is None:
        raise AuditionError(f"{material.path.name}: steady body requested from a non-sustain recording")
    a = int(round(material.body_start_s * material.sample_rate))
    b = int(round(material.body_end_s * material.sample_rate))
    rendered, cents = _pitch_shift(material.signal[a:b], material.source_midi, target_midi, sps)
    out = _take(
        rendered,
        duration_s + tail_s,
        material.sample_rate,
        np,
        label=f"{material.path.name} recorded steady body",
    )
    out *= material.calibration_gain
    _fade_in(out, 0, int(round(fade_in_s * material.sample_rate)), np)
    if tail_s > 0:
        nominal = int(round(duration_s * material.sample_rate))
        _fade_out(out, nominal, int(round(tail_s * material.sample_rate)), np)
    return out, {
        "component": "recorded_steady_sustain_body",
        "timeline_offset_s": 0.0,
        "rendered_seconds": round(len(out) / material.sample_rate, 6),
        "source_body_start_s": material.body_start_s,
        "fade_in_s": fade_in_s,
        "tail_after_score_s": tail_s,
        "sample": _material_provenance(material, target_midi, cents),
    }


def _tongue_audio(
    material: Material,
    target_midi: float,
    *,
    np: Any,
    sps: Any,
) -> tuple[Any, dict[str, Any]]:
    rendered, cents = _pitch_shift(material.signal, material.source_midi, target_midi, sps)
    out = _take(
        rendered,
        TONGUE_TRANSIENT_S,
        material.sample_rate,
        np,
        label=f"{material.path.name} recorded staccato onset",
    )
    out *= material.calibration_gain
    _fade_in(out, 0, int(round(ONSET_DECLICK_S * material.sample_rate)), np)
    _fade_out(out, int(round(TONGUE_BODY_START_S * material.sample_rate)),
              int(round(TONGUE_XFADE_S * material.sample_rate)), np)
    return out, {
        "component": "recorded_staccato_onset_proxy",
        "timeline_offset_s": 0.0,
        "rendered_seconds": round(len(out) / material.sample_rate, 6),
        "onset_declick_s": ONSET_DECLICK_S,
        "fade_out_to_steady_s": TONGUE_XFADE_S,
        "sample": _material_provenance(material, target_midi, cents),
        "claim": (
            "This is a short onset from a separately recorded staccato take. "
            "It is a tongue/re-articulation proxy, not a paired proof of the exact "
            "same-player breath or fingering gesture."
        ),
    }


def _add(mix: Any, signal: Any, start_s: float, sample_rate: int) -> None:
    start = int(round(start_s * sample_rate))
    stop = min(len(mix), start + len(signal))
    if start < 0 or stop <= start:
        raise AuditionError("recorded component falls outside the audition timeline")
    mix[start:stop] += signal[:stop - start]


def _score_plans(score: Sequence[Mapping[str, Any]]) -> tuple[list[dict[str, Any]], dict[int, Mapping[str, Any]]]:
    plans = plan_articulations(score)
    if not plans:
        raise AuditionError("audition score has no sounding events")
    lookup = {index: event for index, event in enumerate(score)}
    expected = [BREATH_START, BREATH_START, REARTICULATE, SLUR, SLUR, SLUR]
    actual = [plan["kind"] for plan in plans]
    if actual != expected:
        raise AuditionError(f"canonical audition annotations changed: {actual!r}")
    for plan in plans:
        event = lookup[plan["event_index"]]
        try:
            midi = float(event["midi"])
        except (KeyError, TypeError, ValueError) as exc:
            raise AuditionError(f"{event.get('id', plan['event_index'])}: missing numeric MIDI") from exc
        plan["id"] = str(event.get("id", f"event_{plan['event_index']:02d}"))
        plan["midi"] = midi
        plan["score_bar_one_based"] = event.get("score_bar_one_based")
        plan["browser_arirang_index_zero_based"] = event.get("browser_arirang_index_zero_based")
        plan["degree"] = event.get("degree")
    return plans, lookup


def _variant_next_policy(name: str, plan: Mapping[str, Any], next_plan: Mapping[str, Any] | None) -> tuple[float, float]:
    """Return (tail after score end, release inside score end) for one event."""
    if next_plan is None:
        return FINAL_RELEASE_S, 0.0
    gap = float(next_plan["start"]) - float(plan["end"])
    touching = abs(gap) <= 1e-6
    if not touching:
        return REST_RELEASE_S, 0.0
    if name == "all_sustain_heads":
        return 0.0, REARTICULATE_RELEASE_S
    if name == "all_steady_crossfades":
        return SLUR_XFADE_S, 0.0
    if name == "score_articulated":
        if next_plan["kind"] == SLUR:
            return SLUR_XFADE_S, 0.0
        if next_plan["kind"] == REARTICULATE:
            return 0.0, REARTICULATE_RELEASE_S
        # A touching fresh breath is authorial but unusual; close the old tone
        # before the declared new head rather than smearing the meanings.
        return 0.0, REARTICULATE_RELEASE_S
    raise AuditionError(f"unknown variant {name!r}")


def _render_variant(
    name: str,
    plans: Sequence[Mapping[str, Any]],
    sustains: Mapping[float, Material],
    tongues: Mapping[float, Material],
    *,
    np: Any,
    sps: Any,
    sample_rate: int,
) -> tuple[Any, list[dict[str, Any]]]:
    end_s = max(float(plan["end"]) for plan in plans) + FINAL_RELEASE_S + 0.05
    mix = np.zeros(int(math.ceil(end_s * sample_rate)), dtype=np.float32)
    events: list[dict[str, Any]] = []

    for position, plan in enumerate(plans):
        next_plan = plans[position + 1] if position + 1 < len(plans) else None
        target = float(plan["midi"])
        try:
            sustain = sustains[target]
        except KeyError as exc:
            raise AuditionError(f"no explicit sustain source for requested MIDI {target:.2f}") from exc
        duration = float(plan["end"]) - float(plan["start"])
        tail, release_inside = _variant_next_policy(name, plan, next_plan)
        components: list[dict[str, Any]] = []

        if name == "all_sustain_heads":
            audio, component = _head_audio(
                sustain, target, duration, tail, release_inside, np=np, sps=sps
            )
            _add(mix, audio, float(plan["start"]), sample_rate)
            components.append(component)
            realization = "forced_full_sustain_head_at_every_note"
        elif name == "all_steady_crossfades":
            if plan["kind"] == BREATH_START:
                audio, component = _head_audio(
                    sustain, target, duration, tail, release_inside, np=np, sps=sps
                )
                realization = "full_head_after_declared_rest_or_phrase_start"
            else:
                audio, component = _steady_audio(
                    sustain, target, duration, tail, SLUR_XFADE_S, np=np, sps=sps
                )
                realization = "forced_steady_body_at_touching_boundary"
            _add(mix, audio, float(plan["start"]), sample_rate)
            components.append(component)
        elif name == "score_articulated":
            if plan["kind"] == BREATH_START:
                audio, component = _head_audio(
                    sustain, target, duration, tail, release_inside, np=np, sps=sps
                )
                _add(mix, audio, float(plan["start"]), sample_rate)
                components.append(component)
                realization = "recorded_full_head_for_new_breath"
            elif plan["kind"] == SLUR:
                audio, component = _steady_audio(
                    sustain, target, duration, tail, SLUR_XFADE_S, np=np, sps=sps
                )
                _add(mix, audio, float(plan["start"]), sample_rate)
                components.append(component)
                realization = "recorded_steady_body_crossfade_for_explicit_slur"
            elif plan["kind"] == REARTICULATE:
                try:
                    tongue = tongues[target]
                except KeyError as exc:
                    raise AuditionError(
                        f"no separately recorded staccato onset exists for re-articulated MIDI {target:.2f}"
                    ) from exc
                onset, onset_component = _tongue_audio(tongue, target, np=np, sps=sps)
                body_duration = duration - TONGUE_BODY_START_S
                if body_duration <= TONGUE_XFADE_S:
                    raise AuditionError(f"{plan['id']}: score note is too short for tongue/body realization")
                body, body_component = _steady_audio(
                    sustain, target, body_duration, tail, TONGUE_XFADE_S, np=np, sps=sps
                )
                body_component["timeline_offset_s"] = TONGUE_BODY_START_S
                _add(mix, onset, float(plan["start"]), sample_rate)
                _add(mix, body, float(plan["start"]) + TONGUE_BODY_START_S, sample_rate)
                components.extend((onset_component, body_component))
                realization = "recorded_staccato_onset_proxy_then_recorded_steady_body"
            else:  # plan_articulations currently yields four public kinds; keep unsupported loud.
                raise AuditionError(f"{plan['id']}: unsupported audition articulation {plan['kind']!r}")
        else:
            raise AuditionError(f"unknown variant {name!r}")

        events.append(
            {
                "id": plan["id"],
                "score_bar_one_based": plan["score_bar_one_based"],
                "browser_arirang_index_zero_based": plan["browser_arirang_index_zero_based"],
                "degree": plan["degree"],
                "score_start_s": plan["start"],
                "score_end_s": plan["end"],
                "requested_midi": target,
                "planned_kind": plan["kind"],
                "planned_recipe": plan["onset_body_recipe"],
                "reason": plan["reason"],
                "gap_before_s": plan["gap_before"],
                "realization": realization,
                "components": components,
            }
        )
    return mix, events


def _write_pcm16(path: Path, signal: Any, sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = (signal.clip(-1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(int(sample_rate))
        stream.writeframes(pcm.tobytes())


def _window_rms(signal: Any, start_s: float, end_s: float, sample_rate: int) -> float:
    a = max(0, int(round(start_s * sample_rate)))
    b = min(len(signal), int(round(end_s * sample_rate)))
    if b <= a:
        return 0.0
    return _rms(signal[a:b])


def _boundary_metrics(signal: Any, plans: Sequence[Mapping[str, Any]], sample_rate: int) -> list[dict[str, Any]]:
    """Measure only the short windows where this audition makes a claim.

    This is not a perceptual-quality oracle.  It catches the concrete failure
    we can test mechanically: an unwanted all-but-silent hole around an
    intended re-articulation or explicit slur.
    """
    metrics: list[dict[str, Any]] = []
    window = 0.030
    for position, plan in enumerate(plans):
        at = float(plan["start"])
        pre = _window_rms(signal, at - window, at, sample_rate)
        post = _window_rms(signal, at, at + window, sample_rate)
        after_xfade = _window_rms(signal, at + window, at + window + 0.040, sample_rate)
        attack_settled = _window_rms(signal, at + 0.070, at + 0.120, sample_rate)
        sample = int(round(at * sample_rate))
        onset_step = (abs(float(signal[sample]) - float(signal[sample - 1]))
                      if 0 < sample < len(signal) else 0.0)
        initial_sample_abs = abs(float(signal[0])) if position == 0 and len(signal) else None
        kind = str(plan["kind"])
        # Only a slur promises continuous energy right at the boundary.  A
        # genuine tongue onset is allowed a quiet pre-onset, but must become
        # audible after its short attack has unfolded.
        require_continuity = kind == SLUR
        continuity_ok = (not require_continuity) or (pre >= 0.010 and post >= 0.010)
        attack_ok = kind != BREATH_START or post >= 0.010
        reattack_ok = kind != REARTICULATE or attack_settled >= 0.010
        # A slur keeps the outgoing waveform alive at its boundary, so its
        # one-sample slope is ordinary audio rather than a zero→cut onset.
        # Apply the de-click gate only where this renderer deliberately
        # enters from silence/a released prior tone.
        declick_required = kind in (BREATH_START, REARTICULATE)
        declick_ok = (not declick_required) or (
            initial_sample_abs <= 1e-4 if initial_sample_abs is not None else onset_step <= 1e-4
        )
        metrics.append({
            "id": plan["id"],
            "kind": kind,
            "score_boundary_s": at,
            "pre_30ms_rms": pre,
            "post_30ms_rms": post,
            "post_30_to_70ms_rms": after_xfade,
            "post_70_to_120ms_rms": attack_settled,
            "onset_sample_step": onset_step,
            "initial_sample_abs": initial_sample_abs,
            "onset_declick_required": declick_required,
            "onset_declick_gate_pass": declick_ok,
            "requires_continuity": require_continuity,
            "continuity_gate_pass": continuity_ok,
            "breath_attack_gate_pass": attack_ok,
            "rearticulation_attack_gate_pass": reattack_ok,
        })
    return metrics


def dry_run_document() -> dict[str, Any]:
    """Return the exact score/realization contract without audio dependencies."""
    score = default_score()
    plans, _lookup = _score_plans(score)
    return {
        "schema": f"{SCHEMA}.dry-run",
        "actual_render": False,
        "requires_explicit_samples_sanjo_root": True,
        "fallback": "forbidden",
        "browser_score": {
            "scene": "village_day",
            "mood": "ari",
            "browser_do": BROWSER_DO,
            "beat_seconds": BROWSER_BEAT_S,
            "score_bars_one_based": [SCORE_BAR_START_ONE_BASED, SCORE_BAR_END_ONE_BASED],
            "arirang_indices_zero_based": [
                ARIRANG_INDEX_START_ZERO_BASED,
                ARIRANG_INDEX_END_ZERO_BASED,
            ],
            "ornaments": "disabled for articulation-only comparison",
            "articulation_authority": {
                "source": "manual R&D annotations in DEFAULT_SCORE",
                "not_runtime_parity": (
                    "This audition does not read or replace bgm.js "
                    "planPerformancePhrase(); the legacy runtime remains unchanged."
                ),
                "authorial_choices": {
                    "b09_e1": "rearticulate",
                    "b10_e0_to_b10_e2": "explicit_slur_sequence",
                },
            },
        },
        "performance_events": [
            {
                "id": plan["id"],
                "score_bar_one_based": plan["score_bar_one_based"],
                "browser_arirang_index_zero_based": plan["browser_arirang_index_zero_based"],
                "midi": plan["midi"],
                "start": plan["start"],
                "end": plan["end"],
                "kind": plan["kind"],
                "recipe": plan["onset_body_recipe"],
            }
            for plan in plans
        ],
        "variants": [
            "all_sustain_heads",
            "all_steady_crossfades",
            "score_articulated",
        ],
        "source_policy": {
            "bank": "Sanjo Daegeum only",
            "max_pitch_shift_cents": MAX_PITCH_SHIFT_CENTS,
            "sustain_source_map": SUSTAIN_SOURCES,
            "tongue_source_map": TONGUE_SOURCES,
        },
    }


def render_audition(sample_root: str | Path, output_dir: str | Path) -> dict[str, Any]:
    """Render all three actual-recording variants and one common provenance file."""
    root, index, entries = _load_index(sample_root)
    np, sps, sampler_module = _load_audio_modules()
    score = default_score()
    plans, _lookup = _score_plans(score)

    sustains = {
        target: _material_from_source(
            role="sustain", root=root, entries=entries, spec=spec, wanted_articulation="sus",
            sampler_module=sampler_module, np=np,
        )
        for target, spec in SUSTAIN_SOURCES.items()
    }
    tongues = {
        target: _material_from_raw_onset_slice(
            role="tongue_onset", root=root, entries=entries, spec=spec,
            sampler_module=sampler_module, np=np,
        )
        for target, spec in TONGUE_SOURCES.items()
    }
    sample_rate = int(sampler_module.SR)
    if any(material.sample_rate != sample_rate for material in (*sustains.values(), *tongues.values())):
        raise AuditionError("recorded source material did not resolve to one common sample rate")

    raw_variants: list[tuple[str, Any, list[dict[str, Any]]]] = []
    for name in ("all_sustain_heads", "all_steady_crossfades", "score_articulated"):
        signal, events = _render_variant(
            name, plans, sustains, tongues, np=np, sps=sps, sample_rate=sample_rate
        )
        raw_variants.append((name, signal, events))
    global_peak = max(float(np.max(np.abs(signal))) for _name, signal, _events in raw_variants)
    common_gain = 1.0 if global_peak <= OUTPUT_PEAK_LIMIT else OUTPUT_PEAK_LIMIT / global_peak
    if not math.isfinite(common_gain) or common_gain <= 0:
        raise AuditionError("invalid common post-mix gain")

    output = Path(output_dir).expanduser().resolve()
    if output.exists():
        raise AuditionError(
            f"--output-dir must not already exist: {output}. Choose a fresh R&D directory "
            "so listening artifacts cannot overwrite a prior result."
        )
    if not output.parent.is_dir():
        raise AuditionError(f"--output-dir parent does not exist: {output.parent}")
    files = {
        "all_sustain_heads": "01_all_sustain_heads.wav",
        "all_steady_crossfades": "02_all_steady_crossfades.wav",
        "score_articulated": "03_score_articulated.wav",
    }
    # Render into a private sibling then atomically publish it only after all
    # WAVs and provenance are complete.  That makes it impossible for a
    # failed render to overwrite or masquerade as a previous listening bundle.
    with tempfile.TemporaryDirectory(prefix=f".{output.name}.stage-", dir=output.parent) as stage_name:
        stage = Path(stage_name)
        rendered_variants: list[dict[str, Any]] = []
        for name, signal, events in raw_variants:
            normalized = (signal * common_gain).astype(np.float32)
            peak = float(np.max(np.abs(normalized))) if len(normalized) else 0.0
            if peak > OUTPUT_PEAK_LIMIT + 1e-6:
                raise AuditionError(f"{name}: common pair gain did not prevent clipping")
            metrics = _boundary_metrics(normalized, plans, sample_rate)
            if name == "score_articulated" and not all(
                item["continuity_gate_pass"] and item["breath_attack_gate_pass"]
                and item["rearticulation_attack_gate_pass"]
                and item["onset_declick_gate_pass"] for item in metrics
            ):
                raise AuditionError(
                    "score-articulated output has an unintended silent hole or click at a declared boundary"
                )
            wav = stage / files[name]
            _write_pcm16(wav, normalized, sample_rate)
            rendered_variants.append(
                {
                    "name": name,
                    # A listening bundle must remain shareable without
                    # leaking the creator's filesystem layout.
                    "wav": files[name],
                    "wav_sha256": sha256_file(wav),
                    "seconds": round(len(normalized) / sample_rate, 6),
                    "peak_after_common_gain": peak,
                    "events": events,
                    "boundary_metrics": metrics,
                }
            )
        document = {
            "schema": SCHEMA,
            "actual_recorded_samples_only": True,
            "renderer": (
                "direct recorded-WAV crop/static pitch-resample/envelope/crossfade; "
                "no sampler.Voices/install, no oscillator fallback, no reverb, no synthesized vibrato"
            ),
            "source_attribution": SOURCE_LABEL,
            "browser_score": dry_run_document()["browser_score"],
            "source_bank": {
                "identity": "explicit local samples_daegeum input; raw source is not embedded",
                "directory_basename": root.name,
                "index_sha256": sha256_file(root / "_index.json"),
                "index_entry_count": index.get("count", len(index.get("entries", []))),
            },
            "timing_policy": {
                "slur_xfade_s": SLUR_XFADE_S,
                "rearticulate_previous_release_inside_score_s": REARTICULATE_RELEASE_S,
                "tongue_body_start_s": TONGUE_BODY_START_S,
                "tongue_body_xfade_s": TONGUE_XFADE_S,
                "onset_declick_s": ONSET_DECLICK_S,
                "rest_release_s": REST_RELEASE_S,
                "next_score_onsets_are_never_moved": True,
            },
            "level_policy": {
                "source_calibration": "fixed per selected source from its recorded reference window",
                "post_mix_gain_is_common_to_all_variants": True,
                "peak_before_common_gain": global_peak,
                "common_gain": common_gain,
                "peak_limit": OUTPUT_PEAK_LIMIT,
            },
            "variants": rendered_variants,
            "known_limitations": [
                "The archive has separate sustained-scale and staccato-scale takes, not paired breath/tongue takes for each note.",
                "The re-articulation uses a real short staccato onset plus a recorded sustain body; it is a labelled proxy, not proof of the exact original tongue gesture.",
                "The slur uses recorded steady bodies and an equal-power crossfade. It is not a directly recorded natural fingering transition.",
                "Only browser Ari score bars 8--10 (ARIRANG zero-based indices 7--9) are rendered because this exact source coverage stays within the declared pitch-shift cap. A full-game replacement needs additional native-range recordings or a separately validated expressive synthesis model.",
            ],
        }
        provenance = stage / "provenance.json"
        provenance.write_text(
            json.dumps(_json_value(document), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        stage.rename(output)
    return document


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples-sanjo", type=Path,
                        help="explicit restored samples_daegeum directory; required unless --dry-run")
    parser.add_argument("--output-dir", type=Path, default=Path("out_village_day_ari_sanjo_audition"),
                        help="directory for three WAVs plus provenance.json")
    parser.add_argument("--dry-run", action="store_true",
                        help="print score/source/render contract without any sample or SciPy dependency")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.dry_run:
            print(json.dumps(dry_run_document(), ensure_ascii=False, indent=2, sort_keys=True))
            return 0
        if args.samples_sanjo is None:
            raise AuditionError("--samples-sanjo is required for actual audio; use --dry-run otherwise")
        document = render_audition(args.samples_sanjo, args.output_dir)
    except AuditionError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "common_gain": document["level_policy"]["common_gain"],
        "outputs": [{"name": item["name"], "wav": item["wav"], "sha256": item["wav_sha256"]}
                    for item in document["variants"]],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
