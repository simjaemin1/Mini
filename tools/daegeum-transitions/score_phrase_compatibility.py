#!/usr/bin/env python3
"""Measure score-control compatibility against unreviewed source-led spans.

This offline R&D utility compares one explicit Daegeum score-expression plan
with every selected row in a source-led phrase-pool report.  It reads the
plan's already-authored control curve and the existing feature-cache proxies
for each source span; it never opens a WAV.

The comparison is intentionally narrow and conservative:

* one *global* pitch offset is measured per candidate from all valid control
  frames (never one offset per event or note),
* one uniform time ratio is measured from the two declared durations (never a
  local warp), and
* each mapped score-control frame is compared to its nearest existing feature
  row without filling, smoothing, or interpolating a missing source proxy.

Neither measurement is applied to source audio, score controls, or an asset.
Numeric proximity does not establish a natural phrase, breath, slur, legato,
performance gesture, quality judgment, approval, training item, or game asset.
Every result remains unreviewed and cannot approve a source-led phrase or
authorial slur.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
import sys
from typing import Any, Mapping, Sequence


HERE = Path(__file__).resolve().parent
SCORE_EXPRESSION_DIR = HERE.parent / "score-expression"
for module_dir in (HERE, SCORE_EXPRESSION_DIR):
    if str(module_dir) not in sys.path:
        sys.path.insert(0, str(module_dir))

from compile_expression import ScoreExpressionError, compile_plan  # noqa: E402
from source_led_contour import (  # noqa: E402
    PHRASE_POOL_SCHEMA_PREFIX,
    RND06_SCHEMA,
    SourceLedContourError,
    _load_catalog,
    _load_feature_track,
    _require_numpy,
    _selected_feature_range,
    _sha256,
    _validate_selected_span,
)


SCORE_PHRASE_COMPATIBILITY_SCHEMA = f"{RND06_SCHEMA}.score-phrase-compatibility.v1"
REPORT_FILENAME = "score_phrase_compatibility.json"
TSV_FILENAME = "score_phrase_compatibility.tsv"

# These are deliberately visible measurement gates, not a style/quality model.
DEFAULT_MIN_SOURCE_VOICING_CONFIDENCE = 0.50
DEFAULT_MIN_TIME_RATIO = 0.80
DEFAULT_MAX_TIME_RATIO = 1.25
DEFAULT_MAX_PITCH_RMSE_CENTS = 120.0
DEFAULT_MAX_P95_ABSOLUTE_PITCH_ERROR_CENTS = 220.0
DEFAULT_MAX_INTERVAL_ERROR_CENTS = 180.0
DEFAULT_MIN_VALID_CONTROL_COVERAGE = 0.98
DEFAULT_MAXIMUM_TIME_GAP_FACTOR = 1.5


class ScorePhraseCompatibilityError(RuntimeError):
    """An input cannot support a conservative compatibility measurement."""


def _json_load(path: Path, *, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ScorePhraseCompatibilityError(f"missing {label}: {path.name}") from exc
    except json.JSONDecodeError as exc:
        raise ScorePhraseCompatibilityError(f"{label} is not valid JSON") from exc


def _json_dump(path: Path, value: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _round(value: float) -> float:
    return round(float(value), 6)


def _finite(value: Any, *, label: str, minimum: float | None = None) -> float:
    if isinstance(value, bool):
        raise ScorePhraseCompatibilityError(f"{label} must be a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ScorePhraseCompatibilityError(f"{label} must be a finite number") from exc
    if not math.isfinite(number):
        raise ScorePhraseCompatibilityError(f"{label} must be a finite number")
    if minimum is not None and number < minimum:
        raise ScorePhraseCompatibilityError(f"{label} is below its permitted range")
    return number


def _safe_identifier(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ScorePhraseCompatibilityError(f"{label} must be a non-empty string")
    return value


def _phrase_pool(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    value = _json_load(path, label="phrase-pool report")
    if not isinstance(value, Mapping):
        raise ScorePhraseCompatibilityError("phrase-pool report must be an object")
    schema = value.get("schema")
    if not isinstance(schema, str) or not schema.startswith(PHRASE_POOL_SCHEMA_PREFIX):
        raise ScorePhraseCompatibilityError("phrase-pool report does not have the source-led phrase-pool schema")
    rows = value.get("candidates")
    if not isinstance(rows, list) or not rows:
        raise ScorePhraseCompatibilityError("phrase-pool report has no candidates")
    if len(rows) > 512:
        raise ScorePhraseCompatibilityError("phrase-pool report exceeds the conservative R&D candidate limit")
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for ordinal, raw in enumerate(rows, 1):
        if not isinstance(raw, Mapping):
            raise ScorePhraseCompatibilityError(f"phrase-pool candidates[{ordinal}] must be an object")
        row = dict(raw)
        identifier = _safe_identifier(row.get("candidate_id"), label=f"phrase-pool candidates[{ordinal}].candidate_id")
        if identifier in seen:
            raise ScorePhraseCompatibilityError("phrase-pool report repeats a candidate_id")
        seen.add(identifier)
        candidates.append(row)
    return dict(value), candidates


def _declared_catalog_sha256(pool: Mapping[str, Any]) -> str:
    input_value = pool.get("input")
    bundle = input_value.get("bundle") if isinstance(input_value, Mapping) else None
    digest = bundle.get("source_catalog_sha256") if isinstance(bundle, Mapping) else None
    if not isinstance(digest, str) or len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
        raise ScorePhraseCompatibilityError("phrase-pool report lacks a lowercase source catalog SHA-256")
    return digest


def _nearest_feature_indices(source_times: Any, target_times: Any, *, np: Any) -> Any:
    """Choose existing cached rows only; this is not feature interpolation."""

    right = np.searchsorted(source_times, target_times, side="left")
    right = np.clip(right, 0, len(source_times) - 1)
    left = np.clip(right - 1, 0, len(source_times) - 1)
    choose_left = np.abs(target_times - source_times[left]) <= np.abs(source_times[right] - target_times)
    return np.where(choose_left, left, right).astype(np.int64, copy=False)


def _midi_from_hz(f0_hz: Any, *, np: Any) -> Any:
    result = np.full(f0_hz.shape, np.nan, dtype=np.float64)
    valid = np.isfinite(f0_hz) & (f0_hz > 0.0)
    result[valid] = 69.0 + 12.0 * np.log2(f0_hz[valid] / 440.0)
    return result


def _p95_nearest(values: Any, *, np: Any) -> float:
    ordered = np.sort(values)
    index = max(0, int(math.ceil(len(ordered) * 0.95)) - 1)
    return float(ordered[index])


def _maybe_number(value: Any, *, np: Any) -> float | None:
    number = float(value)
    return _round(number) if np.isfinite(number) else None


def _boundary_measurements(
    events: Sequence[Mapping[str, Any]],
    *,
    source_times: Any,
    source_feature_start: int,
    time_ratio: float,
    track: Any,
    np: Any,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for event in events:
        event_id = _safe_identifier(event.get("id"), label="compiled score event id")
        articulation = _safe_identifier(event.get("articulation"), label=f"{event_id}.articulation")
        for boundary_kind in ("start", "end"):
            score_time = _finite(event.get(f"{boundary_kind}_seconds"), label=f"{event_id}.{boundary_kind}_seconds", minimum=0.0)
            mapped_time = float(source_times[0]) + score_time * time_ratio
            local_index = int(_nearest_feature_indices(source_times, np.asarray([mapped_time]), np=np)[0])
            feature_index = source_feature_start + local_index
            records.append({
                "event_id": event_id,
                "authorial_articulation": articulation,
                "boundary": boundary_kind,
                "score_time_seconds": _round(score_time),
                "mapped_source_time_seconds_measurement": _round(mapped_time),
                "nearest_source_feature_index": feature_index,
                "nearest_source_feature_time_seconds": _round(float(source_times[local_index])),
                "source_midi_proxy": _maybe_number(track.midi_proxy[feature_index], np=np),
                "source_voicing_confidence": _maybe_number(track.voicing_confidence[feature_index], np=np),
                "source_rms_dbfs_proxy": _maybe_number(track.rms_dbfs[feature_index], np=np),
                "source_onset_flux_proxy": _maybe_number(track.onset_flux[feature_index], np=np),
                "source_proxy_is_not_a_matching_breath_slur_legato_or_gesture_label": True,
            })
    return records


def _candidate_measurement(
    row: Mapping[str, Any],
    *,
    source: Any,
    track: Any,
    score: Mapping[str, Any],
    thresholds: Mapping[str, float],
    maximum_time_gap_factor: float,
    np: Any,
) -> dict[str, Any]:
    try:
        span = _validate_selected_span(row, source, feature_count=len(track.time_s))
        native_start, native_end = span["native_frame_range"]
        enclosing_start, enclosing_end, nominal_hop = _selected_feature_range(
            track,
            native_start=native_start,
            native_end=native_end,
            maximum_time_gap_factor=maximum_time_gap_factor,
            np=np,
        )
    except SourceLedContourError as exc:
        raise ScorePhraseCompatibilityError(str(exc)) from exc
    declared = span["declared_feature_span"]
    if declared is None:
        raise ScorePhraseCompatibilityError("phrase-pool candidate lacks its declared feature contour range")
    feature_start, feature_end = declared["feature_index_range"]
    if not (enclosing_start <= feature_start < feature_end <= enclosing_end):
        raise ScorePhraseCompatibilityError("phrase-pool feature contour range is not enclosed by its native source span")
    if feature_end - feature_start < 2:
        raise ScorePhraseCompatibilityError("phrase-pool feature contour requires at least two cached rows")
    contour_times = track.time_s[feature_start:feature_end]
    if np.any(np.diff(contour_times) > nominal_hop * maximum_time_gap_factor + 1.0e-12):
        raise ScorePhraseCompatibilityError("phrase-pool feature contour has a timeline gap")
    source_duration = float(contour_times[-1] - contour_times[0])
    score_duration = _finite(score["duration_seconds"], label="score duration", minimum=1.0e-9)
    if source_duration <= 0.0:
        raise ScorePhraseCompatibilityError("phrase-pool feature contour has no positive duration")
    time_ratio = source_duration / score_duration

    score_times = score["frame_times_seconds"].astype(np.float64, copy=False)
    score_midi = _midi_from_hz(score["f0_hz"].astype(np.float64, copy=False), np=np)
    score_voiced = np.isfinite(score_midi)
    voiced_count = int(np.count_nonzero(score_voiced))
    if voiced_count == 0:
        raise ScorePhraseCompatibilityError("compiled score plan has no voiced pitch controls")
    mapped_source_times = float(contour_times[0]) + score_times * time_ratio
    local_indices = _nearest_feature_indices(contour_times, mapped_source_times, np=np)
    feature_indices = feature_start + local_indices
    source_midi = track.midi_proxy[feature_indices].astype(np.float64, copy=False)
    source_confidence = track.voicing_confidence[feature_indices].astype(np.float64, copy=False)
    source_valid = np.isfinite(source_midi) & np.isfinite(source_confidence) & (
        source_confidence >= thresholds["min_source_voicing_confidence"]
    )
    valid = score_voiced & source_valid
    valid_count = int(np.count_nonzero(valid))
    coverage = valid_count / voiced_count
    candidate_id = _safe_identifier(row.get("candidate_id"), label="phrase-pool candidate_id")
    profile_id = _safe_identifier(row.get("profile_id"), label=f"{candidate_id}.profile_id")

    rmse_cents: float | None = None
    mae_cents: float | None = None
    p95_absolute_cents: float | None = None
    max_absolute_cents: float | None = None
    interval_error_cents: float | None = None
    pitch_span_delta_cents: float | None = None
    global_offset_semitones: float | None = None
    sort_key = 1_000_000.0
    numeric_flags: list[str] = []
    if valid_count == 0:
        numeric_flags.append("no_valid_source_proxy_rows_after_voicing_gate")
    else:
        global_offset_semitones = float(np.mean(score_midi[valid] - source_midi[valid]))
        residual_cents = (source_midi[valid] + global_offset_semitones - score_midi[valid]) * 100.0
        absolute_residual_cents = np.abs(residual_cents)
        rmse_cents = float(np.sqrt(np.mean(np.square(residual_cents))))
        mae_cents = float(np.mean(absolute_residual_cents))
        p95_absolute_cents = _p95_nearest(absolute_residual_cents, np=np)
        max_absolute_cents = float(np.max(absolute_residual_cents))
        first_valid = int(np.flatnonzero(valid)[0])
        last_valid = int(np.flatnonzero(valid)[-1])
        score_delta = float(score_midi[last_valid] - score_midi[first_valid])
        source_delta = float(source_midi[last_valid] - source_midi[first_valid])
        interval_error_cents = (source_delta - score_delta) * 100.0
        score_span = float(np.max(score_midi[valid]) - np.min(score_midi[valid]))
        source_span = float(np.max(source_midi[valid]) - np.min(source_midi[valid]))
        pitch_span_delta_cents = (source_span - score_span) * 100.0
        sort_key = (
            rmse_cents
            + 0.25 * p95_absolute_cents
            + 0.5 * abs(interval_error_cents)
            + 100.0 * abs(math.log2(time_ratio))
            + 10_000.0 * (1.0 - coverage)
        )
        if rmse_cents > thresholds["max_pitch_rmse_cents"]:
            numeric_flags.append("pitch_rmse_exceeds_measurement_gate")
        if p95_absolute_cents > thresholds["max_p95_absolute_pitch_error_cents"]:
            numeric_flags.append("pitch_p95_absolute_error_exceeds_measurement_gate")
        if abs(interval_error_cents) > thresholds["max_interval_error_cents"]:
            numeric_flags.append("endpoint_interval_error_exceeds_measurement_gate")
    if coverage < thresholds["min_valid_control_coverage"]:
        numeric_flags.append("valid_score_control_coverage_below_measurement_gate")
    if time_ratio < thresholds["min_time_ratio"] or time_ratio > thresholds["max_time_ratio"]:
        numeric_flags.append("uniform_time_ratio_outside_measurement_band")

    disposition = (
        "rejected_measurement_mismatch"
        if numeric_flags
        else "measurement_in_band_but_unreviewed_not_approved"
    )
    source_value = row.get("source")
    source_record = source_value if isinstance(source_value, Mapping) else {}
    return {
        "candidate_id": candidate_id,
        "profile_id": profile_id,
        "source": {
            "source_id": source.source_id,
            "sha256": source.sha256,
            "relative_path": source.relative_path,
            "ngc_extend_seq": source_record.get("ngc_extend_seq"),
        },
        "source_feature_contour": {
            "feature_index_range": [feature_start, feature_end],
            "feature_frame_count": feature_end - feature_start,
            "time_seconds_range": [_round(float(contour_times[0])), _round(float(contour_times[-1]))],
            "duration_seconds": _round(source_duration),
            "strictly_contiguous_cached_feature_rows_verified": True,
            "feature_cache_proxy_only_not_audio_or_human_transcription": True,
        },
        "single_global_measurements": {
            "global_pitch_offset_semitones": _round(global_offset_semitones) if global_offset_semitones is not None else None,
            "uniform_time_ratio_source_seconds_per_score_second": _round(time_ratio),
            "global_pitch_offset_measurement_not_applied": True,
            "uniform_time_ratio_measurement_not_applied": True,
            "no_per_event_pitch_offset_or_local_time_ratio": True,
            "source_proxy_sampling": "nearest existing cached feature row; no interpolation or missing-value fill",
        },
        "pitch_fit_measurements": {
            "voiced_score_control_frame_count": voiced_count,
            "valid_compared_control_frame_count": valid_count,
            "valid_control_coverage": _round(coverage),
            "pitch_rmse_cents": _round(rmse_cents) if rmse_cents is not None else None,
            "pitch_mean_absolute_error_cents": _round(mae_cents) if mae_cents is not None else None,
            "pitch_p95_absolute_error_cents_nearest_rank": _round(p95_absolute_cents) if p95_absolute_cents is not None else None,
            "pitch_max_absolute_error_cents": _round(max_absolute_cents) if max_absolute_cents is not None else None,
            "endpoint_interval_error_cents": _round(interval_error_cents) if interval_error_cents is not None else None,
            "pitch_span_delta_cents": _round(pitch_span_delta_cents) if pitch_span_delta_cents is not None else None,
        },
        "authored_control_boundary_measurements": _boundary_measurements(
            score["events"],
            source_times=contour_times,
            source_feature_start=feature_start,
            time_ratio=time_ratio,
            track=track,
            np=np,
        ),
        "measurement_sort_key_cents_equivalent_not_quality": _round(sort_key),
        "numeric_mismatch_flags": numeric_flags,
        "automated_disposition": disposition,
        "natural_phrase_or_slur_status": "not_claimed_not_approved_not_inferred",
        "required_human_review": True,
        "input_truth_labels": {
            "field": span["truth_label_field"],
            "verbatim": span["truth_labels_verbatim"],
            "preserved_as_unreviewed_input_contract": True,
        },
    }


def _tsv_cell(value: Any) -> str:
    if value is None:
        text = ""
    elif isinstance(value, float):
        text = f"{value:.6f}"
    else:
        text = str(value)
    text = text.replace("\t", " ").replace("\r", " ").replace("\n", " ")
    return "'" + text if text.startswith(("=", "+", "-", "@")) else text


def _write_tsv(path: Path, rows: Sequence[Mapping[str, Any]]) -> None:
    header = [
        "measurement_rank",
        "candidate_id",
        "profile_id",
        "source_id",
        "source_feature_duration_seconds",
        "uniform_time_ratio_source_seconds_per_score_second",
        "global_pitch_offset_semitones",
        "valid_control_coverage",
        "pitch_rmse_cents",
        "pitch_p95_absolute_error_cents_nearest_rank",
        "endpoint_interval_error_cents",
        "measurement_sort_key_cents_equivalent_not_quality",
        "automated_disposition",
        "natural_phrase_or_slur_status",
        "numeric_mismatch_flags",
    ]
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, delimiter="\t", lineterminator="\n")
        writer.writerow(header)
        for row in rows:
            source = row["source"]
            contour = row["source_feature_contour"]
            measurements = row["single_global_measurements"]
            pitch = row["pitch_fit_measurements"]
            values = [
                row["measurement_rank"],
                row["candidate_id"],
                row["profile_id"],
                source["source_id"],
                contour["duration_seconds"],
                measurements["uniform_time_ratio_source_seconds_per_score_second"],
                measurements["global_pitch_offset_semitones"],
                pitch["valid_control_coverage"],
                pitch["pitch_rmse_cents"],
                pitch["pitch_p95_absolute_error_cents_nearest_rank"],
                pitch["endpoint_interval_error_cents"],
                row["measurement_sort_key_cents_equivalent_not_quality"],
                row["automated_disposition"],
                row["natural_phrase_or_slur_status"],
                ";".join(row["numeric_mismatch_flags"]),
            ]
            writer.writerow([_tsv_cell(value) for value in values])


def build_score_phrase_compatibility(
    bundle_dir: str | Path,
    score_plan: str | Path,
    phrase_pool: str | Path,
    output_dir: str | Path,
    *,
    min_source_voicing_confidence: float = DEFAULT_MIN_SOURCE_VOICING_CONFIDENCE,
    min_time_ratio: float = DEFAULT_MIN_TIME_RATIO,
    max_time_ratio: float = DEFAULT_MAX_TIME_RATIO,
    max_pitch_rmse_cents: float = DEFAULT_MAX_PITCH_RMSE_CENTS,
    max_p95_absolute_pitch_error_cents: float = DEFAULT_MAX_P95_ABSOLUTE_PITCH_ERROR_CENTS,
    max_interval_error_cents: float = DEFAULT_MAX_INTERVAL_ERROR_CENTS,
    min_valid_control_coverage: float = DEFAULT_MIN_VALID_CONTROL_COVERAGE,
    maximum_time_gap_factor: float = DEFAULT_MAXIMUM_TIME_GAP_FACTOR,
) -> dict[str, Any]:
    """Write one fresh, path-free compatibility report; never transform audio."""

    np = _require_numpy()
    bundle = Path(bundle_dir).expanduser().resolve()
    plan_path = Path(score_plan).expanduser().resolve()
    pool_path = Path(phrase_pool).expanduser().resolve()
    output = Path(output_dir).expanduser().resolve()
    if not bundle.is_dir():
        raise ScorePhraseCompatibilityError("--bundle must name an existing feature-cache bundle")
    if not plan_path.is_file():
        raise ScorePhraseCompatibilityError("--score-plan must name an existing score-expression plan")
    if not pool_path.is_file():
        raise ScorePhraseCompatibilityError("--phrase-pool must name an existing phrase-pool report")
    if output.exists():
        raise ScorePhraseCompatibilityError("--output-dir must be fresh; refusing to overwrite an R&D report")
    thresholds = {
        "min_source_voicing_confidence": _finite(
            min_source_voicing_confidence,
            label="--min-source-voicing-confidence",
            minimum=0.0,
        ),
        "min_time_ratio": _finite(min_time_ratio, label="--min-time-ratio", minimum=1.0e-9),
        "max_time_ratio": _finite(max_time_ratio, label="--max-time-ratio", minimum=1.0e-9),
        "max_pitch_rmse_cents": _finite(max_pitch_rmse_cents, label="--max-pitch-rmse-cents", minimum=0.0),
        "max_p95_absolute_pitch_error_cents": _finite(
            max_p95_absolute_pitch_error_cents,
            label="--max-p95-absolute-pitch-error-cents",
            minimum=0.0,
        ),
        "max_interval_error_cents": _finite(
            max_interval_error_cents,
            label="--max-interval-error-cents",
            minimum=0.0,
        ),
        "min_valid_control_coverage": _finite(
            min_valid_control_coverage,
            label="--min-valid-control-coverage",
            minimum=0.0,
        ),
    }
    if thresholds["min_source_voicing_confidence"] > 1.0:
        raise ScorePhraseCompatibilityError("--min-source-voicing-confidence must not exceed one")
    if thresholds["min_valid_control_coverage"] > 1.0:
        raise ScorePhraseCompatibilityError("--min-valid-control-coverage must not exceed one")
    if thresholds["min_time_ratio"] > thresholds["max_time_ratio"]:
        raise ScorePhraseCompatibilityError("--min-time-ratio must not exceed --max-time-ratio")
    normalized_gap_factor = _finite(
        maximum_time_gap_factor,
        label="--maximum-contiguous-time-gap-factor",
        minimum=1.0,
    )
    try:
        score = compile_plan(plan_path)
    except ScoreExpressionError as exc:
        raise ScorePhraseCompatibilityError(str(exc)) from exc
    pool, candidates = _phrase_pool(pool_path)
    try:
        sources, catalog_sha256 = _load_catalog(bundle)
    except SourceLedContourError as exc:
        raise ScorePhraseCompatibilityError(str(exc)) from exc
    if _declared_catalog_sha256(pool) != catalog_sha256:
        raise ScorePhraseCompatibilityError("phrase-pool source catalog SHA-256 does not match --bundle")

    measured: list[dict[str, Any]] = []
    for row in candidates:
        source_value = row.get("source")
        if not isinstance(source_value, Mapping):
            raise ScorePhraseCompatibilityError("phrase-pool candidate has no source object")
        source_id = source_value.get("source_id")
        if not isinstance(source_id, str) or source_id not in sources:
            raise ScorePhraseCompatibilityError("phrase-pool candidate source_id is absent from source_catalog.json")
        source = sources[source_id]
        try:
            track = _load_feature_track(bundle, source, np=np)
        except SourceLedContourError as exc:
            raise ScorePhraseCompatibilityError(str(exc)) from exc
        measured.append(_candidate_measurement(
            row,
            source=source,
            track=track,
            score=score,
            thresholds=thresholds,
            maximum_time_gap_factor=normalized_gap_factor,
            np=np,
        ))
    measured.sort(key=lambda row: (row["measurement_sort_key_cents_equivalent_not_quality"], row["candidate_id"]))
    for rank, row in enumerate(measured, 1):
        row["measurement_rank"] = rank

    event_counts: dict[str, int] = {}
    for event in score["events"]:
        articulation = str(event["articulation"])
        event_counts[articulation] = event_counts.get(articulation, 0) + 1
    score_summary = {
        "plan_basename": plan_path.name,
        "plan_sha256": score["plan_sha256"],
        "instrument_id": "daegeum",
        "control_hz": int(score["control_hz"]),
        "duration_seconds": _round(float(score["duration_seconds"])),
        "control_frame_count": int(len(score["frame_times_seconds"])),
        "voiced_control_frame_count": int(np.count_nonzero(score["f0_hz"] > 0.0)),
        "event_count": len(score["events"]),
        "authored_articulation_counts": dict(sorted(event_counts.items())),
        "explicit_authorial_slur_event_ids": [
            event["id"] for event in score["events"] if event["articulation"] == "slur"
        ],
        "score_controls_are_authorial_not_source_performance_labels": True,
    }
    result: dict[str, Any] = {
        "schema": SCORE_PHRASE_COMPATIBILITY_SCHEMA,
        "artifact_kind": "unreviewed_offline_score_to_source_phrase_compatibility_measurement",
        "input": {
            "bundle_directory_basename": bundle.name,
            "source_catalog_sha256": catalog_sha256,
            "phrase_pool_basename": pool_path.name,
            "phrase_pool_sha256": _sha256(pool_path),
            "score_plan": score_summary,
        },
        "measurement_contract": {
            "one_global_pitch_offset_per_candidate_only": True,
            "one_uniform_duration_derived_time_ratio_per_candidate_only": True,
            "no_per_note_or_per_event_pitch_offset": True,
            "no_local_time_warp": True,
            "nearest_existing_feature_cache_rows_only_no_interpolation_or_missing_value_fill": True,
            "thresholds": {key: _round(value) for key, value in sorted(thresholds.items())},
            "maximum_contiguous_time_gap_factor": _round(normalized_gap_factor),
        },
        "interpretation_limits": {
            "source_audio_not_read_written_transformed_or_rendered": True,
            "score_controls_not_written_or_transformed": True,
            "global_pitch_offset_and_uniform_time_ratio_are_measurements_not_edits": True,
            "fit_rank_is_not_a_quality_or_style_judgment": True,
            "source_feature_proxies_are_not_human_transcription_or_performance_labels": True,
            "authorial_breath_rearticulation_slur_release_controls_are_not_inferred_from_source": True,
            "no_candidate_is_approved_or_called_a_natural_phrase_slur_or_legato": True,
            "all_candidates_remain_unreviewed_not_training_items_not_game_assets": True,
            "no_default_runtime_bgm_or_public_asset_is_changed": True,
        },
        "counts": {
            "phrase_pool_candidate_count": len(candidates),
            "ranked_candidate_count": len(measured),
            "numeric_measurement_mismatch_rejected_count": sum(
                row["automated_disposition"] == "rejected_measurement_mismatch" for row in measured
            ),
            "measurement_in_band_but_unreviewed_count": sum(
                row["automated_disposition"] == "measurement_in_band_but_unreviewed_not_approved" for row in measured
            ),
        },
        "ranked_candidates": measured,
    }
    output.mkdir(parents=True, exist_ok=False)
    _json_dump(output / REPORT_FILENAME, result)
    _write_tsv(output / TSV_FILENAME, measured)
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", help="existing R&D feature-cache bundle")
    parser.add_argument("--score-plan", help="explicit score-expression plan JSON")
    parser.add_argument("--phrase-pool", help="source-led phrase-pool JSON; every candidate is evaluated")
    parser.add_argument("--output-dir", help="fresh R&D-only report directory")
    parser.add_argument("--min-source-voicing-confidence", type=float, default=DEFAULT_MIN_SOURCE_VOICING_CONFIDENCE)
    parser.add_argument("--min-time-ratio", type=float, default=DEFAULT_MIN_TIME_RATIO)
    parser.add_argument("--max-time-ratio", type=float, default=DEFAULT_MAX_TIME_RATIO)
    parser.add_argument("--max-pitch-rmse-cents", type=float, default=DEFAULT_MAX_PITCH_RMSE_CENTS)
    parser.add_argument("--max-p95-absolute-pitch-error-cents", type=float, default=DEFAULT_MAX_P95_ABSOLUTE_PITCH_ERROR_CENTS)
    parser.add_argument("--max-interval-error-cents", type=float, default=DEFAULT_MAX_INTERVAL_ERROR_CENTS)
    parser.add_argument("--min-valid-control-coverage", type=float, default=DEFAULT_MIN_VALID_CONTROL_COVERAGE)
    parser.add_argument("--maximum-contiguous-time-gap-factor", type=float, default=DEFAULT_MAXIMUM_TIME_GAP_FACTOR)
    parser.add_argument("--dry-run", action="store_true", help="print the no-transform R&D contract")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.dry_run:
        print(
            "score_phrase_compatibility: would compare authored controls to existing feature-cache proxies using one "
            "global pitch offset and one uniform time ratio per candidate; it will not read WAV, transform audio or "
            "score controls, infer natural phrase/slur/legato, train, or change runtime BGM."
        )
        return 0
    missing = [name for name in ("bundle", "score_plan", "phrase_pool", "output_dir") if not getattr(args, name)]
    if missing:
        _parser().error("required unless --dry-run: " + ", ".join("--" + name.replace("_", "-") for name in missing))
    try:
        result = build_score_phrase_compatibility(
            args.bundle,
            args.score_plan,
            args.phrase_pool,
            args.output_dir,
            min_source_voicing_confidence=args.min_source_voicing_confidence,
            min_time_ratio=args.min_time_ratio,
            max_time_ratio=args.max_time_ratio,
            max_pitch_rmse_cents=args.max_pitch_rmse_cents,
            max_p95_absolute_pitch_error_cents=args.max_p95_absolute_pitch_error_cents,
            max_interval_error_cents=args.max_interval_error_cents,
            min_valid_control_coverage=args.min_valid_control_coverage,
            maximum_time_gap_factor=args.maximum_contiguous_time_gap_factor,
        )
    except ScorePhraseCompatibilityError as exc:
        print(f"score_phrase_compatibility: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "output": Path(args.output_dir).name,
        "ranked_candidate_count": result["counts"]["ranked_candidate_count"],
        "numeric_measurement_mismatch_rejected_count": result["counts"]["numeric_measurement_mismatch_rejected_count"],
        "all_candidates_remain_unreviewed": True,
        "natural_phrase_or_slur_not_claimed": True,
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
