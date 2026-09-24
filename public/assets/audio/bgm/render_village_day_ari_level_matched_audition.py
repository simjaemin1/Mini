#!/usr/bin/env python3
"""Render a phase- and level-repaired Daegeum Ari listening experiment.

This is R&D-05, deliberately kept beside (and never in place of) the V4
native-pitch audition.  V4 made source selection auditable, but its three
splice types were still treated as ordinary equal-power crossfades.  A
waveform audit found two concrete artefacts in the V4 candidate:

* the separate 77 tongue and 77 steady-body recordings can be anti-phase in
  their 45 ms overlap, making a clearly audible artificial loudness valley;
* the score's same-pitch 77 -> 77 slur restarts an unnecessary second body,
  producing a swell before it settles.

This renderer repairs only those measured assembly defects.  It keeps direct
National Gugak Center recordings, static pitch resampling, the V4 manual
score interpretation, and V4's non-claim about a natural 77 -> 74 -> 72
fingering gesture.  It does *not* alter the game runtime or any served asset.

For the isolated tongue proxy, a candidate beginning is searched only inside
the already human-audited 77 steady span.  It must correlate positively with
the recorded tongue tail; then a linear (coherent) handoff is used.  This is
sample-splice repair, not a claim that the archive contains the original
player's paired gesture.  Pitch-changing slurs remain explicitly synthetic
crossfades, but their entry level is measured at the realized boundary and
boundedly matched before gently returning to the source's natural level.

Usage mirrors V4 and always requires the direct local source directory:

    python3 render_village_day_ari_level_matched_audition.py \
      --raw-daegeum-dir /path/to/monotone-6 \
      --output-dir /tmp/village-day-ari-level-matched
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import render_village_day_ari_native_pitch_audition as v4  # noqa: E402


v3 = v4.v3

SCHEMA = "durango.village-day-ari-phase-level-matched-audition.v1"

# Keep the source-level calibration and all raw material choices in V4.  The
# values below are only assembly decisions for this fixed, auditable audition.
PHASE_MIN_CORRELATION = 0.70
PHASE_MAX_LEVEL_ADJUST_DB = 3.0
LEVEL_MATCH_THRESHOLD_DB = 1.0
LEVEL_MATCH_MAX_ADJUST_DB = 3.0
LEVEL_MATCH_HOLD_S = 0.150
LEVEL_MATCH_RELAX_END_S = 0.250
SLUR_LEVEL_GATE_DB = 1.5
REATTACK_TROUGH_GATE_DB = 3.0
REATTACK_TROUGH_GATE_START_S = 0.050
CONTINUATION_GATE_DB = 1.0
HELD_BODY_TAPER_MAX_DB = 4.5


@dataclass(frozen=True)
class PhaseMatch:
    """The one measured, selected recorded-body entrance for a tongue proxy."""

    correlation: float
    tongue_tail_to_body_db: float
    body_to_phrase_target_db: float
    output_offset_s: float
    source_offset_relative_to_crop_s: float
    source_absolute_s: float | None


class AuditionError(v3.AuditionError):
    """A V5 assembly failure must never silently fall back to V4 behaviour."""


def _rms(signal: Any) -> float:
    return v3._rms(signal)


def _window_rms(signal: Any, start_s: float, end_s: float, sample_rate: int) -> float:
    return v3._window_rms(signal, start_s, end_s, sample_rate)


def _db(value: float) -> float:
    return 20.0 * math.log10(max(float(value), 1e-12))


def _ratio_db(numerator: float, denominator: float) -> float:
    return _db(numerator) - _db(denominator)


def _linear_fade_in(signal: Any, start: int, length: int, np: Any) -> None:
    """Use a complementary *amplitude* fade for phase-matched same-pitch audio."""
    if length <= 1 or start >= len(signal):
        return
    stop = min(len(signal), start + length)
    signal[start:stop] *= np.linspace(0.0, 1.0, stop - start, dtype=np.float32)


def _linear_fade_out(signal: Any, start: int, length: int, np: Any) -> None:
    if length <= 1 or start >= len(signal):
        return
    stop = min(len(signal), start + length)
    signal[start:stop] *= np.linspace(1.0, 0.0, stop - start, dtype=np.float32)
    if stop < len(signal):
        signal[stop:] = 0.0


def _phase_tongue_audio(
    material: v3.Material,
    target_midi: float,
    *,
    np: Any,
    sps: Any,
) -> tuple[Any, Any, dict[str, Any]]:
    """Return the audible tongue layer and an unfaded tail for phase analysis."""
    rendered, cents = v3._pitch_shift(material.signal, material.source_midi, target_midi, sps)
    unfaded = v3._take(
        rendered,
        v3.TONGUE_TRANSIENT_S,
        material.sample_rate,
        np,
        label=f"{material.path.name} recorded staccato onset",
    )
    unfaded *= material.calibration_gain
    audible = unfaded.copy()
    v3._fade_in(audible, 0, int(round(v3.ONSET_DECLICK_S * material.sample_rate)), np)
    _linear_fade_out(
        audible,
        int(round(v3.TONGUE_BODY_START_S * material.sample_rate)),
        int(round(v3.TONGUE_XFADE_S * material.sample_rate)),
        np,
    )
    return audible, unfaded, {
        "component": "recorded_staccato_onset_proxy",
        "timeline_offset_s": 0.0,
        "rendered_seconds": round(len(audible) / material.sample_rate, 6),
        "onset_declick_s": v3.ONSET_DECLICK_S,
        "fade_out_to_phase_matched_body_s": v3.TONGUE_XFADE_S,
        "crossfade_curve": "linear_amplitude_complementary_after_positive_phase_match",
        "sample": v3._material_provenance(material, target_midi, cents),
        "claim": (
            "This is a short onset from a separately recorded staccato take. "
            "It is a tongue/re-articulation proxy, not a paired proof of the exact "
            "same-player breath or fingering gesture."
        ),
    }


def _full_rendered_steady_body(
    material: v3.Material,
    target_midi: float,
    *,
    np: Any,
    sps: Any,
) -> tuple[Any, float, float]:
    """Render the full pre-audited steady span once for an auditable splice search."""
    if material.body_start_s is None or material.body_end_s is None:
        raise AuditionError(f"{material.path.name}: phase body needs a recorded steady span")
    a = int(round(material.body_start_s * material.sample_rate))
    b = int(round(material.body_end_s * material.sample_rate))
    rendered, cents = v3._pitch_shift(material.signal[a:b], material.source_midi, target_midi, sps)
    if len(rendered) < int(round(0.20 * material.sample_rate)):
        raise AuditionError(f"{material.path.name}: rendered steady body is too short")
    return (rendered.astype(np.float32) * material.calibration_gain), cents, (
        2 ** ((float(target_midi) - float(material.source_midi)) / 12.0)
    )


def _phase_matched_body_audio(
    material: v3.Material,
    target_midi: float,
    duration_s: float,
    tail_s: float,
    tongue_unfaded: Any,
    phrase_target_rms: float,
    *,
    np: Any,
    sps: Any,
) -> tuple[Any, dict[str, Any], PhaseMatch]:
    """Choose a positively correlated recorded 77 body and make a linear handoff.

    Searching is constrained to the manually audited same-note steady region.
    It is intentionally deterministic and fails instead of accepting an
    anti-phase source start or inventing an oscillator/loop.
    """
    full_body, cents, pitch_ratio = _full_rendered_steady_body(material, target_midi, np=np, sps=sps)
    sample_rate = material.sample_rate
    overlap = int(round(v3.TONGUE_XFADE_S * sample_rate))
    tongue_start = int(round(v3.TONGUE_BODY_START_S * sample_rate))
    query = tongue_unfaded[tongue_start:tongue_start + overlap]
    if len(query) != overlap or _rms(query) <= 1e-7:
        raise AuditionError("tongue phase-match window is unusable")
    needed = int(round((duration_s + tail_s) * sample_rate))
    valid_count = len(full_body) - needed + 1
    if valid_count <= 0:
        raise AuditionError(
            f"{material.path.name}: audited steady span cannot cover {duration_s + tail_s:.3f}s body"
        )

    # ``correlate`` over the rendered single-note span finds source positions
    # that retain waveform phase, rather than blindly assuming every crop
    # begins with compatible phase.  The FFT route is deterministic and cheap
    # for the short, local span used here.
    correlation_numerator = sps.correlate(full_body, query, mode="valid", method="fft")[:valid_count]
    energies = sps.convolve(
        full_body * full_body,
        np.ones(len(query), dtype=np.float32),
        mode="valid",
        method="fft",
    )[:valid_count]
    query_energy = float(np.dot(query, query))
    denominator = np.sqrt(np.maximum(energies * query_energy, 1e-20))
    correlations = correlation_numerator / denominator
    body_rms = np.sqrt(np.maximum(energies / float(len(query)), 1e-20))
    query_rms = _rms(query)
    tongue_to_body_db = 20.0 * np.log10(np.maximum(query_rms / body_rms, 1e-12))
    phrase_to_body_db = 20.0 * np.log10(np.maximum(float(phrase_target_rms) / body_rms, 1e-12))
    usable = (correlations >= PHASE_MIN_CORRELATION) & (
        np.abs(tongue_to_body_db) <= PHASE_MAX_LEVEL_ADJUST_DB + 1e-9
    )
    if not bool(np.any(usable)):
        best = float(np.max(correlations)) if len(correlations) else float("-inf")
        raise AuditionError(
            "no positively phase-matched recorded steady start meets the splice policy "
            f"(best correlation {best:.3f}, need >= {PHASE_MIN_CORRELATION:.2f})"
        )

    # A phase-safe point can still be a naturally much louder later portion
    # of the same sustained note.  Prefer a very strong phase match (when one
    # exists), then choose the actual recorded body whose realized energy is
    # closest to the preceding phrase.  Crucially, do not multiply the body
    # to force it to match the tongue tail: that would exchange an overlap
    # valley for a different artificial body-level pump.
    preferred = usable & (correlations >= 0.90)
    candidates = np.flatnonzero(preferred if bool(np.any(preferred)) else usable)
    order = np.lexsort((-correlations[candidates], np.abs(phrase_to_body_db[candidates])))
    index = int(candidates[int(order[0])])
    selected = full_body[index:index + needed].copy().astype(np.float32)
    _linear_fade_in(selected, 0, overlap, np)
    if tail_s > 0:
        v3._fade_out(selected, int(round(duration_s * sample_rate)),
                     int(round(tail_s * sample_rate)), np)

    source_relative = float(material.body_start_s) + (index / sample_rate) * pitch_ratio
    crop = material.meta.get("source_crop_s")
    source_absolute = None
    if isinstance(crop, (list, tuple)) and crop:
        try:
            source_absolute = float(crop[0]) + source_relative
        except (TypeError, ValueError):
            source_absolute = None
    match = PhaseMatch(
        correlation=float(correlations[index]),
        tongue_tail_to_body_db=float(tongue_to_body_db[index]),
        body_to_phrase_target_db=float(-phrase_to_body_db[index]),
        output_offset_s=index / sample_rate,
        source_offset_relative_to_crop_s=source_relative,
        source_absolute_s=source_absolute,
    )
    component = {
        "component": "recorded_phase_matched_steady_body",
        "timeline_offset_s": v3.TONGUE_BODY_START_S,
        "rendered_seconds": round(len(selected) / sample_rate, 6),
        "source_body_start_s": material.body_start_s,
        "selected_source_body_offset_relative_to_crop_s": match.source_offset_relative_to_crop_s,
        "selected_source_absolute_s": match.source_absolute_s,
        "selected_rendered_body_offset_s": match.output_offset_s,
        "phase_match": {
            "correlation": match.correlation,
            "minimum_required_correlation": PHASE_MIN_CORRELATION,
            "tongue_tail_to_body_level_delta_db": match.tongue_tail_to_body_db,
            "body_to_preceding_phrase_level_delta_db": match.body_to_phrase_target_db,
            "max_allowed_abs_tongue_body_delta_db": PHASE_MAX_LEVEL_ADJUST_DB,
            "body_gain_after_selection": 1.0,
            "crossfade_curve": "linear_amplitude_complementary",
        },
        "tail_after_score_s": tail_s,
        "sample": v3._material_provenance(material, target_midi, cents),
    }
    return selected, component, match


def _apply_entry_level_then_relax(signal: Any, entry_db: float, sample_rate: int, np: Any) -> None:
    """Match a pitch-change entry, then restore the selected source's level gently."""
    if abs(entry_db) <= 1e-9:
        return
    hold = int(round(LEVEL_MATCH_HOLD_S * sample_rate))
    relax_end = int(round(LEVEL_MATCH_RELAX_END_S * sample_rate))
    gain_db = np.zeros(len(signal), dtype=np.float32)
    gain_db[:min(hold, len(signal))] = entry_db
    if hold < len(signal):
        stop = min(relax_end, len(signal))
        if stop > hold:
            gain_db[hold:stop] = np.linspace(entry_db, 0.0, stop - hold, dtype=np.float32)
    signal *= np.power(10.0, gain_db / 20.0, dtype=np.float32)


