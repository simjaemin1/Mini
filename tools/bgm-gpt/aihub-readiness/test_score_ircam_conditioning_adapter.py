"""Public score plus synthetic mutation tests; no private audio or model."""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path
import unittest

import numpy as np


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
COMPILER = ROOT / "tools" / "score-expression" / "compile_expression.py"
PLAN = ROOT / "tools" / "bgm-gpt" / "new-arirang-score" / "new_ari_8bar_expression_b0_r1.json"


def _module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


compiler = _module("score_expression_compiler_for_ircam_adapter_test", COMPILER)
adapter = _module("score_ircam_conditioning_adapter_for_test", HERE / "score_ircam_conditioning_adapter.py")


class ScoreIRCAMConditioningAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.compiled = compiler.compile_plan(PLAN)
        cls.candidate = adapter.adapt_compiled_controls(cls.compiled)

    def test_public_score_grid_is_candidate_not_inference_input(self) -> None:
        result = self.candidate
        self.assertEqual((result["sample_rate_hz"], result["control_hz"]), (16_000, 100))
        self.assertEqual(result["sample_count"], 307_200)
        self.assertEqual(len(result["f0_hz_candidate"]), 1_920)
        self.assertEqual(result["frame_centers_16k"][-1], 307_040)
        self.assertTrue(np.all(np.diff(result["frame_centers_16k"]) == 160))
        for name in ("f0_hz_candidate", "loudness_db_intent", "voicing_intent", "gesture_state", "event_index"):
            self.assertTrue(np.all(np.isfinite(result[name])), name)
        self.assertNotIn("loudness", result)
        self.assertNotIn("normalized_loudness", result)
        manifest = result["manifest"]
        self.assertEqual(manifest["schema"], adapter.SCHEMA)
        self.assertFalse(manifest["inference_ready"])
        self.assertIn("uncalibrated_loudness", manifest["status"])
        self.assertEqual(manifest["plan_sha256"], self.compiled["plan_sha256"])
        self.assertEqual(len(manifest["event_boundaries"]), 32)
        self.assertLess(manifest["target_grid"]["frame_count_no_endpoint"],
                        self.compiled["frame_centers_48k"].size)
        json.dumps(manifest, allow_nan=False)
        with self.assertRaisesRegex(adapter.IRCAMScoreAdapterError, "inference_blocked"):
            adapter.require_inference_ready(result)

    def test_written_rests_breaths_and_post_reverb_mute_contract(self) -> None:
        result = self.candidate
        release = result["gesture_state"] == adapter.STATE_CODES["release"]
        self.assertTrue(np.any(release))
        self.assertTrue(np.all(result["f0_hz_candidate"][release] == 0))
        self.assertTrue(np.all(result["voicing_intent"][release] == 0))
        self.assertEqual(len(result["hard_mute_intervals_16k"]), 4)
        for item in result["hard_mute_intervals_16k"]:
            self.assertGreater(item["end_sample_16k"], item["start_sample_16k"])
            self.assertLessEqual(item["end_sample_16k"], result["sample_count"])
        self.assertTrue(result["manifest"]["limits"]["sample_domain_post_reverb_rest_mute_required_for_explicit_silence"])
        for index, event in enumerate(self.compiled["events"]):
            if event["articulation"] != "breath_start":
                continue
            rows = np.flatnonzero(result["event_index"] == index)
            self.assertGreater(len(rows), 3)
            self.assertEqual(float(result["f0_hz_candidate"][rows[0]]), 0.0)
            self.assertGreater(float(result["f0_hz_candidate"][rows[3]]), 0.0)

    def test_reattack_dynamic_is_new_event_not_prior_crossfade(self) -> None:
        result = self.candidate
        index = next(i for i, event in enumerate(self.compiled["events"])
                     if event["articulation"] == "rearticulate" and i > 0
                     and self.compiled["events"][i - 1]["articulation"] != "release")
        row = int(np.flatnonzero(result["event_index"] == index)[0])
        self.assertEqual(int(result["event_index"][row - 1]), index - 1)
        self.assertEqual(int(result["gesture_state"][row]), adapter.STATE_CODES["rearticulate"])
        self.assertLess(float(result["loudness_db_intent"][row]),
                        float(result["loudness_db_intent"][row - 1]) - 7.0)
        self.assertGreater(float(result["f0_hz_candidate"][row]), 0.0)

    def test_12ms_slur_is_reconstructed_but_100hz_representation_is_sparse(self) -> None:
        result = self.candidate
        slur_boundaries = self.compiled["slur_boundaries"]
        counts = []
        for boundary in slur_boundaries:
            index = int(boundary["event_index"])
            start = int(boundary["transition_start_sample_48k"])
            stop = int(boundary["transition_end_sample_48k"])
            centers_48k = result["frame_centers_16k"] * 3
            rows = np.flatnonzero((result["event_index"] == index)
                                      & (centers_48k >= start) & (centers_48k < stop))
            self.assertIn(len(rows), (1, 2))
            counts.append(len(rows))
            source_log = math.log(float(boundary["source_boundary_f0_hz"]))
            target_log = math.log(float(boundary["target_entry_f0_hz"]))
            for row in rows:
                u = (int(centers_48k[row]) - start) / (stop - start)
                ease = u ** 3 * (10 + u * (-15 + 6 * u))
                expected = math.exp(source_log + (target_log - source_log) * ease)
                self.assertAlmostEqual(float(result["f0_hz_candidate"][row]), expected, places=4)
        self.assertEqual(len(counts), sum(e["articulation"] == "slur" for e in self.compiled["events"]))
        self.assertTrue(result["manifest"]["limits"]["12ms_slur_is_only_1_or_2_frames_at_100hz"])
        self.assertTrue(result["manifest"]["limits"]["synthesized_slur_duration_and_timbre_not_validated"])

    def test_two_semitone_comparison_is_explicit_and_score_immutable(self) -> None:
        original_source = self.compiled["f0_hz"].copy()
        shifted = adapter.adapt_compiled_controls(self.compiled, pitch_shift_semitones=2)
        base = self.candidate["f0_hz_candidate"]
        sounding = base > 0
        np.testing.assert_allclose(shifted["f0_hz_candidate"][sounding],
                                   base[sounding] * 2 ** (2 / 12), rtol=1e-6)
        self.assertTrue(np.all(shifted["f0_hz_candidate"][~sounding] == 0))
        np.testing.assert_array_equal(self.compiled["f0_hz"], original_source)
        self.assertEqual(shifted["manifest"]["pitch_shift_status"], "unreviewed_rnd_comparison_only")
        self.assertFalse(shifted["manifest"]["inference_ready"])
        with self.assertRaisesRegex(adapter.IRCAMScoreAdapterError, "pitch_shift"):
            adapter.adapt_compiled_controls(self.compiled, pitch_shift_semitones=2.5)

    def test_synthetic_invalid_compiler_or_boundary_mutations_fail_closed(self) -> None:
        with self.assertRaisesRegex(adapter.IRCAMScoreAdapterError, "source_must_be_300hz"):
            adapter.adapt_compiled_controls({**self.compiled, "control_hz": 250})
        broken_f0 = self.compiled["f0_hz"].copy()
        broken_f0[10] = np.nan
        with self.assertRaisesRegex(adapter.IRCAMScoreAdapterError, "invalid_f0_hz"):
            adapter.adapt_compiled_controls({**self.compiled, "f0_hz": broken_f0})
        broken_owner = self.compiled["event_index"].copy()
        broken_owner[100] = 100
        with self.assertRaisesRegex(adapter.IRCAMScoreAdapterError, "source_event_ownership_mismatch"):
            adapter.adapt_compiled_controls({**self.compiled, "event_index": broken_owner})
        with self.assertRaisesRegex(adapter.IRCAMScoreAdapterError, "slur_metadata_set_mismatch"):
            adapter.adapt_compiled_controls({**self.compiled, "slur_boundaries": []})
        bad_scope = {**self.compiled["scope"], "no_game_output": False}
        with self.assertRaisesRegex(adapter.IRCAMScoreAdapterError, "rnd_scope_required"):
            adapter.adapt_compiled_controls({**self.compiled, "scope": bad_scope})


if __name__ == "__main__":
    unittest.main()
