"""Synthetic lineage/controller tests; no GPU, real originals, or AAC encoder."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from scipy.io import wavfile

import export_extended_training as exporter
from test_export_corpus_audition import fixture
from test_build_level_conditioned_trial import FakeGuard


def extension_fixture(root, full=True):
    parent_path, parent, arrays = fixture(root)
    folder = root / "extension"
    folder.mkdir()
    report = dict(schema="mini.sifigan-corpus-extension.v1",
        status="bounded_extension_complete_not_perceptually_approved" if full else "generator_only_not_full_resume",
        phase="complete", parent_all_inputs_preserved=True, parent_completed_steps=1000, completed_steps=2875,
        additional_completed_steps=1875, requested_additional_steps=2000, parent_final_baseline_reproduced=True,
        unchanged_training_recipe=True, full_resume_available=full, full_checkpoint_numeric_roundtrip_verified=full,
        data_gate=parent["data_gate"],
        parent_report=str(parent_path), parent_checkpoint=str(parent_path.parent / "final_full_resume.pt"),
        input_bindings=dict(parent["input_bindings"]), reconstructions=[])
    for flag in ("quality_approved", "new_score_or_music", "normalizer_changed", "input_gain_changed", "AP_or_cf0_changed",
            "optimizer_or_scheduler_reset", "public_weights_used", "hyperparameters_changed", "heldout_used_for_optimizer",
            "output_processing", "sampler_changed", "loss_changed"):
        report[flag] = False
    report["input_bindings"][str(parent_path)] = exporter.saved.sha256(parent_path)
    report["input_bindings"][report["parent_checkpoint"]] = parent["checkpoint_sha256"]
    for name, prefix in (("generator_step_002875.pt", "inference_checkpoint"),
            *(([("final_full_resume.pt", "checkpoint")]) if full else [])):
        path = folder / name
        path.write_bytes(b"synthetic checkpoint, never loaded")
        report[prefix + "_file"] = name
        report[prefix + "_sha256"] = exporter.saved.sha256(path)
        report[prefix + "_bytes"] = path.stat().st_size
    new_arrays = {}
    for case, (reference, old) in arrays.items():
        generated = (old * .7 + .003).astype(np.float32)
        new_arrays[case] = generated
        path = folder / ("final_" + case + "_reconstruction.npz")
        np.savez_compressed(path, reference=reference, generated=generated)
        report["reconstructions"].append(dict(case=case, file=path.name, sha256=exporter.saved.sha256(path),
            metrics={"synthetic_metric": 12.5}, level_metrics={"unchanged_raw": True}, perceptually_approved=False))
    report_path = folder / "report.json"
    report_path.write_text(json.dumps(report))
    return parent_path, report_path, report, arrays, new_arrays


class ExtendedExportTests(unittest.TestCase):
    def test_full_and_honest_generator_only_completion_are_accepted_without_model_load(self):
        for full in (True, False):
            with self.subTest(full=full), tempfile.TemporaryDirectory() as directory:
                parent, path, _, originals, new = extension_fixture(Path(directory).resolve(), full)
                report, selected, _, checkpoints = exporter.validate_inputs(parent, path)
                self.assertIs(report["full_resume_available"], full)
                self.assertEqual(len(checkpoints["extended"]), 2 if full else 1)
                for row in selected:
                    self.assertEqual(row["reference"].tobytes(), originals[row["case"]][0].tobytes())
                    self.assertEqual(row["generated"].tobytes(), new[row["case"]].tobytes())

    def test_incomplete_wrong_steps_changed_recipe_or_full_claim_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            parent, path, base, _, _ = extension_fixture(Path(directory).resolve())
            for key, changed in (("status", "failed"), ("phase", "save_generator"), ("completed_steps", 1000),
                    ("completed_steps", 3001), ("additional_completed_steps", 1800), ("quality_approved", True),
                    ("AP_or_cf0_changed", True), ("output_processing", True), ("full_resume_available", False),
                    ("full_checkpoint_numeric_roundtrip_verified", False),
                    ("unchanged_training_recipe", False), ("parent_final_baseline_reproduced", False)):
                path.write_text(json.dumps({**base, key: changed}))
                with self.subTest(key=key), self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, path)

    def test_model_raw_and_source_hash_tamper_rejected(self):
        for target in ("generator", "raw", "source"):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as directory:
                root = Path(directory).resolve()
                parent, path, report, _, _ = extension_fixture(root)
                file = {"generator": path.parent / report["inference_checkpoint_file"],
                        "raw": path.parent / report["reconstructions"][0]["file"],
                        "source": root / "corpus/deepvib48.source-fixture"}[target]
                with file.open("ab") as handle:
                    handle.write(b"tampered")
                with self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, path)

    def test_even_rehashed_wrong_reference_and_unsafe_archive_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            parent, path, report, arrays, new = extension_fixture(Path(directory).resolve())
            row = report["reconstructions"][0]
            raw = path.parent / row["file"]
            wrong = arrays[row["case"]][0].copy()
            wrong[0] = .9
            np.savez_compressed(raw, reference=wrong, generated=new[row["case"]])
            row["sha256"] = exporter.saved.sha256(raw)
            path.write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, "byte_exact"):
                exporter.validate_inputs(parent, path)
            row["file"] = "../escape.npz"
            path.write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, "safe_local"):
                exporter.validate_inputs(parent, path)

    def test_only_original_and_new_conditioned_pairs_raw_archive_metrics_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            parent, path, training, arrays, new = extension_fixture(root)
            calls = []

            def fake_compare(items, destination, seconds):
                calls.append((items, seconds))
                destination.mkdir(mode=0o700)
                outputs = []
                for number, item in enumerate(items):
                    label, source = item.split("=", 1)
                    reference = arrays[destination.name][0]
                    expected = reference if number == 0 else exporter.level.apply_curve(
                        new[destination.name], exporter.level.extract_curve(reference))[0]
                    rate, actual = wavfile.read(source)
                    self.assertEqual(rate, 24000)
                    self.assertEqual(actual.tobytes(), expected.tobytes())
                    self.assertNotIn("OLD", label)
                    self.assertNotIn("052", label)
                    if number:
                        self.assertIn("global2875", label)
                    output = destination / f"{number + 1:02}.m4a"
                    output.write_bytes(b"synthetic non-audio encoder fixture")
                    outputs.append(dict(label=label, file=output.name, sha256=exporter.saved.sha256(output)))
                comparison = dict(schema="mini.foundation-local-static-lufs-comparison.v1", status="ready", seconds=4.8,
                    no_compression_AGC_EQ_pitch_time_edits=True, outputs=outputs)
                (destination / "comparison.json").write_text(json.dumps(comparison))
                return comparison

            with patch.object(exporter, "PRIVATE_ROOT", root), patch.object(exporter.level, "ResourceGuard", FakeGuard):
                report = exporter.export(parent, path, root / "export", fake_compare)
            self.assertEqual(len(calls), 2)
            for row in report["pairs"]:
                source = next(x for x in training["reconstructions"] if x["case"] == row["case"])
                self.assertEqual(row["raw_training_record"], source)
                copy = root / "export" / row["unchanged_raw_copy"]["file"]
                self.assertEqual(copy.read_bytes(), (path.parent / source["file"]).read_bytes())
                self.assertEqual(copy.stat().st_mode & 0o777, 0o600)
                self.assertEqual([x["role"] for x in row["outputs"]], ["original_reference", "new_candidate"])
            for key in ("sourcecurveused", "reference_envelope_used", "source_envelope_NOT_learned", "AGC", "output_postprocessing"):
                self.assertIs(report[key], True)
            for key in ("export_model_loaded_or_run", "export_training", "new_score_or_music", "heldout_is_blind",
                    "quality_approved", "perceptually_approved", "source_PCM_mixed_into_output", "hard_mute_or_gate",
                    "old_global1000_or_rejected052_presented"):
                self.assertIs(report[key], False)
            self.assertLess(sum(p.stat().st_size for p in (root / "export").rglob("*") if p.is_file()), 10_000_000)
            with self.assertRaisesRegex(ValueError, "fresh_absolute"):
                exporter.export(parent, path, root / "export", fake_compare)


if __name__ == "__main__":
    unittest.main()
