"""Synthetic-only tests for the local AI Hub label ZIP inventory."""

from __future__ import annotations

import json
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile


SCRIPT = Path(__file__).with_name("inventory_label_zip.py")


def run_inventory(path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(path)],
        capture_output=True,
        text=True,
        check=False,
    )


class LabelZipInventoryTests(unittest.TestCase):
    def test_counts_parsed_values_and_known_field_without_claiming_clips(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            zip_path = Path(temp) / "private-owner-labels.zip"
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr(
                    "person-name/mixed.json",
                    json.dumps(
                        {
                            "music_type_info": {"instrument_cd": "WN01"},
                            "other": ["WN01", "XWN01", "WN01X"],
                            "performer": "PRIVATE PERSON NAME",
                        }
                    ),
                )
                archive.writestr("notes.txt", "WN01 PRIVATE PERSON NAME")
            before = sorted(p.name for p in Path(temp).iterdir())
            result = run_inventory(zip_path)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(result.stdout)
            self.assertEqual(report["archive"]["members"], 2)
            self.assertEqual(report["archive"]["json_or_jsonl_members"], 1)
            self.assertEqual(report["wn01_evidence"]["exact_wn01_string_values"], 2)
            self.assertEqual(report["wn01_evidence"]["instrument_cd_wn01_fields"], 1)
            self.assertEqual(report["wn01_evidence"]["parsed_documents"], 1)
            self.assertIn("not unique clips", report["wn01_evidence"]["interpretation"])
            self.assertEqual(report["files"][0]["member_index"], 0)
            self.assertEqual(report["files"][0]["status"], "parsed")
            self.assertNotIn(str(zip_path), result.stdout)
            self.assertNotIn("person-name", result.stdout)
            self.assertNotIn("PRIVATE PERSON NAME", result.stdout)
            self.assertEqual(before, sorted(p.name for p in Path(temp).iterdir()))

    def test_jsonl_and_ndjson_are_parsed_without_echoing_content(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            zip_path = Path(temp) / "labels.zip"
            with zipfile.ZipFile(zip_path, "w") as archive:
                archive.writestr(
                    "records.jsonl",
                    '{"instrument_cd":"WN01","name":"PRIVATE"}\n'
                    '{"other":["WN01","WN02"]}\n',
                )
                archive.writestr("more.ndjson", '["WN01"]\n')
            result = run_inventory(zip_path)
            self.assertEqual(result.returncode, 0)
            report = json.loads(result.stdout)
            self.assertEqual(report["wn01_evidence"]["parsed_documents"], 3)
            self.assertEqual(report["wn01_evidence"]["exact_wn01_string_values"], 3)
            self.assertEqual(report["wn01_evidence"]["instrument_cd_wn01_fields"], 1)
            self.assertNotIn("PRIVATE", result.stdout)

    def test_unsafe_members_are_skipped_without_extraction(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            zip_path = Path(temp) / "labels.zip"
            with zipfile.ZipFile(zip_path, "w") as archive:
                archive.writestr("../escape.json", '{"instrument_cd":"WN01"}')
                archive.writestr("/absolute.json", '{"instrument_cd":"WN01"}')
                archive.writestr("C:\\windows.json", '{"instrument_cd":"WN01"}')
                archive.writestr("C:/windows.json", '{"instrument_cd":"WN01"}')
                link = zipfile.ZipInfo("linked.json")
                link.create_system = 3
                link.external_attr = (stat.S_IFLNK | 0o777) << 16
                archive.writestr(link, '{"instrument_cd":"WN01"}')
                archive.writestr("safe.json", '{"instrument_cd":"WN01"}')
            result = run_inventory(zip_path)
            self.assertEqual(result.returncode, 0)
            report = json.loads(result.stdout)
            self.assertEqual(report["archive"]["skipped_unsafe_members"], 5)
            self.assertEqual(report["wn01_evidence"]["exact_wn01_string_values"], 1)
            self.assertEqual(len(report["files"]), 1)
            self.assertFalse((Path(temp).parent / "escape.json").exists())
            self.assertNotIn("escape.json", result.stdout)

    def test_invalid_json_and_oversized_member_do_not_contaminate_counts(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            zip_path = Path(temp) / "labels.zip"
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("broken.json", '{"instrument_cd":"WN01"')
                archive.writestr("large.json", " " * (8 * 1024 * 1024 + 1))
                archive.writestr("good.json", '{"instrument_cd":"WN01"}')
            result = run_inventory(zip_path)
            self.assertEqual(result.returncode, 0)
            report = json.loads(result.stdout)
            statuses = {item["status"] for item in report["files"]}
            self.assertEqual(statuses, {"invalid_json", "skipped_member_size_limit", "parsed"})
            self.assertEqual(report["wn01_evidence"]["exact_wn01_string_values"], 1)

    def test_relative_path_is_rejected_without_leaking_it(self) -> None:
        result = run_inventory(Path("private.zip"))
        self.assertEqual(result.returncode, 2)
        self.assertEqual(json.loads(result.stdout)["code"], "expected_absolute_regular_zip_path")
        self.assertNotIn("private.zip", result.stdout)


if __name__ == "__main__":
    unittest.main()
