"""Public-score and synthetic-only tests; no original reference or model read."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prepare_inputs as prep


class InputPreparationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.compiled = prep.compile_score()
        cls.guide, cls.method = prep.sine_guide(cls.compiled)

    def test_public_guide_is_19p2s_stereo_float_and_four_exact_rests(self):
        self.assertEqual(self.guide.shape, (921_600, 2))
        self.assertEqual(self.guide.dtype, np.float32)
        np.testing.assert_array_equal(self.guide[:, 0], self.guide[:, 1])
        self.assertTrue(np.all(np.isfinite(self.guide)))
        self.assertEqual(self.method["pitched_events"], 28)
        self.assertFalse(self.method["vibrato_enabled"])
        for interval in self.method["rests"]:
            start, end = interval["start_sample_48k"], interval["end_sample_48k"]
            self.assertTrue(np.all(self.guide[start:end] == 0))
            self.assertLess(float(np.max(np.abs(self.guide[start - 2:start]))), 1e-6)

    def test_sine_pitch_is_the_authored_pitch_without_loaded_timbre(self):
        excerpt = self.guide[round(.95 * prep.SR):round(1.35 * prep.SR), 0]
        spectrum = np.abs(np.fft.rfft(excerpt * np.hanning(len(excerpt)), n=262_144))
        frequency = np.fft.rfftfreq(262_144, 1 / prep.SR)[np.argmax(spectrum)]
        self.assertAlmostEqual(float(frequency), 523.251131, delta=0.3)
        self.assertLess(float(np.max(np.abs(self.guide))), 0.036)

    def test_every_slur_has_attached_target_pitch_after_22ms(self):
        for event in self.compiled["events"]:
            if event["articulation"] != "slur":
                continue
            start = round((event["start_seconds"] + .022) * prep.SR)
            end = round((event["start_seconds"] + .060) * prep.SR)
            audio = self.guide[start:end, 0].astype(np.float64)
            crossings = np.flatnonzero((audio[:-1] <= 0) & (audio[1:] > 0))
            roots = crossings - audio[crossings] / (audio[crossings + 1] - audio[crossings])
            self.assertGreater(len(roots), 5)
            self.assertAlmostEqual(float(prep.SR / np.median(np.diff(roots))), event["pitch_hz"], delta=.5)

    def test_vibrato_or_foreign_control_rate_is_rejected(self):
        altered = copy.deepcopy(self.compiled)
        altered["vibrato_cents"][500] = 1
        with self.assertRaisesRegex(ValueError, "straight_b0"):
            prep.sine_guide(altered)
        altered = copy.deepcopy(self.compiled)
        altered["control_hz"] = 100
        with self.assertRaisesRegex(ValueError, "canonical"):
            prep.sine_guide(altered)

    def test_fresh_directory_does_not_overwrite_existing_content(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            with patch.object(prep, "PRIVATE_ROOT", base):
                fresh = prep.fresh_private_dir(base / "inputs")
                self.assertEqual(stat.S_IMODE(fresh.stat().st_mode), 0o700)
                (fresh / "existing.txt").touch()
                with self.assertRaisesRegex(ValueError, "fresh_empty"):
                    prep.fresh_private_dir(fresh)
                self.assertTrue((fresh / "existing.txt").exists())
                with self.assertRaisesRegex(ValueError, "approved_private"):
                    prep.fresh_private_dir(base)

    def test_synthetic_complete_preparation_provenance_and_padding(self):
        calls = []
        def fake_ffmpeg(arguments, data=None):
            path = Path(arguments[-1])
            path.write_bytes(b"synthetic-wave-fixture")
            path.chmod(0o600)
            calls.append(arguments)
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            source = base / "synthetic_reference.flac"
            source.write_bytes(b"synthetic-source-not-national-gugak")
            before = source.read_bytes()
            with (patch.object(prep, "SOURCE", source), patch.object(prep, "SOURCE_SHA", prep.sha256(source)),
                  patch.object(prep, "PRIVATE_ROOT", base), patch.object(prep, "_ffmpeg", side_effect=fake_ffmpeg)):
                result = prep.prepare(base / "prepared")
            self.assertEqual(result["files"], 4)
            self.assertEqual(source.read_bytes(), before)
            manifest_path = base / "prepared/input_manifest.json"
            self.assertEqual(stat.S_IMODE(manifest_path.stat().st_mode), 0o600)
            manifest = json.loads(manifest_path.read_text())
            self.assertFalse(manifest["model_inference_performed"])
            self.assertFalse(manifest["AIHub_audio_or_weights_used"])
            self.assertFalse(manifest["DDSP_Gugak_B_or_weights_used_as_input"])
            self.assertIn("first4.8s_plus0.2s", manifest["outputs"][-1]["kind"])
            self.assertIn("pan=stereo|c0=c0|c1=c0,aresample=48000,atrim=duration=4.8,apad=pad_dur=0.2", calls[-1])
            self.assertEqual([row["duration_seconds"] for row in manifest["outputs"]], [19.2, 19.2, 4.8, 5.0])


if __name__ == "__main__":
    unittest.main()
