#!/usr/bin/env python3
"""No-execution tests for the official MIDI-DDSP archive verifier."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile


MODULE_PATH = Path(__file__).with_name("midi_ddsp_official.py")
SPEC = importlib.util.spec_from_file_location("midi_ddsp_official_test", MODULE_PATH)
assert SPEC and SPEC.loader
provenance = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = provenance
SPEC.loader.exec_module(provenance)


class MidiDdspOfficialTests(unittest.TestCase):
    def _archive(self, directory: Path, *, unsafe: bool = False) -> Path:
        archive = directory / "weights.zip"
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            bundle.writestr("../unsafe.bin" if unsafe else "model/data.bin", b"checkpoint bytes")
            if not unsafe:
                bundle.writestr("model/index", b"index")
        return archive

    def test_stream_inspection_and_generic_verification_do_not_modify_archive(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            archive = self._archive(directory)
            before = hashlib.sha256(archive.read_bytes()).hexdigest()
            inspected = provenance.inspect_archive(archive)
            expected = {
                name: {"byte_length": data["byte_length"], "sha256": data["sha256"]}
                for name, data in inspected["members"].items()
            }
            verification = provenance.verify_archive(
                inspected,
                expected_byte_length=inspected["byte_length"],
                expected_sha256=inspected["sha256"],
                expected_members=expected,
                expected_git_blob_sha1=inspected["git_blob_sha1"],
            )
            self.assertTrue(verification["verified_exact_archive"])
            self.assertFalse(inspected["source_extracted"])
            self.assertFalse(inspected["checkpoint_executed"])
            rendered = json.dumps(inspected, sort_keys=True)
            self.assertNotIn(str(directory), rendered)
            self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), before)

    def test_rejects_zip_slip_member(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            archive = self._archive(Path(temporary), unsafe=True)
            with self.assertRaisesRegex(provenance.ProvenanceError, "unsafe member"):
                provenance.inspect_archive(archive)

    def test_report_cannot_overwrite_archive_and_records_weight_license_gap(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            archive = self._archive(directory)
            report = {"schema": "test"}
            with self.assertRaisesRegex(provenance.ProvenanceError, "must not overwrite"):
                provenance.write_report(report, archive, archive=archive, overwrite=False)
            self.assertEqual(
                provenance.OFFICIAL["weight_license_audit"]["weight_r_and_d_use_status"],
                "not_proven_by_this_audit",
            )
            self.assertNotIn("daegeum", provenance.OFFICIAL["supported_pretrained_instruments"])


if __name__ == "__main__":
    unittest.main()
