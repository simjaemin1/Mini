"""Public expression/synthetic waveform tests; never open private source audio."""

from __future__ import annotations

import math
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import compare_v2_final_vibrato_trial as comparison
import compose_v2_level_calibrated_trial as composition
import render_v2_private_score as renderer
from test_v2_private_score import public_fixture


def fixture():
    compiled_b0, report = public_fixture()
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "public_b1_expression_fixture.json"
        path.write_bytes(composition._json_bytes(comparison.derive_b1_plan()))
        compiled_b1 = comparison._module(comparison.association.COMPILER_PATH, "test_b1_compiler").compile_plan(path)
    controls_b0 = renderer.prepare_controls(compiled_b0, report)
    controls_b1 = renderer.prepare_controls(compiled_b1, report)
    return compiled_b0, compiled_b1, report, controls_b0, controls_b1


class FinalVibratoComparisonTests(unittest.TestCase):
    def test_only_pinned_final_expression_changes_and_rest_timeline_is_preserved(self):
        compiled_b0, compiled_b1, _, b0, b1 = fixture()
        self.assertEqual(compiled_b1["control_hz"], 300)
        self.assertEqual(len(compiled_b1["events"]), 32)
        self.assertEqual(sum(event["vibrato"]["enabled"] for event in compiled_b1["events"]), 1)
        self.assertEqual(len(b1["candidate"]["hard_mute_intervals_16k"]), 4)
        self.assertEqual(b0["candidate"]["hard_mute_intervals_16k"], b1["candidate"]["hard_mute_intervals_16k"])
        for a, b in zip(compiled_b0["events"], compiled_b1["events"]):
            for field in ("start_seconds", "end_seconds", "pitch_hz", "articulation", "steady_loudness_db"):
                self.assertEqual(a.get(field), b.get(field))
        np.testing.assert_array_equal(b0["normalized_loudness"], b1["normalized_loudness"])
        np.testing.assert_array_equal(b0["candidate"]["f0_hz_candidate"][:1760], b1["candidate"]["f0_hz_candidate"][:1760])
        np.testing.assert_array_equal(renderer.authored_output_curve(compiled_b0, b0), renderer.authored_output_curve(compiled_b1, b1))
        self.assertGreater(float(np.max(np.abs(compiled_b1["vibrato_cents"]))), 17.9)
        self.assertLessEqual(float(np.max(np.abs(compiled_b1["vibrato_cents"]))), 18.00001)

    def test_output_estimator_observes_authored_vibrato_but_not_straight_tone(self):
        compiled_b0, compiled_b1, report, b0, b1 = fixture()
        amplitude = math.sqrt(2) * 10 ** (report["calibration"]["anchor_rms_dbfs"] / 20)
        f0 = np.repeat(b1["candidate"]["f0_hz_candidate"], 160)
        audio = (amplitude * np.sin(np.cumsum(2 * math.pi * f0 / 16_000)) * renderer.authored_output_curve(compiled_b1, b1)).astype(np.float32)
        evidence = comparison.output_vibrato_evidence(audio, compiled_b1, b1)
        self.assertTrue(evidence["output_modulation_numerically_observed"])
        self.assertAlmostEqual(evidence["output_fixed_rate_fit"]["amplitude_cents"], 18, delta=2)
        self.assertFalse(evidence["placement_learned"])
        plain_f0 = np.repeat(b0["candidate"]["f0_hz_candidate"], 160)
        straight = (amplitude * np.sin(np.cumsum(2 * math.pi * plain_f0 / 16_000)) * renderer.authored_output_curve(compiled_b0, b0)).astype(np.float32)
        no_modulation = comparison.output_vibrato_evidence(straight, compiled_b1, b1)
        self.assertFalse(no_modulation["output_modulation_numerically_observed"])

    def test_prefix_comparison_does_not_splice_or_ignore_early_differences(self):
        a = np.zeros(307_200, dtype=np.float32)
        b = a.copy()
        b[281_600:] = 0.01
        self.assertTrue(comparison.prefix_comparison(a, b)["prefix_within_tolerance"])
        b[281_599] = 0.0001
        self.assertFalse(comparison.prefix_comparison(a, b)["prefix_within_tolerance"])

    def test_cpu_cumulative_phase_prefix_is_causal_when_only_final_vibrato_changes(self):
        import torch
        _, _, _, b0, b1 = fixture()
        plain = torch.from_numpy(np.repeat(b0["candidate"]["f0_hz_candidate"], 160))
        vibrating = torch.from_numpy(np.repeat(b1["candidate"]["f0_hz_candidate"], 160))
        phase0 = torch.cumsum(2 * math.pi * plain / 16_000, dim=0)
        phase1 = torch.cumsum(2 * math.pi * vibrating / 16_000, dim=0)
        self.assertTrue(torch.equal(phase0[:281_600], phase1[:281_600]))
        self.assertGreater(float(torch.max(torch.abs(phase0[281_600:] - phase1[281_600:]))), 0.01)

    def test_unrecognized_render_backend_rejected_before_private_inputs(self):
        with self.assertRaisesRegex(comparison.ComparisonError, "render_device"):
            comparison.run(b0_dir=Path("/none"), calibration_file=Path("/none"), parent_checkpoint_dir=Path("/none"),
                           checkpoint_dir=Path("/none"), upstream_root=Path("/none"), output_dir=Path("/none"), render_device="unknown")


if __name__ == "__main__":
    unittest.main()