def _body_entry_level_match(
    mix: Any,
    boundary_s: float,
    incoming_body: Any,
    sample_rate: int,
) -> dict[str, Any]:
    """Measure actual rendered energy rather than trusting a source-wide RMS tag."""
    outgoing = _window_rms(mix, boundary_s - 0.100, boundary_s - 0.030, sample_rate)
    incoming = _window_rms(incoming_body, 0.090, 0.150, sample_rate)
    if outgoing <= 1e-7 or incoming <= 1e-7:
        raise AuditionError("cannot level-match a silent boundary window")
    requested_db = _ratio_db(outgoing, incoming)
    applied_db = requested_db if abs(requested_db) > LEVEL_MATCH_THRESHOLD_DB else 0.0
    if abs(applied_db) > LEVEL_MATCH_MAX_ADJUST_DB + 1e-9:
        raise AuditionError(
            f"source entry needs {applied_db:+.2f} dB, above the safe "
            f"{LEVEL_MATCH_MAX_ADJUST_DB:.1f} dB limit"
        )
    return {
        "outgoing_window_s_relative_to_boundary": [-0.100, -0.030],
        "incoming_window_s_relative_to_body_start": [0.090, 0.150],
        "outgoing_rms": outgoing,
        "incoming_rms_before_adjustment": incoming,
        "requested_adjust_db": requested_db,
        "threshold_db": LEVEL_MATCH_THRESHOLD_DB,
        "applied_entry_adjust_db": applied_db,
        "hold_until_s": LEVEL_MATCH_HOLD_S if applied_db else None,
        "relax_to_nominal_by_s": LEVEL_MATCH_RELAX_END_S if applied_db else None,
        "max_allowed_abs_adjust_db": LEVEL_MATCH_MAX_ADJUST_DB,
    }


