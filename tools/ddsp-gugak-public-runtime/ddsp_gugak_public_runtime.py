#!/usr/bin/env python3
"""Fail-closed CPU renderer for the published DDSP-Gugak Daegeum checkpoint.

This is a narrow R&D renderer, not a trainer or a game-asset exporter.  It
never opens source audio or invokes CREPE.  It converts one explicit score
plan into 250 Hz F0/loudness controls, then invokes the untouched published
decoder plus harmonic and filtered-noise components on CPU.
"""

from __future__ import annotations

import argparse
import array
import contextlib
import csv
import hashlib
import importlib
import importlib.util
import json
import math
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import subprocess
import sys
import types
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Optional, Sequence, Tuple
import wave


TOOL_SCHEMA = "mini.ddsp-gugak-public-daegeum-runtime.v1"
PLAN_SCHEMA = "mini.score-expression.plan.v1"
EXPECTED_GUGAK_REVISION = "523012c340170841ed6499670e9dcef19783817d"
EXPECTED_DDSP_PYTORCH_REVISION = "ea5f25318dd4cd22c601dd405ebc2bac8e3f4cb6"
EXPECTED_CHECKPOINT_SHA256 = "cc73b645a9c4de934ec463246527fe5f1b16c783688ef3f2face53e67f547f28"
EXPECTED_CHECKPOINT_BYTES = 17_400_893
EXPECTED_CONFIG_SHA256 = "0804084e8b74bf50329126d99f32fd0134dfaaae3c07bc9a173e468cef05e77f"
EXPECTED_CONFIG_BYTES = 1_477
EXPECTED_GUGAK_FILES = {
    "LICENSE": "6b3a4d6a8b376f38fc38516dd05f1d85ffb047a749b36f3888783f68b4cd234c",
    "README.md": "e34aefae4dae054c1877425812894fff4fda3ab6e86fce6b27730f76e663d8db",
}
EXPECTED_DDSP_PYTORCH_FILES = {
    "LICENSE": "b215a2671dcbe7fb02c2cd5d9cf5f6c4d002795fe9c5836c80ce5f58ec263b11",
    "train/network/autoencoder/decoder.py": "2be9c6b5eb8e5bf5f3e4e308de98ecede789c252c10b01f184df57e424458904",
    "components/harmonic_oscillator.py": "7481b999f841334d5759eef9d95308c812920048c153136c785a30e41d49592d",
    "components/filtered_noise.py": "e14593e920f4d7c0d8e0eb3fee1470aa94a845193f277b8d56dfa00d4c492679",
    "components/reverb.py": "68d21b2df51fd6c98612831983928f16bdb64f31b002ff904a9f906b5ee29b91",
}
FRAME_RATE_HZ = 250
FRAME_RESOLUTION = 1.0 / FRAME_RATE_HZ
SAMPLE_RATE_HZ = 16_000
HOP_LENGTH = 64
REST_ENTRY_FADE_SECONDS = 0.016
CHECKPOINT_NATIVE_REVERB_LENGTH_SAMPLES = 48_000
SHARED_INTERVAL_END_SECONDS = 6.48
LISTENING_TARGET_RMS = 0.06309573444801933  # -24 dBFS
SLUR_TRANSITION_MILLISECONDS = 12
SLUR_TRANSITION_CANDIDATE_MILLISECONDS = (8, 12, 20)
SLUR_TRANSITION_SECONDS = SLUR_TRANSITION_MILLISECONDS / 1_000.0
SLUR_TRANSITION_SHAPE = "minimum_jerk_log_frequency_cents"
SLUR_PITCH_MODE_CURVE = "minimum_jerk_curve"
SLUR_PITCH_MODE_HARD_STEP = "experimental_phase_continuous_hard_f0_step"
SLUR_PITCH_MODES = frozenset({SLUR_PITCH_MODE_CURVE, SLUR_PITCH_MODE_HARD_STEP})
HARD_STEP_TARGET_ATTACH_SECONDS = 0.008
SLUR_TARGET_ATTACH_SECONDS = 0.050
SLUR_MAX_INTERMEDIATE_DWELL_SECONDS = 0.020
SLUR_LOUDNESS_TRANSITION_SECONDS = 0.080
SLUR_LOUDNESS_TARGET_SETTLE_SECONDS = 0.100
SLUR_LOUDNESS_TRANSITION_SHAPE = "minimum_jerk_linear_loudness"
ARTICULATIONS = ("rest", "breath_start", "rearticulate", "slur", "release")
VOICED_ARTICULATIONS = frozenset({"breath_start", "rearticulate", "slur"})
OUTPUT_NAME = re.compile(r"ddsp-gugak-public-daegeum-runtime-r1-[0-9]{8}-[0-9]{6}(?:-[a-z0-9-]+)?$")


