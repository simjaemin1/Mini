#!/usr/bin/env python3
"""Compile an explicit score/articulation plan into continuous R&D controls.

This is the expression layer between a symbolic score and a future sustained-
instrument renderer.  It deliberately writes controls only: it neither reads
audio nor trains a model nor renders a game asset.  The four articulation
states are authorial input, never inferred from adjacent timestamps:

``BREATH_START`` / ``REARTICULATE`` / ``SLUR`` / ``RELEASE``.

In particular, an event can be a slur only when its plan explicitly says so
*and* names ``slur_from_previous: true``.  A mere touching note boundary is a
validation error rather than an invented legato decision.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any, Mapping, Sequence

import numpy


PLAN_SCHEMA = "mini.score-expression.plan.v1"
OUTPUT_SCHEMA = "mini.score-expression.controls.v1"
MANIFEST_SCHEMA = "mini.score-expression.render-manifest.v2"
EXPRESSION_POLICY_SCHEMA = "mini.score-expression.gyeonggi-minyo-policy.v1"
EXPRESSION_POLICY_ID = "gyeonggi-minyo-ari-vibrato-v1"
CONTROL_FILENAME = "score_expression_controls.npz"
MANIFEST_FILENAME = "score_expression_manifest.json"
SAMPLE_RATE_HZ = 48_000
ARTICULATIONS = ("breath_start", "rearticulate", "slur", "release")
STATE_CODES = {name: index for index, name in enumerate(ARTICULATIONS, start=1)}
VIBRATO_RATE_RANGE_HZ = (3.3, 3.8)
VIBRATO_DEPTH_RANGE_CENTS = (12.0, 45.0)
SLUR_TRANSITION_MILLISECONDS = 12
SLUR_TRANSITION_CANDIDATE_MILLISECONDS = (8, 12, 20)
SLUR_TRANSITION_SECONDS = SLUR_TRANSITION_MILLISECONDS / 1_000.0
SLUR_TRANSITION_SHAPE = "minimum_jerk_log_frequency_cents"
SLUR_TARGET_ATTACH_SECONDS = 0.050
SLUR_MAX_INTERMEDIATE_DWELL_SECONDS = 0.020
SLUR_LOUDNESS_TRANSITION_SECONDS = 0.080
SLUR_LOUDNESS_TARGET_SETTLE_SECONDS = 0.100
SLUR_LOUDNESS_TRANSITION_SHAPE = "minimum_jerk_linear_loudness"
SLUR_BOUNDARY_F0_SCHEMA = "mini.score-expression.slur-boundary-f0.v1"

# This policy is deliberately conservative.  The musical literature supports
# conditioning yoseong/nonghyeon on genre, melodic function, phrase position,
# duration, and performer interpretation; it does not justify a pitch-only
# always-on LFO.  V1 therefore emits one reviewable candidate and otherwise
# stays straight.  Candidate parameters remain disabled until an author opts
# in using a separately reviewed audition plan.
POLICY_RULE_SUSTAINED_CANDIDATE = "gyeonggi_ari.v1.sustained_before_rest_late_yoseong_candidate"
POLICY_RULE_GLOBAL_CADENCE_CANDIDATE = "gyeonggi_ari.v1.global_cadence_late_yoseong_candidate"
POLICY_RULE_SHORT_LOCAL_TAIL_OFF = "gyeonggi_ari.v1.short_local_tail_no_full_yoseong"
POLICY_RULE_DEFAULT_OFF = "gyeonggi_ari.v1.default_straight"
POLICY_RULE_RELEASE_OFF = "gyeonggi_ari.v1.release_no_vibrato"
VIBRATO_POLICY_DECISIONS = (
    "off",
    "candidate_off",
    "selected",
    "reference_shape_unreviewed",
)
VIBRATO_POLICY_STYLES = (
    "straight",
    "late_gentle_yoseong_candidate",
    "late_gentle_yoseong",
    "reference_shape_unreviewed",
)
VIBRATO_END_BEHAVIORS = ("none", "depth_fade_to_zero")
REFERENCE_CONTOUR_STATUS = "reference_shape_unreviewed"
REFERENCE_CONTOUR_DECISION = REFERENCE_CONTOUR_STATUS
REFERENCE_CONTOUR_STYLE = REFERENCE_CONTOUR_STATUS
REFERENCE_CONTOUR_SOURCE_RELATIVE_PATH = (
    "tools/daegeum-vibrato-reference/reference_shape_unreviewed.ngc-20260925.json"
)
REFERENCE_CONTOUR_SOURCE_SHA256 = (
    "e584ff8c9142ed51223681d30ba5aa3236f29a7c808bcb5b40b208cb0f886bd2"
)
REFERENCE_CONTOUR_SOURCE_SCHEMA = "durango.daegeum.reference-yoseong-contour.v1"
REFERENCE_CONTOUR_CANDIDATE_ID = "ref_56a286f5764ffe3d"
REFERENCE_CONTOUR_SELECTION_STATUS = "automatic_periodic_f0_proxy_candidate_unreviewed"
REFERENCE_CONTOUR_PAYLOAD_SHA256 = (
    "3ecbf6f2e7a40118b47d28550ddbec75af9b56df3a8098550ea2d21c702eab0f"
)
REFERENCE_CONTOUR_SOURCE_ID = "src_bce31fef7cfe06b2"
REFERENCE_CONTOUR_AUDIO_SHA256 = (
    "bce31fef7cfe06b2e7559c308516ea803fececb16037810bdd23e6741ed360ea"
)
REFERENCE_CONTOUR_RIGHTS_STATUS = "unverified_local_rnd_only"
REFERENCE_CONTOUR_ONSET_SECONDS = 0.66
REFERENCE_CONTOUR_DURATION_SECONDS = 1.5
REFERENCE_CONTOUR_FADE_SECONDS = 0.12
REFERENCE_CONTOUR_FADE_SHAPE = "linear_depth"
REFERENCE_CONTOUR_EVENT_ID = "b16_e0_rearticulate"
REFERENCE_CONTOUR_EVIDENCE_BOUNDARY = (
    "automatic_periodic_f0_proxy_candidate_unreviewed_not_human_reviewed_"
    "not_gyeonggi_style_not_training_or_game"
)
REFERENCE_CONTOUR_CLAIM_LIMITS = {
    "gyeonggi_minyo_style_confirmed": False,
    "human_reviewed": False,
    "phrase_or_breath_boundary_confirmed": False,
    "whole_source_phrase_score_compatibility_confirmed": False,
    "yoseong_confirmed": False,
}


class ScoreExpressionError(RuntimeError):
    """An explicit score-expression request violates the narrow R&D contract."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _canonical_sha256(value: Any) -> str:
    """Hash one JSON value exactly as the reference extractor does."""

    payload = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _load_json(path: Path) -> Mapping[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ScoreExpressionError("plan file does not exist") from exc
    except json.JSONDecodeError as exc:
        raise ScoreExpressionError("plan file is not valid JSON") from exc
    if not isinstance(value, Mapping):
        raise ScoreExpressionError("plan must be a JSON object")
    return value


def pinned_reference_contour_contract() -> dict[str, Any]:
    """Return the only reference-contour payload accepted by this R&D compiler.

    The whole export is byte-hash pinned, then its selected normalized payload
    is independently canonical-JSON hashed.  This lets a generated plan embed
    the exact 65-point contour while making any source or plan edit fail
    closed.  The export is an automatic F0-proxy candidate, not a performance
    label, learned model output, style attribution, training item, or game
    asset.
    """

    repository_root = Path(__file__).resolve().parents[2]
    source_path = repository_root / REFERENCE_CONTOUR_SOURCE_RELATIVE_PATH
    if _sha256(source_path) != REFERENCE_CONTOUR_SOURCE_SHA256:
        raise ScoreExpressionError("pinned reference contour source artifact SHA-256 mismatch")
    artifact = _load_json(source_path)
    if artifact.get("schema") != REFERENCE_CONTOUR_SOURCE_SCHEMA:
        raise ScoreExpressionError("pinned reference contour source schema mismatch")
    if artifact.get("status") != REFERENCE_CONTOUR_STATUS:
        raise ScoreExpressionError("pinned reference contour source status mismatch")

    artifact_policy = _mapping(
        artifact.get("artifact_policy"), label="pinned reference artifact.artifact_policy"
    )
    required_false_policy = (
        "distribution_ready",
        "game_asset",
        "human_musicological_review_complete",
        "rights_cleared",
        "style_label_assigned",
        "training_item",
        "whole_phrase_score_fit_assessed",
    )
    if any(artifact_policy.get(key) is not False for key in required_false_policy):
        raise ScoreExpressionError("pinned reference contour source weakens a required false claim")
    if artifact_policy.get("offline_rnd_only") is not True:
        raise ScoreExpressionError("pinned reference contour source must remain offline R&D only")

    selection = _mapping(artifact.get("selection"), label="pinned reference artifact.selection")
    if selection.get("candidate_id") != REFERENCE_CONTOUR_CANDIDATE_ID:
        raise ScoreExpressionError("pinned reference contour candidate id mismatch")
    if selection.get("status") != REFERENCE_CONTOUR_SELECTION_STATUS:
        raise ScoreExpressionError("pinned reference contour selection status mismatch")
    if selection.get("claim_limits") != REFERENCE_CONTOUR_CLAIM_LIMITS:
        raise ScoreExpressionError("pinned reference contour claim limits mismatch")
    source = _mapping(selection.get("source"), label="pinned reference artifact.selection.source")
    if source.get("source_id") != REFERENCE_CONTOUR_SOURCE_ID:
        raise ScoreExpressionError("pinned reference contour source id mismatch")
    if source.get("source_sha256") != REFERENCE_CONTOUR_AUDIO_SHA256:
        raise ScoreExpressionError("pinned reference contour source audio SHA-256 mismatch")
    if source.get("rights_status") != REFERENCE_CONTOUR_RIGHTS_STATUS:
        raise ScoreExpressionError("pinned reference contour rights status mismatch")

    normalized = dict(
        _mapping(
            selection.get("normalized_reference_contour"),
            label="pinned reference artifact.selection.normalized_reference_contour",
        )
    )
    claimed_payload_sha256 = normalized.pop("contour_payload_sha256", None)
    if claimed_payload_sha256 != REFERENCE_CONTOUR_PAYLOAD_SHA256:
        raise ScoreExpressionError("pinned reference contour payload SHA-256 declaration mismatch")
    if _canonical_sha256(normalized) != REFERENCE_CONTOUR_PAYLOAD_SHA256:
        raise ScoreExpressionError("pinned reference contour canonical payload SHA-256 mismatch")
    normalized["contour_payload_sha256"] = claimed_payload_sha256
    if normalized.get("sample_count") != 65:
        raise ScoreExpressionError("pinned reference contour must contain exactly 65 samples")

    return {
        "status": REFERENCE_CONTOUR_STATUS,
        "onset_seconds": REFERENCE_CONTOUR_ONSET_SECONDS,
        "duration_seconds": REFERENCE_CONTOUR_DURATION_SECONDS,
        "fade_in_seconds": REFERENCE_CONTOUR_FADE_SECONDS,
        "fade_out_seconds": REFERENCE_CONTOUR_FADE_SECONDS,
        "fade_shape": REFERENCE_CONTOUR_FADE_SHAPE,
        "source_artifact": {
            "relative_path": REFERENCE_CONTOUR_SOURCE_RELATIVE_PATH,
            "sha256": REFERENCE_CONTOUR_SOURCE_SHA256,
            "schema": REFERENCE_CONTOUR_SOURCE_SCHEMA,
            "candidate_id": REFERENCE_CONTOUR_CANDIDATE_ID,
            "selection_status": REFERENCE_CONTOUR_SELECTION_STATUS,
            "contour_payload_sha256": REFERENCE_CONTOUR_PAYLOAD_SHA256,
            "source_id": REFERENCE_CONTOUR_SOURCE_ID,
            "source_sha256": REFERENCE_CONTOUR_AUDIO_SHA256,
            "rights_status": REFERENCE_CONTOUR_RIGHTS_STATUS,
        },
        "normalized_reference_contour": normalized,
        "claim_limits": dict(REFERENCE_CONTOUR_CLAIM_LIMITS),
    }


def _require_bool(value: Mapping[str, Any], key: str, *, label: str) -> None:
    if value.get(key) is not True:
        raise ScoreExpressionError(f"{label}.{key} must explicitly be true")


def _number(value: Any, *, label: str, minimum: float | None = None, maximum: float | None = None) -> float:
    if isinstance(value, bool):
        raise ScoreExpressionError(f"{label} must be a finite number")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ScoreExpressionError(f"{label} must be a finite number") from exc
    if not math.isfinite(result):
        raise ScoreExpressionError(f"{label} must be a finite number")
    if minimum is not None and result < minimum:
        raise ScoreExpressionError(f"{label} is below its allowed range")
    if maximum is not None and result > maximum:
        raise ScoreExpressionError(f"{label} is above its allowed range")
    return result


def _integer(value: Any, *, label: str, minimum: int, maximum: int) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise ScoreExpressionError(f"{label} must be an integer in [{minimum}, {maximum}]")
    return int(value)


def _mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ScoreExpressionError(f"{label} must be an object")
    return value


def _string(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ScoreExpressionError(f"{label} must be a non-empty string")
    return value


def _strict_bool(value: Any, *, label: str) -> bool:
    if type(value) is not bool:
        raise ScoreExpressionError(f"{label} must be a boolean")
    return bool(value)


def _expression_policy(raw: Any) -> dict[str, Any] | None:
    """Validate the opt-in, literature-informed Gyeonggi-minyo policy header."""

    if raw is None:
        return None
    value = _mapping(raw, label="plan.expression_policy")
    if value.get("schema") != EXPRESSION_POLICY_SCHEMA:
        raise ScoreExpressionError(f"plan.expression_policy.schema must be {EXPRESSION_POLICY_SCHEMA}")
    if value.get("id") != EXPRESSION_POLICY_ID:
        raise ScoreExpressionError(f"plan.expression_policy.id must be {EXPRESSION_POLICY_ID}")
    automatic_activation = _strict_bool(
        value.get("automatic_activation"), label="plan.expression_policy.automatic_activation"
    )
    if automatic_activation:
        raise ScoreExpressionError("Gyeonggi-minyo policy v1 forbids automatic vibrato activation")
    if value.get("default_decision") != "off":
        raise ScoreExpressionError("plan.expression_policy.default_decision must be off")
    seconds_per_beat = _number(
        value.get("seconds_per_beat"),
        label="plan.expression_policy.seconds_per_beat",
        minimum=0.05,
        maximum=10.0,
    )
    meter_beats = _integer(
        value.get("meter_beats"), label="plan.expression_policy.meter_beats", minimum=1, maximum=32
    )
    evidence_status = _string(
        value.get("evidence_status"), label="plan.expression_policy.evidence_status"
    )
    if "provisional" not in evidence_status:
        raise ScoreExpressionError("plan.expression_policy.evidence_status must explicitly say provisional")
    score_evidence_boundary = _string(
        value.get("score_evidence_boundary"),
        label="plan.expression_policy.score_evidence_boundary",
    )
    if "not_authentic_transcription" not in score_evidence_boundary:
        raise ScoreExpressionError(
            "plan.expression_policy.score_evidence_boundary must explicitly say not_authentic_transcription"
        )
    selection_raw = value.get("active_selection_provenance")
    active_selection_provenance = None
    if selection_raw is not None:
        selection = _mapping(selection_raw, label="plan.expression_policy.active_selection_provenance")
        selected_event_ids = selection.get("selected_event_ids")
        if (
            not isinstance(selected_event_ids, list)
            or not selected_event_ids
            or any(not isinstance(item, str) or not item for item in selected_event_ids)
        ):
            raise ScoreExpressionError(
                "plan.expression_policy.active_selection_provenance.selected_event_ids must be a non-empty string list"
            )
        if len(set(selected_event_ids)) != len(selected_event_ids):
            raise ScoreExpressionError(
                "plan.expression_policy.active_selection_provenance.selected_event_ids repeats an event id"
            )
        source_rule = selection.get("source_policy_rule_id")
        source_rules_by_event_raw = selection.get("source_policy_rule_ids_by_event")
        if source_rule is not None and source_rules_by_event_raw is not None:
            raise ScoreExpressionError(
                "active selection must use either source_policy_rule_id or source_policy_rule_ids_by_event"
            )
        allowed_candidate_rules = {
            POLICY_RULE_SUSTAINED_CANDIDATE,
            POLICY_RULE_GLOBAL_CADENCE_CANDIDATE,
        }
        source_rules_by_event: dict[str, str]
        if source_rules_by_event_raw is not None:
            source_rule_map = _mapping(
                source_rules_by_event_raw,
                label="plan.expression_policy.active_selection_provenance.source_policy_rule_ids_by_event",
            )
            if set(source_rule_map) != set(selected_event_ids):
                raise ScoreExpressionError(
                    "source_policy_rule_ids_by_event keys must exactly match selected_event_ids"
                )
            source_rules_by_event = {}
            for event_id, event_rule in source_rule_map.items():
                if event_rule not in allowed_candidate_rules:
                    raise ScoreExpressionError(
                        "active audition selection must originate from a candidate policy rule"
                    )
                source_rules_by_event[str(event_id)] = str(event_rule)
            normalized_source_rule: str | None = None
        else:
            if source_rule not in allowed_candidate_rules:
                raise ScoreExpressionError(
                    "active audition selection must originate from a candidate policy rule"
                )
            normalized_source_rule = str(source_rule)
            source_rules_by_event = {
                str(event_id): normalized_source_rule for event_id in selected_event_ids
            }
        active_selection_provenance = {
            "status": _string(
                selection.get("status"),
                label="plan.expression_policy.active_selection_provenance.status",
            ),
            "selected_by": _string(
                selection.get("selected_by"),
                label="plan.expression_policy.active_selection_provenance.selected_by",
            ),
            "selected_event_ids": list(selected_event_ids),
            "source_policy_rule_id": normalized_source_rule,
            "source_policy_rule_ids_by_event": source_rules_by_event,
            "reason": _string(
                selection.get("reason"),
                label="plan.expression_policy.active_selection_provenance.reason",
            ),
            "evidence_boundary": _string(
                selection.get("evidence_boundary"),
                label="plan.expression_policy.active_selection_provenance.evidence_boundary",
            ),
        }
        if "provisional" not in active_selection_provenance["evidence_boundary"]:
            raise ScoreExpressionError(
                "active selection evidence_boundary must explicitly say provisional"
            )
    return {
        "schema": EXPRESSION_POLICY_SCHEMA,
        "id": EXPRESSION_POLICY_ID,
        "automatic_activation": False,
        "default_decision": "off",
        "seconds_per_beat": seconds_per_beat,
        "meter_beats": meter_beats,
        "evidence_status": evidence_status,
        "score_evidence_boundary": score_evidence_boundary,
        "active_selection_provenance": active_selection_provenance,
        "rule_catalog": {
            POLICY_RULE_SUSTAINED_CANDIDATE: {
                "decision": "candidate_off",
                "style": "late_gentle_yoseong_candidate",
                "end_behavior": "depth_fade_to_zero",
                "meaning": "reviewable late-yoseong candidate on a two-beat local phrase cadence before rest; never auto-enabled and not a Bonjo/Gyeonggi universal rule",
            },
            POLICY_RULE_GLOBAL_CADENCE_CANDIDATE: {
                "decision": "candidate_off",
                "style": "late_gentle_yoseong_candidate",
                "end_behavior": "depth_fade_to_zero",
                "meaning": "reviewable late-yoseong candidate on the three-beat global cadence; never auto-enabled and not a Bonjo/Gyeonggi universal rule",
            },
            POLICY_RULE_SHORT_LOCAL_TAIL_OFF: {
                "decision": "off",
                "style": "straight",
                "end_behavior": "none",
                "meaning": "one-beat non-global descending arrival is not evidence for full-note yoseong",
            },
            POLICY_RULE_DEFAULT_OFF: {
                "decision": "off",
                "style": "straight",
                "end_behavior": "none",
                "meaning": "straight tone unless a reviewed contextual rule supplies a candidate",
            },
            POLICY_RULE_RELEASE_OFF: {
                "decision": "off",
                "style": "straight",
                "end_behavior": "none",
                "meaning": "release is an amplitude/voicing tail, not a new vibrato-bearing note",
            },
        },
    }


def _musical_context(
    raw: Any,
    *,
    label: str,
    duration_seconds: float,
    policy: Mapping[str, Any] | None,
) -> dict[str, Any] | None:
    if raw is None:
        if policy is not None:
            raise ScoreExpressionError(f"{label}.musical_context is required by the expression policy")
        return None
    value = _mapping(raw, label=f"{label}.musical_context")
    duration_beats = _number(
        value.get("duration_beats"), label=f"{label}.musical_context.duration_beats", minimum=0.01
    )
    notated_duration_beats = _number(
        value.get("notated_duration_beats", duration_beats),
        label=f"{label}.musical_context.notated_duration_beats",
        minimum=duration_beats,
    )
    timing_interpretation = _string(
        value.get("timing_interpretation", "as_notated"),
        label=f"{label}.musical_context.timing_interpretation",
    )
    if notated_duration_beats > duration_beats and "breath_gap" not in timing_interpretation:
        raise ScoreExpressionError(
            f"{label}.musical_context.timing_interpretation must identify the breath_gap shortening"
        )
    if math.isclose(notated_duration_beats, duration_beats, abs_tol=1.0e-12, rel_tol=0.0):
        if timing_interpretation != "as_notated":
            raise ScoreExpressionError(
                f"{label}.musical_context.timing_interpretation must be as_notated when duration is unchanged"
            )
    context = {
        "genre": _string(value.get("genre"), label=f"{label}.musical_context.genre"),
        "style": _string(value.get("style"), label=f"{label}.musical_context.style"),
        "tori": _string(value.get("tori"), label=f"{label}.musical_context.tori"),
        "mode": _string(value.get("mode"), label=f"{label}.musical_context.mode"),
        "phrase_role": _string(value.get("phrase_role"), label=f"{label}.musical_context.phrase_role"),
        "modal_degree": _string(value.get("modal_degree"), label=f"{label}.musical_context.modal_degree"),
        "duration_beats": duration_beats,
        "notated_duration_beats": notated_duration_beats,
        "timing_interpretation": timing_interpretation,
        "metric_beat": _number(
            value.get("metric_beat"), label=f"{label}.musical_context.metric_beat", minimum=1.0
        ),
        "approach": _string(value.get("approach"), label=f"{label}.musical_context.approach"),
        "followed_by_rest": _strict_bool(
            value.get("followed_by_rest"), label=f"{label}.musical_context.followed_by_rest"
        ),
        "global_cadence": _strict_bool(
            value.get("global_cadence"), label=f"{label}.musical_context.global_cadence"
        ),
    }
    if policy is not None:
        expected_duration = float(context["duration_beats"]) * float(policy["seconds_per_beat"])
        if not math.isclose(expected_duration, duration_seconds, abs_tol=1.0e-6, rel_tol=0.0):
            raise ScoreExpressionError(
                f"{label}.musical_context.duration_beats does not match the event duration"
            )
        # ``metric_beat`` is a one-based onset position, so subdivisions in a
        # 3-beat bar legitimately include 1.5, 2.5, and 3.5.  The next bar
        # begins at 4.0 and is therefore the exclusive upper bound.
        if float(context["metric_beat"]) >= float(policy["meter_beats"]) + 1.0:
            raise ScoreExpressionError(f"{label}.musical_context.metric_beat exceeds the policy meter")
    return context


def _expected_vibrato_policy_rule(context: Mapping[str, Any]) -> str:
    if (
        float(context["duration_beats"]) >= 3.0
        and context["phrase_role"] == "global_phrase_cadence"
        and context["approach"] == "global_cadence_arrival"
        and context["global_cadence"] is True
    ):
        return POLICY_RULE_GLOBAL_CADENCE_CANDIDATE
    if (
        float(context["duration_beats"]) <= 1.0
        and context["phrase_role"] == "local_phrase_tail"
        and context["approach"] == "descending_arrival"
        and context["global_cadence"] is False
    ):
        return POLICY_RULE_SHORT_LOCAL_TAIL_OFF
    if (
        float(context["duration_beats"]) >= 2.0
        and context["phrase_role"] == "local_phrase_cadence_before_rest"
        and context["approach"] == "phrase_arrival"
        and context["followed_by_rest"] is True
        and context["global_cadence"] is False
    ):
        return POLICY_RULE_SUSTAINED_CANDIDATE
    return POLICY_RULE_DEFAULT_OFF


def _candidate_parameters(raw: Any, *, label: str, duration_seconds: float) -> dict[str, Any]:
    value = _mapping(raw, label=f"{label}.candidate_parameters")
    onset = _number(
        value.get("onset_seconds"),
        label=f"{label}.candidate_parameters.onset_seconds",
        minimum=0.0,
        maximum=duration_seconds,
    )
    ramp = _number(
        value.get("ramp_seconds"),
        label=f"{label}.candidate_parameters.ramp_seconds",
        minimum=0.005,
        maximum=duration_seconds,
    )
    end_fade = _number(
        value.get("end_fade_seconds"),
        label=f"{label}.candidate_parameters.end_fade_seconds",
        minimum=0.005,
        maximum=duration_seconds,
    )
    return {
        "rate_hz": _number(
            value.get("rate_hz"),
            label=f"{label}.candidate_parameters.rate_hz",
            minimum=VIBRATO_RATE_RANGE_HZ[0],
            maximum=VIBRATO_RATE_RANGE_HZ[1],
        ),
        "depth_cents": _number(
            value.get("depth_cents"),
            label=f"{label}.candidate_parameters.depth_cents",
            minimum=VIBRATO_DEPTH_RANGE_CENTS[0],
            maximum=VIBRATO_DEPTH_RANGE_CENTS[1],
        ),
        "onset_seconds": onset,
        "ramp_seconds": ramp,
        "end_fade_seconds": end_fade,
        "parameter_status": _string(
            value.get("parameter_status"),
            label=f"{label}.candidate_parameters.parameter_status",
        ),
    }


def _reference_contour(
    raw: Any,
    *,
    label: str,
    event_id: str,
    duration_seconds: float,
    articulation: str,
) -> dict[str, Any] | None:
    if raw is None:
        return None
    if event_id != REFERENCE_CONTOUR_EVENT_ID or articulation != "rearticulate":
        raise ScoreExpressionError(
            f"{label}.reference_contour is permitted only on {REFERENCE_CONTOUR_EVENT_ID}"
        )
    value = _mapping(raw, label=f"{label}.reference_contour")
    expected = pinned_reference_contour_contract()
    if value != expected:
        raise ScoreExpressionError(
            f"{label}.reference_contour must exactly match the pinned unreviewed reference contract"
        )
    if not math.isclose(
        float(value["onset_seconds"]) + float(value["duration_seconds"]),
        duration_seconds,
        abs_tol=1.0e-12,
        rel_tol=0.0,
    ):
        raise ScoreExpressionError(
            f"{label}.reference_contour must end exactly at the note boundary"
        )
    normalized = _mapping(
        value["normalized_reference_contour"],
        label=f"{label}.reference_contour.normalized_reference_contour",
    )
    count = _integer(
        normalized.get("sample_count"),
        label=f"{label}.reference_contour.normalized_reference_contour.sample_count",
        minimum=2,
        maximum=4_096,
    )
    times = normalized.get("time_normalized_0_to_1")
    pitch = normalized.get("pitch_residual_cents")
    if not isinstance(times, list) or not isinstance(pitch, list) or len(times) != count or len(pitch) != count:
        raise ScoreExpressionError(f"{label}.reference_contour sample arrays do not match sample_count")
    checked_times = [
        _number(item, label=f"{label}.reference_contour.time[{index}]", minimum=0.0, maximum=1.0)
        for index, item in enumerate(times)
    ]
    if checked_times[0] != 0.0 or checked_times[-1] != 1.0 or any(
        right <= left for left, right in zip(checked_times, checked_times[1:])
    ):
        raise ScoreExpressionError(f"{label}.reference_contour time axis must increase from 0 to 1")
    for index, item in enumerate(pitch):
        _number(item, label=f"{label}.reference_contour.pitch[{index}]", minimum=-600.0, maximum=600.0)
    # JSON round-trip gives callers a private, serialization-safe copy.
    return json.loads(json.dumps(expected, ensure_ascii=False))


def _vibrato_policy(
    raw: Any,
    *,
    label: str,
    duration_seconds: float,
    context: Mapping[str, Any] | None,
    expression_policy: Mapping[str, Any] | None,
    vibrato: Mapping[str, Any],
    reference_contour: Mapping[str, Any] | None,
    event_id: str,
    is_release: bool = False,
) -> dict[str, Any] | None:
    vibrato_enabled = bool(vibrato["enabled"])
    if raw is None:
        if expression_policy is not None:
            raise ScoreExpressionError(f"{label}.vibrato_policy is required by the expression policy")
        return None
    if expression_policy is None or (context is None and not is_release):
        raise ScoreExpressionError(f"{label}.vibrato_policy requires plan.expression_policy and musical_context")
    value = _mapping(raw, label=f"{label}.vibrato_policy")
    decision = value.get("decision")
    style = value.get("style")
    end_behavior = value.get("end_behavior")
    if decision not in VIBRATO_POLICY_DECISIONS:
        raise ScoreExpressionError(f"{label}.vibrato_policy.decision is unsupported")
    if style not in VIBRATO_POLICY_STYLES:
        raise ScoreExpressionError(f"{label}.vibrato_policy.style is unsupported")
    if end_behavior not in VIBRATO_END_BEHAVIORS:
        raise ScoreExpressionError(f"{label}.vibrato_policy.end_behavior is unsupported")
    rule_id = _string(value.get("policy_rule_id"), label=f"{label}.vibrato_policy.policy_rule_id")
    expected_rule = POLICY_RULE_RELEASE_OFF if is_release else _expected_vibrato_policy_rule(context)
    if rule_id != expected_rule:
        raise ScoreExpressionError(
            f"{label}.vibrato_policy.policy_rule_id must be the fired contextual rule {expected_rule}"
        )
    expected = expression_policy["rule_catalog"][expected_rule]
    active_selection = expression_policy.get("active_selection_provenance")
    selected_here = bool(
        active_selection is not None
        and event_id in active_selection["selected_event_ids"]
        and active_selection["source_policy_rule_ids_by_event"].get(event_id) == expected_rule
    )
    if reference_contour is not None:
        if selected_here:
            raise ScoreExpressionError(
                f"{label}.reference_contour cannot also be an active rule-based vibrato selection"
            )
        if expected_rule != POLICY_RULE_GLOBAL_CADENCE_CANDIDATE:
            raise ScoreExpressionError(
                f"{label}.reference_contour requires the global-cadence candidate context"
            )
        if vibrato_enabled:
            raise ScoreExpressionError(f"{label}.reference_contour cannot be combined with sine vibrato")
        if (
            decision != REFERENCE_CONTOUR_DECISION
            or style != REFERENCE_CONTOUR_STYLE
            or end_behavior != "depth_fade_to_zero"
        ):
            raise ScoreExpressionError(
                f"{label}.vibrato_policy must explicitly declare reference_shape_unreviewed"
            )
        if value.get("evidence_boundary") != REFERENCE_CONTOUR_EVIDENCE_BOUNDARY:
            raise ScoreExpressionError(
                f"{label}.vibrato_policy.evidence_boundary must retain every unreviewed-reference limit"
            )
        if "candidate_parameters" in value or "parameter_status" in value:
            raise ScoreExpressionError(
                f"{label}.reference_contour must not retain rule-based sine parameters"
            )
        return {
            "decision": decision,
            "style": style,
            "policy_rule_id": rule_id,
            "end_behavior": end_behavior,
            "rule_fired": True,
            "candidate_parameters": None,
            "parameter_status": None,
            "evidence_boundary": REFERENCE_CONTOUR_EVIDENCE_BOUNDARY,
            "active_selection_provenance": None,
            "reference_contour_status": REFERENCE_CONTOUR_STATUS,
        }
    if decision == REFERENCE_CONTOUR_DECISION:
        raise ScoreExpressionError(
            f"{label}.vibrato_policy declares reference_shape_unreviewed without reference_contour"
        )
    if selected_here:
        if decision != "selected" or style != "late_gentle_yoseong" or end_behavior != "depth_fade_to_zero":
            raise ScoreExpressionError(
                f"{label}.vibrato_policy must explicitly mark the active audition choice as selected"
            )
        if not vibrato_enabled:
            raise ScoreExpressionError(f"{label}.vibrato must be enabled for an explicitly selected audition event")
    else:
        if decision != expected["decision"] or style != expected["style"] or end_behavior != expected["end_behavior"]:
            raise ScoreExpressionError(f"{label}.vibrato_policy does not match fired rule {expected_rule}")
        if vibrato_enabled:
            raise ScoreExpressionError(
                f"{label}.vibrato cannot be enabled without active_selection_provenance"
            )
    candidate = None
    parameter_status = None
    evidence_boundary = None
    if decision in ("candidate_off", "selected"):
        candidate = _candidate_parameters(
            value.get("candidate_parameters"), label=f"{label}.vibrato_policy", duration_seconds=duration_seconds
        )
        if "provisional" not in str(candidate["parameter_status"]):
            raise ScoreExpressionError(
                f"{label}.vibrato_policy.candidate_parameters.parameter_status must explicitly say provisional"
            )
    elif "candidate_parameters" in value:
        raise ScoreExpressionError(f"{label}.vibrato_policy candidate parameters require candidate_off")
    if decision == "selected":
        parameter_status = _string(
            value.get("parameter_status"), label=f"{label}.vibrato_policy.parameter_status"
        )
        evidence_boundary = _string(
            value.get("evidence_boundary"), label=f"{label}.vibrato_policy.evidence_boundary"
        )
        if "provisional" not in parameter_status or "provisional" not in evidence_boundary:
            raise ScoreExpressionError(
                f"{label}.vibrato_policy selected parameters and evidence must explicitly say provisional"
            )
        for key in ("rate_hz", "depth_cents", "onset_seconds", "ramp_seconds", "end_fade_seconds"):
            if not math.isclose(float(vibrato[key]), float(candidate[key]), abs_tol=1.0e-12, rel_tol=0.0):
                raise ScoreExpressionError(
                    f"{label}.vibrato.{key} must exactly match the selected provisional candidate"
                )
    return {
        "decision": decision,
        "style": style,
        "policy_rule_id": rule_id,
        "end_behavior": end_behavior,
        "rule_fired": True,
        "candidate_parameters": candidate,
        "parameter_status": parameter_status,
        "evidence_boundary": evidence_boundary,
        "active_selection_provenance": active_selection if selected_here else None,
    }


def _scope(plan: Mapping[str, Any]) -> dict[str, bool]:
    if plan.get("schema") != PLAN_SCHEMA:
        raise ScoreExpressionError(f"plan.schema must be {PLAN_SCHEMA}")
    scope = _mapping(plan.get("r_and_d_scope"), label="plan.r_and_d_scope")
    for key in ("r_and_d_only", "no_default_assets", "no_runtime_bgm", "no_game_output", "no_public_release"):
        _require_bool(scope, key, label="plan.r_and_d_scope")
    return {
        "r_and_d_only": True,
        "no_default_assets": True,
        "no_runtime_bgm": True,
        "no_game_output": True,
        "no_public_release": True,
    }


def _gesture_points(raw: Any, *, duration_seconds: float, label: str) -> list[tuple[float, float]]:
    if raw is None:
        return [(0.0, 0.0), (duration_seconds, 0.0)]
    if not isinstance(raw, list) or not raw:
        raise ScoreExpressionError(f"{label}.gesture_points must be a non-empty list when supplied")
    points: list[tuple[float, float]] = []
    previous_time = -1.0
    for index, item in enumerate(raw):
        entry = _mapping(item, label=f"{label}.gesture_points[{index}]")
        time_seconds = _number(entry.get("time_seconds"), label=f"{label}.gesture_points[{index}].time_seconds", minimum=0.0, maximum=duration_seconds)
        cents = _number(entry.get("cents"), label=f"{label}.gesture_points[{index}].cents", minimum=-600.0, maximum=600.0)
        if time_seconds <= previous_time:
            raise ScoreExpressionError(f"{label}.gesture_points must have strictly increasing time_seconds")
        points.append((time_seconds, cents))
        previous_time = time_seconds
    if points[0][0] != 0.0:
        raise ScoreExpressionError(f"{label}.gesture_points must start at time_seconds 0")
    if points[-1][0] != duration_seconds:
        raise ScoreExpressionError(f"{label}.gesture_points must end at the event duration")
    return points


def _vibrato(raw: Any, *, label: str) -> dict[str, float | bool]:
    if raw is None:
        return {"enabled": False, "rate_hz": 0.0, "depth_cents": 0.0, "onset_seconds": 0.0, "ramp_seconds": 0.0, "end_fade_seconds": 0.0}
    value = _mapping(raw, label=f"{label}.vibrato")
    enabled = value.get("enabled") is True
    if not enabled:
        # An explicit false is allowed, but hidden parameters are rejected so
        # an author cannot accidentally think an inaudible default is active.
        extras = set(value) - {"enabled"}
        if extras:
            raise ScoreExpressionError(f"{label}.vibrato has parameters although enabled is not true")
        return {"enabled": False, "rate_hz": 0.0, "depth_cents": 0.0, "onset_seconds": 0.0, "ramp_seconds": 0.0, "end_fade_seconds": 0.0}
    rate = _number(value.get("rate_hz"), label=f"{label}.vibrato.rate_hz", minimum=VIBRATO_RATE_RANGE_HZ[0], maximum=VIBRATO_RATE_RANGE_HZ[1])
    depth = _number(value.get("depth_cents"), label=f"{label}.vibrato.depth_cents", minimum=VIBRATO_DEPTH_RANGE_CENTS[0], maximum=VIBRATO_DEPTH_RANGE_CENTS[1])
    onset = _number(value.get("onset_seconds", 0.0), label=f"{label}.vibrato.onset_seconds", minimum=0.0, maximum=60.0)
    ramp = _number(value.get("ramp_seconds", 0.08), label=f"{label}.vibrato.ramp_seconds", minimum=0.005, maximum=3.0)
    end_fade = _number(
        value.get("end_fade_seconds", 0.0),
        label=f"{label}.vibrato.end_fade_seconds",
        minimum=0.0,
        maximum=3.0,
    )
    return {"enabled": True, "rate_hz": rate, "depth_cents": depth, "onset_seconds": onset, "ramp_seconds": ramp, "end_fade_seconds": end_fade}


def _event(
    raw: Any,
    *,
    index: int,
    previous: dict[str, Any] | None,
    expression_policy: Mapping[str, Any] | None,
) -> dict[str, Any]:
    value = _mapping(raw, label=f"events[{index}]")
    event_id = value.get("id")
    if not isinstance(event_id, str) or not event_id:
        raise ScoreExpressionError(f"events[{index}].id must be a non-empty string")
    start = _number(value.get("start_seconds"), label=f"events[{index}].start_seconds", minimum=0.0)
    end = _number(value.get("end_seconds"), label=f"events[{index}].end_seconds", minimum=0.0)
    if not end > start:
        raise ScoreExpressionError(f"events[{index}] must have end_seconds after start_seconds")
    kind = value.get("articulation")
    if kind not in ARTICULATIONS:
        allowed = ", ".join(ARTICULATIONS)
        raise ScoreExpressionError(f"events[{index}].articulation must explicitly be one of {allowed}")
    if previous is not None and start < previous["end_seconds"] - (1.0 / SAMPLE_RATE_HZ):
        raise ScoreExpressionError("events must be monophonic and non-overlapping")
    if kind == "slur":
        if previous is None:
            raise ScoreExpressionError("a SLUR requires a previous voiced event")
        if value.get("slur_from_previous") is not True:
            raise ScoreExpressionError("a SLUR must explicitly set slur_from_previous: true")
        if abs(start - previous["end_seconds"]) > (1.0 / SAMPLE_RATE_HZ):
            raise ScoreExpressionError("a SLUR must touch its explicitly linked previous event")
    elif value.get("slur_from_previous"):
        raise ScoreExpressionError("slur_from_previous is allowed only on an explicit SLUR")
    if kind == "release":
        if previous is None or previous["articulation"] == "release":
            raise ScoreExpressionError("a RELEASE requires a previous voiced event")
        if "pitch_hz" in value:
            raise ScoreExpressionError("a RELEASE must not declare pitch_hz")
        if "reference_contour" in value:
            raise ScoreExpressionError("a RELEASE must not declare reference_contour")
        duration = end - start
        vibrato = _vibrato(value.get("vibrato"), label=f"events[{index}]")
        vibrato_policy = _vibrato_policy(
            value.get("vibrato_policy"),
            label=f"events[{index}]",
            duration_seconds=duration,
            context=None,
            expression_policy=expression_policy,
            vibrato=vibrato,
            reference_contour=None,
            event_id=event_id,
            is_release=True,
        )
        return {
            "id": event_id,
            "start_seconds": start,
            "end_seconds": end,
            "articulation": kind,
            "pitch_hz": 0.0,
            "gesture_points": [(0.0, 0.0), (end - start, 0.0)],
            "vibrato": vibrato,
            "reference_contour": None,
            "musical_context": None,
            "vibrato_policy": vibrato_policy,
            # A release starts from the preceding authored level instead of
            # silently jumping to a generic volume before it decays.
            "steady_loudness_db": float(previous["steady_loudness_db"]),
        }
    pitch = _number(value.get("pitch_hz"), label=f"events[{index}].pitch_hz", minimum=20.0, maximum=4_000.0)
    duration = end - start
    steady_loudness = _number(value.get("steady_loudness_db", -28.0), label=f"events[{index}].steady_loudness_db", minimum=-70.0, maximum=-3.0)
    vibrato = _vibrato(value.get("vibrato"), label=f"events[{index}]")
    if float(vibrato["onset_seconds"]) >= duration:
        raise ScoreExpressionError(f"events[{index}].vibrato.onset_seconds must be inside the event")
    if float(vibrato["end_fade_seconds"]) > duration:
        raise ScoreExpressionError(f"events[{index}].vibrato.end_fade_seconds exceeds the event duration")
    musical_context = _musical_context(
        value.get("musical_context"),
        label=f"events[{index}]",
        duration_seconds=duration,
        policy=expression_policy,
    )
    reference_contour = _reference_contour(
        value.get("reference_contour"),
        label=f"events[{index}]",
        event_id=event_id,
        duration_seconds=duration,
        articulation=str(kind),
    )
    vibrato_policy = _vibrato_policy(
        value.get("vibrato_policy"),
        label=f"events[{index}]",
        duration_seconds=duration,
        context=musical_context,
        expression_policy=expression_policy,
        vibrato=vibrato,
        reference_contour=reference_contour,
        event_id=event_id,
    )
    return {
        "id": event_id,
        "start_seconds": start,
        "end_seconds": end,
        "articulation": kind,
        "pitch_hz": pitch,
        "gesture_points": _gesture_points(value.get("gesture_points"), duration_seconds=duration, label=f"events[{index}]"),
        "vibrato": vibrato,
        "reference_contour": reference_contour,
        "musical_context": musical_context,
        "vibrato_policy": vibrato_policy,
        "steady_loudness_db": steady_loudness,
    }


def validate_plan(path: str | Path) -> dict[str, Any]:
    """Validate an explicit, R&D-only monophonic score-expression plan."""

    plan_path = Path(path).expanduser().resolve()
    plan = _load_json(plan_path)
    scope = _scope(plan)
    expression_policy = _expression_policy(plan.get("expression_policy"))
    instrument = _mapping(plan.get("instrument"), label="plan.instrument")
    if instrument.get("id") != "daegeum" or instrument.get("sustained") is not True:
        raise ScoreExpressionError("v1 accepts only an explicit sustained daegeum R&D plan")
    control_hz = _integer(plan.get("control_hz", 100), label="plan.control_hz", minimum=25, maximum=1_000)
    events_raw = plan.get("events")
    if not isinstance(events_raw, list) or not events_raw:
        raise ScoreExpressionError("plan.events must be a non-empty explicit list")
    if len(events_raw) > 2_048:
        raise ScoreExpressionError("plan.events exceeds the R&D-only limit")
    events: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw in enumerate(events_raw):
        item = _event(
            raw,
            index=index,
            previous=events[-1] if events else None,
            expression_policy=expression_policy,
        )
        if item["id"] in seen_ids:
            raise ScoreExpressionError("plan.events repeats an id")
        seen_ids.add(item["id"])
        events.append(item)
    if events[0]["articulation"] == "slur":
        raise ScoreExpressionError("the first event cannot be a SLUR")
    if expression_policy is not None and expression_policy["active_selection_provenance"] is not None:
        selected_ids = set(expression_policy["active_selection_provenance"]["selected_event_ids"])
        actual_selected_ids = {
            str(event["id"])
            for event in events
            if event["vibrato_policy"] is not None
            and event["vibrato_policy"]["decision"] == "selected"
        }
        if selected_ids != actual_selected_ids:
            raise ScoreExpressionError(
                "active_selection_provenance.selected_event_ids must exactly match selected event policies"
            )
    reference_events = [event for event in events if event["reference_contour"] is not None]
    if reference_events and [event["id"] for event in reference_events] != [REFERENCE_CONTOUR_EVENT_ID]:
        raise ScoreExpressionError(
            f"the pinned unreviewed reference contour must occur exactly once on {REFERENCE_CONTOUR_EVENT_ID}"
        )
    fired_policy_rules = [
        {
            "event_id": event["id"],
            "policy_rule_id": event["vibrato_policy"]["policy_rule_id"],
            "decision": event["vibrato_policy"]["decision"],
            "style": event["vibrato_policy"]["style"],
            "end_behavior": event["vibrato_policy"]["end_behavior"],
        }
        for event in events
        if event["vibrato_policy"] is not None
    ]
    return {
        "plan_path": plan_path,
        "plan_sha256": _sha256(plan_path),
        "scope": scope,
        "expression_policy": expression_policy,
        "control_hz": control_hz,
        "events": events,
        "fired_policy_rules": fired_policy_rules,
        "duration_seconds": max(event["end_seconds"] for event in events),
    }


def _interpolate_points(points: list[tuple[float, float]], times: numpy.ndarray) -> numpy.ndarray:
    source_times = numpy.asarray([point[0] for point in points], dtype=numpy.float64)
    source_cents = numpy.asarray([point[1] for point in points], dtype=numpy.float64)
    return numpy.interp(times, source_times, source_cents).astype(numpy.float32)


def _minimum_jerk_progress(progress: numpy.ndarray) -> numpy.ndarray:
    """Zero-slope monotonic S-curve for a short wind-instrument fingering change."""

    unit = numpy.clip(progress, 0.0, 1.0)
    return unit * unit * unit * (10.0 + unit * (-15.0 + 6.0 * unit))


def slur_transition_hz(
    initial_hz: float,
    target_hz: float,
    local_seconds: numpy.ndarray,
    *,
    transition_seconds: float = SLUR_TRANSITION_SECONDS,
) -> numpy.ndarray:
    """Match the runtime's minimum-jerk transition in log-frequency/cents."""

    initial = _number(initial_hz, label="slur initial_hz", minimum=20.0, maximum=4_000.0)
    target = _number(target_hz, label="slur target_hz", minimum=20.0, maximum=4_000.0)
    duration = _number(transition_seconds, label="slur transition_seconds", minimum=0.001)
    candidates = tuple(milliseconds / 1_000.0 for milliseconds in SLUR_TRANSITION_CANDIDATE_MILLISECONDS)
    if not any(math.isclose(duration, candidate, abs_tol=1.0e-12, rel_tol=0.0) for candidate in candidates):
        choices = ", ".join(str(milliseconds) for milliseconds in SLUR_TRANSITION_CANDIDATE_MILLISECONDS)
        raise ScoreExpressionError(f"slur transition_seconds must be one of the validated candidates: {choices} ms")
    local = numpy.asarray(local_seconds, dtype=numpy.float64)
    if numpy.any(~numpy.isfinite(local)) or numpy.any(local < 0.0):
        raise ScoreExpressionError("slur local_seconds must be finite and non-negative")
    source_cents = 1_200.0 * math.log2(initial)
    target_cents = 1_200.0 * math.log2(target)
    cents = source_cents + (target_cents - source_cents) * _minimum_jerk_progress(local / duration)
    return numpy.power(2.0, cents / 1_200.0)


def slur_transition_policy() -> dict[str, Any]:
    """Readable contract shared mathematically with the public Daegeum runtime."""

    return {
        "pitch_transition_milliseconds": SLUR_TRANSITION_MILLISECONDS,
        "pitch_shape": SLUR_TRANSITION_SHAPE,
        "pitch_domain": "log_frequency_cents",
        "pitch_target_settle_by_seconds": SLUR_TARGET_ATTACH_SECONDS,
        "intermediate_pitch_dwell_strictly_less_than_seconds": SLUR_MAX_INTERMEDIATE_DWELL_SECONDS,
        "dynamic_transition_seconds": SLUR_LOUDNESS_TRANSITION_SECONDS,
        "dynamic_shape": SLUR_LOUDNESS_TRANSITION_SHAPE,
        "dynamic_domain": "linear_loudness",
        "dynamic_target_settle_by_seconds": SLUR_LOUDNESS_TARGET_SETTLE_SECONDS,
        "no_rearticulation_envelope_for_slur": True,
    }


def _slur_boundary_f0_metadata(
    *,
    event_index: int,
    source_event: Mapping[str, Any],
    target_event: Mapping[str, Any],
    control_hz: int,
    frame_times_seconds: numpy.ndarray,
    frame_centers_48k: numpy.ndarray,
    f0_hz: numpy.ndarray,
) -> dict[str, Any]:
    """Record score-derived boundary facts; do not narrow compiler input.

    The generic preview may later decide whether it has enough 48 kHz/control
    grid facts to reconstruct this particular boundary.  The compiler always
    retains a valid authorial plan, including prior vibrato or a deliberately
    early target gesture, instead of imposing preview-only stability rules.
    """

    start = float(target_event["start_seconds"])
    source_end_cents = float(source_event["gesture_points"][-1][1])
    target_entry_cents = float(target_event["gesture_points"][0][1])
    source_hz = float(source_event["pitch_hz"]) * (2.0 ** (source_end_cents / 1_200.0))
    target_hz = float(target_event["pitch_hz"]) * (2.0 ** (target_entry_cents / 1_200.0))

    boundary_frame_index = int(round(start * control_hz))
    boundary_on_control_grid = (
        0 < boundary_frame_index < frame_times_seconds.shape[0]
        and math.isclose(float(frame_times_seconds[boundary_frame_index]), start, abs_tol=1.0e-9, rel_tol=0.0)
    )
    start_sample = int(round(start * SAMPLE_RATE_HZ))
    boundary_on_48k_timeline = start_sample > 0 and math.isclose(
        start_sample / SAMPLE_RATE_HZ,
        start,
        abs_tol=1.0e-9,
        rel_tol=0.0,
    )

    transition_samples = int(round(SLUR_TRANSITION_SECONDS * SAMPLE_RATE_HZ))
    if transition_samples <= 0 or not math.isclose(transition_samples / SAMPLE_RATE_HZ, SLUR_TRANSITION_SECONDS, abs_tol=1.0e-12, rel_tol=0.0):
        raise AssertionError("canonical 12 ms slur must map exactly to the 48 kHz timeline")
    transition_end_sample = start_sample + transition_samples if boundary_on_48k_timeline else None
    # Choose the first sampled row *strictly after* the exact 12 ms endpoint.
    # At a very dense control rate, the endpoint itself still belongs to the
    # canonical transition; the next row is the first authorial post-slur
    # value a preview may join back to.
    rejoin_frame_index = int(math.floor((start + SLUR_TRANSITION_SECONDS) * control_hz + 1.0e-12)) + 1
    rejoin_is_inside_target_event = (
        boundary_on_control_grid
        and boundary_frame_index < rejoin_frame_index < frame_times_seconds.shape[0]
        and float(frame_times_seconds[rejoin_frame_index]) < float(target_event["end_seconds"])
    )
    preview_reconstruction_eligible = boundary_on_control_grid and boundary_on_48k_timeline and rejoin_is_inside_target_event
    ineligible_reasons: list[str] = []
    if not boundary_on_control_grid:
        ineligible_reasons.append("boundary_not_on_compiler_control_grid")
    if not boundary_on_48k_timeline:
        ineligible_reasons.append("boundary_not_on_48khz_sample_grid")
    if not rejoin_is_inside_target_event:
        ineligible_reasons.append("no_post_transition_target_control_row_inside_slur_event")

    source_hold_frame_index: int | None = None
    source_hold_sample: int | None = None
    source_hold_hz: float | None = None
    rejoin_sample: int | None = None
    rejoin_hz: float | None = None
    if preview_reconstruction_eligible:
        source_hold_frame_index = boundary_frame_index - 1
        source_hold_sample = int(frame_centers_48k[source_hold_frame_index])
        rejoin_sample = int(frame_centers_48k[rejoin_frame_index])
        source_hold_hz = float(f0_hz[source_hold_frame_index])
        rejoin_hz = float(f0_hz[rejoin_frame_index])
        if transition_end_sample is None or rejoin_sample < transition_end_sample:
            raise AssertionError("slur rejoin row must not precede the canonical transition end")

    return {
        "schema": SLUR_BOUNDARY_F0_SCHEMA,
        "event_id": str(target_event["id"]),
        "event_index": event_index,
        "source_event_id": str(source_event["id"]),
        "source_event_index": event_index - 1,
        "boundary_seconds": start,
        "boundary_control_frame_index": boundary_frame_index,
        "source_hold_control_frame_index": source_hold_frame_index,
        "source_hold_sample_48k": source_hold_sample,
        "source_hold_f0_hz": source_hold_hz,
        "transition_start_sample_48k": start_sample if boundary_on_48k_timeline else None,
        "transition_end_sample_48k": transition_end_sample,
        "transition_seconds": SLUR_TRANSITION_SECONDS,
        "source_boundary_f0_hz": source_hz,
        "source_boundary_gesture_cents": source_end_cents,
        "target_entry_f0_hz": target_hz,
        "target_entry_gesture_cents": target_entry_cents,
        "target_rejoin_control_frame_index": rejoin_frame_index if preview_reconstruction_eligible else None,
        "target_rejoin_sample_48k": rejoin_sample,
        "target_rejoin_f0_hz": rejoin_hz,
        "pitch_shape": SLUR_TRANSITION_SHAPE,
        "pitch_domain": "log_frequency_cents",
        "preview_reconstruction_eligible": preview_reconstruction_eligible,
        "preview_reconstruction_ineligible_reasons": ineligible_reasons,
    }


def _vibrato_curve(event: Mapping[str, Any], relative_times: numpy.ndarray, *, fade_at_end: bool) -> tuple[numpy.ndarray, numpy.ndarray, numpy.ndarray]:
    config = event["vibrato"]
    if not config["enabled"]:
        zeros = numpy.zeros(relative_times.shape, dtype=numpy.float32)
        return zeros, zeros, zeros
    rate = float(config["rate_hz"])
    depth = float(config["depth_cents"])
    onset = float(config["onset_seconds"])
    ramp = float(config["ramp_seconds"])
    end_fade = float(config["end_fade_seconds"])
    duration = float(event["end_seconds"] - event["start_seconds"])
    envelope = numpy.clip((relative_times - onset) / ramp, 0.0, 1.0)
    if fade_at_end:
        fade_seconds = end_fade if end_fade > 0.0 else ramp
        envelope *= numpy.clip((duration - relative_times) / fade_seconds, 0.0, 1.0)
        # The event interval is half-open, so ``duration`` itself has no
        # control row.  Make the final row explicit zero rather than leaving a
        # small off-centre pitch immediately before a rest/release boundary.
        if envelope.size:
            envelope[-1] = 0.0
    cents = depth * envelope * numpy.sin(2.0 * numpy.pi * rate * numpy.maximum(relative_times - onset, 0.0))
    return cents.astype(numpy.float32), numpy.full(relative_times.shape, rate, dtype=numpy.float32), numpy.full(relative_times.shape, depth, dtype=numpy.float32)


def _reference_contour_curve(
    event: Mapping[str, Any], relative_times: numpy.ndarray
) -> numpy.ndarray:
    config = event["reference_contour"]
    result = numpy.zeros(relative_times.shape, dtype=numpy.float64)
    if config is None:
        return result.astype(numpy.float32)
    onset = float(config["onset_seconds"])
    duration = float(config["duration_seconds"])
    end = onset + duration
    active = (relative_times >= onset) & (relative_times < end)
    if not numpy.any(active):
        return result.astype(numpy.float32)
    normalized = config["normalized_reference_contour"]
    source_times = numpy.asarray(normalized["time_normalized_0_to_1"], dtype=numpy.float64)
    source_cents = numpy.asarray(normalized["pitch_residual_cents"], dtype=numpy.float64)
    target = (relative_times[active] - onset) / duration
    contour = numpy.interp(target, source_times, source_cents)
    fade_in = numpy.clip(
        (relative_times[active] - onset) / float(config["fade_in_seconds"]), 0.0, 1.0
    )
    fade_out = numpy.clip(
        (end - relative_times[active]) / float(config["fade_out_seconds"]), 0.0, 1.0
    )
    result[active] = contour * numpy.minimum(fade_in, fade_out)
    # The event is half-open.  Pin its final active row to nominal pitch so a
    # consumer cannot expose an off-centre sample immediately before release.
    active_indices = numpy.flatnonzero(active)
    result[active_indices[0]] = 0.0
    result[active_indices[-1]] = 0.0
    return result.astype(numpy.float32)


def _onset_controls(kind: str, relative_times: numpy.ndarray, steady_db: float) -> tuple[numpy.ndarray, numpy.ndarray, numpy.ndarray]:
    """Return loudness, air/noise proxy, and voicing for one explicit state."""

    if kind == "breath_start":
        loudness = -58.0 + numpy.clip(relative_times / 0.065, 0.0, 1.0) * (steady_db + 58.0)
        air = 0.34 - numpy.clip(relative_times / 0.085, 0.0, 1.0) * 0.29
        voicing = numpy.clip(relative_times / 0.022, 0.0, 1.0)
    elif kind == "rearticulate":
        loudness = -43.0 + numpy.clip(relative_times / 0.022, 0.0, 1.0) * (steady_db + 43.0)
        air = 0.22 - numpy.clip(relative_times / 0.038, 0.0, 1.0) * 0.17
        voicing = numpy.ones(relative_times.shape, dtype=numpy.float64)
    elif kind == "slur":
        loudness = numpy.full(relative_times.shape, steady_db, dtype=numpy.float64)
        air = numpy.full(relative_times.shape, 0.035, dtype=numpy.float64)
        voicing = numpy.ones(relative_times.shape, dtype=numpy.float64)
    else:
        duration = max(float(relative_times[-1]) if relative_times.size else 0.001, 0.001)
        release = numpy.clip(1.0 - relative_times / duration, 0.0, 1.0)
        loudness = -80.0 + release * (steady_db + 80.0)
        air = 0.025 * release
        voicing = release
    return loudness.astype(numpy.float32), air.astype(numpy.float32), voicing.astype(numpy.float32)


def compile_plan(path: str | Path) -> dict[str, Any]:
    """Compile controls in memory; this does not write audio or modify a plan."""

    validated = validate_plan(path)
    control_hz = int(validated["control_hz"])
    duration = float(validated["duration_seconds"])
    frame_count = int(math.floor(duration * control_hz + 1.0e-9)) + 1
    times = numpy.arange(frame_count, dtype=numpy.float64) / float(control_hz)
    sample_centers = numpy.rint(times * SAMPLE_RATE_HZ).astype(numpy.int64)
    f0_hz = numpy.zeros(frame_count, dtype=numpy.float32)
    f0_cents = numpy.full(frame_count, numpy.nan, dtype=numpy.float32)
    loudness_db = numpy.full(frame_count, -80.0, dtype=numpy.float32)
    air_noise = numpy.zeros(frame_count, dtype=numpy.float32)
    voicing = numpy.zeros(frame_count, dtype=numpy.float32)
    gesture_state = numpy.zeros(frame_count, dtype=numpy.int16)
    event_index = numpy.full(frame_count, -1, dtype=numpy.int32)
    vibrato_rate = numpy.zeros(frame_count, dtype=numpy.float32)
    vibrato_depth = numpy.zeros(frame_count, dtype=numpy.float32)
    vibrato_cents = numpy.zeros(frame_count, dtype=numpy.float32)
    reference_contour_cents = numpy.zeros(frame_count, dtype=numpy.float32)

    events: list[dict[str, Any]] = validated["events"]
    for index, event in enumerate(events):
        start = float(event["start_seconds"])
        end = float(event["end_seconds"])
        mask = (times >= start) & (times < end)
        if not numpy.any(mask):
            continue
        local = times[mask] - start
        kind = str(event["articulation"])
        gesture_state[mask] = STATE_CODES[kind]
        event_index[mask] = index
        loudness, air, voiced = _onset_controls(kind, local, float(event["steady_loudness_db"]))
        loudness_db[mask] = loudness
        air_noise[mask] = air
        voicing[mask] = voiced
        if kind == "release":
            continue
        gesture = _interpolate_points(event["gesture_points"], local)
        base_hz = float(event["pitch_hz"])
        if kind == "slur":
            prior = events[index - 1]
            if prior["articulation"] == "release":
                raise ScoreExpressionError("a SLUR cannot follow RELEASE")
            previous_end_cents = float(prior["gesture_points"][-1][1])
            previous_hz = float(prior["pitch_hz"]) * (2.0 ** (previous_end_cents / 1200.0))
            target_entry_cents = float(event["gesture_points"][0][1])
            target_entry_hz = base_hz * (2.0 ** (target_entry_cents / 1200.0))
            transition_mask = local < SLUR_TRANSITION_SECONDS
            f0_base = base_hz * numpy.power(2.0, gesture / 1200.0)
            if numpy.any(transition_mask):
                f0_base[transition_mask] = slur_transition_hz(
                    previous_hz,
                    target_entry_hz,
                    local[transition_mask],
                )
            f0_hz[mask] = f0_base.astype(numpy.float32)
            # Slur keeps the breath and voicing continuous, but it must not
            # erase the event's authored steady dynamic.  Ease that dynamic
            # independently in *linear* loudness over 80 ms—much slower than
            # the fingering change, with no onset envelope or overshoot.
            prior_linear = 10.0 ** (float(prior["steady_loudness_db"]) / 20.0)
            target_linear = 10.0 ** (float(event["steady_loudness_db"]) / 20.0)
            dynamic_progress = _minimum_jerk_progress(local / SLUR_LOUDNESS_TRANSITION_SECONDS)
            dynamic_linear = prior_linear + (target_linear - prior_linear) * dynamic_progress
            loudness_db[mask] = (20.0 * numpy.log10(dynamic_linear)).astype(numpy.float32)
            # A prior vibrato tail is faded at the prior event's end by
            # ``fade_at_end`` below; suppress new-event vibrato only inside
            # the short pitch transition so that the core motion is monotonic.
        else:
            f0_hz[mask] = (base_hz * numpy.power(2.0, gesture / 1200.0)).astype(numpy.float32)
        next_is_slur = index + 1 < len(events) and events[index + 1]["articulation"] == "slur"
        policy_fades_at_end = bool(
            event["vibrato_policy"] is not None
            and event["vibrato_policy"]["end_behavior"] == "depth_fade_to_zero"
        )
        explicit_end_fade = float(event["vibrato"]["end_fade_seconds"]) > 0.0
        vib_cents, rate, depth = _vibrato_curve(
            event,
            local,
            fade_at_end=next_is_slur or policy_fades_at_end or explicit_end_fade,
        )
        if kind == "slur":
            vib_cents = numpy.where(local < SLUR_TRANSITION_SECONDS, 0.0, vib_cents).astype(numpy.float32)
        reference_cents = _reference_contour_curve(event, local)
        expression_cents = vib_cents + reference_cents
        f0_hz[mask] *= numpy.power(2.0, expression_cents / 1200.0).astype(numpy.float32)
        if kind == "slur":
            f0_cents[mask] = (1_200.0 * numpy.log2(f0_hz[mask] / base_hz)).astype(numpy.float32)
        else:
            f0_cents[mask] = gesture + expression_cents
        vibrato_rate[mask] = rate
        vibrato_depth[mask] = depth
        vibrato_cents[mask] = vib_cents
        reference_contour_cents[mask] = reference_cents

    # Features are compiler prescriptions, not recording-derived labels.
    pitch_feature = numpy.zeros(frame_count, dtype=numpy.float32)
    voiced_mask = f0_hz > 0.0
    pitch_feature[voiced_mask] = numpy.clip(
        numpy.log2(f0_hz[voiced_mask] / 55.0) / numpy.log2(1_500.0 / 55.0), 0.0, 1.0
    )
    loudness_feature = numpy.clip((loudness_db + 80.0) / 80.0, 0.0, 1.0)
    state_one_hot = numpy.column_stack([gesture_state == STATE_CODES[name] for name in ARTICULATIONS]).astype(numpy.float32)
    score_features = numpy.column_stack(
        (
            pitch_feature,
            loudness_feature,
            state_one_hot,
            air_noise,
            vibrato_rate / 10.0,
            vibrato_depth / 120.0,
        )
    ).astype(numpy.float32)
    if score_features.shape[1] != 9:
        raise AssertionError("score feature layout must remain explicit and stable")
    slur_boundaries = [
        _slur_boundary_f0_metadata(
            event_index=index,
            source_event=events[index - 1],
            target_event=event,
            control_hz=control_hz,
            frame_times_seconds=times,
            frame_centers_48k=sample_centers,
            f0_hz=f0_hz,
        )
        for index, event in enumerate(events)
        if event["articulation"] == "slur"
    ]
    return {
        **validated,
        "frame_times_seconds": times.astype(numpy.float32),
        "frame_centers_48k": sample_centers,
        "f0_hz": f0_hz,
        "f0_cents": f0_cents,
        "loudness_db": loudness_db,
        "air_noise_ratio": air_noise,
        "voicing": voicing,
        "gesture_state": gesture_state,
        "event_index": event_index,
        "vibrato_rate_hz": vibrato_rate,
        "vibrato_depth_cents": vibrato_depth,
        "vibrato_cents": vibrato_cents,
        "reference_contour_cents": reference_contour_cents,
        "score_features": score_features,
        "slur_boundaries": slur_boundaries,
        "slur_transition_policy": slur_transition_policy(),
        "slur_control_rate_quantization": {
            "compiler_control_hz": control_hz,
            "compiler_frame_seconds": 1.0 / control_hz,
            "canonical_pitch_transition_seconds": SLUR_TRANSITION_SECONDS,
            "meaning": "the compiler stores sampled controls, not audio-rate F0. The isolated v2 generic preview may reconstruct only compiler-attested canonical slur boundaries at 48 kHz; other consumers must not silently reinterpret sampled rows as a long linear-Hz glide.",
            "exact_audio_rate_parity_with_250hz_public_runtime_claimed": False,
            "runtime_authority": "the public Daegeum runtime separately verifies its own 250 Hz control rows, <20 ms intermediate-pitch dwell, and 50 ms target-pitch gate",
        },
    }


def render_controls(*, plan: str | Path, output_dir: str | Path) -> dict[str, Any]:
    """Write one fresh, R&D-only NPZ control artifact and its readable manifest."""

    output = Path(output_dir).expanduser().resolve()
    if output.exists():
        raise ScoreExpressionError("--output-dir must be fresh; refusing to overwrite an R&D artifact")
    compiled = compile_plan(plan)
    output.mkdir(parents=True, exist_ok=False)
    controls = output / CONTROL_FILENAME
    numpy.savez_compressed(
        controls,
        schema=numpy.asarray(OUTPUT_SCHEMA),
        sample_rate_hz=numpy.asarray(SAMPLE_RATE_HZ, dtype=numpy.int32),
        control_hz=numpy.asarray(compiled["control_hz"], dtype=numpy.int32),
        frame_times_seconds=compiled["frame_times_seconds"],
        frame_centers_48k=compiled["frame_centers_48k"],
        f0_hz=compiled["f0_hz"],
        f0_cents=compiled["f0_cents"],
        target_f0_hz=compiled["f0_hz"],
        loudness_db=compiled["loudness_db"],
        target_loudness_db=compiled["loudness_db"],
        air_noise_ratio=compiled["air_noise_ratio"],
        voicing=compiled["voicing"],
        gesture_state=compiled["gesture_state"],
        event_index=compiled["event_index"],
        vibrato_rate_hz=compiled["vibrato_rate_hz"],
        vibrato_depth_cents=compiled["vibrato_depth_cents"],
        vibrato_cents=compiled["vibrato_cents"],
        reference_contour_cents=compiled["reference_contour_cents"],
        score_features=compiled["score_features"],
    )
    slur_boundary_by_event_index = {
        int(boundary["event_index"]): boundary for boundary in compiled["slur_boundaries"]
    }
    event_summary = []
    for index, event in enumerate(compiled["events"]):
        summary: dict[str, Any] = {
            "id": event["id"],
            "start_seconds": event["start_seconds"],
            "end_seconds": event["end_seconds"],
            "articulation": event["articulation"],
            "pitch_hz": event["pitch_hz"],
            "vibrato_enabled": bool(event["vibrato"]["enabled"]),
            "vibrato": event["vibrato"],
            "reference_contour": event["reference_contour"],
            "musical_context": event["musical_context"],
            "vibrato_policy": event["vibrato_policy"],
        }
        if event["articulation"] == "slur":
            try:
                summary["slur_boundary_f0"] = slur_boundary_by_event_index[index]
            except KeyError as exc:
                raise AssertionError("every compiled SLUR must write its boundary F0 metadata") from exc
        event_summary.append(summary)
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "artifact_kind": "rnd_only_score_to_expression_controls",
        "r_and_d_scope": compiled["scope"],
        "input": {
            "plan_basename": compiled["plan_path"].name,
            "plan_sha256": compiled["plan_sha256"],
            "source_audio_read": False,
            "model_training_run": False,
            "game_or_runtime_asset_read_or_written": False,
        },
        "expression_policy": compiled["expression_policy"],
        "fired_policy_rules": compiled["fired_policy_rules"],
        "controls": {
            "artifact": CONTROL_FILENAME,
            "sha256": _sha256(controls),
            "schema": OUTPUT_SCHEMA,
            "sample_rate_hz": SAMPLE_RATE_HZ,
            "control_hz": compiled["control_hz"],
            "frame_count": int(compiled["f0_hz"].shape[0]),
            "score_feature_dim": int(compiled["score_features"].shape[1]),
            "feature_layout": [
                "normalized_log_f0",
                "normalized_loudness_db",
                "breath_start_one_hot",
                "rearticulate_one_hot",
                "slur_one_hot",
                "release_one_hot",
                "air_noise_ratio",
                "vibrato_rate_hz_div_10",
                "vibrato_depth_cents_div_120",
            ],
            "vibrato_default": "off_unless_explicit_in_plan",
            "reference_contour_default": "off_unless_exact_pinned_unreviewed_contract_is_embedded",
            "vibrato_explicit_range": {
                "rate_hz": list(VIBRATO_RATE_RANGE_HZ),
                "depth_cents": list(VIBRATO_DEPTH_RANGE_CENTS),
                "basis": "conservative local R&D proxy bounds, not labels or a training authorization",
            },
            "slur_transition_policy": compiled["slur_transition_policy"],
            "slur_control_rate_quantization": compiled["slur_control_rate_quantization"],
        },
        "events": event_summary,
        "interpretation_limits": {
            "articulations_are_authorial_score_controls_not_inferred_performance_labels": True,
            "touching_timestamps_never_infer_slur": True,
            "controls_are_not_recording_derived_training_targets": True,
            "reference_contour_is_an_automatic_f0_proxy_not_a_human_reviewed_yoseong_label": True,
            "reference_contour_is_not_learned_gyeonggi_style_training_or_game_material": True,
            "no_audio_is_rendered_or_modified": True,
            "not_a_default_asset_runtime_bgm_game_output_or_public_release": True,
        },
    }
    (output / MANIFEST_FILENAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True, help="one explicit score-expression plan JSON")
    parser.add_argument("--output-dir", required=True, help="fresh R&D-only output directory")
    parser.add_argument("--confirm-rnd-only", action="store_true", help="required acknowledgement: controls are not a game/runtime/training output")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if not args.confirm_rnd_only:
        print("compile_expression: pass --confirm-rnd-only", file=sys.stderr)
        return 2
    try:
        result = render_controls(plan=args.plan, output_dir=args.output_dir)
    except ScoreExpressionError as exc:
        print(f"compile_expression: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
