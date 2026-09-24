#!/usr/bin/env python3
"""Deterministic checks for complete native-span Daegeum audition exports."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from native_wav import inspect_wav  # noqa: E402
from phrase_span_audition import (  # noqa: E402
    PHRASE_SPAN_AUDITION_SCHEMA,
    SCHEMA,
    PhraseSpanAuditionError,
    build_phrase_span_audition,
)


def _write_pcm16(path: Path, *, frames: int = 100, rate: int = 1000, channels: int = 2) -> None:
    values: list[int] = []
    for frame in range(frames):
        for channel in range(channels):
            # The unique per-frame values make a missing 20-frame middle gap
            # observable in a byte-for-byte assertion below.
            values.append(((frame * 461 + channel * 97) % 20_000) - 10_000)
    payload = struct.pack("<" + "h" * len(values), *values)
    block_align = channels * 2
    byte_rate = rate * block_align
    header = b"RIFF" + (36 + len(payload)).to_bytes(4, "little") + b"WAVE"
    header += b"fmt " + (16).to_bytes(4, "little") + struct.pack(
        "<HHIIHH", 1, channels, rate, byte_rate, block_align, 16
    )
    header += b"data" + len(payload).to_bytes(4, "little")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header + payload)


def _truth_status() -> dict[str, bool]:
    return {
        "all_events_unreviewed": True,
        "automatic_detection_is_not_a_musical_gesture_label": True,
        "same_source_identity_verified": True,
        "strict_temporal_ordering_of_boundary_centers_verified": True,
        "not_evidence_of_same_breath": True,
        "not_evidence_of_slur": True,
        "not_evidence_of_natural_legato": True,
        "not_approved_transition_path": True,
        "not_transition_bank_item": True,
        "not_training_item": True,
        "not_game_asset": True,
    }


def _event(candidate_id: str, *, start: int, center: int, end: int) -> dict[str, object]:
    return {
        "candidate_id": candidate_id,
        "automatic_candidate": {
            "status": "unreviewed",
            "automatic_detection_is_not_a_musical_gesture_label": True,
        },
        "native_region_frames": {
            "context_start": start,
            "boundary_center": center,
            "proposed_boundary_window": [center - 2, center + 2],
            "context_end": end,
        },
    }


def _selected_path(source: dict[str, object], *, pitch: float = -0.5,
                   within_preferred: bool = True, include_events: bool = True,
                   include_pitch_proxy: bool = True) -> dict[str, object]:
    row: dict[str, object] = {
        "path_id": "path_src_fixture__cand_a__cand_b",
        "source": {
            "source_id": source["source_id"],
            "sha256": source["sha256"],
            "relative_path": source["relative_path"],
            "sample_rate_hz": source["native"]["sample_rate_hz"],
            "frame_count": source["native"]["frame_count"],
        },
        "automatic_path_status": _truth_status(),
        "native_source_span": {
            "frame_range": [10, 80],
            "frame_count": 70,
            "all_intermediate_native_source_frames_are_referenced_without_a_cross_recording_splice": True,
        },
    }
    if include_events:
        row["events"] = [
            _event("cand_a", start=10, center=24, end=35),
            _event("cand_b", start=55, center=67, end=80),
        ]
    if include_pitch_proxy:
        row["one_global_pitch_shift_proxy"] = {
            "semitones": pitch,
            "within_preferred_maximum": within_preferred,
            "preferred_maximum_semitones": 2.0,
            "not_applied_to_any_source_audio": True,
        }
    return row


def _fixture(root: Path, *, selected: dict[str, object] | None = None) -> dict[str, Path | dict[str, object]]:
    raw_root = root / "raw"
    raw = raw_root / "phrases" / "fixture.wav"
    _write_pcm16(raw)
    descriptor = inspect_wav(raw)
    source: dict[str, object] = {
        "source_id": "src_fixture",
        "sha256": descriptor["sha256"],
        "relative_path": "phrases/fixture.wav",
        "native": {
            "sample_rate_hz": descriptor["native_audio"]["sample_rate_hz"],
            "frame_count": descriptor["native_audio"]["frame_count"],
        },
    }
    bundle = root / "bundle"
    bundle.mkdir()
    catalog = {"schema": f"{SCHEMA}.source-catalog.v1", "files": [source]}
    catalog_path = bundle / "source_catalog.json"
    catalog_path.write_text(json.dumps(catalog, sort_keys=True), encoding="utf-8")
    candidates_path = bundle / "candidates.jsonl"
    candidates_path.write_text(json.dumps({"fixture": "only-used-for-report-digest"}) + "\n", encoding="utf-8")
    path = selected if selected is not None else _selected_path(source)
    report = {
        "schema": f"{SCHEMA}.same-source-sequence-retrieval.v1",
        "input_bundle": {
            "directory_basename": bundle.name,
            "source_catalog_sha256": hashlib.sha256(catalog_path.read_bytes()).hexdigest(),
            "candidates_jsonl_sha256": hashlib.sha256(candidates_path.read_bytes()).hexdigest(),
        },
        "paths": [path],
    }
    retrieval = root / "sequence_retrieval.json"
    retrieval.write_text(json.dumps(report, sort_keys=True), encoding="utf-8")
    return {
        "raw_root": raw_root,
        "raw": raw,
        "bundle": bundle,
        "retrieval": retrieval,
        "source": source,
        "path": path,
    }


class PhraseSpanAuditionTest(unittest.TestCase):
    def test_complete_span_is_byte_exact_contiguous_and_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = _fixture(root)
            outputs = [root / "out_a", root / "out_b"]
            results = []
            for output in outputs:
                results.append(build_phrase_span_audition(
                    bundle_dir=fixture["bundle"],
                    raw_daegeum_dirs=fixture["raw_root"],
                    output_dir=output,
                    sequence_retrieval=fixture["retrieval"],
                    path_id="path_src_fixture__cand_a__cand_b",
                ))
            first_output = outputs[0]
            raw_span = first_output / "A_native_complete_source_span.wav"
            source_descriptor = inspect_wav(fixture["raw"])
            span_descriptor = inspect_wav(raw_span)
            source_native = source_descriptor["native_audio"]
            span_native = span_descriptor["native_audio"]
            self.assertEqual(span_native["frame_count"], 70)
            self.assertEqual(span_native["sample_rate_hz"], source_native["sample_rate_hz"])
            start_byte = source_native["data_offset_bytes"] + 10 * source_native["block_align_bytes"]
            length = 70 * source_native["block_align_bytes"]
            expected = fixture["raw"].read_bytes()[start_byte:start_byte + length]
            actual_start = span_native["data_offset_bytes"]
            actual = raw_span.read_bytes()[actual_start:actual_start + span_native["data_byte_length"]]
            self.assertEqual(actual, expected)
            raw_meta = results[0]["A_native_complete_source_span"]
            self.assertTrue(raw_meta["no_candidate_clip_stitching_or_crossfade"])
            self.assertEqual(raw_meta["source_sample_bytes_sha256"], hashlib.sha256(actual).hexdigest())
            self.assertEqual(
                (outputs[0] / "span_audition.json").read_bytes(),
                (outputs[1] / "span_audition.json").read_bytes(),
            )
            self.assertEqual(raw_span.read_bytes(), (outputs[1] / raw_span.name).read_bytes())
            manifest_text = (first_output / "span_audition.json").read_text(encoding="utf-8")
            self.assertNotIn(str(root), manifest_text)
            self.assertEqual(results[0]["schema"], PHRASE_SPAN_AUDITION_SCHEMA)
            self.assertTrue(results[0]["interpretation_limits"]["not_a_game_asset"])

    def test_report_integrity_and_raw_sha_are_verified_before_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = _fixture(root)
            report = json.loads(fixture["retrieval"].read_text(encoding="utf-8"))
            report["input_bundle"]["source_catalog_sha256"] = "0" * 64
            fixture["retrieval"].write_text(json.dumps(report), encoding="utf-8")
            with self.assertRaises(PhraseSpanAuditionError):
                build_phrase_span_audition(
                    bundle_dir=fixture["bundle"], raw_daegeum_dirs=fixture["raw_root"],
                    output_dir=root / "bad_catalog", sequence_retrieval=fixture["retrieval"],
                    path_id="path_src_fixture__cand_a__cand_b",
                )
            self.assertFalse((root / "bad_catalog").exists())
            # Restore an integrity-correct report, then make the only raw path
            # different: it must not be accepted merely by name.
            fixture = _fixture(root / "sha_case")
            fixture["raw"].write_bytes(fixture["raw"].read_bytes() + b"changed")
            with self.assertRaises(PhraseSpanAuditionError):
                build_phrase_span_audition(
                    bundle_dir=fixture["bundle"], raw_daegeum_dirs=fixture["raw_root"],
                    output_dir=root / "bad_raw", sequence_retrieval=fixture["retrieval"],
                    path_id="path_src_fixture__cand_a__cand_b",
                )
            self.assertFalse((root / "bad_raw").exists())

    def test_unsafe_preview_is_never_rendered(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            raw_root = root / "raw"
            # Build normally, then produce a report with a deliberately
            # unbounded global proxy so only raw A can be exported.
            fixture = _fixture(root)
            report = json.loads(fixture["retrieval"].read_text(encoding="utf-8"))
            report["paths"][0]["one_global_pitch_shift_proxy"]["semitones"] = 2.5
            report["paths"][0]["one_global_pitch_shift_proxy"]["within_preferred_maximum"] = False
            fixture["retrieval"].write_text(json.dumps(report), encoding="utf-8")
            calls: list[list[str]] = []

            def forbidden_runner(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
                calls.append(command)
                raise AssertionError("unsafe preview must never invoke Rubber Band")

            result = build_phrase_span_audition(
                bundle_dir=fixture["bundle"], raw_daegeum_dirs=raw_root,
                output_dir=root / "unsafe", sequence_retrieval=fixture["retrieval"],
                path_id="path_src_fixture__cand_a__cand_b", render_global_preview=True,
                command_runner=forbidden_runner,
            )
            preview = result["P_optional_global_pitch_time_preview"]
            self.assertEqual(preview["status"], "not_rendered_outside_bounded_global_preview_gate")
            self.assertFalse(preview["preview_gate"]["all_conditions_met"])
            self.assertEqual(calls, [])
            self.assertTrue((root / "unsafe" / "A_native_complete_source_span.wav").is_file())
            self.assertFalse((root / "unsafe" / "P_global_pitch_time_preview.wav").exists())

    def test_safe_preview_is_uniform_and_explicitly_synthetic(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = _fixture(root)
            fake_executable = root / "fake-rubberband"
            fake_executable.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            fake_executable.chmod(0o755)
            commands: list[list[str]] = []

            def fake_runner(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
                commands.append(command)
                # This deliberately only tests safe command wiring.  It is not
                # an acoustic claim: production uses actual Rubber Band.
                Path(command[-1]).write_bytes(Path(command[-2]).read_bytes())
                return subprocess.CompletedProcess(command, 0, "", "")

            output = root / "safe"
            result = build_phrase_span_audition(
                bundle_dir=fixture["bundle"], raw_daegeum_dirs=fixture["raw_root"], output_dir=output,
                sequence_retrieval=fixture["retrieval"], path_id="path_src_fixture__cand_a__cand_b",
                render_global_preview=True, global_time_ratio=1.1, rubberband=str(fake_executable),
                command_runner=fake_runner,
            )
            self.assertEqual(len(commands), 1)
            command = commands[0]
            self.assertIn("--time", command)
            self.assertEqual(command[command.index("--time") + 1], "1.100000000")
            self.assertIn("--pitch", command)
            self.assertEqual(command[command.index("--pitch") + 1], "-0.500000000")
            preview = result["P_optional_global_pitch_time_preview"]
            self.assertEqual(preview["status"], "rendered")
            self.assertTrue(preview["not_source_faithful"])
            self.assertTrue(preview["not_native_legato"])
            self.assertTrue(preview["not_approved_transition"])
            self.assertTrue(preview["not_game_asset"])
            self.assertTrue((output / "P_global_pitch_time_preview.wav").is_file())

    def test_generic_selected_row_without_events_or_pitch_proxy_can_export_raw_A(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = _fixture(root)
            direct = copy.deepcopy(fixture["path"])
            direct.pop("events")
            direct.pop("one_global_pitch_shift_proxy")
            # This mirrors a future direct-span selected row: catalog identity
            # and exact span are sufficient for raw source-faithful export;
            # the optional synthetic preview remains unavailable.
            direct["source"].pop("sample_rate_hz")
            direct["source"].pop("frame_count")
            direct_path = root / "selected-path.json"
            direct_path.write_text(json.dumps(direct), encoding="utf-8")
            result = build_phrase_span_audition(
                bundle_dir=fixture["bundle"], raw_daegeum_dirs=fixture["raw_root"], output_dir=root / "direct",
                path_json=direct_path,
            )
            self.assertEqual(result["input"]["selected_path"]["kind"], "standalone_selected_path")
            self.assertFalse(result["selected_path"]["span"]["event_native_coordinates_embedded_and_validated"])
            self.assertFalse(result["selected_path"]["global_pitch_shift_proxy"]["available"])
            self.assertEqual(result["P_optional_global_pitch_time_preview"]["status"], "not_requested")

    def test_direct_trajectory_report_uses_its_own_truth_aliases_and_feature_enclosure(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = _fixture(root)
            trajectory = copy.deepcopy(fixture["path"])
            trajectory["priority_rank"] = 1
            trajectory["automatic_path_status"] = {
                "source_is_one_verified_recording": True,
                "strictly_consecutive_voiced_feature_rows": True,
                "trajectory_was_scanned_directly_from_feature_npz_not_candidate_pairs": True,
                "all_results_remain_unreviewed": True,
                "not_evidence_of_same_breath": True,
                "not_evidence_of_slur": True,
                "not_evidence_of_natural_legato": True,
                "not_an_approved_transition_path": True,
                "not_a_transition_bank_item": True,
                "not_a_training_item": True,
                "not_a_game_asset": True,
            }
            trajectory["native_source_span"] = {
                "frame_range": [10, 80],
                "frame_range_is_an_unreviewed_feature_window_enclosure_for_raw_review_only": True,
                "not_a_verified_phrase_or_gesture_boundary": True,
            }
            trajectory.pop("events")
            trajectory["one_global_pitch_shift_proxy"].pop("not_applied_to_any_source_audio")
            trajectory["one_global_pitch_shift_proxy"]["not_applied_to_source_audio"] = True
            report = json.loads(fixture["retrieval"].read_text(encoding="utf-8"))
            report["schema"] = f"{SCHEMA}.direct-f0-trajectory-retrieval.v1"
            report.pop("paths")
            report["trajectories"] = [trajectory]
            report["input_bundle"].pop("candidates_jsonl_sha256")
            fixture["retrieval"].write_text(json.dumps(report), encoding="utf-8")
            result = build_phrase_span_audition(
                bundle_dir=fixture["bundle"], raw_daegeum_dirs=fixture["raw_root"], output_dir=root / "trajectory",
                sequence_retrieval=fixture["retrieval"], priority_rank=1,
            )
            self.assertEqual(result["input"]["selected_path"]["kind"], "direct_trajectory_retrieval_report")
            self.assertTrue(result["input"]["selected_path"]["source_catalog_link_verified"])
            self.assertIsNone(result["input"]["selected_path"]["candidates_link_verified"])
            self.assertEqual(result["selected_path"]["span"]["coordinate_kind"], "unreviewed_feature_window_enclosure")
            self.assertTrue((root / "trajectory" / "A_native_complete_source_span.wav").is_file())


if __name__ == "__main__":
    unittest.main()
