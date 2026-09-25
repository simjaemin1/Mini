#!/usr/bin/env python3
"""Fail-closed contract tests for the full-Arirang B1/B2-R packer."""

from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil
import sys
import unittest


HERE = Path(__file__).resolve().parent
REPOSITORY_ROOT = HERE.parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from build_full_ari_reference_contour_audition_pack import (  # noqa: E402
    MANIFEST_FILENAME,
    OUTPUT_AUDIO_NAMES,
    REFERENCE_DURATION_SECONDS,
    REFERENCE_END_SECONDS,
    REFERENCE_EVENT_ID,
    REFERENCE_FADE_SECONDS,
    REFERENCE_FADE_SHAPE,
    REFERENCE_FINAL_FRAME,
    REFERENCE_FINAL_SOURCE_NORMALIZED_TIME,
    REFERENCE_INTERPOLATION,
    REFERENCE_ONSET_SECONDS,
    REFERENCE_SCHEMA,
    REFERENCE_SELECTION_STATUS,
    REFERENCE_START_FRAME,
    REFERENCE_START_SECONDS,
    REFERENCE_STATUS,
    REFERENCE_TIME_MAPPING,
    REFERENCE_CLAIM_BOUNDARY,
    ROLES,
    SHARED_SINE_EVENT_ID,
    ReferenceContourPackError,
    _reference_expected_cents,
    _sine_expected_cents,
    build_full_ari_reference_contour_audition_pack,
)
from make_full_ari_reference_contour_spec import (  # noqa: E402
    make_full_ari_reference_contour_spec,
)


BASE_TEST_PATH = (
    HERE.parent
    / "full-ari-yoseong-audition-pack"
    / "test_build_full_ari_yoseong_audition_pack.py"
)
base_spec = importlib.util.spec_from_file_location("_full_ari_base_fixture", BASE_TEST_PATH)
assert base_spec is not None and base_spec.loader is not None
base = importlib.util.module_from_spec(base_spec)
sys.modules[base_spec.name] = base
base_spec.loader.exec_module(base)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def _replace_event_id(value: object, old: str, new: str) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "event_id" and child == old:
                value[key] = new
            elif key == "id" and child == old:
                value[key] = new
            else:
                _replace_event_id(child, old, new)
    elif isinstance(value, list):
        for child in value:
            _replace_event_id(child, old, new)


