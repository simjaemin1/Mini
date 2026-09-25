"""Fixtures for the narrow official-NGC download-receipt gate."""

from __future__ import annotations

import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
NATIVE_WAV_DIR = HERE.parent / "daegeum-transitions"
for directory in (HERE, NATIVE_WAV_DIR):
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))

import validate_receipt as validator
from native_wav import inspect_wav


def _write_pcm16(path: Path) -> None:
    samples = (0, 1000, -1000, 2000, -2000, 0, 100, -100)
    payload = struct.pack("<" + "h" * len(samples), *samples)
    channels = 2
    sample_rate = 44_100
    fmt = struct.pack("<HHIIHH", 1, channels, sample_rate, sample_rate * channels * 2, channels * 2, 16)
    header = b"RIFF" + (36 + len(payload)).to_bytes(4, "little") + b"WAVE"
    header += b"fmt " + len(fmt).to_bytes(4, "little") + fmt
    header += b"data" + len(payload).to_bytes(4, "little")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header + payload)


def _scope() -> dict[str, bool]:
    return {
        "r_and_d_only": True,
        "no_default_assets": True,
        "no_runtime_bgm": True,
        "no_game_output": True,
        "no_public_release": True,
    }


def _receipt(root: Path) -> tuple[Path, Path]:
    sources = root / "official-downloads"
    wav = sources / "Bak_1.wav"
    _write_pcm16(wav)
    descriptor = inspect_wav(wav)
    native = descriptor["native_audio"]
    receipt = {
        "schema": validator.RECEIPT_SCHEMA,
        "r_and_d_scope": _scope(),
        "scope_limits": {
            "not_a_game_asset": True,
            "not_a_training_item": True,
            "requires_new_scope_review": True,
        },
        "official_record": {
            "provider": "National Gugak Center",
            "collection": "monotone",
            "record_id": 2258,
            "catalog_url": "https://apis.gugak.go.kr/digitaleum/front/monotone/list.do?instrCd=19834",
            "kogl": {"type": "1", "attribution_required": True},
            "credit": {
                "organization": "국립국악원",
                "title": "박 / 타격음 / 1회",
                "creator_displayed": "not_displayed_in_catalog",
                "catalog_url": "https://apis.gugak.go.kr/digitaleum/front/monotone/list.do?instrCd=19834",
            },
        },
        "download_attestation": {
            "normal_official_ui_download": True,
            "source_root_id": "fixture_official_downloads",
            "source_root": str(sources.resolve()),
            "relative_path": "Bak_1.wav",
            "sha256": descriptor["sha256"],
            "native_audio": {
                "sample_rate_hz": native["sample_rate_hz"],
                "channels": native["channels"],
                "frame_count": native["frame_count"],
                "encoding": native["encoding"],
            },
        },
    }
    path = root / "receipt.json"
    path.write_text(json.dumps(receipt, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    return path, wav


class ReceiptValidatorTests(unittest.TestCase):
    def test_valid_receipt_rehashes_wav_and_writes_path_free_report(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            receipt, wav = _receipt(root)
            output = root / "report"
            report = validator.write_report(receipt=receipt, output_dir=output)
            self.assertEqual(report["downloaded_source"]["sha256"], inspect_wav(wav)["sha256"])
            self.assertEqual(report["downloaded_source"]["source_root_id"], "fixture_official_downloads")
            self.assertTrue(report["scope_limits"]["not_a_game_asset"])
            report_text = (output / validator.REPORT_FILENAME).read_text(encoding="utf-8")
            self.assertNotIn(str(root), report_text)

    def test_rejects_wrong_sha_before_creating_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            receipt, _ = _receipt(root)
            data = json.loads(receipt.read_text(encoding="utf-8"))
            data["download_attestation"]["sha256"] = "0" * 64
            receipt.write_text(json.dumps(data), encoding="utf-8")
            output = root / "wrong-sha"
            with self.assertRaisesRegex(validator.NGCReceiptError, "SHA-256"):
                validator.write_report(receipt=receipt, output_dir=output)
            self.assertFalse(output.exists())

    def test_rejects_unprovenanced_license_or_path_escape(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            receipt, _ = _receipt(root)
            data = json.loads(receipt.read_text(encoding="utf-8"))
            data["official_record"]["kogl"]["type"] = "4"
            receipt.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(validator.NGCReceiptError, "KOGL Type 1"):
                validator.validate_receipt(receipt)
            receipt, _ = _receipt(root / "again")
            data = json.loads(receipt.read_text(encoding="utf-8"))
            data["download_attestation"]["relative_path"] = "../Bak_1.wav"
            receipt.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(validator.NGCReceiptError, "safe relative path"):
                validator.validate_receipt(receipt)


if __name__ == "__main__":
    unittest.main()
