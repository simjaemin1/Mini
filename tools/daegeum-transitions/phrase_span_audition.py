#!/usr/bin/env python3
"""Export one auditable native Daegeum phrase span from a selected path.

The sequence-retrieval helper intentionally returns *references* to automatic
candidate regions.  This tool turns one selected same-source path into a
single WAV crop that includes every original frame from the first event's
context start through the last event's context end.  It never concatenates
candidate crops, trims the unexamined gap between them, or crossfades
overlapping windows.

The raw ``A_native_complete_source_span.wav`` payload is copied frame-for-frame
from one SHA-verified direct WAV into a minimal RIFF wrapper.  It therefore
preserves the native timeline and source samples, while deliberately dropping
unrelated BWF/INFO metadata from the wrapper.  It is still only an unreviewed
automatic-candidate path: a continuous exported file is not evidence of one
breath, a slur, natural legato, an approved transition, or a game asset.

An optional ``P_global_pitch_time_preview.wav`` applies exactly one uniform
Rubber Band pitch offset and one uniform time ratio to the whole native span.
It is bounded before rendering and is explicitly labelled synthetic/non-native.
It never uses per-event clips, dynamic pitch maps, gain matching, fades, or
runtime assets.

The input may be a normal ``sequence_retrieval.json`` report plus a selected
path ID/rank, a direct trajectory report, a source-led
``phrase_boundary_triage.json`` report, or a standalone selected path JSON
object.  Boundary-triage reports undergo their additional report/catalog/raw
source gates before a raw lead-stem is copied.  In every case only a stable
identifier, ``source``, and ``native_source_span.frame_range`` are used to
locate audio; no backing mix or runtime asset is involved.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import shutil
import struct
import subprocess
import sys
from typing import Any, Callable, Mapping, Sequence


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from native_wav import NativeWavError, inspect_wav, sha256_file  # noqa: E402


SCHEMA = "durango.daegeum.transition-bank.v1"
SEQUENCE_RETRIEVAL_SCHEMA_PREFIX = f"{SCHEMA}.same-source-sequence-retrieval."
TRAJECTORY_RETRIEVAL_SCHEMA_PREFIX = f"{SCHEMA}.direct-f0-trajectory-retrieval."
PHRASE_BOUNDARY_TRIAGE_SCHEMA_PREFIX = f"{SCHEMA}.source-led-phrase-boundary-triage."
PHRASE_SPAN_AUDITION_SCHEMA = f"{SCHEMA}.phrase-span-audition.v1"
RAW_SPAN_SCHEMA = f"{SCHEMA}.source-faithful-native-span.v1"
GLOBAL_PREVIEW_SCHEMA = f"{SCHEMA}.global-pitch-time-preview.v1"

DEFAULT_MAX_GLOBAL_PITCH_SHIFT_SEMITONES = 2.0
DEFAULT_MIN_GLOBAL_TIME_RATIO = 0.85
DEFAULT_MAX_GLOBAL_TIME_RATIO = 1.18
DEFAULT_GLOBAL_TIME_RATIO = 1.0
DEFAULT_RUBBERBAND = "rubberband"


class PhraseSpanAuditionError(RuntimeError):
    """A source or selected path cannot support a truthful span export."""


def _json_load(path: Path, *, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise PhraseSpanAuditionError(f"missing {label}") from exc
    except json.JSONDecodeError as exc:
        raise PhraseSpanAuditionError(f"{label} is not JSON") from exc


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


def _sha256_hex(value: Any, *, label: str) -> str:
    """Return a canonical digest-shaped value without silently accepting text."""

    if not isinstance(value, str) or len(value) != 64:
        raise PhraseSpanAuditionError(f"{label} must be a 64-character SHA-256 hex digest")
    try:
        int(value, 16)
    except ValueError as exc:
        raise PhraseSpanAuditionError(f"{label} must be a 64-character SHA-256 hex digest") from exc
    return value


def _safe_relative_path(value: Any, *, label: str) -> PurePosixPath:
    if not isinstance(value, str) or not value or "\\" in value:
        raise PhraseSpanAuditionError(f"{label} must be a non-empty POSIX relative path")
    path = PurePosixPath(value)
    if path.is_absolute() or "." in path.parts or ".." in path.parts:
        raise PhraseSpanAuditionError(f"{label} is not a safe relative path")
    return path


def _strict_int(value: Any, *, label: str, minimum: int | None = None) -> int:
    if type(value) is not int:
        raise PhraseSpanAuditionError(f"{label} must be an integer native frame coordinate")
    if minimum is not None and value < minimum:
        raise PhraseSpanAuditionError(f"{label} is below its permitted range")
    return value


def _finite_float(value: Any, *, label: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise PhraseSpanAuditionError(f"{label} must be finite") from exc
    if not math.isfinite(number):
        raise PhraseSpanAuditionError(f"{label} must be finite")
    return number


def _round(value: float) -> float:
    return round(float(value), 6)


def _inside(root: Path, candidate: Path) -> Path:
    resolved = candidate.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise PhraseSpanAuditionError(
            "catalog relative path escapes an explicit --raw-daegeum-dir"
        ) from exc
    return resolved


def _normalise_roots(values: str | Path | Sequence[str | Path]) -> list[Path]:
    if isinstance(values, (str, Path)):
        values = [values]
    if not values:
        raise PhraseSpanAuditionError("at least one --raw-daegeum-dir is required")
    roots: list[Path] = []
    seen: set[Path] = set()
    for value in values:
        root = Path(value).expanduser().resolve()
        if not root.is_dir():
            raise PhraseSpanAuditionError("each --raw-daegeum-dir must be a readable directory")
        if root in seen:
            raise PhraseSpanAuditionError("the same --raw-daegeum-dir was supplied more than once")
        seen.add(root)
        roots.append(root)
    return roots


def _catalog_source(bundle: Path, source_id: str) -> tuple[dict[str, Any], str]:
    catalog_path = bundle / "source_catalog.json"
    catalog = _json_load(catalog_path, label="source_catalog.json")
    if not isinstance(catalog, Mapping) or catalog.get("schema") != f"{SCHEMA}.source-catalog.v1":
        raise PhraseSpanAuditionError("source_catalog.json does not have the R&D-06 catalog schema")
    rows = catalog.get("files")
    if not isinstance(rows, list) or not rows:
        raise PhraseSpanAuditionError("source_catalog.json has no source files")
    found: dict[str, Any] | None = None
    for number, row in enumerate(rows, 1):
        if not isinstance(row, dict):
            raise PhraseSpanAuditionError(f"source_catalog.json.files[{number}] is not an object")
        if row.get("source_id") == source_id:
            if found is not None:
                raise PhraseSpanAuditionError("source_catalog.json repeats selected source_id")
            found = row
    if found is None:
        raise PhraseSpanAuditionError("selected path source_id is absent from source_catalog.json")
    return found, _sha256(catalog_path)


def _select_from_report(
    value: Any,
    *,
    path_id: str | None,
    priority_rank: int | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Choose a row from a versioned retrieval report without fixing its revision."""

    if not isinstance(value, Mapping):
        raise PhraseSpanAuditionError("retrieval input is not an object")
    schema = value.get("schema")
    if not isinstance(schema, str):
        raise PhraseSpanAuditionError("retrieval input does not have a schema")
    report_input: Mapping[str, Any] | None = None
    if schema.startswith(SEQUENCE_RETRIEVAL_SCHEMA_PREFIX):
        rows_key = "paths"
        report_kind = "sequence_retrieval_report"
        report_input = value.get("input_bundle") if isinstance(value.get("input_bundle"), Mapping) else None
    elif schema.startswith(TRAJECTORY_RETRIEVAL_SCHEMA_PREFIX):
        rows_key = "trajectories"
        report_kind = "direct_trajectory_retrieval_report"
        report_input = value.get("input_bundle") if isinstance(value.get("input_bundle"), Mapping) else None
    elif schema.startswith(PHRASE_BOUNDARY_TRIAGE_SCHEMA_PREFIX):
        rows_key = "candidates"
        report_kind = "phrase_boundary_triage_report"
        triage_input = value.get("input")
        report_input = triage_input.get("bundle") if isinstance(triage_input, Mapping) and isinstance(
            triage_input.get("bundle"), Mapping
        ) else None
    else:
        raise PhraseSpanAuditionError("retrieval input does not have a supported retrieval schema prefix")
    rows = value.get(rows_key)
    if not isinstance(rows, list) or not rows:
        raise PhraseSpanAuditionError("sequence retrieval input has no returned paths")
    if (path_id is None) == (priority_rank is None):
        raise PhraseSpanAuditionError("choose exactly one of --path-id or --priority-rank for a retrieval report")
    selected: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            raise PhraseSpanAuditionError("retrieval rows contains a non-object")
        row_identifier = row.get("path_id", row.get("trajectory_id", row.get("candidate_id")))
        if path_id is not None and row_identifier == path_id:
            selected.append(row)
        if priority_rank is not None and row.get("priority_rank") == priority_rank:
            selected.append(row)
    if len(selected) != 1:
        selector = f"path_id={path_id!r}" if path_id is not None else f"priority_rank={priority_rank!r}"
        raise PhraseSpanAuditionError(f"retrieval report has no unique selected path for {selector}")
    report_identity: dict[str, Any] = {
        "kind": report_kind,
        "schema": schema,
        "sha256": None,
        "source_catalog_link_verified": False,
        "candidates_link_verified": False,
    }
    if isinstance(report_input, Mapping):
        report_identity["declared_bundle_basename"] = report_input.get("directory_basename")
        report_identity["declared_source_catalog_sha256"] = report_input.get("source_catalog_sha256")
        report_identity["declared_candidates_jsonl_sha256"] = report_input.get("candidates_jsonl_sha256")
    if report_kind == "phrase_boundary_triage_report":
        triage_input = value.get("input")
        report_identity["triage_artifact_kind"] = value.get("artifact_kind")
        report_identity["triage_selected_trajectory"] = (
            dict(value["selected_trajectory"])
            if isinstance(value.get("selected_trajectory"), Mapping) else None
        )
        report_identity["triage_raw_source_attestation"] = (
            dict(triage_input["raw_source"])
            if isinstance(triage_input, Mapping) and isinstance(triage_input.get("raw_source"), Mapping)
            else None
        )
        report_identity["triage_trajectory_attestation"] = (
            dict(triage_input["trajectory_retrieval"])
            if isinstance(triage_input, Mapping) and isinstance(triage_input.get("trajectory_retrieval"), Mapping)
            else None
        )
        report_identity["triage_interpretation_limits"] = (
            dict(value["interpretation_limits"])
            if isinstance(value.get("interpretation_limits"), Mapping) else None
        )
    return selected[0], report_identity


