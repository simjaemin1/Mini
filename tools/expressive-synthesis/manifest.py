"""Strict, R&D-only manifest validation for expressive-synthesis experiments.

This module is deliberately pure Python so provenance and rights gates can be
tested on a machine that has neither PyTorch nor CUDA.  It accepts a *single,
explicit* manifest; it never crawls a directory, assumes a license from a
filename, or infers permission from an audio feature cache.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
import re
from typing import Any, Mapping


MANIFEST_SCHEMA = "mini.expressive-synthesis.rnd-corpus-manifest.v1"
CONTROLS_SCHEMA = "mini.expressive-synthesis.continuous-controls.v1"
TARGET_SCHEMA = "mini.expressive-synthesis.rnd-reconstruction-target.v1"


class ManifestValidationError(RuntimeError):
    """A corpus manifest is incomplete, broad, or outside R&D-only scope."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ManifestValidationError("manifest does not exist") from exc
    except json.JSONDecodeError as exc:
        raise ManifestValidationError("manifest is not valid JSON") from exc


def _require_mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ManifestValidationError(f"{label} must be an object")
    return value


def _require_bool(value: Mapping[str, Any], key: str, *, label: str) -> None:
    if value.get(key) is not True:
        raise ManifestValidationError(f"{label}.{key} must explicitly be true")


def _require_string(value: Any, *, label: str, pattern: str | None = None) -> str:
    if not isinstance(value, str) or not value:
        raise ManifestValidationError(f"{label} must be a non-empty string")
    if pattern is not None and re.fullmatch(pattern, value) is None:
        raise ManifestValidationError(f"{label} has an invalid format")
    return value


def _require_int(value: Any, *, label: str, minimum: int | None = None) -> int:
    if type(value) is not int:
        raise ManifestValidationError(f"{label} must be an integer")
    if minimum is not None and value < minimum:
        raise ManifestValidationError(f"{label} is below its permitted range")
    return value


def _safe_relative(value: Any, *, label: str) -> str:
    raw = _require_string(value, label=label)
    if "\\" in raw:
        raise ManifestValidationError(f"{label} must be a POSIX relative path")
    parsed = PurePosixPath(raw)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise ManifestValidationError(f"{label} is not a safe relative path")
    return parsed.as_posix()


def _child(root: Path, relative: str, *, label: str) -> Path:
    candidate = (root / PurePosixPath(relative)).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ManifestValidationError(f"{label} escapes the manifest directory") from exc
    return candidate


def _validate_scope(scope: Mapping[str, Any]) -> dict[str, bool]:
    for key in (
        "r_and_d_only",
        "no_default_assets",
        "no_runtime_bgm",
        "no_game_output",
        "no_public_release",
    ):
        _require_bool(scope, key, label="r_and_d_scope")
    return {key: True for key in (
        "r_and_d_only",
        "no_default_assets",
        "no_runtime_bgm",
        "no_game_output",
        "no_public_release",
    )}


def _validate_rights_gate(gate: Mapping[str, Any]) -> dict[str, bool]:
    for key in (
        "r_and_d_training_authorized_for_this_manifest",
        "no_default_asset_or_runtime_use",
        "no_game_or_public_distribution_clearance",
        "requires_new_rights_review_for_scope_expansion",
    ):
        _require_bool(gate, key, label="rights_gate")
    return {key: True for key in (
        "r_and_d_training_authorized_for_this_manifest",
        "no_default_asset_or_runtime_use",
        "no_game_or_public_distribution_clearance",
        "requires_new_rights_review_for_scope_expansion",
    )}


def _validate_file_reference(
    value: Any,
    *,
    label: str,
    expected_schema: str,
    manifest_root: Path,
    verify_files: bool,
) -> dict[str, str]:
    item = _require_mapping(value, label=label)
    relative_path = _safe_relative(item.get("relative_path"), label=f"{label}.relative_path")
    digest = _require_string(item.get("sha256"), label=f"{label}.sha256", pattern=r"[0-9a-f]{64}")
    if item.get("schema") != expected_schema:
        raise ManifestValidationError(f"{label}.schema must be {expected_schema}")
    if not relative_path.endswith(".npz"):
        raise ManifestValidationError(f"{label}.relative_path must name an explicit .npz R&D tensor file")
    if verify_files:
        path = _child(manifest_root, relative_path, label=label)
        if not path.is_file():
            raise ManifestValidationError(f"{label}.relative_path does not exist")
        if _sha256(path) != digest:
            raise ManifestValidationError(f"{label}.sha256 does not match the explicit file")
    return {"relative_path": relative_path, "sha256": digest, "schema": expected_schema}