def _next_pitch_change_reference_rms(
    following: Mapping[str, Any] | None,
    following_next: Mapping[str, Any] | None,
    sustains: Mapping[float, v3.Material],
    *,
    np: Any,
    sps: Any,
    sample_rate: int,
) -> tuple[float | None, str | None]:
    """Return the later steady level only when a held note truly changes pitch.

    This is not a global loudness normalizer.  It gives the one long same-note
    continuation a local, score-visible destination level so an unrelated
    growing source envelope does not force a >3 dB jump at its next splice.
    """
    if following is None or str(following["kind"]) != v3.SLUR:
        return None, None
    target = float(following["midi"])
    try:
        sustain = sustains[target]
    except KeyError as exc:
        raise AuditionError(f"no sustain source for the next pitch-change MIDI {target:.2f}") from exc
    duration = float(following["end"]) - float(following["start"])
    tail, _release_inside = v3._variant_next_policy("score_articulated", following, following_next)
    probe, _component = v3._steady_audio(
        sustain, target, duration, tail, v3.SLUR_XFADE_S, np=np, sps=sps
    )
    value = _window_rms(probe, 0.090, 0.150, sample_rate)
    if value <= 1e-7:
        raise AuditionError(f"{following['id']}: next steady reference window is silent")
    return value, str(following["id"])


