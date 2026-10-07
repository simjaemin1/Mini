#!/usr/bin/env python3
"""Compile the authored 8-bar variation into the existing R&D expression plan.

Only the score JSON in this directory is input. This script never reads or
changes National Gugak Center recordings or game BGM. The generated plan is
still an unreviewed score prescription, not a performance transcription.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


HERE = Path(__file__).resolve().parent
SCORE_PATH = HERE / "new_ari_8bar_r1.json"
PLAN_PATH = HERE / "new_ari_8bar_expression_b0_r1.json"
PITCH_MIDI = {"G4": 67, "A4": 69, "C5": 72, "D5": 74, "E5": 76}
DEGREE = {"G4": "lower_sol", "A4": "lower_la", "C5": "do", "D5": "re", "E5": "mi"}
SCOPE = {
    "r_and_d_only": True,
    "no_default_assets": True,
    "no_runtime_bgm": True,
    "no_game_output": True,
    "no_public_release": True,
}

# The eight source-skeleton bars are transcribed from the existing authorial
# arirang.py grid solely for an identity audit. It is NOT an authentic NGC
# performance transcription. Notes here use G4/A4/C5/D5/E5 under do=C5.
SOURCE_SKELETON = [
    [(0, 1.5, "G4"), (1.5, .5, "A4"), (2, .5, "G4"), (2.5, .5, "A4")],
    [(0, 1.5, "C5"), (1.5, .5, "D5"), (2, .5, "C5"), (2.5, .5, "D5")],
    [(0, 1, "E5"), (1, .5, "D5"), (1.5, .5, "E5"), (2, .5, "C5"), (2.5, .5, "A4")],
    [(0, 1.5, "G4"), (1.5, .5, "A4"), (2, .5, "G4"), (2.5, .5, "A4")],
    [(0, 1.5, "C5"), (1.5, .5, "D5"), (2, .5, "C5"), (2.5, .5, "D5")],
    [(0, .5, "E5"), (.5, .5, "D5"), (1, .5, "C5"), (1.5, .5, "A4"), (2, .5, "G4"), (2.5, .5, "A4")],
    [(0, 1.5, "C5"), (1.5, .5, "D5"), (2, 1, "C5")],
    [(0, 2, "C5")],
]


def stamp(sobak_index: int, sobak_seconds: float) -> float:
    # Every semachi sobak is exactly 12,800 samples at 48 kHz. Keep the
    # division's full float precision: six-decimal rounding moves a slur
    # boundary off the audio sample grid used by the preview validator.
    return sobak_index * sobak_seconds


def onset_description(articulation: str, prior_midi: int | None, midi: int) -> str:
    if articulation == "breath_start":
        return "breath_start"
    if prior_midi is None:
        return "authored_reattack"
    diff = midi - prior_midi
    if diff == 0:
        return "same_pitch_rearticulation" if articulation == "rearticulate" else "same_pitch_slur"
    if diff > 0:
        return "ascending_skip" if diff >= 5 else "ascending_step"
    return "descending_skip" if diff <= -5 else "descending_step"


def make_plan(score: dict) -> dict:
    if score.get("schema") != "mini.bgm-gpt.original-variation.v1":
        raise ValueError("unexpected score schema")
    if (score.get("bar_count"), score.get("beats_per_bar"), score.get("sobak_per_beat")) != (8, 3, 3):
        raise ValueError("expected exactly eight 3-beat semachi bars")
    if not math.isclose(float(score["sobak_seconds"]) * 72, 19.2, abs_tol=1e-9):
        raise ValueError("8-bar duration must be 19.2 seconds")
    if set(score["scale_pitch_classes"]) != {"C", "D", "E", "G", "A"}:
        raise ValueError("unexpected scale")
    bars = score["bars"]
    if len(bars) != 8:
        raise ValueError("eight bars required")

    events: list[dict] = []
    rests: list[dict] = []
    note_bars: list[list[tuple[float, float, str]]] = []
    prior_midi: int | None = None
    total_notes = 0
    for bar_index, bar in enumerate(bars):
        if bar.get("bar") != bar_index + 1:
            raise ValueError("bar numbering mismatch")
        expected_tick = 0
        bar_notes = []
        note_index = 0
        for entry in bar["events"]:
            onset = entry["onset_sobak"]
            duration = entry["duration_sobak"]
            if type(onset) is not int or type(duration) is not int or onset != expected_tick or duration < 1:
                raise ValueError(f"bar {bar_index + 1} is not a contiguous integer-sobak score")
            expected_tick = onset + duration
            if expected_tick > 9:
                raise ValueError(f"bar {bar_index + 1} exceeds nine sobak")
            abs_start = bar_index * 9 + onset
            abs_end = abs_start + duration
            start = stamp(abs_start, score["sobak_seconds"])
            end = stamp(abs_end, score["sobak_seconds"])
            if entry.get("rest") is True:
                if not events or events[-1]["articulation"] == "release":
                    raise ValueError("rest must follow a sounding note")
                rest_event = {
                    "id": f"b{bar_index + 1:02d}_release",
                    "score_location": f"b{bar_index + 1:02d}_rest_sobak{onset}",
                    "start_seconds": start,
                    "end_seconds": end,
                    "articulation": "release",
                    "vibrato": {"enabled": False},
                    "vibrato_policy": {
                        "decision": "off", "style": "straight",
                        "policy_rule_id": "gyeonggi_ari.v1.release_no_vibrato",
                        "end_behavior": "none",
                    },
                }
                events.append(rest_event)
                rests.append({
                    "start_seconds": start,
                    "end_seconds": end,
                    "duration_seconds": round(end - start, 6),
                    "score_location": rest_event["score_location"],
                    "notation_has_rest": True,
                    "reason": entry["reason"],
                })
                continue

            pitch = entry["pitch"]
            if pitch not in PITCH_MIDI:
                raise ValueError(f"pitch outside authored C pentatonic vocabulary: {pitch}")
            midi = PITCH_MIDI[pitch]
            kind = entry["articulation"]
            if kind not in ("breath_start", "rearticulate", "slur"):
                raise ValueError(f"unknown articulation: {kind}")
            if kind == "slur" and (not events or events[-1]["articulation"] == "release" or events[-1]["end_seconds"] != start):
                raise ValueError("slur must touch its explicit previous note")
            if kind == "breath_start" and events and events[-1]["articulation"] != "release":
                raise ValueError("breath_start requires a written rest")
            if kind != "breath_start" and events and events[-1]["articulation"] == "release":
                raise ValueError("the note after a written rest must breathe")
            following = bar["events"]
            next_index = following.index(entry) + 1
            followed_by_rest = next_index < len(following) and following[next_index].get("rest") is True
            is_final_cadence = bar_index == 7 and note_index == 0
            approach = onset_description(kind, prior_midi, midi)
            phrase_role = "phrase_continuation"
            if kind == "breath_start":
                phrase_role = "phrase_head"
            elif is_final_cadence:
                phrase_role = "local_phrase_cadence_before_rest"
                approach = "phrase_arrival"
            elif bar_index == 3 and followed_by_rest:
                phrase_role = "half_cadence_G"
            elif bar_index in (2, 4) and pitch == "E5":
                phrase_role = "local_peak"

            context = {
                "genre": "gyeonggi_minyo_inspired_original_game_score",
                "style": "arirang_seed_authorial_variation_not_transcription",
                "tori": "gyeong_tori_inspiration_not_verified",
                "mode": "C_anhemitonic_pentatonic",
                "phrase_role": phrase_role,
                "modal_degree": DEGREE[pitch],
                "duration_beats": round(duration / 3, 6),
                "notated_duration_beats": round(duration / 3, 6),
                "timing_interpretation": "as_notated",
                "metric_beat": round(1 + onset / 3, 6),
                "approach": approach,
                "followed_by_rest": bool(followed_by_rest),
                "global_cadence": False,
            }
            if is_final_cadence:
                policy = {
                    "decision": "candidate_off",
                    "style": "late_gentle_yoseong_candidate",
                    "policy_rule_id": "gyeonggi_ari.v1.sustained_before_rest_late_yoseong_candidate",
                    "end_behavior": "depth_fade_to_zero",
                    "candidate_parameters": {
                        "rate_hz": 3.45,
                        "depth_cents": 18.0,
                        "onset_seconds": 0.8,
                        "ramp_seconds": 0.18,
                        "end_fade_seconds": 0.24,
                        "parameter_status": "provisional_authorial_audition_not_source_measured",
                    },
                }
            else:
                policy = {
                    "decision": "off",
                    "style": "straight",
                    "policy_rule_id": "gyeonggi_ari.v1.default_straight",
                    "end_behavior": "none",
                }
            event = {
                "id": f"b{bar_index + 1:02d}_e{note_index}_{kind}",
                "score_location": f"b{bar_index + 1:02d}_sobak{onset}",
                "score_onset_sobak_absolute": abs_start,
                "score_duration_sobak": duration,
                "start_seconds": start,
                "end_seconds": end,
                "pitch_name": pitch,
                "pitch_midi": midi,
                "pitch_hz": round(440 * 2 ** ((midi - 69) / 12), 6),
                "articulation": kind,
                "steady_loudness_db": -29.0,
                "musical_context": context,
                "vibrato": {"enabled": False},
                "vibrato_policy": policy,
            }
            if kind == "slur":
                event["slur_from_previous"] = True
            events.append(event)
            bar_notes.append((onset / 3, duration / 3, pitch))
            note_index += 1
            total_notes += 1
            prior_midi = midi
        if expected_tick != 9:
            raise ValueError(f"bar {bar_index + 1} does not fill its nine sobak")
        note_bars.append(bar_notes)

    source_signatures = {tuple(bar) for bar in SOURCE_SKELETON}
    exact_source_bar_matches = [index + 1 for index, bar in enumerate(note_bars) if tuple(bar) in source_signatures]
    if exact_source_bar_matches:
        raise ValueError(f"authored bars duplicate a source-skeleton bar: {exact_source_bar_matches}")
    if total_notes != 28 or events[-1]["end_seconds"] != 19.2:
        raise ValueError("unexpected note count or duration")

    return {
        "schema": "mini.score-expression.plan.v1",
        "r_and_d_scope": SCOPE,
        "instrument": {"id": "daegeum", "sustained": True},
        # 300 Hz puts all integer sobak boundaries on control frames as well
        # as the 48 kHz sample grid (80 controls / sobak).
        "control_hz": 300,
        "plan_role": "original_8bar_arirang_seed_variation_b0_all_straight_unreviewed_rnd_only",
        "authorial_score_reference": {
            "source": SCORE_PATH.name,
            "seed_motif": "Arirang opening G4 to A4 neighboring rise, expanded to G4-A4-C5-A4",
            "evidence_boundary": "new_authorial_C_pentatonic_skeleton_not_authentic_ari_or_NGC_performance_transcription",
            "source_skeleton_comparison": "_bgm/code/코드백업_최신/arirang.py first 8 bars at do=C5; it is an older authorial Western-grid encoding, not NGC ground truth",
            "exact_source_bar_matches": exact_source_bar_matches,
        },
        "score_timing": {
            "meter_beats": 3,
            "sobak_per_beat": 3,
            "seconds_per_beat": 0.8,
            "bar_count": 8,
            "note_event_count": total_notes,
            "notated_score_duration_seconds": 19.2,
            "render_control_duration_seconds": 19.2,
        },
        "score_rest_intervals_seconds": rests,
        "expression_policy": {
            "schema": "mini.score-expression.gyeonggi-minyo-policy.v1",
            "id": "gyeonggi-minyo-ari-vibrato-v1",
            "automatic_activation": False,
            "default_decision": "off",
            "seconds_per_beat": 0.8,
            "meter_beats": 3,
            "evidence_status": "literature_informed_but_provisional_requires_daegeum_reference_validation",
            "score_evidence_boundary": "original_authorial_pitch_grid_not_authentic_transcription",
            "active_selection_provenance": None,
        },
        "events": events,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare generated plan against the saved artifact")
    args = parser.parse_args()
    score = json.loads(SCORE_PATH.read_text(encoding="utf-8"))
    plan = make_plan(score)
    content = json.dumps(plan, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if PLAN_PATH.read_text(encoding="utf-8") != content:
            raise SystemExit("generated expression plan differs from saved artifact")
    else:
        PLAN_PATH.write_text(content, encoding="utf-8")
    print(f"PASS: {plan['score_timing']['note_event_count']} notes, {len(plan['score_rest_intervals_seconds'])} written rests, 19.2 s, no identical source-skeleton bar")


if __name__ == "__main__":
    main()
