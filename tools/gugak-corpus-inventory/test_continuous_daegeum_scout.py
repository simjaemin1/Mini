#!/usr/bin/env python3
"""Source-preserving tests for ``continuous_daegeum_scout.py``."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("continuous_daegeum_scout.py")
SPEC = importlib.util.spec_from_file_location("continuous_daegeum_scout_test", MODULE_PATH)
assert SPEC and SPEC.loader
scout = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = scout
SPEC.loader.exec_module(scout)


def _chunk(identifier: bytes, payload: bytes) -> bytes:
    return identifier + struct.pack("<I", len(payload)) + payload + (b"\0" if len(payload) & 1 else b"")


def _pcm16_wav(*, sample_rate: int, seconds: int) -> bytes:
    frames = b"\0\0" * sample_rate * seconds
    fmt = struct.pack("<HHIIHH", 1, 1, sample_rate, sample_rate * 2, 2, 16)
    body = b"WAVE" + _chunk(b"fmt ", fmt) + _chunk(b"data", frames)
    return b"RIFF" + struct.pack("<I", len(body)) + body


class ContinuousDaegeumScoutTests(unittest.TestCase):
    def test_report_is_path_safe_and_conservative(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root = base / "private-downloads"
            root.mkdir()
            long_wav = root / "Jeongakdaegeum.wav"
            exercise_wav = root / "대금_scale_vib.wav"
            unrelated = root / "personal-recording.wav"
            long_wav.write_bytes(_pcm16_wav(sample_rate=1, seconds=61))
            exercise_wav.write_bytes(_pcm16_wav(sample_rate=1, seconds=62))
            unrelated.write_bytes(_pcm16_wav(sample_rate=1, seconds=61))
            before = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (long_wav, exercise_wav, unrelated)}

            manifest = base / "known-ngc.json"
            manifest.write_text(
                json.dumps({"entries": [{"download": {"native_wav": {"sha256": before[exercise_wav]}}}]}),
                encoding="utf-8",
            )
            report = scout.build_report(
                root,
                root_id="downloads",
                known_ngc_manifest=manifest,
                created_at_utc="2026-09-25T00:00:00Z",
            )
            self.assertEqual(report["summary"]["all_audio_files_seen"], 3)
            self.assertEqual(report["summary"]["daegeum_filename_candidate_files"], 2)
            self.assertEqual(report["summary"]["long_native_wav_continuous_recording_candidate_count"], 1)
            self.assertEqual(report["summary"]["matches_known_controlled_ngc_manifest_count"], 1)
            self.assertEqual(len(report["continuous_recording_review_candidates"]), 1)
            self.assertEqual(
                report["unapproved_rnd_source_baseline_manifest"]["status"],
                "unreviewed_local_source_candidates_no_rights_approval",
            )
            self.assertEqual(report["unapproved_rnd_source_baseline_manifest"]["candidate_count"], 1)
            self.assertIn(
                "model_training", report["unapproved_rnd_source_baseline_manifest"]["does_not_authorize"]
            )
            self.assertEqual(
                report["continuous_recording_review_candidates"][0]["recording_candidate_class"],
                "long_native_wav_continuous_recording_candidate",
            )
            exercise = next(
                item
                for item in report["records"]
                if item["manual_review_locator"]["byte_sha256"] == before[exercise_wav]
            )
            self.assertEqual(
                exercise["recording_candidate_class"], "named_technique_or_exercise_not_continuity_candidate"
            )
            rendered = json.dumps(report, ensure_ascii=False, sort_keys=True)
            self.assertNotIn(str(root), rendered)
            self.assertNotIn("Jeongakdaegeum.wav", rendered)
            self.assertNotIn("personal-recording.wav", rendered)
            self.assertEqual({path: hashlib.sha256(path.read_bytes()).hexdigest() for path in before}, before)

    def test_rejects_report_inside_source_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root = base / "source"
            root.mkdir()
            (root / "Daegeum.wav").write_bytes(_pcm16_wav(sample_rate=1, seconds=1))
            report = scout.build_report(root, root_id="source", created_at_utc="2026-09-25T00:00:00Z")
            with self.assertRaisesRegex(scout.ScoutError, "outside"):
                scout.write_report(report, root / "report.json", root=root, overwrite=False)


if __name__ == "__main__":
    unittest.main()
