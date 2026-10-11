#!/usr/bin/env python3
"""Pure, score-only bridge from the 8-bar expression compiler to DDSP controls.

``adapt_compiled_controls`` accepts the in-memory result of
``tools/score-expression/compile_expression.py:compile_plan``. It never reads
audio, labels, a checkpoint, or a model, and never writes an artifact. The
returned 16 kHz / 250 Hz arrays are a *candidate conditioning contract*, not
proof that a trained DDSP model will render the authored articulation.

The rate is not a universal DDSP API. It matches Magenta's published default
16 kHz solo-instrument gin (64,000 samples / 1,000 frames per 4 seconds) and
TFRecord feature default of 250 Hz. A real checkpoint's operative gin must be
checked before any future consumer uses these values:

https://github.com/magenta/ddsp/blob/main/ddsp/training/gin/models/ae.gin
https://github.com/magenta/ddsp/blob/main/ddsp/training/gin/models/solo_instrument.gin
https://github.com/magenta/ddsp/blob/main/ddsp/training/data_preparation/ddsp_prepare_tfrecord.py
https://github.com/magenta/ddsp/blob/main/ddsp/training/preprocessing.py

In particular, F0LoudnessPreprocessor normally recomputes loudness from audio;
score-only inference would need ``compute_loudness=False`` in the selected
model configuration. This module does not change a gin file or run inference.
"""

from __future__ import annotations

import hashlib
import math
from pathlib import Path
from typing import Any, Mapping

import numpy as np


SCHEMA = "mini.bgm-gpt.score-ddsp-conditioning.v1"
SOURCE_SAMPLE_RATE_HZ = 48_000
SOURCE_CONTROL_HZ = 300
TARGET_SAMPLE_RATE_HZ = 16_000
TARGET_CONTROL_HZ = 250
TARGET_HOP_SAMPLES = TARGET_SAMPLE_RATE_HZ // TARGET_CONTROL_HZ
SOURCE_HOP_SAMPLES = SOURCE_SAMPLE_RATE_HZ // SOURCE_CONTROL_HZ
CANONICAL_DURATION_SECONDS = 19.2
VOICING_THRESHOLD = 0.5
STATE_CODES = {"breath_start": 1, "rearticulate": 2, "slur": 3, "release": 4}
SCOPE_FLAGS = (
    "r_and_d_only", "no_default_assets", "no_runtime_bgm", "no_game_output",
    "no_public_release",
)
OFFICIAL_SOURCE_URLS = (
    "https://github.com/magenta/ddsp/blob/main/ddsp/training/gin/models/ae.gin",
    "https://github.com/magenta/ddsp/blob/main/ddsp/training/gin/models/solo_instrument.gin",
    "https://github.com/magenta/ddsp/blob/main/ddsp/training/data_preparation/ddsp_prepare_tfrecord.py",
    "https://github.com/magenta/ddsp/blob/main/ddsp/training/preprocessing.py",
)


class ConditioningAdapterError(ValueError):
    """The source compiler contract cannot be bridged without guessing."""


def _array(compiled: Mapping[str, Any], name: str, count: int) -> np.ndarray:
    try:
        value = np.asarray(compiled[name])
    except (KeyError, TypeError, ValueError) as exc:
        raise ConditioningAdapterError(f"missing_or_invalid_{name}") from exc
    if value.ndim != 1 or len(value) != count:
        raise ConditioningAdapterError(f"invalid_shape_{name}")
    if not np.issubdtype(value.dtype, np.number) or not np.all(np.isfinite(value)):
        raise ConditioningAdapterError(f"nonfinite_or_nonnumeric_{name}")
    return value


