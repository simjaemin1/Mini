"""Synthetic/public-score tests. Never read AI Hub audio or run a real model."""

from __future__ import annotations

import io
import math
from pathlib import Path
import sys
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import calibrate_v2_score_controls as calibrate
import render_v2_private_score as render


def fake_pairs(pitches=(440.0, 493.883301, 587.329536, 659.255114, 739.988846)):
    """Twelve synthetic song groups, exact same-pitch monotone RMS features."""
    rows = []
    for song in range(1, 13):
        for pitch in pitches:
            for level in range(-61, -30, 2):
                for index in range(4):
                    rows.append((level + (index - 1.5) * 0.05,
                                 -8 + (level + 61) * 0.10 + song * 0.001,
                                 pitch, song))
    data = np.asarray(rows)
    return {name: data[:, index].astype(np.int32 if name == "song_index" else np.float32)
            for index, name in enumerate(("rms_dbfs", "weighted_log", "pitch_hz", "song_index"))}


def public_fixture():
    compiled, _, _ = calibrate.public_score()
    # Deliberately exclude G4. The original variant is unsupported; +2 is
    # selected from source support without mutating any public score bytes.
    body = calibrate.build_calibration(fake_pairs(), compiled, (-6.0, 1.0))
    report = {"calibration": body, "binding": {"normalizer_fit_only": [-6.0, 1.0]}}
    return compiled, report


class FitOnlyCalibrationTests(unittest.TestCase):
    def test_sparse_song_pitch_does_not_pass_on_frame_count(self):
        pairs = fake_pairs((440.0,))
        keep = pairs["song_index"] <= 2
        subset = {name: values[keep] for name, values in pairs.items()}
        support = calibrate.pitch_conditioned_support(subset, 440, 1.0, -45)
        self.assertGreater(support["frames"], 30)
        self.assertFalse(support["usable"])
        self.assertEqual(support["reason"], "nominal_pitch_support_insufficient")

    def test_same_pitch_group_blocks_contamination_from_other_pitches(self):
        pairs = fake_pairs((440.0, 660.0))
        other = pairs["pitch_hz"] > 600
        pairs["weighted_log"][other] = 200.0
        support = calibrate.pitch_conditioned_support(pairs, 440, 1.0, -45)
        self.assertTrue(support["usable"])
        self.assertLess(max(row["monotone_candidate_weighted_log"] for row in support["usable_run"]), 0)

    def test_observed_range_only_and_low_tail_is_explicit_attenuation(self):
        support = calibrate.pitch_conditioned_support(fake_pairs((440.0,)), 440, 1.0, -45)
        low, high = support["rms_center_range_dbfs"]
        feature, gain = calibrate.map_intent(support, np.array([low - 6, low, -45, high]))
        self.assertEqual(feature[0], feature[1])
        self.assertAlmostEqual(float(gain[0]), 10 ** (-6 / 20), places=6)
        np.testing.assert_allclose(gain[1:], 1)
        with self.assertRaisesRegex(calibrate.CalibrationError, "above_pitch"):
            calibrate.map_intent(support, np.array([high + 0.1]))

    def test_nonmonotone_association_cannot_silently_pass(self):
        pairs = fake_pairs((440.0,))
        pairs["weighted_log"] = -pairs["weighted_log"] * 5
        support = calibrate.pitch_conditioned_support(pairs, 440, 1.0, -45)
        self.assertFalse(support["usable"])
        self.assertEqual(support["reason"], "same_pitch_rms_feature_association_failed")

    def test_variant_auto_selection_preserves_public_score(self):
        compiled, report = public_fixture()
        self.assertEqual(report["calibration"]["selected_shift_for_private_trial"], 2)
        self.assertFalse(report["calibration"]["variants"][0]["all_nominal_pitches_and_steady_level_supported"])
        self.assertEqual(compiled["events"][0]["pitch_hz"], 391.995436)
        subset = fake_pairs()
        keep = subset["song_index"] < 12
        with self.assertRaisesRegex(calibrate.CalibrationError, "twelve_fit"):
            calibrate.build_calibration({name: values[keep] for name, values in subset.items()}, compiled, (-6, 1))


