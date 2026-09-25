#!/usr/bin/env python3
"""Render one explicit score-expression artifact as an untrained synthetic preview.

This is deliberately a small, deterministic monitor for the R&D control
layer.  It consumes the controls written by ``tools/score-expression`` and
generates a generic harmonic-plus-noise waveform.  It does **not** load a
model, read or copy source audio, or claim to render a real Daegeum.

The emitted WAV is always labelled ``untrained_synthetic_preview`` in its
filename and sidecar manifest.  It is an isolated R&D listening aid only --
never a default asset, runtime BGM, game output, training result, or public
release.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any, Mapping, Sequence
import wave

import numpy


SCORE_MANIFEST_SCHEMA = "mini.score-expression.render-manifest.v2"
SCORE_CONTROLS_SCHEMA = "mini.score-expression.controls.v1"
SCORE_MANIFEST_FILENAME = "score_expression_manifest.json"
SCORE_CONTROLS_FILENAME = "score_expression_controls.npz"
PREVIEW_MANIFEST_SCHEMA = "mini.expressive-synthesis.untrained-synthetic-preview.v1"
PREVIEW_WAV_FILENAME = "untrained_synthetic_preview.wav"
PREVIEW_MANIFEST_FILENAME = "untrained_synthetic_preview_manifest.json"
EXPECTED_SAMPLE_RATE_HZ = 48_000
EXPECTED_SCORE_FEATURE_DIM = 9
DEFAULT_SEED = 20_260_925
SLUR_BOUNDARY_F0_SCHEMA = "mini.score-expression.slur-boundary-f0.v1"
SLUR_STATE_CODE = 3
CANONICAL_SLUR_TRANSITION_SECONDS = 0.012
CANONICAL_SLUR_TRANSITION_SAMPLES = int(CANONICAL_SLUR_TRANSITION_SECONDS * EXPECTED_SAMPLE_RATE_HZ)
CANONICAL_SLUR_POLICY = {
    "pitch_transition_milliseconds": 12,
    "pitch_shape": "minimum_jerk_log_frequency_cents",
    "pitch_domain": "log_frequency_cents",
    "pitch_target_settle_by_seconds": 0.050,
    "intermediate_pitch_dwell_strictly_less_than_seconds": 0.020,
    "dynamic_transition_seconds": 0.080,
    "dynamic_shape": "minimum_jerk_linear_loudness",
    "dynamic_domain": "linear_loudness",
    "dynamic_target_settle_by_seconds": 0.100,
    "no_rearticulation_envelope_for_slur": True,
}
SCOPE_KEYS = (
    "r_and_d_only",
    "no_default_assets",
    "no_runtime_bgm",
    "no_game_output",
    "no_public_release",
)


class SyntheticPreviewError(RuntimeError):
    """An R&D control artifact or preview destination is unsafe or invalid."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _load_json(path: Path) -> Mapping[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SyntheticPreviewError(f"required controls manifest is missing: {path.name}") from exc
    except json.JSONDecodeError as exc:
        raise SyntheticPreviewError("controls manifest is not valid JSON") from exc
    if not isinstance(value, Mapping):
        raise SyntheticPreviewError("controls manifest must be a JSON object")
    return value


def _mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise SyntheticPreviewError(f"{label} must be an object")
    return value


def _require_true(value: Mapping[str, Any], key: str, *, label: str) -> None:
    if value.get(key) is not True:
        raise SyntheticPreviewError(f"{label}.{key} must explicitly be true")


def _require_false(value: Mapping[str, Any], key: str, *, label: str) -> None:
    if value.get(key) is not False:
        raise SyntheticPreviewError(f"{label}.{key} must explicitly be false")


def _strict_scalar(archive: Any, key: str) -> Any:
    if key not in archive.files:
        raise SyntheticPreviewError(f"controls archive is missing {key}")
    value = archive[key]
    if value.shape != ():
        raise SyntheticPreviewError(f"controls.{key} must be a scalar")
    return value.item()


def _integer(value: Any, *, label: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool):
        raise SyntheticPreviewError(f"{label} must be an integer")
    try:
        result = int(value)
    except (TypeError, ValueError) as exc:
        raise SyntheticPreviewError(f"{label} must be an integer") from exc
    if result != value or not minimum <= result <= maximum:
        raise SyntheticPreviewError(f"{label} is outside its allowed range")
    return result


def _number(value: Any, *, label: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool):
        raise SyntheticPreviewError(f"{label} must be a finite number")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise SyntheticPreviewError(f"{label} must be a finite number") from exc
    if not math.isfinite(result) or not minimum <= result <= maximum:
        raise SyntheticPreviewError(f"{label} is outside its allowed range")
    return result


def _require_close(value: Any, expected: float, *, label: str, tolerance: float = 1.0e-9) -> float:
    result = _number(value, label=label, minimum=-1_000_000.0, maximum=1_000_000.0)
    if not math.isclose(result, expected, abs_tol=tolerance, rel_tol=0.0):
        raise SyntheticPreviewError(f"{label} must equal the canonical value")
    return result


