#!/usr/bin/env python3
"""Verify and byte-copy the four-way B1/B2-R/B2-Rd/B2-Rdf audition."""

from __future__ import annotations

import argparse
import bisect
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys
import tempfile
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple


HERE = Path(__file__).resolve().parent
DEPTH_PACK_TOOLS = HERE.parent / "full-ari-reference-depth-audition-pack"
if str(DEPTH_PACK_TOOLS) not in sys.path:
    sys.path.insert(0, str(DEPTH_PACK_TOOLS))

import build_full_ari_reference_depth_audition_pack as depth_pack  # noqa: E402


reference_pack = depth_pack.reference_pack
full_pack = depth_pack.full_pack

SPEC_SCHEMA = "mini.full-ari-reference-fade-audition-pack-spec.v1"
MANIFEST_SCHEMA = "mini.full-ari-reference-fade-audition-pack.v1"
MANIFEST_FILENAME = "full_ari_reference_fade_audition_manifest.json"
SPEC_SNAPSHOT_FILENAME = "audition_spec.snapshot.json"
LONG_FADE_STATUS = "reference_shape_depth_matched_long_fade_unreviewed"
SOURCE_FADE_OUT_SECONDS = 0.12
TARGET_FADE_OUT_SECONDS = 0.24
END_FADE_TRANSFORM_KIND = "linear_depth_fade_extension"
LONG_FADE_START_SECONDS = 34.32
SHORT_FADE_START_SECONDS = 34.44
FINAL_FADE_ANCHOR_SECONDS = 34.556
LAST_COMMON_FRAME_INDEX = 8_580
FIRST_MODIFIED_FRAME_INDEX = 8_581
IDENTICAL_ACTIVE_ROWS_THROUGH_FADE_START = 316
LONG_FADE_FORMULA_ROWS = 59
TARGET_LINEAR_DEPTH_FORMULA = (
    "(34.556 - t) / (34.556 - 34.32) for 34.32 < t < 34.556; zero at 34.556"
)
SOURCE_LINEAR_DEPTH_FORMULA = (
    "1 through 34.44, then (34.556 - t) / (34.556 - 34.44); zero at 34.556"
)

ROLES = {
    **depth_pack.ROLES,
    "B2-Rdf": "full_ari_b08_sine_b16_reference_shape_depth_matched_long_fade_unreviewed",
}
OUTPUT_AUDIO_NAMES = {
    "B1": "B1_full_ari_contextual_sine_yoseong.wav",
    "B2-R": "B2R_full_ari_reference_shape_unreviewed_raw_depth.wav",
    "B2-Rd": "B2Rd_full_ari_reference_shape_depth_matched_short_fade.wav",
    "B2-Rdf": "B2Rdf_full_ari_reference_shape_depth_matched_long_fade.wav",
}


class ReferenceFadePackError(RuntimeError):
    """A four-way fairness, fade, provenance, or interpretation gate failed."""


def _fail(message: str) -> None:
    raise ReferenceFadePackError(message)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        _fail(f"{label} must be an object")
    return value


def _list(value: Any, label: str) -> List[Any]:
    if not isinstance(value, list):
        _fail(f"{label} must be a list")
    return value


def _text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail(f"{label} must be a non-empty string")
    return value.strip()


def _number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        _fail(f"{label} must be a finite number")
    result = float(value)
    if not math.isfinite(result):
        _fail(f"{label} must be a finite number")
    return result


def _exact(value: Any, expected: float, label: str, tolerance: float = 1.0e-12) -> None:
    actual = _number(value, label)
    if not math.isclose(actual, expected, rel_tol=0.0, abs_tol=tolerance):
        _fail(f"{label} must be exactly {expected}, got {actual}")


