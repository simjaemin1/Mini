"""Synthetic-only checks for the private VB01 fair listening gate."""

from __future__ import annotations

import hashlib
import io
import json
import math
import os
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch
import wave

import numpy as np

import make_vb01_fair_listen as fair


def _write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.parent.chmod(0o700)
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(payload)


def _json(path: Path, document: dict) -> str:
    payload = (json.dumps(document, sort_keys=True) + "\n").encode()
    _write(path, payload)
    return hashlib.sha256(payload).hexdigest()


def _tone(rate: int, hz: float) -> bytes:
    samples = np.rint(1622 * np.sin(2 * math.pi * hz * np.arange(4 * rate) / rate)).astype("<i2")
    return fair._pack_wav(samples, rate)


def _fixture(root: Path) -> tuple[Path, Path, Path, Path]:
    private = root / "gpt" / "aihub_private"
    original = private / "reference"
    bound = root / "gpt" / "bound"
    dry = root / "gpt" / "dry"
    for folder in (original, bound, dry):
        folder.mkdir(parents=True, mode=0o700)
    for folder in (root / "gpt", private):
        folder.chmod(0o700)
    selection_sha = _json(bound / "vibrato_selection_private.json", {"schema": "selection"})
    vb_report_sha = _json(bound / "result" / "vibrato_reproduction_report.json", {"schema": "report"})
    vb_assets, dry_assets, references = [], {}, []
    for rank in range(1, 4):
        raw_name = f"reference_{rank:02d}_original_48k.wav"
        raw = _tone(48_000, 220.0 + 20 * rank)
        _write(original / raw_name, raw)
        references.append({"pair_number": rank, "reference_name": raw_name,
                           "reference_sha256": fair._sha(raw), "reference_bytes": len(raw)})
        for suffix in ("source_input_16k", "reconstruction"):
            name = f"pair_{rank:02d}_{suffix}.wav"
            payload = _tone(16_000, 220.0 + 20 * rank)
            _write(bound / "result" / "pairs" / name, payload)
            vb_assets.append({"name": name, "sha256": fair._sha(payload), "bytes": len(payload)})
        dry_name = f"dry_pair_{rank:02d}_harmonic_plus_noise.wav"
        dry_payload = _tone(16_000, 220.0 + 20 * rank)
        _write(dry / "result" / "pairs" / dry_name, dry_payload)
        dry_assets[dry_name] = {"sha256": fair._sha(dry_payload), "bytes": len(dry_payload)}
    vb_binding_sha = _json(bound / "result" / "checkpoint_binding.json", {
        "status": "complete_bound_to_checkpoint", "selection_sha256": selection_sha,
        "reproduction_report_sha256": vb_report_sha,
        "checkpoint_sha256": "c" * 64, "checkpoint_marker_sha256": "m" * 64,
        "private_pair_wav_digests": vb_assets})
    reference_sha = _json(original / "reference_manifest_private.json", {
        "schema": "mini.aihub-71470-vb01-48k-source-reference.v1",
        "reference_level": "original_not_rms_matched",
        "prepared_crop_to_bound_pair_exact": True, "source_to_16k_pcm_exact": True,
        "selection_sha256": selection_sha, "bound_report_sha256": vb_report_sha,
        "bound_binding_sha256": vb_binding_sha, "references": references})
    dry_report_sha = _json(dry / "result" / "dry_listen_report.json", {
        "status": "dry_component_listen_ready", "pair_count": 3,
        "target_rms_dbfs": -29.1186,
        "pairs": [{"pair_number": rank, "matched_rms_dbfs": -29.1186} for rank in range(1, 4)]})
    _json(dry / "result" / "checkpoint_binding.json", {
        "status": "complete_bound_to_checkpoint", "selection_sha256": selection_sha,
        "vb_report_sha256": vb_report_sha, "vb_binding_sha256": vb_binding_sha,
        "reference48_manifest_sha256": reference_sha, "dry_report_sha256": dry_report_sha,
        "checkpoint_sha256": "c" * 64, "checkpoint_marker_sha256": "m" * 64,
        "dry_wav_digests": dry_assets})
    return original, bound, dry, private / "fair"


class FairListenTests(unittest.TestCase):
    def test_match_keeps_raw_unmodified_and_has_exact_four_seconds(self) -> None:
        samples = np.rint(800 * np.sin(2 * np.pi * 440 * np.arange(192_000) / 48_000)).astype("<i2")
        untouched = samples.copy()
        payload, metrics = fair._match_48k(samples)
        np.testing.assert_array_equal(samples, untouched)
        with wave.open(io.BytesIO(payload), "rb") as reader:
            self.assertEqual((reader.getframerate(), reader.getnframes()), (48_000, 192_000))
            pcm = np.frombuffer(reader.readframes(192_000), dtype="<i2").astype(float) / 32768
        self.assertAlmostEqual(float(np.sqrt(np.mean(pcm * pcm))), fair.TARGET_RMS, places=5)
        self.assertLess(metrics["matched_peak"], fair.MAX_PEAK)

    def test_matching_rejects_spike_clipping(self) -> None:
        samples = np.full(192_000, 30, dtype="<i2")
        samples[0] = 32767
        with self.assertRaisesRegex(fair.FairListenError, "matching_would_clip"):
            fair._match_48k(samples)

    def test_page_has_twelve_relative_players_and_raw_links(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            page = fair._page(root / "private" / "fair", root / "private" / "raw",
                              root / "bound", root / "dry").decode()
        self.assertEqual(page.count("<audio "), 12)
        self.assertEqual(page.count("원래 음량 파일 따로 열기"), 3)
        self.assertIn("전체 음량 일치", page)
        self.assertIn("시간에 따른 음량 변화", page)
        self.assertIn("최종 소리가 아닙니다", page)
        self.assertNotIn("https:", page)
        self.assertNotIn("file:", page)

    def test_full_creation_inspection_and_tamper_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            original, bound, dry, output = _fixture(Path(tmp))
            original_before = [(p, fair._sha(p.read_bytes())) for p in original.glob("*.wav")]
            reserve = SimpleNamespace(free=fair.MIN_FREE_AFTER + 100_000_000)
            with patch.object(fair.shutil, "disk_usage", return_value=reserve):
                result = fair.create(original, bound, dry, output)
            self.assertEqual(result["tracks"], 12)
            self.assertEqual(fair.inspect(original, bound, dry, output)["status"],
                             "complete_private_local_listen_only")
            for path, digest in original_before:
                self.assertEqual(fair._sha(path.read_bytes()), digest)
            self.assertEqual(output.stat().st_mode & 0o777, 0o700)
            self.assertTrue(all(path.stat().st_mode & 0o777 == 0o600 for path in output.iterdir()))
            tampered = dry / "result" / "pairs" / "dry_pair_02_harmonic_plus_noise.wav"
            with tampered.open("r+b") as handle:
                handle.seek(60)
                handle.write(b"X")
            with self.assertRaisesRegex(fair.FairListenError, "prior_asset_digest_mismatch"):
                fair.inspect(original, bound, dry, output)


if __name__ == "__main__":
    unittest.main()
