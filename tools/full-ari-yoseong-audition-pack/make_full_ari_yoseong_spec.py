#!/usr/bin/env python3
"""Generate a hash-pinned full-Arirang B0/B1 audition-pack spec."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, Optional, Sequence

from build_full_ari_yoseong_audition_pack import ROLES, SPEC_SCHEMA


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _artifact(repository_root: Path, path: Path, *, label: str) -> Dict[str, str]:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise ValueError(f"{label} is not a file: {resolved}")
    try:
        relative = resolved.relative_to(repository_root).as_posix()
    except ValueError as exc:
        raise ValueError(f"{label} must be inside the repository") from exc
    return {"path": relative, "sha256": _sha256(resolved)}


def make_full_ari_yoseong_spec(
    repository_root: Path,
    output_path: Path,
    *,
    b0_runtime_report: Path,
    b0_plan: Path,
    b0_policy_manifest: Path,
    b1_runtime_report: Path,
    b1_plan: Path,
    b1_policy_manifest: Path,
    b1_rule_ids: Sequence[str],
    b1_event_ids: Sequence[str],
) -> Dict[str, Any]:
    repository_root = repository_root.expanduser().resolve()
    output_path = output_path.expanduser().resolve()
    if not repository_root.is_dir():
        raise ValueError("repository root is not a directory")
    try:
        output_path.relative_to(repository_root)
    except ValueError as exc:
        raise ValueError("output must be inside the repository") from exc
    if output_path.exists():
        raise ValueError("output spec must be fresh")
    if not output_path.parent.is_dir():
        raise ValueError("output parent directory must already exist")
    rules = sorted(set(value.strip() for value in b1_rule_ids if value.strip()))
    events = sorted(set(value.strip() for value in b1_event_ids if value.strip()))
    if not rules or not events:
        raise ValueError("B1 needs at least one expected policy rule and event ID")
    spec: Dict[str, Any] = {
        "schema": SPEC_SCHEMA,
        "candidates": {
            "B0": {
                "status": "ready",
                "role": ROLES["B0"],
                "runtime_report": _artifact(repository_root, b0_runtime_report, label="B0 runtime report"),
                "plan_artifact": _artifact(repository_root, b0_plan, label="B0 score plan"),
                "policy_manifest": _artifact(repository_root, b0_policy_manifest, label="B0 policy manifest"),
                "expected_policy_rule_ids": [],
                "expected_yoseong_event_ids": [],
            },
            "B1": {
                "status": "ready",
                "role": ROLES["B1"],
                "runtime_report": _artifact(repository_root, b1_runtime_report, label="B1 runtime report"),
                "plan_artifact": _artifact(repository_root, b1_plan, label="B1 score plan"),
                "policy_manifest": _artifact(repository_root, b1_policy_manifest, label="B1 policy manifest"),
                "expected_policy_rule_ids": rules,
                "expected_yoseong_event_ids": events,
            },
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
    parser.add_argument("--b0-runtime-report", type=Path, required=True)
    parser.add_argument("--b0-plan", type=Path, required=True)
    parser.add_argument("--b0-policy-manifest", type=Path, required=True)
    parser.add_argument("--b1-runtime-report", type=Path, required=True)
    parser.add_argument("--b1-plan", type=Path, required=True)
    parser.add_argument("--b1-policy-manifest", type=Path, required=True)
    parser.add_argument("--b1-rule-id", action="append", required=True)
    parser.add_argument("--b1-event-id", action="append", required=True)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parser().parse_args(argv)
    try:
        spec = make_full_ari_yoseong_spec(
            args.repository_root,
            args.output,
            b0_runtime_report=args.b0_runtime_report,
            b0_plan=args.b0_plan,
            b0_policy_manifest=args.b0_policy_manifest,
            b1_runtime_report=args.b1_runtime_report,
            b1_plan=args.b1_plan,
            b1_policy_manifest=args.b1_policy_manifest,
            b1_rule_ids=args.b1_rule_id,
            b1_event_ids=args.b1_event_id,
        )
    except ValueError as exc:
        print(f"BLOCKED: {exc}")
        return 2
    print(json.dumps({"status": "written", "output": str(args.output), "schema": spec["schema"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
