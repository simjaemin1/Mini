#!/usr/bin/env python3
"""Private R&D wrapper: reuse the pinned DDSP runner's release QA per boundary.

The published DDSP sources, checkpoint, authorial score, and legacy runner are
never modified.  This narrow wrapper exists because that runner's original QA
only accepted *one* release onset, while this 8-bar score has four written
breaths.  Each onset is checked by the original single-release implementation
with its same 20 ms windows and -6 dB floor.  No audio or control math changes.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from typing import Any, Callable, Mapping, Sequence


PINNED_LEGACY_RUNNER_SHA256 = "3d160f3d9021d3d1c302901554e8d04546c4965f02bf919ab5655cd927771799"
PINNED_COMPAT_PLAN_SHA256 = "a06eea18b06d5af458afb87184899b498d25ba564eaf5a4ad3412cb9084b7458"
EXPECTED_RELEASE_COUNT = 4
WINDOW_SECONDS = 0.020


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_pinned_legacy_runner(path: Path) -> Any:
    path = path.expanduser().resolve()
    if sha256(path) != PINNED_LEGACY_RUNNER_SHA256:
        raise ValueError("legacy DDSP runner hash differs from the audited version")
    spec = importlib.util.spec_from_file_location("private_ddsp_gugak_legacy_runner", path)
    if spec is None or spec.loader is None:
        raise ValueError("could not load the pinned DDSP runner")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_multi_release_qa(
    single_release_qa: Callable[[Sequence[float], Sequence[Mapping[str, Any]]], Mapping[str, Any]],
    runtime_error: type[Exception],
    *,
    hop_length: int,
    sample_rate_hz: int,
    frame_rate_hz: int,
) -> Callable[[Sequence[float], Sequence[Mapping[str, Any]]], dict[str, Any]]:
    """Apply the *unchanged* one-release gate to each 40 ms local window."""

    window_samples = int(round(WINDOW_SECONDS * sample_rate_hz))
    if window_samples % hop_length:
        raise ValueError("the original 20 ms QA window is not frame-aligned")
    window_frames = window_samples // hop_length

    def check(samples: Sequence[float], frames: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
        if len(samples) != len(frames) * hop_length:
            raise runtime_error("multi-release QA received mismatched audio/control lengths")
        starts = [
            index
            for index, frame in enumerate(frames)
            if str(frame["articulation"]) == "release"
            and (index == 0 or str(frames[index - 1]["articulation"]) != "release")
        ]
        if not starts:
            raise runtime_error("multi-release QA requires at least one release onset")
        checks = []
        for start in starts:
            first = start - window_frames
            last = start + window_frames
            if first < 0 or last > len(frames):
                raise runtime_error("release boundary cannot support the original 20 ms QA windows")
            local_frames = frames[first:last]
            local_samples = samples[first * hop_length:last * hop_length]
            result = dict(single_release_qa(local_samples, local_frames))
            if result.get("passed") is not True or result.get("release_start_frame") != window_frames:
                raise runtime_error("pinned single-release QA returned an unexpected boundary result")
            result["release_start_frame"] = start
            result["release_start_seconds"] = start / frame_rate_hz
            result["event_id"] = str(frames[start]["event_id"])
            checks.append(result)
        return {
            "passed": True,
            "qa_implementation": "private_rnd_multi_release_wrapper; pinned original single-release QA reused verbatim for every boundary",
            "release_count": len(checks),
            "window_seconds": WINDOW_SECONDS,
            "minimum_permitted_post_minus_pre_db": -6.0,
            "per_release": checks,
        }

    return check


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--legacy-runner", type=Path, required=True)
    own, forwarded = parser.parse_known_args(argv)
    legacy = load_pinned_legacy_runner(own.legacy_runner)
    args = legacy.parse_args(forwarded)
    if not args.execute or not args.confirm_rnd_only or args.max_seconds is not None:
        raise ValueError("this wrapper permits only an explicitly confirmed full-length private R&D render")
    if not args.experimental_hard_f0_step or args.checkpoint_native_reverb or args.reference_flute_wav or args.component_diagnostics:
        raise ValueError("the only permitted experiment is a dry, hard-step, no-reference render")
    if sha256(args.plan.expanduser().resolve()) != PINNED_COMPAT_PLAN_SHA256:
        raise ValueError("authorial compatibility plan differs from the validated private R&D copy")
    _, events, duration = legacy._validate_plan(args.plan.expanduser().resolve())
    if duration != 19.2 or sum(event["articulation"] == "release" for event in events) != EXPECTED_RELEASE_COUNT:
        raise ValueError("the pinned full plan must have 19.2 seconds and exactly four releases")

    original_qa = legacy.release_boundary_qa
    legacy.release_boundary_qa = make_multi_release_qa(
        original_qa,
        legacy.RuntimeContractError,
        hop_length=legacy.HOP_LENGTH,
        sample_rate_hz=legacy.SAMPLE_RATE_HZ,
        frame_rate_hz=legacy.FRAME_RATE_HZ,
    )
    result = legacy.execute(args)
    output_dir = args.output_dir.expanduser().resolve()
    report_path = output_dir / "runtime_report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    release_qa = report["render"]["release_boundary_qa"]
    if release_qa.get("passed") is not True or release_qa.get("release_count") != EXPECTED_RELEASE_COUNT:
        raise ValueError("full render report did not confirm four checked releases")
    sidecar = {
        "schema": "mini.private-ddsp-gugak-multi-release-rnd.v1",
        "status": "succeeded_private_rnd_only",
        "no_training": True,
        "no_ngc_audio_read_by_model": True,
        "checkpoint_rights_cleared_for_game_or_public_release": False,
        "legacy_runner_sha256": PINNED_LEGACY_RUNNER_SHA256,
        "wrapper_sha256": sha256(Path(__file__).resolve()),
        "compat_plan_sha256": PINNED_COMPAT_PLAN_SHA256,
        "runtime_report_sha256": sha256(report_path),
        "dry_wav_sha256": report["outputs"]["dry_wav"]["sha256"],
        "qa_change": "only reuse original 20 ms/-6 dB release-boundary check separately at each of four releases; no score, controls, decoder, synthesis, or audio edits",
        "release_boundary_qa": release_qa,
    }
    sidecar_path = output_dir / "multi_release_private_rnd_report.json"
    sidecar_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({**result, "multi_release_sidecar": str(sidecar_path)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, FileNotFoundError) as exc:
        print(f"private multi-release DDSP R&D wrapper: {exc}", file=sys.stderr)
        raise SystemExit(2)
