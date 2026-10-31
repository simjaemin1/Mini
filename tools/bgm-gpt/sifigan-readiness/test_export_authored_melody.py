"""Synthetic-only authored-score exporter tests: no model or AAC encoder."""
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
from scipy.io import wavfile

import export_authored_melody as exporter
from test_build_level_conditioned_trial import FakeGuard


def fixture(root):
    raw = root / "raw"
    raw.mkdir()
    training = root / "training.json"
    training.write_text('{"synthetic":true}')
    score = root / "score.json"
    score.write_text('{"synthetic_score":true}')
    stats = root / "stats.npz"
    np.savez_compressed(stats, mean=np.zeros(43), scale=np.ones(43))
    gatefile = root / "gate.json"
    gatefile.write_text(json.dumps(dict(stats_file=stats.name, stats_sha256=exporter.saved.sha256(stats))))
    events, sounding, steady = [], np.zeros(3840, bool), np.zeros(3840, bool)
    noteindex = np.full(3840, -1, np.int16)
    gate, number = np.ones(460800, np.float64), 0
    for i in range(32):
        a, b, rest = i * 120, (i + 1) * 120, i % 8 == 7
        events.append(dict(index=i, rest=rest, note_index=-1 if rest else number,
            start_frame=a, end_frame=b, start_sample=a * 120, end_sample=b * 120,
            original_midi=None if rest else 72, transposed_midi=None if rest else 60,
            articulation="breath_rest" if rest else "breath_start" if i % 8 == 0 else "slur"))
        if rest:
            gate[a * 120:b * 120] = 0
        else:
            sounding[a:b], steady[a + 16:b - 16], noteindex[a:b] = True, True, number
            if i % 8 == 0:
                u = np.arange(961, dtype=np.float64) / 960
                gate[a * 120:a * 120 + 961] = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5
            number += 1
    controls = dict(gate=gate, center_hz=np.full(3840, 261.625565, np.float64),
        sounding_mask=sounding, rest_mask=~sounding, steady_mask=steady,
        template_index_map=((np.arange(3840) + 16) % 960 + 240).astype(np.int64),
        borrowed_microcurve_cents=np.zeros(3840, np.float64),
        features=np.zeros((3840, 43), np.float32), normalized_features=np.zeros((3840, 43), np.float32),
        note_index=noteindex)
    for index, variant in enumerate(exporter.VARIANTS):
        controls["target_hz_" + variant] = np.full(3840, 261.625565 + index * 2, np.float32)
        controls["microcurve_envelope_" + variant] = np.full(3840, float(index == 0), np.float64)
    controlfile = raw / "controls.npz"
    np.savez_compressed(controlfile, **controls)
    reference = np.zeros(115200, np.float32)
    baseline = np.zeros(115200, np.float32)
    baselinefile = raw / "baseline.npz"
    np.savez_compressed(baselinefile, reference=reference, generated=baseline)
    corpus = root / "corpus.npz"
    np.savez_compressed(corpus, cf0=np.full(1200, 270., np.float32), features=np.zeros((1200, 43), np.float32))
    checkpoints = {"extended": {"synthetic": True}}
    report = dict(schema="mini.sifigan-authored-melody.v1",
        status="authored_melody_raw_rendered_not_perceptually_approved", phase="complete", completed_steps=3000,
        baseline_reproduced=True, forward_calls=3, inputs_unchanged=True, frames=3840, samples=460800,
        sample_rate=24000, hop_size=120, variants=list(exporter.VARIANTS), checkpoints=checkpoints,
        authored_eight_bar_score_render=True, score_path=str(score), score_sha256=exporter.saved.sha256(score),
        input_bindings={str(training): exporter.saved.sha256(training)}, score_events=events,
        controls=dict(file=controlfile.name, sha256=exporter.saved.sha256(controlfile),
            array_sha256={key: exporter.array_hash(value) for key, value in controls.items()}),
        baseline=dict(file=baselinefile.name, sha256=exporter.saved.sha256(baselinefile), baseline_byte_exact=True), rawfiles=[])
    for flag in ("training", "weights_written", "output_postprocessing", "authored_gate_applied_to_raw",
                 "source_PCM_mixed_into_output", "quality_approved", "new_learned_performance"):
        report[flag] = False
    waves = {}
    for variant in exporter.VARIANTS:
        phase = np.cumsum(np.repeat(controls["target_hz_" + variant].astype(np.float64), 120)) / 24000
        wave = (.02 * np.sin(2 * np.pi * phase)).astype(np.float32)
        waves[variant] = wave
        path = raw / (variant + ".wav")
        exporter.write_wave(path, wave)
        report["rawfiles"].append(dict(variant=variant, file=path.name, sha256=exporter.saved.sha256(path), PCM_sha256=exporter.array_hash(wave)))
    path = raw / "report.json"
    path.write_text(json.dumps(report))
    validated = (dict(completed_steps=3000, data_gate=str(gatefile)),
        [dict(case="deepvib48", reference=reference, generated=baseline, corpus_npz_path=str(corpus))],
        {str(gatefile): exporter.saved.sha256(gatefile)}, checkpoints)
    fake = SimpleNamespace(build_controls=lambda *_: (controls, events))
    return root / "unused_parent.json", training, path, report, controls, waves, validated, fake


