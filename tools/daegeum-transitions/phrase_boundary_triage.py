#!/usr/bin/env python3
"""Triage source-led raw phrase-span boundaries around one direct trajectory.

This is a deliberately narrow R&D helper.  Given one selected row from
``trajectory_retrieval.py``, it looks only before and after that *one,
already SHA-verified source recording* for lower-energy feature context.  It
then emits coordinate-only, contiguous native-frame spans which enclose the
trajectory.  A later source-led arranger can therefore prefer a possible raw
head/tail context over cutting an arbitrary point in a steady sustain.

The tool does not decode, copy, render, normalize, pitch-shift, time-stretch,
or otherwise alter source audio.  It does not infer a musical phrase, breath,
slur, legato, release technique, quality, approval, training eligibility, or
game-asset suitability from F0/RMS/onset proxies.  The output remains an
unreviewed measurement artifact.

The input gates are intentionally redundant:

* the selected direct-trajectory report must link to the exact R&D-06 source
  catalog and feature-cache hashes;
* an explicit raw WAV root is re-hashed and its native frame descriptor is
  compared against both the catalog and the NGC manifest; and
* the NGC manifest must preserve its research-only/no-game/no-gesture-claim
  gates and map the selected source through an explicit extendSeq range.

Example (the first 65 official 3/4 84-BPM sources):

    /tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/phrase_boundary_triage.py \\
      --bundle _bgm_rnd/daegeum-transition-bank-ngc-YYYYMMDD \\
      --raw-daegeum-dir _bgm_rnd/ngc-extended-daegeum-sanjo-YYYYMMDD/audio \\
      --ngc-extended-manifest _bgm_rnd/ngc-extended-daegeum-sanjo-YYYYMMDD/ngc-extended-daegeum-sanjo.manifest.json \\
      --ngc-first-65-3-4-84 \\
      --trajectory-retrieval _bgm_rnd/daegeum-direct-trajectory-YYYYMMDD/direct_trajectory_retrieval.json \\
      --priority-rank 1 \\
      --output-dir _bgm_rnd/daegeum-boundary-triage-YYYYMMDD

Only JSON/TSV coordinates and measurements are written under ``--output-dir``.
It must be a new directory; no runtime BGM, public asset, or raw source is
ever overwritten.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import sys
from typing import Any, Mapping, Sequence


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from native_wav import NativeWavError, inspect_wav, sha256_file  # noqa: E402
from trajectory_retrieval import (  # noqa: E402
    RND06_SCHEMA,
    TRAJECTORY_RETRIEVAL_SCHEMA,
    TrajectoryRetrievalError,
    _load_catalog,
    _load_feature_track,
    _require_numpy,
    select_sources,
)


PHRASE_BOUNDARY_TRIAGE_SCHEMA = f"{RND06_SCHEMA}.source-led-phrase-boundary-triage.v1"
NGC_FETCH_SCHEMA = "durango.ngc.extended-daegeum-sanjo-fetch.v1"

DEFAULT_MAXIMUM_BRACKET_SECONDS = 4.0
DEFAULT_CONTEXT_SECONDS = 0.12
DEFAULT_MINIMUM_TRAJECTORY_GUARD_SECONDS = 0.08
DEFAULT_MAXIMUM_LOW_ENERGY_PERCENTILE = 0.35
DEFAULT_MAX_BOUNDARY_CANDIDATES_PER_SIDE = 32
DEFAULT_TOP = 24
MAXIMUM_BRACKET_SECONDS_HARD_LIMIT = 12.0
MAXIMUM_BOUNDARY_CANDIDATES_PER_SIDE_HARD_LIMIT = 128
MAXIMUM_TOP_HARD_LIMIT = 128


class PhraseBoundaryTriageError(RuntimeError):
    """An input cannot support a truthful source-led boundary triage run."""


def _json_load(path: Path, *, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise PhraseBoundaryTriageError(f"missing {label}") from exc
    except json.JSONDecodeError as exc:
        raise PhraseBoundaryTriageError(f"{label} is not valid JSON") from exc


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


def _round(value: float) -> float:
    return round(float(value), 6)


def _strict_int(value: Any, *, label: str, minimum: int | None = None) -> int:
    if type(value) is not int:
        raise PhraseBoundaryTriageError(f"{label} must be an integer")
    if minimum is not None and value < minimum:
        raise PhraseBoundaryTriageError(f"{label} is below its permitted range")
    return value


def _finite_float(value: Any, *, label: str, minimum: float | None = None,
                  maximum: float | None = None) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise PhraseBoundaryTriageError(f"{label} must be finite") from exc
    if not math.isfinite(result):
        raise PhraseBoundaryTriageError(f"{label} must be finite")
    if minimum is not None and result < minimum:
        raise PhraseBoundaryTriageError(f"{label} is below its permitted range")
    if maximum is not None and result > maximum:
        raise PhraseBoundaryTriageError(f"{label} exceeds its permitted range")
    return result


def _safe_relative(value: Any, *, label: str) -> PurePosixPath:
    if not isinstance(value, str) or not value or "\\" in value:
        raise PhraseBoundaryTriageError(f"{label} must be a non-empty POSIX relative path")
    relative = PurePosixPath(value)
    if relative.is_absolute() or "." in relative.parts or ".." in relative.parts:
        raise PhraseBoundaryTriageError(f"{label} is not a safe relative path")
    return relative


def _inside(root: Path, candidate: Path) -> Path:
    resolved = candidate.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise PhraseBoundaryTriageError("catalog relative path escapes an explicit raw WAV root") from exc
    return resolved


def _normalise_roots(values: str | Path | Sequence[str | Path]) -> list[Path]:
    if isinstance(values, (str, Path)):
        values = [values]
    if not values:
        raise PhraseBoundaryTriageError("at least one --raw-daegeum-dir is required")
    result: list[Path] = []
    seen: set[Path] = set()
    for value in values:
        root = Path(value).expanduser().resolve()
        if not root.is_dir():
            raise PhraseBoundaryTriageError("each --raw-daegeum-dir must be a readable directory")
        if root in seen:
            raise PhraseBoundaryTriageError("the same --raw-daegeum-dir was supplied more than once")
        result.append(root)
        seen.add(root)
    return result


def _require_true(value: Mapping[str, Any], key: str, *, label: str) -> None:
    if value.get(key) is not True:
        raise PhraseBoundaryTriageError(f"{label} must preserve {key}=true")


def _report_row(report: Mapping[str, Any], *, trajectory_id: str | None,
                priority_rank: int | None) -> dict[str, Any]:
    schema = report.get("schema")
    if not isinstance(schema, str) or not schema.startswith(
        f"{RND06_SCHEMA}.direct-f0-trajectory-retrieval."
    ):
        raise PhraseBoundaryTriageError("--trajectory-retrieval is not a direct F0 trajectory retrieval report")
    if (trajectory_id is None) == (priority_rank is None):
        raise PhraseBoundaryTriageError("choose exactly one of --trajectory-id or --priority-rank")
    rows = report.get("trajectories")
    if not isinstance(rows, list) or not rows:
        raise PhraseBoundaryTriageError("trajectory report has no returned trajectories")
    matched: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            raise PhraseBoundaryTriageError("trajectory report includes a non-object trajectory row")
        if trajectory_id is not None and row.get("trajectory_id", row.get("path_id")) == trajectory_id:
            matched.append(row)
        if priority_rank is not None and row.get("priority_rank") == priority_rank:
            matched.append(row)
    if len(matched) != 1:
        selector = f"trajectory_id={trajectory_id!r}" if trajectory_id is not None else f"priority_rank={priority_rank!r}"
        raise PhraseBoundaryTriageError(f"trajectory report has no unique row for {selector}")
    return matched[0]


def _verify_report_bundle_link(report: Mapping[str, Any], *, bundle: Path, catalog_sha256: str) -> None:
    input_bundle = report.get("input_bundle")
    if not isinstance(input_bundle, Mapping):
        raise PhraseBoundaryTriageError("trajectory report lacks input_bundle provenance")
    if input_bundle.get("directory_basename") != bundle.name:
        raise PhraseBoundaryTriageError("trajectory report does not name this exact bundle basename")
    if input_bundle.get("source_catalog_sha256") != catalog_sha256:
        raise PhraseBoundaryTriageError("trajectory report source_catalog SHA-256 does not match this bundle")


def _verified_feature_link(report: Mapping[str, Any], *, source_id: str,
                           expected_npz: str, expected_npz_sha256: str,
                           expected_metadata: str, expected_metadata_sha256: str) -> None:
    input_bundle = report.get("input_bundle")
    assert isinstance(input_bundle, Mapping)  # narrowed in _verify_report_bundle_link
    rows = input_bundle.get("selected_feature_files")
    if not isinstance(rows, list):
        raise PhraseBoundaryTriageError("trajectory report lacks selected feature-file provenance")
    matching = [row for row in rows if isinstance(row, Mapping) and row.get("source_id") == source_id]
    if len(matching) != 1:
        raise PhraseBoundaryTriageError("trajectory report does not have one feature-file row for its selected source")
    row = matching[0]
    checks = {
        "feature_npz": expected_npz,
        "feature_npz_sha256": expected_npz_sha256,
        "feature_metadata": expected_metadata,
        "feature_metadata_sha256": expected_metadata_sha256,
    }
    if any(row.get(key) != expected for key, expected in checks.items()):
        raise PhraseBoundaryTriageError("trajectory report feature-file hashes do not match the selected bundle source")


def _validate_trajectory_row(row: Mapping[str, Any], *, source: Any, track: Any,
                             report: Mapping[str, Any]) -> dict[str, Any]:
    """Re-check every source/frame identity instead of trusting report text."""

    trajectory_id = row.get("trajectory_id", row.get("path_id"))
    if not isinstance(trajectory_id, str) or not trajectory_id:
        raise PhraseBoundaryTriageError("selected trajectory has no stable trajectory_id")
    status = row.get("automatic_path_status")
    if not isinstance(status, Mapping):
        raise PhraseBoundaryTriageError("selected trajectory lacks automatic_path_status")
    required_status = (
        "source_is_one_verified_recording",
        "strictly_consecutive_voiced_feature_rows",
        "trajectory_was_scanned_directly_from_feature_npz_not_candidate_pairs",
        "all_results_remain_unreviewed",
        "not_evidence_of_same_breath",
        "not_evidence_of_slur",
        "not_evidence_of_natural_legato",
        "not_an_approved_transition_path",
        "not_a_transition_bank_item",
        "not_a_training_item",
        "not_a_game_asset",
    )
    for key in required_status:
        _require_true(status, key, label="selected trajectory status")
    source_row = row.get("source")
    if not isinstance(source_row, Mapping):
        raise PhraseBoundaryTriageError("selected trajectory lacks source identity")
    exact_source_fields = {
        "source_id": source.source_id,
        "sha256": source.sha256,
        "relative_path": source.relative_path,
        "sample_rate_hz": source.sample_rate_hz,
        "frame_count": source.frame_count,
        "feature_npz": source.feature_npz_relative_path,
        "feature_npz_sha256": track.feature_npz_sha256,
        "feature_metadata": source.feature_metadata_relative_path,
        "feature_metadata_sha256": track.feature_metadata_sha256,
    }
    if any(source_row.get(key) != expected for key, expected in exact_source_fields.items()):
        raise PhraseBoundaryTriageError("selected trajectory source/feature identity does not match the bundle")
    _verified_feature_link(
        report,
        source_id=source.source_id,
        expected_npz=source.feature_npz_relative_path,
        expected_npz_sha256=track.feature_npz_sha256,
        expected_metadata=source.feature_metadata_relative_path,
        expected_metadata_sha256=track.feature_metadata_sha256,
    )
    feature_span = row.get("feature_span")
    native_span = row.get("native_source_span")
    if not isinstance(feature_span, Mapping) or not isinstance(native_span, Mapping):
        raise PhraseBoundaryTriageError("selected trajectory lacks feature_span or native_source_span")
    feature_range = feature_span.get("feature_index_range")
    if not isinstance(feature_range, list) or len(feature_range) != 2:
        raise PhraseBoundaryTriageError("selected trajectory feature_index_range must contain [start,end)")
    start = _strict_int(feature_range[0], label="trajectory feature start", minimum=0)
    end = _strict_int(feature_range[1], label="trajectory feature end", minimum=1)
    if not (start < end <= len(track.time_s)):
        raise PhraseBoundaryTriageError("selected trajectory feature range lies outside its feature track")
    reported_centres = native_span.get("feature_center_frame_range")
    expected_centres = [int(track.native_frame_center[start]), int(track.native_frame_center[end - 1])]
    if reported_centres != expected_centres:
        raise PhraseBoundaryTriageError("selected trajectory feature centers do not match the feature cache")
    raw_range = native_span.get("frame_range")
    if not isinstance(raw_range, list) or len(raw_range) != 2:
        raise PhraseBoundaryTriageError("selected trajectory native_source_span.frame_range must contain [start,end)")
    raw_start = _strict_int(raw_range[0], label="trajectory native span start", minimum=0)
    raw_end = _strict_int(raw_range[1], label="trajectory native span end", minimum=1)
    if not (raw_start < raw_end <= source.frame_count):
        raise PhraseBoundaryTriageError("selected trajectory native frame range lies outside the catalog source")
    if not (raw_start <= expected_centres[0] <= expected_centres[1] < raw_end):
        raise PhraseBoundaryTriageError("selected trajectory native span does not enclose its feature centers")
    _require_true(
        native_span,
        "frame_range_is_an_unreviewed_feature_window_enclosure_for_raw_review_only",
        label="selected trajectory native span",
    )
    return {
        "trajectory_id": trajectory_id,
        "priority_rank_at_retrieval": row.get("priority_rank"),
        "source": {
            "source_id": source.source_id,
            "sha256": source.sha256,
            "relative_path": source.relative_path,
            "sample_rate_hz": source.sample_rate_hz,
            "frame_count": source.frame_count,
        },
        "feature_span": {
            "feature_index_range": [start, end],
            "feature_center_native_frame_range": expected_centres,
            "time_seconds_range": [_round(float(track.time_s[start])), _round(float(track.time_s[end - 1]))],
        },
        "native_source_span": {
            "frame_range": [raw_start, raw_end],
            "frame_count": raw_end - raw_start,
            "frame_range_is_an_unreviewed_feature_window_enclosure_for_raw_review_only": True,
        },
        "input_automatic_path_status_verbatim": dict(status),
    }


def _resolve_raw_source(source: Mapping[str, Any], roots: Sequence[Path]) -> Path:
    relative = _safe_relative(source.get("relative_path"), label="catalog source relative_path")
    expected_sha = source.get("sha256")
    if not isinstance(expected_sha, str) or len(expected_sha) != 64:
        raise PhraseBoundaryTriageError("catalog source has no SHA-256 identity")
    matches: list[Path] = []
    for root in roots:
        candidate = _inside(root, root.joinpath(*relative.parts))
        if candidate.is_file() and candidate.suffix.lower() == ".wav" and sha256_file(candidate) == expected_sha:
            matches.append(candidate)
    if not matches:
        raise PhraseBoundaryTriageError("no explicit raw root contains the SHA-verified selected source WAV")
    if len(matches) > 1:
        raise PhraseBoundaryTriageError("selected source appears in more than one explicit raw root")
    return matches[0]


def _raw_native_gate(raw_path: Path, *, source: Any) -> dict[str, Any]:
    try:
        descriptor = inspect_wav(raw_path)
    except NativeWavError as exc:
        raise PhraseBoundaryTriageError("could not inspect the SHA-verified raw source WAV") from exc
    native = descriptor.get("native_audio")
    if not isinstance(native, Mapping):
        raise PhraseBoundaryTriageError("raw source WAV lacks a native audio descriptor")
    if descriptor.get("sha256") != source.sha256:
        raise PhraseBoundaryTriageError("raw source SHA-256 changed after source resolution")
    sample_rate = _strict_int(native.get("sample_rate_hz"), label="raw sample_rate_hz", minimum=1)
    frame_count = _strict_int(native.get("frame_count"), label="raw frame_count", minimum=1)
    if sample_rate != source.sample_rate_hz or frame_count != source.frame_count:
        raise PhraseBoundaryTriageError("raw native frame descriptor does not match source_catalog.json")
    return {
        "source_basename": raw_path.name,
        "sha256_verified_against_source_catalog": True,
        "native_descriptor_verified_against_source_catalog": True,
        "sample_rate_hz": sample_rate,
        "frame_count": frame_count,
        "channels": _strict_int(native.get("channels"), label="raw channels", minimum=1),
        "encoding": native.get("encoding"),
        "source_audio_not_decoded_or_written": True,
    }


def _verify_ngc_manifest_gate(manifest_path: Path, *, source: Any,
                              extend_seq: int) -> dict[str, Any]:
    """Check NGC R&D/identity gates beyond the shared source-selection helper."""

    manifest = _json_load(manifest_path, label="NGC extended manifest")
    if not isinstance(manifest, Mapping) or manifest.get("schema") != NGC_FETCH_SCHEMA:
        raise PhraseBoundaryTriageError("NGC manifest does not have the verified extended-Daegeum fetch schema")
    r_and_d = manifest.get("r_and_d_only")
    scope = manifest.get("scope")
    purpose = manifest.get("submitted_purpose")
    license_evidence = manifest.get("license_evidence")
    if not all(isinstance(value, Mapping) for value in (r_and_d, scope, purpose, license_evidence)):
        raise PhraseBoundaryTriageError("NGC manifest lacks R&D/scope/purpose/license gate records")
    assert isinstance(r_and_d, Mapping)
    assert isinstance(scope, Mapping)
    assert isinstance(purpose, Mapping)
    assert isinstance(license_evidence, Mapping)
    for key in (
        "human_review_and_rights_review_required_before_training_or_shipping",
        "no_game_default_or_runtime_changes",
        "no_musical_gesture_or_legato_claim_from_download",
    ):
        _require_true(r_and_d, key, label="NGC R&D gate")
    if (
        scope.get("division_exact") != "대금산조"
        or scope.get("instrument_code") != "EXTEND0001"
        or scope.get("instrument_name") != "대금"
        or purpose.get("usePurposeGb") != "비상업용"
        or purpose.get("usePurpose") != "연구용"
    ):
        raise PhraseBoundaryTriageError("NGC manifest does not preserve the exact research-only Daegeum Sanjo scope")
    _require_true(
        license_evidence,
        "not_a_model_training_or_game_distribution_clearance",
        label="NGC license evidence",
    )
    entries = manifest.get("entries")
    if not isinstance(entries, list):
        raise PhraseBoundaryTriageError("NGC manifest has no entries array")
    entries_for_sequence = [entry for entry in entries if isinstance(entry, Mapping) and entry.get("extend_seq") == extend_seq]
    if len(entries_for_sequence) != 1:
        raise PhraseBoundaryTriageError("NGC manifest has no unique selected extendSeq entry")
    entry = entries_for_sequence[0]
    catalog_record = entry.get("catalog_record")
    file_info = entry.get("file_info_record")
    selection = entry.get("selection")
    download = entry.get("download")
    musical_status = entry.get("musical_status")
    if not all(isinstance(value, Mapping) for value in (catalog_record, file_info, selection, download, musical_status)):
        raise PhraseBoundaryTriageError("selected NGC manifest entry lacks source/selection/musical-status evidence")
    assert isinstance(catalog_record, Mapping)
    assert isinstance(file_info, Mapping)
    assert isinstance(selection, Mapping)
    assert isinstance(download, Mapping)
    assert isinstance(musical_status, Mapping)
    if (
        catalog_record.get("division") != "대금산조"
        or file_info.get("division") != "대금산조"
        or selection.get("instrument_code") != "EXTEND0001"
        or selection.get("instrument_name") != "대금"
        or selection.get("division_exact") != "대금산조"
        or selection.get("selection_is_exact_metadata_filter_not_title_match") is not True
    ):
        raise PhraseBoundaryTriageError("selected NGC entry is not exact Daegeum Sanjo metadata scope")
    if (
        musical_status.get("approved_transition") is not False
        or musical_status.get("eligible_for_model_training_or_game_asset") is not False
        or musical_status.get("automatic_filename_or_catalog_metadata_is_not_a_legato_or_transition_label") is not True
    ):
        raise PhraseBoundaryTriageError("selected NGC entry lacks its conservative musical-status gate")
    downloaded_relative = _safe_relative(download.get("relative_path"), label="NGC download relative_path")
    if downloaded_relative.name != PurePosixPath(source.relative_path).name or download.get("sha256") != source.sha256:
        raise PhraseBoundaryTriageError("NGC selected download does not map by basename/SHA-256 to the bundle source")
    native_wav = download.get("native_wav")
    native_audio = native_wav.get("native_audio") if isinstance(native_wav, Mapping) else None
    if not isinstance(native_audio, Mapping):
        raise PhraseBoundaryTriageError("NGC selected download has no native WAV descriptor")
    if (
        _strict_int(native_audio.get("sample_rate_hz"), label="NGC native sample_rate_hz", minimum=1)
        != source.sample_rate_hz
        or _strict_int(native_audio.get("frame_count"), label="NGC native frame_count", minimum=1)
        != source.frame_count
    ):
        raise PhraseBoundaryTriageError("NGC native descriptor does not match the bundle source timeline")
    return {
        "manifest_basename": manifest_path.name,
        "manifest_sha256": _sha256(manifest_path),
        "extend_seq": extend_seq,
        "exact_daegeum_sanjo_source_verified": True,
        "research_only_and_no_game_gate_verified": True,
        "catalog_metadata_not_treated_as_legato_or_phrase_label": True,
        "not_a_training_or_game_distribution_clearance": True,
    }


def _rank_percentile(values: Any, value: float, *, np: Any) -> float:
    """Midrank percentile; the source feature track is the explicit basis."""

    lower = int(np.count_nonzero(values < value))
    equal = int(np.count_nonzero(values == value))
    return (lower + 0.5 * equal) / max(1, len(values))


def _window_summary(values: Any, start: int, end: int, *, np: Any) -> dict[str, Any]:
    if not (0 <= start < end <= len(values)):
        raise PhraseBoundaryTriageError("feature context window lies outside the selected source")
    window = values[start:end]
    return {
        "feature_index_range": [start, end],
        "frame_count": end - start,
        "median": _round(float(np.median(window))),
        "mean": _round(float(np.mean(window))),
        "minimum": _round(float(np.min(window))),
        "maximum": _round(float(np.max(window))),
    }


def _head_context(track: Any, *, boundary_index: int, context_frames: int,
                  trajectory_reference_rms_dbfs: float, np: Any) -> dict[str, Any]:
    pre = _window_summary(track.rms_dbfs, boundary_index - context_frames, boundary_index, np=np)
    post = _window_summary(track.rms_dbfs, boundary_index, boundary_index + context_frames, np=np)
    low_energy = float(pre["median"])
    onset_at_boundary = float(track.onset_flux[boundary_index])
    onset_window = track.onset_flux[boundary_index - context_frames:boundary_index + context_frames]
    return {
        "role": "head_context_measurement_only",
        "anchor_feature_index": boundary_index,
        "anchor_native_frame_center": int(track.native_frame_center[boundary_index]),
        "anchor_time_seconds": _round(float(track.time_s[boundary_index])),
        "pre_energy_rms_dbfs": pre,
        "post_energy_rms_dbfs": post,
        "low_energy_proxy_rms_dbfs": _round(low_energy),
        "low_energy_proxy_percentile_within_full_source_feature_track": _round(
            _rank_percentile(track.rms_dbfs, low_energy, np=np)
        ),
        "trajectory_reference_minus_pre_energy_db": _round(trajectory_reference_rms_dbfs - low_energy),
        "pre_to_post_energy_change_db": _round(float(post["median"]) - low_energy),
        "onset_flux_proxy_at_anchor": _round(onset_at_boundary),
        "onset_flux_proxy_percentile_within_full_source_feature_track": _round(
            _rank_percentile(track.onset_flux, onset_at_boundary, np=np)
        ),
        "local_onset_flux_proxy_maximum": _round(float(np.max(onset_window))),
        "measurements_are_not_a_phrase_head_breath_or_attack_label": True,
    }


def _tail_context(track: Any, *, boundary_index: int, context_frames: int,
                  trajectory_reference_rms_dbfs: float, np: Any) -> dict[str, Any]:
    pre = _window_summary(track.rms_dbfs, boundary_index - context_frames, boundary_index, np=np)
    post = _window_summary(track.rms_dbfs, boundary_index, boundary_index + context_frames, np=np)
    low_energy = float(post["median"])
    onset_at_boundary = float(track.onset_flux[boundary_index])
    onset_window = track.onset_flux[boundary_index - context_frames:boundary_index + context_frames]
    return {
        "role": "tail_context_measurement_only",
        "anchor_feature_index": boundary_index,
        "anchor_native_frame_center": int(track.native_frame_center[boundary_index]),
        "anchor_time_seconds": _round(float(track.time_s[boundary_index])),
        "pre_energy_rms_dbfs": pre,
        "post_energy_rms_dbfs": post,
        "low_energy_proxy_rms_dbfs": _round(low_energy),
        "low_energy_proxy_percentile_within_full_source_feature_track": _round(
            _rank_percentile(track.rms_dbfs, low_energy, np=np)
        ),
        "trajectory_reference_minus_post_energy_db": _round(trajectory_reference_rms_dbfs - low_energy),
        "pre_to_post_energy_change_db": _round(float(pre["median"]) - low_energy),
        "onset_flux_proxy_at_anchor": _round(onset_at_boundary),
        "onset_flux_proxy_percentile_within_full_source_feature_track": _round(
            _rank_percentile(track.onset_flux, onset_at_boundary, np=np)
        ),
        "local_onset_flux_proxy_maximum": _round(float(np.max(onset_window))),
        "measurements_are_not_a_phrase_tail_release_or_breath_label": True,
    }


def _head_key(item: Mapping[str, Any], *, trajectory_start: int) -> tuple[Any, ...]:
    return (
        float(item["low_energy_proxy_percentile_within_full_source_feature_track"]),
        -float(item["pre_to_post_energy_change_db"]),
        -float(item["onset_flux_proxy_percentile_within_full_source_feature_track"]),
        -float(item["trajectory_reference_minus_pre_energy_db"]),
        trajectory_start - int(item["anchor_feature_index"]),
        int(item["anchor_feature_index"]),
    )


def _tail_key(item: Mapping[str, Any], *, trajectory_end: int) -> tuple[Any, ...]:
    return (
        float(item["low_energy_proxy_percentile_within_full_source_feature_track"]),
        -float(item["pre_to_post_energy_change_db"]),
        -float(item["trajectory_reference_minus_post_energy_db"]),
        int(item["anchor_feature_index"]) - (trajectory_end - 1),
        int(item["anchor_feature_index"]),
    )


def _rank_pair_key(item: Mapping[str, Any]) -> tuple[Any, ...]:
    head = item["head_context_proxies"]
    tail = item["tail_context_proxies"]
    span = item["native_source_span"]
    # All components remain visible.  This lexicographic priority is a
    # deterministic *triage order*, not a model of phrase quality.
    return (
        max(
            float(head["low_energy_proxy_percentile_within_full_source_feature_track"]),
            float(tail["low_energy_proxy_percentile_within_full_source_feature_track"]),
        ),
        float(head["low_energy_proxy_percentile_within_full_source_feature_track"])
        + float(tail["low_energy_proxy_percentile_within_full_source_feature_track"]),
        -min(float(head["pre_to_post_energy_change_db"]), float(tail["pre_to_post_energy_change_db"])),
        -float(head["onset_flux_proxy_percentile_within_full_source_feature_track"]),
        int(span["frame_count"]),
        int(head["anchor_feature_index"]),
        int(tail["anchor_feature_index"]),
    )


def _feature_frames(seconds: float, *, nominal_hop_seconds: float, label: str) -> int:
    if nominal_hop_seconds <= 0:
        raise PhraseBoundaryTriageError("feature hop must be positive")
    result = int(round(seconds / nominal_hop_seconds))
    if result < 1:
        raise PhraseBoundaryTriageError(f"{label} is smaller than one feature hop")
    return result


def _candidate_rows(track: Any, *, selected: Mapping[str, Any], context_frames: int,
                    guard_frames: int, maximum_bracket_frames: int,
                    low_energy_percentile_limit: float, max_per_side: int,
                    top: int, np: Any) -> tuple[list[dict[str, Any]], dict[str, int]]:
    feature_start, feature_end = selected["feature_span"]["feature_index_range"]
    native_start, native_end = selected["native_source_span"]["frame_range"]
    if not 0.0 < low_energy_percentile_limit <= 1.0:
        raise PhraseBoundaryTriageError("--maximum-low-energy-percentile must be in (0, 1]")
    trajectory_reference = float(np.median(track.rms_dbfs[feature_start:feature_end]))
    left_start = max(context_frames, feature_start - maximum_bracket_frames)
    left_end = min(feature_start - guard_frames, len(track.time_s) - context_frames)
    right_start = max(feature_end - 1 + guard_frames, context_frames)
    right_end = min(len(track.time_s) - context_frames, feature_end - 1 + maximum_bracket_frames)
    # ``range`` uses an exclusive upper bound.  The right edge may be the
    # final usable anchor at len-context-1, so add one where valid.
    left_indices = range(left_start, left_end + 1) if left_start <= left_end else range(0)
    right_indices = range(right_start, right_end + 1) if right_start <= right_end else range(0)
    heads = [
        _head_context(
            track,
            boundary_index=index,
            context_frames=context_frames,
            trajectory_reference_rms_dbfs=trajectory_reference,
            np=np,
        )
        for index in left_indices
    ]
    tails = [
        _tail_context(
            track,
            boundary_index=index,
            context_frames=context_frames,
            trajectory_reference_rms_dbfs=trajectory_reference,
            np=np,
        )
        for index in right_indices
    ]
    eligible_heads = [
        item for item in heads
        if float(item["low_energy_proxy_percentile_within_full_source_feature_track"])
        <= low_energy_percentile_limit
    ]
    eligible_tails = [
        item for item in tails
        if float(item["low_energy_proxy_percentile_within_full_source_feature_track"])
        <= low_energy_percentile_limit
    ]
    eligible_heads.sort(key=lambda item: _head_key(item, trajectory_start=feature_start))
    eligible_tails.sort(key=lambda item: _tail_key(item, trajectory_end=feature_end))
    retained_heads = eligible_heads[:max_per_side]
    retained_tails = eligible_tails[:max_per_side]
    rows: list[dict[str, Any]] = []
    for head in retained_heads:
        head_anchor = int(head["anchor_feature_index"])
        # Include the measured lower-energy pre-context itself in the raw
        # coordinate.  The resulting span is one native-source interval, not
        # a join of a head crop, trajectory crop, and tail crop.
        raw_feature_start = head_anchor - context_frames
        for tail in retained_tails:
            tail_anchor = int(tail["anchor_feature_index"])
            raw_feature_end_exclusive = tail_anchor + context_frames
            if raw_feature_start < 0 or raw_feature_end_exclusive > len(track.native_frame_center):
                continue
            raw_start = int(track.native_frame_center[raw_feature_start])
            raw_end = int(track.native_frame_center[raw_feature_end_exclusive - 1]) + 1
            if not (0 <= raw_start < raw_end <= track.source.frame_count):
                raise PhraseBoundaryTriageError("computed raw source span exceeds native source bounds")
            # This is the central safety property: do not return a lower-energy
            # point unless the complete original trajectory enclosure remains
            # inside one raw source frame range.
            if not (raw_start <= native_start and native_end <= raw_end):
                continue
            candidate_id = (
                f"boundary_span_{track.source.source_id}_{head_anchor:06d}_{tail_anchor:06d}"
            )
            rows.append({
                "candidate_id": candidate_id,
                "selected_trajectory": {
                    "trajectory_id": selected["trajectory_id"],
                    "priority_rank_at_retrieval": selected["priority_rank_at_retrieval"],
                    "trajectory_native_frame_range_enclosed": [native_start, native_end],
                    "trajectory_feature_index_range_enclosed": [feature_start, feature_end],
                },
                "source": {
                    **selected["source"],
                },
                "native_source_span": {
                    "frame_range": [raw_start, raw_end],
                    "frame_count": raw_end - raw_start,
                    "duration_seconds": _round((raw_end - raw_start) / track.source.sample_rate_hz),
                    "single_contiguous_source_frame_range": True,
                    "trajectory_native_frame_range_enclosed": [native_start, native_end],
                    "feature_center_derived_unreviewed_crop_coordinate_only": True,
                    "not_a_verified_phrase_or_gesture_boundary": True,
                },
                "head_context_proxies": head,
                "tail_context_proxies": tail,
                "automatic_boundary_status": {
                    "source_is_one_sha_verified_native_wav": True,
                    "selected_direct_trajectory_remains_unreviewed": True,
                    # Keep the cross-tool R&D truth aliases alongside the
                    # more specific boundary names.  They do not weaken the
                    # status; a generic source-led contour reader can reject
                    # a row that has lost either conservative wording.
                    "all_results_remain_unreviewed": True,
                    "unreviewed_automatic_boundary_candidate": True,
                    "automatic_measurement_is_not_a_musical_phrase_label": True,
                    "not_a_verified_musical_phrase": True,
                    "not_evidence_of_same_breath": True,
                    "not_evidence_of_slur": True,
                    "not_evidence_of_natural_legato": True,
                    "not_an_approved_transition": True,
                    "not_an_approved_transition_or_phrase": True,
                    "not_transition_bank_item": True,
                    "not_a_transition_bank_item": True,
                    "not_a_training_item": True,
                    "not_a_game_asset": True,
                },
                "ranking_rule": (
                    "lexicographic lower maximum then summed source-relative low-energy percentile; then larger "
                    "measured head/tail energy-change proxies, larger head onset-flux percentile, shorter raw span, "
                    "and deterministic feature coordinates. Measurement-only triage, not phrase/breath/release/"
                    "legato/quality/approval evidence."
                ),
            })
    rows.sort(key=_rank_pair_key)
    returned = []
    for rank, row in enumerate(rows[:top], 1):
        copied = dict(row)
        copied["priority_rank"] = rank
        returned.append(copied)
    counts = {
        "head_anchor_positions_scanned": len(heads),
        "tail_anchor_positions_scanned": len(tails),
        "head_positions_within_low_energy_percentile_gate": len(eligible_heads),
        "tail_positions_within_low_energy_percentile_gate": len(eligible_tails),
        "head_positions_retained_before_pairing": len(retained_heads),
        "tail_positions_retained_before_pairing": len(retained_tails),
        "candidate_pairs_before_top": len(rows),
        "returned_candidate_count": len(returned),
    }
    return returned, counts


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
        "priority_rank", "candidate_id", "trajectory_id", "source_id", "ngc_extend_seq",
        "raw_start_frame", "raw_end_frame_exclusive", "raw_duration_seconds",
        "head_anchor_feature_index", "head_low_energy_percentile", "head_pre_to_post_energy_db",
        "head_onset_flux_percentile", "tail_anchor_feature_index", "tail_low_energy_percentile",
        "tail_pre_to_post_energy_db", "all_candidates_unreviewed", "not_musical_phrase", "not_game_asset",
    ]
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, delimiter="\t", lineterminator="\n")
        writer.writerow(header)
        for row in rows:
            source = row["source"]
            span = row["native_source_span"]
            head = row["head_context_proxies"]
            tail = row["tail_context_proxies"]
            status = row["automatic_boundary_status"]
            values = [
                row["priority_rank"], row["candidate_id"], row["selected_trajectory"]["trajectory_id"],
                source["source_id"], source.get("ngc_extend_seq", ""),
                span["frame_range"][0], span["frame_range"][1], span["duration_seconds"],
                head["anchor_feature_index"], head["low_energy_proxy_percentile_within_full_source_feature_track"],
                head["pre_to_post_energy_change_db"],
                head["onset_flux_proxy_percentile_within_full_source_feature_track"],
                tail["anchor_feature_index"], tail["low_energy_proxy_percentile_within_full_source_feature_track"],
                tail["pre_to_post_energy_change_db"],
                status["unreviewed_automatic_boundary_candidate"],
                status["automatic_measurement_is_not_a_musical_phrase_label"],
                status["not_a_game_asset"],
            ]
            writer.writerow([_tsv_cell(value) for value in values])


def build_phrase_boundary_triage(
    *,
    bundle_dir: str | Path,
    raw_daegeum_dirs: str | Path | Sequence[str | Path],
    ngc_extended_manifest: str | Path,
    output_dir: str | Path,
    trajectory_retrieval: str | Path,
    trajectory_id: str | None = None,
    priority_rank: int | None = None,
    ngc_extend_seq_range: str | None = None,
    ngc_first_65_3_4_84: bool = False,
    maximum_bracket_seconds: float = DEFAULT_MAXIMUM_BRACKET_SECONDS,
    context_seconds: float = DEFAULT_CONTEXT_SECONDS,
    minimum_trajectory_guard_seconds: float = DEFAULT_MINIMUM_TRAJECTORY_GUARD_SECONDS,
    maximum_low_energy_percentile: float = DEFAULT_MAXIMUM_LOW_ENERGY_PERCENTILE,
    max_boundary_candidates_per_side: int = DEFAULT_MAX_BOUNDARY_CANDIDATES_PER_SIDE,
    top: int = DEFAULT_TOP,
) -> dict[str, Any]:
    """Create a new coordinate-only, source-led phrase-boundary triage artifact."""

    np = _require_numpy()
    bundle = Path(bundle_dir).expanduser().resolve()
    output = Path(output_dir).expanduser().resolve()
    report_path = Path(trajectory_retrieval).expanduser().resolve()
    manifest_path = Path(ngc_extended_manifest).expanduser().resolve()
    if not bundle.is_dir():
        raise PhraseBoundaryTriageError("--bundle must be a readable R&D-06 bundle directory")
    if not report_path.is_file():
        raise PhraseBoundaryTriageError("--trajectory-retrieval must name a readable JSON report")
    if not manifest_path.is_file():
        raise PhraseBoundaryTriageError("--ngc-extended-manifest must name a readable manifest")
    if output.exists():
        raise PhraseBoundaryTriageError("--output-dir must not already exist; refusing to overwrite R&D evidence")
    maximum_bracket = _finite_float(
        maximum_bracket_seconds,
        label="--maximum-bracket-seconds",
        minimum=0.02,
        maximum=MAXIMUM_BRACKET_SECONDS_HARD_LIMIT,
    )
    context = _finite_float(context_seconds, label="--context-seconds", minimum=0.001)
    guard = _finite_float(
        minimum_trajectory_guard_seconds,
        label="--minimum-trajectory-guard-seconds",
        minimum=0.001,
    )
    if context + guard > maximum_bracket:
        raise PhraseBoundaryTriageError("context plus trajectory guard must fit inside --maximum-bracket-seconds")
    low_percentile = _finite_float(
        maximum_low_energy_percentile,
        label="--maximum-low-energy-percentile",
        minimum=1e-9,
        maximum=1.0,
    )
    if type(max_boundary_candidates_per_side) is not int or not 1 <= max_boundary_candidates_per_side <= MAXIMUM_BOUNDARY_CANDIDATES_PER_SIDE_HARD_LIMIT:
        raise PhraseBoundaryTriageError(
            f"--max-boundary-candidates-per-side must be an integer in [1,{MAXIMUM_BOUNDARY_CANDIDATES_PER_SIDE_HARD_LIMIT}]"
        )
    if type(top) is not int or not 1 <= top <= MAXIMUM_TOP_HARD_LIMIT:
        raise PhraseBoundaryTriageError(f"--top must be an integer in [1,{MAXIMUM_TOP_HARD_LIMIT}]")
    roots = _normalise_roots(raw_daegeum_dirs)
    try:
        sources, catalog_sha256 = _load_catalog(bundle)
    except TrajectoryRetrievalError as exc:
        raise PhraseBoundaryTriageError(str(exc)) from exc
    report = _json_load(report_path, label="trajectory retrieval report")
    if not isinstance(report, Mapping):
        raise PhraseBoundaryTriageError("trajectory retrieval report is not an object")
    _verify_report_bundle_link(report, bundle=bundle, catalog_sha256=catalog_sha256)
    selected_row = _report_row(report, trajectory_id=trajectory_id, priority_rank=priority_rank)
    selected_source = selected_row.get("source")
    if not isinstance(selected_source, Mapping) or not isinstance(selected_source.get("source_id"), str):
        raise PhraseBoundaryTriageError("selected trajectory does not identify one source_id")
    source_id = selected_source["source_id"]
    source = sources.get(source_id)
    if source is None:
        raise PhraseBoundaryTriageError("selected trajectory source_id is absent from this bundle")
    # `select_sources()` is the shared exact-NGC mapping gate used by the
    # direct retriever.  Intersecting with source_id prevents a manifest/range
    # from silently widening the selected source.
    try:
        mapped, sequence_by_source, selection = select_sources(
            bundle,
            sources,
            source_ids=(source_id,),
            ngc_manifest=manifest_path,
            ngc_extend_seq_range=ngc_extend_seq_range,
            ngc_first_65_3_4_84=ngc_first_65_3_4_84,
        )
    except TrajectoryRetrievalError as exc:
        raise PhraseBoundaryTriageError(str(exc)) from exc
    if len(mapped) != 1 or mapped[0].source_id != source_id or source_id not in sequence_by_source:
        raise PhraseBoundaryTriageError("explicit NGC source selection did not resolve exactly the selected trajectory source")
    extend_seq = sequence_by_source[source_id]
    try:
        track = _load_feature_track(bundle, source, np=np)
    except TrajectoryRetrievalError as exc:
        raise PhraseBoundaryTriageError(str(exc)) from exc
    selected = _validate_trajectory_row(selected_row, source=source, track=track, report=report)
    selected["source"]["ngc_extend_seq"] = extend_seq
    raw_path = _resolve_raw_source(selected["source"], roots)
    raw_gate = _raw_native_gate(raw_path, source=source)
    manifest_gate = _verify_ngc_manifest_gate(manifest_path, source=source, extend_seq=extend_seq)
    nominal_hop = float(np.median(np.diff(track.time_s)))
    if not math.isfinite(nominal_hop) or nominal_hop <= 0.0:
        raise PhraseBoundaryTriageError("selected feature track has no positive nominal hop")
    context_frames = _feature_frames(context, nominal_hop_seconds=nominal_hop, label="--context-seconds")
    guard_frames = _feature_frames(guard, nominal_hop_seconds=nominal_hop, label="--minimum-trajectory-guard-seconds")
    bracket_frames = _feature_frames(maximum_bracket, nominal_hop_seconds=nominal_hop, label="--maximum-bracket-seconds")
    if context_frames + guard_frames > bracket_frames:
        raise PhraseBoundaryTriageError("rounded context plus guard exceeds rounded maximum bracket")
    candidates, counts = _candidate_rows(
        track,
        selected=selected,
        context_frames=context_frames,
        guard_frames=guard_frames,
        maximum_bracket_frames=bracket_frames,
        low_energy_percentile_limit=low_percentile,
        max_per_side=max_boundary_candidates_per_side,
        top=top,
        np=np,
    )
    output.mkdir(parents=True, exist_ok=False)
    result: dict[str, Any] = {
        "schema": PHRASE_BOUNDARY_TRIAGE_SCHEMA,
        "artifact_kind": "unreviewed_source_led_low_energy_context_boundary_priority",
        "input": {
            "bundle": {
                "directory_basename": bundle.name,
                "source_catalog_sha256": catalog_sha256,
                "absolute_paths_omitted": True,
            },
            "trajectory_retrieval": {
                "basename": report_path.name,
                "sha256": _sha256(report_path),
                "schema": report.get("schema"),
                "source_catalog_link_verified": True,
            },
            "ngc_extended_manifest": {
                **manifest_gate,
                "shared_source_selection": selection,
            },
            "raw_source": raw_gate,
        },
        "selected_trajectory": selected,
        "configuration": {
            "maximum_bracket_seconds": _round(maximum_bracket),
            "context_seconds": _round(context),
            "minimum_trajectory_guard_seconds": _round(guard),
            "maximum_low_energy_percentile_within_full_source_feature_track": _round(low_percentile),
            "maximum_boundary_candidates_per_side": max_boundary_candidates_per_side,
            "top_returned_candidates": top,
            "nominal_feature_hop_seconds": _round(nominal_hop),
            "context_feature_frames": context_frames,
            "trajectory_guard_feature_frames": guard_frames,
            "maximum_bracket_feature_frames": bracket_frames,
        },
        "interpretation_limits": {
            "source_audio_not_decoded_copied_written_or_rendered": True,
            "output_contains_only_native_frame_coordinates_and_feature_proxy_measurements": True,
            "all_candidates_remain_unreviewed_not_musical_phrase_not_approved_not_game_assets": True,
            "low_energy_onset_and_release_proxies_are_not_breath_slur_legato_or_performance_labels": True,
            "no_candidate_is_added_to_transition_bank_training_set_or_runtime_bgm": True,
            "every_returned_span_is_one_contiguous_coordinate_range_in_one_sha_verified_source": True,
        },
        "counts": counts,
        "candidates": candidates,
    }
    _json_dump(output / "phrase_boundary_triage.json", result)
    _write_tsv(output / "phrase_boundary_triage.tsv", candidates)
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", help="R&D-06 bundle containing source_catalog.json and features/*.npz")
    parser.add_argument("--raw-daegeum-dir", action="append", dest="raw_daegeum_dirs", help="explicit raw WAV root; repeatable")
    parser.add_argument("--ngc-extended-manifest", help="verified NGC extended Daegeum Sanjo fetch manifest")
    parser.add_argument("--ngc-extend-seq-range", help="exact NGC extendSeq range START:END; requires manifest")
    parser.add_argument("--ngc-first-65-3-4-84", action="store_true", help="exact NGC #001--065 / extendSeq 1520:1584 selection")
    parser.add_argument("--trajectory-retrieval", help="direct F0 trajectory retrieval JSON report")
    parser.add_argument("--trajectory-id", help="selected trajectory_id from that report")
    parser.add_argument("--priority-rank", type=int, help="selected priority_rank from that report")
    parser.add_argument("--output-dir", help="fresh ignored R&D coordinate artifact directory")
    parser.add_argument("--maximum-bracket-seconds", type=float, default=DEFAULT_MAXIMUM_BRACKET_SECONDS)
    parser.add_argument("--context-seconds", type=float, default=DEFAULT_CONTEXT_SECONDS)
    parser.add_argument("--minimum-trajectory-guard-seconds", type=float, default=DEFAULT_MINIMUM_TRAJECTORY_GUARD_SECONDS)
    parser.add_argument("--maximum-low-energy-percentile", type=float, default=DEFAULT_MAXIMUM_LOW_ENERGY_PERCENTILE)
    parser.add_argument("--max-boundary-candidates-per-side", type=int, default=DEFAULT_MAX_BOUNDARY_CANDIDATES_PER_SIDE)
    parser.add_argument("--top", type=int, default=DEFAULT_TOP)
    parser.add_argument("--dry-run", action="store_true", help="print safety contract without reading source/report files")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.dry_run:
        print(
            "phrase_boundary_triage: would only re-hash one explicit raw WAV and rank feature-derived native-frame "
            "coordinates around one direct trajectory; it will not decode/copy/render audio, infer a phrase/breath/slur/"
            "legato, approve anything, train a model, or touch runtime BGM/assets."
        )
        return 0
    required = {
        "bundle": args.bundle,
        "raw-daegeum-dir": args.raw_daegeum_dirs,
        "ngc-extended-manifest": args.ngc_extended_manifest,
        "trajectory-retrieval": args.trajectory_retrieval,
        "output-dir": args.output_dir,
    }
    missing = [f"--{name}" for name, value in required.items() if not value]
    if missing:
        _parser().error("required unless --dry-run: " + ", ".join(missing))
    try:
        result = build_phrase_boundary_triage(
            bundle_dir=args.bundle,
            raw_daegeum_dirs=args.raw_daegeum_dirs,
            ngc_extended_manifest=args.ngc_extended_manifest,
            output_dir=args.output_dir,
            trajectory_retrieval=args.trajectory_retrieval,
            trajectory_id=args.trajectory_id,
            priority_rank=args.priority_rank,
            ngc_extend_seq_range=args.ngc_extend_seq_range,
            ngc_first_65_3_4_84=args.ngc_first_65_3_4_84,
            maximum_bracket_seconds=args.maximum_bracket_seconds,
            context_seconds=args.context_seconds,
            minimum_trajectory_guard_seconds=args.minimum_trajectory_guard_seconds,
            maximum_low_energy_percentile=args.maximum_low_energy_percentile,
            max_boundary_candidates_per_side=args.max_boundary_candidates_per_side,
            top=args.top,
        )
    except PhraseBoundaryTriageError as exc:
        print(f"phrase_boundary_triage: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "output": Path(args.output_dir).name,
        "returned_candidate_count": result["counts"]["returned_candidate_count"],
        "all_results_remain_unreviewed": True,
        "source_audio_not_written": True,
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
