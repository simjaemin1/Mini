#!/usr/bin/env python3
"""Contract tests for the four-way reference end-fade audition pack."""

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

from build_full_ari_reference_fade_audition_pack import (  # noqa: E402
    FIRST_MODIFIED_FRAME_INDEX,
    LONG_FADE_STATUS,
    MANIFEST_FILENAME,
    OUTPUT_AUDIO_NAMES,
    ROLES,
    TARGET_FADE_OUT_SECONDS,
    ReferenceFadePackError,
    _end_fade_transform,
    _expected_long_fade_cents,
    _runtime_end_fade_transform,
    build_full_ari_reference_fade_audition_pack,
    depth_pack,
    reference_pack,
)
from make_full_ari_reference_fade_spec import (  # noqa: E402
    make_full_ari_reference_fade_spec,
)


DEPTH_TEST_PATH = (
    HERE.parent
    / "full-ari-reference-depth-audition-pack"
    / "test_full_ari_reference_depth_audition_pack.py"
)
fixture_spec = importlib.util.spec_from_file_location(
    "_reference_depth_pack_fixture", DEPTH_TEST_PATH
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


def _clone_b2rdf(root: Path, short: tuple[Path, Path, Path]) -> tuple[Path, Path, Path]:
    short_report, short_plan, short_policy = short
    directory = root / "_bgm_rnd/runtime-B2Rdf"
    shutil.copytree(short_report.parent, directory)
    report = directory / "runtime_report.json"
    plan = root / "_bgm_rnd/B2Rdf_full_plan.json"
    policy = root / "_bgm_rnd/B2Rdf_policy.json"
    shutil.copyfile(short_plan, plan)
    shutil.copyfile(short_policy, policy)
    return report, plan, policy


def _make_b2rdf(paths: tuple[Path, Path, Path], reference_path: Path) -> None:
    report_path, plan_path, policy_path = paths
    reference_artifact = json.loads(reference_path.read_text(encoding="utf-8"))
    reference = {
        "normalized_reference_contour": reference_artifact["selection"]["normalized_reference_contour"]
    }
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    b16 = next(
        event
        for event in plan["events"]
        if event["id"] == reference_pack.REFERENCE_EVENT_ID
    )
    block = b16["reference_contour"]
    block["status"] = LONG_FADE_STATUS
    block["fade_out_seconds"] = TARGET_FADE_OUT_SECONDS
    block["end_fade_transform"] = _end_fade_transform()
    _write_json(plan_path, plan)

    policy = json.loads(policy_path.read_text(encoding="utf-8"))
    policy["input"]["plan_sha256"] = _sha256(plan_path)
    for record in policy["fired_policy_rules"]:
        if record["event_id"] == reference_pack.REFERENCE_EVENT_ID:
            record["decision"] = LONG_FADE_STATUS
            record["style"] = LONG_FADE_STATUS
    _write_json(policy_path, policy)

    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["score_plan"]["events"] = plan["events"]
    report["score_plan"]["plan"]["sha256"] = _sha256(plan_path)
    controls = report_path.parent / report["outputs"]["controls_csv"]["basename"]
    rows: list[dict[str, str]] = []
    actual_max = 0.0
    nominal = float(b16["pitch_hz"])
    with controls.open("r", encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        fieldnames = list(reader.fieldnames or ())
        for row in reader:
            if row["event_id"] == reference_pack.REFERENCE_EVENT_ID:
                frame = int(row["frame_index"])
                cents = _expected_long_fade_cents(reference, frame)
                row["vibrato_cents"] = repr(cents)
                row["f0_hz"] = repr(nominal * math.pow(2.0, cents / 1_200.0))
                actual_max = max(actual_max, abs(cents))
            rows.append(row)
    with controls.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    qa = report["score_controls"]["reference_contour_control_qa"]
    qa["status"] = LONG_FADE_STATUS
    record = qa["events"][0]
    record["status"] = LONG_FADE_STATUS
    record["fade_out_seconds"] = TARGET_FADE_OUT_SECONDS
    record["actual_runtime_max_abs_cents"] = actual_max
    record["end_fade_transform"] = _runtime_end_fade_transform()
    report["outputs"]["controls_csv"]["sha256"] = _sha256(controls)
    _write_json(report_path, report)


def _fixture() -> tuple[object, Path, str, Path, dict[str, tuple[Path, Path, Path]]]:
    temporary, root, baseline, old_spec, artifacts = fixture._fixture()
    del old_spec
    reference = (
        root
        / "tools/daegeum-vibrato-reference/reference_shape_unreviewed.ngc-20260925.json"
    )
    b2rdf = _clone_b2rdf(root, artifacts["B2-Rd"])
    _make_b2rdf(b2rdf, reference)
    artifacts["B2-Rdf"] = b2rdf
    spec_path = root / "_bgm_rnd/reference-fade-spec.json"
    make_full_ari_reference_fade_spec(
        root,
        spec_path,
        candidate_inputs=artifacts,
        reference_artifact=reference,
    )
    return temporary, root, baseline, spec_path, artifacts


def _rehash(spec_path: Path, slot: str, artifact: str, path: Path) -> None:
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    spec["candidates"][slot][artifact]["sha256"] = _sha256(path)
    _write_json(spec_path, spec)


class FullAriReferenceFadePackTests(unittest.TestCase):
    def test_builds_four_way_byte_exact_pack(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        output = root / "_bgm_rnd/four-way-pack"
        manifest = build_full_ari_reference_fade_audition_pack(
            root, spec, output, baseline_revision=baseline
        )
        self.assertEqual(manifest["status"], "succeeded")
        comparison = manifest["comparison_contract"]
        self.assertTrue(comparison["b08_exact_all_four"])
        self.assertEqual(
            comparison["first_modified_frame"]["frame_index"],
            FIRST_MODIFIED_FRAME_INDEX,
        )
        self.assertEqual(
            comparison["only_authored_change"]["target_seconds"], 0.24
        )
        self.assertFalse(manifest["scope"]["learned_result"])
        self.assertFalse(manifest["scope"]["rights_cleared"])
        for slot, filename in OUTPUT_AUDIO_NAMES.items():
            report = json.loads(artifacts[slot][0].read_text(encoding="utf-8"))
            source = artifacts[slot][0].parent / report["outputs"]["checkpoint_native_reverb_score_length_wav"]["basename"]
            self.assertEqual(_sha256(source), _sha256(output / filename))
        self.assertTrue((output / MANIFEST_FILENAME).is_file())

    def test_spec_generator_hash_pins_all_four_candidates(self) -> None:
        temporary, _, _, spec_path, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        self.assertEqual(set(spec["candidates"]), set(ROLES))
        self.assertEqual(
            spec["candidates"]["B2-Rdf"]["plan_artifact"]["sha256"],
            _sha256(artifacts["B2-Rdf"][1]),
        )

    def test_rejects_wrong_authored_fade_duration(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        plan_path = artifacts["B2-Rdf"][1]
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        b16 = next(event for event in plan["events"] if event["id"] == reference_pack.REFERENCE_EVENT_ID)
        b16["reference_contour"]["fade_out_seconds"] = 0.20
        _write_json(plan_path, plan)
        policy_path = artifacts["B2-Rdf"][2]
        policy = json.loads(policy_path.read_text(encoding="utf-8"))
        policy["input"]["plan_sha256"] = _sha256(plan_path)
        _write_json(policy_path, policy)
        report_path = artifacts["B2-Rdf"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        report["score_plan"]["plan"]["sha256"] = _sha256(plan_path)
        report["score_plan"]["events"] = plan["events"]
        _write_json(report_path, report)
        for artifact, path in (
            ("plan_artifact", plan_path),
            ("policy_manifest", policy_path),
            ("runtime_report", report_path),
        ):
            _rehash(spec, "B2-Rdf", artifact, path)
        with self.assertRaisesRegex(ReferenceFadePackError, "fade_out_seconds"):
            build_full_ari_reference_fade_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )

    def test_rejects_control_change_before_long_fade_start(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        report_path = artifacts["B2-Rdf"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        controls = report_path.parent / report["outputs"]["controls_csv"]["basename"]
        with controls.open("r", encoding="utf-8", newline="") as stream:
            rows = list(csv.DictReader(stream))
        row = rows[8579]
        row["vibrato_cents"] = repr(float(row["vibrato_cents"]) + 0.01)
        with controls.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        report["outputs"]["controls_csv"]["sha256"] = _sha256(controls)
        _write_json(report_path, report)
        _rehash(spec, "B2-Rdf", "runtime_report", report_path)
        with self.assertRaisesRegex(ReferenceFadePackError, "long-fade formula"):
            build_full_ari_reference_fade_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )

    def test_rejects_post_start_formula_drift(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        report_path = artifacts["B2-Rdf"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        controls = report_path.parent / report["outputs"]["controls_csv"]["basename"]
        with controls.open("r", encoding="utf-8", newline="") as stream:
            rows = list(csv.DictReader(stream))
        row = rows[FIRST_MODIFIED_FRAME_INDEX]
        row["vibrato_cents"] = repr(float(row["vibrato_cents"]) * 0.99)
        with controls.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        report["outputs"]["controls_csv"]["sha256"] = _sha256(controls)
        _write_json(report_path, report)
        _rehash(spec, "B2-Rdf", "runtime_report", report_path)
        with self.assertRaisesRegex(ReferenceFadePackError, "long-fade formula"):
            build_full_ari_reference_fade_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )

    def test_rejects_source_payload_change(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        plan_path = artifacts["B2-Rdf"][1]
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        b16 = next(event for event in plan["events"] if event["id"] == reference_pack.REFERENCE_EVENT_ID)
        b16["reference_contour"]["normalized_reference_contour"]["pitch_residual_cents"][8] += 0.1
        _write_json(plan_path, plan)
        policy_path = artifacts["B2-Rdf"][2]
        policy = json.loads(policy_path.read_text(encoding="utf-8"))
        policy["input"]["plan_sha256"] = _sha256(plan_path)
        _write_json(policy_path, policy)
        report_path = artifacts["B2-Rdf"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        report["score_plan"]["plan"]["sha256"] = _sha256(plan_path)
        report["score_plan"]["events"] = plan["events"]
        _write_json(report_path, report)
        for artifact, path in (
            ("plan_artifact", plan_path),
            ("policy_manifest", policy_path),
            ("runtime_report", report_path),
        ):
            _rehash(spec, "B2-Rdf", artifact, path)
        with self.assertRaisesRegex(ReferenceFadePackError, "exact unscaled"):
            build_full_ari_reference_fade_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )

    def test_rejects_claim_escalation(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        report_path = artifacts["B2-Rdf"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        report["score_controls"]["reference_contour_control_qa"]["training_or_game_clearance"] = True
        _write_json(report_path, report)
        _rehash(spec, "B2-Rdf", "runtime_report", report_path)
        with self.assertRaisesRegex(ReferenceFadePackError, "learned/style"):
            build_full_ari_reference_fade_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )

    def test_rejects_runtime_end_fade_qa_drift(self) -> None:
        temporary, root, baseline, spec, artifacts = _fixture()
        self.addCleanup(temporary.cleanup)
        report_path = artifacts["B2-Rdf"][0]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        record = report["score_controls"]["reference_contour_control_qa"]["events"][0]
        record["end_fade_transform"][
            "b2rd_controls_at_or_before_34_32_seconds_exact_gate_passed"
        ] = False
        _write_json(report_path, report)
        _rehash(spec, "B2-Rdf", "runtime_report", report_path)
        with self.assertRaisesRegex(ReferenceFadePackError, "comparison gates"):
            build_full_ari_reference_fade_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )


if __name__ == "__main__":
    unittest.main()
