"""Synthetic/temp-only tests; no saved private recordings, weights or inference."""
import json
import math
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_copy_diagnostic as diagnostic


def fixture(base):
    time = np.arange(24000) / 24000
    pairs = []
    for index in (1, 2):
        waves = [.02 * np.sin(2*np.pi*(440+110*index)*time),
                 .04 * np.sin(2*np.pi*(440+110*index)*time)]
        # Two-level envelope tests preservation by one constant gain, not AGC.
        waves[0][time < .5] *= .25
        rows, rms = [], []
        for role, wave in zip(("source_static_gain", "prediction"), waves):
            path = base / f"heldout{index}_{role}_1s_24k.wav"
            sf.write(path, wave.astype(np.float32), 24000, subtype="FLOAT")
            path.chmod(0o600)
            rms.append(float(np.sqrt(np.mean(wave.astype(np.float32).astype(np.float64)**2))))
            rows.append({"file": path.name, "sha256": diagnostic.private.sha256(path),
                "bytes": path.stat().st_size, "sample_rate_hz": 24000,
                "format": "WAV_FLOAT", "frames": 24000})
        pairs.append({"start_frame": 200, "frames": 100, "seconds": [2., 3.],
            "not_blind_same_file_as_training_validation": True,
            "distinct_from_validation_first_second": True,
            "source_sha256": str(index)*64, "source_static_gain": .2,
            "metrics": {"target_rms": rms[0], "rms": rms[1],
                "rms_delta_db": 20*math.log10(rms[1]/rms[0])}, "audio": rows})
    report = {"schema": "mini.nsf-copy-and-authorial-score-evaluation.v1",
        "status": "rendered_not_listening_approved", "checkpoint_sha256": "a"*64,
        "source_credit": "synthetic fixture only", "license_scope": "synthetic test",
        "copy_diagnostics": pairs}
    path = base / "evaluation_report.json"
    write_report(path, report)
    return path, report


def write_report(path, report):
    path.write_text(json.dumps(report), encoding="utf-8")
    path.chmod(0o600)