def _sha256_text(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or len(value) != 64:
        raise SyntheticPreviewError(f"{label} must be a lowercase SHA-256 digest")
    if any(character not in "0123456789abcdef" for character in value):
        raise SyntheticPreviewError(f"{label} must be a lowercase SHA-256 digest")
    return value


def _plan_basename(value: Any) -> str:
    if not isinstance(value, str) or not value or value in {".", ".."}:
        raise SyntheticPreviewError("controls manifest.input.plan_basename must be a plan filename")
    if "/" in value or "\\" in value:
        raise SyntheticPreviewError("controls manifest.input.plan_basename must not contain a path")
    return value


def _array(archive: Any, key: str, *, frames: int, finite: bool = True) -> numpy.ndarray:
    if key not in archive.files:
        raise SyntheticPreviewError(f"controls archive is missing {key}")
    value = numpy.asarray(archive[key])
    if value.ndim != 1 or value.shape[0] != frames:
        raise SyntheticPreviewError(f"controls.{key} must have shape [{frames}]")
    if finite and not numpy.all(numpy.isfinite(value)):
        raise SyntheticPreviewError(f"controls.{key} must be finite")
    return value.copy()


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True


def _default_bgm_root() -> Path:
    return Path(__file__).resolve().parents[2] / "public" / "assets" / "audio" / "bgm"


def _reject_default_bgm_path(path: Path, *, label: str) -> None:
    if _is_within(path, _default_bgm_root().resolve()):
        raise SyntheticPreviewError(f"{label} must not be inside default BGM assets")


def _validate_canonical_slur_policy(value: Any) -> dict[str, Any]:
    """Reject stale or alternate slur policies before any preview is written."""

    policy = _mapping(value, label="controls manifest.controls.slur_transition_policy")
    for key, expected in CANONICAL_SLUR_POLICY.items():
        actual = policy.get(key)
        label = f"controls manifest.controls.slur_transition_policy.{key}"
        if isinstance(expected, bool):
            if actual is not expected:
                raise SyntheticPreviewError(f"{label} must equal the canonical value")
        elif isinstance(expected, str):
            if actual != expected:
                raise SyntheticPreviewError(f"{label} must equal the canonical value")
        else:
            _require_close(actual, float(expected), label=label)
    return dict(CANONICAL_SLUR_POLICY)


def _minimum_jerk_progress(progress: numpy.ndarray) -> numpy.ndarray:
    unit = numpy.clip(progress, 0.0, 1.0)
    return unit * unit * unit * (10.0 + unit * (-15.0 + 6.0 * unit))


def _minimum_jerk_log_frequency_hz(source_hz: float, target_hz: float, local_seconds: numpy.ndarray) -> numpy.ndarray:
    source_cents = 1_200.0 * math.log2(source_hz)
    target_cents = 1_200.0 * math.log2(target_hz)
    cents = source_cents + (target_cents - source_cents) * _minimum_jerk_progress(
        numpy.asarray(local_seconds, dtype=numpy.float64) / CANONICAL_SLUR_TRANSITION_SECONDS
    )
    return numpy.power(2.0, cents / 1_200.0)


def _validated_slur_boundaries(manifest: Mapping[str, Any], *, control_hz: int) -> list[dict[str, Any]]:
    """Validate compiler-attested boundary F0 data needed for a safe handoff.

    The preview deliberately does not reverse-engineer a slur from sampled F0
    rows.  It accepts only the compiler's explicit, canonical source/target
    boundary contract and rejects every earlier manifest that lacks it.
    """

    raw_events = manifest.get("events")
    if not isinstance(raw_events, list) or not raw_events:
        raise SyntheticPreviewError("controls manifest.events must be a non-empty compiler event list")
    events = [_mapping(item, label=f"controls manifest.events[{index}]") for index, item in enumerate(raw_events)]
    ids: list[str] = []
    for index, event in enumerate(events):
        event_id = event.get("id")
        if not isinstance(event_id, str) or not event_id:
            raise SyntheticPreviewError(f"controls manifest.events[{index}].id must be a non-empty string")
        ids.append(event_id)
        _number(event.get("start_seconds"), label=f"controls manifest.events[{index}].start_seconds", minimum=0.0, maximum=100_000.0)
        _number(event.get("end_seconds"), label=f"controls manifest.events[{index}].end_seconds", minimum=0.0, maximum=100_000.0)
    if len(set(ids)) != len(ids):
        raise SyntheticPreviewError("controls manifest.events repeats an id")

    boundaries: list[dict[str, Any]] = []
    for index, event in enumerate(events):
        if event.get("articulation") != "slur":
            if "slur_boundary_f0" in event:
                raise SyntheticPreviewError("only an explicit slur event may carry slur boundary F0 metadata")
            continue
        if index == 0 or events[index - 1].get("articulation") == "release":
            raise SyntheticPreviewError("slur boundary metadata requires a preceding voiced event")
        boundary = _mapping(event.get("slur_boundary_f0"), label=f"controls manifest.events[{index}].slur_boundary_f0")
        if boundary.get("schema") != SLUR_BOUNDARY_F0_SCHEMA:
            raise SyntheticPreviewError("slur boundary F0 metadata is missing its canonical schema")
        if boundary.get("event_id") != event["id"] or _integer(boundary.get("event_index"), label="slur boundary event_index", minimum=0, maximum=len(events) - 1) != index:
            raise SyntheticPreviewError("slur boundary F0 metadata does not identify its target event")
        source = events[index - 1]
        if boundary.get("source_event_id") != source["id"] or _integer(boundary.get("source_event_index"), label="slur boundary source_event_index", minimum=0, maximum=len(events) - 1) != index - 1:
            raise SyntheticPreviewError("slur boundary F0 metadata does not identify its source event")

        start_seconds = _number(event.get("start_seconds"), label="slur event start_seconds", minimum=0.0, maximum=100_000.0)
        if not math.isclose(
            _number(boundary.get("boundary_seconds"), label="slur boundary boundary_seconds", minimum=0.0, maximum=100_000.0),
            start_seconds,
            abs_tol=1.0e-9,
            rel_tol=0.0,
        ):
            raise SyntheticPreviewError("slur boundary F0 metadata must begin at its event boundary")
        if boundary.get("preview_reconstruction_eligible") is not True:
            raise SyntheticPreviewError("slur boundary is not eligible for the isolated audio-rate preview reconstruction")
        reasons = boundary.get("preview_reconstruction_ineligible_reasons")
        if not isinstance(reasons, list) or reasons:
            raise SyntheticPreviewError("eligible slur boundary must carry an empty ineligible-reasons list")
        expected_boundary_frame = int(round(start_seconds * control_hz))
        if not math.isclose(expected_boundary_frame / float(control_hz), start_seconds, abs_tol=1.0e-9, rel_tol=0.0):
            raise SyntheticPreviewError("slur boundary must align to the compiler control grid")
        expected_start_sample = int(round(start_seconds * EXPECTED_SAMPLE_RATE_HZ))
        if not math.isclose(expected_start_sample / float(EXPECTED_SAMPLE_RATE_HZ), start_seconds, abs_tol=1.0e-9, rel_tol=0.0):
            raise SyntheticPreviewError("slur boundary must align to the 48 kHz timeline")
        expected_rejoin_frame = int(math.floor((start_seconds + CANONICAL_SLUR_TRANSITION_SECONDS) * control_hz + 1.0e-12)) + 1
        expected_source_hold_sample = int(round((expected_boundary_frame - 1) * EXPECTED_SAMPLE_RATE_HZ / float(control_hz)))
        expected_rejoin_sample = int(round(expected_rejoin_frame * EXPECTED_SAMPLE_RATE_HZ / float(control_hz)))
        integer_expectations = {
            "boundary_control_frame_index": expected_boundary_frame,
            "source_hold_control_frame_index": expected_boundary_frame - 1,
            "source_hold_sample_48k": expected_source_hold_sample,
            "transition_start_sample_48k": expected_start_sample,
            "transition_end_sample_48k": expected_start_sample + CANONICAL_SLUR_TRANSITION_SAMPLES,
            "target_rejoin_control_frame_index": expected_rejoin_frame,
            "target_rejoin_sample_48k": expected_rejoin_sample,
        }
        for key, expected in integer_expectations.items():
            actual = _integer(boundary.get(key), label=f"slur boundary {key}", minimum=0, maximum=10_000_000_000)
            if actual != expected:
                raise SyntheticPreviewError(f"slur boundary {key} does not match the canonical timeline")
        _require_close(
            boundary.get("transition_seconds"),
            CANONICAL_SLUR_TRANSITION_SECONDS,
            label="slur boundary transition_seconds",
        )
        if boundary.get("pitch_shape") != CANONICAL_SLUR_POLICY["pitch_shape"] or boundary.get("pitch_domain") != CANONICAL_SLUR_POLICY["pitch_domain"]:
            raise SyntheticPreviewError("slur boundary F0 metadata does not declare the canonical log-frequency minimum-jerk policy")

        source_pitch = _number(source.get("pitch_hz"), label="slur source event pitch_hz", minimum=20.0, maximum=4_000.0)
        target_pitch = _number(event.get("pitch_hz"), label="slur target event pitch_hz", minimum=20.0, maximum=4_000.0)
        source_cents = _number(boundary.get("source_boundary_gesture_cents"), label="slur source_boundary_gesture_cents", minimum=-600.0, maximum=600.0)
        target_cents = _number(boundary.get("target_entry_gesture_cents"), label="slur target_entry_gesture_cents", minimum=-600.0, maximum=600.0)
        expected_source_hz = source_pitch * (2.0 ** (source_cents / 1_200.0))
        expected_target_hz = target_pitch * (2.0 ** (target_cents / 1_200.0))
        source_hz = _number(boundary.get("source_boundary_f0_hz"), label="slur source_boundary_f0_hz", minimum=20.0, maximum=4_000.0)
        target_hz = _number(boundary.get("target_entry_f0_hz"), label="slur target_entry_f0_hz", minimum=20.0, maximum=4_000.0)
        source_hold_hz = _number(boundary.get("source_hold_f0_hz"), label="slur source_hold_f0_hz", minimum=20.0, maximum=4_000.0)
        target_rejoin_hz = _number(boundary.get("target_rejoin_f0_hz"), label="slur target_rejoin_f0_hz", minimum=20.0, maximum=4_000.0)
        if not math.isclose(source_hz, expected_source_hz, abs_tol=2.0e-6, rel_tol=0.0) or not math.isclose(target_hz, expected_target_hz, abs_tol=2.0e-6, rel_tol=0.0):
            raise SyntheticPreviewError("slur boundary F0 does not match the compiler-attested score pitch and gesture entry")
        boundaries.append({
            "event_id": str(event["id"]),
            "event_index": index,
            "boundary_seconds": start_seconds,
            "source_boundary_f0_hz": source_hz,
            "target_entry_f0_hz": target_hz,
            "source_hold_f0_hz": source_hold_hz,
            "target_rejoin_f0_hz": target_rejoin_hz,
            **integer_expectations,
        })
    return boundaries


def _validate_score_manifest(manifest: Mapping[str, Any], *, controls_path: Path) -> dict[str, Any]:
    if manifest.get("schema") != SCORE_MANIFEST_SCHEMA:
        raise SyntheticPreviewError(f"controls manifest.schema must be {SCORE_MANIFEST_SCHEMA}")
    if manifest.get("artifact_kind") != "rnd_only_score_to_expression_controls":
        raise SyntheticPreviewError("controls manifest is not an explicit R&D score-expression artifact")

    scope = _mapping(manifest.get("r_and_d_scope"), label="controls manifest.r_and_d_scope")
    for key in SCOPE_KEYS:
        _require_true(scope, key, label="controls manifest.r_and_d_scope")

    source_input = _mapping(manifest.get("input"), label="controls manifest.input")
    for key in ("source_audio_read", "model_training_run", "game_or_runtime_asset_read_or_written"):
        _require_false(source_input, key, label="controls manifest.input")
    plan_basename = _plan_basename(source_input.get("plan_basename"))
    plan_sha256 = _sha256_text(
        source_input.get("plan_sha256"),
        label="controls manifest.input.plan_sha256",
    )

    limits = _mapping(manifest.get("interpretation_limits"), label="controls manifest.interpretation_limits")
    for key in (
        "articulations_are_authorial_score_controls_not_inferred_performance_labels",
        "controls_are_not_recording_derived_training_targets",
        "no_audio_is_rendered_or_modified",
        "not_a_default_asset_runtime_bgm_game_output_or_public_release",
    ):
        _require_true(limits, key, label="controls manifest.interpretation_limits")

    controls = _mapping(manifest.get("controls"), label="controls manifest.controls")
    if controls.get("artifact") != SCORE_CONTROLS_FILENAME:
        raise SyntheticPreviewError("controls manifest must name only score_expression_controls.npz")
    if controls.get("schema") != SCORE_CONTROLS_SCHEMA:
        raise SyntheticPreviewError(f"controls manifest.controls.schema must be {SCORE_CONTROLS_SCHEMA}")
    if controls.get("sha256") != _sha256(controls_path):
        raise SyntheticPreviewError("controls manifest SHA-256 does not match the supplied NPZ")
    sample_rate_hz = _integer(
        controls.get("sample_rate_hz"),
        label="controls manifest.controls.sample_rate_hz",
        minimum=2,
        maximum=384_000,
    )
    if sample_rate_hz != EXPECTED_SAMPLE_RATE_HZ:
        raise SyntheticPreviewError("v2 preview accepts only the explicit 48 kHz score-expression timeline")
    control_hz = _integer(
        controls.get("control_hz"),
        label="controls manifest.controls.control_hz",
        minimum=25,
        maximum=1_000,
    )
    frame_count = _integer(
        controls.get("frame_count"),
        label="controls manifest.controls.frame_count",
        minimum=2,
        maximum=10_000_000,
    )
    score_feature_dim = _integer(
        controls.get("score_feature_dim"),
        label="controls manifest.controls.score_feature_dim",
        minimum=1,
        maximum=1_024,
    )
    if score_feature_dim != EXPECTED_SCORE_FEATURE_DIM:
        raise SyntheticPreviewError("v2 preview accepts only the explicit nine-column score feature layout")
    slur_policy = _validate_canonical_slur_policy(controls.get("slur_transition_policy"))
    slur_boundaries = _validated_slur_boundaries(manifest, control_hz=control_hz)
    return {
        "scope": {key: True for key in SCOPE_KEYS},
        "controls_sha256": str(controls["sha256"]),
        "manifest_sha256": None,
        "plan_basename": plan_basename,
        "plan_sha256": plan_sha256,
        "sample_rate_hz": sample_rate_hz,
        "control_hz": control_hz,
        "frame_count": frame_count,
        "score_feature_dim": score_feature_dim,
        "event_count": len(manifest.get("events", [])) if isinstance(manifest.get("events"), list) else 0,
        "slur_transition_policy": slur_policy,
        "slur_boundaries": slur_boundaries,
    }


def _validate_slur_boundary_controls(
    boundaries: Sequence[Mapping[str, Any]],
    *,
    frame_times: numpy.ndarray,
    frame_centers: numpy.ndarray,
    f0_hz: numpy.ndarray,
    voicing: numpy.ndarray,
    gesture_state: numpy.ndarray,
    event_index: numpy.ndarray,
) -> None:
    """Cross-check boundary metadata against the SHA-verified control rows."""

    for boundary in boundaries:
        event = int(boundary["event_index"])
        source_event = event - 1
        start_frame = int(boundary["boundary_control_frame_index"])
        source_hold_frame = int(boundary["source_hold_control_frame_index"])
        rejoin_frame = int(boundary["target_rejoin_control_frame_index"])
        start_sample = int(boundary["transition_start_sample_48k"])
        end_sample = int(boundary["transition_end_sample_48k"])
        rejoin_sample = int(boundary["target_rejoin_sample_48k"])
        if not (0 <= source_hold_frame < start_frame < rejoin_frame < f0_hz.shape[0]):
            raise SyntheticPreviewError("slur boundary control-frame indices are outside the archive timeline")
        if int(frame_centers[source_hold_frame]) != int(boundary["source_hold_sample_48k"]):
            raise SyntheticPreviewError("slur source-hold sample does not match the archive timeline")
        if int(frame_centers[start_frame]) != start_sample or int(frame_centers[rejoin_frame]) != rejoin_sample:
            raise SyntheticPreviewError("slur boundary samples do not match the archive timeline")
        if rejoin_sample < end_sample:
            raise SyntheticPreviewError("slur target rejoin precedes the canonical 12 ms transition end")
        if int(event_index[source_hold_frame]) != source_event or int(event_index[start_frame]) != event or int(event_index[rejoin_frame]) != event:
            raise SyntheticPreviewError("slur boundary event indices do not match the archive")
        if int(gesture_state[start_frame]) != SLUR_STATE_CODE or int(gesture_state[rejoin_frame]) != SLUR_STATE_CODE:
            raise SyntheticPreviewError("slur boundary gesture states do not match the archive")
        if not math.isclose(float(f0_hz[source_hold_frame]), float(boundary["source_hold_f0_hz"]), abs_tol=2.0e-3, rel_tol=0.0):
            raise SyntheticPreviewError("slur source-hold F0 does not match the archive")
        if not math.isclose(float(f0_hz[start_frame]), float(boundary["source_boundary_f0_hz"]), abs_tol=2.0e-3, rel_tol=0.0):
            raise SyntheticPreviewError("slur source-boundary F0 does not match the archive")
        if not math.isclose(float(f0_hz[rejoin_frame]), float(boundary["target_rejoin_f0_hz"]), abs_tol=2.0e-3, rel_tol=0.0):
            raise SyntheticPreviewError("slur target-rejoin F0 does not match the archive")

        local = frame_times - float(boundary["boundary_seconds"])
        transition_rows = (event_index == event) & (gesture_state == SLUR_STATE_CODE) & (local >= 0.0) & (local < CANONICAL_SLUR_TRANSITION_SECONDS)
        if not numpy.any(transition_rows):
            raise SyntheticPreviewError("slur archive has no sampled row inside its canonical transition")
        expected = _minimum_jerk_log_frequency_hz(
            float(boundary["source_boundary_f0_hz"]),
            float(boundary["target_entry_f0_hz"]),
            local[transition_rows],
        )
        if not numpy.allclose(f0_hz[transition_rows], expected, rtol=0.0, atol=2.0e-3):
            raise SyntheticPreviewError("slur archive does not match the canonical 12 ms log-frequency minimum-jerk transition")
        slur_rows = (event_index == event) & (gesture_state == SLUR_STATE_CODE)
        if not numpy.allclose(voicing[slur_rows], 1.0, rtol=0.0, atol=1.0e-7):
            raise SyntheticPreviewError("slur archive contains a voicing dip; refusing to invent a re-attack-free preview")


def load_rnd_score_controls(controls_dir: str | Path) -> dict[str, Any]:
    """Load and strictly validate one compiler-written R&D control artifact.

    Only the JSON manifest and its SHA-verified NPZ control archive are read.
    No recording, model, game asset, or directory-discovered input is touched.
    """

    directory = Path(controls_dir).expanduser().resolve()
    if not directory.is_dir():
        raise SyntheticPreviewError("--controls-dir must name one score-expression artifact directory")
    _reject_default_bgm_path(directory, label="controls artifact")
    controls_path = directory / SCORE_CONTROLS_FILENAME
    manifest_path = directory / SCORE_MANIFEST_FILENAME
    if not controls_path.is_file():
        raise SyntheticPreviewError(f"required controls archive is missing: {SCORE_CONTROLS_FILENAME}")
    manifest = _load_json(manifest_path)
    validated = _validate_score_manifest(manifest, controls_path=controls_path)
    validated["manifest_sha256"] = _sha256(manifest_path)

    try:
        with numpy.load(controls_path, allow_pickle=False) as archive:
            schema = _strict_scalar(archive, "schema")
            if schema != SCORE_CONTROLS_SCHEMA:
                raise SyntheticPreviewError(f"controls.schema must be {SCORE_CONTROLS_SCHEMA}")
            sample_rate_hz = _integer(
                _strict_scalar(archive, "sample_rate_hz"),
                label="controls.sample_rate_hz",
                minimum=2,
                maximum=384_000,
            )
            control_hz = _integer(
                _strict_scalar(archive, "control_hz"),
                label="controls.control_hz",
                minimum=25,
                maximum=1_000,
            )
            if sample_rate_hz != validated["sample_rate_hz"] or control_hz != validated["control_hz"]:
                raise SyntheticPreviewError("controls archive disagrees with its manifest timeline")
            frames = int(validated["frame_count"])
            frame_times = _array(archive, "frame_times_seconds", frames=frames)
            centers = _array(archive, "frame_centers_48k", frames=frames)
            f0_hz = _array(archive, "f0_hz", frames=frames)
            target_f0_hz = _array(archive, "target_f0_hz", frames=frames)
            loudness_db = _array(archive, "loudness_db", frames=frames)
            target_loudness_db = _array(archive, "target_loudness_db", frames=frames)
            air_noise_ratio = _array(archive, "air_noise_ratio", frames=frames)
            voicing = _array(archive, "voicing", frames=frames)
            gesture_state = _array(archive, "gesture_state", frames=frames)
            event_index = _array(archive, "event_index", frames=frames)
            score_features = numpy.asarray(archive["score_features"]).copy() if "score_features" in archive.files else None
    except (OSError, ValueError, EOFError) as exc:
        raise SyntheticPreviewError("controls archive could not be read as a safe NumPy artifact") from exc

    if score_features is None or score_features.shape != (frames, validated["score_feature_dim"]):
        raise SyntheticPreviewError("controls.score_features does not have the manifest's explicit shape")
    if not numpy.all(numpy.isfinite(score_features)):
        raise SyntheticPreviewError("controls.score_features must be finite")
    if not numpy.issubdtype(centers.dtype, numpy.integer):
        raise SyntheticPreviewError("controls.frame_centers_48k must be integer sample positions")
    if not numpy.issubdtype(gesture_state.dtype, numpy.integer):
        raise SyntheticPreviewError("controls.gesture_state must be integer state codes")
    if not numpy.issubdtype(event_index.dtype, numpy.integer):
        raise SyntheticPreviewError("controls.event_index must be integer event positions")
    if float(frame_times[0]) != 0.0 or numpy.any(numpy.diff(frame_times) <= 0.0):
        raise SyntheticPreviewError("controls.frame_times_seconds must start at zero and strictly increase")
    expected_step = 1.0 / float(control_hz)
    if not numpy.allclose(numpy.diff(frame_times), expected_step, rtol=0.0, atol=1.0e-6):
        raise SyntheticPreviewError("controls.frame_times_seconds is not aligned to its explicit control rate")
    expected_centers = numpy.rint(frame_times * sample_rate_hz).astype(centers.dtype)
    if not numpy.array_equal(centers, expected_centers):
        raise SyntheticPreviewError("controls.frame_centers_48k is not aligned to the explicit 48 kHz timeline")
    if int(centers[-1]) < 2:
        raise SyntheticPreviewError("controls duration is too short to render")
    if numpy.any(f0_hz < 0.0) or numpy.any(f0_hz >= sample_rate_hz / 2.0):
        raise SyntheticPreviewError("controls.f0_hz is outside the safe synthetic-render range")
    if not numpy.allclose(f0_hz, target_f0_hz, rtol=0.0, atol=1.0e-6):
        raise SyntheticPreviewError("controls.target_f0_hz must equal the explicit f0_hz prescription")
    if numpy.any(loudness_db < -80.0) or numpy.any(loudness_db > 0.0):
        raise SyntheticPreviewError("controls.loudness_db is outside the score-expression range")
    if not numpy.allclose(loudness_db, target_loudness_db, rtol=0.0, atol=1.0e-6):
        raise SyntheticPreviewError("controls.target_loudness_db must equal the explicit loudness prescription")
    if numpy.any(air_noise_ratio < 0.0) or numpy.any(air_noise_ratio > 1.0):
        raise SyntheticPreviewError("controls.air_noise_ratio must be within [0, 1]")
    if numpy.any(voicing < 0.0) or numpy.any(voicing > 1.0):
        raise SyntheticPreviewError("controls.voicing must be within [0, 1]")
    if numpy.any(gesture_state < 0) or numpy.any(gesture_state > 4):
        raise SyntheticPreviewError("controls.gesture_state contains an unknown articulation code")
    if numpy.any(event_index < -1) or numpy.any(event_index >= validated["event_count"]):
        raise SyntheticPreviewError("controls.event_index contains an unknown event position")
    _validate_slur_boundary_controls(
        validated["slur_boundaries"],
        frame_times=frame_times.astype(numpy.float64),
        frame_centers=centers.astype(numpy.int64),
        f0_hz=f0_hz.astype(numpy.float64),
        voicing=voicing.astype(numpy.float64),
        gesture_state=gesture_state.astype(numpy.int16),
        event_index=event_index.astype(numpy.int32),
    )

    return {
        **validated,
        "controls_dir": directory,
        "frame_times_seconds": frame_times.astype(numpy.float64),
        "frame_centers": centers.astype(numpy.int64),
        "f0_hz": f0_hz.astype(numpy.float64),
        "loudness_db": loudness_db.astype(numpy.float64),
        "air_noise_ratio": air_noise_ratio.astype(numpy.float64),
        "voicing": voicing.astype(numpy.float64),
        "gesture_state": gesture_state.astype(numpy.int16),
        "event_index": event_index.astype(numpy.int32),
    }


def reconstruct_audio_rate_slur_f0(controls: Mapping[str, Any]) -> tuple[numpy.ndarray, numpy.ndarray, dict[str, Any]]:
    """Restore canonical slur F0 at 48 kHz without resetting oscillator phase.

    All non-slur F0 remains the legacy deterministic interpolation.  At each
    compiler-attested slur boundary, the first 12 ms is replaced with the
    canonical log-frequency minimum-jerk curve.  Any remaining gap until the
    first authorial target control row is joined in log-frequency as well;
    this retains a deliberately early gesture/vibrato instead of silently
    forcing the compiler to write a flat target row.
    """

    sample_rate_hz = int(controls["sample_rate_hz"])
    frame_times = numpy.asarray(controls["frame_times_seconds"], dtype=numpy.float64)
    sample_count = int(numpy.asarray(controls["frame_centers"], dtype=numpy.int64)[-1])
    sample_indices = numpy.arange(sample_count, dtype=numpy.int64)
    sample_times = sample_indices.astype(numpy.float64) / float(sample_rate_hz)
    f0_hz = numpy.interp(sample_times, frame_times, numpy.asarray(controls["f0_hz"], dtype=numpy.float64)).astype(numpy.float64)
    rendered_boundaries: list[dict[str, Any]] = []

    for boundary in controls["slur_boundaries"]:
        start_sample = int(boundary["transition_start_sample_48k"])
        end_sample = int(boundary["transition_end_sample_48k"])
        rejoin_sample = int(boundary["target_rejoin_sample_48k"])
        if not (0 <= start_sample < end_sample <= rejoin_sample < sample_count):
            raise SyntheticPreviewError("slur reconstruction interval is outside the preview waveform")
        source_hz = float(boundary["source_boundary_f0_hz"])
        target_hz = float(boundary["target_entry_f0_hz"])
        rejoin_hz = float(boundary["target_rejoin_f0_hz"])

        transition_samples = numpy.arange(start_sample, end_sample + 1, dtype=numpy.int64)
        local_seconds = (transition_samples - start_sample).astype(numpy.float64) / float(sample_rate_hz)
        transition_f0 = _minimum_jerk_log_frequency_hz(source_hz, target_hz, local_seconds)
        if not math.isclose(float(transition_f0[0]), source_hz, abs_tol=1.0e-9, rel_tol=0.0) or not math.isclose(float(transition_f0[-1]), target_hz, abs_tol=1.0e-9, rel_tol=0.0):
            raise AssertionError("canonical audio-rate slur transition endpoints must be exact")
        f0_hz[transition_samples] = transition_f0

        # The compiler's first 100 Hz row after 12 ms can contain an explicit
        # gesture/vibrato value.  Rejoin to that authorial value in the same
        # log-frequency domain; never use the old linear-Hz interpolation.
        rejoin_samples = numpy.arange(end_sample + 1, rejoin_sample + 1, dtype=numpy.int64)
        if rejoin_samples.size:
            progress = (rejoin_samples - end_sample).astype(numpy.float64) / float(rejoin_sample - end_sample)
            source_cents = 1_200.0 * math.log2(target_hz)
            rejoin_cents = 1_200.0 * math.log2(rejoin_hz)
            f0_hz[rejoin_samples] = numpy.power(2.0, (source_cents + (rejoin_cents - source_cents) * progress) / 1_200.0)

        lower = min(source_hz, target_hz)
        upper = max(source_hz, target_hz)
        intermediate = transition_f0[(transition_f0 > lower + 1.0e-9) & (transition_f0 < upper - 1.0e-9)]
        intermediate_dwell_seconds = float(intermediate.size) / float(sample_rate_hz)
        if intermediate_dwell_seconds >= CANONICAL_SLUR_POLICY["intermediate_pitch_dwell_strictly_less_than_seconds"]:
            raise AssertionError("canonical audio-rate slur exceeds its intermediate-pitch dwell gate")
        ascending = target_hz >= source_hz
        differences = numpy.diff(transition_f0)
        if (ascending and numpy.any(differences < -1.0e-9)) or (not ascending and numpy.any(differences > 1.0e-9)):
            raise AssertionError("canonical audio-rate slur must be monotonic")
        rendered_boundaries.append({
            "event_id": boundary["event_id"],
            "transition_start_sample_48k": start_sample,
            "transition_end_sample_48k": end_sample,
            "target_rejoin_sample_48k": rejoin_sample,
            "source_boundary_f0_hz": source_hz,
            "target_entry_f0_hz": target_hz,
            "target_rejoin_f0_hz": rejoin_hz,
            "source_at_t0_exact": True,
            "target_at_12ms_exact": True,
            "intermediate_pitch_dwell_seconds": intermediate_dwell_seconds,
            "post_transition_rejoin_domain": "log_frequency_cents",
        })
    return sample_times, f0_hz, {
        "canonical_slur_reconstructed_at_48khz": True,
        "sample_rate_hz": sample_rate_hz,
        "pitch_transition_seconds": CANONICAL_SLUR_TRANSITION_SECONDS,
        "pitch_shape": CANONICAL_SLUR_POLICY["pitch_shape"],
        "pitch_domain": CANONICAL_SLUR_POLICY["pitch_domain"],
        "slur_boundary_count": len(rendered_boundaries),
        "boundaries": rendered_boundaries,
        "oscillator_phase_reset_at_slur_boundaries": False,
        "new_attack_or_amplitude_envelope_added_by_reconstruction": False,
    }


def synthesize_untrained_preview(controls: Mapping[str, Any], *, seed: int) -> tuple[numpy.ndarray, dict[str, Any]]:
    """Render generic harmonic/noise audio directly from explicit curves.

    Gesture state is validated but never used to invent an articulation: F0,
    loudness, air/noise ratio, and voicing are the complete audible controls.
    This is intentionally not a learned, sampled, or physical instrument.
    """

    sample_rate_hz = int(controls["sample_rate_hz"])
    frame_times = numpy.asarray(controls["frame_times_seconds"], dtype=numpy.float64)
    sample_count = int(numpy.asarray(controls["frame_centers"], dtype=numpy.int64)[-1])
    sample_times, f0_hz, slur_reconstruction = reconstruct_audio_rate_slur_f0(controls)

    def resample(key: str) -> numpy.ndarray:
        values = numpy.asarray(controls[key], dtype=numpy.float64)
        return numpy.interp(sample_times, frame_times, values).astype(numpy.float64)

    loudness_db = resample("loudness_db")
    air_noise_ratio = resample("air_noise_ratio")
    voicing = resample("voicing")

    phase = numpy.cumsum((2.0 * numpy.pi * f0_hz) / float(sample_rate_hz))
    harmonic = (
        0.68 * numpy.sin(phase)
        + 0.22 * numpy.sin(2.0 * phase + 0.31)
        + 0.10 * numpy.sin(3.0 * phase + 1.17)
    )
    # A fixed seed and a tiny three-tap filter keep this preview reproducible
    # without loading a learned noise source or any recording.
    rng = numpy.random.default_rng(seed)
    white = rng.standard_normal(sample_count)
    air = numpy.convolve(white, numpy.asarray((0.25, 0.50, 0.25)), mode="same")
    amplitude = numpy.power(10.0, loudness_db / 20.0)
    waveform = amplitude * (
        voicing * (1.0 - air_noise_ratio) * harmonic
        + air_noise_ratio * 0.38 * air
    )
    peak_before_monitoring = float(numpy.max(numpy.abs(waveform))) if waveform.size else 0.0
    if not math.isfinite(peak_before_monitoring) or peak_before_monitoring <= 0.0:
        raise SyntheticPreviewError("explicit curves produced silence; refusing to write a misleading preview")
    # This is one global listening gain, not loudness mastering or a physical
    # interpretation.  It preserves every relative loudness curve value.
    monitor_gain = 0.80 / peak_before_monitoring
    monitored = numpy.clip(waveform * monitor_gain, -0.98, 0.98)
    pcm16 = numpy.rint(monitored * 32767.0).astype("<i2")
    if not numpy.any(pcm16):
        raise SyntheticPreviewError("synthetic preview rounded to silence")
    return pcm16, {
        "sample_rate_hz": sample_rate_hz,
        "sample_count": sample_count,
        "duration_seconds": sample_count / float(sample_rate_hz),
        "seed": int(seed),
        "peak_before_monitoring": peak_before_monitoring,
        "global_monitor_gain": monitor_gain,
        "peak_after_monitoring": float(numpy.max(numpy.abs(monitored))),
        "slur_audio_rate_reconstruction": slur_reconstruction,
    }


def _write_pcm16_wav(path: Path, pcm16: numpy.ndarray, *, sample_rate_hz: int) -> None:
    with wave.open(str(path), "wb") as destination:
        destination.setnchannels(1)
        destination.setsampwidth(2)
        destination.setframerate(sample_rate_hz)
        destination.writeframes(pcm16.astype("<i2", copy=False).tobytes())


def render_synthetic_preview(
    *,
    controls_dir: str | Path,
    output_dir: str | Path,
    seed: int = DEFAULT_SEED,
) -> dict[str, Any]:
    """Write a fresh, labelled generic preview from one verified control artifact."""

    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 2**32 - 1:
        raise SyntheticPreviewError("seed must be an integer in [0, 4294967295]")
    controls = load_rnd_score_controls(controls_dir)
    output = Path(output_dir).expanduser().resolve()
    _reject_default_bgm_path(output, label="preview output")
    if _is_within(output, Path(controls["controls_dir"])):
        raise SyntheticPreviewError("preview output must be isolated from its input controls artifact")
    if output.exists():
        raise SyntheticPreviewError("--output-dir must be fresh; refusing to overwrite an R&D preview")
    pcm16, render_summary = synthesize_untrained_preview(controls, seed=seed)

    output.mkdir(parents=True, exist_ok=False)
    wav_path = output / PREVIEW_WAV_FILENAME
    _write_pcm16_wav(wav_path, pcm16, sample_rate_hz=render_summary["sample_rate_hz"])
    manifest = {
        "schema": PREVIEW_MANIFEST_SCHEMA,
        "artifact_kind": "rnd_only_untrained_synthetic_expression_preview",
        "r_and_d_scope": controls["scope"],
        "input_controls": {
            "artifact": SCORE_CONTROLS_FILENAME,
            "sha256": controls["controls_sha256"],
            "score_expression_manifest_sha256": controls["manifest_sha256"],
            "score_expression_plan": {
                "basename": controls["plan_basename"],
                "sha256": controls["plan_sha256"],
            },
            "schema": SCORE_CONTROLS_SCHEMA,
            "frame_count": controls["frame_count"],
            "event_count": controls["event_count"],
            "source_audio_read": False,
            "model_training_run": False,
            "game_or_runtime_asset_read_or_written": False,
        },
        "renderer": {
            "id": "deterministic_generic_harmonic_noise_control_renderer",
            "trained_model_loaded": False,
            "source_audio_loaded": False,
            "source_audio_copied_or_transformed": False,
            "instrument_claim": "none: this is not a real or trained Daegeum renderer",
            "articulation_policy": "uses supplied continuous loudness/air-noise/voicing curves; reconstructs only compiler-attested canonical slur F0 boundaries and does not infer gestures",
            "slur_audio_rate_reconstruction": render_summary["slur_audio_rate_reconstruction"],
            "monitoring_gain_is_not_physical_loudness_calibration": True,
        },
        "output": {
            "artifact": PREVIEW_WAV_FILENAME,
            "sha256": _sha256(wav_path),
            "format": "mono PCM16 WAV",
            "label": "UNTRAINED SYNTHETIC R&D PREVIEW — NOT A GAME ASSET",
            **render_summary,
        },
        "interpretation_limits": {
            "not_a_real_or_trained_daegeum_render": True,
            "not_a_training_result_or_model_export": True,
            "not_a_default_asset_runtime_bgm_game_output_or_public_release": True,
            "no_source_audio_was_read_copied_or_modified": True,
        },
    }
    (output / PREVIEW_MANIFEST_FILENAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--controls-dir", required=True, help="one compiler-written score-expression controls directory")
    parser.add_argument("--output-dir", required=True, help="fresh isolated R&D output directory")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="deterministic synthetic-noise seed")
    parser.add_argument(
        "--confirm-rnd-only",
        action="store_true",
        help="required acknowledgement: output is an untrained synthetic R&D preview, not a game asset",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if not args.confirm_rnd_only:
        print("render_synthetic_preview: pass --confirm-rnd-only", file=sys.stderr)
        return 2
    try:
        result = render_synthetic_preview(
            controls_dir=args.controls_dir,
            output_dir=args.output_dir,
            seed=args.seed,
        )
    except SyntheticPreviewError as exc:
        print(f"render_synthetic_preview: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
