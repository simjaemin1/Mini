"""Synthetic-only local AAC comparison tests: no original audio or models."""
from __future__ import annotations

import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
import wave

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import compare_audio as comparison
import prepare_inputs as prep


def fixture(path: Path, amplitude=.05, seconds=5.2, envelope=False):
    time = np.arange(round(seconds * comparison.SR)) / comparison.SR
    audio = amplitude * np.sin(2 * np.pi * 1000 * time)
    if envelope:
        audio[time < 2.4] *= .25
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(comparison.SR)
        handle.writeframes(np.rint(audio * 32767).astype("<i2").tobytes())


class StaticComparisonTests(unittest.TestCase):
    def test_common_target_is_lowered_for_every_input_not_individual_limiting(self):
        measurements = [{"integrated_lufs": -40, "true_peak_dbfs": -8},
                        {"integrated_lufs": -20, "true_peak_dbfs": -15}]
        target = comparison.common_target(measurements)
        self.assertAlmostEqual(target, -33.1)
        gains = [target - row["integrated_lufs"] for row in measurements]
        self.assertAlmostEqual(gains[0] - gains[1], 20)
        for row, gain in zip(measurements, gains):
            self.assertLessEqual(row["true_peak_dbfs"] + gain, -1.1 + 1e-9)
            self.assertAlmostEqual(row["integrated_lufs"] + gain, target)

    def test_roundtrip_exact_excerpt_matched_lufs_static_envelope_private_provenance(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            first, second = base / "first.wav", base / "second.wav"
            fixture(first, .06, envelope=True)
            fixture(second, .015)
            digests = [prep.sha256(first), prep.sha256(second)]
            with patch.object(prep, "PRIVATE_ROOT", base):
                report = comparison.compare([f"novel_score={first}", f"codec_only={second}"], base / "out")
            self.assertEqual(report["status"], "ready")
            self.assertTrue(report["no_compression_AGC_EQ_pitch_time_edits"])
            self.assertFalse(report["model_inference_or_external_upload"])
            self.assertEqual([prep.sha256(first), prep.sha256(second)], digests)
            self.assertEqual(stat.S_IMODE((base / "out").stat().st_mode), 0o700)
            target = report["actual_common_target_lufs"]
            for row, digest in zip(report["outputs"], digests):
                self.assertEqual(row["source_sha256"], digest)
                self.assertEqual(row["programme_frames"], 230_400)
                self.assertGreaterEqual(row["decoded_frames"], 230_400)
                self.assertLessEqual(row["decoded_frames"], 231_423)
                self.assertAlmostEqual(row["decoded"]["integrated_lufs"], target, delta=.3)
                self.assertLessEqual(row["decoded"]["true_peak_dbfs"], -1.1 + 1e-9)
                self.assertAlmostEqual(row["source_first4p8s"]["integrated_lufs"] + row["static_gain_db"], target)
                self.assertEqual(stat.S_IMODE((base / "out" / row["file"]).stat().st_mode), 0o600)
            restored = comparison.decode(base / "out/01.m4a", trim=False)[:, 0]
            low = restored[round(.5 * comparison.SR):round(1.5 * comparison.SR)]
            high = restored[round(3 * comparison.SR):round(4 * comparison.SR)]
            self.assertAlmostEqual(float(np.sqrt(np.mean(high ** 2) / np.mean(low ** 2))), 4, delta=.1)
            saved = json.loads((base / "out/comparison.json").read_text())
            self.assertEqual(saved, report)
            self.assertEqual(stat.S_IMODE((base / "out/comparison.json").stat().st_mode), 0o600)

    def test_codec_overshoot_reencodes_all_inputs_at_same_lower_target(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            first, second = base / "first.wav", base / "second.wav"
            fixture(first, .04)
            fixture(second, .02)
            real_measure = comparison.measure
            calls = 0
            def simulated_first_codec_overshoot(audio):
                nonlocal calls
                calls += 1
                stats = real_measure(audio)
                if calls == 3:
                    stats["true_peak_dbfs"] = -.2
                return stats
            with (patch.object(prep, "PRIVATE_ROOT", base),
                  patch.object(comparison, "measure", side_effect=simulated_first_codec_overshoot)):
                report = comparison.compare([f"novel_score={first}", f"historical_baseline={second}"], base / "out")
            self.assertEqual(len(report["attempts"]), 2)
            self.assertAlmostEqual(report["actual_common_target_lufs"], -25)
            for row in report["outputs"]:
                self.assertAlmostEqual(row["source_first4p8s"]["integrated_lufs"] + row["static_gain_db"], -25)
            self.assertEqual([path.name for path in (base / "out").iterdir() if path.is_dir()], [])

    def test_short_silent_duplicate_and_wrong_count_fail_without_outputs(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            good, short, silent = base / "good.wav", base / "short.wav", base / "silent.wav"
            fixture(good)
            fixture(short, seconds=4.7)
            fixture(silent, amplitude=0)
            for values in ([f"x={good}"], [f"x={good}"] * 5, [f"x={good}", f"x={good}"],
                           [f"x={good}", f"y={short}"], [f"x={good}", f"y={silent}"]):
                with patch.object(prep, "PRIVATE_ROOT", base), self.assertRaises(ValueError):
                    comparison.compare(values, base / "out")
                self.assertFalse((base / "out").exists())

    def test_preexisting_output_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            first, second = base / "first.wav", base / "second.wav"
            fixture(first)
            fixture(second)
            output = base / "out"
            output.mkdir(mode=0o700)
            keep = output / "keep.txt"
            keep.write_text("keep")
            with patch.object(prep, "PRIVATE_ROOT", base), self.assertRaisesRegex(ValueError, "fresh_empty"):
                comparison.compare([f"x={first}", f"y={second}"], output)
            self.assertEqual(keep.read_text(), "keep")


if __name__ == "__main__":
    unittest.main()
