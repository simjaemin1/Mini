#!/usr/bin/env python3
"""Fail-closed readiness checks for a future isolated MIDI-DDSP transfer R&D run.

There is intentionally no training, installation, download, extraction, audio
decode, MIDI parse, or asset-writing entry point in this tool.  It checks only
an explicitly named legacy WSL runtime, a pinned official weight ZIP by bytes,
a frozen synthesis-only configuration, and a later rights-reviewed derived
feature manifest plus local receipts with a source-disjoint held-out split.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
from typing import Any, Mapping, Sequence


ENVIRONMENT_SCHEMA = "mini.midi-ddsp-transfer-train.legacy-wsl-environment.v1"
DATASET_SCHEMA = "mini.midi-ddsp-transfer-train.approved-dataset.v1"
CONFIG_SCHEMA = "mini.midi-ddsp-transfer-train.daegeum-synthesis-only-config.v1"
REPORT_SCHEMA = "mini.midi-ddsp-transfer-train.readiness-report.v1"
OFFICIAL_WEIGHT_SHA256 = "46bae44c16c3399c24f8f0ba2557fc0432bc12aa23088606d465b22fec2cd05e"
OFFICIAL_WEIGHT_BYTE_LENGTH = 48_429_473
AIHUB_PLATFORM = "AI Hub"
AIHUB_RECOMMENDED_DATASET_ID = "71470"
AIHUB_RECOMMENDED_DATASET_TITLE = "국악 악보 및 음원 데이터"
AIHUB_REPORTED_DAEGEUM_CLIP_COUNT = 900
EXPECTED_DISTRIBUTIONS = {
    "tensorflow": "2.7.0",
    "ddsp": "3.2.0",
    "midi-ddsp": "0.2.6",
    "tensorflow-addons": "0.15.0",
    "tensorflow-probability": "0.15.0",
    "tensorflow-datasets": "4.5.2",
    "numpy": "1.21.6",
    "protobuf": "3.20.3",
    "note-seq": "0.0.3",
    "crepe": "0.0.12",
    "pretty-midi": "0.2.10",
}
EXPECTED_MEMORY_PROFILE = {
    "gpu_memory_class": "8GiB",
    "batch_size_per_gpu": 1,
    "gradient_accumulation_steps": 8,
    "effective_batch_size": 8,
    "max_sequence_frames": 1000,
    "frame_rate_hz": 250,
    "mixed_precision": False,
    "gradient_checkpointing": False,
}
_SHA256 = re.compile(r"[0-9a-f]{64}")
_IDENTIFIER = re.compile(r"[A-Za-z0-9_-]{1,128}")
_RECEIPT_SUFFIXES = frozenset({".json", ".txt", ".html", ".pdf"})


class TransferReadinessError(RuntimeError):
    """A static training prerequisite is absent, broad, or internally inconsistent."""


def default_tool_directory() -> Path:
    return Path(__file__).resolve().parent


def default_environment_lock() -> Path:
    return default_tool_directory() / "wsl_py38_tf27_environment.lock.json"


def default_fine_tune_config() -> Path:
    return default_tool_directory() / "daegeum_synthesis_only_finetune_config.json"


def _load_json(path: Path, *, label: str) -> Mapping[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise TransferReadinessError(f"{label} does not exist") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise TransferReadinessError(f"{label} is not valid UTF-8 JSON") from exc
    if not isinstance(value, Mapping):
        raise TransferReadinessError(f"{label} must be a JSON object")
    return value


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _require_mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise TransferReadinessError(f"{label} must be an object")
    return value


def _require_true(value: Mapping[str, Any], key: str, *, label: str) -> None:
    if value.get(key) is not True:
        raise TransferReadinessError(f"{label}.{key} must explicitly be true")


def _require_false(value: Mapping[str, Any], key: str, *, label: str) -> None:
    if value.get(key) is not False:
        raise TransferReadinessError(f"{label}.{key} must explicitly be false")


def _require_string(value: Any, *, label: str, pattern: re.Pattern[str] | None = None) -> str:
    if not isinstance(value, str) or not value:
        raise TransferReadinessError(f"{label} must be a non-empty string")
    if pattern is not None and pattern.fullmatch(value) is None:
        raise TransferReadinessError(f"{label} has an invalid format")
    return value


def _require_int(value: Any, *, label: str, minimum: int | None = None) -> int:
    if type(value) is not int:
        raise TransferReadinessError(f"{label} must be an integer")
    if minimum is not None and value < minimum:
        raise TransferReadinessError(f"{label} is below its permitted range")
    return value


def _safe_relative(value: Any, *, label: str, suffix: str) -> str:
    raw = _require_string(value, label=label)
    if "\\" in raw or ":" in raw:
        raise TransferReadinessError(f"{label} must be a POSIX relative path")
    parsed = PurePosixPath(raw)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise TransferReadinessError(f"{label} is not a safe relative path")
    if parsed.suffix.lower() != suffix:
        raise TransferReadinessError(f"{label} must name an explicit {suffix} feature archive")
    return parsed.as_posix()


def _safe_rights_receipt_relative(value: Any, *, label: str) -> str:
    """Accept an explicitly scoped local receipt, but never a source-media path."""

    raw = _require_string(value, label=label)
    if "\\" in raw or ":" in raw:
        raise TransferReadinessError(f"{label} must be a POSIX relative path")
    parsed = PurePosixPath(raw)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise TransferReadinessError(f"{label} is not a safe relative path")
    if not parsed.parts or parsed.parts[0] != "rights" or parsed.suffix.lower() not in _RECEIPT_SUFFIXES:
        raise TransferReadinessError(f"{label} must be a rights/ JSON, TXT, HTML, or PDF receipt")
    return parsed.as_posix()


def _child(root: Path, relative: str, *, label: str) -> Path:
    candidate = (root / PurePosixPath(relative)).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise TransferReadinessError(f"{label} escapes the manifest directory") from exc
    return candidate


def _validate_rights_receipt(
    value: Any,
    *,
    label: str,
    manifest_root: Path,
    verify_receipt_hash: bool,
) -> dict[str, Any]:
    """Hash one user-held receipt when requested; never parse it as a licence opinion."""

    receipt = _require_mapping(value, label=label)
    relative = _safe_rights_receipt_relative(receipt.get("relative_path"), label=f"{label}.relative_path")
    digest = _require_string(receipt.get("sha256"), label=f"{label}.sha256", pattern=_SHA256)
    byte_length = _require_int(receipt.get("byte_length"), label=f"{label}.byte_length", minimum=1)
    if verify_receipt_hash:
        receipt_path = _child(manifest_root, relative, label=label)
        if not receipt_path.is_file():
            raise TransferReadinessError(f"{label}.relative_path does not name a local user-held receipt")
        if receipt_path.stat().st_size != byte_length or _sha256_file(receipt_path) != digest:
            raise TransferReadinessError(f"{label} byte length or SHA-256 does not match the local receipt")
    return {"relative_path": relative, "sha256": digest, "byte_length": byte_length}


def _validate_exact_mapping(
    value: Mapping[str, Any], expected: Mapping[str, Any], *, label: str
) -> dict[str, Any]:
    for key, expected_value in expected.items():
        if value.get(key) != expected_value:
            raise TransferReadinessError(f"{label}.{key} must equal the pinned value {expected_value!r}")
    return {key: expected[key] for key in expected}


def validate_environment_lock(path: str | Path) -> dict[str, Any]:
    """Validate the immutable-by-contract Python 3.8/TF 2.7 WSL profile."""

    lock_path = Path(path).expanduser().resolve()
    lock = _load_json(lock_path, label="environment lock")
    if lock.get("schema") != ENVIRONMENT_SCHEMA:
        raise TransferReadinessError(f"environment lock.schema must be {ENVIRONMENT_SCHEMA}")
    python = _require_mapping(lock.get("python"), label="environment lock.python")
    if python.get("major") != 3 or python.get("minor") != 8:
        raise TransferReadinessError("environment lock requires exactly Python 3.8")
    _require_true(python, "venv_only", label="environment lock.python")
    _require_true(python, "system_python_must_not_be_modified", label="environment lock.python")
    host = _require_mapping(lock.get("host"), label="environment lock.host")
    if host.get("required_platform") != "linux-wsl2":
        raise TransferReadinessError("environment lock.host.required_platform must be linux-wsl2")
    if host.get("expected_gpu_name_substring") != "RTX 4060":
        raise TransferReadinessError("environment lock must target RTX 4060 exactly")
    if host.get("minimum_vram_mib") != 7600:
        raise TransferReadinessError("environment lock must require at least 7600 MiB for the 8GiB profile")
    if host.get("legacy_tensorflow_cuda") != "11.2" or host.get("legacy_tensorflow_cudnn") != "8.1":
        raise TransferReadinessError("environment lock must pin TensorFlow 2.7 CUDA 11.2/cuDNN 8.1")
    distributions = _require_mapping(lock.get("distributions"), label="environment lock.distributions")
    if dict(distributions) != EXPECTED_DISTRIBUTIONS:
        raise TransferReadinessError("environment lock.distributions must equal the complete pinned legacy package set")
    limits = _require_mapping(lock.get("interpretation_limits"), label="environment lock.interpretation_limits")
    for key in (
        "no_automatic_install_or_download",
        "package_versions_are_runtime_compatibility_gates_not_weight_or_data_rights",
        "legacy_runtime_is_rnd_only",
    ):
        _require_true(limits, key, label="environment lock.interpretation_limits")
    return {
        "schema": ENVIRONMENT_SCHEMA,
        "python": {"major": 3, "minor": 8, "venv_only": True},
        "host": {
            "required_platform": "linux-wsl2",
            "expected_gpu_name_substring": "RTX 4060",
            "minimum_vram_mib": 7600,
            "legacy_tensorflow_cuda": "11.2",
            "legacy_tensorflow_cudnn": "8.1",
        },
        "distributions": dict(EXPECTED_DISTRIBUTIONS),
    }


def validate_fine_tune_config(path: str | Path) -> dict[str, Any]:
    """Reject any config that could silently unfreeze expression or exceed 8GiB scaffolding."""

    config_path = Path(path).expanduser().resolve()
    config = _load_json(config_path, label="fine-tune config")
    if config.get("schema") != CONFIG_SCHEMA:
        raise TransferReadinessError(f"fine-tune config.schema must be {CONFIG_SCHEMA}")
    if config.get("execution_mode") != "scaffold_only_no_training_entrypoint":
        raise TransferReadinessError("fine-tune config must remain scaffold-only")
    lineage = _require_mapping(config.get("model_lineage"), label="fine-tune config.model_lineage")
    if lineage.get("official_weight_archive_sha256") != OFFICIAL_WEIGHT_SHA256:
        raise TransferReadinessError("fine-tune config must name the audited official weight archive SHA-256")
    if lineage.get("official_inference_baseline") != "tools/midi-ddsp-runtime/run_official_flute_rnd.py":
        raise TransferReadinessError("fine-tune config must retain the audited official FLUTE R&D runner as its baseline")
    seed = _require_mapping(lineage.get("pretrained_conditioning_seed"), label="fine-tune config.model_lineage.pretrained_conditioning_seed")
    if seed.get("instrument_name") != "flute" or seed.get("midi_ddsp_instrument_id") != 4:
        raise TransferReadinessError("fine-tune config must record official FLUTE ID 4 as initialization only")
    weight_terms = _require_mapping(config.get("official_weight_terms"), label="fine-tune config.official_weight_terms")
    _require_false(
        weight_terms,
        "license_or_game_distribution_clearance_established",
        label="fine-tune config.official_weight_terms",
    )
    _require_true(
        weight_terms,
        "r_and_d_use_requires_separate_terms_review",
        label="fine-tune config.official_weight_terms",
    )
    _require_true(
        weight_terms,
        "no_game_or_public_distribution_approval_from_byte_hash",
        label="fine-tune config.official_weight_terms",
    )
    source_contract = _require_mapping(
        config.get("approved_data_source_contract"), label="fine-tune config.approved_data_source_contract"
    )
    if (
        source_contract.get("recommended_candidate_platform") != AIHUB_PLATFORM
        or source_contract.get("recommended_candidate_dataset_id") != AIHUB_RECOMMENDED_DATASET_ID
        or source_contract.get("recommended_candidate_dataset_title") != AIHUB_RECOMMENDED_DATASET_TITLE
        or source_contract.get("reported_daegeum_clip_count") != AIHUB_REPORTED_DAEGEUM_CLIP_COUNT
    ):
        raise TransferReadinessError("fine-tune config must retain the AI Hub 71470 Daegeum candidate-data boundary")
    for key in (
        "ngc_192_forbidden_without_new_permission_review",
        "local_download_and_terms_receipts_required",
        "attribution_plan_required",
        "raw_source_media_not_read_by_readiness_tool",
    ):
        _require_true(source_contract, key, label="fine-tune config.approved_data_source_contract")
    target = _require_mapping(config.get("target"), label="fine-tune config.target")
    if target.get("instrument_label") != "daegeum" or target.get("sustained_instrument") is not True:
        raise TransferReadinessError("fine-tune config must target sustained Daegeum")
    freeze = _require_mapping(config.get("freeze_policy"), label="fine-tune config.freeze_policy")
    if freeze.get("frozen_components") != ["expression_generator"]:
        raise TransferReadinessError("expression_generator must be the only declared frozen component")
    if freeze.get("trainable_components") != ["synthesis_generator"]:
        raise TransferReadinessError("only synthesis_generator may be trainable")
    _require_true(freeze, "expression_generator_optimizer_state_forbidden", label="fine-tune config.freeze_policy")
    _require_true(freeze, "expression_generator_gradient_forbidden", label="fine-tune config.freeze_policy")
    memory = _require_mapping(config.get("memory_profile"), label="fine-tune config.memory_profile")
    _validate_exact_mapping(memory, EXPECTED_MEMORY_PROFILE, label="fine-tune config.memory_profile")
    evaluation = _require_mapping(config.get("evaluation_policy"), label="fine-tune config.evaluation_policy")
    for key in (
        "held_out_split_required",
        "source_record_overlap_between_train_and_held_out_forbidden",
        "held_out_examples_must_not_drive_optimizer",
        "release_requires_separate_listening_and_rights_review",
    ):
        _require_true(evaluation, key, label="fine-tune config.evaluation_policy")
    scope = _require_mapping(config.get("r_and_d_scope"), label="fine-tune config.r_and_d_scope")
    for key in (
        "r_and_d_only",
        "no_default_assets",
        "no_runtime_bgm",
        "no_game_output",
        "no_public_release",
        "no_ngc_or_unapproved_source",
    ):
        _require_true(scope, key, label="fine-tune config.r_and_d_scope")
    return {
        "schema": CONFIG_SCHEMA,
        "target_instrument": "daegeum",
        "initialization_condition": "official_flute_id_4_only",
        "frozen_components": ["expression_generator"],
        "trainable_components": ["synthesis_generator"],
        "memory_profile": dict(EXPECTED_MEMORY_PROFILE),
        "held_out_split_required": True,
        "scaffold_only_no_training_entrypoint": True,
        "official_weight_game_or_distribution_clearance_established": False,
        "approved_candidate_dataset": f"AI Hub {AIHUB_RECOMMENDED_DATASET_ID}",
    }


def _validate_dataset_scope(scope: Mapping[str, Any]) -> dict[str, bool]:
    keys = (
        "r_and_d_only",
        "only_explicit_derived_feature_entries",
        "no_ngc_or_unapproved_source",
        "no_default_assets",
        "no_runtime_bgm",
        "no_game_output",
        "no_public_release",
    )
    for key in keys:
        _require_true(scope, key, label="dataset manifest.r_and_d_scope")
    return {key: True for key in keys}


def _validate_dataset_rights(rights: Mapping[str, Any]) -> dict[str, bool]:
    keys = (
        "r_and_d_training_authorized_for_this_transfer_manifest",
        "paired_source_rights_review_completed_for_this_transfer_manifest",
        "derived_feature_use_authorized_for_this_transfer_manifest",
        "pretrained_weight_terms_reviewed_for_this_r_and_d_experiment",
        "no_default_asset_or_runtime_use",
        "no_game_or_public_distribution_clearance",
        "requires_new_rights_review_for_scope_expansion",
    )
    for key in keys:
        _require_true(rights, key, label="dataset manifest.rights_gate")
    return {key: True for key in keys}


def _validate_aihub_71470_provenance(
    value: Any,
    *,
    manifest_root: Path,
    verify_receipt_hashes: bool,
) -> dict[str, Any]:
    """Require local proof for the sole candidate corpus without deciding its legal effect."""

    provenance = _require_mapping(value, label="dataset manifest.source_provenance")
    if (
        provenance.get("platform") != AIHUB_PLATFORM
        or provenance.get("dataset_id") != AIHUB_RECOMMENDED_DATASET_ID
        or provenance.get("dataset_title") != AIHUB_RECOMMENDED_DATASET_TITLE
        or provenance.get("reported_daegeum_clip_count") != AIHUB_REPORTED_DAEGEUM_CLIP_COUNT
    ):
        raise TransferReadinessError("dataset manifest must identify the reviewed AI Hub 71470 candidate exactly")
    for key in (
        "candidate_only_not_release_clearance",
        "raw_wav_midi_and_sigimsae_not_read_by_readiness_tool",
        "ngc_192_not_used",
        "attribution_plan_recorded",
        "commercial_or_game_release_not_cleared_by_repository",
    ):
        _require_true(provenance, key, label="dataset manifest.source_provenance")
    attribution = _require_string(
        provenance.get("attribution_plan"), label="dataset manifest.source_provenance.attribution_plan"
    )
    download_receipt = _validate_rights_receipt(
        provenance.get("local_download_receipt"),
        label="dataset manifest.source_provenance.local_download_receipt",
        manifest_root=manifest_root,
        verify_receipt_hash=verify_receipt_hashes,
    )
    terms_receipt = _validate_rights_receipt(
        provenance.get("local_terms_faq_receipt"),
        label="dataset manifest.source_provenance.local_terms_faq_receipt",
        manifest_root=manifest_root,
        verify_receipt_hash=verify_receipt_hashes,
    )
    if download_receipt["relative_path"] == terms_receipt["relative_path"]:
        raise TransferReadinessError("download and terms/FAQ receipts must be distinct local records")
    return {
        "platform": AIHUB_PLATFORM,
        "dataset_id": AIHUB_RECOMMENDED_DATASET_ID,
        "dataset_title": AIHUB_RECOMMENDED_DATASET_TITLE,
        "reported_daegeum_clip_count": AIHUB_REPORTED_DAEGEUM_CLIP_COUNT,
        "attribution_plan": attribution,
        "local_download_receipt": download_receipt,
        "local_terms_faq_receipt": terms_receipt,
        "receipt_hashes_verified": bool(verify_receipt_hashes),
        "interpretation_limits": {
            "receipt_bytes_identified_but_not_legally_interpreted_by_tool": True,
            "commercial_or_game_release_not_cleared_by_repository": True,
        },
    }


def _validate_feature_reference(
    value: Any,
    *,
    label: str,
    manifest_root: Path,
    verify_feature_hashes: bool,
    repository_root: Path,
) -> dict[str, Any]:
    reference = _require_mapping(value, label=label)
    relative = _safe_relative(reference.get("relative_path"), label=f"{label}.relative_path", suffix=".npz")
    digest = _require_string(reference.get("sha256"), label=f"{label}.sha256", pattern=_SHA256)
    byte_length = _require_int(reference.get("byte_length"), label=f"{label}.byte_length", minimum=1)
    if reference.get("schema") != "mini.midi-ddsp-transfer-train.derived-feature.v1":
        raise TransferReadinessError(f"{label}.schema must identify an approved derived feature archive")
    if verify_feature_hashes:
        feature_path = _child(manifest_root, relative, label=label)
        if not feature_path.is_file():
            raise TransferReadinessError(f"{label}.relative_path does not name a local derived feature archive")
        default_assets = (repository_root / "public" / "assets").resolve()
        try:
            feature_path.relative_to(default_assets)
        except ValueError:
            pass
        else:
            raise TransferReadinessError(f"{label} must not reference a public/assets file")
        if feature_path.stat().st_size != byte_length or _sha256_file(feature_path) != digest:
            raise TransferReadinessError(f"{label} byte length or SHA-256 does not match the explicit feature archive")
    return {"relative_path": relative, "sha256": digest, "byte_length": byte_length}


def validate_approved_dataset_manifest(
    path: str | Path,
    *,
    verify_feature_hashes: bool,
    repository_root: str | Path | None = None,
) -> dict[str, Any]:
    """Validate one explicit derived-feature manifest without opening raw source media."""

    manifest_path = Path(path).expanduser().resolve()
    manifest = _load_json(manifest_path, label="dataset manifest")
    if manifest.get("schema") != DATASET_SCHEMA:
        raise TransferReadinessError(f"dataset manifest.schema must be {DATASET_SCHEMA}")
    manifest_root = manifest_path.parent.resolve()
    scope = _validate_dataset_scope(_require_mapping(manifest.get("r_and_d_scope"), label="dataset manifest.r_and_d_scope"))
    rights = _validate_dataset_rights(_require_mapping(manifest.get("rights_gate"), label="dataset manifest.rights_gate"))
    provenance = _validate_aihub_71470_provenance(
        manifest.get("source_provenance"),
        manifest_root=manifest_root,
        verify_receipt_hashes=verify_feature_hashes,
    )
    instrument = _require_mapping(manifest.get("instrument"), label="dataset manifest.instrument")
    if instrument.get("id") != "daegeum" or instrument.get("sustained") is not True:
        raise TransferReadinessError("dataset manifest must be explicitly Daegeum/sustained")
    _require_true(instrument, "approved_for_this_synthesis_only_transfer_experiment", label="dataset manifest.instrument")
    entries = manifest.get("entries")
    if not isinstance(entries, list) or not entries:
        raise TransferReadinessError("dataset manifest.entries must be a non-empty explicit list")
    if len(entries) > 10_000:
        raise TransferReadinessError("dataset manifest.entries exceeds the bounded R&D limit")
    repo_root = Path(repository_root).resolve() if repository_root is not None else Path(__file__).resolve().parents[2]
    validated: list[dict[str, Any]] = []
    for index, raw_entry in enumerate(entries, 1):
        entry = _require_mapping(raw_entry, label=f"dataset manifest.entries[{index}]")
        forbidden_raw_media_keys = {"audio_wav", "source_wav", "performance_midi", "annotation_json"} & set(entry)
        if forbidden_raw_media_keys:
            raise TransferReadinessError("dataset manifest must reference derived features only, never raw WAV/MIDI/annotation files")
        entry_id = _require_string(entry.get("entry_id"), label=f"entries[{index}].entry_id", pattern=_IDENTIFIER)
        source_record_id = _require_string(
            entry.get("source_record_id"), label=f"entries[{index}].source_record_id", pattern=_IDENTIFIER
        )
        split = entry.get("split")
        if split not in {"train", "held_out"}:
            raise TransferReadinessError(f"entries[{index}].split must be train or held_out")
        entry_gate = _require_mapping(entry.get("entry_gate"), label=f"entries[{index}].entry_gate")
        for key in (
            "r_and_d_only",
            "approved_for_this_transfer_manifest",
            "not_default_asset",
            "not_runtime_bgm",
            "not_game_asset",
            "not_public_distribution",
        ):
            _require_true(entry_gate, key, label=f"entries[{index}].entry_gate")
        controls = _validate_feature_reference(
            entry.get("controls_npz"),
            label=f"entries[{index}].controls_npz",
            manifest_root=manifest_root,
            verify_feature_hashes=verify_feature_hashes,
            repository_root=repo_root,
        )
        target = _validate_feature_reference(
            entry.get("target_npz"),
            label=f"entries[{index}].target_npz",
            manifest_root=manifest_root,
            verify_feature_hashes=verify_feature_hashes,
            repository_root=repo_root,
        )
        if controls["relative_path"] == target["relative_path"]:
            raise TransferReadinessError(f"entries[{index}] must use distinct controls and target feature archives")
        validated.append(
            {
                "entry_id": entry_id,
                "source_record_id": source_record_id,
                "split": split,
                "controls_npz": controls,
                "target_npz": target,
            }
        )
    entry_ids = [item["entry_id"] for item in validated]
    if len(entry_ids) != len(set(entry_ids)):
        raise TransferReadinessError("dataset manifest repeats entry_id")
    train = [item for item in validated if item["split"] == "train"]
    held_out = [item for item in validated if item["split"] == "held_out"]
    if not train or not held_out:
        raise TransferReadinessError("dataset manifest requires at least one train and one held_out entry")
    overlap = {item["source_record_id"] for item in train} & {item["source_record_id"] for item in held_out}
    if overlap:
        raise TransferReadinessError("source_record_id must not overlap between train and held_out")
    feature_paths = [
        reference["relative_path"]
        for entry in validated
        for reference in (entry["controls_npz"], entry["target_npz"])
    ]
    if len(feature_paths) != len(set(feature_paths)):
        raise TransferReadinessError("dataset manifest reuses one derived feature archive across entries")
    return {
        "schema": f"{DATASET_SCHEMA}.validation-report.v1",
        "manifest_basename": manifest_path.name,
        "manifest_sha256": _sha256_file(manifest_path),
        "verify_feature_hashes": bool(verify_feature_hashes),
        "instrument": {"id": "daegeum", "sustained": True},
        "r_and_d_scope": scope,
        "rights_gate": rights,
        "source_provenance": provenance,
        "entry_count": len(validated),
        "split_counts": {"train": len(train), "held_out": len(held_out)},
        "source_record_overlap_between_train_and_held_out": False,
        "interpretation_limits": {
            "raw_audio_midi_and_annotation_not_opened": True,
            "only_explicit_derived_feature_paths_and_local_receipts_were_hash_checked": bool(verify_feature_hashes),
            "rights_gates_are_project_attestations_not_external_legal_proof": True,
            "not_a_training_or_distribution_authorization_beyond_declared_rnd_scope": True,
        },
    }


def verify_official_weight_archive(path: str | Path) -> dict[str, Any]:
    """Stream-hash an already present ZIP; never unzip, import, or execute it."""

    archive = Path(path).expanduser().resolve()
    if not archive.is_file() or archive.suffix.lower() != ".zip":
        raise TransferReadinessError("official weight archive must be one explicit local .zip file")
    byte_length = archive.stat().st_size
    digest = _sha256_file(archive)
    return {
        "archive_basename": archive.name,
        "byte_length": byte_length,
        "sha256": digest,
        "byte_length_match": byte_length == OFFICIAL_WEIGHT_BYTE_LENGTH,
        "sha256_match": digest == OFFICIAL_WEIGHT_SHA256,
        "verified_exact_official_archive": byte_length == OFFICIAL_WEIGHT_BYTE_LENGTH and digest == OFFICIAL_WEIGHT_SHA256,
        "extracted": False,
        "checkpoint_loaded": False,
        "interpretation_limit": "Exact bytes identify the audited archive only; they do not establish pretrained-weight game/distribution rights.",
    }


def probe_runtime(python_executable: str | Path) -> dict[str, Any]:
    """Ask one named interpreter for pinned versions/GPU visibility without installing anything."""

    executable = Path(python_executable).expanduser()
    result: dict[str, Any] = {"python_requested": executable.name, "probe_succeeded": False}
    if not executable.is_file():
        result["reason"] = "named Python executable is absent"
        return result
    probe = r'''
import importlib.metadata
import json
import os
import platform
import subprocess
import sys

names = ["tensorflow", "ddsp", "midi-ddsp", "tensorflow-addons", "tensorflow-probability", "tensorflow-datasets", "numpy", "protobuf", "note-seq", "crepe", "pretty-midi"]
versions = {}
for name in names:
    try:
        versions[name] = importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        versions[name] = None
payload = {
    "python_version": list(sys.version_info[:3]),
    "platform_system": platform.system().lower(),
    "platform_release": platform.release().lower(),
    "wsl_detected": False,
    "distributions": versions,
    "tensorflow_import_succeeded": False,
    "tensorflow_gpu_devices": [],
    "pip_check_succeeded": False,
}
try:
    with open("/proc/version", "r", encoding="utf-8", errors="ignore") as stream:
        proc_version = stream.read().lower()
except OSError:
    proc_version = ""
payload["wsl_detected"] = "microsoft" in payload["platform_release"] or "wsl" in payload["platform_release"] or "microsoft" in proc_version
try:
    pip_check = subprocess.run([sys.executable, "-m", "pip", "check"], capture_output=True, text=True, timeout=30, check=False)
    payload["pip_check_succeeded"] = pip_check.returncode == 0
    if pip_check.returncode != 0:
        payload["pip_check_error"] = (pip_check.stdout + pip_check.stderr).strip()[-400:]
except BaseException as exc:
    payload["pip_check_error"] = type(exc).__name__ + ": " + str(exc)[:240]
try:
    import tensorflow as tf
    payload["tensorflow_import_succeeded"] = True
    payload["tensorflow_gpu_devices"] = [device.name for device in tf.config.list_physical_devices("GPU")]
except BaseException as exc:
    payload["tensorflow_import_error"] = type(exc).__name__ + ": " + str(exc)[:240]
print(json.dumps(payload, sort_keys=True))
'''
    try:
        completed = subprocess.run(
            [str(executable), "-c", probe], capture_output=True, text=True, timeout=45, check=False
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        result["reason"] = f"runtime probe failed: {type(exc).__name__}"
        return result
    if completed.returncode != 0:
        result["reason"] = "runtime probe returned non-zero"
        result["stderr"] = completed.stderr.strip()[-400:]
        return result
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        result["reason"] = "runtime probe emitted non-JSON output"
        return result
    if not isinstance(payload, Mapping):
        result["reason"] = "runtime probe JSON was not an object"
        return result
    result.update(payload)
    result["probe_succeeded"] = True
    return result


def validate_runtime_probe(probe: Mapping[str, Any]) -> list[str]:
    """Return all environment blockers, never reinterpret a partial probe as ready."""

    blockers: list[str] = []
    if probe.get("probe_succeeded") is not True:
        return [str(probe.get("reason", "Python runtime probe did not succeed"))]
    if probe.get("python_version", [])[:2] != [3, 8]:
        blockers.append("runtime Python must be exactly 3.8")
    if probe.get("platform_system") != "linux" or probe.get("wsl_detected") is not True:
        blockers.append("runtime must be an actual WSL2 Linux environment")
    distributions = probe.get("distributions")
    if not isinstance(distributions, Mapping):
        blockers.append("runtime did not report installed distributions")
    else:
        for package, expected_version in EXPECTED_DISTRIBUTIONS.items():
            if distributions.get(package) != expected_version:
                blockers.append(f"{package} must equal pinned version {expected_version}")
    if probe.get("tensorflow_import_succeeded") is not True:
        blockers.append("TensorFlow 2.7 import must succeed")
    if not isinstance(probe.get("tensorflow_gpu_devices"), list) or not probe.get("tensorflow_gpu_devices"):
        blockers.append("TensorFlow must expose at least one GPU device")
    if probe.get("pip_check_succeeded") is not True:
        blockers.append("the isolated legacy venv must pass pip check without dependency conflicts")
    return blockers


def probe_nvidia_smi(executable: str | Path) -> dict[str, Any]:
    """Query one explicit nvidia-smi path; no driver state is changed."""

    command = str(Path(executable).expanduser())
    try:
        completed = subprocess.run(
            [command, "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"probe_succeeded": False, "reason": f"nvidia-smi probe failed: {type(exc).__name__}", "gpus": []}
    if completed.returncode != 0:
        return {"probe_succeeded": False, "reason": "nvidia-smi returned non-zero", "gpus": []}
    gpus: list[dict[str, Any]] = []
    for line in completed.stdout.splitlines():
        parts = [part.strip() for part in line.split(",")]
        if len(parts) != 3:
            return {"probe_succeeded": False, "reason": "nvidia-smi emitted an unrecognized inventory line", "gpus": []}
        memory_match = re.fullmatch(r"(\d+)\s+MiB", parts[1])
        if memory_match is None:
            return {"probe_succeeded": False, "reason": "nvidia-smi did not report memory in MiB", "gpus": []}
        gpus.append({"name": parts[0], "memory_mib": int(memory_match.group(1)), "driver_version": parts[2]})
    return {"probe_succeeded": True, "gpus": gpus}


def validate_cuda_inventory(inventory: Mapping[str, Any]) -> list[str]:
    if inventory.get("probe_succeeded") is not True:
        return [str(inventory.get("reason", "nvidia-smi inventory failed"))]
    gpus = inventory.get("gpus")
    if not isinstance(gpus, list) or not gpus:
        return ["nvidia-smi must report at least one GPU"]
    for gpu in gpus:
        if not isinstance(gpu, Mapping):
            continue
        if "rtx 4060" in str(gpu.get("name", "")).lower() and int(gpu.get("memory_mib", 0)) >= 7600:
            return []
    return ["an RTX 4060 with at least 7600 MiB must be visible through nvidia-smi"]


def build_readiness_report(
    *,
    mode: str,
    environment_lock: Path,
    fine_tune_config: Path,
    runtime_python: Path,
    nvidia_smi: Path,
    official_weight_zip: Path | None,
    dataset_manifest: Path | None,
    repository_root: Path,
) -> dict[str, Any]:
    """Build a non-mutating readiness report for `--check` or `--dry-run`."""

    if mode not in {"check", "dry-run"}:
        raise TransferReadinessError("mode must be check or dry-run")
    blockers: list[str] = []
    try:
        lock = validate_environment_lock(environment_lock)
    except TransferReadinessError as exc:
        lock = {"valid": False}
        blockers.append(str(exc))
    try:
        config = validate_fine_tune_config(fine_tune_config)
    except TransferReadinessError as exc:
        config = {"valid": False}
        blockers.append(str(exc))
    runtime = probe_runtime(runtime_python)
    blockers.extend(validate_runtime_probe(runtime))
    inventory = probe_nvidia_smi(nvidia_smi)
    blockers.extend(validate_cuda_inventory(inventory))
    weights: dict[str, Any] | None = None
    if official_weight_zip is not None:
        try:
            weights = verify_official_weight_archive(official_weight_zip)
            if weights["verified_exact_official_archive"] is not True:
                blockers.append("official weight ZIP does not match the pinned audited byte identity")
        except TransferReadinessError as exc:
            blockers.append(str(exc))
    else:
        blockers.append("one explicit official weight ZIP is required")
    dataset: dict[str, Any] | None = None
    if mode == "dry-run":
        if dataset_manifest is None:
            blockers.append("--dry-run requires one explicit rights-reviewed derived-feature manifest")
        else:
            try:
                dataset = validate_approved_dataset_manifest(
                    dataset_manifest, verify_feature_hashes=True, repository_root=repository_root
                )
            except TransferReadinessError as exc:
                blockers.append(str(exc))
    elif dataset_manifest is not None:
        try:
            dataset = validate_approved_dataset_manifest(
                dataset_manifest, verify_feature_hashes=False, repository_root=repository_root
            )
        except TransferReadinessError as exc:
            blockers.append(str(exc))
    unique_blockers = list(dict.fromkeys(blockers))
    return {
        "schema": REPORT_SCHEMA,
        "mode": mode,
        "ready_for_a_future_training_invocation": not unique_blockers,
        "blockers": unique_blockers,
        "environment_lock": lock,
        "fine_tune_config": config,
        "runtime_probe": runtime,
        "cuda_inventory": inventory,
        "official_weight_archive": weights,
        "approved_dataset": dataset,
        "actions_performed": {
            "package_install_or_download": False,
            "checkpoint_extracted_or_loaded": False,
            "model_training": False,
            "raw_audio_midi_or_ngc_read": False,
            "default_bgm_changed": False,
        },
        "interpretation_limits": {
            "dry_run_is_not_training": True,
            "rights_gates_are_not_external_legal_proof": True,
            "verified_weight_bytes_do_not_establish_game_or_distribution_rights": True,
            "a_ready_report_does_not_validate_a_daegeum_renderer": True,
        },
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="Read-only WSL/Python/CUDA/weight readiness check")
    group.add_argument("--dry-run", action="store_true", help="Read-only full check including approved derived-feature manifest")
    parser.add_argument("--runtime-python", type=Path, required=True, help="Python inside the isolated WSL Python 3.8 venv")
    parser.add_argument("--nvidia-smi", type=Path, required=True, help="Explicit nvidia-smi executable inside WSL")
    parser.add_argument("--official-weight-zip", type=Path, help="Already-obtained official MIDI-DDSP weight ZIP")
    parser.add_argument("--dataset-manifest", type=Path, help="One later rights-reviewed derived-feature manifest")
    parser.add_argument("--fine-tune-config", type=Path, default=default_fine_tune_config())
    parser.add_argument("--environment-lock", type=Path, default=default_environment_lock())
    parser.add_argument("--repository-root", type=Path, default=Path(__file__).resolve().parents[2])
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    mode = "dry-run" if args.dry_run else "check"
    try:
        report = build_readiness_report(
            mode=mode,
            environment_lock=args.environment_lock,
            fine_tune_config=args.fine_tune_config,
            runtime_python=args.runtime_python,
            nvidia_smi=args.nvidia_smi,
            official_weight_zip=args.official_weight_zip,
            dataset_manifest=args.dataset_manifest,
            repository_root=args.repository_root,
        )
    except TransferReadinessError as exc:
        print(f"transfer-readiness: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ready_for_a_future_training_invocation"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
