#!/usr/bin/env python3
"""Contract tests for the B1 / raw-reference / depth-matched pack."""

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
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from build_full_ari_reference_depth_audition_pack import (  # noqa: E402
    DEPTH_APPLICATION_ORDER,
    DEPTH_SCALE,
    DEPTH_STATUS,
    DEPTH_TRANSFORM_KIND,
    DEPTH_TRANSFORM_OPERATION,
    MANIFEST_FILENAME,
    OUTPUT_AUDIO_NAMES,
    ROLES,
    SOURCE_MAX_ABS_CENTS,
    TARGET_MAX_ABS_CENTS,
    REFERENCE_APPLICATION_SCOPE,
    ReferenceDepthPackError,
    build_full_ari_reference_depth_audition_pack,
    reference_pack,
)
from make_full_ari_reference_depth_spec import (  # noqa: E402
    make_full_ari_reference_depth_spec,
)


REFERENCE_TEST_PATH = (
    HERE.parent
    / "full-ari-reference-contour-audition-pack"
    / "test_full_ari_reference_contour_audition_pack.py"
)
fixture_spec = importlib.util.spec_from_file_location(
    "_reference_contour_pack_fixture", REFERENCE_TEST_PATH
)
assert fixture_spec is not None and fixture_spec.loader is not None
fixture = importlib.util.module_from_spec(fixture_spec)
sys.modules[fixture_spec.name] = fixture
fixture_spec.loader.exec_module(fixture)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def _clone_b2rd(root: Path, raw: tuple[Path, Path, Path]) -> tuple[Path, Path, Path]:
    raw_report, raw_plan, raw_policy = raw
    directory = root / "_bgm_rnd/runtime-B2Rd"
    shutil.copytree(raw_report.parent, directory)
    report = directory / "runtime_report.json"
    plan = root / "_bgm_rnd/B2Rd_full_plan.json"
    policy = root / "_bgm_rnd/B2Rd_policy.json"
    shutil.copyfile(raw_plan, plan)
    shutil.copyfile(raw_policy, policy)
    return report, plan, policy