def _apply_held_body_taper(
    signal: Any,
    body_duration_s: float,
    target_rms: float | None,
    sample_rate: int,
    np: Any,
) -> dict[str, Any] | None:
    """Turn a source's long internal level drift into a gentle score-level curve.

    The source is untouched.  Only the re-articulated 77 body that is held
    across b10_e0 receives this envelope, and only because its next declared
    score event is a different-pitch slur.  The taper reaches its target
    *before* the pre-boundary measurement window, so the next actual source
    can enter without an unsafe instantaneous make-up gain.
    """
    if target_rms is None:
        return None
    # ``signal`` itself starts at the body entry (score onset + 70 ms), so
    # its coherent tongue/body overlap ends at body-local 45 ms, not at the
    # score-local 115 ms.  Begin the long score-level taper immediately after
    # that overlap rather than silently delaying it by another tongue offset.
    start_s = v3.TONGUE_XFADE_S
    settle_s = max(start_s, body_duration_s - 0.110)
    measured = _window_rms(signal, max(start_s, body_duration_s - 0.100),
                           max(start_s + 0.010, body_duration_s - 0.030), sample_rate)
    if measured <= 1e-7:
        raise AuditionError("held recorded body has a silent pre-transition taper window")
    requested_db = _ratio_db(target_rms, measured)
    if abs(requested_db) > HELD_BODY_TAPER_MAX_DB + 1e-9:
        raise AuditionError(
            f"held body needs {requested_db:+.2f} dB taper, above the safe "
            f"{HELD_BODY_TAPER_MAX_DB:.1f} dB limit"
        )
    start = int(round(start_s * sample_rate))
    settle = int(round(settle_s * sample_rate))
    gain_db = np.zeros(len(signal), dtype=np.float32)
    if settle > start:
        gain_db[start:settle] = np.linspace(0.0, requested_db, settle - start, dtype=np.float32)
    gain_db[settle:] = requested_db
    signal *= np.power(10.0, gain_db / 20.0, dtype=np.float32)
    return {
        "kind": "score_visible_gentle_held_body_taper",
        "source_rms_in_pre_transition_window": measured,
        "target_next_body_rms": target_rms,
        "requested_taper_db": requested_db,
        "max_allowed_abs_taper_db": HELD_BODY_TAPER_MAX_DB,
        "taper_start_s_relative_to_body": start_s,
        "taper_reaches_target_s_relative_to_body": settle_s,
        "curve": "linear_in_dB",
    }


