#!/usr/bin/env python3
"""CLI for the bounded, local-only AI Hub paired-data ingest gate."""

from __future__ import annotations

import argparse
import sys

from aihub_paired_ingest import (
    AIHubPairedIngestError,
    validate_local_bundle_manifest,
    write_feature_extraction_report,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Validate one explicit local AI Hub-named WAV/MIDI/JSON bundle and emit "
            "one R&D-only feature-extraction report. No network, discovery, download, "
            "training, source copying, or game-asset output is available."
        )
    )
    parser.add_argument("--bundle-manifest", required=True, help="One explicit local bundle JSON manifest")
    parser.add_argument(
        "--report-dir",
        required=True,
        help="Fresh output directory for exactly one R&D-only JSON report (never public/assets)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        report = validate_local_bundle_manifest(args.bundle_manifest, verify_files=True)
        report_path = write_feature_extraction_report(report, args.report_dir)
    except AIHubPairedIngestError as exc:
        print(f"AI Hub paired ingest rejected: {exc}", file=sys.stderr)
        return 2
    print(report_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
