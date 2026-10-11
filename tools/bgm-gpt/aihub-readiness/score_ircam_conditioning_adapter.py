#!/usr/bin/env python3
"""Score-only IRCAM PyTorch DDSP *candidate* controls, never model input yet.

The authorial score compiler runs at 48 kHz / 300 Hz.  The separately pinned
IRCAM pilot uses 16 kHz audio with a 160-sample hop (100 Hz); it accepts F0 in
Hz and an *upstream weighted-log spectral loudness* normalized by statistics
of the training loader.  The compiler's ``loudness_db`` is an authored envelope,
not that measured feature.  This adapter deliberately emits no model-loudness
tensor and cannot declare a result inference-ready without an independently
measured, checkpoint-bound calibration.  It reads no audio or private data.

Official implementation references:
https://github.com/acids-ircam/ddsp_pytorch/blob/master/ddsp/model.py
https://github.com/acids-ircam/ddsp_pytorch/blob/master/ddsp/core.py
https://github.com/acids-ircam/ddsp_pytorch/blob/master/train.py
"""

from __future__ import annotations

import hashlib
import math
from pathlib import Path
from typing import Any, Mapping

import numpy as np


SCHEMA = "mini.bgm-gpt.score-ircam-conditioning-candidate.v1"
SOURCE_SAMPLE_RATE_HZ = 48_000
SOURCE_CONTROL_HZ = 300
SOURCE_HOP_SAMPLES = SOURCE_SAMPLE_RATE_HZ // SOURCE_CONTROL_HZ
TARGET_SAMPLE_RATE_HZ = 16_000
TARGET_CONTROL_HZ = 100
TARGET_HOP_SAMPLES = TARGET_SAMPLE_RATE_HZ // TARGET_CONTROL_HZ
CANONICAL_DURATION_SECONDS = 19.2
VOICING_THRESHOLD = 0.5
STATE_CODES = {"breath_start": 1, "rearticulate": 2, "slur": 3, "release": 4}
SCOPE_FLAGS = (
    "r_and_d_only", "no_default_assets", "no_runtime_bgm", "no_game_output",
    "no_public_release",
)
CALIBRATION_CONTRACT = {
    "feature_extraction": "IRCAM extract_loudness: 16kHz, hop160, n_fft2048, "
                          "mean_frequency(log(abs(STFT)+1e-7)+librosa.A_weighting)",
    "fit_source": "authorized training WAVs only; no held-out song or validation audio",
    "required_mapping": "empirically fitted monotone authored_dB_intent_to_weighted_log_feature "
                        "with documented anchor measurements and valid range",
    "normalization": "mean and std from the exact training loader/segments used by the checkpoint",
    "binding": "calibration, train split, feature-extractor version, model configuration "
               "and checkpoint hashes must agree",
    "validation": "held-out loudness and rendered articulation/rest checks are separate prerequisites",
    "status": "not_supplied_or_verified_by_this_score_only_adapter",
}


class IRCAMScoreAdapterError(ValueError):
    """Invalid score/compiler input or an attempt to bypass the inference gate."""


def _field_array(compiled: Mapping[str, Any], name: str, count: int) -> np.ndarray:
    try:
        value = np.asarray(compiled[name])
    except (KeyError, TypeError, ValueError) as exc:
        raise IRCAMScoreAdapterError(f"missing_or_invalid_{name}") from exc
    if (value.ndim != 1 or len(value) != count
            or not np.issubdtype(value.dtype, np.number)
            or not np.all(np.isfinite(value))):
        raise IRCAMScoreAdapterError(f"invalid_{name}")
    return value


def _event_ownership(centers_48k: np.ndarray, starts: np.ndarray, ends: np.ndarray) -> np.ndarray:
    indices = np.searchsorted(starts, centers_48k, side="right") - 1
    valid = indices >= 0
    valid[valid] &= centers_48k[valid] < ends[indices[valid]]
    return np.where(valid, indices, -1).astype(np.int32)


