"""Synthetic feature/RNG/lineage-contract tests; no real data or model."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import render_condition_ablation as ablation


def fixture():
    f0 = np.full(1000, 300, np.float32)
    f0[:20] = 0
    cf0 = np.full(1000, 300, np.float32)
    actual = np.arange(1000 * 43, dtype=np.float32).reshape(1000, 43) / 10000
    deep = np.arange(1500 * 43, dtype=np.float32).reshape(1500, 43) / 20000
    return f0, cf0, actual, deep, np.arange(43, dtype=np.float64) / 100, np.full(43, 2.)


class ConditioningAblationTests(unittest.TestCase):
    def test_exact_actual_controls_clean_template_map_wrap_and_no_input_mutation(self):
        values = fixture()
        original = [v.tobytes() for v in values]
        arrays = ablation.build_controls(*values)
        indices = 240 + ((np.arange(960, dtype=np.int64) + 16) % 960)
        self.assertEqual(arrays["template_index_map"].tobytes(), indices.tobytes())
        self.assertEqual(np.flatnonzero(np.diff(indices) < 0).tolist(), [943])
        self.assertEqual(arrays["f0"].tobytes(), values[0][:960].tobytes())
        self.assertEqual(arrays["cf0"].tobytes(), values[1][:960].tobytes())
        self.assertEqual(arrays["actual_features"].tobytes(), values[2][:960].tobytes())
        self.assertEqual(arrays["template_features"].tobytes(), values[3][indices].tobytes())
        self.assertEqual([v.tobytes() for v in values], original)
        self.assertEqual(set(arrays), {"f0", "cf0", "actual_features", "template_features", "normalized_actual", "normalized_template", "template_index_map"})

    def test_same_saved_stats_exact_normalization_not_refitted_or_source_equalized(self):
        values = fixture()
        arrays = ablation.build_controls(*values)
        for feature, normalized in (("actual_features", "normalized_actual"), ("template_features", "normalized_template")):
            expected = ((arrays[feature] - values[4]) / values[5]).astype(np.float32)
            self.assertEqual(arrays[normalized].tobytes(), expected.tobytes())
        self.assertFalse(np.array_equal(arrays["normalized_actual"], arrays["normalized_template"]))
        self.assertEqual(arrays["normalized_actual"].shape, (960, 43))

    def test_invalid_pitch_features_incomplete_full_template_and_stats_rejected(self):
        for case in ("f0dtype", "cf0zero", "allunvoiced", "shortclean", "bad43", "nan", "zeroscale"):
            values = list(fixture())
            if case == "f0dtype": values[0] = values[0].astype(np.float64)
            if case == "cf0zero": values[1][3] = 0
            if case == "allunvoiced": values[0][:] = 0
            if case == "shortclean": values[3] = values[3][:1199]
            if case == "bad43": values[2] = values[2][:, :42]
            if case == "nan": values[3][500, 0] = np.nan
            if case == "zeroscale": values[5][:] = 0
            with self.subTest(case=case), self.assertRaises(ValueError):
                ablation.build_controls(*values)

    def test_historical_deep_then_arirang_three_forwards_same_A_B_noise(self):
        rng, expected = np.random.default_rng(20261027), np.random.default_rng(20261027)
        saved_deep = expected.normal(size=115200).astype(np.float32)
        saved_ari = expected.normal(size=115200).astype(np.float32)
        calls, noises = [], []
        def render(case):
            calls.append(case)
            noise = rng.normal(size=115200).astype(np.float32)
            noises.append(noise.copy())
            return noise + np.float32(.01 if case == "repeated_features" else 0)
        waves, states = ablation.inference(render, lambda: dict(rng.bit_generator.state),
            lambda state: setattr(rng.bit_generator, "state", state), saved_deep, saved_ari)
        self.assertEqual(calls, ["deep_baseline", "actual_features", "repeated_features"])
        self.assertEqual(waves["deep_baseline"].tobytes(), saved_deep.tobytes())
        self.assertEqual(waves["raw_actual_features"].tobytes(), saved_ari.tobytes())
        self.assertEqual(noises[1].tobytes(), noises[2].tobytes())
        self.assertEqual(states["deep_after"], states["arirang_before"])
        self.assertEqual(states["arirang_before"], states["actual_before"])
        self.assertEqual(states["arirang_before"], states["repeated_before"])
        self.assertEqual(rng.bit_generator.state, states["arirang_after"])
        self.assertEqual(rng.normal(), expected.normal())

    def test_either_baseline_mismatch_stops_before_B(self):
        zero, one = np.zeros(115200, np.float32), np.ones(115200, np.float32)
        for fail in ("deep_baseline", "actual_features"):
            calls = []
            def render(case):
                calls.append(case)
                return one.copy() if case == fail else zero.copy()
            with self.subTest(fail=fail), self.assertRaisesRegex(ValueError, "not_byte_exact"):
                ablation.inference(render, lambda: None, lambda _: None, zero, zero)
            self.assertNotIn("repeated_features", calls)

    def test_archive_preserves_dtype_hash_private_permissions_and_no_overwrite(self):
        arrays = ablation.build_controls(*fixture())
        arrays["reference_arirang"] = np.zeros(115200, np.float32)
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory) / "raw"
            folder.mkdir()
            path = folder / "controls_and_raw.npz"
            with patch.object(ablation.shutil, "disk_usage", return_value=type("Usage", (), {"free": 100 * ablation.GIB})()):
                record = ablation.save_archive(path, arrays)
                with self.assertRaises(FileExistsError): ablation.save_archive(path, arrays)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with np.load(path, allow_pickle=False) as archive:
                for key, value in arrays.items():
                    self.assertEqual(archive[key].dtype, value.dtype)
                    self.assertEqual(archive[key].tobytes(), value.tobytes())
                    self.assertEqual(record["array_sha256"][key], ablation.prior.pcm_sha(value))

    def test_whole_parent_caps_and_no_pitch_gate_training_or_hidden_wrap_exclusion(self):
        with tempfile.TemporaryDirectory() as directory:
            root, folder = Path(directory), Path(directory) / "raw"
            folder.mkdir()
            (root / "other-new-file").write_bytes(b"xx")
            with patch.object(ablation, "MAX_BYTES", 1), self.assertRaisesRegex(RuntimeError, "20MB"):
                ablation.capacity(folder)
            with patch.object(ablation.shutil, "disk_usage", return_value=type("Usage", (), {"free": 0})()), self.assertRaisesRegex(RuntimeError, "12GiB"):
                ablation.capacity(folder)
        flags = ablation.design_flags()
        for key in ("training", "weights_written", "output_processing", "gate", "hard_mute", "authored_score",
                "new_score_or_music", "source_PCM_mixed_into_output", "EQ", "denoising", "waveform_pitch_shift", "quality_approved", "hidden_wrap_frame_exclusion"):
            self.assertIs(flags[key], False)
        for key in ("source_F0_cf0_unchanged", "source_timestamps_unchanged", "normalizer_unchanged", "model_weights_unchanged"):
            self.assertIs(flags[key], True)


if __name__ == "__main__":
    unittest.main()
