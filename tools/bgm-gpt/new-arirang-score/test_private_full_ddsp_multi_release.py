#!/usr/bin/env python3
"""Focused synthetic QA tests; no model import, checkpoint, or audio file needed."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import unittest


WRAPPER = Path(__file__).with_name("run_private_full_ddsp_multi_release.py")
spec = importlib.util.spec_from_file_location("private_multi_release_test_target", WRAPPER)
assert spec is not None and spec.loader is not None
target = importlib.util.module_from_spec(spec)
spec.loader.exec_module(target)
LEGACY_RUNNER = Path(os.environ.get(
    "MINI_DDSP_GUGAK_LEGACY_RUNNER",
    "/Users/simjaemin1/.codex/worktrees/durango-mini-bgm-rnd-01/tools/ddsp-gugak-public-runtime/ddsp_gugak_public_runtime.py",
))


def fixture(starts, bad_start=None):
    length = max(starts) + 30
    frames = []
    samples = []
    for index in range(length):
        release_start = next((start for start in starts if start <= index < start + 12), None)
        frames.append({"articulation": "release" if release_start is not None else "slur", "event_id": f"release_{release_start}" if release_start is not None else "note"})
        amplitude = 0.01 if bad_start is not None and bad_start <= index < bad_start + 5 else 0.1
        samples.extend([amplitude] * 64)
    return samples, frames


class MultiReleaseQATest(unittest.TestCase):
    def setUp(self):
        legacy = target.load_pinned_legacy_runner(LEGACY_RUNNER)
        self.RuntimeContractError = legacy.RuntimeContractError
        self.check = target.make_multi_release_qa(
            legacy.release_boundary_qa,
            legacy.RuntimeContractError,
            hop_length=legacy.HOP_LENGTH,
            sample_rate_hz=legacy.SAMPLE_RATE_HZ,
            frame_rate_hz=legacy.FRAME_RATE_HZ,
        )

    def test_one_release_matches_original_gate(self):
        samples, frames = fixture([15])
        result = self.check(samples, frames)
        self.assertEqual(result["release_count"], 1)
        self.assertEqual(result["per_release"][0]["release_start_frame"], 15)
        self.assertAlmostEqual(result["per_release"][0]["post_minus_pre_db"], 0.0)

    def test_four_releases_each_checked(self):
        starts = [15, 55, 95, 135]
        samples, frames = fixture(starts)
        result = self.check(samples, frames)
        self.assertEqual(result["release_count"], 4)
        self.assertEqual([item["release_start_frame"] for item in result["per_release"]], starts)
        self.assertTrue(all(item["passed"] for item in result["per_release"]))

    def test_one_bad_release_fails_whole_render(self):
        samples, frames = fixture([15, 55, 95, 135], bad_start=95)
        with self.assertRaisesRegex(self.RuntimeContractError, "artificial >6 dB"):
            self.check(samples, frames)


if __name__ == "__main__":
    unittest.main()
