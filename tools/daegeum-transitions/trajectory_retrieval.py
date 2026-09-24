#!/usr/bin/env python3
"""Retrieve direct, same-take F0-proxy trajectories from an R&D-06 bundle.

This is an offline R&D helper for a *feature cache that already exists* in an
R&D-06 transition-bank bundle.  It deliberately does **not** look at
``candidates.jsonl``: a result is a sliding, fully voiced run of consecutive
feature frames from one source NPZ, not a chain of independently detected
boundaries.

For the browser score-side proxy ``77,74,72`` (the default), each requested
duration is scanned against a piecewise-linear target trajectory.  One least
squares vertical offset is fitted to the complete trajectory.  The offset is a
comparison value only: it is never applied to audio or used to call a span a
natural performance gesture.

The output is intentionally cautious.  It measures feature-frame continuity,
F0-proxy bridge steps, RMS proxies, voicing proxies, and duration-grid error.
Those measurements are useful for triage, but are not evidence of a breath,
slur, natural legato, articulation, approval, training eligibility, or game
asset suitability.

The common first invocation narrows the official NGC extended corpus to the
3/4, 84-BPM Daegeum Sanjo #001--065 sources (extendSeq 1520--1584):

    /tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/trajectory_retrieval.py \\
      --bundle _bgm_rnd/daegeum-transition-bank-ngc-YYYYMMDD \\
      --ngc-extended-manifest _bgm_rnd/ngc-extended-daegeum-sanjo-YYYYMMDD/ngc-extended-daegeum-sanjo.manifest.json \\
      --ngc-first-65-3-4-84 \\
      --duration-grid-seconds 1.80,1.98,2.16,2.34,2.52 \\
      --output-dir _bgm_rnd/daegeum-direct-trajectory-YYYYMMDD

No raw WAV is read, written, transformed, or rendered by this script.
"""

from __future__ import annotations

import argparse
import csv
import fnmatch
import hashlib
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping, Sequence


RND06_SCHEMA = "durango.daegeum.transition-bank.v1"
FEATURE_SCHEMA = "durango.daegeum.expression-features.v1"
TRAJECTORY_RETRIEVAL_SCHEMA = f"{RND06_SCHEMA}.direct-f0-trajectory-retrieval.v1"

DEFAULT_TARGET_MIDI = (77.0, 74.0, 72.0)
DEFAULT_DURATION_GRID_SECONDS = (1.44, 1.80, 2.00, 2.16, 2.32, 2.52, 2.88)
DEFAULT_TOP = 40
DEFAULT_STRIDE_FRAMES = 2
# Three .72-second note slots yield a 2.16-second phrase.  37 samples gives
# exact feature-template samples at the three equal-slot centres (1/6, 1/2,
# 5/6); the default must generalize to other target lengths at runtime.
DEFAULT_TEMPLATE_SAMPLES = 37
DEFAULT_SMOOTH_WINDOW_FRAMES = 5
DEFAULT_MIN_VOICING_CONFIDENCE = 0.45
DEFAULT_MIN_RMS_DBFS = -58.0
DEFAULT_MAX_GLOBAL_SHIFT_SEMITONES = 12.0
DEFAULT_PREFERRED_MAX_ADJACENT_PITCH_STEP_CENTS = 600.0
DEFAULT_NMS_OVERLAP = 0.82
DEFAULT_MAX_RESULTS_BEFORE_NMS = 250_000
DEFAULT_CONTIGUOUS_TIME_GAP_FACTOR = 1.5
NATIVE_REQUIRED_ARRAYS = (
    "native_frame_center",
    "time_s",
    "f0_hz",
    "midi_proxy",
    "voicing_confidence",
    "rms_dbfs",
    "onset_flux",
)


class TrajectoryRetrievalError(RuntimeError):
    """Raised for malformed R&D input or a non-reproducible retrieval request."""


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
        raise TrajectoryRetrievalError(
            "direct feature retrieval requires NumPy; use the established R&D virtual environment"
        ) from exc
    return np


