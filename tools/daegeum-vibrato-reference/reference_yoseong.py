#!/usr/bin/env python3
"""Extract an *unreviewed* Daegeum pitch-modulation reference shape.

The input is an existing R&D-06 transition-bank feature bundle.  This tool
never opens a raw WAV and never writes into the source bundle.  It scans
strictly internal, contiguous voiced feature windows for a periodic F0-proxy
residual, ranks the windows, and exports one normalized-time contour for an
offline B2 audition.

An automatic periodic contour is not a musicological label.  In particular,
the output does not claim that a window is yoseong, that it belongs to a
Gyeonggi-minyo style, that it is a phrase boundary, or that the surrounding
source matches any score.  A passing result is therefore always labelled
``reference_shape_unreviewed``.  Rights remain unverified and the export is
neither a training item nor a game asset.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Mapping, Sequence


RND06_SCHEMA = "durango.daegeum.transition-bank.v1"
FEATURE_SCHEMA = "durango.daegeum.expression-features.v1"
OUTPUT_SCHEMA = "durango.daegeum.reference-yoseong-contour.v1"

REQUIRED_ARRAYS = (
    "native_frame_center",
    "time_s",
    "f0_hz",
    "midi_proxy",
    "voicing_confidence",
    "rms_dbfs",
    "onset_flux",
)

DEFAULT_WINDOW_SECONDS = (0.9, 1.2, 1.5)
DEFAULT_STRIDE_FRAMES = 5
DEFAULT_EDGE_MARGIN_SECONDS = 0.12
DEFAULT_CONTOUR_POINTS = 65
DEFAULT_TOP = 24


class ReferenceYoseongError(RuntimeError):
    """Raised when the feature input or extraction request is unsafe."""


@dataclass(frozen=True)
class SourceRecord:
    source_id: str
    source_sha256: str
    source_relative_path: str
    sample_rate_hz: int
    native_frame_count: int
    rights_status: str
    training_or_distribution_requires_source_term_confirmation: bool


@dataclass(frozen=True)
class FeatureTrack:
    source: SourceRecord
    metadata_relative_path: str
    npz_relative_path: str
    metadata_sha256: str
    npz_sha256: str
    feature_hop_seconds: float
    feature_window_seconds: float
    f0_method: str
    f0_range_hz: tuple[float, float]
    native_frame_center: Any
    time_s: Any
    f0_hz: Any
    midi_proxy: Any
    voicing_confidence: Any
    rms_dbfs: Any
    onset_flux: Any


def _require_numpy() -> Any:
    try:
        import numpy as np
    except ModuleNotFoundError as exc:
        raise ReferenceYoseongError(
            "NumPy is required; use the established R&D virtual environment"
        ) from exc
    return np


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


def _round(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def _json_load(path: Path, *, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ReferenceYoseongError(f"missing {label}: {path.name}") from exc
    except json.JSONDecodeError as exc:
        raise ReferenceYoseongError(f"{label} is not valid JSON") from exc


def _json_dump_new(path: Path, value: Any) -> None:
    if path.exists():
        raise ReferenceYoseongError(f"refusing to overwrite output: {path.name}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _strict_int(value: Any, *, label: str, minimum: int = 0) -> int:
    if type(value) is not int or value < minimum:
        raise ReferenceYoseongError(f"{label} must be an integer >= {minimum}")
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
        raise ReferenceYoseongError(f"{label} must be finite") from exc
    if not math.isfinite(number):
        raise ReferenceYoseongError(f"{label} must be finite")
    if minimum is not None and number < minimum:
        raise ReferenceYoseongError(f"{label} is below {minimum}")
    if maximum is not None and number > maximum:
        raise ReferenceYoseongError(f"{label} exceeds {maximum}")
    return number


def _safe_relative(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value:
        raise ReferenceYoseongError(f"{label} must be a POSIX relative path")
    parsed = PurePosixPath(value)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise ReferenceYoseongError(f"{label} must be a safe POSIX relative path")
    return parsed.as_posix()


def _bundle_child(bundle: Path, relative: str, *, label: str) -> Path:
    child = (bundle / PurePosixPath(relative)).resolve()
    try:
        child.relative_to(bundle)
    except ValueError as exc:
        raise ReferenceYoseongError(f"{label} escapes the source bundle") from exc
    return child


def parse_window_seconds(value: str | Sequence[float]) -> tuple[float, ...]:
    if isinstance(value, str):
        raw = value.split(",")
    else:
        raw = list(value)
    windows = tuple(
        _finite_float(item, label="window duration", minimum=0.65, maximum=4.0)
        for item in raw
    )
    if not windows or tuple(sorted(set(windows))) != windows:
        raise ReferenceYoseongError(
            "window durations must be unique and strictly increasing"
        )
    return windows


def _load_catalog(bundle: Path) -> tuple[list[SourceRecord], str]:
    catalog_path = bundle / "source_catalog.json"
    data = _json_load(catalog_path, label="source_catalog.json")
    if (
        not isinstance(data, Mapping)
        or data.get("schema") != f"{RND06_SCHEMA}.source-catalog.v1"
    ):
        raise ReferenceYoseongError("unexpected source catalog schema")
    rows = data.get("files")
    if not isinstance(rows, list) or not rows:
        raise ReferenceYoseongError("source catalog contains no files")

    sources: list[SourceRecord] = []
    seen: set[str] = set()
    for index, row in enumerate(rows):
        if not isinstance(row, Mapping):
            raise ReferenceYoseongError(f"catalog row {index} is not an object")
        source_id = row.get("source_id")
        source_sha = row.get("sha256")
        if not isinstance(source_id, str) or not source_id:
            raise ReferenceYoseongError(f"catalog row {index} lacks source_id")
        if source_id in seen:
            raise ReferenceYoseongError(f"duplicate source_id: {source_id}")
        seen.add(source_id)
        if (
            not isinstance(source_sha, str)
            or len(source_sha) != 64
            or any(ch not in "0123456789abcdef" for ch in source_sha)
        ):
            raise ReferenceYoseongError(f"{source_id} lacks a lowercase SHA-256")
        native = row.get("native")
        if not isinstance(native, Mapping):
            raise ReferenceYoseongError(f"{source_id} lacks native metadata")
        rights = row.get("rights")
        if not isinstance(rights, Mapping):
            rights = {}
        rights_status = rights.get("status", "unknown")
        if not isinstance(rights_status, str):
            raise ReferenceYoseongError(f"{source_id} has malformed rights status")
        sources.append(SourceRecord(
            source_id=source_id,
            source_sha256=source_sha,
            source_relative_path=_safe_relative(
                row.get("relative_path"), label=f"{source_id}.relative_path"
            ),
            sample_rate_hz=_strict_int(
                native.get("sample_rate_hz"),
                label=f"{source_id}.sample_rate_hz",
                minimum=1,
            ),
            native_frame_count=_strict_int(
                native.get("frame_count"),
                label=f"{source_id}.frame_count",
                minimum=1,
            ),
            rights_status=rights_status,
            training_or_distribution_requires_source_term_confirmation=bool(
                rights.get(
                    "training_or_distribution_requires_source_term_confirmation",
                    True,
                )
            ),
        ))
    return sources, _sha256(catalog_path)


def _load_track(bundle: Path, source: SourceRecord, *, np: Any) -> FeatureTrack:
    metadata_relative = f"features/{source.source_id}.json"
    metadata_path = _bundle_child(
        bundle, metadata_relative, label=f"{source.source_id} feature metadata"
    )
    metadata = _json_load(metadata_path, label=metadata_relative)
    if not isinstance(metadata, Mapping) or metadata.get("schema") != FEATURE_SCHEMA:
        raise ReferenceYoseongError(
            f"{source.source_id} has unexpected feature metadata schema"
        )
    if metadata.get("source_id") != source.source_id:
        raise ReferenceYoseongError(f"{source.source_id} feature source_id mismatch")
    if metadata.get("source_sha256") != source.source_sha256:
        raise ReferenceYoseongError(f"{source.source_id} feature source SHA mismatch")
    if metadata.get("relative_path") != source.source_relative_path:
        raise ReferenceYoseongError(f"{source.source_id} feature relative path mismatch")

    npz_relative = _safe_relative(
        metadata.get("npz"), label=f"{source.source_id}.npz"
    )
    if npz_relative != f"features/{source.source_id}.npz":
        raise ReferenceYoseongError(f"{source.source_id} uses a non-canonical NPZ path")
    npz_path = _bundle_child(bundle, npz_relative, label=f"{source.source_id} NPZ")
    try:
        with np.load(npz_path, allow_pickle=False) as archive:
            missing = sorted(set(REQUIRED_ARRAYS).difference(archive.files))
            if missing:
                raise ReferenceYoseongError(
                    f"{source.source_id} NPZ lacks arrays: {', '.join(missing)}"
                )
            arrays = {name: archive[name] for name in REQUIRED_ARRAYS}
    except (OSError, ValueError) as exc:
        raise ReferenceYoseongError(f"cannot safely load {npz_relative}") from exc

    count = _strict_int(
        metadata.get("feature_count"),
        label=f"{source.source_id}.feature_count",
        minimum=1,
    )
    if any(array.ndim != 1 or len(array) != count for array in arrays.values()):
        raise ReferenceYoseongError(
            f"{source.source_id} feature arrays do not share declared 1-D length"
        )
    times = arrays["time_s"].astype(np.float64, copy=False)
    native_centres = arrays["native_frame_center"]
    if not np.all(np.isfinite(times)) or not np.all(np.diff(times) > 0.0):
        raise ReferenceYoseongError(f"{source.source_id} feature time is not monotonic")
    if not np.issubdtype(native_centres.dtype, np.integer):
        raise ReferenceYoseongError(f"{source.source_id} native centres are not integer")
    if not np.all(np.diff(native_centres) > 0):
        raise ReferenceYoseongError(f"{source.source_id} native centres are not monotonic")
    if int(native_centres[-1]) >= source.native_frame_count:
        raise ReferenceYoseongError(f"{source.source_id} feature centre exceeds source")

    f0_values = arrays["f0_hz"].astype(np.float64, copy=False)
    midi_values = arrays["midi_proxy"].astype(np.float64, copy=False)
    paired = np.isfinite(f0_values) & (f0_values > 0.0) & np.isfinite(midi_values)
    if np.any(paired):
        midi_from_f0 = 69.0 + 12.0 * np.log2(f0_values[paired] / 440.0)
        if float(np.max(np.abs(midi_from_f0 - midi_values[paired]))) > 0.002:
            raise ReferenceYoseongError(
                f"{source.source_id} f0_hz/midi_proxy identity mismatch"
            )
    if not np.array_equal(
        np.isfinite(f0_values) & (f0_values > 0.0), np.isfinite(midi_values)
    ):
        raise ReferenceYoseongError(
            f"{source.source_id} f0_hz/midi_proxy voicing masks disagree"
        )

    analysis = metadata.get("analysis")
    if not isinstance(analysis, Mapping):
        raise ReferenceYoseongError(f"{source.source_id} lacks analysis metadata")
    hop = _finite_float(
        analysis.get("feature_hop_s"),
        label=f"{source.source_id}.feature_hop_s",
        minimum=1e-5,
        maximum=0.1,
    )
    window = _finite_float(
        analysis.get("feature_window_s"),
        label=f"{source.source_id}.feature_window_s",
        minimum=hop,
        maximum=0.5,
    )
    measured_hop = float(np.median(np.diff(times)))
    if abs(measured_hop - hop) > max(1e-7, hop * 1e-3):
        raise ReferenceYoseongError(f"{source.source_id} declared/measured hop mismatch")
    f0_method = analysis.get("f0_method", "unspecified_proxy")
    if not isinstance(f0_method, str):
        raise ReferenceYoseongError(f"{source.source_id} f0_method is malformed")
    f0_range = analysis.get("f0_range_hz", [65.0, 1000.0])
    if not isinstance(f0_range, list) or len(f0_range) != 2:
        raise ReferenceYoseongError(f"{source.source_id} f0_range_hz is malformed")
    low = _finite_float(
        f0_range[0], label=f"{source.source_id}.f0_range_low", minimum=1.0
    )
    high = _finite_float(
        f0_range[1], label=f"{source.source_id}.f0_range_high", minimum=low
    )

    return FeatureTrack(
        source=source,
        metadata_relative_path=metadata_relative,
        npz_relative_path=npz_relative,
        metadata_sha256=_sha256(metadata_path),
        npz_sha256=_sha256(npz_path),
        feature_hop_seconds=hop,
        feature_window_seconds=window,
        f0_method=f0_method,
        f0_range_hz=(low, high),
        native_frame_center=native_centres.astype(np.int64, copy=False),
        time_s=times,
        f0_hz=f0_values,
        midi_proxy=midi_values,
        voicing_confidence=arrays["voicing_confidence"].astype(np.float64, copy=False),
        rms_dbfs=arrays["rms_dbfs"].astype(np.float64, copy=False),
        onset_flux=arrays["onset_flux"].astype(np.float64, copy=False),
    )


def _contiguous_runs(mask: Any, times: Any, *, hop: float, np: Any) -> list[tuple[int, int]]:
    indices = np.flatnonzero(mask)
    if len(indices) == 0:
        return []
    runs: list[tuple[int, int]] = []
    start = int(indices[0])
    previous = start
    for raw_index in indices[1:]:
        index = int(raw_index)
        if index != previous + 1 or float(times[index] - times[previous]) > hop * 1.5:
            runs.append((start, previous + 1))
            start = index
        previous = index
    runs.append((start, previous + 1))
    return runs


def _smooth(values: Any, *, np: Any) -> Any:
    if len(values) < 5:
        return values.astype(np.float64, copy=True)
    # A short symmetric smoother suppresses frame-wise autocorrelation jitter
    # without manufacturing multi-frame pitch motion.
    kernel = np.asarray([1.0, 2.0, 3.0, 2.0, 1.0], dtype=np.float64) / 9.0
    padded = np.pad(values.astype(np.float64, copy=False), (2, 2), mode="edge")
    return np.convolve(padded, kernel, mode="valid")


def _periodicity_metrics(residual: Any, *, hop: float, np: Any) -> dict[str, float] | None:
    signal = residual.astype(np.float64, copy=False) - float(np.mean(residual))
    energy = float(np.dot(signal, signal))
    if not math.isfinite(energy) or energy <= 1e-8:
        return None

    min_rate = 2.3
    max_rate = 8.0
    min_lag = max(2, int(math.ceil(1.0 / (max_rate * hop))))
    max_lag = min(len(signal) // 2, int(math.floor(1.0 / (min_rate * hop))))
    if max_lag <= min_lag:
        return None
    correlations: list[tuple[int, float]] = []
    for lag in range(min_lag, max_lag + 1):
        left = signal[:-lag]
        right = signal[lag:]
        denom = math.sqrt(float(np.dot(left, left) * np.dot(right, right)))
        correlations.append((lag, float(np.dot(left, right) / denom) if denom else -1.0))
    best_index = max(range(len(correlations)), key=lambda index: correlations[index][1])
    best_lag, best_correlation = correlations[best_index]
    refined_lag = float(best_lag)
    if 0 < best_index < len(correlations) - 1:
        left_y = correlations[best_index - 1][1]
        centre_y = best_correlation
        right_y = correlations[best_index + 1][1]
        denominator = left_y - 2.0 * centre_y + right_y
        if abs(denominator) > 1e-9:
            delta = 0.5 * (left_y - right_y) / denominator
            if abs(delta) <= 1.0:
                refined_lag += delta
    autocorrelation_rate = 1.0 / (refined_lag * hop)

    tapered = signal * np.hanning(len(signal))
    spectrum = np.abs(np.fft.rfft(tapered)) ** 2
    frequencies = np.fft.rfftfreq(len(signal), d=hop)
    analysis_mask = (frequencies >= 0.7) & (frequencies <= 12.0)
    band_mask = (frequencies >= min_rate) & (frequencies <= max_rate)
    analysis_power = float(np.sum(spectrum[analysis_mask]))
    band_power = float(np.sum(spectrum[band_mask]))
    if analysis_power <= 1e-12 or band_power <= 1e-12:
        return None
    band_indices = np.flatnonzero(band_mask)
    peak_index = int(band_indices[int(np.argmax(spectrum[band_mask]))])
    fft_rate = float(frequencies[peak_index])
    peak_band_fraction = float(spectrum[peak_index] / band_power)
    return {
        "autocorrelation_rate_hz": autocorrelation_rate,
        "autocorrelation_peak": best_correlation,
        "fft_rate_hz": fft_rate,
        "rate_disagreement_hz": abs(autocorrelation_rate - fft_rate),
        "band_power_ratio": band_power / analysis_power,
        "fft_peak_band_fraction": peak_band_fraction,
    }


def _candidate_metrics(
    track: FeatureTrack,
    start: int,
    end: int,
    *,
    np: Any,
) -> tuple[dict[str, Any] | None, list[str]]:
    reasons: list[str] = []
    f0 = track.f0_hz[start:end]
    midi = track.midi_proxy[start:end]
    confidence = track.voicing_confidence[start:end]
    rms = track.rms_dbfs[start:end]
    flux = track.onset_flux[start:end]
    times = track.time_s[start:end]

    low_f0, high_f0 = track.f0_range_hz
    if float(np.min(f0)) <= low_f0 * 1.01 or float(np.max(f0)) >= high_f0 * 0.99:
        reasons.append("f0_proxy_touches_estimator_range_edge")
    confidence_p10 = float(np.percentile(confidence, 10.0))
    confidence_median = float(np.median(confidence))
    if confidence_p10 < 0.55 or confidence_median < 0.72:
        reasons.append("voicing_confidence_below_gate")
    rms_p10 = float(np.percentile(rms, 10.0))
    rms_iqr = float(np.percentile(rms, 75.0) - np.percentile(rms, 25.0))
    if rms_p10 < -55.0:
        reasons.append("rms_proxy_below_gate")
    if rms_iqr > 16.0:
        reasons.append("rms_proxy_too_discontinuous")

    cents = midi * 100.0
    smoothed = _smooth(cents, np=np)
    relative_time = times - times[0]
    design = np.column_stack((np.ones(len(relative_time)), relative_time))
    coefficients, _, _, _ = np.linalg.lstsq(design, smoothed, rcond=None)
    centreline = design @ coefficients
    residual = smoothed - centreline
    residual -= float(np.median(residual))
    pitch_depth = 0.5 * float(
        np.percentile(residual, 95.0) - np.percentile(residual, 5.0)
    )
    robust_span = float(np.percentile(smoothed, 95.0) - np.percentile(smoothed, 5.0))
    trend_rate = float(coefficients[1])
    adjacent = np.abs(np.diff(smoothed))
    adjacent_p95 = float(np.percentile(adjacent, 95.0))
    adjacent_max = float(np.max(adjacent))
    if pitch_depth < 8.0:
        reasons.append("periodic_pitch_depth_below_gate")
    if pitch_depth > 180.0 or robust_span > 380.0:
        reasons.append("pitch_motion_too_large_for_sustained_note_proxy")
    if abs(trend_rate) > 90.0:
        reasons.append("linear_pitch_drift_exceeds_sustained_note_gate")
    if adjacent_p95 > 50.0 or adjacent_max > 125.0:
        reasons.append("adjacent_pitch_step_exceeds_sustained_note_gate")

    periodicity = _periodicity_metrics(residual, hop=track.feature_hop_seconds, np=np)
    if periodicity is None:
        reasons.append("periodicity_could_not_be_estimated")
    else:
        if periodicity["autocorrelation_peak"] < 0.48:
            reasons.append("autocorrelation_periodicity_below_gate")
        if periodicity["band_power_ratio"] < 0.55:
            reasons.append("vibrato_band_power_ratio_below_gate")
        if periodicity["fft_peak_band_fraction"] < 0.17:
            reasons.append("vibrato_band_peak_concentration_below_gate")
        if periodicity["rate_disagreement_hz"] > 1.35:
            reasons.append("periodicity_rate_estimators_disagree")
        duration = float((end - start) * track.feature_hop_seconds)
        if periodicity["autocorrelation_rate_hz"] * duration < 2.2:
            reasons.append("too_few_periodic_cycles")
    if reasons:
        return None, reasons

    assert periodicity is not None
    duration = float((end - start) * track.feature_hop_seconds)
    cycle_count = periodicity["autocorrelation_rate_hz"] * duration
    depth_support = min(1.0, pitch_depth / 28.0)
    cycle_support = min(1.0, cycle_count / 4.0)
    rate_agreement = max(0.0, 1.0 - periodicity["rate_disagreement_hz"] / 1.35)
    score = (
        0.34 * periodicity["autocorrelation_peak"]
        + 0.24 * periodicity["band_power_ratio"]
        + 0.13 * periodicity["fft_peak_band_fraction"]
        + 0.10 * rate_agreement
        + 0.07 * confidence_median
        + 0.06 * cycle_support
        + 0.06 * depth_support
    )
    metrics: dict[str, Any] = {
        "ranking_score": score,
        "duration_seconds": duration,
        "rate_hz_proxy": periodicity["autocorrelation_rate_hz"],
        "fft_rate_hz_proxy": periodicity["fft_rate_hz"],
        "rate_estimator_disagreement_hz": periodicity["rate_disagreement_hz"],
        "depth_cents_proxy": pitch_depth,
        "robust_pitch_span_cents": robust_span,
        "removed_linear_centerline_slope_cents_per_second": trend_rate,
        "autocorrelation_periodicity": periodicity["autocorrelation_peak"],
        "vibrato_band_power_ratio": periodicity["band_power_ratio"],
        "fft_peak_fraction_within_vibrato_band": periodicity["fft_peak_band_fraction"],
        "estimated_cycle_count": cycle_count,
        "voicing_confidence_p10": confidence_p10,
        "voicing_confidence_median": confidence_median,
        "rms_dbfs_p10": rms_p10,
        "rms_dbfs_median": float(np.median(rms)),
        "rms_dbfs_iqr": rms_iqr,
        "onset_flux_p95": float(np.percentile(flux, 95.0)),
        "adjacent_smoothed_pitch_step_cents_p95": adjacent_p95,
        "adjacent_smoothed_pitch_step_cents_max": adjacent_max,
        "residual": residual,
    }
    return metrics, []


def _candidate_summary(
    track: FeatureTrack,
    start: int,
    end: int,
    metrics: Mapping[str, Any],
) -> dict[str, Any]:
    digest = hashlib.sha256(
        f"{track.source.source_id}:{start}:{end}".encode("utf-8")
    ).hexdigest()[:16]
    return {
        "candidate_id": f"ref_{digest}",
        "status": "automatic_periodic_f0_proxy_candidate_unreviewed",
        "source": {
            "source_id": track.source.source_id,
            "source_sha256": track.source.source_sha256,
            "source_sha256_authority": (
                "source_catalog_declared; raw WAV not reopened or rehashed by this tool"
            ),
            "source_relative_path": track.source.source_relative_path,
            "rights_status": track.source.rights_status,
        },
        "feature_provenance": {
            "feature_metadata_relative_path": track.metadata_relative_path,
            "feature_metadata_sha256": track.metadata_sha256,
            "feature_npz_relative_path": track.npz_relative_path,
            "feature_npz_sha256": track.npz_sha256,
            "feature_index_range_start_inclusive_end_exclusive": [start, end],
            "feature_time_center_range_seconds": [
                _round(track.time_s[start]),
                _round(track.time_s[end - 1]),
            ],
            "approximate_window_edge_range_seconds": [
                _round(track.time_s[start] - track.feature_hop_seconds / 2.0),
                _round(track.time_s[end - 1] + track.feature_hop_seconds / 2.0),
            ],
            "native_frame_center_range_inclusive": [
                int(track.native_frame_center[start]),
                int(track.native_frame_center[end - 1]),
            ],
            "feature_hop_seconds": _round(track.feature_hop_seconds),
            "feature_window_seconds": _round(track.feature_window_seconds),
            "f0_method": track.f0_method,
            "f0_is_proxy_not_human_pitch_label": True,
        },
        "proxy_metrics": {
            key: _round(value)
            for key, value in metrics.items()
            if key != "residual"
        },
        "claim_limits": {
            "human_reviewed": False,
            "yoseong_confirmed": False,
            "gyeonggi_minyo_style_confirmed": False,
            "phrase_or_breath_boundary_confirmed": False,
            "whole_source_phrase_score_compatibility_confirmed": False,
        },
    }


def _overlap_fraction(left: Mapping[str, Any], right: Mapping[str, Any]) -> float:
    if left["source"]["source_id"] != right["source"]["source_id"]:
        return 0.0
    a0, a1 = left["feature_provenance"][
        "feature_index_range_start_inclusive_end_exclusive"
    ]
    b0, b1 = right["feature_provenance"][
        "feature_index_range_start_inclusive_end_exclusive"
    ]
    intersection = max(0, min(a1, b1) - max(a0, b0))
    return intersection / max(1, min(a1 - a0, b1 - b0))


def _normalized_contour(
    track: FeatureTrack,
    candidate: Mapping[str, Any],
    residual: Any,
    *,
    points: int,
    np: Any,
) -> dict[str, Any]:
    start, end = candidate["feature_provenance"][
        "feature_index_range_start_inclusive_end_exclusive"
    ]
    source_positions = np.linspace(0.0, 1.0, len(residual), dtype=np.float64)
    target_positions = np.linspace(0.0, 1.0, points, dtype=np.float64)
    pitch = np.interp(target_positions, source_positions, residual)
    pitch -= float(np.median(pitch))
    rms = track.rms_dbfs[start:end]
    rms_shape = np.interp(target_positions, source_positions, rms)
    rms_shape -= float(np.median(rms_shape))
    payload = {
        "sample_count": points,
        "time_normalized_0_to_1": [_round(value) for value in target_positions],
        "pitch_residual_cents": [_round(value) for value in pitch],
        "rms_db_relative_to_candidate_median": [_round(value) for value in rms_shape],
        "normalization": {
            "time": "linear_resample_of_exact_feature_range_to_closed_unit_interval",
            "pitch": (
                "five_frame_symmetric_smoothing_then_least_squares_linear_centerline_"
                "removal_then_median_zeroing; amplitude_retained_in_cents"
            ),
            "rms": "linear_resample_then_candidate_median_subtraction_in_db",
            "no_attack_release_or_phrase_context_inferred": True,
        },
    }
    payload["contour_payload_sha256"] = _canonical_sha256(payload)
    return payload


def extract_reference_shape(
    bundle_path: Path,
    output_path: Path,
    *,
    window_seconds: str | Sequence[float] = DEFAULT_WINDOW_SECONDS,
    stride_frames: int = DEFAULT_STRIDE_FRAMES,
    edge_margin_seconds: float = DEFAULT_EDGE_MARGIN_SECONDS,
    contour_points: int = DEFAULT_CONTOUR_POINTS,
    top: int = DEFAULT_TOP,
) -> dict[str, Any]:
    """Scan a feature bundle and write one fail-closed reference export."""

    np = _require_numpy()
    bundle = Path(bundle_path).resolve()
    output = Path(output_path).resolve()
    if not bundle.is_dir():
        raise ReferenceYoseongError("bundle path is not a directory")
    try:
        output.relative_to(bundle)
    except ValueError:
        pass
    else:
        raise ReferenceYoseongError("output must be outside the read-only source bundle")
    windows = parse_window_seconds(window_seconds)
    stride = _strict_int(stride_frames, label="stride_frames", minimum=1)
    points = _strict_int(contour_points, label="contour_points", minimum=17)
    if points > 513:
        raise ReferenceYoseongError("contour_points exceeds 513")
    shortlist_size = _strict_int(top, label="top", minimum=1)
    margin = _finite_float(
        edge_margin_seconds,
        label="edge_margin_seconds",
        minimum=0.05,
        maximum=1.0,
    )

    sources, catalog_sha = _load_catalog(bundle)
    candidates_with_residual: list[tuple[dict[str, Any], FeatureTrack, Any]] = []
    counts = {
        "catalog_source_count": len(sources),
        "feature_tracks_loaded": 0,
        "contiguous_voiced_runs": 0,
        "windows_considered": 0,
        "windows_rejected": 0,
        "windows_passing_signal_gates_before_overlap_suppression": 0,
        "ranked_candidates_after_overlap_suppression": 0,
    }
    rejection_counts: dict[str, int] = {}

    for source in sources:
        track = _load_track(bundle, source, np=np)
        counts["feature_tracks_loaded"] += 1
        valid = (
            np.isfinite(track.f0_hz)
            & (track.f0_hz > 0.0)
            & np.isfinite(track.midi_proxy)
            & np.isfinite(track.voicing_confidence)
            & np.isfinite(track.rms_dbfs)
            & np.isfinite(track.onset_flux)
            & (track.voicing_confidence >= 0.45)
            & (track.rms_dbfs >= -62.0)
        )
        runs = _contiguous_runs(
            valid, track.time_s, hop=track.feature_hop_seconds, np=np
        )
        counts["contiguous_voiced_runs"] += len(runs)
        margin_frames = int(math.ceil(margin / track.feature_hop_seconds))
        for run_start, run_end in runs:
            inner_start = run_start + margin_frames
            inner_end = run_end - margin_frames
            for duration in windows:
                length = max(3, int(round(duration / track.feature_hop_seconds)))
                if inner_end - inner_start < length:
                    continue
                for start in range(inner_start, inner_end - length + 1, stride):
                    end = start + length
                    counts["windows_considered"] += 1
                    metrics, reasons = _candidate_metrics(track, start, end, np=np)
                    if metrics is None:
                        counts["windows_rejected"] += 1
                        for reason in set(reasons):
                            rejection_counts[reason] = rejection_counts.get(reason, 0) + 1
                        continue
                    summary = _candidate_summary(track, start, end, metrics)
                    candidates_with_residual.append(
                        (summary, track, metrics["residual"].copy())
                    )

    counts[
        "windows_passing_signal_gates_before_overlap_suppression"
    ] = len(candidates_with_residual)
    candidates_with_residual.sort(
        key=lambda item: (
            -item[0]["proxy_metrics"]["ranking_score"],
            item[0]["source"]["source_id"],
            item[0]["feature_provenance"][
                "feature_index_range_start_inclusive_end_exclusive"
            ],
        )
    )
    retained: list[tuple[dict[str, Any], FeatureTrack, Any]] = []
    for item in candidates_with_residual:
        if any(_overlap_fraction(item[0], prior[0]) >= 0.65 for prior in retained):
            continue
        retained.append(item)
        if len(retained) >= shortlist_size:
            break
    counts["ranked_candidates_after_overlap_suppression"] = len(retained)

    base: dict[str, Any] = {
        "schema": OUTPUT_SCHEMA,
        "input_bundle": {
            "bundle_name": bundle.name,
            "source_catalog_relative_path": "source_catalog.json",
            "source_catalog_sha256": catalog_sha,
            "raw_audio_opened": False,
            "feature_cache_read_only": True,
            "absolute_local_paths_recorded": False,
        },
        "detector": {
            "window_seconds": [_round(value) for value in windows],
            "stride_frames": stride,
            "required_internal_voiced_margin_seconds_each_side": _round(margin),
            "periodicity_search_band_hz": [2.3, 8.0],
            "contour_points": points,
            "method": (
                "contiguous voiced-window scan; five-frame pitch smoothing; linear "
                "centerline removal; autocorrelation and FFT periodicity agreement; "
                "voicing, RMS, pitch-step, drift, range-edge, depth, and cycle gates"
            ),
            "detector_is_not_a_musical_gesture_classifier": True,
        },
        "counts": counts,
        "rejection_counts": dict(sorted(rejection_counts.items())),
        "artifact_policy": {
            "offline_rnd_only": True,
            "training_item": False,
            "game_asset": False,
            "distribution_ready": False,
            "rights_cleared": False,
            "human_musicological_review_complete": False,
            "style_label_assigned": False,
            "whole_phrase_score_fit_assessed": False,
        },
        "proxy_limitations": [
            "F0 comes from a windowed FFT/autocorrelation proxy, not a human pitch transcription; octave and voicing errors remain possible.",
            "Periodic within-note F0 motion is not by itself proof of yoseong or nonghyeon.",
            "No candidate has a human-approved Gyeonggi-minyo, tori, phrase-role, breath, fingering, or articulation label.",
            "The selected feature window says nothing about compatibility of the surrounding source phrase with the target score.",
            "The contour omits raw audio, timbre, phase, breath noise, articulation, and reliable attack/release boundaries.",
            "Catalog rights are unverified for training, distribution, or game use; source terms must be confirmed separately.",
        ],
    }

    if not retained:
        base.update({
            "status": "blocked",
            "blocked_reasons": [
                "no_internal_contiguous_feature_window_passed every conservative periodic-F0, voicing, RMS, pitch-step, drift, estimator-edge, depth, and cycle gate"
            ],
            "selection": None,
            "ranked_candidates": [],
            "b2_application_gate": {
                "reference_shape_available": False,
                "required_status_if_later_available": "reference_shape_unreviewed",
                "blocked": True,
            },
        })
    else:
        selected, selected_track, selected_residual = retained[0]
        selection = dict(selected)
        selection["normalized_reference_contour"] = _normalized_contour(
            selected_track,
            selected,
            selected_residual,
            points=points,
            np=np,
        )
        base.update({
            "status": "reference_shape_unreviewed",
            "blocked_reasons": [],
            "selection": selection,
            "ranked_candidates": [item[0] for item in retained],
            "b2_application_gate": {
                "reference_shape_available": True,
                "required_status": "reference_shape_unreviewed",
                "may_feed_offline_b2_audition_only_under_that_status": True,
                "may_be_interpreted_as_human_confirmed_yoseong": False,
                "may_be_used_as_training_or_game_asset": False,
                "blocked": False,
            },
        })

    _json_dump_new(output, base)
    return base


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Extract one unreviewed periodic Daegeum F0-proxy reference shape "
            "from an existing read-only feature bundle."
        )
    )
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--window-seconds",
        default=",".join(str(value) for value in DEFAULT_WINDOW_SECONDS),
    )
    parser.add_argument("--stride-frames", type=int, default=DEFAULT_STRIDE_FRAMES)
    parser.add_argument(
        "--edge-margin-seconds", type=float, default=DEFAULT_EDGE_MARGIN_SECONDS
    )
    parser.add_argument("--contour-points", type=int, default=DEFAULT_CONTOUR_POINTS)
    parser.add_argument("--top", type=int, default=DEFAULT_TOP)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        result = extract_reference_shape(
            args.bundle,
            args.output,
            window_seconds=args.window_seconds,
            stride_frames=args.stride_frames,
            edge_margin_seconds=args.edge_margin_seconds,
            contour_points=args.contour_points,
            top=args.top,
        )
    except ReferenceYoseongError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "status": result["status"],
        "output": args.output.name,
        "selected_candidate_id": (
            result["selection"]["candidate_id"] if result["selection"] else None
        ),
        "ranked_candidate_count": len(result["ranked_candidates"]),
    }, ensure_ascii=False, sort_keys=True))
    return 0 if result["status"] == "reference_shape_unreviewed" else 3


if __name__ == "__main__":
    raise SystemExit(main())
