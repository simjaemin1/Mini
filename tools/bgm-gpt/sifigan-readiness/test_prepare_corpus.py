"""Synthetic-only corpus tests: no original audio, downloads, or ML models."""
import contextlib
import json
from pathlib import Path
import stat
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prepare_corpus as prep


class FakeGuard(contextlib.AbstractContextManager):
    def __init__(self, *_args):
        pass

    def __enter__(self):
        return self

    def snapshot(self):
        return {"synthetic": True}

    def __exit__(self, *_args):
        return False


def arrays(frames=100, value=1):
    return dict(waveform=np.zeros(frames * 120, np.float32), f0=np.full(frames, 440., np.float32),
        cf0=np.full(frames, 440., np.float32), features=np.full((frames, 43), value, np.float32),
        rms_db=np.full(frames, -30., np.float32), yin_hz=np.full(frames, 440., np.float32),
        periodicity=np.ones(frames, np.float32), ap_all_one=np.zeros(frames, bool))


class CorpusTests(unittest.TestCase):
    def test_fixed_scope_and_heldout_title(self):
        self.assertEqual(len(prep.FIXED), 13)
        self.assertTrue(all(split == "heldout" for case, split, _, _ in prep.FIXED if case.startswith("arirang")))
        self.assertEqual(next(split for case, split, _, _ in prep.FIXED if case == "deepvib48"), "heldout")
        self.assertFalse(any("정악" in path or path.endswith("mp3") for _, _, _, path in prep.FIXED))

    def test_independent_yin_at24k_covers_low_and_high_register(self):
        for hz in (264., 660., 1100., 1550.):
            wave = .03 * np.sin(2 * np.pi * hz * np.arange(24000) / 24000)
            result = prep.diagnostics(wave)
            center = result["yin_hz"][10:-10]
            self.assertEqual(len(center), 180)
            self.assertAlmostEqual(float(np.median(center)), hz, delta=hz * .005)
            self.assertGreater(float(np.median(result["periodicity"][10:-10])), .95)
            self.assertAlmostEqual(float(np.median(result["rms_db"])), 20 * np.log10(.03 / np.sqrt(2)), delta=.1)
        quiet = prep.diagnostics(np.zeros(2400))
        np.testing.assert_array_equal(quiet["yin_hz"], 0)
        np.testing.assert_array_equal(quiet["periodicity"], 0)
        np.testing.assert_array_equal(quiet["rms_db"], -240)

    def test_mock_variable_extraction_keeps_raw_f0_and_grid(self):
        frames = 400
        raw = np.full(frames + 1, 660.)
        raw[100:110] = 0
        world = SimpleNamespace(harvest=Mock(return_value=(raw, np.arange(frames + 1) * .005)),
            cheaptrick=Mock(return_value=np.ones((frames + 1, 1025))),
            d4c=Mock(return_value=np.ones((frames + 1, 1025))),
            code_aperiodicity=Mock(return_value=np.zeros((frames + 1, 3))))
        sptk = SimpleNamespace(sp2mc=Mock(return_value=np.ones((frames + 1, 40))))
        with patch.dict(sys.modules, pyworld=world, pysptk=sptk):
            result, facts = prep.extract(np.zeros(frames * 120 + 37))
        self.assertEqual(result["waveform"].shape, (frames * 120,))
        self.assertEqual(result["features"].shape, (frames, 43))
        self.assertEqual(result["ap_all_one"].dtype, np.bool_)
        self.assertTrue(all(x.dtype == np.float32 for name, x in result.items() if name != "ap_all_one"))
        np.testing.assert_array_equal(result["f0"], raw[:frames])
        self.assertTrue((result["cf0"] > 0).all())
        self.assertEqual(facts["trimmed_tail_samples"], 37)
        self.assertEqual(facts["endpoint_frames_trimmed"], 1)
        self.assertEqual(world.harvest.call_args.kwargs, dict(f0_floor=70., f0_ceil=1800., frame_period=5.))
        self.assertEqual(world.d4c.call_args.kwargs, dict(threshold=.85, fft_size=2048))

    def test_plan_rejects16k_and_full_duration_cap(self):
        probe = SimpleNamespace(stdout=b'{"streams":[{"sample_rate":"16000","channels":1}],"format":{"duration":"10"}}')
        with patch.object(prep.subprocess, "run", return_value=probe):
            with self.assertRaisesRegex(ValueError, "at_least24k"):
                prep.probe(Path("synthetic"))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".done").touch()
            (root / "source.wv").write_bytes(b"synthetic")
            with patch.object(prep, "FIXED", (("sus04", "fit", "scale", "source.wv"),)), \
                    patch.object(prep, "probe", return_value=dict(source_duration_seconds=1201)):
                with self.assertRaisesRegex(ValueError, "1200second_cap"):
                    prep.plan(root)

    def test_private_output_fit_only_statistics_and_original_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "originals"
            source.mkdir()
            (source / ".done").touch()
            rows = []
            for case, split in (("sus04", "fit"), ("arirang001", "heldout")):
                path = source / (case + ".wv")
                path.write_bytes(case.encode())
                rows.append(dict(case=case, split=split, source_group=case, source_path=str(path),
                    source_sha256=prep.digest(path), source_duration_seconds=.5))
            output = root / "out"
            fit, held = arrays(), arrays(value=999)
            held["waveform"][0] = .01
            facts = dict(frames=100, samples=12000, duration_seconds=.5)
            with patch.object(prep, "plan", return_value=rows), patch.object(prep, "ResourceGuard", FakeGuard), \
                    patch.object(prep, "decode", return_value=np.zeros(12000)), \
                    patch.object(prep, "extract", side_effect=[(fit, facts), (held, facts)]):
                result = prep.prepare(source, output)
            self.assertEqual(result["schema"], "mini.sifigan-corpus.v1")
            self.assertEqual(result["status"], "complete")
            self.assertEqual(result["statistics_fit_frames"], 100)
            self.assertFalse(result["stats_are_validated_training_window_stats"])
            self.assertTrue(result["originals_unchanged"])
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o700)
            for path in output.iterdir():
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            with np.load(output / "stats.npz", allow_pickle=False) as data:
                np.testing.assert_array_equal(data["mean"], 1)
                np.testing.assert_array_equal(data["scale"], 1)
            self.assertEqual([prep.digest(r["source_path"]) for r in rows], [r["source_sha256"] for r in rows])
            with self.assertRaisesRegex(ValueError, "fresh_private"):
                prep.prepare(source, output)

    def test_output_archive_is_bounded(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(prep, "MAX_BYTES", 1):
            with self.assertRaisesRegex(ValueError, "400MB"):
                prep.save_npz(Path(directory) / "test.npz", a=np.ones(100))


if __name__ == "__main__":
    unittest.main()
