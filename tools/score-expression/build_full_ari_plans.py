#!/usr/bin/env python3
"""Build the tracked 16-bar Ari B0/B1 score-expression plans.

The pitch/duration grid is the existing browser-game arrangement at do=70,
not an authentic performance transcription.  Articulation and two provisional
yoseong candidates are newly authored R&D decisions.  Keeping the builder
beside the generated JSON makes all 59 notes and both variants reproducible
without importing the runtime BGM modules.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import compile_expression as compiler


HERE = Path(__file__).resolve().parent
PLAN_DIRECTORY = HERE / "plans"
B0_FILENAME = "ari_full_16bar_b0_straight_r1.json"
B1_FILENAME = "ari_full_16bar_b1_contextual_yoseong_r1.json"
B2_REFERENCE_FILENAME = "ari_full_16bar_b2_reference_shape_unreviewed_r1.json"
B2_DEPTH_MATCHED_FILENAME = (
    "ari_full_16bar_b2rd_reference_shape_depth_matched_unreviewed_r1.json"
)
B2_DEPTH_MATCHED_LONG_FADE_FILENAME = (
    "ari_full_16bar_b2rdf_reference_shape_depth_matched_long_fade_unreviewed_r1.json"
)

DO_MIDI = 70
BEAT_SECONDS = 0.72
BAR_BEATS = 3.0
RELEASE_SECONDS = 0.24
PERFORMED_BREATH_GAP_SECONDS = 0.072
PERFORMED_BREATH_GAP_BEATS = PERFORMED_BREATH_GAP_SECONDS / BEAT_SECONDS

LOCAL_CANDIDATE_RULE = "gyeonggi_ari.v1.sustained_before_rest_late_yoseong_candidate"
GLOBAL_CANDIDATE_RULE = "gyeonggi_ari.v1.global_cadence_late_yoseong_candidate"
SHORT_TAIL_RULE = "gyeonggi_ari.v1.short_local_tail_no_full_yoseong"
DEFAULT_RULE = "gyeonggi_ari.v1.default_straight"
RELEASE_RULE = "gyeonggi_ari.v1.release_no_vibrato"

# (start beat within bar, notated duration beats, five-note scale degree).
# This is copied intentionally as a stable score fact from arirang.py.  It is
# not claimed to be a transcription of a singer or Daegeum player.
M1 = ((0.0, 1.5, -2), (1.5, 0.5, -1), (2.0, 0.5, -2), (2.5, 0.5, -1))
M2 = ((0.0, 1.5, 0), (1.5, 0.5, 1), (2.0, 0.5, 0), (2.5, 0.5, 1))
M3 = ((0.0, 1.0, 2), (1.0, 0.5, 1), (1.5, 0.5, 2), (2.0, 0.5, 0), (2.5, 0.5, -1))
M6 = ((0.0, 0.5, 2), (0.5, 0.5, 1), (1.0, 0.5, 0), (1.5, 0.5, -1), (2.0, 0.5, -2), (2.5, 0.5, -1))
M7 = ((0.0, 1.5, 0), (1.5, 0.5, 1), (2.0, 1.0, 0))
ARIRANG = (
    M1,
    M2,
    M3,
    M1,
    M2,
    M6,
    M7,
    ((0.0, 2.0, 0),),
    ((0.0, 2.0, 3), (2.0, 1.0, 3)),
    ((0.0, 1.0, 3), (1.0, 1.0, 2), (2.0, 1.0, 1)),
    M3,
    M1,
    M2,
    M6,
    M7,
    ((0.0, 3.0, 0),),
)

DEGREE_NAMES = {
    -2: "lower_sol",
    -1: "lower_la",
    0: "do",
    1: "re",
    2: "mi",
    # Preserve the already-auditioned b09/b10 policy vocabulary: degree 3 is
    # the arrangement's upper-register ``sol`` but the modal role is ``sol``.
    3: "sol",
}


def _rounded(value: float) -> float:
    return round(float(value), 6)


def _pitch_hz(degree: int) -> float:
    octave, index = divmod(degree, 5)
    midi = DO_MIDI + 12 * octave + (0, 2, 4, 7, 9)[index]
    return _rounded(440.0 * (2.0 ** ((midi - 69.0) / 12.0)))


def _candidate_parameters(*, global_cadence: bool) -> dict[str, Any]:
    return {
        "rate_hz": 3.45,
        "depth_cents": 18.0,
        "onset_seconds": 1.44 if global_cadence else 0.72,
        "ramp_seconds": 0.18,
        "end_fade_seconds": 0.24 if global_cadence else 0.18,
        "parameter_status": "provisional_local_proxy_bounds_not_reference_performance_measurement",
    }


def _articulation(bar: int, event_index: int) -> str:
    if event_index == 0:
        if bar in (1, 5, 9, 13):
            return "breath_start"
        if bar == 10:
            return "slur"
        return "rearticulate"
    if bar == 9 and event_index == 1:
        return "rearticulate"
    return "slur"


def _approach(
    *, bar: int, event_index: int, articulation: str, degree: int, previous_degree: int | None
) -> str:
    if bar == 8:
        return "phrase_arrival"
    if bar == 16:
        return "global_cadence_arrival"
    if articulation == "breath_start":
        return "breath_start"
    if articulation == "rearticulate":
        if previous_degree == degree:
            return "same_pitch_rearticulation"
        if event_index == 0:
            return "bar_head_rearticulation"
        return "internal_rearticulation"
    if previous_degree == degree:
        return "same_pitch_slur"
    assert previous_degree is not None
    delta = degree - previous_degree
    if bar == 10 and event_index == 2:
        return "descending_arrival"
    if delta > 1:
        return "ascending_leap"
    if delta > 0:
        return "ascending_step"
    if delta < -1:
        return "descending_leap"
    return "descending_step"


def _phrase_role(*, bar: int, event_index: int, duration_beats: float, approach: str) -> str:
    if bar == 8:
        return "local_phrase_cadence_before_rest"
    if bar == 16:
        return "global_phrase_cadence"
    if bar == 10 and event_index == 2:
        return "local_phrase_tail"
    if bar == 9 and event_index == 1:
        return "repeated_tone_continuation"
    if approach == "breath_start":
        return "phrase_head_sustained" if duration_beats >= 1.0 else "phrase_head"
    if event_index == 0:
        return "bar_head_within_breath_phrase"
    return "phrase_continuation"


def _steady_loudness(bar: int, event_index: int) -> float:
    # Preserve the already-auditioned relative dynamics for b08--b10.
    audited = {
        (8, 0): -30.0,
        (9, 0): -28.0,
        (9, 1): -29.0,
        (10, 0): -29.0,
        (10, 1): -30.0,
        (10, 2): -29.0,
    }
    return audited.get((bar, event_index), -29.0)


def _event_id(bar: int, event_index: int, articulation: str) -> str:
    return f"b{bar:02d}_e{event_index}_{articulation}"


def _expression_policy(
    *,
    contextual_yoseong: bool,
    selected_ids: dict[str, str],
    reference_shape_unreviewed: bool = False,
    reference_shape_depth_matched_unreviewed: bool = False,
    reference_shape_depth_matched_long_fade_unreviewed: bool = False,
) -> dict[str, Any]:
    active: dict[str, Any] | None = None
    if contextual_yoseong:
        active = {
            "status": "explicit_rnd_audition_opt_in",
            "selected_by": "full_score_audition_plan_author_not_automatic_policy",
            "selected_event_ids": list(selected_ids),
            "source_policy_rule_ids_by_event": selected_ids,
            "reason": (
                "retain only the provisional b08 rule-based audition while b16 uses a separately pinned unreviewed automatic F0-proxy contour"
                if (
                    reference_shape_unreviewed
                    or reference_shape_depth_matched_unreviewed
                    or reference_shape_depth_matched_long_fade_unreviewed
                )
                else "compare the reviewed local-before-rest and provisional global-cadence late-gentle candidates in one full-score rendering"
            ),
            "evidence_boundary": (
                "provisional_b08_parameter_audition_separate_from_unreviewed_b16_reference_and_not_an_authenticity_claim"
                if (
                    reference_shape_unreviewed
                    or reference_shape_depth_matched_unreviewed
                    or reference_shape_depth_matched_long_fade_unreviewed
                )
                else "provisional_parameter_audition_not_a_claim_about_authentic_bonjo_arirang_performance"
            ),
        }
    return {
        "schema": "mini.score-expression.gyeonggi-minyo-policy.v1",
        "id": "gyeonggi-minyo-ari-vibrato-v1",
        "automatic_activation": False,
        "default_decision": "off",
        "seconds_per_beat": BEAT_SECONDS,
        "meter_beats": 3,
        "evidence_status": "literature_informed_but_provisional_requires_daegeum_reference_validation",
        "score_evidence_boundary": "authorial_western_pitch_grid_skeleton_not_authentic_transcription",
        "active_selection_provenance": active,
    }


def build_plan(
    *,
    contextual_yoseong: bool,
    reference_shape_unreviewed: bool = False,
    reference_shape_depth_matched_unreviewed: bool = False,
    reference_shape_depth_matched_long_fade_unreviewed: bool = False,
) -> dict[str, Any]:
    reference_variant_count = sum(
        (
            reference_shape_unreviewed,
            reference_shape_depth_matched_unreviewed,
            reference_shape_depth_matched_long_fade_unreviewed,
        )
    )
    if reference_variant_count > 1:
        raise ValueError("only one b16 reference-shape variant may be selected")
    if reference_variant_count and not contextual_yoseong:
        raise ValueError("B2-R keeps B1's b08 selection and therefore requires contextual_yoseong")
    events: list[dict[str, Any]] = []
    previous_degree: int | None = None
    candidate_ids: dict[str, str] = {}

    for bar, notes in enumerate(ARIRANG, start=1):
        bar_start_beats = (bar - 1) * BAR_BEATS
        for event_index, (position_beats, notated_duration_beats, degree) in enumerate(notes):
            articulation = _articulation(bar, event_index)
            performed_duration_beats = notated_duration_beats
            timing_interpretation = "as_notated"
            # A fresh breath at b05/b13 must not begin on the full-level tail
            # of the previous phrase.  Steal exactly 72 ms from the final
            # half-beat note; this is performed phrasing, not a written rest.
            if (bar, event_index) in ((4, 3), (12, 3)):
                performed_duration_beats -= PERFORMED_BREATH_GAP_BEATS
                timing_interpretation = "authorial_breath_gap_time_stolen_from_note_end"

            start_beats = bar_start_beats + position_beats
            start_seconds = _rounded(start_beats * BEAT_SECONDS)
            end_seconds = _rounded((start_beats + performed_duration_beats) * BEAT_SECONDS)
            ident = _event_id(bar, event_index, articulation)
            approach = _approach(
                bar=bar,
                event_index=event_index,
                articulation=articulation,
                degree=degree,
                previous_degree=previous_degree,
            )
            phrase_role = _phrase_role(
                bar=bar,
                event_index=event_index,
                duration_beats=performed_duration_beats,
                approach=approach,
            )
            followed_by_rest = bar == 8
            global_cadence = bar == 16

            if bar == 8:
                rule = LOCAL_CANDIDATE_RULE
                candidate = _candidate_parameters(global_cadence=False)
            elif bar == 16:
                rule = GLOBAL_CANDIDATE_RULE
                candidate = _candidate_parameters(global_cadence=True)
            elif bar == 10 and event_index == 2:
                rule = SHORT_TAIL_RULE
                candidate = None
            else:
                rule = DEFAULT_RULE
                candidate = None

            is_reference = bool(reference_variant_count) and bar == 16
            is_selected = contextual_yoseong and candidate is not None and not is_reference
            vibrato: dict[str, Any]
            if is_selected:
                vibrato = {"enabled": True, **{key: value for key, value in candidate.items() if key != "parameter_status"}}
                candidate_ids[ident] = rule
            else:
                vibrato = {"enabled": False}

            if is_reference:
                reference_status = (
                    compiler.REFERENCE_CONTOUR_LONG_FADE_STATUS
                    if reference_shape_depth_matched_long_fade_unreviewed
                    else (
                        compiler.REFERENCE_CONTOUR_DEPTH_MATCHED_STATUS
                        if reference_shape_depth_matched_unreviewed
                        else compiler.REFERENCE_CONTOUR_STATUS
                    )
                )
                vibrato_policy = {
                    "decision": reference_status,
                    "style": reference_status,
                    "policy_rule_id": rule,
                    "end_behavior": "depth_fade_to_zero",
                    "evidence_boundary": (
                        compiler.REFERENCE_CONTOUR_LONG_FADE_EVIDENCE_BOUNDARY
                        if reference_shape_depth_matched_long_fade_unreviewed
                        else (
                            compiler.REFERENCE_CONTOUR_DEPTH_MATCHED_EVIDENCE_BOUNDARY
                            if reference_shape_depth_matched_unreviewed
                            else compiler.REFERENCE_CONTOUR_EVIDENCE_BOUNDARY
                        )
                    ),
                }
            elif candidate is not None:
                vibrato_policy: dict[str, Any] = {
                    "decision": "selected" if is_selected else "candidate_off",
                    "style": "late_gentle_yoseong" if is_selected else "late_gentle_yoseong_candidate",
                    "policy_rule_id": rule,
                    "end_behavior": "depth_fade_to_zero",
                    "candidate_parameters": candidate,
                }
                if is_selected:
                    vibrato_policy.update(
                        {
                            "parameter_status": candidate["parameter_status"],
                            "evidence_boundary": "provisional_audition_selection_not_a_bonjo_or_gyeonggi_universal_rule",
                        }
                    )
            else:
                vibrato_policy = {
                    "decision": "off",
                    "style": "straight",
                    "policy_rule_id": rule,
                    "end_behavior": "none",
                }

            event: dict[str, Any] = {
                "id": ident,
                "score_location": f"b{bar:02d}_e{event_index}",
                "start_seconds": start_seconds,
                "end_seconds": end_seconds,
                "pitch_hz": _pitch_hz(degree),
                "articulation": articulation,
                "steady_loudness_db": _steady_loudness(bar, event_index),
                "musical_context": {
                    "genre": "gyeonggi_minyo_derived_game_arrangement",
                    "style": "bonjo_arirang_authorial_score_skeleton",
                    "tori": "gyeong_tori_reference_not_transcription",
                    "mode": "anhemitonic_pentatonic_do_re_mi_sol_la_skeleton",
                    "phrase_role": phrase_role,
                    "modal_degree": DEGREE_NAMES[degree],
                    "duration_beats": _rounded(performed_duration_beats),
                    "notated_duration_beats": notated_duration_beats,
                    "timing_interpretation": timing_interpretation,
                    "metric_beat": position_beats + 1.0,
                    "approach": approach,
                    "followed_by_rest": followed_by_rest,
                    "global_cadence": global_cadence,
                },
                "vibrato": vibrato,
                "vibrato_policy": vibrato_policy,
            }
            if is_reference:
                event["reference_contour"] = compiler.pinned_reference_contour_contract(
                    depth_matched=(
                        reference_shape_depth_matched_unreviewed
                        or reference_shape_depth_matched_long_fade_unreviewed
                    ),
                    long_fade=reference_shape_depth_matched_long_fade_unreviewed,
                )
            if articulation == "slur":
                event["slur_from_previous"] = True
            events.append(event)
            previous_degree = degree

    score_end_seconds = _rounded(len(ARIRANG) * BAR_BEATS * BEAT_SECONDS)
    events.append(
        {
            "id": "b16_final_release",
            "score_location": "b16_after_e0",
            "start_seconds": score_end_seconds,
            "end_seconds": _rounded(score_end_seconds + RELEASE_SECONDS),
            "articulation": "release",
            "vibrato_policy": {
                "decision": "off",
                "style": "straight",
                "policy_rule_id": RELEASE_RULE,
                "end_behavior": "none",
            },
        }
    )

    return {
        "schema": "mini.score-expression.plan.v1",
        "r_and_d_scope": {
            "r_and_d_only": True,
            "no_default_assets": True,
            "no_runtime_bgm": True,
            "no_game_output": True,
            "no_public_release": True,
        },
        "instrument": {"id": "daegeum", "sustained": True},
        "plan_role": (
            "full_16bar_authorial_game_arrangement_b2rdf_reference_shape_depth_matched_long_fade_unreviewed_rnd_only"
            if reference_shape_depth_matched_long_fade_unreviewed
            else (
                "full_16bar_authorial_game_arrangement_b2rd_reference_shape_depth_matched_unreviewed_rnd_only"
                if reference_shape_depth_matched_unreviewed
                else (
                    "full_16bar_authorial_game_arrangement_b2_reference_shape_unreviewed_rnd_only"
                    if reference_shape_unreviewed
                    else (
                        "full_16bar_authorial_game_arrangement_b1_contextual_yoseong_rnd_only"
                        if contextual_yoseong
                        else "full_16bar_authorial_game_arrangement_b0_all_straight_rnd_only"
                    )
                )
            )
        ),
        "authorial_score_reference": {
            "module_relative_path": "public/assets/audio/bgm/arirang.py",
            "controlled_score": "16-bar browser Ari pitch/duration grid at do=70, beat=0.72 seconds",
            "evidence_boundary": "game_arrangement_authorship_not_authentic_bonjo_arirang_or_daegeum_transcription",
            "articulation_authorship": "explicit R&D performance plan; not inferred from touching timestamps",
            "breath_phrase_heads_one_based": [1, 5, 9, 13],
        },
        "score_timing": {
            "meter_beats": 3,
            "bar_count": 16,
            "note_event_count": 59,
            "notated_score_duration_seconds": score_end_seconds,
            "final_release_seconds": RELEASE_SECONDS,
            "render_control_duration_seconds": _rounded(score_end_seconds + RELEASE_SECONDS),
        },
        "score_rest_intervals_seconds": [
            {
                "start_seconds": 16.56,
                "end_seconds": 17.28,
                "duration_seconds": 0.72,
                "score_location": "b08_beat3",
                "notation_has_rest": True,
                "reason": "written one-beat b08 rest before b09 breath_start",
            }
        ],
        "performed_breath_gaps_seconds": [
            {
                "start_seconds": 8.568,
                "end_seconds": 8.64,
                "duration_seconds": PERFORMED_BREATH_GAP_SECONDS,
                "between": ["b04_e3_slur", "b05_e0_breath_start"],
                "notation_has_rest": False,
                "timing_source": "72ms stolen from the end of the notated b04_e3 half-beat note",
            },
            {
                "start_seconds": 25.848,
                "end_seconds": 25.92,
                "duration_seconds": PERFORMED_BREATH_GAP_SECONDS,
                "between": ["b12_e3_slur", "b13_e0_breath_start"],
                "notation_has_rest": False,
                "timing_source": "72ms stolen from the end of the notated b12_e3 half-beat note",
            },
        ],
        "control_hz": 100,
        "expression_policy": _expression_policy(
            contextual_yoseong=contextual_yoseong,
            selected_ids=candidate_ids,
            reference_shape_unreviewed=reference_shape_unreviewed,
            reference_shape_depth_matched_unreviewed=reference_shape_depth_matched_unreviewed,
            reference_shape_depth_matched_long_fade_unreviewed=(
                reference_shape_depth_matched_long_fade_unreviewed
            ),
        ),
        "events": events,
    }


def build_plans() -> dict[str, dict[str, Any]]:
    return {
        B0_FILENAME: build_plan(contextual_yoseong=False),
        B1_FILENAME: build_plan(contextual_yoseong=True),
        B2_REFERENCE_FILENAME: build_plan(
            contextual_yoseong=True,
            reference_shape_unreviewed=True,
        ),
        B2_DEPTH_MATCHED_FILENAME: build_plan(
            contextual_yoseong=True,
            reference_shape_depth_matched_unreviewed=True,
        ),
        B2_DEPTH_MATCHED_LONG_FADE_FILENAME: build_plan(
            contextual_yoseong=True,
            reference_shape_depth_matched_long_fade_unreviewed=True,
        ),
    }


def _serialized(plan: dict[str, Any]) -> str:
    return json.dumps(plan, ensure_ascii=False, indent=2) + "\n"


def write_plans(output_directory: Path, *, check: bool) -> None:
    output_directory = output_directory.resolve()
    for filename, plan in build_plans().items():
        destination = output_directory / filename
        rendered = _serialized(plan)
        if check:
            if not destination.is_file() or destination.read_text(encoding="utf-8") != rendered:
                raise SystemExit(f"tracked plan is stale: {destination}")
        else:
            output_directory.mkdir(parents=True, exist_ok=True)
            destination.write_text(rendered, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=PLAN_DIRECTORY)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    write_plans(args.output_dir, check=args.check)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
