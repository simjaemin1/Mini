"""Synthetic-only note-pattern export tests; no models, originals or encoder."""
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
from scipy.io import wavfile

import export_note_pattern as exporter
from test_build_level_conditioned_trial import FakeGuard


def fixture(root):
    training = root / "training.json"
    training.write_text(json.dumps({"synthetic": True}))
    stats = root / "stats.npz"
    np.savez_compressed(stats, mean=np.zeros(43), scale=np.ones(43))
    gate = root / "gate.json"
    gate.write_text(json.dumps(dict(stats_file=stats.name, stats_sha256=exporter.saved.sha256(stats))))
    raw = root / "raw"
    raw.mkdir()
    t = np.arange(exporter.SAMPLES) / 24000
    reference = (.01 * np.sin(2 * np.pi * 250 * t)).astype(np.float32)
    reference[0] = -0.
    baseline = (.008 * np.sin(2 * np.pi * 250 * t)).astype(np.float32)
    f0, cf0 = np.full(960, 250., np.float32), np.full(960, 250., np.float32)
    f0[0] = 0
    features = np.zeros((960, 43), np.float32)
    arrays = dict(reference=reference, baseline=baseline, source_f0=f0, source_cf0=cf0,
        features=features, normalized_features=features.copy())
    for variant in exporter.VARIANTS:
        curve = exporter.expected_curve(variant)
        factor = np.power(2., curve / 12.)
        arrays["offset_semitones_" + variant] = curve
        arrays["factor_" + variant] = factor
        arrays["f0_" + variant] = (f0.astype(np.float64) * factor).astype(np.float32)
        arrays["cf0_" + variant] = (cf0.astype(np.float64) * factor).astype(np.float32)
        freq = np.repeat(250 * factor, 120)
        phase = np.cumsum(freq) / 24000
        arrays["generated_" + variant] = (.008 * np.sin(2 * np.pi * phase)).astype(np.float32)
    for name, mask in exporter.expected_masks().items():
        arrays[name + "_mask"] = mask
    archive = raw / "deepvib48.npz"
    np.savez_compressed(archive, **arrays)
    corpus = root / "corpus.npz"
    np.savez_compressed(corpus, waveform=reference, f0=f0, cf0=cf0, features=features)
    checkpoints = {"extended": {"generator": {"synthetic": True}}}
    upstream = {"synthetic": "fixture"}
    report = dict(schema="mini.sifigan-four-note-pattern.v1",
        status="four_note_pattern_rendered_not_perceptually_approved", phase="complete", completed_steps=3000,
        baseline_reproduced=True, inputs_unchanged=True, boundaries_frames=[300, 520, 740],
        boundaries_seconds=[1.5, 2.6, 3.7], offsets_semitones=[0., 2., 5., 2.], variants=["0ms", "20ms"],
        frames=960, samples=115200, sample_rate=24000, hop_size=120, optimizer_steps=0,
        forward_calls=3, case_order=["deepvib48"],
        checkpoints=checkpoints, upstream_bindings=upstream,
        input_bindings={str(training): exporter.saved.sha256(training)},
        cases=[dict(case="deepvib48", file=archive.name, sha256=exporter.saved.sha256(archive),
            baseline_reproduced=True, baseline_byte_exact=True,
            rng_before_sha256="a" * 64, rng_after_baseline_sha256="b" * 64,
            rng_variant_before_sha256={variant: "a" * 64 for variant in exporter.VARIANTS},
            array_sha256={key: exporter.array_hash(value) for key, value in arrays.items()},
            raw_diagnostics=dict(baseline={"synthetic": True},
                                 variants={variant: {"synthetic": True} for variant in exporter.VARIANTS}))])
    for key in ("training", "weights_written", "public_weights_used", "source_PCM_mixed_into_output",
                "output_processing", "denoising", "EQ", "waveform_pitch_warp", "new_score_or_music",
                "source_amplitude_prediction_learned", "quality_approved", "perceptually_approved"):
        report[key] = False
    for key in ("mcep_BAP_unchanged", "normalizer_unchanged", "input_gain_unchanged",
                "raw_F0_zero_mask_unchanged", "excitation_and_dilation_use_same_shifted_cf0"):
        report[key] = True
    path = raw / "report.json"
    path.write_text(json.dumps(report))
    parent = root / "unused_parent_fixture.json"
    validated = (dict(completed_steps=3000, data_gate=str(gate), upstream_bindings=upstream),
        [dict(case="deepvib48", reference=reference, generated=baseline, corpus_npz_path=str(corpus))],
        {str(gate): exporter.saved.sha256(gate)}, checkpoints)
    return parent, training, path, report, arrays, validated


