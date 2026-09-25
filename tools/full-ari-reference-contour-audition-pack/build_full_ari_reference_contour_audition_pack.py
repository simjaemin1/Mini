#!/usr/bin/env python3
"""Verify and package a full-Arirang B1/B2-R offline listening pair.

The packer is deliberately post-render only.  It verifies hash-pinned runtime,
score, policy, and reference-contour evidence, then copies the two wet WAVs
byte-for-byte into a fresh ``_bgm_rnd`` directory.  It never renders, changes
gain, normalizes, resamples, or edits audio.
"""

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
FULL_PACK_TOOLS = HERE.parent / "full-ari-yoseong-audition-pack"
if str(FULL_PACK_TOOLS) not in sys.path:
    sys.path.insert(0, str(FULL_PACK_TOOLS))

import build_full_ari_yoseong_audition_pack as full_pack  # noqa: E402


SPEC_SCHEMA = "mini.full-ari-reference-contour-audition-pack-spec.v1"
MANIFEST_SCHEMA = "mini.full-ari-reference-contour-audition-pack.v1"
MANIFEST_FILENAME = "full_ari_reference_contour_audition_manifest.json"
SPEC_SNAPSHOT_FILENAME = "audition_spec.snapshot.json"
REFERENCE_SCHEMA = "durango.daegeum.reference-yoseong-contour.v1"
REFERENCE_STATUS = "reference_shape_unreviewed"
REFERENCE_SELECTION_STATUS = "automatic_periodic_f0_proxy_candidate_unreviewed"
REFERENCE_EVENT_ID = "b16_e0_rearticulate"
SHARED_SINE_EVENT_ID = "b08_e0_rearticulate"
REFERENCE_DURATION_SECONDS = 1.5
REFERENCE_ONSET_SECONDS = 0.66
REFERENCE_FADE_SECONDS = 0.12
REFERENCE_FADE_SHAPE = "linear_depth"
REFERENCE_START_SECONDS = 33.06
REFERENCE_END_SECONDS = 34.56
REFERENCE_START_FRAME = 8_265
REFERENCE_FINAL_FRAME = 8_639
EXPECTED_REFERENCE_POINTS = 65
EXPECTED_REFERENCE_ACTIVE_FRAMES = 375
REFERENCE_FINAL_SOURCE_NORMALIZED_TIME = (
    REFERENCE_DURATION_SECONDS - 1.0 / full_pack.CONTROL_RATE_HZ
) / REFERENCE_DURATION_SECONDS
REFERENCE_TIME_MAPPING = (
    "source_normalized_time = contour_elapsed_seconds / 1.5; no endpoint "
    "remap to the final half-open control row"
)
REFERENCE_INTERPOLATION = (
    "piecewise_linear_between_65_embedded_normalized_pitch_samples_at_250hz_runtime_rows"
)
REFERENCE_CLAIM_BOUNDARY = (
    "embedded automatic periodic-F0 proxy shape; unreviewed, not learned, not "
    "Gyeonggi-style-aligned, and not cleared for training or game use"
)

ROLES = {
    "B1": "full_ari_contextual_sine_yoseong_baseline",
    "B2-R": "full_ari_b08_sine_b16_reference_shape_unreviewed",
}
OUTPUT_AUDIO_NAMES = {
    "B1": "B1_full_ari_contextual_sine_yoseong.wav",
    "B2-R": "B2R_full_ari_reference_shape_unreviewed.wav",
}


class ReferenceContourPackError(RuntimeError):
    """A required comparison or provenance contract failed closed."""


def _fail(message: str) -> None:
    raise ReferenceContourPackError(message)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _canonical_sha256(value: Any) -> str:
    payload = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


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


def _exact(value: Any, expected: float, label: str, tolerance: float = 1.0e-9) -> None:
    actual = _number(value, label)
    if not math.isclose(actual, expected, rel_tol=0.0, abs_tol=tolerance):
        _fail(f"{label} must be exactly {expected}, got {actual}")


