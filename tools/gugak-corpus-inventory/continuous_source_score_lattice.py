#!/usr/bin/env python3
"""Fail-closed score-fit measurement for unapproved continuous Daegeum WAVs.

The input source report intentionally does not expose raw paths.  This tool
therefore resolves its *already-listed* review candidates only inside one
explicitly supplied source root by matching both their source-byte SHA-256 and
relative-path SHA-256.  It reads the matching PCM/float WAVs at native rate to
make transient F0/voicing measurements, then writes a path-free R&D report.

It never copies, writes, resamples, trims, pitch-shifts, time-stretches,
renders, trains on, or includes a source recording in a game.  The search is
exhaustive only over a declared 100-Hz measurement lattice: every possible
single contiguous span whose one uniform duration ratio is inside the existing
compatibility band is tested.  Neither proximity nor a span boundary makes a
phrase, breath, re-attack, slur, legato, source right, model-training item, or
game asset.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import heapq
import importlib.util
import json
import math
import os
from pathlib import Path
import sys
from typing import Any, Iterable, Mapping, Sequence


HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
SCORE_EXPRESSION_DIR = REPO_ROOT / "tools" / "score-expression"
if str(SCORE_EXPRESSION_DIR) not in sys.path:
    sys.path.insert(0, str(SCORE_EXPRESSION_DIR))

from compile_expression import ScoreExpressionError, compile_plan  # noqa: E402


SCHEMA = "durango.daegeum.unapproved-continuous-source-score-lattice.v1"
REPORT_FILENAME = "continuous_source_score_lattice.json"
SOURCE_BASELINE_SCHEMA = "durango.daegeum.unapproved-rnd-source-baseline.v1"
SOURCE_SCOUT_SCHEMA = "durango.daegeum.continuous-source-scout.v1"

# These are intentionally the same unrelaxed gates used by the existing
# score_phrase_compatibility R&D measurement.  There are no CLI overrides.
MIN_SOURCE_VOICING_CONFIDENCE = 0.50
MIN_TIME_RATIO = 0.80
MAX_TIME_RATIO = 1.25
MAX_PITCH_RMSE_CENTS = 120.0
MAX_P95_ABSOLUTE_PITCH_ERROR_CENTS = 220.0
MAX_INTERVAL_ERROR_CENTS = 180.0
MIN_VALID_CONTROL_COVERAGE = 0.98

ANALYSIS_HZ = 100
ANALYSIS_WINDOW_SECONDS = 0.064
MIN_F0_HZ = 55.0
MAX_F0_HZ = 1_500.0
RMS_GATE_DBFS = -55.0
SUBSET_LOWER_BOUND_COUNT = 32
SEARCH_BATCH_SIZE = 1024
REPORTED_SPAN_LIMIT = 12


class ContinuousSourceScoreError(RuntimeError):
    """A source, baseline, plan, or R&D output does not meet this strict contract."""


def _numpy() -> Any:
    try:
        import numpy
    except ModuleNotFoundError as exc:
        raise ContinuousSourceScoreError("NumPy is required for in-memory R&D measurements") from exc
    return numpy


def _load_native_wav() -> Any:
    module_path = REPO_ROOT / "tools" / "daegeum-transitions" / "native_wav.py"
    spec = importlib.util.spec_from_file_location("continuous_score_native_wav", module_path)
    if spec is None or spec.loader is None:
        raise ContinuousSourceScoreError("the native WAV reader is unavailable")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _sha256_json(path: Path) -> str:
    return _sha256_file(path)


def _safe_string(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ContinuousSourceScoreError(f"{label} must be a non-empty string")
    return value


def _sha256_string(value: Any, *, label: str) -> str:
    text = _safe_string(value, label=label)
    if len(text) != 64 or any(character not in "0123456789abcdef" for character in text):
        raise ContinuousSourceScoreError(f"{label} must be a lowercase SHA-256")
    return text


def _under(candidate: Path, root: Path) -> bool:
    try:
        candidate.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def _json_load(path: Path, *, label: str) -> Mapping[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ContinuousSourceScoreError(f"missing {label}") from exc
    except json.JSONDecodeError as exc:
        raise ContinuousSourceScoreError(f"{label} is not valid JSON") from exc
    if not isinstance(value, Mapping):
        raise ContinuousSourceScoreError(f"{label} must be a JSON object")
    return value


def _load_baseline_candidates(path: Path) -> list[dict[str, Any]]:
    report = _json_load(path, label="source scout report")
    if report.get("schema") != SOURCE_SCOUT_SCHEMA:
        raise ContinuousSourceScoreError("source scout report schema is not accepted")
    policy = report.get("policy")
    if not isinstance(policy, Mapping) or policy.get("not_a_training_or_game_approval") is not True:
        raise ContinuousSourceScoreError("source scout report lacks its unapproved-source policy")
    baseline = report.get("unapproved_rnd_source_baseline_manifest")
    if not isinstance(baseline, Mapping) or baseline.get("schema") != SOURCE_BASELINE_SCHEMA:
        raise ContinuousSourceScoreError("source scout report lacks the unapproved baseline manifest")
    if baseline.get("status") != "unreviewed_local_source_candidates_no_rights_approval":
        raise ContinuousSourceScoreError("source baseline must explicitly remain unreviewed and rights-unapproved")
    unauthorized = baseline.get("does_not_authorize")
    if not isinstance(unauthorized, list) or not {"model_training", "game_asset_inclusion"}.issubset(unauthorized):
        raise ContinuousSourceScoreError("source baseline does not explicitly forbid training/game inclusion")
    raw_candidates = baseline.get("candidates")
    if not isinstance(raw_candidates, list) or not raw_candidates:
        raise ContinuousSourceScoreError("source baseline has no explicit candidates")
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for ordinal, raw in enumerate(raw_candidates, 1):
        if not isinstance(raw, Mapping):
            raise ContinuousSourceScoreError(f"source baseline candidate {ordinal} is not an object")
        if raw.get("recording_candidate_class") != "long_native_wav_continuous_recording_candidate":
            raise ContinuousSourceScoreError("source baseline contains a non-continuous-review candidate")
        if raw.get("file_extension") != "wav":
            raise ContinuousSourceScoreError("source baseline candidate is not a direct WAV")
        locator = raw.get("manual_review_locator")
        descriptor = raw.get("native_wav_descriptor")
        provenance = raw.get("provenance_evidence")
        if not isinstance(locator, Mapping) or not isinstance(descriptor, Mapping) or not isinstance(provenance, Mapping):
            raise ContinuousSourceScoreError("source baseline candidate has incomplete locator/descriptor/provenance")
        byte_sha = _sha256_string(locator.get("byte_sha256"), label="candidate byte_sha256")
        relative_sha = _sha256_string(locator.get("relative_path_sha256"), label="candidate relative_path_sha256")
        root_id = _safe_string(locator.get("source_root_id"), label="candidate source_root_id")
        if provenance.get("training_or_game_rights_proven") is not False:
            raise ContinuousSourceScoreError("source candidate must explicitly remain without training/game rights proof")
        if descriptor.get("resampled") is not False or descriptor.get("sample_rate_hz") is None:
            raise ContinuousSourceScoreError("source candidate lacks a native-rate WAV descriptor")
        key = (byte_sha, relative_sha)
        if key in seen:
            raise ContinuousSourceScoreError("source baseline repeats a candidate locator")
        seen.add(key)
        candidates.append(
            {
                "locator": {
                    "source_root_id": root_id,
                    "byte_sha256": byte_sha,
                    "relative_path_sha256": relative_sha,
                },
                "native_wav_descriptor": dict(descriptor),
                "provenance_evidence": dict(provenance),
            }
        )
    return sorted(candidates, key=lambda item: item["locator"]["byte_sha256"])


def _walk_wavs(root: Path) -> Iterable[Path]:
    for directory_text, directory_names, filenames in os.walk(root, followlinks=False):
        directory = Path(directory_text)
        directory_names[:] = sorted(
            name for name in directory_names if not (directory / name).is_symlink()
        )
        for filename in sorted(filenames):
            candidate = directory / filename
            if candidate.suffix.casefold() == ".wav" and candidate.is_file() and not candidate.is_symlink():
                yield candidate


def _resolve_candidates(source_root: Path, candidates: Sequence[Mapping[str, Any]]) -> tuple[dict[str, Path], int]:
    """Match only baseline locators; returned local paths never enter a report."""

    root = source_root.expanduser().resolve()
    if not root.is_dir():
        raise ContinuousSourceScoreError("--source-root must be an existing explicit directory")
    expected = {
        (item["locator"]["byte_sha256"], item["locator"]["relative_path_sha256"]): item["locator"]["byte_sha256"]
        for item in candidates
    }
    resolved: dict[str, Path] = {}
    wav_count = 0
    for path in _walk_wavs(root):
        wav_count += 1
        relative = path.relative_to(root).as_posix()
        relative_sha = _sha256_text(relative)
        # A relative-path hash is cheap enough to reject most files before a
        # byte hash; this is still a read-only source search.
        possible = [key for key in expected if key[1] == relative_sha]
        if not possible:
            continue
        byte_sha = _sha256_file(path)
        key = (byte_sha, relative_sha)
        if key not in expected:
            continue
        source_id = expected[key]
        if source_id in resolved:
            raise ContinuousSourceScoreError("a baseline source locator resolves to multiple local WAVs")
        resolved[source_id] = path
    missing = sorted(item["locator"]["byte_sha256"] for item in candidates if item["locator"]["byte_sha256"] not in resolved)
    if missing:
        raise ContinuousSourceScoreError("one or more baseline source locators did not resolve inside --source-root")
    return resolved, wav_count


def _midi_from_hz(f0_hz: Any, *, np: Any) -> Any:
    result = np.full(f0_hz.shape, np.nan, dtype=np.float64)
    valid = np.isfinite(f0_hz) & (f0_hz > 0.0)
    result[valid] = 69.0 + 12.0 * np.log2(f0_hz[valid] / 440.0)
    return result


def _next_power_of_two(value: int) -> int:
    return 1 << max(1, (value - 1).bit_length())


def _extract_native_f0_proxy(samples: Any, sample_rate_hz: int, *, np: Any) -> dict[str, Any]:
    """Measure a transient native-rate autocorrelation proxy; no audio is written."""

    if sample_rate_hz <= 0:
        raise ContinuousSourceScoreError("source sample rate must be positive")
    hop = max(1, int(round(sample_rate_hz / ANALYSIS_HZ)))
    window = max(int(round(sample_rate_hz * ANALYSIS_WINDOW_SECONDS)), int(math.ceil(sample_rate_hz / MIN_F0_HZ)) * 3)
    if len(samples) < window:
        raise ContinuousSourceScoreError("source is too short for the fixed F0 analysis window")
    count = 1 + (len(samples) - window) // hop
    starts = np.arange(count, dtype=np.int64) * hop
    fft_size = _next_power_of_two(window * 2)
    minimum_lag = max(1, int(math.floor(sample_rate_hz / MAX_F0_HZ)))
    maximum_lag = min(window - 2, int(math.ceil(sample_rate_hz / MIN_F0_HZ)))
    if minimum_lag >= maximum_lag:
        raise ContinuousSourceScoreError("native rate/window cannot support the fixed F0 range")
    hann = np.hanning(window).astype(np.float32)
    f0_hz = np.full(count, np.nan, dtype=np.float64)
    confidence = np.zeros(count, dtype=np.float64)
    rms_dbfs = np.full(count, -np.inf, dtype=np.float64)
    sample_offsets = np.arange(window, dtype=np.int64)
    for first in range(0, count, 256):
        last = min(count, first + 256)
        frames = samples[starts[first:last, None] + sample_offsets[None, :]].astype(np.float64, copy=False)
        rms = np.sqrt(np.mean(np.square(frames), axis=1))
        rms_db = 20.0 * np.log10(np.maximum(rms, 1.0e-12))
        centered = frames - np.mean(frames, axis=1, keepdims=True)
        spectrum = np.fft.rfft(centered * hann, n=fft_size, axis=1)
        autocorrelation = np.fft.irfft(spectrum * spectrum.conjugate(), n=fft_size, axis=1)[:, :window]
        energy = autocorrelation[:, 0]
        normalized = np.full((last - first, maximum_lag - minimum_lag + 1), -np.inf, dtype=np.float64)
        nonzero = energy > 1.0e-12
        if np.any(nonzero):
            normalized[nonzero] = (
                autocorrelation[nonzero, minimum_lag : maximum_lag + 1]
                / energy[nonzero, None]
            )
        peak_offset = np.argmax(normalized, axis=1)
        peak_lag = minimum_lag + peak_offset
        peak_value = normalized[np.arange(last - first), peak_offset]
        valid = (rms_db >= RMS_GATE_DBFS) & np.isfinite(peak_value) & (peak_value >= MIN_SOURCE_VOICING_CONFIDENCE)
        f0_hz[first:last][valid] = sample_rate_hz / peak_lag[valid]
        confidence[first:last] = np.where(np.isfinite(peak_value), peak_value, 0.0)
        rms_dbfs[first:last] = rms_db
    return {
        "f0_hz": f0_hz,
        "midi_proxy": _midi_from_hz(f0_hz, np=np),
        "voicing_confidence": confidence,
        "rms_dbfs": rms_dbfs,
        "frame_times_seconds": (starts.astype(np.float64) + window / 2.0) / float(sample_rate_hz),
        "measurement": {
            "analysis_rate_hz": ANALYSIS_HZ,
            "hop_native_frames": hop,
            "window_native_frames": window,
            "window_seconds": window / float(sample_rate_hz),
            "f0_range_hz": [MIN_F0_HZ, MAX_F0_HZ],
            "rms_gate_dbfs": RMS_GATE_DBFS,
            "voicing_confidence_gate": MIN_SOURCE_VOICING_CONFIDENCE,
            "method": "native-rate in-memory normalized autocorrelation proxy",
            "not_human_transcription_or_gesture_label": True,
        },
    }


def _p95_nearest(values: Any, *, np: Any) -> float:
    ordered = np.sort(values)
    index = max(0, int(math.ceil(len(ordered) * 0.95)) - 1)
    return float(ordered[index])


def _round(value: float | None) -> float | None:
    return None if value is None else round(float(value), 6)


def _span_record(
    *,
    start: int,
    duration_frames: int,
    ratio: float,
    hop_seconds: float,
    lower_bound_cents: float,
    exact: Mapping[str, Any] | None,
) -> dict[str, Any]:
    end = start + duration_frames
    record: dict[str, Any] = {
        "measurement_lattice_span": {
            "start_feature_index": start,
            "end_feature_index_exclusive": end,
            "duration_feature_frames": duration_frames,
            "duration_seconds": _round(duration_frames * hop_seconds),
            "uniform_time_ratio_source_seconds_per_score_second": _round(ratio),
            "native_contiguous_coordinate_range_measurement_only": True,
            "not_a_phrase_breath_slur_or_legato_boundary": True,
        },
        "pitch_rmse_lower_bound_cents_from_fixed_subset": _round(lower_bound_cents),
        "global_pitch_offset_measurement_not_applied": True,
        "uniform_time_ratio_measurement_not_applied": True,
    }
    if exact is None:
        record.update(
            {
                "exact_full_control_measurement": "not_needed: lower bound alone proves RMSE gate failure",
                "automated_disposition": "rejected_by_conservative_rmse_lower_bound",
            }
        )
    else:
        record.update(exact)
    return record


def _retain(heap: list[tuple[float, int, dict[str, Any]]], record: dict[str, Any], *, rank_key: float, serial: int) -> None:
    # A max heap encoded through a negative key holds the lowest numerical
    # measurement keys (best proximity only, never quality) without retaining
    # millions of lattice rows in the report.
    item = (-rank_key, serial, record)
    if len(heap) < REPORTED_SPAN_LIMIT:
        heapq.heappush(heap, item)
    elif item[0] > heap[0][0]:
        heapq.heapreplace(heap, item)


def _full_measurement(
    *,
    source_midi: Any,
    source_confidence: Any,
    score_midi: Any,
    valid_score_mask: Any,
    np: Any,
) -> dict[str, Any]:
    valid = valid_score_mask & np.isfinite(source_midi) & np.isfinite(source_confidence) & (source_confidence >= MIN_SOURCE_VOICING_CONFIDENCE)
    voiced_count = int(np.count_nonzero(valid_score_mask))
    valid_count = int(np.count_nonzero(valid))
    coverage = valid_count / voiced_count
    flags: list[str] = []
    if coverage < MIN_VALID_CONTROL_COVERAGE:
        flags.append("valid_score_control_coverage_below_measurement_gate")
    if valid_count == 0:
        flags.append("no_valid_source_proxy_rows_after_voicing_gate")
        return {
            "single_global_measurements": {
                "global_pitch_offset_semitones": None,
                "no_per_note_or_per_event_pitch_offset": True,
            },
            "pitch_fit_measurements": {
                "voiced_score_control_frame_count": voiced_count,
                "valid_compared_control_frame_count": valid_count,
                "valid_control_coverage": _round(coverage),
                "pitch_rmse_cents": None,
                "pitch_p95_absolute_error_cents_nearest_rank": None,
                "endpoint_interval_error_cents": None,
            },
            "numeric_mismatch_flags": flags,
            "automated_disposition": "rejected_measurement_mismatch",
            "measurement_sort_key_cents_equivalent_not_quality": None,
        }
    offset = float(np.mean(score_midi[valid] - source_midi[valid]))
    residual = (source_midi[valid] + offset - score_midi[valid]) * 100.0
    absolute = np.abs(residual)
    rmse = float(np.sqrt(np.mean(np.square(residual))))
    p95 = _p95_nearest(absolute, np=np)
    valid_positions = np.flatnonzero(valid)
    first, last = int(valid_positions[0]), int(valid_positions[-1])
    interval_error = float((source_midi[last] - source_midi[first] - (score_midi[last] - score_midi[first])) * 100.0)
    if rmse > MAX_PITCH_RMSE_CENTS:
        flags.append("pitch_rmse_exceeds_measurement_gate")
    if p95 > MAX_P95_ABSOLUTE_PITCH_ERROR_CENTS:
        flags.append("pitch_p95_absolute_error_exceeds_measurement_gate")
    if abs(interval_error) > MAX_INTERVAL_ERROR_CENTS:
        flags.append("endpoint_interval_error_exceeds_measurement_gate")
    sort_key = rmse + 0.25 * p95 + 0.5 * abs(interval_error) + 10_000.0 * (1.0 - coverage)
    return {
        "single_global_measurements": {
            "global_pitch_offset_semitones": _round(offset),
            "no_per_note_or_per_event_pitch_offset": True,
        },
        "pitch_fit_measurements": {
            "voiced_score_control_frame_count": voiced_count,
            "valid_compared_control_frame_count": valid_count,
            "valid_control_coverage": _round(coverage),
            "pitch_rmse_cents": _round(rmse),
            "pitch_p95_absolute_error_cents_nearest_rank": _round(p95),
            "endpoint_interval_error_cents": _round(interval_error),
        },
        "numeric_mismatch_flags": flags,
        "automated_disposition": (
            "rejected_measurement_mismatch" if flags else "measurement_in_band_but_unreviewed_not_approved"
        ),
        "measurement_sort_key_cents_equivalent_not_quality": _round(sort_key),
    }


def _search_all_lattice_spans(
    feature: Mapping[str, Any], score: Mapping[str, Any], *, np: Any) -> dict[str, Any]:
    """Exhaust every start/end pair on the declared analysis lattice.

    A fixed 32-control-frame subset is used only as a mathematical RMSE lower
    bound.  If it exceeds the full 576-frame gate after its denominator is
    conservatively expanded to every voiced control, the exact full comparison
    cannot pass and is skipped.  Thus pruning never loosens a gate or removes
    a span that could pass the exact RMSE criterion.
    """

    source_midi = feature["midi_proxy"].astype(np.float64, copy=False)
    source_confidence = feature["voicing_confidence"].astype(np.float64, copy=False)
    time = feature["frame_times_seconds"].astype(np.float64, copy=False)
    if len(source_midi) < 2 or len(time) != len(source_midi):
        raise ContinuousSourceScoreError("source F0 proxy has an unsafe feature timeline")
    hop_seconds = float(feature["measurement"]["hop_native_frames"]) / float(score["source_sample_rate_hz"])
    if not math.isfinite(hop_seconds) or hop_seconds <= 0.0:
        raise ContinuousSourceScoreError("source feature hop is invalid")
    score_duration = float(score["duration_seconds"])
    score_f0 = score["f0_hz"].astype(np.float64, copy=False)
    score_times = score["frame_times_seconds"].astype(np.float64, copy=False)
    score_midi_full = _midi_from_hz(score_f0, np=np)
    valid_score_mask = np.isfinite(score_midi_full)
    voiced_count = int(np.count_nonzero(valid_score_mask))
    if voiced_count < 2:
        raise ContinuousSourceScoreError("score plan needs at least two voiced controls")
    score_midi = score_midi_full[valid_score_mask]
    score_fraction = np.clip(score_times[valid_score_mask] / score_duration, 0.0, 1.0)
    minimum_duration_frames = int(math.ceil(MIN_TIME_RATIO * score_duration / hop_seconds - 1.0e-12))
    maximum_duration_frames = int(math.floor(MAX_TIME_RATIO * score_duration / hop_seconds + 1.0e-12))
    if minimum_duration_frames < 1 or maximum_duration_frames < minimum_duration_frames:
        raise ContinuousSourceScoreError("fixed time-ratio band has no source lattice duration")
    subset_positions = np.unique(np.linspace(0, voiced_count - 1, min(SUBSET_LOWER_BOUND_COUNT, voiced_count), dtype=np.int64))
    lower_bound_heap: list[tuple[float, int, dict[str, Any]]] = []
    exact_heap: list[tuple[float, int, dict[str, Any]]] = []
    candidate_count = 0
    lower_bound_rejected_count = 0
    full_measured_count = 0
    exact_mismatch_count = 0
    in_band_count = 0
    serial = 0
    for duration_frames in range(minimum_duration_frames, maximum_duration_frames + 1):
        start_count = len(source_midi) - duration_frames
        if start_count <= 0:
            continue
        ratio = duration_frames * hop_seconds / score_duration
        positions = np.rint(score_fraction * duration_frames).astype(np.int64)
        positions = np.clip(positions, 0, duration_frames)
        subset_source_positions = positions[subset_positions]
        for first in range(0, start_count, SEARCH_BATCH_SIZE):
            starts = np.arange(first, min(first + SEARCH_BATCH_SIZE, start_count), dtype=np.int64)
            candidate_count += len(starts)
            source_subset = source_midi[starts[:, None] + subset_source_positions[None, :]]
            confidence_subset = source_confidence[starts[:, None] + subset_source_positions[None, :]]
            subset_valid = np.isfinite(source_subset) & np.isfinite(confidence_subset) & (confidence_subset >= MIN_SOURCE_VOICING_CONFIDENCE)
            diff_subset = score_midi[subset_positions][None, :] - source_subset
            counts = np.count_nonzero(subset_valid, axis=1)
            sums = np.sum(np.where(subset_valid, diff_subset, 0.0), axis=1)
            means = np.divide(sums, counts, out=np.zeros_like(sums), where=counts > 0)
            sse_subset = np.sum(np.where(subset_valid, np.square(diff_subset - means[:, None]) * 10_000.0, 0.0), axis=1)
            # Full optimum SSE must be at least the subset's optimum SSE.  The
            # divisor uses all voiced controls, so this is deliberately a weak
            # but safe lower bound for full RMSE.
            lower_bounds = np.sqrt(sse_subset / float(voiced_count))
            proven_rejected = lower_bounds > MAX_PITCH_RMSE_CENTS
            lower_bound_rejected_count += int(np.count_nonzero(proven_rejected))
            # Retaining the best twelve candidates from every batch is enough
            # to preserve the global best twelve while avoiding one Python
            # report-object allocation for each of millions of rejected spans.
            # The count above still includes every lattice span.
            rejected_indices = np.flatnonzero(proven_rejected)
            retained_rejected = rejected_indices[
                np.argsort(lower_bounds[rejected_indices], kind="stable")[:REPORTED_SPAN_LIMIT]
            ]
            for local_index in retained_rejected:
                serial += 1
                record = _span_record(
                    start=int(starts[local_index]),
                    duration_frames=duration_frames,
                    ratio=ratio,
                    hop_seconds=hop_seconds,
                    lower_bound_cents=float(lower_bounds[local_index]),
                    exact=None,
                )
                _retain(lower_bound_heap, record, rank_key=float(lower_bounds[local_index]), serial=serial)
            survivors = np.flatnonzero(~proven_rejected)
            if not len(survivors):
                continue
            source_full = source_midi[starts[survivors, None] + positions[None, :]]
            confidence_full = source_confidence[starts[survivors, None] + positions[None, :]]
            for row_offset, local_index in enumerate(survivors):
                full_measured_count += 1
                full = _full_measurement(
                    source_midi=source_full[row_offset],
                    source_confidence=confidence_full[row_offset],
                    score_midi=score_midi,
                    valid_score_mask=np.ones(voiced_count, dtype=bool),
                    np=np,
                )
                if full["automated_disposition"] == "measurement_in_band_but_unreviewed_not_approved":
                    in_band_count += 1
                else:
                    exact_mismatch_count += 1
                serial += 1
                sort_key = full["measurement_sort_key_cents_equivalent_not_quality"]
                if sort_key is None:
                    sort_key = 1_000_000.0
                record = _span_record(
                    start=int(starts[local_index]),
                    duration_frames=duration_frames,
                    ratio=ratio,
                    hop_seconds=hop_seconds,
                    lower_bound_cents=float(lower_bounds[local_index]),
                    exact=full,
                )
                _retain(exact_heap, record, rank_key=float(sort_key), serial=serial)
    if candidate_count == 0:
        raise ContinuousSourceScoreError("source is too short for every fixed-ratio lattice span")
    reported_exact = [item[2] for item in sorted(exact_heap, key=lambda item: (-item[0], item[1]))]
    reported_lower_bound = [item[2] for item in sorted(lower_bound_heap, key=lambda item: (-item[0], item[1]))]
    for rank, record in enumerate(reported_exact, 1):
        record["measurement_rank_within_reported_exact_spans"] = rank
    for rank, record in enumerate(reported_lower_bound, 1):
        record["measurement_rank_within_reported_lower_bound_rejections"] = rank
    return {
        "lattice": {
            "analysis_rate_hz": ANALYSIS_HZ,
            "all_integer_start_and_end_boundaries_in_uniform_time_ratio_band_evaluated": True,
            "duration_feature_frame_range": [minimum_duration_frames, maximum_duration_frames],
            "duration_ratio_band": [MIN_TIME_RATIO, MAX_TIME_RATIO],
            "single_contiguous_span_only": True,
            "no_local_time_warp": True,
            "one_global_pitch_offset_per_span_only": True,
        },
        "counts": {
            "all_lattice_span_count": candidate_count,
            "conservative_rmse_lower_bound_rejected_count": lower_bound_rejected_count,
            "exact_full_control_measurement_count": full_measured_count,
            "exact_numeric_mismatch_rejected_count": exact_mismatch_count,
            "measurement_in_band_but_unreviewed_not_approved_count": in_band_count,
        },
        "source_disposition": (
            "measurement_in_band_spans_remain_unreviewed_not_approved"
            if in_band_count
            else "all_lattice_spans_rejected_by_unrelaxed_measurement_gates"
        ),
        "reported_nearest_exact_full_measurement_spans_not_quality_rankings": reported_exact,
        "reported_closest_lower_bound_rejections_not_quality_rankings": reported_lower_bound,
    }


def _safe_descriptor_match(expected: Mapping[str, Any], actual: Mapping[str, Any]) -> None:
    native = actual.get("native_audio")
    if not isinstance(native, Mapping):
        raise ContinuousSourceScoreError("decoded source has no native descriptor")
    for expected_key, actual_key in (
        ("sample_rate_hz", "sample_rate_hz"),
        ("channels", "channels"),
        ("bits_per_sample", "bits_per_sample"),
        ("frame_count", "frame_count"),
        ("encoding", "encoding"),
    ):
        if expected.get(expected_key) != native.get(actual_key):
            raise ContinuousSourceScoreError("resolved source no longer matches its baseline native descriptor")


def _summary_source_record(candidate: Mapping[str, Any], *, before_sha: str, after_sha: str, feature: Mapping[str, Any], search: Mapping[str, Any]) -> dict[str, Any]:
    descriptor = candidate["native_wav_descriptor"]
    locator = candidate["locator"]
    return {
        "manual_review_locator": locator,
        "native_wav_descriptor": {
            key: descriptor[key]
            for key in ("container_id", "encoding", "sample_rate_hz", "channels", "bits_per_sample", "frame_count", "duration_seconds", "resampled")
        },
        "provenance_evidence_preserved": {
            key: candidate["provenance_evidence"].get(key)
            for key in ("ngc_origin_proven", "training_or_game_rights_proven", "matches_known_controlled_ngc_manifest_by_local_byte_sha256")
        },
        "source_byte_sha256_verified_before_and_after_in_memory_measurement": before_sha == after_sha == locator["byte_sha256"],
        "native_feature_measurement": {
            "feature_frame_count": int(len(feature["midi_proxy"])),
            "voiced_feature_frame_count": int(sum(feature["voicing_confidence"] >= MIN_SOURCE_VOICING_CONFIDENCE)),
            **feature["measurement"],
        },
        "exhaustive_score_fit": search,
        "all_results_remain_unreviewed_not_training_items_not_game_assets": True,
        "natural_phrase_breath_reattack_slur_legato_status": "not_claimed_not_inferred_not_approved",
    }


def build_report(
    *,
    source_root: str | Path,
    source_baseline_report: str | Path,
    score_plan: str | Path,
    output_dir: str | Path,
) -> dict[str, Any]:
    """Read the explicit unapproved sources and write one fresh path-free R&D report."""

    np = _numpy()
    root = Path(source_root).expanduser().resolve()
    baseline_path = Path(source_baseline_report).expanduser().resolve()
    plan_path = Path(score_plan).expanduser().resolve()
    output = Path(output_dir).expanduser().resolve()
    if not root.is_dir():
        raise ContinuousSourceScoreError("--source-root must be an existing explicit directory")
    if not baseline_path.is_file() or not plan_path.is_file():
        raise ContinuousSourceScoreError("--source-baseline-report and --score-plan must name existing files")
    if output.exists():
        raise ContinuousSourceScoreError("--output-dir must be fresh; refusing to overwrite an R&D report")
    if _under(output, root):
        raise ContinuousSourceScoreError("--output-dir must not be inside the source root")
    if _under(output, REPO_ROOT / "public" / "assets"):
        raise ContinuousSourceScoreError("--output-dir must not be inside public/assets")
    candidates = _load_baseline_candidates(baseline_path)
    resolved, wavs_hashed = _resolve_candidates(root, candidates)
    try:
        compiled = compile_plan(plan_path)
    except ScoreExpressionError as exc:
        raise ContinuousSourceScoreError(str(exc)) from exc
    compiled = dict(compiled)
    native_wav = _load_native_wav()
    sources: list[dict[str, Any]] = []
    for candidate in candidates:
        locator = candidate["locator"]
        local_path = resolved[locator["byte_sha256"]]
        before_sha = _sha256_file(local_path)
        if before_sha != locator["byte_sha256"]:
            raise ContinuousSourceScoreError("resolved source bytes differ from baseline locator")
        native = native_wav.read_native_wav(local_path)
        _safe_descriptor_match(candidate["native_wav_descriptor"], native.metadata)
        feature = _extract_native_f0_proxy(native.analysis_mono, int(native.metadata["native_audio"]["sample_rate_hz"]), np=np)
        score_for_search = dict(compiled)
        score_for_search["source_sample_rate_hz"] = int(native.metadata["native_audio"]["sample_rate_hz"])
        search = _search_all_lattice_spans(feature, score_for_search, np=np)
        after_sha = _sha256_file(local_path)
        if after_sha != before_sha:
            raise ContinuousSourceScoreError("source bytes changed during a read-only measurement; report not written")
        sources.append(_summary_source_record(candidate, before_sha=before_sha, after_sha=after_sha, feature=feature, search=search))
    output.mkdir(parents=True, exist_ok=False)
    event_counts = Counter(str(event["articulation"]) for event in compiled["events"])
    result: dict[str, Any] = {
        "schema": SCHEMA,
        "artifact_kind": "unapproved_continuous_source_exhaustive_score_lattice_measurement",
        "input": {
            "source_baseline_report_basename": baseline_path.name,
            "source_baseline_report_sha256": _sha256_json(baseline_path),
            "source_root_id": sorted({item["locator"]["source_root_id"] for item in candidates}),
            "score_plan_basename": plan_path.name,
            "score_plan_sha256": compiled["plan_sha256"],
            "score_duration_seconds": _round(float(compiled["duration_seconds"])),
            "score_control_hz": int(compiled["control_hz"]),
            "score_voiced_control_frame_count": int(np.count_nonzero(compiled["f0_hz"] > 0.0)),
            "authored_articulation_counts": dict(sorted(event_counts.items())),
            "explicit_authorial_slur_event_ids": [
                event["id"] for event in compiled["events"] if event["articulation"] == "slur"
            ],
            "source_root_wav_files_scanned_for_locator_resolution": wavs_hashed,
            "absolute_or_raw_relative_source_paths_recorded": False,
        },
        "measurement_contract": {
            "one_global_pitch_offset_per_span_only": True,
            "one_uniform_duration_ratio_per_span_only": True,
            "all_possible_single_contiguous_spans_on_declared_100hz_lattice": True,
            "no_per_note_or_per_event_pitch_offset": True,
            "no_local_time_warp": True,
            "thresholds_unrelaxed_from_existing_score_phrase_compatibility": {
                "min_source_voicing_confidence": MIN_SOURCE_VOICING_CONFIDENCE,
                "min_time_ratio": MIN_TIME_RATIO,
                "max_time_ratio": MAX_TIME_RATIO,
                "max_pitch_rmse_cents": MAX_PITCH_RMSE_CENTS,
                "max_p95_absolute_pitch_error_cents": MAX_P95_ABSOLUTE_PITCH_ERROR_CENTS,
                "max_interval_error_cents": MAX_INTERVAL_ERROR_CENTS,
                "min_valid_control_coverage": MIN_VALID_CONTROL_COVERAGE,
            },
            "conservative_subset_lower_bound_can_only_reject_not_admit": True,
        },
        "interpretation_limits": {
            "source_audio_read_only_no_copy_render_resample_pitch_shift_time_stretch_or_training": True,
            "source_audio_not_in_default_or_runtime_bgm_or_game_assets": True,
            "score_controls_are_not_written_or_transformed": True,
            "output_is_path_free_measurement_metadata_only": True,
            "fit_is_not_phrase_quality_or_style_judgment": True,
            "breath_reattack_slur_legato_and_performance_gestures_not_inferred_from_source": True,
            "rights_ngc_origin_and_training_or_game_eligibility_not_inferred": True,
            "every_source_and_span_remains_unreviewed_not_approved": True,
        },
        "sources": sources,
    }
    (output / REPORT_FILENAME).write_text(
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, type=Path, help="one explicit local source root to read")
    parser.add_argument("--source-baseline-report", required=True, type=Path, help="path-free scout report from continuous_daegeum_scout")
    parser.add_argument("--score-plan", required=True, type=Path, help="explicit score-expression plan JSON")
    parser.add_argument("--output-dir", required=True, type=Path, help="fresh R&D-only report directory")
    parser.add_argument("--confirm-read-only-rnd", action="store_true", help="required acknowledgement: no source copy/render/train/game action")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if not args.confirm_read_only_rnd:
        print("continuous_source_score_lattice: pass --confirm-read-only-rnd", file=sys.stderr)
        return 2
    try:
        result = build_report(
            source_root=args.source_root,
            source_baseline_report=args.source_baseline_report,
            score_plan=args.score_plan,
            output_dir=args.output_dir,
        )
    except ContinuousSourceScoreError as exc:
        print(f"continuous_source_score_lattice: {exc}", file=sys.stderr)
        return 2
    dispositions = [source["exhaustive_score_fit"]["source_disposition"] for source in result["sources"]]
    print(json.dumps({"output": args.output_dir.name, "source_count": len(result["sources"]), "source_dispositions": dispositions}, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
