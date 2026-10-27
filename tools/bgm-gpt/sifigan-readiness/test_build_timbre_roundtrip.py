"""Synthetic-only full-context, inversion, lineage and WORLD-branch tests."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

import build_timbre_roundtrip as trial


class FakeWorld:
    __version__ = "synthetic-only"

    def __init__(self):
        self.calls, self.synthesis_calls = [], []

    def harvest(self, wave, rate, **kwargs):
        self.calls.append(("harvest", len(wave), rate, kwargs))
        n = len(wave) // 120 + 1
        f0 = np.full(n, 220., np.float64)
        f0[:2] = 0.
        return f0, np.arange(n) * .005

    def cheaptrick(self, wave, f0, times, rate, **kwargs):
        self.calls.append(("cheaptrick", len(wave), rate, kwargs))
        return np.full((len(f0), 1025), 2., np.float64)

    def d4c(self, wave, f0, times, rate, **kwargs):
        self.calls.append(("d4c", len(wave), rate, kwargs))
        return np.full((len(f0), 1025), .25, np.float64)

    def code_aperiodicity(self, ap, rate):
        self.calls.append(("code_aperiodicity", ap.shape, rate))
        return np.full((len(ap), 3), -12., np.float64)

    def decode_aperiodicity(self, bap, rate, fft_size):
        self.calls.append(("decode_aperiodicity", bap.copy(), rate, fft_size))
        return np.full((len(bap), 1025), .5, np.float64)

    def synthesize(self, f0, sp, ap, rate, **kwargs):
        self.synthesis_calls.append((f0, sp, ap, rate, kwargs))
        return np.full(trial.SAMPLES, sp[0, 0] * .001 + ap[0, 0] * .001, np.float64)


class FakeSptk:
    __version__ = "synthetic-only"

    def __init__(self):
        self.calls = []

    def sp2mc(self, sp, **kwargs):
        self.calls.append(("sp2mc", sp.shape, kwargs))
        return np.full((len(sp), 40), .123456789, np.float64)

    def mc2sp(self, mcep, **kwargs):
        self.calls.append(("mc2sp", mcep.copy(), kwargs))
        return np.full((len(mcep), 1025), 4., np.float64)


class FakeGuard:
    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def snapshot(self):
        return {"synthetic_fixture": True}


class TimbreRoundtripTests(unittest.TestCase):
    def analysis(self):
        wave = np.linspace(-.02, .03, trial.SAMPLES + 120 + 23, dtype=np.float64)
        wave[0] = -0.
        world, sptk = FakeWorld(), FakeSptk()
        controls, facts = trial.analyse_full(wave, world, sptk)
        return wave, controls, facts, world, sptk

    def test_entire_source_context_is_analysed_before_prefix_and_exact_tail_trim(self):
        wave, controls, facts, world, sptk = self.analysis()
        self.assertEqual(world.calls[0], ("harvest", len(wave) - 23, 24000,
            dict(f0_floor=70., f0_ceil=1800., frame_period=5.)))
        self.assertEqual(world.calls[1][3], dict(fft_size=2048))
        self.assertEqual(world.calls[2][3], dict(threshold=.85, fft_size=2048))
        self.assertEqual(sptk.calls[0][2], dict(order=39, alpha=.466))
        self.assertEqual(facts["trimmed_tail_samples"], 23)
        self.assertEqual(facts["endpoint_frames_trimmed"], 1)
        self.assertEqual(facts["analysed_full_source_frames"], 961)
        self.assertEqual(controls["full_sp"].shape, (960, 1025))
        self.assertEqual(controls["full_ap"].shape, (960, 1025))
        self.assertEqual(controls["raw_harvest_f0"].dtype, np.float64)
        self.assertEqual(controls["analysed_features"].dtype, np.float32)
        self.assertEqual(controls["analysed_waveform_prefix"].tobytes(), wave[:trial.SAMPLES].astype(np.float32).tobytes())

    def test_saved_conditioning_must_match_bitwise_not_tolerance(self):
        wave, controls, _, _, _ = self.analysis()
        f0, cf0, features = (controls["raw_harvest_f0"].astype(np.float32), controls["analysed_cf0"].copy(),
                             controls["analysed_features"].copy())
        waveform = wave.astype(np.float32)
        reference = waveform[:trial.SAMPLES].copy()
        self.assertTrue(all(trial.verify_conditioning(controls, f0, cf0, features, waveform, reference).values()))
        for field in ("f0", "cf0", "features", "reference_PCM"):
            changed = {"f0": f0.copy(), "cf0": cf0.copy(), "features": features.copy(), "reference_PCM": reference.copy()}
            value = changed[field]
            value.flat[0] = np.nextafter(value.flat[0], np.float32(1.))
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "byte_exact_corpus_mismatch"):
                trial.verify_conditioning(controls, changed["f0"], changed["cf0"], changed["features"], waveform, changed["reference_PCM"])
        positive_zero = reference.copy(); positive_zero[0] = 0.
        with self.assertRaisesRegex(ValueError, "reference_PCM"):
            trial.verify_conditioning(controls, f0, cf0, features, waveform, positive_zero)

    def test_compact_inversion_is_mc2sp_POWER_not_squared_and_uses_WORLD_AP_codec(self):
        _, controls, _, world, sptk = self.analysis()
        features = controls["analysed_features"].copy()
        sp, ap = trial.invert_compact(features, world, sptk)
        np.testing.assert_array_equal(sp, np.full((960, 1025), 4.))
        np.testing.assert_array_equal(ap, np.full((960, 1025), .5))
        call = sptk.calls[-1]
        self.assertEqual(call[0], "mc2sp")
        np.testing.assert_array_equal(call[1], features[:, :40].astype(np.float64))
        self.assertEqual(call[2], dict(alpha=.466, fftlen=2048))
        call = world.calls[-1]
        self.assertEqual(call[0], "decode_aperiodicity")
        np.testing.assert_array_equal(call[1], features[:, 40:].astype(np.float64))
        self.assertEqual(call[2:], (24000, 2048))
        for bad in (features.astype(np.float64), features[:-1], np.full_like(features, np.nan)):
            with self.assertRaisesRegex(ValueError, "saved960x43"):
                trial.invert_compact(bad, world, sptk)

    def test_four_factor_branches_use_the_same_raw_f0_with_zeros(self):
        _, controls, _, world, sptk = self.analysis()
        sp, ap = trial.invert_compact(controls["analysed_features"], world, sptk)
        f0 = controls["raw_harvest_f0"]
        before = f0.tobytes()
        outputs = trial.synthesize_branches(f0, controls["full_sp"], controls["full_ap"], sp, ap, world)
        self.assertEqual(list(outputs), list(trial.BRANCHES))
        expected = ((controls["full_sp"], controls["full_ap"]), (sp, controls["full_ap"]),
                    (controls["full_sp"], ap), (sp, ap))
        for call, (expected_sp, expected_ap), wave in zip(world.synthesis_calls, expected, outputs.values()):
            self.assertIs(call[0], f0)
            self.assertIs(call[1], expected_sp)
            self.assertIs(call[2], expected_ap)
            self.assertEqual(call[3:], (24000, dict(frame_period=5.)))
            self.assertEqual(wave.shape, (115200,))
            self.assertEqual(wave.dtype, np.float32)
        self.assertEqual(f0.tobytes(), before)
        self.assertEqual(np.count_nonzero(f0[:2]), 0)

    def test_synthesis_never_trims_pads_or_accepts_nonfinite(self):
        _, controls, _, world, sptk = self.analysis()
        sp, ap = trial.invert_compact(controls["analysed_features"], world, sptk)
        for bad in (np.zeros(trial.SAMPLES + 1), np.full(trial.SAMPLES, np.nan)):
            with patch.object(world, "synthesize", return_value=bad), self.assertRaisesRegex(ValueError, "without_trim_or_pad"):
                trial.synthesize_branches(controls["raw_harvest_f0"], controls["full_sp"], controls["full_ap"], sp, ap, world)

    def test_synthesis_control_mutation_is_rejected(self):
        _, controls, _, world, sptk = self.analysis()
        sp, ap = trial.invert_compact(controls["analysed_features"], world, sptk)

        def mutating_synthesize(f0, spectrum, aperiodicity, rate, **kwargs):
            f0[10] += 1
            return np.zeros(trial.SAMPLES)

        with patch.object(world, "synthesize", side_effect=mutating_synthesize), self.assertRaisesRegex(ValueError, "mutated_original_control"):
            trial.synthesize_branches(controls["raw_harvest_f0"], controls["full_sp"], controls["full_ap"], sp, ap, world)

    def test_fresh_private_report_saves_only_prefix_controls_and_raw_waves(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            corpus = root / "corpus"; corpus.mkdir()
            parent = root / "parent.json"; parent.write_text("synthetic-only parent")
            selected, rows, controls_by_case = [], [], {}
            bindings = {str(parent): trial.saved.sha256(parent)}
            for case in trial.saved.CASES:
                wave, controls, facts, world, sptk = self.analysis()
                controls_by_case[case] = controls
                original = corpus / (case + ".synthetic"); original.write_bytes(b"synthetic; no audio")
                native = corpus / (case + ".npz")
                np.savez_compressed(native, waveform=wave.astype(np.float32),
                    f0=controls["raw_harvest_f0"].astype(np.float32), cf0=controls["analysed_cf0"],
                    features=controls["analysed_features"])
                reference = controls["analysed_waveform_prefix"].copy()
                reconstruction = root / (case + "_carrier.npz")
                np.savez_compressed(reconstruction, reference=reference, generated=(reference * .5).astype(np.float32))
                for path in (original, native, reconstruction):
                    bindings[str(path)] = trial.saved.sha256(path)
                rows.append(dict(case=case, source_path=str(original), source_duration_seconds=len(wave) / 24000))
                selected.append(dict(case=case, reference=reference, generated=(reference * .5).astype(np.float32),
                    corpus_npz_path=str(native), corpus_npz_sha256=trial.saved.sha256(native),
                    original_path=str(original), original_sha256=trial.saved.sha256(original),
                    reconstruction_path=str(reconstruction), reconstruction_sha256=trial.saved.sha256(reconstruction)))
            manifest = corpus / "manifest.json"; manifest.write_text(json.dumps(dict(files=rows)))
            bindings[str(manifest)] = trial.saved.sha256(manifest)
            output = root / "roundtrip"
            # Whole-suite neighbours may import torch. This synthetic fixture
            # models a fresh standalone process; do not weaken the real guard.
            with patch.dict(trial.sys.modules), \
                 patch.object(trial.saved, "PRIVATE_ROOT", root), patch.object(trial, "ResourceGuard", FakeGuard), \
                 patch.object(trial.saved, "validate_inputs", return_value=(dict(input_bindings=bindings.copy()), selected, bindings.copy(), {})), \
                 patch.object(trial.prepare_corpus, "decode", return_value=wave), \
                 patch.object(trial, "analyse_full", side_effect=lambda x: trial_analysis(x)), \
                 patch.object(trial, "invert_compact", side_effect=lambda x: original_invert(x, FakeWorld(), FakeSptk())), \
                 patch.object(trial, "synthesize_branches", side_effect=lambda *args: original_synth(*args, world=FakeWorld())):
                trial.sys.modules.pop("torch", None)
                result = trial.build(parent, output)
            self.assertEqual(result["status"], "roundtrip_diagnostic_complete_not_perceptually_approved")
            self.assertTrue(result["inputs_unchanged"])
            for flag in ("training", "learned_model_loaded_or_run", "GPU_used", "Torch_imported", "new_score_or_music",
                         "quality_approved", "perceptually_approved", "source_PCM_mixed_into_synthesis", "EQ_AGC_gain_pitch_time_edit"):
                self.assertIs(result[flag], False)
            self.assertEqual(len(result["cases"]), 2)
            for entry in result["cases"]:
                for key in ("controls", "raw_waveforms"):
                    path = output / entry[key]["file"]
                    self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                    self.assertEqual(trial.saved.sha256(path), entry[key]["sha256"])
                with np.load(output / entry["controls"]["file"], allow_pickle=False) as archive:
                    self.assertEqual(archive["full_sp"].shape, (960, 1025))
                    self.assertEqual(archive["full_ap"].shape, (960, 1025))
                    self.assertEqual(archive["saved_mcep"].shape, (960, 40))
                    self.assertEqual(archive["saved_bap"].shape, (960, 3))
                with np.load(output / entry["raw_waveforms"]["file"], allow_pickle=False) as archive:
                    self.assertEqual(set(archive.files), {"original_reference", "saved_SiFiGAN_global1000", *trial.BRANCHES})
                    self.assertTrue(all(archive[name].shape == (115200,) for name in archive.files))
                self.assertEqual(entry["compression_parameter_diagnostics"]["schema"],
                                 "mini.WORLD43-compression-parameter-diagnostics.v1")
                self.assertEqual(len(entry["raw_timbre_metrics"]), 6)
                self.assertEqual(len(entry["raw_pitch_level_diagnostics"]), 6)
            self.assertEqual(output.stat().st_mode & 0o777, 0o700)
            self.assertEqual((output / "report.json").stat().st_mode & 0o777, 0o600)
            self.assertLess(trial.directory_bytes(output), trial.MAX_BYTES)
            with self.assertRaisesRegex(ValueError, "fresh_absolute"):
                trial.build(parent, output)


# Save originals before integration-test patches; no real WORLD dependency.
original_analyse, original_invert, original_synth = trial.analyse_full, trial.invert_compact, trial.synthesize_branches


def trial_analysis(wave):
    return original_analyse(wave, FakeWorld(), FakeSptk())


if __name__ == "__main__":
    unittest.main()