def _rename_controls(path: Path) -> None:
    rows: list[dict[str, str]] = []
    with path.open("r", encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        fieldnames = list(reader.fieldnames or ())
        for row in reader:
            if row["event_id"] == "b08_e0":
                row["event_id"] = SHARED_SINE_EVENT_ID
            elif row["event_id"] == "b16_e0":
                row["event_id"] = REFERENCE_EVENT_ID
            elif row["event_id"] == "b16_release":
                row["event_id"] = "b16_final_release"
            rows.append(row)
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _rename_candidate_ids(report_path: Path, plan_path: Path, policy_path: Path) -> None:
    replacements = (
        ("b08_e0", SHARED_SINE_EVENT_ID),
        ("b16_e0", REFERENCE_EVENT_ID),
        ("b16_release", "b16_final_release"),
    )
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    policy = json.loads(policy_path.read_text(encoding="utf-8"))
    report = json.loads(report_path.read_text(encoding="utf-8"))
    for old, new in replacements:
        _replace_event_id(plan, old, new)
        _replace_event_id(policy, old, new)
        _replace_event_id(report, old, new)
    _write_json(plan_path, plan)
    policy["input"]["plan_sha256"] = _sha256(plan_path)
    _write_json(policy_path, policy)
    controls_path = report_path.parent / report["outputs"]["controls_csv"]["basename"]
    _rename_controls(controls_path)
    report["score_plan"]["plan"]["sha256"] = _sha256(plan_path)
    report["outputs"]["controls_csv"]["sha256"] = _sha256(controls_path)
    _write_json(report_path, report)


def _rewrite_b1_sine_controls(report_path: Path) -> None:
    report = json.loads(report_path.read_text(encoding="utf-8"))
    events = {
        event["id"]: event
        for event in report["score_plan"]["events"]
        if event["id"] in {SHARED_SINE_EVENT_ID, REFERENCE_EVENT_ID}
    }
    controls_path = report_path.parent / report["outputs"]["controls_csv"]["basename"]
    rows: list[dict[str, str]] = []
    with controls_path.open("r", encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        fieldnames = list(reader.fieldnames or ())
        for row in reader:
            event = events.get(row["event_id"])
            if event is not None:
                cents = _sine_expected_cents(event, float(row["time_seconds"]))
                nominal = float(event["pitch_hz"])
                row["vibrato_cents"] = repr(cents)
                row["f0_hz"] = repr(nominal * 2.0 ** (cents / 1200.0))
            rows.append(row)
    with controls_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    report["outputs"]["controls_csv"]["sha256"] = _sha256(controls_path)
    _write_json(report_path, report)


def _reference_block(reference_path: Path, reference: dict[str, object]) -> dict[str, object]:
    selection = reference["selection"]
    assert isinstance(selection, dict)
    source = selection["source"]
    assert isinstance(source, dict)
    contour = selection["normalized_reference_contour"]
    assert isinstance(contour, dict)
    return {
        "status": REFERENCE_STATUS,
        "onset_seconds": REFERENCE_ONSET_SECONDS,
        "duration_seconds": REFERENCE_DURATION_SECONDS,
        "fade_in_seconds": REFERENCE_FADE_SECONDS,
        "fade_out_seconds": REFERENCE_FADE_SECONDS,
        "fade_shape": REFERENCE_FADE_SHAPE,
        "source_artifact": {
            "relative_path": "tools/daegeum-vibrato-reference/reference_shape_unreviewed.ngc-20260925.json",
            "sha256": _sha256(reference_path),
            "schema": REFERENCE_SCHEMA,
            "candidate_id": selection["candidate_id"],
            "selection_status": selection["status"],
            "contour_payload_sha256": contour["contour_payload_sha256"],
            "source_id": source["source_id"],
            "source_sha256": source["source_sha256"],
            "rights_status": source["rights_status"],
        },
        "normalized_reference_contour": contour,
        "claim_limits": selection["claim_limits"],
    }


def _rewrite_b2_controls(path: Path, reference: dict[str, object]) -> None:
    rows: list[dict[str, str]] = []
    with path.open("r", encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        fieldnames = list(reader.fieldnames or ())
        for row in reader:
            frame = int(row["frame_index"])
            if row["event_id"] == REFERENCE_EVENT_ID:
                selection = reference["selection"]
                assert isinstance(selection, dict)
                cents = _reference_expected_cents(
                    {"normalized_reference_contour": selection["normalized_reference_contour"]},
                    frame,
                )
                row["vibrato_cents"] = repr(cents)
                nominal = 392.0
                row["f0_hz"] = repr(nominal * 2.0 ** (cents / 1200.0))
            rows.append(row)
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _make_b2r(
    root: Path,
    report_path: Path,
    plan_path: Path,
    policy_path: Path,
    reference_path: Path,
) -> None:
    reference = json.loads(reference_path.read_text(encoding="utf-8"))
    block = _reference_block(reference_path, reference)
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    for event in plan["events"]:
        if event["id"] == SHARED_SINE_EVENT_ID:
            event["vibrato"] = {
                "enabled": True,
                "rate_hz": 3.45,
                "depth_cents": 18.0,
                "onset_seconds": 0.72,
                "ramp_seconds": 0.18,
                "end_fade_seconds": 0.18,
            }
        elif event["id"] == REFERENCE_EVENT_ID:
            event["vibrato"] = {"enabled": False}
            event["reference_contour"] = block
        elif event["id"] == "b16_final_release":
            event["release_source"]["vibrato"] = {"enabled": False}
    _write_json(plan_path, plan)

    policy = json.loads(policy_path.read_text(encoding="utf-8"))
    policy["input"]["plan_sha256"] = _sha256(plan_path)
    policy["expression_policy"]["evidence_status"] = REFERENCE_STATUS
    policy["expression_policy"]["active_selection_provenance"] = {
        "status": "explicit_offline_rnd_audition_opt_in",
        "selected_event_ids": [SHARED_SINE_EVENT_ID, REFERENCE_EVENT_ID],
    }
    policy["fired_policy_rules"] = [
        {
            "event_id": SHARED_SINE_EVENT_ID,
            "policy_rule_id": "gyeonggi_ari.v1.sustained_before_rest_late_yoseong_candidate",
            "decision": "selected",
        },
        {
            "event_id": REFERENCE_EVENT_ID,
            "policy_rule_id": "gyeonggi_ari.v1.global_cadence_late_yoseong_candidate",
            "decision": REFERENCE_STATUS,
        },
    ]
    _write_json(policy_path, policy)

    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["score_plan"]["events"] = json.loads(plan_path.read_text(encoding="utf-8"))["events"]
    report["score_plan"]["plan"]["sha256"] = _sha256(plan_path)
    controls_path = report_path.parent / report["outputs"]["controls_csv"]["basename"]
    _rewrite_b2_controls(controls_path, reference)
    selection = reference["selection"]
    source = selection["source"]
    contour = selection["normalized_reference_contour"]
    nominal = 392.0
    report["score_controls"]["reference_contour_control_qa"] = {
        "passed": True,
        "status": REFERENCE_STATUS,
        "event_count": 1,
        "claim_boundary": REFERENCE_CLAIM_BOUNDARY,
        "events": [{
            "event_id": REFERENCE_EVENT_ID,
            "status": REFERENCE_STATUS,
            "candidate_id": selection["candidate_id"],
            "source_id": source["source_id"],
            "source_sha256": source["source_sha256"],
            "source_artifact_sha256": _sha256(reference_path),
            "contour_payload_sha256": contour["contour_payload_sha256"],
            "rights_status": source["rights_status"],
            "source_sample_count": 65,
            "source_duration_seconds": REFERENCE_DURATION_SECONDS,
            "applied_duration_seconds": REFERENCE_DURATION_SECONDS,
            "time_mapping": REFERENCE_TIME_MAPPING,
            "interpolation": REFERENCE_INTERPOLATION,
            "onset_seconds_relative": REFERENCE_ONSET_SECONDS,
            "event_start_seconds": 32.4,
            "contour_start_seconds": REFERENCE_START_SECONDS,
            "contour_end_seconds": REFERENCE_END_SECONDS,
            "fade_in_seconds": REFERENCE_FADE_SECONDS,
            "fade_out_seconds": REFERENCE_FADE_SECONDS,
            "fade_shape": REFERENCE_FADE_SHAPE,
            "first_active_frame_index": REFERENCE_START_FRAME,
            "first_active_vibrato_cents": 0.0,
            "final_active_frame_index": REFERENCE_FINAL_FRAME,
            "final_active_vibrato_cents": 0.0,
            "final_active_f0_hz": nominal,
            "nominal_pitch_hz": nominal,
            "first_boundary_zero_gate_passed": True,
            "final_boundary_zero_gate_passed": True,
            "final_nominal_pitch_gate_passed": True,
            "nonzero_interior_frame_count": 373,
            "expected_active_control_frame_count": 375,
            "active_control_frame_count": 375,
            "truncated_before_reference_contour": False,
            "truncated_during_reference_contour": False,
            "final_source_normalized_time": REFERENCE_FINAL_SOURCE_NORMALIZED_TIME,
            "source_endpoint_remapped_to_final_half_open_row": False,
            "no_time_compression_gate_passed": True,
        }],
        "learned_claim": False,
        "style_aligned_claim": False,
        "human_reviewed_claim": False,
        "training_or_game_clearance": False,
    }
    report["outputs"]["controls_csv"]["sha256"] = _sha256(controls_path)
    _write_json(report_path, report)


def _copy_as_b2r(root: Path, b1: tuple[Path, Path, Path]) -> tuple[Path, Path, Path]:
    b1_report, b1_plan, b1_policy = b1
    source_dir = b1_report.parent
    destination_dir = root / "_bgm_rnd/runtime-B2R"
    shutil.copytree(source_dir, destination_dir)
    report_path = destination_dir / "runtime_report.json"
    plan_path = root / "_bgm_rnd/B2R_full_plan.json"
    policy_path = root / "_bgm_rnd/B2R_policy.json"
    shutil.copyfile(b1_plan, plan_path)
    shutil.copyfile(b1_policy, policy_path)
    return report_path, plan_path, policy_path


def _fixture() -> tuple[object, Path, str, Path, dict[str, tuple[Path, Path, Path]]]:
    temporary, root, baseline, _ = base._fixture()
    b1 = (
        root / "_bgm_rnd/runtime-B1/runtime_report.json",
        root / "_bgm_rnd/B1_full_plan.json",
        root / "_bgm_rnd/B1_policy.json",
    )
    _rename_candidate_ids(*b1)
    _rewrite_b1_sine_controls(b1[0])
    b2r = _copy_as_b2r(root, b1)
    reference_path = (
        root
        / "tools/daegeum-vibrato-reference/reference_shape_unreviewed.ngc-20260925.json"
    )
    reference_path.parent.mkdir(parents=True)
    shutil.copyfile(
        REPOSITORY_ROOT
        / "tools/daegeum-vibrato-reference/reference_shape_unreviewed.ngc-20260925.json",
        reference_path,
    )
    _make_b2r(root, *b2r, reference_path)
    spec_path = root / "_bgm_rnd/reference-contour-spec.json"
    make_full_ari_reference_contour_spec(
        root,
        spec_path,
        b1_runtime_report=b1[0],
        b1_plan=b1[1],
        b1_policy_manifest=b1[2],
        b2r_runtime_report=b2r[0],
        b2r_plan=b2r[1],
        b2r_policy_manifest=b2r[2],
        reference_artifact=reference_path,
    )
    return temporary, root, baseline, spec_path, {"B1": b1, "B2-R": b2r}


def _rehash_candidate(spec_path: Path, slot: str, artifact: str, path: Path) -> None:
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    spec["candidates"][slot][artifact]["sha256"] = _sha256(path)
    _write_json(spec_path, spec)


class FullAriReferenceContourPackTests(unittest.TestCase):
    def test_builds_byte_exact_offline_unreviewed_pack(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        output = root / "_bgm_rnd/B1-B2R-pack"
        manifest = build_full_ari_reference_contour_audition_pack(
            root, spec, output, baseline_revision=baseline
        )
        self.assertEqual(manifest["status"], "succeeded")
        self.assertTrue(manifest["comparison_contract"]["b08_exact_B1_sine_preserved"])
        self.assertEqual(
            manifest["comparison_contract"]["only_changed_expression_event_id"],
            REFERENCE_EVENT_ID,
        )
        self.assertFalse(manifest["scope"]["learned_result"])
        self.assertFalse(manifest["scope"]["gyeonggi_style_validated"])
        self.assertFalse(manifest["scope"]["training_item"])
        self.assertFalse(manifest["scope"]["game_asset"])
        reference_qa = manifest["candidates"]["B2-R"]["reference_contour_qa"]
        self.assertEqual(reference_qa["applied_duration_seconds"], 1.5)
        self.assertTrue(reference_qa["boundary_rows_zero_cents"])
        for slot, filename in OUTPUT_AUDIO_NAMES.items():
            source_report = json.loads(artifacts[slot][0].read_text(encoding="utf-8"))
            source_audio = artifacts[slot][0].parent / source_report["outputs"]["checkpoint_native_reverb_score_length_wav"]["basename"]
            self.assertEqual(_sha256(source_audio), _sha256(output / filename))
        self.assertTrue((output / MANIFEST_FILENAME).is_file())

    def test_spec_generator_pins_reference_candidate_and_payload(self) -> None:
        temporary, root, _, spec_path, _ = _fixture()
        self.addCleanup(temporary.cleanup)
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        reference = spec["reference_artifact"]
        self.assertEqual(reference["expected_candidate_id"], "ref_56a286f5764ffe3d")
        self.assertEqual(
            reference["expected_contour_payload_sha256"],
            "3ecbf6f2e7a40118b47d28550ddbec75af9b56df3a8098550ea2d21c702eab0f",
        )

    def test_rejects_nonzero_reference_boundary(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        report_path = artifacts["B2-R"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        controls_path = report_path.parent / report["outputs"]["controls_csv"]["basename"]
        with controls_path.open("r", encoding="utf-8", newline="") as stream:
            rows = list(csv.DictReader(stream))
        rows[REFERENCE_FINAL_FRAME]["vibrato_cents"] = "0.5"
        with controls_path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        report["outputs"]["controls_csv"]["sha256"] = _sha256(controls_path)
        _write_json(report_path, report)
        _rehash_candidate(spec, "B2-R", "runtime_report", report_path)
        with self.assertRaisesRegex(ReferenceContourPackError, "boundary fades"):
            build_full_ari_reference_contour_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )

    def test_rejects_time_compression_claim(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        report_path = artifacts["B2-R"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        qa = report["score_controls"]["reference_contour_control_qa"]["events"][0]
        qa["applied_duration_seconds"] = 1.2
        qa["no_time_compression_gate_passed"] = False
        _write_json(report_path, report)
        _rehash_candidate(spec, "B2-R", "runtime_report", report_path)
        with self.assertRaisesRegex(ReferenceContourPackError, "applied_duration_seconds"):
            build_full_ari_reference_contour_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )

    def test_rejects_b08_drift_from_B1(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        report_path = artifacts["B2-R"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        controls_path = report_path.parent / report["outputs"]["controls_csv"]["basename"]
        with controls_path.open("r", encoding="utf-8", newline="") as stream:
            rows = list(csv.DictReader(stream))
        b08_row = next(row for row in rows if row["event_id"] == SHARED_SINE_EVENT_ID and abs(float(row["vibrato_cents"])) > 1.0e-9)
        b08_row["vibrato_cents"] = repr(float(b08_row["vibrato_cents"]) + 0.01)
        with controls_path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        report["outputs"]["controls_csv"]["sha256"] = _sha256(controls_path)
        _write_json(report_path, report)
        _rehash_candidate(spec, "B2-R", "runtime_report", report_path)
        with self.assertRaisesRegex(ReferenceContourPackError, "exact B1 sine"):
            build_full_ari_reference_contour_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )

    def test_rejects_reference_payload_tamper_even_when_file_hash_is_repinned(self) -> None:
        temporary, root, baseline, spec_path, _ = _fixture()
        self.addCleanup(temporary.cleanup)
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        reference_path = root / spec["reference_artifact"]["path"]
        reference = json.loads(reference_path.read_text(encoding="utf-8"))
        reference["selection"]["normalized_reference_contour"]["pitch_residual_cents"][4] += 0.25
        _write_json(reference_path, reference)
        spec["reference_artifact"]["sha256"] = _sha256(reference_path)
        _write_json(spec_path, spec)
        with self.assertRaisesRegex(ReferenceContourPackError, "payload SHA"):
            build_full_ari_reference_contour_audition_pack(
                root, spec_path, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )

    def test_rejects_non_B0_gain_source(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        report_path = artifacts["B2-R"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        report["checkpoint_native_reverb_audition"]["level_match"]["gain_source_slot"] = "B2-R"
        _write_json(report_path, report)
        _rehash_candidate(spec, "B2-R", "runtime_report", report_path)
        with self.assertRaisesRegex(ReferenceContourPackError, "gain source must be B0"):
            build_full_ari_reference_contour_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )


if __name__ == "__main__":
    unittest.main()
