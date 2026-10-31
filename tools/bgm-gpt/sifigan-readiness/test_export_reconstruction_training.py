"""Synthetic continuation/export tests; no actual training, Torch, GPU or AAC."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
from scipy.io import wavfile

import export_reconstruction_training as exporter
from test_export_extended_training import extension_fixture
from test_build_level_conditioned_trial import FakeGuard


def save_json(path, value):
    path.write_text(json.dumps(value))


def fixture(root, *, full=True, done=6000, requested=3000):
    ancestor_path, parent_path, parent, originals, old_arrays = extension_fixture(root)
    states = {key: str(i + 1) * 64 for i, key in enumerate(exporter.STATE_KEYS)}
    config = dict(seed=20261025, batch_size=1, frames=160, generator_config={"synthetic": 1},
        discriminator_config={"synthetic": 2}, mel_config={"synthetic": 3}, residual_config={"synthetic": 4},
        fit_groups=27, fit_windows=100, evaluation_windows=[{"split": "fit", "start_frame": 0}],
        upstream_bindings={"synthetic-official-file": "f" * 64}, source_credit=exporter.saved.CREDIT,
        final={"fit": {"windows": 27, "mean_logmel_l1": 1.5}, "heldout": {"windows": 15, "mean_logmel_l1": 1.7}})
    parent.update(config, completed_steps=3000, additional_completed_steps=2000,
        full_checkpoint_zip_crc_verified=True, full_checkpoint_typed_state_sha256="a" * 64,
        final_numeric_state_sha256=states)
    save_json(parent_path, parent)
    folder = root / "new-training"
    folder.mkdir()
    report = dict(config, schema="mini.sifigan-reconstruction-continuation.v1",
        status=exporter.FULL_STATUS if full else exporter.G_ONLY_STATUS, phase="complete",
        parent_report=str(parent_path), parent_checkpoint=str(parent_path.parent / parent["checkpoint_file"]),
        parent_completed_steps=3000, completed_steps=done, additional_completed_steps=done - 3000,
        requested_additional_steps=requested, unchanged_training_recipe=True, parent_all_inputs_preserved=True,
        parent_final_baseline_reproduced=True, parent_reconstructions_byte_exact=True,
        full_resume_available=full, restored_numeric_state_sha256=states, data_gate=parent["data_gate"],
        input_bindings={**parent["input_bindings"], str(parent_path): exporter.saved.sha256(parent_path)},
        generator_snapshots=[], baseline_reconstructions=[], reconstructions=[], baseline=config["final"])
    report["input_bindings"][report["parent_checkpoint"]] = parent["checkpoint_sha256"]
    report.update({key: False for key in exporter.FALSE_FLAGS})
    if done - 3000 < requested:
        report["soft_stop_reason"] = "synthetic_time_reserve"
    for step in sorted(set(([4500] if done > 4500 else []) + [done])):
        path = folder / f"generator_step_{step:06d}.pt"
        path.write_bytes(b"synthetic generator fixture, never loaded " + str(step).encode())
        report["generator_snapshots"].append(dict(file=path.name, sha256=exporter.saved.sha256(path), bytes=path.stat().st_size,
            completed_steps=step, optimizer_resume=False, zip_crc_verified=True))
    last = report["generator_snapshots"][-1]
    for target, source in (("file", "file"), ("sha256", "sha256"), ("bytes", "bytes")):
        report["inference_checkpoint_" + target] = last[source]
    if full:
        path = folder / "final_full_resume.pt"
        path.write_bytes(b"synthetic full checkpoint fixture, never loaded")
        report.update(checkpoint_file=path.name, checkpoint_sha256=exporter.saved.sha256(path), checkpoint_bytes=path.stat().st_size,
            full_checkpoint_zip_crc_verified=True, full_checkpoint_numeric_roundtrip_verified=True,
            full_checkpoint_typed_state_sha256="b" * 64, final_numeric_state_sha256={key: "e" * 64 for key in states},
            final_generator_matches_full_state=True)
    else:
        report["full_checkpoint_skip_reason"] = "synthetic disk-reserve stop; G only"
    new_arrays = {}
    for case in exporter.saved.CASES:
        reference, old = originals[case][0], old_arrays[case]
        new_arrays[case] = (old * .98 - .0001).astype(np.float32)
        for key, label, wave in (("baseline_reconstructions", "baseline", old), ("reconstructions", "final", new_arrays[case])):
            path = folder / (label + "_" + case + "_reconstruction.npz")
            np.savez_compressed(path, reference=reference, generated=wave)
            report[key].append(dict(case=case, file=path.name, sha256=exporter.saved.sha256(path),
                metrics={"synthetic": 1}, level_metrics={"synthetic_level": 2}, perceptually_approved=False))
    path = folder / "report.json"
    save_json(path, report)
    return parent_path, path, report, originals, old_arrays, new_arrays


class ReconstructionExportTests(unittest.TestCase):
    def test_full_and_honest_early_generator_only_keep_actual_steps(self):
        for full, done in ((True, 6000), (True, 5875), (False, 5990)):
            with self.subTest(full=full, done=done), tempfile.TemporaryDirectory() as folder:
                parent, path, report, originals, old, new = fixture(Path(folder).resolve(), full=full, done=done)
                _, result, selected, bindings, checkpoints = exporter.validate_inputs(parent, path)
                self.assertEqual(result["completed_steps"], done)
                self.assertIs(result["full_resume_available"], full)
                self.assertEqual(len(checkpoints["new_continuation"]), 3 if full else 2)
                for item in selected:
                    case = item["case"]
                    self.assertEqual(item["reference"].tobytes(), originals[case][0].tobytes())
                    self.assertEqual(item["old_generated"].tobytes(), old[case].tobytes())
                    self.assertEqual(item["new_generated"].tobytes(), new[case].tobytes())
                    self.assertIn(item["baseline_raw_path"], bindings)

    def test_incomplete_steps_recipe_numeric_claims_and_false_flags_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            parent, path, original, *_ = fixture(Path(folder).resolve())
            changes = [("status", "failed"), ("phase", "training"), ("completed_steps", 3000), ("completed_steps", 6001),
                ("completed_steps", True), ("additional_completed_steps", 2999), ("requested_additional_steps", 2999),
                ("parent_reconstructions_byte_exact", False), ("parent_all_inputs_preserved", False),
                ("unchanged_training_recipe", False), ("full_resume_available", False),
                ("full_checkpoint_numeric_roundtrip_verified", False), ("full_checkpoint_zip_crc_verified", False),
                ("final_generator_matches_full_state", False), ("full_checkpoint_typed_state_sha256", "bogus"),
                ("final_numeric_state_sha256", {}), ("restored_numeric_state_sha256", {}),
                ("source_credit", "wrong"), ("upstream_bindings", {}), ("frames", 161)]
            changes.extend((key, True) for key in exporter.FALSE_FLAGS)
            for key, value in changes:
                save_json(path, {**original, key: value})
                with self.subTest(key=key), self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, path)

    def test_early_stop_reason_and_generator_only_claim_honesty(self):
        with tempfile.TemporaryDirectory() as folder:
            parent, path, report, *_ = fixture(Path(folder).resolve(), full=False, done=5875)
            for key, value in (("soft_stop_reason", None), ("full_checkpoint_skip_reason", ""),
                    ("full_checkpoint_numeric_roundtrip_verified", True), ("checkpoint_file", "pretend.pt")):
                save_json(path, {**report, key: value})
                with self.subTest(key=key), self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, path)

    def test_model_baseline_new_original_and_parent_hash_tamper_rejected(self):
        for target in ("generator", "full", "baseline", "new", "original", "parent"):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as folder:
                root = Path(folder).resolve()
                parent, path, report, *_ = fixture(root)
                changed = {"generator": path.parent / report["inference_checkpoint_file"],
                    "full": path.parent / report["checkpoint_file"],
                    "baseline": path.parent / report["baseline_reconstructions"][0]["file"],
                    "new": path.parent / report["reconstructions"][0]["file"],
                    "original": root / "corpus/deepvib48.source-fixture", "parent": parent}[target]
                with changed.open("ab") as handle:
                    handle.write(b"tampered")
                with self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, path)

    def test_rehashed_baseline_wrong_reference_and_generated_dtype_still_rejected(self):
        for target in ("baseline", "reference", "dtype", "extra"):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as folder:
                parent, path, report, originals, old, new = fixture(Path(folder).resolve())
                key = "baseline_reconstructions" if target == "baseline" else "reconstructions"
                row = report[key][0]; case = row["case"]
                reference = originals[case][0].copy()
                wave = old[case].copy() if target == "baseline" else new[case].copy()
                extra = {}
                if target == "baseline":
                    wave[0] += .001
                elif target == "reference":
                    reference[0] = 0.  # Positive zero must not replace original negative zero.
                elif target == "dtype":
                    wave = wave.astype(np.float64)
                else:
                    extra["hidden_control"] = np.array([1])
                archive = path.parent / row["file"]
                np.savez_compressed(archive, reference=reference, generated=wave, **extra)
                row["sha256"] = exporter.saved.sha256(archive)
                save_json(path, report)
                with self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, path)

    def test_snapshot_duplicates_wrong_steps_size_and_unsafe_paths_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            parent, path, base, *_ = fixture(Path(folder).resolve())
            for kind in ("duplicate", "step", "size", "CRC", "final_binding", "unsafe"):
                report = copy.deepcopy(base)
                if kind == "duplicate":
                    report["generator_snapshots"] = [report["generator_snapshots"][-1]] * 2
                elif kind == "step":
                    report["generator_snapshots"][0]["completed_steps"] = 4000
                elif kind == "size":
                    report["generator_snapshots"][-1]["bytes"] += 1
                elif kind == "CRC":
                    report["generator_snapshots"][-1]["zip_crc_verified"] = False
                elif kind == "final_binding":
                    report["inference_checkpoint_file"] = report["generator_snapshots"][0]["file"]
                else:
                    report["reconstructions"][0]["file"] = "../escape.npz"
                save_json(path, report)
                with self.subTest(kind=kind), self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, path)

    def test_parent_must_be_full_verified3000_and_frozen_config(self):
        with tempfile.TemporaryDirectory() as folder:
            parent, path, base, *_ = fixture(Path(folder).resolve())
            original = json.loads(parent.read_text())
            for key, changed in (("completed_steps", 2999), ("full_checkpoint_zip_crc_verified", False),
                    ("full_checkpoint_typed_state_sha256", "bad"), ("final_numeric_state_sha256", {})):
                save_json(parent, {**original, key: changed})
                report = copy.deepcopy(base)
                report["input_bindings"][str(parent)] = exporter.saved.sha256(parent)
                save_json(path, report)
                with self.subTest(key=key), self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, path)

    def test_export_original_old_new_identical_RMS_raw_preserved_and_no_quality_claim(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            parent, path, training, originals, old, new = fixture(root, done=5875)
            calls = []

            def fake_compare(items, destination, seconds):
                calls.append(items)
                destination.mkdir(mode=0o700)
                outputs = []
                case = destination.name
                reference = originals[case][0]
                condition = exporter.level.extract_curve(reference)
                expected = (reference, exporter.level.apply_curve(old[case], condition)[0],
                            exporter.level.apply_curve(new[case], condition)[0])
                for i, (item, wave) in enumerate(zip(items, expected), 1):
                    label, source = item.split("=", 1)
                    rate, actual = wavfile.read(source)
                    self.assertEqual(rate, 24000)
                    self.assertEqual(actual.tobytes(), wave.tobytes())
                    out = destination / f"{i:02}.m4a"
                    out.write_bytes(b"synthetic AAC fixture; no encoder")
                    outputs.append(dict(label=label, file=out.name, sha256=exporter.saved.sha256(out),
                        source_path=source, source_sha256=exporter.saved.sha256(source),
                        programme_frames=230400, decoded_frames=230400,
                        decoded={"integrated_lufs": -24., "true_peak_dbfs": -3.}))
                result = dict(schema="mini.foundation-local-static-lufs-comparison.v1", status="ready", seconds=seconds,
                    sample_rate_hz=48000, channels=2, requested_target_lufs=-24., actual_common_target_lufs=-24.,
                    no_compression_AGC_EQ_pitch_time_edits=True, outputs=outputs)
                save_json(destination / "comparison.json", result)
                return result

            with patch.object(exporter, "PRIVATE_ROOT", root), patch.object(exporter.level, "ResourceGuard", FakeGuard), \
                    patch.object(exporter.shutil, "disk_usage", return_value=SimpleNamespace(free=64 * exporter.GIB)):
                report = exporter.export(parent, path, root / "listening", fake_compare)
            self.assertEqual(len(calls), 2)
            self.assertTrue(all(len(items) == 3 for items in calls))
            self.assertEqual(report["completed_steps"], 5875)
            self.assertTrue(report["stopped_before_requested"])
            self.assertEqual(report["soft_stop_reason"], training["soft_stop_reason"])
            self.assertEqual(report["source_credit"], exporter.saved.CREDIT)
            for key in ("exporter_model_loaded_or_run", "exporter_training", "new_score_or_music", "quality_approved",
                    "perceptually_approved", "heldout_is_blind", "original_dynamic_gain", "source_PCM_mixed_into_output",
                    "hard_mute_or_gate", "EQ_pitch_or_time_edits", "exporter_independently_loaded_or_verified_typed_model_states"):
                self.assertIs(report[key], False)
            for row in report["cases"]:
                self.assertEqual([r["role"] for r in row["outputs"]], ["original_reference", "old3000", "new_candidate"])
                self.assertEqual(row["source_pitch_support_frames"], 0)  # Constant synthetic signal, no cherry-picked mask.
                self.assertEqual(row["candidates"][0]["reference_condition_array_sha256"],
                                 row["candidates"][1]["reference_condition_array_sha256"])
                for candidate in row["candidates"]:
                    raw_copy = root / "listening" / candidate["unchanged_raw_copy"]["file"]
                    self.assertEqual(raw_copy.read_bytes(), Path(candidate["raw_path"]).read_bytes())
                    self.assertEqual(raw_copy.stat().st_mode & 0o777, 0o600)
                    self.assertEqual(set(candidate["raw_diagnostics"]), {"pitch", "level", "spectral"})
                    self.assertEqual(set(candidate["conditioned_diagnostics"]), {"pitch", "level", "spectral"})
            self.assertLess(sum(p.stat().st_size for p in (root / "listening").rglob("*") if p.is_file()), exporter.MAX_BYTES)
            self.assertEqual((root / "listening/export_report.json").stat().st_mode & 0o777, 0o600)
            with self.assertRaisesRegex(ValueError, "fresh_same_private"):
                exporter.export(parent, path, root / "listening", fake_compare)

    def test_static_comparison_rejects_processing_level_duration_and_role_mismatch(self):
        labels = ("original", "old3000", "newActual")
        base = dict(schema="mini.foundation-local-static-lufs-comparison.v1", status="ready", seconds=4.8,
            sample_rate_hz=48000, channels=2, requested_target_lufs=-24., actual_common_target_lufs=-24.,
            no_compression_AGC_EQ_pitch_time_edits=True,
            outputs=[dict(label=label, programme_frames=230400, decoded_frames=230400,
                decoded={"integrated_lufs": -24., "true_peak_dbfs": -2.}) for label in labels])
        exporter.validate_comparison(base, labels)
        for key, value in (("channels", 1), ("sample_rate_hz", 24000), ("seconds", 5.),
                ("no_compression_AGC_EQ_pitch_time_edits", False), ("actual_common_target_lufs", -23.),
                ("requested_target_lufs", -20.)):
            with self.subTest(key=key), self.assertRaises(ValueError):
                exporter.validate_comparison({**base, key: value}, labels)
        for key, value in (("label", "wrong"), ("programme_frames", 230401), ("decoded_frames", 232000),
                ("decoded", {"integrated_lufs": -25., "true_peak_dbfs": -2.}),
                ("decoded", {"integrated_lufs": -24., "true_peak_dbfs": 0.})):
            changed = copy.deepcopy(base)
            changed["outputs"][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                exporter.validate_comparison(changed, labels)

    def test_export_cap_does_not_count_separately_bounded_training_checkpoints(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            train, out = root / "train", root / "listening"
            train.mkdir(); out.mkdir()
            (train / "model.fixture").write_bytes(b"x" * 200)
            (out / "audio.fixture").write_bytes(b"x" * 20)
            with patch.object(exporter, "MAX_BYTES", 100), \
                    patch.object(exporter.shutil, "disk_usage", return_value=SimpleNamespace(free=64 * exporter.GIB)):
                self.assertEqual(exporter.capacity(out, 80), 20)
                with self.assertRaisesRegex(RuntimeError, "export_only20MB"):
                    exporter.capacity(out, 81)

    def test_fresh_import_does_not_import_torch(self):
        environment = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONPATH=str(Path(__file__).parent))
        result = subprocess.run([sys.executable, "-B", "-c",
            "import sys; import export_reconstruction_training; assert 'torch' not in sys.modules"],
            env=environment, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
