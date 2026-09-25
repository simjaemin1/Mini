"""Strict, local-only validation for a future AI Hub WAV/MIDI/JSON bundle.

This module is intentionally an *ingest gate*, not a downloader, corpus
scanner, feature extractor, renderer, trainer, or asset exporter.  It accepts
one explicit local JSON manifest and reads only the three files named for each
declared pair.  No network clients are imported or used.

The resulting report is suitable as an input contract for a later feature
extraction step.  It never copies WAV, MIDI, or annotation bytes and it never
turns a local bundle into a default/runtime/game/public asset.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
import re
from typing import Any, Mapping


BUNDLE_MANIFEST_SCHEMA = "mini.aihub-paired-data.rnd-local-bundle-manifest.v1"
REPORT_SCHEMA = "mini.aihub-paired-data.rnd-feature-extraction-input-report.v1"
REPORT_FILENAME = "aihub_paired_ingest_report.json"
_SHA256 = re.compile(r"[0-9a-f]{64}")
_IDENTIFIER = re.compile(r"[A-Za-z0-9_-]{1,128}")
_AIHUB_DATASET_ID = re.compile(r"[A-Za-z0-9_.-]{1,160}")
_REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_ASSET_ROOT = _REPOSITORY_ROOT / "public" / "assets"


class AIHubPairedIngestError(RuntimeError):
    """A local bundle is incomplete, escapes its root, or lacks an R&D gate."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _read_prefix(path: Path, byte_count: int) -> bytes:
    """Read only a small declared-file prefix for shallow type recognition."""

    with path.open("rb") as stream:
        return stream.read(byte_count)


