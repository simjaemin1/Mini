#!/usr/bin/env python3
"""Build a cautious, source-led contour scaffold from one feature span.

This is an offline R&D helper for accompaniment planning.  It reads only an
existing R&D-06 feature cache (``features/*.npz``), never the source WAV.  Its
input is one selected direct-trajectory row or one selected phrase-boundary
row, both of which must identify a single catalog source and an explicit
``native_source_span.frame_range``.

The output is a time-ordered, coarse summary of the cached F0, RMS and
voicing proxies plus optional low-proxy-variation region suggestions.  It is
not an expert transcription, score annotation, breath/slur/legato label,
performance-quality judgment, training item, or game asset.  In particular,
unvoiced/invalid F0 rows remain missing: this tool never interpolates,
corrects, pitches, stretches, renders, or otherwise transforms audio.

Example, using one trajectory retrieval report row:

    /tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/source_led_contour.py \\
      --bundle _bgm_rnd/daegeum-transition-bank-ngc-YYYYMMDD \\
      --input-json _bgm_rnd/daegeum-direct-trajectory-YYYYMMDD/direct_trajectory_retrieval.json \\
      --priority-rank 1 \\
      --output-dir _bgm_rnd/source-led-contour-YYYYMMDD

For a selected phrase-boundary candidate, pass the candidate object itself to
``--input-json`` without ``--priority-rank``.  The candidate must expose the
same source identity and native frame span contract.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
import re
import sys
from typing import Any, Mapping, Sequence


RND06_SCHEMA = "durango.daegeum.transition-bank.v1"
FEATURE_SCHEMA = "durango.daegeum.expression-features.v1"
DIRECT_TRAJECTORY_SCHEMA_PREFIX = f"{RND06_SCHEMA}.direct-f0-trajectory-retrieval."
PHRASE_BOUNDARY_TRIAGE_SCHEMA_PREFIX = f"{RND06_SCHEMA}.source-led-phrase-boundary-triage."
SOURCE_LED_CONTOUR_SCHEMA = f"{RND06_SCHEMA}.source-led-contour-scaffold.v1"

REQUIRED_FEATURE_ARRAYS = (
    "native_frame_center",
    "time_s",
    "f0_hz",
    "midi_proxy",
    "voicing_confidence",
    "rms_dbfs",
    "onset_flux",
)

DEFAULT_COARSE_MAX_POINTS = 32
DEFAULT_STABLE_MIN_VOICING_CONFIDENCE = 0.70
DEFAULT_STABLE_MAX_PITCH_SPAN_CENTS = 65.0
DEFAULT_STABLE_MAX_RMS_RANGE_DB = 3.0
DEFAULT_STABLE_MIN_FEATURE_FRAMES = 12
DEFAULT_CONTIGUOUS_TIME_GAP_FACTOR = 1.5


class SourceLedContourError(RuntimeError):
    """Raised when selected provenance or feature-cache evidence is unsafe."""


@dataclass(frozen=True)
class SourceInfo:
    source_id: str
    sha256: str
    relative_path: str
    sample_rate_hz: int
    frame_count: int
    feature_npz_relative_path: str
    feature_metadata_relative_path: str


@dataclass(frozen=True)
class FeatureTrack:
    source: SourceInfo
    native_frame_center: Any
    time_s: Any
    f0_hz: Any
    midi_proxy: Any
    voicing_confidence: Any
    rms_dbfs: Any
    onset_flux: Any
    feature_hop_seconds: float
    feature_window_seconds: float
    feature_npz_sha256: str
    feature_metadata_sha256: str


def _require_numpy() -> Any:
    try:
        import numpy as np
    except ModuleNotFoundError as exc:
        raise SourceLedContourError(
            "source-led contour scaffolding requires NumPy; use the established R&D virtual environment"
        ) from exc
    return np


def _json_load(path: Path, *, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SourceLedContourError(f"missing {label}: {path.name}") from exc
    except json.JSONDecodeError as exc:
        raise SourceLedContourError(f"{label} is not valid JSON") from exc


def _json_dump(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _strict_int(value: Any, *, label: str, minimum: int | None = None) -> int:
    if type(value) is not int:
        raise SourceLedContourError(f"{label} must be an integer")
    if minimum is not None and value < minimum:
        raise SourceLedContourError(f"{label} is below its permitted range")
    return value


def _finite_float(
    value: Any,
    *,
    label: str,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise SourceLedContourError(f"{label} must be finite") from exc
    if not math.isfinite(number):
        raise SourceLedContourError(f"{label} must be finite")
    if minimum is not None and number < minimum:
        raise SourceLedContourError(f"{label} is below its permitted range")
    if maximum is not None and number > maximum:
        raise SourceLedContourError(f"{label} exceeds its permitted range")
    return number


def _round(value: float) -> float:
    return round(float(value), 6)


def _safe_relative(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value:
        raise SourceLedContourError(f"{label} must be a non-empty POSIX relative path")
    parsed = PurePosixPath(value)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise SourceLedContourError(f"{label} is not a safe relative path")
    return parsed.as_posix()


def _safe_source_id(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value):
        raise SourceLedContourError(f"{label} must be a safe source identifier")
    return value


def _bundle_child(bundle: Path, relative: str, *, label: str) -> Path:
    child = (bundle / PurePosixPath(relative)).resolve()
    try:
        child.relative_to(bundle)
    except ValueError as exc:
        raise SourceLedContourError(f"{label} escapes --bundle") from exc
    return child


def _load_catalog(bundle: Path) -> tuple[dict[str, SourceInfo], str]:
    catalog_path = bundle / "source_catalog.json"
    value = _json_load(catalog_path, label="source_catalog.json")
    if not isinstance(value, Mapping) or value.get("schema") != f"{RND06_SCHEMA}.source-catalog.v1":
        raise SourceLedContourError("source_catalog.json does not have the R&D-06 source catalog schema")
    rows = value.get("files")
    if not isinstance(rows, list) or not rows:
        raise SourceLedContourError("source_catalog.json has no source records")
    sources: dict[str, SourceInfo] = {}
    for ordinal, row in enumerate(rows, 1):
        if not isinstance(row, Mapping):
            raise SourceLedContourError(f"source_catalog.json.files[{ordinal}] is not an object")
        source_id = _safe_source_id(row.get("source_id"), label=f"catalog source {ordinal}.source_id")
        if source_id in sources:
            raise SourceLedContourError("source_catalog.json repeats a source_id")
        digest = row.get("sha256")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise SourceLedContourError(f"catalog source {source_id} has no lowercase SHA-256 identity")
        relative = _safe_relative(row.get("relative_path"), label=f"catalog source {source_id}.relative_path")
        native = row.get("native")
        if not isinstance(native, Mapping):
            raise SourceLedContourError(f"catalog source {source_id} lacks native metadata")
        rate = _strict_int(native.get("sample_rate_hz"), label=f"catalog source {source_id}.sample_rate_hz", minimum=1)
        frames = _strict_int(native.get("frame_count"), label=f"catalog source {source_id}.frame_count", minimum=1)
        feature_npz = f"features/{source_id}.npz"
        feature_meta = f"features/{source_id}.json"
        _bundle_child(bundle, feature_npz, label=f"catalog source {source_id}.feature NPZ")
        _bundle_child(bundle, feature_meta, label=f"catalog source {source_id}.feature metadata")
        sources[source_id] = SourceInfo(
            source_id=source_id,
            sha256=digest,
            relative_path=relative,
            sample_rate_hz=rate,
            frame_count=frames,
            feature_npz_relative_path=feature_npz,
            feature_metadata_relative_path=feature_meta,
        )
    return sources, _sha256(catalog_path)


def _numeric_vector(value: Any, *, label: str, expected_length: int, np: Any) -> Any:
    array = np.asarray(value)
    if array.ndim != 1 or len(array) != expected_length:
        raise SourceLedContourError(f"feature NPZ {label} must be a one-dimensional {expected_length}-frame vector")
    if array.dtype.kind not in "fiu":
        raise SourceLedContourError(f"feature NPZ {label} must be numeric and must not be an object array")
    return array


def _load_feature_track(bundle: Path, source: SourceInfo, *, np: Any) -> FeatureTrack:
    npz_path = _bundle_child(bundle, source.feature_npz_relative_path, label="feature NPZ")
    metadata_path = _bundle_child(bundle, source.feature_metadata_relative_path, label="feature metadata")
    metadata = _json_load(metadata_path, label=source.feature_metadata_relative_path)
    if not isinstance(metadata, Mapping) or metadata.get("schema") != FEATURE_SCHEMA:
        raise SourceLedContourError(f"{source.feature_metadata_relative_path} lacks the expected feature schema")
    if (
        metadata.get("source_id") != source.source_id
        or metadata.get("source_sha256") != source.sha256
        or metadata.get("relative_path") != source.relative_path
        or metadata.get("npz") != source.feature_npz_relative_path
    ):
        raise SourceLedContourError(f"{source.feature_metadata_relative_path} does not preserve catalog source identity")
    analysis = metadata.get("analysis")
    if not isinstance(analysis, Mapping):
        raise SourceLedContourError(f"{source.feature_metadata_relative_path} lacks analysis metadata")
    hop = _finite_float(analysis.get("feature_hop_s"), label="feature_hop_s", minimum=1e-6)
    window = _finite_float(analysis.get("feature_window_s"), label="feature_window_s", minimum=1e-6)
    count = _strict_int(metadata.get("feature_count"), label="feature_count", minimum=1)
    try:
        with np.load(npz_path, allow_pickle=False) as archive:
            missing = sorted(set(REQUIRED_FEATURE_ARRAYS) - set(archive.files))
            if missing:
                raise SourceLedContourError(
                    f"{source.feature_npz_relative_path} is missing arrays: {', '.join(missing)}"
                )
            arrays = {
                name: _numeric_vector(archive[name], label=name, expected_length=count, np=np)
                for name in REQUIRED_FEATURE_ARRAYS
            }
    except OSError as exc:
        raise SourceLedContourError(f"could not read {source.feature_npz_relative_path} as a safe NPZ") from exc
    centers = arrays["native_frame_center"]
    if centers.dtype.kind not in "iu" or not np.all(np.diff(centers.astype(np.int64, copy=False)) > 0):
        raise SourceLedContourError(f"{source.feature_npz_relative_path} native_frame_center must strictly increase")
    centers = centers.astype(np.int64, copy=False)
    if int(centers[0]) < 0 or int(centers[-1]) >= source.frame_count:
        raise SourceLedContourError(f"{source.feature_npz_relative_path} native frame centers exceed catalog bounds")
    time_s = arrays["time_s"].astype(np.float64, copy=False)
    if not np.all(np.isfinite(time_s)) or not np.all(np.diff(time_s) > 0.0):
        raise SourceLedContourError(f"{source.feature_npz_relative_path} time_s must be finite and strictly increasing")
    confidence = arrays["voicing_confidence"].astype(np.float64, copy=False)
    if not np.all(np.isfinite(confidence)) or np.any(confidence < 0.0) or np.any(confidence > 1.0):
        raise SourceLedContourError(f"{source.feature_npz_relative_path} voicing_confidence must be finite in [0, 1]")
    for name in ("rms_dbfs", "onset_flux"):
        if not np.all(np.isfinite(arrays[name])):
            raise SourceLedContourError(f"{source.feature_npz_relative_path} {name} must be finite")
    return FeatureTrack(
        source=source,
        native_frame_center=centers,
        time_s=time_s,
        f0_hz=arrays["f0_hz"].astype(np.float64, copy=False),
        midi_proxy=arrays["midi_proxy"].astype(np.float64, copy=False),
        voicing_confidence=confidence,
        rms_dbfs=arrays["rms_dbfs"].astype(np.float64, copy=False),
        onset_flux=arrays["onset_flux"].astype(np.float64, copy=False),
        feature_hop_seconds=hop,
        feature_window_seconds=window,
        feature_npz_sha256=_sha256(npz_path),
        feature_metadata_sha256=_sha256(metadata_path),
    )


def _select_input_object(value: Any, *, priority_rank: int | None) -> tuple[dict[str, Any], dict[str, Any]]:
    """Select a retrieval/triage report row or accept one selected span object."""

    if not isinstance(value, Mapping):
        raise SourceLedContourError("input JSON is not an object")
    schema = value.get("schema")
    if priority_rank is not None:
        if type(priority_rank) is not int or priority_rank < 1:
            raise SourceLedContourError("--priority-rank must be a positive integer")
        if isinstance(schema, str) and schema.startswith(DIRECT_TRAJECTORY_SCHEMA_PREFIX):
            rows_key = "trajectories"
            kind = "direct_trajectory_retrieval_report_row"
            catalog_link = value.get("input_bundle")
        elif isinstance(schema, str) and schema.startswith(PHRASE_BOUNDARY_TRIAGE_SCHEMA_PREFIX):
            rows_key = "candidates"
            kind = "phrase_boundary_triage_report_row"
            report_input = value.get("input")
            catalog_link = report_input.get("bundle") if isinstance(report_input, Mapping) else None
        else:
            raise SourceLedContourError(
                "--priority-rank is supported only for direct trajectory retrieval or phrase-boundary triage reports"
            )
        rows = value.get(rows_key)
        if not isinstance(rows, list):
            raise SourceLedContourError(f"selected report has no {rows_key} array")
        chosen = [row for row in rows if isinstance(row, Mapping) and row.get("priority_rank") == priority_rank]
        if len(chosen) != 1:
            raise SourceLedContourError("selected report has no unique requested priority rank")
        return dict(chosen[0]), {
            "kind": kind,
            "report_schema": schema,
            "selected_priority_rank": priority_rank,
            "declared_bundle_basename": catalog_link.get("directory_basename") if isinstance(catalog_link, Mapping) else None,
            "declared_source_catalog_sha256": catalog_link.get("source_catalog_sha256") if isinstance(catalog_link, Mapping) else None,
        }
    if isinstance(schema, str) and (
        (schema.startswith(DIRECT_TRAJECTORY_SCHEMA_PREFIX) and "trajectories" in value)
        or (schema.startswith(PHRASE_BOUNDARY_TRIAGE_SCHEMA_PREFIX) and "candidates" in value)
    ):
        raise SourceLedContourError("a retrieval or phrase-boundary triage report requires --priority-rank")
    if not isinstance(value, dict):
        value = dict(value)
    if "trajectory_id" in value or "path_id" in value:
        kind = "direct_trajectory_row"
    elif "candidate_id" in value:
        kind = "phrase_boundary_candidate"
    else:
        kind = "selected_contiguous_source_span"
    return value, {"kind": kind, "report_schema": None, "selected_priority_rank": None}


def _first_truth_mapping(row: Mapping[str, Any]) -> tuple[str, Mapping[str, Any]]:
    for name in ("automatic_path_status", "automatic_boundary_status"):
        value = row.get(name)
        if isinstance(value, Mapping):
            return name, value
    raise SourceLedContourError(
        "selected span lacks automatic_path_status or automatic_boundary_status truth labels"
    )


def _has_truth(status: Mapping[str, Any], aliases: Sequence[str]) -> bool:
    return any(status.get(name) is True for name in aliases)


def _require_truth_labels(status: Mapping[str, Any]) -> None:
    """Refuse an input that has lost its conservative R&D status."""

    required = {
        "unreviewed": (
            "all_results_remain_unreviewed",
            "all_events_unreviewed",
            "unreviewed_automatic_boundary_candidate",
        ),
        "automatic_not_phrase_label": (
            "trajectory_was_scanned_directly_from_feature_npz_not_candidate_pairs",
            "automatic_measurement_is_not_a_musical_phrase_label",
        ),
        "not_same_breath_evidence": ("not_evidence_of_same_breath",),
        "not_slur_evidence": ("not_evidence_of_slur",),
        "not_natural_legato_evidence": ("not_evidence_of_natural_legato",),
        "not_approved_transition": (
            "not_an_approved_transition_path",
            "not_approved_transition_path",
            "not_an_approved_transition",
            "not_an_approved_transition_or_phrase",
        ),
        "not_transition_bank_item": ("not_a_transition_bank_item", "not_transition_bank_item"),
        "not_training_item": ("not_a_training_item", "not_training_item"),
        "not_game_asset": ("not_a_game_asset", "not_game_asset"),
    }
    missing = [label for label, aliases in required.items() if not _has_truth(status, aliases)]
    if missing:
        raise SourceLedContourError(
            "selected span does not preserve the necessary unreviewed truth labels: " + ", ".join(missing)
        )


def _validate_selected_span(row: Mapping[str, Any], source: SourceInfo, *, feature_count: int) -> dict[str, Any]:
    status_name, status = _first_truth_mapping(row)
    _require_truth_labels(status)
    source_value = row.get("source")
    native_span = row.get("native_source_span")
    if not isinstance(source_value, Mapping) or not isinstance(native_span, Mapping):
        raise SourceLedContourError("selected span must contain source and native_source_span objects")
    source_id = _safe_source_id(source_value.get("source_id"), label="selected span source_id")
    digest = source_value.get("sha256")
    relative = _safe_relative(source_value.get("relative_path"), label="selected span relative_path")
    if source_id != source.source_id or digest != source.sha256 or relative != source.relative_path:
        raise SourceLedContourError("selected span source identity does not match source_catalog.json")
    if "sample_rate_hz" in source_value and _strict_int(
        source_value.get("sample_rate_hz"), label="selected span sample_rate_hz", minimum=1
    ) != source.sample_rate_hz:
        raise SourceLedContourError("selected span sample_rate_hz does not match source_catalog.json")
    if "frame_count" in source_value and _strict_int(
        source_value.get("frame_count"), label="selected span frame_count", minimum=1
    ) != source.frame_count:
        raise SourceLedContourError("selected span frame_count does not match source_catalog.json")
    frame_range = native_span.get("frame_range")
    if not isinstance(frame_range, list) or len(frame_range) != 2:
        raise SourceLedContourError("selected span native_source_span.frame_range must be [start, end)")
    start = _strict_int(frame_range[0], label="selected native span start", minimum=0)
    end = _strict_int(frame_range[1], label="selected native span end", minimum=1)
    if not start < end <= source.frame_count:
        raise SourceLedContourError("selected native frame span lies outside the verified source")
    if "frame_count" in native_span:
        reported = _strict_int(native_span.get("frame_count"), label="selected native span frame_count", minimum=1)
        if reported != end - start:
            raise SourceLedContourError("selected native span frame_count disagrees with frame_range")
    declared_feature_span: dict[str, Any] | None = None
    feature_span = row.get("feature_span")
    if isinstance(feature_span, Mapping):
        index_range = feature_span.get("feature_index_range")
        if not isinstance(index_range, list) or len(index_range) != 2:
            raise SourceLedContourError("selected feature_span.feature_index_range must be [start, end)")
        feature_start = _strict_int(index_range[0], label="selected feature span start", minimum=0)
        feature_end = _strict_int(index_range[1], label="selected feature span end", minimum=1)
        if not feature_start < feature_end <= feature_count:
            raise SourceLedContourError("selected feature span lies outside the feature cache")
        declared_feature_span = {"feature_index_range": [feature_start, feature_end]}
    identifier = row.get("trajectory_id", row.get("path_id", row.get("candidate_id")))
    if not isinstance(identifier, str) or not identifier:
        raise SourceLedContourError("selected span needs a non-empty trajectory_id, path_id, or candidate_id")
    return {
        "identifier": identifier,
        "truth_label_field": status_name,
        "truth_labels_verbatim": dict(status),
        "native_frame_range": [start, end],
        "declared_feature_span": declared_feature_span,
    }


def _selected_feature_range(
    track: FeatureTrack,
    *,
    native_start: int,
    native_end: int,
    maximum_time_gap_factor: float,
    np: Any,
) -> tuple[int, int, float]:
    if maximum_time_gap_factor < 1.0:
        raise SourceLedContourError("--maximum-contiguous-time-gap-factor must be at least 1")
    selected = np.flatnonzero(
        (track.native_frame_center >= native_start) & (track.native_frame_center < native_end)
    )
    if len(selected) < 2:
        raise SourceLedContourError("selected native frame span contains fewer than two feature centers")
    first = int(selected[0])
    last_exclusive = int(selected[-1]) + 1
    if not np.array_equal(selected, np.arange(first, last_exclusive, dtype=np.int64)):
        raise SourceLedContourError("selected native frame span does not map to one contiguous feature-index range")
    all_steps = np.diff(track.time_s)
    nominal_hop = float(np.median(all_steps))
    if not math.isfinite(nominal_hop) or nominal_hop <= 0.0:
        raise SourceLedContourError("feature cache has no valid nominal time hop")
    selected_steps = np.diff(track.time_s[first:last_exclusive])
    if np.any(selected_steps > nominal_hop * maximum_time_gap_factor + 1e-12):
        raise SourceLedContourError("selected feature range contains a timeline gap and is not one contiguous feature span")
    return first, last_exclusive, nominal_hop


def _finite_summary(values: Any, *, positive: bool, np: Any) -> tuple[float | None, float | None, float | None]:
    valid = values[np.isfinite(values)]
    if positive:
        valid = valid[valid > 0.0]
    if len(valid) == 0:
        return None, None, None
    return _round(float(np.median(valid))), _round(float(np.min(valid))), _round(float(np.max(valid)))


def _coarse_contour(
    track: FeatureTrack,
    *,
    feature_start: int,
    feature_end: int,
    maximum_points: int,
    np: Any,
) -> list[dict[str, Any]]:
    if type(maximum_points) is not int or not 2 <= maximum_points <= 4096:
        raise SourceLedContourError("--coarse-max-points must be an integer in [2, 4096]")
    frame_count = feature_end - feature_start
    point_count = min(frame_count, maximum_points)
    edges = [feature_start + (index * frame_count) // point_count for index in range(point_count + 1)]
    result: list[dict[str, Any]] = []
    for sequence, (start, end) in enumerate(zip(edges[:-1], edges[1:]), 1):
        f0 = track.f0_hz[start:end]
        midi = track.midi_proxy[start:end]
        f0_median, f0_min, f0_max = _finite_summary(f0, positive=True, np=np)
        midi_median, midi_min, midi_max = _finite_summary(midi, positive=False, np=np)
        valid_f0 = np.isfinite(f0) & (f0 > 0.0) & np.isfinite(midi)
        rms = track.rms_dbfs[start:end]
        voicing = track.voicing_confidence[start:end]
        onset = track.onset_flux[start:end]
        result.append({
            "sequence_index": sequence,
            "feature_index_range": [start, end],
            "feature_frame_count": end - start,
            "native_frame_center_range": [
                int(track.native_frame_center[start]),
                int(track.native_frame_center[end - 1]),
            ],
            "time_seconds_range": [_round(float(track.time_s[start])), _round(float(track.time_s[end - 1]))],
            "f0_proxy_hz_median": f0_median,
            "f0_proxy_hz_min": f0_min,
            "f0_proxy_hz_max": f0_max,
            "midi_proxy_median": midi_median,
            "midi_proxy_min": midi_min,
            "midi_proxy_max": midi_max,
            "f0_proxy_valid_feature_fraction": _round(float(np.mean(valid_f0))),
            "rms_dbfs_median": _round(float(np.median(rms))),
            "rms_dbfs_min": _round(float(np.min(rms))),
            "rms_dbfs_max": _round(float(np.max(rms))),
            "voicing_confidence_mean": _round(float(np.mean(voicing))),
            "voicing_confidence_min": _round(float(np.min(voicing))),
            "onset_flux_proxy_mean": _round(float(np.mean(onset))),
            "values_are_feature_cache_summaries_not_audio_or_expert_transcription": True,
        })
    return result


def _low_variation_region_suggestions(
    track: FeatureTrack,
    *,
    feature_start: int,
    feature_end: int,
    nominal_hop: float,
    min_voicing_confidence: float,
    max_pitch_span_cents: float,
    max_rms_range_db: float,
    min_feature_frames: int,
    maximum_time_gap_factor: float,
    np: Any,
) -> list[dict[str, Any]]:
    """Suggest low-proxy-variation spans without inferring musical gestures."""

    minimum_voicing = _finite_float(
        min_voicing_confidence,
        label="--stable-min-voicing-confidence",
        minimum=0.0,
        maximum=1.0,
    )
    pitch_limit = _finite_float(
        max_pitch_span_cents,
        label="--stable-max-pitch-span-cents",
        minimum=0.0,
    )
    rms_limit = _finite_float(max_rms_range_db, label="--stable-max-rms-range-db", minimum=0.0)
    if type(min_feature_frames) is not int or min_feature_frames < 2:
        raise SourceLedContourError("--stable-min-feature-frames must be an integer of at least two")
    if maximum_time_gap_factor < 1.0:
        raise SourceLedContourError("--maximum-contiguous-time-gap-factor must be at least 1")
    midi = track.midi_proxy[feature_start:feature_end]
    f0 = track.f0_hz[feature_start:feature_end]
    confidence = track.voicing_confidence[feature_start:feature_end]
    rms = track.rms_dbfs[feature_start:feature_end]
    time_s = track.time_s[feature_start:feature_end]
    valid = np.isfinite(midi) & np.isfinite(f0) & (f0 > 0.0) & (confidence >= minimum_voicing)
    suggestions: list[dict[str, Any]] = []
    local_start = 0
    size = len(midi)
    while local_start < size:
        if not bool(valid[local_start]):
            local_start += 1
            continue
        local_end = local_start + 1
        pitch_low = float(midi[local_start])
        pitch_high = pitch_low
        rms_low = float(rms[local_start])
        rms_high = rms_low
        while local_end < size and bool(valid[local_end]):
            if time_s[local_end] - time_s[local_end - 1] > nominal_hop * maximum_time_gap_factor + 1e-12:
                break
            next_pitch_low = min(pitch_low, float(midi[local_end]))
            next_pitch_high = max(pitch_high, float(midi[local_end]))
            next_rms_low = min(rms_low, float(rms[local_end]))
            next_rms_high = max(rms_high, float(rms[local_end]))
            if (next_pitch_high - next_pitch_low) * 100.0 > pitch_limit or next_rms_high - next_rms_low > rms_limit:
                break
            pitch_low, pitch_high = next_pitch_low, next_pitch_high
            rms_low, rms_high = next_rms_low, next_rms_high
            local_end += 1
        if local_end - local_start >= min_feature_frames:
            start = feature_start + local_start
            end = feature_start + local_end
            f0_slice = track.f0_hz[start:end]
            midi_slice = track.midi_proxy[start:end]
            rms_slice = track.rms_dbfs[start:end]
            voicing_slice = track.voicing_confidence[start:end]
            onset_slice = track.onset_flux[start:end]
            f0_median, _, _ = _finite_summary(f0_slice, positive=True, np=np)
            midi_median, _, _ = _finite_summary(midi_slice, positive=False, np=np)
            suggestions.append({
                "suggestion_index": len(suggestions) + 1,
                "feature_index_range": [start, end],
                "feature_frame_count": end - start,
                "native_frame_center_range": [
                    int(track.native_frame_center[start]),
                    int(track.native_frame_center[end - 1]),
                ],
                "time_seconds_range": [_round(float(track.time_s[start])), _round(float(track.time_s[end - 1]))],
                "feature_center_duration_seconds": _round(float(track.time_s[end - 1] - track.time_s[start])),
                "f0_proxy_hz_median": f0_median,
                "midi_proxy_median": midi_median,
                "midi_proxy_span_cents": _round((float(np.max(midi_slice)) - float(np.min(midi_slice))) * 100.0),
                "rms_dbfs_median": _round(float(np.median(rms_slice))),
                "rms_dbfs_range": _round(float(np.max(rms_slice) - np.min(rms_slice))),
                "voicing_confidence_min": _round(float(np.min(voicing_slice))),
                "onset_flux_proxy_mean": _round(float(np.mean(onset_slice))),
                "feature_proxy_low_variation_suggestion_not_expert_transcription_or_articulation_label": True,
            })
        # A rejected next frame is reconsidered as a possible start.  This
        # prevents a boundary-like proxy change from silently deleting the
        # following low-variation run.
        local_start = local_end if local_end > local_start else local_start + 1
    return suggestions


def _tsv_cell(value: Any) -> str:
    if value is None:
        text = ""
    elif isinstance(value, float):
        text = f"{value:.6f}"
    else:
        text = str(value)
    text = text.replace("\t", " ").replace("\r", " ").replace("\n", " ")
    return "'" + text if text.startswith(("=", "+", "-", "@")) else text


def _write_tsv(path: Path, contour: Sequence[Mapping[str, Any]], suggestions: Sequence[Mapping[str, Any]]) -> None:
    header = [
        "record_kind",
        "sequence_index",
        "feature_start_index",
        "feature_end_index_exclusive",
        "feature_frame_count",
        "native_start_frame_center",
        "native_end_frame_center",
        "start_time_seconds",
        "end_time_seconds",
        "f0_proxy_hz_median",
        "midi_proxy_median",
        "midi_proxy_span_cents",
        "rms_dbfs_median",
        "rms_dbfs_range",
        "voicing_confidence_mean_or_min",
        "onset_flux_proxy_mean",
        "interpretation_limit",
    ]
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, delimiter="\t", lineterminator="\n")
        writer.writerow(header)
        for row in contour:
            values = [
                "coarse_feature_proxy_contour", row["sequence_index"], row["feature_index_range"][0],
                row["feature_index_range"][1], row["feature_frame_count"], row["native_frame_center_range"][0],
                row["native_frame_center_range"][1], row["time_seconds_range"][0], row["time_seconds_range"][1],
                row["f0_proxy_hz_median"], row["midi_proxy_median"], None, row["rms_dbfs_median"],
                _round(row["rms_dbfs_max"] - row["rms_dbfs_min"]), row["voicing_confidence_mean"],
                row["onset_flux_proxy_mean"],
                "feature_cache_summary_not_audio_or_expert_transcription",
            ]
            writer.writerow([_tsv_cell(value) for value in values])
        for row in suggestions:
            values = [
                "low_variation_feature_proxy_suggestion", row["suggestion_index"], row["feature_index_range"][0],
                row["feature_index_range"][1], row["feature_frame_count"], row["native_frame_center_range"][0],
                row["native_frame_center_range"][1], row["time_seconds_range"][0], row["time_seconds_range"][1],
                row["f0_proxy_hz_median"], row["midi_proxy_median"], row["midi_proxy_span_cents"],
                row["rms_dbfs_median"], row["rms_dbfs_range"], row["voicing_confidence_min"],
                row["onset_flux_proxy_mean"],
                "low_variation_proxy_not_phrase_breath_slur_legato_or_quality_label",
            ]
            writer.writerow([_tsv_cell(value) for value in values])


def build_source_led_contour(
    bundle_dir: str | Path,
    input_json: str | Path,
    output_dir: str | Path,
    *,
    priority_rank: int | None = None,
    coarse_max_points: int = DEFAULT_COARSE_MAX_POINTS,
    include_stable_region_suggestions: bool = True,
    stable_min_voicing_confidence: float = DEFAULT_STABLE_MIN_VOICING_CONFIDENCE,
    stable_max_pitch_span_cents: float = DEFAULT_STABLE_MAX_PITCH_SPAN_CENTS,
    stable_max_rms_range_db: float = DEFAULT_STABLE_MAX_RMS_RANGE_DB,
    stable_min_feature_frames: int = DEFAULT_STABLE_MIN_FEATURE_FRAMES,
    maximum_time_gap_factor: float = DEFAULT_CONTIGUOUS_TIME_GAP_FACTOR,
) -> dict[str, Any]:
    """Create a deterministic, provenance-preserving feature contour scaffold."""

    np = _require_numpy()
    bundle = Path(bundle_dir).expanduser().resolve()
    input_path = Path(input_json).expanduser().resolve()
    output = Path(output_dir).expanduser().resolve()
    if not bundle.is_dir():
        raise SourceLedContourError("--bundle must name a readable R&D-06 bundle directory")
    if not input_path.is_file():
        raise SourceLedContourError("--input-json must name a readable selected span or retrieval report")
    if output.exists():
        raise SourceLedContourError("--output-dir must not already exist; refusing to overwrite an R&D artifact")
    normalized_gap_factor = _finite_float(
        maximum_time_gap_factor,
        label="--maximum-contiguous-time-gap-factor",
        minimum=1.0,
    )
    normalized_stable_voicing = _finite_float(
        stable_min_voicing_confidence,
        label="--stable-min-voicing-confidence",
        minimum=0.0,
        maximum=1.0,
    )
    normalized_pitch_span = _finite_float(
        stable_max_pitch_span_cents,
        label="--stable-max-pitch-span-cents",
        minimum=0.0,
    )
    normalized_rms_range = _finite_float(
        stable_max_rms_range_db,
        label="--stable-max-rms-range-db",
        minimum=0.0,
    )
    if type(stable_min_feature_frames) is not int or stable_min_feature_frames < 2:
        raise SourceLedContourError("--stable-min-feature-frames must be an integer of at least two")
    selected_value = _json_load(input_path, label="input JSON")
    row, selection_identity = _select_input_object(selected_value, priority_rank=priority_rank)
    selection_identity["input_json_basename"] = input_path.name
    selection_identity["input_json_sha256"] = _sha256(input_path)
    sources, catalog_sha256 = _load_catalog(bundle)
    declared_catalog_sha = selection_identity.get("declared_source_catalog_sha256")
    if declared_catalog_sha is not None:
        if not isinstance(declared_catalog_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", declared_catalog_sha):
            raise SourceLedContourError("direct trajectory report has an invalid declared source catalog SHA-256")
        if declared_catalog_sha != catalog_sha256:
            raise SourceLedContourError("direct trajectory report source catalog SHA-256 does not match --bundle")
    source_value = row.get("source") if isinstance(row, Mapping) else None
    if not isinstance(source_value, Mapping):
        raise SourceLedContourError("selected span has no source object")
    source_id = _safe_source_id(source_value.get("source_id"), label="selected span source_id")
    if source_id not in sources:
        raise SourceLedContourError("selected span source_id is absent from source_catalog.json")
    source = sources[source_id]
    track = _load_feature_track(bundle, source, np=np)
    span = _validate_selected_span(row, source, feature_count=len(track.time_s))
    native_start, native_end = span["native_frame_range"]
    feature_start, feature_end, nominal_hop = _selected_feature_range(
        track,
        native_start=native_start,
        native_end=native_end,
        maximum_time_gap_factor=normalized_gap_factor,
        np=np,
    )
    declared = span["declared_feature_span"]
    if declared is not None:
        declared_start, declared_end = declared["feature_index_range"]
        if not (feature_start <= declared_start < declared_end <= feature_end):
            raise SourceLedContourError(
                "selected span's declared feature range is not enclosed by its native source frame span"
            )
    contour = _coarse_contour(
        track,
        feature_start=feature_start,
        feature_end=feature_end,
        maximum_points=coarse_max_points,
        np=np,
    )
    suggestions = _low_variation_region_suggestions(
        track,
        feature_start=feature_start,
        feature_end=feature_end,
        nominal_hop=nominal_hop,
        min_voicing_confidence=normalized_stable_voicing,
        max_pitch_span_cents=normalized_pitch_span,
        max_rms_range_db=normalized_rms_range,
        min_feature_frames=stable_min_feature_frames,
        maximum_time_gap_factor=normalized_gap_factor,
        np=np,
    ) if include_stable_region_suggestions else []
    output.mkdir(parents=True, exist_ok=False)
    result: dict[str, Any] = {
        "schema": SOURCE_LED_CONTOUR_SCHEMA,
        "artifact_kind": "unreviewed_source_led_feature_proxy_contour_scaffold",
        "input_selection": selection_identity,
        "source": {
            "source_id": source.source_id,
            "sha256": source.sha256,
            "relative_path": source.relative_path,
            "sample_rate_hz": source.sample_rate_hz,
            "frame_count": source.frame_count,
            "source_catalog_sha256": catalog_sha256,
        },
        "native_source_span": {
            "frame_range": [native_start, native_end],
            "frame_count": native_end - native_start,
            "duration_seconds": _round((native_end - native_start) / source.sample_rate_hz),
            "single_contiguous_source_frame_span_verified_against_catalog": True,
            "input_span_identifier": span["identifier"],
        },
        "feature_cache": {
            "schema": FEATURE_SCHEMA,
            "feature_npz": source.feature_npz_relative_path,
            "feature_npz_sha256": track.feature_npz_sha256,
            "feature_metadata": source.feature_metadata_relative_path,
            "feature_metadata_sha256": track.feature_metadata_sha256,
            "feature_hop_seconds_declared": _round(track.feature_hop_seconds),
            "feature_window_seconds_declared": _round(track.feature_window_seconds),
            "feature_index_range": [feature_start, feature_end],
            "feature_frame_count": feature_end - feature_start,
            "native_frame_center_range": [
                int(track.native_frame_center[feature_start]),
                int(track.native_frame_center[feature_end - 1]),
            ],
            "time_seconds_range": [_round(float(track.time_s[feature_start])), _round(float(track.time_s[feature_end - 1]))],
            "strictly_contiguous_feature_rows_verified": True,
            "nominal_feature_hop_seconds_measured": _round(nominal_hop),
            "input_declared_feature_span": declared,
        },
        "input_truth_labels": {
            "field": span["truth_label_field"],
            "verbatim": span["truth_labels_verbatim"],
            "preserved_as_unreviewed_input_contract": True,
        },
        "configuration": {
            "coarse_max_points": coarse_max_points,
            "stable_region_suggestions_enabled": bool(include_stable_region_suggestions),
            "stable_min_voicing_confidence": _round(normalized_stable_voicing),
            "stable_max_pitch_span_cents": _round(normalized_pitch_span),
            "stable_max_rms_range_db": _round(normalized_rms_range),
            "stable_min_feature_frames": stable_min_feature_frames,
            "maximum_contiguous_time_gap_factor": _round(normalized_gap_factor),
        },
        "interpretation_limits": {
            "source_audio_not_read_written_transformed_or_rendered": True,
            "f0_loudness_voicing_are_existing_automatic_feature_cache_proxies": True,
            "no_f0_interpolation_pitch_correction_time_stretch_gain_or_audio_synthesis": True,
            "contour_is_not_expert_transcription_or_score_annotation": True,
            "stable_region_suggestions_are_not_phrase_breath_slur_legato_or_quality_labels": True,
            "all_outputs_remain_unreviewed_not_approved_not_training_not_game_assets": True,
        },
        "counts": {
            "coarse_contour_point_count": len(contour),
            "stable_region_suggestion_count": len(suggestions),
        },
        "coarse_feature_proxy_contour": contour,
        "low_variation_feature_proxy_region_suggestions": suggestions,
    }
    _json_dump(output / "source_led_contour.json", result)
    _write_tsv(output / "source_led_contour.tsv", contour, suggestions)
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", help="R&D-06 bundle with source_catalog.json and features/*.npz")
    parser.add_argument("--input-json", help="one selected span object, or a retrieval/triage report with --priority-rank")
    parser.add_argument("--priority-rank", type=int, help="select one row from a direct trajectory retrieval or phrase-boundary triage report")
    parser.add_argument("--output-dir", help="fresh ignored R&D artifact directory; existing directories are refused")
    parser.add_argument("--coarse-max-points", type=int, default=DEFAULT_COARSE_MAX_POINTS)
    parser.add_argument("--no-stable-region-suggestions", action="store_true")
    parser.add_argument("--stable-min-voicing-confidence", type=float, default=DEFAULT_STABLE_MIN_VOICING_CONFIDENCE)
    parser.add_argument("--stable-max-pitch-span-cents", type=float, default=DEFAULT_STABLE_MAX_PITCH_SPAN_CENTS)
    parser.add_argument("--stable-max-rms-range-db", type=float, default=DEFAULT_STABLE_MAX_RMS_RANGE_DB)
    parser.add_argument("--stable-min-feature-frames", type=int, default=DEFAULT_STABLE_MIN_FEATURE_FRAMES)
    parser.add_argument("--maximum-contiguous-time-gap-factor", type=float, default=DEFAULT_CONTIGUOUS_TIME_GAP_FACTOR)
    parser.add_argument("--dry-run", action="store_true", help="print R&D limits without reading a bundle or input")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.dry_run:
        print(
            "source_led_contour: would read only one verified R&D feature-cache span; it will not read WAV, transform "
            "audio, infer transcription/breath/slur/legato, approve a source, train a model, or touch runtime BGM."
        )
        return 0
    missing = [name for name in ("bundle", "input_json", "output_dir") if not getattr(args, name)]
    if missing:
        _parser().error("required unless --dry-run: " + ", ".join("--" + name.replace("_", "-") for name in missing))
    try:
        result = build_source_led_contour(
            args.bundle,
            args.input_json,
            args.output_dir,
            priority_rank=args.priority_rank,
            coarse_max_points=args.coarse_max_points,
            include_stable_region_suggestions=not args.no_stable_region_suggestions,
            stable_min_voicing_confidence=args.stable_min_voicing_confidence,
            stable_max_pitch_span_cents=args.stable_max_pitch_span_cents,
            stable_max_rms_range_db=args.stable_max_rms_range_db,
            stable_min_feature_frames=args.stable_min_feature_frames,
            maximum_time_gap_factor=args.maximum_contiguous_time_gap_factor,
        )
    except SourceLedContourError as exc:
        print(f"source_led_contour: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "output": Path(args.output_dir).name,
        "coarse_contour_point_count": result["counts"]["coarse_contour_point_count"],
        "stable_region_suggestion_count": result["counts"]["stable_region_suggestion_count"],
        "all_outputs_remain_unreviewed": True,
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
