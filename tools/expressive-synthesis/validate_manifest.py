#!/usr/bin/env python3
"""Read-only CLI for the explicit expressive-synthesis R&D corpus contract."""

from __future__ import annotations

import argparse
import json
import sys

from manifest import ManifestValidationError, validate_manifest_file


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Validate one explicit R&D-only expressive-synthesis corpus manifest. "
            "This command never discovers files, decodes audio, or writes assets."
        )
    )
    parser.add_argument("--manifest", required=True, help="Explicit JSON manifest path")
    parser.add_argument(
        "--verify-files",
        action="store_true",
        help="Also SHA-256 check the explicitly listed controls/target NPZ files",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        report = validate_manifest_file(args.manifest, verify_files=args.verify_files)
    except ManifestValidationError as exc:
        print(f"manifest rejected: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
