"""Public-score and synthetic-mutation tests; no model or source audio."""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path
import unittest

import numpy as np


HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]
COMPILER = REPO_ROOT / "tools" / "score-expression" / "compile_expression.py"
PLAN = REPO_ROOT / "tools" / "bgm-gpt" / "new-arirang-score" / "new_ari_8bar_expression_b0_r1.json"


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


compiler = _load_module("score_expression_compiler_for_adapter_test", COMPILER)
adapter = _load_module("score_ddsp_conditioning_adapter_for_test", HERE / "score_ddsp_conditioning_adapter.py")


class ScoreDDSPConditioningAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.compiled = compiler.compile_plan(PLAN)
        cls.adapted = adapter.adapt_compiled_controls(cls.compiled)

    def test_canonical_grid_finite_arrays_and_provenance(self) -> None:
        result = self.adapted
        self.assertEqual((result["sample_rate_hz"], result["control_hz"]), (16_000, 250))
        self.assertEqual(result["sample_count"], 307_200)
        self.assertEqual(len(result["f0_hz"]), 4_800)
        self.assertEqual(result["frame_centers_16k"][0], 0)
        self.assertEqual(result["frame_centers_16k"][-1], 307_136)
        self.assertTrue(np.all(np.diff(result["frame_centers_16k"]) == 64))
        for name in ("frame_centers_16k", "frame_times_seconds", "f0_hz", "loudness_db",
                     "voicing", "gesture_state", "event_index"):
            self.assertEqual(len(result[name]), 4_800)
            self.assertTrue(np.all(np.isfinite(result[name])), name)
        manifest = result["manifest"]
        self.assertEqual(manifest["schema"], adapter.SCHEMA)
        self.assertEqual(manifest["provenance"]["plan_sha256"], self.compiled["plan_sha256"])
        self.assertEqual(manifest["provenance"]["target_frame_count_no_endpoint"], 4_800)
        self.assertEqual(len(manifest["boundary_policy"]["events"]), 32)
        self.assertLess(manifest["boundary_policy"]["max_onset_quantization_delay_ms"], 4.0)
        self.assertTrue(manifest["interpretation_limits"]["no_model_loaded_trained_or_run"])
        json.dumps(manifest, allow_nan=False)

    def test_explicit_rests_and_breath_starts_remain_unpitched(self) -> None:
        result = self.adapted
        release = result["gesture_state"] == adapter.STATE_CODES["release"]
        self.assertGreater(int(np.sum(release)), 0)
        self.assertTrue(np.all(result["f0_hz"][release] == 0))
        self.assertTrue(np.all(result["voicing"][release] == 0))
        self.assertTrue(np.all(result["f0_hz"][result["event_index"] < 0] == 0))
        for event_index, event in enumerate(self.compiled["events"]):
            if event["articulation"] != "breath_start":
                continue
            rows = np.flatnonzero(result["event_index"] == event_index)
            self.assertGreater(len(rows), 4)
            self.assertEqual(float(result["f0_hz"][rows[0]]), 0.0)
            self.assertGreater(float(result["f0_hz"][rows[4]]), 0.0)

    def test_reattack_is_a_new_envelope_not_previous_note_crossfade(self) -> None:
        result = self.adapted
        event_index = next(i for i, e in enumerate(self.compiled["events"])
                           if e["articulation"] == "rearticulate" and i > 0
                           and self.compiled["events"][i - 1]["articulation"] != "release")
        rows = np.flatnonzero(result["event_index"] == event_index)
        first = int(rows[0])
        self.assertEqual(int(result["event_index"][first - 1]), event_index - 1)
        self.assertEqual(int(result["gesture_state"][first]), adapter.STATE_CODES["rearticulate"])
        self.assertLess(float(result["loudness_db"][first]),
                        float(result["loudness_db"][first - 1]) - 8.0)
        target_pitch = float(self.compiled["events"][event_index]["pitch_hz"])
        self.assertLess(abs(float(result["f0_hz"][first]) - target_pitch), 1.0)
        self.assertGreater(float(result["f0_hz"][first]), 0)

    def test_slur_reconstructs_short_minimum_jerk_on_target_grid(self) -> None:
        result = self.adapted
        boundary = self.compiled["slur_boundaries"][0]
        event_index = int(boundary["event_index"])
        frame_times = result["frame_times_seconds"]
        onset = float(boundary["boundary_seconds"])
        rows = np.flatnonzero((result["event_index"] == event_index)
                              & (frame_times < onset + 0.012))
        self.assertEqual(len(rows), 3)
        start_hz = float(boundary["source_boundary_f0_hz"])
        end_hz = float(boundary["target_entry_f0_hz"])
        for row in rows:
            progress = (float(frame_times[row]) - onset) / 0.012
            ease = progress ** 3 * (10 + progress * (-15 + 6 * progress))
            expected = math.exp(math.log(start_hz) + (math.log(end_hz) - math.log(start_hz)) * ease)
            self.assertAlmostEqual(float(result["f0_hz"][row]), expected, places=4)
            self.assertEqual(int(result["gesture_state"][row]), adapter.STATE_CODES["slur"])
        attach = int(np.flatnonzero((result["event_index"] == event_index)
                                        & (frame_times >= onset + 0.012))[0])
        self.assertLess(abs(float(result["f0_hz"][attach]) - end_hz), 1.0)
        self.assertEqual(float(result["loudness_db"][rows[0]]),
                         float(result["loudness_db"][rows[-1]]))

    def test_invalid_compiler_contracts_fail_closed(self) -> None:
        bad_rate = {**self.compiled, "control_hz": 250}
        with self.assertRaisesRegex(adapter.ConditioningAdapterError, "source_must_be_300hz"):
            adapter.adapt_compiled_controls(bad_rate)

        bad_f0 = self.compiled["f0_hz"].copy()
        bad_f0[10] = np.nan
        with self.assertRaisesRegex(adapter.ConditioningAdapterError, "nonfinite_or_nonnumeric_f0_hz"):
            adapter.adapt_compiled_controls({**self.compiled, "f0_hz": bad_f0})

        bad_owner = self.compiled["event_index"].copy()
        bad_owner[240] = 0
        with self.assertRaisesRegex(adapter.ConditioningAdapterError, "source_event_ownership_mismatch"):
            adapter.adapt_compiled_controls({**self.compiled, "event_index": bad_owner})

        with self.assertRaisesRegex(adapter.ConditioningAdapterError, "slur_boundary_set_mismatch"):
            adapter.adapt_compiled_controls({**self.compiled, "slur_boundaries": []})

        bad_scope = {**self.compiled["scope"], "no_game_output": False}
        with self.assertRaisesRegex(adapter.ConditioningAdapterError, "rnd_scope_required"):
            adapter.adapt_compiled_controls({**self.compiled, "scope": bad_scope})


if __name__ == "__main__":
    unittest.main()
