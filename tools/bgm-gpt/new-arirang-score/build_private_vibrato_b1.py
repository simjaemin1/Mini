#!/usr/bin/env python3
"""Select one already-authored, disabled vibrato candidate for a private A/B.

This never edits the straight B0 plan, the score, or the published decoder.
The only pitched-event change in B1 is the final 8th-bar C5's vibrato and
the corresponding explicit selection metadata. No parameters are invented by
this builder: they are copied from that event's disabled candidate.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "new_ari_8bar_ddsp_gugak_legacy100_r1.json"
TARGET = HERE / "new_ari_8bar_ddsp_gugak_legacy100_b1_final_c_vibrato_r1.json"
PINNED_SOURCE_SHA256 = "a06eea18b06d5af458afb87184899b498d25ba564eaf5a4ad3412cb9084b7458"
EVENT_ID = "b08_e0_rearticulate"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build() -> dict:
    if sha256(SOURCE) != PINNED_SOURCE_SHA256:
        raise ValueError("straight B0 compatibility plan changed")
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    if source["score_timing"]["notated_score_duration_seconds"] != 19.2:
        raise ValueError("unexpected score duration")
    output = copy.deepcopy(source)
    selected = [event for event in output["events"] if event["id"] == EVENT_ID]
    if len(selected) != 1:
        raise ValueError("expected one final C5 event")
    event = selected[0]
    if (event["pitch_name"], event["articulation"], event["vibrato"]) != (
        "C5", "rearticulate", {"enabled": False}
    ):
        raise ValueError("final C5 is not the disabled B0 candidate")
    policy = event["vibrato_policy"]
    if policy["decision"] != "candidate_off":
        raise ValueError("B0 vibrato candidate was already selected")
    candidate = policy["candidate_parameters"]
    expected = {
        "rate_hz": 3.45,
        "depth_cents": 18.0,
        "onset_seconds": 0.8,
        "ramp_seconds": 0.18,
        "end_fade_seconds": 0.24,
        "parameter_status": "provisional_authorial_audition_not_source_measured",
    }
    if candidate != expected:
        raise ValueError("the authored candidate parameters changed")
    event["vibrato"] = {"enabled": True, **{key: candidate[key] for key in (
        "rate_hz", "depth_cents", "onset_seconds", "ramp_seconds", "end_fade_seconds"
    )}}
    policy.update({
        "decision": "selected",
        "style": "late_gentle_yoseong",
        "parameter_status": candidate["parameter_status"],
        "evidence_boundary": "provisional_single_event_listening_test_not_a_claim_of_authentic_daegeum_performance",
    })
    output["expression_policy"]["active_selection_provenance"] = {
        "status": "explicit_private_rnd_audition_opt_in",
        "selected_by": "B1_single_event_A_B_plan_author_not_automatic_policy",
        "selected_event_ids": [EVENT_ID],
        "source_policy_rule_id": policy["policy_rule_id"],
        "reason": "user heard the straight 8-bar model render and requested a musical vibrato comparison",
        "evidence_boundary": "provisional_authorial_parameters_not_measured_from_this_performance_or_learned_by_this_model",
    }
    output["plan_role"] = "original_8bar_private_rnd_b1_final_C5_only_late_vibrato"
    output["runtime_compatibility_conversion"]["pitched_note_time_pitch_articulation_level_and_active_vibrato_changed"] = True
    output["runtime_compatibility_conversion"]["b1_note"] = (
        "Relative to B0, only b08_e0_rearticulate vibrato is activated; all "
        "pitched note times, nominal pitches, articulations, levels and rests are unchanged."
    )
    output["private_b1_audition"] = {
        "status": "unreviewed_private_rnd_only",
        "b0_compat_plan_sha256": PINNED_SOURCE_SHA256,
        "selected_event_id": EVENT_ID,
        "selection": "copy_of_existing_disabled_score_candidate",
        "no_training": True,
        "no_game_or_public_release": True,
        "published_checkpoint_rights_cleared_for_game": False,
    }
    source_by_id = {event["id"]: event for event in source["events"]}
    for candidate_event in output["events"]:
        if candidate_event["id"] != EVENT_ID and candidate_event != source_by_id[candidate_event["id"]]:
            raise ValueError(f"nonselected event changed: {candidate_event['id']}")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="check an existing saved B1 plan")
    args = parser.parse_args()
    encoded = json.dumps(build(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if TARGET.read_text(encoding="utf-8") != encoded:
            raise SystemExit("B1 plan differs from the pinned one-event conversion")
    else:
        TARGET.write_text(encoded, encoding="utf-8")
    print(f"PASS: B1 changes only {EVENT_ID}'s selected provisional vibrato")


if __name__ == "__main__":
    main()