def _validated_events(compiled: Mapping[str, Any], duration_samples: int) -> tuple[list[Mapping[str, Any]], np.ndarray, np.ndarray]:
    events = compiled.get("events")
    if not isinstance(events, list) or not events:
        raise IRCAMScoreAdapterError("events_required")
    starts: list[int] = []
    ends: list[int] = []
    last_end = 0
    for index, event in enumerate(events):
        if not isinstance(event, Mapping) or not isinstance(event.get("id"), str) or not event["id"]:
            raise IRCAMScoreAdapterError("invalid_event_identity")
        kind = event.get("articulation")
        if kind not in STATE_CODES:
            raise IRCAMScoreAdapterError("invalid_articulation")
        try:
            begin = float(event["start_seconds"])
            finish = float(event["end_seconds"])
        except (KeyError, TypeError, ValueError) as exc:
            raise IRCAMScoreAdapterError("invalid_event_time") from exc
        if not math.isfinite(begin) or not math.isfinite(finish):
            raise IRCAMScoreAdapterError("invalid_event_time")
        start_sample = round(begin * SOURCE_SAMPLE_RATE_HZ)
        end_sample = round(finish * SOURCE_SAMPLE_RATE_HZ)
        if (abs(start_sample / SOURCE_SAMPLE_RATE_HZ - begin) > 1e-9
                or abs(end_sample / SOURCE_SAMPLE_RATE_HZ - finish) > 1e-9
                or start_sample != last_end or end_sample <= start_sample
                or end_sample > duration_samples):
            raise IRCAMScoreAdapterError("event_timeline_invalid")
        if kind == "slur" and (index == 0 or events[index - 1]["articulation"] == "release"):
            raise IRCAMScoreAdapterError("invalid_slur_link")
        if kind == "breath_start" and index > 0 and events[index - 1]["articulation"] != "release":
            raise IRCAMScoreAdapterError("breath_without_written_rest")
        if kind != "breath_start" and index > 0 and events[index - 1]["articulation"] == "release":
            raise IRCAMScoreAdapterError("note_after_rest_without_breath")
        starts.append(start_sample)
        ends.append(end_sample)
        last_end = end_sample
    if last_end != duration_samples:
        raise IRCAMScoreAdapterError("event_tail_mismatch")
    return events, np.asarray(starts, dtype=np.int64), np.asarray(ends, dtype=np.int64)


def _validated_slurs(
    compiled: Mapping[str, Any], events: list[Mapping[str, Any]],
    starts: np.ndarray, ends: np.ndarray,
) -> dict[int, Mapping[str, Any]]:
    raw = compiled.get("slur_boundaries")
    if not isinstance(raw, list):
        raise IRCAMScoreAdapterError("slur_metadata_required")
    result: dict[int, Mapping[str, Any]] = {}
    for boundary in raw:
        if not isinstance(boundary, Mapping):
            raise IRCAMScoreAdapterError("invalid_slur_metadata")
        try:
            index = int(boundary["event_index"])
            prior = int(boundary["source_event_index"])
            start_sample = int(boundary["transition_start_sample_48k"])
            end_sample = int(boundary["transition_end_sample_48k"])
            seconds = float(boundary["transition_seconds"])
            source_hz = float(boundary["source_boundary_f0_hz"])
            target_hz = float(boundary["target_entry_f0_hz"])
        except (KeyError, TypeError, ValueError) as exc:
            raise IRCAMScoreAdapterError("invalid_slur_metadata") from exc
        if (index in result or not 0 < index < len(events)
                or events[index]["articulation"] != "slur"
                or prior != index - 1
                or boundary.get("event_id") != events[index]["id"]
                or boundary.get("source_event_id") != events[prior]["id"]
                or start_sample != starts[index] or start_sample != ends[prior]
                or end_sample != start_sample + 576 or end_sample > ends[index]
                or not math.isclose(seconds, .012, abs_tol=1e-12)
                or boundary.get("pitch_shape") != "minimum_jerk_log_frequency_cents"
                or boundary.get("pitch_domain") != "log_frequency_cents"
                or not (math.isfinite(source_hz) and math.isfinite(target_hz))
                or source_hz <= 0 or target_hz <= 0):
            raise IRCAMScoreAdapterError("unsupported_slur_metadata")
        result[index] = boundary
    expected = {i for i, event in enumerate(events) if event["articulation"] == "slur"}
    if result.keys() != expected:
        raise IRCAMScoreAdapterError("slur_metadata_set_mismatch")
    return result