def _continuation_origin(
    plans: Sequence[Mapping[str, Any]],
    position: int,
) -> tuple[float, list[int], Mapping[str, Any] | None]:
    """Group a re-attack with directly following same-pitch slur holds."""
    plan = plans[position]
    if str(plan["kind"]) != v3.REARTICULATE:
        return float(plan["end"]), [], plans[position + 1] if position + 1 < len(plans) else None
    target = float(plan["midi"])
    end = float(plan["end"])
    continued: list[int] = []
    cursor = position + 1
    while cursor < len(plans):
        next_plan = plans[cursor]
        touching = abs(float(next_plan["start"]) - end) <= 1e-6
        if (not touching or str(next_plan["kind"]) != v3.SLUR
                or abs(float(next_plan["midi"]) - target) > 1e-6):
            break
        continued.append(cursor)
        end = float(next_plan["end"])
        cursor += 1
    following = plans[cursor] if cursor < len(plans) else None
    return end, continued, following


def _event_record(plan: Mapping[str, Any], *, realization: str, components: Sequence[Mapping[str, Any]], **extra: Any) -> dict[str, Any]:
    record = {
        "id": plan["id"],
        "score_bar_one_based": plan["score_bar_one_based"],
        "browser_arirang_index_zero_based": plan["browser_arirang_index_zero_based"],
        "degree": plan["degree"],
        "score_start_s": plan["start"],
        "score_end_s": plan["end"],
        "requested_midi": plan["midi"],
        "planned_kind": plan["kind"],
        "planned_recipe": plan["onset_body_recipe"],
        "reason": plan["reason"],
        "gap_before_s": plan["gap_before"],
        "realization": realization,
        "components": list(components),
    }
    record.update(extra)
    return record


def _render_repaired_candidate(
    plans: Sequence[Mapping[str, Any]],
    sustains: Mapping[float, v3.Material],
    tongues: Mapping[float, v3.Material],
    *,
    np: Any,
    sps: Any,
    sample_rate: int,
) -> tuple[Any, list[dict[str, Any]]]:
    """Render V5 without altering V4's sources, score, or controls."""
    end_s = max(float(plan["end"]) for plan in plans) + v3.FINAL_RELEASE_S + 0.05
    mix = np.zeros(int(math.ceil(end_s * sample_rate)), dtype=np.float32)
    events: list[dict[str, Any]] = []
    continuation_from: dict[int, str] = {}

    for position, plan in enumerate(plans):
        if position in continuation_from:
            events.append(_event_record(
                plan,
                realization="continued_recorded_body_without_duplicate_same_pitch_splice",
                components=[],
                continued_from_event=continuation_from[position],
            ))
            continue
        target = float(plan["midi"])
        try:
            sustain = sustains[target]
        except KeyError as exc:
            raise AuditionError(f"no explicit sustain source for requested MIDI {target:.2f}") from exc
        next_plan = plans[position + 1] if position + 1 < len(plans) else None
        duration = float(plan["end"]) - float(plan["start"])
        kind = str(plan["kind"])

        if kind == v3.BREATH_START:
            tail, release_inside = v3._variant_next_policy("score_articulated", plan, next_plan)
            audio, component = v3._head_audio(
                sustain, target, duration, tail, release_inside, np=np, sps=sps
            )
            v3._add(mix, audio, float(plan["start"]), sample_rate)
            events.append(_event_record(
                plan,
                realization="recorded_full_head_for_new_breath_preserved_without_level_flattening",
                components=[component],
            ))
            continue

        if kind == v3.REARTICULATE:
            try:
                tongue = tongues[target]
            except KeyError as exc:
                raise AuditionError(
                    f"no separately recorded tongue onset exists for MIDI {target:.2f}"
                ) from exc
            held_end, continued_positions, following = _continuation_origin(plans, position)
            # The body now represents the whole same-pitch held group, so its
            # tail must be decided at ``held_end`` rather than the original
            # re-attack event end.  Otherwise b09_e1 would incorrectly look
            # separated from the later 74 and leave a second unmetered tail.
            held_policy_plan = dict(plan)
            held_policy_plan["end"] = held_end
            tail, _release_inside = v3._variant_next_policy(
                "score_articulated", held_policy_plan, following
            )
            body_duration = held_end - float(plan["start"]) - v3.TONGUE_BODY_START_S
            if body_duration <= v3.TONGUE_XFADE_S:
                raise AuditionError(f"{plan['id']}: score note is too short for phase body realization")
            onset, unfaded, onset_component = _phase_tongue_audio(tongue, target, np=np, sps=sps)
            body, body_component, phase_match = _phase_matched_body_audio(
                sustain,
                target,
                body_duration,
                tail,
                unfaded,
                _window_rms(mix, float(plan["start"]) - 0.100, float(plan["start"]) - 0.030, sample_rate),
                np=np,
                sps=sps,
            )
            following_next = plans[position + len(continued_positions) + 2] if (
                position + len(continued_positions) + 2 < len(plans)
            ) else None
            next_reference, next_reference_id = _next_pitch_change_reference_rms(
                following, following_next, sustains, np=np, sps=sps, sample_rate=sample_rate
            )
            taper = _apply_held_body_taper(body, body_duration, next_reference, sample_rate, np)
            if taper is not None:
                taper["target_event_id"] = next_reference_id
                body_component["held_body_taper"] = taper
            body_component["continued_through_event_ids"] = [str(plans[i]["id"]) for i in continued_positions]
            body_component["timeline_offset_s"] = v3.TONGUE_BODY_START_S
            v3._add(mix, onset, float(plan["start"]), sample_rate)
            v3._add(mix, body, float(plan["start"]) + v3.TONGUE_BODY_START_S, sample_rate)
            events.append(_event_record(
                plan,
                realization="recorded_tongue_then_phase_matched_recorded_body_with_same_pitch_hold_continuation",
                components=[onset_component, body_component],
                phase_match={
                    "correlation": phase_match.correlation,
                    "source_absolute_s": phase_match.source_absolute_s,
                },
                continued_event_ids=[str(plans[i]["id"]) for i in continued_positions],
            ))
            continuation_from.update({index: str(plan["id"]) for index in continued_positions})
            continue

        if kind == v3.SLUR:
            tail, _release_inside = v3._variant_next_policy("score_articulated", plan, next_plan)
            audio, component = v3._steady_audio(
                sustain, target, duration, tail, v3.SLUR_XFADE_S, np=np, sps=sps
            )
            match = _body_entry_level_match(mix, float(plan["start"]), audio, sample_rate)
            applied_db = float(match["applied_entry_adjust_db"])
            _apply_entry_level_then_relax(audio, applied_db, sample_rate, np)
            component["entry_level_match"] = match
            component["entry_level_match"]["curve"] = (
                "hold measured entry gain then linear-in-dB relax to the recorded nominal level"
                if applied_db else "no adjustment below threshold"
            )
            v3._add(mix, audio, float(plan["start"]), sample_rate)
            events.append(_event_record(
                plan,
                realization="recorded_steady_body_pitch_change_crossfade_with_bounded_measured_entry_level_match",
                components=[component],
            ))
            continue

        raise AuditionError(f"{plan['id']}: unsupported audition articulation {kind!r}")
    return mix, events


