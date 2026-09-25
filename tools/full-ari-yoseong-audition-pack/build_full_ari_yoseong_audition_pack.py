#!/usr/bin/env python3
"""Build a fail-closed, full-16-bar Arirang B0/B1 listening pack.

This is a verifier and byte-for-byte packer, not a renderer.  It accepts two
completed public-Daegeum runtime reports plus their exact score plans and
score-expression policy manifests.  It publishes a fresh ignored R&D folder
only when the full-song timing, written rest, release, expression, shared gain,
and no-default-BGM contracts all pass.
"""

from __future__ import annotations

import argparse
import array
import csv
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tempfile
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple
import wave


SPEC_SCHEMA = "mini.full-ari-yoseong-audition-pack-spec.v1"
MANIFEST_SCHEMA = "mini.full-ari-yoseong-audition-pack.v1"
RUNTIME_SCHEMA = "mini.ddsp-gugak-public-daegeum-runtime.v1"
POLICY_SCHEMA = "mini.score-expression.render-manifest.v2"
MANIFEST_FILENAME = "full_ari_yoseong_audition_manifest.json"
SPEC_SNAPSHOT_FILENAME = "audition_spec.snapshot.json"
DEFAULT_BGM_BASELINE_REVISION = "03a54f5c"
DEFAULT_BGM_PATHS = (
    "public/assets/audio/bgm/bgm.js",
    "public/assets/audio/bgm/bgm-loops.js",
    "public/assets/audio/bgm/render-meta.json",
    "public/assets/audio/bgm/*.ogg",
    "public/assets/audio/bgm/*.m4a",
)

SAMPLE_RATE_HZ = 16_000
CONTROL_RATE_HZ = 250
SCORE_END_SECONDS = 34.56
RELEASE_END_SECONDS = 34.80
RELEASE_START_FRAME = 8_640
EXPECTED_CONTROL_FRAMES = 8_700
EXPECTED_AUDIO_SAMPLES = 556_800
EXPECTED_VOICED_SCORE_EVENTS = 59
WRITTEN_REST_START_SECONDS = 16.56
WRITTEN_REST_END_SECONDS = 17.28
WRITTEN_REST_START_FRAME = 4_140
WRITTEN_REST_END_FRAME = 4_320
MONITORING_START_SECONDS = 0.0
MONITORING_END_SECONDS = SCORE_END_SECONDS
TARGET_RMS_DBFS = -24.0
RMS_TOLERANCE_DB = 0.02
HARD_STEP_MODE = "experimental_phase_continuous_hard_f0_step"
RELEASE_PHASE_POLICY = "source_vibrato_clock_continues_without_reset"
RELEASE_DEPTH_POLICY = "minimum_jerk_to_zero_on_final_control_row"
ROLES = {
    "B0": "full_ari_hard_step_no_explicit_yoseong_fixed_release",
    "B1": "full_ari_hard_step_contextual_yoseong_fixed_release",
}
OUTPUT_AUDIO_NAMES = {
    "B0": "B0_full_ari_hard_step_no_explicit_yoseong.wav",
    "B1": "B1_full_ari_hard_step_contextual_yoseong.wav",
}


