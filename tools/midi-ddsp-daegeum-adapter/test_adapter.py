#!/usr/bin/env python3
"""Tests for the fail-closed, metadata-only Daegeum dataset adapter."""

from __future__ import annotations

import ast
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import adapter  # noqa: E402


CONTROLLED_MANIFEST = (
    REPO_ROOT / "_bgm_rnd/ngc-extended-daegeum-sanjo-20260924/ngc-extended-daegeum-sanjo.manifest.json"
)
CONTROLLED_BUNDLE = REPO_ROOT / "_bgm_rnd/daegeum-transition-bank-ngc-20260924-205600"
SYNTHETIC_CONTRACT = HERE / "fixtures/synthetic_training_contract.json"
SYNTHETIC_RIGHTS = HERE / "fixtures/synthetic_training_rights.json"


class MidiDdspDaegeumAdapterTests(unittest.TestCase):
    def test_current_192_file_controlled_bundle_is_blocked_without_audio_or_npz_access(self) -> None:
        self.assertTrue(CONTROLLED_MANIFEST.is_file())
        self.assertTrue(CONTROLLED_BUNDLE.is_dir())
        report = adapter.build_readiness_report(
            controlled_manifest=CONTROLLED_MANIFEST,
            controlled_bundle=CONTROLLED_BUNDLE,
            rights_manifest=None,
            training_contract=None,
            repo_root=REPO_ROOT,
        )

        self.assertEqual(report["status"], "blocked")
        gate = report["rights_gate"]
        self.assertFalse(gate["provided"])
        self.assertFalse(gate["training_allowed"])
        controlled = report["controlled_192_file_bundle"]
        manifest = controlled["manifest"]
        self.assertTrue(manifest["valid"])
        self.assertEqual(manifest["entry_count"], 192)
        self.assertEqual(manifest["entries_explicitly_ineligible_for_model_training_or_game_asset"], 192)
        self.assertFalse(manifest["manifest_itself_has_training_allowed_true"])
        bundle = controlled["feature_bundle"]
        self.assertTrue(bundle["valid"])
        self.assertEqual(bundle["source_count"], 192)
        self.assertEqual(bundle["unverified_local_rnd_only_count"], 192)
        self.assertEqual(bundle["declared_aligned_midi_or_score_reference_count"], 0)
        self.assertEqual(bundle["native_channel_count_values"], [2])
        feature_metadata = bundle["feature_metadata"]
        self.assertEqual(feature_metadata["metadata_files_read"], 192)
        self.assertEqual(feature_metadata["cached_feature_npz_files_opened"], 0)
        self.assertEqual(feature_metadata["f0_proxy_metadata_explicitly_not_human_pitch_label_count"], 192)
        labels = bundle["label_template"]
        self.assertEqual(labels["record_count"], 3020)
        self.assertEqual(labels["expression_eligible_count"], 0)
        self.assertEqual(labels["unreviewed_count"], 3020)
        self.assertFalse(labels["is_a_training_label_set"])
        ledger = report["operation_provenance"]["access_ledger"]
        for key in (
            "audio_files_opened",
            "audio_bytes_read",
            "audio_files_copied",
            "feature_npz_files_opened",
            "feature_npz_bytes_read",
            "midi_files_opened",
            "tfrecords_written",
            "training_examples_written",
        ):
            self.assertEqual(ledger[key], 0, key)
        self.assertFalse(ledger["model_training_started"])
        self.assertIn("No standalone explicit rights manifest", " ".join(report["blockers"]))
        self.assertIn("ineligible", " ".join(report["blockers"]))

    def test_synthetic_fixture_validates_contract_without_opening_its_nonexistent_audio_or_midi(self) -> None:
        contract = json.loads(SYNTHETIC_CONTRACT.read_text(encoding="utf-8"))
        audio_path = HERE / contract["items"][0]["audio"]["relative_path"]
        midi_path = HERE / contract["items"][0]["aligned_midi"]["relative_path"]
        self.assertFalse(audio_path.exists())
        self.assertFalse(midi_path.exists())
        report = adapter.build_readiness_report(
            controlled_manifest=None,
            controlled_bundle=None,
            rights_manifest=SYNTHETIC_RIGHTS,
            training_contract=SYNTHETIC_CONTRACT,
            repo_root=REPO_ROOT,
        )

        self.assertEqual(report["status"], "synthetic_contract_validated_metadata_only")
        self.assertTrue(report["rights_gate"]["training_allowed"])
        self.assertTrue(report["rights_gate"]["authorization_contract_valid"])
        self.assertTrue(report["paired_training_contract"]["valid"])
        self.assertTrue(report["paired_training_contract"]["synthetic_fixture_only"])
        self.assertEqual(report["paired_training_contract"]["note_count"], 4)
        self.assertEqual(
            report["paired_training_contract"]["explicit_articulation_counts"],
            {"breath_start": 1, "rearticulate": 2, "slur": 1},
        )
        self.assertEqual(report["paired_training_contract"]["explicit_vibrato_annotation_count"], 1)
        self.assertEqual(report["paired_training_contract"]["explicit_post_note_release_annotation_count"], 1)
        mapping = report["required_field_mapping"]
        self.assertEqual(mapping["six_documented_expression_targets"]["ordered_fields"], list(adapter.MIDI_DDSP_EXPRESSION_FIELDS))
        self.assertTrue(mapping["aligned_score_to_conditioning_rows"]["touching_notes_never_imply_slur"])
        self.assertIn("not one of MIDI-DDSP", mapping["gesture_and_vibrato_auxiliary_labels"]["post_note_release"])
        ledger = report["operation_provenance"]["access_ledger"]
        self.assertEqual(ledger["audio_files_opened"], 0)
        self.assertEqual(ledger["midi_files_opened"], 0)
        self.assertEqual(ledger["feature_npz_files_opened"], 0)
        self.assertEqual(ledger["tfrecords_written"], 0)
        self.assertEqual(ledger["training_examples_written"], 0)

    def test_current_ngc_manifest_cannot_be_relabelled_as_the_required_rights_manifest(self) -> None:
        report = adapter.build_readiness_report(
            controlled_manifest=CONTROLLED_MANIFEST,
            controlled_bundle=CONTROLLED_BUNDLE,
            rights_manifest=CONTROLLED_MANIFEST,
            training_contract=None,
            repo_root=REPO_ROOT,
        )
        self.assertEqual(report["status"], "blocked")
        self.assertTrue(report["rights_gate"]["provided"])
        self.assertFalse(report["rights_gate"]["schema_valid"])
        self.assertFalse(report["rights_gate"]["training_allowed"])
        self.assertEqual(report["operation_provenance"]["access_ledger"]["audio_files_opened"], 0)

    def test_invalid_rights_scope_and_implicit_slur_both_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            rights = json.loads(SYNTHETIC_RIGHTS.read_text(encoding="utf-8"))
            rights["authorized_scope"]["training_record_export"] = False
            rights_path = root / "bad-rights.json"
            rights_path.write_text(json.dumps(rights), encoding="utf-8")
            blocked_rights = adapter.build_readiness_report(
                controlled_manifest=None,
                controlled_bundle=None,
                rights_manifest=rights_path,
                training_contract=SYNTHETIC_CONTRACT,
                repo_root=REPO_ROOT,
            )
            self.assertEqual(blocked_rights["status"], "blocked")
            self.assertFalse(blocked_rights["rights_gate"]["authorization_contract_valid"])

            contract = json.loads(SYNTHETIC_CONTRACT.read_text(encoding="utf-8"))
            invalid_contract = copy.deepcopy(contract)
            invalid_contract["items"][0]["notes"][2]["slur_from_previous"] = False
            invalid_path = root / "implicit-slur.json"
            invalid_path.write_text(json.dumps(invalid_contract), encoding="utf-8")
            blocked_slur = adapter.build_readiness_report(
                controlled_manifest=None,
                controlled_bundle=None,
                rights_manifest=SYNTHETIC_RIGHTS,
                training_contract=invalid_path,
                repo_root=REPO_ROOT,
            )
            self.assertEqual(blocked_slur["status"], "blocked")
            self.assertFalse(blocked_slur["paired_training_contract"]["valid"])
            self.assertIn("slur_from_previous", blocked_slur["paired_training_contract"]["reason"])
            self.assertEqual(blocked_slur["operation_provenance"]["access_ledger"]["audio_files_opened"], 0)

    def test_non_synthetic_rights_require_hash_verified_local_receipt_and_terms_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract = json.loads(SYNTHETIC_CONTRACT.read_text(encoding="utf-8"))
            contract["synthetic_fixture_only"] = False
            for note in contract["items"][0]["notes"]:
                note["expression_target_provenance"] = "measured_and_human_validated"
            contract_path = root / "contract.json"
            contract_path.write_text(json.dumps(contract), encoding="utf-8")

            rights = json.loads(SYNTHETIC_RIGHTS.read_text(encoding="utf-8"))
            rights["synthetic_fixture_only"] = False
            rights["local_dataset_source"] = {
                "provider": "fixture",
                "catalog_dataset_id": "fixture_001",
                "locally_downloaded_by_user": True,
            }
            receipt = root / "receipt.txt"
            terms = root / "terms.txt"
            receipt.write_text("local approval receipt", encoding="utf-8")
            terms.write_text("local terms snapshot", encoding="utf-8")
            rights["local_receipt_and_terms_snapshot"] = {
                "local_receipt": {
                    "relative_path": receipt.name,
                    "sha256": adapter._sha256(receipt),
                    "byte_length": receipt.stat().st_size,
                },
                "terms_snapshot": {
                    "relative_path": terms.name,
                    "sha256": adapter._sha256(terms),
                    "byte_length": terms.stat().st_size,
                },
            }
            rights_path = root / "rights.json"
            rights_path.write_text(json.dumps(rights), encoding="utf-8")
            report = adapter.build_readiness_report(
                controlled_manifest=None,
                controlled_bundle=None,
                rights_manifest=rights_path,
                training_contract=contract_path,
                repo_root=REPO_ROOT,
            )
            self.assertEqual(report["status"], "rights_attested_contract_validated_metadata_only")
            gate = report["rights_gate"]
            self.assertTrue(gate["authorization_contract_valid"])
            self.assertTrue(gate["local_receipt_and_terms_snapshot_verified"])
            ledger = report["operation_provenance"]["access_ledger"]
            self.assertEqual(ledger["non_audio_rights_evidence_files_hashed"], 2)
            self.assertEqual(ledger["audio_files_opened"], 0)
            self.assertEqual(ledger["tfrecords_written"], 0)

    def test_adapter_has_no_audio_decoder_or_training_runtime_import(self) -> None:
        tree = ast.parse((HERE / "adapter.py").read_text(encoding="utf-8"))
        imported: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module.split(".")[0])
        self.assertTrue(imported.isdisjoint({"ddsp", "tensorflow", "numpy", "librosa", "soundfile", "wave", "torch"}))


if __name__ == "__main__":
    unittest.main()
