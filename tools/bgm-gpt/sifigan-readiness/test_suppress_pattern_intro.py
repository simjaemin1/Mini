"""Synthetic lineage/envelope tests; no real data, model, GPU or AAC encoder."""
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
from scipy.io import wavfile

import suppress_pattern_intro as intro
from test_export_note_pattern import fixture as pattern_fixture
from test_build_level_conditioned_trial import FakeGuard


def fixture(root):
    parent, training, pattern, _, arrays, validated = pattern_fixture(root)
    folder = root / "old_listening"
    folder.mkdir()
    reference = arrays["reference"]
    desired = intro.level.extract_curve(reference)
    condition = intro.level.write_npz(folder / "condition.npz", desired_level_dbfs=desired)
    carriers = []
    for name in ("baseline", *intro.VARIANTS):
        raw = arrays["baseline" if name == "baseline" else "generated_" + name]
        wave, controls = intro.level.apply_curve(raw, desired)
        control = intro.level.write_npz(folder / (name + "_controls.npz"), **controls)
        controlled = intro.level.write_npz(folder / (name + "_controlled.npz"), generated=wave)
        native = folder / (name + ".wav")
        intro.saved.write_float_wav(native, wave)
        carriers.append(dict(role=name, raw_PCM_sha256=intro.old.array_hash(raw),
            controlled_PCM_sha256=intro.old.array_hash(wave), controls=control, controlled=controlled,
            native_wav=dict(path=str(native), sha256=intro.saved.sha256(native))))
    report = dict(schema="mini.sifigan-four-note-pattern-audition.v1",
        status="four_note_pattern_auditions_ready_not_perceptually_approved", phase="complete", inputs_unchanged=True,
        pattern_report_path=str(pattern), pattern_report_sha256=intro.saved.sha256(pattern),
        training_report_path=str(training), completed_training_steps=3000, case="deepvib48",
        checkpoints=validated[3], variants=list(intro.VARIANTS), source_envelope_used=True,
        amplitude_condition_NOT_learned=True, AGC=True, reference_PCM_sha256=intro.old.array_hash(reference),
        input_bindings={str(pattern): intro.saved.sha256(pattern), str(training): intro.saved.sha256(training)},
        condition=condition, carriers=carriers)
    for key in ("training", "model_loaded_or_run", "source_PCM_mixed_into_output", "new_score_or_music",
                "noise_reduction", "denoising_EQ", "waveform_pitch_shift", "quality_approved", "perceptually_approved"):
        report[key] = False
    path = folder / "export_report.json"
    path.write_text(json.dumps(report))
    return parent, training, pattern, path, report, arrays, validated


def fake_diag(_wave):
    pitch = np.full(960, 250, np.float32)
    pitch[:139] = 0
    return dict(yin_hz=pitch, periodicity=np.full(960, .99, np.float32), rms_db=np.full(960, -30, np.float32))


