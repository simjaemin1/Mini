#!/usr/bin/env python3
"""Write a hash-pinned B0/B1 audition spec with an explicit blocked B2 slot."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any, Dict, Mapping, Optional, Sequence

from build_yoseong_audition_pack import ROLES, SPEC_SCHEMA, YoseongAuditionPackError, _sha256


DEFAULT_B2_REASON = "No admissible reference-derived or learned yoseong curve is available."
DEFAULT_B2_REQUIREMENTS = (
    "fingerprinted source performance or training evidence",
    "measured reference curve or learned model output with reviewed R&D-use scope",
)


def _artifact(repository_root: Path, path: Path, *, label: str) -> Dict[str, str]:
    resolved = path.expanduser().resolve()
    try:
        relative = resolved.relative_to(repository_root).as_posix()
    except ValueError as exc:
        raise YoseongAuditionPackError(f"{label} must be inside the repository") from exc
    if not resolved.is_file():
        raise YoseongAuditionPackError(f"{label} is not a file")
    return {"path": relative, "sha256": _sha256(resolved)}


def _strings(values: Sequence[str], *, label: str) -> list[str]:
    result = sorted({value.strip() for value in values if value.strip()})
    if not result:
        raise YoseongAuditionPackError(f"{label} must contain at least one value")
    return result


def make_blocked_b2_spec(
    repository_root: Path,
    output_path: Path,
    *,
    b0_runtime_report: Path,
    b0_plan: Path,
    b1_runtime_report: Path,
    b1_plan: Path,
    b1_policy_manifest: Path,
    b1_rule_ids: Sequence[str],
    b1_event_ids: Sequence[str],
    b2_reason: str = DEFAULT_B2_REASON,
    b2_unmet_requirements: Sequence[str] = DEFAULT_B2_REQUIREMENTS,
) -> Mapping[str, Any]:
    repository_root = repository_root.expanduser().resolve()
    output_path = output_path.expanduser().resolve()
    if not repository_root.is_dir():
        raise YoseongAuditionPackError("repository root is not a directory")
    try:
        output_path.relative_to(repository_root)
    except ValueError as exc:
        raise YoseongAuditionPackError("spec output must be inside the repository") from exc
    if output_path.exists():
        raise YoseongAuditionPackError("spec output must be fresh")
    if not output_path.parent.is_dir():
        raise YoseongAuditionPackError("spec output parent must already exist")
    reason = b2_reason.strip()
    if not reason:
        raise YoseongAuditionPackError("B2 blocker reason must be non-empty")
    rule_ids = _strings(b1_rule_ids, label="B1 rule ids")
    event_ids = _strings(b1_event_ids, label="B1 event ids")
    unmet = _strings(b2_unmet_requirements, label="B2 unmet requirements")
    spec: Dict[str, Any] = {
        "schema": SPEC_SCHEMA,
        "candidates": {
            "B0": {
                "status": "ready",
                "role": ROLES["B0"],
                "runtime_report": _artifact(
                    repository_root, b0_runtime_report, label="B0 runtime report"
                ),
                "plan_artifact": _artifact(repository_root, b0_plan, label="B0 plan"),
                "expected_yoseong_event_ids": [],
            },
            "B1": {
                "status": "ready",
                "role": ROLES["B1"],
                "runtime_report": _artifact(
                    repository_root, b1_runtime_report, label="B1 runtime report"
                ),
                "plan_artifact": _artifact(repository_root, b1_plan, label="B1 plan"),
                "policy_manifest": _artifact(
                    repository_root, b1_policy_manifest, label="B1 policy manifest"
                ),
                "expected_policy_rule_ids": rule_ids,
                "expected_yoseong_event_ids": event_ids,
            },
            "B2": {
                "status": "blocked",
                "role": ROLES["B2"],
                "reason": reason,
                "unmet_requirements": unmet,
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
    parser.add_argument("--b1-runtime-report", type=Path, required=True)
    parser.add_argument("--b1-plan", type=Path, required=True)
    parser.add_argument("--b1-policy-manifest", type=Path, required=True)
    parser.add_argument("--b1-rule-id", action="append", required=True)
    parser.add_argument("--b1-event-id", action="append", required=True)
    parser.add_argument("--b2-reason", default=DEFAULT_B2_REASON)
    parser.add_argument(
        "--b2-unmet-requirement",
        action="append",
        dest="b2_unmet_requirements",
        help="repeat to replace the two default B2 requirements",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parser().parse_args(argv)
    try:
        spec = make_blocked_b2_spec(
            args.repository_root,
            args.output,
            b0_runtime_report=args.b0_runtime_report,
            b0_plan=args.b0_plan,
            b1_runtime_report=args.b1_runtime_report,
            b1_plan=args.b1_plan,
            b1_policy_manifest=args.b1_policy_manifest,
            b1_rule_ids=args.b1_rule_id,
            b1_event_ids=args.b1_event_id,
            b2_reason=args.b2_reason,
            b2_unmet_requirements=(
                args.b2_unmet_requirements
                if args.b2_unmet_requirements is not None
                else DEFAULT_B2_REQUIREMENTS
            ),
        )
    except YoseongAuditionPackError as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({"status": "written", "output": str(args.output), "schema": spec["schema"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
