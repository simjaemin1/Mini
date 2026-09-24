"""Deterministic fixtures for the bounded local AI Hub paired-data ingest gate."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from aihub_paired_ingest import (  # noqa: E402
    AIHubPairedIngestError,
    BUNDLE_MANIFEST_SCHEMA,
    REPORT_FILENAME,
    validate_local_bundle_manifest,
    write_feature_extraction_report,
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _file_reference(path: Path, *, root: Path) -> dict[str, object]:
    return {
        "relative_path": path.relative_to(root).as_posix(),
        "sha256": _sha256(path),
        "byte_length": path.stat().st_size,
    }


def _write_minimal_wav(path: Path) -> None:
    payload = b"\x00\x00"
    fmt = b"\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        b"RIFF" + (36 + len(payload)).to_bytes(4, "little") + b"WAVE"
        + b"fmt " + len(fmt).to_bytes(4, "little") + fmt
        + b"data" + len(payload).to_bytes(4, "little") + payload
    )


def _write_minimal_midi(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"MThd\x00\x00\x00\x06\x00\x00\x00\x01\x00`" + b"MTrk\x00\x00\x00\x04\x00\xff/\x00")


def _scope() -> dict[str, bool]:
    return {
        "r_and_d_only": True,
        "future_local_bundle_only": True,
        "no_network_download_or_dataset_discovery": True,
        "no_source_redistribution": True,
        "no_default_assets": True,
        "no_runtime_bgm": True,
        "no_game_output": True,
        "no_public_release": True,
        "no_model_training": True,
    }


def _rights() -> dict[str, bool]:
    return {
        "project_has_explicit_local_bundle_access_record": True,
        "project_rights_review_completed_for_this_local_bundle": True,
        "project_scope_limited_to_later_feature_extraction": True,
        "ai_hub_terms_reviewed_for_this_local_bundle": True,
        "no_source_redistribution": True,
        "no_default_asset_or_runtime_use": True,
        "no_game_or_public_distribution_clearance": True,
        "no_model_training_authorized_by_this_manifest": True,
        "requires_new_rights_review_for_scope_expansion": True,
        "does_not_claim_ai_hub_approval_or_training_authorization": True,
    }


def _pair_gate() -> dict[str, bool]:
    return {
        "r_and_d_only": True,
        "not_default_asset": True,
        "not_runtime_bgm": True,
        "not_game_asset": True,
        "not_public_distribution": True,
        "not_source_redistributable": True,
        "not_a_model_training_item": True,
    }


def _fixture(root: Path) -> tuple[Path, dict[str, object]]:
    bundle = root / "local-bundle"
    wav = bundle / "audio" / "take_001.wav"
    midi = bundle / "midi" / "take_001.mid"
    annotation = bundle / "annotation" / "take_001.json"
    _write_minimal_wav(wav)
    _write_minimal_midi(midi)
    annotation.parent.mkdir(parents=True, exist_ok=True)
    annotation.write_text(json.dumps({"fixture": "annotation", "events": []}), encoding="utf-8")
    manifest: dict[str, object] = {
        "schema": BUNDLE_MANIFEST_SCHEMA,
        "ai_hub_local_bundle": {
            "source_platform": "aihub",
            "dataset_id": "future-aihub-gugak-paired-data",
            "bundle_id": "local_fixture_001",
            "local_bundle_only": True,
            "network_download_disabled_by_contract": True,
            "dataset_discovery_disabled_by_contract": True,
            "external_approval_not_inferred": True,
        },
        "ai_hub_r_and_d_scope": _scope(),
        "ai_hub_rights_gate": _rights(),
        "pairs": [
            {
                "pair_id": "daegeum_001",
                "source_record_id": "record_001",
                "pair_gate": _pair_gate(),
                "audio_wav": _file_reference(wav, root=bundle),
                "performance_midi": _file_reference(midi, root=bundle),
                "annotation_json": _file_reference(annotation, root=bundle),
            }
        ],
    }
    manifest_path = bundle / "explicit-aihub-local-bundle.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    return manifest_path, manifest


class AIHubPairedIngestTests(unittest.TestCase):
    def test_accepts_explicit_local_pair_and_writes_only_one_report(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest_path, _ = _fixture(root)
            first = validate_local_bundle_manifest(manifest_path)
            second = validate_local_bundle_manifest(manifest_path)
            report_dir = root / "aihub-ingest-report"
            report_path = write_feature_extraction_report(first, report_dir)
            self.assertEqual(first, second)
            self.assertEqual(report_path.name, REPORT_FILENAME)
            self.assertEqual(sorted(path.name for path in report_dir.iterdir()), [REPORT_FILENAME])
            text = report_path.read_text(encoding="utf-8")
            self.assertNotIn(str(root), text)
            self.assertTrue(first["later_feature_extraction_contract"]["no_source_bytes_copied_into_this_report"])
            self.assertTrue(first["interpretation_limits"]["no_ai_hub_approval_or_license_is_inferred_or_claimed"])

    def test_rejects_missing_no_source_redistribution_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            manifest_path, manifest = _fixture(Path(temporary))
            scope = manifest["ai_hub_r_and_d_scope"]
            assert isinstance(scope, dict)
            scope["no_source_redistribution"] = False
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(AIHubPairedIngestError, "no_source_redistribution"):
                validate_local_bundle_manifest(manifest_path)

    def test_rejects_tampered_wav_hash_before_any_report_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest_path, _ = _fixture(root)
            wav = manifest_path.parent / "audio" / "take_001.wav"
            tampered = bytearray(wav.read_bytes())
            tampered[-1] ^= 0x01
            wav.write_bytes(bytes(tampered))
            report_dir = root / "_bgm_rnd" / "must-not-exist"
            with self.assertRaisesRegex(AIHubPairedIngestError, "sha256"):
                validate_local_bundle_manifest(manifest_path)
            self.assertFalse(report_dir.exists())

    def test_rejects_path_escape_even_without_reading_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            manifest_path, manifest = _fixture(Path(temporary))
            pairs = manifest["pairs"]
            assert isinstance(pairs, list)
            audio = pairs[0]["audio_wav"]
            assert isinstance(audio, dict)
            audio["relative_path"] = "../outside.wav"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(AIHubPairedIngestError, "safe relative path"):
                validate_local_bundle_manifest(manifest_path, verify_files=False)

    def test_rejects_nonfresh_or_default_asset_report_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest_path, _ = _fixture(root)
            report = validate_local_bundle_manifest(manifest_path)
            existing = root / "already-there"
            existing.mkdir()
            with self.assertRaisesRegex(AIHubPairedIngestError, "fresh path"):
                write_feature_extraction_report(report, existing)

            # The checkout's real default asset directory is intentionally
            # protected even though the report has no audio bytes.
            default_asset_child = Path(__file__).resolve().parents[2] / "public" / "assets" / "aihub-ingest-test"
            if default_asset_child.exists():
                self.skipTest("unexpected pre-existing default-asset test directory")
            with self.assertRaisesRegex(AIHubPairedIngestError, "public/assets"):
                write_feature_extraction_report(report, default_asset_child)


if __name__ == "__main__":
    unittest.main()