def _load_json(path: Path, label: str) -> Mapping[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ReferenceContourPackError(f"{label} is not readable UTF-8 JSON") from exc
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
        raise ReferenceContourPackError(str(exc)) from exc


def _reference_artifact(
    repository_root: Path, spec_record: Mapping[str, Any]
) -> Tuple[Path, Mapping[str, Any], Dict[str, Any]]:
    path, source = _validated_artifact(repository_root, spec_record, "reference_artifact")
    artifact = _load_json(path, "reference artifact")
    if artifact.get("schema") != REFERENCE_SCHEMA or artifact.get("status") != REFERENCE_STATUS:
        _fail("reference artifact must be an available reference_shape_unreviewed artifact")

    policy = _mapping(artifact.get("artifact_policy"), "reference artifact policy")
    required_policy = {
        "offline_rnd_only": True,
        "training_item": False,
        "game_asset": False,
        "distribution_ready": False,
        "rights_cleared": False,
        "human_musicological_review_complete": False,
        "style_label_assigned": False,
        "whole_phrase_score_fit_assessed": False,
    }
    if any(policy.get(key) is not value for key, value in required_policy.items()):
        _fail("reference artifact policy exceeds its offline unreviewed evidence boundary")
    gate = _mapping(artifact.get("b2_application_gate"), "reference B2 gate")
    if not (
        gate.get("reference_shape_available") is True
        and gate.get("required_status") == REFERENCE_STATUS
        and gate.get("may_feed_offline_b2_audition_only_under_that_status") is True
        and gate.get("may_be_interpreted_as_human_confirmed_yoseong") is False
        and gate.get("may_be_used_as_training_or_game_asset") is False
        and gate.get("blocked") is False
    ):
        _fail("reference artifact does not authorize only an offline unreviewed audition")

    selection = _mapping(artifact.get("selection"), "reference selection")
    candidate_id = _text(selection.get("candidate_id"), "reference candidate_id")
    if selection.get("status") != REFERENCE_SELECTION_STATUS:
        _fail("selected reference is not the expected unreviewed automatic proxy candidate")
    expected_candidate = _text(spec_record.get("expected_candidate_id"), "expected_candidate_id")
    if candidate_id != expected_candidate:
        _fail("reference candidate ID differs from the hash-pinned spec")
    claims = _mapping(selection.get("claim_limits"), "reference claim limits")
    if set(claims) != {
        "gyeonggi_minyo_style_confirmed",
        "human_reviewed",
        "phrase_or_breath_boundary_confirmed",
        "whole_source_phrase_score_compatibility_confirmed",
        "yoseong_confirmed",
    } or any(value is not False for value in claims.values()):
        _fail("reference claim-limit flags must all remain false")

    metrics = _mapping(selection.get("proxy_metrics"), "reference proxy metrics")
    _exact(metrics.get("duration_seconds"), REFERENCE_DURATION_SECONDS, "reference source duration")
    source_record = _mapping(selection.get("source"), "reference source")
    if source_record.get("rights_status") != "unverified_local_rnd_only":
        _fail("reference source rights status must remain unverified_local_rnd_only")

    contour = _mapping(
        selection.get("normalized_reference_contour"), "normalized reference contour"
    )
    stored_payload_sha = _text(
        contour.get("contour_payload_sha256"), "reference contour payload SHA"
    )
    payload_without_sha = dict(contour)
    payload_without_sha.pop("contour_payload_sha256", None)
    calculated_payload_sha = _canonical_sha256(payload_without_sha)
    expected_payload_sha = _text(
        spec_record.get("expected_contour_payload_sha256"),
        "expected_contour_payload_sha256",
    )
    if stored_payload_sha != calculated_payload_sha or stored_payload_sha != expected_payload_sha:
        _fail("reference contour payload SHA does not match its canonical payload and spec")
    count = contour.get("sample_count")
    times = _list(contour.get("time_normalized_0_to_1"), "reference contour times")
    pitches = _list(contour.get("pitch_residual_cents"), "reference pitch contour")
    rms = _list(
        contour.get("rms_db_relative_to_candidate_median"), "reference RMS contour"
    )
    if count != EXPECTED_REFERENCE_POINTS or not (len(times) == len(pitches) == len(rms) == count):
        _fail("reference contour must contain exactly 65 aligned samples")
    for index, time_value in enumerate(times):
        _exact(time_value, index / (count - 1), f"reference normalized time {index}", 1.0e-9)
    if not all(math.isfinite(_number(value, "reference contour value")) for value in pitches + rms):
        _fail("reference contour contains a non-finite value")

    return path, artifact, {
        **source,
        "schema": REFERENCE_SCHEMA,
        "status": REFERENCE_STATUS,
        "candidate_id": candidate_id,
        "selection_status": REFERENCE_SELECTION_STATUS,
        "source_id": _text(source_record.get("source_id"), "reference source_id"),
        "source_sha256": _text(source_record.get("source_sha256"), "reference source SHA"),
        "rights_status": source_record.get("rights_status"),
        "duration_seconds": REFERENCE_DURATION_SECONDS,
        "sample_count": count,
        "contour_payload_sha256": stored_payload_sha,
        "claim_limits": dict(claims),
        "normalized_reference_contour": dict(contour),
    }


def _event(events: Sequence[Mapping[str, Any]], event_id: str) -> Mapping[str, Any]:
    matches = [event for event in events if event.get("id") == event_id]
    if len(matches) != 1:
        _fail(f"plan must contain exactly one {event_id} event")
    return matches[0]


def _sine_shape(event: Mapping[str, Any], label: str) -> Mapping[str, Any]:
    vibrato = _mapping(event.get("vibrato"), f"{label} vibrato")
    if vibrato.get("enabled") is not True:
        _fail(f"{label} must use enabled sine vibrato")
    required = {
        "enabled", "rate_hz", "depth_cents", "onset_seconds",
        "ramp_seconds", "end_fade_seconds",
    }
    if set(vibrato) != required:
        _fail(f"{label} sine vibrato has unexpected or missing fields")
    for key in required - {"enabled"}:
        if _number(vibrato[key], f"{label}.{key}") < 0.0:
            _fail(f"{label}.{key} must be non-negative")
    if "reference_contour" in event:
        _fail(f"{label} may not also declare a reference contour")
    return vibrato


def _sine_expected_cents(event: Mapping[str, Any], time_seconds: float) -> float:
    vibrato = _mapping(event["vibrato"], "sine vibrato")
    local = float(time_seconds) - float(event["start_seconds"])
    onset = float(vibrato["onset_seconds"])
    if local < onset:
        return 0.0
    envelope = min(1.0, (local - onset) / float(vibrato["ramp_seconds"]))
    duration = float(event["end_seconds"]) - float(event["start_seconds"])
    end_fade = float(vibrato["end_fade_seconds"])
    final_control_local = duration - 1.0 / full_pack.CONTROL_RATE_HZ
    fade_start = duration - end_fade
    if local >= final_control_local - 1.0e-12:
        envelope = 0.0
    elif local > fade_start:
        envelope *= min(
            1.0,
            max(0.0, (final_control_local - local) / (final_control_local - fade_start)),
        )
    return float(vibrato["depth_cents"]) * envelope * math.sin(
        2.0 * math.pi * float(vibrato["rate_hz"]) * (local - onset)
    )


def _validate_b1_expression(
    events: Sequence[Mapping[str, Any]], controls: Mapping[str, Any]
) -> Dict[str, Any]:
    enabled = sorted(full_pack._enabled_vibrato_event_ids(events))
    expected = sorted((SHARED_SINE_EVENT_ID, REFERENCE_EVENT_ID))
    if enabled != expected or controls["nonzero_vibrato_event_ids"] != expected:
        _fail("B1 must use sine vibrato on b08 and b16 only")
    b08 = _sine_shape(_event(events, SHARED_SINE_EVENT_ID), "B1 b08")
    b16 = _sine_shape(_event(events, REFERENCE_EVENT_ID), "B1 b16")
    for event_id in expected:
        event = _event(events, event_id)
        rows = [row for row in controls["rows"] if row["event_id"] == event_id]
        if not rows or not any(abs(row["vibrato_cents"]) > 1.0e-9 for row in rows):
            _fail(f"B1 {event_id} has no audible sine vibrato")
        if abs(rows[-1]["vibrato_cents"]) > 1.0e-6:
            _fail(f"B1 {event_id} does not fade to zero on its final row")
        nominal_hz = _number(event.get("pitch_hz"), f"B1 {event_id} nominal pitch")
        for row in rows:
            expected_cents = _sine_expected_cents(event, row["time_seconds"])
            if not math.isclose(row["vibrato_cents"], expected_cents, rel_tol=0.0, abs_tol=1.0e-10):
                _fail(f"B1 {event_id} controls are not the exact authored sine expression")
            expected_f0 = nominal_hz * math.pow(2.0, expected_cents / 1_200.0)
            if not math.isclose(row["f0_hz"], expected_f0, rel_tol=0.0, abs_tol=1.0e-9):
                _fail(f"B1 {event_id} F0 differs from its nominal pitch plus sine expression")
    return {
        "passed": True,
        "expression_kind": "provisional_contextual_sine_yoseong",
        "enabled_event_ids": expected,
        "b08_sine": dict(b08),
        "b16_sine": dict(b16),
        "learned": False,
    }


def _validate_plan_reference(
    event: Mapping[str, Any], reference: Mapping[str, Any]
) -> Mapping[str, Any]:
    vibrato = _mapping(event.get("vibrato"), "B2-R b16 vibrato")
    if vibrato != {"enabled": False}:
        _fail("B2-R b16 must disable the sine-vibrato path")
    block = _mapping(event.get("reference_contour"), "B2-R b16 reference_contour")
    if block.get("status") != REFERENCE_STATUS:
        _fail("B2-R b16 must be labelled reference_shape_unreviewed")
    expected_scalars = {
        "onset_seconds": REFERENCE_ONSET_SECONDS,
        "duration_seconds": REFERENCE_DURATION_SECONDS,
        "fade_in_seconds": REFERENCE_FADE_SECONDS,
        "fade_out_seconds": REFERENCE_FADE_SECONDS,
    }
    for key, expected in expected_scalars.items():
        _exact(block.get(key), expected, f"B2-R b16 {key}")
    if block.get("fade_shape") != REFERENCE_FADE_SHAPE:
        _fail("B2-R b16 must use linear-depth boundary fades")
    source = _mapping(block.get("source_artifact"), "B2-R source_artifact")
    expected_source = {
        "sha256": reference["sha256"],
        "schema": reference["schema"],
        "candidate_id": reference["candidate_id"],
        "selection_status": reference["selection_status"],
        "contour_payload_sha256": reference["contour_payload_sha256"],
        "source_id": reference["source_id"],
        "source_sha256": reference["source_sha256"],
        "rights_status": reference["rights_status"],
    }
    for key, expected in expected_source.items():
        if source.get(key) != expected:
            _fail(f"B2-R source_artifact.{key} differs from the pinned reference")
    if source.get("relative_path") != reference["repository_relative_path"]:
        _fail("B2-R reference artifact path differs from the pinned artifact")
    if block.get("normalized_reference_contour") != reference["normalized_reference_contour"]:
        _fail("B2-R plan contour payload is not the exact pinned reference payload")
    if block.get("claim_limits") != reference["claim_limits"]:
        _fail("B2-R plan claim limits differ from the source artifact")
    return block


def _reference_expected_cents(reference: Mapping[str, Any], frame_index: int) -> float:
    """Independently reconstruct one exact B2-R runtime control value."""

    if frame_index < REFERENCE_START_FRAME or frame_index > REFERENCE_FINAL_FRAME:
        return 0.0
    elapsed = frame_index / full_pack.CONTROL_RATE_HZ - REFERENCE_START_SECONDS
    if elapsed <= 1.0e-12 or frame_index == REFERENCE_FINAL_FRAME:
        return 0.0
    normalized_time = elapsed / REFERENCE_DURATION_SECONDS
    contour = _mapping(reference["normalized_reference_contour"], "reference contour")
    times = [float(value) for value in contour["time_normalized_0_to_1"]]
    pitches = [float(value) for value in contour["pitch_residual_cents"]]
    right = bisect.bisect_right(times, normalized_time)
    if right <= 0:
        raw_cents = pitches[0]
    elif right >= len(times):
        raw_cents = pitches[-1]
    else:
        left = right - 1
        progress = (normalized_time - times[left]) / (times[right] - times[left])
        raw_cents = pitches[left] + (pitches[right] - pitches[left]) * progress
    envelope = min(1.0, max(0.0, elapsed / REFERENCE_FADE_SECONDS))
    fade_start = REFERENCE_DURATION_SECONDS - REFERENCE_FADE_SECONDS
    final_elapsed = REFERENCE_DURATION_SECONDS - 1.0 / full_pack.CONTROL_RATE_HZ
    if elapsed > fade_start:
        envelope *= min(
            1.0,
            max(0.0, (final_elapsed - elapsed) / (final_elapsed - fade_start)),
        )
    return raw_cents * envelope


def _validate_reference_control_qa(
    report: Mapping[str, Any], controls: Mapping[str, Any], reference: Mapping[str, Any]
) -> Dict[str, Any]:
    score_controls = _mapping(report.get("score_controls"), "B2-R score_controls")
    qa = _mapping(
        score_controls.get("reference_contour_control_qa"),
        "B2-R reference_contour_control_qa",
    )
    if qa.get("passed") is not True or qa.get("event_count") != 1:
        _fail("B2-R runtime reference-contour QA must pass for exactly one event")
    if qa.get("status") != REFERENCE_STATUS or qa.get("claim_boundary") != REFERENCE_CLAIM_BOUNDARY:
        _fail("B2-R runtime reference-contour status/claim boundary differs")
    if not (
        qa.get("learned_claim") is False
        and qa.get("style_aligned_claim") is False
        and qa.get("human_reviewed_claim") is False
        and qa.get("training_or_game_clearance") is False
    ):
        _fail("B2-R runtime makes a learned/style/reviewed/training/game claim")
    events = _list(qa.get("events"), "B2-R reference QA events")
    if len(events) != 1:
        _fail("B2-R runtime must report exactly one reference-contour QA record")
    record = _mapping(events[0], "B2-R reference QA event")
    expected_identity = {
        "event_id": REFERENCE_EVENT_ID,
        "status": REFERENCE_STATUS,
        "candidate_id": reference["candidate_id"],
        "source_id": reference["source_id"],
        "source_sha256": reference["source_sha256"],
        "source_artifact_sha256": reference["sha256"],
        "contour_payload_sha256": reference["contour_payload_sha256"],
        "rights_status": reference["rights_status"],
        "source_sample_count": EXPECTED_REFERENCE_POINTS,
        "fade_shape": REFERENCE_FADE_SHAPE,
    }
    for key, expected in expected_identity.items():
        if record.get(key) != expected:
            _fail(f"B2-R runtime reference QA {key} differs from the pinned reference")
    for key, expected in {
        "source_duration_seconds": REFERENCE_DURATION_SECONDS,
        "applied_duration_seconds": REFERENCE_DURATION_SECONDS,
        "onset_seconds_relative": REFERENCE_ONSET_SECONDS,
        "event_start_seconds": 32.4,
        "contour_start_seconds": REFERENCE_START_SECONDS,
        "contour_end_seconds": REFERENCE_END_SECONDS,
        "fade_in_seconds": REFERENCE_FADE_SECONDS,
        "fade_out_seconds": REFERENCE_FADE_SECONDS,
    }.items():
        _exact(record.get(key), expected, f"B2-R runtime reference QA {key}")
    if record.get("first_active_frame_index") != REFERENCE_START_FRAME:
        _fail("B2-R reference contour does not begin on the exact 33.060s control frame")
    if record.get("final_active_frame_index") != REFERENCE_FINAL_FRAME:
        _fail("B2-R reference contour does not occupy the final b16 control row")
    if record.get("expected_active_control_frame_count") != EXPECTED_REFERENCE_ACTIVE_FRAMES:
        _fail("B2-R expected reference control-frame count is not 375")
    if record.get("active_control_frame_count") != EXPECTED_REFERENCE_ACTIVE_FRAMES:
        _fail("B2-R reference contour does not occupy exactly 375 control frames")
    if record.get("time_mapping") != REFERENCE_TIME_MAPPING:
        _fail("B2-R reference contour time mapping is not the no-compression mapping")
    if record.get("interpolation") != REFERENCE_INTERPOLATION:
        _fail("B2-R reference contour interpolation policy differs")
    _exact(
        record.get("final_source_normalized_time"),
        REFERENCE_FINAL_SOURCE_NORMALIZED_TIME,
        "B2-R final source normalized time",
        1.0e-12,
    )
    if record.get("source_endpoint_remapped_to_final_half_open_row") is not False:
        _fail("B2-R source endpoint was remapped/compressed onto the final runtime row")
    if record.get("truncated_before_reference_contour") is not False or record.get("truncated_during_reference_contour") is not False:
        _fail("B2-R reference contour is truncated")
    required_gates = (
        "first_boundary_zero_gate_passed",
        "final_boundary_zero_gate_passed",
        "final_nominal_pitch_gate_passed",
        "no_time_compression_gate_passed",
    )
    if any(record.get(key) is not True for key in required_gates):
        _fail("B2-R reference contour duration/boundary gates did not all pass")
    if record.get("nonzero_interior_frame_count", 0) <= 0:
        _fail("B2-R reference contour has no nonzero interior control frames")
    if abs(_number(record.get("first_active_vibrato_cents"), "first boundary cents")) > 1.0e-9:
        _fail("B2-R reference contour first boundary is not exactly zero cents")
    if abs(_number(record.get("final_active_vibrato_cents"), "final boundary cents")) > 1.0e-9:
        _fail("B2-R reference contour final boundary is not exactly zero cents")
    _exact(
        record.get("final_active_f0_hz"),
        _number(record.get("nominal_pitch_hz"), "B2-R reference nominal pitch"),
        "B2-R reference final nominal F0",
        1.0e-6,
    )

    rows = controls["rows"]
    b16_rows = [row for row in rows if row["event_id"] == REFERENCE_EVENT_ID]
    by_index = {row["frame_index"]: row for row in b16_rows}
    if not b16_rows or set(range(8_100, 8_640)) != set(by_index):
        _fail("B2-R b16 controls do not occupy the exact score interval")
    if any(abs(by_index[index]["vibrato_cents"]) > 1.0e-12 for index in range(8_100, REFERENCE_START_FRAME)):
        _fail("B2-R has contour motion before the authored 0.66-second onset")
    first = by_index[REFERENCE_START_FRAME]
    final = by_index[REFERENCE_FINAL_FRAME]
    if abs(first["vibrato_cents"]) > 1.0e-9 or abs(final["vibrato_cents"]) > 1.0e-9:
        _fail("B2-R reference boundary fades do not reach exact zero")
    interior = [by_index[index]["vibrato_cents"] for index in range(REFERENCE_START_FRAME + 1, REFERENCE_FINAL_FRAME)]
    if not any(abs(value) > 1.0e-9 for value in interior):
        _fail("B2-R reference contour interior is silent")
    nominal = _number(record.get("nominal_pitch_hz"), "B2-R reference nominal pitch")
    if not math.isclose(final["f0_hz"], nominal, rel_tol=0.0, abs_tol=1.0e-6):
        _fail("B2-R final active control row is not at nominal pitch")
    for index in range(REFERENCE_START_FRAME, REFERENCE_FINAL_FRAME + 1):
        expected_cents = _reference_expected_cents(reference, index)
        actual_cents = by_index[index]["vibrato_cents"]
        if not math.isclose(actual_cents, expected_cents, rel_tol=0.0, abs_tol=1.0e-10):
            _fail("B2-R controls differ from the exact pinned contour interpolation and fades")
        expected_f0 = nominal * math.pow(2.0, expected_cents / 1_200.0)
        if not math.isclose(by_index[index]["f0_hz"], expected_f0, rel_tol=0.0, abs_tol=1.0e-9):
            _fail("B2-R F0 differs from the nominal pitch plus exact reference contour")
    return {
        "passed": True,
        "event_id": REFERENCE_EVENT_ID,
        "status": REFERENCE_STATUS,
        "source_duration_seconds": REFERENCE_DURATION_SECONDS,
        "applied_duration_seconds": REFERENCE_DURATION_SECONDS,
        "time_compressed": False,
        "interval_seconds": [REFERENCE_START_SECONDS, REFERENCE_END_SECONDS],
        "control_frame_interval_inclusive": [REFERENCE_START_FRAME, REFERENCE_FINAL_FRAME],
        "boundary_fades_seconds": [REFERENCE_FADE_SECONDS, REFERENCE_FADE_SECONDS],
        "boundary_rows_zero_cents": True,
        "nonzero_interior_frame_count": sum(abs(value) > 1.0e-9 for value in interior),
        "runtime_qa": dict(record),
    }


def _validate_policy_manifest(
    slot: str,
    policy: Mapping[str, Any],
    *,
    plan_sha: str,
) -> Dict[str, Any]:
    if policy.get("schema") != full_pack.POLICY_SCHEMA:
        _fail(f"{slot} score-expression manifest schema is unsupported")
    scope = _mapping(policy.get("r_and_d_scope"), f"{slot} policy scope")
    if any(scope.get(key) is not True for key in ("r_and_d_only", "no_default_assets", "no_game_output")):
        _fail(f"{slot} policy is not R&D-only/no-game")
    input_record = _mapping(policy.get("input"), f"{slot} policy input")
    if input_record.get("plan_sha256") != plan_sha:
        _fail(f"{slot} policy does not bind the supplied score plan")
    expression = _mapping(policy.get("expression_policy"), f"{slot} expression policy")
    if expression.get("automatic_activation") is not False or expression.get("default_decision") != "off":
        _fail(f"{slot} expression policy must remain explicit/default-off")
    fired = _list(policy.get("fired_policy_rules"), f"{slot} fired rules")
    selected = [
        _mapping(item, f"{slot} selected rule")
        for item in fired
        if isinstance(item, Mapping) and item.get("decision") in {"selected", REFERENCE_STATUS}
    ]
    selected_events = sorted(_text(item.get("event_id"), f"{slot} selected event") for item in selected)
    if selected_events != sorted((SHARED_SINE_EVENT_ID, REFERENCE_EVENT_ID)):
        _fail(f"{slot} policy selection must contain exactly b08 and b16")
    return {
        "passed": True,
        "automatic_activation": False,
        "default_decision": "off",
        "selected_event_ids": selected_events,
        "evidence_status": expression.get("evidence_status"),
    }


def _runtime_candidate(
    repository_root: Path,
    slot: str,
    candidate: Mapping[str, Any],
    reference: Mapping[str, Any],
) -> Dict[str, Any]:
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
        _fail(f"{slot} runtime report is not successful/supported")
    scope = _mapping(report.get("scope"), f"{slot} runtime scope")
    actions = _mapping(report.get("actions_performed"), f"{slot} runtime actions")
    if not (
        scope.get("r_and_d_only") is True
        and scope.get("no_default_bgm_changed") is True
        and scope.get("not_a_game_asset") is True
        and actions.get("default_bgm_changed") is False
        and actions.get("experimental_hard_f0_step") is True
        and actions.get("learned_reverb_called") is True
    ):
        _fail(f"{slot} runtime is not an offline R&D hard-step wet render")
    try:
        events, plan_qa = full_pack._plan_events(report, plan_source["sha256"])
        controls_path, controls_source = full_pack._resolve_report_output(
            report_path, report, key="controls_csv", label=f"{slot} controls"
        )
        audio_path, audio_source = full_pack._resolve_report_output(
            report_path,
            report,
            key="checkpoint_native_reverb_score_length_wav",
            label=f"{slot} score-length wet WAV",
        )
        controls = full_pack._load_controls(controls_path)
        rest_qa = full_pack._validate_written_rest(controls, report)
        release_qa = full_pack._validate_release(report, controls, plan_qa)
        audio_metrics = full_pack._audio_metrics(audio_path, require_target=False)
        level_qa = full_pack._validate_level_match(report, slot=slot)
    except full_pack.FullAriAuditionPackError as exc:
        raise ReferenceContourPackError(str(exc)) from exc
    report_controls = _mapping(report.get("score_controls"), f"{slot} score controls")
    if report_controls.get("renderer_control_hz") != full_pack.CONTROL_RATE_HZ:
        _fail(f"{slot} runtime is not on the exact 250 Hz control grid")
    if report_controls.get("frame_count") != full_pack.EXPECTED_CONTROL_FRAMES:
        _fail(f"{slot} runtime does not contain exactly 8,700 controls")
    slur = _mapping(report_controls.get("slur_transition_policy"), f"{slot} slur policy")
    if slur.get("pitch_mode") != full_pack.HARD_STEP_MODE:
        _fail(f"{slot} is not the selected hard-step transition baseline")

    plan_events = _list(plan.get("events"), f"{slot} score-plan events")
    plan_b08 = _event([_mapping(item, f"{slot} plan event") for item in plan_events], SHARED_SINE_EVENT_ID)
    plan_b16 = _event([_mapping(item, f"{slot} plan event") for item in plan_events], REFERENCE_EVENT_ID)
    report_b08 = _event(events, SHARED_SINE_EVENT_ID)
    report_b16 = _event(events, REFERENCE_EVENT_ID)
    if plan_b08.get("vibrato") != report_b08.get("vibrato"):
        _fail(f"{slot} runtime b08 expression differs from its plan")
    if slot == "B1":
        expression_qa = _validate_b1_expression(events, controls)
        _sine_shape(plan_b16, "B1 plan b16")
        reference_qa = None
    else:
        if sorted(full_pack._enabled_vibrato_event_ids(events)) != [SHARED_SINE_EVENT_ID]:
            _fail("B2-R must retain sine vibrato on b08 only")
        _sine_shape(report_b08, "B2-R b08")
        plan_reference = _validate_plan_reference(plan_b16, reference)
        report_reference = _validate_plan_reference(report_b16, reference)
        if plan_reference != report_reference:
            _fail("B2-R runtime reference block differs from its score plan")
        audible = controls["nonzero_vibrato_event_ids"]
        if audible != sorted((SHARED_SINE_EVENT_ID, REFERENCE_EVENT_ID)):
            _fail("B2-R controls must contain b08 sine and b16 reference motion only")
        reference_qa = _validate_reference_control_qa(report, controls, reference)
        expression_qa = {
            "passed": True,
            "expression_kind": "b08_sine_plus_b16_reference_shape_unreviewed",
            "sine_event_ids": [SHARED_SINE_EVENT_ID],
            "reference_event_ids": [REFERENCE_EVENT_ID],
            "learned": False,
        }
    policy_qa = _validate_policy_manifest(slot, policy, plan_sha=plan_source["sha256"])
    render = _mapping(report.get("render"), f"{slot} render")
    runtime = _mapping(render.get("runtime"), f"{slot} render runtime")
    if not isinstance(runtime.get("seed"), int):
        _fail(f"{slot} renderer seed is missing")
    reverb = _mapping(report.get("checkpoint_native_reverb_audition"), f"{slot} reverb")
    reverb_runtime = _mapping(reverb.get("runtime"), f"{slot} reverb runtime")
    reverb_source = _mapping(reverb_runtime.get("source"), f"{slot} reverb source")

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
        "expression_qa": expression_qa,
        "reference_qa": reference_qa,
        "policy_qa": policy_qa,
    }