def _event_samples(events: Any, duration_samples: int) -> tuple[np.ndarray, np.ndarray]:
    if not isinstance(events, list) or not events:
        raise ConditioningAdapterError("missing_events")
    starts: list[int] = []
    ends: list[int] = []
    last_end = 0
    for index, event in enumerate(events):
        if not isinstance(event, Mapping):
            raise ConditioningAdapterError("invalid_event")
        if not isinstance(event.get("id"), str) or not event["id"]:
            raise ConditioningAdapterError("invalid_event_id")
        kind = event.get("articulation")
        if kind not in STATE_CODES:
            raise ConditioningAdapterError("invalid_articulation")
        try:
            start = float(event["start_seconds"])
            end = float(event["end_seconds"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ConditioningAdapterError("invalid_event_time") from exc
        if not math.isfinite(start) or not math.isfinite(end):
            raise ConditioningAdapterError("nonfinite_event_time")
        start_sample = round(start * SOURCE_SAMPLE_RATE_HZ)
        end_sample = round(end * SOURCE_SAMPLE_RATE_HZ)
        if (abs(start_sample / SOURCE_SAMPLE_RATE_HZ - start) > 1e-9
                or abs(end_sample / SOURCE_SAMPLE_RATE_HZ - end) > 1e-9):
            raise ConditioningAdapterError("event_off_48k_grid")
        if start_sample < last_end or end_sample <= start_sample or end_sample > duration_samples:
            raise ConditioningAdapterError("overlapping_or_invalid_event")
        if kind == "slur":
            if index == 0 or events[index - 1]["articulation"] == "release" or start_sample != last_end:
                raise ConditioningAdapterError("invalid_slur_link")
        starts.append(start_sample)
        ends.append(end_sample)
        last_end = end_sample
    if ends[-1] != duration_samples:
        raise ConditioningAdapterError("event_tail_does_not_cover_duration")
    return np.asarray(starts, dtype=np.int64), np.asarray(ends, dtype=np.int64)


def _ownership(
    sample_centers_48k: np.ndarray, starts: np.ndarray, ends: np.ndarray,
) -> np.ndarray:
    index = np.searchsorted(starts, sample_centers_48k, side="right") - 1
    valid = index >= 0
    valid[valid] &= sample_centers_48k[valid] < ends[index[valid]]
    return np.where(valid, index, -1).astype(np.int32)


def _validate_slurs(compiled: Mapping[str, Any], events: list[Mapping[str, Any]],
                    starts: np.ndarray, ends: np.ndarray) -> dict[int, Mapping[str, Any]]:
    raw = compiled.get("slur_boundaries")
    if not isinstance(raw, list):
        raise ConditioningAdapterError("missing_slur_boundaries")
    indexed: dict[int, Mapping[str, Any]] = {}
    for boundary in raw:
        if not isinstance(boundary, Mapping):
            raise ConditioningAdapterError("invalid_slur_boundary")
        try:
            index = int(boundary["event_index"])
            source_index = int(boundary["source_event_index"])
            transition_start = int(boundary["transition_start_sample_48k"])
            transition_end = int(boundary["transition_end_sample_48k"])
            transition_seconds = float(boundary["transition_seconds"])
            source_hz = float(boundary["source_boundary_f0_hz"])
            target_hz = float(boundary["target_entry_f0_hz"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ConditioningAdapterError("invalid_slur_boundary") from exc
        if index in indexed or index < 1 or index >= len(events):
            raise ConditioningAdapterError("duplicate_or_invalid_slur_boundary")
        if (events[index]["articulation"] != "slur"
                or boundary.get("event_id") != events[index].get("id")
                or source_index != index - 1
                or boundary.get("source_event_id") != events[index - 1].get("id")
                or transition_start != starts[index]
                or transition_start != ends[index - 1]
                or transition_end > ends[index]
                or boundary.get("pitch_shape") != "minimum_jerk_log_frequency_cents"
                or boundary.get("pitch_domain") != "log_frequency_cents"
                or not math.isfinite(transition_seconds)
                or not math.isclose(transition_seconds, 0.012, abs_tol=1e-12)
                or transition_end - transition_start != round(transition_seconds * SOURCE_SAMPLE_RATE_HZ)
                or not (math.isfinite(source_hz) and math.isfinite(target_hz))
                or source_hz <= 0 or target_hz <= 0):
            raise ConditioningAdapterError("unsupported_slur_boundary_contract")
        indexed[index] = boundary
    expected = {i for i, event in enumerate(events) if event["articulation"] == "slur"}
    if indexed.keys() != expected:
        raise ConditioningAdapterError("slur_boundary_set_mismatch")
    return indexed


def _sha_array(array: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(array).tobytes()).hexdigest()


def adapt_compiled_controls(compiled: Mapping[str, Any]) -> dict[str, Any]:
    """Return finite, event-aware 16 kHz / 250 Hz DDSP candidate controls.

    The target grid is left-edge framed (no extra endpoint row): an authored
    19.2-second section has 307,200 sample positions and 4,800 control rows.
    Interpolation is *strictly inside each explicit event*. In particular,
    a rest never inherits a neighbouring F0, and a reattack never gets a
    previous-note loudness crossfade. The compiler-attested 12 ms SLUR pitch
    transition is reconstructed in log frequency at the target grid instead
    of linearly smearing sampled Hz across the boundary.
    """

    if not isinstance(compiled, Mapping):
        raise ConditioningAdapterError("compiled_mapping_required")
    if compiled.get("control_hz") != SOURCE_CONTROL_HZ:
        raise ConditioningAdapterError("source_must_be_300hz")
    try:
        duration = float(compiled["duration_seconds"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ConditioningAdapterError("missing_duration") from exc
    if not math.isfinite(duration) or not math.isclose(duration, CANONICAL_DURATION_SECONDS, abs_tol=1e-9):
        raise ConditioningAdapterError("canonical_8bar_duration_required")
    scope = compiled.get("scope")
    if not isinstance(scope, Mapping) or any(scope.get(flag) is not True for flag in SCOPE_FLAGS):
        raise ConditioningAdapterError("rnd_scope_required")
    plan_sha = compiled.get("plan_sha256")
    if not isinstance(plan_sha, str) or len(plan_sha) != 64 or any(c not in "0123456789abcdef" for c in plan_sha):
        raise ConditioningAdapterError("valid_plan_sha256_required")
    source_sample_count = round(duration * SOURCE_SAMPLE_RATE_HZ)
    target_sample_count = round(duration * TARGET_SAMPLE_RATE_HZ)
    if not math.isclose(source_sample_count / SOURCE_SAMPLE_RATE_HZ, duration, abs_tol=1e-9):
        raise ConditioningAdapterError("duration_off_48k_grid")
    if target_sample_count % TARGET_HOP_SAMPLES:
        raise ConditioningAdapterError("duration_off_250hz_grid")
    target_count = target_sample_count // TARGET_HOP_SAMPLES
    source_count = source_sample_count // SOURCE_HOP_SAMPLES + 1

    source_centers = _array(compiled, "frame_centers_48k", source_count)
    expected_centers = np.arange(source_count, dtype=np.int64) * SOURCE_HOP_SAMPLES
    if not np.array_equal(source_centers, expected_centers):
        raise ConditioningAdapterError("source_48k_grid_mismatch")
    source_times = _array(compiled, "frame_times_seconds", source_count)
    if not np.allclose(source_times, expected_centers / SOURCE_SAMPLE_RATE_HZ, atol=1e-6, rtol=0):
        raise ConditioningAdapterError("source_time_grid_mismatch")
    source_f0 = _array(compiled, "f0_hz", source_count).astype(np.float64)
    source_db = _array(compiled, "loudness_db", source_count).astype(np.float64)
    source_voicing = _array(compiled, "voicing", source_count).astype(np.float64)
    source_index = _array(compiled, "event_index", source_count)
    source_state = _array(compiled, "gesture_state", source_count)
    if (np.any(source_f0 < 0) or np.any(source_f0 > 4000)
            or np.any(source_db < -80) or np.any(source_db > 0)
            or np.any(source_voicing < 0) or np.any(source_voicing > 1)
            or not np.all(np.equal(source_index, np.floor(source_index)))
            or not np.all(np.equal(source_state, np.floor(source_state)))):
        raise ConditioningAdapterError("invalid_source_control_range")

    events = compiled.get("events")
    starts, ends = _event_samples(events, source_sample_count)
    expected_source_index = _ownership(expected_centers, starts, ends)
    if not np.array_equal(source_index, expected_source_index):
        raise ConditioningAdapterError("source_event_ownership_mismatch")
    expected_source_state = np.zeros(source_count, dtype=np.int16)
    for index, event in enumerate(events):
        mask = expected_source_index == index
        if not np.any(mask):
            raise ConditioningAdapterError("event_has_no_source_frame")
        expected_source_state[mask] = STATE_CODES[event["articulation"]]
        if event["articulation"] == "release":
            if np.any(source_f0[mask] != 0):
                raise ConditioningAdapterError("pitched_release_in_source")
        elif np.any(source_f0[mask] <= 0):
            raise ConditioningAdapterError("unpitched_note_in_source")
    if not np.array_equal(source_state, expected_source_state):
        raise ConditioningAdapterError("source_articulation_mismatch")
    if np.any(source_f0[expected_source_index < 0] != 0):
        raise ConditioningAdapterError("pitched_gap_in_source")
    slurs = _validate_slurs(compiled, events, starts, ends)

    frame_centers_16k = np.arange(target_count, dtype=np.int64) * TARGET_HOP_SAMPLES
    target_centers_48k = frame_centers_16k * (SOURCE_SAMPLE_RATE_HZ // TARGET_SAMPLE_RATE_HZ)
    target_event_index = _ownership(target_centers_48k, starts, ends)
    f0 = np.zeros(target_count, dtype=np.float64)
    db = np.full(target_count, -80.0, dtype=np.float64)
    voicing = np.zeros(target_count, dtype=np.float64)
    state = np.zeros(target_count, dtype=np.int16)
    event_boundaries: list[dict[str, Any]] = []
    for index, event in enumerate(events):
        kind = event["articulation"]
        source_rows = np.flatnonzero(expected_source_index == index)
        target_rows = np.flatnonzero(target_event_index == index)
        if not len(target_rows):
            raise ConditioningAdapterError("event_has_no_target_frame")
        x = expected_centers[source_rows].astype(np.float64)
        q = target_centers_48k[target_rows].astype(np.float64)
        db[target_rows] = np.interp(q, x, source_db[source_rows])
        state[target_rows] = STATE_CODES[kind]
        if kind != "release":
            voicing[target_rows] = np.interp(q, x, source_voicing[source_rows])
            # Log-domain interpolation is safe only within a voiced event.
            f0[target_rows] = np.exp(np.interp(q, x, np.log(source_f0[source_rows])))
        event_boundaries.append({
            "event_index": index,
            "event_id": str(event["id"]),
            "articulation": kind,
            "authored_start_sample_48k": int(starts[index]),
            "first_target_frame": int(target_rows[0]),
            "first_target_sample_16k": int(frame_centers_16k[target_rows[0]]),
            "onset_quantization_delay_ms": round(
                (int(target_centers_48k[target_rows[0]]) - int(starts[index])) / SOURCE_SAMPLE_RATE_HZ * 1000,
                6,
            ),
        })

    for index, boundary in slurs.items():
        transition_start = int(boundary["transition_start_sample_48k"])
        transition_end = int(boundary["transition_end_sample_48k"])
        transition_rows = np.flatnonzero(
            (target_event_index == index)
            & (target_centers_48k >= transition_start)
            & (target_centers_48k < transition_end)
        )
        if not len(transition_rows):
            raise ConditioningAdapterError("slur_has_no_target_transition_frame")
        progress = (target_centers_48k[transition_rows] - transition_start) / (transition_end - transition_start)
        ease = progress ** 3 * (10.0 + progress * (-15.0 + 6.0 * progress))
        start_log = math.log(float(boundary["source_boundary_f0_hz"]))
        end_log = math.log(float(boundary["target_entry_f0_hz"]))
        f0[transition_rows] = np.exp(start_log + (end_log - start_log) * ease)

    # This DDSP candidate has only F0 and loudness inputs. The release is
    # deliberately unpitched, while low-voicing breath-start rows retain their
    # loudness/noise prescription but cannot be guaranteed to sound like breath.
    f0[voicing <= VOICING_THRESHOLD] = 0.0
    result_arrays = {
        "frame_centers_16k": frame_centers_16k,
        "frame_times_seconds": (frame_centers_16k / TARGET_SAMPLE_RATE_HZ).astype(np.float64),
        "f0_hz": f0.astype(np.float32),
        "loudness_db": db.astype(np.float32),
        "voicing": voicing.astype(np.float32),
        "gesture_state": state,
        "event_index": target_event_index,
    }
    if any(not np.all(np.isfinite(value)) for value in result_arrays.values()):
        raise ConditioningAdapterError("nonfinite_target_controls")
    if (np.any(result_arrays["f0_hz"] < 0)
            or np.any(result_arrays["f0_hz"][target_event_index < 0] != 0)
            or np.any(result_arrays["f0_hz"][state == STATE_CODES["release"]] != 0)
            or np.any(result_arrays["loudness_db"] < -80)
            or np.any(result_arrays["loudness_db"] > 0)):
        raise ConditioningAdapterError("invalid_target_controls")
    manifest = {
        "schema": SCHEMA,
        "status": "candidate_conditioning_only_no_model_or_audio",
        "provenance": {
            "plan_basename": Path(str(compiled.get("plan_path", ""))).name,
            "plan_sha256": plan_sha,
            "source_kind": "authorial_score_expression_compiler_not_performance_transcription",
            "source_sample_rate_hz": SOURCE_SAMPLE_RATE_HZ,
            "source_control_hz": SOURCE_CONTROL_HZ,
            "source_frame_count_inclusive_endpoint": source_count,
            "target_sample_rate_hz": TARGET_SAMPLE_RATE_HZ,
            "target_control_hz": TARGET_CONTROL_HZ,
            "target_hop_samples": TARGET_HOP_SAMPLES,
            "target_sample_count": target_sample_count,
            "target_frame_count_no_endpoint": target_count,
            "official_default_references": list(OFFICIAL_SOURCE_URLS),
        },
        "boundary_policy": {
            "event_intervals": "authored_48k_sample_aligned_half_open",
            "interpolation": "log_f0_and_linear_db_within_event_only_never_across_event_boundary",
            "slur": "compiler_attested_12ms_minimum_jerk_log_frequency_reconstructed_on_250hz_grid",
            "rearticulate": "new_event_loudness_rows_no_previous_event_crossfade",
            "release": "f0_and_pitched_voicing_zero",
            "low_voicing": f"f0_zero_when_voicing_le_{VOICING_THRESHOLD}",
            "max_onset_quantization_delay_ms": max(
                item["onset_quantization_delay_ms"] for item in event_boundaries
            ),
            "events": event_boundaries,
        },
        "array_sha256": {name: _sha_array(array) for name, array in result_arrays.items()},
        "interpretation_limits": {
            "ddsp_250hz_is_default_not_universal_api": True,
            "future_checkpoint_operative_gin_must_match_rate_and_input_signature": True,
            "score_only_inference_requires_loudness_recompute_disabled": True,
            "ddsp_has_no_separate_breath_rearticulation_slur_or_voicing_input_here": True,
            "breath_and_reattack_timbre_not_validated": True,
            "future_synthesizer_may_interpolate_across_control_frame_boundaries": True,
            "no_source_audio_or_private_data_read": True,
            "no_model_loaded_trained_or_run": True,
            "not_a_listening_sample_or_game_asset": True,
        },
    }
    return {**result_arrays, "sample_rate_hz": TARGET_SAMPLE_RATE_HZ,
            "control_hz": TARGET_CONTROL_HZ, "sample_count": target_sample_count,
            "manifest": manifest}
