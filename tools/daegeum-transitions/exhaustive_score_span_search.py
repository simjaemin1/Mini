#!/usr/bin/env python3
"""Exhaustively screen cached Daegeum feature spans against one authored score.

This is an intentionally narrow, offline R&D measurement.  It searches every
feature-grid anchored, single-source span in an existing R&D-06 feature cache
whose *whole-score* duration permits the established 0.80--1.25 uniform-time
ratio gate.  For every such span it measures exactly one global pitch offset
and exactly one duration-derived uniform time ratio.  It never opens a WAV,
changes a source feature, resamples, pitch-shifts, time-warps, renders, or
exports a source-audio clip.

The scan is exhaustive only at the already-cached feature grid: a source span
starts and ends at existing 10 ms feature centres.  That is the strongest
claim this tool can honestly make without reading raw audio.  A low numeric
error is not evidence that a span is a phrase, same breath, reattack, slur,
legato, transcription, performance gesture, training item, approved source,
or game asset.  The authored breath/rearticulation/slur controls remain score
input and are never inferred from the source proxies.

Unlike a coarse phrase-pool comparison, this utility covers every admissible
location in the full cached corpus.  It uses FFT correlations only to compute
the same least-squares global-offset RMSE/coverage measurement efficiently;
every possible in-band result and every reported best result is then measured
again directly from its existing feature rows.  No acceptance threshold can be
weakened through the CLI.

Example:

    /tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/exhaustive_score_span_search.py \
      --bundle _bgm_rnd/daegeum-transition-bank-ngc-YYYYMMDD \
      --score-plan tools/score-expression/plans/ari_source_led_response_r1.json \
      --output-dir _bgm_rnd/ari-exhaustive-score-span-search-YYYYMMDD
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
import sys
from typing import Any, Mapping, Sequence


HERE = Path(__file__).resolve().parent
SCORE_EXPRESSION_DIR = HERE.parent / "score-expression"
for module_dir in (HERE, SCORE_EXPRESSION_DIR):
    if str(module_dir) not in sys.path:
        sys.path.insert(0, str(module_dir))

from compile_expression import ScoreExpressionError, compile_plan  # noqa: E402
from score_phrase_compatibility import (  # noqa: E402
    DEFAULT_MAX_INTERVAL_ERROR_CENTS,
    DEFAULT_MAX_P95_ABSOLUTE_PITCH_ERROR_CENTS,
    DEFAULT_MAX_PITCH_RMSE_CENTS,
    DEFAULT_MAX_TIME_RATIO,
    DEFAULT_MIN_SOURCE_VOICING_CONFIDENCE,
    DEFAULT_MIN_TIME_RATIO,
    DEFAULT_MIN_VALID_CONTROL_COVERAGE,
)
from source_led_contour import (  # noqa: E402
    RND06_SCHEMA,
    FeatureTrack,
    SourceInfo,
    SourceLedContourError,
    _load_catalog,
    _load_feature_track,
    _require_numpy,
)


EXHAUSTIVE_SCORE_SPAN_SEARCH_SCHEMA = f"{RND06_SCHEMA}.exhaustive-score-span-search.v1"
REPORT_FILENAME = "exhaustive_score_span_search.json"
TSV_FILENAME = "exhaustive_score_span_search.tsv"

# The cache is measured at a finite grid.  A source with irregular timestamps
# could hide intervening coordinates, so rejecting it is preferable to calling
# an incomplete scan exhaustive.
UNIFORM_GRID_ABSOLUTE_TOLERANCE_SECONDS = 1.0e-12
DEFAULT_TOP_RESULTS = 50


class ExhaustiveScoreSpanSearchError(RuntimeError):
    """An input cannot support a conservative exhaustive cache-grid scan."""


@dataclass(frozen=True)
class _CorpusTrack:
    """One verified feature track and its deterministic concatenated offset."""

    source: SourceInfo
    track: FeatureTrack
    ordinal: int
    global_start: int
    global_end: int
    feature_hop_seconds: float


@dataclass(frozen=True)
class _ScoreMapping:
    """One source-duration grid row and its nearest-existing-row mapping."""

    span_steps: int
    time_ratio: float
    voiced_offsets: Any
    all_control_offsets: Any
    weights: Any
    target_sum: Any
    target_squared_sum: Any


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _json_dump(path: Path, value: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _round(value: float) -> float:
    return round(float(value), 6)


def _finite(value: Any, *, label: str, minimum: float | None = None) -> float:
    if isinstance(value, bool):
        raise ExhaustiveScoreSpanSearchError(f"{label} must be a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ExhaustiveScoreSpanSearchError(f"{label} must be a finite number") from exc
    if not math.isfinite(number):
        raise ExhaustiveScoreSpanSearchError(f"{label} must be a finite number")
    if minimum is not None and number < minimum:
        raise ExhaustiveScoreSpanSearchError(f"{label} is below its permitted range")
    return number


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


def _common_uniform_grid(
    bundle: Path,
    *,
    np: Any,
) -> tuple[list[_CorpusTrack], Any, Any, Any, float, str]:
    """Load all tracks, rejecting anything that prevents a complete grid scan."""

    try:
        sources, catalog_sha256 = _load_catalog(bundle)
    except SourceLedContourError as exc:
        raise ExhaustiveScoreSpanSearchError(str(exc)) from exc
    if not sources:
        raise ExhaustiveScoreSpanSearchError("source catalog has no tracks")

    tracks: list[_CorpusTrack] = []
    midi_parts: list[Any] = []
    confidence_parts: list[Any] = []
    owner_parts: list[Any] = []
    common_hop: float | None = None
    global_start = 0
    for ordinal, source_id in enumerate(sorted(sources), 0):
        source = sources[source_id]
        try:
            track = _load_feature_track(bundle, source, np=np)
        except SourceLedContourError as exc:
            raise ExhaustiveScoreSpanSearchError(str(exc)) from exc
        if len(track.time_s) < 2:
            raise ExhaustiveScoreSpanSearchError(f"{source.source_id} has fewer than two cached feature rows")
        steps = np.diff(track.time_s)
        hop = float(np.median(steps))
        if not math.isfinite(hop) or hop <= 0.0:
            raise ExhaustiveScoreSpanSearchError(f"{source.source_id} has no finite positive feature hop")
        if not np.all(np.abs(steps - hop) <= UNIFORM_GRID_ABSOLUTE_TOLERANCE_SECONDS):
            raise ExhaustiveScoreSpanSearchError(
                f"{source.source_id} has an irregular feature timeline; refusing an incomplete exhaustive scan"
            )
        if common_hop is None:
            common_hop = hop
        elif abs(hop - common_hop) > UNIFORM_GRID_ABSOLUTE_TOLERANCE_SECONDS:
            raise ExhaustiveScoreSpanSearchError(
                "feature tracks do not share one uniform grid; split the corpus before an exhaustive scan"
            )
        global_end = global_start + len(track.time_s)
        tracks.append(_CorpusTrack(
            source=source,
            track=track,
            ordinal=ordinal,
            global_start=global_start,
            global_end=global_end,
            feature_hop_seconds=hop,
        ))
        midi_parts.append(track.midi_proxy.astype(np.float64, copy=False))
        confidence_parts.append(track.voicing_confidence.astype(np.float64, copy=False))
        owner_parts.append(np.full(len(track.time_s), ordinal, dtype=np.int32))
        global_start = global_end

    assert common_hop is not None
    return (
        tracks,
        np.concatenate(midi_parts),
        np.concatenate(confidence_parts),
        np.concatenate(owner_parts),
        common_hop,
        catalog_sha256,
    )


def _nearest_grid_offsets(
    frame_times_seconds: Any,
    *,
    span_steps: int,
    score_duration_seconds: float,
    feature_hop_seconds: float,
    np: Any,
) -> Any:
    """Map controls to existing rows, choosing the earlier row on an exact tie."""

    if span_steps < 1:
        raise ExhaustiveScoreSpanSearchError("source span must contain at least one feature-grid interval")
    source_duration = span_steps * feature_hop_seconds
    ratio = source_duration / score_duration_seconds
    target_times = frame_times_seconds.astype(np.float64, copy=False) * ratio
    source_times = np.arange(span_steps + 1, dtype=np.float64) * feature_hop_seconds
    right = np.searchsorted(source_times, target_times, side="left")
    right = np.clip(right, 0, span_steps)
    left = np.clip(right - 1, 0, span_steps)
    choose_left = np.abs(target_times - source_times[left]) <= np.abs(source_times[right] - target_times)
    return np.where(choose_left, left, right).astype(np.int64, copy=False)


def _score_mapping(
    *,
    span_steps: int,
    score: Mapping[str, Any],
    score_midi: Any,
    voiced: Any,
    feature_hop_seconds: float,
    np: Any,
) -> _ScoreMapping:
    duration = _finite(score["duration_seconds"], label="compiled score duration", minimum=1.0e-9)
    all_offsets = _nearest_grid_offsets(
        score["frame_times_seconds"],
        span_steps=span_steps,
        score_duration_seconds=duration,
        feature_hop_seconds=feature_hop_seconds,
        np=np,
    )
    voiced_offsets = all_offsets[voiced]
    voiced_midi = score_midi[voiced]
    width = span_steps + 1
    weights = np.bincount(voiced_offsets, minlength=width).astype(np.float64, copy=False)
    target_sum = np.bincount(voiced_offsets, weights=voiced_midi, minlength=width).astype(np.float64, copy=False)
    target_squared_sum = np.bincount(
        voiced_offsets,
        weights=np.square(voiced_midi),
        minlength=width,
    ).astype(np.float64, copy=False)
    return _ScoreMapping(
        span_steps=span_steps,
        time_ratio=(span_steps * feature_hop_seconds) / duration,
        voiced_offsets=voiced_offsets,
        all_control_offsets=all_offsets,
        weights=weights,
        target_sum=target_sum,
        target_squared_sum=target_squared_sum,
    )


def _next_power_of_two(value: int) -> int:
    if value < 1:
        raise ExhaustiveScoreSpanSearchError("FFT length input must be positive")
    return 1 << (value - 1).bit_length()


def _correlation_from_ffts(
    signal_fft: Any,
    reversed_kernel_fft: Any,
    *,
    signal_length: int,
    kernel_length: int,
    fft_length: int,
    np: Any,
) -> Any:
    """Return sum(signal[start+j] * kernel[j]) for every valid start."""

    circular = np.fft.irfft(signal_fft * reversed_kernel_fft, n=fft_length)
    return circular[kernel_length - 1:signal_length].astype(np.float64, copy=False)


def _kernel_fft(kernel: Any, *, fft_length: int, np: Any) -> Any:
    return np.fft.rfft(kernel[::-1], n=fft_length)


def _candidate_tuple_key(span_steps: int, global_start: int) -> tuple[int, int]:
    return (int(span_steps), int(global_start))


def _select_lowest_rmse_starts(values: Any, eligible: Any, *, top: int, np: Any) -> list[int]:
    """Return deterministic per-duration top starts without sorting every span."""

    indices = np.flatnonzero(eligible)
    if len(indices) == 0:
        return []
    if len(indices) > top:
        local = np.argpartition(values[indices], top - 1)[:top]
        indices = indices[local]
    order = np.lexsort((indices, values[indices]))
    return [int(item) for item in indices[order]]


def _boundary_measurements(
    score: Mapping[str, Any],
    *,
    mapping: _ScoreMapping,
    corpus_track: _CorpusTrack,
    local_start: int,
    np: Any,
) -> list[dict[str, Any]]:
    """Expose source proxies at authored boundaries without inventing gestures."""

    rows: list[dict[str, Any]] = []
    duration = float(score["duration_seconds"])
    for event in score["events"]:
        event_id = event.get("id")
        articulation = event.get("articulation")
        if not isinstance(event_id, str) or not isinstance(articulation, str):
            raise ExhaustiveScoreSpanSearchError("compiled score event lacks stable ID/articulation")
        for boundary_kind in ("start", "end"):
            score_time = _finite(
                event.get(f"{boundary_kind}_seconds"),
                label=f"compiled event {event_id}.{boundary_kind}",
                minimum=0.0,
            )
            # Compile-plan's control grid includes all event endpoints.  Use
            # its matching control index if present rather than making an
            # interpolation or a hidden local alignment choice.
            control_index = int(round(score_time * int(score["control_hz"])))
            if not 0 <= control_index < len(mapping.all_control_offsets):
                raise ExhaustiveScoreSpanSearchError("authored boundary lies outside compiled score control grid")
            local_feature_index = local_start + int(mapping.all_control_offsets[control_index])
            track = corpus_track.track
            rows.append({
                "event_id": event_id,
                "authorial_articulation": articulation,
                "boundary": boundary_kind,
                "score_time_seconds": _round(score_time),
                "mapped_source_time_seconds_measurement": _round(
                    float(track.time_s[local_start]) + score_time * mapping.time_ratio
                ),
                "nearest_source_feature_index": local_feature_index,
                "nearest_source_feature_time_seconds": _round(float(track.time_s[local_feature_index])),
                "source_midi_proxy": _maybe_number(track.midi_proxy[local_feature_index], np=np),
                "source_voicing_confidence": _maybe_number(track.voicing_confidence[local_feature_index], np=np),
                "source_rms_dbfs_proxy": _maybe_number(track.rms_dbfs[local_feature_index], np=np),
                "source_onset_flux_proxy": _maybe_number(track.onset_flux[local_feature_index], np=np),
                "source_proxy_is_not_a_matching_breath_slur_legato_or_gesture_label": True,
            })
    return rows


def _exact_candidate_measurement(
    *,
    corpus_track: _CorpusTrack,
    local_start: int,
    mapping: _ScoreMapping,
    score: Mapping[str, Any],
    score_midi: Any,
    voiced: Any,
    source_valid: Any,
    np: Any,
) -> dict[str, Any]:
    """Directly remeasure one cached candidate; no source transformation occurs."""

    local_end_inclusive = local_start + mapping.span_steps
    if not 0 <= local_start < local_end_inclusive < len(corpus_track.track.time_s):
        raise ExhaustiveScoreSpanSearchError("candidate escaped its single source feature track")
    track = corpus_track.track
    source_indices = local_start + mapping.voiced_offsets
    if np.any(source_indices < local_start) or np.any(source_indices > local_end_inclusive):
        raise ExhaustiveScoreSpanSearchError("candidate control mapping escaped its source span")
    candidate_midi = track.midi_proxy[source_indices].astype(np.float64, copy=False)
    candidate_valid = source_valid[corpus_track.global_start + source_indices]
    valid = candidate_valid & np.isfinite(candidate_midi)
    score_values = score_midi[voiced]
    valid_count = int(np.count_nonzero(valid))
    voiced_count = int(len(score_values))
    coverage = valid_count / voiced_count
    numeric_flags: list[str] = []
    global_offset: float | None = None
    rmse_cents: float | None = None
    mae_cents: float | None = None
    p95_cents: float | None = None
    max_cents: float | None = None
    interval_error_cents: float | None = None
    pitch_span_delta_cents: float | None = None
    sort_key = 1_000_000.0
    if valid_count == 0:
        numeric_flags.append("no_valid_source_proxy_rows_after_voicing_gate")
    else:
        global_offset = float(np.mean(score_values[valid] - candidate_midi[valid]))
        residual_cents = (candidate_midi[valid] + global_offset - score_values[valid]) * 100.0
        absolute_residual = np.abs(residual_cents)
        rmse_cents = float(np.sqrt(np.mean(np.square(residual_cents))))
        mae_cents = float(np.mean(absolute_residual))
        p95_cents = _p95_nearest(absolute_residual, np=np)
        max_cents = float(np.max(absolute_residual))
        first_valid = int(np.flatnonzero(valid)[0])
        last_valid = int(np.flatnonzero(valid)[-1])
        source_delta = float(candidate_midi[last_valid] - candidate_midi[first_valid])
        score_delta = float(score_values[last_valid] - score_values[first_valid])
        interval_error_cents = (source_delta - score_delta) * 100.0
        source_span = float(np.max(candidate_midi[valid]) - np.min(candidate_midi[valid]))
        score_span = float(np.max(score_values[valid]) - np.min(score_values[valid]))
        pitch_span_delta_cents = (source_span - score_span) * 100.0
        sort_key = (
            rmse_cents
            + 0.25 * p95_cents
            + 0.5 * abs(interval_error_cents)
            + 100.0 * abs(math.log2(mapping.time_ratio))
            + 10_000.0 * (1.0 - coverage)
        )
        if rmse_cents > DEFAULT_MAX_PITCH_RMSE_CENTS:
            numeric_flags.append("pitch_rmse_exceeds_measurement_gate")
        if p95_cents > DEFAULT_MAX_P95_ABSOLUTE_PITCH_ERROR_CENTS:
            numeric_flags.append("pitch_p95_absolute_error_exceeds_measurement_gate")
        if abs(interval_error_cents) > DEFAULT_MAX_INTERVAL_ERROR_CENTS:
            numeric_flags.append("endpoint_interval_error_exceeds_measurement_gate")
    if coverage < DEFAULT_MIN_VALID_CONTROL_COVERAGE:
        numeric_flags.append("valid_score_control_coverage_below_measurement_gate")
    if mapping.time_ratio < DEFAULT_MIN_TIME_RATIO or mapping.time_ratio > DEFAULT_MAX_TIME_RATIO:
        numeric_flags.append("uniform_time_ratio_outside_measurement_band")
    disposition = (
        "rejected_measurement_mismatch"
        if numeric_flags
        else "measurement_in_band_but_unreviewed_not_approved"
    )
    feature_end_exclusive = local_end_inclusive + 1
    return {
        "candidate_id": (
            f"exhaustive_grid_{corpus_track.source.source_id}_{local_start:06d}_{feature_end_exclusive:06d}"
        ),
        "source": {
            "source_id": corpus_track.source.source_id,
            "sha256": corpus_track.source.sha256,
            "relative_path": corpus_track.source.relative_path,
        },
        "source_feature_contour": {
            "feature_index_range": [local_start, feature_end_exclusive],
            "feature_frame_count": feature_end_exclusive - local_start,
            "time_seconds_range": [
                _round(float(track.time_s[local_start])),
                _round(float(track.time_s[local_end_inclusive])),
            ],
            "duration_seconds": _round(
                float(track.time_s[local_end_inclusive] - track.time_s[local_start])
            ),
            "native_feature_center_range_inclusive": [
                int(track.native_frame_center[local_start]),
                int(track.native_frame_center[local_end_inclusive]),
            ],
            "single_source_feature_grid_span_verified": True,
            "strictly_contiguous_cached_feature_rows_verified": True,
            "feature_cache_proxy_only_not_audio_or_human_transcription": True,
            "not_a_raw_audio_extraction_or_modification": True,
        },
        "single_global_measurements": {
            "global_pitch_offset_semitones": _round(global_offset) if global_offset is not None else None,
            "uniform_time_ratio_source_seconds_per_score_second": _round(mapping.time_ratio),
            "global_pitch_offset_measurement_not_applied": True,
            "uniform_time_ratio_measurement_not_applied": True,
            "no_per_note_or_per_event_pitch_offset": True,
            "no_local_time_warp": True,
            "source_proxy_sampling": "nearest existing cached feature row; no interpolation or missing-value fill",
        },
        "pitch_fit_measurements": {
            "voiced_score_control_frame_count": voiced_count,
            "valid_compared_control_frame_count": valid_count,
            "valid_control_coverage": _round(coverage),
            "pitch_rmse_cents": _round(rmse_cents) if rmse_cents is not None else None,
            "pitch_mean_absolute_error_cents": _round(mae_cents) if mae_cents is not None else None,
            "pitch_p95_absolute_error_cents_nearest_rank": _round(p95_cents) if p95_cents is not None else None,
            "pitch_max_absolute_error_cents": _round(max_cents) if max_cents is not None else None,
            "endpoint_interval_error_cents": _round(interval_error_cents) if interval_error_cents is not None else None,
            "pitch_span_delta_cents": _round(pitch_span_delta_cents) if pitch_span_delta_cents is not None else None,
        },
        "authored_control_boundary_measurements": _boundary_measurements(
            score,
            mapping=mapping,
            corpus_track=corpus_track,
            local_start=local_start,
            np=np,
        ),
        "measurement_sort_key_cents_equivalent_not_quality": _round(sort_key),
        "numeric_mismatch_flags": numeric_flags,
        "automated_disposition": disposition,
        "natural_phrase_or_slur_status": "not_claimed_not_approved_not_inferred",
        "required_human_review": True,
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
        "source_id",
        "feature_start_index",
        "feature_end_index_exclusive",
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
        for rank, row in enumerate(rows, 1):
            source = row["source"]
            contour = row["source_feature_contour"]
            measurements = row["single_global_measurements"]
            pitch = row["pitch_fit_measurements"]
            values = [
                rank,
                row["candidate_id"],
                source["source_id"],
                contour["feature_index_range"][0],
                contour["feature_index_range"][1],
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


def _score_summary(score: Mapping[str, Any], *, score_midi: Any, voiced: Any, np: Any) -> dict[str, Any]:
    counts: dict[str, int] = {}
    for event in score["events"]:
        articulation = str(event["articulation"])
        counts[articulation] = counts.get(articulation, 0) + 1
    return {
        "plan_basename": Path(score["plan_path"]).name,
        "plan_sha256": score["plan_sha256"],
        "instrument_id": "daegeum",
        "control_hz": int(score["control_hz"]),
        "duration_seconds": _round(float(score["duration_seconds"])),
        "control_frame_count": int(len(score["frame_times_seconds"])),
        "voiced_control_frame_count": int(np.count_nonzero(voiced)),
        "event_count": len(score["events"]),
        "authored_articulation_counts": dict(sorted(counts.items())),
        "explicit_authorial_slur_event_ids": [
            event["id"] for event in score["events"] if event["articulation"] == "slur"
        ],
        "score_controls_are_authorial_not_source_performance_labels": True,
        "score_pitch_min_midi_proxy": _round(float(np.min(score_midi[voiced]))),
        "score_pitch_max_midi_proxy": _round(float(np.max(score_midi[voiced]))),
    }


def build_exhaustive_score_span_search(
    bundle_dir: str | Path,
    score_plan: str | Path,
    output_dir: str | Path,
    *,
    top_results: int = DEFAULT_TOP_RESULTS,
) -> dict[str, Any]:
    """Write a fresh feature-grid exhaustive R&D report without touching audio."""

    if type(top_results) is not int or not 1 <= top_results <= 512:
        raise ExhaustiveScoreSpanSearchError("--top-results must be an integer in [1, 512]")
    np = _require_numpy()
    bundle = Path(bundle_dir).expanduser().resolve()
    plan_path = Path(score_plan).expanduser().resolve()
    output = Path(output_dir).expanduser().resolve()
    if not bundle.is_dir():
        raise ExhaustiveScoreSpanSearchError("--bundle must name an existing feature-cache bundle")
    if not plan_path.is_file():
        raise ExhaustiveScoreSpanSearchError("--score-plan must name an existing score-expression plan")
    if output.exists():
        raise ExhaustiveScoreSpanSearchError("--output-dir must be fresh; refusing to overwrite an R&D report")
    try:
        score = compile_plan(plan_path)
    except ScoreExpressionError as exc:
        raise ExhaustiveScoreSpanSearchError(str(exc)) from exc
    score_midi = _midi_from_hz(score["f0_hz"].astype(np.float64, copy=False), np=np)
    voiced = np.isfinite(score_midi)
    voiced_count = int(np.count_nonzero(voiced))
    if voiced_count == 0:
        raise ExhaustiveScoreSpanSearchError("compiled score has no voiced pitch controls")
    score_duration = _finite(score["duration_seconds"], label="compiled score duration", minimum=1.0e-9)

    tracks, source_midi, source_confidence, owner, hop, catalog_sha256 = _common_uniform_grid(bundle, np=np)
    source_valid = (
        np.isfinite(source_midi)
        & np.isfinite(source_confidence)
        & (source_confidence >= DEFAULT_MIN_SOURCE_VOICING_CONFIDENCE)
    )
    valid_float = source_valid.astype(np.float64, copy=False)
    valid_midi = np.where(source_valid, source_midi, 0.0)
    valid_midi_squared = np.square(valid_midi)
    signal_length = len(source_midi)

    min_steps = int(math.ceil((DEFAULT_MIN_TIME_RATIO * score_duration / hop) - 1.0e-12))
    max_steps = int(math.floor((DEFAULT_MAX_TIME_RATIO * score_duration / hop) + 1.0e-12))
    if min_steps < 1 or max_steps < min_steps:
        raise ExhaustiveScoreSpanSearchError("score duration and feature grid have no admissible duration-derived spans")
    longest_track = max(len(item.track.time_s) for item in tracks)
    if longest_track < min_steps + 1:
        raise ExhaustiveScoreSpanSearchError("no source track is long enough for the minimum time-ratio span")
    fft_length = _next_power_of_two(signal_length + max_steps + 1 - 1)
    valid_fft = np.fft.rfft(valid_float, n=fft_length)
    midi_fft = np.fft.rfft(valid_midi, n=fft_length)
    midi_squared_fft = np.fft.rfft(valid_midi_squared, n=fft_length)
    minimum_valid_count = int(math.ceil(DEFAULT_MIN_VALID_CONTROL_COVERAGE * voiced_count - 1.0e-12))

    # A top-K result across the complete scan must be present in the top-K of
    # its own duration bucket.  Keeping that small union permits exact
    # framewise P95/endpoint remeasurement without retaining 37M candidates.
    exact_keys: set[tuple[int, int]] = set()
    counts = {
        "feature_grid_single_source_spans_scanned": 0,
        "coverage_gate_pass_count": 0,
        "rmse_gate_pass_count_before_ancillary_exact_measurement": 0,
    }
    mappings: dict[int, _ScoreMapping] = {}
    for span_steps in range(min_steps, max_steps + 1):
        mapping = _score_mapping(
            span_steps=span_steps,
            score=score,
            score_midi=score_midi,
            voiced=voiced,
            feature_hop_seconds=hop,
            np=np,
        )
        mappings[span_steps] = mapping
        kernel_length = span_steps + 1
        weight_fft = _kernel_fft(mapping.weights, fft_length=fft_length, np=np)
        target_fft = _kernel_fft(mapping.target_sum, fft_length=fft_length, np=np)
        target_squared_fft = _kernel_fft(mapping.target_squared_sum, fft_length=fft_length, np=np)
        compared_count = np.rint(_correlation_from_ffts(
            valid_fft, weight_fft,
            signal_length=signal_length,
            kernel_length=kernel_length,
            fft_length=fft_length,
            np=np,
        )).astype(np.int64, copy=False)
        source_sum = _correlation_from_ffts(
            midi_fft, weight_fft,
            signal_length=signal_length,
            kernel_length=kernel_length,
            fft_length=fft_length,
            np=np,
        )
        source_squared_sum = _correlation_from_ffts(
            midi_squared_fft, weight_fft,
            signal_length=signal_length,
            kernel_length=kernel_length,
            fft_length=fft_length,
            np=np,
        )
        target_valid_sum = _correlation_from_ffts(
            valid_fft, target_fft,
            signal_length=signal_length,
            kernel_length=kernel_length,
            fft_length=fft_length,
            np=np,
        )
        target_valid_squared_sum = _correlation_from_ffts(
            valid_fft, target_squared_fft,
            signal_length=signal_length,
            kernel_length=kernel_length,
            fft_length=fft_length,
            np=np,
        )
        source_target_sum = _correlation_from_ffts(
            midi_fft, target_fft,
            signal_length=signal_length,
            kernel_length=kernel_length,
            fft_length=fft_length,
            np=np,
        )
        starts = np.arange(len(compared_count), dtype=np.int64)
        same_source = owner[starts] == owner[starts + span_steps]
        if np.any(compared_count < 0) or np.any(compared_count > voiced_count):
            raise ExhaustiveScoreSpanSearchError("FFT coverage calculation left the permitted integer range")
        counts["feature_grid_single_source_spans_scanned"] += int(np.count_nonzero(same_source))
        coverage_pass = same_source & (compared_count >= minimum_valid_count)
        counts["coverage_gate_pass_count"] += int(np.count_nonzero(coverage_pass))
        denominator = np.where(compared_count > 0, compared_count, 1).astype(np.float64, copy=False)
        sse = (
            source_squared_sum
            + target_valid_squared_sum
            - 2.0 * source_target_sum
            - np.square(source_sum - target_valid_sum) / denominator
        )
        # Tiny negative values can arise from a finite-precision FFT identity;
        # no negative squared error is physically/numerically meaningful.
        sse = np.maximum(sse, 0.0)
        rmse_cents = np.sqrt(sse / denominator) * 100.0
        rmse_pass = coverage_pass & (rmse_cents <= DEFAULT_MAX_PITCH_RMSE_CENTS + 1.0e-9)
        counts["rmse_gate_pass_count_before_ancillary_exact_measurement"] += int(np.count_nonzero(rmse_pass))
        for start in np.flatnonzero(rmse_pass):
            exact_keys.add(_candidate_tuple_key(span_steps, int(start)))
        for start in _select_lowest_rmse_starts(rmse_cents, coverage_pass, top=top_results, np=np):
            exact_keys.add(_candidate_tuple_key(span_steps, start))

    tracks_by_ordinal = {item.ordinal: item for item in tracks}
    exact_rows: list[dict[str, Any]] = []
    for span_steps, global_start in sorted(exact_keys):
        ordinal = int(owner[global_start])
        corpus_track = tracks_by_ordinal[ordinal]
        local_start = global_start - corpus_track.global_start
        exact_rows.append(_exact_candidate_measurement(
            corpus_track=corpus_track,
            local_start=local_start,
            mapping=mappings[span_steps],
            score=score,
            score_midi=score_midi,
            voiced=voiced,
            source_valid=source_valid,
            np=np,
        ))

    # Exact rows include every RMSE/coverage in-band precursor plus enough
    # per-duration candidates to determine the global best-K RMSE results.
    # Sort by the direct remeasurement rather than the FFT screening array.
    exact_rows.sort(
        key=lambda row: (
            float(row["pitch_fit_measurements"]["pitch_rmse_cents"]
                  if row["pitch_fit_measurements"]["pitch_rmse_cents"] is not None else float("inf")),
            row["candidate_id"],
        )
    )
    in_band_rows = [
        row for row in exact_rows
        if row["automated_disposition"] == "measurement_in_band_but_unreviewed_not_approved"
    ]
    # Every pre-ancillary RMSE pass was remeasured exactly.  A mismatch here
    # would mean the FFT shortcut changed the metric, so make it a hard error.
    remeasured_core_count = sum(
        row["pitch_fit_measurements"]["pitch_rmse_cents"] is not None
        and row["pitch_fit_measurements"]["pitch_rmse_cents"] <= DEFAULT_MAX_PITCH_RMSE_CENTS
        and row["pitch_fit_measurements"]["valid_control_coverage"] >= DEFAULT_MIN_VALID_CONTROL_COVERAGE
        for row in exact_rows
    )
    if remeasured_core_count != counts["rmse_gate_pass_count_before_ancillary_exact_measurement"]:
        raise ExhaustiveScoreSpanSearchError(
            "FFT/direct core-gate count disagreement; refusing to publish an exhaustive report"
        )

    reported_best = exact_rows[:top_results]
    reported_in_band = sorted(
        in_band_rows,
        key=lambda row: (
            float(row["measurement_sort_key_cents_equivalent_not_quality"]),
            row["candidate_id"],
        ),
    )[:top_results]
    result: dict[str, Any] = {
        "schema": EXHAUSTIVE_SCORE_SPAN_SEARCH_SCHEMA,
        "artifact_kind": "unreviewed_offline_exhaustive_feature_grid_score_to_source_measurement",
        "input": {
            "bundle_directory_basename": bundle.name,
            "source_catalog_sha256": catalog_sha256,
            "score_plan": _score_summary(score, score_midi=score_midi, voiced=voiced, np=np),
        },
        "exhaustive_enumeration": {
            "source_track_count": len(tracks),
            "total_feature_cache_rows": int(signal_length),
            "common_feature_hop_seconds": _round(hop),
            "source_span_coordinate_system": "every existing feature-grid start and end centre within one source track",
            "source_span_endpoints_are_cached_feature_centres_not_raw_audio_edits": True,
            "span_step_range_inclusive": [min_steps, max_steps],
            "span_duration_seconds_range_inclusive": [
                _round(min_steps * hop),
                _round(max_steps * hop),
            ],
            "uniform_time_ratio_range_inclusive": [
                _round((min_steps * hop) / score_duration),
                _round((max_steps * hop) / score_duration),
            ],
            "all_admissible_single_source_feature_grid_spans_scanned": True,
            "scan_does_not_read_or_modify_source_audio": True,
            "fft_is_an_exact_aggregate_measurement_accelerator_not_a_source_transform": True,
        },
        "measurement_contract": {
            "one_global_pitch_offset_per_candidate_only": True,
            "one_uniform_duration_derived_time_ratio_per_candidate_only": True,
            "no_per_note_or_per_event_pitch_offset": True,
            "no_local_time_warp": True,
            "nearest_existing_feature_cache_rows_only_no_interpolation_or_missing_value_fill": True,
            "acceptance_thresholds_are_fixed_to_established_score_phrase_compatibility_gates": True,
            "thresholds": {
                "min_source_voicing_confidence": DEFAULT_MIN_SOURCE_VOICING_CONFIDENCE,
                "min_time_ratio": DEFAULT_MIN_TIME_RATIO,
                "max_time_ratio": DEFAULT_MAX_TIME_RATIO,
                "max_pitch_rmse_cents": DEFAULT_MAX_PITCH_RMSE_CENTS,
                "max_p95_absolute_pitch_error_cents": DEFAULT_MAX_P95_ABSOLUTE_PITCH_ERROR_CENTS,
                "max_interval_error_cents": DEFAULT_MAX_INTERVAL_ERROR_CENTS,
                "min_valid_control_coverage": DEFAULT_MIN_VALID_CONTROL_COVERAGE,
            },
            "short_circuit_policy": (
                "A span failing coverage or RMSE is already rejected; P95/endpoint checks are directly remeasured "
                "for every coverage-and-RMSE pass and every reported best candidate."
            ),
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
            **counts,
            "exactly_remeasured_candidate_count": len(exact_rows),
            "all_numeric_measurement_gates_in_band_unreviewed_count": len(in_band_rows),
            "numeric_measurement_mismatch_rejected_count": (
                counts["feature_grid_single_source_spans_scanned"] - len(in_band_rows)
            ),
            "reported_best_candidate_count": len(reported_best),
            "reported_in_band_candidate_count": len(reported_in_band),
            "unreported_in_band_candidate_count": len(in_band_rows) - len(reported_in_band),
        },
        "overall_disposition": (
            "one_or_more_spans_are_numeric_measurement_in_band_but_remain_unreviewed_not_approved"
            if in_band_rows
            else "no_scanned_span_passed_all_fixed_numeric_measurement_gates"
        ),
        "best_coverage_qualified_candidates_ranked_by_exact_rmse": reported_best,
        "all_numeric_measurement_in_band_candidates_ranked_by_measurement_only": reported_in_band,
    }
    output.mkdir(parents=True, exist_ok=False)
    _json_dump(output / REPORT_FILENAME, result)
    _write_tsv(output / TSV_FILENAME, reported_best)
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", help="existing uniform-grid R&D feature-cache bundle")
    parser.add_argument("--score-plan", help="explicit score-expression plan JSON")
    parser.add_argument("--output-dir", help="fresh ignored R&D-only report directory")
    parser.add_argument(
        "--top-results",
        type=int,
        default=DEFAULT_TOP_RESULTS,
        help="number of exact best/in-band rows to report (1-512; does not change scan or gates)",
    )
    parser.add_argument("--dry-run", action="store_true", help="print the no-transform exhaustive scan contract")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.dry_run:
        print(
            "exhaustive_score_span_search: would scan every admissible single-source cached feature-grid span using "
            "one global pitch offset and one duration-derived uniform time ratio; it will not open WAV, transform "
            "audio or score controls, infer phrase/breath/slur/legato, train, or change runtime BGM."
        )
        return 0
    missing = [name for name in ("bundle", "score_plan", "output_dir") if not getattr(args, name)]
    if missing:
        _parser().error("required unless --dry-run: " + ", ".join("--" + name.replace("_", "-") for name in missing))
    try:
        result = build_exhaustive_score_span_search(
            args.bundle,
            args.score_plan,
            args.output_dir,
            top_results=args.top_results,
        )
    except ExhaustiveScoreSpanSearchError as exc:
        print(f"exhaustive_score_span_search: error: {exc}", file=sys.stderr)
        return 2
    print(
        "exhaustive_score_span_search: scanned "
        f"{result['counts']['feature_grid_single_source_spans_scanned']} single-source feature-grid spans; "
        f"in-band unreviewed={result['counts']['all_numeric_measurement_gates_in_band_unreviewed_count']}; "
        f"output={REPORT_FILENAME}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
