#!/usr/bin/env python3
"""Assemble a fail-closed B0/B1/B2 Daegeum yoseong audition pack.

The renderer remains the source of audio.  This tool only verifies provenance,
matched monitoring/reverb conditions, score-control invariants, and the
default-BGM no-touch guard before copying the exact candidate bytes into a
fresh ignored R&D directory.  A B2 reference-derived candidate is never
invented: absent verified curve/source evidence is represented as BLOCKED.
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


SPEC_SCHEMA = "mini.yoseong-audition-pack-spec.v1"
MANIFEST_SCHEMA = "mini.yoseong-audition-pack.v1"
REFERENCE_SCHEMA = "mini.yoseong-reference-derivation.v1"
RUNTIME_SCHEMA = "mini.ddsp-gugak-public-daegeum-runtime.v1"
MANIFEST_FILENAME = "yoseong_audition_manifest.json"
SPEC_SNAPSHOT_FILENAME = "audition_spec.snapshot.json"
DEFAULT_BGM_BASELINE_REVISION = "03a54f5c"
DEFAULT_BGM_PATHS = (
    "public/assets/audio/bgm/bgm.js",
    "public/assets/audio/bgm/bgm-loops.js",
    "public/assets/audio/bgm/render-meta.json",
    "public/assets/audio/bgm/*.ogg",
    "public/assets/audio/bgm/*.m4a",
)
EXPECTED_SAMPLE_RATE_HZ = 16_000
CONTROL_RATE_HZ = 250
ACTIVE_START_SECONDS = 0.0
ACTIVE_END_SECONDS = 6.48
TARGET_RMS_DBFS = -24.0
RMS_TOLERANCE_DB = 0.02
HARD_STEP_MODE = "experimental_phase_continuous_hard_f0_step"
RELEASE_PHASE_POLICY = "source_vibrato_clock_continues_without_reset"
RELEASE_DEPTH_POLICY = "minimum_jerk_to_zero_on_final_control_row"
ROLES = {
    "B0": "hard_step_no_explicit_yoseong_fixed_release",
    "B1": "hard_step_research_rule_yoseong_fixed_release",
    "B2": "hard_step_reference_derived_or_learned_yoseong_fixed_release",
}
OUTPUT_AUDIO_NAMES = {
    "B0": "B0_hard_step_no_explicit_yoseong_fixed_release.wav",
    "B1": "B1_hard_step_research_rule_yoseong_fixed_release.wav",
    "B2": "B2_hard_step_reference_derived_yoseong_fixed_release.wav",
}


class YoseongAuditionPackError(RuntimeError):
    """A candidate, its provenance, or the repository state failed closed."""


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
        raise YoseongAuditionPackError(f"{label} does not exist") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise YoseongAuditionPackError(f"{label} is not valid UTF-8 JSON") from exc
    if not isinstance(value, Mapping):
        raise YoseongAuditionPackError(f"{label} must be a JSON object")
    return value


def _write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise YoseongAuditionPackError(f"{label} must be an object")
    return value


def _list(value: Any, *, label: str) -> List[Any]:
    if not isinstance(value, list):
        raise YoseongAuditionPackError(f"{label} must be a list")
    return value


def _nonempty_string(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise YoseongAuditionPackError(f"{label} must be a non-empty string")
    return value.strip()


def _sha_string(value: Any, *, label: str) -> str:
    text = _nonempty_string(value, label=label).lower()
    if len(text) != 64 or any(character not in "0123456789abcdef" for character in text):
        raise YoseongAuditionPackError(f"{label} must be a lowercase SHA-256")
    return text


def _safe_repo_path(repository_root: Path, value: Any, *, label: str) -> Tuple[Path, str]:
    relative = _nonempty_string(value, label=label)
    if "\\" in relative:
        raise YoseongAuditionPackError(f"{label} must use POSIX separators")
    parsed = PurePosixPath(relative)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise YoseongAuditionPackError(f"{label} must be a safe repository-relative path")
    resolved = (repository_root / parsed).resolve()
    try:
        resolved.relative_to(repository_root)
    except ValueError as exc:
        raise YoseongAuditionPackError(f"{label} escapes the repository") from exc
    return resolved, parsed.as_posix()


def _validated_artifact(
    repository_root: Path,
    record: Any,
    *,
    label: str,
) -> Tuple[Path, Dict[str, Any]]:
    mapping = _mapping(record, label=label)
    path, relative = _safe_repo_path(repository_root, mapping.get("path"), label=f"{label}.path")
    expected = _sha_string(mapping.get("sha256"), label=f"{label}.sha256")
    if not path.is_file():
        raise YoseongAuditionPackError(f"{label} is not a file")
    actual = _sha256(path)
    if actual != expected:
        raise YoseongAuditionPackError(f"{label} SHA-256 does not match the spec")
    result = _file_record(path)
    result["repository_relative_path"] = relative
    return path, result


def _git(repository_root: Path, *arguments: str) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(repository_root), *arguments],
            capture_output=True,
            text=True,
            check=False,
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise YoseongAuditionPackError("could not inspect repository Git state") from exc
    if result.returncode != 0:
        detail = result.stderr.strip().splitlines()
        suffix = f": {detail[-1]}" if detail else ""
        raise YoseongAuditionPackError(f"Git inspection failed{suffix}")
    return result.stdout.strip()


def validate_default_bgm_untouched(
    repository_root: Path,
    *,
    baseline_revision: str = DEFAULT_BGM_BASELINE_REVISION,
) -> Dict[str, Any]:
    """Fail if tracked, staged, or untracked default BGM bytes differ."""

    _git(repository_root, "cat-file", "-e", f"{baseline_revision}^{{commit}}")
    checks = {
        "committed_since_baseline": ("diff", "--name-only", f"{baseline_revision}..HEAD", "--"),
        "unstaged": ("diff", "--name-only", "--"),
        "staged": ("diff", "--cached", "--name-only", "--"),
        "untracked": ("ls-files", "--others", "--exclude-standard", "--"),
    }
    findings: Dict[str, List[str]] = {}
    for name, prefix in checks.items():
        output = _git(repository_root, *prefix, *DEFAULT_BGM_PATHS)
        findings[name] = [line for line in output.splitlines() if line]
    changed = sorted({path for paths in findings.values() for path in paths})
    if changed:
        raise YoseongAuditionPackError(
            "default BGM no-touch guard failed: " + ", ".join(changed)
        )
    return {
        "passed": True,
        "baseline_revision": baseline_revision,
        "head_revision": _git(repository_root, "rev-parse", "HEAD"),
        "guarded_pathspecs": list(DEFAULT_BGM_PATHS),
        "findings": findings,
    }


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
        raise YoseongAuditionPackError(f"{path.name} is not a readable PCM WAV") from exc
    if (channels, width, rate, compression) != (1, 2, EXPECTED_SAMPLE_RATE_HZ, "NONE"):
        raise YoseongAuditionPackError(
            f"{path.name} must be PCM16 mono at {EXPECTED_SAMPLE_RATE_HZ} Hz"
        )
    if len(raw) != frames * 2:
        raise YoseongAuditionPackError(f"{path.name} has a truncated PCM payload")
    samples = array.array("h")
    samples.frombytes(raw)
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples:
        raise YoseongAuditionPackError(f"{path.name} is empty")
    return samples, {
        "channels": channels,
        "bits_per_sample": 16,
        "sample_rate_hz": rate,
        "sample_count": frames,
        "duration_seconds": round(frames / rate, 9),
        "encoding": "PCM16_LE",
    }


def _rms_dbfs(samples: Sequence[int], start: int, end: int) -> float:
    if start < 0 or end > len(samples) or start >= end:
        raise YoseongAuditionPackError("shared RMS interval is outside candidate audio")
    square_sum = sum(float(samples[index]) ** 2 for index in range(start, end))
    rms = math.sqrt(square_sum / (end - start)) / 32768.0
    if rms <= 0.0:
        raise YoseongAuditionPackError("shared RMS interval is silent")
    return 20.0 * math.log10(rms)


def _audio_metrics(path: Path) -> Dict[str, Any]:
    samples, audio = _read_pcm16_mono(path)
    start = int(round(ACTIVE_START_SECONDS * EXPECTED_SAMPLE_RATE_HZ))
    end = int(round(ACTIVE_END_SECONDS * EXPECTED_SAMPLE_RATE_HZ))
    shared_rms_dbfs = _rms_dbfs(samples, start, end)
    if abs(shared_rms_dbfs - TARGET_RMS_DBFS) > RMS_TOLERANCE_DB:
        raise YoseongAuditionPackError(
            f"{path.name} shared-interval RMS is {shared_rms_dbfs:.6f} dBFS, "
            f"not {TARGET_RMS_DBFS:.1f} ± {RMS_TOLERANCE_DB:.2f} dB"
        )
    peak = max(abs(int(value)) for value in samples) / 32768.0
    whole_rms = math.sqrt(sum(float(value) ** 2 for value in samples) / len(samples)) / 32768.0
    return {
        **audio,
        "peak": round(peak, 12),
        "peak_dbfs": round(20.0 * math.log10(peak), 9) if peak else None,
        "whole_file_rms_dbfs": round(20.0 * math.log10(whole_rms), 9) if whole_rms else None,
        "shared_interval": {
            "start_seconds": ACTIVE_START_SECONDS,
            "end_seconds": ACTIVE_END_SECONDS,
            "rms_dbfs": round(shared_rms_dbfs, 9),
            "required_target_rms_dbfs": TARGET_RMS_DBFS,
            "tolerance_db": RMS_TOLERANCE_DB,
        },
    }


def _resolve_report_output(
    report_path: Path,
    report: Mapping[str, Any],
    *,
    output_key: str,
    label: str,
) -> Tuple[Path, Dict[str, Any]]:
    outputs = _mapping(report.get("outputs"), label="runtime report outputs")
    record = _mapping(outputs.get(output_key), label=f"runtime report outputs.{output_key}")
    basename = _nonempty_string(record.get("basename"), label=f"{label}.basename")
    if Path(basename).name != basename:
        raise YoseongAuditionPackError(f"{label}.basename must be a plain filename")
    expected = _sha_string(record.get("sha256"), label=f"{label}.sha256")
    path = report_path.parent / basename
    if not path.is_file() or _sha256(path) != expected:
        raise YoseongAuditionPackError(f"{label} bytes do not match the runtime report")
    result = _file_record(path)
    return path, result


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
            if set(reader.fieldnames or ()) != required:
                raise YoseongAuditionPackError("controls CSV columns do not match the runtime contract")
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
                    raise YoseongAuditionPackError("controls CSV has an invalid row") from exc
                if not all(
                    math.isfinite(row[name])
                    for name in ("time_seconds", "f0_hz", "loudness_linear", "voicing", "vibrato_cents")
                ):
                    raise YoseongAuditionPackError("controls CSV has a non-finite value")
                if row["frame_index"] != len(rows):
                    raise YoseongAuditionPackError("controls CSV frame indices are not contiguous")
                expected_time = row["frame_index"] / CONTROL_RATE_HZ
                if not math.isclose(row["time_seconds"], expected_time, abs_tol=1.0e-12):
                    raise YoseongAuditionPackError("controls CSV is not on the exact 250 Hz time grid")
                rows.append(row)
    except OSError as exc:
        raise YoseongAuditionPackError("could not read controls CSV") from exc
    if not rows:
        raise YoseongAuditionPackError("controls CSV is empty")
    nonzero = [row for row in rows if abs(row["vibrato_cents"]) > 1.0e-9]
    return {
        "rows": rows,
        "frame_count": len(rows),
        "nonzero_vibrato_frame_count": len(nonzero),
        "nonzero_vibrato_event_ids": sorted({str(row["event_id"]) for row in nonzero}),
        "maximum_absolute_vibrato_cents": max(abs(row["vibrato_cents"]) for row in rows),
    }


def _end_taper_gate(controls: Mapping[str, Any], event_ids: Sequence[str]) -> Dict[str, Any]:
    """Require each audible yoseong event to end on its nominal-pitch row."""

    records: List[Dict[str, Any]] = []
    rows = controls["rows"]
    for event_id in event_ids:
        event_rows = [row for row in rows if row["event_id"] == event_id]
        if not event_rows or not any(abs(row["vibrato_cents"]) > 1.0e-9 for row in event_rows):
            raise YoseongAuditionPackError(f"{event_id} has no audible yoseong controls")
        final_cents = float(event_rows[-1]["vibrato_cents"])
        if abs(final_cents) > 1.0e-6:
            raise YoseongAuditionPackError(
                f"{event_id} does not finish its yoseong depth at nominal pitch"
            )
        records.append({
            "event_id": event_id,
            "final_control_vibrato_cents": final_cents,
            "final_nominal_pitch_gate_passed": True,
        })
    return {
        "passed": True,
        "requirement": "every explicitly selected yoseong event finishes on a zero-cent final control row",
        "events": records,
    }


def _require_release_fix(report: Mapping[str, Any]) -> Mapping[str, Any]:
    controls = _mapping(report.get("score_controls"), label="runtime report score_controls")
    qa = _mapping(controls.get("release_vibrato_qa"), label="score_controls.release_vibrato_qa")
    policy = _mapping(qa.get("policy"), label="release_vibrato_qa.policy")
    if qa.get("passed") is not True or qa.get("final_nominal_pitch_gate_passed") is not True:
        raise YoseongAuditionPackError("fixed release vibrato QA did not pass")
    if policy.get("phase_continuity") != RELEASE_PHASE_POLICY:
        raise YoseongAuditionPackError("release vibrato phase-continuity policy is not the fixed contract")
    if policy.get("depth_envelope") != RELEASE_DEPTH_POLICY:
        raise YoseongAuditionPackError("release vibrato depth-envelope policy is not the fixed contract")
    return qa


def _score_skeleton(report: Mapping[str, Any]) -> List[Dict[str, Any]]:
    score_plan = _mapping(report.get("score_plan"), label="runtime report score_plan")
    events = _list(score_plan.get("events"), label="runtime report score_plan.events")
    skeleton: List[Dict[str, Any]] = []
    for index, raw in enumerate(events):
        event = _mapping(raw, label=f"score_plan.events[{index}]")
        skeleton.append({
            "start_seconds": event.get("start_seconds"),
            "end_seconds": event.get("end_seconds"),
            "pitch_hz": event.get("pitch_hz"),
            "articulation": event.get("articulation"),
            "steady_loudness_db": event.get("steady_loudness_db"),
        })
    return skeleton


def _shared_control_signature(controls: Mapping[str, Any]) -> List[Tuple[Any, ...]]:
    return [
        (
            row["frame_index"],
            row["time_seconds"],
            row["loudness_linear"],
            row["voicing"],
            row["articulation"],
        )
        for row in controls["rows"]
    ]


def _fired_rule_ids(policy: Mapping[str, Any]) -> List[str]:
    records = _list(policy.get("fired_policy_rules"), label="policy manifest fired_policy_rules")
    result: List[str] = []
    for index, value in enumerate(records):
        if isinstance(value, str):
            result.append(_nonempty_string(value, label=f"fired_policy_rules[{index}]"))
        elif isinstance(value, Mapping):
            candidate = value.get("policy_rule_id", value.get("rule_id", value.get("id")))
            result.append(_nonempty_string(candidate, label=f"fired_policy_rules[{index}].rule_id"))
        else:
            raise YoseongAuditionPackError("fired_policy_rules entries must be strings or objects")
    return sorted(set(result))


def _validate_policy_manifest(
    policy_path: Path,
    *,
    expected_rule_ids: Sequence[Any],
    expected_event_ids: Sequence[str],
) -> Dict[str, Any]:
    policy = _load_json(policy_path, label="B1 policy manifest")
    expression_policy = _mapping(
        policy.get("expression_policy"), label="policy manifest expression_policy"
    )
    if expression_policy.get("automatic_activation") is not False:
        raise YoseongAuditionPackError("B1 research policy must remain automatic_activation=false")
    if expression_policy.get("default_decision") != "off":
        raise YoseongAuditionPackError("B1 research policy default decision must remain off")
    evidence_status = _nonempty_string(
        expression_policy.get("evidence_status"), label="B1 policy evidence_status"
    )
    if "provisional" not in evidence_status:
        raise YoseongAuditionPackError("B1 policy must explicitly preserve its provisional evidence limit")
    selection = _mapping(
        expression_policy.get("active_selection_provenance"),
        label="B1 policy active_selection_provenance",
    )
    if selection.get("status") != "explicit_rnd_audition_opt_in":
        raise YoseongAuditionPackError("B1 policy lacks explicit R&D audition opt-in provenance")
    selected_event_ids = sorted(
        _nonempty_string(value, label="B1 selected event id")
        for value in _list(selection.get("selected_event_ids"), label="B1 selected_event_ids")
    )
    if selected_event_ids != sorted(expected_event_ids):
        raise YoseongAuditionPackError("B1 policy selection does not match audible control event ids")
    fired = _fired_rule_ids(policy)
    expected = sorted(
        {_nonempty_string(value, label="B1 expected_policy_rule_ids entry") for value in expected_rule_ids}
    )
    if not expected:
        raise YoseongAuditionPackError("B1 must declare at least one expected research-rule id")
    missing = sorted(set(expected) - set(fired))
    if missing:
        raise YoseongAuditionPackError("B1 policy manifest did not fire expected rules: " + ", ".join(missing))
    fired_records = _list(policy.get("fired_policy_rules"), label="policy manifest fired_policy_rules")
    selected_records = [
        record
        for record in fired_records
        if isinstance(record, Mapping) and record.get("decision") == "selected"
    ]
    selected_record_events = sorted(str(record.get("event_id")) for record in selected_records)
    selected_record_rules = sorted(str(record.get("policy_rule_id")) for record in selected_records)
    if selected_record_events != sorted(expected_event_ids) or selected_record_rules != expected:
        raise YoseongAuditionPackError("B1 selected fired-policy record does not match the explicit spec")
    return {
        "fired_policy_rule_ids": fired,
        "expected_policy_rule_ids": expected,
        "selected_event_ids": selected_event_ids,
        "automatic_activation": False,
        "default_decision": "off",
        "evidence_status": evidence_status,
    }


def _validate_reference_provenance(
    provenance_path: Path,
    curve_record: Mapping[str, Any],
) -> Dict[str, Any]:
    provenance = _load_json(provenance_path, label="B2 reference provenance")
    if provenance.get("schema") != REFERENCE_SCHEMA or provenance.get("status") != "verified":
        raise YoseongAuditionPackError("B2 reference provenance is not a verified supported record")
    if provenance.get("placeholder_or_hand_authored_proxy") is not False:
        raise YoseongAuditionPackError("B2 cannot use a placeholder or hand-authored proxy")
    kind = provenance.get("derivation_kind")
    if kind not in {"reference_extracted_f0_curve", "learned_expression_model_output"}:
        raise YoseongAuditionPackError("B2 derivation_kind is unsupported")
    sources = _list(provenance.get("source_records"), label="B2 reference provenance source_records")
    if not sources:
        raise YoseongAuditionPackError("B2 needs at least one fingerprinted source record")
    for index, raw in enumerate(sources):
        source = _mapping(raw, label=f"B2 source_records[{index}]")
        _nonempty_string(source.get("source_id"), label=f"B2 source_records[{index}].source_id")
        _sha_string(source.get("sha256"), label=f"B2 source_records[{index}].sha256")
        if not isinstance(source.get("byte_length"), int) or source["byte_length"] <= 0:
            raise YoseongAuditionPackError(f"B2 source_records[{index}].byte_length must be positive")
    rights = _mapping(provenance.get("rights_scope"), label="B2 reference provenance rights_scope")
    if rights.get("r_and_d_use_reviewed") is not True:
        raise YoseongAuditionPackError("B2 reference evidence lacks reviewed R&D-use scope")
    recorded_curve = _mapping(provenance.get("curve_artifact"), label="B2 provenance curve_artifact")
    recorded_curve_sha = _sha_string(
        recorded_curve.get("sha256"), label="B2 provenance curve_artifact.sha256"
    )
    if recorded_curve_sha != curve_record["sha256"]:
        raise YoseongAuditionPackError("B2 provenance does not identify the supplied curve bytes")
    return {
        "derivation_kind": kind,
        "placeholder_or_hand_authored_proxy": False,
        "source_record_count": len(sources),
        "r_and_d_use_reviewed": True,
    }


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
    report = _load_json(report_path, label=f"{slot} runtime report")
    if report.get("schema") != RUNTIME_SCHEMA or report.get("status") != "succeeded":
        raise YoseongAuditionPackError(f"{slot} runtime report did not succeed under the supported schema")
    scope = _mapping(report.get("scope"), label=f"{slot} runtime report scope")
    actions = _mapping(report.get("actions_performed"), label=f"{slot} runtime report actions")
    required_true = {
        "scope.r_and_d_only": scope.get("r_and_d_only"),
        "scope.no_default_bgm_changed": scope.get("no_default_bgm_changed"),
        "scope.not_a_game_asset": scope.get("not_a_game_asset"),
        "actions.default_bgm_changed is false": actions.get("default_bgm_changed") is False,
        "actions.experimental_hard_f0_step": actions.get("experimental_hard_f0_step"),
        "actions.learned_reverb_called": actions.get("learned_reverb_called"),
    }
    failed = [label for label, value in required_true.items() if value is not True]
    if failed:
        raise YoseongAuditionPackError(f"{slot} runtime scope/actions failed: " + ", ".join(failed))
    controls_summary = _mapping(report.get("score_controls"), label=f"{slot} score_controls")
    slur_policy = _mapping(
        controls_summary.get("slur_transition_policy"), label=f"{slot} slur_transition_policy"
    )
    if slur_policy.get("pitch_mode") != HARD_STEP_MODE:
        raise YoseongAuditionPackError(f"{slot} is not the hard-step pitch candidate")
    release_qa = _require_release_fix(report)
    render = _mapping(report.get("render"), label=f"{slot} render")
    renderer_runtime = _mapping(render.get("runtime"), label=f"{slot} render.runtime")
    if not isinstance(renderer_runtime.get("seed"), int):
        raise YoseongAuditionPackError(f"{slot} renderer seed is missing")
    score_plan = _mapping(report.get("score_plan"), label=f"{slot} score_plan")
    plan_record = _mapping(score_plan.get("plan"), label=f"{slot} score_plan.plan")
    if _sha_string(plan_record.get("sha256"), label=f"{slot} report plan SHA-256") != plan_source["sha256"]:
        raise YoseongAuditionPackError(f"{slot} plan artifact does not match the runtime report")

    controls_path, controls_source = _resolve_report_output(
        report_path, report, output_key="controls_csv", label=f"{slot} controls CSV"
    )
    audio_path, audio_source = _resolve_report_output(
        report_path,
        report,
        output_key="checkpoint_native_reverb_score_length_wav",
        label=f"{slot} wet audition WAV",
    )
    controls = _load_controls(controls_path)
    if controls_summary.get("renderer_control_hz") != CONTROL_RATE_HZ:
        raise YoseongAuditionPackError(f"{slot} report does not declare 250 Hz renderer controls")
    if controls_summary.get("frame_count") != controls["frame_count"]:
        raise YoseongAuditionPackError(f"{slot} controls CSV length differs from its runtime report")
    expected_event_ids = sorted(
        {
            _nonempty_string(value, label=f"{slot}.expected_yoseong_event_ids entry")
            for value in _list(
                candidate.get("expected_yoseong_event_ids"),
                label=f"{slot}.expected_yoseong_event_ids",
            )
        }
    )
    actual_event_ids = controls["nonzero_vibrato_event_ids"]
    if slot == "B0":
        if expected_event_ids or controls["nonzero_vibrato_frame_count"] != 0:
            raise YoseongAuditionPackError("B0 must contain no explicit/nonzero yoseong controls")
        end_taper_qa = {"passed": True, "events": [], "not_applicable_no_yoseong": True}
    else:
        if not expected_event_ids or actual_event_ids != expected_event_ids:
            raise YoseongAuditionPackError(
                f"{slot} audible yoseong event ids do not equal the explicit selection"
            )
        end_taper_qa = _end_taper_gate(controls, expected_event_ids)

    reverb = _mapping(
        report.get("checkpoint_native_reverb_audition"), label=f"{slot} checkpoint-native reverb"
    )
    level = _mapping(reverb.get("level_match"), label=f"{slot} reverb level_match")
    if (
        level.get("target_shared_interval_rms_dbfs") != TARGET_RMS_DBFS
        or level.get("shared_interval_start_seconds") != ACTIVE_START_SECONDS
        or level.get("shared_interval_end_seconds") != ACTIVE_END_SECONDS
        or level.get("compression_or_limiter") is not False
        or level.get("clipping_limited") is not False
    ):
        raise YoseongAuditionPackError(f"{slot} does not use the fixed shared monitoring operation")
    metrics = _audio_metrics(audio_path)
    if metrics["sample_count"] != controls["frame_count"] * (EXPECTED_SAMPLE_RATE_HZ // CONTROL_RATE_HZ):
        raise YoseongAuditionPackError(f"{slot} audio/control durations do not match")
    audio_source["repository_relative_path"] = audio_path.relative_to(repository_root).as_posix()
    controls_source["repository_relative_path"] = controls_path.relative_to(repository_root).as_posix()
    return {
        "slot": slot,
        "role": candidate["role"],
        "report": report,
        "report_path": report_path,
        "plan_path": plan_path,
        "controls_path": controls_path,
        "audio_path": audio_path,
        "report_source": report_source,
        "plan_source": plan_source,
        "controls_source": controls_source,
        "audio_source": audio_source,
        "audio_metrics": metrics,
        "controls": controls,
        "release_qa": dict(release_qa),
        "yoseong_end_taper_qa": end_taper_qa,
        "score_skeleton": _score_skeleton(report),
        "checkpoint_signature": report.get("checkpoint"),
        "public_sources_signature": report.get("public_sources"),
        "renderer_signature": {
            "seed": renderer_runtime.get("seed"),
            "device": renderer_runtime.get("device"),
            "torch": renderer_runtime.get("torch"),
        },
        "reverb_signature": {
            "kind": reverb.get("kind"),
            "source": _mapping(reverb.get("runtime"), label=f"{slot} reverb runtime").get("source"),
            "target_rms_dbfs": level.get("target_shared_interval_rms_dbfs"),
            "interval": [
                level.get("shared_interval_start_seconds"),
                level.get("shared_interval_end_seconds"),
            ],
        },
        "expected_yoseong_event_ids": expected_event_ids,
    }


def _compare_ready_candidates(ready: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    if len(ready) < 2:
        raise YoseongAuditionPackError("at least B0 and B1 must be ready")
    baseline = ready[0]
    for candidate in ready[1:]:
        slot = candidate["slot"]
        for label in (
            "score_skeleton",
            "checkpoint_signature",
            "public_sources_signature",
            "renderer_signature",
            "reverb_signature",
        ):
            if candidate[label] != baseline[label]:
                raise YoseongAuditionPackError(f"{slot} does not share B0 {label}")
        if _shared_control_signature(candidate["controls"]) != _shared_control_signature(baseline["controls"]):
            raise YoseongAuditionPackError(f"{slot} changes loudness, voicing, timing, or articulation versus B0")
        if candidate["audio_metrics"]["sample_count"] != baseline["audio_metrics"]["sample_count"]:
            raise YoseongAuditionPackError(f"{slot} audio length differs from B0")
    return {
        "passed": True,
        "same_score_except_expression": True,
        "same_loudness_voicing_timing_and_articulation_controls": True,
        "same_checkpoint_and_public_source_identity": True,
        "same_checkpoint_native_reverb_contract": True,
        "same_shared_interval_rms_target_dbfs": TARGET_RMS_DBFS,
        "audio_bytes_are_copied_without_post_pack_transform": True,
    }


def _copy_verified(source: Path, destination: Path, expected_sha256: str) -> Dict[str, Any]:
    shutil.copyfile(source, destination)
    if _sha256(source) != expected_sha256 or _sha256(destination) != expected_sha256:
        raise YoseongAuditionPackError("artifact bytes changed during pack assembly")
    return _file_record(destination)


def _readme(blocked_b2: bool) -> str:
    b2 = (
        "B2 is intentionally BLOCKED: see `B2_BLOCKED.json`. No proxy audio was generated."
        if blocked_b2
        else "B2 contains verified reference-derived or learned expression evidence."
    )
    return (
        "# B0/B1/B2 Daegeum yoseong audition pack\n\n"
        "These are R&D-only, score-length, checkpoint-native-reverb WAVs. "
        "They use the same score skeleton, hard-step pitch-transition mode, loudness/voicing controls, "
        "checkpoint, reverb contract, and `[0.00, 6.48)` -24 dBFS monitoring target. "
        "The packer copied verified source bytes and applied no audio transform.\n\n"
        "- B0: hard step, no explicit yoseong, fixed release.\n"
        "- B1: hard step, explicitly selected research-rule yoseong, fixed release.\n"
        f"- {b2}\n\n"
        "Inspect `yoseong_audition_manifest.json` before drawing conclusions. "
        "These files are not cleared game assets.\n"
    )


def build_yoseong_audition_pack(
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
        raise YoseongAuditionPackError("repository root is not a directory")
    try:
        spec_relative = spec_path.relative_to(repository_root).as_posix()
        output_relative = output_dir.relative_to(repository_root).as_posix()
    except ValueError as exc:
        raise YoseongAuditionPackError("spec and output must be inside the repository") from exc
    if not output_relative.startswith("_bgm_rnd/"):
        raise YoseongAuditionPackError("output must be a direct or nested child of ignored _bgm_rnd/")
    if output_dir.exists():
        raise YoseongAuditionPackError("output directory must be fresh")
    if not output_dir.parent.is_dir():
        raise YoseongAuditionPackError("output parent directory must already exist")

    spec = _load_json(spec_path, label="audition spec")
    if spec.get("schema") != SPEC_SCHEMA:
        raise YoseongAuditionPackError("unsupported audition spec schema")
    guard = validate_default_bgm_untouched(repository_root, baseline_revision=baseline_revision)
    candidates = _mapping(spec.get("candidates"), label="audition spec candidates")
    if set(candidates) != set(ROLES):
        raise YoseongAuditionPackError("audition spec must contain exactly B0, B1, and B2")

    ready: List[Dict[str, Any]] = []
    blocked_b2: Optional[Dict[str, Any]] = None
    for slot in ("B0", "B1", "B2"):
        candidate = _mapping(candidates[slot], label=f"candidates.{slot}")
        if candidate.get("role") != ROLES[slot]:
            raise YoseongAuditionPackError(f"{slot} role does not match the fixed comparison contract")
        status = candidate.get("status")
        if slot in {"B0", "B1"} and status != "ready":
            raise YoseongAuditionPackError(f"{slot} must be ready to build a listening pack")
        if slot == "B2" and status == "blocked":
            reason = _nonempty_string(candidate.get("reason"), label="B2 blocked reason")
            unmet = [
                _nonempty_string(value, label="B2 unmet requirement")
                for value in _list(candidate.get("unmet_requirements"), label="B2 unmet_requirements")
            ]
            if not unmet:
                raise YoseongAuditionPackError("blocked B2 must list unmet requirements")
            blocked_b2 = {
                "slot": "B2",
                "status": "BLOCKED",
                "role": ROLES["B2"],
                "reason": reason,
                "unmet_requirements": unmet,
                "no_placeholder_audio_generated": True,
            }
            continue
        if status != "ready":
            raise YoseongAuditionPackError(f"{slot}.status must be ready or, for B2 only, blocked")
        runtime = _runtime_candidate(repository_root, slot, candidate)
        if slot == "B1":
            policy_path, policy_source = _validated_artifact(
                repository_root, candidate.get("policy_manifest"), label="B1.policy_manifest"
            )
            policy_qa = _validate_policy_manifest(
                policy_path,
                expected_rule_ids=_list(
                    candidate.get("expected_policy_rule_ids"), label="B1.expected_policy_rule_ids"
                ),
                expected_event_ids=runtime["expected_yoseong_event_ids"],
            )
            runtime.update(
                policy_path=policy_path,
                policy_source=policy_source,
                policy_qa=policy_qa,
            )
        if slot == "B2":
            provenance_path, provenance_source = _validated_artifact(
                repository_root,
                candidate.get("reference_provenance"),
                label="B2.reference_provenance",
            )
            curve_path, curve_source = _validated_artifact(
                repository_root, candidate.get("reference_curve"), label="B2.reference_curve"
            )
            reference_qa = _validate_reference_provenance(provenance_path, curve_source)
            runtime.update(
                reference_provenance_path=provenance_path,
                reference_provenance_source=provenance_source,
                reference_curve_path=curve_path,
                reference_curve_source=curve_source,
                reference_qa=reference_qa,
            )
        ready.append(runtime)

    fairness = _compare_ready_candidates(ready)
    source_hashes_before = {
        path: _sha256(path)
        for candidate in ready
        for path in (
            candidate["report_path"],
            candidate["plan_path"],
            candidate["controls_path"],
            candidate["audio_path"],
        )
    }
    spec_sha = _sha256(spec_path)
    manifest_candidates: Dict[str, Any] = {}
    with tempfile.TemporaryDirectory(prefix=".yoseong-pack-", dir=str(output_dir.parent)) as temporary:
        staging = Path(temporary)
        provenance_dir = staging / "provenance"
        provenance_dir.mkdir()
        _copy_verified(spec_path, staging / SPEC_SNAPSHOT_FILENAME, spec_sha)
        for candidate in ready:
            slot = candidate["slot"]
            output_audio = staging / OUTPUT_AUDIO_NAMES[slot]
            output_audio_record = _copy_verified(
                candidate["audio_path"], output_audio, candidate["audio_source"]["sha256"]
            )
            output_report_record = _copy_verified(
                candidate["report_path"],
                provenance_dir / f"{slot}_runtime_report.json",
                candidate["report_source"]["sha256"],
            )
            output_plan_record = _copy_verified(
                candidate["plan_path"],
                provenance_dir / f"{slot}_score_plan.json",
                candidate["plan_source"]["sha256"],
            )
            output_controls_record = _copy_verified(
                candidate["controls_path"],
                provenance_dir / f"{slot}_score_controls_250hz.csv",
                candidate["controls_source"]["sha256"],
            )
            entry: Dict[str, Any] = {
                "status": "ready",
                "role": candidate["role"],
                "audio": {
                    "filename": output_audio.name,
                    **output_audio_record,
                    "metrics": candidate["audio_metrics"],
                    "copied_without_audio_transform": True,
                },
                "controls": {
                    "filename": f"provenance/{slot}_score_controls_250hz.csv",
                    **output_controls_record,
                    "frame_count": candidate["controls"]["frame_count"],
                    "nonzero_vibrato_frame_count": candidate["controls"]["nonzero_vibrato_frame_count"],
                    "nonzero_vibrato_event_ids": candidate["controls"]["nonzero_vibrato_event_ids"],
                    "maximum_absolute_vibrato_cents": round(
                        candidate["controls"]["maximum_absolute_vibrato_cents"], 9
                    ),
                },
                "source_provenance": {
                    "runtime_report": candidate["report_source"],
                    "score_plan": candidate["plan_source"],
                    "controls_csv": candidate["controls_source"],
                    "wet_audition_wav": candidate["audio_source"],
                },
                "packaged_provenance": {
                    "runtime_report": {
                        "filename": f"provenance/{slot}_runtime_report.json",
                        **output_report_record,
                    },
                    "score_plan": {
                        "filename": f"provenance/{slot}_score_plan.json",
                        **output_plan_record,
                    },
                },
                "fixed_release_qa": candidate["release_qa"],
                "selected_yoseong_end_taper_qa": candidate["yoseong_end_taper_qa"],
            }
            if slot == "B1":
                policy_destination = provenance_dir / "B1_research_policy_manifest.json"
                policy_record = _copy_verified(
                    candidate["policy_path"], policy_destination, candidate["policy_source"]["sha256"]
                )
                entry["research_policy"] = {
                    "filename": "provenance/B1_research_policy_manifest.json",
                    **policy_record,
                    **candidate["policy_qa"],
                }
            if slot == "B2":
                provenance_destination = provenance_dir / "B2_reference_provenance.json"
                curve_suffix = candidate["reference_curve_path"].suffix or ".bin"
                curve_destination = provenance_dir / f"B2_reference_curve{curve_suffix}"
                provenance_record = _copy_verified(
                    candidate["reference_provenance_path"],
                    provenance_destination,
                    candidate["reference_provenance_source"]["sha256"],
                )
                curve_record = _copy_verified(
                    candidate["reference_curve_path"],
                    curve_destination,
                    candidate["reference_curve_source"]["sha256"],
                )
                entry["reference_derivation"] = {
                    **candidate["reference_qa"],
                    "provenance": {
                        "filename": "provenance/B2_reference_provenance.json",
                        **provenance_record,
                    },
                    "curve": {
                        "filename": f"provenance/{curve_destination.name}",
                        **curve_record,
                    },
                }
            manifest_candidates[slot] = entry
        if blocked_b2 is not None:
            _write_json(staging / "B2_BLOCKED.json", blocked_b2)
            manifest_candidates["B2"] = {
                **blocked_b2,
                "blocker_record_filename": "B2_BLOCKED.json",
            }

        # Re-run the repository guard immediately before publishing the
        # staged directory, closing the window in which an unrelated process
        # could have touched default BGM bytes after the initial validation.
        guard = validate_default_bgm_untouched(
            repository_root, baseline_revision=baseline_revision
        )

        manifest: Dict[str, Any] = {
            "schema": MANIFEST_SCHEMA,
            "status": "succeeded_with_blocked_B2" if blocked_b2 else "succeeded",
            "scope": {
                "r_and_d_only": True,
                "not_game_assets": True,
                "default_bgm_no_touch_guard": guard,
                "no_audio_generated_or_transformed_by_packer": True,
            },
            "spec": {
                "repository_relative_path": spec_relative,
                "sha256": spec_sha,
                "snapshot_filename": SPEC_SNAPSHOT_FILENAME,
            },
            "comparison_contract": fairness,
            "candidates": manifest_candidates,
            "interpretation_limits": {
                "B0_is_a_no_explicit_yoseong_baseline_not_a_performance_truth": True,
                "B1_is_an_explicit_research_rule_candidate_not_a_learned_performance": True,
                "B2_is_never_filled_with_synthetic_placeholder_audio": True,
                "checkpoint_weights_are_not_established_as_game_distribution_cleared": True,
            },
        }
        _write_json(staging / MANIFEST_FILENAME, manifest)
        (staging / "README.md").write_text(_readme(blocked_b2 is not None), encoding="utf-8")
        if any(_sha256(path) != digest for path, digest in source_hashes_before.items()):
            raise YoseongAuditionPackError("a source artifact changed during pack assembly")
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
        manifest = build_yoseong_audition_pack(
            args.repository_root,
            args.spec,
            args.output_dir,
        )
    except YoseongAuditionPackError as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "status": manifest["status"],
        "manifest": str(args.output_dir / MANIFEST_FILENAME),
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