class RuntimeContractError(RuntimeError):
    """Inputs, provenance, scope, or an isolated output target are unsafe."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _file_record(path: Path) -> Dict[str, Any]:
    return {"basename": path.name, "byte_length": path.stat().st_size, "sha256": _sha256(path)}


def _load_json(path: Path, *, label: str) -> Mapping[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeContractError(f"{label} does not exist") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeContractError(f"{label} is not valid UTF-8 JSON") from exc
    if not isinstance(value, Mapping):
        raise RuntimeContractError(f"{label} must be a JSON object")
    return value


def _finite_number(value: Any, *, label: str, minimum: Optional[float] = None, maximum: Optional[float] = None) -> float:
    if isinstance(value, bool):
        raise RuntimeContractError(f"{label} must be a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise RuntimeContractError(f"{label} must be a finite number") from exc
    if not math.isfinite(number):
        raise RuntimeContractError(f"{label} must be a finite number")
    if minimum is not None and number < minimum:
        raise RuntimeContractError(f"{label} is below its permitted range")
    if maximum is not None and number > maximum:
        raise RuntimeContractError(f"{label} is above its permitted range")
    return number


def _mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise RuntimeContractError(f"{label} must be an object")
    return value


def _require_true(value: Mapping[str, Any], key: str, *, label: str) -> None:
    if value.get(key) is not True:
        raise RuntimeContractError(f"{label}.{key} must explicitly be true")


def _safe_relative(value: str, *, label: str) -> str:
    parsed = PurePosixPath(value)
    if not value or parsed.is_absolute() or ".." in parsed.parts or "." in parsed.parts or "\\" in value:
        raise RuntimeContractError(f"{label} is not a safe relative path")
    return parsed.as_posix()


def _git_text(root: Path, *args: str) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(root), *args], capture_output=True, text=True, timeout=20, check=False
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeContractError(f"could not inspect supplied source checkout: {type(exc).__name__}") from exc
    if result.returncode != 0:
        raise RuntimeContractError("supplied source checkout is not a readable Git checkout")
    return result.stdout.strip()


def _validate_git_checkout(root: Path, *, expected_revision: str, expected_files: Mapping[str, str], label: str) -> Dict[str, Any]:
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise RuntimeContractError(f"{label} source root must be an explicit directory")
    revision = _git_text(root, "rev-parse", "HEAD")
    if revision != expected_revision:
        raise RuntimeContractError(f"{label} source revision does not equal the pinned public commit")
    if _git_text(root, "status", "--porcelain"):
        raise RuntimeContractError(f"{label} source checkout is dirty; an untouched checkout is required")
    files: Dict[str, Dict[str, Any]] = {}
    for relative, expected_hash in expected_files.items():
        relative = _safe_relative(relative, label=f"{label} expected source path")
        source_file = (root / relative).resolve()
        try:
            source_file.relative_to(root)
        except ValueError as exc:
            raise RuntimeContractError(f"{label} source file escapes checkout") from exc
        if not source_file.is_file() or _sha256(source_file) != expected_hash:
            raise RuntimeContractError(f"{label} imported/source evidence bytes do not match the pinned public source")
        files[relative] = {"sha256": expected_hash, "byte_length": source_file.stat().st_size}
    return {"revision": revision, "source_files": files, "license_file_verified": "LICENSE" in files}


def validate_public_sources(gugak_root: Path, ddsp_pytorch_root: Path) -> Dict[str, Any]:
    """Verify public code repos by pinned commit, cleanliness, and exact source bytes."""

    return {
        "ddsp_gugak": _validate_git_checkout(
            gugak_root,
            expected_revision=EXPECTED_GUGAK_REVISION,
            expected_files=EXPECTED_GUGAK_FILES,
            label="DDSP-Gugak",
        ),
        "ddsp_pytorch": _validate_git_checkout(
            ddsp_pytorch_root,
            expected_revision=EXPECTED_DDSP_PYTORCH_REVISION,
            expected_files=EXPECTED_DDSP_PYTORCH_FILES,
            label="ddsp-pytorch",
        ),
    }


def validate_checkpoint(checkpoint: Path, checkpoint_config: Path) -> Dict[str, Any]:
    checkpoint = checkpoint.expanduser().resolve()
    checkpoint_config = checkpoint_config.expanduser().resolve()
    if not checkpoint.is_file() or checkpoint.stat().st_size != EXPECTED_CHECKPOINT_BYTES or _sha256(checkpoint) != EXPECTED_CHECKPOINT_SHA256:
        raise RuntimeContractError("Daegeum checkpoint does not match the pinned public byte identity")
    if not checkpoint_config.is_file() or checkpoint_config.stat().st_size != EXPECTED_CONFIG_BYTES or _sha256(checkpoint_config) != EXPECTED_CONFIG_SHA256:
        raise RuntimeContractError("Daegeum checkpoint config does not match the pinned public byte identity")
    config = _load_json(checkpoint_config, label="Daegeum checkpoint config")
    required = {
        "config_frame_resolution": FRAME_RESOLUTION,
        "config_sample_rate": SAMPLE_RATE_HZ,
        "config_n_harmonics": 101,
        "config_n_freq": 65,
        "config_use_z": False,
        "config_mlp_units": 512,
        "config_mlp_layers": 3,
        "config_gru_units": 512,
        "config_bidirectional": False,
    }
    for key, expected in required.items():
        actual = config.get(key)
        if isinstance(expected, float):
            if not isinstance(actual, (int, float)) or abs(float(actual) - expected) > 1.0e-12:
                raise RuntimeContractError(f"Daegeum checkpoint config.{key} is not the pinned architecture value")
        elif actual != expected:
            raise RuntimeContractError(f"Daegeum checkpoint config.{key} is not the pinned architecture value")
    return {
        "checkpoint": _file_record(checkpoint),
        "checkpoint_config": _file_record(checkpoint_config),
        "architecture": {
            "frame_resolution_seconds": FRAME_RESOLUTION,
            "frame_rate_hz": FRAME_RATE_HZ,
            "sample_rate_hz": SAMPLE_RATE_HZ,
            "n_harmonics": 101,
            "n_freq": 65,
            "use_z": False,
            "checkpoint_reverb_state_present_but_not_used_for_dry_render": bool(config.get("config_use_reverb")),
        },
    }


def _validate_plan(path: Path) -> Tuple[Mapping[str, Any], List[Dict[str, Any]], float]:
    plan = _load_json(path, label="explicit score-expression plan")
    if plan.get("schema") != PLAN_SCHEMA:
        raise RuntimeContractError(f"plan.schema must equal {PLAN_SCHEMA}")
    scope = _mapping(plan.get("r_and_d_scope"), label="plan.r_and_d_scope")
    for key in ("r_and_d_only", "no_default_assets", "no_runtime_bgm", "no_game_output", "no_public_release"):
        _require_true(scope, key, label="plan.r_and_d_scope")
    instrument = _mapping(plan.get("instrument"), label="plan.instrument")
    if instrument.get("id") != "daegeum" or instrument.get("sustained") is not True:
        raise RuntimeContractError("plan must explicitly be sustained Daegeum")
    if plan.get("control_hz") != 100:
        raise RuntimeContractError("the accepted authorial plan must retain its explicit 100 Hz source declaration")
    raw_events = plan.get("events")
    if not isinstance(raw_events, list) or not raw_events:
        raise RuntimeContractError("plan.events must be a non-empty list")
    prior_end = 0.0
    prior_event: Optional[Dict[str, Any]] = None
    normalized: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw in enumerate(raw_events):
        event = _mapping(raw, label=f"plan.events[{index}]")
        event_id = event.get("id")
        if not isinstance(event_id, str) or not event_id or event_id in seen_ids:
            raise RuntimeContractError("plan events require unique non-empty IDs")
        seen_ids.add(event_id)
        start = _finite_number(event.get("start_seconds"), label=f"plan.events[{index}].start_seconds", minimum=0.0)
        end = _finite_number(event.get("end_seconds"), label=f"plan.events[{index}].end_seconds", minimum=0.0)
        if end <= start or start < prior_end - 1.0e-9:
            raise RuntimeContractError("plan must be monophonic with strictly positive event duration")
        articulation = event.get("articulation")
        if articulation not in ARTICULATIONS[1:]:
            raise RuntimeContractError("plan must explicitly name breath_start, rearticulate, slur, or release")
        item: Dict[str, Any] = {"id": event_id, "start_seconds": start, "end_seconds": end, "articulation": articulation}
        if articulation == "release":
            if prior_event is None or "pitch_hz" in event:
                raise RuntimeContractError("a release must follow a voiced event and cannot declare a new pitch")
            item["steady_loudness_db"] = float(prior_event["steady_loudness_db"])
        else:
            pitch = _finite_number(event.get("pitch_hz"), label=f"plan.events[{index}].pitch_hz", minimum=20.0, maximum=4_000.0)
            steady = _finite_number(event.get("steady_loudness_db"), label=f"plan.events[{index}].steady_loudness_db", minimum=-70.0, maximum=-3.0)
            item["pitch_hz"] = pitch
            item["steady_loudness_db"] = steady
            if articulation == "slur":
                if prior_event is None or event.get("slur_from_previous") is not True or abs(start - prior_end) > 1.0e-9:
                    raise RuntimeContractError("a slur must explicitly touch and link to its previous voiced event")
            elif event.get("slur_from_previous"):
                raise RuntimeContractError("slur_from_previous is valid only for an explicit slur")
        vibrato = event.get("vibrato")
        if vibrato is not None:
            vibrato_map = _mapping(vibrato, label=f"plan.events[{index}].vibrato")
            if vibrato_map.get("enabled") is True:
                item["vibrato"] = {
                    "enabled": True,
                    "rate_hz": _finite_number(vibrato_map.get("rate_hz"), label="vibrato.rate_hz", minimum=3.3, maximum=3.8),
                    "depth_cents": _finite_number(vibrato_map.get("depth_cents"), label="vibrato.depth_cents", minimum=12.0, maximum=45.0),
                    "onset_seconds": _finite_number(vibrato_map.get("onset_seconds", 0.0), label="vibrato.onset_seconds", minimum=0.0),
                    "ramp_seconds": _finite_number(vibrato_map.get("ramp_seconds", 0.08), label="vibrato.ramp_seconds", minimum=0.005),
                }
            elif set(vibrato_map) != {"enabled"}:
                raise RuntimeContractError("disabled vibrato may not hide nonzero parameters")
        item.setdefault("vibrato", {"enabled": False})
        normalized.append(item)
        prior_event = item
        prior_end = end
    return plan, normalized, prior_end


def validate_plan(path: Path) -> Dict[str, Any]:
    path = path.expanduser().resolve()
    plan, events, duration = _validate_plan(path)
    return {
        "plan": _file_record(path),
        "authorial_plan_control_hz": plan["control_hz"],
        "runtime_control_hz": FRAME_RATE_HZ,
        "duration_seconds": duration,
        "events": events,
    }


def _vibrato_cents(event: Mapping[str, Any], local_seconds: float) -> float:
    vibrato = _mapping(event["vibrato"], label="normalized vibrato")
    if vibrato.get("enabled") is not True:
        return 0.0
    onset = float(vibrato["onset_seconds"])
    if local_seconds < onset:
        return 0.0
    ramp = float(vibrato["ramp_seconds"])
    envelope = min(1.0, (local_seconds - onset) / ramp)
    return float(vibrato["depth_cents"]) * envelope * math.sin(2.0 * math.pi * float(vibrato["rate_hz"]) * (local_seconds - onset))


def _slur_transition_seconds(milliseconds: Any) -> float:
    if type(milliseconds) is not int or milliseconds not in SLUR_TRANSITION_CANDIDATE_MILLISECONDS:
        choices = ", ".join(str(item) for item in SLUR_TRANSITION_CANDIDATE_MILLISECONDS)
        raise RuntimeContractError(f"slur transition must be one of the validated candidates: {choices} ms")
    return int(milliseconds) / 1_000.0


def _slur_pitch_mode(value: Any) -> str:
    if value not in SLUR_PITCH_MODES:
        raise RuntimeContractError("slur pitch mode is not a supported R&D candidate")
    return str(value)


def _minimum_jerk_progress(progress: float) -> float:
    """Zero-slope monotonic S-curve used for a wind-instrument fingering change."""

    unit = min(1.0, max(0.0, float(progress)))
    return unit * unit * unit * (10.0 + unit * (-15.0 + 6.0 * unit))


def slur_transition_hz(initial_hz: float, target_hz: float, local_seconds: float, *, transition_seconds: float = SLUR_TRANSITION_SECONDS) -> float:
    """Minimum-jerk pitch transition in log-frequency/cents, not linear Hz."""

    initial = _finite_number(initial_hz, label="slur initial_hz", minimum=20.0, maximum=4_000.0)
    target = _finite_number(target_hz, label="slur target_hz", minimum=20.0, maximum=4_000.0)
    duration = _finite_number(transition_seconds, label="slur transition_seconds", minimum=FRAME_RESOLUTION)
    local = _finite_number(local_seconds, label="slur local_seconds", minimum=0.0)
    start_cents = 1_200.0 * math.log2(initial)
    target_cents = 1_200.0 * math.log2(target)
    cents = start_cents + (target_cents - start_cents) * _minimum_jerk_progress(local / duration)
    return math.pow(2.0, cents / 1_200.0)


def slur_transition_control_qa(
    frames: Sequence[Mapping[str, Any]],
    events: Sequence[Mapping[str, Any]],
    *,
    transition_seconds: float,
    pitch_mode: str = SLUR_PITCH_MODE_CURVE,
) -> Dict[str, Any]:
    """Gate the no-sweep slur contract directly against compiled 250 Hz controls."""

    pitch_mode = _slur_pitch_mode(pitch_mode)
    hard_step = pitch_mode == SLUR_PITCH_MODE_HARD_STEP
    records: List[Dict[str, Any]] = []
    tolerance_hz = 1.0e-6
    for event_index, event in enumerate(events):
        if event.get("articulation") != "slur":
            continue
        event_id = str(event["id"])
        event_frames = [frame for frame in frames if str(frame["event_id"]) == event_id]
        if not event_frames:
            # A smoke prefix may stop before this slur. It is not evidence of
            # a policy violation, but cannot claim the full target gate.
            records.append({"event_id": event_id, "truncated_before_slur": True})
            continue
        first = event_frames[0]
        start_frame = int(first["frame_index"])
        if start_frame <= 0:
            raise RuntimeContractError("an explicit slur must have a prior 250 Hz control frame")
        prior = frames[start_frame - 1]
        source_hz = float(prior["f0_hz"])
        target_hz = float(event["pitch_hz"])
        if hard_step:
            first_expected_hz = target_hz * math.pow(2.0, float(first["vibrato_cents"]) / 1_200.0)
            if not math.isclose(float(first["f0_hz"]), first_expected_hz, abs_tol=tolerance_hz, rel_tol=1.0e-9):
                raise RuntimeContractError("experimental hard-step slur must place the target F0 on its boundary control frame")
        elif not math.isclose(float(first["f0_hz"]), source_hz, abs_tol=tolerance_hz, rel_tol=0.0):
            raise RuntimeContractError("minimum-jerk slur must begin at its prior pitch")
        qa_transition_window = HARD_STEP_TARGET_ATTACH_SECONDS if hard_step else transition_seconds
        transition_rows = [
            frame
            for frame in event_frames
            if float(frame["time_seconds"]) < float(event["start_seconds"]) + qa_transition_window - 1.0e-12
        ]
        if any(abs(float(frame["voicing"]) - 1.0) > 1.0e-12 for frame in transition_rows):
            raise RuntimeContractError("slur transition must not introduce a re-attack voicing dip")
        entry_loudness = float(first["loudness_linear"])
        prior_loudness = float(prior["loudness_linear"])
        target_loudness = math.pow(10.0, float(event["steady_loudness_db"]) / 20.0)
        first_local_seconds = float(first["time_seconds"]) - float(event["start_seconds"])
        expected_entry_loudness = prior_loudness + (target_loudness - prior_loudness) * _minimum_jerk_progress(
            first_local_seconds / SLUR_LOUDNESS_TRANSITION_SECONDS
        )
        if not math.isclose(entry_loudness, expected_entry_loudness, abs_tol=1.0e-12, rel_tol=1.0e-9):
            raise RuntimeContractError("slur must begin on its continuous authored dynamic without an onset jump")
        if hard_step:
            hard_step_gate_rows = [
                frame
                for frame in event_frames
                if float(frame["time_seconds"]) <= float(event["start_seconds"]) + HARD_STEP_TARGET_ATTACH_SECONDS + 1.0e-12
            ]
            for frame in hard_step_gate_rows:
                expected_frame_hz = target_hz * math.pow(2.0, float(frame["vibrato_cents"]) / 1_200.0)
                if not math.isclose(float(frame["f0_hz"]), expected_frame_hz, abs_tol=tolerance_hz, rel_tol=1.0e-9):
                    raise RuntimeContractError("experimental hard-step slur must remain at its target F0 throughout the 8 ms control gate")
            if any(abs(float(frame["voicing"]) - 1.0) > 1.0e-12 for frame in hard_step_gate_rows):
                raise RuntimeContractError("experimental hard-step slur must not introduce a re-attack voicing dip through its 8 ms gate")
            intermediate_rows: List[Mapping[str, Any]] = []
        else:
            ordered = [float(frame["f0_hz"]) for frame in event_frames if float(frame["time_seconds"]) <= float(event["start_seconds"]) + transition_seconds + 1.0e-12]
            if target_hz < source_hz and any(left + tolerance_hz < right for left, right in zip(ordered, ordered[1:])):
                raise RuntimeContractError("log-frequency slur transition is not monotonic descending")
            if target_hz > source_hz and any(left - tolerance_hz > right for left, right in zip(ordered, ordered[1:])):
                raise RuntimeContractError("log-frequency slur transition is not monotonic ascending")
            lower, upper = sorted((source_hz, target_hz))
            intermediate_rows = [
                frame
                for frame in transition_rows
                if lower + tolerance_hz < float(frame["f0_hz"]) < upper - tolerance_hz
            ]
        intermediate_dwell_seconds = len(intermediate_rows) / FRAME_RATE_HZ
        if hard_step and intermediate_rows:
            raise RuntimeContractError("experimental hard-step slur must have zero intermediate-pitch control frames")
        if not hard_step and intermediate_dwell_seconds >= SLUR_MAX_INTERMEDIATE_DWELL_SECONDS - 1.0e-12:
            raise RuntimeContractError("slur intermediate-pitch dwell must remain strictly below 20 ms")
        attach_limit = HARD_STEP_TARGET_ATTACH_SECONDS if hard_step else SLUR_TARGET_ATTACH_SECONDS
        target_rows = [
            frame
            for frame in event_frames
            if math.isclose(
                float(frame["f0_hz"]),
                target_hz * math.pow(2.0, float(frame["vibrato_cents"]) / 1_200.0),
                abs_tol=tolerance_hz,
                rel_tol=1.0e-9,
            )
        ]
        if not target_rows:
            raise RuntimeContractError("slur has no target-pitch control frame")
        first_target = target_rows[0]
        target_arrival_seconds = float(first_target["time_seconds"]) - float(event["start_seconds"])
        if target_arrival_seconds > attach_limit + 1.0e-12:
            raise RuntimeContractError(f"slur target-pitch control arrival exceeds the {int(round(attach_limit * 1_000.0))} ms gate")
        attach_threshold = float(event["start_seconds"]) + attach_limit
        attach_rows = [frame for frame in event_frames if float(frame["time_seconds"]) >= attach_threshold - 1.0e-12]
        if not attach_rows:
            records.append({"event_id": event_id, "truncated_before_target_attach_gate": True})
            continue
        attach = attach_rows[0]
        expected_attach_hz = target_hz * math.pow(2.0, float(attach["vibrato_cents"]) / 1_200.0)
        if not math.isclose(float(attach["f0_hz"]), expected_attach_hz, abs_tol=tolerance_hz, rel_tol=1.0e-9):
            raise RuntimeContractError(f"slur must reach the target pitch no later than {int(round(attach_limit * 1_000.0))} ms after its boundary")
        loudness_rows = [
            frame
            for frame in event_frames
            if float(frame["time_seconds"]) <= float(event["start_seconds"]) + SLUR_LOUDNESS_TARGET_SETTLE_SECONDS + 1.0e-12
        ]
        loudness_values = [float(frame["loudness_linear"]) for frame in loudness_rows]
        lower_loudness, upper_loudness = sorted((entry_loudness, target_loudness))
        if any(
            value < lower_loudness - 1.0e-12 or value > upper_loudness + 1.0e-12
            for value in loudness_values
        ):
            raise RuntimeContractError("slur dynamic must not overshoot or make an artificial loudness dip")
        if target_loudness < entry_loudness and any(
            left + 1.0e-12 < right
            for left, right in zip(loudness_values, loudness_values[1:])
        ):
            raise RuntimeContractError("slur dynamic must move monotonically toward a lower authored target")
        if target_loudness > entry_loudness and any(
            left - 1.0e-12 > right
            for left, right in zip(loudness_values, loudness_values[1:])
        ):
            raise RuntimeContractError("slur dynamic must move monotonically toward a higher authored target")
        loudness_attach_threshold = float(event["start_seconds"]) + SLUR_LOUDNESS_TARGET_SETTLE_SECONDS
        loudness_attach_rows = [frame for frame in event_frames if float(frame["time_seconds"]) >= loudness_attach_threshold - 1.0e-12]
        if not loudness_attach_rows:
            records.append({"event_id": event_id, "truncated_before_dynamic_settle_gate": True})
            continue
        loudness_attach = loudness_attach_rows[0]
        if not math.isclose(float(loudness_attach["loudness_linear"]), target_loudness, abs_tol=1.0e-12, rel_tol=1.0e-9):
            raise RuntimeContractError("slur dynamic must reach its authored target by 100 ms")
        records.append({
            "event_id": event_id,
            "source_hz": source_hz,
            "target_hz": target_hz,
            "pitch_mode": pitch_mode,
            "transition_seconds": 0.0 if hard_step else transition_seconds,
            "transition_shape": "control_rate_hard_step" if hard_step else SLUR_TRANSITION_SHAPE,
            "first_control_time_seconds": float(first["time_seconds"]),
            "pitch_target_settle_control_time_seconds": float(first_target["time_seconds"] if hard_step else attach["time_seconds"]),
            "pitch_target_settle_hz": float(first_target["f0_hz"] if hard_step else attach["f0_hz"]),
            "first_target_control_time_seconds": float(first_target["time_seconds"]),
            "target_control_arrival_seconds": target_arrival_seconds,
            "pitch_target_settle_gate_seconds": attach_limit,
            "pitch_target_settle_gate_passed": True,
            "pitch_target_settle_by_50ms_gate_passed": True,
            "pitch_target_settle_by_8ms_gate_passed": hard_step,
            "intermediate_frame_count": len(intermediate_rows),
            "intermediate_dwell_seconds": intermediate_dwell_seconds,
            "intermediate_dwell_exact_zero_gate_passed": hard_step,
            "intermediate_dwell_strictly_less_than_seconds": None if hard_step else SLUR_MAX_INTERMEDIATE_DWELL_SECONDS,
            "dynamic_entry_loudness_linear": entry_loudness,
            "dynamic_target_loudness_linear": target_loudness,
            "dynamic_target_settle_control_time_seconds": float(loudness_attach["time_seconds"]),
            "dynamic_target_by_100ms_gate_passed": True,
            "no_reattack_and_dynamic_continuity_gate_passed": True,
        })
    return {
        "passed": True,
        "policy": {
            "pitch_mode": pitch_mode,
            "pitch_transition_milliseconds": 0 if hard_step else int(round(transition_seconds * 1_000.0)),
            "pitch_shape": "control_rate_hard_step" if hard_step else SLUR_TRANSITION_SHAPE,
            "pitch_domain": "control_frame_f0_discontinuity" if hard_step else "log_frequency_cents",
            "pitch_target_settle_by_seconds": HARD_STEP_TARGET_ATTACH_SECONDS if hard_step else SLUR_TARGET_ATTACH_SECONDS,
            "intermediate_pitch_dwell_seconds": 0.0 if hard_step else None,
            "intermediate_pitch_dwell_strictly_less_than_seconds": None if hard_step else SLUR_MAX_INTERMEDIATE_DWELL_SECONDS,
            "dynamic_transition_seconds": SLUR_LOUDNESS_TRANSITION_SECONDS,
            "dynamic_shape": SLUR_LOUDNESS_TRANSITION_SHAPE,
            "dynamic_domain": "linear_loudness",
            "dynamic_target_settle_by_seconds": SLUR_LOUDNESS_TARGET_SETTLE_SECONDS,
            "no_rearticulation_envelope_for_slur": True,
            "renderer_control_frame_seconds": FRAME_RESOLUTION,
            "oscillator_note": (
                "the published oscillator integrates one continuous phase bank and linearly upsamples adjacent 250 Hz F0 frames, so this control-rate hard step may be smoothed over roughly one 4 ms frame without a phase or onset reset"
                if hard_step
                else "the published oscillator linearly interpolates adjacent 250 Hz F0 frames; the transition has already settled before the 50 ms target-attach gate"
            ),
            "learned_slur_claim": False,
        },
        "events": records,
    }


def verify_compiler_slur_policy_equivalence(
    repository_root: Path,
    events: Sequence[Mapping[str, Any]],
    *,
    requested_transition_seconds: float,
    pitch_mode: str = SLUR_PITCH_MODE_CURVE,
) -> Dict[str, Any]:
    """Verify the independently implemented compiler math at explicit probes.

    The renderer intentionally does not depend on a shared transition module:
    this check instead imports the tracked compiler only at explicit R&D render
    time and fails closed if its constants, policy, or log-frequency
    minimum-jerk values drift from the runtime implementation.
    """

    pitch_mode = _slur_pitch_mode(pitch_mode)
    hard_step = pitch_mode == SLUR_PITCH_MODE_HARD_STEP
    compiler_path = (repository_root.expanduser().resolve() / "tools/score-expression/compile_expression.py").resolve()
    if not compiler_path.is_file():
        raise RuntimeContractError("tracked score-expression compiler is required for the slur-policy equivalence gate")
    module_name = "_mini_score_expression_slur_policy_probe"
    spec = importlib.util.spec_from_file_location(module_name, compiler_path)
    if spec is None or spec.loader is None:
        raise RuntimeContractError("could not load tracked score-expression compiler for the slur-policy equivalence gate")
    compiler_module = importlib.util.module_from_spec(spec)
    try:
        sys.modules[module_name] = compiler_module
        spec.loader.exec_module(compiler_module)
        expected_default_policy = {
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
        if compiler_module.slur_transition_policy() != expected_default_policy:
            raise RuntimeContractError("tracked compiler slur policy differs from the runtime's canonical 12 ms policy")
        if compiler_module.SLUR_TRANSITION_SECONDS != SLUR_TRANSITION_SECONDS:
            raise RuntimeContractError("tracked compiler slur transition constant differs from the runtime")
        moving_slurs = [
            (index, event)
            for index, event in enumerate(events)
            if event.get("articulation") == "slur" and index > 0 and not math.isclose(float(events[index - 1]["pitch_hz"]), float(event["pitch_hz"]), abs_tol=1.0e-9)
        ]
        if not moving_slurs:
            raise RuntimeContractError("explicit plan needs one pitch-changing slur for compiler/runtime equivalence probes")
        index, event = moving_slurs[0]
        source_hz = float(events[index - 1]["pitch_hz"])
        target_hz = float(event["pitch_hz"])
        start_seconds = float(event["start_seconds"])
        local_probe_seconds = (0.0, 0.004, 0.008, 0.012, 0.020, 0.050)
        probes: List[Dict[str, Any]] = []
        if not hard_step:
            probe_array = compiler_module.numpy.asarray(local_probe_seconds, dtype=compiler_module.numpy.float64)
            compiler_values = compiler_module.slur_transition_hz(
                source_hz,
                target_hz,
                probe_array,
                transition_seconds=requested_transition_seconds,
            )
            for local, compiler_value in zip(local_probe_seconds, compiler_values):
                runtime_value = slur_transition_hz(
                    source_hz,
                    target_hz,
                    local,
                    transition_seconds=requested_transition_seconds,
                )
                if not math.isclose(float(compiler_value), runtime_value, abs_tol=1.0e-9, rel_tol=1.0e-12):
                    raise RuntimeContractError("tracked compiler and runtime minimum-jerk slur values differ at an explicit probe")
                probes.append({
                    "absolute_seconds": start_seconds + local,
                    "local_seconds": local,
                    "compiler_hz": float(compiler_value),
                    "runtime_hz": runtime_value,
                    "equal_within_hz": 1.0e-9,
                })
    except RuntimeContractError:
        raise
    except Exception as exc:
        raise RuntimeContractError(f"could not verify compiler/runtime slur-policy equivalence: {type(exc).__name__}: {exc}") from exc
    finally:
        sys.modules.pop(module_name, None)
    return {
        "passed": True,
        "compiler_source": _file_record(compiler_path),
        "canonical_default_policy_match": True,
        "requested_runtime_pitch_mode": pitch_mode,
        "requested_runtime_candidate_milliseconds": None if hard_step else int(round(requested_transition_seconds * 1_000.0)),
        "candidate_formula_equivalence": {
            "applicable": not hard_step,
            "status": "not_applicable" if hard_step else "verified",
            "reason": (
                "experimental hard-F0-step exists only in this R&D runtime; the compiler's canonical 12 ms policy was still verified and was not changed"
                if hard_step
                else "verified against compiler helper with the same explicit candidate duration; compiler's canonical default remains 12 ms"
            ),
        },
        "control_rate_quantization_limit": "this verifies formula/constants only. The compiler's plan controls are 100 Hz and may be linearly upsampled by a separate preview; it does not claim audio-rate parity with this runtime's 250 Hz control rows or dwell gate.",
        "probe_slur_event_id": str(event["id"]),
        "source_hz": source_hz,
        "target_hz": target_hz,
        "probes": probes,
    }


def build_score_controls(
    plan_path: Path,
    *,
    max_seconds: Optional[float] = None,
    slur_transition_milliseconds: int = SLUR_TRANSITION_MILLISECONDS,
    slur_pitch_mode: str = SLUR_PITCH_MODE_CURVE,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Create deterministic 250 Hz F0/loudness controls without opening any audio."""

    plan, events, duration = _validate_plan(plan_path.expanduser().resolve())
    slur_pitch_mode = _slur_pitch_mode(slur_pitch_mode)
    hard_step = slur_pitch_mode == SLUR_PITCH_MODE_HARD_STEP
    slur_transition_seconds = _slur_transition_seconds(slur_transition_milliseconds)
    render_duration = duration if max_seconds is None else _finite_number(max_seconds, label="max_seconds", minimum=FRAME_RESOLUTION, maximum=duration)
    frame_count = int(round(render_duration * FRAME_RATE_HZ))
    if abs(frame_count / FRAME_RATE_HZ - render_duration) > 1.0e-9:
        raise RuntimeContractError("max_seconds must align exactly to the 250 Hz renderer frame grid")
    frames: List[Dict[str, Any]] = []
    event_cursor = 0
    prior_f0 = 0.0
    prior_loudness = 0.0
    active_event_cursor: Optional[int] = None
    event_start_f0 = 0.0
    event_start_loudness = 0.0
    for frame_index in range(frame_count):
        moment = frame_index / FRAME_RATE_HZ
        while event_cursor < len(events) and moment >= float(events[event_cursor]["end_seconds"]) - 1.0e-12:
            event_cursor += 1
        if event_cursor >= len(events) or moment < float(events[event_cursor]["start_seconds"]):
            frames.append({"frame_index": frame_index, "time_seconds": moment, "f0_hz": 0.0, "loudness_linear": 0.0, "voicing": 0.0, "articulation": "rest", "event_id": "", "vibrato_cents": 0.0})
            continue
        event = events[event_cursor]
        if active_event_cursor != event_cursor:
            # A slur needs one fixed event-entry state.  Do not use the
            # previous *frame* as its start state or an intended 90 ms linear
            # transition turns into an unintended recursive exponential one.
            active_event_cursor = event_cursor
            event_start_f0 = prior_f0
            event_start_loudness = prior_loudness
        local = moment - float(event["start_seconds"])
        event_duration = float(event["end_seconds"]) - float(event["start_seconds"])
        articulation = str(event["articulation"])
        target_loudness = math.pow(10.0, float(event["steady_loudness_db"]) / 20.0)
        vibrato_cents = 0.0
        if articulation == "release":
            release = max(0.0, 1.0 - local / event_duration)
            # A release does not declare a new score pitch, but a sustained
            # wind-instrument tail must retain its immediately prior voiced
            # F0 while the authored loudness/voicing curves decay.
            f0_hz = prior_f0
            # ``prior_loudness`` is the previous *frame's* rendered value,
            # not the event's start level.  Multiplying it here would make a
            # release decay recursively once per 4 ms frame.  The normalized
            # release event deliberately inherits the previous voiced event's
            # steady dB value, so map that fixed start level exactly once.
            loudness = target_loudness * math.pow(release, 1.35)
            voicing = release
        else:
            vibrato_cents = _vibrato_cents(event, local)
            target_f0 = float(event["pitch_hz"]) * math.pow(2.0, vibrato_cents / 1200.0)
            if articulation == "breath_start":
                onset = min(1.0, local / 0.065)
                loudness = target_loudness * (0.04 + 0.96 * onset)
                f0_hz = target_f0
                voicing = min(1.0, local / 0.022)
            elif articulation == "rearticulate":
                onset = min(1.0, local / 0.022)
                loudness = target_loudness * (0.35 + 0.65 * onset)
                f0_hz = target_f0
                voicing = 1.0
            elif articulation == "slur":
                # A sustained wind slur is one breath with a quick fingering
                # transition: no onset envelope or re-attack. Pitch changes
                # fast; any separately authored dynamic moves much more
                # gently from the entry level to its steady target.
                # The pitch alone travels over 8/12/20 ms candidates with a
                # zero-slope S-curve in log-frequency, never a 90 ms linear-Hz
                # slide.  Suppress a deliberately authored vibrato only while
                # this short pitch transition is still in progress.
                if hard_step:
                    # Experimental control-rate step only.  The immediately
                    # prior row retains the source pitch and this boundary row
                    # takes the target pitch.  The unchanged published
                    # oscillator owns phase integration and audio-rate linear
                    # upsampling; there is no onset or phase reset here.
                    f0_hz = target_f0
                elif local < slur_transition_seconds:
                    vibrato_cents = 0.0
                    f0_hz = slur_transition_hz(
                        event_start_f0,
                        float(event["pitch_hz"]),
                        local,
                        transition_seconds=slur_transition_seconds,
                    )
                else:
                    f0_hz = target_f0
                loudness_progress = _minimum_jerk_progress(local / SLUR_LOUDNESS_TRANSITION_SECONDS)
                loudness = event_start_loudness + (target_loudness - event_start_loudness) * loudness_progress
                voicing = 1.0
            else:  # pragma: no cover - normalized validation makes this unreachable.
                raise RuntimeContractError("unsupported articulation after plan validation")
        frames.append({
            "frame_index": frame_index,
            "time_seconds": moment,
            "f0_hz": f0_hz,
            "loudness_linear": loudness,
            "voicing": voicing,
            "articulation": articulation,
            "event_id": str(event["id"]),
            "vibrato_cents": vibrato_cents,
        })
        prior_f0 = f0_hz
        prior_loudness = loudness
    slur_qa = slur_transition_control_qa(
        frames,
        events,
        transition_seconds=slur_transition_seconds,
        pitch_mode=slur_pitch_mode,
    )
    summary = {
        "source_plan": _file_record(plan_path.expanduser().resolve()),
        "source_plan_control_hz": plan["control_hz"],
        "renderer_control_hz": FRAME_RATE_HZ,
        "frame_count": frame_count,
        "duration_seconds": frame_count / FRAME_RATE_HZ,
        "truncated_for_smoke": max_seconds is not None and render_duration < duration,
        "full_plan_duration_seconds": duration,
        "articulation_frame_counts": {name: sum(1 for frame in frames if frame["articulation"] == name) for name in ARTICULATIONS},
        "explicit_release_decoder_mapping": "release declares no new score pitch but carries the immediately prior rendered F0, allowing both published harmonic and learned-noise branches to decay through the explicit decoder loudness curve (release ** 1.35) and compiled release voicing gate",
        "decoder_inputs": (
            "F0 and linear loudness only; raw score dB is never passed to the decoder. breath/rearticulate/slur/release remain authorial controls, not inferred categorical model labels. The experimental hard-step candidate is a control trajectory, not a learned slur. Its separately authored dynamic still moves monotonically from entry to target over 80 ms without overshoot. Release loudness starts from one fixed inherited steady level."
            if hard_step
            else "F0 and linear loudness only; raw score dB is never passed to the decoder. breath/rearticulate/slur/release remain authorial curves, not inferred categorical model labels. A slur is continuous breath plus a short pitch-only fingering transition in log-frequency, with no invented attack; its separately authored dynamic moves monotonically from entry to target over 80 ms without overshoot. Release loudness starts from one fixed inherited steady level."
        ),
        "slur_transition_policy": slur_qa["policy"],
        "slur_transition_control_qa": slur_qa,
        "loudness_mapping": {
            "formula": "linear_loudness = 10 ** (steady_loudness_db / 20)",
            "authored_steady_db_range": [-30.0, -28.0],
            "mapped_linear_range": [math.pow(10.0, -30.0 / 20.0), math.pow(10.0, -28.0 / 20.0)],
            "separate_public_sample_audit_context": "reported active median linear loudness: published DDSP-Gugak Daegeum sample 0.0369, flute sample 0.0347; this runtime does not read either audio file",
        },
        "air_noise_ratio": "not supplied to this published decoder; no arbitrary air/noise multiplier is applied",
        "renderer_gate": {
            "audio_rate_upsampling": "linear interpolation from the compiled 250 Hz voicing curve",
            "written_rest_entry_fades": rest_entry_fade_regions(frames),
            "written_rest_entry_fade_seconds": REST_ENTRY_FADE_SECONDS,
            "hard_zero_rest_ranges": rest_sample_ranges(frames),
        },
    }
    return frames, summary