def _compare_candidates(b1: Mapping[str, Any], b2r: Mapping[str, Any]) -> Dict[str, Any]:
    for key in (
        "score_skeleton",
        "checkpoint_signature",
        "public_sources_signature",
        "renderer_seed",
        "reverb_source",
    ):
        if b1[key] != b2r[key]:
            _fail(f"B2-R does not share B1 {key}")
    if full_pack._shared_control_signature(b1["controls"]) != full_pack._shared_control_signature(b2r["controls"]):
        _fail("B2-R changes timing, articulation, loudness, voicing, or event assignment")
    for key in (
        "constant_gain_applied_to_entire_file",
        "gain_source_slot",
        "monitoring_interval",
        "target_rms_dbfs",
        "reverb_kind",
        "reverb_source",
    ):
        if b1["level_qa"][key] != b2r["level_qa"][key]:
            _fail(f"B2-R does not share B1 level/reverb field {key}")
    gain = b1["level_qa"]["constant_gain_applied_to_entire_file"]
    if b1["level_qa"]["gain_source_slot"] != "B0":
        _fail("comparison gain was not derived exactly from B0")

    b1_rows = {row["frame_index"]: row for row in b1["controls"]["rows"]}
    b2_rows = {row["frame_index"]: row for row in b2r["controls"]["rows"]}
    b08_frames = [index for index, row in b1_rows.items() if row["event_id"] == SHARED_SINE_EVENT_ID]
    if not b08_frames:
        _fail("B1 contains no b08 controls")
    for index in b08_frames:
        for field in ("f0_hz", "vibrato_cents"):
            if not math.isclose(b1_rows[index][field], b2_rows[index][field], rel_tol=0.0, abs_tol=1.0e-12):
                _fail(f"B2-R b08 does not preserve the exact B1 sine {field}")
    changed_vibrato_events = sorted({
        b1_rows[index]["event_id"]
        for index in b1_rows
        if not math.isclose(
            b1_rows[index]["vibrato_cents"],
            b2_rows[index]["vibrato_cents"],
            rel_tol=0.0,
            abs_tol=1.0e-12,
        )
    })
    if changed_vibrato_events != [REFERENCE_EVENT_ID]:
        _fail("B1/B2-R vibrato controls may differ only on b16")
    return {
        "passed": True,
        "same_59_note_nominal_score_skeleton_timing_articulation_loudness_voicing": True,
        "same_checkpoint_public_sources_seed_and_checkpoint_native_reverb": True,
        "same_B0_derived_constant_gain": gain,
        "same_monitoring_interval_seconds": [0.0, 34.56],
        "b08_exact_B1_sine_preserved": True,
        "only_changed_expression_event_id": REFERENCE_EVENT_ID,
        "audio_bytes_copied_without_transform": True,
    }


