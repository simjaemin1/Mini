#!/usr/bin/env python3
"""Verify and byte-copy a full-Arirang B1 / B2-R / B2-Rd audition pack."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys
import tempfile
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple


HERE = Path(__file__).resolve().parent
REFERENCE_PACK_TOOLS = HERE.parent / "full-ari-reference-contour-audition-pack"
if str(REFERENCE_PACK_TOOLS) not in sys.path:
    sys.path.insert(0, str(REFERENCE_PACK_TOOLS))

import build_full_ari_reference_contour_audition_pack as reference_pack  # noqa: E402


full_pack = reference_pack.full_pack

SPEC_SCHEMA = "mini.full-ari-reference-depth-audition-pack-spec.v1"
MANIFEST_SCHEMA = "mini.full-ari-reference-depth-audition-pack.v1"
MANIFEST_FILENAME = "full_ari_reference_depth_audition_manifest.json"
SPEC_SNAPSHOT_FILENAME = "audition_spec.snapshot.json"
DEPTH_STATUS = "reference_shape_depth_matched_unreviewed"
DEPTH_SCALE = 0.5286722300020257
SOURCE_MAX_ABS_CENTS = 34.047561
TARGET_MAX_ABS_CENTS = 18.0
DEPTH_TRANSFORM_KIND = "linear_peak_abs_match"
DEPTH_TRANSFORM_OPERATION = "scale_to_max_abs_cents"
DEPTH_APPLICATION_ORDER = (
    "linear_interpolation_then_multiply_residual_by_scale_then_apply_boundary_depth_fades"
)
REFERENCE_APPLICATION_SCOPE = (
    "the pinned pitch residual or its pinned linear depth match applies only to "
    "b16_e0_rearticulate; all other score controls are untouched"
)

ROLES = {
    "B1": reference_pack.ROLES["B1"],
    "B2-R": reference_pack.ROLES["B2-R"],
    "B2-Rd": "full_ari_b08_sine_b16_reference_shape_depth_matched_unreviewed",
}
OUTPUT_AUDIO_NAMES = {
    "B1": "B1_full_ari_contextual_sine_yoseong.wav",
    "B2-R": "B2R_full_ari_reference_shape_unreviewed_raw_depth.wav",
    "B2-Rd": "B2Rd_full_ari_reference_shape_depth_matched_unreviewed.wav",
}


class ReferenceDepthPackError(RuntimeError):
    """A three-way fairness, identity, or interpretation gate failed."""


def _fail(message: str) -> None:
    raise ReferenceDepthPackError(message)


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
        raise ReferenceDepthPackError(f"{label} is not readable UTF-8 JSON") from exc
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
        raise ReferenceDepthPackError(str(exc)) from exc


def _event(events: Sequence[Mapping[str, Any]], event_id: str) -> Mapping[str, Any]:
    matches = [event for event in events if event.get("id") == event_id]
    if len(matches) != 1:
        _fail(f"plan must contain exactly one {event_id} event")
    return matches[0]


def _expected_depth_transform() -> Dict[str, Any]:
    return {
        "kind": DEPTH_TRANSFORM_KIND,
        "source_max_abs_cents": SOURCE_MAX_ABS_CENTS,
        "target_max_abs_cents": TARGET_MAX_ABS_CENTS,
        "scale": DEPTH_SCALE,
    }


def _validate_depth_reference_block(
    event: Mapping[str, Any], reference: Mapping[str, Any], label: str
) -> Mapping[str, Any]:
    if _mapping(event.get("vibrato"), f"{label} vibrato") != {"enabled": False}:
        _fail(f"{label} must disable the sine-vibrato path")
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
    }
    if set(block) != expected_keys:
        _fail(f"{label} reference contour has unexpected or missing fields")
    if block.get("status") != DEPTH_STATUS:
        _fail(f"{label} must be labelled {DEPTH_STATUS}")
    for key, expected in {
        "onset_seconds": reference_pack.REFERENCE_ONSET_SECONDS,
        "duration_seconds": reference_pack.REFERENCE_DURATION_SECONDS,
        "fade_in_seconds": reference_pack.REFERENCE_FADE_SECONDS,
        "fade_out_seconds": reference_pack.REFERENCE_FADE_SECONDS,
    }.items():
        _exact(block.get(key), expected, f"{label}.{key}")
    if block.get("fade_shape") != reference_pack.REFERENCE_FADE_SHAPE:
        _fail(f"{label} boundary-fade shape differs from raw B2-R")

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
        _fail(f"{label} source artifact identity differs from raw B2-R")
    if block.get("normalized_reference_contour") != reference["normalized_reference_contour"]:
        _fail(f"{label} must embed the exact unscaled 65-point source contour")
    if block.get("claim_limits") != reference["claim_limits"]:
        _fail(f"{label} claim limits differ from the unreviewed source")
    transform = _mapping(block.get("depth_transform"), f"{label} depth transform")
    if set(transform) != set(_expected_depth_transform()):
        _fail(f"{label} depth transform has unexpected or missing fields")
    if transform.get("kind") != DEPTH_TRANSFORM_KIND:
        _fail(f"{label} depth transform kind differs")
    for key, expected in {
        "source_max_abs_cents": SOURCE_MAX_ABS_CENTS,
        "target_max_abs_cents": TARGET_MAX_ABS_CENTS,
        "scale": DEPTH_SCALE,
    }.items():
        _exact(transform.get(key), expected, f"{label} depth_transform.{key}")
    pitches = reference["normalized_reference_contour"]["pitch_residual_cents"]
    _exact(max(abs(float(value)) for value in pitches), SOURCE_MAX_ABS_CENTS, f"{label} source maximum")
    _exact(SOURCE_MAX_ABS_CENTS * DEPTH_SCALE, TARGET_MAX_ABS_CENTS, f"{label} target maximum")
    return block


def _validate_depth_policy(
    policy: Mapping[str, Any], *, plan_sha: str
) -> Dict[str, Any]:
    if policy.get("schema") != full_pack.POLICY_SCHEMA:
        _fail("B2-Rd score-expression manifest schema is unsupported")
    scope = _mapping(policy.get("r_and_d_scope"), "B2-Rd policy scope")
    if any(scope.get(key) is not True for key in ("r_and_d_only", "no_default_assets", "no_game_output")):
        _fail("B2-Rd policy is not R&D-only/no-game")
    policy_input = _mapping(policy.get("input"), "B2-Rd policy input")
    if policy_input.get("plan_sha256") != plan_sha:
        _fail("B2-Rd policy does not bind the supplied score plan")
    expression = _mapping(policy.get("expression_policy"), "B2-Rd expression policy")
    if expression.get("automatic_activation") is not False or expression.get("default_decision") != "off":
        _fail("B2-Rd expression policy must remain explicit/default-off")
    fired = _list(policy.get("fired_policy_rules"), "B2-Rd fired policy rules")
    selected = [
        _mapping(item, "B2-Rd selected policy rule")
        for item in fired
        if isinstance(item, Mapping) and item.get("decision") in {"selected", DEPTH_STATUS}
    ]
    selected_events = sorted(_text(item.get("event_id"), "B2-Rd selected event") for item in selected)
    if selected_events != sorted((reference_pack.SHARED_SINE_EVENT_ID, reference_pack.REFERENCE_EVENT_ID)):
        _fail("B2-Rd policy must select b08 sine and b16 depth-matched reference only")
    b16 = next(item for item in selected if item.get("event_id") == reference_pack.REFERENCE_EVENT_ID)
    if b16.get("decision") != DEPTH_STATUS or b16.get("style") != DEPTH_STATUS:
        _fail("B2-Rd b16 policy must preserve its depth-matched-unreviewed label")
    return {
        "passed": True,
        "automatic_activation": False,
        "default_decision": "off",
        "selected_event_ids": selected_events,
        "b16_decision": DEPTH_STATUS,
        "evidence_status": expression.get("evidence_status"),
    }


def _validate_depth_runtime_qa(
    report: Mapping[str, Any],
    controls: Mapping[str, Any],
    reference: Mapping[str, Any],
) -> Dict[str, Any]:
    score_controls = _mapping(report.get("score_controls"), "B2-Rd score controls")
    qa = _mapping(
        score_controls.get("reference_contour_control_qa"),
        "B2-Rd reference-contour control QA",
    )
    if qa.get("passed") is not True or qa.get("status") != DEPTH_STATUS or qa.get("event_count") != 1:
        _fail("B2-Rd runtime reference-contour QA status/count did not pass")
    if qa.get("claim_boundary") != reference_pack.REFERENCE_CLAIM_BOUNDARY:
        _fail("B2-Rd runtime reference claim boundary differs")
    if qa.get("application_scope") != REFERENCE_APPLICATION_SCOPE:
        _fail("B2-Rd runtime reference application scope differs")
    if not (
        qa.get("learned_claim") is False
        and qa.get("style_aligned_claim") is False
        and qa.get("human_reviewed_claim") is False
        and qa.get("training_or_game_clearance") is False
    ):
        _fail("B2-Rd runtime makes a learned/style/reviewed/training/game claim")
    records = _list(qa.get("events"), "B2-Rd runtime reference events")
    if len(records) != 1:
        _fail("B2-Rd runtime must report exactly one reference event")
    record = _mapping(records[0], "B2-Rd runtime reference event")
    expected_identity = {
        "event_id": reference_pack.REFERENCE_EVENT_ID,
        "status": DEPTH_STATUS,
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
            _fail(f"B2-Rd runtime reference QA {key} differs")
    for key, expected in {
        "source_duration_seconds": reference_pack.REFERENCE_DURATION_SECONDS,
        "applied_duration_seconds": reference_pack.REFERENCE_DURATION_SECONDS,
        "onset_seconds_relative": reference_pack.REFERENCE_ONSET_SECONDS,
        "event_start_seconds": 32.4,
        "contour_start_seconds": reference_pack.REFERENCE_START_SECONDS,
        "contour_end_seconds": reference_pack.REFERENCE_END_SECONDS,
        "fade_in_seconds": reference_pack.REFERENCE_FADE_SECONDS,
        "fade_out_seconds": reference_pack.REFERENCE_FADE_SECONDS,
        "final_source_normalized_time": reference_pack.REFERENCE_FINAL_SOURCE_NORMALIZED_TIME,
    }.items():
        _exact(record.get(key), expected, f"B2-Rd runtime QA {key}")
    if record.get("time_mapping") != reference_pack.REFERENCE_TIME_MAPPING:
        _fail("B2-Rd time mapping differs from raw B2-R")
    if record.get("interpolation") != reference_pack.REFERENCE_INTERPOLATION:
        _fail("B2-Rd interpolation differs from raw B2-R")
    for key in (
        "first_boundary_zero_gate_passed",
        "final_boundary_zero_gate_passed",
        "final_nominal_pitch_gate_passed",
        "no_time_compression_gate_passed",
    ):
        if record.get(key) is not True:
            _fail(f"B2-Rd runtime gate {key} did not pass")
    if record.get("nonzero_interior_frame_count") != 373:
        _fail("B2-Rd must retain all 373 nonzero raw-contour interior rows")
    if abs(_number(record.get("first_active_vibrato_cents"), "B2-Rd first boundary")) > 1.0e-10:
        _fail("B2-Rd first boundary is not zero cents")
    if abs(_number(record.get("final_active_vibrato_cents"), "B2-Rd final boundary")) > 1.0e-10:
        _fail("B2-Rd final boundary is not zero cents")
    nominal = _number(record.get("nominal_pitch_hz"), "B2-Rd nominal pitch")
    _exact(record.get("final_active_f0_hz"), nominal, "B2-Rd final nominal pitch", 1.0e-9)

    transform = _mapping(record.get("depth_transform"), "B2-Rd runtime depth transform")
    expected_transform = {
        "operation": DEPTH_TRANSFORM_OPERATION,
        "kind": DEPTH_TRANSFORM_KIND,
        "application_order": DEPTH_APPLICATION_ORDER,
        "source_max_abs_cents": SOURCE_MAX_ABS_CENTS,
        "source_max_abs_cents_recomputed_from_embedded_points": SOURCE_MAX_ABS_CENTS,
        "target_max_abs_cents": TARGET_MAX_ABS_CENTS,
        "scale": DEPTH_SCALE,
        "transformed_embedded_source_max_abs_cents": TARGET_MAX_ABS_CENTS,
        "source_max_matches_embedded_points_gate_passed": True,
        "scale_equals_target_over_source_gate_passed": True,
        "transformed_embedded_source_hits_target_gate_passed": True,
        "source_artifact_and_payload_identity_preserved": True,
        "embedded_pitch_points_modified": False,
        "learned_or_style_aligned_transform": False,
    }
    if set(transform) != set(expected_transform):
        _fail("B2-Rd runtime depth transform has unexpected or missing fields")
    for key, expected in expected_transform.items():
        if isinstance(expected, float):
            _exact(transform.get(key), expected, f"B2-Rd runtime depth transform {key}")
        elif transform.get(key) != expected:
            _fail(f"B2-Rd runtime depth transform {key} differs")

    rows = controls["rows"]
    by_index = {
        row["frame_index"]: row
        for row in rows
        if row["event_id"] == reference_pack.REFERENCE_EVENT_ID
    }
    if set(by_index) != set(range(8_100, 8_640)):
        _fail("B2-Rd b16 controls do not occupy the exact score interval")
    actual_max = 0.0
    for index in range(8_100, 8_640):
        expected_cents = reference_pack._reference_expected_cents(reference, index) * DEPTH_SCALE
        actual_cents = by_index[index]["vibrato_cents"]
        if not math.isclose(actual_cents, expected_cents, rel_tol=0.0, abs_tol=1.0e-10):
            _fail("B2-Rd controls are not the raw reference contour times the pinned scale")
        expected_f0 = nominal * math.pow(2.0, expected_cents / 1_200.0)
        if not math.isclose(by_index[index]["f0_hz"], expected_f0, rel_tol=0.0, abs_tol=1.0e-9):
            _fail("B2-Rd F0 differs from nominal pitch plus its scaled contour")
        actual_max = max(actual_max, abs(actual_cents))
    if actual_max > TARGET_MAX_ABS_CENTS + 1.0e-10:
        _fail("B2-Rd runtime controls exceed the 18-cent target maximum")
    _exact(record.get("actual_runtime_max_abs_cents"), actual_max, "B2-Rd actual runtime maximum", 1.0e-10)
    return {
        "passed": True,
        "status": DEPTH_STATUS,
        "event_id": reference_pack.REFERENCE_EVENT_ID,
        "depth_transform": expected_transform,
        "actual_runtime_max_abs_cents": actual_max,
        "target_max_abs_cents": TARGET_MAX_ABS_CENTS,
        "target_not_exceeded": True,
        "source_artifact_and_payload_identity_preserved": transform[
            "source_artifact_and_payload_identity_preserved"
        ],
        "duration_seconds": reference_pack.REFERENCE_DURATION_SECONDS,
        "time_compressed": False,
        "boundary_rows_zero_cents": True,
        "runtime_qa": dict(record),
    }


def _depth_runtime_candidate(
    repository_root: Path,
    candidate: Mapping[str, Any],
    reference: Mapping[str, Any],
) -> Dict[str, Any]:
    slot = "B2-Rd"
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
    policy = _load_json(policy_path, f"{slot} score-expression manifest")
    if report.get("schema") != full_pack.RUNTIME_SCHEMA or report.get("status") != "succeeded":
        _fail("B2-Rd runtime report is not successful/supported")
    scope = _mapping(report.get("scope"), "B2-Rd runtime scope")
    actions = _mapping(report.get("actions_performed"), "B2-Rd runtime actions")
    if not (
        scope.get("r_and_d_only") is True
        and scope.get("no_default_bgm_changed") is True
        and scope.get("not_a_game_asset") is True
        and actions.get("default_bgm_changed") is False
        and actions.get("experimental_hard_f0_step") is True
        and actions.get("learned_reverb_called") is True
    ):
        _fail("B2-Rd runtime is not an offline R&D hard-step wet render")
    try:
        events, plan_qa = full_pack._plan_events(report, plan_source["sha256"])
        controls_path, controls_source = full_pack._resolve_report_output(
            report_path, report, key="controls_csv", label="B2-Rd controls"
        )
        audio_path, audio_source = full_pack._resolve_report_output(
            report_path,
            report,
            key="checkpoint_native_reverb_score_length_wav",
            label="B2-Rd score-length wet WAV",
        )
        controls = full_pack._load_controls(controls_path)
        rest_qa = full_pack._validate_written_rest(controls, report)
        release_qa = full_pack._validate_release(report, controls, plan_qa)
        audio_metrics = full_pack._audio_metrics(audio_path, require_target=False)
        level_qa = full_pack._validate_level_match(report, slot=slot)
    except full_pack.FullAriAuditionPackError as exc:
        raise ReferenceDepthPackError(str(exc)) from exc
    score_controls = _mapping(report.get("score_controls"), "B2-Rd score controls")
    if score_controls.get("renderer_control_hz") != 250 or score_controls.get("frame_count") != 8_700:
        _fail("B2-Rd does not contain the exact 250 Hz / 8,700-frame controls")
    slur = _mapping(score_controls.get("slur_transition_policy"), "B2-Rd slur policy")
    if slur.get("pitch_mode") != full_pack.HARD_STEP_MODE:
        _fail("B2-Rd is not the selected hard-step transition baseline")

    plan_events = [_mapping(item, "B2-Rd plan event") for item in _list(plan.get("events"), "B2-Rd plan events")]
    plan_b08 = _event(plan_events, reference_pack.SHARED_SINE_EVENT_ID)
    plan_b16 = _event(plan_events, reference_pack.REFERENCE_EVENT_ID)
    report_b08 = _event(events, reference_pack.SHARED_SINE_EVENT_ID)
    report_b16 = _event(events, reference_pack.REFERENCE_EVENT_ID)
    if plan_b08.get("vibrato") != report_b08.get("vibrato"):
        _fail("B2-Rd runtime b08 expression differs from its plan")
    reference_pack._sine_shape(report_b08, "B2-Rd b08")
    if sorted(full_pack._enabled_vibrato_event_ids(events)) != [reference_pack.SHARED_SINE_EVENT_ID]:
        _fail("B2-Rd must retain sine vibrato on b08 only")
    plan_reference = _validate_depth_reference_block(plan_b16, reference, "B2-Rd plan b16")
    report_reference = _validate_depth_reference_block(report_b16, reference, "B2-Rd runtime b16")
    if plan_reference != report_reference:
        _fail("B2-Rd runtime reference block differs from its score plan")
    if controls["nonzero_vibrato_event_ids"] != sorted((reference_pack.SHARED_SINE_EVENT_ID, reference_pack.REFERENCE_EVENT_ID)):
        _fail("B2-Rd controls must contain b08 sine and b16 scaled-reference motion only")
    reference_qa = _validate_depth_runtime_qa(report, controls, reference)
    policy_qa = _validate_depth_policy(policy, plan_sha=plan_source["sha256"])
    render = _mapping(report.get("render"), "B2-Rd render")
    runtime = _mapping(render.get("runtime"), "B2-Rd render runtime")
    if not isinstance(runtime.get("seed"), int):
        _fail("B2-Rd renderer seed is missing")
    reverb = _mapping(report.get("checkpoint_native_reverb_audition"), "B2-Rd reverb")
    reverb_runtime = _mapping(reverb.get("runtime"), "B2-Rd reverb runtime")
    reverb_source = _mapping(reverb_runtime.get("source"), "B2-Rd reverb source")
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
            "expression_kind": "b08_sine_plus_b16_depth_matched_reference_shape_unreviewed",
            "sine_event_ids": [reference_pack.SHARED_SINE_EVENT_ID],
            "reference_event_ids": [reference_pack.REFERENCE_EVENT_ID],
            "learned": False,
        },
        "reference_qa": reference_qa,
        "reference_block": dict(report_reference),
        "policy_qa": policy_qa,
    }


def _common_comparison(left: Mapping[str, Any], right: Mapping[str, Any], label: str) -> None:
    for key in (
        "score_skeleton",
        "checkpoint_signature",
        "public_sources_signature",
        "renderer_seed",
        "reverb_source",
    ):
        if left[key] != right[key]:
            _fail(f"{label} does not share {key}")
    if full_pack._shared_control_signature(left["controls"]) != full_pack._shared_control_signature(right["controls"]):
        _fail(f"{label} changes timing, articulation, loudness, voicing, or event assignment")
    for key in (
        "constant_gain_applied_to_entire_file",
        "gain_source_slot",
        "monitoring_interval",
        "target_rms_dbfs",
        "reverb_kind",
        "reverb_source",
    ):
        if left["level_qa"][key] != right["level_qa"][key]:
            _fail(f"{label} does not share level/reverb field {key}")


def _compare_three(
    b1: Mapping[str, Any], b2r: Mapping[str, Any], b2rd: Mapping[str, Any]
) -> Dict[str, Any]:
    try:
        b1_b2r = reference_pack._compare_candidates(b1, b2r)
    except reference_pack.ReferenceContourPackError as exc:
        raise ReferenceDepthPackError(str(exc)) from exc
    _common_comparison(b1, b2rd, "B2-Rd")
    _common_comparison(b2r, b2rd, "B2-Rd versus B2-R")
    if b1["level_qa"]["gain_source_slot"] != "B0":
        _fail("three-way comparison gain was not derived exactly from B0")

    raw_rows = {row["frame_index"]: row for row in b2r["controls"]["rows"]}
    depth_rows = {row["frame_index"]: row for row in b2rd["controls"]["rows"]}
    changed_events: set[str] = set()
    for index, raw in raw_rows.items():
        depth = depth_rows[index]
        event_id = str(raw["event_id"])
        if event_id == reference_pack.REFERENCE_EVENT_ID:
            expected_cents = raw["vibrato_cents"] * DEPTH_SCALE
            if not math.isclose(depth["vibrato_cents"], expected_cents, rel_tol=0.0, abs_tol=1.0e-10):
                _fail("B2-Rd b16 is not numerically raw B2-R times the pinned scale")
            nominal = _number(_event(b2rd["events"], event_id).get("pitch_hz"), "B2-Rd nominal b16 pitch")
            expected_f0 = nominal * math.pow(2.0, expected_cents / 1_200.0)
            if not math.isclose(depth["f0_hz"], expected_f0, rel_tol=0.0, abs_tol=1.0e-9):
                _fail("B2-Rd b16 F0 is not the scaled-contour target")
            if not math.isclose(raw["vibrato_cents"], depth["vibrato_cents"], rel_tol=0.0, abs_tol=1.0e-12):
                changed_events.add(event_id)
        else:
            for field in ("f0_hz", "vibrato_cents"):
                if not math.isclose(raw[field], depth[field], rel_tol=0.0, abs_tol=1.0e-12):
                    _fail(f"B2-Rd changes non-b16 numeric control field {field}")
    if changed_events != {reference_pack.REFERENCE_EVENT_ID}:
        _fail("B2-R and B2-Rd must differ numerically on b16 expression only")

    raw_block = _event(b2r["events"], reference_pack.REFERENCE_EVENT_ID)["reference_contour"]
    depth_block = b2rd["reference_block"]
    raw_common = dict(raw_block)
    raw_common.pop("status", None)
    depth_common = dict(depth_block)
    depth_common.pop("status", None)
    depth_common.pop("depth_transform", None)
    if raw_common != depth_common:
        _fail("B2-Rd changes raw B2-R shape/time/fade/source payload provenance")
    return {
        "passed": True,
        "B1_vs_raw_B2R": b1_b2r,
        "same_59_note_nominal_skeleton_and_nonexpression_controls_all_three": True,
        "same_checkpoint_public_sources_seed_reverb_and_B0_gain_all_three": True,
        "same_monitoring_interval_seconds": [0.0, 34.56],
        "b08_exact_all_three": True,
        "raw_B2R_vs_B2Rd_same_shape_time_fade_and_source_payload": True,
        "raw_B2R_to_B2Rd_only_numeric_transform": {
            "event_id": reference_pack.REFERENCE_EVENT_ID,
            "scale": DEPTH_SCALE,
            "source_max_abs_cents": SOURCE_MAX_ABS_CENTS,
            "target_max_abs_cents": TARGET_MAX_ABS_CENTS,
        },
        "release_nominal_all_three": True,
        "audio_bytes_copied_without_transform": True,
    }


def _copy_verified(source: Path, destination: Path, expected_sha: str) -> Dict[str, Any]:
    shutil.copyfile(source, destination)
    if _sha256(source) != expected_sha or _sha256(destination) != expected_sha:
        _fail("artifact bytes changed while assembling the three-way pack")
    return full_pack._file_record(destination)


def _listening_readme() -> str:
    return f"""# Full-Arirang B1 / B2-R / B2-Rd offline audition

