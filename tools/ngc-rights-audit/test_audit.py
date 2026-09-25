"""Offline tests for the metadata-only NGC rights gate."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("audit.py")
SPEC = importlib.util.spec_from_file_location("ngc_rights_audit_test", MODULE_PATH)
assert SPEC and SPEC.loader
audit = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = audit
SPEC.loader.exec_module(audit)


def _entry(sequence: int) -> dict[str, object]:
    wav = f"/tmusic/05_Daegeum/Daegeum_SJ_{sequence - 1519:03d}.wav"
    return {
        "extend_seq": sequence,
        "selection": {
            "instrument_code": audit.DAEGEUM_CODE,
            "instrument_name": audit.DAEGEUM_NAME,
            "division_exact": audit.SANJO_DIVISION,
            "selection_is_exact_metadata_filter_not_title_match": True,
        },
        "source": {
            "catalog_url": audit._ngc_url(audit.FILE_LIST),
            "file_info_url": audit._ngc_url(audit.FILE_INFO),
            "download_url": audit._ngc_url(audit.DOWNLOAD),
            "source_sequence": sequence,
            "original_wav_server_path": wav,
            "original_wav_filename": Path(wav).name,
        },
        "catalog_record": {
            "extendSeq": sequence,
            "instrCd": audit.DAEGEUM_CODE,
            "instrDivCd": "INDV0001",
            "division": audit.SANJO_DIVISION,
            "wavFilePath": wav,
            "mp3FilePath": wav.replace("/tmusic/05_Daegeum/", "/tmusic/05_Daegeum/mp3/").replace(".wav", ".mp3"),
        },
        "file_info_record": {
            "extend_seq": sequence,
            "instr_cd": audit.DAEGEUM_CODE,
            "instr_name": audit.DAEGEUM_NAME,
            "division": audit.SANJO_DIVISION,
            "wav_file_path": wav,
        },
        "download": {"state": "downloaded", "sha256": "a" * 64},
    }


def _manifest() -> dict[str, object]:
    return {
        "schema": audit.MANIFEST_SCHEMA,
        "license_evidence": {
            "notice": audit.TYPE1_NOTICE,
            "status": "catalog_page_declares_kogl_type_1_attribution",
            "catalog_page_url": audit._ngc_url(audit.CATALOG_PAGE),
            "catalog_page_sha256": "b" * 64,
            "observed_at_utc": "2026-09-24T11:57:17Z",
            "not_a_model_training_or_game_distribution_clearance": True,
        },
        "submitted_purpose": {
            "usePurposeGb": "비상업용",
            "usePurpose": "연구용",
            "usePurposeDtl": "",
            "companyName": {"value_persisted": False},
            "no_credentials_or_cookie_file_used": True,
        },
        "entries": [_entry(1520), _entry(1521)],
    }


class RightsAuditTests(unittest.TestCase):
    def test_manifest_binding_is_path_free_and_requires_exact_routes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest_path = root / "controlled.json"
            manifest_path.write_text(json.dumps(_manifest(), ensure_ascii=False), encoding="utf-8")
            inspected = audit.inspect_controlled_manifest(manifest_path, expected_count=2)
            self.assertEqual(inspected["selected_count"], 2)
            self.assertTrue(inspected["all_entries_attest_downloaded"])
            self.assertTrue(inspected["extend_sequence"]["contiguous"])
            rendered = json.dumps(inspected, ensure_ascii=False)
            self.assertNotIn(str(root), rendered)

    def test_manifest_rejects_non_ngc_download_route_or_gap(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = _manifest()
            entries = data["entries"]
            assert isinstance(entries, list)
            entries[1]["source"]["download_url"] = "https://example.invalid/asset.wav"
            path = root / "bad-route.json"
            path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            with self.assertRaisesRegex(audit.RightsAuditError, "endpoint"):
                audit.inspect_controlled_manifest(path, expected_count=2)

            data = _manifest()
            entries = data["entries"]
            assert isinstance(entries, list)
            entries[1] = _entry(1522)
            path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            with self.assertRaisesRegex(audit.RightsAuditError, "contiguous"):
                audit.inspect_controlled_manifest(path, expected_count=2)

    def test_type1_non_ml_and_ml_outcomes_are_separate(self) -> None:
        decision = audit.fail_closed_decision(
            catalog_markers={
                "type1_mark_image": True,
                "type1_notice_text": True,
                "ai_type_mark_or_ai_training_text": False,
            },
            terms={"observed_statements": {
                "type1_commercial_use": True,
                "type1_derivative_work": True,
                "type1_attribution": True,
                "ai_type_exists": True,
                "ai_type_must_be_shown_with_existing_type": True,
                "ai_type_is_specific_to_training_data": True,
            }},
            historical_purpose={"usePurposeGb": "비상업용", "usePurpose": "연구용"},
        )
        self.assertEqual(
            decision["sample_transformation_or_non_ml_derivative_synthesis"]["status"],
            "CONDITIONALLY_PERMITTED_BY_OBSERVED_TYPE1",
        )
        self.assertEqual(decision["ml_training_or_ml_derived_game_audio"]["status"], "BLOCKED_FAIL_CLOSED")


if __name__ == "__main__":
    unittest.main()
