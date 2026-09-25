#!/usr/bin/env python3
"""Build a read-only, source-led raw-span phrase-pool report for NGC Daegeum.

This is intentionally a *feature-cache triage* utility, not a renderer or a
transcriber.  It looks only at an existing R&D-06 bundle's validated feature
NPZs and at the exact National Gugak Center Extended Daegeum Sanjo manifest
which was used to ingest them.  It never opens, decodes, copies, crops,
normalizes, pitch-shifts, stretches, or writes source audio.

The report selects a small, deliberately diverse set of single contiguous
native-frame coordinate ranges.  The selection uses transparent measurements:

* consecutive finite/voiced F0-proxy rows,
* a configurable five-pitch-class *comparison lattice* fit,
* source-relative low-energy proxies at both coordinates, and
* five different duration/endpoint/range proxy profiles.

The default lattice ``0,2,4,7,9`` is merely a generic major-pentatonic
comparison coordinate for an Arirang-reference composition workflow.  It is
not a Korean mode annotation, an Arirang transcription, a musical phrase
label, a breath/slur/legato detector, a quality judgment, or an instruction to
change audio pitch.  The output remains R&D-only and every row retains the
same no-training/no-game/no-approved-gesture status as its source manifest.

Example (the downloaded NGC Extended Daegeum Sanjo #001--192 corpus):

    /tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/phrase_pool.py \\
      --bundle _bgm_rnd/daegeum-transition-bank-ngc-YYYYMMDD \\
      --ngc-extended-manifest _bgm_rnd/ngc-extended-daegeum-sanjo-YYYYMMDD/ngc-extended-daegeum-sanjo.manifest.json \\
      --ngc-extend-seq-range 1520:1711 \\
      --output-dir _bgm_rnd/daegeum-source-led-phrase-pool-YYYYMMDD

Only JSON and TSV measurement reports are written under a new output
directory.  The tool never changes runtime BGM/default assets.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
import sys
from typing import Any, Iterable, Mapping, Sequence


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from trajectory_retrieval import (  # noqa: E402
    RND06_SCHEMA,
    SourceInfo,
    TrajectoryRetrievalError,
    _load_catalog,
    _load_feature_track,
    _require_numpy,
    _sha256,
    select_sources,
)


PHRASE_POOL_SCHEMA = f"{RND06_SCHEMA}.source-led-phrase-pool.v1"
NGC_FETCH_SCHEMA = "durango.ngc.extended-daegeum-sanjo-fetch.v1"

DEFAULT_PENTATONIC_PITCH_CLASSES = (0, 2, 4, 7, 9)
DEFAULT_MIN_VOICING_CONFIDENCE = 0.50
DEFAULT_MAXIMUM_EDGE_ENERGY_PERCENTILE = 0.50
DEFAULT_MAXIMUM_TIME_GAP_FACTOR = 1.5
DEFAULT_EDGE_WINDOW_SECONDS = 0.12
DEFAULT_STRIDE_FEATURE_FRAMES = 4
DEFAULT_PITCH_SMOOTHING_WINDOW_FEATURE_FRAMES = 5
DEFAULT_MAXIMUM_SMOOTHED_ADJACENT_PITCH_STEP_SEMITONES = 6.0


@dataclass(frozen=True)
class Profile:
    """One coverage slot, expressed solely in feature-proxy measurements."""

    profile_id: str
    duration_seconds: float
    endpoint_direction: str
    minimum_endpoint_delta_semitones: float = 0.0
    maximum_endpoint_delta_absolute_semitones: float | None = None
    maximum_pitch_span_semitones: float | None = None
    minimum_pitch_span_semitones: float | None = None


DEFAULT_PROFILES = (
    Profile(
        "short_falling_proxy",
        2.64,
        "falling",
        minimum_endpoint_delta_semitones=3.0,
    ),
    Profile(
        "short_rising_proxy",
        2.64,
        "rising",
        minimum_endpoint_delta_semitones=3.0,
    ),
    Profile(
        "medium_compact_proxy",
        3.60,
        "mixed_or_returning",
        maximum_endpoint_delta_absolute_semitones=1.0,
        maximum_pitch_span_semitones=3.0,
    ),
    Profile(
        "medium_rising_proxy",
        4.32,
        "rising",
        minimum_endpoint_delta_semitones=3.0,
    ),
    Profile(
        "long_rising_proxy",
        5.70,
        "rising",
        minimum_endpoint_delta_semitones=3.0,
    ),
)


class PhrasePoolError(RuntimeError):
    """An input cannot support a truthful source-led phrase-pool report."""


def _json_load(path: Path, *, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise PhrasePoolError(f"missing {label}: {path.name}") from exc
    except json.JSONDecodeError as exc:
        raise PhrasePoolError(f"{label} is not valid JSON") from exc


def _json_dump(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _round(value: float) -> float:
    return round(float(value), 6)


def _finite(value: Any, *, label: str, minimum: float | None = None,
            maximum: float | None = None) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise PhrasePoolError(f"{label} must be finite") from exc
    if not math.isfinite(result):
        raise PhrasePoolError(f"{label} must be finite")
    if minimum is not None and result < minimum:
        raise PhrasePoolError(f"{label} is below its permitted range")
    if maximum is not None and result > maximum:
        raise PhrasePoolError(f"{label} exceeds its permitted range")
    return result


def _require_true(record: Mapping[str, Any], key: str, *, label: str) -> None:
    if record.get(key) is not True:
        raise PhrasePoolError(f"{label} must preserve {key}=true")


def parse_pitch_classes(value: str | Sequence[int] | None) -> tuple[int, ...]:
    """Parse a finite, unique 0--11 comparison lattice; never an audio edit."""

    raw: Sequence[Any]
    if value is None:
        raw = DEFAULT_PENTATONIC_PITCH_CLASSES
    elif isinstance(value, str):
        raw = [part.strip() for part in value.split(",")]
    else:
        raw = value
    if len(raw) != 5:
        raise PhrasePoolError("--pentatonic-pitch-classes must contain exactly five pitch classes")
    parsed: list[int] = []
    for ordinal, item in enumerate(raw, 1):
        try:
            integer = int(item)
        except (TypeError, ValueError) as exc:
            raise PhrasePoolError(f"pitch class {ordinal} must be an integer") from exc
        if str(integer) != str(item).strip() if isinstance(item, str) else False:
            raise PhrasePoolError(f"pitch class {ordinal} must be an integer")
        if not 0 <= integer <= 11:
            raise PhrasePoolError(f"pitch class {ordinal} must be in [0,11]")
        parsed.append(integer)
    if len(set(parsed)) != len(parsed):
        raise PhrasePoolError("--pentatonic-pitch-classes cannot repeat a pitch class")
    return tuple(parsed)


def _parse_range(value: str) -> tuple[int, int]:
    parts = value.split(":")
    if len(parts) != 2:
        raise PhrasePoolError("--ngc-extend-seq-range must be START:END")
    try:
        start, end = (int(part) for part in parts)
    except ValueError as exc:
        raise PhrasePoolError("--ngc-extend-seq-range needs integer START:END") from exc
    if start < 1 or end < start:
        raise PhrasePoolError("--ngc-extend-seq-range is invalid")
    return start, end


def _manifest_source_gates(manifest_path: Path, *, sources: Mapping[str, SourceInfo],
                           sequence_by_source: Mapping[str, int]) -> dict[str, dict[str, Any]]:
    """Validate R&D/identity limits, returning only compact per-source evidence.

    ``select_sources`` already joins every requested source to the manifest by
    neutral local basename and SHA-256.  This helper intentionally checks the
    remaining top-level research gates and each candidate's native timeline / 
    conservative musical-status flags rather than silently trusting a catalog
    title as a phrase or legato label.
    """

    manifest = _json_load(manifest_path, label="NGC extended manifest")
    if not isinstance(manifest, Mapping) or manifest.get("schema") != NGC_FETCH_SCHEMA:
        raise PhrasePoolError("NGC manifest does not have the Extended Daegeum Sanjo fetch schema")
    r_and_d = manifest.get("r_and_d_only")
    scope = manifest.get("scope")
    purpose = manifest.get("submitted_purpose")
    license_evidence = manifest.get("license_evidence")
    if not all(isinstance(value, Mapping) for value in (r_and_d, scope, purpose, license_evidence)):
        raise PhrasePoolError("NGC manifest lacks R&D/scope/purpose/license evidence")
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
        raise PhrasePoolError("NGC manifest does not preserve exact research-only Daegeum Sanjo scope")
    _require_true(
        license_evidence,
        "not_a_model_training_or_game_distribution_clearance",
        label="NGC license evidence",
    )
    entries = manifest.get("entries")
    if not isinstance(entries, list):
        raise PhrasePoolError("NGC manifest has no entries array")
    entries_by_seq = {
        entry.get("extend_seq"): entry
        for entry in entries
        if isinstance(entry, Mapping) and type(entry.get("extend_seq")) is int
    }
    if len(entries_by_seq) != len([entry for entry in entries if isinstance(entry, Mapping)]):
        raise PhrasePoolError("NGC manifest repeats an extend_seq or contains an invalid entry")

    result: dict[str, dict[str, Any]] = {}
    for source_id, sequence in sequence_by_source.items():
        source = sources.get(source_id)
        entry = entries_by_seq.get(sequence)
        if source is None or not isinstance(entry, Mapping):
            raise PhrasePoolError("NGC source selection lacks one exact manifest entry")
        catalog = entry.get("catalog_record")
        detail = entry.get("file_info_record")
        selection = entry.get("selection")
        download = entry.get("download")
        musical_status = entry.get("musical_status")
        if not all(isinstance(item, Mapping) for item in (catalog, detail, selection, download, musical_status)):
            raise PhrasePoolError("selected NGC entry lacks catalog/detail/download/status evidence")
        assert isinstance(catalog, Mapping)
        assert isinstance(detail, Mapping)
        assert isinstance(selection, Mapping)
        assert isinstance(download, Mapping)
        assert isinstance(musical_status, Mapping)
        if (
            catalog.get("division") != "대금산조"
            or detail.get("division") != "대금산조"
            or selection.get("instrument_code") != "EXTEND0001"
            or selection.get("instrument_name") != "대금"
            or selection.get("division_exact") != "대금산조"
            or selection.get("selection_is_exact_metadata_filter_not_title_match") is not True
            or musical_status.get("approved_transition") is not False
            or musical_status.get("eligible_for_model_training_or_game_asset") is not False
            or musical_status.get("automatic_filename_or_catalog_metadata_is_not_a_legato_or_transition_label") is not True
        ):
            raise PhrasePoolError("selected NGC entry lost a conservative scope/status gate")
        relative = download.get("relative_path")
        if not isinstance(relative, str) or PurePosixPath(relative).name != PurePosixPath(source.relative_path).name:
            raise PhrasePoolError("NGC download basename does not map to catalog source")
        if download.get("sha256") != source.sha256:
            raise PhrasePoolError("NGC download SHA-256 does not map to catalog source")
        native_wav = download.get("native_wav")
        native_audio = native_wav.get("native_audio") if isinstance(native_wav, Mapping) else None
        if not isinstance(native_audio, Mapping):
            raise PhrasePoolError("NGC download lacks a native WAV descriptor")
        if (
            native_audio.get("sample_rate_hz") != source.sample_rate_hz
            or native_audio.get("frame_count") != source.frame_count
        ):
            raise PhrasePoolError("NGC native WAV timeline does not map to catalog source")
        result[source_id] = {
            "extend_seq": sequence,
            "exact_daegeum_sanjo_source_verified": True,
            "source_sha256_link_verified_between_ngc_manifest_and_catalog": True,
            "native_frame_timeline_link_verified_between_ngc_manifest_and_catalog": True,
            "research_only_and_no_game_gate_verified": True,
            "catalog_metadata_not_treated_as_phrase_or_legato_label": True,
            "not_a_training_or_game_distribution_clearance": True,
        }
    return result


def _rank_percentile(sorted_values: Any, value: float, *, np: Any) -> float:
    """Source-relative empirical CDF, explicitly just a proxy coordinate."""

    if len(sorted_values) == 0:
        raise PhrasePoolError("feature track has no finite RMS values")
    return float(np.searchsorted(sorted_values, value, side="right") / len(sorted_values))


def _pentatonic_fit(midi: Any, *, pitch_classes: Sequence[int], np: Any) -> dict[str, Any]:
    """Fit only a comparison lattice; does not alter or label source music."""

    best: tuple[float, float, int] | None = None
    for rotation in range(12):
        rotated = np.asarray([(item + rotation) % 12 for item in pitch_classes], dtype=np.float64)
        distances = np.abs(((np.mod(midi[:, None], 12.0) - rotated[None, :] + 6.0) % 12.0) - 6.0)
        nearest = np.min(distances, axis=1)
        candidate = (float(np.sqrt(np.mean(nearest ** 2)) * 100.0), float(np.mean(nearest) * 100.0), rotation)
        if best is None or candidate < best:
            best = candidate
    assert best is not None
    return {
        "configured_pitch_classes": list(pitch_classes),
        "best_pitch_class_rotation_semitones": best[2],
        "rms_distance_cents": _round(best[0]),
        "mean_absolute_distance_cents": _round(best[1]),
        "comparison_only_not_a_mode_style_or_transcription_label": True,
        "comparison_rotation_not_applied_to_source_audio": True,
    }


def _matches_profile(profile: Profile, *, endpoint_delta: float, pitch_span: float) -> bool:
    if profile.endpoint_direction == "falling" and endpoint_delta > -profile.minimum_endpoint_delta_semitones:
        return False
    if profile.endpoint_direction == "rising" and endpoint_delta < profile.minimum_endpoint_delta_semitones:
        return False
    if (
        profile.maximum_endpoint_delta_absolute_semitones is not None
        and abs(endpoint_delta) > profile.maximum_endpoint_delta_absolute_semitones
    ):
        return False
    if profile.maximum_pitch_span_semitones is not None and pitch_span > profile.maximum_pitch_span_semitones:
        return False
    if profile.minimum_pitch_span_semitones is not None and pitch_span < profile.minimum_pitch_span_semitones:
        return False
    return True


def _median_smooth(values: Any, *, window_frames: int, np: Any) -> Any:
    """Small deterministic median smoother for a feature proxy only.

    It neither fills unvoiced rows nor reaches beyond the already accepted
    consecutive window.  It exists only to keep one octave-like F0-proxy
    outlier from falsely making a span look broad or directional.
    """

    if type(window_frames) is not int or window_frames < 1 or window_frames % 2 != 1:
        raise PhrasePoolError("--pitch-smoothing-window-feature-frames must be a positive odd integer")
    if window_frames == 1 or len(values) <= 2:
        return values.astype(np.float64, copy=True)
    radius = window_frames // 2
    padded = np.pad(values.astype(np.float64, copy=False), (radius, radius), mode="edge")
    return np.median(np.lib.stride_tricks.sliding_window_view(padded, window_frames), axis=-1)


def _candidate_rows(
    track: Any,
    *,
    profile: Profile,
    pitch_classes: Sequence[int],
    minimum_voicing: float,
    maximum_edge_energy_percentile: float,
    maximum_time_gap_factor: float,
    edge_window_seconds: float,
    stride_feature_frames: int,
    pitch_smoothing_window_feature_frames: int,
    maximum_smoothed_adjacent_pitch_step_semitones: float,
    np: Any,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Return measurement-only windows that meet exactly one coverage profile."""

    if type(stride_feature_frames) is not int or stride_feature_frames < 1:
        raise PhrasePoolError("--stride-feature-frames must be a positive integer")
    time_steps = np.diff(track.time_s)
    nominal_hop = float(np.median(time_steps))
    if not math.isfinite(nominal_hop) or nominal_hop <= 0.0:
        raise PhrasePoolError(f"source {track.source.source_id} has no positive feature hop")
    length = max(3, int(round(profile.duration_seconds / nominal_hop)) + 1)
    edge_frames = max(1, int(round(edge_window_seconds / nominal_hop)))
    valid = (
        np.isfinite(track.f0_hz)
        & (track.f0_hz > 0.0)
        & np.isfinite(track.midi_proxy)
        & (track.voicing_confidence >= minimum_voicing)
    )
    contiguous_steps = time_steps <= nominal_hop * maximum_time_gap_factor + 1e-12
    finite_rms = np.sort(track.rms_dbfs[np.isfinite(track.rms_dbfs)])
    if len(finite_rms) == 0:
        raise PhrasePoolError(f"source {track.source.source_id} has no finite RMS proxy values")
    window_half_padding_frames = max(0, int(round(track.feature_window_seconds * track.source.sample_rate_hz / 2.0)))
    rows: list[dict[str, Any]] = []
    scanned = 0
    voiced_rejected = 0
    edge_rejected = 0
    profile_rejected = 0
    continuity_rejected = 0
    for start in range(0, len(track.time_s) - length + 1, stride_feature_frames):
        end = start + length
        scanned += 1
        if not bool(np.all(valid[start:end])) or not bool(np.all(contiguous_steps[start:end - 1])):
            voiced_rejected += 1
            continue
        midi = track.midi_proxy[start:end]
        smoothed_midi = _median_smooth(
            midi,
            window_frames=pitch_smoothing_window_feature_frames,
            np=np,
        )
        adjacent_steps = np.abs(np.diff(smoothed_midi))
        max_adjacent_step = float(np.max(adjacent_steps))
        if max_adjacent_step > maximum_smoothed_adjacent_pitch_step_semitones:
            continuity_rejected += 1
            continue
        endpoint_delta = float(smoothed_midi[-1] - smoothed_midi[0])
        pitch_span = float(np.max(smoothed_midi) - np.min(smoothed_midi))
        if not _matches_profile(profile, endpoint_delta=endpoint_delta, pitch_span=pitch_span):
            profile_rejected += 1
            continue
        head_values = track.rms_dbfs[start:min(end, start + edge_frames)]
        tail_values = track.rms_dbfs[max(start, end - edge_frames):end]
        head_rms = float(np.median(head_values))
        tail_rms = float(np.median(tail_values))
        head_percentile = _rank_percentile(finite_rms, head_rms, np=np)
        tail_percentile = _rank_percentile(finite_rms, tail_rms, np=np)
        if max(head_percentile, tail_percentile) > maximum_edge_energy_percentile:
            edge_rejected += 1
            continue
        raw_start = max(0, int(track.native_frame_center[start]) - window_half_padding_frames)
        raw_end = min(
            track.source.frame_count,
            int(track.native_frame_center[end - 1]) + window_half_padding_frames + 1,
        )
        if raw_end <= raw_start:
            raise PhrasePoolError("derived native source span is empty")
        lattice = _pentatonic_fit(smoothed_midi, pitch_classes=pitch_classes, np=np)
        # This transparent score orders only candidates that already satisfy a
        # profile: low lattice/edge mismatch, then more voicing and lower onset
        # proxy, followed by stable source/frame identity.  It is deliberately
        # not named a quality score.
        onset_mean = float(np.mean(track.onset_flux[start:end]))
        voicing_mean = float(np.mean(track.voicing_confidence[start:end]))
        selection_measure = (
            float(lattice["rms_distance_cents"])
            + 100.0 * (head_percentile + tail_percentile)
            + 100.0 * max(0.0, 1.0 - voicing_mean)
            + 100.0 * onset_mean
        )
        row = {
            "profile_id": profile.profile_id,
            "source_id": track.source.source_id,
            "feature_span": {
                "feature_index_range": [start, end],
                "feature_frame_count": end - start,
                "strictly_consecutive_feature_rows_without_skipped_unvoiced_rows": True,
                "time_seconds_range": [_round(float(track.time_s[start])), _round(float(track.time_s[end - 1]))],
                "center_duration_seconds": _round(float(track.time_s[end - 1] - track.time_s[start])),
            },
            "native_source_span": {
                "frame_range": [raw_start, raw_end],
                "frame_count": raw_end - raw_start,
                "duration_seconds": _round((raw_end - raw_start) / track.source.sample_rate_hz),
                "time_seconds_range": [
                    _round(raw_start / track.source.sample_rate_hz),
                    _round(raw_end / track.source.sample_rate_hz),
                ],
                "single_contiguous_source_frame_range": True,
                "feature_window_coordinate_padding_frames_each_side": window_half_padding_frames,
                "coordinate_only_not_a_verified_phrase_or_gesture_boundary": True,
            },
            "edge_measurement_proxies": {
                "edge_window_feature_frame_count": edge_frames,
                "head_anchor_feature_index": start,
                "tail_anchor_feature_index": end - 1,
                "head_rms_dbfs_median": _round(head_rms),
                "tail_rms_dbfs_median": _round(tail_rms),
                "head_rms_percentile_within_full_source_feature_track": _round(head_percentile),
                "tail_rms_percentile_within_full_source_feature_track": _round(tail_percentile),
                "head_onset_flux_mean": _round(float(np.mean(track.onset_flux[start:min(end, start + edge_frames)]))),
                "tail_onset_flux_mean": _round(float(np.mean(track.onset_flux[max(start, end - edge_frames):end]))),
                "edge_proxies_are_not_breath_attack_release_slur_legato_or_quality_labels": True,
            },
            "contour_proxies": {
                "median_smoothed_midi_proxy_start": _round(float(smoothed_midi[0])),
                "median_smoothed_midi_proxy_end": _round(float(smoothed_midi[-1])),
                "endpoint_delta_semitones": _round(endpoint_delta),
                "pitch_span_semitones": _round(pitch_span),
                "maximum_adjacent_median_smoothed_pitch_step_semitones": _round(max_adjacent_step),
                "p95_adjacent_median_smoothed_pitch_step_semitones": _round(float(np.quantile(adjacent_steps, 0.95))),
                "mean_voicing_confidence": _round(voicing_mean),
                "minimum_voicing_confidence": _round(float(np.min(track.voicing_confidence[start:end]))),
                "mean_onset_flux_proxy": _round(onset_mean),
                "f0_and_midi_are_automatic_feature_proxies_not_human_transcription_or_style_labels": True,
                "median_smoothing_is_measurement_only_and_not_an_audio_edit_or_missing_data_fill": True,
            },
            "five_pitch_class_comparison_lattice": lattice,
            "selection_measurement": {
                "value": _round(selection_measure),
                "definition": "pentatonic-comparison RMS cents + 100*(head/tail source-relative RMS percentiles) + 100*(1-mean voicing) + 100*mean onset flux; profile criteria first. Measurement-only ordering, not quality or musical suitability.",
            },
        }
        rows.append(row)
    rows.sort(
        key=lambda row: (
            float(row["selection_measurement"]["value"]),
            str(row["source_id"]),
            int(row["feature_span"]["feature_index_range"][0]),
        )
    )
    return rows, {
        "feature_windows_scanned": scanned,
        "rejected_for_nonconsecutive_or_low_voicing_proxy": voiced_rejected,
        "rejected_for_profile_proxy": profile_rejected,
        "rejected_for_smoothed_adjacent_pitch_step_proxy": continuity_rejected,
        "rejected_for_edge_energy_proxy": edge_rejected,
        "eligible_measurement_windows": len(rows),
        "nominal_feature_hop_seconds": _round(nominal_hop),
        "profile_feature_window_length": length,
        "pitch_smoothing_window_feature_frames": pitch_smoothing_window_feature_frames,
    }