- B1: provisional sine expression on b08 and b16.
- B2-R: b08 unchanged; b16 uses the raw unreviewed reference contour.
- B2-Rd: b08 unchanged; b16 uses the identical reference shape, source time,
  fades, and payload, with cents multiplied only by `{DEPTH_SCALE}` so the
  embedded source peak `{SOURCE_MAX_ABS_CENTS}` cents maps to `{TARGET_MAX_ABS_CENTS}` cents.

All files share the same nominal 59-note score skeleton, non-expression
controls, checkpoint, seed, checkpoint-native reverb, B0-derived gain, and
`[0.00, 34.56)` monitoring interval. The packer copied verified source WAV
bytes without editing them.

Both reference variants remain automatic periodic-F0 proxies: unreviewed, not
learned, not confirmed as yoseong, not Gyeonggi-style-validated, not training
items, and not cleared for game or distribution use.
"""


def build_full_ari_reference_depth_audition_pack(
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
        raise ReferenceDepthPackError("spec and output must stay inside the repository") from exc
    if not output_relative.startswith("_bgm_rnd/"):
        _fail("output must be inside ignored _bgm_rnd/")
    if output_dir.exists() or not output_dir.parent.is_dir():
        _fail("output must be a fresh directory whose parent already exists")

    spec = _load_json(spec_path, "three-way audition spec")
    if spec.get("schema") != SPEC_SCHEMA:
        _fail("unsupported three-way audition spec schema")
    candidates = _mapping(spec.get("candidates"), "spec candidates")
    if set(candidates) != set(ROLES):
        _fail("spec must contain exactly B1, B2-R, and B2-Rd")
    reference_record = _mapping(spec.get("reference_artifact"), "spec reference artifact")
    try:
        reference_path, _, reference = reference_pack._reference_artifact(
            repository_root, reference_record
        )
        guard = full_pack.validate_default_bgm_untouched(
            repository_root, baseline_revision=baseline_revision
        )
    except (reference_pack.ReferenceContourPackError, full_pack.FullAriAuditionPackError) as exc:
        raise ReferenceDepthPackError(str(exc)) from exc

    ready: Dict[str, Dict[str, Any]] = {}
    for slot in ("B1", "B2-R"):
        candidate = _mapping(candidates[slot], f"candidates.{slot}")
        if candidate.get("status") != "ready" or candidate.get("role") != ROLES[slot]:
            _fail(f"{slot} is not ready under its fixed comparison role")
        try:
            ready[slot] = reference_pack._runtime_candidate(
                repository_root, slot, candidate, reference
            )
        except reference_pack.ReferenceContourPackError as exc:
            raise ReferenceDepthPackError(str(exc)) from exc
    depth_candidate = _mapping(candidates["B2-Rd"], "candidates.B2-Rd")
    if depth_candidate.get("status") != "ready" or depth_candidate.get("role") != ROLES["B2-Rd"]:
        _fail("B2-Rd is not ready under its fixed comparison role")
    ready["B2-Rd"] = _depth_runtime_candidate(
        repository_root, depth_candidate, reference
    )
    fairness = _compare_three(ready["B1"], ready["B2-R"], ready["B2-Rd"])

    source_paths = {reference_path, spec_path}
    for item in ready.values():
        source_paths.update(item[key] for key in (
            "report_path", "plan_path", "policy_path", "controls_path", "audio_path"
        ))
    source_hashes = {path: _sha256(path) for path in source_paths}
    spec_sha = source_hashes[spec_path]
    manifest_candidates: Dict[str, Any] = {}
    with tempfile.TemporaryDirectory(prefix=".full-ari-reference-depth-pack-", dir=str(output_dir.parent)) as temp:
        staging = Path(temp)
        provenance_dir = staging / "provenance"
        provenance_dir.mkdir()
        _copy_verified(spec_path, staging / SPEC_SNAPSHOT_FILENAME, spec_sha)
        reference_copy = _copy_verified(
            reference_path,
            provenance_dir / "reference_shape_unreviewed.json",
            reference["sha256"],
        )
        for slot in ("B1", "B2-R", "B2-Rd"):
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
            raise ReferenceDepthPackError(str(exc)) from exc
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
                "reference_time_compression": False,
                "reference_boundary_fade_seconds": [0.12, 0.12],
                "depth_scale": DEPTH_SCALE,
                "depth_target_max_abs_cents": TARGET_MAX_ABS_CENTS,
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
                "B2R_and_B2Rd_are_unreviewed_reference_F0_proxies_not_learned_results": True,
                "depth_matching_is_a_numeric_audition_control_not_musicological_validation": True,
                "neither_reference_variant_is_confirmed_yoseong_or_Gyeonggi_minyo_style": True,
                "no_candidate_is_a_training_item_or_game_asset": True,
                "checkpoint_weights_are_not_established_as_game_distribution_cleared": True,
            },
        }
        _write_json(staging / MANIFEST_FILENAME, manifest)
        (staging / "README.md").write_text(_listening_readme(), encoding="utf-8")
        if any(_sha256(path) != digest for path, digest in source_hashes.items()):
            _fail("a source artifact changed while assembling the three-way pack")
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
        manifest = build_full_ari_reference_depth_audition_pack(
            args.repository_root, args.spec, args.output_dir
        )
    except ReferenceDepthPackError as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "status": manifest["status"],
        "manifest": str(args.output_dir / MANIFEST_FILENAME),
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