def _correct_raw_fixture_nominal(raw: tuple[Path, Path, Path]) -> None:
    """Make the inherited synthetic fixture obey the real runtime F0 contract."""

    report_path, _, _ = raw
    report = json.loads(report_path.read_text(encoding="utf-8"))
    event = next(
        item
        for item in report["score_plan"]["events"]
        if item["id"] == reference_pack.REFERENCE_EVENT_ID
    )
    nominal = float(event["pitch_hz"])
    controls = report_path.parent / report["outputs"]["controls_csv"]["basename"]
    rows: list[dict[str, str]] = []
    with controls.open("r", encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        fieldnames = list(reader.fieldnames or ())
        for row in reader:
            if row["event_id"] == reference_pack.REFERENCE_EVENT_ID:
                cents = float(row["vibrato_cents"])
                row["f0_hz"] = repr(nominal * math.pow(2.0, cents / 1_200.0))
            rows.append(row)
    with controls.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    qa = report["score_controls"]["reference_contour_control_qa"]["events"][0]
    qa["nominal_pitch_hz"] = nominal
    qa["final_active_f0_hz"] = nominal
    report["outputs"]["controls_csv"]["sha256"] = _sha256(controls)
    _write_json(report_path, report)


def _make_b2rd(paths: tuple[Path, Path, Path]) -> None:
    report_path, plan_path, policy_path = paths
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    b16 = next(
        event
        for event in plan["events"]
        if event["id"] == reference_pack.REFERENCE_EVENT_ID
    )
    b16["reference_contour"]["status"] = DEPTH_STATUS
    b16["reference_contour"]["depth_transform"] = {
        "kind": DEPTH_TRANSFORM_KIND,
        "source_max_abs_cents": SOURCE_MAX_ABS_CENTS,
        "target_max_abs_cents": TARGET_MAX_ABS_CENTS,
        "scale": DEPTH_SCALE,
    }
    _write_json(plan_path, plan)

    policy = json.loads(policy_path.read_text(encoding="utf-8"))
    policy["input"]["plan_sha256"] = _sha256(plan_path)
    for record in policy["fired_policy_rules"]:
        if record["event_id"] == reference_pack.REFERENCE_EVENT_ID:
            record["decision"] = DEPTH_STATUS
            record["style"] = DEPTH_STATUS
    _write_json(policy_path, policy)

    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["score_plan"]["events"] = plan["events"]
    report["score_plan"]["plan"]["sha256"] = _sha256(plan_path)
    controls_path = report_path.parent / report["outputs"]["controls_csv"]["basename"]
    rows: list[dict[str, str]] = []
    actual_max = 0.0
    with controls_path.open("r", encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        fieldnames = list(reader.fieldnames or ())
        for row in reader:
            if row["event_id"] == reference_pack.REFERENCE_EVENT_ID:
                cents = float(row["vibrato_cents"]) * DEPTH_SCALE
                nominal = float(b16["pitch_hz"])
                row["vibrato_cents"] = repr(cents)
                row["f0_hz"] = repr(nominal * math.pow(2.0, cents / 1_200.0))
                actual_max = max(actual_max, abs(cents))
            rows.append(row)
    with controls_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    qa = report["score_controls"]["reference_contour_control_qa"]
    qa["status"] = DEPTH_STATUS
    qa["application_scope"] = REFERENCE_APPLICATION_SCOPE
    record = qa["events"][0]
    record["status"] = DEPTH_STATUS
    record["depth_transform"] = {
        "operation": DEPTH_TRANSFORM_OPERATION,
        "kind": DEPTH_TRANSFORM_KIND,
        "application_order": DEPTH_APPLICATION_ORDER,
        "source_max_abs_cents": SOURCE_MAX_ABS_CENTS,
        "source_max_abs_cents_recomputed_from_embedded_points": SOURCE_MAX_ABS_CENTS,
        "target_max_abs_cents": TARGET_MAX_ABS_CENTS,
        "scale": DEPTH_SCALE,
        "transformed_embedded_source_max_abs_cents": TARGET_MAX_ABS_CENTS,
        "source_max_matches_embedded_points_gate_passed": True,
        "scale_equals_target_over_source_gate_passed": True,
        "transformed_embedded_source_hits_target_gate_passed": True,
        "source_artifact_and_payload_identity_preserved": True,
        "embedded_pitch_points_modified": False,
        "learned_or_style_aligned_transform": False,
    }
    record["actual_runtime_max_abs_cents"] = actual_max
    record["target_max_abs_not_exceeded_gate_passed"] = True
    report["outputs"]["controls_csv"]["sha256"] = _sha256(controls_path)
    _write_json(report_path, report)


def _fixture() -> tuple[object, Path, str, Path, dict[str, tuple[Path, Path, Path]]]:
    temporary, root, baseline, old_spec, artifacts = fixture._fixture()
    del old_spec
    _correct_raw_fixture_nominal(artifacts["B2-R"])
    b2rd = _clone_b2rd(root, artifacts["B2-R"])
    _make_b2rd(b2rd)
    artifacts["B2-Rd"] = b2rd
    reference_path = (
        root
        / "tools/daegeum-vibrato-reference/reference_shape_unreviewed.ngc-20260925.json"
    )
    spec_path = root / "_bgm_rnd/reference-depth-spec.json"
    make_full_ari_reference_depth_spec(
        root,
        spec_path,
        b1_runtime_report=artifacts["B1"][0],
        b1_plan=artifacts["B1"][1],
        b1_policy_manifest=artifacts["B1"][2],
        b2r_runtime_report=artifacts["B2-R"][0],
        b2r_plan=artifacts["B2-R"][1],
        b2r_policy_manifest=artifacts["B2-R"][2],
        b2rd_runtime_report=b2rd[0],
        b2rd_plan=b2rd[1],
        b2rd_policy_manifest=b2rd[2],
        reference_artifact=reference_path,
    )
    return temporary, root, baseline, spec_path, artifacts


def _rehash(spec_path: Path, slot: str, artifact: str, path: Path) -> None:
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    spec["candidates"][slot][artifact]["sha256"] = _sha256(path)
    _write_json(spec_path, spec)


class FullAriReferenceDepthPackTests(unittest.TestCase):
    def test_builds_three_way_byte_exact_pack(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        output = root / "_bgm_rnd/three-way-pack"
        manifest = build_full_ari_reference_depth_audition_pack(
            root, spec, output, baseline_revision=baseline
        )
        self.assertEqual(manifest["status"], "succeeded")
        comparison = manifest["comparison_contract"]
        self.assertTrue(comparison["b08_exact_all_three"])
        transform = comparison["raw_B2R_to_B2Rd_only_numeric_transform"]
        self.assertEqual(transform["scale"], DEPTH_SCALE)
        self.assertEqual(transform["target_max_abs_cents"], 18.0)
        depth = manifest["candidates"]["B2-Rd"]["reference_contour_qa"]
        self.assertLessEqual(depth["actual_runtime_max_abs_cents"], 18.0)
        self.assertTrue(depth["source_artifact_and_payload_identity_preserved"])
        self.assertFalse(manifest["scope"]["learned_result"])
        self.assertFalse(manifest["scope"]["game_asset"])
        self.assertFalse(manifest["scope"]["rights_cleared"])
        self.assertFalse(manifest["scope"]["yoseong_confirmed"])
        for slot, name in OUTPUT_AUDIO_NAMES.items():
            report = json.loads(artifacts[slot][0].read_text(encoding="utf-8"))
            source = artifacts[slot][0].parent / report["outputs"]["checkpoint_native_reverb_score_length_wav"]["basename"]
            self.assertEqual(_sha256(source), _sha256(output / name))
        self.assertTrue((output / MANIFEST_FILENAME).is_file())

    def test_spec_generator_hash_pins_all_three_candidates(self) -> None:
        temporary, root, _, spec_path, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        self.assertEqual(set(spec["candidates"]), set(ROLES))
        self.assertEqual(
            spec["candidates"]["B2-Rd"]["plan_artifact"]["sha256"],
            _sha256(artifacts["B2-Rd"][1]),
        )

    def test_rejects_depth_scale_drift(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        plan_path = artifacts["B2-Rd"][1]
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        b16 = next(event for event in plan["events"] if event["id"] == reference_pack.REFERENCE_EVENT_ID)
        b16["reference_contour"]["depth_transform"]["scale"] = 0.53
        _write_json(plan_path, plan)
        policy_path = artifacts["B2-Rd"][2]
        policy = json.loads(policy_path.read_text(encoding="utf-8"))
        policy["input"]["plan_sha256"] = _sha256(plan_path)
        _write_json(policy_path, policy)
        report_path = artifacts["B2-Rd"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        report["score_plan"]["plan"]["sha256"] = _sha256(plan_path)
        report["score_plan"]["events"] = plan["events"]
        _write_json(report_path, report)
        _rehash(spec, "B2-Rd", "plan_artifact", plan_path)
        _rehash(spec, "B2-Rd", "policy_manifest", policy_path)
        _rehash(spec, "B2-Rd", "runtime_report", report_path)
        with self.assertRaisesRegex(ReferenceDepthPackError, "depth_transform.scale"):
            build_full_ari_reference_depth_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )

    def test_rejects_scaled_embedded_source_payload(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        plan_path = artifacts["B2-Rd"][1]
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        b16 = next(event for event in plan["events"] if event["id"] == reference_pack.REFERENCE_EVENT_ID)
        b16["reference_contour"]["normalized_reference_contour"]["pitch_residual_cents"][0] *= DEPTH_SCALE
        _write_json(plan_path, plan)
        policy_path = artifacts["B2-Rd"][2]
        policy = json.loads(policy_path.read_text(encoding="utf-8"))
        policy["input"]["plan_sha256"] = _sha256(plan_path)
        _write_json(policy_path, policy)
        report_path = artifacts["B2-Rd"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        report["score_plan"]["plan"]["sha256"] = _sha256(plan_path)
        report["score_plan"]["events"] = plan["events"]
        _write_json(report_path, report)
        for artifact, path in (
            ("plan_artifact", plan_path),
            ("policy_manifest", policy_path),
            ("runtime_report", report_path),
        ):
            _rehash(spec, "B2-Rd", artifact, path)
        with self.assertRaisesRegex(ReferenceDepthPackError, "exact unscaled"):
            build_full_ari_reference_depth_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )

    def test_rejects_non_b16_control_change(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        report_path = artifacts["B2-Rd"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        controls = report_path.parent / report["outputs"]["controls_csv"]["basename"]
        with controls.open("r", encoding="utf-8", newline="") as stream:
            rows = list(csv.DictReader(stream))
        row = next(item for item in rows if item["event_id"] == reference_pack.SHARED_SINE_EVENT_ID)
        row["loudness_linear"] = repr(float(row["loudness_linear"]) + 0.001)
        with controls.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        report["outputs"]["controls_csv"]["sha256"] = _sha256(controls)
        _write_json(report_path, report)
        _rehash(spec, "B2-Rd", "runtime_report", report_path)
        with self.assertRaisesRegex(ReferenceDepthPackError, "loudness"):
            build_full_ari_reference_depth_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )

    def test_accepts_signed_zero_spelling_difference(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        report_path = artifacts["B2-Rd"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        controls = report_path.parent / report["outputs"]["controls_csv"]["basename"]
        text = controls.read_text(encoding="utf-8")
        text = text.replace(",0.0,release,b16_final_release,0.0\n", ",0.0,release,b16_final_release,-0.0\n", 1)
        controls.write_text(text, encoding="utf-8")
        report["outputs"]["controls_csv"]["sha256"] = _sha256(controls)
        _write_json(report_path, report)
        _rehash(spec, "B2-Rd", "runtime_report", report_path)
        manifest = build_full_ari_reference_depth_audition_pack(
            root, spec, root / "_bgm_rnd/signed-zero", baseline_revision=baseline
        )
        self.assertEqual(manifest["status"], "succeeded")

    def test_rejects_runtime_claim_escalation(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        report_path = artifacts["B2-Rd"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        report["score_controls"]["reference_contour_control_qa"]["learned_claim"] = True
        _write_json(report_path, report)
        _rehash(spec, "B2-Rd", "runtime_report", report_path)
        with self.assertRaisesRegex(ReferenceDepthPackError, "learned/style"):
            build_full_ari_reference_depth_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )


if __name__ == "__main__":
    unittest.main()