def _status(*, source_evidence: Mapping[str, Any]) -> dict[str, bool]:
    return {
        "all_results_remain_unreviewed": True,
        "source_is_one_sha_verified_ngc_manifest_catalog_recording": bool(
            source_evidence["source_sha256_link_verified_between_ngc_manifest_and_catalog"]
        ),
        "raw_span_is_one_contiguous_native_coordinate_range": True,
        "automatic_measurements_are_not_a_musical_phrase_or_arirang_style_label": True,
        "not_evidence_of_same_breath": True,
        "not_evidence_of_slur": True,
        "not_evidence_of_natural_legato": True,
        "not_an_approved_transition_or_phrase": True,
        "not_a_transition_bank_item": True,
        "not_a_training_item": True,
        "not_a_game_asset": True,
    }


def _write_tsv(path: Path, rows: Sequence[Mapping[str, Any]]) -> None:
    header = [
        "priority_rank", "profile_id", "candidate_id", "source_id", "ngc_extend_seq", "relative_path",
        "raw_start_frame", "raw_end_frame_exclusive", "raw_duration_seconds",
        "feature_start_index", "feature_end_index_exclusive", "feature_center_duration_seconds",
        "endpoint_delta_semitones", "pitch_span_semitones", "lattice_rms_distance_cents",
        "head_rms_percentile", "tail_rms_percentile", "mean_voicing_confidence",
        "all_results_unreviewed", "not_musical_phrase_or_style_label", "not_game_asset",
    ]
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, delimiter="\t", lineterminator="\n")
        writer.writerow(header)
        for row in rows:
            source = row["source"]
            native = row["native_source_span"]
            feature = row["feature_span"]
            contour = row["contour_proxies"]
            lattice = row["five_pitch_class_comparison_lattice"]
            edge = row["edge_measurement_proxies"]
            status = row["automatic_candidate_status"]
            writer.writerow([
                row["priority_rank"], row["profile_id"], row["candidate_id"], source["source_id"],
                source["ngc_extend_seq"], source["relative_path"], native["frame_range"][0],
                native["frame_range"][1], native["duration_seconds"], feature["feature_index_range"][0],
                feature["feature_index_range"][1], feature["center_duration_seconds"],
                contour["endpoint_delta_semitones"], contour["pitch_span_semitones"],
                lattice["rms_distance_cents"], edge["head_rms_percentile_within_full_source_feature_track"],
                edge["tail_rms_percentile_within_full_source_feature_track"], contour["mean_voicing_confidence"],
                status["all_results_remain_unreviewed"],
                status["automatic_measurements_are_not_a_musical_phrase_or_arirang_style_label"],
                status["not_a_game_asset"],
            ])