def _copy_verified(source: Path, destination: Path, expected_sha: str) -> Dict[str, Any]:
    shutil.copyfile(source, destination)
    if _sha256(source) != expected_sha or _sha256(destination) != expected_sha:
        _fail("artifact bytes changed while assembling the listening pack")
    return full_pack._file_record(destination)


def _listening_readme() -> str:
    return """# Full-Arirang B1 / B2-R offline audition

These 34.80-second files share the same 59-note score, timing, articulation,
loudness, voicing, hard-step pitch policy, checkpoint, seed, checkpoint-native
reverb, B0-derived constant gain, and `[0.00, 34.56)` monitoring interval.

- **B1** uses the provisional sine-yoseong candidates on b08 and b16.
- **B2-R** preserves b08 byte-for-byte at the control level and replaces only
  b16 expression with one exact 1.5-second `reference_shape_unreviewed`
  contour. Its 120 ms linear-depth boundary fades reach zero cents.

The B2-R shape is an automatic periodic-F0 proxy from a local reference. It is
unreviewed, not a learned result, not validated as Gyeonggi-minyo style or even
as yoseong, not a training item, and not cleared for distribution or game use.
The packer copied source WAV bytes unchanged; it did not render, normalize, or
edit them. See the manifest and `provenance/` before interpreting the result.
"""