def _load_json(path: Path, label: str) -> Mapping[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ReferenceFadePackError(f"{label} is not readable UTF-8 JSON") from exc
    return _mapping(value, label)


def _write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _validated_artifact(
    repository_root: Path, record: Any, label: str
) -> Tuple[Path, Dict[str, Any]]:
    try:
        return full_pack._validated_artifact(repository_root, record, label=label)
    except full_pack.FullAriAuditionPackError as exc:
        raise ReferenceFadePackError(str(exc)) from exc


def _event(events: Sequence[Mapping[str, Any]], event_id: str) -> Mapping[str, Any]:
    matches = [event for event in events if event.get("id") == event_id]
    if len(matches) != 1:
        _fail(f"plan must contain exactly one {event_id} event")
    return matches[0]


def _end_fade_transform() -> Dict[str, Any]:
    return {
        "kind": END_FADE_TRANSFORM_KIND,
        "source_fade_out_seconds": SOURCE_FADE_OUT_SECONDS,
        "target_fade_out_seconds": TARGET_FADE_OUT_SECONDS,
    }


def _runtime_end_fade_transform() -> Dict[str, Any]:
    return {
        "kind": END_FADE_TRANSFORM_KIND,
        "source_status": depth_pack.DEPTH_STATUS,
        "target_status": LONG_FADE_STATUS,
        "source_fade_out_seconds": SOURCE_FADE_OUT_SECONDS,
        "target_fade_out_seconds": TARGET_FADE_OUT_SECONDS,
        "target_fade_is_strict_extension_gate_passed": True,
        "target_fade_start_seconds_relative_to_contour": 1.26,
        "target_fade_start_seconds_absolute": LONG_FADE_START_SECONDS,
        "source_fade_start_seconds_relative_to_contour": 1.38,
        "source_fade_start_seconds_absolute": SHORT_FADE_START_SECONDS,
        "final_zero_anchor_seconds_absolute": FINAL_FADE_ANCHOR_SECONDS,
        "last_b2rd_identical_frame_index": LAST_COMMON_FRAME_INDEX,
        "last_b2rd_identical_time_seconds": LONG_FADE_START_SECONDS,
        "first_b2rdf_modified_frame_index": FIRST_MODIFIED_FRAME_INDEX,
        "first_b2rdf_modified_time_seconds": FIRST_MODIFIED_FRAME_INDEX / full_pack.CONTROL_RATE_HZ,
        "target_linear_depth_formula": TARGET_LINEAR_DEPTH_FORMULA,
        "source_linear_depth_formula": SOURCE_LINEAR_DEPTH_FORMULA,
        "source_artifact_payload_depth_scale_and_negative_claims_preserved": True,
        "b08_outside_end_fade_application_scope_gate_passed": True,
        "b2rd_controls_at_or_before_34_32_seconds_exact_gate_passed": True,
        "b2rd_relative_long_fade_formula_gate_passed": True,
        "identical_active_control_row_count_through_fade_start": (
            IDENTICAL_ACTIVE_ROWS_THROUGH_FADE_START
        ),
        "long_fade_formula_control_row_count": LONG_FADE_FORMULA_ROWS,
    }


def _validate_long_fade_reference_block(
    event: Mapping[str, Any], reference: Mapping[str, Any], label: str
) -> Mapping[str, Any]:
    if _mapping(event.get("vibrato"), f"{label} vibrato") != {"enabled": False}:
        _fail(f"{label} must disable sine vibrato")
    block = _mapping(event.get("reference_contour"), f"{label} reference contour")
    expected_keys = {
        "status",
        "onset_seconds",
        "duration_seconds",
        "fade_in_seconds",
        "fade_out_seconds",
        "fade_shape",
        "source_artifact",
        "normalized_reference_contour",
        "claim_limits",
        "depth_transform",
        "end_fade_transform",
    }
    if set(block) != expected_keys:
        _fail(f"{label} has unexpected or missing reference fields")
    if block.get("status") != LONG_FADE_STATUS:
        _fail(f"{label} must be labelled {LONG_FADE_STATUS}")
    for key, expected in {
        "onset_seconds": reference_pack.REFERENCE_ONSET_SECONDS,
        "duration_seconds": reference_pack.REFERENCE_DURATION_SECONDS,
        "fade_in_seconds": reference_pack.REFERENCE_FADE_SECONDS,
        "fade_out_seconds": TARGET_FADE_OUT_SECONDS,
    }.items():
        _exact(block.get(key), expected, f"{label}.{key}")
    if block.get("fade_shape") != reference_pack.REFERENCE_FADE_SHAPE:
        _fail(f"{label} fade shape differs")
    source = _mapping(block.get("source_artifact"), f"{label} source artifact")
    expected_source = {
        "relative_path": reference["repository_relative_path"],
        "sha256": reference["sha256"],
        "schema": reference["schema"],
        "candidate_id": reference["candidate_id"],
        "selection_status": reference["selection_status"],
        "contour_payload_sha256": reference["contour_payload_sha256"],
        "source_id": reference["source_id"],
        "source_sha256": reference["source_sha256"],
        "rights_status": reference["rights_status"],
    }
    if dict(source) != expected_source:
        _fail(f"{label} source identity differs from B2-Rd")
    if block.get("normalized_reference_contour") != reference["normalized_reference_contour"]:
        _fail(f"{label} does not retain the exact unscaled 65-point source contour")
    if block.get("claim_limits") != reference["claim_limits"]:
        _fail(f"{label} claim limits differ from the source artifact")
    transform = _mapping(block.get("depth_transform"), f"{label} depth transform")
    if dict(transform) != depth_pack._expected_depth_transform():
        _fail(f"{label} depth transform differs from B2-Rd")
    fade_transform = _mapping(block.get("end_fade_transform"), f"{label} end fade transform")
    if dict(fade_transform) != _end_fade_transform():
        _fail(f"{label} end fade transform differs from the pinned extension")
    return block


def _source_residual_cents(reference: Mapping[str, Any], frame_index: int) -> float:
    elapsed = frame_index / full_pack.CONTROL_RATE_HZ - reference_pack.REFERENCE_START_SECONDS
    if elapsed < -1.0e-12 or elapsed >= reference_pack.REFERENCE_DURATION_SECONDS - 1.0e-12:
        return 0.0
    elapsed = max(0.0, elapsed)
    if elapsed <= 1.0e-12:
        return 0.0
    normalized_time = elapsed / reference_pack.REFERENCE_DURATION_SECONDS
    contour = reference["normalized_reference_contour"]
    times = [float(value) for value in contour["time_normalized_0_to_1"]]
    pitches = [float(value) for value in contour["pitch_residual_cents"]]
    right = bisect.bisect_right(times, normalized_time)
    if right <= 0:
        raw = pitches[0]
    elif right >= len(times):
        raw = pitches[-1]
    else:
        left = right - 1
        progress = (normalized_time - times[left]) / (times[right] - times[left])
        raw = pitches[left] + (pitches[right] - pitches[left]) * progress
    fade_in = min(1.0, max(0.0, elapsed / reference_pack.REFERENCE_FADE_SECONDS))
    return raw * fade_in * depth_pack.DEPTH_SCALE


def _fade_envelope(time_seconds: float, fade_start_seconds: float) -> float:
    if time_seconds <= fade_start_seconds + 1.0e-12:
        return 1.0
    if time_seconds >= FINAL_FADE_ANCHOR_SECONDS - 1.0e-12:
        return 0.0
    return (FINAL_FADE_ANCHOR_SECONDS - time_seconds) / (
        FINAL_FADE_ANCHOR_SECONDS - fade_start_seconds
    )


def _expected_long_fade_cents(reference: Mapping[str, Any], frame_index: int) -> float:
    if frame_index < reference_pack.REFERENCE_START_FRAME or frame_index > reference_pack.REFERENCE_FINAL_FRAME:
        return 0.0
    time_seconds = frame_index / full_pack.CONTROL_RATE_HZ
    return _source_residual_cents(reference, frame_index) * _fade_envelope(
        time_seconds, LONG_FADE_START_SECONDS
    )


def _validate_long_fade_policy(
    policy: Mapping[str, Any], *, plan_sha: str
) -> Dict[str, Any]:
    if policy.get("schema") != full_pack.POLICY_SCHEMA:
        _fail("B2-Rdf score-expression manifest schema is unsupported")
    scope = _mapping(policy.get("r_and_d_scope"), "B2-Rdf policy scope")
    if any(scope.get(key) is not True for key in ("r_and_d_only", "no_default_assets", "no_game_output")):
        _fail("B2-Rdf policy is not R&D-only/no-game")
    policy_input = _mapping(policy.get("input"), "B2-Rdf policy input")
    if policy_input.get("plan_sha256") != plan_sha:
        _fail("B2-Rdf policy does not bind the supplied plan")
    expression = _mapping(policy.get("expression_policy"), "B2-Rdf expression policy")
    if expression.get("automatic_activation") is not False or expression.get("default_decision") != "off":
        _fail("B2-Rdf expression policy must remain explicit/default-off")
    fired = _list(policy.get("fired_policy_rules"), "B2-Rdf fired rules")
    selected = [
        _mapping(item, "B2-Rdf selected rule")
        for item in fired
        if isinstance(item, Mapping) and item.get("decision") in {"selected", LONG_FADE_STATUS}
    ]
    selected_events = sorted(_text(item.get("event_id"), "B2-Rdf selected event") for item in selected)
    if selected_events != sorted((reference_pack.SHARED_SINE_EVENT_ID, reference_pack.REFERENCE_EVENT_ID)):
        _fail("B2-Rdf policy must select b08 and b16 only")
    b16 = next(item for item in selected if item.get("event_id") == reference_pack.REFERENCE_EVENT_ID)
    if b16.get("decision") != LONG_FADE_STATUS or b16.get("style") != LONG_FADE_STATUS:
        _fail("B2-Rdf b16 policy does not retain its long-fade-unreviewed label")
    return {
        "passed": True,
        "automatic_activation": False,
        "default_decision": "off",
        "selected_event_ids": selected_events,
        "b16_decision": LONG_FADE_STATUS,
        "evidence_status": expression.get("evidence_status"),
    }


def _validate_long_fade_runtime_qa(
    report: Mapping[str, Any],
    controls: Mapping[str, Any],
    reference: Mapping[str, Any],
) -> Dict[str, Any]:
    score_controls = _mapping(report.get("score_controls"), "B2-Rdf score controls")
    qa = _mapping(
        score_controls.get("reference_contour_control_qa"),
        "B2-Rdf reference-contour QA",
    )
    if qa.get("passed") is not True or qa.get("status") != LONG_FADE_STATUS or qa.get("event_count") != 1:
        _fail("B2-Rdf runtime reference-contour QA status/count did not pass")
    if qa.get("claim_boundary") != reference_pack.REFERENCE_CLAIM_BOUNDARY:
        _fail("B2-Rdf runtime reference claim boundary differs")
    if qa.get("application_scope") != depth_pack.REFERENCE_APPLICATION_SCOPE:
        _fail("B2-Rdf runtime application scope differs")
    if not (
        qa.get("learned_claim") is False
        and qa.get("style_aligned_claim") is False
        and qa.get("human_reviewed_claim") is False
        and qa.get("training_or_game_clearance") is False
    ):
        _fail("B2-Rdf runtime makes a learned/style/reviewed/training/game claim")
    records = _list(qa.get("events"), "B2-Rdf reference QA events")
    if len(records) != 1:
        _fail("B2-Rdf runtime must report exactly one reference event")
    record = _mapping(records[0], "B2-Rdf reference QA event")
    expected_identity = {
        "event_id": reference_pack.REFERENCE_EVENT_ID,
        "status": LONG_FADE_STATUS,
        "candidate_id": reference["candidate_id"],
        "source_id": reference["source_id"],
        "source_sha256": reference["source_sha256"],
        "source_artifact_sha256": reference["sha256"],
        "contour_payload_sha256": reference["contour_payload_sha256"],
        "rights_status": reference["rights_status"],
        "source_sample_count": reference_pack.EXPECTED_REFERENCE_POINTS,
        "fade_shape": reference_pack.REFERENCE_FADE_SHAPE,
        "expected_active_control_frame_count": reference_pack.EXPECTED_REFERENCE_ACTIVE_FRAMES,
        "active_control_frame_count": reference_pack.EXPECTED_REFERENCE_ACTIVE_FRAMES,
        "first_active_frame_index": reference_pack.REFERENCE_START_FRAME,
        "final_active_frame_index": reference_pack.REFERENCE_FINAL_FRAME,
        "source_endpoint_remapped_to_final_half_open_row": False,
        "truncated_before_reference_contour": False,
        "truncated_during_reference_contour": False,
        "target_max_abs_not_exceeded_gate_passed": True,
    }
    for key, expected in expected_identity.items():
        if record.get(key) != expected:
            _fail(f"B2-Rdf runtime reference QA {key} differs")
    for key, expected in {
        "source_duration_seconds": reference_pack.REFERENCE_DURATION_SECONDS,
        "applied_duration_seconds": reference_pack.REFERENCE_DURATION_SECONDS,
        "onset_seconds_relative": reference_pack.REFERENCE_ONSET_SECONDS,
        "event_start_seconds": 32.4,
        "contour_start_seconds": reference_pack.REFERENCE_START_SECONDS,
        "contour_end_seconds": reference_pack.REFERENCE_END_SECONDS,
        "fade_in_seconds": reference_pack.REFERENCE_FADE_SECONDS,
        "fade_out_seconds": TARGET_FADE_OUT_SECONDS,
        "final_source_normalized_time": reference_pack.REFERENCE_FINAL_SOURCE_NORMALIZED_TIME,
    }.items():
        _exact(record.get(key), expected, f"B2-Rdf runtime QA {key}")
    if record.get("time_mapping") != reference_pack.REFERENCE_TIME_MAPPING:
        _fail("B2-Rdf time mapping differs")
    if record.get("interpolation") != reference_pack.REFERENCE_INTERPOLATION:
        _fail("B2-Rdf interpolation differs")
    for key in (
        "first_boundary_zero_gate_passed",
        "final_boundary_zero_gate_passed",
        "final_nominal_pitch_gate_passed",
        "no_time_compression_gate_passed",
    ):
        if record.get(key) is not True:
            _fail(f"B2-Rdf runtime gate {key} did not pass")
    if record.get("nonzero_interior_frame_count") != 373:
        _fail("B2-Rdf does not retain 373 nonzero interior rows")
    if abs(_number(record.get("first_active_vibrato_cents"), "B2-Rdf first boundary")) > 1.0e-10:
        _fail("B2-Rdf first boundary is not zero cents")
    if abs(_number(record.get("final_active_vibrato_cents"), "B2-Rdf final boundary")) > 1.0e-10:
        _fail("B2-Rdf final boundary is not zero cents")
    nominal = _number(record.get("nominal_pitch_hz"), "B2-Rdf nominal pitch")
    _exact(record.get("final_active_f0_hz"), nominal, "B2-Rdf final nominal pitch", 1.0e-9)
    depth_transform = _mapping(record.get("depth_transform"), "B2-Rdf runtime depth transform")
    expected_depth_transform = {
        "operation": depth_pack.DEPTH_TRANSFORM_OPERATION,
        "kind": depth_pack.DEPTH_TRANSFORM_KIND,
        "application_order": depth_pack.DEPTH_APPLICATION_ORDER,
        "source_max_abs_cents": depth_pack.SOURCE_MAX_ABS_CENTS,
        "source_max_abs_cents_recomputed_from_embedded_points": depth_pack.SOURCE_MAX_ABS_CENTS,
        "target_max_abs_cents": depth_pack.TARGET_MAX_ABS_CENTS,
        "scale": depth_pack.DEPTH_SCALE,
        "transformed_embedded_source_max_abs_cents": depth_pack.TARGET_MAX_ABS_CENTS,
        "source_max_matches_embedded_points_gate_passed": True,
        "scale_equals_target_over_source_gate_passed": True,
        "transformed_embedded_source_hits_target_gate_passed": True,
        "source_artifact_and_payload_identity_preserved": True,
        "embedded_pitch_points_modified": False,
        "learned_or_style_aligned_transform": False,
    }
    if dict(depth_transform) != expected_depth_transform:
        _fail("B2-Rdf depth transform differs from B2-Rd")
    end_fade_transform = _mapping(
        record.get("end_fade_transform"), "B2-Rdf runtime end fade transform"
    )
    if dict(end_fade_transform) != _runtime_end_fade_transform():
        _fail("B2-Rdf runtime end fade transform or comparison gates differ")

    rows = controls["rows"]
    by_index = {
        row["frame_index"]: row
        for row in rows
        if row["event_id"] == reference_pack.REFERENCE_EVENT_ID
    }
    if set(by_index) != set(range(8_100, 8_640)):
        _fail("B2-Rdf b16 controls do not occupy the exact score interval")
    actual_max = 0.0
    for index in range(8_100, 8_640):
        expected_cents = _expected_long_fade_cents(reference, index)
        actual_cents = by_index[index]["vibrato_cents"]
        if not math.isclose(actual_cents, expected_cents, rel_tol=0.0, abs_tol=1.0e-10):
            _fail("B2-Rdf controls differ from the pinned long-fade formula")
        expected_f0 = nominal * math.pow(2.0, expected_cents / 1_200.0)
        if not math.isclose(by_index[index]["f0_hz"], expected_f0, rel_tol=0.0, abs_tol=1.0e-9):
            _fail("B2-Rdf F0 differs from nominal pitch plus long-faded contour")
        actual_max = max(actual_max, abs(actual_cents))
    if actual_max > depth_pack.TARGET_MAX_ABS_CENTS + 1.0e-10:
        _fail("B2-Rdf exceeds the 18-cent depth target")
    _exact(record.get("actual_runtime_max_abs_cents"), actual_max, "B2-Rdf runtime maximum", 1.0e-10)
    return {
        "passed": True,
        "status": LONG_FADE_STATUS,
        "event_id": reference_pack.REFERENCE_EVENT_ID,
        "fade_out_seconds": TARGET_FADE_OUT_SECONDS,
        "fade_start_seconds": LONG_FADE_START_SECONDS,
        "last_common_frame_index": LAST_COMMON_FRAME_INDEX,
        "first_modified_frame_index": FIRST_MODIFIED_FRAME_INDEX,
        "actual_runtime_max_abs_cents": actual_max,
        "target_max_abs_cents": depth_pack.TARGET_MAX_ABS_CENTS,
        "source_artifact_and_payload_identity_preserved": depth_transform[
            "source_artifact_and_payload_identity_preserved"
        ],
        "time_compressed": False,
        "boundary_rows_zero_cents": True,
        "runtime_qa": dict(record),
    }


def _long_fade_candidate(
    repository_root: Path,
    candidate: Mapping[str, Any],
    reference: Mapping[str, Any],
) -> Dict[str, Any]:
    slot = "B2-Rdf"
    report_path, report_source = _validated_artifact(
        repository_root, candidate.get("runtime_report"), f"{slot}.runtime_report"
    )
    plan_path, plan_source = _validated_artifact(
        repository_root, candidate.get("plan_artifact"), f"{slot}.plan_artifact"
    )
    policy_path, policy_source = _validated_artifact(
        repository_root, candidate.get("policy_manifest"), f"{slot}.policy_manifest"
    )
    report = _load_json(report_path, f"{slot} runtime report")
    plan = _load_json(plan_path, f"{slot} score plan")
    policy = _load_json(policy_path, f"{slot} policy manifest")
    if report.get("schema") != full_pack.RUNTIME_SCHEMA or report.get("status") != "succeeded":
        _fail("B2-Rdf runtime report is not successful/supported")
    scope = _mapping(report.get("scope"), "B2-Rdf runtime scope")
    actions = _mapping(report.get("actions_performed"), "B2-Rdf runtime actions")
    if not (
        scope.get("r_and_d_only") is True
        and scope.get("no_default_bgm_changed") is True
        and scope.get("not_a_game_asset") is True
        and actions.get("default_bgm_changed") is False
        and actions.get("experimental_hard_f0_step") is True
        and actions.get("learned_reverb_called") is True
    ):
        _fail("B2-Rdf runtime is not an offline R&D hard-step wet render")
    try:
        events, plan_qa = full_pack._plan_events(report, plan_source["sha256"])
        controls_path, controls_source = full_pack._resolve_report_output(
            report_path, report, key="controls_csv", label="B2-Rdf controls"
        )
        audio_path, audio_source = full_pack._resolve_report_output(
            report_path,
            report,
            key="checkpoint_native_reverb_score_length_wav",
            label="B2-Rdf score-length wet WAV",
        )
        controls = full_pack._load_controls(controls_path)
        rest_qa = full_pack._validate_written_rest(controls, report)
        release_qa = full_pack._validate_release(report, controls, plan_qa)
        audio_metrics = full_pack._audio_metrics(audio_path, require_target=False)
        level_qa = full_pack._validate_level_match(report, slot=slot)
    except full_pack.FullAriAuditionPackError as exc:
        raise ReferenceFadePackError(str(exc)) from exc
    score_controls = _mapping(report.get("score_controls"), "B2-Rdf score controls")
    if score_controls.get("renderer_control_hz") != 250 or score_controls.get("frame_count") != 8_700:
        _fail("B2-Rdf does not contain the exact 250 Hz / 8,700-frame controls")
    slur = _mapping(score_controls.get("slur_transition_policy"), "B2-Rdf slur policy")
    if slur.get("pitch_mode") != full_pack.HARD_STEP_MODE:
        _fail("B2-Rdf is not the hard-step transition baseline")

    plan_events = [_mapping(item, "B2-Rdf plan event") for item in _list(plan.get("events"), "B2-Rdf plan events")]
    plan_b08 = _event(plan_events, reference_pack.SHARED_SINE_EVENT_ID)
    plan_b16 = _event(plan_events, reference_pack.REFERENCE_EVENT_ID)
    report_b08 = _event(events, reference_pack.SHARED_SINE_EVENT_ID)
    report_b16 = _event(events, reference_pack.REFERENCE_EVENT_ID)
    if plan_b08.get("vibrato") != report_b08.get("vibrato"):
        _fail("B2-Rdf runtime b08 expression differs from its plan")
    reference_pack._sine_shape(report_b08, "B2-Rdf b08")
    if sorted(full_pack._enabled_vibrato_event_ids(events)) != [reference_pack.SHARED_SINE_EVENT_ID]:
        _fail("B2-Rdf must retain sine vibrato on b08 only")
    plan_reference = _validate_long_fade_reference_block(plan_b16, reference, "B2-Rdf plan b16")
    report_reference = _validate_long_fade_reference_block(report_b16, reference, "B2-Rdf runtime b16")
    if plan_reference != report_reference:
        _fail("B2-Rdf runtime reference block differs from its plan")
    if controls["nonzero_vibrato_event_ids"] != sorted((reference_pack.SHARED_SINE_EVENT_ID, reference_pack.REFERENCE_EVENT_ID)):
        _fail("B2-Rdf controls must contain b08 sine and b16 reference motion only")
    reference_qa = _validate_long_fade_runtime_qa(report, controls, reference)
    policy_qa = _validate_long_fade_policy(policy, plan_sha=plan_source["sha256"])
    render = _mapping(report.get("render"), "B2-Rdf render")
    runtime = _mapping(render.get("runtime"), "B2-Rdf render runtime")
    if not isinstance(runtime.get("seed"), int):
        _fail("B2-Rdf renderer seed is missing")
    reverb = _mapping(report.get("checkpoint_native_reverb_audition"), "B2-Rdf reverb")
    reverb_runtime = _mapping(reverb.get("runtime"), "B2-Rdf reverb runtime")
    reverb_source = _mapping(reverb_runtime.get("source"), "B2-Rdf reverb source")
    for path, record in ((controls_path, controls_source), (audio_path, audio_source)):
        record["repository_relative_path"] = path.relative_to(repository_root).as_posix()
    return {
        "slot": slot,
        "role": candidate["role"],
        "report_path": report_path,
        "plan_path": plan_path,
        "policy_path": policy_path,
        "controls_path": controls_path,
        "audio_path": audio_path,
        "report_source": report_source,
        "plan_source": plan_source,
        "policy_source": policy_source,
        "controls_source": controls_source,
        "audio_source": audio_source,
        "events": events,
        "controls": controls,
        "score_skeleton": full_pack._score_skeleton(events),
        "checkpoint_signature": report.get("checkpoint"),
        "public_sources_signature": report.get("public_sources"),
        "renderer_seed": runtime["seed"],
        "reverb_source": dict(reverb_source),
        "plan_qa": plan_qa,
        "rest_qa": rest_qa,
        "release_qa": release_qa,
        "audio_metrics": audio_metrics,
        "level_qa": level_qa,
        "expression_qa": {
            "passed": True,
            "expression_kind": "b08_sine_plus_b16_depth_matched_long_fade_reference",
            "sine_event_ids": [reference_pack.SHARED_SINE_EVENT_ID],
            "reference_event_ids": [reference_pack.REFERENCE_EVENT_ID],
            "learned": False,
        },
        "reference_qa": reference_qa,
        "reference_block": dict(report_reference),
        "policy_qa": policy_qa,
    }


def _compare_four(
    b1: Mapping[str, Any],
    b2r: Mapping[str, Any],
    b2rd: Mapping[str, Any],
    b2rdf: Mapping[str, Any],
) -> Dict[str, Any]:
    try:
        three_way = depth_pack._compare_three(b1, b2r, b2rd)
        depth_pack._common_comparison(b2rd, b2rdf, "B2-Rdf versus B2-Rd")
    except depth_pack.ReferenceDepthPackError as exc:
        raise ReferenceFadePackError(str(exc)) from exc

    short_rows = {row["frame_index"]: row for row in b2rd["controls"]["rows"]}
    long_rows = {row["frame_index"]: row for row in b2rdf["controls"]["rows"]}
    changed_frames: List[int] = []
    for index, short in short_rows.items():
        long = long_rows[index]
        event_id = str(short["event_id"])
        if event_id != reference_pack.REFERENCE_EVENT_ID:
            for field in ("f0_hz", "vibrato_cents"):
                if not math.isclose(short[field], long[field], rel_tol=0.0, abs_tol=1.0e-12):
                    _fail(f"B2-Rdf changes non-b16 numeric control field {field}")
            continue
        time_seconds = float(short["time_seconds"])
        if time_seconds <= LONG_FADE_START_SECONDS + 1.0e-12:
            for field in ("f0_hz", "vibrato_cents"):
                if not math.isclose(short[field], long[field], rel_tol=0.0, abs_tol=1.0e-12):
                    _fail("B2-Rdf changes b16 controls at or before the 34.32-second fade start")
        else:
            expected_short_envelope = _fade_envelope(time_seconds, SHORT_FADE_START_SECONDS)
            expected_long_envelope = _fade_envelope(time_seconds, LONG_FADE_START_SECONDS)
            short_cents = short["vibrato_cents"]
            long_cents = long["vibrato_cents"]
            if expected_short_envelope > 0.0:
                expected_long = short_cents * expected_long_envelope / expected_short_envelope
            else:
                expected_long = 0.0
            if not math.isclose(long_cents, expected_long, rel_tol=0.0, abs_tol=1.0e-10):
                _fail("B2-Rdf post-start controls violate the pinned relative fade formula")
            if not math.isclose(short_cents, long_cents, rel_tol=0.0, abs_tol=1.0e-12):
                changed_frames.append(index)
    if not changed_frames or min(changed_frames) != FIRST_MODIFIED_FRAME_INDEX:
        _fail("B2-Rdf first numeric difference is not frame 8581 / 34.324 seconds")
    if max(changed_frames) > reference_pack.REFERENCE_FINAL_FRAME - 1:
        _fail("B2-Rdf changes the shared zero endpoint or release")

    short_block = b2rd["reference_block"]
    long_block = b2rdf["reference_block"]
    short_common = dict(short_block)
    short_common.pop("status", None)
    short_common.pop("fade_out_seconds", None)
    long_common = dict(long_block)
    long_common.pop("status", None)
    long_common.pop("fade_out_seconds", None)
    long_common.pop("end_fade_transform", None)
    if short_common != long_common:
        _fail("B2-Rdf changes B2-Rd shape/source/depth/onset/duration/fade-in provenance")
    return {
        "passed": True,
        "B1_B2R_B2Rd_three_way_contract": three_way,
        "same_59_note_nominal_skeleton_and_nonexpression_controls_all_four": True,
        "same_checkpoint_public_sources_seed_reverb_and_B0_gain_all_four": True,
        "b08_exact_all_four": True,
        "B2Rd_vs_B2Rdf_same_source_shape_depth_onset_duration_and_fade_in": True,
        "only_authored_change": {
            "event_id": reference_pack.REFERENCE_EVENT_ID,
            "field": "fade_out_seconds",
            "source_seconds": SOURCE_FADE_OUT_SECONDS,
            "target_seconds": TARGET_FADE_OUT_SECONDS,
            "transform": _end_fade_transform(),
        },
        "last_common_frame": {
            "frame_index": LAST_COMMON_FRAME_INDEX,
            "time_seconds": LONG_FADE_START_SECONDS,
        },
        "first_modified_frame": {
            "frame_index": FIRST_MODIFIED_FRAME_INDEX,
            "time_seconds": FIRST_MODIFIED_FRAME_INDEX / 250.0,
        },
        "long_fade_formula": (
            "for 34.32 < t < 34.556, envelope=(34.556-t)/(34.556-34.32); "
            "interpolated residual and depth scale remain unchanged"
        ),
        "shared_zero_endpoint_and_nominal_release": True,
        "audio_bytes_copied_without_transform": True,
    }


def _copy_verified(source: Path, destination: Path, expected_sha: str) -> Dict[str, Any]:
    shutil.copyfile(source, destination)
    if _sha256(source) != expected_sha or _sha256(destination) != expected_sha:
        _fail("artifact bytes changed while assembling the four-way pack")
    return full_pack._file_record(destination)


def _listening_readme() -> str:
    return """# Full-Arirang B1 / B2-R / B2-Rd / B2-Rdf offline audition

B2-Rdf differs from B2-Rd only by extending b16's linear-depth fade-out from
120 ms to 240 ms. Controls are identical through 34.320 seconds; the first
modified row is frame 8581 at 34.324 seconds. Both close at zero cents on frame
8639 and release at nominal pitch.

Every reference variant remains an automatic periodic-F0 proxy: unreviewed,
not learned, not confirmed as yoseong, not Gyeonggi-style-validated, not a
training item, and not cleared for game or distribution. The packer copied
verified WAV bytes unchanged and performed no audio processing.
"""


def build_full_ari_reference_fade_audition_pack(
    repository_root: Path,
    spec_path: Path,
    output_dir: Path,
    *,
    baseline_revision: str = full_pack.DEFAULT_BGM_BASELINE_REVISION,
) -> Dict[str, Any]:
    repository_root = repository_root.expanduser().resolve()
    spec_path = spec_path.expanduser().resolve()
    output_dir = output_dir.expanduser().resolve()
    if not repository_root.is_dir():
        _fail("repository root is not a directory")
    try:
        spec_relative = spec_path.relative_to(repository_root).as_posix()
        output_relative = output_dir.relative_to(repository_root).as_posix()
    except ValueError as exc:
        raise ReferenceFadePackError("spec and output must stay inside the repository") from exc
    if not output_relative.startswith("_bgm_rnd/"):
        _fail("output must be inside ignored _bgm_rnd/")
    if output_dir.exists() or not output_dir.parent.is_dir():
        _fail("output must be a fresh directory whose parent already exists")
    spec = _load_json(spec_path, "four-way audition spec")
    if spec.get("schema") != SPEC_SCHEMA:
        _fail("unsupported four-way audition spec schema")
    candidates = _mapping(spec.get("candidates"), "spec candidates")
    if set(candidates) != set(ROLES):
        _fail("spec must contain exactly B1, B2-R, B2-Rd, and B2-Rdf")
    reference_record = _mapping(spec.get("reference_artifact"), "spec reference artifact")
    try:
        reference_path, _, reference = reference_pack._reference_artifact(
            repository_root, reference_record
        )
        guard = full_pack.validate_default_bgm_untouched(
            repository_root, baseline_revision=baseline_revision
        )
    except (reference_pack.ReferenceContourPackError, full_pack.FullAriAuditionPackError) as exc:
        raise ReferenceFadePackError(str(exc)) from exc

    ready: Dict[str, Dict[str, Any]] = {}
    for slot in ("B1", "B2-R"):
        candidate = _mapping(candidates[slot], f"candidates.{slot}")
        if candidate.get("status") != "ready" or candidate.get("role") != ROLES[slot]:
            _fail(f"{slot} is not ready under its fixed role")
        try:
            ready[slot] = reference_pack._runtime_candidate(
                repository_root, slot, candidate, reference
            )
        except reference_pack.ReferenceContourPackError as exc:
            raise ReferenceFadePackError(str(exc)) from exc
    depth_candidate = _mapping(candidates["B2-Rd"], "candidates.B2-Rd")
    if depth_candidate.get("status") != "ready" or depth_candidate.get("role") != ROLES["B2-Rd"]:
        _fail("B2-Rd is not ready under its fixed role")
    try:
        ready["B2-Rd"] = depth_pack._depth_runtime_candidate(
            repository_root, depth_candidate, reference
        )
    except depth_pack.ReferenceDepthPackError as exc:
        raise ReferenceFadePackError(str(exc)) from exc
    fade_candidate = _mapping(candidates["B2-Rdf"], "candidates.B2-Rdf")
    if fade_candidate.get("status") != "ready" or fade_candidate.get("role") != ROLES["B2-Rdf"]:
        _fail("B2-Rdf is not ready under its fixed role")
    ready["B2-Rdf"] = _long_fade_candidate(
        repository_root, fade_candidate, reference
    )
    fairness = _compare_four(
        ready["B1"], ready["B2-R"], ready["B2-Rd"], ready["B2-Rdf"]
    )

    source_paths = {reference_path, spec_path}
    for item in ready.values():
        source_paths.update(item[key] for key in (
            "report_path", "plan_path", "policy_path", "controls_path", "audio_path"
        ))
    source_hashes = {path: _sha256(path) for path in source_paths}
    spec_sha = source_hashes[spec_path]
    manifest_candidates: Dict[str, Any] = {}
    with tempfile.TemporaryDirectory(prefix=".full-ari-reference-fade-pack-", dir=str(output_dir.parent)) as temp:
        staging = Path(temp)
        provenance_dir = staging / "provenance"
        provenance_dir.mkdir()
        _copy_verified(spec_path, staging / SPEC_SNAPSHOT_FILENAME, spec_sha)
        reference_copy = _copy_verified(
            reference_path,
            provenance_dir / "reference_shape_unreviewed.json",
            reference["sha256"],
        )
        for slot in ("B1", "B2-R", "B2-Rd", "B2-Rdf"):
            item = ready[slot]
            output_audio = staging / OUTPUT_AUDIO_NAMES[slot]
            audio_record = _copy_verified(
                item["audio_path"], output_audio, item["audio_source"]["sha256"]
            )
            safe_slot = slot.replace("-", "")
            packaged: Dict[str, Any] = {}
            for source_key, suffix, record_key in (
                ("report_path", "runtime_report.json", "report_source"),
                ("plan_path", "score_plan.json", "plan_source"),
                ("policy_path", "score_expression_manifest.json", "policy_source"),
                ("controls_path", "score_controls_250hz.csv", "controls_source"),
            ):
                filename = f"{safe_slot}_{suffix}"
                record = _copy_verified(
                    item[source_key], provenance_dir / filename, item[record_key]["sha256"]
                )
                packaged[source_key.removesuffix("_path")] = {
                    "filename": f"provenance/{filename}", **record
                }
            manifest_candidates[slot] = {
                "status": "ready",
                "role": item["role"],
                "audio": {
                    "filename": output_audio.name,
                    **audio_record,
                    "metrics": item["audio_metrics"],
                    "copied_without_transform": True,
                },
                "source_provenance": {
                    "runtime_report": item["report_source"],
                    "score_plan": item["plan_source"],
                    "score_expression_manifest": item["policy_source"],
                    "controls_csv": item["controls_source"],
                    "wet_audition_wav": item["audio_source"],
                },
                "packaged_provenance": packaged,
                "full_score_qa": item["plan_qa"],
                "written_rest_qa": item["rest_qa"],
                "release_qa": item["release_qa"],
                "expression_qa": item["expression_qa"],
                "reference_contour_qa": item["reference_qa"],
                "policy_qa": item["policy_qa"],
                "monitoring_and_gain_qa": item["level_qa"],
            }
        try:
            guard = full_pack.validate_default_bgm_untouched(
                repository_root, baseline_revision=baseline_revision
            )
        except full_pack.FullAriAuditionPackError as exc:
            raise ReferenceFadePackError(str(exc)) from exc
        manifest: Dict[str, Any] = {
            "schema": MANIFEST_SCHEMA,
            "status": "succeeded",
            "scope": {
                "offline_rnd_only": True,
                "unreviewed_reference_shapes": True,
                "learned_result": False,
                "gyeonggi_style_validated": False,
                "human_musicological_reviewed": False,
                "yoseong_confirmed": False,
                "training_item": False,
                "game_asset": False,
                "distribution_ready": False,
                "rights_cleared": False,
                "no_audio_generated_or_transformed_by_packer": True,
                "default_bgm_no_touch_guard": guard,
            },
            "fixed_comparison_contract": {
                "voiced_score_event_count": 59,
                "release_event_count": 1,
                "score_end_seconds": 34.56,
                "release_end_seconds": 34.8,
                "control_rate_hz": 250,
                "control_frame_count": 8_700,
                "monitoring_interval_seconds": [0.0, 34.56],
                "reference_event_id": reference_pack.REFERENCE_EVENT_ID,
                "reference_duration_seconds": 1.5,
                "depth_scale": depth_pack.DEPTH_SCALE,
                "short_fade_out_seconds": SOURCE_FADE_OUT_SECONDS,
                "long_fade_out_seconds": TARGET_FADE_OUT_SECONDS,
                "long_fade_start_seconds": LONG_FADE_START_SECONDS,
                "final_fade_anchor_seconds": FINAL_FADE_ANCHOR_SECONDS,
            },
            "spec": {
                "repository_relative_path": spec_relative,
                "sha256": spec_sha,
                "snapshot_filename": SPEC_SNAPSHOT_FILENAME,
            },
            "reference_artifact": {
                **{key: value for key, value in reference.items() if key != "normalized_reference_contour"},
                "packaged_provenance": {
                    "filename": "provenance/reference_shape_unreviewed.json",
                    **reference_copy,
                },
            },
            "comparison_contract": fairness,
            "candidates": manifest_candidates,
            "interpretation_limits": {
                "B1_is_provisional_rule_based_sine_not_performance_truth": True,
                "all_reference_variants_are_unreviewed_F0_proxies_not_learned_results": True,
                "fade_extension_is_a_numeric_audition_control_not_musicological_validation": True,
                "no_reference_variant_is_confirmed_yoseong_or_Gyeonggi_minyo_style": True,
                "no_candidate_is_a_training_item_or_game_asset": True,
                "checkpoint_weights_are_not_established_as_game_distribution_cleared": True,
            },
        }
        _write_json(staging / MANIFEST_FILENAME, manifest)
        (staging / "README.md").write_text(_listening_readme(), encoding="utf-8")
        if any(_sha256(path) != digest for path, digest in source_hashes.items()):
            _fail("a source artifact changed while assembling the four-way pack")
        staging.rename(output_dir)
    return manifest


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository-root", type=Path, required=True)
    parser.add_argument("--spec", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parser().parse_args(argv)
    try:
        manifest = build_full_ari_reference_fade_audition_pack(
            args.repository_root, args.spec, args.output_dir
        )
    except ReferenceFadePackError as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "status": manifest["status"],
        "manifest": str(args.output_dir / MANIFEST_FILENAME),
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