class AuthoredMelodyExportTests(unittest.TestCase):
    def test_fixed_score_denominator_keeps_candidate_missing_frames(self):
        mask = np.ones(3840, bool)
        diag = dict(yin_hz=np.full(3840, 250., np.float32), periodicity=np.ones(3840), rms_db=np.full(3840, -40.))
        diag["yin_hz"][:100] = 0
        result = exporter._pitch_scope(diag, np.full(3840, 250.), mask)
        self.assertEqual(result["fixed_score_frames"], 3840)
        self.assertEqual(result["measured_confident_frames"], 3740)
        self.assertEqual(result["missing_frames"], 100)
        self.assertEqual(result["near50c_fraction_fixed_score"], 3740 / 3840)

    def test_exact_bound_controls_baseline_and_native_raw_files(self):
        with tempfile.TemporaryDirectory() as directory:
            parent, training, path, _, controls, waves, validated, fake = fixture(Path(directory).resolve())
            with patch.object(exporter.extended, "validate_inputs", return_value=validated), \
                    patch.object(exporter.importlib, "import_module", return_value=fake):
                _, actual, events, raw, bindings, _ = exporter.validate_inputs(parent, training, path)
            self.assertEqual(len(events), 32)
            self.assertIn(str(path), bindings)
            for key, value in controls.items():
                self.assertEqual(actual[key].tobytes(), value.tobytes())
            for variant, wave in waves.items():
                self.assertEqual(wave.tobytes(), raw[variant].tobytes())

    def test_incomplete_processed_mixed_or_wrong_model_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            parent, training, path, report, _, _, validated, fake = fixture(Path(directory).resolve())
            with patch.object(exporter.extended, "validate_inputs", return_value=validated), \
                    patch.object(exporter.importlib, "import_module", return_value=fake):
                for key, value in (("status", "started"), ("completed_steps", 2999), ("forward_calls", 2),
                        ("training", True), ("authored_gate_applied_to_raw", True), ("quality_approved", True),
                        ("source_PCM_mixed_into_output", True), ("inputs_unchanged", False)):
                    path.write_text(json.dumps({**report, key: value}))
                    with self.subTest(key=key), self.assertRaises(ValueError):
                        exporter.validate_inputs(parent, training, path)

    def test_rehashed_mask_target_gate_feature_and_baseline_tamper_rejected(self):
        for key in ("sounding_mask", "target_hz_all_microcurve", "gate", "features", "normalized_features"):
            with self.subTest(key=key), tempfile.TemporaryDirectory() as directory:
                parent, training, path, report, controls, _, validated, fake = fixture(Path(directory).resolve())
                changed = {name: value.copy() for name, value in controls.items()}
                if changed[key].dtype == bool:
                    changed[key][0] = False
                else:
                    changed[key].flat[0] += .1
                controlpath = path.parent / report["controls"]["file"]
                np.savez_compressed(controlpath, **changed)
                report["controls"]["sha256"] = exporter.saved.sha256(controlpath)
                report["controls"]["array_sha256"][key] = exporter.array_hash(changed[key])
                path.write_text(json.dumps(report))
                with patch.object(exporter.extended, "validate_inputs", return_value=validated), \
                        patch.object(exporter.importlib, "import_module", return_value=fake), self.assertRaises(ValueError):
                    exporter.validate_inputs(parent, training, path)

    def test_capacity_and_native_wave_shape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "out"
            output.mkdir()
            with patch.object(exporter, "MAX_BYTES", 1), self.assertRaisesRegex(RuntimeError, "50MB"):
                exporter.capacity(output, 2)
            with patch.object(exporter.shutil, "disk_usage", return_value=SimpleNamespace(free=0)), \
                    self.assertRaisesRegex(RuntimeError, "12GiB"):
                exporter.capacity(output)
        for wave in (np.zeros(115200, np.float32), np.zeros(460800, np.float64), np.full(460800, np.nan, np.float32)):
            with self.assertRaises(ValueError):
                exporter.finite_wave(wave)

    def test_two_new19p2_outputs_constant_level_then_score_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            parent, training, path, _, controls, rawwaves, validated, fake = fixture(root)
            calls = []
            def fake_compare(items, destination, seconds):
                self.assertEqual(seconds, 19.2)
                destination.mkdir(mode=0o700)
                rows = []
                for index, (variant, item) in enumerate(zip(exporter.VARIANTS, items), 1):
                    label, source = item.split("=", 1)
                    rate, wave = wavfile.read(source)
                    expected = exporter.level.apply_curve(rawwaves[variant], np.full(3840, -40.))[0]
                    expected = (expected.astype(np.float64) * controls["gate"]).astype(np.float32)
                    expected[controls["gate"] == 0] = 0
                    self.assertEqual(rate, 24000)
                    self.assertEqual(wave.tobytes(), expected.tobytes())
                    self.assertTrue(np.any(wave[:12000] != 0), "old575ms cut must not consume first score note")
                    self.assertIn("NEW_AUTHORED_8BARS", label)
                    file = destination / (str(index) + ".m4a")
                    file.write_bytes(b"synthetic encoder stub; not actual audio")
                    rows.append(dict(label=label, file=file.name, sha256=exporter.saved.sha256(file)))
                result = dict(schema="mini.foundation-local-static-lufs-comparison.v1", status="ready", seconds=seconds,
                    no_compression_AGC_EQ_pitch_time_edits=True, outputs=rows)
                (destination / "comparison.json").write_text(json.dumps(result))
                calls.append(True)
                return result
            def fake_decode(path, events):
                self.assertEqual(len(events), 32)
                return dict(synthetic_no_encoder=True, decoded_frames=921600)
            with patch.object(exporter.extended, "validate_inputs", return_value=validated), \
                    patch.object(exporter.importlib, "import_module", return_value=fake), \
                    patch.object(exporter, "PRODUCER", Path(exporter.__file__)), \
                    patch.object(exporter, "PRIVATE_ROOT", root), \
                    patch.object(exporter.level, "ResourceGuard", FakeGuard), \
                    patch.object(exporter.shutil, "disk_usage", return_value=SimpleNamespace(free=100 * 1024 ** 3)):
                result = exporter.export(parent, training, path, root / "listening", fake_compare, fake_decode)
            self.assertEqual(len(calls), 1)
            self.assertEqual(len(result["outputs"]), 2)
            self.assertFalse(result["training"])
            self.assertFalse(result["source_reference_RMS_curve_used"])
            self.assertFalse(result["old575ms_cut_used"])
            self.assertFalse(result["model_loaded_or_run"])
            for row in result["carriers"]:
                self.assertFalse(row["diagnostics"]["source821_mask_used"])
                self.assertEqual(len(row["diagnostics"]["per_note"]), 28)
                self.assertTrue(all(rest["exact_zero"] for rest in row["diagnostics"]["native_rests"]))
                self.assertTrue(any(not rest["exact_zero"] for rest in row["raw_score_diagnostics"]["native_rests"]))
                self.assertEqual(row["diagnostics"]["all_sounding"]["fixed_score_frames"],
                    row["diagnostics"]["steady"]["fixed_score_frames"] + row["diagnostics"]["boundary"]["fixed_score_frames"])
                self.assertEqual(Path(row["native_wav"]["path"]).stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
