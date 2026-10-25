"""Synthetic lineage/PCM tests; no model, original audio, or actual AAC encoder."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from scipy.io import wavfile

SPEC = importlib.util.spec_from_file_location("export_corpus_audition", Path(__file__).with_name("export_corpus_audition.py"))
exporter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exporter)


def fixture(root):
    corpus, audit, continuation = (root / name for name in ("corpus", "audit", "continuation"))
    for path in (corpus, audit, continuation):
        path.mkdir()
    files, reconstructions, arrays = [], [], {}
    for i, case in enumerate(exporter.CASES):
        reference = np.full(exporter.SAMPLES, .01 * (i + 1), np.float32)
        reference[0] = np.float32(-0.)
        generated = (reference * .5 + .001).astype(np.float32)
        original = corpus / (case + ".source-fixture")
        original.write_bytes((case + " synthetic bytes, not actual audio").encode())
        native = corpus / (case + ".npz")
        np.savez_compressed(native, waveform=np.concatenate((reference, reference[:120])))
        source = dict(case=case, split="heldout", source_path=str(original), source_sha256=exporter.sha256(original),
                      npz_file=native.name, npz_sha256=exporter.sha256(native))
        files.append(source)
        archive = continuation / (case + ".npz")
        np.savez_compressed(archive, reference=reference, generated=generated)
        reconstructions.append(dict(case=case, file=archive.name, sha256=exporter.sha256(archive),
                                    perceptually_approved=False, metrics={"naturalness_approved": False}))
        arrays[case] = reference, generated
    manifest = corpus / "manifest.json"
    manifest.write_text(json.dumps(dict(schema="mini.sifigan-corpus.v1", status="complete", sample_rate=24000,
                                        hop_size=120, files=files)))
    gate = audit / "window_gate.json"
    gate.write_text(json.dumps(dict(schema="mini.sifigan-window-gate.v1", status="complete",
        source_manifest_path=str(manifest), source_manifest_sha256=exporter.sha256(manifest),
        files=[dict(row, npz_path=str(corpus / row["npz_file"])) for row in files])))
    report = dict(schema="mini.sifigan-corpus-resume.v1", status="bounded_resume_complete_not_perceptually_approved",
        completed_steps=1000, additional_completed_steps=500, parent_completed_steps=500,
        quality_approved=False, new_score_or_music=False, public_weights_used=False, heldout_used_for_optimizer=False,
        data_gate=str(gate), input_bindings={str(gate): exporter.sha256(gate), str(manifest): exporter.sha256(manifest)},
        reconstructions=reconstructions)
    for row in files:
        report["input_bindings"][str(corpus / row["npz_file"])] = row["npz_sha256"]
    for filename, hash_key, size_key in (
            ("final_full_resume.pt", "checkpoint_sha256", "checkpoint_bytes"),
            ("final_generator.pt", "inference_checkpoint_sha256", "inference_checkpoint_bytes")):
        path = continuation / filename
        path.write_bytes(b"synthetic checkpoint fixture, never torch loaded")
        report[hash_key], report[size_key] = exporter.sha256(path), path.stat().st_size
    path = continuation / "report.json"
    path.write_text(json.dumps(report))
    return path, report, arrays


class AuditionExportTests(unittest.TestCase):
    def test_bound_completed_report_preserves_original_and_generated_arrays(self):
        with tempfile.TemporaryDirectory() as folder:
            path, _, arrays = fixture(Path(folder).resolve())
            report, selected, bindings, checkpoints = exporter.validate_inputs(path)
            self.assertEqual(report["completed_steps"], 1000)
            self.assertEqual(len(checkpoints), 2)
            for row in selected:
                reference, generated = arrays[row["case"]]
                self.assertEqual(row["reference"].tobytes(), reference.tobytes())
                self.assertEqual(row["generated"].tobytes(), generated.tobytes())
                self.assertIn(row["corpus_npz_path"], bindings)

    def test_incomplete_or_approved_report_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path, original, _ = fixture(Path(folder).resolve())
            for key, value in (("completed_steps", 500), ("status", "started"), ("quality_approved", True)):
                path.write_text(json.dumps({**original, key: value}))
                with self.subTest(key=key), self.assertRaises(ValueError):
                    exporter.validate_inputs(path)

    def test_corresponding_source_or_reconstruction_tamper_is_rejected(self):
        for target in ("source", "reconstruction", "checkpoint"):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as folder:
                root = Path(folder).resolve()
                path, report, _ = fixture(root)
                file = {"source": root / "corpus/deepvib48.npz",
                        "reconstruction": root / "continuation/deepvib48.npz",
                        "checkpoint": root / "continuation/final_full_resume.pt"}[target]
                with file.open("ab") as handle:
                    handle.write(b"changed")
                with self.assertRaises(ValueError):
                    exporter.validate_inputs(path)

    def test_shape_dtype_nonfinite_and_reference_mismatch_are_rejected(self):
        reference = np.ones(exporter.SAMPLES, np.float32)
        for changed in (reference[:-1], reference.astype(np.float64), np.full(exporter.SAMPLES, np.nan, np.float32)):
            with self.subTest(shape=changed.shape, dtype=changed.dtype), self.assertRaises(ValueError):
                exporter.validate_arrays(reference, changed, reference)
        wrong = reference.copy(); wrong[5] = .5
        with self.assertRaisesRegex(ValueError, "byte_exact"):
            exporter.validate_arrays(reference, reference, wrong)
        zeros = np.zeros(exporter.SAMPLES, np.float32); negative = zeros.copy(); negative[0] = -0.
        with self.assertRaisesRegex(ValueError, "byte_exact"):
            exporter.validate_arrays(zeros, zeros, negative)

    def test_unsafe_archive_name_and_existing_output_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve(); path, report, _ = fixture(root)
            report["reconstructions"][0]["file"] = "../outside.npz"
            path.write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, "safe_local_basename"):
                exporter.validate_inputs(path)
            output = root / "existing"; output.mkdir()
            with self.assertRaisesRegex(ValueError, "fresh_absolute"):
                exporter.export(path, output)

    def test_native_float_wav_is_exact_and_never_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "synthetic.wav"
            wave = np.linspace(-.1, .1, exporter.SAMPLES, dtype=np.float32); wave[3] = -0.
            exporter.write_float_wav(path, wave)
            rate, actual = wavfile.read(path)
            self.assertEqual(rate, 24000)
            self.assertEqual(actual.tobytes(), wave.tobytes())
            with self.assertRaises(FileExistsError):
                exporter.write_float_wav(path, wave)

    def test_export_calls_two_static_pairs_and_never_labels_quality_approved(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve(); path, _, arrays = fixture(root); calls = []
            def fake_compare(items, destination, seconds):
                # Synthetic encoder stub; no FFmpeg command or audio playback.
                calls.append((items, seconds)); destination.mkdir(mode=0o700)
                outputs = []
                for i, item in enumerate(items, 1):
                    label, source = item.split("=", 1)
                    rate, wave = wavfile.read(source)
                    self.assertEqual(rate, 24000)
                    case = "deepvib48" if "deepvib48" in source else "arirang001"
                    self.assertEqual(wave.tobytes(), arrays[case][i - 1].tobytes())
                    output = destination / f"{i:02}.m4a"; output.write_bytes(b"synthetic non-audio fixture")
                    outputs.append(dict(label=label, file=output.name, sha256=exporter.sha256(output)))
                result = dict(schema="mini.foundation-local-static-lufs-comparison.v1", status="ready", seconds=4.8,
                              no_compression_AGC_EQ_pitch_time_edits=True, outputs=outputs)
                (destination / "comparison.json").write_text(json.dumps(result))
                return result
            with patch.object(exporter, "PRIVATE_ROOT", root):
                result = exporter.export(path, root / "export", compare_fn=fake_compare)
            self.assertEqual(len(calls), 2)
            self.assertTrue(all(seconds == 4.8 for _, seconds in calls))
            self.assertEqual(result["status"], "research_intermediate_not_quality_approved")
            self.assertFalse(result["model_loaded_or_run"])
            self.assertFalse(result["new_score_or_music"])
            self.assertFalse(result["quality_approved"])
            self.assertTrue(result["static_display_gain_does_not_repair_within_phrase_level_or_quiet_introduction_leakage"])
            self.assertEqual(len(result["pairs"]), 2)


if __name__ == "__main__":
    unittest.main()
