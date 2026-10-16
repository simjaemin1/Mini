"""Pure/synthetic evaluator tests: no weights, model forward, or NGC audio."""
import copy
import json
import math
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import soundfile as sf
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import evaluate_copy_and_score as evaluation

PUBLIC_PLAN = Path(__file__).resolve().parent.parent / "new-arirang-score/new_ari_8bar_expression_b0_r1.json"


class CopyAndScoreTests(unittest.TestCase):
    def test_checkpoint_sha_and_fit_only_calibration_must_match(self):
        loaded = {"manifest_sha256": "m" * 64, "target_gain": .2,
                  "target_gain_db": 20 * math.log10(.2), "fit_voiced_rms_db_median_scaled": -35.}
        metadata = {"schema": evaluation.SCHEMA, "model_config": copy.deepcopy(evaluation.CONFIG),
                    "data": loaded.copy()}
        state = {"schema": evaluation.SCHEMA, "metadata_sha256": "s" * 64,
                 "manifest_sha256": "m" * 64, "model_config": copy.deepcopy(evaluation.CONFIG),
                 "nsf_lite_sha256": evaluation.data.digest(evaluation.nsf_lite.__file__), "step": 500,
                 **{k: loaded[k] for k in ("target_gain", "target_gain_db", "fit_voiced_rms_db_median_scaled")}}
        evaluation.validate_checkpoint(state, metadata, loaded, "s" * 64, "m" * 64)
        with self.assertRaisesRegex(ValueError, "metadata_or_source_mismatch"):
            evaluation.validate_checkpoint(state, metadata, loaded, "x" * 64, "m" * 64)
        bad = {**state, "target_gain": .3}
        with self.assertRaisesRegex(ValueError, "fit_only_calibration_mismatch"):
            evaluation.validate_checkpoint(bad, metadata, loaded, "s" * 64, "m" * 64)

    def test_copy_fixed_crop_uses_pre_gain_rms_active_independent_of_voicing(self):
        rows = []
        for index in range(2):
            pitch = np.full(320, 300., np.float32)
            uv = np.ones(320, np.bool_)
            uv[200], pitch[200] = False, 0
            rms = np.full(320, -55., np.float32)
            rms[201] = -70
            rows.append({"source_sha256": str(index) * 64, "pitch_hz": pitch,
                         "voiced_mask": uv, "rms_db": rms,
                         "waveform": np.linspace(-.05, .05, 320 * 240, dtype=np.float32)})
        before = rows[0]["waveform"].copy()
        result = evaluation.heldout_copy_windows(rows, .0001)
        self.assertEqual(len(result), 2)
        target, controls, facts = result[0]
        self.assertEqual(tuple(target.shape), (1, 1, 24000))
        self.assertEqual(facts["start_frame"], 200)
        self.assertTrue(facts["not_blind_same_file_as_training_validation"])
        self.assertEqual(float(controls[2][0, 0]), 0.)
        self.assertEqual(float(controls[3][0, 0]), 1.)
        self.assertEqual(float(controls[3][0, 1]), 0.)
        self.assertEqual(float(controls[1][0, 0]), -120.)
        np.testing.assert_array_equal(rows[0]["waveform"], before)

    def test_public_score_compiles_100hz_plus2_with_exact_written_rest_controls(self):
        before = PUBLIC_PLAN.read_bytes()
        controls, facts = evaluation.compile_score_controls(PUBLIC_PLAN, -35.)
        self.assertTrue(all(tuple(value.shape) == (1, 1920) for value in controls))
        self.assertEqual(facts["pitch_shift_semitones"], 2)
        plan = json.loads(before)
        first = next(event for event in plan["events"] if event["articulation"] != "release")
        self.assertAlmostEqual(float(controls[0][0, 10]), first["pitch_hz"] * 2**(2 / 12), delta=.01)
        times = np.arange(1920) / 100
        for event in facts["events"]:
            if event["articulation"] == "release":
                mask = (times >= event["start_seconds"]) & (times < event["end_seconds"])
                self.assertTrue(bool((controls[3][0, mask] == 0).all()))
        self.assertEqual(PUBLIC_PLAN.read_bytes(), before)

    def test_authored_rest_gate_exact_ceil_interval_and_10ms_edges_without_source_edit(self):
        source = np.ones(24000, np.float32)
        event = {"articulation": "release", "start_seconds": .10001, "end_seconds": .20001}
        gated, facts = evaluation.authored_rest_gate(source, [event])
        start, end = math.ceil(.10001 * 24000), math.ceil(.20001 * 24000)
        self.assertTrue((gated[start:end] == 0).all())
        self.assertTrue((gated[:start - 240] == 1).all())
        self.assertTrue((gated[end + 240:] == 1).all())
        self.assertTrue(np.all(np.diff(gated[start - 240:start]) <= 0))
        self.assertTrue(np.all(np.diff(gated[end:end + 240]) >= 0))
        self.assertTrue((source == 1).all())
        self.assertEqual(facts["intervals"], [{"start_sample": start, "end_sample": end}])
        self.assertFalse(facts["learned_breathing"])

    def test_synthetic_metrics_and_private_float_wav_budget_fail_closed(self):
        samples = torch.arange(2400) / 24000
        audio = (.03 * torch.sin(2 * math.pi * 300 * samples))[None, None]
        metrics = evaluation.audio_metrics(audio, audio.clone())
        self.assertEqual(metrics["frames"], 2400)
        self.assertAlmostEqual(metrics["rms_delta_db"], 0., places=6)
        self.assertAlmostEqual(metrics["mrstft_spectral_convergence"], 0., places=6)
        self.assertFalse(metrics["quality_approved"])
        with self.assertRaises(ValueError):
            evaluation.audio_metrics(torch.full_like(audio, float("nan")))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            waveform = audio.numpy()[0, 0]
            facts = evaluation.save_wave(root, "synthetic.wav", waveform, 24000)
            self.assertEqual(stat.S_IMODE((root / facts["file"]).stat().st_mode), 0o600)
            self.assertEqual(sf.info(root / facts["file"]).subtype, "FLOAT")
            with self.assertRaisesRegex(ValueError, "fresh_finite"):
                evaluation.save_wave(root, "synthetic.wav", waveform, 24000)
            with patch.object(evaluation, "AUDIO_BUDGET", 1):
                with self.assertRaisesRegex(ValueError, "audio_budget_exceeded"):
                    evaluation.save_wave(root, "overbudget.wav", waveform, 24000)


if __name__ == "__main__":
    torch.set_num_threads(1)
    unittest.main()