def _frame_rms(signal: Any, center_s: float, width_s: float, sample_rate: int) -> float:
    half = width_s / 2.0
    return _window_rms(signal, center_s - half, center_s + half, sample_rate)


def _v5_boundary_metrics(signal: Any, plans: Sequence[Mapping[str, Any],], sample_rate: int, np: Any) -> list[dict[str, Any]]:
    """Retain V4 gates and add explicit anti-pump measurements for V5's claims."""
    metrics = v4._native_boundary_metrics(signal, plans, sample_rate)
    by_id = {str(plan["id"]): plan for plan in plans}
    for item in metrics:
        plan = by_id[str(item["id"])]
        at = float(plan["start"])
        kind = str(plan["kind"])
        if kind == v3.SLUR:
            pre = _window_rms(signal, at - 0.075, at - 0.025, sample_rate)
            post = _window_rms(signal, at + 0.070, at + 0.120, sample_rate)
            delta = _ratio_db(post, pre) if pre > 1e-7 and post > 1e-7 else float("inf")
            item["slur_level_pre_50ms_rms"] = pre
            item["slur_level_post_70_to_120ms_rms"] = post
            item["slur_level_delta_db"] = delta
            item["slur_level_gate_abs_db"] = SLUR_LEVEL_GATE_DB
            item["slur_level_gate_pass"] = abs(delta) <= SLUR_LEVEL_GATE_DB
        else:
            item["slur_level_gate_pass"] = True
        if kind == v3.REARTICULATE:
            # The first 50 ms is the deliberately preserved real tongue
            # attack.  The gate starts just after it, where V4's anti-phase
            # handoff created its artificial second valley.
            centers = [at + offset for offset in np.arange(REATTACK_TROUGH_GATE_START_S, 0.221, 0.010)]
            frame_values = [_frame_rms(signal, center, 0.020, sample_rate) for center in centers]
            reference = [value for center, value in zip(centers, frame_values)
                         if at + 0.120 <= center <= at + 0.220]
            median = float(np.median(reference)) if reference else 0.0
            trough = min(frame_values) if frame_values else 0.0
            below = _ratio_db(trough, median) if trough > 1e-7 and median > 1e-7 else float("-inf")
            item["reattack_20ms_frame_centers_s_relative"] = [round(center - at, 3) for center in centers]
            item["reattack_20ms_frame_rms"] = frame_values
            item["reattack_reference_median_120_to_220ms_rms"] = median
            item["reattack_trough_after_50ms_rms"] = trough
            item["reattack_trough_vs_median_db"] = below
            item["reattack_trough_gate_db"] = -REATTACK_TROUGH_GATE_DB
            item["reattack_trough_gate_pass"] = below >= -REATTACK_TROUGH_GATE_DB
        else:
            item["reattack_trough_gate_pass"] = True
        # The known V4 same-pitch splice is b10_e0.  Record this by relation,
        # not waveform coincidence, so the test cannot accidentally endorse a
        # random stable boundary elsewhere in a future score edit.
        if str(plan["id"]) == "b10_e0":
            pre = _frame_rms(signal, at - 0.030, 0.020, sample_rate)
            post = _frame_rms(signal, at + 0.030, 0.020, sample_rate)
            delta = _ratio_db(post, pre) if pre > 1e-7 and post > 1e-7 else float("inf")
            item["same_pitch_continuation_pre_20ms_rms"] = pre
            item["same_pitch_continuation_post_20ms_rms"] = post
            item["same_pitch_continuation_delta_db"] = delta
            item["same_pitch_continuation_gate_abs_db"] = CONTINUATION_GATE_DB
            item["same_pitch_continuation_gate_pass"] = abs(delta) <= CONTINUATION_GATE_DB
        else:
            item["same_pitch_continuation_gate_pass"] = True
    return metrics


