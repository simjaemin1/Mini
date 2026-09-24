#!/usr/bin/env python3
"""Deterministic, source-preserving tests for ``inventory.py``."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("inventory.py")
SPEC = importlib.util.spec_from_file_location("gugak_corpus_inventory_test", MODULE_PATH)
assert SPEC and SPEC.loader
inventory = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = inventory
SPEC.loader.exec_module(inventory)


def _chunk(identifier: bytes, payload: bytes) -> bytes:
    return identifier + struct.pack("<I", len(payload)) + payload + (b"\0" if len(payload) & 1 else b"")


def _pcm16_wav(*, sample_rate: int, channels: int, frames: list[tuple[int, ...]]) -> bytes:
    assert channels > 0 and all(len(frame) == channels for frame in frames)
    payload = b"".join(struct.pack("<" + "h" * channels, *frame) for frame in frames)
    block_align = channels * 2
    fmt = struct.pack("<HHIIHH", 1, channels, sample_rate, sample_rate * block_align, block_align, 16)
    body = b"WAVE" + _chunk(b"fmt ", fmt) + _chunk(b"data", payload)
    return b"RIFF" + struct.pack("<I", len(body)) + body


class CorpusInventoryTests(unittest.TestCase):
    def _fixture(self, base: Path) -> tuple[Path, Path, dict[Path, bytes]]:
        left = base / "left"
        right = base / "right"
        left.mkdir()
        right.mkdir()
        (right / "nested").mkdir()

        daegeum = _pcm16_wav(
            sample_rate=48000,
            channels=2,
            frames=[(-32768, 32767), (0, 16384), (8192, -8192)],
        )
        haegeum = _pcm16_wav(sample_rate=44100, channels=1, frames=[(0,), (1200,)])
        files = {
            left / "산조대금_scale.wav": daegeum,
            right / "DaegeumScale.wav": daegeum,  # Same source bytes under another name/root.
            right / "해금_악구.wav": haegeum,
            right / "nested" / "untitled.mp3": b"not a decoded MP3 fixture\n",
            right / "broken.wav": b"RIFF\x00\x00\x00\x00not-wave",
        }
        for path, contents in files.items():
            path.write_bytes(contents)
        return left, right, files

    @staticmethod
    def _item_by_digest(report: dict, digest: str) -> dict:
        return next(item for item in report["items"] if item["sha256"] == digest)

    def test_inventory_is_deterministic_hash_deduplicated_and_path_safe(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            left, right, files = self._fixture(base)
            before = {path: hashlib.sha256(contents).hexdigest() for path, contents in files.items()}

            first = inventory.build_inventory((left, right), root_labels=("source-a", "source-b"))
            second = inventory.build_inventory((left, right), root_labels=("source-a", "source-b"))

            self.assertEqual(
                json.dumps(first, ensure_ascii=False, sort_keys=True),
                json.dumps(second, ensure_ascii=False, sort_keys=True),
            )
            self.assertEqual(first["schema"], inventory.SCHEMA)
            self.assertEqual(first["summary"]["audio_files_discovered"], 5)
            self.assertEqual(first["summary"]["unique_sha256_source_count"], 4)
            self.assertEqual(first["summary"]["duplicate_audio_file_count"], 1)
            self.assertEqual(first["summary"]["inspection_status_counts"]["native_wav_inspected"], 3)
            self.assertEqual(first["summary"]["inspection_status_counts"]["uninspected_non_wav_container"], 1)
            self.assertEqual(first["summary"]["inspection_status_counts"]["wav_inspection_failed"], 1)

            daegeum_digest = before[left / "산조대금_scale.wav"]
            item = self._item_by_digest(first, daegeum_digest)
            self.assertEqual(item["occurrence_count"], 2)
            self.assertEqual(item["instrument_family_hint"]["value"], "daegeum")
            self.assertEqual(item["source_role_hint"]["value"], "named_technique_or_exercise_candidate")
            self.assertEqual(
                item["canonical_inspection"]["native_descriptor"]["native_audio"]["sample_rate_hz"],
                48000,
            )
            self.assertEqual(
                item["canonical_inspection"]["native_descriptor"]["native_audio"]["frame_count"], 3
            )
            self.assertAlmostEqual(item["canonical_inspection"]["duration_seconds"], 3 / 48000)

            haegeum_item = self._item_by_digest(first, before[right / "해금_악구.wav"])
            self.assertEqual(haegeum_item["instrument_family_hint"]["value"], "haegeum")
            self.assertEqual(haegeum_item["source_role_hint"]["value"], "named_phrase_or_performance_candidate")
            self.assertEqual(
                haegeum_item["canonical_inspection"]["native_descriptor"]["native_audio"]["duration_seconds"],
                2 / 44100,
            )

            rendered = json.dumps(first, ensure_ascii=False, sort_keys=True)
            self.assertNotIn(str(base), rendered)
            self.assertNotIn(str(left), rendered)
            self.assertEqual(first["roots"][0]["label"], "source-a")
            self.assertNotIn("path", first["roots"][0])
            self.assertEqual(first["policy"]["legal_clearance"], "unknown_not_inferred")
            self.assertEqual(first["policy"]["articulation"], "unknown_not_inferred")
            self.assertEqual(first["policy"]["phrase_continuity_or_quality"], "unknown_not_inferred")
            self.assertEqual(first["policy"]["game_or_model_eligibility"], "unknown_not_inferred")

            after = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
            self.assertEqual(after, before, "inventory must never change an audio source")

    def test_filename_classification_is_conservative(self) -> None:
        daegeum = inventory.classify_filename("정악대금_스타카토.wav")
        self.assertEqual(daegeum["instrument_family_hint"]["value"], "daegeum")
        self.assertEqual(daegeum["source_role_hint"]["value"], "named_technique_or_exercise_candidate")

        specific_piri = inventory.classify_filename("향피리_scale.wav")
        self.assertEqual(specific_piri["instrument_family_hint"]["value"], "hyangpiri")

        reference = inventory.classify_filename("산조가야금_참고연주.flac")
        self.assertEqual(reference["instrument_family_hint"]["value"], "gayageum")
        self.assertEqual(reference["source_role_hint"]["value"], "named_phrase_or_performance_candidate")

        ambiguous = inventory.classify_filename("대금_해금.wav")
        self.assertEqual(ambiguous["instrument_family_hint"]["status"], "ambiguous_filename_hints")
        self.assertIsNone(ambiguous["instrument_family_hint"]["value"])

        unknown = inventory.classify_filename("mystery_take.wav")
        self.assertEqual(unknown["instrument_family_hint"]["status"], "unknown")
        self.assertEqual(unknown["source_role_hint"]["status"], "unknown")

    def test_explicit_output_is_not_allowed_inside_a_source_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            left, right, files = self._fixture(base)
            report = inventory.build_inventory((left, right))
            source_before = {path: path.read_bytes() for path in files}

            with self.assertRaisesRegex(inventory.InventoryError, "outside every explicit audio root"):
                inventory.write_report(report, left / "inventory.json", roots=(left, right), overwrite=False)

            output = base / "inventory.json"
            inventory.write_report(report, output, roots=(left, right), overwrite=False)
            self.assertTrue(output.is_file())
            with self.assertRaisesRegex(inventory.InventoryError, "already exists"):
                inventory.write_report(report, output, roots=(left, right), overwrite=False)
            inventory.write_report(report, output, roots=(left, right), overwrite=True)
            self.assertEqual({path: path.read_bytes() for path in files}, source_before)

    def test_roots_are_required_and_labels_cannot_be_paths(self) -> None:
        with self.assertRaisesRegex(inventory.InventoryError, "explicit --root"):
            inventory.build_inventory(())
        with self.assertRaisesRegex(inventory.InventoryError, "non-path"):
            inventory._safe_label("/private/source")


if __name__ == "__main__":
    unittest.main()