class FullAriAuditionPackError(RuntimeError):
    """An input or repository invariant failed closed."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _file_record(path: Path) -> Dict[str, Any]:
    return {
        "basename": path.name,
        "byte_length": path.stat().st_size,
        "sha256": _sha256(path),
    }


def _load_json(path: Path, *, label: str) -> Mapping[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise FullAriAuditionPackError(f"{label} does not exist") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise FullAriAuditionPackError(f"{label} is not valid UTF-8 JSON") from exc
    if not isinstance(value, Mapping):
        raise FullAriAuditionPackError(f"{label} must be a JSON object")
    return value


def _write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise FullAriAuditionPackError(f"{label} must be an object")
    return value


def _list(value: Any, *, label: str) -> List[Any]:
    if not isinstance(value, list):
        raise FullAriAuditionPackError(f"{label} must be a list")
    return value


def _string(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise FullAriAuditionPackError(f"{label} must be a non-empty string")
    return value.strip()


def _sha_string(value: Any, *, label: str) -> str:
    text = _string(value, label=label).lower()
    if len(text) != 64 or any(character not in "0123456789abcdef" for character in text):
        raise FullAriAuditionPackError(f"{label} must be a lowercase SHA-256")
    return text


def _number(value: Any, *, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise FullAriAuditionPackError(f"{label} must be a finite number")
    result = float(value)
    if not math.isfinite(result):
        raise FullAriAuditionPackError(f"{label} must be a finite number")
    return result


def _exact(value: Any, expected: float, *, label: str) -> None:
    actual = _number(value, label=label)
    if not math.isclose(actual, expected, rel_tol=0.0, abs_tol=1.0e-9):
        raise FullAriAuditionPackError(f"{label} must be exactly {expected}, got {actual}")


def _safe_repo_path(repository_root: Path, value: Any, *, label: str) -> Tuple[Path, str]:
    relative = _string(value, label=label)
    if "\\" in relative:
        raise FullAriAuditionPackError(f"{label} must use POSIX separators")
    parsed = PurePosixPath(relative)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise FullAriAuditionPackError(f"{label} must be a safe repository-relative path")
    path = (repository_root / parsed).resolve()
    try:
        path.relative_to(repository_root)
    except ValueError as exc:
        raise FullAriAuditionPackError(f"{label} escapes the repository") from exc
    return path, parsed.as_posix()


def _validated_artifact(
    repository_root: Path,
    record: Any,
    *,
    label: str,
) -> Tuple[Path, Dict[str, Any]]:
    item = _mapping(record, label=label)
    path, relative = _safe_repo_path(repository_root, item.get("path"), label=f"{label}.path")
    expected = _sha_string(item.get("sha256"), label=f"{label}.sha256")
    if not path.is_file():
        raise FullAriAuditionPackError(f"{label} is not a file")
    actual = _sha256(path)
    if actual != expected:
        raise FullAriAuditionPackError(f"{label} SHA-256 does not match the spec")
    result = _file_record(path)
    result["repository_relative_path"] = relative
    return path, result


def _git(repository_root: Path, *arguments: str) -> str:
    try:
        completed = subprocess.run(
            ["git", "-C", str(repository_root), *arguments],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise FullAriAuditionPackError("could not inspect repository Git state") from exc
    if completed.returncode != 0:
        detail = completed.stderr.strip().splitlines()
        suffix = f": {detail[-1]}" if detail else ""
        raise FullAriAuditionPackError(f"Git inspection failed{suffix}")
    return completed.stdout.strip()


def validate_default_bgm_untouched(
    repository_root: Path,
    *,
    baseline_revision: str = DEFAULT_BGM_BASELINE_REVISION,
) -> Dict[str, Any]:
    _git(repository_root, "cat-file", "-e", f"{baseline_revision}^{{commit}}")
    commands = {
        "committed_since_baseline": ("diff", "--name-only", f"{baseline_revision}..HEAD", "--"),
        "unstaged": ("diff", "--name-only", "--"),
        "staged": ("diff", "--cached", "--name-only", "--"),
        "untracked": ("ls-files", "--others", "--exclude-standard", "--"),
    }
    findings: Dict[str, List[str]] = {}
    for name, prefix in commands.items():
        output = _git(repository_root, *prefix, *DEFAULT_BGM_PATHS)
        findings[name] = [line for line in output.splitlines() if line]
    changed = sorted({item for values in findings.values() for item in values})
    if changed:
        raise FullAriAuditionPackError(
            "default BGM no-touch guard failed: " + ", ".join(changed)
        )
    return {
        "passed": True,
        "baseline_revision": baseline_revision,
        "head_revision": _git(repository_root, "rev-parse", "HEAD"),
        "guarded_pathspecs": list(DEFAULT_BGM_PATHS),
        "findings": findings,
    }


def _resolve_report_output(
    report_path: Path,
    report: Mapping[str, Any],
    *,
    key: str,
    label: str,
) -> Tuple[Path, Dict[str, Any]]:
    outputs = _mapping(report.get("outputs"), label="runtime report outputs")
    record = _mapping(outputs.get(key), label=f"runtime report outputs.{key}")
    basename = _string(record.get("basename"), label=f"{label}.basename")
    if Path(basename).name != basename:
        raise FullAriAuditionPackError(f"{label}.basename must be a plain filename")
    expected = _sha_string(record.get("sha256"), label=f"{label}.sha256")
    path = report_path.parent / basename
    if not path.is_file() or _sha256(path) != expected:
        raise FullAriAuditionPackError(f"{label} bytes do not match the runtime report")
    return path, _file_record(path)


def _read_pcm16_mono(path: Path) -> Tuple[array.array, Dict[str, Any]]:
    try:
        with wave.open(str(path), "rb") as source:
            channels = source.getnchannels()
            width = source.getsampwidth()
            rate = source.getframerate()
            frames = source.getnframes()
            compression = source.getcomptype()
            raw = source.readframes(frames)
    except (OSError, wave.Error) as exc:
        raise FullAriAuditionPackError(f"{path.name} is not a readable PCM WAV") from exc
    if (channels, width, rate, compression) != (1, 2, SAMPLE_RATE_HZ, "NONE"):
        raise FullAriAuditionPackError(
            f"{path.name} must be PCM16 mono at {SAMPLE_RATE_HZ} Hz"
        )
    if frames != EXPECTED_AUDIO_SAMPLES or len(raw) != frames * 2:
        raise FullAriAuditionPackError(
            f"{path.name} must be exactly {EXPECTED_AUDIO_SAMPLES} samples / {RELEASE_END_SECONDS:.2f}s"
        )
    samples = array.array("h")
    samples.frombytes(raw)
    if sys.byteorder != "little":
        samples.byteswap()
    return samples, {
        "encoding": "PCM16_LE",
        "channels": 1,
        "bits_per_sample": 16,
        "sample_rate_hz": rate,
        "sample_count": frames,
        "duration_seconds": frames / rate,
    }


def _rms_dbfs(samples: Sequence[int], start: int, end: int) -> float:
    if start < 0 or end > len(samples) or start >= end:
        raise FullAriAuditionPackError("monitoring interval is outside candidate audio")
    mean_square = sum(float(samples[index]) ** 2 for index in range(start, end)) / (end - start)
    rms = math.sqrt(mean_square) / 32768.0
    if rms <= 0.0:
        raise FullAriAuditionPackError("monitoring interval is silent")
    return 20.0 * math.log10(rms)


def _audio_metrics(path: Path, *, require_target: bool) -> Dict[str, Any]:
    samples, metadata = _read_pcm16_mono(path)
    start = round(MONITORING_START_SECONDS * SAMPLE_RATE_HZ)
    end = round(MONITORING_END_SECONDS * SAMPLE_RATE_HZ)
    rms_dbfs = _rms_dbfs(samples, start, end)
    if require_target and abs(rms_dbfs - TARGET_RMS_DBFS) > RMS_TOLERANCE_DB:
        raise FullAriAuditionPackError(
            f"B0 monitoring RMS is {rms_dbfs:.6f} dBFS, not "
            f"{TARGET_RMS_DBFS:.1f} ± {RMS_TOLERANCE_DB:.2f} dB"
        )
    peak = max(abs(int(value)) for value in samples) / 32768.0
    return {
        **metadata,
        "peak": round(peak, 12),
        "peak_dbfs": round(20.0 * math.log10(peak), 9) if peak else None,
        "monitoring_interval": {
            "start_seconds": MONITORING_START_SECONDS,
            "end_seconds": MONITORING_END_SECONDS,
            "sample_count": end - start,
            "rms_dbfs": round(rms_dbfs, 9),
            "B0_required_target_rms_dbfs": TARGET_RMS_DBFS,
            "B0_tolerance_db": RMS_TOLERANCE_DB,
        },
    }


def _load_controls(path: Path) -> Dict[str, Any]:
    required = {
        "frame_index",
        "time_seconds",
        "f0_hz",
        "loudness_linear",
        "voicing",
        "articulation",
        "event_id",
        "vibrato_cents",
    }
    rows: List[Dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8", newline="") as stream:
            reader = csv.DictReader(stream)
            fields = set(reader.fieldnames or ())
            if not required.issubset(fields):
                missing = sorted(required - fields)
                raise FullAriAuditionPackError(
                    "controls CSV is missing required columns: " + ", ".join(missing)
                )
            for raw in reader:
                try:
                    row = {
                        "frame_index": int(raw["frame_index"]),
                        "time_seconds": float(raw["time_seconds"]),
                        "f0_hz": float(raw["f0_hz"]),
                        "loudness_linear": float(raw["loudness_linear"]),
                        "voicing": float(raw["voicing"]),
                        "articulation": raw["articulation"],
                        "event_id": raw["event_id"],
                        "vibrato_cents": float(raw["vibrato_cents"]),
                    }
                except (KeyError, TypeError, ValueError) as exc:
                    raise FullAriAuditionPackError("controls CSV contains an invalid row") from exc
                if row["frame_index"] != len(rows):
                    raise FullAriAuditionPackError("controls frame indices are not contiguous")
                expected_time = row["frame_index"] / CONTROL_RATE_HZ
                if not math.isclose(row["time_seconds"], expected_time, abs_tol=1.0e-12):
                    raise FullAriAuditionPackError("controls are not on the exact 250 Hz grid")
                numeric = ("time_seconds", "f0_hz", "loudness_linear", "voicing", "vibrato_cents")
                if not all(math.isfinite(row[name]) for name in numeric):
                    raise FullAriAuditionPackError("controls contain a non-finite value")
                rows.append(row)
    except OSError as exc:
        raise FullAriAuditionPackError("could not read controls CSV") from exc
    if len(rows) != EXPECTED_CONTROL_FRAMES:
        raise FullAriAuditionPackError(
            f"controls must contain exactly {EXPECTED_CONTROL_FRAMES} frames"
        )
    nonzero = [row for row in rows if abs(row["vibrato_cents"]) > 1.0e-9]
    return {
        "rows": rows,
        "frame_count": len(rows),
        "nonzero_vibrato_frame_count": len(nonzero),
        "nonzero_vibrato_event_ids": sorted({str(row["event_id"]) for row in nonzero}),
        "maximum_absolute_vibrato_cents": max(abs(row["vibrato_cents"]) for row in rows),
    }


def _rest_ranges(rows: Sequence[Mapping[str, Any]]) -> List[Tuple[int, int]]:
    indices = [row["frame_index"] for row in rows if row["articulation"] == "rest"]
    if not indices:
        return []
    ranges: List[Tuple[int, int]] = []
    start = previous = indices[0]
    for index in indices[1:]:
        if index != previous + 1:
            ranges.append((start, previous + 1))
            start = index
        previous = index
    ranges.append((start, previous + 1))
    return ranges


def _validate_written_rest(controls: Mapping[str, Any], report: Mapping[str, Any]) -> Dict[str, Any]:
    rows = controls["rows"]
    control_ranges = _rest_ranges(rows)
    if (WRITTEN_REST_START_FRAME, WRITTEN_REST_END_FRAME) not in control_ranges:
        raise FullAriAuditionPackError(
            "controls must contain the exact b8 written rest [16.56, 17.28)"
        )
    for row in rows[WRITTEN_REST_START_FRAME:WRITTEN_REST_END_FRAME]:
        if row["event_id"] not in {"", "rest"}:
            raise FullAriAuditionPackError("written-rest control row names a voiced event")
        if any(abs(row[name]) > 1.0e-12 for name in ("f0_hz", "loudness_linear", "voicing", "vibrato_cents")):
            raise FullAriAuditionPackError("written-rest controls are not exact zero")
    score_controls = _mapping(report.get("score_controls"), label="score_controls")
    gate = _mapping(score_controls.get("renderer_gate"), label="score_controls.renderer_gate")
    ranges = _list(gate.get("hard_zero_rest_ranges"), label="renderer_gate.hard_zero_rest_ranges")
    report_ranges: List[Tuple[int, int]] = []
    written_rest_record: Optional[Mapping[str, Any]] = None
    for index, raw in enumerate(ranges):
        record = _mapping(raw, label=f"hard_zero_rest_ranges[{index}]")
        start_frame = record.get("start_frame")
        end_frame = record.get("end_frame_exclusive")
        if not isinstance(start_frame, int) or not isinstance(end_frame, int):
            raise FullAriAuditionPackError("runtime rest frames must be integers")
        report_ranges.append((start_frame, end_frame))
        if (start_frame, end_frame) == (WRITTEN_REST_START_FRAME, WRITTEN_REST_END_FRAME):
            written_rest_record = record
    if report_ranges != control_ranges:
        raise FullAriAuditionPackError("runtime hard-zero rest ranges differ from control rows")
    if written_rest_record is None:
        raise FullAriAuditionPackError("runtime report omits the b8 written-rest range")
    expected = {
        "start_seconds": WRITTEN_REST_START_SECONDS,
        "end_seconds": WRITTEN_REST_END_SECONDS,
        "start_sample": round(WRITTEN_REST_START_SECONDS * SAMPLE_RATE_HZ),
        "end_sample_exclusive": round(WRITTEN_REST_END_SECONDS * SAMPLE_RATE_HZ),
    }
    for key, value in expected.items():
        actual = written_rest_record.get(key)
        if isinstance(value, float):
            _exact(actual, value, label=f"b8 written rest {key}")
        elif actual != value:
            raise FullAriAuditionPackError(f"b8 written rest {key} is not {value}")
    return {
        "passed": True,
        "start_seconds": WRITTEN_REST_START_SECONDS,
        "end_seconds": WRITTEN_REST_END_SECONDS,
        "start_frame": WRITTEN_REST_START_FRAME,
        "end_frame_exclusive": WRITTEN_REST_END_FRAME,
        "frame_count": WRITTEN_REST_END_FRAME - WRITTEN_REST_START_FRAME,
        "exact_zero_controls": True,
        "all_hard_zero_control_ranges": [list(value) for value in control_ranges],
        "other_authored_silence_ranges_preserved": [
            list(value)
            for value in control_ranges
            if value != (WRITTEN_REST_START_FRAME, WRITTEN_REST_END_FRAME)
        ],
    }


def _plan_events(report: Mapping[str, Any], plan_sha: str) -> Tuple[List[Mapping[str, Any]], Dict[str, Any]]:
    score_plan = _mapping(report.get("score_plan"), label="runtime report score_plan")
    report_plan = _mapping(score_plan.get("plan"), label="score_plan.plan")
    if _sha_string(report_plan.get("sha256"), label="score_plan.plan.sha256") != plan_sha:
        raise FullAriAuditionPackError("runtime report does not identify the supplied score plan")
    raw_events = _list(score_plan.get("events"), label="score_plan.events")
    events = [_mapping(item, label=f"score_plan.events[{index}]") for index, item in enumerate(raw_events)]
    if len(events) != EXPECTED_VOICED_SCORE_EVENTS + 1:
        raise FullAriAuditionPackError("full Arirang plan must have 59 voiced notes plus one release")
    voiced = [event for event in events if event.get("articulation") != "release"]
    releases = [event for event in events if event.get("articulation") == "release"]
    if len(voiced) != EXPECTED_VOICED_SCORE_EVENTS or len(releases) != 1 or events[-1] is not releases[0]:
        raise FullAriAuditionPackError("full Arirang plan must end with its single release")
    for index, event in enumerate(voiced):
        _string(event.get("id"), label=f"voiced event {index}.id")
        start = _number(event.get("start_seconds"), label=f"voiced event {index}.start_seconds")
        end = _number(event.get("end_seconds"), label=f"voiced event {index}.end_seconds")
        pitch = _number(event.get("pitch_hz"), label=f"voiced event {index}.pitch_hz")
        if not (0.0 <= start < end <= SCORE_END_SECONDS) or pitch <= 0.0:
            raise FullAriAuditionPackError(f"voiced event {index} has invalid timing/pitch")
        if start < WRITTEN_REST_END_SECONDS and end > WRITTEN_REST_START_SECONDS:
            raise FullAriAuditionPackError("a voiced score event overlaps the b8 written rest")
    release = releases[0]
    _exact(release.get("start_seconds"), SCORE_END_SECONDS, label="release.start_seconds")
    _exact(release.get("end_seconds"), RELEASE_END_SECONDS, label="release.end_seconds")
    source = _mapping(release.get("release_source"), label="release.release_source")
    source_id = _string(source.get("event_id"), label="release_source.event_id")
    if source_id != voiced[-1].get("id"):
        raise FullAriAuditionPackError("release does not inherit the final voiced note")
    nominal = _number(source.get("nominal_pitch_hz"), label="release_source.nominal_pitch_hz")
    if not math.isclose(nominal, float(voiced[-1]["pitch_hz"]), abs_tol=1.0e-9):
        raise FullAriAuditionPackError("release nominal pitch differs from final voiced note")
    ids = [_string(event.get("id"), label="score event id") for event in events]
    if len(ids) != len(set(ids)):
        raise FullAriAuditionPackError("score event IDs are not unique")
    return events, {
        "voiced_score_event_count": len(voiced),
        "release_event_count": 1,
        "score_end_seconds": SCORE_END_SECONDS,
        "release_end_seconds": RELEASE_END_SECONDS,
        "release_event_id": release["id"],
        "release_source_event_id": source_id,
        "release_nominal_pitch_hz": nominal,
    }


def _validate_release(
    report: Mapping[str, Any],
    controls: Mapping[str, Any],
    plan_qa: Mapping[str, Any],
) -> Dict[str, Any]:
    score_controls = _mapping(report.get("score_controls"), label="score_controls")
    qa = _mapping(score_controls.get("release_vibrato_qa"), label="release_vibrato_qa")
    policy = _mapping(qa.get("policy"), label="release_vibrato_qa.policy")
    if qa.get("passed") is not True or qa.get("final_nominal_pitch_gate_passed") is not True:
        raise FullAriAuditionPackError("release vibrato QA did not pass")
    if policy.get("phase_continuity") != RELEASE_PHASE_POLICY:
        raise FullAriAuditionPackError("release phase-continuity policy differs")
    if policy.get("depth_envelope") != RELEASE_DEPTH_POLICY:
        raise FullAriAuditionPackError("release depth-envelope policy differs")
    rows = controls["rows"]
    release_rows = rows[RELEASE_START_FRAME:EXPECTED_CONTROL_FRAMES]
    if not release_rows or any(
        row["articulation"] != "release" or row["event_id"] != plan_qa["release_event_id"]
        for row in release_rows
    ):
        raise FullAriAuditionPackError("controls do not contain the exact final release interval")
    final = release_rows[-1]
    if abs(final["vibrato_cents"]) > 1.0e-6:
        raise FullAriAuditionPackError("final release control row is not at zero vibrato cents")
    if not math.isclose(final["f0_hz"], plan_qa["release_nominal_pitch_hz"], abs_tol=1.0e-6):
        raise FullAriAuditionPackError("final release control row is not at nominal pitch")
    return {
        "passed": True,
        "start_seconds": SCORE_END_SECONDS,
        "end_seconds": RELEASE_END_SECONDS,
        "frame_count": len(release_rows),
        "final_control_frame_index": final["frame_index"],
        "final_control_vibrato_cents": final["vibrato_cents"],
        "final_control_f0_hz": final["f0_hz"],
        "nominal_pitch_hz": plan_qa["release_nominal_pitch_hz"],
        "final_nominal_pitch_gate_passed": True,
    }


def _enabled_vibrato_event_ids(events: Sequence[Mapping[str, Any]]) -> List[str]:
    result: List[str] = []
    for event in events:
        vibrato = event.get("vibrato")
        if vibrato is None:
            continue
        record = _mapping(vibrato, label=f"{event.get('id')} vibrato")
        if record.get("enabled") is True:
            result.append(_string(event.get("id"), label="vibrato event id"))
        elif record.get("enabled") is not False:
            raise FullAriAuditionPackError("event vibrato.enabled must be a boolean")
    return sorted(result)


def _validate_expression(
    slot: str,
    events: Sequence[Mapping[str, Any]],
    controls: Mapping[str, Any],
    expected_event_ids: Sequence[str],
) -> Dict[str, Any]:
    expected = sorted(set(expected_event_ids))
    if len(expected) != len(expected_event_ids):
        raise FullAriAuditionPackError(f"{slot} expected yoseong event IDs contain duplicates")
    enabled = _enabled_vibrato_event_ids(events)
    audible = controls["nonzero_vibrato_event_ids"]
    if slot == "B0":
        if expected or enabled or controls["nonzero_vibrato_frame_count"] != 0:
            raise FullAriAuditionPackError("B0 must have zero explicit and audible vibrato")
        return {
            "passed": True,
            "expected_event_ids": [],
            "enabled_plan_event_ids": [],
            "audible_control_event_ids": [],
            "nonzero_control_frame_count": 0,
            "event_end_nominal_pitch_gates": [],
        }
    if not expected or enabled != expected or audible != expected:
        raise FullAriAuditionPackError(
            "B1 plan/audible vibrato event IDs must equal the explicit expected selection"
        )
    end_gates: List[Dict[str, Any]] = []
    rows = controls["rows"]
    for event_id in expected:
        event_rows = [row for row in rows if row["event_id"] == event_id]
        if not event_rows or not any(abs(row["vibrato_cents"]) > 1.0e-9 for row in event_rows):
            raise FullAriAuditionPackError(f"B1 selected event {event_id} has no audible vibrato")
        final = event_rows[-1]
        if abs(final["vibrato_cents"]) > 1.0e-6:
            raise FullAriAuditionPackError(
                f"B1 selected event {event_id} does not end on its nominal-pitch row"
            )
        end_gates.append({
            "event_id": event_id,
            "final_frame_index": final["frame_index"],
            "final_vibrato_cents": final["vibrato_cents"],
            "passed": True,
        })
    return {
        "passed": True,
        "expected_event_ids": expected,
        "enabled_plan_event_ids": enabled,
        "audible_control_event_ids": audible,
        "nonzero_control_frame_count": controls["nonzero_vibrato_frame_count"],
        "event_end_nominal_pitch_gates": end_gates,
    }


def _policy_rule_ids(records: Sequence[Any]) -> List[str]:
    result: List[str] = []
    for index, raw in enumerate(records):
        record = _mapping(raw, label=f"fired_policy_rules[{index}]")
        result.append(_string(record.get("policy_rule_id"), label="policy_rule_id"))
    return sorted(set(result))


def _validate_policy(
    slot: str,
    policy: Mapping[str, Any],
    *,
    plan_sha: str,
    expected_event_ids: Sequence[str],
    expected_rule_ids: Sequence[str],
) -> Dict[str, Any]:
    if policy.get("schema") != POLICY_SCHEMA:
        raise FullAriAuditionPackError(f"{slot} policy manifest schema is unsupported")
    scope = _mapping(policy.get("r_and_d_scope"), label=f"{slot} policy r_and_d_scope")
    if any(scope.get(key) is not True for key in ("r_and_d_only", "no_default_assets", "no_game_output")):
        raise FullAriAuditionPackError(f"{slot} policy manifest is not fail-closed R&D-only")
    policy_input = _mapping(policy.get("input"), label=f"{slot} policy input")
    if _sha_string(policy_input.get("plan_sha256"), label=f"{slot} policy plan_sha256") != plan_sha:
        raise FullAriAuditionPackError(f"{slot} policy manifest does not bind the supplied plan")
    expression = _mapping(policy.get("expression_policy"), label=f"{slot} expression_policy")
    if expression.get("automatic_activation") is not False or expression.get("default_decision") != "off":
        raise FullAriAuditionPackError(f"{slot} policy must remain default-off and non-automatic")
    evidence = _string(expression.get("evidence_status"), label=f"{slot} evidence_status")
    if "provisional" not in evidence:
        raise FullAriAuditionPackError(f"{slot} policy must retain its provisional evidence limit")
    fired = _list(policy.get("fired_policy_rules"), label=f"{slot} fired_policy_rules")
    selected = [
        _mapping(item, label=f"{slot} selected rule")
        for item in fired
        if isinstance(item, Mapping) and item.get("decision") == "selected"
    ]
    selected_events = sorted(_string(item.get("event_id"), label="selected event_id") for item in selected)
    selected_rules = sorted(set(_string(item.get("policy_rule_id"), label="selected policy_rule_id") for item in selected))
    expected_events = sorted(expected_event_ids)
    expected_rules = sorted(set(expected_rule_ids))
    if slot == "B0":
        if selected_events or expected_events or expected_rules:
            raise FullAriAuditionPackError("B0 policy may not select a yoseong rule")
        if expression.get("active_selection_provenance") is not None:
            raise FullAriAuditionPackError("B0 active selection provenance must be null")
    else:
        selection = _mapping(
            expression.get("active_selection_provenance"),
            label="B1 active_selection_provenance",
        )
        if selection.get("status") != "explicit_rnd_audition_opt_in":
            raise FullAriAuditionPackError("B1 lacks explicit R&D audition opt-in provenance")
        selected_by_provenance = sorted(
            _string(value, label="B1 selected_event_ids item")
            for value in _list(selection.get("selected_event_ids"), label="B1 selected_event_ids")
        )
        if (
            not expected_events
            or not expected_rules
            or selected_events != expected_events
            or selected_by_provenance != expected_events
            or selected_rules != expected_rules
        ):
            raise FullAriAuditionPackError("B1 policy selections/rules do not equal the spec")
    return {
        "passed": True,
        "schema": POLICY_SCHEMA,
        "automatic_activation": False,
        "default_decision": "off",
        "evidence_status": evidence,
        "selected_event_ids": selected_events,
        "selected_policy_rule_ids": selected_rules,
        "all_fired_policy_rule_ids": _policy_rule_ids(fired),
    }


def _gain_source(level: Mapping[str, Any]) -> str:
    provenance = level.get("shared_gain_provenance")
    if isinstance(provenance, Mapping):
        for key in ("source_slot", "derived_from_slot", "gain_source_slot"):
            if key in provenance:
                return _string(provenance[key], label=f"shared_gain_provenance.{key}")
    for key in ("gain_source_slot", "constant_gain_source_slot", "normalization_source_slot"):
        if key in level:
            return _string(level[key], label=f"level_match.{key}")
    raise FullAriAuditionPackError(
        "level_match must explicitly attest that the shared gain was derived from B0"
    )


def _validate_level_match(report: Mapping[str, Any], *, slot: str) -> Dict[str, Any]:
    reverb = _mapping(
        report.get("checkpoint_native_reverb_audition"),
        label=f"{slot} checkpoint_native_reverb_audition",
    )
    level = _mapping(reverb.get("level_match"), label=f"{slot} level_match")
    _exact(level.get("shared_interval_start_seconds"), MONITORING_START_SECONDS, label=f"{slot} monitoring start")
    _exact(level.get("shared_interval_end_seconds"), MONITORING_END_SECONDS, label=f"{slot} monitoring end")
    if level.get("shared_interval_sample_count") != round(SCORE_END_SECONDS * SAMPLE_RATE_HZ):
        raise FullAriAuditionPackError(f"{slot} monitoring interval sample count differs")
    _exact(level.get("target_shared_interval_rms_dbfs"), TARGET_RMS_DBFS, label=f"{slot} target RMS")
    if level.get("compression_or_limiter") is not False or level.get("clipping_limited") is not False:
        raise FullAriAuditionPackError(f"{slot} level match used compression, limiting, or clipping control")
    gain = _number(
        level.get("constant_gain_applied_to_entire_file", level.get("gain_linear")),
        label=f"{slot} shared gain",
    )
    if gain <= 0.0:
        raise FullAriAuditionPackError(f"{slot} shared gain must be positive")
    source = _gain_source(level)
    if source != "B0":
        raise FullAriAuditionPackError(f"{slot} gain source must be B0")
    runtime = _mapping(reverb.get("runtime"), label=f"{slot} reverb runtime")
    source_record = _mapping(runtime.get("source"), label=f"{slot} reverb runtime.source")
    return {
        "constant_gain_applied_to_entire_file": gain,
        "gain_source_slot": source,
        "monitoring_interval": [MONITORING_START_SECONDS, MONITORING_END_SECONDS],
        "target_rms_dbfs": TARGET_RMS_DBFS,
        "reverb_kind": reverb.get("kind"),
        "reverb_source": source_record,
    }


def _score_skeleton(events: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {
            "id": event.get("id"),
            "start_seconds": event.get("start_seconds"),
            "end_seconds": event.get("end_seconds"),
            "pitch_hz": event.get("pitch_hz"),
            "articulation": event.get("articulation"),
            "steady_loudness_db": event.get("steady_loudness_db"),
        }
        for event in events
    ]


def _shared_control_signature(controls: Mapping[str, Any]) -> List[Tuple[Any, ...]]:
    return [
        (
            row["frame_index"],
            row["time_seconds"],
            row["loudness_linear"],
            row["voicing"],
            row["articulation"],
            row["event_id"],
        )
        for row in controls["rows"]
    ]


def _runtime_candidate(
    repository_root: Path,
    slot: str,
    candidate: Mapping[str, Any],
) -> Dict[str, Any]:
    report_path, report_source = _validated_artifact(
        repository_root, candidate.get("runtime_report"), label=f"{slot}.runtime_report"
    )
    plan_path, plan_source = _validated_artifact(
        repository_root, candidate.get("plan_artifact"), label=f"{slot}.plan_artifact"
    )
    policy_path, policy_source = _validated_artifact(
        repository_root, candidate.get("policy_manifest"), label=f"{slot}.policy_manifest"
    )
    report = _load_json(report_path, label=f"{slot} runtime report")
    if report.get("schema") != RUNTIME_SCHEMA or report.get("status") != "succeeded":
        raise FullAriAuditionPackError(f"{slot} runtime report is not a successful supported report")
    scope = _mapping(report.get("scope"), label=f"{slot} scope")
    actions = _mapping(report.get("actions_performed"), label=f"{slot} actions_performed")
    if not (
        scope.get("r_and_d_only") is True
        and scope.get("no_default_bgm_changed") is True
        and scope.get("not_a_game_asset") is True
        and actions.get("default_bgm_changed") is False
        and actions.get("experimental_hard_f0_step") is True
        and actions.get("learned_reverb_called") is True
    ):
        raise FullAriAuditionPackError(f"{slot} runtime scope/actions are not R&D-only hard-step wet output")
    score_controls = _mapping(report.get("score_controls"), label=f"{slot} score_controls")
    if score_controls.get("renderer_control_hz") != CONTROL_RATE_HZ:
        raise FullAriAuditionPackError(f"{slot} is not a 250 Hz control render")
    if score_controls.get("frame_count") != EXPECTED_CONTROL_FRAMES:
        raise FullAriAuditionPackError(f"{slot} report frame count is not 8700")
    _exact(score_controls.get("duration_seconds"), RELEASE_END_SECONDS, label=f"{slot} duration_seconds")
    _exact(score_controls.get("full_plan_duration_seconds"), RELEASE_END_SECONDS, label=f"{slot} full_plan_duration_seconds")
    slur = _mapping(score_controls.get("slur_transition_policy"), label=f"{slot} slur policy")
    if slur.get("pitch_mode") != HARD_STEP_MODE:
        raise FullAriAuditionPackError(f"{slot} is not the hard-step transition mode")

    events, plan_qa = _plan_events(report, plan_source["sha256"])
    controls_path, controls_source = _resolve_report_output(
        report_path, report, key="controls_csv", label=f"{slot} controls CSV"
    )
    audio_path, audio_source = _resolve_report_output(
        report_path,
        report,
        key="checkpoint_native_reverb_score_length_wav",
        label=f"{slot} score-length wet WAV",
    )
    controls = _load_controls(controls_path)
    rest_qa = _validate_written_rest(controls, report)
    release_qa = _validate_release(report, controls, plan_qa)
    expected_events = [
        _string(value, label=f"{slot} expected_yoseong_event_ids item")
        for value in _list(candidate.get("expected_yoseong_event_ids"), label=f"{slot} expected_yoseong_event_ids")
    ]
    expression_qa = _validate_expression(slot, events, controls, expected_events)
    expected_rules = [
        _string(value, label=f"{slot} expected_policy_rule_ids item")
        for value in _list(candidate.get("expected_policy_rule_ids"), label=f"{slot} expected_policy_rule_ids")
    ]
    policy = _load_json(policy_path, label=f"{slot} policy manifest")
    policy_qa = _validate_policy(
        slot,
        policy,
        plan_sha=plan_source["sha256"],
        expected_event_ids=expected_events,
        expected_rule_ids=expected_rules,
    )
    audio_metrics = _audio_metrics(audio_path, require_target=slot == "B0")
    level_qa = _validate_level_match(report, slot=slot)
    render = _mapping(report.get("render"), label=f"{slot} render")
    runtime = _mapping(render.get("runtime"), label=f"{slot} render.runtime")
    if not isinstance(runtime.get("seed"), int):
        raise FullAriAuditionPackError(f"{slot} renderer seed is missing")
    for source_path, source_record in ((controls_path, controls_source), (audio_path, audio_source)):
        source_record["repository_relative_path"] = source_path.relative_to(repository_root).as_posix()
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
        "controls": controls,
        "audio_metrics": audio_metrics,
        "plan_qa": plan_qa,
        "rest_qa": rest_qa,
        "release_qa": release_qa,
        "expression_qa": expression_qa,
        "policy_qa": policy_qa,
        "level_qa": level_qa,
        "score_skeleton": _score_skeleton(events),
        "checkpoint_signature": report.get("checkpoint"),
        "public_sources_signature": report.get("public_sources"),
        "renderer_seed": runtime.get("seed"),
    }


def _compare_candidates(b0: Mapping[str, Any], b1: Mapping[str, Any]) -> Dict[str, Any]:
    for label in (
        "score_skeleton",
        "checkpoint_signature",
        "public_sources_signature",
        "renderer_seed",
    ):
        if b0[label] != b1[label]:
            raise FullAriAuditionPackError(f"B1 does not share B0 {label}")
    if _shared_control_signature(b0["controls"]) != _shared_control_signature(b1["controls"]):
        raise FullAriAuditionPackError(
            "B1 changes score timing, articulation, loudness, voicing, or event assignment"
        )
    for key in ("constant_gain_applied_to_entire_file", "gain_source_slot", "monitoring_interval", "target_rms_dbfs", "reverb_kind", "reverb_source"):
        if b0["level_qa"][key] != b1["level_qa"][key]:
            raise FullAriAuditionPackError(f"B1 does not share B0 level/reverb field {key}")
    return {
        "passed": True,
        "same_59_note_score_and_final_release": True,
        "same_timing_articulation_loudness_voicing_and_event_assignment": True,
        "same_checkpoint_public_sources_and_seed": True,
        "same_checkpoint_native_reverb": True,
        "same_B0_derived_constant_gain": b0["level_qa"]["constant_gain_applied_to_entire_file"],
        "same_monitoring_interval": [MONITORING_START_SECONDS, MONITORING_END_SECONDS],
        "audio_bytes_copied_without_transform": True,
    }


def _copy_verified(source: Path, destination: Path, expected_sha256: str) -> Dict[str, Any]:
    shutil.copyfile(source, destination)
    if _sha256(source) != expected_sha256 or _sha256(destination) != expected_sha256:
        raise FullAriAuditionPackError("artifact bytes changed during pack assembly")
    return _file_record(destination)


def _listening_readme() -> str:
    return (
        "# Full 16-bar Arirang Daegeum B0/B1 audition\n\n"
        "Both files are 34.80-second R&D-only checkpoint-native-reverb renders. "
        "They share the same 59-note score, [16.56, 17.28) written rest, final "
        "0.24-second release, hard-step transitions, checkpoint, seed, reverb, "
        "B0-derived constant gain, and [0.00, 34.56) monitoring interval.\n\n"
        "- B0: every score note remains straight tone.\n"
        "- B1: only the explicitly selected provisional contextual-yoseong events differ.\n\n"
        "The packer copied verified source bytes; it did not render, normalize, or edit audio. "
        "These checkpoint outputs are not cleared game assets. Inspect "
        "`full_ari_yoseong_audition_manifest.json` and `provenance/` for evidence.\n"
    )


def build_full_ari_yoseong_audition_pack(
    repository_root: Path,
    spec_path: Path,
    output_dir: Path,
    *,
    baseline_revision: str = DEFAULT_BGM_BASELINE_REVISION,
) -> Dict[str, Any]:
    repository_root = repository_root.expanduser().resolve()
    spec_path = spec_path.expanduser().resolve()
    output_dir = output_dir.expanduser().resolve()
    if not repository_root.is_dir():
        raise FullAriAuditionPackError("repository root is not a directory")
    try:
        spec_relative = spec_path.relative_to(repository_root).as_posix()
        output_relative = output_dir.relative_to(repository_root).as_posix()
    except ValueError as exc:
        raise FullAriAuditionPackError("spec and output must be inside the repository") from exc
    if not output_relative.startswith("_bgm_rnd/"):
        raise FullAriAuditionPackError("output must be inside ignored _bgm_rnd/")
    if output_dir.exists():
        raise FullAriAuditionPackError("output directory must be fresh")
    if not output_dir.parent.is_dir():
        raise FullAriAuditionPackError("output parent directory must already exist")

    spec = _load_json(spec_path, label="full-Ari audition spec")
    if spec.get("schema") != SPEC_SCHEMA:
        raise FullAriAuditionPackError("unsupported full-Ari audition spec schema")
    candidates = _mapping(spec.get("candidates"), label="spec candidates")
    if set(candidates) != set(ROLES):
        raise FullAriAuditionPackError("spec must contain exactly B0 and B1")
    guard = validate_default_bgm_untouched(repository_root, baseline_revision=baseline_revision)

    ready: Dict[str, Dict[str, Any]] = {}
    for slot in ("B0", "B1"):
        candidate = _mapping(candidates[slot], label=f"candidates.{slot}")
        if candidate.get("status") != "ready" or candidate.get("role") != ROLES[slot]:
            raise FullAriAuditionPackError(f"{slot} is not ready under its fixed role")
        ready[slot] = _runtime_candidate(repository_root, slot, candidate)
    fairness = _compare_candidates(ready["B0"], ready["B1"])

    source_paths = {
        item[key]
        for item in ready.values()
        for key in ("report_path", "plan_path", "policy_path", "controls_path", "audio_path")
    }
    source_hashes_before = {path: _sha256(path) for path in source_paths}
    spec_sha = _sha256(spec_path)
    manifest_candidates: Dict[str, Any] = {}
    with tempfile.TemporaryDirectory(prefix=".full-ari-yoseong-pack-", dir=str(output_dir.parent)) as temporary:
        staging = Path(temporary)
        provenance = staging / "provenance"
        provenance.mkdir()
        _copy_verified(spec_path, staging / SPEC_SNAPSHOT_FILENAME, spec_sha)
        for slot in ("B0", "B1"):
            item = ready[slot]
            output_audio = staging / OUTPUT_AUDIO_NAMES[slot]
            audio_record = _copy_verified(item["audio_path"], output_audio, item["audio_source"]["sha256"])
            packaged: Dict[str, Any] = {}
            for source_key, filename, source_record_key in (
                ("report_path", f"{slot}_runtime_report.json", "report_source"),
                ("plan_path", f"{slot}_score_plan.json", "plan_source"),
                ("policy_path", f"{slot}_score_expression_manifest.json", "policy_source"),
                ("controls_path", f"{slot}_score_controls_250hz.csv", "controls_source"),
            ):
                record = _copy_verified(
                    item[source_key],
                    provenance / filename,
                    item[source_record_key]["sha256"],
                )
                packaged[source_key.removesuffix("_path")] = {
                    "filename": f"provenance/{filename}",
                    **record,
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
                "controls": {
                    "frame_count": item["controls"]["frame_count"],
                    "nonzero_vibrato_frame_count": item["controls"]["nonzero_vibrato_frame_count"],
                    "nonzero_vibrato_event_ids": item["controls"]["nonzero_vibrato_event_ids"],
                    "maximum_absolute_vibrato_cents": round(item["controls"]["maximum_absolute_vibrato_cents"], 9),
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
                "policy_qa": item["policy_qa"],
                "monitoring_and_gain_qa": item["level_qa"],
            }

        guard = validate_default_bgm_untouched(
            repository_root, baseline_revision=baseline_revision
        )
        manifest: Dict[str, Any] = {
            "schema": MANIFEST_SCHEMA,
            "status": "succeeded",
            "scope": {
                "r_and_d_only": True,
                "not_game_assets": True,
                "default_bgm_no_touch_guard": guard,
                "no_audio_generated_or_transformed_by_packer": True,
            },
            "fixed_full_song_contract": {
                "voiced_score_event_count": EXPECTED_VOICED_SCORE_EVENTS,
                "release_event_count": 1,
                "score_end_seconds": SCORE_END_SECONDS,
                "release_end_seconds": RELEASE_END_SECONDS,
                "control_rate_hz": CONTROL_RATE_HZ,
                "control_frame_count": EXPECTED_CONTROL_FRAMES,
                "sample_rate_hz": SAMPLE_RATE_HZ,
                "audio_sample_count": EXPECTED_AUDIO_SAMPLES,
                "written_rest_interval_seconds": [WRITTEN_REST_START_SECONDS, WRITTEN_REST_END_SECONDS],
                "monitoring_interval_seconds": [MONITORING_START_SECONDS, MONITORING_END_SECONDS],
                "pitch_transition_mode": HARD_STEP_MODE,
            },
            "spec": {
                "repository_relative_path": spec_relative,
                "sha256": spec_sha,
                "snapshot_filename": SPEC_SNAPSHOT_FILENAME,
            },
            "comparison_contract": fairness,
            "candidates": manifest_candidates,
            "interpretation_limits": {
                "B0_is_a_straight_tone_audition_baseline_not_performance_truth": True,
                "B1_is_a_provisional_context_policy_audition_not_learned_expression": True,
                "checkpoint_weights_are_not_established_as_game_distribution_cleared": True,
            },
        }
        _write_json(staging / MANIFEST_FILENAME, manifest)
        (staging / "README.md").write_text(_listening_readme(), encoding="utf-8")
        if any(_sha256(path) != digest for path, digest in source_hashes_before.items()):
            raise FullAriAuditionPackError("a source artifact changed during pack assembly")
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
        manifest = build_full_ari_yoseong_audition_pack(
            args.repository_root,
            args.spec,
            args.output_dir,
        )
    except FullAriAuditionPackError as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "status": manifest["status"],
        "manifest": str(args.output_dir / MANIFEST_FILENAME),
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