class IntroRestTests(unittest.TestCase):
    def test_exact_shared_envelope_zero_unity_endpoints_and_quintic(self):
        gain = intro.rest_envelope()
        self.assertEqual(gain.dtype, np.float64)
        self.assertEqual(gain.shape, (115200,))
        self.assertTrue(np.all(gain[:13081] == 0))
        self.assertTrue(np.all(gain[13800:] == 1))
        self.assertEqual(gain[13440], .5)
        u = np.arange(721, dtype=np.float64) / 720
        np.testing.assert_array_equal(gain[13080:13801], 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5)
        self.assertTrue(np.isfinite(gain).all())
        self.assertTrue(np.all(np.diff(gain) >= 0))
        self.assertGreaterEqual(float(gain.min()), 0)
        self.assertLessEqual(float(gain.max()), 1)

    def test_only_leading_gain_applied_post575ms_byte_exact_and_input_untouched(self):
        before = np.random.default_rng(18).normal(0, .01, intro.SAMPLES).astype(np.float32)
        before[20000] = np.float32(-0.)
        original = before.tobytes()
        after, gain = intro.apply_rest(before)
        self.assertEqual(before.tobytes(), original)
        self.assertEqual(after[13800:].tobytes(), before[13800:].tobytes())
        self.assertTrue(np.all(after[:13081] == 0))
        expected = (before.astype(np.float64) * gain).astype(np.float32)
        np.testing.assert_array_equal(after, expected)
        self.assertFalse(np.shares_memory(before, after))

    def test_invalid_wave_and_finite_interval_floor_not_artifact_claim(self):
        for wave in (np.zeros(10, np.float32), np.zeros(intro.SAMPLES, np.float64), np.full(intro.SAMPLES, np.nan, np.float32)):
            with self.assertRaises(ValueError): intro.apply_rest(wave)
        rows = intro.intervals(np.zeros(intro.SAMPLES, np.float32))
        self.assertEqual([(r["start_sample"], r["end_sample"]) for r in rows], list(intro.REGIONS))
        for row in rows:
            self.assertEqual(row["rms_dbfs"], -240)
            self.assertEqual(row["peak_dbfs"], -240)
            self.assertTrue(row["quieter_is_not_proof_of_artifact_removal"])

    def test_valid_old_controller_native_condition_and_arrays_recomputed(self):
        with tempfile.TemporaryDirectory() as directory:
            parent, training, pattern, export, _, arrays, validated = fixture(Path(directory).resolve())
            with patch.object(intro.old.extended, "validate_inputs", return_value=validated):
                report, item, selected, bindings, _ = intro.validate_inputs(parent, training, pattern, export)
            self.assertEqual(set(selected), set(intro.VARIANTS))
            self.assertIn(str(export), bindings)
            for variant in intro.VARIANTS:
                expected = intro.level.apply_curve(arrays["generated_" + variant], intro.level.extract_curve(arrays["reference"]))[0]
                self.assertEqual(selected[variant]["before"].tobytes(), expected.tobytes())

    def test_rehashed_old_controlled_native_control_or_condition_tamper_rejected(self):
        for target in ("controlled", "native_wav", "controls", "condition"):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as directory:
                parent, training, pattern, export, report, _, validated = fixture(Path(directory).resolve())
                record = report["condition"] if target == "condition" else report["carriers"][1][target]
                path = Path(record["path"]) if target == "native_wav" else export.parent / record["file"]
                if target == "native_wav":
                    rate, wave = wavfile.read(path)
                    wave[50000] += .001
                    wavfile.write(path, rate, wave)
                else:
                    with np.load(path, allow_pickle=False) as archive:
                        values = {k: archive[k].copy() for k in archive.files}
                    next(iter(values.values())).flat[0] += .001
                    np.savez_compressed(path, **values)
                record["sha256"] = intro.saved.sha256(path)
                export.write_text(json.dumps(report))
                with patch.object(intro.old.extended, "validate_inputs", return_value=validated), self.assertRaises(ValueError):
                    intro.validate_inputs(parent, training, pattern, export)

    def test_incomplete_wrong_lineage_or_approval_old_report_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            parent, training, pattern, export, base, _, validated = fixture(Path(directory).resolve())
            for key, value in (("phase", "started"), ("pattern_report_sha256", "wrong"), ("checkpoints", {}),
                    ("source_PCM_mixed_into_output", True), ("model_loaded_or_run", True), ("quality_approved", True), ("AGC", False)):
                export.write_text(json.dumps({**base, key: value}))
                with self.subTest(key=key), patch.object(intro.old.extended, "validate_inputs", return_value=validated), self.assertRaises(ValueError):
                    intro.validate_inputs(parent, training, pattern, export)

    def test821_source_fixed_arrays_identical_and_changed_or_wrong_mask_fails(self):
        reference, before, after = [np.zeros(intro.SAMPLES, np.float32) for _ in range(3)]
        diag = fake_diag(reference)
        with patch.object(intro.level.prepare_corpus, "diagnostics", side_effect=[diag, diag, diag]):
            result = intro.source_fixed_check(reference, before, after)
        self.assertEqual(result["source_support_frames"], 821)
        self.assertTrue(result["before_after_arrays_byte_exact_on_source_mask"])
        changed = {k: v.copy() for k, v in diag.items()}
        changed["yin_hz"][150] += .1
        with patch.object(intro.level.prepare_corpus, "diagnostics", side_effect=[diag, diag, changed]), self.assertRaisesRegex(ValueError, "changed"):
            intro.source_fixed_check(reference, before, after)
        wrong = {k: v.copy() for k, v in diag.items()}
        wrong["yin_hz"][150] = 0
        with self.assertRaisesRegex(ValueError, "821"):
            intro.source_fixed_check(reference, before, after, wrong)

    def test_two_new_copies_only_export_private_files_bound_unchanged_and_capped(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            parent, training, pattern, export, _, arrays, validated = fixture(root)
            fresh = root / "fresh"
            fresh.mkdir()
            calls = []
            def compare(items, output, seconds):
                calls.append((items, seconds))
                output.mkdir(mode=0o700)
                outputs = []
                for index, (variant, item) in enumerate(zip(intro.VARIANTS, items), 1):
                    label, path = item.split("=", 1)
                    rate, pcm = wavfile.read(path)
                    old_pcm = intro.level.apply_curve(arrays["generated_" + variant], intro.level.extract_curve(arrays["reference"]))[0]
                    expected, _ = intro.apply_rest(old_pcm)
                    self.assertEqual(rate, 24000)
                    self.assertEqual(pcm.tobytes(), expected.tobytes())
                    self.assertIn("NEW_REST_COPY", label)
                    encoded = output / (str(index) + ".m4a")
                    encoded.write_bytes(b"synthetic encoder stub, not actual audio")
                    outputs.append(dict(label=label, file=encoded.name, sha256=intro.saved.sha256(encoded)))
                report = dict(schema="mini.foundation-local-static-lufs-comparison.v1", status="ready", seconds=4.8,
                    no_compression_AGC_EQ_pitch_time_edits=True, outputs=outputs)
                (output / "comparison.json").write_text(json.dumps(report))
                return report
            with patch.object(intro.old.extended, "validate_inputs", return_value=validated), \
                    patch.object(intro, "PRIVATE_ROOT", root), patch.object(intro.level, "ResourceGuard", FakeGuard), \
                    patch.object(intro.level.prepare_corpus, "diagnostics", side_effect=fake_diag), \
                    patch.object(intro.shutil, "disk_usage", return_value=SimpleNamespace(free=100 * intro.GIB)):
                report = intro.build(parent, training, pattern, export, fresh / "copies", compare)
            self.assertEqual(len(calls), 1)
            self.assertEqual([row["role"] for row in report["outputs"]], ["0ms", "20ms"])
            for key in ("ML", "training", "model_loaded_or_run", "weights_written", "denoising", "source_PCM_mixed_into_output", "quality_approved"):
                self.assertIs(report[key], False)
            for key in ("sourcecurveused", "rest_authored", "hard_mute", "fade", "inputs_unchanged"):
                self.assertIs(report[key], True)
            for row in report["carriers"]:
                self.assertTrue(row["post575ms_byte_exact"])
                for key in ("before", "after"):
                    path = fresh / "copies" / row[key]["file"]
                    self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            for path, checksum in report["input_bindings"].items():
                self.assertEqual(intro.saved.sha256(path), checksum)
            with patch.object(intro, "MAX_BYTES", 1), self.assertRaisesRegex(RuntimeError, "20MB"):
                intro.capacity(fresh / "copies")
            with patch.object(intro.shutil, "disk_usage", return_value=SimpleNamespace(free=0)), self.assertRaisesRegex(RuntimeError, "12GiB"):
                intro.capacity(fresh / "copies")
            with patch.object(intro, "PRIVATE_ROOT", root), self.assertRaisesRegex(ValueError, "fresh"):
                intro.build(parent, training, pattern, export, fresh / "copies", compare)


if __name__ == "__main__":
    unittest.main()