def dry_run_document() -> dict[str, Any]:
    base = v4.dry_run_document()
    return {
        "schema": f"{SCHEMA}.dry-run",
        "actual_render": False,
        "requires_explicit_raw_daegeum_root": True,
        "fallback": "forbidden",
        "browser_score": base["browser_score"],
        "performance_events": base["performance_events"],
        "variants": [
            "v4_score_articulated_native_pitch_reference",
            "phase_level_matched_score_articulated_native_pitch",
        ],
        "source_policy": {
            "same_direct_source_map_as_v4": True,
            "sustain_source_map": v4.NATIVE_SUSTAIN_SOURCES,
            "tongue_source_map": v4.NATIVE_TONGUE_SOURCES,
            "phase_match": {
                "searched_only_inside_human_audited_steady_span": True,
                "minimum_positive_correlation": PHASE_MIN_CORRELATION,
                "max_abs_level_adjust_db": PHASE_MAX_LEVEL_ADJUST_DB,
                "same_pitch_handoff_curve": "linear_amplitude_complementary",
            },
            "pitch_change_level_match": {
                "threshold_db": LEVEL_MATCH_THRESHOLD_DB,
                "max_abs_adjust_db": LEVEL_MATCH_MAX_ADJUST_DB,
                "not_a_natural_transition_claim": (
                    "77->74->72 remains a labelled crossfade; level matching does not create "
                    "or assert a recorded natural fingering transition"
                ),
            },
        },
    }


