"""Synthetic/mock WORLD controls only; no pyworld import, original audio or weights."""
import copy
import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_world_copy as trial


class MockWorld:
    def harvest(self, audio, rate, **kwargs):
        self.harvest_kwargs = kwargs
        count = len(audio) // 120 + 1
        f0 = np.full(count, 300.)
        f0[2:5] = 0
        return f0, np.arange(count) * .005

    def cheaptrick(self, audio, f0, times, rate, **kwargs):
        return np.ones((len(f0), 513), np.float64)

    def d4c(self, audio, f0, times, rate, **kwargs):
        self.ap_kwargs = kwargs
        ap = np.full((len(f0), 513), .2)
        ap[6] = 1.
        return ap

    def synthesize(self, f0, sp, ap, rate, **kwargs):
        self.synthesis_f0 = f0.copy()
        return .05 * np.sin(2 * np.pi * 300 * np.arange(len(f0) * 120) / rate)


def signal():
    return .05 * np.sin(2 * np.pi * 300 * np.arange(24000) / 24000)


class WorldCopyTests(unittest.TestCase):
    def test_primary_api_shapes_hashes_and_fixed_right_trim(self):
        world, original = MockWorld(), signal()
        before = original.copy()
        audio, controls, facts = trial.analyze_and_synthesize(original, world=world)
        self.assertEqual(world.harvest_kwargs, {"f0_floor": 70., "f0_ceil": 1800., "frame_period": 5.})
        self.assertEqual(world.ap_kwargs, {"threshold": .85, "fft_size": 1024})
        self.assertEqual(audio.shape, (24000,))
        self.assertEqual(facts["right_trimmed_samples"], 120)
        self.assertEqual(facts["control_frames"], 201)
        self.assertGreater(facts["voiced_ap_all_approximately_one_fraction"], 0)
        self.assertEqual(facts["control_sha256"]["spectral_envelope"], trial.array_digest(controls["spectral_envelope"]))
        np.testing.assert_array_equal(original, before)
        self.assertFalse(facts["new_music"])
        self.assertFalse(facts["original_phase_or_noise_waveform_preserved"])

    def test_optional_voiced_plus1_only_preserves_sp_ap_and_unvoiced_zero(self):
        _, baseline, facts0 = trial.analyze_and_synthesize(signal(), world=MockWorld())
        _, shifted, facts1 = trial.analyze_and_synthesize(signal(), pitch_shift=1, world=MockWorld())
        positive = baseline["f0_hz"] > 0
        np.testing.assert_allclose(shifted["synthesis_f0_hz"][positive], baseline["f0_hz"][positive] * 2**(1 / 12))
        self.assertTrue((shifted["synthesis_f0_hz"][~positive] == 0).all())
        for key in ("f0_hz", "spectral_envelope", "aperiodicity"):
            self.assertEqual(facts0["control_sha256"][key], facts1["control_sha256"][key])
        with self.assertRaises(ValueError):
            trial.analyze_and_synthesize(signal(), pitch_shift=2, world=MockWorld())

    def test_invalid_input_analysis_and_synthesis_fail_without_fallback(self):
        for wave in (np.zeros(24000), np.full(24000, np.nan), signal()[:-1], np.ones((2, 24000))):
            with self.assertRaises(ValueError):
                trial.analyze_and_synthesize(wave, world=MockWorld())
        world = MockWorld()
        with patch.object(world, "harvest", return_value=(np.zeros(201), np.arange(201) * .005)):
            with self.assertRaisesRegex(ValueError, "analysis_pitch_failed"):
                trial.analyze_and_synthesize(signal(), world=world)
        with patch.object(world, "synthesize", return_value=np.zeros(24000)):
            with self.assertRaisesRegex(ValueError, "synthesis_length"):
                trial.analyze_and_synthesize(signal(), world=world)

    def test_world_cannot_mutate_source_sp_ap(self):
        world = MockWorld()
        def mutate(f0, sp, ap, *_args, **_kwargs):
            ap[0, 0] = .9
            return np.ones(24120)
        with patch.object(world, "synthesize", side_effect=mutate):
            with self.assertRaisesRegex(ValueError, "mutated"):
                trial.analyze_and_synthesize(signal(), world=world)

    def test_manifest_selects_only_fixed_regular_sha_bound_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = []
            for i, (_case, filename, _start) in enumerate(trial.CASES):
                source = root / filename
                source.write_bytes(f"synthetic-{i}".encode())
                records.append({"source_path": str(source), "source_sha256": trial.digest(source)})
            manifest = {"schema": "mini.nsf-public-ngc-data.v1", "status": "complete",
                        "AIHub_files_used": 0, "source_root": str(root), "files": records}
            path = root / "manifest.json"
            path.write_text(json.dumps(manifest))
            _, rows = trial.selected_sources(path)
            self.assertEqual([row["start_seconds"] for row in rows], [0., 2., 0.])
            altered = copy.deepcopy(manifest)
            altered["files"][0]["source_sha256"] = "0" * 64
            path.write_text(json.dumps(altered))
            with self.assertRaisesRegex(ValueError, "binding_failed"):
                trial.selected_sources(path)

    def test_raw_control_archive_and_source_roles_private_budgeted(self):
        generated, controls, _facts = trial.analyze_and_synthesize(signal(), world=MockWorld())
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            archive = trial.save_controls(output, "controls.npz", controls, signal())
            self.assertEqual(stat.S_IMODE((output / archive["file"]).stat().st_mode), 0o600)
            with np.load(output / archive["file"], allow_pickle=False) as saved:
                np.testing.assert_array_equal(saved["spectral_envelope"], controls["spectral_envelope"])
                np.testing.assert_array_equal(saved["source_waveform_24k"], signal())
            audio = trial.save_audio(output, "source.wav", generated, 24000, "synthetic_source_role")
            self.assertEqual(audio["role"], "synthetic_source_role")
            with patch.object(trial, "OUTPUT_BUDGET", 1):
                with self.assertRaisesRegex(ValueError, "total_output_budget"):
                    trial.save_controls(output, "overbudget.npz", controls, signal())
            self.assertFalse((output / "overbudget.npz").exists())


if __name__ == "__main__":
    unittest.main()
