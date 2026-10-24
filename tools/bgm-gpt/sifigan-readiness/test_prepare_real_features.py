"""Synthetic-only preparation tests: no original recordings or model use."""
import contextlib
import json
from pathlib import Path
import stat
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prepare_real_features as prep


class FakeGuard(contextlib.AbstractContextManager):
    def __init__(self, *_args):
        pass

    def __enter__(self):
        return self

    def snapshot(self):
        return {"synthetic": True}

    def __exit__(self, *_args):
        return False


class PreparationTests(unittest.TestCase):
    def test_cf0_interpolates_zeros_and_preserves_constant(self):
        raw = np.full(961, 440.)
        raw[:8] = raw[400:420] = raw[-5:] = 0
        result = prep.continuous_f0(raw)
        np.testing.assert_allclose(result, 440., atol=1e-10)
        self.assertEqual(result.shape, raw.shape)
        np.testing.assert_array_equal(prep.continuous_f0(np.zeros(20)), np.zeros(20))

    def test_heldout_cannot_change_statistics_and_zero_scale_is_one(self):
        fit = np.tile(np.arange(43), (960, 1)).astype(np.float32)
        held = np.full((960, 43), 9999., np.float32)
        mean, scale = prep.fit_statistics([("fit", {"features": fit}), ("heldout", {"features": held})])
        np.testing.assert_array_equal(mean, np.arange(43))
        np.testing.assert_array_equal(scale, np.ones(43))

    def test_decode_rejects_16k_before_conversion(self):
        probe = type("Probe", (), {"stdout": b'{"streams":[{"sample_rate":"16000","channels":1}]}'})()
        with patch.object(prep.subprocess, "run", return_value=probe) as run:
            with self.assertRaisesRegex(ValueError, "no_16k_upscale"):
                prep.decode(dict(source_path="synthetic", start_seconds=0))
        self.assertEqual(run.call_count, 1)

    def test_source_manifest_binding_and_sha_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.flac"
            source.write_bytes(b"synthetic")
            manifest = root / "input.json"
            manifest.write_text(json.dumps({"files": [dict(source_path=str(source), source_sha256="wrong")]}))
            with patch.object(prep, "CASES", (("test", source.name, "fit", 0., prep.digest(source)),)):
                with self.assertRaisesRegex(ValueError, "manifest_binding"):
                    prep.selected(manifest)

    def test_mock_extraction_exact_world_parameters_shapes_and_raw_f0(self):
        raw = np.full(961, 440., np.float64)
        raw[30:35] = 0
        times = np.arange(961) * .005
        world = SimpleNamespace(
            harvest=unittest.mock.Mock(return_value=(raw, times)),
            cheaptrick=unittest.mock.Mock(return_value=np.ones((961, 1025))),
            d4c=unittest.mock.Mock(return_value=np.ones((961, 1025))),
            code_aperiodicity=unittest.mock.Mock(return_value=np.zeros((961, 3))))
        sptk = SimpleNamespace(sp2mc=unittest.mock.Mock(return_value=np.ones((961, 40))))
        wave = np.zeros(115200, np.float64)
        with patch.dict(sys.modules, pyworld=world, pysptk=sptk):
            arrays, facts = prep.extract(wave)
        self.assertEqual(arrays["features"].shape, (960, 43))
        self.assertTrue(all(value.dtype == np.float32 for value in arrays.values()))
        np.testing.assert_array_equal(arrays["f0"], raw[:960])
        self.assertTrue((arrays["cf0"] > 0).all())
        self.assertEqual(facts["endpoint_frames_trimmed"], 1)
        self.assertEqual(facts["voiced_ap_all_one_fraction"], 1.)
        self.assertEqual(world.harvest.call_args.kwargs, dict(f0_floor=70., f0_ceil=1800., frame_period=5.))
        self.assertEqual(world.d4c.call_args.kwargs, dict(threshold=.85, fft_size=2048))
        self.assertEqual(sptk.sp2mc.call_args.kwargs, dict(order=39, alpha=.466))

    def test_private_output_fields_stats_and_source_preservation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_root = root / "originals"
            source_root.mkdir()
            rows, specs = [], []
            for index, split in enumerate(("fit", "fit", "heldout")):
                source = source_root / f"source{index}.flac"
                source.write_bytes(b"synthetic" + bytes([index]))
                checksum = prep.digest(source)
                rows.append(dict(source_path=str(source), source_sha256=checksum))
                specs.append((f"case{index}", source.name, split, 0., checksum))
            manifest = root / "input.json"
            manifest.write_text(json.dumps(dict(files=rows, source_root=str(source_root))))
            arrays = dict(waveform=np.zeros(115200, np.float32), f0=np.full(960, 440., np.float32),
                cf0=np.full(960, 440., np.float32), features=np.ones((960, 43), np.float32))
            output = root / "output"
            with patch.object(prep, "CASES", tuple(specs)), patch.object(prep, "ResourceGuard", FakeGuard), \
                    patch.object(prep, "decode", return_value=(arrays["waveform"].astype(np.float64), {})), \
                    patch.object(prep, "extract", return_value=(arrays, {})):
                result = prep.prepare(manifest, output)
                with self.assertRaisesRegex(ValueError, "fresh_output"):
                    prep.prepare(manifest, output)
            self.assertTrue(result["originals_unchanged"])
            self.assertEqual(result["schema"], "mini.sifigan-real-features.v1")
            self.assertEqual(result["status"], "complete")
            self.assertEqual([row["case"] for row in result["files"]], ["case0", "case1", "case2"])
            self.assertFalse(result["heldout_is_blind"])
            self.assertEqual(result["statistics_fit_cases"], ["case0", "case1"])
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o700)
            for path in output.iterdir():
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            with np.load(output / "case0.npz", allow_pickle=False) as data:
                self.assertEqual(set(data.files), {"waveform", "f0", "cf0", "features"})
            with np.load(output / "stats.npz", allow_pickle=False) as data:
                np.testing.assert_array_equal(data["mean"], np.ones(43))
                np.testing.assert_array_equal(data["scale"], np.ones(43))
            self.assertEqual([prep.digest(row["source_path"]) for row in rows], [row["source_sha256"] for row in rows])


if __name__ == "__main__":
    unittest.main()
