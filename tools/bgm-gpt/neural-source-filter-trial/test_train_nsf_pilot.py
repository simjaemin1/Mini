"""Synthetic data/loss/serialization only; no actual training run or NGC read."""
import hashlib
import json
import math
from pathlib import Path
import random
import sys
import tempfile
import unittest

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nsf_lite
import nsf_losses
import nsf_pilot_data as data
import train_nsf_pilot as training


def fake_dataset(base, heldout_peak=.99):
    source = base / "source"
    source.mkdir()
    (source / ".done").write_text("synthetic")
    rows = []
    for index, peak in enumerate((.5, heldout_peak)):
        path = source / f"source{index}.flac"
        path.write_bytes(f"fake-original-{index}".encode())
        t = np.arange(24000, dtype=np.float32) / 24000
        wave = (peak * np.sin(2 * np.pi * (400 + index * 30) * t)).astype(np.float32)
        rms = np.full(100, -24., np.float32)
        rms[:2] = -240
        uv = np.ones(100, np.bool_)
        uv[:4] = False
        pitch = np.where(uv, 400 + index * 30, 0).astype(np.float32)
        npz = base / f"data{index}.npz"
        np.savez(npz, waveform=wave, rms_db=rms, pitch_hz=pitch, voiced_mask=uv)
        rows.append({"source_path": str(path), "source_sha256": data.digest(path),
            "split": "fit" if not index else "heldout", "npz_file": npz.name,
            "npz_sha256": data.digest(npz), "samples": 24000, "feature_frames": 100,
            "decoded_waveform_sha256": hashlib.sha256(wave.tobytes()).hexdigest()})
    manifest = {"schema": "mini.nsf-public-ngc-data.v1", "status": "complete",
        "AIHub_files_used": 0, "network_used": False, "sample_rate": 24000, "feature_rate_hz": 100,
        "split_unit": "immutable source file SHA, never windows", "source_root": str(source),
        "archive_done_sha256": data.digest(source / ".done"), "files": rows,
        "source_credit": "synthetic", "license_scope": "synthetic-only", "heldout_is_blind": False}
    path = base / "manifest.json"
    path.write_text(json.dumps(manifest))
    return path


class ScratchTrainingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(1)

    def test_fit_only_gain_active_noise_and_silence_condition_floor(self):
        with tempfile.TemporaryDirectory() as folder:
            fit, heldout, metadata = data.load_dataset(fake_dataset(Path(folder)))
            self.assertAlmostEqual(metadata["target_gain"], .5, places=4)
            self.assertAlmostEqual(metadata["fit_voiced_rms_db_median_scaled"], -24 + 20 * math.log10(.5), places=3)
            target, controls = data.batch_from_windows([(fit[0], 0, 32)], metadata["target_gain"])
            self.assertEqual(target.shape, (1, 1, 7680))
            self.assertEqual(float(controls[1][0, 0]), -120)
            self.assertEqual(float(controls[2][0, 2]), 0)
            self.assertEqual(float(controls[3][0, 2]), 1)
            self.assertEqual(float(controls[3][0, 0]), 0)
            windows = data.sample_fit_windows(fit, random.Random(data.SEED))
            self.assertEqual(len(windows), 4)
            self.assertTrue(all(row["split"] == "fit" and frames == 32 for row, _, frames in windows))
            self.assertNotEqual(fit[0]["source_sha256"], heldout[0]["source_sha256"])

    def test_changed_hash_and_cross_split_duplicate_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = fake_dataset(Path(folder))
            manifest = json.loads(path.read_text())
            manifest["files"][1]["source_path"] = manifest["files"][0]["source_path"]
            manifest["files"][1]["source_sha256"] = manifest["files"][0]["source_sha256"]
            path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "duplicate"):
                data.load_dataset(path)
            manifest["files"][0]["npz_sha256"] = "0" * 64
            path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "hash_changed"):
                data.load_dataset(path)

    def test_phase_shift_loss_is_less_than_silent_output_and_magnitude_level_is_seen(self):
        t = torch.arange(7680) / 24000
        target = (.1 * torch.sin(2 * math.pi * 440 * t))[None, None]
        shifted = (.1 * torch.sin(2 * math.pi * 440 * t + .8))[None, None].requires_grad_()
        good, terms = nsf_losses.nsf_loss(shifted, target)
        bad, _ = nsf_losses.nsf_loss(torch.zeros_like(target), target)
        self.assertLess(float(good.detach()), float(bad))
        self.assertLess(float(terms["rms_db_l1"].detach()), .3)
        good.backward()
        self.assertTrue(bool(torch.isfinite(shifted.grad).all()))
        self.assertGreater(float(shifted.grad.abs().sum()), 0)

    def test_checkpoint_safe_load_contract_and_two_file_budget(self):
        model = nsf_lite.NSFLite()
        metadata = {"model_config": {"channels": 16}, "data": {"target_gain": .5,
            "target_gain_db": -6.0206, "fit_voiced_rms_db_median_scaled": -30.,
            "manifest_sha256": "a" * 64}, "code_sha256": {str(Path(nsf_lite.__file__)): data.digest(nsf_lite.__file__)}}
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            for name in ("best", "latest", "latest"):
                training.save_checkpoint(output, name, model, 100, "b" * 64, 1., metadata)
            self.assertEqual(len(list(output.glob("*.pt"))), 2)
            saved = torch.load(output / "latest.pt", map_location="cpu", weights_only=True)
            self.assertEqual(saved["manifest_sha256"], "a" * 64)
            self.assertEqual(saved["step"], 100)
            nsf_lite.NSFLite().load_state_dict(saved["state_dict"], strict=True)

    @unittest.skipUnless(torch.backends.mps.is_available(), "local MPS unavailable")
    def test_mps_generator_cpu_spectral_loss_finite_backprop(self):
        model = nsf_lite.NSFLite().to("mps")
        f0 = torch.full((1, 8), 440.)
        audio, _ = model(f0, torch.full_like(f0, -24), torch.ones_like(f0), torch.ones_like(f0), noise_seed=4)
        target = (.05 * torch.sin(2 * math.pi * 440 * torch.arange(1920) / 24000))[None, None]
        loss, _ = nsf_losses.nsf_loss(audio, target)
        loss.backward()
        for parameter in model.parameters():
            self.assertIsNotNone(parameter.grad)
            self.assertTrue(bool(torch.isfinite(parameter.grad).all()))
        torch.mps.synchronize()


if __name__ == "__main__":
    unittest.main()
