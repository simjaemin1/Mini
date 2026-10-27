"""Synthetic exporter tests: no actual recordings, WORLD, models or AAC encoder."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from scipy.io import wavfile

import export_timbre_roundtrip as exporter
from test_export_corpus_audition import fixture as parent_fixture


def fixture(root):
    parent, _, arrays = parent_fixture(root)
    folder = root / "raw_trial"
    folder.mkdir()
    _, sources, bindings, _ = exporter.saved.validate_inputs(parent)
    report = dict(schema="mini.sifigan-world-timbre-roundtrip.v1",
        status="roundtrip_diagnostic_complete_not_perceptually_approved", parent_report_path=str(parent),
        inputs_unchanged=True, input_bindings=bindings, training=False, learned_model_loaded_or_run=False,
        public_weights_used=False, GPU_used=False, Torch_imported=False, new_score_or_music=False, heldout_is_blind=False,
        quality_approved=False, perceptually_approved=False, source_PCM_mixed_into_synthesis=False,
        EQ_AGC_gain_pitch_time_edit=False, WORLD_synthesis_performed=True, cases=[])
    for source in sources:
        case = source["case"]
        reference, generated = arrays[case]
        phase = np.arange(exporter.saved.SAMPLES) * (2 * np.pi * 330 / 24000)
        full = (np.sin(phase) * .005).astype(np.float32)
        waves = dict(original_reference=reference, saved_SiFiGAN_global1000=generated,
            full_sp_full_ap=full, compact_sp_full_ap=(full * .8).astype(np.float32),
            full_sp_compact_ap=(full * .7).astype(np.float32),
            compact_sp_compact_ap=(full * .6).astype(np.float32))
        raw = exporter.level_trial.write_npz(folder / (case + "_raw.npz"), **waves)
        controls = exporter.level_trial.write_npz(folder / (case + "_controls.npz"),
                                                   synthetic_not_REAL_WORLD=np.zeros(10))
        report["cases"].append(dict(case=case, original_path=source["original_path"],
            original_sha256=source["original_sha256"], corpus_npz_path=source["corpus_npz_path"],
            corpus_npz_sha256=source["corpus_npz_sha256"], saved_carrier_path=source["reconstruction_path"],
            saved_carrier_sha256=source["reconstruction_sha256"],
            byte_exact_corpus_checks={key: True for key in ("f0", "cf0", "features", "decoded_PCM", "reference_PCM")},
            raw_waveforms=raw, controls=controls, waveform_hashes={key: exporter.array_hash(wave) for key, wave in waves.items()},
            raw_timbre_metrics={"synthetic": True}, raw_pitch_level_diagnostics={"synthetic": True},
            compression_parameter_diagnostics={"synthetic": True}))
    path = folder / "report.json"
    path.write_text(json.dumps(report))
    return path, parent, report, arrays


def rewrite_raw(path, report, case, key, changed):
    row = next(item for item in report["cases"] if item["case"] == case)
    raw = path.parent / row["raw_waveforms"]["file"]
    with np.load(raw, allow_pickle=False) as archive:
        waves = {name: archive[name].copy() for name in archive.files}
    waves[key] = changed
    # Only synthetic fixture rewriting; actual exporter never rewrites inputs.
    with raw.open("wb") as handle:
        np.savez_compressed(handle, **waves)
    row["raw_waveforms"].update(sha256=exporter.saved.sha256(raw), bytes=raw.stat().st_size)
    row["waveform_hashes"][key] = exporter.array_hash(changed)
    path.write_text(json.dumps(report))


class TimbreExportTests(unittest.TestCase):
    def test_both_case_artifacts_and_completed_parent_are_bound_without_model_load(self):
        with tempfile.TemporaryDirectory() as folder:
            path, parent, _, arrays = fixture(Path(folder).resolve())
            raw, completed, primary, bindings, checkpoints = exporter.validate_roundtrip(path, parent)
            self.assertEqual(completed["completed_steps"], 1000)
            self.assertEqual(primary["waves"]["original_reference"].tobytes(), arrays["arirang001"][0].tobytes())
            self.assertEqual(len(checkpoints), 2)
            for row in raw["cases"]:
                for key in ("raw_waveforms", "controls"):
                    self.assertIn(str(path.parent / row[key]["file"]), bindings)

    def test_wrong_status_parent_binding_or_approval_is_rejected(self):
        for key, value in (("status", "started"), ("quality_approved", True),
                           ("parent_report_path", "/not/the/parent.json")):
            with self.subTest(key=key), tempfile.TemporaryDirectory() as folder:
                path, parent, report, _ = fixture(Path(folder).resolve())
                report[key] = value
                path.write_text(json.dumps(report))
                with self.assertRaises(ValueError):
                    exporter.validate_roundtrip(path, parent)
        with tempfile.TemporaryDirectory() as folder:
            path, parent, report, _ = fixture(Path(folder).resolve())
            report["input_bindings"][str(parent)] = "0" * 64
            path.write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, "parent_report_hash"):
                exporter.validate_roundtrip(path, parent)

    def test_other_case_control_tamper_is_not_hidden_by_primary_only_export(self):
        with tempfile.TemporaryDirectory() as folder:
            path, parent, report, _ = fixture(Path(folder).resolve())
            row = next(item for item in report["cases"] if item["case"] == "deepvib48")
            with (path.parent / row["controls"]["file"]).open("ab") as handle:
                handle.write(b"changed fixture")
            with self.assertRaisesRegex(ValueError, "size_changed"):
                exporter.validate_roundtrip(path, parent)

    def test_reference_and_saved_carrier_remain_byte_exact_even_with_updated_raw_hash(self):
        for key in ("original_reference", "saved_SiFiGAN_global1000"):
            with self.subTest(key=key), tempfile.TemporaryDirectory() as folder:
                path, parent, report, arrays = fixture(Path(folder).resolve())
                changed = arrays["arirang001"][0 if key == "original_reference" else 1].copy()
                changed[7] += .0001
                rewrite_raw(path, report, "arirang001", key, changed)
                with self.assertRaisesRegex(ValueError, "not_byte_exact"):
                    exporter.validate_roundtrip(path, parent)
        with tempfile.TemporaryDirectory() as folder:
            path, parent, report, arrays = fixture(Path(folder).resolve())
            rewrite_raw(path, report, "arirang001", "full_sp_full_ap", arrays["arirang001"][0].astype(np.float64))
            with self.assertRaisesRegex(ValueError, "finite_float32"):
                exporter.validate_roundtrip(path, parent)

    def test_four_way_export_uses_identical_explicit_curve_and_only_static_display_helper(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            path, parent, raw, arrays = fixture(root)
            before_hashes = {str(path): exporter.saved.sha256(path)}
            for row in raw["cases"]:
                for key in ("raw_waveforms", "controls"):
                    before_hashes[str(path.parent / row[key]["file"])] = row[key]["sha256"]
            calls = []
            reference = arrays["arirang001"][0]
            desired = exporter.level_trial.extract_curve(reference)
            primary = next(row for row in raw["cases"] if row["case"] == "arirang001")
            with np.load(path.parent / primary["raw_waveforms"]["file"], allow_pickle=False) as archive:
                expected = [reference] + [exporter.level_trial.apply_curve(archive[key], desired)[0]
                                          for key, _ in exporter.CARRIERS]
            def fake_compare(items, destination, seconds):
                calls.append((items, seconds))
                destination.mkdir(mode=0o700)
                outputs = []
                for index, (item, wave) in enumerate(zip(items, expected), 1):
                    label, source = item.split("=", 1)
                    rate, pcm = wavfile.read(source)
                    self.assertEqual(rate, 24000)
                    self.assertEqual(pcm.tobytes(), wave.tobytes())
                    target = destination / f"{index:02}.m4a"
                    target.write_bytes(b"synthetic encoder fixture; not real audio")
                    outputs.append(dict(label=label, file=target.name, sha256=exporter.saved.sha256(target)))
                result = dict(schema="mini.foundation-local-static-lufs-comparison.v1", status="ready", seconds=seconds,
                              no_compression_AGC_EQ_pitch_time_edits=True, outputs=outputs)
                (destination / "comparison.json").write_text(json.dumps(result))
                return result
            # Model a fresh standalone exporter despite whole-suite neighbours
            # importing Torch; the production no-Torch guard stays unchanged.
            with patch.dict(exporter.sys.modules), patch.object(exporter.saved, "PRIVATE_ROOT", root):
                exporter.sys.modules.pop("torch", None)
                result = exporter.export(path, parent, root / "export", compare_fn=fake_compare)
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][1], 4.8)
            self.assertEqual([row["label"] for row in result["outputs"]], list(exporter.LABELS))
            self.assertTrue(result["reference_envelope_used"])
            self.assertTrue(result["output_AGC"])
            self.assertFalse(result["ML_training"])
            self.assertFalse(result["new_score_or_music"])
            self.assertFalse(result["original_PCM_mixed_into_generated_output"])
            self.assertFalse(result["quality_approved"])
            self.assertEqual(result["preserved_raw_timbre_metrics"], {"synthetic": True})
            for index, item in enumerate(result["generated"], 1):
                with np.load(root / "export" / item["after"]["file"], allow_pickle=False) as archive:
                    self.assertEqual(archive["generated"].tobytes(), expected[index].tobytes())
                with np.load(root / "export" / item["controls"]["file"], allow_pickle=False) as archive:
                    self.assertEqual(archive["desired_level_dbfs"].tobytes(), desired.tobytes())
            for filename, checksum in before_hashes.items():
                self.assertEqual(exporter.saved.sha256(filename), checksum)
            for file in (root / "export").rglob("*"):
                if file.is_file():
                    self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            self.assertLess(exporter.directory_bytes(root / "export"), exporter.MAX_BYTES)

    def test_existing_or_outside_private_output_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            path, parent, _, _ = fixture(root)
            with self.assertRaisesRegex(ValueError, "fresh_absolute"):
                exporter.export(path, parent, root)
            with patch.object(exporter.saved, "PRIVATE_ROOT", root / "raw_trial"):
                with self.assertRaisesRegex(ValueError, "private_export_root"):
                    exporter.export(path, parent, root / "outside")


if __name__ == "__main__":
    unittest.main()
