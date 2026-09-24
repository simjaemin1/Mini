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


def _boundary_truth_status() -> dict[str, bool]:
    return {
        "source_is_one_sha_verified_native_wav": True,
        "selected_direct_trajectory_remains_unreviewed": True,
        "all_results_remain_unreviewed": True,
        "unreviewed_automatic_boundary_candidate": True,
        "automatic_measurement_is_not_a_musical_phrase_label": True,
        "not_a_verified_musical_phrase": True,
        "not_evidence_of_same_breath": True,
        "not_evidence_of_slur": True,
        "not_evidence_of_natural_legato": True,
        "not_an_approved_transition": True,
        "not_an_approved_transition_or_phrase": True,
        "not_transition_bank_item": True,
        "not_a_transition_bank_item": True,
        "not_a_training_item": True,
        "not_a_game_asset": True,
    }


def _direct_trajectory_truth_status() -> dict[str, bool]:
    return {
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


def _phrase_boundary_triage_fixture(root: Path) -> dict[str, Path | dict[str, object]]:
    """Create one self-contained, source-led coordinate-only triage report."""

    fixture = _fixture(root)
    source = copy.deepcopy(fixture["source"])
    assert isinstance(source, dict)
    native = source["native"]
    assert isinstance(native, dict)
    native.update({"channels": 2, "encoding": "PCM"})
    catalog_path = fixture["bundle"] / "source_catalog.json"
    catalog_path.write_text(
        json.dumps({"schema": f"{SCHEMA}.source-catalog.v1", "files": [source]}, sort_keys=True),
        encoding="utf-8",
    )
    source_flat = {
        "source_id": source["source_id"],
        "sha256": source["sha256"],
        "relative_path": source["relative_path"],
        "sample_rate_hz": native["sample_rate_hz"],
        "frame_count": native["frame_count"],
    }
    trajectory_id = "trajectory_src_fixture_000020_000060_g01"
    trajectory_span = [20, 60]
    selected_trajectory = {
        "trajectory_id": trajectory_id,
        "priority_rank_at_retrieval": 1,
        "source": source_flat,
        "native_source_span": {
            "frame_range": trajectory_span,
            "frame_count": 40,
            "frame_range_is_an_unreviewed_feature_window_enclosure_for_raw_review_only": True,
        },
        "input_automatic_path_status_verbatim": _direct_trajectory_truth_status(),
    }
    candidate = {
        "candidate_id": "boundary_span_src_fixture_000010_000080",
        "priority_rank": 1,
        "source": source_flat,
        "selected_trajectory": {
            "trajectory_id": trajectory_id,
            "priority_rank_at_retrieval": 1,
            "trajectory_native_frame_range_enclosed": trajectory_span,
        },
        "native_source_span": {
            "frame_range": [10, 80],
            "frame_count": 70,
            "single_contiguous_source_frame_range": True,
            "trajectory_native_frame_range_enclosed": trajectory_span,
            "feature_center_derived_unreviewed_crop_coordinate_only": True,
            "not_a_verified_phrase_or_gesture_boundary": True,
        },
        "automatic_boundary_status": _boundary_truth_status(),
    }
    report = {
        "schema": f"{SCHEMA}.source-led-phrase-boundary-triage.v1",
        "artifact_kind": "unreviewed_source_led_low_energy_context_boundary_priority",
        "input": {
            "bundle": {
                "directory_basename": fixture["bundle"].name,
                "source_catalog_sha256": hashlib.sha256(catalog_path.read_bytes()).hexdigest(),
                "absolute_paths_omitted": True,
            },
            "trajectory_retrieval": {
                "basename": "direct_trajectory_retrieval.json",
                "sha256": "a" * 64,
                "schema": f"{SCHEMA}.direct-f0-trajectory-retrieval.v1",
                "source_catalog_link_verified": True,
            },
            "raw_source": {
                "source_basename": "fixture.wav",
                "sha256_verified_against_source_catalog": True,
                "native_descriptor_verified_against_source_catalog": True,
                "source_audio_not_decoded_or_written": True,
                "sample_rate_hz": 1000,
                "frame_count": 100,
                "channels": 2,
                "encoding": "PCM",
            },
        },
        "selected_trajectory": selected_trajectory,
        "interpretation_limits": {
            "source_audio_not_decoded_copied_written_or_rendered": True,
            "all_candidates_remain_unreviewed_not_musical_phrase_not_approved_not_game_assets": True,
            "low_energy_onset_and_release_proxies_are_not_breath_slur_legato_or_performance_labels": True,
            "no_candidate_is_added_to_transition_bank_training_set_or_runtime_bgm": True,
            "every_returned_span_is_one_contiguous_coordinate_range_in_one_sha_verified_source": True,
        },
        "candidates": [candidate],
    }
    triage = root / "phrase_boundary_triage.json"
    triage.write_text(json.dumps(report, sort_keys=True), encoding="utf-8")
    fixture.update({"source": source, "boundary_candidate": candidate, "triage": triage})
    return fixture


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
            self.assertEqual(
                result["selected_path"]["input_automatic_path_status_verbatim"],
                trajectory["automatic_path_status"],
            )
            self.assertTrue((root / "trajectory" / "A_native_complete_source_span.wav").is_file())

    def test_phrase_boundary_triage_exports_only_raw_lead_stem_with_strict_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = _phrase_boundary_triage_fixture(root)
            output = root / "boundary"
            result = build_phrase_span_audition(
                bundle_dir=fixture["bundle"],
                raw_daegeum_dirs=fixture["raw_root"],
                output_dir=output,
                phrase_boundary_triage=fixture["triage"],
                priority_rank=1,
            )
            raw_stem = output / "A_raw_lead_stem.wav"
            self.assertTrue(raw_stem.is_file())
            self.assertFalse((output / "A_native_complete_source_span.wav").exists())
            self.assertFalse((output / "P_global_pitch_time_preview.wav").exists())
            source_native = inspect_wav(fixture["raw"])["native_audio"]
            stem_native = inspect_wav(raw_stem)["native_audio"]
            self.assertEqual(stem_native["frame_count"], 70)
            start_byte = source_native["data_offset_bytes"] + 10 * source_native["block_align_bytes"]
            length = 70 * source_native["block_align_bytes"]
            expected = fixture["raw"].read_bytes()[start_byte:start_byte + length]
            actual = raw_stem.read_bytes()[
                stem_native["data_offset_bytes"]:stem_native["data_offset_bytes"] + stem_native["data_byte_length"]
            ]
            self.assertEqual(actual, expected)
            self.assertEqual(result["artifact_kind"], "unreviewed_source_led_raw_lead_stem_audition")
            self.assertEqual(result["A_raw_lead_stem"]["artifact"], "A_raw_lead_stem.wav")
            self.assertTrue(result["A_raw_lead_stem"]["source_audio_frames_byte_for_byte_copied"])
            self.assertEqual(result["A_raw_lead_stem"]["processing"]["gain"], "none")
            self.assertEqual(result["A_raw_lead_stem"]["processing"]["pitch_shift"], "none")
            self.assertEqual(result["A_raw_lead_stem"]["processing"]["time_stretch"], "none")
            self.assertEqual(result["P_optional_global_pitch_time_preview"]["status"], "not_requested")
            self.assertEqual(
                result["selected_path"]["input_automatic_boundary_status_verbatim"],
                fixture["boundary_candidate"]["automatic_boundary_status"],
            )
            self.assertEqual(
                result["selected_path"]["input_native_source_span_verbatim"],
                fixture["boundary_candidate"]["native_source_span"],
            )
            gate = result["input"]["phrase_boundary_triage_gate"]
            self.assertTrue(gate["source_catalog_sha256_link_verified"])
            self.assertTrue(gate["triage_raw_source_attestation_matches_catalog_and_actual_native_descriptor"])
            self.assertTrue(gate["raw_source_sha256_verified_via_candidate_catalog_and_actual_direct_wav"])
            self.assertTrue(gate["triage_candidate_and_report_trajectory_provenance_agree"])

    def test_phrase_boundary_triage_rejects_bad_native_attestation_before_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = _phrase_boundary_triage_fixture(root)
            report = json.loads(fixture["triage"].read_text(encoding="utf-8"))
            report["input"]["raw_source"]["channels"] = 1
            fixture["triage"].write_text(json.dumps(report), encoding="utf-8")
            output = root / "bad-native-attestation"
            with self.assertRaises(PhraseSpanAuditionError):
                build_phrase_span_audition(
                    bundle_dir=fixture["bundle"],
                    raw_daegeum_dirs=fixture["raw_root"],
                    output_dir=output,
                    phrase_boundary_triage=fixture["triage"],
                    priority_rank=1,
                )
            self.assertFalse(output.exists())

    def test_phrase_boundary_triage_rejects_catalog_status_and_trajectory_bypasses(self) -> None:
        cases = {
            "catalog": lambda report: report["input"]["bundle"].update({"source_catalog_sha256": "0" * 64}),
            "boundary-status": lambda report: report["candidates"][0]["automatic_boundary_status"].update(
                {"not_a_verified_musical_phrase": False}
            ),
            "trajectory-range": lambda report: report["candidates"][0]["native_source_span"].update(
                {"trajectory_native_frame_range_enclosed": [21, 60]}
            ),
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name, mutate in cases.items():
                with self.subTest(name=name):
                    fixture = _phrase_boundary_triage_fixture(root / name)
                    report = json.loads(fixture["triage"].read_text(encoding="utf-8"))
                    mutate(report)
                    # A valid generic status cannot substitute for the
                    # triage-specific boundary status field.
                    if name == "boundary-status":
                        report["candidates"][0]["automatic_path_status"] = _truth_status()
                    fixture["triage"].write_text(json.dumps(report), encoding="utf-8")
                    output = root / name / "rejected"
                    with self.assertRaises(PhraseSpanAuditionError):
                        build_phrase_span_audition(
                            bundle_dir=fixture["bundle"],
                            raw_daegeum_dirs=fixture["raw_root"],
                            output_dir=output,
                            phrase_boundary_triage=fixture["triage"],
                            priority_rank=1,
                        )
                    self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