def _array_sha256(array: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(array).tobytes()).hexdigest()


def adapt_compiled_controls(
    compiled: Mapping[str, Any], *, pitch_shift_semitones: int = 0,
) -> dict[str, Any]:
    """Project one compiled public score onto IRCAM's 100 Hz candidate grid.

    No ``loudness`` or normalized model-input tensor is returned.  A +2
    semitone R&D comparison is allowed only as an explicit parameter; the
    original compiled score object is neither changed nor endorsed as final.
    """
    if not isinstance(compiled, Mapping):
        raise IRCAMScoreAdapterError("compiled_mapping_required")
    if type(pitch_shift_semitones) is not int or not -12 <= pitch_shift_semitones <= 12:
        raise IRCAMScoreAdapterError("pitch_shift_must_be_integer_semitones_within_octave")
    if compiled.get("control_hz") != SOURCE_CONTROL_HZ:
        raise IRCAMScoreAdapterError("source_must_be_300hz")
    try:
        duration = float(compiled["duration_seconds"])
    except (KeyError, TypeError, ValueError) as exc:
        raise IRCAMScoreAdapterError("duration_required") from exc
    if not math.isfinite(duration) or not math.isclose(duration, CANONICAL_DURATION_SECONDS, abs_tol=1e-9):
        raise IRCAMScoreAdapterError("canonical_8bar_duration_required")
    scope = compiled.get("scope")
    if not isinstance(scope, Mapping) or any(scope.get(flag) is not True for flag in SCOPE_FLAGS):
        raise IRCAMScoreAdapterError("rnd_scope_required")
    plan_sha = compiled.get("plan_sha256")
    if (not isinstance(plan_sha, str) or len(plan_sha) != 64
            or any(character not in "0123456789abcdef" for character in plan_sha)):
        raise IRCAMScoreAdapterError("plan_sha256_required")

    source_sample_count = round(duration * SOURCE_SAMPLE_RATE_HZ)
    sample_count = round(duration * TARGET_SAMPLE_RATE_HZ)
    if (source_sample_count / SOURCE_SAMPLE_RATE_HZ != duration
            or sample_count / TARGET_SAMPLE_RATE_HZ != duration
            or sample_count % TARGET_HOP_SAMPLES):
        raise IRCAMScoreAdapterError("duration_grid_mismatch")
    source_count = source_sample_count // SOURCE_HOP_SAMPLES + 1
    target_count = sample_count // TARGET_HOP_SAMPLES
    expected_source_centers = np.arange(source_count, dtype=np.int64) * SOURCE_HOP_SAMPLES
    source_centers = _field_array(compiled, "frame_centers_48k", source_count)
    if not np.array_equal(source_centers, expected_source_centers):
        raise IRCAMScoreAdapterError("source_grid_mismatch")
    source_f0 = _field_array(compiled, "f0_hz", source_count).astype(np.float64)
    source_db = _field_array(compiled, "loudness_db", source_count).astype(np.float64)
    source_voicing = _field_array(compiled, "voicing", source_count).astype(np.float64)
    source_state = _field_array(compiled, "gesture_state", source_count)
    source_owner = _field_array(compiled, "event_index", source_count)
    if (np.any((source_f0 < 0) | (source_f0 > 4000))
            or np.any((source_db < -80) | (source_db > 0))
            or np.any((source_voicing < 0) | (source_voicing > 1))
            or not np.all(source_state == np.floor(source_state))
            or not np.all(source_owner == np.floor(source_owner))):
        raise IRCAMScoreAdapterError("source_control_range_invalid")

    events, starts, ends = _validated_events(compiled, source_sample_count)
    expected_owner = _event_ownership(expected_source_centers, starts, ends)
    if not np.array_equal(source_owner, expected_owner):
        raise IRCAMScoreAdapterError("source_event_ownership_mismatch")
    expected_state = np.zeros(source_count, dtype=np.int16)
    for index, event in enumerate(events):
        mask = expected_owner == index
        if not np.any(mask):
            raise IRCAMScoreAdapterError("event_has_no_source_frame")
        expected_state[mask] = STATE_CODES[event["articulation"]]
        if event["articulation"] == "release":
            if np.any(source_f0[mask] != 0):
                raise IRCAMScoreAdapterError("pitched_release_in_source")
        elif np.any(source_f0[mask] <= 0):
            raise IRCAMScoreAdapterError("unpitched_note_in_source")
    if not np.array_equal(source_state, expected_state):
        raise IRCAMScoreAdapterError("source_articulation_mismatch")
    slurs = _validated_slurs(compiled, events, starts, ends)

    centers_16k = np.arange(target_count, dtype=np.int64) * TARGET_HOP_SAMPLES
    centers_48k = centers_16k * (SOURCE_SAMPLE_RATE_HZ // TARGET_SAMPLE_RATE_HZ)
    target_owner = _event_ownership(centers_48k, starts, ends)
    f0 = np.zeros(target_count, dtype=np.float64)
    db_intent = np.full(target_count, -80.0, dtype=np.float64)
    voicing = np.zeros(target_count, dtype=np.float64)
    state = np.zeros(target_count, dtype=np.int16)
    boundaries: list[dict[str, Any]] = []
    for index, event in enumerate(events):
        source_rows = np.flatnonzero(expected_owner == index)
        target_rows = np.flatnonzero(target_owner == index)
        if not len(target_rows):
            raise IRCAMScoreAdapterError("event_has_no_target_frame")
        x = expected_source_centers[source_rows].astype(np.float64)
        q = centers_48k[target_rows].astype(np.float64)
        db_intent[target_rows] = np.interp(q, x, source_db[source_rows])
        state[target_rows] = STATE_CODES[event["articulation"]]
        if event["articulation"] != "release":
            voicing[target_rows] = np.interp(q, x, source_voicing[source_rows])
            f0[target_rows] = np.exp(np.interp(q, x, np.log(source_f0[source_rows])))
        boundaries.append({
            "event_index": index,
            "event_id": event["id"],
            "articulation": event["articulation"],
            "authored_start_sample_48k": int(starts[index]),
            "first_target_sample_16k": int(centers_16k[target_rows[0]]),
            "onset_quantization_delay_ms": round(
                (int(centers_48k[target_rows[0]]) - int(starts[index])) / 48.0, 6
            ),
        })

    for index, boundary in slurs.items():
        begin = int(boundary["transition_start_sample_48k"])
        finish = int(boundary["transition_end_sample_48k"])
        rows = np.flatnonzero((target_owner == index) & (centers_48k >= begin) & (centers_48k < finish))
        if not len(rows):
            raise IRCAMScoreAdapterError("slur_has_no_100hz_transition_row")
        progress = (centers_48k[rows] - begin) / (finish - begin)
        ease = progress ** 3 * (10.0 + progress * (-15.0 + 6.0 * progress))
        source_log = math.log(float(boundary["source_boundary_f0_hz"]))
        target_log = math.log(float(boundary["target_entry_f0_hz"]))
        f0[rows] = np.exp(source_log + (target_log - source_log) * ease)
        boundaries[index]["slur_transition_100hz_rows"] = int(len(rows))

    f0[voicing <= VOICING_THRESHOLD] = 0.0
    shifted = f0 > 0
    f0[shifted] *= 2.0 ** (pitch_shift_semitones / 12.0)
    if np.any(f0 > 1400):
        raise IRCAMScoreAdapterError("candidate_pitch_outside_pilot_extractor_range")

    hard_mute_intervals_16k = [
        {"event_id": event["id"],
         "start_sample_16k": (int(starts[index]) + 2) // 3,
         "end_sample_16k": (int(ends[index]) + 2) // 3}
        for index, event in enumerate(events) if event["articulation"] == "release"
    ]
    arrays = {
        "frame_centers_16k": centers_16k,
        "frame_times_seconds": centers_16k.astype(np.float64) / TARGET_SAMPLE_RATE_HZ,
        "f0_hz_candidate": f0.astype(np.float32),
        "loudness_db_intent": db_intent.astype(np.float32),
        "voicing_intent": voicing.astype(np.float32),
        "gesture_state": state,
        "event_index": target_owner,
    }
    if (any(not np.all(np.isfinite(array)) for array in arrays.values())
            or np.any(arrays["f0_hz_candidate"][state == STATE_CODES["release"]] != 0)):
        raise IRCAMScoreAdapterError("invalid_candidate_controls")
    return {
        **arrays,
        "sample_rate_hz": TARGET_SAMPLE_RATE_HZ,
        "control_hz": TARGET_CONTROL_HZ,
        "sample_count": sample_count,
        "hard_mute_intervals_16k": hard_mute_intervals_16k,
        "manifest": {
            "schema": SCHEMA,
            "status": "score_only_candidate_inference_blocked_uncalibrated_loudness",
            "inference_ready": False,
            "plan_basename": Path(str(compiled.get("plan_path", ""))).name,
            "plan_sha256": plan_sha,
            "source_kind": "authorial_score_expression_not_performance_transcription",
            "source_grid": {"sample_rate_hz": SOURCE_SAMPLE_RATE_HZ,
                            "control_hz": SOURCE_CONTROL_HZ,
                            "inclusive_frame_count": source_count},
            "target_grid": {"sample_rate_hz": TARGET_SAMPLE_RATE_HZ,
                            "control_hz": TARGET_CONTROL_HZ,
                            "hop_samples": TARGET_HOP_SAMPLES,
                            "frame_count_no_endpoint": target_count},
            "pitch_shift_semitones": pitch_shift_semitones,
            "pitch_shift_status": "unreviewed_rnd_comparison_only" if pitch_shift_semitones else "none",
            "loudness_calibration_required": CALIBRATION_CONTRACT,
            "event_boundaries": boundaries,
            "hard_mute_intervals_16k": hard_mute_intervals_16k,
            "array_sha256": {name: _array_sha256(array) for name, array in arrays.items()},
            "limits": {
                "12ms_slur_is_only_1_or_2_frames_at_100hz": True,
                "synthesized_slur_duration_and_timbre_not_validated": True,
                "model_receives_only_f0_and_calibrated_loudness_not_articulation_state": True,
                "upstream_internal_upsampling_and_reverb_may_change_boundary_result": True,
                "19_2s_one_pass_inference_differs_from_4s_training_windows": True,
                "breath_reattack_and_reverb_rest_mute_need_listening_validation": True,
                "sample_domain_post_reverb_rest_mute_required_for_explicit_silence": True,
                "no_model_or_audio_or_private_data_read": True,
                "not_a_game_asset": True,
            },
        },
    }


def require_inference_ready(candidate: Mapping[str, Any]) -> None:
    """Fail closed: score-only intention is not an IRCAM model input tensor."""
    if not isinstance(candidate, Mapping) or not isinstance(candidate.get("manifest"), Mapping):
        raise IRCAMScoreAdapterError("candidate_manifest_required")
    if candidate["manifest"].get("schema") != SCHEMA:
        raise IRCAMScoreAdapterError("wrong_candidate_schema")
    raise IRCAMScoreAdapterError("inference_blocked_until_checkpoint_bound_loudness_calibration")
