"""Synthetic predicted-gain/export tests; no real audio, ML, or AAC encoder."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_volume_head_comparison as exporter
from test_export_corpus_audition import fixture as parent_fixture


def fixture(root):
    parent, _, waves = parent_fixture(root)
    _, _, bindings, _ = exporter.carrier.validate_inputs(parent)
    head_dir = root / "physical_head"
    head_dir.mkdir()
    model = head_dir / "head.npz"
    model.write_bytes(b"synthetic physical head fixture; never loaded")
    report = dict(schema="mini.sifigan-physical-volume-head.v1",
        status="learned_gain_head_evaluated_not_perceptually_approved", input_bindings=bindings,
        model_file=model.name, model_sha256=exporter.carrier.sha256(model), cases=[],
        training=dict(fit_cases=["synthetic-fit"], fit_only_CV=dict(selected_alpha=1)),
        evaluation_role="historically_seen_development_clips_not_blind")
    for key in ("learned_continuous_gain_control", "AGC", "output_postprocessing", "runtime_requires_original_acoustic_features"):
        report[key] = True
    for key in ("raw_vocoder_training", "new_score_or_music", "quality_approved", "perceptually_approved",
                "reference_envelope_copied", "reference_RMS_used_for_runtime_gain", "hard_quiet_threshold_or_mute",
                "original_vocoder_normalizer_changed", "heldout_used_for_head_fit_statistics_or_hyperparameter_selection"):
        report[key] = False
    afters = {}
    for case, (reference, before) in waves.items():
        gain = np.linspace(-6., -3., 960)
        carrier_level = np.full(960, -40.)
        controls = dict(predicted_level_dbfs=carrier_level + gain, carrier_measured_level_dbfs=carrier_level,
            desired_gain_db=gain, bounded_gain_db=gain, smoothed_gain_db=gain)
        sample_gain = np.interp(np.arange(exporter.carrier.SAMPLES) / 120, np.arange(960), gain)
        after = (before.astype(np.float64) * 10 ** (sample_gain / 20)).astype(np.float32)
        afters[case] = after
        carrier = parent.parent / (case + ".npz")
        row = dict(case=case, carrier_path=str(carrier), carrier_sha256=exporter.carrier.sha256(carrier),
            facts=dict(AGC=True, output_postprocessing=True, learned_gain_control=True, offline_noncausal_context_ms=25))
        for stage, wave in (("before", before), ("after", after)):
            path = head_dir / (stage + "_" + case + ".npz")
            np.savez_compressed(path, reference=reference, generated=wave)
            row[stage] = dict(file=path.name, sha256=exporter.carrier.sha256(path),
                diagnostics=dict(pitch={"synthetic_proxy": True}, level={"synthetic_raw_error": 2 if stage == "before" else 1}))
        path = head_dir / (case + "_controls.npz")
        np.savez_compressed(path, **controls)
        row["controls"] = dict(file=path.name, sha256=exporter.carrier.sha256(path))
        report["cases"].append(row)
    head = head_dir / "report.json"
    head.write_text(json.dumps(report))
    return head, parent, report, waves, afters


class VolumeHeadExportTests(unittest.TestCase):
    def test_validated_before_is_saved_carrier_after_is_bound_gain_output(self):
        with tempfile.TemporaryDirectory() as directory:
            head, parent, report, waves, afters = fixture(Path(directory).resolve())
            _, rows, bindings, models = exporter.validate_inputs(head, parent)
            self.assertIn(str(head), bindings)
            self.assertIn("physical_volume_head", models)
            for row in rows:
                case = row["case"]
                self.assertEqual(row["before"].tobytes(), waves[case][1].tobytes())
                self.assertEqual(row["after"].tobytes(), afters[case].tobytes())
                self.assertEqual(row["raw_after_diagnostics"], next(r for r in report["cases"] if r["case"] == case)["after"]["diagnostics"])

    def test_failed_linear_schema_or_hidden_AGC_or_approved_quality_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            head, parent, report, _, _ = fixture(Path(directory).resolve())
            for key, value in (("schema", "mini.sifigan-learned-linear-volume-head.v1"),
                    ("status", "started"), ("AGC", False), ("output_postprocessing", False),
                    ("reference_envelope_copied", True), ("reference_RMS_used_for_runtime_gain", True),
                    ("quality_approved", True), ("raw_vocoder_training", True),
                    ("original_vocoder_normalizer_changed", True)):
                head.write_text(json.dumps({**report, key: value}))
                with self.subTest(key=key), self.assertRaises(ValueError):
                    exporter.validate_inputs(head, parent)

    def test_bound_control_and_model_tamper_rejected(self):
        for target in ("controls", "model"):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as directory:
                head, parent, report, _, _ = fixture(Path(directory).resolve())
                filename = report["model_file"] if target == "model" else report["cases"][0]["controls"]["file"]
                with (head.parent / filename).open("ab") as handle:
                    handle.write(b"tampered")
                with self.assertRaises(ValueError):
                    exporter.validate_inputs(head, parent)

    def test_after_not_matching_gain_or_before_not_matching_carrier_rejected(self):
        for stage in ("before", "after"):
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as directory:
                head, parent, report, waves, afters = fixture(Path(directory).resolve())
                row = report["cases"][0]
                case = row["case"]
                path = head.parent / row[stage]["file"]
                ref = waves[case][0]
                wave = waves[case][1].copy() if stage == "before" else afters[case].copy()
                wave[10] += .001
                np.savez_compressed(path, reference=ref, generated=wave)
                row[stage]["sha256"] = exporter.carrier.sha256(path)
                head.write_text(json.dumps(report))
                with self.assertRaisesRegex(ValueError, "before_must_be_byte_exact|saved_after_not_exact"):
                    exporter.validate_inputs(head, parent)

    def test_stub_export_discloses_AGC_preserves_raw_metrics_and_fit_CV(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            head, parent, original, waves, afters = fixture(root)
            calls = []
            def comparator(items, destination, seconds):
                calls.append(items)
                self.assertEqual(seconds, 4.8)
                destination.mkdir(mode=0o700)
                rows = []
                for index, item in enumerate(items):
                    label, path = item.split("=", 1)
                    case = "deepvib48" if "deepvib48" in path else "arirang001"
                    if index:
                        self.assertIn("LEARNED_CONTINUOUS_GAIN_HEAD_AGC_POSTPROCESS", label)
                    else:
                        self.assertIn("CARRIER", label)
                    _, wave = wavfile.read(path)
                    expected = waves[case][1] if index == 0 else afters[case]
                    self.assertEqual(wave.tobytes(), expected.tobytes())
                    file = destination / f"{index}.m4a"
                    file.write_bytes(b"synthetic non-audio encoder stub")
                    rows.append(dict(label=label, file=file.name, sha256=exporter.carrier.sha256(file)))
                result = dict(schema="mini.foundation-local-static-lufs-comparison.v1", status="ready", seconds=4.8,
                    no_compression_AGC_EQ_pitch_time_edits=True, outputs=rows)
                (destination / "comparison.json").write_text(json.dumps(result))
                return result
            with patch.object(exporter, "PRIVATE_ROOT", root):
                result = exporter.export(head, parent, root / "export", compare_fn=comparator)
            self.assertEqual(len(calls), 2)
            self.assertTrue(result["AGC"])
            self.assertTrue(result["output_postprocessing"])
            self.assertFalse(result["raw_vocoder_training"])
            self.assertFalse(result["quality_approved"])
            self.assertFalse(result["model_loaded_or_run"])
            self.assertTrue(result["static_LUFS_matching_is_not_proof_of_actual_envelope_repair"])
            self.assertEqual(result["head_training_and_CV_selection"], original["training"])
            self.assertEqual(result["pairs"][0]["raw_after_diagnostics"], original["cases"][0]["after"]["diagnostics"])
            with self.assertRaisesRegex(ValueError, "fresh_absolute"):
                exporter.export(head, parent, root / "export", compare_fn=comparator)


if __name__ == "__main__":
    unittest.main()
