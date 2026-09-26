#!/usr/bin/env python3
"""Fail-closed metadata adapter contract for a future MIDI-DDSP Daegeum set.

This tool is deliberately a *readiness/contract* adapter, not a corpus
exporter.  It may read explicitly named JSON/JSONL metadata, feature metadata,
and a hash-verified non-audio receipt/terms snapshot, but it never opens source
WAV/MP3 audio, cached feature NPZ arrays, MIDI files, or annotation media. It
never copies audio, writes TFRecords or training tensors, installs MIDI-DDSP,
starts model training, or changes game assets.

The only path that could ever justify a later, separately implemented exporter
is a standalone rights manifest with ``training_allowed: true`` that matches a
fully paired contract.  A catalog licence notice, an NGC download record,
feature cache, source checksum, or project-local label template is not treated
as that authority.  The current 192-file NGC Daegeum bundle is consequently
reported as blocked without touching a single audio or NPZ byte.

The synthetic fixture validates the intended contract shape using deliberately
nonexistent audio/MIDI paths.  Its success proves that this adapter did not
open those paths; it is not a rights approval, a training dataset, a model
output, or evidence of a Daegeum performance.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import re
import sys
from typing import Any, Mapping, Sequence


READINESS_SCHEMA = "mini.midi-ddsp-daegeum-adapter.readiness.v1"
RIGHTS_SCHEMA = "mini.midi-ddsp-daegeum-adapter.rights.v1"
TRAINING_CONTRACT_SCHEMA = "mini.midi-ddsp-daegeum-adapter.training-contract.v1"
REPORT_FILENAME = "daegeum_dataset_adapter_readiness.json"
EXPECTED_CONTROLLED_MANIFEST_SCHEMA = "durango.ngc.extended-daegeum-sanjo-fetch.v1"
EXPECTED_SOURCE_CATALOG_SCHEMA = "durango.daegeum.transition-bank.v1.source-catalog.v1"
EXPECTED_FEATURE_METADATA_SCHEMA = "durango.daegeum.expression-features.v1"
MIDI_DDSP_EXPRESSION_FIELDS = (
    "volume",
    "vol_fluc",
    "vibrato",
    "brightness",
    "attack",
    "vol_peak_pos",
)
MIDI_DDSP_CONDITIONING_ROW_FIELDS = ("pitch", "onset", "offset", "note_length")
FRAME_RATE_HZ = 250
FRAME_SECONDS = 1.0 / FRAME_RATE_HZ
_SAFE_ID = re.compile(r"[A-Za-z0-9_.-]{1,160}")
_SHA256 = re.compile(r"[0-9a-f]{64}")
_ALLOWED_RIGHTS_EVIDENCE_SUFFIXES = frozenset({".json", ".txt", ".md", ".html", ".pdf"})

# These are discovery hints only, never built-in permission. A caller still
# has to provide a local receipt and a terms snapshot whose hashes match their
# rights manifest. The adapter neither logs in to, requests, nor downloads
# either AI Hub dataset.
FUTURE_SOURCE_CANDIDATES = {
    "aihub_71470": {
        "official_catalog_url": "https://aihub.or.kr/aihubdata/data/view.do?aihubDataSe=realm&currMenu=&dataSetSn=71470&topMenu=",
        "reported_structure": "WAV plus aligned MIDI and JSON labels; inspect the user-downloaded local inventory before accepting any pair",
        "candidate_role": "preferred future paired-score/gesture candidate if local receipt, terms snapshot, and reviewed Daegeum subset satisfy this contract",
    },
    "aihub_71955": {
        "official_catalog_url": "https://aihub.or.kr/aihubdata/data/view.do?aihubDataSe=data&dataSetSn=71955",
        "reported_structure": "multitrack WAV plus JSON metadata; the public catalog reports a Daegeum multitrack class",
        "candidate_role": "potential future timbre/continuous-audio supplement only; it is not assumed to supply this adapter's aligned MIDI and gesture contract",
    },
}


class MidiDdspDaegeumAdapterError(RuntimeError):
    """A named metadata record cannot satisfy this conservative contract."""


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _round(value: float) -> float:
    return round(float(value), 9)


def _relative_for_report(path: Path, *, repo_root: Path) -> str:
    resolved = path.expanduser().resolve()
    try:
        return resolved.relative_to(repo_root.resolve()).as_posix()
    except ValueError:
        return str(resolved)


def _json_read(path: Path, *, label: str, access: dict[str, int]) -> Any:
    """Read declared JSON metadata only; never call this for audio/MIDI/NPZ."""

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise MidiDdspDaegeumAdapterError(f"{label} is absent") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MidiDdspDaegeumAdapterError(f"{label} is not valid UTF-8 JSON") from exc
    access["metadata_json_files_opened"] += 1
    return payload


def _mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise MidiDdspDaegeumAdapterError(f"{label} must be a JSON object")
    return value


def _nonempty_string(value: Any, *, label: str, pattern: re.Pattern[str] | None = None) -> str:
    if not isinstance(value, str) or not value:
        raise MidiDdspDaegeumAdapterError(f"{label} must be a non-empty string")
    if pattern is not None and pattern.fullmatch(value) is None:
        raise MidiDdspDaegeumAdapterError(f"{label} has an invalid format")
    return value


def _strict_int(value: Any, *, label: str, minimum: int | None = None, maximum: int | None = None) -> int:
    if type(value) is not int:
        raise MidiDdspDaegeumAdapterError(f"{label} must be an integer")
    if minimum is not None and value < minimum:
        raise MidiDdspDaegeumAdapterError(f"{label} is below its permitted range")
    if maximum is not None and value > maximum:
        raise MidiDdspDaegeumAdapterError(f"{label} exceeds its permitted range")
    return value


def _finite(value: Any, *, label: str, minimum: float | None = None, maximum: float | None = None) -> float:
    if isinstance(value, bool):
        raise MidiDdspDaegeumAdapterError(f"{label} must be a finite number")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise MidiDdspDaegeumAdapterError(f"{label} must be a finite number") from exc
    if not math.isfinite(result):
        raise MidiDdspDaegeumAdapterError(f"{label} must be finite")
    if minimum is not None and result < minimum:
        raise MidiDdspDaegeumAdapterError(f"{label} is below its permitted range")
    if maximum is not None and result > maximum:
        raise MidiDdspDaegeumAdapterError(f"{label} exceeds its permitted range")
    return result


def _safe_relative(value: Any, *, label: str, suffix: str) -> str:
    raw = _nonempty_string(value, label=label)
    if "\\" in raw or ":" in raw:
        raise MidiDdspDaegeumAdapterError(f"{label} must be a safe POSIX relative path")
    parsed = PurePosixPath(raw)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise MidiDdspDaegeumAdapterError(f"{label} is not a safe relative path")
    if parsed.suffix.lower() != suffix:
        raise MidiDdspDaegeumAdapterError(f"{label} must end in {suffix}")
    return parsed.as_posix()


def _safe_nonmedia_relative(value: Any, *, label: str) -> str:
    raw = _nonempty_string(value, label=label)
    if "\\" in raw or ":" in raw:
        raise MidiDdspDaegeumAdapterError(f"{label} must be a safe POSIX relative path")
    parsed = PurePosixPath(raw)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise MidiDdspDaegeumAdapterError(f"{label} is not a safe relative path")
    if parsed.suffix.lower() not in _ALLOWED_RIGHTS_EVIDENCE_SUFFIXES:
        raise MidiDdspDaegeumAdapterError(f"{label} must name a non-audio receipt/terms snapshot (.json/.txt/.md/.html/.pdf)")
    return parsed.as_posix()


def _new_access_ledger() -> dict[str, Any]:
    return {
        "metadata_json_files_opened": 0,
        "label_jsonl_lines_read": 0,
        "non_audio_rights_evidence_files_hashed": 0,
        "non_audio_rights_evidence_bytes_read": 0,
        "audio_files_opened": 0,
        "audio_bytes_read": 0,
        "audio_files_copied": 0,
        "feature_npz_files_opened": 0,
        "feature_npz_bytes_read": 0,
        "midi_files_opened": 0,
        "tfrecords_written": 0,
        "training_examples_written": 0,
        "model_training_started": False,
        "audio_or_npz_access_is_implemented_by_this_tool": False,
    }


def _verify_local_rights_evidence(
    value: Any,
    *,
    rights_manifest_path: Path,
    label: str,
    access: dict[str, int],
) -> dict[str, Any]:
    record = _mapping(value, label=label)
    relative = _safe_nonmedia_relative(record.get("relative_path"), label=f"{label}.relative_path")
    expected_sha = _nonempty_string(record.get("sha256"), label=f"{label}.sha256", pattern=_SHA256)
    expected_length = _strict_int(record.get("byte_length"), label=f"{label}.byte_length", minimum=1)
    path = (rights_manifest_path.parent / PurePosixPath(relative)).resolve()
    try:
        path.relative_to(rights_manifest_path.parent.resolve())
    except ValueError as exc:
        raise MidiDdspDaegeumAdapterError(f"{label}.relative_path escapes the rights manifest directory") from exc
    if not path.is_file():
        raise MidiDdspDaegeumAdapterError(f"{label}.relative_path is not a present local receipt/terms snapshot")
    if path.stat().st_size != expected_length:
        raise MidiDdspDaegeumAdapterError(f"{label}.byte_length does not match its local evidence file")
    actual_sha = _sha256(path)
    access["non_audio_rights_evidence_files_hashed"] += 1
    access["non_audio_rights_evidence_bytes_read"] += expected_length
    if actual_sha != expected_sha:
        raise MidiDdspDaegeumAdapterError(f"{label}.sha256 does not match its local evidence file")
    return {"relative_path": relative, "sha256": actual_sha, "byte_length": expected_length}


def _inspect_rights_manifest(
    path: Path | None,
    *,
    access: dict[str, int],
    repo_root: Path,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "provided": path is not None,
        "schema_valid": False,
        "training_allowed": False,
        "authorization_contract_valid": False,
        "real_data_training_attestation_present": False,
        "reason": "no standalone explicit rights manifest was supplied",
        "rights_manifest_is_not_independently_authenticated_by_this_tool": True,
    }
    if path is None:
        return result
    result["path"] = _relative_for_report(path, repo_root=repo_root)
    try:
        payload = _mapping(_json_read(path, label="rights manifest", access=access), label="rights manifest")
        if payload.get("schema") != RIGHTS_SCHEMA:
            result["reason"] = f"rights manifest schema must be {RIGHTS_SCHEMA}"
            return result
        result["schema_valid"] = True
        result["training_allowed"] = payload.get("training_allowed") is True
        result["synthetic_fixture_only"] = payload.get("synthetic_fixture_only") is True
        result["approved_dataset_id"] = payload.get("approved_dataset_id")
        if payload.get("training_allowed") is not True:
            result["reason"] = "rights manifest does not explicitly say training_allowed=true"
            return result
        _nonempty_string(payload.get("approval_id"), label="rights_manifest.approval_id", pattern=_SAFE_ID)
        _nonempty_string(payload.get("approved_dataset_id"), label="rights_manifest.approved_dataset_id", pattern=_SAFE_ID)
        authority = _mapping(payload.get("rights_authority"), label="rights_manifest.rights_authority")
        _nonempty_string(authority.get("organization"), label="rights_manifest.rights_authority.organization")
        _nonempty_string(authority.get("approval_reference"), label="rights_manifest.rights_authority.approval_reference")
        scope = _mapping(payload.get("authorized_scope"), label="rights_manifest.authorized_scope")
        for key in ("local_model_training", "derived_training_features", "training_record_export"):
            if scope.get(key) is not True:
                raise MidiDdspDaegeumAdapterError(f"rights_manifest.authorized_scope.{key} must be true")
        if payload.get("synthetic_fixture_only") is True:
            result["local_receipt_and_terms_snapshot_verified"] = False
            result["local_evidence_reason"] = "synthetic fixture only; never evidence of real download terms or training permission"
        else:
            source = _mapping(payload.get("local_dataset_source"), label="rights_manifest.local_dataset_source")
            result["local_dataset_source"] = {
                "provider": _nonempty_string(source.get("provider"), label="rights_manifest.local_dataset_source.provider"),
                "catalog_dataset_id": _nonempty_string(
                    source.get("catalog_dataset_id"),
                    label="rights_manifest.local_dataset_source.catalog_dataset_id",
                    pattern=_SAFE_ID,
                ),
                "locally_downloaded_by_user": source.get("locally_downloaded_by_user") is True,
            }
            if result["local_dataset_source"]["locally_downloaded_by_user"] is not True:
                raise MidiDdspDaegeumAdapterError(
                    "rights_manifest.local_dataset_source.locally_downloaded_by_user must be true for real data"
                )
            evidence = _mapping(payload.get("local_receipt_and_terms_snapshot"), label="rights_manifest.local_receipt_and_terms_snapshot")
            result["local_receipt_and_terms_snapshot"] = {
                "local_receipt": _verify_local_rights_evidence(
                    evidence.get("local_receipt"),
                    rights_manifest_path=path,
                    label="rights_manifest.local_receipt_and_terms_snapshot.local_receipt",
                    access=access,
                ),
                "terms_snapshot": _verify_local_rights_evidence(
                    evidence.get("terms_snapshot"),
                    rights_manifest_path=path,
                    label="rights_manifest.local_receipt_and_terms_snapshot.terms_snapshot",
                    access=access,
                ),
            }
            result["local_receipt_and_terms_snapshot_verified"] = True
        result["real_data_training_attestation_present"] = payload.get("synthetic_fixture_only") is not True
        result["authorization_contract_valid"] = True
        result["reason"] = (
            "explicit training_allowed=true rights attestation validated as metadata; legal authority is not independently authenticated"
        )
        return result
    except MidiDdspDaegeumAdapterError as exc:
        result["reason"] = str(exc)
        return result


def _inspect_controlled_manifest(
    path: Path | None,
    *,
    access: dict[str, int],
    repo_root: Path,
) -> dict[str, Any]:
    result: dict[str, Any] = {"provided": path is not None, "valid": False}
    if path is None:
        result["reason"] = "no controlled NGC manifest was supplied"
        return result
    result["path"] = _relative_for_report(path, repo_root=repo_root)
    try:
        payload = _mapping(_json_read(path, label="controlled NGC manifest", access=access), label="controlled NGC manifest")
        entries = payload.get("entries")
        if payload.get("schema") != EXPECTED_CONTROLLED_MANIFEST_SCHEMA or not isinstance(entries, list):
            raise MidiDdspDaegeumAdapterError("controlled NGC manifest has an unexpected schema or no entries list")
        statuses = [item.get("musical_status") for item in entries if isinstance(item, Mapping)]
        ineligible = sum(
            1
            for item in statuses
            if isinstance(item, Mapping) and item.get("eligible_for_model_training_or_game_asset") is False
        )
        r_and_d = payload.get("r_and_d_only")
        licence = payload.get("license_evidence")
        result.update(
            {
                "valid": True,
                "schema": payload.get("schema"),
                "manifest_sha256": _sha256(path),
                "entry_count": len(entries),
                "entries_explicitly_ineligible_for_model_training_or_game_asset": ineligible,
                "manifest_itself_has_training_allowed_true": payload.get("training_allowed") is True,
                "human_review_and_rights_review_required_before_training_or_shipping": bool(
                    isinstance(r_and_d, Mapping)
                    and r_and_d.get("human_review_and_rights_review_required_before_training_or_shipping") is True
                ),
                "catalog_license_evidence_explicitly_not_training_or_game_clearance": bool(
                    isinstance(licence, Mapping)
                    and licence.get("not_a_model_training_or_game_distribution_clearance") is True
                ),
                "audio_files_opened": 0,
            }
        )
        return result
    except MidiDdspDaegeumAdapterError as exc:
        result["reason"] = str(exc)
        return result


def _inspect_feature_metadata(bundle: Path, rows: Sequence[Mapping[str, Any]], *, access: dict[str, int]) -> dict[str, Any]:
    """Summarize sidecar JSON only; cached NPZ feature samples stay unopened."""

    schema_counts: dict[str, int] = {}
    hops: set[float] = set()
    feature_counts: list[int] = []
    missing = 0
    f0_proxy_not_human_label = 0
    for row in rows:
        source_id = row.get("source_id")
        if not isinstance(source_id, str) or not _SAFE_ID.fullmatch(source_id):
            missing += 1
            continue
        metadata_path = bundle / "features" / f"{source_id}.json"
        if not metadata_path.is_file():
            missing += 1
            continue
        try:
            payload = _mapping(
                _json_read(metadata_path, label=f"feature metadata for {source_id}", access=access),
                label=f"feature metadata for {source_id}",
            )
        except MidiDdspDaegeumAdapterError:
            missing += 1
            continue
        schema = payload.get("schema")
        schema_counts[str(schema)] = schema_counts.get(str(schema), 0) + 1
        analysis = payload.get("analysis")
        if isinstance(analysis, Mapping):
            if analysis.get("f0_is_not_a_human_pitch_label") is True:
                f0_proxy_not_human_label += 1
            try:
                hops.add(_round(_finite(analysis.get("feature_hop_s"), label="feature_hop_s", minimum=1e-9)))
            except MidiDdspDaegeumAdapterError:
                pass
        try:
            feature_counts.append(_strict_int(payload.get("feature_count"), label="feature_count", minimum=1))
        except MidiDdspDaegeumAdapterError:
            pass
    return {
        "metadata_files_expected": len(rows),
        "metadata_files_read": len(rows) - missing,
        "metadata_files_missing_or_invalid": missing,
        "schema_counts": schema_counts,
        "all_read_metadata_uses_expected_schema": schema_counts == {EXPECTED_FEATURE_METADATA_SCHEMA: len(rows)} if rows else False,
        "feature_hop_seconds_values": sorted(hops),
        "feature_count_min": min(feature_counts) if feature_counts else None,
        "feature_count_max": max(feature_counts) if feature_counts else None,
        "f0_proxy_metadata_explicitly_not_human_pitch_label_count": f0_proxy_not_human_label,
        "cached_feature_npz_files_opened": 0,
        "cached_feature_npz_bytes_read": 0,
    }


def _inspect_label_template(bundle: Path, *, access: dict[str, int]) -> dict[str, Any]:
    path = bundle / "labels.template.jsonl"
    result: dict[str, Any] = {"path": "labels.template.jsonl", "exists": path.is_file()}
    if not path.is_file():
        result["reason"] = "no label template is present"
        return result
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError) as exc:
        result["reason"] = f"label template is unreadable: {type(exc).__name__}"
        return result
    access["label_jsonl_lines_read"] += len(lines)
    count = 0
    parse_errors = 0
    expression_eligible = 0
    reviewed = 0
    unreviewed = 0
    for raw in lines:
        if not raw.strip():
            continue
        try:
            row = json.loads(raw)
        except json.JSONDecodeError:
            parse_errors += 1
            continue
        count += 1
        review = row.get("review") if isinstance(row, Mapping) else None
        if isinstance(review, Mapping):
            if review.get("expression_eligible") is True:
                expression_eligible += 1
            if review.get("state") == "reviewed":
                reviewed += 1
            if review.get("state") == "unreviewed":
                unreviewed += 1
    result.update(
        {
            "record_count": count,
            "parse_error_count": parse_errors,
            "expression_eligible_count": expression_eligible,
            "reviewed_count": reviewed,
            "unreviewed_count": unreviewed,
            "is_a_training_label_set": expression_eligible > 0 and reviewed > 0 and parse_errors == 0,
            "labels_are_not_reinterpreted_as_breath_rearticulate_slur_or_vibrato_labels": True,
        }
    )
    return result


def _inspect_controlled_bundle(
    bundle: Path | None,
    *,
    access: dict[str, int],
    repo_root: Path,
) -> dict[str, Any]:
    result: dict[str, Any] = {"provided": bundle is not None, "valid": False}
    if bundle is None:
        result["reason"] = "no controlled feature bundle was supplied"
        return result
    result["path"] = _relative_for_report(bundle, repo_root=repo_root)
    catalog_path = bundle / "source_catalog.json"
    try:
        payload = _mapping(_json_read(catalog_path, label="source_catalog.json", access=access), label="source_catalog.json")
        rows = payload.get("files")
        if payload.get("schema") != EXPECTED_SOURCE_CATALOG_SCHEMA or not isinstance(rows, list) or not rows:
            raise MidiDdspDaegeumAdapterError("source catalog has an unexpected schema or no source records")
        source_rows = [row for row in rows if isinstance(row, Mapping)]
        rights_status_counts: dict[str, int] = {}
        unverified = 0
        training_allowed_true = 0
        sample_rates: set[int] = set()
        channels: set[int] = set()
        declared_midi_score_reference_count = 0
        for row in source_rows:
            rights = row.get("rights")
            if isinstance(rights, Mapping):
                status = str(rights.get("status"))
                rights_status_counts[status] = rights_status_counts.get(status, 0) + 1
                if status == "unverified_local_rnd_only":
                    unverified += 1
                if rights.get("training_allowed") is True:
                    training_allowed_true += 1
            native = row.get("native")
            if isinstance(native, Mapping):
                if type(native.get("sample_rate_hz")) is int:
                    sample_rates.add(int(native["sample_rate_hz"]))
                if type(native.get("channels")) is int:
                    channels.add(int(native["channels"]))
            if any(key in row for key in ("midi", "score", "aligned_midi", "annotation")):
                declared_midi_score_reference_count += 1
        result.update(
            {
                "valid": True,
                "source_catalog_schema": payload.get("schema"),
                "source_catalog_sha256": _sha256(catalog_path),
                "source_count": len(source_rows),
                "rights_status_counts": rights_status_counts,
                "unverified_local_rnd_only_count": unverified,
                "source_rows_with_training_allowed_true": training_allowed_true,
                "native_sample_rate_hz_values": sorted(sample_rates),
                "native_channel_count_values": sorted(channels),
                "declared_aligned_midi_or_score_reference_count": declared_midi_score_reference_count,
                "feature_metadata": _inspect_feature_metadata(bundle, source_rows, access=access),
                "label_template": _inspect_label_template(bundle, access=access),
                "source_audio_files_opened": 0,
                "source_audio_bytes_read": 0,
            }
        )
        return result
    except MidiDdspDaegeumAdapterError as exc:
        result["reason"] = str(exc)
        return result


def _validate_note(
    note: Mapping[str, Any],
    *,
    label: str,
    previous_offset: int | None,
    is_first: bool,
    synthetic: bool,
) -> tuple[int, str]:
    _nonempty_string(note.get("note_id"), label=f"{label}.note_id", pattern=_SAFE_ID)
    _strict_int(note.get("pitch"), label=f"{label}.pitch", minimum=1, maximum=127)
    onset = _strict_int(note.get("onset_frame"), label=f"{label}.onset_frame", minimum=0)
    offset = _strict_int(note.get("offset_frame"), label=f"{label}.offset_frame", minimum=1)
    if offset <= onset:
        raise MidiDdspDaegeumAdapterError(f"{label}.offset_frame must exceed onset_frame")
    if previous_offset is not None and onset < previous_offset:
        raise MidiDdspDaegeumAdapterError(f"{label} overlaps the preceding note in a monophonic contract")
    onset_seconds = _finite(note.get("onset_seconds"), label=f"{label}.onset_seconds", minimum=0.0)
    offset_seconds = _finite(note.get("offset_seconds"), label=f"{label}.offset_seconds", minimum=0.0)
    if abs(onset_seconds - onset * FRAME_SECONDS) > 1.0e-9 or abs(offset_seconds - offset * FRAME_SECONDS) > 1.0e-9:
        raise MidiDdspDaegeumAdapterError(f"{label} seconds must match its fixed 250 Hz conditioning frames")
    articulation = _nonempty_string(note.get("articulation"), label=f"{label}.articulation")
    if articulation not in {"breath_start", "rearticulate", "slur"}:
        raise MidiDdspDaegeumAdapterError(f"{label}.articulation must be breath_start, rearticulate, or slur")
    if is_first and articulation != "breath_start":
        raise MidiDdspDaegeumAdapterError(f"{label} must explicitly begin as breath_start")
    slur = note.get("slur_from_previous")
    if type(slur) is not bool:
        raise MidiDdspDaegeumAdapterError(f"{label}.slur_from_previous must be boolean")
    if (articulation == "slur") != slur:
        raise MidiDdspDaegeumAdapterError(f"{label} must make slur_from_previous exactly agree with explicit articulation")
    vibrato = _mapping(note.get("vibrato"), label=f"{label}.vibrato")
    enabled = vibrato.get("enabled")
    if type(enabled) is not bool:
        raise MidiDdspDaegeumAdapterError(f"{label}.vibrato.enabled must be boolean")
    rate = _finite(vibrato.get("rate_hz"), label=f"{label}.vibrato.rate_hz", minimum=0.0)
    depth = _finite(vibrato.get("depth_cents"), label=f"{label}.vibrato.depth_cents", minimum=0.0)
    _finite(vibrato.get("onset_seconds"), label=f"{label}.vibrato.onset_seconds", minimum=0.0)
    _finite(vibrato.get("ramp_seconds"), label=f"{label}.vibrato.ramp_seconds", minimum=0.0)
    if enabled and (rate <= 0.0 or depth <= 0.0):
        raise MidiDdspDaegeumAdapterError(f"{label} enabled vibrato must have positive rate_hz and depth_cents")
    expression = _mapping(note.get("midi_ddsp_expression_targets"), label=f"{label}.midi_ddsp_expression_targets")
    if set(expression) != set(MIDI_DDSP_EXPRESSION_FIELDS):
        raise MidiDdspDaegeumAdapterError(f"{label} must contain exactly the six MIDI-DDSP expression fields")
    for field in MIDI_DDSP_EXPRESSION_FIELDS:
        _finite(expression.get(field), label=f"{label}.midi_ddsp_expression_targets.{field}", minimum=0.0, maximum=1.0)
    expected_provenance = "synthetic_only" if synthetic else "measured_and_human_validated"
    if note.get("expression_target_provenance") != expected_provenance:
        raise MidiDdspDaegeumAdapterError(
            f"{label}.expression_target_provenance must be {expected_provenance!r}; labels never supply unmeasured controls by implication"
        )
    release = _finite(note.get("post_note_release_seconds", 0.0), label=f"{label}.post_note_release_seconds", minimum=0.0)
    if release > 0.0 and articulation == "slur":
        raise MidiDdspDaegeumAdapterError(f"{label} cannot put an explicit post-note release inside a slur chain")
    return offset, articulation


def _inspect_training_contract(
    path: Path | None,
    *,
    access: dict[str, int],
    repo_root: Path,
) -> dict[str, Any]:
    result: dict[str, Any] = {"provided": path is not None, "valid": False}
    if path is None:
        result["reason"] = "no paired continuous-mono-audio/aligned-MIDI/gesture training contract was supplied"
        return result
    result["path"] = _relative_for_report(path, repo_root=repo_root)
    try:
        payload = _mapping(_json_read(path, label="training contract", access=access), label="training contract")
        if payload.get("schema") != TRAINING_CONTRACT_SCHEMA:
            raise MidiDdspDaegeumAdapterError(f"training contract schema must be {TRAINING_CONTRACT_SCHEMA}")
        dataset_id = _nonempty_string(payload.get("dataset_id"), label="training_contract.dataset_id", pattern=_SAFE_ID)
        synthetic = payload.get("synthetic_fixture_only") is True
        audio_format = _mapping(payload.get("continuous_mono_audio"), label="training_contract.continuous_mono_audio")
        if audio_format.get("continuous") is not True or audio_format.get("channels") != 1:
            raise MidiDdspDaegeumAdapterError("training contract must explicitly require continuous mono audio")
        target_audio_rate = _strict_int(
            audio_format.get("sample_rate_hz"),
            label="training_contract.continuous_mono_audio.sample_rate_hz",
            minimum=1,
        )
        alignment = _mapping(payload.get("alignment"), label="training_contract.alignment")
        if alignment.get("score_timebase_matches_audio") is not True:
            raise MidiDdspDaegeumAdapterError("training contract must explicitly align the score and audio timebases")
        if _finite(alignment.get("maximum_error_seconds"), label="training_contract.alignment.maximum_error_seconds", minimum=0.0) > FRAME_SECONDS:
            raise MidiDdspDaegeumAdapterError("training contract alignment error exceeds one 250 Hz MIDI-DDSP frame")
        conditioning = _mapping(payload.get("midi_ddsp_conditioning"), label="training_contract.midi_ddsp_conditioning")
        if conditioning.get("frame_rate_hz") != FRAME_RATE_HZ:
            raise MidiDdspDaegeumAdapterError("training contract must declare MIDI-DDSP's 250 Hz conditioning frame rate")
        if tuple(conditioning.get("expression_fields", ())) != MIDI_DDSP_EXPRESSION_FIELDS:
            raise MidiDdspDaegeumAdapterError("training contract expression field order does not match the documented MIDI-DDSP order")
        if tuple(conditioning.get("row_fields", ())) != MIDI_DDSP_CONDITIONING_ROW_FIELDS:
            raise MidiDdspDaegeumAdapterError("training contract conditioning row fields are incomplete or out of order")
        items = payload.get("items")
        if not isinstance(items, list) or not items:
            raise MidiDdspDaegeumAdapterError("training contract must name at least one paired item")
        item_ids: set[str] = set()
        note_count = 0
        articulations: dict[str, int] = {}
        explicit_vibrato_count = 0
        release_annotation_count = 0
        for ordinal, raw_item in enumerate(items):
            item = _mapping(raw_item, label=f"training_contract.items[{ordinal}]")
            item_id = _nonempty_string(item.get("item_id"), label=f"training_contract.items[{ordinal}].item_id", pattern=_SAFE_ID)
            if item_id in item_ids:
                raise MidiDdspDaegeumAdapterError("training contract repeats an item_id")
            item_ids.add(item_id)
            audio = _mapping(item.get("audio"), label=f"training_contract.items[{ordinal}].audio")
            _safe_relative(audio.get("relative_path"), label=f"training_contract.items[{ordinal}].audio.relative_path", suffix=".wav")
            _nonempty_string(audio.get("sha256"), label=f"training_contract.items[{ordinal}].audio.sha256", pattern=_SHA256)
            if audio.get("continuous_mono") is not True or audio.get("channels") != 1:
                raise MidiDdspDaegeumAdapterError(f"training_contract.items[{ordinal}] must explicitly name one continuous mono audio stream")
            item_audio_rate = _strict_int(
                audio.get("sample_rate_hz"),
                label=f"training_contract.items[{ordinal}].audio.sample_rate_hz",
                minimum=1,
            )
            if item_audio_rate != target_audio_rate:
                raise MidiDdspDaegeumAdapterError(
                    f"training_contract.items[{ordinal}].audio.sample_rate_hz must match continuous_mono_audio.sample_rate_hz"
                )
            item_duration = _finite(
                audio.get("duration_seconds"),
                label=f"training_contract.items[{ordinal}].audio.duration_seconds",
                minimum=FRAME_SECONDS,
            )
            midi = _mapping(item.get("aligned_midi"), label=f"training_contract.items[{ordinal}].aligned_midi")
            _safe_relative(midi.get("relative_path"), label=f"training_contract.items[{ordinal}].aligned_midi.relative_path", suffix=".mid")
            _nonempty_string(midi.get("sha256"), label=f"training_contract.items[{ordinal}].aligned_midi.sha256", pattern=_SHA256)
            if midi.get("timebase_matches_audio") is not True:
                raise MidiDdspDaegeumAdapterError(f"training_contract.items[{ordinal}].aligned_midi must explicitly match audio timebase")
            notes = item.get("notes")
            if not isinstance(notes, list) or not notes:
                raise MidiDdspDaegeumAdapterError(f"training_contract.items[{ordinal}] has no aligned note/gesture labels")
            previous_offset: int | None = None
            final_required_seconds = 0.0
            for note_index, raw_note in enumerate(notes):
                note = _mapping(raw_note, label=f"training_contract.items[{ordinal}].notes[{note_index}]")
                previous_offset, articulation = _validate_note(
                    note,
                    label=f"training_contract.items[{ordinal}].notes[{note_index}]",
                    previous_offset=previous_offset,
                    is_first=note_index == 0,
                    synthetic=synthetic,
                )
                note_count += 1
                articulations[articulation] = articulations.get(articulation, 0) + 1
                if note["vibrato"]["enabled"] is True:
                    explicit_vibrato_count += 1
                if float(note.get("post_note_release_seconds", 0.0)) > 0.0:
                    release_annotation_count += 1
                final_required_seconds = max(
                    final_required_seconds,
                    previous_offset * FRAME_SECONDS + float(note.get("post_note_release_seconds", 0.0)),
                )
            if item_duration + 1.0e-9 < final_required_seconds:
                raise MidiDdspDaegeumAdapterError(
                    f"training_contract.items[{ordinal}].audio.duration_seconds ends before its final aligned note/release"
                )
        result.update(
            {
                "valid": True,
                "schema": payload.get("schema"),
                "contract_sha256": _sha256(path),
                "dataset_id": dataset_id,
                "synthetic_fixture_only": synthetic,
                "item_count": len(items),
                "note_count": note_count,
                "explicit_articulation_counts": articulations,
                "explicit_vibrato_annotation_count": explicit_vibrato_count,
                "explicit_post_note_release_annotation_count": release_annotation_count,
                "audio_or_midi_files_opened": 0,
            }
        )
        return result
    except MidiDdspDaegeumAdapterError as exc:
        result["reason"] = str(exc)
        return result


def _field_mapping() -> dict[str, Any]:
    """Document the adapter contract without claiming a learned Daegeum mapping."""

    return {
        "continuous_audio_target": {
            "contract_input": "item.audio: one continuous mono waveform with SHA-256, duration, rate, and channels",
            "future_use": "authorized synthesis-generator reconstruction target and later f0/loudness extraction input",
            "this_adapter": "never opens, copies, decodes, resamples, or exports it",
        },
        "aligned_score_to_conditioning_rows": {
            "required_order": list(MIDI_DDSP_CONDITIONING_ROW_FIELDS),
            "mapping": {
                "pitch": "human-validated MIDI/score pitch, not an automatic feature proxy",
                "onset": "score/audio-aligned 250 Hz frame index",
                "offset": "exclusive score/audio-aligned 250 Hz frame index",
                "note_length": "offset minus onset",
            },
            "monophonic_requirement": True,
            "touching_notes_never_imply_slur": True,
        },
        "six_documented_expression_targets": {
            "ordered_fields": list(MIDI_DDSP_EXPRESSION_FIELDS),
            "required_range": [0.0, 1.0],
            "required_provenance_for_real_data": "measured_and_human_validated",
            "not_deterministically_inferred_from_articulation_labels": True,
        },
        "gesture_and_vibrato_auxiliary_labels": {
            "breath_start": "explicit boundary class; may supervise onset/attack analysis but does not itself set a numeric attack value",
            "rearticulate": "explicit boundary class; may supervise reattack analysis but does not itself set numeric expression controls",
            "slur": "explicit slur_from_previous=true only; touching timestamps are never a slur rule",
            "vibrato": "explicit enabled/rate_hz/depth_cents/onset/ramp; unit-range vibrato target is separate and rate remains metadata",
            "post_note_release": "preserved auxiliary annotation; it is not one of MIDI-DDSP's six note-expression fields",
        },
        "future_audio_derived_targets_after_rights_and_exporter_review": [
            "audio waveform at the approved training rate",
            "frame-aligned f0_hz and loudness_db targets",
            "midi pitch/onset/offset masks",
            "six-field per-note conditioning targets",
        ],
        "no_daegeum_instrument_id_is_invented_by_this_adapter": True,
    }


def build_readiness_report(
    *,
    controlled_manifest: Path | None,
    controlled_bundle: Path | None,
    rights_manifest: Path | None,
    training_contract: Path | None,
    repo_root: Path | None = None,
) -> dict[str, Any]:
    """Return a deterministic metadata-only readiness report; never write training data."""

    root = (repo_root or _repo_root()).resolve()
    access = _new_access_ledger()
    rights = _inspect_rights_manifest(rights_manifest, access=access, repo_root=root)
    controlled = _inspect_controlled_manifest(controlled_manifest, access=access, repo_root=root)
    bundle = _inspect_controlled_bundle(controlled_bundle, access=access, repo_root=root)
    contract = _inspect_training_contract(training_contract, access=access, repo_root=root)
    blockers: list[str] = []
    if rights.get("training_allowed") is not True or rights.get("authorization_contract_valid") is not True:
        blockers.append("No standalone explicit rights manifest validates training_allowed=true with the required scope.")
    if controlled.get("valid") is True:
        if int(controlled.get("entries_explicitly_ineligible_for_model_training_or_game_asset", 0)) > 0:
            blockers.append("The named controlled NGC manifest explicitly marks its entries ineligible for model training/game assets.")
        if controlled.get("manifest_itself_has_training_allowed_true") is not True:
            blockers.append("The controlled NGC manifest itself does not say training_allowed=true and cannot substitute for a rights manifest.")
    if bundle.get("valid") is True:
        if int(bundle.get("unverified_local_rnd_only_count", 0)) > 0:
            blockers.append("The named feature catalog has unverified_local_rnd_only source records.")
        labels = bundle.get("label_template")
        if isinstance(labels, Mapping) and int(labels.get("expression_eligible_count", 0)) == 0:
            blockers.append("The named label template has no expression-eligible reviewed labels.")
        if int(bundle.get("declared_aligned_midi_or_score_reference_count", 0)) == 0:
            blockers.append("The controlled catalog declares no aligned MIDI/score references.")
    if contract.get("valid") is not True:
        blockers.append("No valid paired continuous-mono-audio/aligned-MIDI/gesture contract is available.")
    elif rights.get("approved_dataset_id") != contract.get("dataset_id"):
        blockers.append("The rights manifest is not bound to the training contract's dataset_id.")

    synthetic = contract.get("synthetic_fixture_only") is True
    if not blockers and synthetic:
        status = "synthetic_contract_validated_metadata_only"
        disposition = (
            "The synthetic contract shape is valid and deliberately opened no nonexistent audio/MIDI paths. "
            "It authorizes neither real data access nor training-data emission."
        )
    elif not blockers:
        status = "rights_attested_contract_validated_metadata_only"
        disposition = (
            "The explicit rights attestation and paired contract are structurally valid, but this tool still emits no "
            "audio, TFRecords, tensors, or model work. A separate reviewed exporter is required."
        )
    else:
        status = "blocked"
        disposition = "Fail closed: only metadata/readiness evidence was emitted; no source audio, NPZ, MIDI, TFRecord, or training data was touched."
    return {
        "schema": READINESS_SCHEMA,
        "status": status,
        "disposition": disposition,
        "controlled_192_file_bundle": {"manifest": controlled, "feature_bundle": bundle},
        "rights_gate": rights,
        "paired_training_contract": contract,
        "required_field_mapping": _field_mapping(),
        "future_candidate_sources_not_downloaded_or_authorized_by_this_adapter": FUTURE_SOURCE_CANDIDATES,
        "blockers": blockers,
        "operation_provenance": {
            "metadata_only_dry_run": True,
            "no_audio_or_npz_read_before_or_after_rights_gate": True,
            "no_training_data_or_tfrecord_emitted_even_when_contract_is_synthetic_or_rights_attested": True,
            "no_model_training_or_default_bgm_change": True,
            "access_ledger": access,
        },
        "interpretation_limits": {
            "rights_manifest_is_a_required_explicit_attestation_not_independently_authenticated_legal_advice": True,
            "real_rights_attestation_requires_hash_verified_local_download_receipt_and_terms_snapshot": True,
            "feature_proxies_are_not_human_score_breath_rearticulate_slur_or_vibrato_labels": True,
            "current_controlled_bundle_is_not_reinterpreted_as_training_permission": True,
            "no_daegeum_performance_or_model_quality_claim": True,
            "no_game_asset_or_default_bgm_change": True,
        },
    }


def _write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _fresh_rnd_directory(path: Path, *, repo_root: Path) -> Path:
    expected = (repo_root / "_bgm_rnd").resolve()
    resolved = path.expanduser().resolve()
    try:
        resolved.relative_to(expected)
    except ValueError as exc:
        raise MidiDdspDaegeumAdapterError("--output-dir must be a fresh child of repository _bgm_rnd/") from exc
    if resolved == expected or resolved.exists():
        raise MidiDdspDaegeumAdapterError("--output-dir must be a fresh child of repository _bgm_rnd/")
    resolved.mkdir(parents=True, exist_ok=False)
    return resolved


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--controlled-manifest", help="existing 192-file NGC manifest to inspect as metadata")
    parser.add_argument("--controlled-bundle", help="existing R&D-06 feature bundle to inspect as metadata")
    parser.add_argument("--rights-manifest", help="standalone explicit rights manifest; requires training_allowed=true")
    parser.add_argument("--training-contract", help="paired audio/MIDI/gesture contract; only JSON metadata is opened")
    parser.add_argument("--output-dir", help="fresh ignored _bgm_rnd child for the readiness report")
    parser.add_argument("--dry-run", action="store_true", help="print the no-audio/no-training contract without reading files")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.dry_run:
        print(
            "midi-ddsp-daegeum-adapter: metadata-only; never opens/copies audio or NPZ, and never writes TFRecords, "
            "training data, model checkpoints, or default BGM. Current uncontrolled/rights-unreviewed NGC evidence blocks."
        )
        return 0
    if not args.output_dir:
        _parser().error("--output-dir is required unless --dry-run")
    if not args.controlled_manifest and not args.training_contract:
        _parser().error("name --controlled-manifest and/or --training-contract")
    if bool(args.controlled_manifest) != bool(args.controlled_bundle):
        _parser().error("--controlled-manifest and --controlled-bundle must be supplied together")
    root = _repo_root()
    try:
        destination = _fresh_rnd_directory(Path(args.output_dir), repo_root=root)
        report = build_readiness_report(
            controlled_manifest=Path(args.controlled_manifest) if args.controlled_manifest else None,
            controlled_bundle=Path(args.controlled_bundle) if args.controlled_bundle else None,
            rights_manifest=Path(args.rights_manifest) if args.rights_manifest else None,
            training_contract=Path(args.training_contract) if args.training_contract else None,
            repo_root=root,
        )
        _write_json(destination / REPORT_FILENAME, report)
    except MidiDdspDaegeumAdapterError as exc:
        print(f"midi-ddsp-daegeum-adapter: error: {exc}", file=sys.stderr)
        return 2
    print(
        "midi-ddsp-daegeum-adapter: "
        f"{report['status']}; report={(destination / REPORT_FILENAME).relative_to(root).as_posix()}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