def render_audition(raw_daegeum_root: str | Path, output_dir: str | Path) -> dict[str, Any]:
    """Write V4 reference plus a phase/level-repaired comparison, never overwriting a bundle."""
    root = Path(raw_daegeum_root).expanduser().resolve()
    if not root.is_dir():
        raise AuditionError(f"--raw-daegeum-dir must be a direct source directory: {root}")
    np, sps, sampler_module = v3._load_audio_modules()
    sustains, tongues = v4._load_materials(root, sampler_module, np)
    sample_rate = int(sampler_module.SR)
    plans, _lookup = v3._score_plans(v3.default_score())
    reference_signal, reference_events = v3._render_variant(
        "score_articulated", plans, sustains, tongues, np=np, sps=sps, sample_rate=sample_rate
    )
    repaired_signal, repaired_events = _render_repaired_candidate(
        plans, sustains, tongues, np=np, sps=sps, sample_rate=sample_rate
    )
    raw_variants = (
        ("v4_score_articulated_native_pitch_reference", "01_v4_score_articulated_native_pitch_reference.wav",
         reference_signal, reference_events),
        ("phase_level_matched_score_articulated_native_pitch", "02_phase_level_matched_score_articulated_native_pitch.wav",
         repaired_signal, repaired_events),
    )
    global_peak = max(float(np.max(np.abs(signal))) for _name, _file, signal, _events in raw_variants)
    common_gain = 1.0 if global_peak <= v3.OUTPUT_PEAK_LIMIT else v3.OUTPUT_PEAK_LIMIT / global_peak
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
    with tempfile.TemporaryDirectory(prefix=f".{output.name}.stage-", dir=output.parent) as stage_name:
        stage = Path(stage_name)
        rendered: list[dict[str, Any]] = []
        for name, filename, signal, events in raw_variants:
            normalized = (signal * common_gain).astype(np.float32)
            peak = float(np.max(np.abs(normalized))) if len(normalized) else 0.0
            if peak > v3.OUTPUT_PEAK_LIMIT + 1e-6:
                raise AuditionError(f"{name}: common gain did not prevent clipping")
            metrics = (
                _v5_boundary_metrics(normalized, plans, sample_rate, np)
                if name == "phase_level_matched_score_articulated_native_pitch"
                else v4._native_boundary_metrics(normalized, plans, sample_rate)
            )
            if name == "phase_level_matched_score_articulated_native_pitch":
                gates = [
                    item["continuity_gate_pass"]
                    and item["native_breath_attack_gate_pass"]
                    and item["rearticulation_attack_gate_pass"]
                    and item["onset_declick_gate_pass"]
                    and item["slur_level_gate_pass"]
                    and item["reattack_trough_gate_pass"]
                    and item["same_pitch_continuation_gate_pass"]
                    for item in metrics
                ]
                if not all(gates):
                    raise AuditionError("phase/level-repaired candidate failed a measured boundary gate")
            wav = stage / filename
            v3._write_pcm16(wav, normalized, sample_rate)
            rendered.append({
                "name": name,
                "wav": filename,
                "wav_sha256": v3.sha256_file(wav),
                "seconds": round(len(normalized) / sample_rate, 6),
                "peak_after_common_gain": peak,
                "events": events,
                "boundary_metrics": metrics,
            })
        document = {
            "schema": SCHEMA,
            "actual_recorded_samples_only": True,
            "renderer": (
                "direct recorded-WAV interval crop/static pitch-resample/phase-aware splice/"
                "bounded level envelope/crossfade; no sampler.Voices/install, no oscillator fallback, "
                "no reverb, no synthesized vibrato"
            ),
            "source_attribution": v4.SOURCE_LABEL,
            "browser_score": dry_run_document()["browser_score"],
            "source_bank": {
                "identity": "same explicit direct local raw Daegeum source as V4; raw source is not embedded",
                "directory_basename": root.name,
                "source_files": sorted({
                    spec["wav"] for spec in (*v4.NATIVE_SUSTAIN_SOURCES.values(), *v4.NATIVE_TONGUE_SOURCES.values())
                }),
            },
            "assembly_policy": {
                "v4_reference_is_preserved": True,
                "same_pitch_77_slur": "continue the existing recorded body; do not duplicate a 77 body splice",
                "tongue_to_steady": {
                    "positive_phase_correlation_required": PHASE_MIN_CORRELATION,
                    "curve": "linear amplitude complementary fade",
                    "search_region": "human-audited recorded 77 steady span only",
                },
                "pitch_change_slurs": {
                    "remain_labelled_crossfades": True,
                    "entry_level_window_outgoing_s": [-0.100, -0.030],
                    "entry_level_window_incoming_s": [0.090, 0.150],
                    "max_abs_adjust_db": LEVEL_MATCH_MAX_ADJUST_DB,
                    "relax_window_s": [LEVEL_MATCH_HOLD_S, LEVEL_MATCH_RELAX_END_S],
                },
            },
            "level_policy": {
                "source_calibration": "unchanged fixed V4 per manually audited recorded interval",
                "post_mix_gain_is_common_to_both_variants": True,
                "peak_before_common_gain": global_peak,
                "common_gain": common_gain,
                "peak_limit": v3.OUTPUT_PEAK_LIMIT,
            },
            "variants": rendered,
            "known_limitations": [
                "The exact 77->74->72 natural fingering sequence is absent from the direct source collection.",
                "Those pitch-changing boundaries remain labelled recorded-body crossfades; phase/level repair does not turn them into a natural-transition claim.",
                "The 77 re-articulation still starts with a separately recorded staccato onset, so it remains a labelled articulation proxy rather than paired-gesture proof.",
                "This is a manual R&D score interpretation and does not read, replace, or assert parity with bgm.js runtime articulation.",
            ],
        }
        (stage / "provenance.json").write_text(
            json.dumps(v3._json_value(document), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        stage.rename(output)
    return document


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-daegeum-dir", type=Path,
                        help="explicit direct Sanjo Daegeum WAVE source folder; required unless --dry-run")
    parser.add_argument("--output-dir", type=Path, default=Path("out_village_day_ari_level_matched_audition"),
                        help="fresh directory for the V4 reference, V5 candidate, and provenance.json")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the score/source/repair contract without audio dependencies")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.dry_run:
            print(json.dumps(dry_run_document(), ensure_ascii=False, indent=2, sort_keys=True))
            return 0
        if args.raw_daegeum_dir is None:
            raise AuditionError("--raw-daegeum-dir is required for actual audio; use --dry-run otherwise")
        document = render_audition(args.raw_daegeum_dir, args.output_dir)
    except v3.AuditionError as exc:
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
