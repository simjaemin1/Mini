"""Offline contract tests for the public DDSP-Gugak CPU runtime.

These do not import Torch, source checkouts, checkpoints, audio, or CREPE.
"""

from __future__ import annotations

import copy
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import wave


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import ddsp_gugak_public_runtime as runtime


PLAN = ROOT / "tools/score-expression/plans/ari_source_led_response_r1.json"
AUDITION_PLAN = ROOT / "tools/score-expression/plans/ari_gyeonggi_policy_r1_audition.json"
REFERENCE_PLAN = ROOT / "tools/score-expression/plans/ari_full_16bar_b2_reference_shape_unreviewed_r1.json"
DEPTH_MATCHED_REFERENCE_PLAN = ROOT / "tools/score-expression/plans/ari_full_16bar_b2rd_reference_shape_depth_matched_unreviewed_r1.json"


class PublicRuntimeTests(unittest.TestCase):
    def test_depth_matched_reference_contour_scales_only_b16_and_preserves_b08_exactly(self) -> None:
        source_frames, source_summary = runtime.build_score_controls(
            REFERENCE_PLAN,
            slur_pitch_mode=runtime.SLUR_PITCH_MODE_HARD_STEP,
        )
        matched_frames, matched_summary = runtime.build_score_controls(
            DEPTH_MATCHED_REFERENCE_PLAN,
            slur_pitch_mode=runtime.SLUR_PITCH_MODE_HARD_STEP,
        )
        source_qa = source_summary["reference_contour_control_qa"]
        matched_qa = matched_summary["reference_contour_control_qa"]
        self.assertEqual(source_qa["status"], "reference_shape_unreviewed")
        self.assertEqual(matched_qa["status"], "reference_shape_depth_matched_unreviewed")
        event = matched_qa["events"][0]
        transform = event["depth_transform"]
        self.assertEqual(transform["operation"], "scale_to_max_abs_cents")
        self.assertEqual(transform["kind"], "linear_peak_abs_match")
        self.assertEqual(transform["source_max_abs_cents"], 34.047561)
        self.assertEqual(transform["target_max_abs_cents"], 18.0)
        self.assertEqual(transform["scale"], 0.5286722300020257)
        self.assertEqual(transform["transformed_embedded_source_max_abs_cents"], 18.0)
        self.assertTrue(transform["source_max_matches_embedded_points_gate_passed"])
        self.assertTrue(transform["scale_equals_target_over_source_gate_passed"])
        self.assertTrue(transform["transformed_embedded_source_hits_target_gate_passed"])
        self.assertTrue(transform["source_artifact_and_payload_identity_preserved"])
        self.assertFalse(transform["embedded_pitch_points_modified"])
        self.assertFalse(transform["learned_or_style_aligned_transform"])
        self.assertLessEqual(event["actual_runtime_max_abs_cents"], 18.0)
        self.assertAlmostEqual(event["actual_runtime_max_abs_cents"], 17.958564073355973, places=12)
        self.assertTrue(event["target_max_abs_not_exceeded_gate_passed"])
        self.assertEqual(event["active_control_frame_count"], 375)
        self.assertEqual(event["nonzero_interior_frame_count"], 373)
        self.assertEqual(matched_frames[8265]["vibrato_cents"], 0.0)
        self.assertEqual(matched_frames[8639]["vibrato_cents"], 0.0)
        self.assertEqual(matched_frames[8639]["f0_hz"], event["nominal_pitch_hz"])
        self.assertTrue(event["no_time_compression_gate_passed"])

        source_event = source_qa["events"][0]
        for key in (
            "candidate_id",
            "source_id",
            "source_sha256",
            "source_artifact_sha256",
            "contour_payload_sha256",
            "rights_status",
            "source_sample_count",
            "source_duration_seconds",
            "onset_seconds_relative",
            "fade_in_seconds",
            "fade_out_seconds",
        ):
            self.assertEqual(event[key], source_event[key])

        scale = transform["scale"]
        for source_frame, matched_frame in zip(source_frames[8265:8640], matched_frames[8265:8640]):
            self.assertAlmostEqual(
                matched_frame["vibrato_cents"],
                source_frame["vibrato_cents"] * scale,
                places=12,
            )
            for key in ("frame_index", "time_seconds", "loudness_linear", "voicing", "articulation", "event_id"):
                self.assertEqual(matched_frame[key], source_frame[key])

        # The existing contextual b08 yoseong and every one of its controls
        # remain byte-for-byte-equivalent in B2-R and B2-Rd.
        source_b08 = [frame for frame in source_frames if frame["event_id"] == "b08_e0_rearticulate"]
        matched_b08 = [frame for frame in matched_frames if frame["event_id"] == "b08_e0_rearticulate"]
        self.assertTrue(source_b08)
        self.assertEqual(matched_b08, source_b08)

        _, normalized, _ = runtime._validate_plan(DEPTH_MATCHED_REFERENCE_PLAN)
        release = normalized[-1]
        self.assertEqual(
            release["release_source"]["reference_contour_status"],
            "reference_shape_depth_matched_unreviewed",
        )
        release_frames = [frame for frame in matched_frames if frame["event_id"] == release["id"]]
        self.assertTrue(release_frames)
        self.assertTrue(all(frame["vibrato_cents"] == 0.0 for frame in release_frames))
        self.assertTrue(all(frame["f0_hz"] == event["nominal_pitch_hz"] for frame in release_frames))

    def test_depth_matched_reference_transform_fails_closed_on_any_mutation(self) -> None:
        source = json.loads(DEPTH_MATCHED_REFERENCE_PLAN.read_text(encoding="utf-8"))
        reference_index = next(
            index for index, event in enumerate(source["events"])
            if "reference_contour" in event
        )

        def reference(plan):
            return plan["events"][reference_index]["reference_contour"]

        mutations = {
            "missing_transform": lambda plan: reference(plan).pop("depth_transform"),
            "wrong_status": lambda plan: reference(plan).__setitem__("status", "reference_shape_unreviewed"),
            "wrong_kind": lambda plan: reference(plan)["depth_transform"].__setitem__("kind", "scale_to_max_abs_cents"),
            "source_max": lambda plan: reference(plan)["depth_transform"].__setitem__("source_max_abs_cents", 34.0),
            "target_max": lambda plan: reference(plan)["depth_transform"].__setitem__("target_max_abs_cents", 19.0),
            "scale": lambda plan: reference(plan)["depth_transform"].__setitem__("scale", 0.5),
            "tiny_scale_drift": lambda plan: reference(plan)["depth_transform"].__setitem__("scale", 0.5286722300020258),
            "nonfinite_scale": lambda plan: reference(plan)["depth_transform"].__setitem__("scale", float("nan")),
            "hidden_field": lambda plan: reference(plan)["depth_transform"].__setitem__("approved", True),
            "source_point_scaled": lambda plan: reference(plan)["normalized_reference_contour"]["pitch_residual_cents"].__setitem__(49, -18.0),
            "source_payload_hash": lambda plan: reference(plan)["normalized_reference_contour"].__setitem__("contour_payload_sha256", "0" * 64),
            "artifact_hash": lambda plan: reference(plan)["source_artifact"].__setitem__("sha256", "0" * 64),
            "claim_upgrade": lambda plan: reference(plan)["claim_limits"].__setitem__("gyeonggi_minyo_style_confirmed", True),
        }
        with tempfile.TemporaryDirectory() as temporary:
            for name, mutate in mutations.items():
                with self.subTest(name=name):
                    altered = copy.deepcopy(source)
                    mutate(altered)
                    path = Path(temporary) / f"invalid-depth-transform-{name}.json"
                    path.write_text(json.dumps(altered), encoding="utf-8")
                    with self.assertRaises(runtime.RuntimeContractError):
                        runtime.build_score_controls(path)

    def test_unreviewed_reference_contour_is_exact_1_5s_linear_and_zero_at_both_boundaries(self) -> None:
        frames, summary = runtime.build_score_controls(
            REFERENCE_PLAN,
            slur_pitch_mode=runtime.SLUR_PITCH_MODE_HARD_STEP,
        )
        qa = summary["reference_contour_control_qa"]
        self.assertTrue(qa["passed"])
        self.assertEqual(qa["status"], "reference_shape_unreviewed")
        self.assertEqual(qa["event_count"], 1)
        self.assertFalse(qa["learned_claim"])
        self.assertFalse(qa["style_aligned_claim"])
        self.assertFalse(qa["human_reviewed_claim"])
        self.assertFalse(qa["training_or_game_clearance"])
        event = qa["events"][0]
        self.assertEqual(event["event_id"], "b16_e0_rearticulate")
        self.assertEqual(event["source_sample_count"], 65)
        self.assertEqual(event["source_duration_seconds"], 1.5)
        self.assertEqual(event["applied_duration_seconds"], 1.5)
        self.assertEqual(event["onset_seconds_relative"], 0.66)
        self.assertEqual(event["fade_in_seconds"], 0.12)
        self.assertEqual(event["fade_out_seconds"], 0.12)
        self.assertEqual(event["active_control_frame_count"], 375)
        self.assertEqual(event["first_active_frame_index"], 8265)
        self.assertEqual(event["final_active_frame_index"], 8639)
        self.assertEqual(frames[8264]["vibrato_cents"], 0.0)
        self.assertEqual(frames[8265]["vibrato_cents"], 0.0)
        self.assertNotEqual(frames[8453]["vibrato_cents"], 0.0)
        elapsed = frames[8453]["time_seconds"] - (32.4 + 0.66)
        normalized = elapsed / 1.5
        progress = (normalized - 0.5) / (0.515625 - 0.5)
        expected = -20.101789 + (-4.709745 - -20.101789) * progress
        self.assertAlmostEqual(frames[8453]["vibrato_cents"], expected, places=9)
        self.assertEqual(frames[8639]["vibrato_cents"], 0.0)
        self.assertEqual(frames[8639]["f0_hz"], event["nominal_pitch_hz"])
        self.assertTrue(event["first_boundary_zero_gate_passed"])
        self.assertTrue(event["final_boundary_zero_gate_passed"])
        self.assertTrue(event["final_nominal_pitch_gate_passed"])
        self.assertTrue(event["no_time_compression_gate_passed"])
        self.assertAlmostEqual(
            event["final_source_normalized_time"],
            (1.5 - runtime.FRAME_RESOLUTION) / 1.5,
            places=12,
        )
        self.assertLess(event["final_source_normalized_time"], 1.0)
        self.assertFalse(event["source_endpoint_remapped_to_final_half_open_row"])

    def test_unreviewed_reference_contour_fails_closed_on_timing_points_hash_status_or_provenance(self) -> None:
        source = json.loads(REFERENCE_PLAN.read_text(encoding="utf-8"))
        reference_index = next(
            index for index, event in enumerate(source["events"])
            if "reference_contour" in event
        )

        def reference(plan):
            return plan["events"][reference_index]["reference_contour"]

        mutations = {
            "status": lambda plan: reference(plan).__setitem__("status", "learned"),
            "onset": lambda plan: reference(plan).__setitem__("onset_seconds", 0.65),
            "duration": lambda plan: reference(plan).__setitem__("duration_seconds", 1.49),
            "fade_in": lambda plan: reference(plan).__setitem__("fade_in_seconds", 0.10),
            "fade_out": lambda plan: reference(plan).__setitem__("fade_out_seconds", 0.10),
            "fade_shape": lambda plan: reference(plan).__setitem__("fade_shape", "minimum_jerk"),
            "artifact_hash": lambda plan: reference(plan)["source_artifact"].__setitem__("sha256", "0" * 64),
            "selection_status": lambda plan: reference(plan)["source_artifact"].__setitem__("selection_status", "reviewed"),
            "source_id": lambda plan: reference(plan)["source_artifact"].__setitem__("source_id", "other"),
            "claim_limit": lambda plan: reference(plan)["claim_limits"].__setitem__("human_reviewed", True),
            "point_without_rehash": lambda plan: reference(plan)["normalized_reference_contour"]["pitch_residual_cents"].__setitem__(10, 99.0),
            "nonincreasing_time": lambda plan: reference(plan)["normalized_reference_contour"]["time_normalized_0_to_1"].__setitem__(10, 0.140625),
            "wrong_point_count": lambda plan: reference(plan)["normalized_reference_contour"]["pitch_residual_cents"].pop(),
            "payload_hash": lambda plan: reference(plan)["normalized_reference_contour"].__setitem__("contour_payload_sha256", "0" * 64),
            "sine_overlap": lambda plan: plan["events"][reference_index].__setitem__("vibrato", {"enabled": True, "rate_hz": 3.45, "depth_cents": 18.0, "onset_seconds": 0.66, "ramp_seconds": 0.12}),
        }
        with tempfile.TemporaryDirectory() as temporary:
            for name, mutate in mutations.items():
                with self.subTest(name=name):
                    altered = copy.deepcopy(source)
                    mutate(altered)
                    path = Path(temporary) / f"invalid-reference-{name}.json"
                    path.write_text(json.dumps(altered), encoding="utf-8")
                    with self.assertRaises(runtime.RuntimeContractError):
                        runtime.build_score_controls(path)

    def test_reference_contour_release_stays_nominal_and_control_qa_rejects_boundary_corruption(self) -> None:
        frames, summary = runtime.build_score_controls(
            REFERENCE_PLAN,
            slur_pitch_mode=runtime.SLUR_PITCH_MODE_HARD_STEP,
        )
        _, events, _ = runtime._validate_plan(REFERENCE_PLAN)
        release = events[-1]
        self.assertEqual(release["articulation"], "release")
        self.assertEqual(
            release["release_source"]["reference_contour_status"],
            "reference_shape_unreviewed",
        )
        release_frames = [frame for frame in frames if frame["event_id"] == release["id"]]
        self.assertTrue(release_frames)
        self.assertTrue(all(frame["vibrato_cents"] == 0.0 for frame in release_frames))
        self.assertTrue(all(frame["f0_hz"] == release["release_source"]["nominal_pitch_hz"] for frame in release_frames))
        self.assertTrue(summary["release_vibrato_qa"]["final_nominal_pitch_gate_passed"])

        corrupted = copy.deepcopy(frames)
        corrupted[8639]["vibrato_cents"] = 1.0
        with self.assertRaisesRegex(runtime.RuntimeContractError, "reference contour control row"):
            runtime.reference_contour_control_qa(corrupted, events)

    def test_selected_late_yoseong_fades_to_nominal_on_the_last_event_row(self) -> None:
        baseline, _ = runtime.build_score_controls(
            PLAN,
            slur_pitch_mode=runtime.SLUR_PITCH_MODE_HARD_STEP,
        )
        candidate, summary = runtime.build_score_controls(
            AUDITION_PLAN,
            slur_pitch_mode=runtime.SLUR_PITCH_MODE_HARD_STEP,
        )
        _, events, _ = runtime._validate_plan(AUDITION_PLAN)
        selected = events[0]
        self.assertEqual(selected["id"], "b08_e0_breath")
        self.assertEqual(selected["vibrato"]["end_fade_seconds"], 0.18)
        selected_frames = [frame for frame in candidate if frame["event_id"] == selected["id"]]
        self.assertTrue(any(abs(frame["vibrato_cents"]) > 1.0 for frame in selected_frames))
        self.assertAlmostEqual(selected_frames[-1]["vibrato_cents"], 0.0, places=12)
        self.assertAlmostEqual(selected_frames[-1]["f0_hz"], selected["pitch_hz"], places=10)
        for base_frame, candidate_frame in zip(baseline, candidate):
            for field in ("loudness_linear", "voicing", "articulation", "event_id"):
                self.assertEqual(base_frame[field], candidate_frame[field])
        self.assertTrue(summary["release_vibrato_qa"]["final_nominal_pitch_gate_passed"])

    def test_vibrato_end_fade_rejects_subframe_and_overlong_values(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            source = json.loads(AUDITION_PLAN.read_text(encoding="utf-8"))
            for value, message in ((0.001, "one 250 Hz control frame"), (1.45, "permitted range")):
                altered = copy.deepcopy(source)
                altered["events"][0]["vibrato"]["end_fade_seconds"] = value
                path = Path(temporary) / f"invalid-end-fade-{value}.json"
                path.write_text(json.dumps(altered), encoding="utf-8")
                with self.assertRaisesRegex(runtime.RuntimeContractError, message):
                    runtime.build_score_controls(path)

    def test_250hz_controls_preserve_explicit_score_states(self) -> None:
        frames, summary = runtime.build_score_controls(PLAN)
        self.assertEqual(summary["frame_count"], 1680)
        self.assertEqual(summary["articulation_frame_counts"], {"rest": 180, "breath_start": 720, "rearticulate": 180, "slur": 540, "release": 60})
        self.assertEqual(frames[0]["articulation"], "breath_start")
        self.assertEqual(frames[360]["articulation"], "rest")
        self.assertEqual(frames[540]["articulation"], "breath_start")
        self.assertEqual(frames[900]["articulation"], "rearticulate")
        self.assertEqual(frames[1080]["articulation"], "slur")
        self.assertEqual(frames[1620]["articulation"], "release")
        # Release keeps the source vibrato clock advancing instead of freezing
        # the last (negative) vibrato offset, then closes exactly on nominal
        # pitch at the final half-open 250 Hz control row.
        _, events, _ = runtime._validate_plan(PLAN)
        source_event = events[-2]
        release_event = events[-1]
        source_elapsed = source_event["end_seconds"] - source_event["start_seconds"]
        expected_release_entry_cents = runtime._vibrato_cents(source_event, source_elapsed)
        self.assertAlmostEqual(frames[1620]["vibrato_cents"], expected_release_entry_cents, places=10)
        self.assertAlmostEqual(
            frames[1620]["f0_hz"],
            source_event["pitch_hz"] * 2 ** (expected_release_entry_cents / 1200.0),
            places=10,
        )
        self.assertAlmostEqual(frames[1679]["vibrato_cents"], 0.0, places=12)
        self.assertAlmostEqual(frames[1679]["f0_hz"], source_event["pitch_hz"], places=10)
        self.assertEqual(release_event["release_source"]["event_id"], source_event["id"])
        self.assertEqual(release_event["release_source"]["nominal_pitch_hz"], source_event["pitch_hz"])
        self.assertEqual(release_event["release_source"]["vibrato"], source_event["vibrato"])
        self.assertTrue(summary["release_vibrato_policy"]["final_control_row_closes_on_nominal_pitch"])
        self.assertTrue(summary["release_vibrato_qa"]["passed"])
        self.assertTrue(summary["release_vibrato_qa"]["final_nominal_pitch_gate_passed"])
        self.assertEqual(
            summary["release_vibrato_qa"]["policy"]["phase_continuity"],
            "source_vibrato_clock_continues_without_reset",
        )
        # The release maps its fixed event-start level once; it is not a
        # per-frame recursive attenuation.
        self.assertAlmostEqual(frames[1650]["loudness_linear"], 10 ** (-29 / 20) * (0.5 ** 1.35), places=10)
        # The second slur is a 12 ms log-frequency minimum-jerk fingering
        # change: at 5.044 / 5.048 it moves monotonically, then is already
        # at target on the 5.052 control row (and therefore well before 50ms).
        self.assertAlmostEqual(frames[1261]["f0_hz"], 673.5107882753397, places=6)
        self.assertAlmostEqual(frames[1262]["f0_hz"], 609.0832061954886, places=6)
        self.assertAlmostEqual(frames[1263]["f0_hz"], 587.329536, places=6)
        self.assertAlmostEqual(frames[1273]["f0_hz"], 587.329536, places=6)
        # Its separately authored -29→-30 dB dynamic has no onset jump and
        # settles smoothly to its target by 100 ms.
        self.assertAlmostEqual(frames[1260]["loudness_linear"], frames[1259]["loudness_linear"], places=12)
        self.assertLess(frames[1261]["loudness_linear"], frames[1260]["loudness_linear"])
        self.assertAlmostEqual(frames[1285]["loudness_linear"], 10 ** (-30 / 20), places=12)
        qa = summary["slur_transition_control_qa"]
        self.assertTrue(qa["passed"])
        self.assertEqual(qa["policy"]["pitch_transition_milliseconds"], 12)
        second_slur = qa["events"][1]
        self.assertTrue(second_slur["pitch_target_settle_by_50ms_gate_passed"])
        self.assertTrue(second_slur["dynamic_target_by_100ms_gate_passed"])
        self.assertLess(second_slur["intermediate_dwell_seconds"], 0.020)
        self.assertEqual(frames[360]["f0_hz"], 0.0)
        self.assertEqual(frames[360]["loudness_linear"], 0.0)
        self.assertEqual(summary["renderer_gate"]["audio_rate_upsampling"], "linear interpolation from the compiled 250 Hz voicing curve")
        self.assertEqual(summary["renderer_gate"]["written_rest_entry_fades"], [{"rest_start_frame": 360, "rest_start_seconds": 1.44, "fade_start_frame": 356, "fade_start_seconds": 1.424, "fade_duration_seconds": 0.016}])
        self.assertEqual(summary["renderer_gate"]["hard_zero_rest_ranges"], [{"start_frame": 360, "end_frame_exclusive": 540, "start_seconds": 1.44, "end_seconds": 2.16, "start_sample": 23040, "end_sample_exclusive": 34560}])
        self.assertAlmostEqual(
            frames[1515]["vibrato_cents"],
            runtime._vibrato_cents(source_event, frames[1515]["time_seconds"] - source_event["start_seconds"]),
            places=10,
        )
        self.assertAlmostEqual(frames[100]["loudness_linear"], 10 ** (-30 / 20), places=8)
        self.assertAlmostEqual(frames[800]["loudness_linear"], 10 ** (-28 / 20), places=8)
        breath_qa = summary["breath_start_boundary_qa"]
        self.assertTrue(breath_qa["passed"])
        self.assertFalse(breath_qa["touching_breath_start_after_voiced_event_allowed"])
        self.assertEqual(breath_qa["events"][1]["rest_control_frame_count"], 180)

    def test_touching_breath_start_after_voiced_event_fails_without_changing_onset(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            altered = json.loads(PLAN.read_text(encoding="utf-8"))
            altered["events"][1]["start_seconds"] = altered["events"][0]["end_seconds"]
            path = Path(temporary) / "touching-breath.json"
            path.write_text(json.dumps(altered), encoding="utf-8")
            with self.assertRaisesRegex(runtime.RuntimeContractError, "authored gap"):
                runtime.build_score_controls(path)

    def test_all_valid_slur_candidates_settle_and_keep_intermediate_dwell_below_20ms(self) -> None:
        expected_dwell_seconds = {8: 0.004, 12: 0.008, 20: 0.016}
        for milliseconds, expected_dwell in expected_dwell_seconds.items():
            frames, summary = runtime.build_score_controls(PLAN, slur_transition_milliseconds=milliseconds)
            second_slur = summary["slur_transition_control_qa"]["events"][1]
            self.assertAlmostEqual(second_slur["intermediate_dwell_seconds"], expected_dwell, places=12)
            self.assertLess(second_slur["intermediate_dwell_seconds"], 0.020)
            self.assertTrue(second_slur["pitch_target_settle_by_50ms_gate_passed"])
            self.assertTrue(second_slur["dynamic_target_by_100ms_gate_passed"])
            self.assertAlmostEqual(frames[1273]["f0_hz"], 587.329536, places=6)
        with self.assertRaisesRegex(runtime.RuntimeContractError, "validated candidates"):
            runtime.build_score_controls(PLAN, slur_transition_milliseconds=16)

    def test_default_is_still_canonical_12ms_and_hard_step_is_separate(self) -> None:
        default_frames, default_summary = runtime.build_score_controls(PLAN)
        explicit_frames, explicit_summary = runtime.build_score_controls(
            PLAN,
            slur_transition_milliseconds=12,
            slur_pitch_mode=runtime.SLUR_PITCH_MODE_CURVE,
        )
        self.assertEqual(default_frames, explicit_frames)
        self.assertEqual(default_summary, explicit_summary)
        self.assertEqual(runtime.SLUR_TRANSITION_MILLISECONDS, 12)
        self.assertEqual(runtime.SLUR_TRANSITION_CANDIDATE_MILLISECONDS, (8, 12, 20))
        self.assertAlmostEqual(default_frames[1261]["f0_hz"], 673.5107882753397, places=6)
        self.assertAlmostEqual(default_frames[1262]["f0_hz"], 609.0832061954886, places=6)

    def test_hard_step_has_zero_control_dwell_and_preserves_nonpitch_controls(self) -> None:
        canonical, canonical_summary = runtime.build_score_controls(PLAN)
        hard, hard_summary = runtime.build_score_controls(
            PLAN,
            slur_pitch_mode=runtime.SLUR_PITCH_MODE_HARD_STEP,
        )
        self.assertAlmostEqual(hard[1259]["f0_hz"], 698.456463, places=6)
        self.assertAlmostEqual(hard[1260]["f0_hz"], 587.329536, places=6)
        self.assertAlmostEqual(hard[1439]["f0_hz"], 587.329536, places=6)
        self.assertAlmostEqual(hard[1440]["f0_hz"], 523.251131, places=6)
        for canonical_frame, hard_frame in zip(canonical, hard):
            for field in ("loudness_linear", "voicing", "articulation", "event_id", "vibrato_cents"):
                self.assertEqual(canonical_frame[field], hard_frame[field])
        qa = hard_summary["slur_transition_control_qa"]
        self.assertEqual(qa["policy"]["pitch_mode"], runtime.SLUR_PITCH_MODE_HARD_STEP)
        self.assertEqual(qa["policy"]["pitch_domain"], "control_frame_f0_discontinuity")
        self.assertEqual(qa["policy"]["intermediate_pitch_dwell_seconds"], 0.0)
        for event in qa["events"]:
            self.assertEqual(event["intermediate_frame_count"], 0)
            self.assertEqual(event["intermediate_dwell_seconds"], 0.0)
            self.assertLessEqual(event["target_control_arrival_seconds"], 0.008)
            self.assertTrue(event["pitch_target_settle_by_8ms_gate_passed"])
            self.assertTrue(event["pitch_target_settle_by_50ms_gate_passed"])
            self.assertTrue(event["no_reattack_and_dynamic_continuity_gate_passed"])
        difference = runtime.verify_diagnostic_control_difference(
            canonical,
            hard,
            canonical_summary["slur_transition_control_qa"],
        )
        self.assertTrue(difference["passed"])
        self.assertTrue(difference["non_f0_controls_exactly_equal"])

    def test_release_vibrato_phase_and_nominal_close_regress_for_both_pitch_modes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            altered = json.loads(PLAN.read_text(encoding="utf-8"))
            altered["events"][-2]["vibrato"] = {
                "enabled": True,
                "rate_hz": 3.45,
                "depth_cents": 23.0,
                "onset_seconds": 0.2,
                "ramp_seconds": 0.08,
            }
            path = Path(temporary) / "release-vibrato-plan.json"
            path.write_text(json.dumps(altered), encoding="utf-8")
            _, events, _ = runtime._validate_plan(path)
            source = events[-2]
            source_duration = source["end_seconds"] - source["start_seconds"]
            release_duration = events[-1]["end_seconds"] - events[-1]["start_seconds"]
            fade_span = release_duration - runtime.FRAME_RESOLUTION
            modes = (runtime.SLUR_PITCH_MODE_CURVE, runtime.SLUR_PITCH_MODE_HARD_STEP)
            rendered = {}
            for mode in modes:
                frames, summary = runtime.build_score_controls(path, slur_pitch_mode=mode)
                rendered[mode] = frames
                for frame_index in (1620, 1621, 1630, 1650, 1678):
                    frame = frames[frame_index]
                    local = frame["time_seconds"] - events[-1]["start_seconds"]
                    source_phase_cents = runtime._vibrato_cents(source, source_duration + local)
                    depth = 1.0 - runtime._minimum_jerk_progress(local / fade_span)
                    self.assertAlmostEqual(frame["vibrato_cents"], source_phase_cents * depth, places=10)
                self.assertAlmostEqual(frames[-1]["vibrato_cents"], 0.0, places=12)
                self.assertAlmostEqual(frames[-1]["f0_hz"], source["pitch_hz"], places=10)
                self.assertTrue(summary["release_vibrato_qa"]["passed"])
                self.assertTrue(summary["release_vibrato_qa"]["final_nominal_pitch_gate_passed"])
            self.assertEqual(
                [frame["vibrato_cents"] for frame in rendered[runtime.SLUR_PITCH_MODE_CURVE]],
                [frame["vibrato_cents"] for frame in rendered[runtime.SLUR_PITCH_MODE_HARD_STEP]],
            )
            self.assertEqual(
                [frame["f0_hz"] for frame in rendered[runtime.SLUR_PITCH_MODE_CURVE][1620:]],
                [frame["f0_hz"] for frame in rendered[runtime.SLUR_PITCH_MODE_HARD_STEP][1620:]],
            )
            phase_reset = copy.deepcopy(rendered[runtime.SLUR_PITCH_MODE_HARD_STEP])
            phase_reset[1620]["vibrato_cents"] = 0.0
            phase_reset[1620]["f0_hz"] = source["pitch_hz"]
            with self.assertRaisesRegex(runtime.RuntimeContractError, "source phase"):
                runtime.release_vibrato_control_qa(phase_reset, events)
            frozen_final = copy.deepcopy(rendered[runtime.SLUR_PITCH_MODE_HARD_STEP])
            frozen_final[-1]["vibrato_cents"] = -22.587173112776085
            frozen_final[-1]["f0_hz"] = 516.4686863056723
            with self.assertRaisesRegex(runtime.RuntimeContractError, "source phase"):
                runtime.release_vibrato_control_qa(frozen_final, events)

    def test_release_cannot_hide_a_new_vibrato_declaration(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            altered = json.loads(PLAN.read_text(encoding="utf-8"))
            altered["events"][-1]["vibrato"] = {"enabled": False}
            path = Path(temporary) / "invalid-release-vibrato.json"
            path.write_text(json.dumps(altered), encoding="utf-8")
            with self.assertRaisesRegex(runtime.RuntimeContractError, "inherits its source vibrato"):
                runtime.build_score_controls(path)

    def test_hard_step_qa_rejects_intermediate_same_pitch_corruption_and_reattack(self) -> None:
        hard, _ = runtime.build_score_controls(PLAN, slur_pitch_mode=runtime.SLUR_PITCH_MODE_HARD_STEP)
        _, events, _ = runtime._validate_plan(PLAN)

        intermediate = copy.deepcopy(hard)
        intermediate[1261]["f0_hz"] = (698.456463 + 587.329536) / 2.0
        with self.assertRaisesRegex(runtime.RuntimeContractError, "target F0"):
            runtime.slur_transition_control_qa(
                intermediate,
                events,
                transition_seconds=runtime.SLUR_TRANSITION_SECONDS,
                pitch_mode=runtime.SLUR_PITCH_MODE_HARD_STEP,
            )

        same_pitch = copy.deepcopy(hard)
        same_pitch[1081]["f0_hz"] += 5.0
        with self.assertRaisesRegex(runtime.RuntimeContractError, "target F0"):
            runtime.slur_transition_control_qa(
                same_pitch,
                events,
                transition_seconds=runtime.SLUR_TRANSITION_SECONDS,
                pitch_mode=runtime.SLUR_PITCH_MODE_HARD_STEP,
            )

        reattack = copy.deepcopy(hard)
        reattack[1262]["voicing"] = 0.5
        with self.assertRaisesRegex(runtime.RuntimeContractError, "re-attack"):
            runtime.slur_transition_control_qa(
                reattack,
                events,
                transition_seconds=runtime.SLUR_TRANSITION_SECONDS,
                pitch_mode=runtime.SLUR_PITCH_MODE_HARD_STEP,
            )

        loudness_jump = copy.deepcopy(hard)
        loudness_jump[1260]["loudness_linear"] *= 0.5
        with self.assertRaisesRegex(runtime.RuntimeContractError, "authored dynamic"):
            runtime.slur_transition_control_qa(
                loudness_jump,
                events,
                transition_seconds=runtime.SLUR_TRANSITION_SECONDS,
                pitch_mode=runtime.SLUR_PITCH_MODE_HARD_STEP,
            )

    def test_hard_step_off_grid_boundary_accepts_target_with_immediate_vibrato(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            altered = json.loads(PLAN.read_text(encoding="utf-8"))
            altered["events"][3]["end_seconds"] = 5.042
            altered["events"][4]["start_seconds"] = 5.042
            altered["events"][4]["vibrato"] = {
                "enabled": True,
                "rate_hz": 3.45,
                "depth_cents": 20.0,
                "onset_seconds": 0.0,
                "ramp_seconds": 0.005,
            }
            path = Path(temporary) / "off-grid-plan.json"
            path.write_text(json.dumps(altered), encoding="utf-8")
            frames, summary = runtime.build_score_controls(
                path,
                slur_pitch_mode=runtime.SLUR_PITCH_MODE_HARD_STEP,
            )
            event = next(item for item in summary["slur_transition_control_qa"]["events"] if item["event_id"] == "b10_e1_slur")
            self.assertGreater(frames[1261]["vibrato_cents"], 0.0)
            self.assertAlmostEqual(event["target_control_arrival_seconds"], 0.002, places=12)
            self.assertLess(event["target_control_arrival_seconds"], 0.004)

    def test_invalid_hard_step_combinations_are_rejected(self) -> None:
        common = [
            "--plan", str(PLAN),
            "--gugak-source-root", "gugak",
            "--ddsp-pytorch-root", "ddsp",
            "--checkpoint", "model.pth",
            "--checkpoint-config", "model.pth.config",
        ]
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                runtime.parse_args(["--execute", "--output-dir", "out", "--experimental-hard-f0-step", "--slur-transition-ms", "8", *common])
            with self.assertRaises(SystemExit):
                runtime.parse_args(["--check", "--experimental-hard-f0-step", *common])
            with self.assertRaises(SystemExit):
                runtime.parse_args(["--execute", "--output-dir", "out", "--component-diagnostics", "--max-seconds", "1.0", *common])
        with self.assertRaisesRegex(runtime.RuntimeContractError, "pitch mode"):
            runtime.build_score_controls(PLAN, slur_pitch_mode="unknown")

    def test_full_score_gain_cli_is_explicit_and_reuse_requires_reverb(self) -> None:
        common = [
            "--plan", str(PLAN),
            "--gugak-source-root", "gugak",
            "--ddsp-pytorch-root", "ddsp",
            "--checkpoint", "model.pth",
            "--checkpoint-config", "model.pth.config",
        ]
        b0 = runtime.parse_args([
            "--execute", "--output-dir", "out",
            "--checkpoint-native-reverb",
            "--shared-interval-end-seconds", "34.56",
            "--listening-gain-source-slot", "B0",
            *common,
        ])
        self.assertEqual(b0.shared_interval_end_seconds, 34.56)
        self.assertEqual(b0.listening_gain_source_slot, "B0")
        self.assertIsNone(b0.reuse_checkpoint_native_reverb_gain_from_report)
        b1 = runtime.parse_args([
            "--execute", "--output-dir", "out",
            "--checkpoint-native-reverb",
            "--shared-interval-end-seconds", "34.56",
            "--reuse-checkpoint-native-reverb-gain-from-report", "b0/runtime_report.json",
            *common,
        ])
        self.assertEqual(b1.reuse_checkpoint_native_reverb_gain_from_report, Path("b0/runtime_report.json"))
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                runtime.parse_args([
                    "--execute", "--output-dir", "out",
                    "--reuse-checkpoint-native-reverb-gain-from-report", "b0/runtime_report.json",
                    *common,
                ])
            with self.assertRaises(SystemExit):
                runtime.parse_args([
                    "--execute", "--output-dir", "out",
                    "--checkpoint-native-reverb",
                    "--listening-gain-source-slot", "B1",
                    "--reuse-checkpoint-native-reverb-gain-from-report", "b0/runtime_report.json",
                    *common,
                ])

    def test_hard_step_compiler_check_keeps_canonical_policy_and_marks_formula_na(self) -> None:
        expected_policy = {
            "pitch_transition_milliseconds": runtime.SLUR_TRANSITION_MILLISECONDS,
            "pitch_shape": runtime.SLUR_TRANSITION_SHAPE,
            "pitch_domain": "log_frequency_cents",
            "pitch_target_settle_by_seconds": runtime.SLUR_TARGET_ATTACH_SECONDS,
            "intermediate_pitch_dwell_strictly_less_than_seconds": runtime.SLUR_MAX_INTERMEDIATE_DWELL_SECONDS,
            "dynamic_transition_seconds": runtime.SLUR_LOUDNESS_TRANSITION_SECONDS,
            "dynamic_shape": runtime.SLUR_LOUDNESS_TRANSITION_SHAPE,
            "dynamic_domain": "linear_loudness",
            "dynamic_target_settle_by_seconds": runtime.SLUR_LOUDNESS_TARGET_SETTLE_SECONDS,
            "no_rearticulation_envelope_for_slur": True,
        }
        with tempfile.TemporaryDirectory() as temporary:
            compiler = Path(temporary) / "tools/score-expression/compile_expression.py"
            compiler.parent.mkdir(parents=True)
            compiler.write_text(
                f"SLUR_TRANSITION_SECONDS = {runtime.SLUR_TRANSITION_SECONDS!r}\n"
                f"def slur_transition_policy():\n    return {expected_policy!r}\n",
                encoding="utf-8",
            )
            _, events, _ = runtime._validate_plan(PLAN)
            report = runtime.verify_compiler_slur_policy_equivalence(
                Path(temporary),
                events,
                requested_transition_seconds=runtime.SLUR_TRANSITION_SECONDS,
                pitch_mode=runtime.SLUR_PITCH_MODE_HARD_STEP,
            )
        self.assertTrue(report["canonical_default_policy_match"])
        self.assertIsNone(report["requested_runtime_candidate_milliseconds"])
        self.assertFalse(report["candidate_formula_equivalence"]["applicable"])
        self.assertEqual(report["candidate_formula_equivalence"]["status"], "not_applicable")
        self.assertEqual(report["probes"], [])

    def test_missing_explicit_slur_link_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            altered = json.loads(PLAN.read_text(encoding="utf-8"))
            altered["events"][3].pop("slur_from_previous")
            path = Path(temporary) / "invalid-plan.json"
            path.write_text(json.dumps(altered), encoding="utf-8")
            with self.assertRaisesRegex(runtime.RuntimeContractError, "slur"):
                runtime.build_score_controls(path)

    def test_fresh_output_must_be_an_ignored_rnd_child(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "_bgm_rnd").mkdir()
            fresh = root / "_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-142001"
            self.assertEqual(runtime._require_fresh_output(root, fresh), fresh.resolve())
            fresh.mkdir()
            with self.assertRaisesRegex(runtime.RuntimeContractError, "already exists"):
                runtime._require_fresh_output(root, fresh)
            with self.assertRaisesRegex(runtime.RuntimeContractError, "fresh direct child"):
                runtime._require_fresh_output(root, root / "elsewhere")

    def test_shared_interval_level_match_uses_one_gain_and_rejects_clipping(self) -> None:
        active_count = int(runtime.SHARED_INTERVAL_END_SECONDS * runtime.SAMPLE_RATE_HZ)
        samples = [0.01] * active_count + [0.02, -0.02]
        scaled, record = runtime.level_match_shared_interval_whole_file(samples)
        self.assertEqual(record["shared_interval_sample_count"], active_count)
        self.assertEqual(record["shared_interval_end_seconds"], runtime.SHARED_INTERVAL_END_SECONDS)
        self.assertEqual(record["gain_derivation"], "derived_from_current_render_shared_interval_rms")
        self.assertEqual(record["gain_source_slot"], "current_render")
        self.assertIsNone(record["fixed_gain_reference"])
        self.assertFalse(record["compression_or_limiter"])
        self.assertAlmostEqual(record["post_gain_shared_interval_rms"], runtime.LISTENING_TARGET_RMS, places=12)
        self.assertAlmostEqual(scaled[-1] / samples[-1], record["constant_gain_applied_to_entire_file"], places=12)
        with self.assertRaisesRegex(runtime.RuntimeContractError, "would clip"):
            runtime.level_match_shared_interval_whole_file([0.001] * active_count + [1.0])

    def test_full_score_monitoring_interval_validation_is_explicit_and_sample_aligned(self) -> None:
        end, count = runtime._shared_interval_sample_count(
            34.56,
            available_sample_count=int(34.8 * runtime.SAMPLE_RATE_HZ),
        )
        self.assertEqual(end, 34.56)
        self.assertEqual(count, 552_960)
        with self.assertRaisesRegex(runtime.RuntimeContractError, "audio sample grid"):
            runtime._shared_interval_sample_count(34.56001, available_sample_count=600_000)
        with self.assertRaisesRegex(runtime.RuntimeContractError, "score-length"):
            runtime._shared_interval_sample_count(34.56, available_sample_count=count - 1)

    def test_prior_fixed_gain_is_applied_exactly_without_limiter_or_renormalization(self) -> None:
        samples = [0.01, -0.02, 0.03, -0.04] * 16
        provenance = {"output_directory": "source", "report": {"sha256": "abc"}}
        scaled, record = runtime.apply_fixed_listening_gain_whole_file(
            samples,
            fixed_gain=2.5,
            shared_interval_end_seconds=runtime.FRAME_RESOLUTION,
            target_rms=runtime.LISTENING_TARGET_RMS,
            gain_source_slot="B0",
            fixed_gain_reference=provenance,
        )
        self.assertEqual(record["constant_gain_applied_to_entire_file"], 2.5)
        self.assertEqual(record["gain_source_slot"], "B0")
        self.assertEqual(record["gain_derivation"], "reused_exactly_from_prior_runtime_report")
        self.assertEqual(record["fixed_gain_reference"], provenance)
        self.assertFalse(record["independent_candidate_normalization"])
        self.assertFalse(record["compression_or_limiter"])
        self.assertFalse(record["clipping_limited"])
        self.assertEqual(scaled[-1], samples[-1] * 2.5)
        with self.assertRaisesRegex(runtime.RuntimeContractError, "would clip"):
            runtime.apply_fixed_listening_gain_whole_file(
                [0.5] * 64,
                fixed_gain=2.0,
                shared_interval_end_seconds=runtime.FRAME_RESOLUTION,
                target_rms=runtime.LISTENING_TARGET_RMS,
                gain_source_slot="B0",
                fixed_gain_reference=provenance,
            )

    def test_fixed_gain_reference_is_direct_safe_and_interval_matched(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / "_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-220000-full-b0"
            output.mkdir(parents=True)
            report_path = output / "runtime_report.json"
            report = {
                "schema": runtime.TOOL_SCHEMA,
                "status": "succeeded",
                "checkpoint": {"checkpoint": {"sha256": runtime.EXPECTED_CHECKPOINT_SHA256}},
                "checkpoint_native_reverb_audition": {
                    "level_match": {
                        "gain_derivation": "derived_from_current_render_shared_interval_rms",
                        "gain_source_slot": "B0",
                        "fixed_gain_reference": None,
                        "compression_or_limiter": False,
                        "clipping_limited": False,
                        "shared_interval_start_seconds": 0.0,
                        "shared_interval_end_seconds": 34.56,
                        "shared_interval_sample_count": 552_960,
                        "target_shared_interval_rms": runtime.LISTENING_TARGET_RMS,
                        "constant_gain_applied_to_entire_file": 1.75,
                    }
                },
            }
            report_path.write_text(json.dumps(report), encoding="utf-8")
            loaded = runtime.load_checkpoint_native_reverb_gain_reference(
                report_path,
                repository_root=root,
                shared_interval_end_seconds=34.56,
                checkpoint_sha256=runtime.EXPECTED_CHECKPOINT_SHA256,
            )
            self.assertEqual(loaded["constant_gain"], 1.75)
            self.assertEqual(loaded["gain_source_slot"], "B0")
            self.assertEqual(loaded["provenance"]["report"]["sha256"], runtime._sha256(report_path))
            with self.assertRaisesRegex(runtime.RuntimeContractError, "does not match"):
                runtime.load_checkpoint_native_reverb_gain_reference(
                    report_path,
                    repository_root=root,
                    shared_interval_end_seconds=6.48,
                    checkpoint_sha256=runtime.EXPECTED_CHECKPOINT_SHA256,
                )

    def test_shared_fixed_gain_and_latent_delta_helpers_do_not_normalize_candidates_independently(self) -> None:
        active_count = int(runtime.SHARED_INTERVAL_END_SECONDS * runtime.SAMPLE_RATE_HZ)
        canonical = [0.01] * active_count
        hard = [0.02] * active_count
        scaled, record = runtime.apply_shared_fixed_listening_gain(
            canonical,
            {"canonical_12ms": canonical, "experimental_hard_step": hard},
            reference_label="canonical_12ms",
        )
        gain = record["constant_gain_applied_to_every_candidate"]
        self.assertAlmostEqual(scaled["canonical_12ms"][0], canonical[0] * gain, places=12)
        self.assertAlmostEqual(scaled["experimental_hard_step"][0], hard[0] * gain, places=12)
        self.assertFalse(record["independent_candidate_normalization"])

        point = {"frame_index": 10, "time_seconds": 0.04, "a": 0.5, "c": [0.25, 0.75], "H": [0.2, 0.4]}
        canonical_payload = {"latent_probes": {"move": {"+100ms": point}}}
        hard_point = {**point, "a": 0.55, "c": [0.3, 0.7], "H": [0.25, 0.35]}
        hard_payload = {"latent_probes": {"move": {"+100ms": hard_point}}}
        comparison = runtime.compare_latent_probes(canonical_payload, hard_payload)
        carry = comparison["events"]["move"]["plus_100ms_recurrent_carry"]
        self.assertAlmostEqual(carry["hard_minus_canonical_a"], 0.05, places=12)
        self.assertFalse(comparison["decoder_outputs_manually_modified"])
        with self.assertRaisesRegex(runtime.RuntimeContractError, "non-finite"):
            runtime.apply_shared_fixed_listening_gain(
                [float("nan")] * runtime.HOP_LENGTH,
                {"bad": [float("nan")] * runtime.HOP_LENGTH},
                reference_label="bad",
                shared_interval_end_seconds=runtime.FRAME_RESOLUTION,
            )
        with self.assertRaisesRegex(runtime.RuntimeContractError, "non-finite"):
            runtime._vector_delta_metrics([float("inf")], [0.0], label="synthetic")

    def test_release_boundary_qa_rejects_an_artificial_cliff(self) -> None:
        frames, _ = runtime.build_score_controls(PLAN)
        boundary = 1620 * runtime.HOP_LENGTH
        samples = [0.1] * (boundary + 320)
        passed = runtime.release_boundary_qa(samples, frames)
        self.assertTrue(passed["passed"])
        samples[boundary:boundary + 320] = [0.001] * 320
        with self.assertRaisesRegex(runtime.RuntimeContractError, "energy cliff"):
            runtime.release_boundary_qa(samples, frames)

    def test_pcm16_writer_is_deterministic_without_audio_library(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "synthetic.wav"
            record = runtime.write_pcm16_wav(path, [0.0, 0.25, -0.25, 0.0], sample_rate=16_000)
            self.assertEqual(record["sample_count"], 4)
            with wave.open(str(path), "rb") as source:
                self.assertEqual(source.getframerate(), 16_000)
                self.assertEqual(source.getnframes(), 4)


if __name__ == "__main__":
    unittest.main()
