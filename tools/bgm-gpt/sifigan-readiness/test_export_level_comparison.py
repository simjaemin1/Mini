"""Synthetic lineage and stub-encoder tests; no model or real-audio export."""
import copy
import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_level_comparison as exporter
from test_export_corpus_audition import fixture as parent_fixture


def fixture(root):
    parent_path, _, arrays = parent_fixture(root)
    _, _, bindings, checkpoints = exporter.old.validate_inputs(parent_path)
    destination = root / "level_fix"
    destination.mkdir()
    baseline, final, after = [], [], {}
    for case, (reference, before) in arrays.items():
        after[case] = (before * .9 - .0001).astype(np.float32)
        for prefix, output, values in (("baseline", baseline, before), ("final", final, after[case])):
            path = destination / (prefix + "_" + case + ".npz")
            np.savez_compressed(path, reference=reference, generated=values)
            output.append(dict(case=case, file=path.name, sha256=exporter.old.sha256(path),
                perceptually_approved=False, metrics={"not_pitch_ground_truth": True},
                level_metrics={"synthetic_raw_level_error": .1 if prefix == "baseline" else .05}))
    report = dict(schema="mini.sifigan-level-fix.v1", status="bounded_level_fix_complete_not_perceptually_approved",
        parent_completed_steps=1000, completed_steps=2000, additional_completed_steps=1000,
        parent_final_baseline_reproduced=True, parent_report=str(parent_path),
        parent_checkpoint=checkpoints["final_full_resume.pt"]["path"], input_bindings=bindings,
        baseline_reconstructions=baseline, reconstructions=final, two_interventions="sampling_and_level_loss",
        evaluation_role="adaptive_development_validation_not_untouched_test")
    for key in ("quality_approved", "new_score_or_music", "normalizer_changed", "input_gain_changed",
                "conditioning_or_F0_changed", "optimizer_or_scheduler_reset", "public_weights_used",
                "heldout_used_for_optimizer", "output_mute_EQ_AGC_gain_envelope_source_mix"):
        report[key] = False
    for filename, hash_key, size_key in (("final_full_resume.pt", "checkpoint_sha256", "checkpoint_bytes"),
            ("final_generator.pt", "inference_checkpoint_sha256", "inference_checkpoint_bytes")):
        path = destination / filename
        path.write_bytes(b"synthetic new checkpoint, never loaded")
        report[hash_key], report[size_key] = exporter.old.sha256(path), path.stat().st_size
    child_path = destination / "report.json"
    child_path.write_text(json.dumps(report))
    return parent_path, child_path, report, arrays, after


