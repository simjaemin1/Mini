#!/usr/bin/env python3
"""Generate a hash-pinned full-Arirang B1/B2-R/B2-Rd pack spec."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from typing import Any, Dict, Mapping, Optional, Sequence

from build_full_ari_reference_depth_audition_pack import (
    ROLES,
    SPEC_SCHEMA,
    reference_pack,
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _artifact(repository_root: Path, path: Path, label: str) -> Dict[str, str]:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise ValueError(f"{label} is not a file: {resolved}")
    try:
        relative = resolved.relative_to(repository_root).as_posix()
    except ValueError as exc:
        raise ValueError(f"{label} must be inside the repository") from exc
    return {"path": relative, "sha256": _sha256(resolved)}


def _reference_identity(path: Path) -> tuple[str, str]:
    try:
        artifact = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("reference artifact is not readable UTF-8 JSON") from exc
    if not isinstance(artifact, Mapping):
        raise ValueError("reference artifact must be an object")
    if (
        artifact.get("schema") != reference_pack.REFERENCE_SCHEMA
        or artifact.get("status") != reference_pack.REFERENCE_STATUS
    ):
        raise ValueError("reference artifact is not reference_shape_unreviewed")
    selection = artifact.get("selection")
    if not isinstance(selection, Mapping):
        raise ValueError("reference artifact has no selection")
    contour = selection.get("normalized_reference_contour")
    candidate_id = selection.get("candidate_id")
    if not isinstance(candidate_id, str) or not candidate_id:
        raise ValueError("reference candidate ID is missing")
    if not isinstance(contour, Mapping):
        raise ValueError("reference normalized contour is missing")
    payload_sha = contour.get("contour_payload_sha256")
    if not isinstance(payload_sha, str) or len(payload_sha) != 64:
        raise ValueError("reference contour payload SHA is missing")
    return candidate_id, payload_sha


def make_full_ari_reference_depth_spec(
    repository_root: Path,
    output_path: Path,
    *,
    b1_runtime_report: Path,
    b1_plan: Path,
    b1_policy_manifest: Path,
    b2r_runtime_report: Path,
    b2r_plan: Path,
    b2r_policy_manifest: Path,
    b2rd_runtime_report: Path,
    b2rd_plan: Path,
    b2rd_policy_manifest: Path,
    reference_artifact: Path,
) -> Dict[str, Any]:
    repository_root = repository_root.expanduser().resolve()
    output_path = output_path.expanduser().resolve()
    if not repository_root.is_dir():
        raise ValueError("repository root is not a directory")
    try:
        output_path.relative_to(repository_root)
    except ValueError as exc:
        raise ValueError("output spec must stay inside the repository") from exc
    if output_path.exists():
        raise ValueError("output spec must be fresh")
    if not output_path.parent.is_dir():
        raise ValueError("output spec parent must already exist")

    reference_artifact = reference_artifact.expanduser().resolve()
    candidate_id, payload_sha = _reference_identity(reference_artifact)
    reference_record: Dict[str, Any] = _artifact(
        repository_root, reference_artifact, "reference artifact"
    )
    reference_record.update({
        "expected_candidate_id": candidate_id,
        "expected_contour_payload_sha256": payload_sha,
    })
    inputs = {
        "B1": (b1_runtime_report, b1_plan, b1_policy_manifest),
        "B2-R": (b2r_runtime_report, b2r_plan, b2r_policy_manifest),
        "B2-Rd": (b2rd_runtime_report, b2rd_plan, b2rd_policy_manifest),
    }
    spec: Dict[str, Any] = {
        "schema": SPEC_SCHEMA,
        "reference_artifact": reference_record,
        "candidates": {
            slot: {
                "status": "ready",
                "role": ROLES[slot],
                "runtime_report": _artifact(repository_root, values[0], f"{slot} runtime report"),
                "plan_artifact": _artifact(repository_root, values[1], f"{slot} score plan"),
                "policy_manifest": _artifact(repository_root, values[2], f"{slot} policy manifest"),
            }
            for slot, values in inputs.items()
        },
    }
    output_path.write_text(
        json.dumps(spec, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return spec


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    for prefix in ("b1", "b2r", "b2rd"):
        parser.add_argument(f"--{prefix}-runtime-report", type=Path, required=True)
        parser.add_argument(f"--{prefix}-plan", type=Path, required=True)
        parser.add_argument(f"--{prefix}-policy-manifest", type=Path, required=True)
    parser.add_argument("--reference-artifact", type=Path, required=True)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parser().parse_args(argv)
    try:
        spec = make_full_ari_reference_depth_spec(
            args.repository_root,
            args.output,
            b1_runtime_report=args.b1_runtime_report,
            b1_plan=args.b1_plan,
            b1_policy_manifest=args.b1_policy_manifest,
            b2r_runtime_report=args.b2r_runtime_report,
            b2r_plan=args.b2r_plan,
            b2r_policy_manifest=args.b2r_policy_manifest,
            b2rd_runtime_report=args.b2rd_runtime_report,
            b2rd_plan=args.b2rd_plan,
            b2rd_policy_manifest=args.b2rd_policy_manifest,
            reference_artifact=args.reference_artifact,
        )
    except ValueError as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "status": "written",
        "schema": spec["schema"],
        "output": str(args.output),
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