class PrivateScoreCurveTests(unittest.TestCase):
    def test_fullphrase_controls_short_slurs_and_no_source_input(self):
        compiled, report = public_fixture()
        controls = render.prepare_controls(compiled, report)
        self.assertEqual(controls["candidate"]["sample_count"], 307_200)
        self.assertEqual(len(controls["normalized_loudness"]), 1920)
        self.assertEqual(controls["pitch_shift_semitones"], 2)
        self.assertGreater(controls["below_support_output_attenuation_frames"], 0)
        self.assertTrue(all(item["model_grid_transition_frames"] in (1, 2) for item in controls["slur_input_audit"]))
        self.assertAlmostEqual(float(controls["candidate"]["f0_hz_candidate"][10]), 440.0, places=3)

    def test_exact_rests_and_voicing_fade_are_explicit_sample_controls(self):
        compiled, report = public_fixture()
        controls = render.prepare_controls(compiled, report)
        curve = render.authored_output_curve(compiled, controls)
        self.assertEqual(curve.shape, (307_200,))
        self.assertEqual(float(curve[0]), 0)
        self.assertLess(float(curve[80]), float(curve[800]))
        for interval in controls["candidate"]["hard_mute_intervals_16k"]:
            start, end = interval["start_sample_16k"], interval["end_sample_16k"]
            self.assertTrue(np.all(curve[start:end] == 0))
            self.assertLess(float(curve[start - 1]), 1e-4)

    def test_generated_pitch_errors_and_level_failures_do_not_make_preview(self):
        compiled, report = public_fixture()
        controls = render.prepare_controls(compiled, report)
        curve = render.authored_output_curve(compiled, controls)
        f0 = np.repeat(controls["candidate"]["f0_hz_candidate"], 160)
        amplitude = math.sqrt(2) * 10 ** (report["calibration"]["anchor_rms_dbfs"] / 20)
        phase = np.cumsum(2 * math.pi * f0 / 16_000)
        correct = (amplitude * np.sin(phase) * curve).astype(np.float32)
        good = render.score_metrics(correct, compiled, controls, report["calibration"]["anchor_rms_dbfs"])
        self.assertTrue(good["numerically_eligible_for_local_score_preview"])
        wrong = (amplitude * np.sin(phase * 1.12) * curve).astype(np.float32)
        bad = render.score_metrics(wrong, compiled, controls, report["calibration"]["anchor_rms_dbfs"])
        self.assertFalse(bad["checks"]["steady_pitch_accuracy"])
        loud = render.score_metrics(correct * 4, compiled, controls, report["calibration"]["anchor_rms_dbfs"])
        self.assertFalse(loud["checks"]["steady_note_levels"])

    def test_one_octave_wrong_short_note_cannot_hide_in_global_pitch_median(self):
        compiled, report = public_fixture()
        controls = render.prepare_controls(compiled, report)
        curve = render.authored_output_curve(compiled, controls)
        f0 = np.repeat(controls["candidate"]["f0_hz_candidate"], 160).astype(np.float64)
        selected = next(index for index, event in enumerate(compiled["events"]) if event["id"] == "b01_e1_slur")
        event_samples = np.repeat(controls["candidate"]["event_index"] == selected, 160)
        f0[event_samples] *= 2
        amplitude = math.sqrt(2) * 10 ** (report["calibration"]["anchor_rms_dbfs"] / 20)
        audio = (amplitude * np.sin(np.cumsum(2 * math.pi * f0 / 16_000)) * curve).astype(np.float32)
        metrics = render.score_metrics(audio, compiled, controls, report["calibration"]["anchor_rms_dbfs"])
        self.assertTrue(metrics["checks"]["steady_pitch_accuracy"])
        self.assertFalse(metrics["checks"]["each_note_pitch_coverage_and_accuracy"])
        self.assertFalse(metrics["numerically_eligible_for_local_score_preview"])
        wrong = next(row for row in metrics["note_pitch"] if row["event_id"] == "b01_e1_slur")
        self.assertGreater(wrong["median_f0_error_cents"], 1100)

    def test_long_pitch_glide_fails_short_output_window_even_when_steady_pitch_passes(self):
        compiled, report = public_fixture()
        controls = render.prepare_controls(compiled, report)
        curve = render.authored_output_curve(compiled, controls)
        f0 = np.repeat(controls["candidate"]["f0_hz_candidate"], 160).astype(np.float64)
        event = next(item for item in compiled["events"] if item["id"] == "b01_e1_slur")
        start = round(float(event["start_seconds"]) * 16_000)
        count = round(0.080 * 16_000)
        target = float(event["pitch_hz"]) * 2 ** (controls["pitch_shift_semitones"] / 12)
        progress = np.arange(count) / count
        f0[start:start + count] = target * 2 ** ((-200 * (1 - progress)) / 1200)
        amplitude = math.sqrt(2) * 10 ** (report["calibration"]["anchor_rms_dbfs"] / 20)
        audio = (amplitude * np.sin(np.cumsum(2 * math.pi * f0 / 16_000)) * curve).astype(np.float32)
        metrics = render.score_metrics(audio, compiled, controls, report["calibration"]["anchor_rms_dbfs"])
        self.assertTrue(metrics["checks"]["each_note_pitch_coverage_and_accuracy"])
        self.assertFalse(metrics["checks"]["slur_output_short_window_target"])
        self.assertFalse(metrics["numerically_eligible_for_local_score_preview"])

    def test_slur_loudness_feature_blend_stays_in_each_target_pitch_range(self):
        compiled, report = public_fixture()
        chosen = next(item for item in report["calibration"]["variants"] if item["pitch_shift_semitones"] == 2)
        for rank, group in enumerate(chosen["groups"]):
            for row in group["usable_run"]:
                row["monotone_candidate_weighted_log"] += rank * 3
        controls = render.prepare_controls(compiled, report)
        self.assertGreater(controls["slur_feature_blend_clamped_frames"], 0)
        table = {row["pitch_midi"]: row for row in chosen["groups"]}
        for index, event in enumerate(compiled["events"]):
            if event["articulation"] == "release":
                continue
            midi = round(69 + 12 * math.log2(float(event["pitch_hz"]) / 440)) + 2
            group = table[midi]
            feature = controls["weighted_log_feature"][controls["candidate"]["event_index"] == index]
            self.assertGreaterEqual(float(feature.min()), group["usable_run"][0]["monotone_candidate_weighted_log"] - 1e-6)
            self.assertLessEqual(float(feature.max()), group["usable_run"][-1]["monotone_candidate_weighted_log"] + 1e-6)

    def test_cli_unexpected_error_does_not_expose_private_paths(self):
        output = io.StringIO()
        args = ["render", "--calibration-file", "/a", "--checkpoint-dir", "/b", "--diagnostic-dir", "/c",
                "--upstream-root", "/d", "--output-dir", "/e"]
        with patch.object(sys, "argv", args), patch.object(render, "render", side_effect=RuntimeError("/private/licensed/secret.wav")), redirect_stdout(output):
            self.assertEqual(render.main(), 2)
        self.assertNotIn("secret.wav", output.getvalue())
        self.assertNotIn("Traceback", output.getvalue())

    def test_external_diagnostic_must_recompute_gate_and_freeze_proof(self):
        import bound_v2_dry_diagnostic as diagnostic
        metrics = {"quiet_frames": 20, "leaking_frames": 0, "longest_quiet_leak_frames": 0,
                   "raw_rms_delta_db": 0.0}
        general = [dict(metrics, kind="sustain", song_index=index % 4 + 1) for index in range(34)]
        general += [dict(metrics, kind="transition", song_index=index % 4 + 1) for index in range(34)]
        vibrato = [dict(metrics, song_index=index % 4 + 1,
                        input64_state="modulated" if index < 20 else "straight",
                        output64_state="modulated" if index < 20 else "straight") for index in range(24)]
        previews = [metrics]
        gate = diagnostic.preview_gate(general, vibrato, previews, {1, 2, 3, 4})
        binding = {"checkpoint_sha256": "a" * 64, "training_report_sha256": "b" * 64,
                   "normalizer_fit_only": [-6, 1], "source_manifest_sha256": "c" * 64,
                   "split_manifest_sha256": "d" * 64, "checkpoint_kind": "v2", "checkpoint_total_step": 400}
        expected = {name: binding[name] for name in ("checkpoint_sha256", "training_report_sha256",
                                                    "normalizer_fit_only", "source_manifest_sha256", "split_manifest_sha256")}
        expected.update({"code_sha256": {"synthetic": "hash"}, "architecture": render.v2.ARCHITECTURE,
                         "checkpoint_trial_kind": "v2", "checkpoint_total_step": 400})
        plan = {**expected, "seeds": diagnostic.SEEDS, "gates": diagnostic.GATES,
                "general_source_selection": [{"song_index": index % 4 + 1} for index in range(34)]}
        proof = {**expected, "schema": diagnostic.SCHEMA, "status": "complete_bound_to_frozen_v2",
                 "report_sha256": "report-sha", "evaluation_plan_sha256": "plan-sha"}
        report = {"schema": diagnostic.SCHEMA, "status": "reused_diagnostic_complete", "numerical_preview_gate": gate,
                  "general_scores_private": general, "vb01_scores_private": vibrato, "planned_preview_metrics": previews}
        with (patch.object(calibrate, "approved_private_path"), patch.object(diagnostic, "_code_hashes", return_value={"synthetic": "hash"}),
              patch.object(render.pilot, "_read_json", side_effect=[(proof, "proof"), (report, "report-sha"), (plan, "plan-sha"), (plan, "freeze-sha")])):
            self.assertEqual(render._verify_evaluation(Path("/private/result"), Path("/private/model"), binding)["diagnostic_report_sha256"], "report-sha")
        modified = dict(plan, seeds={"changed": 1})
        with (patch.object(calibrate, "approved_private_path"), patch.object(diagnostic, "_code_hashes", return_value={"synthetic": "hash"}),
              patch.object(render.pilot, "_read_json", side_effect=[(proof, "proof"), (report, "report-sha"), (modified, "plan-sha"), (modified, "freeze-sha")])):
            with self.assertRaisesRegex(render.RenderError, "successful_checkpoint_bound"):
                render._verify_evaluation(Path("/private/result"), Path("/private/model"), binding)


if __name__ == "__main__":
    unittest.main()
