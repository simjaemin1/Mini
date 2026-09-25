#!/usr/bin/env python3
"""Dependency-free checks for the non-default R&D-06 target audition helper."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from native_wav import inspect_wav  # noqa: E402
from target_audition import (  # noqa: E402
    SCHEMA,
    build_target_priority,
    rank_candidate,
    rank_for_target,
)


def _write_pcm16(path: Path, frames: int = 32, *, rate: int = 44_100, channels: int = 2) -> None:
    samples = []
    for frame in range(frames):
        for channel in range(channels):
            samples.append((frame * 971 + channel * 131) % 20_000 - 10_000)
    payload = struct.pack("<" + "h" * len(samples), *samples)
    block_align = channels * 2
    byte_rate = rate * block_align
    header = b"RIFF" + (36 + len(payload)).to_bytes(4, "little") + b"WAVE"
    header += b"fmt " + (16).to_bytes(4, "little")
    header += struct.pack("<HHIIHH", 1, channels, rate, byte_rate, block_align, 16)
    header += b"data" + len(payload).to_bytes(4, "little")
    path.write_bytes(header + payload)


def _fixture_candidate(source: dict[str, object], *, candidate_id: str = "cand_fixture_001",
                       detector: str = "f0_change_candidate", pre: float = 77.6,
                       post: float = 75.25, rms_valley: float = 0.2,
                       onset_flux: float = 0.01) -> dict[str, object]:
    return {
        "schema": f"{SCHEMA}.candidate.v1",
        "candidate_id": candidate_id,
        "source": {
            "source_id": source["source_id"],
            "sha256": source["sha256"],
            "relative_path": source["relative_path"],
        },
        "region_frames": {
            "context_start": 2,
            "boundary_center": 6,
            "proposed_boundary_window": [5, 7],
            "context_end": 10,
        },
        "auto_evidence": {
            "detector_class": detector,
            "pre_midi_proxy": pre,
            "post_midi_proxy": post,
            "voicing_confidence": 0.95,
            "rms_valley_db_relative_to_stable_anchors": rms_valley,
            "onset_flux": onset_flux,
        },
        "status": "unreviewed",
        "automatic_detection_is_not_a_musical_gesture_label": True,
    }


TARGET_77_TO_74 = {
    "target_id": "77_to_74_continuous",
    "from_midi": 77.0,
    "to_midi": 74.0,
    "required_capability": "transition_retrieval",
    "gesture_classes": ["continuous_pitch_change"],
    "coverage_status_at_input": "missing_native_transition",
}


class TargetAuditionTest(unittest.TestCase):
    def test_one_global_shift_and_interval_error_are_separate(self) -> None:
        source = {"source_id": "src_fixture", "sha256": "a" * 64, "relative_path": "fixture.wav"}
        candidate = _fixture_candidate(source)
        row = rank_candidate(candidate, TARGET_77_TO_74)
        self.assertAlmostEqual(row["single_global_pitch_shift"]["semitones"], -0.925, places=5)
        self.assertAlmostEqual(row["interval_error"]["candidate_minus_target_semitones"], 0.65, places=5)
        self.assertAlmostEqual(row["endpoint_residual_after_single_global_shift"]["pre_semitones"], 0.325, places=5)
        self.assertAlmostEqual(row["endpoint_residual_after_single_global_shift"]["post_semitones"], -0.325, places=5)
        self.assertTrue(row["priority_gate"]["eligible_for_optional_gesture_warp_preview"])
        self.assertTrue(row["priority_gate"]["not_eligible_for_transition_bank_or_coverage"])
        self.assertAlmostEqual(
            row["boundary_continuity_proxies"]["absolute_rms_valley_db"], 0.2, places=5
        )

    def test_compatible_and_bounded_candidates_rank_before_unbounded_or_wrong_detector(self) -> None:
        source = {"source_id": "src_fixture", "sha256": "a" * 64, "relative_path": "fixture.wav"}
        bounded = _fixture_candidate(source, candidate_id="cand_bounded", pre=77.3, post=74.3)
        unbounded = _fixture_candidate(source, candidate_id="cand_unbounded", pre=70.0, post=67.0)
        wrong_detector = _fixture_candidate(
            source, candidate_id="cand_wrong_detector", detector="same_pitch_onset_candidate", pre=77.0, post=74.0
        )
        rows = rank_for_target([unbounded, wrong_detector, bounded], TARGET_77_TO_74)
        self.assertEqual([row["candidate_id"] for row in rows], ["cand_bounded", "cand_unbounded", "cand_wrong_detector"])

    def test_boundary_continuity_proxies_break_an_equal_pitch_tie_without_claiming_quality(self) -> None:
        source = {"source_id": "src_fixture", "sha256": "a" * 64, "relative_path": "fixture.wav"}
        smoother = _fixture_candidate(
            source, candidate_id="cand_smoother", pre=77.3, post=74.3, rms_valley=0.1, onset_flux=0.002
        )
        rougher = _fixture_candidate(
            source, candidate_id="cand_rougher", pre=77.3, post=74.3, rms_valley=1.1, onset_flux=0.04
        )
        rows = rank_for_target([rougher, smoother], TARGET_77_TO_74)
        self.assertEqual([row["candidate_id"] for row in rows], ["cand_smoother", "cand_rougher"])
        self.assertTrue(rows[0]["boundary_continuity_proxies"]["not_a_slur_breath_or_quality_label"])

    def test_build_emits_exact_raw_source_samples_without_approval(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            raw_root = root / "raw"
            raw_root.mkdir()
            raw = raw_root / "fixture.wav"
            _write_pcm16(raw)
            descriptor = inspect_wav(raw)
            source = {
                "source_id": "src_fixture",
                "sha256": descriptor["sha256"],
                "relative_path": "fixture.wav",
                "native": {"frame_count": descriptor["native_audio"]["frame_count"]},
            }
            bundle = root / "bundle"
            bundle.mkdir()
            (bundle / "source_catalog.json").write_text(json.dumps({
                "schema": f"{SCHEMA}.source-catalog.v1", "files": [source],
            }), encoding="utf-8")
            (bundle / "coverage.json").write_text(json.dumps({
                "schema": f"{SCHEMA}.coverage.v1", "targets": [{
                    **TARGET_77_TO_74,
                    "status": "missing_native_transition",
                    "approved_label_ids": [],
                }], "unreviewed_candidates_do_not_close_coverage": True,
            }), encoding="utf-8")
            (bundle / "candidates.jsonl").write_text(
                json.dumps(_fixture_candidate(source)) + "\n", encoding="utf-8"
            )
            output = root / "review"
            provenance = build_target_priority(bundle, raw_root, output, top_per_target=1)
            self.assertEqual(provenance["counts"]["shortlist_rows"], 1)
            review = json.loads((output / "target_priority.json").read_text(encoding="utf-8"))
            row = review["targets"][0]["shortlist"][0]
            self.assertEqual(row["automatic_candidate"]["status"], "unreviewed")
            self.assertTrue(row["priority_gate"]["not_eligible_for_transition_bank_or_coverage"])
            raw_meta = row["raw_auditions"]["A_raw_context"]
            crop = output / raw_meta["artifact"]
            crop_descriptor = inspect_wav(crop)
            self.assertEqual(crop_descriptor["native_audio"]["frame_count"], 8)
            source_native = descriptor["native_audio"]
            crop_native = crop_descriptor["native_audio"]
            start = 2 * source_native["block_align_bytes"] + source_native["data_offset_bytes"]
            length = 8 * source_native["block_align_bytes"]
            expected = raw.read_bytes()[start:start + length]
            actual_start = crop_native["data_offset_bytes"]
            actual = crop.read_bytes()[actual_start:actual_start + crop_native["data_byte_length"]]
            self.assertEqual(actual, expected)
            self.assertEqual(hashlib.sha256(actual).hexdigest(), raw_meta["source_sample_bytes_sha256"])
            for text_path in [output / "target_priority.json", output / "audition_manifest.jsonl", output / "index.html"]:
                self.assertNotIn(str(raw_root), text_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