def _load_selected_path(
    *,
    sequence_retrieval: Path | None,
    phrase_boundary_triage: Path | None,
    path_json: Path | None,
    path_id: str | None,
    priority_rank: int | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    supplied = [value for value in (sequence_retrieval, phrase_boundary_triage, path_json) if value is not None]
    if len(supplied) != 1:
        raise PhraseSpanAuditionError(
            "provide exactly one of --sequence-retrieval, --phrase-boundary-triage, or --path-json"
        )
    report_path = sequence_retrieval or phrase_boundary_triage
    if report_path is not None:
        report = _json_load(
            report_path,
            label="phrase boundary triage JSON" if phrase_boundary_triage is not None else "retrieval JSON",
        )
        selected, identity = _select_from_report(
            report, path_id=path_id, priority_rank=priority_rank
        )
        identity["sha256"] = _sha256(report_path)
        return selected, identity
    if path_id is not None or priority_rank is not None:
        raise PhraseSpanAuditionError("--path-id/--priority-rank apply only with a retrieval report")
    selected = _json_load(path_json, label="selected path JSON")
    if not isinstance(selected, dict):
        raise PhraseSpanAuditionError("--path-json must contain one selected path object")
    return selected, {
        "kind": "standalone_selected_path",
        "schema": selected.get("schema"),
        "sha256": _sha256(path_json),
        "source_catalog_link_verified": False,
        "candidates_link_verified": False,
    }


def _truth_status_mapping(
    path: Mapping[str, Any], *, expected_field: str | None = None,
) -> tuple[str, Mapping[str, Any]]:
    """Return the source status field without translating away its wording."""

    if expected_field is not None:
        status = path.get(expected_field)
        if isinstance(status, Mapping):
            return expected_field, status
        raise PhraseSpanAuditionError(
            f"selected path lacks required {expected_field} truth labels"
        )
    for field in ("automatic_path_status", "automatic_boundary_status"):
        status = path.get(field)
        if isinstance(status, Mapping):
            return field, status
    raise PhraseSpanAuditionError(
        "selected path lacks automatic_path_status or automatic_boundary_status truth labels"
    )


def _require_truth_labels(
    path: Mapping[str, Any], *, expected_field: str | None = None,
) -> tuple[str, Mapping[str, Any]]:
    field, status = _truth_status_mapping(path, expected_field=expected_field)
    # Candidate-pair and direct-trajectory retrieval use different nouns, but
    # both expose explicit, conservative truth labels.  The aliases below do
    # not soften those constraints; every concept still must be present.
    required = {
        "unreviewed_automatic_result": (
            "all_events_unreviewed", "all_results_remain_unreviewed", "unreviewed_automatic_boundary_candidate",
        ),
        "not_a_musical_gesture_label": (
            "automatic_detection_is_not_a_musical_gesture_label",
            "trajectory_was_scanned_directly_from_feature_npz_not_candidate_pairs",
            "automatic_measurement_is_not_a_musical_phrase_label",
        ),
        "one_verified_source": (
            "same_source_identity_verified", "source_is_one_verified_recording", "source_is_one_sha_verified_native_wav",
        ),
        "strict_native_or_feature_order": (
            "strict_temporal_ordering_of_boundary_centers_verified",
            "strictly_consecutive_voiced_feature_rows",
            "source_is_one_sha_verified_native_wav",
        ),
        "not_same_breath_evidence": ("not_evidence_of_same_breath",),
        "not_slur_evidence": ("not_evidence_of_slur",),
        "not_natural_legato_evidence": ("not_evidence_of_natural_legato",),
        "not_approved_transition": (
            "not_approved_transition_path", "not_an_approved_transition_path",
            "not_an_approved_transition", "not_an_approved_transition_or_phrase",
        ),
        "not_transition_bank_item": (
            "not_transition_bank_item", "not_a_transition_bank_item",
        ),
        "not_training_item": ("not_training_item", "not_a_training_item"),
        "not_game_asset": ("not_game_asset", "not_a_game_asset"),
    }
    missing = [
        label for label, aliases in required.items()
        if not any(status.get(key) is True for key in aliases)
    ]
    if missing:
        raise PhraseSpanAuditionError(
            "selected path does not preserve required unreviewed/truth labels: " + ", ".join(missing)
        )
    if field == "automatic_boundary_status":
        boundary_required = (
            "source_is_one_sha_verified_native_wav",
            "selected_direct_trajectory_remains_unreviewed",
            "all_results_remain_unreviewed",
            "unreviewed_automatic_boundary_candidate",
            "automatic_measurement_is_not_a_musical_phrase_label",
            "not_a_verified_musical_phrase",
            "not_evidence_of_same_breath",
            "not_evidence_of_slur",
            "not_evidence_of_natural_legato",
            "not_an_approved_transition",
            "not_an_approved_transition_or_phrase",
            "not_transition_bank_item",
            "not_a_transition_bank_item",
            "not_a_training_item",
            "not_a_game_asset",
        )
        missing_boundary = [key for key in boundary_required if status.get(key) is not True]
        if missing_boundary:
            raise PhraseSpanAuditionError(
                "phrase-boundary triage candidate lost required conservative truth labels: "
                + ", ".join(missing_boundary)
            )
    return field, status


def _validate_selected_path(
    path: Mapping[str, Any],
    catalog_source: Mapping[str, Any],
    *,
    expected_truth_label_field: str | None = None,
) -> dict[str, Any]:
    """Return validated source/span data without trusting a report's coordinates."""

    path_id = path.get("path_id", path.get("trajectory_id", path.get("candidate_id")))
    source = path.get("source")
    span = path.get("native_source_span")
    if not isinstance(path_id, str) or not path_id:
        raise PhraseSpanAuditionError("selected path has no path_id")
    if not isinstance(source, Mapping) or not isinstance(span, Mapping):
        raise PhraseSpanAuditionError("selected path lacks source or native_source_span")
    truth_label_field, input_truth_labels = _require_truth_labels(
        path, expected_field=expected_truth_label_field,
    )
    source_id = source.get("source_id")
    if not isinstance(source_id, str) or source_id != catalog_source.get("source_id"):
        raise PhraseSpanAuditionError("selected path source_id does not match source_catalog.json")
    relative = _safe_relative_path(source.get("relative_path"), label="selected path source.relative_path")
    digest = source.get("sha256")
    if not isinstance(digest, str) or len(digest) != 64:
        raise PhraseSpanAuditionError("selected path source has no SHA-256 identity")
    if digest != catalog_source.get("sha256") or relative.as_posix() != catalog_source.get("relative_path"):
        raise PhraseSpanAuditionError("selected path source identity does not match source_catalog.json")
    catalog_native = catalog_source.get("native")
    if not isinstance(catalog_native, Mapping):
        raise PhraseSpanAuditionError("selected catalog source has no native metadata")
    catalog_rate = _strict_int(catalog_native.get("sample_rate_hz"), label="catalog sample_rate_hz", minimum=1)
    catalog_frames = _strict_int(catalog_native.get("frame_count"), label="catalog frame_count", minimum=1)
    # A selected row from a future trajectory-bearing retrieval artifact may
    # intentionally carry only source identity plus native span coordinates.
    # When it includes these duplicate timeline fields, verify them; when it
    # does not, the catalog remains the authoritative timeline.
    if "sample_rate_hz" in source:
        path_rate = _strict_int(source.get("sample_rate_hz"), label="selected path sample_rate_hz", minimum=1)
        if path_rate != catalog_rate:
            raise PhraseSpanAuditionError("selected path sample rate does not match source_catalog.json")
    if "frame_count" in source:
        path_frames = _strict_int(source.get("frame_count"), label="selected path frame_count", minimum=1)
        if path_frames != catalog_frames:
            raise PhraseSpanAuditionError("selected path frame count does not match source_catalog.json")
    frame_range = span.get("frame_range")
    if not isinstance(frame_range, list) or len(frame_range) != 2:
        raise PhraseSpanAuditionError("selected path native_source_span.frame_range must have two frames")
    start = _strict_int(frame_range[0], label="native span start", minimum=0)
    end = _strict_int(frame_range[1], label="native span end", minimum=1)
    if not (start < end <= catalog_frames):
        raise PhraseSpanAuditionError("selected path native span lies outside catalog native frame count")
    reported_count = (
        _strict_int(span.get("frame_count"), label="native span frame_count", minimum=1)
        if "frame_count" in span else end - start
    )
    if reported_count != end - start:
        raise PhraseSpanAuditionError("selected path native span frame_count is inconsistent with its range")
    span_assertions = (
        "all_intermediate_native_source_frames_are_referenced_without_a_cross_recording_splice",
        "frame_range_is_an_unreviewed_feature_window_enclosure_for_raw_review_only",
        "single_contiguous_source_frame_range",
    )
    if not any(span.get(key) is True for key in span_assertions):
        raise PhraseSpanAuditionError("selected path does not assert one complete same-source frame span")
    if span.get("feature_center_derived_unreviewed_crop_coordinate_only") is True:
        span_coordinate_kind = "unreviewed_source_led_boundary_triage_crop"
    elif span.get("frame_range_is_an_unreviewed_feature_window_enclosure_for_raw_review_only") is True:
        span_coordinate_kind = "unreviewed_feature_window_enclosure"
    else:
        span_coordinate_kind = "native_event_context_enclosure"
    if truth_label_field == "automatic_boundary_status":
        for key in (
            "selected_direct_trajectory_remains_unreviewed",
            "automatic_measurement_is_not_a_musical_phrase_label",
            "not_a_verified_musical_phrase",
        ):
            if input_truth_labels.get(key) is not True:
                raise PhraseSpanAuditionError(
                    "phrase-boundary triage candidate lost its conservative status: " + key
                )
        for key in (
            "single_contiguous_source_frame_range",
            "feature_center_derived_unreviewed_crop_coordinate_only",
            "not_a_verified_phrase_or_gesture_boundary",
        ):
            if span.get(key) is not True:
                raise PhraseSpanAuditionError(
                    "phrase-boundary triage native span lost its conservative coordinate label: " + key
                )
        trajectory = path.get("selected_trajectory")
        if not isinstance(trajectory, Mapping):
            raise PhraseSpanAuditionError("phrase-boundary triage candidate lacks selected_trajectory provenance")
        trajectory_id = trajectory.get("trajectory_id")
        if not isinstance(trajectory_id, str) or not trajectory_id:
            raise PhraseSpanAuditionError("phrase-boundary triage selected trajectory has no trajectory_id")
        enclosed = trajectory.get("trajectory_native_frame_range_enclosed")
        if not isinstance(enclosed, list) or len(enclosed) != 2:
            raise PhraseSpanAuditionError("phrase-boundary triage trajectory native range is invalid")
        trajectory_start = _strict_int(enclosed[0], label="enclosed trajectory native start", minimum=0)
        trajectory_end = _strict_int(enclosed[1], label="enclosed trajectory native end", minimum=1)
        if not (start <= trajectory_start < trajectory_end <= end):
            raise PhraseSpanAuditionError("phrase-boundary triage crop does not enclose its selected trajectory span")
        span_enclosed = span.get("trajectory_native_frame_range_enclosed")
        if span_enclosed != [trajectory_start, trajectory_end]:
            raise PhraseSpanAuditionError(
                "phrase-boundary triage crop and selected trajectory disagree on enclosed native range"
            )
    events = path.get("events")
    event_ids: list[str] = []
    event_coordinates_embedded = isinstance(events, list)
    if event_coordinates_embedded:
        if len(events) < 2:
            raise PhraseSpanAuditionError("selected path events must contain at least two automatic events")
        prior_center = -1
        first_context_start: int | None = None
        last_context_end: int | None = None
        for position, event in enumerate(events, 1):
            if not isinstance(event, Mapping):
                raise PhraseSpanAuditionError("selected path events contains a non-object")
            automatic = event.get("automatic_candidate")
            region = event.get("native_region_frames")
            if not isinstance(automatic, Mapping) or not isinstance(region, Mapping):
                raise PhraseSpanAuditionError("selected path event lacks automatic/source-frame evidence")
            if automatic.get("status") != "unreviewed" or automatic.get("automatic_detection_is_not_a_musical_gesture_label") is not True:
                raise PhraseSpanAuditionError("selected path event is not explicitly an unreviewed automatic candidate")
            candidate_id = event.get("candidate_id")
            if not isinstance(candidate_id, str) or not candidate_id or candidate_id in event_ids:
                raise PhraseSpanAuditionError("selected path event IDs are invalid or repeated")
            event_ids.append(candidate_id)
            context_start = _strict_int(region.get("context_start"), label=f"event {position} context_start", minimum=0)
            center = _strict_int(region.get("boundary_center"), label=f"event {position} boundary_center", minimum=0)
            context_end = _strict_int(region.get("context_end"), label=f"event {position} context_end", minimum=1)
            window = region.get("proposed_boundary_window")
            if not isinstance(window, list) or len(window) != 2:
                raise PhraseSpanAuditionError(f"event {position} boundary window is invalid")
            boundary_start = _strict_int(window[0], label=f"event {position} boundary start", minimum=0)
            boundary_end = _strict_int(window[1], label=f"event {position} boundary end", minimum=1)
            if not (context_start <= boundary_start <= center < boundary_end <= context_end <= catalog_frames):
                raise PhraseSpanAuditionError(f"event {position} native frame coordinates are incoherent")
            if center <= prior_center:
                raise PhraseSpanAuditionError("selected path event boundaries are not strictly ordered")
            prior_center = center
            first_context_start = context_start if first_context_start is None else first_context_start
            last_context_end = context_end
        if first_context_start != start or last_context_end != end:
            raise PhraseSpanAuditionError("selected native span does not exactly cover first-to-last event contexts")
    shift = path.get("one_global_pitch_shift_proxy")
    if shift is not None and not isinstance(shift, Mapping):
        raise PhraseSpanAuditionError("selected path global pitch shift proxy is not an object")
    if isinstance(shift, Mapping):
        if not any(shift.get(key) is True for key in (
            "not_applied_to_any_source_audio", "not_applied_to_source_audio",
        )):
            raise PhraseSpanAuditionError("selected path falsely treats proxy pitch shift as source audio")
        semitones = _finite_float(shift.get("semitones"), label="one global pitch shift proxy")
        within_preferred = shift.get("within_preferred_maximum")
        if type(within_preferred) is not bool:
            raise PhraseSpanAuditionError("selected path has no global pitch preferred-bound status")
        global_pitch_shift_proxy: dict[str, Any] = {
            "available": True,
            "semitones": _round(semitones),
            "within_preferred_maximum_at_retrieval": within_preferred,
            "retrieval_preferred_maximum_semitones": shift.get("preferred_maximum_semitones"),
            "not_applied_to_source_audio_at_retrieval": True,
        }
    else:
        global_pitch_shift_proxy = {
            "available": False,
            "reason": "selected_path_did_not_embed_one_global_pitch_shift_proxy",
            "not_applied_to_source_audio_at_retrieval": True,
        }
    selected_result: dict[str, Any] = {
        "path_id": path_id,
        # Keep the selected retrieval row's original words as well as this
        # helper's normalized limits.  A direct trajectory's feature-window
        # caution must not be silently relabelled as a candidate-pair claim.
        "input_truth_label_field": truth_label_field,
        "input_truth_labels_verbatim": dict(input_truth_labels),
        "input_native_source_span_verbatim": dict(span),
        "source": {
            "source_id": source_id,
            "sha256": digest,
            "relative_path": relative.as_posix(),
            "sample_rate_hz": catalog_rate,
            "frame_count": catalog_frames,
        },
        "span": {
            "frame_range": [start, end],
            "frame_count": end - start,
            "duration_seconds": _round((end - start) / catalog_rate),
            "event_candidate_ids": event_ids,
            "event_count": len(event_ids) if event_coordinates_embedded else None,
            "event_native_coordinates_embedded_and_validated": event_coordinates_embedded,
            "coordinate_kind": span_coordinate_kind,
        },
        "global_pitch_shift_proxy": global_pitch_shift_proxy,
    }
    if truth_label_field == "automatic_path_status":
        selected_result["input_automatic_path_status_verbatim"] = dict(input_truth_labels)
    else:
        selected_result["input_automatic_boundary_status_verbatim"] = dict(input_truth_labels)
        selected_result["triage_trajectory_provenance"] = {
            "trajectory_id": trajectory_id,
            "trajectory_native_frame_range_enclosed": [trajectory_start, trajectory_end],
        }
    return selected_result


def _resolve_raw_source(source: Mapping[str, Any], roots: Sequence[Path]) -> Path:
    relative = _safe_relative_path(source.get("relative_path"), label="catalog source relative_path")
    expected = source.get("sha256")
    if not isinstance(expected, str) or len(expected) != 64:
        raise PhraseSpanAuditionError("catalog source lacks SHA-256 identity")
    matches: list[Path] = []
    for root in roots:
        candidate = _inside(root, root.joinpath(*relative.parts))
        if candidate.is_file() and candidate.suffix.lower() == ".wav":
            try:
                if sha256_file(candidate) == expected:
                    matches.append(candidate)
            except NativeWavError as exc:
                raise PhraseSpanAuditionError("could not inspect a direct raw source WAV") from exc
    if not matches:
        raise PhraseSpanAuditionError("no explicit raw root contains the SHA-verified catalog source")
    if len(matches) > 1:
        raise PhraseSpanAuditionError("same catalog source appears in more than one explicit raw root")
    return matches[0]


def _copy_exact(source: Path, *, offset: int, byte_count: int, destination: Path, prefix: bytes) -> str:
    digest = hashlib.sha256()
    remaining = byte_count
    with source.open("rb") as input_stream, destination.open("wb") as output_stream:
        output_stream.write(prefix)
        input_stream.seek(offset)
        while remaining:
            block = input_stream.read(min(1024 * 1024, remaining))
            if not block:
                raise PhraseSpanAuditionError("raw source ended while extracting native span")
            output_stream.write(block)
            digest.update(block)
            remaining -= len(block)
    return digest.hexdigest()


def write_source_faithful_native_span(
    source_path: str | Path,
    start_frame: int,
    end_frame: int,
    output_path: str | Path,
) -> dict[str, Any]:
    """Copy one contiguous frame span into a canonical RIFF WAV wrapper.

    No audio samples are decoded or re-encoded.  To avoid creating a malformed
    simplifed wrapper for unusual WAVE_FORMAT_EXTENSIBLE inputs, this safe
    exporter accepts only ordinary PCM/IEEE-float ``fmt`` layouts.
    """

    source = Path(source_path)
    output = Path(output_path)
    if output.exists():
        raise PhraseSpanAuditionError("refusing to overwrite an existing native-span WAV")
    try:
        descriptor = inspect_wav(source)
    except NativeWavError as exc:
        raise PhraseSpanAuditionError("cannot inspect raw source for a source-faithful span") from exc
    native = descriptor.get("native_audio")
    if not isinstance(native, Mapping):
        raise PhraseSpanAuditionError("raw source has no native audio descriptor")
    try:
        frame_count = int(native["frame_count"])
        channels = int(native["channels"])
        rate = int(native["sample_rate_hz"])
        block_align = int(native["block_align_bytes"])
        bits = int(native["bits_per_sample"])
        declared_format = int(native["audio_format_code"])
        effective_format = int(native["effective_format_code"])
        data_offset = int(native["data_offset_bytes"])
        byte_rate = int(native["byte_rate"])
    except (KeyError, TypeError, ValueError) as exc:
        raise PhraseSpanAuditionError("raw source descriptor is incomplete") from exc
    if declared_format != effective_format or effective_format not in {1, 3}:
        raise PhraseSpanAuditionError(
            "source-faithful native-span export supports only ordinary PCM or IEEE float fmt layouts"
        )
    if not (0 <= start_frame < end_frame <= frame_count):
        raise PhraseSpanAuditionError("native span frame range lies outside raw source")
    bytes_per_sample = (bits + 7) // 8
    if bits <= 0 or bits % 8 or block_align != channels * bytes_per_sample or byte_rate != rate * block_align:
        raise PhraseSpanAuditionError("raw source WAV format layout is inconsistent")
    sample_bytes = (end_frame - start_frame) * block_align
    if sample_bytes > 0xFFFFFFFF - 36:
        raise PhraseSpanAuditionError("native span is too large for canonical RIFF WAV")
    fmt = struct.pack("<HHIIHH", effective_format, channels, rate, byte_rate, block_align, bits)
    header = b"RIFF" + (36 + sample_bytes).to_bytes(4, "little") + b"WAVE"
    header += b"fmt " + len(fmt).to_bytes(4, "little") + fmt
    header += b"data" + sample_bytes.to_bytes(4, "little")
    output.parent.mkdir(parents=True, exist_ok=True)
    payload_digest = _copy_exact(
        source,
        offset=data_offset + start_frame * block_align,
        byte_count=sample_bytes,
        destination=output,
        prefix=header,
    )
    try:
        rendered = inspect_wav(output)["native_audio"]
    except (NativeWavError, KeyError) as exc:
        raise PhraseSpanAuditionError("generated native span did not parse as WAV") from exc
    if (
        int(rendered["frame_count"]) != end_frame - start_frame
        or int(rendered["sample_rate_hz"]) != rate
        or int(rendered["channels"]) != channels
        or int(rendered["block_align_bytes"]) != block_align
    ):
        raise PhraseSpanAuditionError("generated native span did not preserve native WAV layout")
    return {
        "schema": RAW_SPAN_SCHEMA,
        "artifact": output.name,
        "raw_audio_is_source_faithful": True,
        "source_audio_frames_byte_for_byte_copied": True,
        "single_contiguous_source_frame_range": [start_frame, end_frame],
        "no_candidate_clip_stitching_or_crossfade": True,
        "source_sample_bytes_sha256": payload_digest,
        "source_sample_bytes": sample_bytes,
        "canonical_riff_wrapper_replaces_source_metadata": True,
        "processing": {
            "gain": "none",
            "pitch_shift": "none",
            "time_stretch": "none",
            "resample": "none",
            "channel_change": "none",
            "fade": "none",
        },
        "output_native_audio": {
            "sample_rate_hz": int(rendered["sample_rate_hz"]),
            "channels": int(rendered["channels"]),
            "frame_count": int(rendered["frame_count"]),
            "encoding": str(rendered["encoding"]),
        },
    }


def _preview_gate(
    selected: Mapping[str, Any],
    *,
    time_ratio: float,
    max_pitch_shift_semitones: float,
    min_time_ratio: float,
    max_time_ratio: float,
) -> dict[str, Any]:
    proxy = selected["global_pitch_shift_proxy"]
    available = proxy.get("available") is True
    pitch = float(proxy["semitones"]) if available else None
    if max_pitch_shift_semitones < 0:
        raise PhraseSpanAuditionError("--max-global-pitch-shift-semitones cannot be negative")
    if not (0 < min_time_ratio <= max_time_ratio):
        raise PhraseSpanAuditionError("global time-ratio bounds must be positive and ordered")
    conditions = {
        "one_global_pitch_shift_proxy_available": available,
        "one_global_pitch_shift_proxy_within_retrieval_preferred_bound": bool(
            proxy.get("within_preferred_maximum_at_retrieval")
        ) if available else False,
        "absolute_global_pitch_shift_within_preview_bound": abs(pitch) <= max_pitch_shift_semitones if pitch is not None else False,
        "one_uniform_time_ratio_within_preview_bound": min_time_ratio <= time_ratio <= max_time_ratio,
        "no_dynamic_pitch_map_or_eventwise_processing": True,
    }
    return {
        "all_conditions_met": all(conditions.values()),
        "conditions": conditions,
        "global_pitch_shift_semitones": _round(pitch) if pitch is not None else None,
        "maximum_absolute_global_pitch_shift_semitones": _round(max_pitch_shift_semitones),
        "global_time_ratio": _round(time_ratio),
        "permitted_global_time_ratio_range": [_round(min_time_ratio), _round(max_time_ratio)],
        "time_ratio_is_explicit_preview_parameter_not_score_or_performance_evidence": True,
    }


def _rubberband_version(executable: str) -> str | None:
    try:
        result = subprocess.run(
            [executable, "--version"], text=True, capture_output=True, check=False, timeout=10
        )
    except (OSError, subprocess.SubprocessError):
        return None
    output = (result.stdout or result.stderr).strip()
    return output.splitlines()[0] if result.returncode == 0 and output else None


def _render_global_preview(
    *,
    raw_span: Path,
    output_dir: Path,
    selected: Mapping[str, Any],
    gate: Mapping[str, Any],
    executable: str,
    command_runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    """Render only a bounded uniform transform of the *whole* raw span."""

    common = {
        "schema": GLOBAL_PREVIEW_SCHEMA,
        "not_source_faithful": True,
        "not_evidence_of_same_breath": True,
        "not_evidence_of_slur": True,
        "not_native_legato": True,
        "not_natural_transition_evidence": True,
        "not_approved_transition": True,
        "not_transition_bank_item": True,
        "not_training_item": True,
        "not_game_asset": True,
        "input_is_complete_source_faithful_native_span_A": True,
        "no_candidate_clip_stitching_or_crossfade": True,
        "no_dynamic_pitch_map_or_eventwise_processing": True,
    }
    if not gate["all_conditions_met"]:
        return {
            **common,
            "status": "not_rendered_outside_bounded_global_preview_gate",
            "preview_gate": dict(gate),
        }
    if shutil.which(executable) is None:
        return {
            **common,
            "status": "not_rendered_rubberband_unavailable",
            "preview_gate": dict(gate),
        }
    rendered = output_dir / "P_global_pitch_time_preview.wav"
    temporary = output_dir / ".P_global_pitch_time_preview.tmp.wav"
    if temporary.exists() or rendered.exists():
        raise PhraseSpanAuditionError("preview output name already exists in new artifact directory")
    command = [
        executable,
        "-q",
        "-3",
        "-F",
        "--centre-focus",
        "--time",
        f"{float(gate['global_time_ratio']):.9f}",
        "--pitch",
        f"{float(gate['global_pitch_shift_semitones']):.9f}",
        str(raw_span),
        str(temporary),
    ]
    try:
        result = command_runner(command, text=True, capture_output=True, check=False, timeout=120)
    except (OSError, subprocess.SubprocessError) as exc:
        return {
            **common,
            "status": "render_failed",
            "failure": type(exc).__name__,
            "preview_gate": dict(gate),
        }
    if result.returncode != 0 or not temporary.is_file():
        if temporary.exists():
            temporary.unlink()
        return {
            **common,
            "status": "render_failed",
            "return_code": result.returncode,
            "preview_gate": dict(gate),
        }
    try:
        rendered_native = inspect_wav(temporary)["native_audio"]
    except (NativeWavError, KeyError) as exc:
        temporary.unlink(missing_ok=True)
        raise PhraseSpanAuditionError("global preview output did not parse as WAV") from exc
    temporary.replace(rendered)
    return {
        **common,
        "status": "rendered",
        "artifact": rendered.name,
        "method": "rubberband_R3_formant_uniform_pitch_and_time",
        "rubberband_version": _rubberband_version(executable),
        "preview_gate": dict(gate),
        "output_native_audio": {
            "sample_rate_hz": int(rendered_native["sample_rate_hz"]),
            "channels": int(rendered_native["channels"]),
            "frame_count": int(rendered_native["frame_count"]),
            "encoding": str(rendered_native["encoding"]),
        },
    }


def _verify_phrase_boundary_triage_report_gate(
    identity: Mapping[str, Any],
    *,
    bundle: Path,
    catalog_sha256: str,
    selected: Mapping[str, Any],
    catalog_source: Mapping[str, Any],
    raw_native: Mapping[str, Any],
) -> dict[str, Any]:
    """Require the triage report's own catalog/raw-source evidence too.

    The raw WAV is independently re-hashed below.  These checks make sure a
    triage report cannot be detached from the catalog/native descriptor that
    originally constrained its coordinate-only candidate.
    """

    if identity.get("triage_artifact_kind") != "unreviewed_source_led_low_energy_context_boundary_priority":
        raise PhraseSpanAuditionError("phrase-boundary triage report has an unsupported artifact_kind")
    _sha256_hex(identity.get("sha256"), label="phrase-boundary triage report SHA-256")
    if identity.get("declared_bundle_basename") != bundle.name:
        raise PhraseSpanAuditionError("phrase-boundary triage bundle basename does not match --bundle")
    if identity.get("declared_source_catalog_sha256") != catalog_sha256:
        raise PhraseSpanAuditionError("phrase-boundary triage source_catalog SHA-256 does not match --bundle")
    raw = identity.get("triage_raw_source_attestation")
    trajectory = identity.get("triage_trajectory_attestation")
    limits = identity.get("triage_interpretation_limits")
    if not isinstance(raw, Mapping) or not isinstance(trajectory, Mapping) or not isinstance(limits, Mapping):
        raise PhraseSpanAuditionError("phrase-boundary triage report lacks raw-source/trajectory/limit attestations")
    source = selected.get("source")
    if not isinstance(source, Mapping):
        raise PhraseSpanAuditionError("validated triage candidate has no source")
    catalog_native = catalog_source.get("native")
    if not isinstance(catalog_native, Mapping):
        raise PhraseSpanAuditionError("selected catalog source has no native descriptor for triage verification")
    expected_basename = PurePosixPath(str(source["relative_path"])).name
    raw_flags = (
        "sha256_verified_against_source_catalog",
        "native_descriptor_verified_against_source_catalog",
        "source_audio_not_decoded_or_written",
    )
    if any(raw.get(flag) is not True for flag in raw_flags):
        raise PhraseSpanAuditionError("phrase-boundary triage raw-source attestation lost a required verification flag")
    if raw.get("source_basename") != expected_basename:
        raise PhraseSpanAuditionError("phrase-boundary triage raw-source basename does not match selected catalog source")
    expected_native = {
        "sample_rate_hz": _strict_int(source["sample_rate_hz"], label="selected source sample_rate_hz", minimum=1),
        "frame_count": _strict_int(source["frame_count"], label="selected source frame_count", minimum=1),
        "channels": _strict_int(catalog_native.get("channels"), label="catalog channels", minimum=1),
        "encoding": catalog_native.get("encoding"),
    }
    if not isinstance(expected_native["encoding"], str) or not expected_native["encoding"]:
        raise PhraseSpanAuditionError("selected catalog source has no native encoding for triage verification")
    attested_native = {
        "sample_rate_hz": _strict_int(raw.get("sample_rate_hz"), label="triage raw source sample_rate_hz", minimum=1),
        "frame_count": _strict_int(raw.get("frame_count"), label="triage raw source frame_count", minimum=1),
        "channels": _strict_int(raw.get("channels"), label="triage raw source channels", minimum=1),
        "encoding": raw.get("encoding"),
    }
    actual_native = {
        "sample_rate_hz": _strict_int(raw_native.get("sample_rate_hz"), label="actual raw source sample_rate_hz", minimum=1),
        "frame_count": _strict_int(raw_native.get("frame_count"), label="actual raw source frame_count", minimum=1),
        "channels": _strict_int(raw_native.get("channels"), label="actual raw source channels", minimum=1),
        "encoding": raw_native.get("encoding"),
    }
    if attested_native != expected_native or actual_native != expected_native:
        raise PhraseSpanAuditionError("phrase-boundary triage raw native descriptor does not match selected catalog source")
    if trajectory.get("source_catalog_link_verified") is not True:
        raise PhraseSpanAuditionError("phrase-boundary triage did not preserve its trajectory catalog-link verification")
    report_schema = trajectory.get("schema")
    if not isinstance(report_schema, str) or not report_schema.startswith(TRAJECTORY_RETRIEVAL_SCHEMA_PREFIX):
        raise PhraseSpanAuditionError("phrase-boundary triage trajectory attestation does not name a direct trajectory schema")
    trajectory_basename = trajectory.get("basename")
    if (
        not isinstance(trajectory_basename, str)
        or not trajectory_basename
        or "/" in trajectory_basename
        or "\\" in trajectory_basename
        or trajectory_basename != PurePosixPath(trajectory_basename).name
    ):
        raise PhraseSpanAuditionError("phrase-boundary triage trajectory report basename is unsafe")
    _sha256_hex(trajectory.get("sha256"), label="phrase-boundary triage trajectory report SHA-256")
    triage_trajectory = selected.get("triage_trajectory_provenance")
    report_trajectory = identity.get("triage_selected_trajectory")
    if not isinstance(triage_trajectory, Mapping) or not isinstance(report_trajectory, Mapping):
        raise PhraseSpanAuditionError("phrase-boundary triage lost selected trajectory provenance")
    if report_trajectory.get("trajectory_id") != triage_trajectory.get("trajectory_id"):
        raise PhraseSpanAuditionError("phrase-boundary candidate trajectory_id disagrees with its report provenance")
    report_trajectory_span = report_trajectory.get("native_source_span")
    if not isinstance(report_trajectory_span, Mapping) or report_trajectory_span.get("frame_range") != triage_trajectory.get(
        "trajectory_native_frame_range_enclosed"
    ):
        raise PhraseSpanAuditionError("phrase-boundary candidate trajectory range disagrees with report provenance")
    report_trajectory_source = report_trajectory.get("source")
    if not isinstance(report_trajectory_source, Mapping):
        raise PhraseSpanAuditionError("phrase-boundary report provenance has no trajectory source")
    for key in ("source_id", "sha256", "relative_path", "sample_rate_hz", "frame_count"):
        if report_trajectory_source.get(key) != source.get(key):
            raise PhraseSpanAuditionError(
                "phrase-boundary candidate source disagrees with its selected trajectory provenance: " + key
            )
    report_trajectory_status = report_trajectory.get("input_automatic_path_status_verbatim")
    if not isinstance(report_trajectory_status, Mapping):
        raise PhraseSpanAuditionError("phrase-boundary report provenance lost direct trajectory truth labels")
    _require_truth_labels({"automatic_path_status": report_trajectory_status}, expected_field="automatic_path_status")
    limit_flags = (
        "source_audio_not_decoded_copied_written_or_rendered",
        "all_candidates_remain_unreviewed_not_musical_phrase_not_approved_not_game_assets",
        "low_energy_onset_and_release_proxies_are_not_breath_slur_legato_or_performance_labels",
        "no_candidate_is_added_to_transition_bank_training_set_or_runtime_bgm",
        "every_returned_span_is_one_contiguous_coordinate_range_in_one_sha_verified_source",
    )
    if any(limits.get(flag) is not True for flag in limit_flags):
        raise PhraseSpanAuditionError("phrase-boundary triage report lost a required interpretation-limit flag")
    return {
        "triage_report_schema_and_sha256_identity_recorded": True,
        "source_catalog_sha256_link_verified": True,
        "triage_raw_source_attestation_matches_catalog_and_actual_native_descriptor": True,
        "raw_source_sha256_verified_via_candidate_catalog_and_actual_direct_wav": True,
        "triage_direct_trajectory_catalog_link_and_sha256_attestation_preserved_not_rehashed": True,
        "triage_candidate_and_report_trajectory_provenance_agree": True,
        "triage_unreviewed_not_phrase_not_approved_not_training_not_game_limits_verified": True,
    }


def build_phrase_span_audition(
    *,
    bundle_dir: str | Path,
    raw_daegeum_dirs: str | Path | Sequence[str | Path],
    output_dir: str | Path,
    sequence_retrieval: str | Path | None = None,
    phrase_boundary_triage: str | Path | None = None,
    path_json: str | Path | None = None,
    path_id: str | None = None,
    priority_rank: int | None = None,
    render_global_preview: bool = False,
    global_time_ratio: float = DEFAULT_GLOBAL_TIME_RATIO,
    rubberband: str = DEFAULT_RUBBERBAND,
    max_global_pitch_shift_semitones: float = DEFAULT_MAX_GLOBAL_PITCH_SHIFT_SEMITONES,
    min_global_time_ratio: float = DEFAULT_MIN_GLOBAL_TIME_RATIO,
    max_global_time_ratio: float = DEFAULT_MAX_GLOBAL_TIME_RATIO,
    command_runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    """Create one new, non-runtime selected-path audition artifact directory."""

    bundle = Path(bundle_dir).expanduser().resolve()
    output = Path(output_dir).expanduser().resolve()
    report = Path(sequence_retrieval).expanduser().resolve() if sequence_retrieval is not None else None
    triage_report = (
        Path(phrase_boundary_triage).expanduser().resolve()
        if phrase_boundary_triage is not None else None
    )
    direct_path = Path(path_json).expanduser().resolve() if path_json is not None else None
    if not bundle.is_dir():
        raise PhraseSpanAuditionError("--bundle must be a readable R&D-06 bundle directory")
    if output.exists():
        raise PhraseSpanAuditionError("--output-dir must not already exist; refusing to overwrite an R&D artifact")
    roots = _normalise_roots(raw_daegeum_dirs)
    selected_path, input_identity = _load_selected_path(
        sequence_retrieval=report,
        phrase_boundary_triage=triage_report,
        path_json=direct_path,
        path_id=path_id,
        priority_rank=priority_rank,
    )
    source_data = selected_path.get("source")
    if not isinstance(source_data, Mapping) or not isinstance(source_data.get("source_id"), str):
        raise PhraseSpanAuditionError("selected path has no source_id")
    catalog_source, catalog_digest = _catalog_source(bundle, source_data["source_id"])
    input_identity["source_catalog_sha256"] = catalog_digest
    is_phrase_boundary_triage = input_identity["kind"] == "phrase_boundary_triage_report"
    if is_phrase_boundary_triage:
        input_identity["source_catalog_link_verified"] = (
            input_identity.get("declared_source_catalog_sha256") == catalog_digest
        )
        if not input_identity["source_catalog_link_verified"]:
            raise PhraseSpanAuditionError("phrase-boundary triage source_catalog SHA-256 does not match --bundle")
    selected = _validate_selected_path(
        selected_path,
        catalog_source,
        expected_truth_label_field="automatic_boundary_status" if is_phrase_boundary_triage else None,
    )
    if input_identity["kind"] in {
        "sequence_retrieval_report", "direct_trajectory_retrieval_report",
    }:
        input_identity["source_catalog_link_verified"] = (
            input_identity.get("declared_source_catalog_sha256") == catalog_digest
        )
        candidates_path = bundle / "candidates.jsonl"
        declared_candidates = input_identity.get("declared_candidates_jsonl_sha256")
        input_identity["candidates_link_verified"] = (
            candidates_path.is_file() and declared_candidates == _sha256(candidates_path)
            if isinstance(declared_candidates, str) else None
        )
        if not input_identity["source_catalog_link_verified"]:
            raise PhraseSpanAuditionError("retrieval report source_catalog SHA-256 does not match --bundle")
        if declared_candidates is not None and not input_identity["candidates_link_verified"]:
            raise PhraseSpanAuditionError("retrieval report candidates.jsonl SHA-256 does not match --bundle")
    raw_source = _resolve_raw_source(selected["source"], roots)
    try:
        raw_descriptor = inspect_wav(raw_source)
    except NativeWavError as exc:
        raise PhraseSpanAuditionError("could not inspect SHA-verified raw source") from exc
    raw_native = raw_descriptor["native_audio"]
    if (
        raw_descriptor["sha256"] != selected["source"]["sha256"]
        or int(raw_native["sample_rate_hz"]) != selected["source"]["sample_rate_hz"]
        or int(raw_native["frame_count"]) != selected["source"]["frame_count"]
    ):
        raise PhraseSpanAuditionError("resolved raw source does not match selected catalog source identity/native timeline")
    triage_gate: dict[str, Any] | None = None
    if is_phrase_boundary_triage:
        triage_gate = _verify_phrase_boundary_triage_report_gate(
            input_identity,
            bundle=bundle,
            catalog_sha256=catalog_digest,
            selected=selected,
            catalog_source=catalog_source,
            raw_native=raw_native,
        )
    output.mkdir(parents=True, exist_ok=False)
    raw_filename = "A_raw_lead_stem.wav" if is_phrase_boundary_triage else "A_native_complete_source_span.wav"
    raw_path = output / raw_filename
    raw_span = write_source_faithful_native_span(
        raw_source,
        selected["span"]["frame_range"][0],
        selected["span"]["frame_range"][1],
        raw_path,
    )
    if is_phrase_boundary_triage:
        raw_span.update({
            "artifact_role": "unreviewed_source_led_raw_lead_stem_rnd_only",
            "not_a_verified_phrase_or_gesture_boundary": True,
            "not_an_approved_transition_or_phrase": True,
            "not_a_training_item": True,
            "not_a_game_asset": True,
            "no_backing_mix_or_runtime_asset": True,
        })
    time_ratio = _finite_float(global_time_ratio, label="--global-time-ratio")
    gate = _preview_gate(
        selected,
        time_ratio=time_ratio,
        max_pitch_shift_semitones=_finite_float(
            max_global_pitch_shift_semitones, label="--max-global-pitch-shift-semitones"
        ),
        min_time_ratio=_finite_float(min_global_time_ratio, label="--min-global-time-ratio"),
        max_time_ratio=_finite_float(max_global_time_ratio, label="--max-global-time-ratio"),
    )
    if render_global_preview:
        preview = _render_global_preview(
            raw_span=raw_path,
            output_dir=output,
            selected=selected,
            gate=gate,
            executable=rubberband,
            command_runner=command_runner,
        )
    else:
        preview = {
            "schema": GLOBAL_PREVIEW_SCHEMA,
            "status": "not_requested",
            "preview_gate": gate,
            "not_source_faithful": True,
            "not_native_legato": True,
            "not_approved_transition": True,
            "not_a_training_item": True,
            "not_game_asset": True,
            "no_backing_mix_or_runtime_asset": True,
        }
    artifact_kind = (
        "unreviewed_source_led_raw_lead_stem_audition"
        if is_phrase_boundary_triage else "unreviewed_same_source_complete_native_span_audition"
    )
    raw_manifest_key = "A_raw_lead_stem" if is_phrase_boundary_triage else "A_native_complete_source_span"
    interpretation_limits: dict[str, Any] = {
        "raw_A_is_one_contiguous_source_frame_span_not_a_stitch_of_candidate_clips": True,
        "same_source_span_is_not_evidence_of_same_breath_slur_or_natural_legato": True,
        "all_events_remain_unreviewed_automatic_candidates": True,
        "not_an_approved_transition_or_transition_bank_item": True,
        "not_a_training_item": True,
        "not_a_game_asset": True,
        "P_if_present_is_synthetic_uniform_offline_processing_not_source_faithful": True,
        "no_runtime_BGM_or_public_asset_was_read_or_written": True,
    }
    if is_phrase_boundary_triage:
        interpretation_limits.update({
            "boundary_triage_A_is_an_unreviewed_coordinate_only_crop_not_a_verified_phrase_or_gesture": True,
            "boundary_triage_A_preserves_not_phrase_not_approved_not_training_not_game_truth_labels": True,
            "boundary_triage_A_is_raw_lead_stem_only_with_no_backing_mix": True,
        })
    result: dict[str, Any] = {
        "schema": PHRASE_SPAN_AUDITION_SCHEMA,
        "artifact_kind": artifact_kind,
        "input": {
            "selected_path": input_identity,
            "bundle_directory_basename": bundle.name,
            "raw_root_count": len(roots),
            "absolute_paths_omitted": True,
            "phrase_boundary_triage_gate": triage_gate,
        },
        "selected_path": selected,
        "raw_source_verification": {
            "catalog_sha256_verified_against_raw_direct_wav": True,
            "catalog_relative_path_resolved_within_exactly_one_explicit_raw_root": True,
            "catalog_native_timeline_verified_against_raw_direct_wav": True,
        },
        raw_manifest_key: raw_span,
        "P_optional_global_pitch_time_preview": preview,
        "interpretation_limits": interpretation_limits,
    }
    _json_dump(output / "span_audition.json", result)
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", help="R&D-06 bundle containing source_catalog.json and candidates.jsonl")
    parser.add_argument(
        "--raw-daegeum-dir", action="append", dest="raw_daegeum_dirs",
        help="explicit direct-WAV root; repeat for separately catalogued roots",
    )
    parser.add_argument("--output-dir", help="new ignored R&D artifact directory; must not already exist")
    source_group = parser.add_mutually_exclusive_group()
    source_group.add_argument(
        "--sequence-retrieval",
        help="sequence_retrieval.json or direct_trajectory_retrieval.json report to select from",
    )
    source_group.add_argument(
        "--phrase-boundary-triage",
        help="source-led phrase_boundary_triage.json; exports one unreviewed raw lead stem only",
    )
    source_group.add_argument("--path-json", help="one standalone selected path JSON object")
    selector_group = parser.add_mutually_exclusive_group()
    selector_group.add_argument("--path-id", help="selected path/trajectory/candidate ID in a report")
    selector_group.add_argument("--priority-rank", type=int, help="selected priority rank in a report")
    parser.add_argument("--render-global-preview", action="store_true", help="render a bounded, explicitly synthetic P preview")
    parser.add_argument(
        "--global-time-ratio", type=float, default=DEFAULT_GLOBAL_TIME_RATIO,
        help=f"one uniform preview duration ratio (default: {DEFAULT_GLOBAL_TIME_RATIO})",
    )
    parser.add_argument("--rubberband", default=DEFAULT_RUBBERBAND, help="Rubber Band executable for optional P preview")
    parser.add_argument(
        "--max-global-pitch-shift-semitones", type=float, default=DEFAULT_MAX_GLOBAL_PITCH_SHIFT_SEMITONES,
        help=f"P preview absolute global pitch bound (default: {DEFAULT_MAX_GLOBAL_PITCH_SHIFT_SEMITONES})",
    )
    parser.add_argument(
        "--min-global-time-ratio", type=float, default=DEFAULT_MIN_GLOBAL_TIME_RATIO,
        help=f"P preview minimum uniform time ratio (default: {DEFAULT_MIN_GLOBAL_TIME_RATIO})",
    )
    parser.add_argument(
        "--max-global-time-ratio", type=float, default=DEFAULT_MAX_GLOBAL_TIME_RATIO,
        help=f"P preview maximum uniform time ratio (default: {DEFAULT_MAX_GLOBAL_TIME_RATIO})",
    )
    parser.add_argument("--dry-run", action="store_true", help="print the non-runtime plan without reading a source")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.dry_run:
        print(
            "phrase_span_audition: would export one contiguous SHA-verified native source span; "
            "it will not stitch clips, prove legato/slur/breath, approve a transition, or touch runtime BGM."
        )
        return 0
    missing = [
        flag for flag, value in (
            ("--bundle", args.bundle),
            ("--raw-daegeum-dir", args.raw_daegeum_dirs),
            ("--output-dir", args.output_dir),
            (
                "--sequence-retrieval/--phrase-boundary-triage/--path-json",
                args.sequence_retrieval or args.phrase_boundary_triage or args.path_json,
            ),
        ) if not value
    ]
    if missing:
        _parser().error("required unless --dry-run: " + ", ".join(missing))
    try:
        result = build_phrase_span_audition(
            bundle_dir=args.bundle,
            raw_daegeum_dirs=args.raw_daegeum_dirs,
            output_dir=args.output_dir,
            sequence_retrieval=args.sequence_retrieval,
            phrase_boundary_triage=args.phrase_boundary_triage,
            path_json=args.path_json,
            path_id=args.path_id,
            priority_rank=args.priority_rank,
            render_global_preview=args.render_global_preview,
            global_time_ratio=args.global_time_ratio,
            rubberband=args.rubberband,
            max_global_pitch_shift_semitones=args.max_global_pitch_shift_semitones,
            min_global_time_ratio=args.min_global_time_ratio,
            max_global_time_ratio=args.max_global_time_ratio,
        )
    except PhraseSpanAuditionError as exc:
        print(f"phrase_span_audition: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "output": Path(args.output_dir).name,
        "path_id": result["selected_path"]["path_id"],
        "raw_span_source_faithful": True,
        "preview_status": result["P_optional_global_pitch_time_preview"]["status"],
        "all_events_remain_unreviewed": True,
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
