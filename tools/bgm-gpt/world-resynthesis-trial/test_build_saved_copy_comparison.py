"""Mock WORLD and synthetic/temp audio only; real tiny FFmpeg AAC checks."""
from contextlib import nullcontext
import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_saved_copy_comparison as saved
from test_build_copy_diagnostic import fixture


def mock_world(waveform, *, sample_rate, pitch_shift):
    assert sample_rate == 24000 and pitch_shift == 0
    assert waveform.shape == (24000,)
    time = np.arange(24000)/24000
    # Independent known waveform, not an original+generated mix or passthrough.
    result = .03*np.sin(2*np.pi*880*time)
    controls = {"f0_hz": np.full(201, 880.), "synthesis_f0_hz": np.full(201, 880.),
        "time_seconds": np.arange(201)*.005, "spectral_envelope": np.ones((201, 17)),
        "aperiodicity": np.full((201, 17), .02)}
    return result, controls, {"mock_only": True, "original_pcm_copy": False,
        "sp_ap_unchanged": True, "pitch_shift_semitones": 0, "output_samples": 24000}


class SavedComparisonTests(unittest.TestCase):
    def test_two_triplets_and_world_singles_real_aac_from_mock_world(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            manifest, original = fixture(base)
            before = {str(p): saved.private.sha256(p) for p in base.iterdir()}
            with (patch.object(saved.private, "PRIVATE_ROOT", base),
                  patch.object(saved, "ResourceGuard", return_value=nullcontext()),
                  patch.object(saved.importlib.metadata, "version", return_value="0.3.5"),
                  patch.object(saved, "analyze_and_synthesize", side_effect=mock_world) as world):
                report = saved.build(manifest, base / "out")
            self.assertEqual(world.call_count, 2)
            self.assertEqual(report["WORLD_synthesis_calls"], 2)
            self.assertEqual(report["failed_NSF_forward_calls"], 0)
            self.assertFalse(report["new_composition_or_ML_training"])
            self.assertFalse(report["natural_daegeum_timbre_approved"])
            self.assertTrue(report["immutable_inputs_and_code_unchanged"])
            self.assertEqual(report["status"], "rendered_not_listening_approved")
            out = base / "out"
            self.assertEqual(stat.S_IMODE(out.stat().st_mode), 0o700)
            for pair, lineage in zip(report["pairs"], original["copy_diagnostics"]):
                self.assertEqual(pair["raw_NSF_rms_error_db"], lineage["metrics"]["rms_delta_db"])
                self.assertEqual([row["role"] for row in pair["normalization"]],
                                 ["source", "rejected_NSF", "WORLD_copy"])
                for row in pair["normalization"]:
                    self.assertEqual(saved.private.sha256(Path(row["path"])), row["sha256"])
                    self.assertAlmostEqual(row["input_measurement"]["integrated_lufs"]+row["static_gain_db"], -24.)
                for key, seconds, frames in (("triplet", 3.8, 182400), ("world_single", 1., 48000)):
                    row = pair[key]
                    audio_path = out / row["file"]
                    self.assertEqual(saved.private.sha256(audio_path), row["sha256"])
                    self.assertEqual(row["seconds"], seconds)
                    self.assertEqual(row["programme_frames"], frames)
                    self.assertLessEqual(row["decoded_frames"], frames+1023)
                    self.assertLessEqual(row["decoded_full"]["true_peak_dbfs"], -1.1)
                    self.assertAlmostEqual(row["decoded_full"]["integrated_lufs"],
                                           row["expected_programme_lufs"], delta=.3)
                for stats in pair["per_excerpt_decoded_loudness"]:
                    self.assertAlmostEqual(stats["integrated_lufs"], -24., delta=.3)
                controls = out / pair["controls_file"]
                self.assertEqual(saved.private.sha256(controls), pair["controls_sha256"])
                with np.load(controls, allow_pickle=False) as archive:
                    np.testing.assert_array_equal(archive["f0_hz"], np.full(201, 880.))
                    self.assertEqual(archive["spectral_envelope"].shape, (201, 17))
                wave_path = out / pair["world_wave_file"]
                self.assertEqual(saved.private.sha256(wave_path), pair["world_wave_sha256"])
                waveform, rate = sf.read(wave_path, dtype="float32")
                self.assertEqual(rate, 24000)
                expected_time = np.arange(24000)/24000
                np.testing.assert_array_equal(waveform, (.03*np.sin(2*np.pi*880*expected_time)).astype(np.float32))
            for path in out.iterdir():
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(json.loads((out / "saved_copy_comparison.json").read_text()), report)
            self.assertEqual({str(p): saved.private.sha256(p) for p in base.iterdir() if p.is_file()}, before)
            self.assertEqual(len(list(out.glob("*.m4a"))), 4)

    def test_bad_saved_binding_rejected_before_world_or_output(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            manifest, _ = fixture(base)
            clip = base / "heldout1_prediction_1s_24k.wav"
            clip.write_bytes(clip.read_bytes()+b"changed")
            with (patch.object(saved.private, "PRIVATE_ROOT", base),
                  patch.object(saved, "analyze_and_synthesize") as world,
                  self.assertRaisesRegex(ValueError, "sha_or_size")):
                saved.build(manifest, base / "out")
            world.assert_not_called()
            self.assertFalse((base / "out").exists())

    def test_existing_output_is_not_overwritten_and_bad_world_cannot_publish_aac(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            manifest, _ = fixture(base)
            out = base / "out"
            out.mkdir(mode=0o700)
            keep = out / "keep"
            keep.write_text("keep")
            with (patch.object(saved.private, "PRIVATE_ROOT", base),
                  patch.object(saved, "analyze_and_synthesize") as world,
                  self.assertRaisesRegex(ValueError, "fresh_empty")):
                saved.build(manifest, out)
            world.assert_not_called()
            self.assertEqual(keep.read_text(), "keep")
            with (patch.object(saved.private, "PRIVATE_ROOT", base),
                  patch.object(saved, "ResourceGuard", return_value=nullcontext()),
                  patch.object(saved.importlib.metadata, "version", return_value="0.3.5"),
                  patch.object(saved, "analyze_and_synthesize", return_value=(np.full(24000, np.nan), {}, {})),
                  self.assertRaisesRegex(ValueError, "exact_finite")):
                saved.build(manifest, base / "bad")
            self.assertFalse(list((base / "bad").glob("*.m4a")))


if __name__ == "__main__":
    unittest.main()
