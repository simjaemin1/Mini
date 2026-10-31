"""Synthetic-only three-way exporter tests; no model, originals or encoder."""
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
from scipy.io import wavfile

import export_condition_ablation as exporter
from test_build_level_conditioned_trial import FakeGuard


def fixture(root):
    raw = root / "raw"
    raw.mkdir()
    training = root / "training.json"
    training.write_text('{"synthetic":true}')
    mean, scale = np.arange(43) / 100., np.full(43, 2.)
    stats = root / "stats.npz"
    np.savez_compressed(stats, mean=mean, scale=scale)
    gate = root / "gate.json"
    gate.write_text(json.dumps(dict(stats_file=stats.name, stats_sha256=exporter.saved.sha256(stats))))
    t = np.arange(115200) / 24000
    ref = (.01 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    actual = (.008 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    repeated = (.006 * np.sin(2 * np.pi * 440 * t) + .004 * np.sin(2 * np.pi * 880 * t)).astype(np.float32)
    deepref = (.01 * np.sin(2 * np.pi * 270 * t)).astype(np.float32)
    deepbase = (.009 * np.sin(2 * np.pi * 270 * t)).astype(np.float32)
    features = np.ones((960, 43), np.float32)
    deepfeatures = np.tile(np.arange(1200, dtype=np.float32)[:, None] / 1200., (1, 43))
    f0 = np.full(960, 440., np.float32)
    index = 240 + ((np.arange(960, dtype=np.int64) + 16) % 960)
    arrays = dict(reference_arirang=ref, raw_actual_features=actual, raw_repeated_features=repeated,
        deep_reference=deepref, deep_baseline=deepbase, f0=f0, cf0=f0.copy(), actual_features=features,
        template_features=deepfeatures[index], normalized_actual=((features - mean) / scale).astype(np.float32),
        normalized_template=((deepfeatures[index] - mean) / scale).astype(np.float32), template_index_map=index)
    archive = raw / "controls_and_raw.npz"
    np.savez_compressed(archive, **arrays)
    corpusari, corpusdeep = root / "ari.npz", root / "deep.npz"
    np.savez_compressed(corpusari, f0=f0, cf0=f0, features=features)
    np.savez_compressed(corpusdeep, features=deepfeatures)
    checkpoints = {"extended": {"synthetic": True}}
    report = dict(schema="mini.sifigan-conditioning-ablation.v1",
        status="conditioning_ablation_raw_ready_not_perceptually_approved", phase="complete", completed_steps=3000,
        forward_calls=3, baseline_deep_byte_exact=True, baseline_arirang_byte_exact=True, inputs_unchanged=True,
        frames=960, samples=115200, sample_rate=24000, hop_size=120, checkpoints=checkpoints, elapsed_seconds=.2,
        input_bindings={str(training): exporter.saved.sha256(training)},
        archive=dict(file=archive.name, sha256=exporter.saved.sha256(archive),
            array_sha256={k: exporter.array_hash(v) for k, v in arrays.items()}),
        rng_sha256={k: "a" * 64 for k in ("deep_before", "deep_after", "arirang_before", "arirang_after", "actual_before", "repeated_before")})
    for key in ("training", "output_processing", "source_PCM_mixed_into_output", "quality_approved",
                "authored_score", "new_score_or_music", "gate", "hard_mute", "EQ", "denoising"):
        report[key] = False
    for key in ("source_F0_cf0_unchanged", "source_timestamps_unchanged", "normalizer_unchanged",
                "model_weights_unchanged", "same_arirang_noise_verified"):
        report[key] = True
    path = raw / "report.json"
    path.write_text(json.dumps(report))
    sources = [dict(case="deepvib48", reference=deepref, generated=deepbase, corpus_npz_path=str(corpusdeep)),
               dict(case="arirang001", reference=ref, generated=actual, corpus_npz_path=str(corpusari))]
    validated = (dict(completed_steps=3000, data_gate=str(gate)), sources,
                 {str(gate): exporter.saved.sha256(gate)}, checkpoints)
    return root / "unused_parent.json", training, path, report, arrays, validated


class ConditionAblationExportTests(unittest.TestCase):
    def test_actual_baselines_source_features_map_stats_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            parent, training, path, _, arrays, validated = fixture(Path(directory).resolve())
            with patch.object(exporter.extended, "validate_inputs", return_value=validated):
                _, actual, bindings, _ = exporter.validate_inputs(parent, training, path)
            self.assertIn(str(path), bindings)
            for key, value in arrays.items():
                self.assertEqual(actual[key].tobytes(), value.tobytes())

    def test_bad_status_gate_training_or_rng_claim_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            parent, training, path, report, _, validated = fixture(Path(directory).resolve())
            with patch.object(exporter.extended, "validate_inputs", return_value=validated):
                for key, value in (("status", "started"), ("forward_calls", 4), ("training", True),
                        ("baseline_arirang_byte_exact", False), ("source_F0_cf0_unchanged", False),
                        ("gate", True), ("EQ", True), ("same_arirang_noise_verified", False)):
                    path.write_text(json.dumps({**report, key: value}))
                    with self.subTest(key=key), self.assertRaises(ValueError):
                        exporter.validate_inputs(parent, training, path)
                report["rng_sha256"]["repeated_before"] = "b" * 64
                path.write_text(json.dumps(report))
                with self.assertRaisesRegex(ValueError, "excitation_rng"):
                    exporter.validate_inputs(parent, training, path)

    def test_rehashed_source_pitch_map_template_stats_tamper_rejected(self):
        for key in ("reference_arirang", "raw_actual_features", "cf0", "template_index_map", "actual_features",
                    "template_features", "normalized_actual", "normalized_template"):
            with self.subTest(key=key), tempfile.TemporaryDirectory() as directory:
                parent, training, path, report, arrays, validated = fixture(Path(directory).resolve())
                changed = {k: v.copy() for k, v in arrays.items()}
                changed[key].flat[0] += 1
                archive = path.parent / report["archive"]["file"]
                np.savez_compressed(archive, **changed)
                report["archive"]["sha256"] = exporter.saved.sha256(archive)
                report["archive"]["array_sha256"][key] = exporter.array_hash(changed[key])
                path.write_text(json.dumps(report))
                with patch.object(exporter.extended, "validate_inputs", return_value=validated), self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, training, path)

    def test_missing_candidate_cannot_shrink_full_or_pre_wrap_denominators(self):
        t = np.arange(115200) / 24000
        ref = (.01 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        rd = exporter.level.prepare_corpus.diagnostics(ref)
        result = exporter.diagnostics(np.zeros_like(ref), ref, rd)
        self.assertEqual(result["pitch"]["pitch"]["reference_support_frames"], 960)
        self.assertEqual(result["pitch"]["pitch"]["generated_missing_frames_on_reference_support"], 960)
        self.assertEqual(result["pre_wrap_context"]["source_pitch_support_frames"], 928)
        self.assertEqual(result["declared_template_wrap_context"]["source_pitch_support_frames"], 32)
        self.assertEqual(result["spectral"]["source_support_frames"], 960)
        self.assertFalse(result["declared_template_wrap_context"]["omitted_from_full_metrics"])

    def test_fresh_whole_experiment_cap_and_disk_floor(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            out = root / "listening"
            out.mkdir()
            with patch.object(exporter, "MAX_BYTES", 1), self.assertRaisesRegex(RuntimeError, "20MB"):
                exporter.capacity(out, 2)
            with patch.object(exporter.shutil, "disk_usage", return_value=SimpleNamespace(free=0)), \
                    self.assertRaisesRegex(RuntimeError, "12GiB"):
                exporter.capacity(out)

    def test_three_way_original_untouched_neural_same_reference_RMS(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            parent, training, path, _, arrays, validated = fixture(root)
            calls = []
            def compare(items, destination, seconds):
                self.assertEqual(len(items), 3)
                self.assertEqual(seconds, 4.8)
                destination.mkdir(mode=0o700)
                outputs = []
                for number, (role, item) in enumerate(zip(exporter.ROLES, items), 1):
                    label, source = item.split("=", 1)
                    rate, wave = wavfile.read(source)
                    expected = arrays["reference_arirang"] if number == 1 else exporter.level.apply_curve(
                        arrays[exporter.RAW_KEYS[role]], exporter.level.extract_curve(arrays["reference_arirang"]))[0]
                    self.assertEqual(rate, 24000)
                    self.assertEqual(wave.tobytes(), expected.tobytes())
                    audio = destination / (str(number) + ".m4a")
                    audio.write_bytes(b"synthetic encoder stub; not audio")
                    outputs.append(dict(label=label, file=audio.name, sha256=exporter.saved.sha256(audio)))
                result = dict(schema="mini.foundation-local-static-lufs-comparison.v1", status="ready", seconds=seconds,
                    no_compression_AGC_EQ_pitch_time_edits=True, outputs=outputs)
                (destination / "comparison.json").write_text(json.dumps(result))
                calls.append(True)
                return result
            with patch.object(exporter.extended, "validate_inputs", return_value=validated), \
                    patch.object(exporter, "PRIVATE_ROOT", root), \
                    patch.object(exporter.level, "ResourceGuard", FakeGuard), \
                    patch.object(exporter.shutil, "disk_usage", return_value=SimpleNamespace(free=100 * 1024 ** 3)):
                report = exporter.export(parent, training, path, root / "listening", compare)
            self.assertEqual(len(calls), 1)
            self.assertEqual([row["role"] for row in report["outputs"]], list(exporter.ROLES))
            self.assertFalse(report["original_dynamic_gain_applied"])
            self.assertFalse(report["training"])
            self.assertFalse(report["model_loaded_or_run"])
            self.assertTrue(report["same_recording_comparison_not_direct_063_failure_measurement"])
            for carrier in report["carriers"]:
                self.assertEqual(Path(carrier["native_wav"]["path"]).stat().st_mode & 0o777, 0o600)
            self.assertTrue((root / "listening/export_report.json").exists())


if __name__ == "__main__":
    unittest.main()