def _validate_entry(
    value: Any,
    *,
    index: int,
    manifest_root: Path,
    verify_files: bool,
) -> dict[str, Any]:
    entry = _require_mapping(value, label=f"entries[{index}]")
    entry_id = _require_string(entry.get("entry_id"), label=f"entries[{index}].entry_id", pattern=r"[A-Za-z0-9_-]{1,128}")
    entry_gate = _require_mapping(entry.get("entry_gate"), label=f"entries[{index}].entry_gate")
    for key in (
        "r_and_d_only",
        "not_default_asset",
        "not_runtime_bgm",
        "not_game_asset",
        "not_public_distribution",
    ):
        _require_bool(entry_gate, key, label=f"entries[{index}].entry_gate")
    source = _require_mapping(entry.get("source"), label=f"entries[{index}].source")
    source_id = _require_string(source.get("source_id"), label=f"entries[{index}].source.source_id", pattern=r"[A-Za-z0-9_-]{1,128}")
    source_sha = _require_string(source.get("sha256"), label=f"entries[{index}].source.sha256", pattern=r"[0-9a-f]{64}")
    source_relative = _safe_relative(source.get("relative_path"), label=f"entries[{index}].source.relative_path")
    span = _require_mapping(entry.get("native_source_span"), label=f"entries[{index}].native_source_span")
    frame_range = span.get("frame_range")
    if not isinstance(frame_range, list) or len(frame_range) != 2:
        raise ManifestValidationError(f"entries[{index}].native_source_span.frame_range must be [start, end)")
    start = _require_int(frame_range[0], label=f"entries[{index}].native_source_span.start", minimum=0)
    end = _require_int(frame_range[1], label=f"entries[{index}].native_source_span.end", minimum=1)
    if start >= end:
        raise ManifestValidationError(f"entries[{index}].native_source_span.frame_range must be strictly increasing")
    sample_rate = _require_int(span.get("sample_rate_hz"), label=f"entries[{index}].native_source_span.sample_rate_hz", minimum=1)
    _require_bool(span, "single_contiguous_source_frame_span", label=f"entries[{index}].native_source_span")
    _require_bool(span, "not_a_game_asset", label=f"entries[{index}].native_source_span")
    controls = _validate_file_reference(
        entry.get("controls_npz"),
        label=f"entries[{index}].controls_npz",
        expected_schema=CONTROLS_SCHEMA,
        manifest_root=manifest_root,
        verify_files=verify_files,
    )
    target = _validate_file_reference(
        entry.get("target_npz"),
        label=f"entries[{index}].target_npz",
        expected_schema=TARGET_SCHEMA,
        manifest_root=manifest_root,
        verify_files=verify_files,
    )
    if controls["relative_path"] == target["relative_path"]:
        raise ManifestValidationError(f"entries[{index}] must use separate controls_npz and target_npz files")
    return {
        "entry_id": entry_id,
        "source": {
            "source_id": source_id,
            "sha256": source_sha,
            "relative_path": source_relative,
        },
        "native_source_span": {
            "frame_range": [start, end],
            "sample_rate_hz": sample_rate,
            "single_contiguous_source_frame_span": True,
            "not_a_game_asset": True,
        },
        "controls_npz": controls,
        "target_npz": target,
        "entry_gate": {
            "r_and_d_only": True,
            "not_default_asset": True,
            "not_runtime_bgm": True,
            "not_game_asset": True,
            "not_public_distribution": True,
        },
    }


def validate_manifest_file(path: str | Path, *, verify_files: bool = False) -> dict[str, Any]:
    """Validate one explicit R&D corpus manifest and return a stable report.

    ``verify_files`` checks only listed NPZ blobs and their digests.  It does
    not decode source audio, traverse a corpus directory, or perform rights
    interpretation beyond requiring the manifest's explicit project gate.
    """

    manifest_path = Path(path).expanduser().resolve()
    if not manifest_path.is_file():
        raise ManifestValidationError("--manifest must name one readable JSON manifest")
    value = _load_json(manifest_path)
    manifest = _require_mapping(value, label="manifest")
    if manifest.get("schema") != MANIFEST_SCHEMA:
        raise ManifestValidationError(f"manifest.schema must be {MANIFEST_SCHEMA}")
    scope = _validate_scope(_require_mapping(manifest.get("r_and_d_scope"), label="r_and_d_scope"))
    rights = _validate_rights_gate(_require_mapping(manifest.get("rights_gate"), label="rights_gate"))
    instrument = _require_mapping(manifest.get("instrument"), label="instrument")
    instrument_id = _require_string(instrument.get("id"), label="instrument.id", pattern=r"[a-z0-9_-]{1,64}")
    _require_bool(instrument, "sustained", label="instrument")
    if instrument.get("render_family") != "harmonic_noise_source_filter":
        raise ManifestValidationError("instrument.render_family must be harmonic_noise_source_filter")
    entries = manifest.get("entries")
    if not isinstance(entries, list) or not entries:
        raise ManifestValidationError("manifest.entries must be a non-empty explicit list")
    if len(entries) > 10_000:
        raise ManifestValidationError("manifest.entries exceeds the explicit R&D manifest limit")
    validated_entries = [
        _validate_entry(item, index=index, manifest_root=manifest_path.parent, verify_files=verify_files)
        for index, item in enumerate(entries, 1)
    ]
    entry_ids = [item["entry_id"] for item in validated_entries]
    if len(set(entry_ids)) != len(entry_ids):
        raise ManifestValidationError("manifest.entries repeats an entry_id")
    source_spans = [
        (item["source"]["sha256"], tuple(item["native_source_span"]["frame_range"]))
        for item in validated_entries
    ]
    if len(set(source_spans)) != len(source_spans):
        raise ManifestValidationError("manifest.entries repeats an exact source SHA/frame span")
    return {
        "schema": f"{MANIFEST_SCHEMA}.validation-report.v1",
        "manifest_basename": manifest_path.name,
        "manifest_sha256": _sha256(manifest_path),
        "verify_files": bool(verify_files),
        "instrument": {
            "id": instrument_id,
            "sustained": True,
            "render_family": "harmonic_noise_source_filter",
        },
        "r_and_d_scope": scope,
        "rights_gate": rights,
        "entry_count": len(validated_entries),
        "entries": validated_entries,
        "interpretation_limits": {
            "only_explicit_manifest_entries_were_accepted": True,
            "source_audio_not_decoded_or_transformed": True,
            "rights_are_explicit_project_gates_not_inferred_from_filenames_or_metadata": True,
            "not_a_default_asset_or_game_output_authorization": True,
        },
    }