def build_phrase_pool(
    *,
    bundle_dir: str | Path,
    ngc_extended_manifest: str | Path,
    ngc_extend_seq_range: str,
    output_dir: str | Path,
    pentatonic_pitch_classes: str | Sequence[int] | None = None,
    minimum_voicing_confidence: float = DEFAULT_MIN_VOICING_CONFIDENCE,
    maximum_edge_energy_percentile: float = DEFAULT_MAXIMUM_EDGE_ENERGY_PERCENTILE,
    maximum_time_gap_factor: float = DEFAULT_MAXIMUM_TIME_GAP_FACTOR,
    edge_window_seconds: float = DEFAULT_EDGE_WINDOW_SECONDS,
    stride_feature_frames: int = DEFAULT_STRIDE_FEATURE_FRAMES,
    pitch_smoothing_window_feature_frames: int = DEFAULT_PITCH_SMOOTHING_WINDOW_FEATURE_FRAMES,
    maximum_smoothed_adjacent_pitch_step_semitones: float = DEFAULT_MAXIMUM_SMOOTHED_ADJACENT_PITCH_STEP_SEMITONES,
    profiles: Sequence[Profile] = DEFAULT_PROFILES,
) -> dict[str, Any]:
    """Create a fresh JSON/TSV report; source WAVs are never opened or changed."""

    np = _require_numpy()
    bundle = Path(bundle_dir).expanduser().resolve()
    manifest_path = Path(ngc_extended_manifest).expanduser().resolve()
    output = Path(output_dir).expanduser().resolve()
    if not bundle.is_dir():
        raise PhrasePoolError("--bundle must be a readable R&D-06 bundle directory")
    if not manifest_path.is_file():
        raise PhrasePoolError("--ngc-extended-manifest must name a readable manifest")
    if output.exists():
        raise PhrasePoolError("--output-dir must not already exist; refusing to overwrite R&D evidence")
    if not profiles:
        raise PhrasePoolError("at least one phrase-pool profile is required")
    if len({profile.profile_id for profile in profiles}) != len(profiles):
        raise PhrasePoolError("phrase-pool profile IDs must be unique")
    pitch_classes = parse_pitch_classes(pentatonic_pitch_classes)
    minimum_voicing = _finite(
        minimum_voicing_confidence,
        label="--minimum-voicing-confidence",
        minimum=0.0,
        maximum=1.0,
    )
    maximum_edge = _finite(
        maximum_edge_energy_percentile,
        label="--maximum-edge-energy-percentile",
        minimum=0.0,
        maximum=1.0,
    )
    max_gap = _finite(
        maximum_time_gap_factor,
        label="--maximum-contiguous-time-gap-factor",
        minimum=1.0,
    )
    edge_seconds = _finite(edge_window_seconds, label="--edge-window-seconds", minimum=0.001)
    if type(stride_feature_frames) is not int or stride_feature_frames < 1:
        raise PhrasePoolError("--stride-feature-frames must be a positive integer")
    if (
        type(pitch_smoothing_window_feature_frames) is not int
        or pitch_smoothing_window_feature_frames < 1
        or pitch_smoothing_window_feature_frames % 2 != 1
    ):
        raise PhrasePoolError("--pitch-smoothing-window-feature-frames must be a positive odd integer")
    maximum_smoothed_step = _finite(
        maximum_smoothed_adjacent_pitch_step_semitones,
        label="--maximum-smoothed-adjacent-pitch-step-semitones",
        minimum=0.0,
    )
    range_start, range_end = _parse_range(ngc_extend_seq_range)
    try:
        sources, catalog_sha256 = _load_catalog(bundle)
        selected_sources, sequence_by_source, selection = select_sources(
            bundle,
            sources,
            ngc_manifest=manifest_path,
            ngc_extend_seq_range=f"{range_start}:{range_end}",
        )
    except TrajectoryRetrievalError as exc:
        raise PhrasePoolError(str(exc)) from exc
    evidence = _manifest_source_gates(
        manifest_path,
        sources=sources,
        sequence_by_source=sequence_by_source,
    )

    profile_rows: dict[str, list[dict[str, Any]]] = {profile.profile_id: [] for profile in profiles}
    per_source_counts: list[dict[str, Any]] = []
    for source in selected_sources:
        try:
            track = _load_feature_track(bundle, source, np=np)
        except TrajectoryRetrievalError as exc:
            raise PhrasePoolError(str(exc)) from exc
        source_counts: dict[str, Any] = {"source_id": source.source_id, "profile_counts": {}}
        for profile in profiles:
            rows, counts = _candidate_rows(
                track,
                profile=profile,
                pitch_classes=pitch_classes,
                minimum_voicing=minimum_voicing,
                maximum_edge_energy_percentile=maximum_edge,
                maximum_time_gap_factor=max_gap,
                edge_window_seconds=edge_seconds,
                stride_feature_frames=stride_feature_frames,
                pitch_smoothing_window_feature_frames=pitch_smoothing_window_feature_frames,
                maximum_smoothed_adjacent_pitch_step_semitones=maximum_smoothed_step,
                np=np,
            )
            profile_rows[profile.profile_id].extend(rows)
            source_counts["profile_counts"][profile.profile_id] = counts
        per_source_counts.append(source_counts)

    # Select profile by profile, forbidding a source reuse.  This makes the
    # promised variation inspectable rather than adjacent windows from one
    # take.  It is a coverage policy, not a verdict that excluded windows are
    # inferior music.
    selected: list[dict[str, Any]] = []
    used_sources: set[str] = set()
    profile_selection_counts: list[dict[str, Any]] = []
    for profile in profiles:
        rows = profile_rows[profile.profile_id]
        chosen = next((row for row in rows if row["source_id"] not in used_sources), None)
        if chosen is None:
            raise PhrasePoolError(
                f"profile {profile.profile_id} has no eligible candidate from an unused source; "
                "widen feature thresholds or use fewer coverage profiles rather than silently duplicating a source"
            )
        used_sources.add(str(chosen["source_id"]))
        source = sources[str(chosen["source_id"])]
        source_evidence = evidence[source.source_id]
        candidate = dict(chosen)
        candidate["priority_rank"] = len(selected) + 1
        candidate["candidate_id"] = (
            f"pool_{profile.profile_id}_{source.source_id}_"
            f"{candidate['feature_span']['feature_index_range'][0]:06d}_"
            f"{candidate['feature_span']['feature_index_range'][1]:06d}"
        )
        candidate["source"] = {
            "source_id": source.source_id,
            "sha256": source.sha256,
            "relative_path": source.relative_path,
            "sample_rate_hz": source.sample_rate_hz,
            "frame_count": source.frame_count,
            "ngc_extend_seq": source_evidence["extend_seq"],
            "source_manifest_evidence": source_evidence,
        }
        candidate["automatic_candidate_status"] = _status(source_evidence=source_evidence)
        selected.append(candidate)
        profile_selection_counts.append({
            "profile_id": profile.profile_id,
            "eligible_measurement_windows_across_selected_corpus": len(rows),
            "selected_source_id": source.source_id,
            "distinct_source_enforced": True,
        })

    manifest_sha = _sha256(manifest_path)
    result: dict[str, Any] = {
        "schema": PHRASE_POOL_SCHEMA,
        "artifact_kind": "unreviewed_source_led_contiguous_raw_span_pool",
        "input": {
            "bundle": {
                "directory_basename": bundle.name,
                "source_catalog_sha256": catalog_sha256,
                "absolute_paths_omitted": True,
            },
            "ngc_extended_manifest": {
                "basename": manifest_path.name,
                "sha256": manifest_sha,
                "requested_extend_seq_range": [range_start, range_end],
                "shared_source_selection": selection,
                "exact_selected_source_count": len(selected_sources),
                "research_only_scope_and_identity_gates_verified": True,
            },
        },
        "configuration": {
            "pentatonic_pitch_classes_comparison_only": list(pitch_classes),
            "minimum_voicing_confidence_proxy": _round(minimum_voicing),
            "maximum_edge_energy_percentile_within_each_full_source_feature_track": _round(maximum_edge),
            "maximum_contiguous_time_gap_factor": _round(max_gap),
            "edge_window_seconds": _round(edge_seconds),
            "stride_feature_frames": stride_feature_frames,
            "pitch_smoothing_window_feature_frames": pitch_smoothing_window_feature_frames,
            "maximum_smoothed_adjacent_pitch_step_semitones": _round(maximum_smoothed_step),
            "profiles": [
                {
                    "profile_id": profile.profile_id,
                    "feature_center_duration_seconds": profile.duration_seconds,
                    "endpoint_direction_proxy": profile.endpoint_direction,
                    "minimum_endpoint_delta_semitones_when_applicable": profile.minimum_endpoint_delta_semitones,
                    "maximum_endpoint_delta_absolute_semitones_when_applicable": profile.maximum_endpoint_delta_absolute_semitones,
                    "maximum_pitch_span_semitones_when_applicable": profile.maximum_pitch_span_semitones,
                    "minimum_pitch_span_semitones_when_applicable": profile.minimum_pitch_span_semitones,
                }
                for profile in profiles
            ],
        },
        "selection_diversity": {
            "distinct_source_per_profile_enforced": True,
            "profiles_are_measurement_coverage_slots_not_music_quality_or_style_labels": True,
            "coverage_intent": [
                "short falling endpoint proxy",
                "short rising endpoint proxy",
                "medium compact endpoint/range proxy",
                "medium rising endpoint proxy",
                "long rising endpoint proxy",
            ],
            "profile_selection_counts": profile_selection_counts,
        },
        "interpretation_limits": {
            "source_audio_not_read_decoded_copied_written_or_rendered": True,
            "output_contains_only_feature_proxy_measurements_and_native_frame_coordinates": True,
            "no_pitch_time_gain_channel_or_other_source_audio_change_is_requested_or_applied": True,
            "five_pitch_class_lattice_is_not_an_arirang_or_korean_mode_transcription": True,
            "feature_proxy_contours_are_not_phrase_breath_attack_release_slur_legato_or_quality_labels": True,
            "all_candidates_remain_unreviewed_not_approved_not_training_items_not_game_assets": True,
            "no_default_runtime_bgm_or_public_asset_is_changed": True,
        },
        "counts": {
            "selected_source_count": len(selected_sources),
            "profile_count": len(profiles),
            "returned_candidate_count": len(selected),
            "distinct_returned_source_count": len(used_sources),
            "per_source_profile_measurement_counts": per_source_counts,
        },
        "candidates": selected,
    }
    output.mkdir(parents=True, exist_ok=False)
    _json_dump(output / "phrase_pool.json", result)
    _write_tsv(output / "phrase_pool.tsv", selected)
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", help="R&D-06 bundle containing source_catalog.json and features/*.npz")
    parser.add_argument("--ngc-extended-manifest", help="exact NGC Extended Daegeum Sanjo fetch manifest")
    parser.add_argument("--ngc-extend-seq-range", help="exact NGC extendSeq range START:END")
    parser.add_argument("--output-dir", help="fresh ignored R&D JSON/TSV report directory")
    parser.add_argument("--pentatonic-pitch-classes", default="0,2,4,7,9")
    parser.add_argument("--minimum-voicing-confidence", type=float, default=DEFAULT_MIN_VOICING_CONFIDENCE)
    parser.add_argument("--maximum-edge-energy-percentile", type=float, default=DEFAULT_MAXIMUM_EDGE_ENERGY_PERCENTILE)
    parser.add_argument("--maximum-contiguous-time-gap-factor", type=float, default=DEFAULT_MAXIMUM_TIME_GAP_FACTOR)
    parser.add_argument("--edge-window-seconds", type=float, default=DEFAULT_EDGE_WINDOW_SECONDS)
    parser.add_argument("--stride-feature-frames", type=int, default=DEFAULT_STRIDE_FEATURE_FRAMES)
    parser.add_argument("--pitch-smoothing-window-feature-frames", type=int, default=DEFAULT_PITCH_SMOOTHING_WINDOW_FEATURE_FRAMES)
    parser.add_argument("--maximum-smoothed-adjacent-pitch-step-semitones", type=float, default=DEFAULT_MAXIMUM_SMOOTHED_ADJACENT_PITCH_STEP_SEMITONES)
    parser.add_argument("--dry-run", action="store_true", help="print safety contract without opening bundle/manifest")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.dry_run:
        print(
            "phrase_pool: would read only existing feature NPZ/cache and NGC provenance metadata, then write a fresh "
            "coordinate/measurement JSON+TSV report; it will not read/decode/copy/render/transform audio, infer a phrase "
            "or legato, approve/train/ship anything, or modify default BGM/assets."
        )
        return 0
    required = {
        "bundle": args.bundle,
        "ngc-extended-manifest": args.ngc_extended_manifest,
        "ngc-extend-seq-range": args.ngc_extend_seq_range,
        "output-dir": args.output_dir,
    }
    missing = [f"--{name}" for name, value in required.items() if not value]
    if missing:
        _parser().error("required unless --dry-run: " + ", ".join(missing))
    try:
        result = build_phrase_pool(
            bundle_dir=args.bundle,
            ngc_extended_manifest=args.ngc_extended_manifest,
            ngc_extend_seq_range=args.ngc_extend_seq_range,
            output_dir=args.output_dir,
            pentatonic_pitch_classes=args.pentatonic_pitch_classes,
            minimum_voicing_confidence=args.minimum_voicing_confidence,
            maximum_edge_energy_percentile=args.maximum_edge_energy_percentile,
            maximum_time_gap_factor=args.maximum_contiguous_time_gap_factor,
            edge_window_seconds=args.edge_window_seconds,
            stride_feature_frames=args.stride_feature_frames,
            pitch_smoothing_window_feature_frames=args.pitch_smoothing_window_feature_frames,
            maximum_smoothed_adjacent_pitch_step_semitones=args.maximum_smoothed_adjacent_pitch_step_semitones,
        )
    except PhrasePoolError as exc:
        print(f"phrase_pool: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "output": Path(args.output_dir).name,
        "returned_candidate_count": result["counts"]["returned_candidate_count"],
        "all_results_remain_unreviewed": True,
        "source_audio_not_read_or_written": True,
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
