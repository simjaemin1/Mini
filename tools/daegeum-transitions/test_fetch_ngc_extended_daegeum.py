#!/usr/bin/env python3
"""Offline tests for the explicit NGC extended-Daegeum R&D fetch contract.

No test contacts gugak.go.kr.  A tiny temporary WAV and a fake catalog client
exercise the important policy boundaries: exact metadata scope, plan before
download, hash/native-WAV provenance, resume, verify-only, batch opt-in, and
server filename/payload rejection.

    python3 tools/daegeum-transitions/test_fetch_ngc_extended_daegeum.py
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import tempfile
import unittest
import wave
from unittest.mock import patch
from typing import Any, Dict, List


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import fetch_ngc_extended_daegeum as fetcher  # noqa: E402


def _tiny_wav_bytes() -> bytes:
    """Make a real direct WAV fixture without relying on external audio tools."""

    with tempfile.TemporaryDirectory(prefix="ngc-fetch-test-wav-") as temporary:
        path = Path(temporary) / "fixture.wav"
        values = []
        for index in range(1200):
            sample = 0.2 * math.sin(2.0 * math.pi * 440.0 * index / 12_000.0)
            values.append(int(round(sample * 32767.0)))
        with wave.open(str(path), "wb") as stream:
            stream.setnchannels(1)
            stream.setsampwidth(2)
            stream.setframerate(12_000)
            stream.writeframes(struct.pack("<%dh" % len(values), *values))
        return path.read_bytes()


def _catalog_record(sequence: int, *, division: str = "대금산조") -> Dict[str, Any]:
    return {
        "extendSeq": sequence,
        "instrCd": "EXTEND0001",
        "instrDivCd": "INDV0001",
        "division": division,
        "extendNmKor": "대금산조 %02d" % (sequence - 1519),
        "extendDescKor": "대금 산조 악구",
        "extendNmEng": "Daegeum Sanjo %02d" % (sequence - 1519),
        "extendDescEng": "Daegeum Sanjo Phrase",
        "player": "test-player",
        "beat": "3/4",
        "bpm": 84,
        "mp3FilePath": "/tmusic/05_Daegeum/mp3/Daegeum_SJ_%03d.mp3" % (sequence - 1519),
        "wavFilePath": "/tmusic/05_Daegeum/Daegeum_SJ_%03d.wav" % (sequence - 1519),
    }


def _detail_from_catalog(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "extend_seq": record["extendSeq"],
        "instr_cd": record["instrCd"],
        "instr_div_cd": record["instrDivCd"],
        "instr_name": "대금",
        "instr_div_name": "관악기",
        "division": record["division"],
        "extend_nm_kor": record["extendNmKor"],
        "extend_desc_kor": record["extendDescKor"],
        "extend_nm_eng": record["extendNmEng"],
        "extend_desc_eng": record["extendDescEng"],
        "player": record["player"],
        "beat": record["beat"],
        "bpm": record["bpm"],
        "mp3_file_path": record["mp3FilePath"],
        "wav_file_path": record["wavFilePath"],
    }


class FakeNGCClient:
    """A memory-only fake with the same three calls used by plan_or_download."""

    instances: List["FakeNGCClient"] = []
    records: List[Dict[str, Any]] = []
    audio_bytes = _tiny_wav_bytes()
    returned_filename_override: str = ""
    payload_override: bytes = b""

    def __init__(self, timeout_seconds: float) -> None:
        self.timeout_seconds = timeout_seconds
        self.download_calls: List[Dict[str, Any]] = []
        FakeNGCClient.instances.append(self)

    def begin_catalog_session(self) -> Dict[str, Any]:
        return {
            "catalog_page_url": "https://www.gugak.go.kr/digitaleum/front/extend/list.do",
            "catalog_page_sha256": "a" * 64,
            "observed_at_utc": "2026-09-24T00:00:00Z",
            "notice": "공공누리 제1유형(출처표시)",
            "notice_url_as_linked_by_catalog": "http://www.kogl.or.kr/open/info/license_info/by.do",
            "status": "catalog_page_declares_kogl_type_1_attribution",
            "not_a_model_training_or_game_distribution_clearance": True,
        }

    def catalog(self):  # type: ignore[no-untyped-def]
        return list(self.records), {"instrCd": "EXTEND0001", "instrName": "대금", "instrDivCd": "INDV0001"}

    def file_info(self, extend_seq: int) -> Dict[str, Any]:
        for record in self.records:
            if record["extendSeq"] == extend_seq:
                return _detail_from_catalog(record)
        raise AssertionError("unknown fake sequence")

    def download_to(self, extend_seq: int, submitted_fields: Dict[str, str], destination: Path) -> Dict[str, Any]:
        self.download_calls.append({"extend_seq": extend_seq, "submitted_fields": dict(submitted_fields)})
        payload = self.payload_override or self.audio_bytes
        destination.write_bytes(payload)
        record = next(item for item in self.records if item["extendSeq"] == extend_seq)
        filename = self.returned_filename_override or Path(record["wavFilePath"]).name
        return {
            "sha256": hashlib.sha256(payload).hexdigest(),
            "byte_length": len(payload),
            "http_status": 200,
            "response_headers": {
                "content-type": "audio/x-wav",
                "content-disposition": "attachment; filename*=UTF-8''" + filename,
            },
            "returned_filename": filename,
        }


class ExtendedDaegeumFetchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="ngc-extended-fetch-")
        self.output = Path(self.temporary.name) / "rd-output"
        FakeNGCClient.instances = []
        FakeNGCClient.records = [
            _catalog_record(1520),
            _catalog_record(1521),
            _catalog_record(1900, division="대금정악"),
        ]
        FakeNGCClient.returned_filename_override = ""
        FakeNGCClient.payload_override = b""
        self.client_patch = patch.object(fetcher, "NGCClient", FakeNGCClient)
        self.client_patch.start()

    def tearDown(self) -> None:
        self.client_patch.stop()
        self.temporary.cleanup()

    def _run(self, sequences, download=False, allow_batch=False):  # type: ignore[no-untyped-def]
        return fetcher.plan_or_download(
            self.output,
            sequences,
            download=download,
            allow_batch=allow_batch,
            use_purpose_gb="비상업용",
            use_purpose="연구용",
            use_purpose_detail="",
            organization="",
            timeout_seconds=2.0,
        )

    def _manifest(self) -> Dict[str, Any]:
        return json.loads((self.output / fetcher.MANIFEST_NAME).read_text(encoding="utf-8"))

    def test_exact_filter_refuses_broad_daegeum_title_match(self) -> None:
        selected, counts = fetcher.select_exact_sanjo_records(FakeNGCClient.records, [1520, 1521])
        self.assertEqual([item["extendSeq"] for item in selected], [1520, 1521])
        self.assertEqual(counts["catalog_returned_count"], 3)
        self.assertEqual(counts["exact_daegeum_sanjo_count"], 2)
        self.assertEqual(counts["excluded_by_exact_scope_count"], 1)
        with self.assertRaisesRegex(fetcher.FetchError, "not an exact NGC Daegeum Sanjo"):
            fetcher.select_exact_sanjo_records(FakeNGCClient.records, [1900])

    def test_plan_records_server_metadata_but_downloads_nothing(self) -> None:
        result = self._run([1520])
        self.assertEqual(result["mode"], "plan")
        self.assertEqual(result["newly_downloaded"], 0)
        manifest = self._manifest()
        self.assertEqual(manifest["scope"]["exact_daegeum_sanjo_count"], 2)
        self.assertTrue(manifest["scope"]["no_all_or_broad_title_selection_mode"])
        self.assertEqual(manifest["submitted_purpose"]["companyName"]["submission_state"], "blank")
        entry = manifest["entries"][0]
        self.assertEqual(entry["extend_seq"], 1520)
        self.assertEqual(entry["source"]["original_wav_filename"], "Daegeum_SJ_001.wav")
        self.assertEqual(entry["download"]["state"], "planned")
        self.assertFalse(entry["musical_status"]["approved_transition"])
        self.assertFalse((self.output / "audio").exists())
        self.assertEqual(sum(len(item.download_calls) for item in FakeNGCClient.instances), 0)

    def test_single_download_records_hash_native_descriptor_and_verifies(self) -> None:
        result = self._run([1520], download=True)
        self.assertEqual(result["newly_downloaded"], 1)
        manifest = self._manifest()
        entry = manifest["entries"][0]
        download = entry["download"]
        self.assertEqual(download["state"], "downloaded")
        audio = self.output / download["relative_path"]
        self.assertTrue(audio.is_file())
        self.assertEqual(download["sha256"], hashlib.sha256(FakeNGCClient.audio_bytes).hexdigest())
        self.assertEqual(download["native_wav"]["native_audio"]["sample_rate_hz"], 12_000)
        self.assertEqual(fetcher.verify_manifest(self.output), {"verified_downloaded": 1, "planned_not_downloaded": 0})
        calls = [item for client in FakeNGCClient.instances for item in client.download_calls]
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["submitted_fields"], {
            "usePurposeGb": "비상업용",
            "usePurpose": "연구용",
            "usePurposeDtl": "",
            "companyName": "",
        })

    def test_resume_does_not_re_download_a_verified_entry(self) -> None:
        self._run([1520], download=True)
        calls_after_first = sum(len(item.download_calls) for item in FakeNGCClient.instances)
        self._run([1520], download=True)
        calls_after_second = sum(len(item.download_calls) for item in FakeNGCClient.instances)
        self.assertEqual(calls_after_first, 1)
        self.assertEqual(calls_after_second, 1)

    def test_batch_download_requires_explicit_opt_in_before_network_client(self) -> None:
        with self.assertRaisesRegex(fetcher.FetchError, "require --allow-batch"):
            self._run([1520, 1521], download=True)
        self.assertEqual(FakeNGCClient.instances, [])
        self.assertFalse(self.output.exists())

    def test_tampered_audio_fails_verify_only(self) -> None:
        self._run([1520], download=True)
        manifest = self._manifest()
        audio = self.output / manifest["entries"][0]["download"]["relative_path"]
        with audio.open("ab") as stream:
            stream.write(b"tamper")
        with self.assertRaisesRegex(fetcher.FetchError, "SHA-256"):
            fetcher.verify_manifest(self.output)

    def test_wrong_returned_filename_never_becomes_final_audio(self) -> None:
        FakeNGCClient.returned_filename_override = "not-the-catalog-name.wav"
        with self.assertRaisesRegex(fetcher.FetchError, "returned filename"):
            self._run([1520], download=True)
        self.assertFalse((self.output / "audio" / "extend-001520.wav").exists())
        self.assertEqual(self._manifest()["entries"][0]["download"]["state"], "planned")

    def test_html_payload_never_becomes_final_audio(self) -> None:
        FakeNGCClient.payload_override = b"<html>not a wav</html>"
        with self.assertRaisesRegex(fetcher.FetchError, "RIFF/WAVE"):
            self._run([1520], download=True)
        self.assertFalse((self.output / "audio" / "extend-001520.wav").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