class LevelComparisonTests(unittest.TestCase):
    def test_valid_lineage_preserves_saved_old_new_and_raw_metrics(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            parent, child, raw, original, after = fixture(root)
            report, pairs, bindings, checkpoints = exporter.validate_inputs(parent, child)
            self.assertEqual(report["completed_steps"], 2000)
            self.assertEqual(set(checkpoints), {"old_global1000", "new_level_fix"})
            self.assertIn(str(child), bindings)
            for row in pairs:
                self.assertEqual(row["before"].tobytes(), original[row["case"]][1].tobytes())
                self.assertEqual(row["after"].tobytes(), after[row["case"]].tobytes())
                self.assertTrue(row["reload_is_byte_exact_parent"])
                self.assertEqual(row["raw_after_level_metrics"], next(r["level_metrics"] for r in raw["reconstructions"] if r["case"] == row["case"]))

    def test_incomplete_changed_controls_or_approved_child_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            parent, child, report, _, _ = fixture(Path(directory).resolve())
            for key, value in (("status", "started"), ("completed_steps", 1000), ("completed_steps", 2001),
                    ("parent_final_baseline_reproduced", False), ("quality_approved", True),
                    ("input_gain_changed", True), ("conditioning_or_F0_changed", True),
                    ("output_mute_EQ_AGC_gain_envelope_source_mix", True)):
                child.write_text(json.dumps({**report, key: value}))
                with self.subTest(key=key), self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, child)

    def test_reload_tolerance_never_substitutes_child_baseline_for_old(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            parent, child, report, arrays, _ = fixture(root)
            row = report["baseline_reconstructions"][0]
            path = child.parent / row["file"]
            reference, old_wave = arrays[row["case"]]
            np.savez_compressed(path, reference=reference, generated=(old_wave + 1e-7).astype(np.float32))
            row["sha256"] = exporter.old.sha256(path)
            child.write_text(json.dumps(report))
            _, pairs, _, _ = exporter.validate_inputs(parent, child)
            self.assertFalse(pairs[0]["reload_is_byte_exact_parent"])
            self.assertEqual(pairs[0]["before"].tobytes(), old_wave.tobytes())
            np.savez_compressed(path, reference=reference, generated=(old_wave + .001).astype(np.float32))
            row["sha256"] = exporter.old.sha256(path)
            child.write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, "baseline_does_not_match"):
                exporter.validate_inputs(parent, child)

    def test_reference_signed_zero_must_remain_byte_exact(self):
        with tempfile.TemporaryDirectory() as directory:
            parent, child, report, arrays, _ = fixture(Path(directory).resolve())
            row = report["reconstructions"][0]
            path = child.parent / row["file"]
            reference, generated = arrays[row["case"]]
            reference = reference.copy(); reference[0] = 0.
            np.savez_compressed(path, reference=reference, generated=generated)
            row["sha256"] = exporter.old.sha256(path)
            child.write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, "byte_exact"):
                exporter.validate_inputs(parent, child)

    def test_child_checkpoint_or_selected_archive_tamper_is_rejected(self):
        for target in ("checkpoint", "final_npz", "parent_source"):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as directory:
                root = Path(directory).resolve()
                parent, child, report, _, _ = fixture(root)
                path = {"checkpoint": child.parent / "final_generator.pt",
                        "final_npz": child.parent / report["reconstructions"][0]["file"],
                        "parent_source": root / "corpus/deepvib48.source-fixture"}[target]
                with path.open("ab") as handle:
                    handle.write(b"tampered")
                with self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, child)

    def test_stub_export_two_learned_pairs_raw_PCM_and_no_quality_claim(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            parent, child, raw, arrays, after = fixture(root)
            calls = []
            def comparator(items, destination, seconds):
                calls.append(items)
                self.assertEqual(seconds, 4.8)
                destination.mkdir(mode=0o700)
                outputs = []
                for index, item in enumerate(items):
                    label, path = item.split("=", 1)
                    self.assertIn("learned", label)
                    self.assertNotIn("original_reference", label)
                    _, waveform = wavfile.read(path)
                    case = "deepvib48" if "deepvib48" in path else "arirang001"
                    expected = arrays[case][1] if index == 0 else after[case]
                    self.assertEqual(waveform.tobytes(), expected.tobytes())
                    file = destination / f"{index}.m4a"
                    file.write_bytes(b"synthetic non-audio encoder stub")
                    outputs.append(dict(label=label, file=file.name, sha256=exporter.old.sha256(file)))
                result = dict(schema="mini.foundation-local-static-lufs-comparison.v1", status="ready", seconds=4.8,
                    no_compression_AGC_EQ_pitch_time_edits=True, outputs=outputs)
                (destination / "comparison.json").write_text(json.dumps(result))
                return result
            with patch.object(exporter, "PRIVATE_ROOT", root):
                report = exporter.export(parent, child, root / "export", compare_fn=comparator)
            self.assertEqual(len(calls), 2)
            self.assertFalse(report["quality_approved"])
            self.assertFalse(report["new_score_or_music"])
            self.assertFalse(report["model_loaded_or_run"])
            self.assertTrue(report["static_LUFS_does_not_repair_actual_time_varying_level_or_leakage"])
            self.assertEqual(stat.S_IMODE((root / "export").stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE((root / "export/export_report.json").stat().st_mode), 0o600)
            self.assertEqual(report["pairs"][0]["raw_after_level_metrics"], raw["reconstructions"][0]["level_metrics"])
            with self.assertRaisesRegex(ValueError, "fresh_absolute"):
                exporter.export(parent, child, root / "export", compare_fn=comparator)


if __name__ == "__main__":
    unittest.main()
