#!/usr/bin/env python3
"""Make a narrow R&D-only compatibility copy for the pinned DDSP-Gugak runtime.

The authoritative score and 300 Hz score-expression plan stay untouched.
Legacy input metadata changes: authorial 100 Hz declaration (the model itself
is 250 Hz) and the `release` events' disabled-vibrato key, which the published
checkpoint runner refuses. Its safety gate additionally requires real silence
after each release before the next breath. Therefore the first and third
written rests use a 120 ms release; the wider middle rest uses 180 ms.
The remaining written-rest time is actual silence. All pitched
note times, pitches, articulations, and levels remain exactly unchanged.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "new_ari_8bar_expression_b0_r1.json"
TARGET = HERE / "new_ari_8bar_ddsp_gugak_legacy100_r1.json"
RELEASE_TAIL_SECONDS = (0.120, 0.180, 0.120)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def convert(plan: dict, input_hash: str) -> dict:
    if plan.get("schema") != "mini.score-expression.plan.v1":
        raise ValueError("unexpected input schema")
    if plan.get("control_hz") != 300:
        raise ValueError("authoritative plan is not at expected 300 Hz")
    if plan.get("score_timing", {}).get("notated_score_duration_seconds") != 19.2:
        raise ValueError("unexpected score duration")
    if plan.get("score_timing", {}).get("note_event_count") != 28:
        raise ValueError("unexpected note count")
    if plan.get("expression_policy", {}).get("active_selection_provenance") is not None:
        raise ValueError("active expression selection is not allowed in first-pass render")
    if any(event.get("vibrato") != {"enabled": False} for event in plan["events"]):
        raise ValueError("first-pass plan must have all vibrato disabled")
    if any(event.get("reference_contour") is not None for event in plan["events"]):
        raise ValueError("first-pass plan must not have a reference contour")

    output = json.loads(json.dumps(plan, ensure_ascii=False))
    output["control_hz"] = 100
    output["plan_role"] = "original_8bar_arirang_seed_variation_legacy_ddsp_gugak_private_rnd_only"
    output["runtime_compatibility_conversion"] = {
        "source_plan_basename": SOURCE.name,
        "source_plan_sha256": input_hash,
        "reason": "pinned DDSP-Gugak runtime requires authorial plan control_hz=100, forbids a disabled-vibrato key on release events, and requires at least one silent 250Hz frame after release before each new breath; model-internal controls remain 250 Hz",
        "pitched_note_time_pitch_articulation_level_and_active_vibrato_changed": False,
        "first_three_release_tail_seconds": list(RELEASE_TAIL_SECONDS),
        "silent_gap_count": 3,
        "output_scope": "private_rnd_only_not_rights_cleared_for_game_or_public_release",
    }
    gaps = []
    releases = [event for event in output["events"] if event["articulation"] == "release"]
    if len(releases) != 4:
        raise ValueError("expected four written rests")
    for release, tail_seconds in zip(releases[:3], RELEASE_TAIL_SECONDS):
        previous_end = release["end_seconds"]
        release["end_seconds"] = release["start_seconds"] + tail_seconds
        silent_duration = previous_end - release["end_seconds"]
        if silent_duration < 0.1:
            raise ValueError("written rest does not leave enough breath silence")
        gaps.append({
            "start_seconds": release["end_seconds"],
            "end_seconds": previous_end,
            "duration_seconds": silent_duration,
            "notation_has_rest": True,
            "timing_source": "authored release occupies only the first part of the existing written rest; the remainder is true breath silence, not a validated performer label",
            "after_release_event_id": release["id"],
        })
    output["performed_breath_gaps_seconds"] = gaps
    for event in output["events"]:
        if event["articulation"] == "release":
            if event.pop("vibrato", None) != {"enabled": False}:
                raise ValueError("unexpected release vibrato state")
    return output


def assert_only_declared_changes(source: dict, output: dict) -> None:
    before = source["events"]
    after = output["events"]
    if len(before) != len(after):
        raise ValueError("event count changed")
    release_seen = 0
    for left, right in zip(before, after):
        expected = dict(left)
        if expected["articulation"] == "release":
            expected.pop("vibrato")
            if release_seen < 3:
                expected["end_seconds"] = expected["start_seconds"] + RELEASE_TAIL_SECONDS[release_seen]
            release_seen += 1
        if expected != right:
            raise ValueError(f"event payload changed beyond legacy release field: {left['id']}")
    original_without_metadata = dict(source)
    converted_without_metadata = dict(output)
    original_without_metadata.pop("control_hz")
    converted_without_metadata.pop("control_hz")
    original_without_metadata.pop("plan_role")
    converted_without_metadata.pop("plan_role")
    original_without_metadata.pop("events")
    converted_without_metadata.pop("events")
    converted_without_metadata.pop("runtime_compatibility_conversion")
    converted_without_metadata.pop("performed_breath_gaps_seconds")
    if original_without_metadata != converted_without_metadata:
        raise ValueError("non-event score metadata changed unexpectedly")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="check saved compatibility copy")
    args = parser.parse_args()
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    output = convert(source, sha256(SOURCE))
    assert_only_declared_changes(source, output)
    encoded = json.dumps(output, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if TARGET.read_text(encoding="utf-8") != encoded:
            raise SystemExit("compatibility copy does not match authoritative plan")
    else:
        TARGET.write_text(encoded, encoding="utf-8")
    print("PASS: 28 pitched notes unchanged; first 3 rests have 120/180/120 ms releases and actual breath silence")


if __name__ == "__main__":
    main()