def _json_load(path: Path, *, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise TrajectoryRetrievalError(f"bundle has no {label}: {path.name}") from exc
    except json.JSONDecodeError as exc:
        raise TrajectoryRetrievalError(f"{label} is not valid JSON") from exc


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


def _safe_posix_relative(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value:
        raise TrajectoryRetrievalError(f"{label} must be a non-empty POSIX relative path")
    parsed = PurePosixPath(value)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise TrajectoryRetrievalError(f"{label} is not a safe relative path")
    return parsed.as_posix()


def _strict_int(value: Any, *, label: str, minimum: int | None = None) -> int:
    if type(value) is not int:
        raise TrajectoryRetrievalError(f"{label} must be an integer")
    if minimum is not None and value < minimum:
        raise TrajectoryRetrievalError(f"{label} is below its permitted range")
    return value


def _finite_float(value: Any, *, label: str, minimum: float | None = None,
                  maximum: float | None = None) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise TrajectoryRetrievalError(f"{label} must be finite") from exc
    if not math.isfinite(number):
        raise TrajectoryRetrievalError(f"{label} must be finite")
    if minimum is not None and number < minimum:
        raise TrajectoryRetrievalError(f"{label} is below its permitted range")
    if maximum is not None and number > maximum:
        raise TrajectoryRetrievalError(f"{label} exceeds its permitted range")
    return number


def _round(value: float) -> float:
    return round(float(value), 6)


def _bundle_child(bundle: Path, relative: str, *, label: str) -> Path:
    """Resolve a catalog-relative child without allowing a path escape."""

    child = (bundle / PurePosixPath(relative)).resolve()
    try:
        child.relative_to(bundle)
    except ValueError as exc:
        raise TrajectoryRetrievalError(f"{label} escapes the bundle") from exc
    return child


def _load_catalog(bundle: Path) -> tuple[dict[str, SourceInfo], str]:
    catalog_path = bundle / "source_catalog.json"
    data = _json_load(catalog_path, label="source_catalog.json")
    if not isinstance(data, Mapping) or data.get("schema") != f"{RND06_SCHEMA}.source-catalog.v1":
        raise TrajectoryRetrievalError("source_catalog.json does not have the R&D-06 source-catalog schema")
    files = data.get("files")
    if not isinstance(files, list) or not files:
        raise TrajectoryRetrievalError("source_catalog.json has no files")
    sources: dict[str, SourceInfo] = {}
    for ordinal, row in enumerate(files, 1):
        if not isinstance(row, Mapping):
            raise TrajectoryRetrievalError(f"source_catalog.json.files[{ordinal}] is not an object")
        source_id = row.get("source_id")
        sha256 = row.get("sha256")
        if not isinstance(source_id, str) or not source_id:
            raise TrajectoryRetrievalError(f"source_catalog.json.files[{ordinal}] lacks source_id")
        if source_id in sources:
            raise TrajectoryRetrievalError("source_catalog.json repeats a source_id")
        if not isinstance(sha256, str) or len(sha256) != 64 or any(ch not in "0123456789abcdef" for ch in sha256):
            raise TrajectoryRetrievalError(f"source {source_id} lacks a lowercase SHA-256 identity")
        native = row.get("native")
        if not isinstance(native, Mapping):
            raise TrajectoryRetrievalError(f"source {source_id} lacks native metadata")
        source_rate = _strict_int(native.get("sample_rate_hz"), label=f"source {source_id}.sample_rate_hz", minimum=1)
        frame_count = _strict_int(native.get("frame_count"), label=f"source {source_id}.frame_count", minimum=1)
        relative_path = _safe_posix_relative(row.get("relative_path"), label=f"source {source_id}.relative_path")
        feature_npz = f"features/{source_id}.npz"
        feature_meta = f"features/{source_id}.json"
        # Safe check now, before the caller receives a source whose expected
        # feature file name could ever point outside the artifact.
        _bundle_child(bundle, feature_npz, label=f"source {source_id}.feature_npz")
        _bundle_child(bundle, feature_meta, label=f"source {source_id}.feature_metadata")
        sources[source_id] = SourceInfo(
            source_id=source_id,
            sha256=sha256,
            relative_path=relative_path,
            sample_rate_hz=source_rate,
            frame_count=frame_count,
            feature_npz_relative_path=feature_npz,
            feature_metadata_relative_path=feature_meta,
        )
    return sources, _sha256(catalog_path)


def parse_target_midi(value: str | Sequence[float] | None) -> tuple[float, ...]:
    """Parse score-side MIDI proxies; three values form the 77→74→72 use case."""

    if value is None:
        return DEFAULT_TARGET_MIDI
    raw: Sequence[Any]
    if isinstance(value, str):
        raw = [part.strip() for part in value.split(",")]
    else:
        raw = value
    if len(raw) < 3:
        raise TrajectoryRetrievalError("--target-midi needs at least three MIDI values")
    result = tuple(
        _finite_float(item, label=f"target MIDI {index}", minimum=0.0, maximum=127.0)
        for index, item in enumerate(raw, 1)
    )
    return result


def parse_duration_grid(value: str | Sequence[float] | None) -> tuple[float, ...]:
    """Parse a finite, sorted grid of total span durations in seconds."""

    if value is None:
        return DEFAULT_DURATION_GRID_SECONDS
    raw: Sequence[Any]
    if isinstance(value, str):
        raw = [part.strip() for part in value.split(",")]
    else:
        raw = value
    if not raw:
        raise TrajectoryRetrievalError("--duration-grid-seconds cannot be empty")
    durations = tuple(_finite_float(item, label=f"duration grid value {index}", minimum=0.02)
                      for index, item in enumerate(raw, 1))
    if tuple(sorted(durations)) != durations or len(set(durations)) != len(durations):
        raise TrajectoryRetrievalError("duration grid must be strictly ascending with no duplicate values")
    if len(durations) > 64:
        raise TrajectoryRetrievalError("duration grid has too many values (maximum 64)")
    return durations


def _parse_extend_seq_range(value: str) -> tuple[int, int]:
    parts = value.split(":")
    if len(parts) != 2:
        raise TrajectoryRetrievalError("--ngc-extend-seq-range must be START:END")
    try:
        start, end = (int(part) for part in parts)
    except ValueError as exc:
        raise TrajectoryRetrievalError("--ngc-extend-seq-range needs integer START:END") from exc
    if start < 1 or end < start:
        raise TrajectoryRetrievalError("--ngc-extend-seq-range is invalid")
    return start, end


def _manifest_source_selection(manifest_path: Path, sources: Mapping[str, SourceInfo], *,
                               sequence_range: tuple[int, int] | None,
                               first_65_3_4_84: bool) -> tuple[set[str], dict[str, int], str]:
    """Map a verified NGC manifest's neutral filenames back to bundle sources."""

    manifest = _json_load(manifest_path, label="NGC extended manifest")
    if not isinstance(manifest, Mapping) or not isinstance(manifest.get("entries"), list):
        raise TrajectoryRetrievalError("NGC manifest must contain an entries array")
    required_sequences: set[int] | None = None
    if first_65_3_4_84:
        expected_range = (1520, 1584)
        if sequence_range is not None and sequence_range != expected_range:
            raise TrajectoryRetrievalError(
                "--ngc-first-65-3-4-84 is exactly extendSeq 1520:1584; do not combine a different range"
            )
        sequence_range = expected_range
        required_sequences = set(range(expected_range[0], expected_range[1] + 1))
    if sequence_range is None:
        raise TrajectoryRetrievalError(
            "--ngc-extended-manifest needs --ngc-extend-seq-range or --ngc-first-65-3-4-84"
        )
    by_basename: dict[str, str] = {}
    for source in sources.values():
        basename = PurePosixPath(source.relative_path).name
        if basename in by_basename:
            raise TrajectoryRetrievalError("bundle catalog has duplicate source basenames; cannot map NGC manifest safely")
        by_basename[basename] = source.source_id
    selected: set[str] = set()
    seq_by_source: dict[str, int] = {}
    start, end = sequence_range
    seen_sequences: set[int] = set()
    for ordinal, entry in enumerate(manifest["entries"], 1):
        if not isinstance(entry, Mapping):
            raise TrajectoryRetrievalError(f"NGC manifest entries[{ordinal}] is not an object")
        sequence = entry.get("extend_seq")
        if type(sequence) is not int:
            raise TrajectoryRetrievalError(f"NGC manifest entries[{ordinal}] lacks extend_seq")
        if sequence < start or sequence > end:
            continue
        if sequence in seen_sequences:
            raise TrajectoryRetrievalError("NGC manifest repeats an extend_seq in the requested range")
        seen_sequences.add(sequence)
        catalog = entry.get("catalog_record")
        detail = entry.get("file_info_record")
        download = entry.get("download")
        if not isinstance(catalog, Mapping) or not isinstance(detail, Mapping) or not isinstance(download, Mapping):
            raise TrajectoryRetrievalError(f"NGC manifest extendSeq {sequence} lacks catalog/detail/download provenance")
        if catalog.get("division") != "대금산조" or detail.get("division") != "대금산조":
            raise TrajectoryRetrievalError(f"NGC manifest extendSeq {sequence} is not exact 대금산조")
        if first_65_3_4_84:
            if str(catalog.get("beat")) != "3/4" or _finite_float(catalog.get("bpm"), label="NGC bpm") != 84.0:
                raise TrajectoryRetrievalError(f"NGC manifest extendSeq {sequence} is not 3/4 84-BPM")
        raw_relative = _safe_posix_relative(download.get("relative_path"), label=f"NGC extendSeq {sequence}.download.relative_path")
        source_id = by_basename.get(PurePosixPath(raw_relative).name)
        if source_id is None:
            # The builder deliberately neutralizes downloaded local filenames
            # to extend-NNNNNN.wav.  Its catalog uses the same basename.
            raise TrajectoryRetrievalError(
                f"NGC manifest extendSeq {sequence} has no matching catalog source basename"
            )
        if source_id in seq_by_source:
            raise TrajectoryRetrievalError("two NGC manifest sequences map to one bundle source")
        manifest_digest = download.get("sha256")
        if (
            not isinstance(manifest_digest, str)
            or len(manifest_digest) != 64
            or manifest_digest != sources[source_id].sha256
        ):
            raise TrajectoryRetrievalError(
                f"NGC manifest extendSeq {sequence} download SHA-256 does not match its bundle catalog source"
            )
        selected.add(source_id)
        seq_by_source[source_id] = sequence
    if required_sequences is not None:
        missing_sequences = sorted(required_sequences - seen_sequences)
        if missing_sequences:
            raise TrajectoryRetrievalError(
                "--ngc-first-65-3-4-84 requires every exact sequence 1520:1584; manifest is missing "
                + ", ".join(str(item) for item in missing_sequences)
            )
    if not selected:
        raise TrajectoryRetrievalError("NGC source selection matched no bundle source")
    return selected, seq_by_source, _sha256(manifest_path)


def select_sources(bundle: Path, sources: Mapping[str, SourceInfo], *, source_filters: Sequence[str] = (),
                   source_ids: Sequence[str] = (), ngc_manifest: str | Path | None = None,
                   ngc_extend_seq_range: str | None = None,
                   ngc_first_65_3_4_84: bool = False) -> tuple[list[SourceInfo], dict[str, int], dict[str, Any]]:
    """Apply explicit filters as an intersection, never a silent broad match."""

    selected = set(sources)
    selection: dict[str, Any] = {
        "source_filter_globs": list(source_filters),
        "source_ids": list(source_ids),
        "ngc_manifest": None,
        "ngc_extend_seq_range": None,
        "ngc_first_65_3_4_84": bool(ngc_first_65_3_4_84),
    }
    if source_ids:
        unknown = sorted(set(source_ids) - set(sources))
        if unknown:
            raise TrajectoryRetrievalError("unknown --source-id: " + ", ".join(unknown))
        selected &= set(source_ids)
    if source_filters:
        for pattern in source_filters:
            if not pattern:
                raise TrajectoryRetrievalError("--source-filter cannot be empty")
        selected &= {
            source_id for source_id, source in sources.items()
            if any(
                fnmatch.fnmatchcase(source_id, pattern) or fnmatch.fnmatchcase(source.relative_path, pattern)
                for pattern in source_filters
            )
        }
    sequence_by_source: dict[str, int] = {}
    if ngc_manifest is not None:
        manifest_path = Path(ngc_manifest).expanduser().resolve()
        if not manifest_path.is_file():
            raise TrajectoryRetrievalError("--ngc-extended-manifest must name a readable manifest file")
        range_tuple = _parse_extend_seq_range(ngc_extend_seq_range) if ngc_extend_seq_range else None
        ngc_sources, sequence_by_source, manifest_sha256 = _manifest_source_selection(
            manifest_path,
            sources,
            sequence_range=range_tuple,
            first_65_3_4_84=ngc_first_65_3_4_84,
        )
        selected &= ngc_sources
        selection["ngc_manifest"] = {
            "basename": manifest_path.name,
            "sha256": manifest_sha256,
        }
        selection["ngc_extend_seq_range"] = list(range_tuple or (1520, 1584))
    elif ngc_extend_seq_range is not None or ngc_first_65_3_4_84:
        raise TrajectoryRetrievalError(
            "--ngc-extend-seq-range and --ngc-first-65-3-4-84 require --ngc-extended-manifest"
        )
    if not selected:
        raise TrajectoryRetrievalError("source filters selected no sources")
    ordered = [sources[source_id] for source_id in sorted(selected)]
    return ordered, sequence_by_source, selection


def _numeric_vector(value: Any, *, name: str, expected_length: int, np: Any) -> Any:
    array = np.asarray(value)
    if array.ndim != 1 or len(array) != expected_length:
        raise TrajectoryRetrievalError(f"feature NPZ {name} must be a one-dimensional {expected_length}-frame vector")
    if array.dtype.kind not in "fiu":
        raise TrajectoryRetrievalError(f"feature NPZ {name} must be numeric, never an object array")
    return array


def _load_feature_track(bundle: Path, source: SourceInfo, *, np: Any) -> FeatureTrack:
    """Read a validated, no-pickle feature NPZ and its provenance sidecar."""

    npz_path = _bundle_child(bundle, source.feature_npz_relative_path, label="feature NPZ")
    meta_path = _bundle_child(bundle, source.feature_metadata_relative_path, label="feature metadata")
    meta = _json_load(meta_path, label=source.feature_metadata_relative_path)
    if not isinstance(meta, Mapping) or meta.get("schema") != FEATURE_SCHEMA:
        raise TrajectoryRetrievalError(f"{source.feature_metadata_relative_path} does not have feature schema {FEATURE_SCHEMA}")
    if meta.get("source_id") != source.source_id or meta.get("source_sha256") != source.sha256:
        raise TrajectoryRetrievalError(f"{source.feature_metadata_relative_path} does not preserve catalog source identity")
    if meta.get("relative_path") != source.relative_path:
        raise TrajectoryRetrievalError(f"{source.feature_metadata_relative_path} does not preserve catalog relative path")
    if meta.get("npz") != source.feature_npz_relative_path:
        raise TrajectoryRetrievalError(f"{source.feature_metadata_relative_path} does not point to expected NPZ")
    analysis = meta.get("analysis")
    if not isinstance(analysis, Mapping):
        raise TrajectoryRetrievalError(f"{source.feature_metadata_relative_path} lacks feature analysis metadata")
    feature_hop_seconds = _finite_float(
        analysis.get("feature_hop_s"), label=f"{source.source_id}.feature_hop_s", minimum=1e-6
    )
    feature_window_seconds = _finite_float(
        analysis.get("feature_window_s"), label=f"{source.source_id}.feature_window_s", minimum=1e-6
    )
    feature_count = _strict_int(meta.get("feature_count"), label=f"{source.source_id}.feature_count", minimum=1)
    try:
        with np.load(npz_path, allow_pickle=False) as archive:
            names = tuple(archive.files)
            missing = sorted(set(NATIVE_REQUIRED_ARRAYS) - set(names))
            if missing:
                raise TrajectoryRetrievalError(f"{source.feature_npz_relative_path} is missing feature arrays: {', '.join(missing)}")
            arrays = {
                name: _numeric_vector(archive[name], name=name, expected_length=feature_count, np=np)
                for name in NATIVE_REQUIRED_ARRAYS
            }
    except OSError as exc:
        raise TrajectoryRetrievalError(f"could not read {source.feature_npz_relative_path} as a safe NPZ") from exc
    native_frames = arrays["native_frame_center"]
    time_s = arrays["time_s"].astype(np.float64, copy=False)
    if native_frames.dtype.kind not in "iu" or not np.all(np.diff(native_frames.astype(np.int64, copy=False)) > 0):
        raise TrajectoryRetrievalError(f"{source.feature_npz_relative_path} native_frame_center must strictly increase")
    if int(native_frames[0]) < 0 or int(native_frames[-1]) >= source.frame_count:
        raise TrajectoryRetrievalError(f"{source.feature_npz_relative_path} native frame centers exceed catalog bounds")
    if not np.all(np.isfinite(time_s)) or not np.all(np.diff(time_s) > 0.0):
        raise TrajectoryRetrievalError(f"{source.feature_npz_relative_path} time_s must be finite and strictly increasing")
    for name in ("voicing_confidence", "rms_dbfs", "onset_flux"):
        if not np.all(np.isfinite(arrays[name])):
            raise TrajectoryRetrievalError(f"{source.feature_npz_relative_path} {name} must be finite")
    confidence = arrays["voicing_confidence"].astype(np.float64, copy=False)
    if np.any(confidence < 0.0) or np.any(confidence > 1.0):
        raise TrajectoryRetrievalError(f"{source.feature_npz_relative_path} voicing_confidence must be in [0, 1]")
    return FeatureTrack(
        source=source,
        native_frame_center=native_frames.astype(np.int64, copy=False),
        time_s=time_s,
        f0_hz=arrays["f0_hz"].astype(np.float64, copy=False),
        midi_proxy=arrays["midi_proxy"].astype(np.float64, copy=False),
        voicing_confidence=confidence,
        rms_dbfs=arrays["rms_dbfs"].astype(np.float64, copy=False),
        onset_flux=arrays["onset_flux"].astype(np.float64, copy=False),
        feature_hop_seconds=feature_hop_seconds,
        feature_window_seconds=feature_window_seconds,
        feature_npz_sha256=_sha256(npz_path),
        feature_metadata_sha256=_sha256(meta_path),
    )


def _contiguous_voiced_runs(track: FeatureTrack, *, min_voicing_confidence: float,
                            min_rms_dbfs: float, maximum_time_gap_factor: float,
                            np: Any) -> tuple[list[tuple[int, int]], float]:
    """Return [start, end) runs of immediately consecutive voiced feature rows."""

    if maximum_time_gap_factor < 1.0:
        raise TrajectoryRetrievalError("--maximum-contiguous-time-gap-factor must be at least 1")
    valid = (
        np.isfinite(track.f0_hz)
        & (track.f0_hz > 0.0)
        & np.isfinite(track.midi_proxy)
        & (track.voicing_confidence >= min_voicing_confidence)
        & (track.rms_dbfs >= min_rms_dbfs)
    )
    step = np.diff(track.time_s)
    nominal_hop = float(np.median(step))
    if not math.isfinite(nominal_hop) or nominal_hop <= 0.0:
        raise TrajectoryRetrievalError(f"source {track.source.source_id} has no positive feature hop")
    contiguous = np.zeros(len(track.time_s), dtype=bool)
    contiguous[0] = True
    contiguous[1:] = step <= nominal_hop * maximum_time_gap_factor + 1e-12
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, is_valid in enumerate(valid.tolist()):
        if is_valid and (index == 0 or contiguous[index]):
            if start is None:
                start = index
            continue
        if start is not None:
            runs.append((start, index))
            start = None
        if is_valid:
            start = index
    if start is not None:
        runs.append((start, len(valid)))
    return runs, nominal_hop


def _median_smooth(values: Any, window_frames: int, *, np: Any) -> Any:
    """Deterministic edge-clamped median smoothing inside one voiced run."""

    if type(window_frames) is not int or window_frames < 1 or window_frames % 2 != 1:
        raise TrajectoryRetrievalError("--smooth-window-frames must be a positive odd integer")
    if window_frames == 1 or len(values) <= 2:
        return values.astype(np.float64, copy=True)
    radius = window_frames // 2
    padded = np.pad(values.astype(np.float64, copy=False), (radius, radius), mode="edge")
    # sliding_window_view creates a view, not an n*window copy.
    return np.median(np.lib.stride_tricks.sliding_window_view(padded, window_frames), axis=-1)


def _template(target: Sequence[float], sample_count: int, *, np: Any) -> tuple[Any, Any, Any]:
    if type(sample_count) is not int or sample_count < 3:
        raise TrajectoryRetrievalError("--template-samples must be an integer of at least three")
    if (sample_count - 1) % (2 * len(target)) != 0:
        raise TrajectoryRetrievalError(
            "--template-samples minus one must divide evenly by twice the target note-slot count so anchors are exact"
        )
    normalized_time = np.linspace(0.0, 1.0, sample_count)
    # A score sequence denotes note slots, not only N-1 instantaneous
    # intervals.  For 77,74,72 at .72s each, their comparison anchors are at
    # .36, 1.08, and 1.80 seconds of the 2.16s span.  End points hold the first
    # and last proxy value; between centre anchors the template is linear so a
    # continuous observed glide is not penalized as a hard stair-step mismatch.
    anchor_nodes = (np.arange(len(target), dtype=np.float64) + 0.5) / len(target)
    curve_nodes = np.concatenate(([0.0], anchor_nodes, [1.0]))
    curve_values = np.concatenate(([target[0]], np.asarray(target, dtype=np.float64), [target[-1]]))
    curve = np.interp(normalized_time, curve_nodes, curve_values)
    anchor_indices = np.rint(anchor_nodes * (sample_count - 1)).astype(np.int64)
    return curve, anchor_nodes, anchor_indices


def _sample_windows(values: Any, starts: Any, length_frames: int, sample_count: int, *, np: Any) -> Any:
    """Linearly sample equally-long windows without materializing every frame."""

    positions = np.linspace(0.0, float(length_frames - 1), sample_count)
    low = np.floor(positions).astype(np.int64)
    high = np.ceil(positions).astype(np.int64)
    fraction = positions - low
    return values[starts[:, None] + low[None, :]] * (1.0 - fraction)[None, :] + values[
        starts[:, None] + high[None, :]
    ] * fraction[None, :]


def _rms(values: Any, axis: int | None = None, *, np: Any) -> Any:
    return np.sqrt(np.mean(np.square(values), axis=axis))


def _source_span_id(source_id: str, start_feature_index: int, end_feature_index_exclusive: int,
                    duration_grid_index: int) -> str:
    return f"trajectory_{source_id}_{start_feature_index:06d}_{end_feature_index_exclusive:06d}_g{duration_grid_index:02d}"


def _row_from_window(*, track: FeatureTrack, run_start: int,
                     start_offset: int, length_frames: int, duration_grid_index: int,
                     requested_duration_seconds: float, target: Sequence[float], template_curve: Any,
                     template_nodes: Any, anchor_indices: Any, smooth_pitch: Any, np: Any,
                     max_global_shift_semitones: float,
                     preferred_max_adjacent_pitch_step_cents: float,
                     nominal_hop: float) -> dict[str, Any]:
    """Construct an auditable result from *one contiguous raw-feature window*."""

    start = run_start + start_offset
    end = start + length_frames
    pitch = smooth_pitch[start_offset:start_offset + length_frames]
    voiced = track.voicing_confidence[start:end]
    rms_dbfs = track.rms_dbfs[start:end]
    flux = track.onset_flux[start:end]
    sampled_pitch = _sample_windows(
        smooth_pitch,
        np.asarray([start_offset], dtype=np.int64),
        length_frames,
        len(template_curve),
        np=np,
    )[0]
    global_shift = float(np.mean(template_curve - sampled_pitch))
    residual = template_curve - (sampled_pitch + global_shift)
    sampled_anchor_pitch = sampled_pitch[anchor_indices]
    anchor_target = np.asarray(target, dtype=np.float64)
    anchor_residual = anchor_target - (sampled_anchor_pitch + global_shift)
    observed_intervals = np.diff(sampled_anchor_pitch)
    target_intervals = np.diff(anchor_target)
    interval_error = observed_intervals - target_intervals
    # The boundaries here are target-template positions only.  They do not
    # identify musical note boundaries or articulations in the source.
    source_anchor_positions = np.rint(template_nodes * (length_frames - 1)).astype(np.int64)
    bridge_rows: list[dict[str, Any]] = []
    bridge_rms_steps: list[float] = []
    for index, position in enumerate(source_anchor_positions[1:-1], 1):
        left = max(0, int(position) - 1)
        right = min(length_frames - 1, int(position) + 1)
        left_step = (pitch[int(position)] - pitch[left]) * 100.0
        right_step = (pitch[right] - pitch[int(position)]) * 100.0
        adjacent_step = abs(right_step)
        slope_change = abs(right_step - left_step) / max(nominal_hop, 1e-12)
        rms_step = abs(float(rms_dbfs[right]) - float(rms_dbfs[left]))
        bridge_rms_steps.append(float(rms_step))
        bridge_rows.append({
            "template_node_index": index + 1,
            "feature_index": start + int(position),
            "native_frame_center": int(track.native_frame_center[start + int(position)]),
            "time_seconds": _round(float(track.time_s[start + int(position)])),
            "adjacent_smoothed_pitch_step_cents": _round(adjacent_step),
            "two_sided_smoothed_pitch_slope_change_cents_per_second": _round(slope_change),
            "two_frame_rms_step_db": _round(rms_step),
            "template_coordinate_only_not_a_detected_note_or_articulation_boundary": True,
        })
    all_pitch_steps = np.abs(np.diff(pitch)) * 100.0
    all_rms_steps = np.abs(np.diff(rms_dbfs))
    actual_duration = float(track.time_s[end - 1] - track.time_s[start])
    path_id = _source_span_id(track.source.source_id, start, end, duration_grid_index)
    raw_padding_frames = max(1, int(round(track.feature_window_seconds * track.source.sample_rate_hz / 2.0)))
    raw_start = max(0, int(track.native_frame_center[start]) - raw_padding_frames)
    raw_end = min(track.source.frame_count, int(track.native_frame_center[end - 1]) + raw_padding_frames + 1)
    maximum_pitch_step = float(np.max(all_pitch_steps)) if len(all_pitch_steps) else 0.0
    curve_rms_cents = float(_rms(residual, np=np) * 100.0)
    interval_rms_cents = float(_rms(interval_error, np=np) * 100.0)
    # This is intentionally a transparent triage composite, not a model of
    # musical quality.  Direct-trajectory matching must not let two favorable
    # anchor intervals outrank a path whose intervening F0 proxy makes an
    # octave-sized jump.  Full-curve residual is primary; interval mismatch
    # remains weighted, and the worst adjacent smoothed proxy step is a modest
    # outlier penalty.  The component values remain separately visible.
    direct_trajectory_priority_score_cents = (
        curve_rms_cents + 2.0 * interval_rms_cents + 0.25 * maximum_pitch_step
    )
    continuity_proxies = {
        "maximum_feature_time_step_seconds": _round(float(np.max(np.diff(track.time_s[start:end])))),
        "nominal_feature_hop_seconds": _round(nominal_hop),
        "maximum_adjacent_smoothed_pitch_step_cents": _round(maximum_pitch_step),
        "preferred_maximum_adjacent_smoothed_pitch_step_cents": _round(
            preferred_max_adjacent_pitch_step_cents
        ),
        "mean_adjacent_smoothed_pitch_step_cents": _round(float(np.mean(all_pitch_steps))) if len(all_pitch_steps) else 0.0,
        "template_node_bridge_proxies": bridge_rows,
        "bridge_measurements_are_frame_proxy_not_breath_slur_or_legato_evidence": True,
    }
    return {
        "trajectory_id": path_id,
        # ``path_id`` lets a downstream raw-review exporter use this generic
        # direct-row shape without mistaking it for a reviewed bank candidate.
        "path_id": path_id,
        "source": {
            "source_id": track.source.source_id,
            "sha256": track.source.sha256,
            "relative_path": track.source.relative_path,
            "sample_rate_hz": track.source.sample_rate_hz,
            "frame_count": track.source.frame_count,
            "feature_npz": track.source.feature_npz_relative_path,
            "feature_npz_sha256": track.feature_npz_sha256,
            "feature_metadata": track.source.feature_metadata_relative_path,
            "feature_metadata_sha256": track.feature_metadata_sha256,
        },
        "automatic_path_status": {
            "source_is_one_verified_recording": True,
            "strictly_consecutive_voiced_feature_rows": True,
            "trajectory_was_scanned_directly_from_feature_npz_not_candidate_pairs": True,
            "within_preferred_max_adjacent_smoothed_pitch_step_proxy": (
                maximum_pitch_step <= preferred_max_adjacent_pitch_step_cents
            ),
            "all_results_remain_unreviewed": True,
            "not_evidence_of_same_breath": True,
            "not_evidence_of_slur": True,
            "not_evidence_of_natural_legato": True,
            "not_an_approved_transition_path": True,
            "not_a_transition_bank_item": True,
            "not_a_training_item": True,
            "not_a_game_asset": True,
        },
        "feature_span": {
            "feature_index_range": [start, end],
            "feature_frame_count": length_frames,
            "native_frame_center_range": [
                int(track.native_frame_center[start]),
                int(track.native_frame_center[end - 1]),
            ],
            "time_seconds_range": [_round(float(track.time_s[start])), _round(float(track.time_s[end - 1]))],
            "strict_feature_row_contiguity_without_skipped_unvoiced_rows": True,
        },
        "native_source_span": {
            "frame_range": [raw_start, raw_end],
            "feature_center_frame_range": [
                int(track.native_frame_center[start]),
                int(track.native_frame_center[end - 1]),
            ],
            "feature_window_half_padding_frames": raw_padding_frames,
            "frame_range_is_an_unreviewed_feature_window_enclosure_for_raw_review_only": True,
            "not_a_verified_phrase_or_gesture_boundary": True,
        },
        "target_trajectory_proxy": {
            "target_midi": [_round(value) for value in target],
            "target_interval_semitones": [_round(value) for value in target_intervals],
            "template_kind": "edge-held_piecewise_linear_through_equal-duration_score-note-slot-centres",
            "template_sample_count": int(len(template_curve)),
            "source_f0_proxy_is_not_a_human_pitch_annotation": True,
        },
        "one_global_pitch_shift_proxy": {
            "method": "least_squares_one_vertical_offset_across_all_smoothed_trajectory_samples",
            "semitones": _round(global_shift),
            "cents": _round(global_shift * 100.0),
            "within_preferred_maximum": abs(global_shift) <= max_global_shift_semitones,
            "preferred_maximum_semitones": _round(max_global_shift_semitones),
            "not_applied_to_source_audio": True,
        },
        "trajectory_fit_proxies": {
            "smoothed_curve_residual_rms_cents": _round(curve_rms_cents),
            "smoothed_curve_residual_mean_absolute_cents": _round(float(np.mean(np.abs(residual)) * 100.0)),
            "node_residual_rms_cents": _round(float(_rms(anchor_residual, np=np) * 100.0)),
            "node_residual_mean_absolute_cents": _round(float(np.mean(np.abs(anchor_residual)) * 100.0)),
            "observed_node_intervals_semitones": [_round(value) for value in observed_intervals],
            "interval_errors_cents": [_round(value * 100.0) for value in interval_error],
            "interval_error_rms_cents": _round(interval_rms_cents),
            "interval_error_mean_absolute_cents": _round(float(np.mean(np.abs(interval_error)) * 100.0)),
            "direct_trajectory_priority_composite_cents": _round(direct_trajectory_priority_score_cents),
            "direct_trajectory_priority_composite_definition": (
                "curve_residual_rms_cents + 2*interval_error_rms_cents + "
                "0.25*maximum_adjacent_smoothed_pitch_step_cents; transparent triage only, not quality"
            ),
            "proxy_only_not_score_or_performance_validation": True,
        },
        # ``continuity_proxies`` is the canonical concise field.  Keep the
        # explicit historical-name alias for downstream R&D scripts that were
        # written while this direct retriever was being developed.  They are
        # the same in-memory object and must serialize with identical values.
        "continuity_proxies": continuity_proxies,
        "feature_frame_continuity_proxies": continuity_proxies,
        "energy_proxies": {
            "rms_dbfs_mean": _round(float(np.mean(rms_dbfs))),
            "rms_dbfs_standard_deviation": _round(float(np.std(rms_dbfs))),
            "rms_dbfs_range": _round(float(np.max(rms_dbfs) - np.min(rms_dbfs))),
            "maximum_adjacent_rms_step_db": _round(float(np.max(all_rms_steps))) if len(all_rms_steps) else 0.0,
            "template_node_bridge_rms_step_mean_db": _round(float(np.mean(bridge_rms_steps))) if bridge_rms_steps else 0.0,
            "mean_onset_flux_proxy": _round(float(np.mean(flux))),
            "not_a_loudness_or_quality_judgment": True,
        },
        "voicing_proxies": {
            "voiced_feature_frame_count": length_frames,
            "voiced_feature_fraction": 1.0,
            "minimum_voicing_confidence": _round(float(np.min(voiced))),
            "mean_voicing_confidence": _round(float(np.mean(voiced))),
            "automatic_voicing_proxy_not_a_performance_validation": True,
        },
        "duration_grid_fit": {
            "duration_grid_index": duration_grid_index,
            "requested_duration_seconds": _round(requested_duration_seconds),
            "requested_note_slot_duration_seconds": _round(requested_duration_seconds / len(target)),
            "actual_feature_center_duration_seconds": _round(actual_duration),
            "requested_minus_actual_milliseconds": _round((requested_duration_seconds - actual_duration) * 1000.0),
            "duration_is_feature_center_coordinate_not_an_audio_edit_instruction": True,
        },
    }


def _score_sort_key(row: Mapping[str, Any]) -> tuple[Any, ...]:
    """A visible deterministic ordering, not an automatic quality verdict."""

    status = row["automatic_path_status"]
    shift = row["one_global_pitch_shift_proxy"]
    fit = row["trajectory_fit_proxies"]
    continuity = row["continuity_proxies"]
    energy = row["energy_proxies"]
    voicing = row["voicing_proxies"]
    duration = row["duration_grid_fit"]
    return (
        0 if shift["within_preferred_maximum"] else 1,
        0 if status["within_preferred_max_adjacent_smoothed_pitch_step_proxy"] else 1,
        float(fit["direct_trajectory_priority_composite_cents"]),
        float(fit["smoothed_curve_residual_rms_cents"]),
        float(continuity["maximum_adjacent_smoothed_pitch_step_cents"]),
        float(fit["interval_error_rms_cents"]),
        float(fit["node_residual_rms_cents"]),
        float(energy["template_node_bridge_rms_step_mean_db"]),
        float(energy["maximum_adjacent_rms_step_db"]),
        -float(voicing["minimum_voicing_confidence"]),
        abs(float(duration["requested_minus_actual_milliseconds"])),
        abs(float(shift["semitones"])),
        str(row["source"]["source_id"]),
        int(row["feature_span"]["feature_index_range"][0]),
        int(duration["duration_grid_index"]),
    )


def _overlap_fraction(first: Mapping[str, Any], second: Mapping[str, Any]) -> float:
    if first["source"]["source_id"] != second["source"]["source_id"]:
        return 0.0
    first_start, first_end = first["feature_span"]["feature_index_range"]
    second_start, second_end = second["feature_span"]["feature_index_range"]
    overlap = max(0, min(first_end, second_end) - max(first_start, second_start))
    return overlap / max(1, min(first_end - first_start, second_end - second_start))


def _non_maximum_suppress(rows: Iterable[Mapping[str, Any]], *, top: int,
                           maximum_overlap: float) -> tuple[list[dict[str, Any]], int]:
    if not 0.0 <= maximum_overlap < 1.0:
        raise TrajectoryRetrievalError("--maximum-result-overlap must be in [0, 1)")
    kept: list[dict[str, Any]] = []
    suppressed = 0
    for row in rows:
        if any(_overlap_fraction(row, existing) > maximum_overlap for existing in kept):
            suppressed += 1
            continue
        copied = dict(row)
        copied["priority_rank"] = len(kept) + 1
        copied["ranking_rule"] = (
            "preferred one-global-shift and adjacent-frame-continuity proxy bounds, then lower transparent direct "
            "trajectory composite (full smoothed-curve residual plus interval and outlier-step components), lower "
            "curve/frame-step/RMS-bridge proxies, higher automatic voicing, duration-grid proximity, deterministic identity; "
            "then same-source overlap suppression. This is not a legato, breath, slur, approval, or quality judgment."
        )
        kept.append(copied)
        if len(kept) >= top:
            break
    return kept, suppressed


def _trajectory_rows_for_track(track: FeatureTrack, *, target: Sequence[float], duration_grid: Sequence[float],
                               stride_frames: int, template_samples: int, smooth_window_frames: int,
                               min_voicing_confidence: float, min_rms_dbfs: float,
                               maximum_time_gap_factor: float, max_global_shift_semitones: float,
                               preferred_max_adjacent_pitch_step_cents: float,
                               max_results_before_nms: int, np: Any) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Scan every duration-grid window inside every contiguous voiced feature run."""

    if type(stride_frames) is not int or stride_frames < 1:
        raise TrajectoryRetrievalError("--stride-frames must be a positive integer")
    if type(max_results_before_nms) is not int or max_results_before_nms < 1:
        raise TrajectoryRetrievalError("--max-results-before-nms must be a positive integer")
    template_curve, template_nodes, anchor_indices = _template(target, template_samples, np=np)
    runs, nominal_hop = _contiguous_voiced_runs(
        track,
        min_voicing_confidence=min_voicing_confidence,
        min_rms_dbfs=min_rms_dbfs,
        maximum_time_gap_factor=maximum_time_gap_factor,
        np=np,
    )
    rows: list[dict[str, Any]] = []
    attempted = 0
    eligible_runs = 0
    for run_start, run_end in runs:
        smooth_pitch = _median_smooth(track.midi_proxy[run_start:run_end], smooth_window_frames, np=np)
        for grid_index, requested_duration in enumerate(duration_grid, 1):
            # R&D-06 feature grids are uniformly stepped.  We report the exact
            # centre-to-centre duration below, while this rounded count avoids
            # pretending the feature cache has sub-hop timing precision.
            length_frames = max(3, int(round(requested_duration / nominal_hop)) + 1)
            if length_frames > len(smooth_pitch):
                continue
            eligible_runs += 1
            start_offsets = np.arange(0, len(smooth_pitch) - length_frames + 1, stride_frames, dtype=np.int64)
            attempted += int(len(start_offsets))
            if attempted > max_results_before_nms:
                raise TrajectoryRetrievalError(
                    "direct trajectory count exceeded --max-results-before-nms; narrow sources, duration grid, or stride "
                    "rather than accept a partial result"
                )
            # The cheap vectorized fit lets us retain a direct scan of every
            # window while only constructing detailed JSON for the candidates
            # that can survive a per-run/duration score ordering.
            sampled = _sample_windows(smooth_pitch, start_offsets, length_frames, template_samples, np=np)
            shifts = np.mean(template_curve[None, :] - sampled, axis=1)
            residual = template_curve[None, :] - (sampled + shifts[:, None])
            curve_rms = _rms(residual, axis=1, np=np)
            sampled_anchors = sampled[:, anchor_indices]
            interval_error = np.diff(sampled_anchors, axis=1) - np.diff(np.asarray(target, dtype=np.float64))[None, :]
            interval_rms = _rms(interval_error, axis=1, np=np)
            # Detailed metrics are cheap at the final cardinality, but retain
            # all potentially top rows by score key.  This cap is purely a
            # memory guard; usual NGC #001--065 scans stay far below it.
            local_order = np.lexsort((start_offsets, np.abs(shifts), curve_rms, interval_rms))
            for local_index in local_order.tolist():
                rows.append(_row_from_window(
                    track=track,
                    run_start=run_start,
                    start_offset=int(start_offsets[local_index]),
                    length_frames=length_frames,
                    duration_grid_index=grid_index,
                    requested_duration_seconds=requested_duration,
                    target=target,
                    template_curve=template_curve,
                    template_nodes=template_nodes,
                    anchor_indices=anchor_indices,
                    smooth_pitch=smooth_pitch,
                    np=np,
                    max_global_shift_semitones=max_global_shift_semitones,
                    preferred_max_adjacent_pitch_step_cents=preferred_max_adjacent_pitch_step_cents,
                    nominal_hop=nominal_hop,
                ))
    return rows, {
        "contiguous_voiced_run_count": len(runs),
        "duration_grid_run_combinations_eligible": eligible_runs,
        "direct_windows_scanned": attempted,
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


def _write_tsv(path: Path, rows: Sequence[Mapping[str, Any]], *, sequence_by_source: Mapping[str, int]) -> None:
    header = [
        "priority_rank", "trajectory_id", "source_id", "ngc_extend_seq", "relative_path",
        "feature_start_index", "feature_end_index_exclusive", "start_time_seconds", "end_time_seconds",
        "requested_duration_seconds", "actual_duration_seconds", "duration_grid_error_ms",
        "global_pitch_shift_semitones", "interval_error_rms_cents", "curve_residual_rms_cents",
        "direct_trajectory_priority_composite_cents",
        "max_adjacent_pitch_step_cents", "bridge_rms_step_mean_db", "minimum_voicing_confidence",
        "all_results_unreviewed", "not_approved_transition_path",
    ]
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, delimiter="\t", lineterminator="\n")
        writer.writerow(header)
        for row in rows:
            source = row["source"]
            span = row["feature_span"]
            duration = row["duration_grid_fit"]
            shift = row["one_global_pitch_shift_proxy"]
            fit = row["trajectory_fit_proxies"]
            continuity = row["continuity_proxies"]
            energy = row["energy_proxies"]
            voicing = row["voicing_proxies"]
            status = row["automatic_path_status"]
            values = [
                row["priority_rank"], row["trajectory_id"], source["source_id"],
                sequence_by_source.get(str(source["source_id"]), ""), source["relative_path"],
                span["feature_index_range"][0], span["feature_index_range"][1],
                span["time_seconds_range"][0], span["time_seconds_range"][1],
                duration["requested_duration_seconds"], duration["actual_feature_center_duration_seconds"],
                duration["requested_minus_actual_milliseconds"], shift["semitones"],
                fit["interval_error_rms_cents"], fit["smoothed_curve_residual_rms_cents"],
                fit["direct_trajectory_priority_composite_cents"],
                continuity["maximum_adjacent_smoothed_pitch_step_cents"],
                energy["template_node_bridge_rms_step_mean_db"], voicing["minimum_voicing_confidence"],
                status["all_results_remain_unreviewed"], status["not_an_approved_transition_path"],
            ]
            writer.writerow([_tsv_cell(value) for value in values])


def build_direct_trajectory_retrieval(
    bundle_dir: str | Path,
    output_dir: str | Path,
    *,
    target_midi: str | Sequence[float] | None = None,
    duration_grid_seconds: str | Sequence[float] | None = None,
    source_filters: Sequence[str] = (),
    source_ids: Sequence[str] = (),
    ngc_extended_manifest: str | Path | None = None,
    ngc_extend_seq_range: str | None = None,
    ngc_first_65_3_4_84: bool = False,
    top: int = DEFAULT_TOP,
    stride_frames: int = DEFAULT_STRIDE_FRAMES,
    template_samples: int = DEFAULT_TEMPLATE_SAMPLES,
    smooth_window_frames: int = DEFAULT_SMOOTH_WINDOW_FRAMES,
    min_voicing_confidence: float = DEFAULT_MIN_VOICING_CONFIDENCE,
    min_rms_dbfs: float = DEFAULT_MIN_RMS_DBFS,
    maximum_time_gap_factor: float = DEFAULT_CONTIGUOUS_TIME_GAP_FACTOR,
    max_global_shift_semitones: float = DEFAULT_MAX_GLOBAL_SHIFT_SEMITONES,
    preferred_max_adjacent_pitch_step_cents: float = DEFAULT_PREFERRED_MAX_ADJACENT_PITCH_STEP_CENTS,
    maximum_result_overlap: float = DEFAULT_NMS_OVERLAP,
    max_results_before_nms: int = DEFAULT_MAX_RESULTS_BEFORE_NMS,
) -> dict[str, Any]:
    """Create an ignored, deterministic direct-F0 trajectory retrieval artifact."""

    np = _require_numpy()
    bundle = Path(bundle_dir).expanduser().resolve()
    output = Path(output_dir).expanduser().resolve()
    if not bundle.is_dir():
        raise TrajectoryRetrievalError("--bundle must be a readable R&D-06 bundle directory")
    if output.exists():
        raise TrajectoryRetrievalError("--output-dir must not already exist; refusing to overwrite an R&D artifact")
    if type(top) is not int or top < 1:
        raise TrajectoryRetrievalError("--top must be a positive integer")
    min_voicing = _finite_float(min_voicing_confidence, label="--min-voicing-confidence", minimum=0.0, maximum=1.0)
    minimum_rms = _finite_float(min_rms_dbfs, label="--min-rms-dbfs")
    maximum_time_gap = _finite_float(
        maximum_time_gap_factor,
        label="--maximum-contiguous-time-gap-factor",
        minimum=1.0,
    )
    maximum_shift = _finite_float(
        max_global_shift_semitones,
        label="--max-global-shift-semitones",
        minimum=0.0,
    )
    preferred_max_pitch_step = _finite_float(
        preferred_max_adjacent_pitch_step_cents,
        label="--preferred-max-adjacent-smoothed-pitch-step-cents",
        minimum=0.0,
    )
    target = parse_target_midi(target_midi)
    duration_grid = parse_duration_grid(duration_grid_seconds)
    sources, catalog_sha256 = _load_catalog(bundle)
    selected_sources, sequence_by_source, selection = select_sources(
        bundle,
        sources,
        source_filters=source_filters,
        source_ids=source_ids,
        ngc_manifest=ngc_extended_manifest,
        ngc_extend_seq_range=ngc_extend_seq_range,
        ngc_first_65_3_4_84=ngc_first_65_3_4_84,
    )
    all_rows: list[dict[str, Any]] = []
    input_features: list[dict[str, Any]] = []
    per_source_counts: list[dict[str, Any]] = []
    direct_windows_scanned_so_far = 0
    for source in selected_sources:
        track = _load_feature_track(bundle, source, np=np)
        # The cap is deliberately global, not a quiet per-source reset.  A
        # broad corpus should fail before accumulating an unbounded list even
        # when every individual take happens to fit below the threshold.
        remaining_window_budget = max_results_before_nms - direct_windows_scanned_so_far
        if remaining_window_budget < 1:
            raise TrajectoryRetrievalError(
                "direct trajectory count exceeded --max-results-before-nms across selected sources; "
                "narrow sources, duration grid, or stride rather than accept a partial result"
            )
        rows, counts = _trajectory_rows_for_track(
            track,
            target=target,
            duration_grid=duration_grid,
            stride_frames=stride_frames,
            template_samples=template_samples,
            smooth_window_frames=smooth_window_frames,
            min_voicing_confidence=min_voicing,
            min_rms_dbfs=minimum_rms,
            maximum_time_gap_factor=maximum_time_gap,
            max_global_shift_semitones=maximum_shift,
            preferred_max_adjacent_pitch_step_cents=preferred_max_pitch_step,
            max_results_before_nms=remaining_window_budget,
            np=np,
        )
        direct_windows_scanned_so_far += counts["direct_windows_scanned"]
        if source.source_id in sequence_by_source:
            for row in rows:
                row["source"]["ngc_extend_seq"] = sequence_by_source[source.source_id]
        all_rows.extend(rows)
        input_features.append({
            "source_id": source.source_id,
            "relative_path": source.relative_path,
            "feature_npz": source.feature_npz_relative_path,
            "feature_npz_sha256": track.feature_npz_sha256,
            "feature_metadata": source.feature_metadata_relative_path,
            "feature_metadata_sha256": track.feature_metadata_sha256,
            **({"ngc_extend_seq": sequence_by_source[source.source_id]} if source.source_id in sequence_by_source else {}),
        })
        per_source_counts.append({"source_id": source.source_id, **counts})
    all_rows.sort(key=_score_sort_key)
    returned, overlap_suppressed = _non_maximum_suppress(
        all_rows,
        top=top,
        maximum_overlap=maximum_result_overlap,
    )
    output.mkdir(parents=True, exist_ok=False)
    result: dict[str, Any] = {
        "schema": TRAJECTORY_RETRIEVAL_SCHEMA,
        "artifact_kind": "unreviewed_direct_contiguous_voiced_f0_proxy_trajectory_priority",
        "input_bundle": {
            "directory_basename": bundle.name,
            "source_catalog_sha256": catalog_sha256,
            "absolute_paths_omitted": True,
            "selected_feature_files": input_features,
        },
        "source_selection": selection,
        "target": {
            "midi": [_round(value) for value in target],
            "target_intervals_semitones": [_round(later - earlier) for earlier, later in zip(target, target[1:])],
            "target_is_a_score_side_proxy_not_a_claim_about_source_annotation": True,
        },
        "configuration": {
            "duration_grid_seconds": [_round(value) for value in duration_grid],
            "stride_feature_frames": stride_frames,
            "template_samples": template_samples,
            "smooth_window_frames": smooth_window_frames,
            "minimum_voicing_confidence": _round(min_voicing),
            "minimum_rms_dbfs": _round(minimum_rms),
            "maximum_contiguous_time_gap_factor": _round(maximum_time_gap),
            "preferred_max_global_shift_semitones": _round(maximum_shift),
            "preferred_max_adjacent_smoothed_pitch_step_cents": _round(preferred_max_pitch_step),
            "maximum_same_source_result_overlap": _round(maximum_result_overlap),
            "top_returned_trajectories": top,
            "maximum_direct_windows_before_nms": max_results_before_nms,
            "maximum_direct_windows_before_nms_is_global_across_selected_sources": True,
        },
        "interpretation_limits": {
            "candidate_manifest_not_read_or_used": True,
            "direct_contiguous_voiced_feature_spans_only": True,
            "source_audio_not_read_written_or_rendered": True,
            "one_global_shift_is_comparison_only_and_not_applied": True,
            "no_result_claims_breath_slur_natural_legato_articulation_or_quality": True,
            "all_results_remain_unreviewed_not_approved_not_training_not_game_assets": True,
        },
        "counts": {
            "catalog_source_count": len(sources),
            "selected_source_count": len(selected_sources),
            "direct_windows_scanned": direct_windows_scanned_so_far,
            "direct_trajectory_rows_before_ranking": len(all_rows),
            "overlap_suppressed_before_top": overlap_suppressed,
            "returned_trajectory_count": len(returned),
        },
        "per_source_counts": per_source_counts,
        "trajectories": returned,
    }
    _json_dump(output / "direct_trajectory_retrieval.json", result)
    _write_tsv(output / "direct_trajectory_retrieval.tsv", returned, sequence_by_source=sequence_by_source)
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", help="R&D-06 bundle containing source_catalog.json and features/*.npz")
    parser.add_argument("--output-dir", help="fresh ignored R&D artifact directory; existing directories are refused")
    parser.add_argument(
        "--target-midi",
        default="77,74,72",
        help="score-side MIDI sequence, at least 3 values (default: 77,74,72)",
    )
    parser.add_argument(
        "--duration-grid-seconds",
        default=",".join(str(value) for value in DEFAULT_DURATION_GRID_SECONDS),
        help="strictly ascending full-trajectory duration grid in seconds (2.16 = three .72s note slots)",
    )
    parser.add_argument("--source-filter", action="append", default=[], help="repeatable fnmatch over source_id or catalog relative path")
    parser.add_argument("--source-id", action="append", default=[], help="repeatable exact source_id filter")
    parser.add_argument("--ngc-extended-manifest", help="verified NGC extended-source manifest for exact extendSeq selection")
    parser.add_argument("--ngc-extend-seq-range", help="exact NGC range START:END; requires --ngc-extended-manifest")
    parser.add_argument(
        "--ngc-first-65-3-4-84",
        action="store_true",
        help="exactly select NGC Daegeum Sanjo 3/4 84-BPM #001--065 (extendSeq 1520:1584)",
    )
    parser.add_argument("--top", type=int, default=DEFAULT_TOP, help=f"non-overlapping results to emit (default: {DEFAULT_TOP})")
    parser.add_argument("--stride-frames", type=int, default=DEFAULT_STRIDE_FRAMES, help="direct scan start stride in feature frames")
    parser.add_argument("--template-samples", type=int, default=DEFAULT_TEMPLATE_SAMPLES, help="piecewise-linear comparison samples")
    parser.add_argument("--smooth-window-frames", type=int, default=DEFAULT_SMOOTH_WINDOW_FRAMES, help="positive odd median-smoothing window")
    parser.add_argument("--min-voicing-confidence", type=float, default=DEFAULT_MIN_VOICING_CONFIDENCE)
    parser.add_argument("--min-rms-dbfs", type=float, default=DEFAULT_MIN_RMS_DBFS)
    parser.add_argument("--maximum-contiguous-time-gap-factor", type=float, default=DEFAULT_CONTIGUOUS_TIME_GAP_FACTOR)
    parser.add_argument("--max-global-shift-semitones", type=float, default=DEFAULT_MAX_GLOBAL_SHIFT_SEMITONES)
    parser.add_argument(
        "--preferred-max-adjacent-smoothed-pitch-step-cents",
        type=float,
        default=DEFAULT_PREFERRED_MAX_ADJACENT_PITCH_STEP_CENTS,
        help="ranking-only F0-proxy continuity preference; it never proves legato",
    )
    parser.add_argument("--maximum-result-overlap", type=float, default=DEFAULT_NMS_OVERLAP)
    parser.add_argument("--max-results-before-nms", type=int, default=DEFAULT_MAX_RESULTS_BEFORE_NMS)
    parser.add_argument("--dry-run", action="store_true", help="print safety limits without reading a bundle")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.dry_run:
        print(
            "trajectory_retrieval: would scan only contiguous voiced R&D-06 feature-NPZ spans; it will not read or "
            "render WAV, use candidates.jsonl, assert breath/slur/legato, approve a transition, or touch runtime BGM."
        )
        return 0
    missing = [name for name in ("bundle", "output_dir") if not getattr(args, name)]
    if missing:
        _parser().error("required unless --dry-run: " + ", ".join("--" + name.replace("_", "-") for name in missing))
    try:
        result = build_direct_trajectory_retrieval(
            args.bundle,
            args.output_dir,
            target_midi=args.target_midi,
            duration_grid_seconds=args.duration_grid_seconds,
            source_filters=args.source_filter,
            source_ids=args.source_id,
            ngc_extended_manifest=args.ngc_extended_manifest,
            ngc_extend_seq_range=args.ngc_extend_seq_range,
            ngc_first_65_3_4_84=args.ngc_first_65_3_4_84,
            top=args.top,
            stride_frames=args.stride_frames,
            template_samples=args.template_samples,
            smooth_window_frames=args.smooth_window_frames,
            min_voicing_confidence=args.min_voicing_confidence,
            min_rms_dbfs=args.min_rms_dbfs,
            maximum_time_gap_factor=args.maximum_contiguous_time_gap_factor,
            max_global_shift_semitones=args.max_global_shift_semitones,
            preferred_max_adjacent_pitch_step_cents=args.preferred_max_adjacent_smoothed_pitch_step_cents,
            maximum_result_overlap=args.maximum_result_overlap,
            max_results_before_nms=args.max_results_before_nms,
        )
    except TrajectoryRetrievalError as exc:
        print(f"trajectory_retrieval: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "output": Path(args.output_dir).name,
        "direct_windows_scanned": result["counts"]["direct_windows_scanned"],
        "returned_trajectory_count": result["counts"]["returned_trajectory_count"],
        "all_results_remain_unreviewed": True,
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