class CopyListeningTests(unittest.TestCase):
    def test_six_real_aac_roundtrips_hashes_privacy_padding_and_envelope(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            path, source = fixture(base)
            before = {p.name: diagnostic.private.sha256(p) for p in base.iterdir()}
            with patch.object(diagnostic.private, "PRIVATE_ROOT", base):
                report = diagnostic.build(path, base / "out")
            self.assertEqual(len(report["outputs"]), 6)
            self.assertFalse(report["model_load_or_inference"])
            self.assertFalse(report["music_timbre_or_generalization_approved"])
            self.assertEqual(report["raw_level_errors_before_listening_normalization_db"],
                             [p["metrics"]["rms_delta_db"] for p in source["copy_diagnostics"]])
            self.assertEqual(stat.S_IMODE((base / "out").stat().st_mode), 0o700)
            for row in report["outputs"]:
                output = base / "out" / row["file"]
                self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
                self.assertEqual(diagnostic.private.sha256(output), row["sha256"])
                self.assertGreaterEqual(row["decoded_frames"], row["programme_frames"])
                self.assertLessEqual(row["decoded_frames"], row["programme_frames"]+1023)
                self.assertLessEqual(row["decoded_full"]["true_peak_dbfs"], -1.1)
                if row["kind"] == "single":
                    self.assertEqual(row["seconds"], 1)
                    self.assertAlmostEqual(row["decoded_full"]["integrated_lufs"], -24, delta=.3)
                    self.assertAlmostEqual(row["input_loudness"]["integrated_lufs"]+row["static_gain_db"], -24)
                else:
                    self.assertEqual(row["seconds"], 2.4)
                    self.assertEqual(row["additional_pair_gain_db"], 0.)
                    self.assertFalse(row["aac_gap_exact_zero_claimed"])
                    for stats in row["decoded_excerpt_measurements"]:
                        self.assertAlmostEqual(stats["integrated_lufs"], -24, delta=.3)
            restored = diagnostic.audio.decode(base / "out/pair1_source_static_gain_1s.m4a", False, 1.)[:, 0]
            low, high = restored[4800:19200], restored[28800:43200]
            self.assertAlmostEqual(float(np.sqrt(np.mean(high**2)/np.mean(low**2))), 4, delta=.1)
            self.assertEqual({p.name: diagnostic.private.sha256(p) for p in base.iterdir() if p.is_file()}, before)
            saved = base / "out/copy_diagnostic.json"
            self.assertEqual(json.loads(saved.read_text()), report)
            self.assertEqual(stat.S_IMODE(saved.stat().st_mode), 0o600)
            self.assertFalse(any(p.is_dir() for p in (base / "out").iterdir()))

    def test_sha_format_timing_raw_rms_and_private_path_rejected_before_output(self):
        for change in ("sha", "timing", "rms", "format", "path", "permissions"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as folder:
                base = Path(folder)
                path, source = fixture(base)
                pair = source["copy_diagnostics"][0]
                if change == "sha": pair["audio"][0]["sha256"] = "0"*64
                if change == "timing": pair["seconds"] = [0., 1.]
                if change == "rms": pair["metrics"]["rms_delta_db"] += 1
                if change == "format": pair["audio"][0]["format"] = "PCM_16"
                if change == "path": pair["audio"][0]["file"] = "../elsewhere.wav"
                if change == "permissions": path.chmod(0o644)
                else: write_report(path, source)
                with patch.object(diagnostic.private, "PRIVATE_ROOT", base), self.assertRaises(ValueError):
                    diagnostic.build(path, base / "out")
                self.assertFalse((base / "out").exists())

    def test_actual_wrong_rate_channels_or_silent_clip_is_rejected(self):
        for rate, channels, amplitude in ((48000, 1, .01), (24000, 2, .01), (24000, 1, 0.)):
            with self.subTest(rate=rate, channels=channels, amplitude=amplitude), tempfile.TemporaryDirectory() as folder:
                base = Path(folder)
                path, source = fixture(base)
                row = source["copy_diagnostics"][0]["audio"][0]
                clip = base / row["file"]
                sf.write(clip, np.full((rate, channels), amplitude), rate, subtype="FLOAT")
                row.update(sha256=diagnostic.private.sha256(clip), bytes=clip.stat().st_size)
                write_report(path, source)
                with patch.object(diagnostic.private, "PRIVATE_ROOT", base), self.assertRaises(ValueError):
                    diagnostic.build(path, base / "out")
                self.assertFalse((base / "out").exists())

    def test_static_gain_clipping_is_rejected_not_hidden_by_limiter_or_new_target(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            path, _ = fixture(base)
            with (patch.object(diagnostic.private, "PRIVATE_ROOT", base),
                  patch.object(diagnostic.audio, "measure", return_value={"integrated_lufs": -60., "true_peak_dbfs": -10.}),
                  self.assertRaisesRegex(ValueError, "true_peak_ceiling")):
                diagnostic.build(path, base / "out")
            self.assertFalse((base / "out").exists())

    def test_codec_peak_failure_never_publishes_six_outputs(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            path, _ = fixture(base)
            real_measure = diagnostic.audio.measure
            calls = 0
            def overshoot_on_first_aac(samples):
                nonlocal calls
                calls += 1
                values = real_measure(samples)
                if calls == 5:
                    values["true_peak_dbfs"] = -.2
                return values
            with (patch.object(diagnostic.private, "PRIVATE_ROOT", base),
                  patch.object(diagnostic.audio, "measure", side_effect=overshoot_on_first_aac),
                  self.assertRaisesRegex(ValueError, "decoded_aac_lufs_or_true_peak")):
                diagnostic.build(path, base / "out")
            self.assertEqual(list((base / "out").iterdir()), [])

    def test_existing_output_unchanged_and_no_model_import(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            path, _ = fixture(base)
            out = base / "out"
            out.mkdir(mode=0o700)
            (out / "keep").write_text("keep")
            with patch.object(diagnostic.private, "PRIVATE_ROOT", base), self.assertRaisesRegex(ValueError, "fresh_empty"):
                diagnostic.build(path, out)
            self.assertEqual((out / "keep").read_text(), "keep")
            subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, "
                + repr(str(Path(__file__).resolve().parent))
                + "); import build_copy_diagnostic; assert 'torch' not in sys.modules"],
                check=True, capture_output=True, timeout=20)


if __name__ == "__main__":
    unittest.main()