def _load_json(path: Path, *, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise AIHubPairedIngestError(f"{label} does not exist") from exc
    except UnicodeDecodeError as exc:
        raise AIHubPairedIngestError(f"{label} is not UTF-8 JSON") from exc
    except json.JSONDecodeError as exc:
        raise AIHubPairedIngestError(f"{label} is not valid JSON") from exc


def _require_mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise AIHubPairedIngestError(f"{label} must be an object")
    return value


def _require_true(value: Mapping[str, Any], key: str, *, label: str) -> None:
    if value.get(key) is not True:
        raise AIHubPairedIngestError(f"{label}.{key} must explicitly be true")


def _require_string(
    value: Any,
    *,
    label: str,
    pattern: re.Pattern[str] | None = None,
) -> str:
    if not isinstance(value, str) or not value:
        raise AIHubPairedIngestError(f"{label} must be a non-empty string")
    if pattern is not None and pattern.fullmatch(value) is None:
        raise AIHubPairedIngestError(f"{label} has an invalid format")
    return value


def _require_int(value: Any, *, label: str, minimum: int | None = None) -> int:
    if type(value) is not int:
        raise AIHubPairedIngestError(f"{label} must be an integer")
    if minimum is not None and value < minimum:
        raise AIHubPairedIngestError(f"{label} is below its permitted range")
    return value


def _safe_relative(value: Any, *, label: str, suffix: str) -> str:
    raw = _require_string(value, label=label)
    if "\\" in raw or ":" in raw:
        raise AIHubPairedIngestError(f"{label} must be a POSIX relative local path")
    parsed = PurePosixPath(raw)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise AIHubPairedIngestError(f"{label} is not a safe relative path")
    if parsed.suffix.lower() != suffix:
        raise AIHubPairedIngestError(f"{label} must name an explicit {suffix} file")
    return parsed.as_posix()


def _child(root: Path, relative: str, *, label: str) -> Path:
    candidate = (root / PurePosixPath(relative)).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise AIHubPairedIngestError(f"{label} escapes the local bundle root") from exc
    return candidate


def _validate_rnd_scope(scope: Mapping[str, Any]) -> dict[str, bool]:
    # ``no_model_training`` makes this handoff only a later feature-extraction
    # contract.  A separate, newly reviewed manifest is required before any
    # model-training stage can accept derived tensors.
    keys = (
        "r_and_d_only",
        "future_local_bundle_only",
        "no_network_download_or_dataset_discovery",
        "no_source_redistribution",
        "no_default_assets",
        "no_runtime_bgm",
        "no_game_output",
        "no_public_release",
        "no_model_training",
    )
    for key in keys:
        _require_true(scope, key, label="ai_hub_r_and_d_scope")
    return {key: True for key in keys}


def _validate_rights_gate(gate: Mapping[str, Any]) -> dict[str, bool]:
    # These are deliberately project attestations.  They are not evidence of,
    # nor a substitute for, an AI Hub approval or a permission inference.
    keys = (
        "project_has_explicit_local_bundle_access_record",
        "project_rights_review_completed_for_this_local_bundle",
        "project_scope_limited_to_later_feature_extraction",
        "ai_hub_terms_reviewed_for_this_local_bundle",
        "no_source_redistribution",
        "no_default_asset_or_runtime_use",
        "no_game_or_public_distribution_clearance",
        "no_model_training_authorized_by_this_manifest",
        "requires_new_rights_review_for_scope_expansion",
        "does_not_claim_ai_hub_approval_or_training_authorization",
    )
    for key in keys:
        _require_true(gate, key, label="ai_hub_rights_gate")
    return {key: True for key in keys}


def _validate_pair_gate(gate: Mapping[str, Any], *, label: str) -> dict[str, bool]:
    keys = (
        "r_and_d_only",
        "not_default_asset",
        "not_runtime_bgm",
        "not_game_asset",
        "not_public_distribution",
        "not_source_redistributable",
        "not_a_model_training_item",
    )
    for key in keys:
        _require_true(gate, key, label=label)
    return {key: True for key in keys}


def _validate_file_ref(value: Any, *, label: str, suffix: str) -> dict[str, Any]:
    item = _require_mapping(value, label=label)
    relative_path = _safe_relative(item.get("relative_path"), label=f"{label}.relative_path", suffix=suffix)
    sha256 = _require_string(item.get("sha256"), label=f"{label}.sha256", pattern=_SHA256)
    byte_length = _require_int(item.get("byte_length"), label=f"{label}.byte_length", minimum=1)
    return {
        "relative_path": relative_path,
        "sha256": sha256,
        "byte_length": byte_length,
    }


def _validate_local_file(
    reference: Mapping[str, Any],
    *,
    role: str,
    bundle_root: Path,
    label: str,
) -> None:
    path = _child(bundle_root, str(reference["relative_path"]), label=label)
    if not path.is_file():
        raise AIHubPairedIngestError(f"{label}.relative_path does not name a local regular file")
    if path.stat().st_size != reference["byte_length"]:
        raise AIHubPairedIngestError(f"{label}.byte_length does not match the explicit local file")
    if _sha256(path) != reference["sha256"]:
        raise AIHubPairedIngestError(f"{label}.sha256 does not match the explicit local file")

    # This only checks a short container/document signature.  It deliberately
    # avoids decoding recordings, parsing musical events, or interpreting any
    # annotation semantics at ingest time.
    if role == "audio_wav":
        header = _read_prefix(path, 12)
        if len(header) < 12 or header[:4] not in {b"RIFF", b"RF64", b"BW64"} or header[8:12] != b"WAVE":
            raise AIHubPairedIngestError(f"{label} is not a recognizable WAV container")
    elif role == "performance_midi":
        header = _read_prefix(path, 14)
        if len(header) < 14 or header[:4] != b"MThd" or int.from_bytes(header[4:8], "big") != 6:
            raise AIHubPairedIngestError(f"{label} is not a recognizable Standard MIDI header")
    elif role == "annotation_json":
        annotation = _load_json(path, label=label)
        if not isinstance(annotation, (Mapping, list)):
            raise AIHubPairedIngestError(f"{label} must contain a JSON object or array")
    else:  # pragma: no cover - internal call sites use the fixed roles above.
        raise AssertionError(f"unexpected paired-data role: {role}")


def _validate_pair(
    value: Any,
    *,
    index: int,
    bundle_root: Path,
    verify_files: bool,
) -> dict[str, Any]:
    label = f"pairs[{index}]"
    pair = _require_mapping(value, label=label)
    pair_id = _require_string(pair.get("pair_id"), label=f"{label}.pair_id", pattern=_IDENTIFIER)
    source_record_id = _require_string(
        pair.get("source_record_id"), label=f"{label}.source_record_id", pattern=_IDENTIFIER
    )
    pair_gate = _validate_pair_gate(_require_mapping(pair.get("pair_gate"), label=f"{label}.pair_gate"), label=f"{label}.pair_gate")
    files = {
        "audio_wav": _validate_file_ref(pair.get("audio_wav"), label=f"{label}.audio_wav", suffix=".wav"),
        "performance_midi": _validate_file_ref(
            pair.get("performance_midi"), label=f"{label}.performance_midi", suffix=".mid"
        ),
        "annotation_json": _validate_file_ref(
            pair.get("annotation_json"), label=f"{label}.annotation_json", suffix=".json"
        ),
    }
    paths = [str(item["relative_path"]) for item in files.values()]
    if len(set(paths)) != len(paths):
        raise AIHubPairedIngestError(f"{label} must name three distinct local WAV/MIDI/JSON files")
    if verify_files:
        for role, reference in files.items():
            _validate_local_file(reference, role=role, bundle_root=bundle_root, label=f"{label}.{role}")
    return {
        "pair_id": pair_id,
        "source_record_id": source_record_id,
        "pair_gate": pair_gate,
        **files,
    }


def validate_local_bundle_manifest(path: str | Path, *, verify_files: bool = True) -> dict[str, Any]:
    """Validate one bounded AI Hub-named local bundle and return a stable report.

    ``verify_files`` defaults to true and reads only directly declared files to
    verify their byte length, SHA-256, and shallow file signature.  It never
    searches directories, opens URLs, downloads data, or creates derived data.
    """

    manifest_path = Path(path).expanduser().resolve()
    if not manifest_path.is_file():
        raise AIHubPairedIngestError("--bundle-manifest must name one readable local JSON manifest")
    manifest = _require_mapping(_load_json(manifest_path, label="bundle manifest"), label="bundle manifest")
    if manifest.get("schema") != BUNDLE_MANIFEST_SCHEMA:
        raise AIHubPairedIngestError(f"bundle manifest.schema must be {BUNDLE_MANIFEST_SCHEMA}")

    source = _require_mapping(manifest.get("ai_hub_local_bundle"), label="ai_hub_local_bundle")
    if source.get("source_platform") != "aihub":
        raise AIHubPairedIngestError("ai_hub_local_bundle.source_platform must be aihub")
    dataset_id = _require_string(source.get("dataset_id"), label="ai_hub_local_bundle.dataset_id", pattern=_AIHUB_DATASET_ID)
    bundle_id = _require_string(source.get("bundle_id"), label="ai_hub_local_bundle.bundle_id", pattern=_IDENTIFIER)
    for key in (
        "local_bundle_only",
        "network_download_disabled_by_contract",
        "dataset_discovery_disabled_by_contract",
        "external_approval_not_inferred",
    ):
        _require_true(source, key, label="ai_hub_local_bundle")

    scope = _validate_rnd_scope(_require_mapping(manifest.get("ai_hub_r_and_d_scope"), label="ai_hub_r_and_d_scope"))
    rights_gate = _validate_rights_gate(_require_mapping(manifest.get("ai_hub_rights_gate"), label="ai_hub_rights_gate"))
    pairs_value = manifest.get("pairs")
    if not isinstance(pairs_value, list) or not pairs_value:
        raise AIHubPairedIngestError("bundle manifest.pairs must be a non-empty explicit list")
    if len(pairs_value) > 10_000:
        raise AIHubPairedIngestError("bundle manifest.pairs exceeds the bounded local ingest limit")

    bundle_root = manifest_path.parent.resolve()
    pairs = [
        _validate_pair(item, index=index, bundle_root=bundle_root, verify_files=verify_files)
        for index, item in enumerate(pairs_value, 1)
    ]
    pair_ids = [str(item["pair_id"]) for item in pairs]
    if len(set(pair_ids)) != len(pair_ids):
        raise AIHubPairedIngestError("bundle manifest.pairs repeats a pair_id")
    source_record_ids = [str(item["source_record_id"]) for item in pairs]
    if len(set(source_record_ids)) != len(source_record_ids):
        raise AIHubPairedIngestError("bundle manifest.pairs repeats a source_record_id")
    all_paths = [str(file_ref["relative_path"]) for pair in pairs for file_ref in (
        pair["audio_wav"], pair["performance_midi"], pair["annotation_json"]
    )]
    if len(set(all_paths)) != len(all_paths):
        raise AIHubPairedIngestError("bundle manifest reuses a local file across pairs; declare one bounded pair per file")

    return {
        "schema": REPORT_SCHEMA,
        "artifact_role": "r_and_d_only_feature_extraction_input_manifest_not_an_asset",
        "input": {
            "bundle_manifest_basename": manifest_path.name,
            "bundle_manifest_sha256": _sha256(manifest_path),
            "files_sha256_and_signature_verified": bool(verify_files),
        },
        "ai_hub_local_bundle": {
            "source_platform": "aihub",
            "dataset_id": dataset_id,
            "bundle_id": bundle_id,
            "local_bundle_only": True,
            "network_download_disabled_by_contract": True,
            "dataset_discovery_disabled_by_contract": True,
            "external_approval_not_inferred": True,
        },
        "ai_hub_r_and_d_scope": scope,
        "ai_hub_rights_gate": rights_gate,
        "pair_count": len(pairs),
        "pairs": pairs,
        "later_feature_extraction_contract": {
            "explicit_local_wav_midi_json_pairs_only": True,
            "all_pair_hashes_and_lengths_must_be_reverified_by_the_later_step": True,
            "no_source_bytes_copied_into_this_report": True,
            "no_audio_decode_midi_event_parse_or_annotation_semantic_interpretation_performed": True,
            "no_model_training_performed_or_authorized_by_this_ingest": True,
        },
        "interpretation_limits": {
            "no_ai_hub_approval_or_license_is_inferred_or_claimed": True,
            "not_a_default_asset_runtime_bgm_game_output_or_public_release_authorization": True,
            "not_a_source_redistribution_authorization": True,
            "no_network_or_dataset_discovery_was_performed": True,
        },
    }


def write_feature_extraction_report(report: Mapping[str, Any], output_dir: str | Path) -> Path:
    """Write exactly one JSON report into a fresh, non-default-asset directory."""

    if report.get("schema") != REPORT_SCHEMA:
        raise AIHubPairedIngestError("report must be the validated R&D feature-extraction input report")
    target = Path(output_dir).expanduser().resolve()
    if target.exists():
        raise AIHubPairedIngestError("--report-dir must be a fresh path that does not already exist")
    if not target.parent.is_dir():
        raise AIHubPairedIngestError("--report-dir parent must already exist")
    try:
        target.relative_to(_DEFAULT_ASSET_ROOT.resolve())
    except ValueError:
        pass
    else:
        raise AIHubPairedIngestError("--report-dir must not be inside public/assets; default asset output is forbidden")
    target.mkdir()
    report_path = target / REPORT_FILENAME
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report_path