def write_controls_csv(path: Path, frames: Iterable[Mapping[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["frame_index", "time_seconds", "f0_hz", "loudness_linear", "voicing", "articulation", "event_id", "vibrato_cents"])
        writer.writeheader()
        for frame in frames:
            writer.writerow(dict(frame))


def rest_entry_fade_regions(frames: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    """Return only deterministic anti-click fades at explicit voiced→rest edges."""

    fade_frames = int(round(REST_ENTRY_FADE_SECONDS * FRAME_RATE_HZ))
    regions: List[Dict[str, Any]] = []
    for index in range(1, len(frames)):
        if str(frames[index]["articulation"]) == "rest" and str(frames[index - 1]["articulation"]) in VOICED_ARTICULATIONS:
            regions.append({
                "rest_start_frame": index,
                "rest_start_seconds": index / FRAME_RATE_HZ,
                "fade_start_frame": max(0, index - fade_frames),
                "fade_start_seconds": max(0, index - fade_frames) / FRAME_RATE_HZ,
                "fade_duration_seconds": REST_ENTRY_FADE_SECONDS,
            })
    return regions


def rest_sample_ranges(frames: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    """Return contiguous authored-rest ranges that must be exactly silent."""

    ranges: List[Dict[str, Any]] = []
    start: Optional[int] = None
    for index, frame in enumerate(frames):
        is_rest = str(frame["articulation"]) == "rest"
        if is_rest and start is None:
            start = index
        if start is not None and (not is_rest or index == len(frames) - 1):
            end = index if not is_rest else index + 1
            ranges.append({
                "start_frame": start,
                "end_frame_exclusive": end,
                "start_seconds": start / FRAME_RATE_HZ,
                "end_seconds": end / FRAME_RATE_HZ,
                "start_sample": start * HOP_LENGTH,
                "end_sample_exclusive": end * HOP_LENGTH,
            })
            start = None
    return ranges


@contextlib.contextmanager
def legacy_fft_compat(torch: Any) -> Iterator[None]:
    """Temporarily emulate torch.rfft/irfft with torch.fft in this process only."""

    if not hasattr(torch, "fft"):
        raise RuntimeContractError("modern PyTorch torch.fft is required for the legacy compatibility shim")
    original_rfft = getattr(torch, "rfft", None)
    original_irfft = getattr(torch, "irfft", None)

    def rfft(value: Any, signal_ndim: int, normalized: bool = False, onesided: bool = True) -> Any:
        if signal_ndim != 1:
            raise RuntimeContractError("legacy rfft shim intentionally supports the published 1D component calls only")
        norm = "ortho" if normalized else "backward"
        transformed = torch.fft.rfft(value, norm=norm) if onesided else torch.fft.fft(value, norm=norm)
        return torch.view_as_real(transformed)

    def irfft(value: Any, signal_ndim: int, normalized: bool = False, onesided: bool = True, signal_sizes: Optional[Sequence[int]] = None) -> Any:
        if signal_ndim != 1:
            raise RuntimeContractError("legacy irfft shim intentionally supports the published 1D component calls only")
        norm = "ortho" if normalized else "backward"
        length = None if signal_sizes is None else int(signal_sizes[-1])
        complex_value = torch.view_as_complex(value.contiguous())
        if onesided:
            return torch.fft.irfft(complex_value, n=length, norm=norm)
        return torch.fft.ifft(complex_value, n=length, norm=norm).real

    torch.rfft = rfft
    torch.irfft = irfft
    try:
        yield
    finally:
        if original_rfft is None:
            delattr(torch, "rfft")
        else:
            torch.rfft = original_rfft
        if original_irfft is None:
            delattr(torch, "irfft")
        else:
            torch.irfft = original_irfft


def _import_published_components(torch: Any, root: Path) -> Tuple[Any, Any, Any]:
    root = root.expanduser().resolve()
    for entry in (root / "train", root):
        entry_string = str(entry)
        if entry_string not in sys.path:
            sys.path.insert(0, entry_string)
    try:
        decoder_module = importlib.import_module("network.autoencoder.decoder")
        harmonic_module = importlib.import_module("components.harmonic_oscillator")
        noise_module = importlib.import_module("components.filtered_noise")
    except Exception as exc:
        raise RuntimeContractError(f"could not import unchanged published DDSP components: {type(exc).__name__}: {exc}") from exc
    expected = {
        decoder_module: root / "train/network/autoencoder/decoder.py",
        harmonic_module: root / "components/harmonic_oscillator.py",
        noise_module: root / "components/filtered_noise.py",
    }
    for module, file_path in expected.items():
        if Path(str(module.__file__)).resolve() != file_path.resolve():
            raise RuntimeContractError("a pre-existing module shadowed the explicitly supplied published source checkout")
    return decoder_module.Decoder, harmonic_module.HarmonicOscillator, noise_module.FilteredNoise


def _import_published_reverb(root: Path) -> Any:
    """Import only the hash-gated published FIR reverb from the supplied checkout."""

    root = root.expanduser().resolve()
    root_string = str(root)
    if root_string not in sys.path:
        sys.path.insert(0, root_string)
    try:
        reverb_module = importlib.import_module("components.reverb")
    except Exception as exc:
        raise RuntimeContractError(f"could not import unchanged published reverb component: {type(exc).__name__}: {exc}") from exc
    expected_file = (root / "components/reverb.py").resolve()
    if Path(str(reverb_module.__file__)).resolve() != expected_file:
        raise RuntimeContractError("a pre-existing module shadowed the explicitly supplied published reverb source checkout")
    return reverb_module.TrainableFIRReverb


def _load_tensor_only_checkpoint(torch: Any, checkpoint: Path) -> Mapping[str, Any]:
    try:
        state = torch.load(str(checkpoint), map_location="cpu", weights_only=True)
    except TypeError as exc:
        raise RuntimeContractError("PyTorch is too old for safe weights_only checkpoint loading") from exc
    if not isinstance(state, Mapping) or any(not isinstance(value, torch.Tensor) for value in state.values()):
        raise RuntimeContractError("public checkpoint must be a tensor-only state dictionary")
    return state


def _decoder_config() -> types.SimpleNamespace:
    return types.SimpleNamespace(
        mlp_units=512,
        mlp_layers=3,
        use_z=False,
        z_units=16,
        n_harmonics=101,
        n_freq=65,
        gru_units=512,
        bidirectional=False,
        sample_rate=SAMPLE_RATE_HZ,
        frame_resolution=FRAME_RESOLUTION,
    )


def _moving_slur_probe_frames(
    frames: Sequence[Mapping[str, Any]],
    slur_qa: Mapping[str, Any],
) -> Dict[str, Dict[str, int]]:
    """Resolve fixed 250 Hz latent probes around each pitch-changing slur."""

    first_by_event: Dict[str, int] = {}
    for index, frame in enumerate(frames):
        event_id = str(frame["event_id"])
        if event_id and event_id not in first_by_event:
            first_by_event[event_id] = index
    offsets_ms = (-4, 0, 4, 8, 12, 20, 100)
    probes: Dict[str, Dict[str, int]] = {}
    records = slur_qa.get("events")
    if not isinstance(records, list):
        raise RuntimeContractError("slur QA records are required for component diagnostics")
    for raw in records:
        record = _mapping(raw, label="slur QA event")
        if record.get("truncated_before_slur"):
            continue
        source = _finite_number(record.get("source_hz"), label="slur QA source_hz")
        target = _finite_number(record.get("target_hz"), label="slur QA target_hz")
        if math.isclose(source, target, abs_tol=1.0e-9, rel_tol=0.0):
            continue
        event_id = str(record.get("event_id", ""))
        if event_id not in first_by_event:
            raise RuntimeContractError("moving slur diagnostic event has no control boundary")
        boundary = first_by_event[event_id]
        event_probes: Dict[str, int] = {}
        for offset_ms in offsets_ms:
            offset_frames = int(round((offset_ms / 1_000.0) * FRAME_RATE_HZ))
            index = boundary + offset_frames
            if index < 0 or index >= len(frames):
                raise RuntimeContractError("moving slur diagnostic probe falls outside rendered controls")
            event_probes[f"{offset_ms:+d}ms"] = index
        probes[event_id] = event_probes
    if not probes:
        raise RuntimeContractError("component diagnostics require at least one rendered pitch-changing slur")
    return probes


def render_dry_cpu(
    frames: Sequence[Mapping[str, Any]],
    *,
    ddsp_pytorch_root: Path,
    checkpoint: Path,
    seed: int,
    diagnostic_probe_frames: Optional[Mapping[str, Mapping[str, int]]] = None,
) -> Tuple[List[float], Dict[str, Any], Optional[Dict[str, Any]]]:
    """Load only published decoder weights and synthesize CPU dry audio from controls."""

    try:
        torch = importlib.import_module("torch")
    except ModuleNotFoundError as exc:
        raise RuntimeContractError("the named isolated Python must provide modern CPU PyTorch") from exc
    if not hasattr(torch, "fft"):
        raise RuntimeContractError("modern PyTorch with torch.fft is required")
    if torch.cuda.is_available():
        # Do not opportunistically choose it: reproducibility contract is CPU.
        device = "cpu"
    else:
        device = "cpu"
    Decoder, HarmonicOscillator, FilteredNoise = _import_published_components(torch, ddsp_pytorch_root)
    state = _load_tensor_only_checkpoint(torch, checkpoint)
    decoder_state = {str(key)[len("decoder."):]: value for key, value in state.items() if str(key).startswith("decoder.")}
    reverb_keys = sorted(str(key) for key in state if str(key).startswith("reverb."))
    if len(decoder_state) != 44 or reverb_keys != ["reverb.decay", "reverb.drywet", "reverb.fir"]:
        raise RuntimeContractError("checkpoint tensor layout differs from the audited Daegeum decoder/reverb layout")
    decoder = Decoder(_decoder_config()).to(device).eval()
    try:
        decoder.load_state_dict(decoder_state, strict=True)
    except RuntimeError as exc:
        raise RuntimeContractError(f"pinned decoder state could not load strictly: {exc}") from exc
    harmonic = HarmonicOscillator(sr=SAMPLE_RATE_HZ, frame_length=HOP_LENGTH, device=device).to(device).eval()
    filtered_noise = FilteredNoise(frame_length=HOP_LENGTH, device=device).to(device).eval()
    f0_values = [float(frame["f0_hz"]) for frame in frames]
    loudness_values = [float(frame["loudness_linear"]) for frame in frames]
    gate_values = [float(frame["voicing"]) for frame in frames]
    rest_fades = rest_entry_fade_regions(frames)
    hard_zero_rests = rest_sample_ranges(frames)
    torch.manual_seed(int(seed))
    with torch.inference_mode(), legacy_fft_compat(torch):
        latent = decoder({"f0": torch.tensor([f0_values], dtype=torch.float32, device=device), "loudness": torch.tensor([loudness_values], dtype=torch.float32, device=device)})
        harmonic_audio = harmonic(latent)
        noise_audio = filtered_noise(latent)
        if noise_audio.shape[-1] < harmonic_audio.shape[-1]:
            raise RuntimeContractError("published filtered-noise output was unexpectedly shorter than harmonic output")
        trimmed_noise_audio = noise_audio[:, : harmonic_audio.shape[-1]]
        dry = harmonic_audio + trimmed_noise_audio
        frame_gate = torch.tensor(gate_values, dtype=torch.float32, device=device).view(1, 1, -1)
        gate = torch.nn.functional.interpolate(frame_gate, scale_factor=HOP_LENGTH, mode="linear", align_corners=False).squeeze(1)
        if gate.shape[-1] != dry.shape[-1]:
            raise RuntimeContractError("score gate and published synthesis length disagree")
        for region in rest_fades:
            end = int(region["rest_start_frame"]) * HOP_LENGTH
            start = max(0, end - int(round(REST_ENTRY_FADE_SECONDS * SAMPLE_RATE_HZ)))
            fade = torch.linspace(1.0, 0.0, end - start, dtype=torch.float32, device=device)
            gate[:, start:end] *= fade
        # Linear interpolation is correct for voiced envelopes, but its edge
        # kernel can otherwise bleed a few samples into a written rest. The
        # authored rest contract wins: each full rest range is hard-zero.
        for region in hard_zero_rests:
            gate[:, int(region["start_sample"]):int(region["end_sample_exclusive"])] = 0.0
        # This is an authorial time-domain gate, not learned conditioning: it
        # hard-zeros the written rest and applies the already compiled 0→1
        # breath / 1→0 release envelope to both published branches.
        dry = dry * gate
        audio = dry.squeeze(0).detach().cpu().tolist()
        diagnostic_payload: Optional[Dict[str, Any]] = None
        if diagnostic_probe_frames is not None:
            latent_probes: Dict[str, Dict[str, Any]] = {}
            for event_id, event_probes in diagnostic_probe_frames.items():
                points: Dict[str, Any] = {}
                for label, raw_index in event_probes.items():
                    index = int(raw_index)
                    if index < 0 or index >= len(frames):
                        raise RuntimeContractError("latent diagnostic probe is outside decoder output")
                    points[str(label)] = {
                        "frame_index": index,
                        "time_seconds": float(frames[index]["time_seconds"]),
                        "a": float(latent["a"][0, index].cpu()),
                        "c": [float(value) for value in latent["c"][0, :, index].cpu().tolist()],
                        "H": [float(value) for value in latent["H"][0, index, :].cpu().tolist()],
                    }
                latent_probes[str(event_id)] = points
            diagnostic_payload = {
                "harmonic_post_gate": (harmonic_audio * gate).squeeze(0).detach().cpu().tolist(),
                "noise_post_gate": (trimmed_noise_audio * gate).squeeze(0).detach().cpu().tolist(),
                "latent_probes": latent_probes,
            }
            reconstructed = harmonic_audio * gate + trimmed_noise_audio * gate
            reconstruction_error = float(torch.max(torch.abs(dry - reconstructed)).cpu())
            if not math.isfinite(reconstruction_error) or reconstruction_error > 1.0e-6:
                raise RuntimeContractError("post-gate harmonic/noise diagnostics do not reconstruct the dry mix")
            diagnostic_payload["dry_from_component_stems_maximum_absolute_error"] = reconstruction_error
        latent_shapes = {key: list(value.shape) for key, value in latent.items()}
        amplitude_range = [float(latent["a"].min().cpu()), float(latent["a"].max().cpu())]
        noise_range = [float(latent["H"].min().cpu()), float(latent["H"].max().cpu())]
    if hasattr(torch, "rfft") or hasattr(torch, "irfft"):
        raise RuntimeContractError("legacy FFT compatibility shim leaked outside its process-local context")
    return audio, {
        "runtime": {"python": sys.version.split()[0], "torch": str(torch.__version__), "device": device, "cuda_selected": False, "seed": int(seed)},
        "checkpoint_tensors": {"decoder_tensor_count": len(decoder_state), "unloaded_reverb_tensor_keys": reverb_keys},
        "published_component_outputs": {"latent_shapes": latent_shapes, "harmonic_samples": int(harmonic_audio.shape[-1]), "noise_samples_before_dry_trim": int(noise_audio.shape[-1]), "decoder_amplitude_range": amplitude_range, "decoder_noise_filter_range": noise_range},
        "release_boundary_qa": release_boundary_qa(audio, frames),
        "compatibility": {"legacy_torch_rfft_irfft": "temporary process-local torch.fft adapter; restored before return", "hardcoded_cuda": "published harmonic/noise constructors received device='cpu'; no source file was edited", "encoder_crepe_or_audio_input": "not imported or called", "authored_rest_gate": {"written_rest_is_hard_zeroed_after_published_dry_synthesis": True, "hard_zero_rest_sample_ranges": hard_zero_rests, "voicing_upsampling": "linear 250 Hz to 16 kHz", "pre_rest_anti_click_fades": rest_fades, "pre_rest_fade_seconds": REST_ENTRY_FADE_SECONDS, "release": "no new score pitch; prior voiced F0, decoder-loudness, and voicing decay keep harmonic/noise continuous"}},
    }, diagnostic_payload


def _audio_stats(samples: Sequence[float]) -> Dict[str, float]:
    if not samples:
        raise RuntimeContractError("renderer produced no audio samples")
    values = [float(value) for value in samples]
    if not all(math.isfinite(value) for value in values):
        raise RuntimeContractError("audio samples contain a non-finite value")
    peak = max(abs(value) for value in values)
    rms = math.sqrt(sum(value * value for value in values) / len(values))
    return {"peak": peak, "rms": rms, "rms_dbfs": -math.inf if rms == 0.0 else 20.0 * math.log10(rms)}


def apply_shared_fixed_listening_gain(
    reference_samples: Sequence[float],
    candidates: Mapping[str, Sequence[float]],
    *,
    reference_label: str,
    shared_interval_end_seconds: float = SHARED_INTERVAL_END_SECONDS,
    target_rms: float = LISTENING_TARGET_RMS,
) -> Tuple[Dict[str, List[float]], Dict[str, Any]]:
    """Apply one reference-derived constant gain to every diagnostic candidate."""

    if not candidates:
        raise RuntimeContractError("shared fixed listening gain requires candidate audio")
    if not reference_label or reference_label not in candidates:
        raise RuntimeContractError("shared fixed listening gain requires an explicit candidate reference label")
    reference = [float(value) for value in reference_samples]
    end_sample = int(round(_finite_number(shared_interval_end_seconds, label="shared comparison interval end", minimum=FRAME_RESOLUTION) * SAMPLE_RATE_HZ))
    if end_sample <= 0 or end_sample > len(reference):
        raise RuntimeContractError("shared fixed-gain interval exceeds its reference audio")
    reference_rms = _audio_stats(reference[:end_sample])["rms"]
    if reference_rms <= 0.0:
        raise RuntimeContractError("shared fixed-gain reference interval is silent")
    gain = _finite_number(target_rms, label="shared fixed-gain target RMS", minimum=1.0e-12, maximum=0.98) / reference_rms
    scaled: Dict[str, List[float]] = {}
    records: Dict[str, Any] = {}
    expected_length = len(reference)
    for name, raw in candidates.items():
        values = [float(value) for value in raw]
        if len(values) != expected_length:
            raise RuntimeContractError("shared fixed-gain candidates must have identical lengths")
        source_stats = _audio_stats(values)
        if source_stats["peak"] * gain > 0.98:
            raise RuntimeContractError("shared fixed listening gain would clip a diagnostic candidate")
        scaled_values = [value * gain for value in values]
        scaled[str(name)] = scaled_values
        records[str(name)] = {
            "source": source_stats,
            "source_shared_interval_rms": _audio_stats(values[:end_sample])["rms"],
            "post_gain": _audio_stats(scaled_values),
            "post_gain_shared_interval_rms": _audio_stats(scaled_values[:end_sample])["rms"],
        }
    return scaled, {
        "gain_reference_candidate": reference_label,
        "constant_gain_applied_to_every_candidate": gain,
        "target_reference_shared_interval_rms": target_rms,
        "target_reference_shared_interval_rms_dbfs": 20.0 * math.log10(target_rms),
        "shared_interval_start_seconds": 0.0,
        "shared_interval_end_seconds": end_sample / SAMPLE_RATE_HZ,
        "shared_interval_sample_count": end_sample,
        "independent_candidate_normalization": False,
        "compression_or_limiter": False,
        "candidate_stats": records,
    }


def _vector_delta_metrics(reference: Sequence[float], candidate: Sequence[float], *, label: str) -> Dict[str, float]:
    if len(reference) != len(candidate) or not reference:
        raise RuntimeContractError(f"{label} latent vectors do not have the same non-zero length")
    reference_values = [float(value) for value in reference]
    candidate_values = [float(value) for value in candidate]
    if not all(math.isfinite(value) for value in reference_values + candidate_values):
        raise RuntimeContractError(f"{label} latent vectors contain a non-finite value")
    deltas = [right - left for left, right in zip(reference_values, candidate_values)]
    reference_norm = math.sqrt(sum(value * value for value in reference_values))
    candidate_norm = math.sqrt(sum(value * value for value in candidate_values))
    dot = sum(left * right for left, right in zip(reference_values, candidate_values))
    cosine_distance = 0.0 if reference_norm == 0.0 and candidate_norm == 0.0 else 1.0
    if reference_norm > 0.0 and candidate_norm > 0.0:
        cosine_distance = 1.0 - max(-1.0, min(1.0, dot / (reference_norm * candidate_norm)))
    return {
        "mean_absolute_delta": sum(abs(value) for value in deltas) / len(deltas),
        "maximum_absolute_delta": max(abs(value) for value in deltas),
        "l2_delta": math.sqrt(sum(value * value for value in deltas)),
        "cosine_distance": cosine_distance,
    }


def compare_latent_probes(
    canonical_payload: Mapping[str, Any],
    hard_step_payload: Mapping[str, Any],
) -> Dict[str, Any]:
    """Compare unmodified decoder a/c/H at matched slur-relative frames."""

    canonical_events = _mapping(canonical_payload.get("latent_probes"), label="canonical latent probes")
    hard_events = _mapping(hard_step_payload.get("latent_probes"), label="hard-step latent probes")
    if set(canonical_events) != set(hard_events):
        raise RuntimeContractError("canonical and hard-step latent diagnostic events differ")
    events: Dict[str, Any] = {}
    for event_id in sorted(canonical_events):
        canonical_points = _mapping(canonical_events[event_id], label="canonical latent event")
        hard_points = _mapping(hard_events[event_id], label="hard-step latent event")
        if set(canonical_points) != set(hard_points):
            raise RuntimeContractError("canonical and hard-step latent diagnostic offsets differ")
        points: Dict[str, Any] = {}
        for offset in canonical_points:
            canonical = _mapping(canonical_points[offset], label="canonical latent point")
            hard = _mapping(hard_points[offset], label="hard-step latent point")
            if canonical.get("frame_index") != hard.get("frame_index"):
                raise RuntimeContractError("canonical and hard-step latent probes are not frame-aligned")
            canonical_a = _finite_number(canonical.get("a"), label="canonical latent a", minimum=0.0)
            hard_a = _finite_number(hard.get("a"), label="hard-step latent a", minimum=0.0)
            a_ratio_db = None
            if canonical_a > 0.0 and hard_a > 0.0:
                a_ratio_db = 20.0 * math.log10(hard_a / canonical_a)
            points[str(offset)] = {
                "frame_index": int(canonical["frame_index"]),
                "time_seconds": float(canonical["time_seconds"]),
                "hard_minus_canonical_a": hard_a - canonical_a,
                "hard_over_canonical_a_db": a_ratio_db,
                "c": _vector_delta_metrics(canonical.get("c", []), hard.get("c", []), label="c"),
                "H": _vector_delta_metrics(canonical.get("H", []), hard.get("H", []), label="H"),
            }
        events[str(event_id)] = {
            "points": points,
            "plus_100ms_recurrent_carry": points.get("+100ms"),
        }
    return {
        "comparison": "experimental hard-step minus canonical 12 ms, same checkpoint/seed/loudness/voicing",
        "interpretation_limit": "these are recurrent checkpoint responses to different F0 controls, not learned slur or fingering labels",
        "decoder_outputs_manually_modified": False,
        "harmonic_distribution_c_preserved_from_decoder": True,
        "noise_filter_H_preserved_from_decoder": True,
        "events": events,
    }


def verify_diagnostic_control_difference(
    canonical_frames: Sequence[Mapping[str, Any]],
    hard_step_frames: Sequence[Mapping[str, Any]],
    canonical_slur_qa: Mapping[str, Any],
) -> Dict[str, Any]:
    """Fail closed unless comparison candidates differ only in intended F0 rows."""

    if len(canonical_frames) != len(hard_step_frames):
        raise RuntimeContractError("diagnostic candidate control lengths differ")
    probes = _moving_slur_probe_frames(canonical_frames, canonical_slur_qa)
    allowed_f0_difference_frames: set[int] = set()
    transition_frame_count = int(round(SLUR_TRANSITION_SECONDS * FRAME_RATE_HZ))
    for event_probes in probes.values():
        boundary = int(event_probes["+0ms"])
        allowed_f0_difference_frames.update(range(boundary, boundary + transition_frame_count))
    f0_difference_frames: List[int] = []
    exact_fields = ("frame_index", "time_seconds", "loudness_linear", "voicing", "articulation", "event_id", "vibrato_cents")
    for index, (canonical, hard) in enumerate(zip(canonical_frames, hard_step_frames)):
        if any(canonical[field] != hard[field] for field in exact_fields):
            raise RuntimeContractError("hard-step diagnostic altered a non-F0 score control")
        if not math.isclose(float(canonical["f0_hz"]), float(hard["f0_hz"]), abs_tol=1.0e-12, rel_tol=0.0):
            f0_difference_frames.append(index)
            if index not in allowed_f0_difference_frames:
                raise RuntimeContractError("hard-step diagnostic changed F0 outside a canonical slur-transition window")
    if not f0_difference_frames:
        raise RuntimeContractError("hard-step diagnostic did not differ from canonical F0 controls")
    return {
        "passed": True,
        "non_f0_controls_exactly_equal": True,
        "f0_difference_frame_indices": f0_difference_frames,
        "allowed_f0_difference_frame_indices": sorted(allowed_f0_difference_frames),
        "canonical_transition_milliseconds": SLUR_TRANSITION_MILLISECONDS,
        "hard_step_decoder_inputs_other_than_f0_changed": False,
    }


def render_checkpoint_native_reverb_cpu(
    dry_audio: Sequence[float],
    frames: Sequence[Mapping[str, Any]],
    *,
    ddsp_pytorch_root: Path,
    checkpoint: Path,
) -> Tuple[List[float], Dict[str, Any]]:
    """Run the published checkpoint FIR reverb on the already gated dry signal.

    This is intentionally a separate R&D audition, not part of the dry
    renderer.  The input is the authorial-gated dry output so authored rests
    are exact zero at its input; a learned FIR tail may quite properly extend
    into a written rest and beyond the score.
    """

    try:
        torch = importlib.import_module("torch")
    except ModuleNotFoundError as exc:
        raise RuntimeContractError("the named isolated Python must provide modern CPU PyTorch") from exc
    if not hasattr(torch, "fft"):
        raise RuntimeContractError("modern PyTorch with torch.fft is required")
    expected_dry_samples = len(frames) * HOP_LENGTH
    if len(dry_audio) != expected_dry_samples:
        raise RuntimeContractError("checkpoint-native reverb input must be the full published dry render")
    if not all(math.isfinite(float(value)) for value in dry_audio):
        raise RuntimeContractError("checkpoint-native reverb input contains a non-finite sample")
    hard_zero_rests = rest_sample_ranges(frames)
    for region in hard_zero_rests:
        start = int(region["start_sample"])
        end = int(region["end_sample_exclusive"])
        if any(float(value) != 0.0 for value in dry_audio[start:end]):
            raise RuntimeContractError("checkpoint-native reverb requires the authored dry rest to be exactly zero before convolution")

    TrainableFIRReverb = _import_published_reverb(ddsp_pytorch_root)
    state = _load_tensor_only_checkpoint(torch, checkpoint)
    reverb_keys = sorted(str(key) for key in state if str(key).startswith("reverb."))
    expected_keys = ["reverb.decay", "reverb.drywet", "reverb.fir"]
    if reverb_keys != expected_keys:
        raise RuntimeContractError("checkpoint tensor layout differs from the audited three-tensor published FIR reverb state")
    reverb_state = {key[len("reverb."):]: state[key] for key in reverb_keys}
    tensor_shapes = {key: list(reverb_state[key].shape) for key in sorted(reverb_state)}
    expected_shapes = {"decay": [1], "drywet": [1], "fir": [1, CHECKPOINT_NATIVE_REVERB_LENGTH_SAMPLES]}
    if tensor_shapes != expected_shapes:
        raise RuntimeContractError("checkpoint-native reverb tensor shapes differ from the pinned published Daegeum architecture")

    # The constructor's initial random FIR is entirely overwritten by the
    # strict checkpoint load.  Seeding it nevertheless makes this invocation
    # reproducible even before load_state_dict validates every tensor.
    torch.manual_seed(20260925)
    reverb = TrainableFIRReverb(reverb_length=CHECKPOINT_NATIVE_REVERB_LENGTH_SAMPLES, device="cpu").to("cpu").eval()
    try:
        reverb.load_state_dict(reverb_state, strict=True)
    except RuntimeError as exc:
        raise RuntimeContractError(f"pinned checkpoint-native reverb state could not load strictly: {exc}") from exc
    with torch.inference_mode(), legacy_fft_compat(torch):
        wet_tensor = reverb({"audio_synth": torch.tensor([list(dry_audio)], dtype=torch.float32, device="cpu")})
        if wet_tensor.ndim != 2 or wet_tensor.shape[0] != 1 or wet_tensor.shape[-1] <= len(dry_audio):
            raise RuntimeContractError("published checkpoint-native reverb did not produce the required full tail")
        wet_audio = wet_tensor.squeeze(0).detach().cpu().tolist()
    if hasattr(torch, "rfft") or hasattr(torch, "irfft"):
        raise RuntimeContractError("legacy FFT compatibility shim leaked outside its process-local context")
    if not all(math.isfinite(float(value)) for value in wet_audio):
        raise RuntimeContractError("published checkpoint-native reverb produced a non-finite sample")
    nominal_linear_convolution_samples = len(dry_audio) + CHECKPOINT_NATIVE_REVERB_LENGTH_SAMPLES - 1
    return wet_audio, {
        "source": {
            "component": "unchanged published ddsp-pytorch/components/reverb.py",
            "state_load": "strict checkpoint load succeeded",
            "checkpoint_tensor_keys": reverb_keys,
            "checkpoint_tensor_shapes": tensor_shapes,
            "constructor_device": "cpu",
            "legacy_fft_compatibility": "temporary process-local torch.fft adapter; restored before return",
        },
        "input": {
            "kind": "authorial-gated published dry decoder output; not source audio",
            "sample_count": len(dry_audio),
            "duration_seconds": len(dry_audio) / SAMPLE_RATE_HZ,
            "written_rest_is_exact_zero_before_reverb": True,
            "hard_zero_rest_sample_ranges": hard_zero_rests,
        },
        "output": {
            "sample_count": len(wet_audio),
            "duration_seconds": len(wet_audio) / SAMPLE_RATE_HZ,
            "tail_samples_after_score": len(wet_audio) - len(dry_audio),
            "tail_seconds_after_score": (len(wet_audio) - len(dry_audio)) / SAMPLE_RATE_HZ,
            "nominal_linear_convolution_samples": nominal_linear_convolution_samples,
            "legacy_irfft_inferred_length_note": "the untouched legacy source omits signal_sizes; for this odd convolution length the torch.fft compatibility adapter returns one sample fewer than nominal linear convolution length",
            "written_rest_behavior": "learned FIR room tail may remain audible in a written rest and after the score; exact-zero applies to the dry input, not this wet audition",
        },
    }


def level_match_shared_interval_whole_file(
    samples: Sequence[float],
    *,
    shared_interval_end_seconds: float = SHARED_INTERVAL_END_SECONDS,
    target_rms: float = LISTENING_TARGET_RMS,
) -> Tuple[List[float], Dict[str, Any]]:
    """Match the explicit shared pre-release interval with one whole-file gain.

    This refuses clipping instead of adding a compressor, limiter, or a
    tail-specific gain.  Dry A/B and the checkpoint-native wet C variant use
    this same [0.0, 6.48) interval, including the authored rest.
    """

    end_seconds = _finite_number(shared_interval_end_seconds, label="shared comparison interval end", minimum=FRAME_RESOLUTION)
    end_sample = int(round(end_seconds * SAMPLE_RATE_HZ))
    if abs(end_sample / SAMPLE_RATE_HZ - end_seconds) > 1.0e-12 or end_sample > len(samples):
        raise RuntimeContractError("shared comparison interval must align to available audio samples")
    shared = [float(value) for value in samples[:end_sample]]
    shared_rms = _audio_stats(shared)["rms"]
    if shared_rms <= 0.0:
        raise RuntimeContractError("cannot level-match an all-silent shared-interval audition")
    requested_gain = target_rms / shared_rms
    peak = _audio_stats(samples)["peak"]
    if requested_gain * peak > 0.98:
        raise RuntimeContractError("-24 dBFS shared-interval level match would clip; refusing compression, limiting, or unequal gain")
    scaled = [float(value) * requested_gain for value in samples]
    return scaled, {
        "target_shared_interval_rms": target_rms,
        "target_shared_interval_rms_dbfs": -24.0,
        "shared_interval_start_seconds": 0.0,
        "shared_interval_end_seconds": end_seconds,
        "shared_interval_sample_count": end_sample,
        "source_shared_interval_rms": shared_rms,
        "constant_gain_applied_to_entire_file": requested_gain,
        "compression_or_limiter": False,
        "clipping_limited": False,
        "post_gain_shared_interval_rms": _audio_stats(scaled[:end_sample])["rms"],
    }


def release_boundary_qa(samples: Sequence[float], frames: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    """Fail closed if a release begins with a large artificial energy cliff."""

    starts = [index for index, frame in enumerate(frames) if str(frame["articulation"]) == "release" and (index == 0 or str(frames[index - 1]["articulation"]) != "release")]
    if len(starts) != 1:
        raise RuntimeContractError("the explicit plan must have exactly one release onset for this R&D boundary QA")
    boundary = starts[0] * HOP_LENGTH
    window = int(round(0.020 * SAMPLE_RATE_HZ))
    if boundary < window or boundary + window > len(samples):
        raise RuntimeContractError("release boundary cannot support the required 20 ms QA windows")
    pre = _audio_stats(samples[boundary - window:boundary])["rms"]
    post = _audio_stats(samples[boundary:boundary + window])["rms"]
    if pre <= 0.0 or post <= 0.0:
        raise RuntimeContractError("release boundary contains an unexpected silent 20 ms QA window")
    delta_db = 20.0 * math.log10(post / pre)
    if delta_db < -6.0:
        raise RuntimeContractError("release begins with an artificial >6 dB 20 ms energy cliff")
    return {
        "release_start_frame": starts[0],
        "release_start_seconds": starts[0] / FRAME_RATE_HZ,
        "window_seconds": 0.020,
        "pre_window_rms": pre,
        "post_window_rms": post,
        "post_minus_pre_db": delta_db,
        "minimum_permitted_post_minus_pre_db": -6.0,
        "passed": True,
    }


def write_pcm16_wav(path: Path, samples: Sequence[float], *, sample_rate: int = SAMPLE_RATE_HZ) -> Dict[str, Any]:
    stats = _audio_stats(samples)
    if not math.isfinite(stats["peak"]) or stats["peak"] > 0.999:
        raise RuntimeContractError("dry render would clip; refusing to silently normalize a published-model output")
    pcm = array.array("h", (max(-32767, min(32767, int(round(float(value) * 32767.0)))) for value in samples))
    if sys.byteorder != "little":
        pcm.byteswap()
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(pcm.tobytes())
    return {**_file_record(path), "sample_rate_hz": sample_rate, "sample_count": len(samples), "duration_seconds": len(samples) / sample_rate, "unscaled_audio": stats}


def _read_safe_flute_reference(path: Path) -> Tuple[List[float], Dict[str, Any]]:
    path = path.expanduser().resolve()
    report_path = path.parent.parent / "official_flute_rnd_report.json"
    report = _load_json(report_path, label="official western-flute R&D report")
    if report.get("status") != "succeeded" or _mapping(report.get("scope"), label="flute report.scope").get("no_ngc_or_user_audio_read") is not True:
        raise RuntimeContractError("listening reference is not a verified prior synthetic western-flute R&D output")
    variants = _mapping(report.get("variants"), label="flute report.variants")
    bridge = _mapping(variants.get("B_authorial_bridge6_controls"), label="flute report variant B")
    reference_record = _mapping(bridge.get("audio"), label="flute report variant B.audio")
    if path.name != "authorial_score_bridge6.wav" or _sha256(path) != reference_record.get("sha256"):
        raise RuntimeContractError("reference WAV does not match the recorded official western-flute B artifact")
    with wave.open(str(path), "rb") as input_wave:
        if input_wave.getnchannels() != 1 or input_wave.getsampwidth() != 2 or input_wave.getframerate() != SAMPLE_RATE_HZ or input_wave.getcomptype() != "NONE":
            raise RuntimeContractError("reference WAV must be the expected mono 16-bit 16 kHz synthetic artifact")
        raw = input_wave.readframes(input_wave.getnframes())
    pcm = array.array("h")
    pcm.frombytes(raw)
    if sys.byteorder != "little":
        pcm.byteswap()
    return [sample / 32767.0 for sample in pcm], {"audio": _file_record(path), "report": _file_record(report_path), "verified_synthetic_reference_only": True}


def _require_fresh_output(root: Path, output_dir: Path) -> Path:
    root = root.expanduser().resolve()
    output_dir = output_dir.expanduser().resolve()
    allowed_parent = (root / "_bgm_rnd").resolve()
    if output_dir.parent != allowed_parent or OUTPUT_NAME.fullmatch(output_dir.name) is None:
        raise RuntimeContractError("output must be a fresh direct child named ddsp-gugak-public-daegeum-runtime-r1-YYYYMMDD-HHMMSS under ignored _bgm_rnd/")
    if output_dir.exists():
        raise RuntimeContractError("output directory already exists; choose a fresh R&D directory")
    return output_dir


def build_check_report(*, plan: Path, gugak_root: Path, ddsp_pytorch_root: Path, checkpoint: Path, checkpoint_config: Path) -> Dict[str, Any]:
    return {
        "schema": TOOL_SCHEMA,
        "status": "checked_not_rendered",
        "public_sources": validate_public_sources(gugak_root, ddsp_pytorch_root),
        "checkpoint": validate_checkpoint(checkpoint, checkpoint_config),
        "score_plan": validate_plan(plan),
        "scope": {
            "r_and_d_only": True,
            "no_training": True,
            "no_ngc_or_user_audio_read": True,
            "no_audio_input_or_crepe": True,
            "no_default_bgm_changed": True,
            "not_a_game_asset": True,
            "no_learned_reverb_in_dry_render": True,
            "checkpoint_native_reverb": "available only as an explicit separate R&D audition; it never replaces or modifies the dry output",
        },
        "license_limits": {
            "ddsp_gugak_repository_code": "MIT license file verified",
            "ddsp_pytorch_repository_code": "MIT license file verified",
            "checkpoint": "publicly downloadable checkpoint bytes verified, but no explicit separate checkpoint/game/distribution license is established by this tool",
            "render": "R&D-only; no game/public distribution clearance",
        },
    }


def execute(args: argparse.Namespace) -> Dict[str, Any]:
    if args.confirm_rnd_only is not True:
        raise RuntimeContractError("--execute requires --confirm-rnd-only")
    repository_root = args.repository_root.expanduser().resolve()
    output_dir = _require_fresh_output(repository_root, args.output_dir)
    if args.supersedes_output is not None and OUTPUT_NAME.fullmatch(args.supersedes_output) is None:
        raise RuntimeContractError("--supersedes-output must name one prior DDSP-Gugak R&D output directory")
    check = build_check_report(plan=args.plan, gugak_root=args.gugak_source_root, ddsp_pytorch_root=args.ddsp_pytorch_root, checkpoint=args.checkpoint, checkpoint_config=args.checkpoint_config)
    slur_pitch_mode = SLUR_PITCH_MODE_HARD_STEP if args.experimental_hard_f0_step else SLUR_PITCH_MODE_CURVE
    frames, controls = build_score_controls(
        args.plan,
        max_seconds=args.max_seconds,
        slur_transition_milliseconds=args.slur_transition_ms,
        slur_pitch_mode=slur_pitch_mode,
    )
    _, normalized_events, _ = _validate_plan(args.plan.expanduser().resolve())
    compiler_equivalence = verify_compiler_slur_policy_equivalence(
        repository_root,
        normalized_events,
        requested_transition_seconds=_slur_transition_seconds(args.slur_transition_ms),
        pitch_mode=slur_pitch_mode,
    )
    if args.reference_flute_wav is not None and controls["truncated_for_smoke"]:
        raise RuntimeContractError("the 6.72-second western-flute reference is allowed only for a full-plan listening pair")
    if args.checkpoint_native_reverb and controls["truncated_for_smoke"]:
        raise RuntimeContractError("checkpoint-native reverb is allowed only for the full 6.72-second explicit score")
    output_dir.mkdir(parents=False)
    controls_path = output_dir / "score_controls_250hz.csv"
    write_controls_csv(controls_path, frames)
    try:
        diagnostic_probe_frames = None
        if args.component_diagnostics:
            diagnostic_probe_frames = _moving_slur_probe_frames(frames, controls["slur_transition_control_qa"])
        audio, render, diagnostic_payload = render_dry_cpu(
            frames,
            ddsp_pytorch_root=args.ddsp_pytorch_root,
            checkpoint=args.checkpoint,
            seed=args.seed,
            diagnostic_probe_frames=diagnostic_probe_frames,
        )
        dry_path = output_dir / "published_daegeum_decoder_dry_authorial_gate.wav"
        outputs: Dict[str, Any] = {"controls_csv": _file_record(controls_path), "dry_wav": write_pcm16_wav(dry_path, audio)}
        component_diagnostics: Optional[Dict[str, Any]] = None
        if args.component_diagnostics:
            if diagnostic_payload is None:
                raise RuntimeContractError("component diagnostics were requested but the renderer returned no diagnostic payload")
            if slur_pitch_mode == SLUR_PITCH_MODE_HARD_STEP:
                canonical_frames, canonical_controls = build_score_controls(
                    args.plan,
                    max_seconds=args.max_seconds,
                    slur_transition_milliseconds=SLUR_TRANSITION_MILLISECONDS,
                    slur_pitch_mode=SLUR_PITCH_MODE_CURVE,
                )
                control_difference = verify_diagnostic_control_difference(
                    canonical_frames,
                    frames,
                    canonical_controls["slur_transition_control_qa"],
                )
                canonical_probe_frames = _moving_slur_probe_frames(
                    canonical_frames,
                    canonical_controls["slur_transition_control_qa"],
                )
                canonical_audio, canonical_render, canonical_payload = render_dry_cpu(
                    canonical_frames,
                    ddsp_pytorch_root=args.ddsp_pytorch_root,
                    checkpoint=args.checkpoint,
                    seed=args.seed,
                    diagnostic_probe_frames=canonical_probe_frames,
                )
                if canonical_payload is None:
                    raise RuntimeContractError("canonical diagnostic render returned no component payload")
                canonical_compiler_equivalence = verify_compiler_slur_policy_equivalence(
                    repository_root,
                    normalized_events,
                    requested_transition_seconds=SLUR_TRANSITION_SECONDS,
                    pitch_mode=SLUR_PITCH_MODE_CURVE,
                )
                canonical_controls_path = output_dir / "diagnostic_canonical_12ms_score_controls_250hz.csv"
                write_controls_csv(canonical_controls_path, canonical_frames)
                canonical_raw_path = output_dir / "diagnostic_canonical_12ms_published_daegeum_decoder_dry.wav"
                canonical_raw_record = write_pcm16_wav(canonical_raw_path, canonical_audio)
                shared_candidates = {
                    "canonical_12ms": canonical_audio,
                    "experimental_hard_step": audio,
                    "canonical_12ms_harmonic_post_gate": canonical_payload["harmonic_post_gate"],
                    "canonical_12ms_noise_post_gate": canonical_payload["noise_post_gate"],
                    "experimental_hard_step_harmonic_post_gate": diagnostic_payload["harmonic_post_gate"],
                    "experimental_hard_step_noise_post_gate": diagnostic_payload["noise_post_gate"],
                }
                shared_scaled, shared_gain = apply_shared_fixed_listening_gain(
                    canonical_audio,
                    shared_candidates,
                    reference_label="canonical_12ms",
                )
                diagnostic_output_names = {
                    "canonical_12ms": "A_canonical_12ms_daegeum_shared_gain.wav",
                    "experimental_hard_step": "B_experimental_hard_f0_step_daegeum_shared_gain.wav",
                    "canonical_12ms_harmonic_post_gate": "A1_canonical_12ms_harmonic_post_gate_shared_gain.wav",
                    "canonical_12ms_noise_post_gate": "A2_canonical_12ms_noise_post_gate_shared_gain.wav",
                    "experimental_hard_step_harmonic_post_gate": "B1_experimental_hard_f0_step_harmonic_post_gate_shared_gain.wav",
                    "experimental_hard_step_noise_post_gate": "B2_experimental_hard_f0_step_noise_post_gate_shared_gain.wav",
                }
                diagnostic_outputs = {
                    name: write_pcm16_wav(output_dir / diagnostic_output_names[name], shared_scaled[name])
                    for name in diagnostic_output_names
                }
                latent_comparison = compare_latent_probes(canonical_payload, diagnostic_payload)
                component_diagnostics = {
                    "purpose": "same-seed canonical-12ms versus experimental hard-F0-step dry comparison; this does not claim a learned slur, fingering transient, or articulation label",
                    "canonical_controls": canonical_controls,
                    "canonical_compiler_runtime_equivalence": canonical_compiler_equivalence,
                    "canonical_render": canonical_render,
                    "control_difference_gate": control_difference,
                    "latent_a_c_H_deltas": latent_comparison,
                    "shared_fixed_listening_gain": shared_gain,
                    "outputs": {
                        "canonical_controls_csv": _file_record(canonical_controls_path),
                        "canonical_unscaled_dry": canonical_raw_record,
                        **diagnostic_outputs,
                    },
                    "component_contract": {
                        "post_authorial_gate": True,
                        "same_noise_seed": int(args.seed),
                        "same_checkpoint": True,
                        "same_loudness_and_voicing_controls": True,
                        "harmonic_distribution_c_manually_modified": False,
                        "noise_filter_H_manually_modified": False,
                        "post_noise_pulse_or_gain_envelope": False,
                        "independent_candidate_normalization": False,
                        "canonical_dry_from_stems_maximum_absolute_error": canonical_payload["dry_from_component_stems_maximum_absolute_error"],
                        "hard_step_dry_from_stems_maximum_absolute_error": diagnostic_payload["dry_from_component_stems_maximum_absolute_error"],
                        "published_250hz_to_audio_linear_upsampling_note": "the experimental control-rate F0 step may be smoothed over roughly one 4 ms frame by the unchanged published oscillator; phase is integrated continuously and is not reset",
                    },
                }
                outputs["component_diagnostic_outputs"] = component_diagnostics["outputs"]
            else:
                shared_scaled, shared_gain = apply_shared_fixed_listening_gain(
                    audio,
                    {
                        "canonical_candidate": audio,
                        "harmonic_post_gate": diagnostic_payload["harmonic_post_gate"],
                        "noise_post_gate": diagnostic_payload["noise_post_gate"],
                    },
                    reference_label="canonical_candidate",
                )
                diagnostic_outputs = {
                    name: write_pcm16_wav(output_dir / f"diagnostic_{name}_shared_gain.wav", samples)
                    for name, samples in shared_scaled.items()
                }
                component_diagnostics = {
                    "purpose": "single-candidate post-gate harmonic/noise inspection; no learned-articulation claim",
                    "shared_fixed_listening_gain": shared_gain,
                    "latent_probes": diagnostic_payload["latent_probes"],
                    "outputs": diagnostic_outputs,
                    "component_contract": {
                        "post_authorial_gate": True,
                        "harmonic_distribution_c_manually_modified": False,
                        "noise_filter_H_manually_modified": False,
                        "post_noise_pulse_or_gain_envelope": False,
                        "dry_from_stems_maximum_absolute_error": diagnostic_payload["dry_from_component_stems_maximum_absolute_error"],
                    },
                }
                outputs["component_diagnostic_outputs"] = diagnostic_outputs
        checkpoint_native_reverb: Optional[Dict[str, Any]] = None
        if args.checkpoint_native_reverb:
            wet_audio, reverb_runtime = render_checkpoint_native_reverb_cpu(
                audio,
                frames,
                ddsp_pytorch_root=args.ddsp_pytorch_root,
                checkpoint=args.checkpoint,
            )
            wet_scaled, wet_gain = level_match_shared_interval_whole_file(wet_audio)
            wet_full_path = output_dir / "C_published_daegeum_checkpoint_native_reverb_full_tail_shared_interval_rms_matched.wav"
            wet_score_length_path = output_dir / "C_published_daegeum_checkpoint_native_reverb_score_length_shared_interval_rms_matched.wav"
            wet_full_record = write_pcm16_wav(wet_full_path, wet_scaled)
            wet_score_length_record = write_pcm16_wav(wet_score_length_path, wet_scaled[:len(audio)])
            checkpoint_native_reverb = {
                "kind": "separate published-checkpoint-native learned-FIR reverb audition; dry output remains preserved",
                "runtime": reverb_runtime,
                "level_match": wet_gain,
                "outputs": {
                    "full_wet_tail": wet_full_record,
                    "score_length_wet_audition": wet_score_length_record,
                },
                "written_rest_note": "the dry render is hard-zero during the authored rest. The learned FIR wet output may ring through that rest and after 6.72 seconds; that is expected room-tail behavior, not a claim that the score contains a new note.",
                "post_processing": "one constant gain derived from [0.0, 6.48) seconds is applied to each entire wet file; no compression, limiter, peak normalization, or tail-specific gain is used",
            }
            outputs["checkpoint_native_reverb_full_tail_wav"] = wet_full_record
            outputs["checkpoint_native_reverb_score_length_wav"] = wet_score_length_record
        listening_pair: Optional[Dict[str, Any]] = None
        if args.reference_flute_wav is not None:
            reference_audio, reference_provenance = _read_safe_flute_reference(args.reference_flute_wav)
            if len(reference_audio) != len(audio):
                raise RuntimeContractError("verified western-flute reference duration does not match the full score render")
            daegeum_scaled, daegeum_gain = level_match_shared_interval_whole_file(audio)
            flute_scaled, flute_gain = level_match_shared_interval_whole_file(reference_audio)
            daegeum_pair_path = output_dir / "A_published_daegeum_dry_shared_interval_rms_matched.wav"
            flute_pair_path = output_dir / "B_official_midi_ddsp_flute_bridge_shared_interval_rms_matched.wav"
            listening_pair = {
                "purpose": "post-render listening comparison only; the western-flute WAV is never decoder conditioning or a training input. Both files use the same [0.0, 6.48) interval RMS target and one constant whole-file gain.",
                "target_shared_interval_rms": LISTENING_TARGET_RMS,
                "target_shared_interval_rms_dbfs": -24.0,
                "published_daegeum": {"audio": write_pcm16_wav(daegeum_pair_path, daegeum_scaled), "gain": daegeum_gain},
                "official_western_flute_B": {"audio": write_pcm16_wav(flute_pair_path, flute_scaled), "gain": flute_gain, "provenance": reference_provenance},
            }
        report = {
            **check,
            "status": "succeeded",
            "supersedes_rnd_output_directory": args.supersedes_output,
            "score_controls": controls,
            "slur_research_rationale": {
                "scope": "flute transition literature informs an R&D timing prior only; it is not direct Daegeum performance evidence",
                "flute_key_transition_study": {
                    "citation_url": "https://www.phys.unsw.edu.au/jw/reprints/AlmeidaetalJASA09.pdf",
                    "reported_context": "key motion is typically about 10 ms under finger pressure and 16 ms under spring return; multi-finger timing differences can span tens of milliseconds, and acoustic effects are nonlinear with key displacement",
                },
                "portamento_perception_study": {
                    "citation_url": "https://newt.phys.unsw.edu.au/jw/reprints/portamento.pdf",
                    "reported_context": "used only as a perceptual timing rationale supplied for this R&D decision; no direct Daegeum generalization is claimed",
                },
                "decision": (
                    "this isolated candidate uses an experimental target-F0 control step while leaving the canonical 12 ms policy unchanged; the published oscillator may smooth the step over roughly one 4 ms control frame and integrates phase continuously. This is not a learned slur or fingering transient."
                    if slur_pitch_mode == SLUR_PITCH_MODE_HARD_STEP
                    else "8/12/20 ms pitch-only candidates are auditioned; 12 ms is the conservative canonical default, while 20 ms is retained only as a boundary candidate because it maximizes intermediate-pitch dwell"
                ),
            },
            "compiler_runtime_slur_policy_equivalence": compiler_equivalence,
            "render": render,
            "component_diagnostics": component_diagnostics,
            "outputs": outputs,
            "listening_pair": listening_pair,
            "checkpoint_native_reverb_audition": checkpoint_native_reverb,
            "actions_performed": {
                "training": False,
                "ngc_or_user_audio_read": False,
                "crepe_or_audio_input_used": False,
                "learned_reverb_called": args.checkpoint_native_reverb,
                "component_diagnostics_written": args.component_diagnostics,
                "experimental_hard_f0_step": slur_pitch_mode == SLUR_PITCH_MODE_HARD_STEP,
                "decoder_harmonic_distribution_or_noise_filter_modified": False,
                "post_noise_pulse_applied": False,
                "default_bgm_changed": False,
                "source_files_modified": False,
            },
        }
        report_path = output_dir / "runtime_report.json"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return {"output_directory": output_dir.name, "report": _file_record(report_path), "dry_wav": outputs["dry_wav"], "listening_pair_created": listening_pair is not None}
    except BaseException:
        # A half-populated fresh output must not be presented as a successful render.
        shutil.rmtree(output_dir)
        raise


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="validate only; do not import Torch or render")
    mode.add_argument("--execute", action="store_true", help="perform one explicit R&D-only CPU render")
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--gugak-source-root", type=Path, required=True, help="untouched DDSP-Gugak checkout at the pinned commit")
    parser.add_argument("--ddsp-pytorch-root", type=Path, required=True, help="untouched ddsp-pytorch checkout at the pinned commit")
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--checkpoint-config", type=Path, required=True)
    parser.add_argument("--repository-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--output-dir", type=Path, help="fresh ignored _bgm_rnd output directory, required with --execute")
    parser.add_argument("--reference-flute-wav", type=Path, help="optional verified prior synthetic MIDI-DDSP flute-B listening reference")
    parser.add_argument("--checkpoint-native-reverb", action="store_true", help="also create a separate R&D-only audition through the strictly loaded published three-tensor FIR reverb")
    parser.add_argument("--supersedes-output", help="optional prior DDSP-Gugak R&D output directory basename recorded as superseded")
    parser.add_argument("--max-seconds", type=float, help="250 Hz-aligned score prefix for an actual decoder smoke render")
    transition_mode = parser.add_mutually_exclusive_group()
    transition_mode.add_argument(
        "--slur-transition-ms",
        type=int,
        choices=SLUR_TRANSITION_CANDIDATE_MILLISECONDS,
        default=SLUR_TRANSITION_MILLISECONDS,
        help="pitch-only log-frequency minimum-jerk fingering transition; 12 ms is the canonical default",
    )
    transition_mode.add_argument(
        "--experimental-hard-f0-step",
        action="store_true",
        help="R&D-only target-F0 control step at each slur boundary; canonical 12 ms compiler/runtime policy remains unchanged",
    )
    parser.add_argument(
        "--component-diagnostics",
        action="store_true",
        help="write post-gate harmonic/noise diagnostics; with hard-step, also render canonical 12 ms using the same seed and one shared fixed gain",
    )
    parser.add_argument("--seed", type=int, default=20260925)
    parser.add_argument("--confirm-rnd-only", action="store_true")
    args = parser.parse_args(argv)
    if args.execute and args.output_dir is None:
        parser.error("--execute requires --output-dir")
    if args.component_diagnostics and args.max_seconds is not None:
        parser.error("--component-diagnostics requires the full explicit score; omit --max-seconds")
    if args.check and (args.output_dir is not None or args.reference_flute_wav is not None or args.checkpoint_native_reverb or args.supersedes_output is not None or args.confirm_rnd_only or args.slur_transition_ms != SLUR_TRANSITION_MILLISECONDS or args.experimental_hard_f0_step or args.component_diagnostics):
        parser.error("--check does not accept output, reference, supersession, or execution confirmation flags")
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        if args.check:
            report = build_check_report(plan=args.plan, gugak_root=args.gugak_source_root, ddsp_pytorch_root=args.ddsp_pytorch_root, checkpoint=args.checkpoint, checkpoint_config=args.checkpoint_config)
        else:
            report = execute(args)
    except RuntimeContractError as exc:
        print(f"ddsp-gugak-public-runtime: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
