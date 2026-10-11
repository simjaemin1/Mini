"""Synthetic-only tests for the local dry-component listening gate."""

from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
import wave

import numpy as np

import mac_mps_ddsp_pilot as pilot
import render_vb01_dry_listen as dry


def _private(path: Path, content: bytes) -> None:
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "wb") as sink:
        sink.write(content)


def _wav48() -> bytes:
    stream = io.BytesIO()
    with wave.open(stream, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(48_000)
        writer.writeframes(b"\x00\x00" * 192_000)
    return stream.getvalue()


class DryListenTests(unittest.TestCase):
    def test_dry_gain_is_audible_and_raw_array_is_unchanged(self):
        t = np.arange(pilot.WINDOW_SAMPLES) / pilot.SAMPLE_RATE
        audio = (0.001 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        original = audio.copy()
        payload, metrics = dry._prepare_dry(audio)
        self.assertGreater(metrics["dry_listening_gain_db"], 30)
        self.assertLess(metrics["matched_peak"], dry.MAX_PEAK)
        np.testing.assert_array_equal(audio, original)
        with wave.open(io.BytesIO(payload), "rb") as reader:
            self.assertEqual((reader.getframerate(), reader.getnframes()), (16_000, 64_000))

    def test_dry_clipping_fails_instead_of_limiting(self):
        audio = np.full(pilot.WINDOW_SAMPLES, 0.0001, np.float32)
        audio[0] = 0.5
        with self.assertRaisesRegex(dry.DryError, "cannot_match"):
            dry._prepare_dry(audio)

    def test_html_uses_four_local_tracks_and_discloses_unmatched_48k_level(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = dry._page([{"pair_number": 1, "dry_listening_gain_db": 40.0}],
                result_dir=root / "new" / "result", prior_pairs_dir=root / "old" / "result" / "pairs",
                reference48_dir=root / "reference48")
        page = payload.decode()
        self.assertEqual(page.count("<audio "), 4)
        self.assertIn("음량 미조정", page)
        self.assertIn("+40.00 dB", page)
        self.assertNotIn("https:", page)

    def test_48k_reference_contract_rehashes_every_wav(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary) / "reference"
            folder.mkdir(mode=0o700)
            payload = _wav48()
            digest = hashlib.sha256(payload).hexdigest()
            references = []
            for rank in range(1, 4):
                name = f"reference_{rank:02d}_original_48k.wav"
                _private(folder / name, payload)
                references.append({"pair_number": rank, "reference_name": name,
                                   "reference_sha256": digest, "reference_bytes": len(payload)})
            manifest = {"schema": "mini.aihub-71470-vb01-48k-source-reference.v1",
                "selection_sha256": "a" * 64, "bound_report_sha256": "b" * 64,
                "bound_binding_sha256": "c" * 64,
                "reference_level": "original_not_rms_matched",
                "prepared_crop_to_bound_pair_exact": True,
                "source_to_16k_pcm_exact": True,
                "references": references}
            _private(folder / "reference_manifest_private.json", json.dumps(manifest).encode())
            _, digests = dry._reference48_contract(folder, selection_sha="a" * 64,
                vb_report_sha="b" * 64, vb_binding_sha="c" * 64)
            self.assertEqual(len(digests), 3)
            with (folder / "reference_02_original_48k.wav").open("r+b") as handle:
                handle.seek(44)
                handle.write(b"x")
            with self.assertRaisesRegex(dry.DryError, "reference48_wav_mismatch"):
                dry._reference48_contract(folder, selection_sha="a" * 64,
                    vb_report_sha="b" * 64, vb_binding_sha="c" * 64)


if __name__ == "__main__":
    unittest.main()