def build_full_ari_reference_contour_audition_pack(
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
        raise ReferenceContourPackError("spec and output must stay inside the repository") from exc
    if not output_relative.startswith("_bgm_rnd/"):
        _fail("output must be inside ignored _bgm_rnd/")
    if output_dir.exists() or not output_dir.parent.is_dir():
        _fail("output must be a fresh directory whose parent already exists")

    spec = _load_json(spec_path, "B1/B2-R audition spec")
    if spec.get("schema") != SPEC_SCHEMA:
        _fail("unsupported B1/B2-R audition spec schema")
    candidates = _mapping(spec.get("candidates"), "spec candidates")
    if set(candidates) != set(ROLES):
        _fail("spec must contain exactly B1 and B2-R")
    reference_record = _mapping(spec.get("reference_artifact"), "spec reference_artifact")
    reference_path, _, reference = _reference_artifact(repository_root, reference_record)
    try:
        guard = full_pack.validate_default_bgm_untouched(
            repository_root, baseline_revision=baseline_revision
        )
    except full_pack.FullAriAuditionPackError as exc:
        raise ReferenceContourPackError(str(exc)) from exc

    ready: Dict[str, Dict[str, Any]] = {}
    for slot in ("B1", "B2-R"):
        candidate = _mapping(candidates[slot], f"candidates.{slot}")
        if candidate.get("status") != "ready" or candidate.get("role") != ROLES[slot]:
            _fail(f"{slot} is not ready under its fixed comparison role")
        ready[slot] = _runtime_candidate(repository_root, slot, candidate, reference)
    fairness = _compare_candidates(ready["B1"], ready["B2-R"])

    source_paths = {reference_path, spec_path}
    for item in ready.values():
        source_paths.update(item[key] for key in (
            "report_path", "plan_path", "policy_path", "controls_path", "audio_path"
        ))
    source_hashes = {path: _sha256(path) for path in source_paths}
    spec_sha = source_hashes[spec_path]
    manifest_candidates: Dict[str, Any] = {}
    with tempfile.TemporaryDirectory(prefix=".full-ari-reference-pack-", dir=str(output_dir.parent)) as temp:
        staging = Path(temp)
        provenance_dir = staging / "provenance"
        provenance_dir.mkdir()
        _copy_verified(spec_path, staging / SPEC_SNAPSHOT_FILENAME, spec_sha)
        reference_copy = _copy_verified(
            reference_path,
            provenance_dir / "reference_shape_unreviewed.json",
            reference["sha256"],
        )
        for slot in ("B1", "B2-R"):
            item = ready[slot]
            output_audio = staging / OUTPUT_AUDIO_NAMES[slot]
            audio_record = _copy_verified(
                item["audio_path"], output_audio, item["audio_source"]["sha256"]
            )
            packaged: Dict[str, Any] = {}
            safe_slot = slot.replace("-", "")
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
            raise ReferenceContourPackError(str(exc)) from exc
        manifest: Dict[str, Any] = {
            "schema": MANIFEST_SCHEMA,
            "status": "succeeded",
            "scope": {
                "offline_rnd_only": True,
                "unreviewed_reference_shape": True,
                "learned_result": False,
                "gyeonggi_style_validated": False,
                "human_musicological_reviewed": False,
                "training_item": False,
                "game_asset": False,
                "distribution_ready": False,
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
                "reference_event_id": REFERENCE_EVENT_ID,
                "reference_duration_seconds": REFERENCE_DURATION_SECONDS,
                "reference_time_compression": False,
                "reference_boundary_fade_seconds": [REFERENCE_FADE_SECONDS, REFERENCE_FADE_SECONDS],
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
                "B2R_is_an_unreviewed_reference_F0_proxy_not_a_learned_result": True,
                "B2R_is_not_confirmed_yoseong_or_Gyeonggi_minyo_style": True,
                "neither_candidate_is_a_training_item_or_game_asset": True,
                "checkpoint_weights_are_not_established_as_game_distribution_cleared": True,
            },
        }
        _write_json(staging / MANIFEST_FILENAME, manifest)
        (staging / "README.md").write_text(_listening_readme(), encoding="utf-8")
        if any(_sha256(path) != digest for path, digest in source_hashes.items()):
            _fail("a source artifact changed while assembling the pack")
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
        manifest = build_full_ari_reference_contour_audition_pack(
            args.repository_root, args.spec, args.output_dir
        )
    except ReferenceContourPackError as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "status": manifest["status"],
        "manifest": str(args.output_dir / MANIFEST_FILENAME),
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
