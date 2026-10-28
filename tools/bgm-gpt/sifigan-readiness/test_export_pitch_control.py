"""Synthetic pitch-export tests; no model, actual audio files or AAC encoder."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from scipy.io import wavfile

import export_pitch_control as exporter
from test_build_level_conditioned_trial import FakeGuard


def fixture(root):
    training = root / "training.json"
    training.write_text(json.dumps({"synthetic": True}))
    stats = root / "stats.npz"
    np.savez_compressed(stats, mean=np.zeros(43), scale=np.ones(43))
    gate = root / "gate.json"
    gate.write_text(json.dumps(dict(stats_file=stats.name, stats_sha256=exporter.saved.sha256(stats))))
    folder = root / "pitch"
    folder.mkdir()
    report = dict(schema="mini.sifigan-fixed-pitch-control.v1",
        status="fixed_pitch_control_rendered_not_perceptually_approved", baseline_reproduced=True,
        semitones=1., target_cents=100., factor=2. ** (1. / 12.), training=False, new_score_or_music=False,
        quality_approved=False, source_PCM_mixed_into_output=False, output_processing=False,
        input_bindings={str(training): exporter.saved.sha256(training)}, cases=[])
    selected = []
    originals = {}
    for index, case in enumerate(exporter.saved.CASES):
        t = np.arange(exporter.saved.SAMPLES) / 24000
        reference = (.01 * np.sin(2 * np.pi * (250 + 30 * index) * t)).astype(np.float32)
        reference[0] = -0.
        baseline = (.008 * np.sin(2 * np.pi * (250 + 30 * index) * t)).astype(np.float32)
        shifted = (.008 * np.sin(2 * np.pi * (250 + 30 * index) * report["factor"] * t)).astype(np.float32)
        f0 = np.full(960, 250 + 30 * index, np.float32)
        f0[0] = 0
        cf0 = np.maximum(f0, np.float32(250))
        features = np.full((960, 43), index, np.float32)
        shifted_f0, shifted_cf0 = f0.copy(), cf0.copy()
        shifted_f0 *= report["factor"]
        shifted_cf0 *= report["factor"]
        arrays = dict(reference=reference, baseline=baseline, shifted=shifted, source_f0=f0, source_cf0=cf0,
            shifted_f0=shifted_f0, shifted_cf0=shifted_cf0, features=features,
            normalized_features=features.copy())
        path = folder / (case + ".npz")
        np.savez_compressed(path, **arrays)
        corpus = root / (case + "_corpus.npz")
        np.savez_compressed(corpus, waveform=reference, f0=f0, cf0=cf0, features=features)
        selected.append(dict(case=case, reference=reference, generated=baseline, corpus_npz_path=str(corpus)))
        originals[case] = arrays
        report["cases"].append(dict(case=case, file=path.name, sha256=exporter.saved.sha256(path),
            baseline_reproduced=True, baseline_byte_exact=True,
            array_sha256={key: exporter.array_hash(value) for key, value in arrays.items()},
            raw_diagnostics={name: {"synthetic": True} for name in ("baseline", "shifted", "baseline_to_shifted")}))
    path = folder / "report.json"
    path.write_text(json.dumps(report))
    parent = root / "unused_parent_fixture.json"
    validated = ({"completed_steps": 3000, "data_gate": str(gate)}, selected,
                 {str(gate): exporter.saved.sha256(gate)}, {})
    return parent, training, path, report, originals, validated


class PitchExportTests(unittest.TestCase):
    def test_exact_source_baseline_and_pitch_controls_are_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            parent, training, path, original, arrays, validated = fixture(Path(directory).resolve())
            with patch.object(exporter.extended, "validate_inputs", return_value=validated):
                report, rows, bindings, _ = exporter.validate_inputs(parent, training, path)
            self.assertEqual(report["target_cents"], 100.)
            self.assertIn(str(path), bindings)
            for row in rows:
                for key, value in arrays[row["case"]].items():
                    self.assertEqual(row["arrays"][key].tobytes(), value.tobytes())

    def test_incomplete_approved_or_changed_contract_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            parent, training, path, report, _, validated = fixture(Path(directory).resolve())
            with patch.object(exporter.extended, "validate_inputs", return_value=validated):
                for key, changed in (("status", "started"), ("baseline_reproduced", False), ("target_cents", 200.),
                        ("semitones", 2.), ("factor", 1.), ("training", True), ("quality_approved", True),
                        ("output_processing", True), ("source_PCM_mixed_into_output", True), ("new_score_or_music", True)):
                    path.write_text(json.dumps({**report, key: changed}))
                    with self.subTest(key=key), self.assertRaises(ValueError):
                        exporter.validate_inputs(parent, training, path)

    def test_rehashed_control_voicing_baseline_or_feature_tamper_rejected(self):
        for key in ("shifted_f0", "source_cf0", "baseline", "features", "normalized_features"):
            with self.subTest(key=key), tempfile.TemporaryDirectory() as directory:
                parent, training, path, report, arrays, validated = fixture(Path(directory).resolve())
                row = report["cases"][0]
                archive = path.parent / row["file"]
                changed = {name: value.copy() for name, value in arrays[row["case"]].items()}
                changed[key].flat[0] += .1
                np.savez_compressed(archive, **changed)
                row["sha256"] = exporter.saved.sha256(archive)
                row["array_sha256"][key] = exporter.array_hash(changed[key])
                path.write_text(json.dumps(report))
                with patch.object(exporter.extended, "validate_inputs", return_value=validated), self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, training, path)

    def test_hash_and_unsafe_filename_tamper_rejected(self):
        for unsafe in (False, True):
            with self.subTest(unsafe=unsafe), tempfile.TemporaryDirectory() as directory:
                parent, training, path, report, _, validated = fixture(Path(directory).resolve())
                if unsafe:
                    report["cases"][0]["file"] = "../escape.npz"
                    path.write_text(json.dumps(report))
                else:
                    with (path.parent / report["cases"][0]["file"]).open("ab") as handle:
                        handle.write(b"changed")
                with patch.object(exporter.extended, "validate_inputs", return_value=validated), self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, training, path)

    def test_frozen_controller_applies_to_baseline_and_shifted_not_original_PCM(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            parent, training, path, _, arrays, validated = fixture(root)
            calls = []

            def fake_compare(items, destination, seconds):
                calls.append((items, seconds))
                destination.mkdir(mode=0o700)
                outputs = []
                original = arrays[destination.name]
                for index, (role, item) in enumerate(zip(("baseline", "shifted"), items), 1):
                    label, source = item.split("=", 1)
                    rate, actual = wavfile.read(source)
                    expected, _ = exporter.level.apply_curve(original[role], exporter.level.extract_curve(original["reference"]))
                    self.assertEqual(rate, 24000)
                    self.assertEqual(actual.tobytes(), expected.tobytes())
                    self.assertNotIn("ORIGINAL", label)
                    encoded = destination / (str(index) + ".m4a")
                    encoded.write_bytes(b"synthetic non-audio encoder stub")
                    outputs.append(dict(label=label, file=encoded.name, sha256=exporter.saved.sha256(encoded)))
                result = dict(schema="mini.foundation-local-static-lufs-comparison.v1", status="ready", seconds=4.8,
                    no_compression_AGC_EQ_pitch_time_edits=True, outputs=outputs)
                (destination / "comparison.json").write_text(json.dumps(result))
                return result

            with patch.object(exporter.extended, "validate_inputs", return_value=validated), \
                    patch.object(exporter, "PRIVATE_ROOT", root), patch.object(exporter.level, "ResourceGuard", FakeGuard):
                result = exporter.export(parent, training, path, root / "listening", fake_compare)
            self.assertEqual(len(calls), 2)
            self.assertTrue(all(seconds == 4.8 for _, seconds in calls))
            self.assertEqual(result["status"], "fixed_pitch_auditions_ready_not_perceptually_approved")
            for flag in ("source_envelope_used", "amplitude_condition_NOT_learned", "AGC"):
                self.assertIs(result[flag], True)
            for flag in ("training", "model_loaded_or_run", "quality_approved", "new_score_or_music", "noise_reduction",
                         "denoising_EQ", "waveform_pitch_shift", "source_PCM_mixed_into_output"):
                self.assertIs(result[flag], False)
            for pair in result["pairs"]:
                self.assertEqual([row["role"] for row in pair["outputs"]], ["baseline", "shifted"])
                for row in pair["carriers"]:
                    self.assertEqual(Path(row["native_wav"]["path"]).stat().st_mode & 0o777, 0o600)
            with self.assertRaisesRegex(ValueError, "fresh_absolute"):
                exporter.export(parent, training, path, root / "listening", fake_compare)


if __name__ == "__main__":
    unittest.main()
