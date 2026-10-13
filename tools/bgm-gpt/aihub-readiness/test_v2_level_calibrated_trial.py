"""Public/synthetic composition-gain tests; no private audio or real model."""

from __future__ import annotations

import copy
import math
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import compose_v2_level_calibrated_trial as trial
import render_v2_private_score as renderer
from test_v2_private_score import public_fixture


def synthetic_raw():
    compiled, report = public_fixture()
    controls = renderer.prepare_controls(compiled, report)
    f0 = np.repeat(controls["candidate"]["f0_hz_candidate"], 160).astype(np.float64)
    owners = np.repeat(controls["candidate"]["event_index"], 160)
    anchor = report["calibration"]["anchor_rms_dbfs"]
    amplitudes = np.zeros(len(f0))
    for index, event in enumerate(compiled["events"]):
        if event["articulation"] != "release":
            offset = (index % 5 - 2) * 2.0
            amplitudes[owners == index] = math.sqrt(2) * 10 ** ((anchor + offset) / 20)
    audio = (np.sin(np.cumsum(2 * math.pi * f0 / 16_000)) * amplitudes).astype(np.float32)
    return compiled, report, controls, audio


class LevelCalibratedCompositionTests(unittest.TestCase):
    def test_note_level_calibration_targets_raw_steady_rms(self):
        compiled, report, controls, raw = synthetic_raw()
        anchor = report["calibration"]["anchor_rms_dbfs"]
        plan = trial.note_level_plan(raw, compiled, anchor)
        self.assertTrue(plan["all_note_gains_within_limit"])
        self.assertEqual(plan["note_count"], 28)
        gain = trial.note_gain_curve(compiled, plan)
        curve = renderer.authored_output_curve(compiled, controls)
        corrected = raw * curve * gain
        raw_metrics = renderer.score_metrics(raw * curve, compiled, controls, anchor)
        corrected_metrics = renderer.score_metrics(corrected, compiled, controls, anchor)
        gate = trial.composition_gate(raw_metrics, corrected_metrics, plan, corrected)
        self.assertTrue(gate["eligible_for_private_composition_preview"])
        self.assertFalse(gate["raw_model_level_learning_success_claimed"])
        self.assertFalse(gate["raw_internal_model_validation_passed_by_this_tool"])

    def test_over_12db_note_is_recorded_and_rejected_without_clamping(self):
        compiled, report, controls, raw = synthetic_raw()
        selected = np.repeat(controls["candidate"]["event_index"] == 1, 160)
        raw[selected] *= 0.01
        plan = trial.note_level_plan(raw, compiled, report["calibration"]["anchor_rms_dbfs"])
        self.assertFalse(plan["all_note_gains_within_limit"])
        self.assertGreater(plan["maximum_requested_abs_gain_db"], 30)
        with self.assertRaisesRegex(trial.CompositionError, "exceeds_12db"):
            trial.note_gain_curve(compiled, plan)

    def test_gain_is_one_value_per_note_and_settles_after_80ms(self):
        compiled, report, _, raw = synthetic_raw()
        plan = trial.note_level_plan(raw, compiled, report["calibration"]["anchor_rms_dbfs"])
        gain = trial.note_gain_curve(compiled, plan)
        event = compiled["events"][1]
        begin = math.ceil(event["start_seconds"] * 16_000)
        settled = math.ceil((event["start_seconds"] + 0.080) * 16_000)
        end = math.floor(event["end_seconds"] * 16_000)
        self.assertLess(abs(float(gain[begin] - gain[begin - 1])), 1e-6)
        self.assertLess(float(np.max(np.abs(np.diff(gain[begin:settled])))), 0.01)
        np.testing.assert_allclose(gain[settled:end], gain[settled], atol=1e-7, rtol=0)

    def test_raw_pitch_failure_cannot_be_hidden_by_corrected_metrics(self):
        compiled, report, controls, raw = synthetic_raw()
        anchor = report["calibration"]["anchor_rms_dbfs"]
        plan = trial.note_level_plan(raw, compiled, anchor)
        audio = raw * renderer.authored_output_curve(compiled, controls)
        corrected_metrics = renderer.score_metrics(audio * trial.note_gain_curve(compiled, plan), compiled, controls, anchor)
        wrong_raw_metrics = copy.deepcopy(corrected_metrics)
        wrong_raw_metrics["checks"]["each_note_pitch_coverage_and_accuracy"] = False
        self.assertFalse(trial.composition_gate(wrong_raw_metrics, corrected_metrics, plan, audio)["eligible_for_private_composition_preview"])

    def test_gate_result_is_native_json_and_peak_failure_rejects(self):
        import json
        checks = {key: True for key in trial.PITCH_CHECK_NAMES}
        gate = trial.composition_gate({"checks": checks}, {"numerically_eligible_for_local_score_preview": True},
                                     {"all_note_gains_within_limit": True}, np.full(20, 0.95))
        self.assertFalse(gate["eligible_for_private_composition_preview"])
        json.dumps(gate, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
