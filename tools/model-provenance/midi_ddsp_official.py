#!/usr/bin/env python3
"""Verify the one official MIDI-DDSP pretrained-weight archive without running it.

This verifier is intentionally narrower than an installer.  It does not
download, import TensorFlow, unzip to disk, instantiate a checkpoint, or
render audio.  Given an already-obtained archive, it streams every ZIP member
to compute hashes and writes a path-safe provenance report.  The report keeps
the important distinction between byte provenance and a licence grant: this
audit found Apache-2.0 code on the repository's main branch, but no explicit
licence file in the separate ``models`` branch or ZIP payload.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
from typing import Any, Mapping, Sequence
import zipfile


SCHEMA = "durango.model-provenance.midi-ddsp-official.v1"
TOOL_ID = "midi-ddsp-official-provenance"
COPY_BUFFER_BYTES = 1024 * 1024

# The following constants were independently checked against the official
# Magenta repository on 2026-09-25.  ``git_blob_sha1`` is Git's blob object id,
# not a SHA-256 claim.  The SHA-256 values below are the actual archive/member
# bytes obtained from the immutable commit URL.
OFFICIAL = {
    "repository": {
        "url": "https://github.com/magenta/midi-ddsp",
        "main_commit": "d7af42704a63b47267ae6a1bc0fee1ed7dc5c855",
        "models_commit": "d466030e5a7dce7e71917775ae3e7d5088e840e5",
        "models_git_blob_sha1": "976ee765cde0884c55170ac51844d75e891f38b0",
        "archived": True,
    },
    "weight_download": {
        "declared_downloader_url": "https://github.com/magenta/midi-ddsp/raw/models/midi_ddsp_model_weights_urmp_9_10.zip",
        "resolved_branch_url": "https://raw.githubusercontent.com/magenta/midi-ddsp/models/midi_ddsp_model_weights_urmp_9_10.zip",
        "immutable_commit_url": "https://raw.githubusercontent.com/magenta/midi-ddsp/d466030e5a7dce7e71917775ae3e7d5088e840e5/midi_ddsp_model_weights_urmp_9_10.zip",
        "archive_filename": "midi_ddsp_model_weights_urmp_9_10.zip",
        "byte_length": 48_429_473,
        "sha256": "46bae44c16c3399c24f8f0ba2557fc0432bc12aa23088606d465b22fec2cd05e",
        "observed_http_etag": "c44b7b641d818284f8f016b1e8c56d3024498418fdd478f5626b502e436c7f29",
        "http_etag_is_not_treated_as_a_content_sha256": True,
    },
    "checkpoints": {
        "expression_generator_prefix": "midi_ddsp_model_weights_urmp_9_10/expression_generator/5000",
        "synthesis_generator_prefix": "midi_ddsp_model_weights_urmp_9_10/synthesis_generator/50000",
        "members": {
            "midi_ddsp_model_weights_urmp_9_10/expression_generator/5000.data-00000-of-00001": {
                "byte_length": 2_169_184,
                "sha256": "1ab440592186ffbd4b48e3b70395a7112d8a297f20bdc37fda35fa87ccd0c2e3",
            },
            "midi_ddsp_model_weights_urmp_9_10/expression_generator/5000.index": {
                "byte_length": 2_159,
                "sha256": "61c2e6aa8b70fe511d3d1613892addc3479165e0096c189f2c2eabf364f34375",
            },
            "midi_ddsp_model_weights_urmp_9_10/expression_generator/train.log": {
                "byte_length": 10_750,
                "sha256": "8b0c09320f620a765e6383d960f4f28054c1488b5ce8f85c5a40e4c361213e5d",
            },
            "midi_ddsp_model_weights_urmp_9_10/synthesis_generator/50000.data-00000-of-00001": {
                "byte_length": 50_081_597,
                "sha256": "781cf09aebfb28c176b566c5290d953814759b7bc63f417df6bba0c2619991cd",
            },
            "midi_ddsp_model_weights_urmp_9_10/synthesis_generator/50000.index": {
                "byte_length": 13_643,
                "sha256": "d1529b405eac9a9d365edb6451a946f8e943d2bcffbeda45da4ece9ea25506e4",
            },
            "midi_ddsp_model_weights_urmp_9_10/synthesis_generator/train.log": {
                "byte_length": 156_155,
                "sha256": "4d7932e2b7824f8038592813539ab2ce30b5dde62ca776f198911f334ed0a8fd",
            },
        },
    },
    "source_declared_runtime": {
        "package_version": "0.2.6",
        "recommended_python": "3.8",
        "developed_with_tensorflow": "2.7.0",
        "ddsp_requirement": "==3.2.0",
        "tensorflowjs_requirement": "<3.19",
        "crepe_requirement": "<0.0.13",
        "note_seq_requirement": "<0.0.4",
        "sample_rate_hz": 16_000,
        "frame_rate_hz": 250,
        "runtime_compatibility_executed": False,
    },
    "supported_pretrained_instruments": [
        "violin",
        "viola",
        "cello",
        "double bass",
        "flute",
        "oboe",
        "clarinet",
        "saxophone",
        "bassoon",
        "trumpet",
        "horn",
        "trombone",
        "tuba",
    ],
    "training_scope_as_declared_by_source": "URMP; 13 listed orchestral instruments",
    "weight_license_audit": {
        "main_branch_source_code_license": "Apache-2.0",
        "models_branch_tree_contains_license_or_notice": False,
        "zip_payload_contains_license_or_notice": False,
        "model_card_or_weight_specific_license_found_in_audited_official_artifacts": False,
        "weight_r_and_d_use_status": "not_proven_by_this_audit",
        "weight_commercial_or_game_use_status": "not_proven_by_this_audit",
        "required_next_step": "obtain explicit weight and training-data terms from the rights holder before any use beyond retained audit evidence",
    },
}


class ProvenanceError(ValueError):
    """An archive/report path is unsafe or the ZIP structure is malformed."""


def _hash_archive_bytes(path: Path, *, byte_length: int) -> tuple[str, str]:
    """Return SHA-256 plus the Git blob SHA-1 for the same raw archive bytes."""

    sha256 = hashlib.sha256()
    git_blob_sha1 = hashlib.sha1()
    git_blob_sha1.update(f"blob {byte_length}\0".encode("ascii"))
    with path.open("rb") as source:
        for block in iter(lambda: source.read(COPY_BUFFER_BYTES), b""):
            sha256.update(block)
            git_blob_sha1.update(block)
    return sha256.hexdigest(), git_blob_sha1.hexdigest()


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _safe_zip_member(name: str) -> None:
    member_path = PurePosixPath(name)
    if member_path.is_absolute() or ".." in member_path.parts or not name:
        raise ProvenanceError("ZIP contains an unsafe member path")


def inspect_archive(archive: str | Path) -> dict[str, Any]:
    """Hash an archive and its members by streaming, without extracting or executing it."""

    source = Path(archive).expanduser()
    try:
        source = source.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise ProvenanceError("archive is unavailable") from exc
    if not source.is_file():
        raise ProvenanceError("archive is not a file")
    try:
        size = source.stat().st_size
        archive_sha256, git_blob_sha1 = _hash_archive_bytes(source, byte_length=size)
        with zipfile.ZipFile(source) as bundle:
            seen: set[str] = set()
            members: dict[str, dict[str, Any]] = {}
            for info in bundle.infolist():
                _safe_zip_member(info.filename)
                if info.is_dir():
                    continue
                if info.filename in seen:
                    raise ProvenanceError("ZIP contains a duplicate file member")
                seen.add(info.filename)
                digest = hashlib.sha256()
                with bundle.open(info) as member:
                    for block in iter(lambda: member.read(COPY_BUFFER_BYTES), b""):
                        digest.update(block)
                members[info.filename] = {
                    "byte_length": info.file_size,
                    "compressed_byte_length": info.compress_size,
                    "crc32": f"{info.CRC:08x}",
                    "sha256": digest.hexdigest(),
                }
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
        raise ProvenanceError("archive is not a readable safe ZIP") from exc
    return {
        "archive_basename": source.name,
        "archive_path_sha256": _sha256_text(str(source)),
        "absolute_path_recorded": False,
        "byte_length": size,
        "sha256": archive_sha256,
        "git_blob_sha1": git_blob_sha1,
        "members": dict(sorted(members.items())),
        "source_extracted": False,
        "checkpoint_executed": False,
    }


def verify_archive(
    inspected: Mapping[str, Any],
    *,
    expected_byte_length: int,
    expected_sha256: str,
    expected_members: Mapping[str, Mapping[str, Any]],
    expected_git_blob_sha1: str | None = None,
) -> dict[str, bool]:
    """Return independent byte/member comparisons for any transparent expected manifest."""

    observed_members = inspected["members"]
    member_names_match = set(observed_members) == set(expected_members)
    member_hashes_match = member_names_match and all(
        observed_members[name]["sha256"] == expected_members[name]["sha256"]
        and observed_members[name]["byte_length"] == expected_members[name]["byte_length"]
        for name in expected_members
    )
    git_blob_sha1_match = (
        inspected["git_blob_sha1"] == expected_git_blob_sha1
        if expected_git_blob_sha1 is not None
        else True
    )
    return {
        "archive_byte_length_match": inspected["byte_length"] == expected_byte_length,
        "archive_sha256_match": inspected["sha256"] == expected_sha256,
        "member_name_set_match": member_names_match,
        "member_hash_and_length_match": member_hashes_match,
        "git_blob_sha1_match": git_blob_sha1_match,
        "verified_exact_archive": bool(
            inspected["byte_length"] == expected_byte_length
            and inspected["sha256"] == expected_sha256
            and member_names_match
            and member_hashes_match
            and git_blob_sha1_match
        ),
    }


def build_report(archive: str | Path, *, created_at_utc: str | None = None) -> dict[str, Any]:
    """Produce an auditable report for the official artifact definition above."""

    inspected = inspect_archive(archive)
    verification = verify_archive(
        inspected,
        expected_byte_length=OFFICIAL["weight_download"]["byte_length"],
        expected_sha256=OFFICIAL["weight_download"]["sha256"],
        expected_members=OFFICIAL["checkpoints"]["members"],
        expected_git_blob_sha1=OFFICIAL["repository"]["models_git_blob_sha1"],
    )
    created_at_utc = created_at_utc or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return {
        "schema": SCHEMA,
        "tool": TOOL_ID,
        "created_at_utc": created_at_utc,
        "policy": {
            "downloaded_or_supplied_archive_only": True,
            "archive_extracted": False,
            "checkpoint_executed": False,
            "tensorflow_imported": False,
            "model_trained": False,
            "user_audio_read": False,
            "default_game_bgm_changed": False,
            "not_a_license_or_rights_approval": True,
        },
        "official_artifact_definition": OFFICIAL,
        "local_archive": inspected,
        "verification": verification,
        "disposition": {
            "byte_provenance": "verified_against_pinned_official_models_commit" if verification["verified_exact_archive"] else "not_verified",
            "instrument_fit_for_korean_daegeum": "unsupported_by_declared_pretrained_instrument_list",
            "runtime_ready": False,
            "rights_ready_for_r_and_d_or_game": False,
            "reason": "the audit finds no explicit model-weight licence in the audited models branch or ZIP payload",
        },
    }


def write_report(report: Mapping[str, Any], output: str | Path, *, archive: str | Path, overwrite: bool) -> None:
    output_path = Path(output).expanduser()
    archive_path = Path(archive).expanduser().resolve(strict=True)
    try:
        resolved_output = output_path.resolve(strict=False)
    except (OSError, RuntimeError) as exc:
        raise ProvenanceError("report output cannot be resolved") from exc
    if resolved_output == archive_path:
        raise ProvenanceError("report output must not overwrite the archive")
    if resolved_output.exists() and not overwrite:
        raise ProvenanceError("report output already exists; pass --overwrite to replace it")
    resolved_output.parent.mkdir(parents=True, exist_ok=True)
    resolved_output.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path, help="already downloaded official ZIP")
    parser.add_argument("--output", required=True, type=Path, help="JSON report destination")
    parser.add_argument("--overwrite", action="store_true", help="replace an existing report")
    parser.add_argument(
        "--confirm-no-execution",
        action="store_true",
        help="required acknowledgement: inspect/hashing only, never model execution",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if not args.confirm_no_execution:
        print("midi_ddsp_official: pass --confirm-no-execution", file=sys.stderr)
        return 2
    try:
        report = build_report(args.archive)
        write_report(report, args.output, archive=args.archive, overwrite=args.overwrite)
    except ProvenanceError as exc:
        print(f"midi_ddsp_official: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({"output": str(args.output), "verification": report["verification"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