class NotePatternExportTests(unittest.TestCase):
    def test_schedule_centered_minjerk_and_complementary_boundary_masks(self):
        step = exporter.expected_curve("0ms")
        smooth = exporter.expected_curve("20ms")
        np.testing.assert_array_equal(step[[299, 300, 519, 520, 739, 740]], [0, 2, 2, 5, 5, 2])
        np.testing.assert_array_equal(smooth[298:303], 2 * np.array([0., .103515625, .5, .896484375, 1.]))
        self.assertEqual(int(np.count_nonzero(step != smooth)), 9)
        masks = exporter.expected_masks()
        self.assertEqual(int(masks["boundary"].sum()), 96)
        self.assertEqual(int(masks["steady"].sum()), 864)
        np.testing.assert_array_equal(masks["boundary"], ~masks["steady"])

    def test_exact_source_baseline_controls_stats_and_masks_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            parent, training, path, _, arrays, validated = fixture(Path(directory).resolve())
            with patch.object(exporter.extended, "validate_inputs", return_value=validated):
                _, item, bindings, _ = exporter.validate_inputs(parent, training, path)
            self.assertIn(str(path), bindings)
            for key, value in arrays.items():
                self.assertEqual(item["arrays"][key].tobytes(), value.tobytes())

    def test_incomplete_approved_wrong_schedule_and_rng_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            parent, training, path, report, _, validated = fixture(Path(directory).resolve())
            changes = (("status", "started"), ("completed_steps", 3001), ("training", True),
                ("quality_approved", True), ("baseline_reproduced", False), ("inputs_unchanged", False),
                ("new_score_or_music", True), ("offsets_semitones", [0., 2., 4., 2.]),
                ("source_PCM_mixed_into_output", True), ("optimizer_steps", 1), ("weights_written", True),
                ("forward_calls", 4), ("case_order", ["arirang001"]))
            with patch.object(exporter.extended, "validate_inputs", return_value=validated):
                for key, value in changes:
                    path.write_text(json.dumps({**report, key: value}))
                    with self.subTest(key=key), self.assertRaises(ValueError):
                        exporter.validate_inputs(parent, training, path)
                report["cases"][0]["rng_variant_before_sha256"]["20ms"] = "c" * 64
                path.write_text(json.dumps(report))
                with self.assertRaisesRegex(ValueError, "excitation_rng"):
                    exporter.validate_inputs(parent, training, path)

    def test_rehashed_pitch_mask_schedule_baseline_or_feature_tamper_rejected(self):
        for key in ("f0_0ms", "cf0_20ms", "offset_semitones_20ms", "factor_0ms", "boundary_mask",
                    "source_cf0", "baseline", "features", "normalized_features"):
            with self.subTest(key=key), tempfile.TemporaryDirectory() as directory:
                parent, training, path, report, arrays, validated = fixture(Path(directory).resolve())
                row = report["cases"][0]
                changed = {name: value.copy() for name, value in arrays.items()}
                if changed[key].dtype == bool:
                    changed[key].flat[0] = not changed[key].flat[0]
                else:
                    changed[key].flat[0] += .1
                archive = path.parent / row["file"]
                np.savez_compressed(archive, **changed)
                row["sha256"] = exporter.saved.sha256(archive)
                row["array_sha256"][key] = exporter.array_hash(changed[key])
                path.write_text(json.dumps(report))
                with patch.object(exporter.extended, "validate_inputs", return_value=validated), self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, training, path)

    def test_stale_hash_unsafe_child_and_checkpoint_tamper_rejected(self):
        for mode in ("stale_hash", "unsafe", "checkpoint"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                parent, training, path, report, _, validated = fixture(Path(directory).resolve())
                if mode == "stale_hash":
                    with (path.parent / report["cases"][0]["file"]).open("ab") as handle:
                        handle.write(b"changed")
                elif mode == "unsafe":
                    report["cases"][0]["file"] = "../escape.npz"
                else:
                    report["checkpoints"] = {}
                path.write_text(json.dumps(report))
                with patch.object(exporter.extended, "validate_inputs", return_value=validated), self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, training, path)

    def test_whole_experiment_and_export_caps_and_disk_floor(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            out = root / "listen"
            out.mkdir()
            with patch.object(exporter, "MAX_BYTES", 1), self.assertRaisesRegex(RuntimeError, "cap"):
                exporter.capacity(out, 2)
            with patch.object(exporter, "WHOLE_MAX_BYTES", 1), self.assertRaisesRegex(RuntimeError, "cap"):
                exporter.capacity(out, 2)
            with patch.object(exporter.shutil, "disk_usage", return_value=SimpleNamespace(free=0)), \
                    self.assertRaisesRegex(RuntimeError, "12GiB"):
                exporter.capacity(out)

    def test_only_two_new_carriers_presented_with_frozen_controller_and_postdiagnostics(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            parent, training, path, _, arrays, validated = fixture(root)
            calls, diagnostic_calls = [], []

            def fake_diagnostics(reference, baseline, variants, curves):
                self.assertEqual(reference.tobytes(), arrays["reference"].tobytes())
                for name, wave in {"baseline": baseline, **variants}.items():
                    raw = arrays["baseline" if name == "baseline" else "generated_" + name]
                    expected = exporter.level.apply_curve(raw, exporter.level.extract_curve(reference))[0]
                    self.assertEqual(expected.tobytes(), wave.tobytes())
                for variant, curve in curves.items():
                    np.testing.assert_array_equal(curve, exporter.expected_curve(variant))
                diagnostic_calls.append(True)
                return dict(baseline={"synthetic": True}, variants={v: {"synthetic": True} for v in variants})

            def fake_compare(items, destination, seconds):
                calls.append((items, seconds))
                destination.mkdir(mode=0o700)
                outputs = []
                for index, (variant, item) in enumerate(zip(exporter.VARIANTS, items), 1):
                    label, source = item.split("=", 1)
                    rate, wave = wavfile.read(source)
                    expected = exporter.level.apply_curve(arrays["generated_" + variant],
                        exporter.level.extract_curve(arrays["reference"]))[0]
                    self.assertEqual(rate, 24000)
                    self.assertEqual(wave.tobytes(), expected.tobytes())
                    self.assertIn("NEW_AUTHORED", label)
                    self.assertNotIn("BASELINE", label)
                    encoded = destination / (str(index) + ".m4a")
                    encoded.write_bytes(b"synthetic encoder stub; not actual audio")
                    outputs.append(dict(label=label, file=encoded.name, sha256=exporter.saved.sha256(encoded)))
                result = dict(schema="mini.foundation-local-static-lufs-comparison.v1", status="ready", seconds=4.8,
                    no_compression_AGC_EQ_pitch_time_edits=True, outputs=outputs)
                (destination / "comparison.json").write_text(json.dumps(result))
                return result

            fake_module = SimpleNamespace(raw_diagnostics=fake_diagnostics)
            with patch.object(exporter.extended, "validate_inputs", return_value=validated), \
                    patch.object(exporter, "PRIVATE_ROOT", root), \
                    patch.object(exporter, "PRODUCER", Path(exporter.__file__)), \
                    patch.object(exporter.level, "ResourceGuard", FakeGuard), \
                    patch.object(exporter.importlib, "import_module", return_value=fake_module), \
                    patch.object(exporter.shutil, "disk_usage", return_value=SimpleNamespace(free=100 * 1024 ** 3)):
                report = exporter.export(parent, training, path, root / "listen", fake_compare)
            self.assertEqual(len(calls), 1)
            self.assertEqual(len(diagnostic_calls), 1)
            self.assertEqual([row["role"] for row in report["outputs"]], ["0ms", "20ms"])
            self.assertEqual([row["presented"] for row in report["carriers"]], [False, True, True])
            self.assertEqual(report["geometry_boundary_mask_frames"], 96)
            self.assertIs(report["geometry_mask_counts_are_not_source_supported_pitch_counts"], True)
            self.assertIs(report["source_envelope_used"], True)
            self.assertIs(report["amplitude_condition_NOT_learned"], True)
            self.assertIs(report["authored_fixed_four_note_pitch_pattern"], True)
            for key in ("model_loaded_or_run", "training", "quality_approved", "learned_breath_attack_or_sigim",
                        "source_PCM_mixed_into_output", "new_score_or_music", "old_baseline_or_original_presented"):
                self.assertIs(report[key], False)
            for row in report["carriers"]:
                self.assertEqual(Path(row["native_wav"]["path"]).stat().st_mode & 0o777, 0o600)
            self.assertTrue((root / "listen/export_report.json").exists())
            with self.assertRaisesRegex(ValueError, "fresh_same_experiment"):
                exporter.export(parent, training, path, root / "listen", fake_compare)


if __name__ == "__main__":
    unittest.main()
