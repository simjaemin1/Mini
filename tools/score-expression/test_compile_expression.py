"""Deterministic contract tests for explicit score-to-expression controls."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
RUNTIME_HERE = HERE.parent / "ddsp-gugak-public-runtime"
if str(RUNTIME_HERE) not in sys.path:
    sys.path.insert(0, str(RUNTIME_HERE))

import compile_expression as compiler
import build_full_ari_plans as full_ari
import ddsp_gugak_public_runtime as runtime


TRACKED_SOURCE_LED_ARI_PLAN = HERE / "plans" / "ari_source_led_response_r1.json"
GYEONGGI_POLICY_AUDITION_PLAN = HERE / "plans" / "ari_gyeonggi_policy_r1_audition.json"
FULL_ARI_B0_PLAN = HERE / "plans" / full_ari.B0_FILENAME
FULL_ARI_B1_PLAN = HERE / "plans" / full_ari.B1_FILENAME


def _scope() -> dict[str, bool]:
    return {
        "r_and_d_only": True,
        "no_default_assets": True,
        "no_runtime_bgm": True,
        "no_game_output": True,
        "no_public_release": True,
    }


def _plan() -> dict[str, object]:
    return {
        "schema": compiler.PLAN_SCHEMA,
        "r_and_d_scope": _scope(),
        "instrument": {"id": "daegeum", "sustained": True},
        # A dense deterministic fixture makes the exact boundary samples
        # observable.  It is still aligned to the 48 kHz timeline.
        "control_hz": 1000,
        "events": [
            {
                "id": "breath",
                "start_seconds": 0.0,
                "end_seconds": 0.10,
                "pitch_hz": 440.0,
                "articulation": "breath_start",
                "steady_loudness_db": -28.0,
            },
            {
                "id": "tongue",
                "start_seconds": 0.10,
                "end_seconds": 0.20,
                "pitch_hz": 440.0,
                "articulation": "rearticulate",
                "steady_loudness_db": -28.0,
            },
            {
                "id": "slur-down",
                "start_seconds": 0.20,
                "end_seconds": 0.30,
                "pitch_hz": 392.0,
                "articulation": "slur",
                "slur_from_previous": True,
                "steady_loudness_db": -30.0,
                "vibrato": {
                    "enabled": True,
                    "rate_hz": 3.45,
                    "depth_cents": 23.0,
                    "onset_seconds": 0.02,
                    "ramp_seconds": 0.01,
                },
            },
            {
                "id": "release",
                "start_seconds": 0.30,
                "end_seconds": 0.35,
                "articulation": "release",
            },
        ],
    }


def _write_plan(root: Path, payload: dict[str, object]) -> Path:
    path = root / "explicit-plan.json"
    path.write_text(json.dumps(payload, sort_keys=True), encoding="utf-8")
    return path


class CompileExpressionTests(unittest.TestCase):
    def test_compiler_and_runtime_match_the_12ms_log_frequency_minimum_jerk_policy(self) -> None:
        self.assertEqual(compiler.SLUR_TRANSITION_MILLISECONDS, runtime.SLUR_TRANSITION_MILLISECONDS)
        self.assertEqual(compiler.SLUR_TRANSITION_CANDIDATE_MILLISECONDS, runtime.SLUR_TRANSITION_CANDIDATE_MILLISECONDS)
        self.assertEqual(compiler.SLUR_TRANSITION_SECONDS, runtime.SLUR_TRANSITION_SECONDS)
        self.assertEqual(compiler.SLUR_TRANSITION_SHAPE, runtime.SLUR_TRANSITION_SHAPE)
        initial_hz = 698.456463
        target_hz = 587.329536
        _, runtime_summary = runtime.build_score_controls(TRACKED_SOURCE_LED_ARI_PLAN)
        compiler_policy = compiler.slur_transition_policy()
        runtime_policy = runtime_summary["slur_transition_policy"]
        for key, value in compiler_policy.items():
            self.assertEqual(runtime_policy[key], value)
        # These are exact b10_e1 probes: start, two 250 Hz intermediate rows,
        # the 12 ms target row, later 20 ms, and the 50 ms policy gate.
        for absolute_seconds in (5.040, 5.044, 5.048, 5.052, 5.060, 5.090):
            local = absolute_seconds - 5.040
            compiler_value = float(
                compiler.slur_transition_hz(
                    initial_hz,
                    target_hz,
                    numpy.asarray([local], dtype=numpy.float64),
                )[0]
            )
            runtime_value = runtime.slur_transition_hz(initial_hz, target_hz, local)
            self.assertAlmostEqual(compiler_value, runtime_value, places=10)
        self.assertAlmostEqual(runtime.slur_transition_hz(initial_hz, target_hz, 0.012), target_hz, places=9)
        self.assertAlmostEqual(runtime.slur_transition_hz(initial_hz, target_hz, 0.050), target_hz, places=9)
        with self.assertRaisesRegex(compiler.ScoreExpressionError, "validated candidates"):
            compiler.slur_transition_hz(initial_hz, target_hz, numpy.asarray([0.004]), transition_seconds=0.016)

    def test_compiler_records_100hz_slur_quantization_without_claiming_audio_rate_parity(self) -> None:
        result = compiler.compile_plan(TRACKED_SOURCE_LED_ARI_PLAN)
        quantization = result["slur_control_rate_quantization"]
        self.assertEqual(quantization["compiler_control_hz"], 100)
        self.assertAlmostEqual(quantization["compiler_frame_seconds"], 0.010, places=12)
        self.assertFalse(quantization["exact_audio_rate_parity_with_250hz_public_runtime_claimed"])
        # b10_e1 begins at 5.04. The 100 Hz compiler has source at 5.04,
        # one sampled transition value at 5.05, then target at 5.06. This is
        # intentional control-rate quantization.  The v2 generic preview must
        # use boundary metadata to reconstruct 48 kHz F0; sampled rows alone
        # are not permission to create a long linear-Hz preview glide.
        self.assertAlmostEqual(float(result["f0_hz"][504]), 698.456463, places=4)
        self.assertGreater(float(result["f0_hz"][505]), 587.329536)
        self.assertAlmostEqual(float(result["f0_hz"][506]), 587.329536, places=4)

    def test_tracked_source_led_ari_companion_keeps_score_and_raw_source_roles_separate(self) -> None:
        raw = json.loads(TRACKED_SOURCE_LED_ARI_PLAN.read_text(encoding="utf-8"))
        context = raw["source_led_phrase_pool_context"]
        self.assertTrue(context["reference_only"])
        contract = context["separation_contract"]
        self.assertTrue(contract["source_span_is_not_read_or_modified_by_this_compiler"])
        self.assertTrue(contract["score_events_are_not_a_transcription_or_alignment_of_the_source_span"])
        self.assertTrue(contract["feature_proxy_measurements_do_not_create_breath_rearticulate_slur_or_release_labels"])

        result = compiler.compile_plan(TRACKED_SOURCE_LED_ARI_PLAN)
        events = result["events"]
        self.assertEqual(
            [event["articulation"] for event in events],
            ["breath_start", "breath_start", "rearticulate", "slur", "slur", "slur", "release"],
        )
        self.assertEqual([event["id"] for event in events if event["vibrato"]["enabled"]], [])
        b08 = events[0]
        self.assertEqual(b08["musical_context"]["phrase_role"], "local_phrase_cadence_before_rest")
        self.assertTrue(b08["musical_context"]["followed_by_rest"])
        self.assertEqual(b08["vibrato_policy"]["decision"], "candidate_off")
        self.assertEqual(
            b08["vibrato_policy"]["policy_rule_id"],
            compiler.POLICY_RULE_SUSTAINED_CANDIDATE,
        )
        b10_tail = events[5]
        self.assertEqual(b10_tail["musical_context"]["duration_beats"], 1.0)
        self.assertEqual(b10_tail["musical_context"]["phrase_role"], "local_phrase_tail")
        self.assertEqual(b10_tail["musical_context"]["approach"], "descending_arrival")
        self.assertFalse(b10_tail["musical_context"]["global_cadence"])
        self.assertEqual(b10_tail["vibrato_policy"]["decision"], "off")
        self.assertEqual(
            b10_tail["vibrato_policy"]["policy_rule_id"],
            compiler.POLICY_RULE_SHORT_LOCAL_TAIL_OFF,
        )
        # The b09 re-attack and first b10 slur share a timestamp, but their
        # distinct explicit states survive compilation; time alone cannot
        # rewrite the re-attack into legato.
        self.assertEqual(int(result["gesture_state"][360]), compiler.STATE_CODES["rearticulate"])
        self.assertEqual(int(result["gesture_state"][432]), compiler.STATE_CODES["slur"])

    def test_explicit_states_have_distinct_onsets_and_slur_is_pitch_continuous(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = _write_plan(Path(temporary), _plan())
            result = compiler.compile_plan(path)
            # 1 kHz controls makes these one-millisecond boundary indices.
            self.assertEqual(int(result["gesture_state"][0]), compiler.STATE_CODES["breath_start"])
            self.assertEqual(int(result["gesture_state"][100]), compiler.STATE_CODES["rearticulate"])
            self.assertEqual(int(result["gesture_state"][200]), compiler.STATE_CODES["slur"])
            self.assertEqual(int(result["gesture_state"][300]), compiler.STATE_CODES["release"])
            # A linked slur begins at the preceding pitch, instead of jumping
            # straight to the target 392 Hz.  It has no invented breath burst.
            self.assertAlmostEqual(float(result["f0_hz"][200]), float(result["f0_hz"][199]), places=4)
            self.assertAlmostEqual(float(result["f0_hz"][212]), 392.0, places=4)
            # By 250 ms the explicit vibrato has begun; this is not residual
            # slur glide, so its pitch is intentionally above the base target.
            self.assertGreater(float(result["f0_hz"][250]), 392.0)
            # The distinct authored -30 dB target is retained, but moves from
            # the prior -28 dB continuously over 80 ms without a re-attack.
            self.assertAlmostEqual(float(result["loudness_db"][200]), -28.0, places=4)
            self.assertAlmostEqual(float(result["loudness_db"][280]), -30.0, places=4)
            self.assertEqual(float(result["voicing"][200]), 1.0)
            self.assertGreater(float(result["air_noise_ratio"][0]), float(result["air_noise_ratio"][100]))
            self.assertGreater(float(result["air_noise_ratio"][100]), float(result["air_noise_ratio"][200]))
            self.assertGreater(float(result["vibrato_depth_cents"][230]), 0.0)
            self.assertEqual(float(result["f0_hz"][300]), 0.0)
            self.assertGreater(float(result["voicing"][300]), float(result["voicing"][349]))

    def test_explicit_audition_selects_only_the_b08_candidate_and_fades_its_depth(self) -> None:
        result = compiler.compile_plan(GYEONGGI_POLICY_AUDITION_PLAN)
        selected = [
            event
            for event in result["events"]
            if event["vibrato_policy"] is not None
            and event["vibrato_policy"]["decision"] == "selected"
        ]
        self.assertEqual([event["id"] for event in selected], ["b08_e0_breath"])
        event = selected[0]
        self.assertTrue(event["vibrato"]["enabled"])
        self.assertEqual(event["vibrato"]["end_fade_seconds"], 0.18)
        self.assertEqual(event["vibrato_policy"]["style"], "late_gentle_yoseong")
        self.assertIsNotNone(event["vibrato_policy"]["active_selection_provenance"])
        self.assertEqual(
            result["expression_policy"]["score_evidence_boundary"],
            "authorial_western_pitch_grid_skeleton_not_authentic_transcription",
        )
        cents = result["vibrato_cents"]
        self.assertEqual(float(cents[71]), 0.0)
        self.assertGreater(float(numpy.max(numpy.abs(cents[80:126]))), 10.0)
        self.assertLess(abs(float(cents[142])), 2.0)
        self.assertEqual(float(cents[143]), 0.0)
        self.assertEqual(float(cents[144]), 0.0)
        with tempfile.TemporaryDirectory() as temporary:
            manifest = compiler.render_controls(
                plan=GYEONGGI_POLICY_AUDITION_PLAN,
                output_dir=Path(temporary) / "policy-audition-controls",
            )
            self.assertEqual(manifest["expression_policy"]["id"], compiler.EXPRESSION_POLICY_ID)
            selected_summary = next(
                event for event in manifest["events"] if event["id"] == "b08_e0_breath"
            )
            self.assertEqual(selected_summary["musical_context"]["modal_degree"], "do")
            self.assertEqual(selected_summary["vibrato_policy"]["decision"], "selected")
            self.assertEqual(selected_summary["vibrato"]["end_fade_seconds"], 0.18)
            fired = next(
                item for item in manifest["fired_policy_rules"] if item["event_id"] == "b08_e0_breath"
            )
            self.assertEqual(fired["policy_rule_id"], compiler.POLICY_RULE_SUSTAINED_CANDIDATE)

    def test_policy_rejects_reenabling_the_short_non_global_b10_tail(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            payload = json.loads(TRACKED_SOURCE_LED_ARI_PLAN.read_text(encoding="utf-8"))
            tail = payload["events"][5]
            tail["vibrato"] = {
                "enabled": True,
                "rate_hz": 3.45,
                "depth_cents": 23.0,
                "onset_seconds": 0.20,
                "ramp_seconds": 0.08,
                "end_fade_seconds": 0.08,
            }
            path = _write_plan(Path(temporary), payload)
            with self.assertRaisesRegex(compiler.ScoreExpressionError, "cannot be enabled without"):
                compiler.compile_plan(path)

    def test_compiler_keeps_valid_prior_vibrato_and_early_target_motion_outside_preview_policy(self) -> None:
        """A generic preview limit must not silently narrow score compilation."""

        with tempfile.TemporaryDirectory() as temporary:
            payload = _plan()
            events = payload["events"]
            assert isinstance(events, list)
            events[1]["vibrato"] = {
                "enabled": True,
                "rate_hz": 3.45,
                "depth_cents": 23.0,
                "onset_seconds": 0.030,
                "ramp_seconds": 0.010,
            }
            slur_duration = float(events[2]["end_seconds"]) - float(events[2]["start_seconds"])
            events[2]["gesture_points"] = [
                {"time_seconds": 0.0, "cents": 0.0},
                {"time_seconds": slur_duration, "cents": 60.0},
            ]
            events[2]["vibrato"] = {
                "enabled": True,
                "rate_hz": 3.45,
                "depth_cents": 23.0,
                "onset_seconds": 0.005,
                "ramp_seconds": 0.005,
            }
            result = compiler.compile_plan(_write_plan(Path(temporary), payload))
            boundary = result["slur_boundaries"][0]
            self.assertTrue(boundary["preview_reconstruction_eligible"])
            # The compiler records the authorial 20 ms rejoin value instead of
            # rejecting a legal early gesture/vibrato just for the preview.
            self.assertNotAlmostEqual(
                float(boundary["target_rejoin_f0_hz"]),
                float(boundary["target_entry_f0_hz"]),
                places=2,
            )

    def test_touching_notes_without_an_explicit_articulation_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            payload = _plan()
            events = payload["events"]
            assert isinstance(events, list)
            del events[1]["articulation"]  # type: ignore[index]
            path = _write_plan(Path(temporary), payload)
            with self.assertRaisesRegex(compiler.ScoreExpressionError, "must explicitly"):
                compiler.compile_plan(path)

    def test_slur_without_authorial_link_or_out_of_range_vibrato_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            payload = _plan()
            events = payload["events"]
            assert isinstance(events, list)
            del events[2]["slur_from_previous"]  # type: ignore[index]
            path = _write_plan(Path(temporary), payload)
            with self.assertRaisesRegex(compiler.ScoreExpressionError, "slur_from_previous"):
                compiler.compile_plan(path)
            payload = _plan()
            events = payload["events"]
            assert isinstance(events, list)
            events[2]["vibrato"]["rate_hz"] = 6.0  # type: ignore[index]
            path = _write_plan(Path(temporary), payload)
            with self.assertRaisesRegex(compiler.ScoreExpressionError, "rate_hz"):
                compiler.compile_plan(path)

    def test_render_writes_only_fresh_controls_and_path_free_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = _write_plan(root, _plan())
            output = root / "rnd-controls"
            manifest = compiler.render_controls(plan=path, output_dir=output)
            self.assertEqual(manifest["schema"], compiler.MANIFEST_SCHEMA)
            self.assertEqual(manifest["controls"]["score_feature_dim"], 9)
            self.assertTrue(manifest["interpretation_limits"]["touching_timestamps_never_infer_slur"])
            slur = next(event for event in manifest["events"] if event["articulation"] == "slur")
            boundary = slur["slur_boundary_f0"]
            self.assertEqual(boundary["schema"], compiler.SLUR_BOUNDARY_F0_SCHEMA)
            self.assertEqual(boundary["event_id"], "slur-down")
            self.assertAlmostEqual(float(boundary["source_boundary_f0_hz"]), 440.0, places=4)
            self.assertAlmostEqual(float(boundary["target_entry_f0_hz"]), 392.0, places=4)
            self.assertTrue(boundary["preview_reconstruction_eligible"])
            with numpy.load(output / compiler.CONTROL_FILENAME) as controls:
                self.assertEqual(controls["score_features"].shape[1], 9)
                self.assertEqual(int(controls["sample_rate_hz"]), 48_000)
            text = (output / compiler.MANIFEST_FILENAME).read_text(encoding="utf-8")
            self.assertNotIn(str(root), text)
            with self.assertRaisesRegex(compiler.ScoreExpressionError, "fresh"):
                compiler.render_controls(plan=path, output_dir=output)


class FullAriPlanTests(unittest.TestCase):
    @staticmethod
    def _raw(path: Path) -> dict[str, object]:
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _voiced(raw: dict[str, object]) -> list[dict[str, object]]:
        events = raw["events"]
        assert isinstance(events, list)
        return [event for event in events if event["articulation"] != "release"]

    def test_generated_full_plans_are_tracked_byte_for_byte(self) -> None:
        expected = full_ari.build_plans()
        for filename, document in expected.items():
            tracked = json.loads((HERE / "plans" / filename).read_text(encoding="utf-8"))
            self.assertEqual(tracked, document)

    def test_full_score_has_59_notes_exact_duration_and_only_final_release(self) -> None:
        for path in (FULL_ARI_B0_PLAN, FULL_ARI_B1_PLAN):
            raw = self._raw(path)
            voiced = self._voiced(raw)
            self.assertEqual(len(voiced), 59)
            releases = [event for event in raw["events"] if event["articulation"] == "release"]
            self.assertEqual([event["id"] for event in releases], ["b16_final_release"])
            self.assertEqual(releases[0]["start_seconds"], 34.56)
            self.assertEqual(releases[0]["end_seconds"], 34.8)
            self.assertEqual(raw["score_timing"]["notated_score_duration_seconds"], 34.56)
            self.assertEqual(raw["score_timing"]["render_control_duration_seconds"], 34.8)
            result = compiler.compile_plan(path)
            self.assertEqual(len(result["events"]), 60)
            self.assertAlmostEqual(float(result["duration_seconds"]), 34.8, places=9)

    def test_authored_breaths_and_two_performed_gaps_do_not_invent_score_rests(self) -> None:
        raw = self._raw(FULL_ARI_B0_PLAN)
        voiced = self._voiced(raw)
        breath_locations = [
            event["score_location"] for event in voiced if event["articulation"] == "breath_start"
        ]
        self.assertEqual(breath_locations, ["b01_e0", "b05_e0", "b09_e0", "b13_e0"])

        written_rests = raw["score_rest_intervals_seconds"]
        self.assertEqual(len(written_rests), 1)
        self.assertEqual(written_rests[0]["score_location"], "b08_beat3")
        self.assertTrue(written_rests[0]["notation_has_rest"])
        self.assertAlmostEqual(written_rests[0]["start_seconds"], 16.56, places=9)
        self.assertAlmostEqual(written_rests[0]["end_seconds"], 17.28, places=9)

        performed_gaps = raw["performed_breath_gaps_seconds"]
        self.assertEqual([(gap["start_seconds"], gap["end_seconds"]) for gap in performed_gaps], [
            (8.568, 8.64),
            (25.848, 25.92),
        ])
        self.assertTrue(all(gap["notation_has_rest"] is False for gap in performed_gaps))
        by_location = {event["score_location"]: event for event in voiced}
        for location in ("b04_e3", "b12_e3"):
            context = by_location[location]["musical_context"]
            self.assertEqual(context["notated_duration_beats"], 0.5)
            self.assertEqual(context["duration_beats"], 0.4)
            self.assertEqual(
                context["timing_interpretation"],
                "authorial_breath_gap_time_stolen_from_note_end",
            )

        compiled = compiler.compile_plan(FULL_ARI_B0_PLAN)
        times = compiled["frame_times_seconds"]
        for start, end in ((8.568, 8.64), (16.56, 17.28), (25.848, 25.92)):
            gap = (times >= start) & (times < end)
            self.assertTrue(numpy.any(gap))
            self.assertTrue(numpy.all(compiled["f0_hz"][gap] == 0.0))
            self.assertTrue(numpy.all(compiled["gesture_state"][gap] == 0))

    def test_b08_b10_pitch_time_grid_and_b09_b10_articulation_keep_slice_parity(self) -> None:
        short = self._raw(TRACKED_SOURCE_LED_ARI_PLAN)
        full = self._raw(FULL_ARI_B0_PLAN)
        short_events = [event for event in short["events"] if event["articulation"] != "release"]
        full_events = [
            event
            for event in full["events"]
            if str(event.get("score_location", ""))[:3] in {"b08", "b09", "b10"}
        ]
        self.assertEqual(len(short_events), len(full_events))
        offset = 15.12
        for expected, actual in zip(short_events, full_events):
            self.assertEqual(expected["score_location"], actual["score_location"])
            self.assertAlmostEqual(expected["start_seconds"], actual["start_seconds"] - offset, places=9)
            self.assertAlmostEqual(expected["end_seconds"], actual["end_seconds"] - offset, places=9)
            self.assertEqual(expected["pitch_hz"], actual["pitch_hz"])
            self.assertEqual(expected["steady_loudness_db"], actual["steady_loudness_db"])
        # b08 is no longer a synthetic slice head, so it is a deliberate
        # re-attack.  The already-auditioned b09/b10 mapping stays exact.
        self.assertEqual(full_events[0]["articulation"], "rearticulate")
        self.assertEqual(
            [event["articulation"] for event in full_events[1:]],
            [event["articulation"] for event in short_events[1:]],
        )
        self.assertEqual(
            [event.get("slur_from_previous", False) for event in full_events[1:]],
            [event.get("slur_from_previous", False) for event in short_events[1:]],
        )

    def test_b0_and_b1_share_an_identical_nonexpression_skeleton(self) -> None:
        b0 = self._raw(FULL_ARI_B0_PLAN)
        b1 = self._raw(FULL_ARI_B1_PLAN)

        def skeleton(document: dict[str, object]) -> list[dict[str, object]]:
            result = []
            for event in document["events"]:
                result.append(
                    {
                        key: value
                        for key, value in event.items()
                        if key not in {"vibrato", "vibrato_policy"}
                    }
                )
            return result

        self.assertEqual(skeleton(b0), skeleton(b1))
        for key in (
            "authorial_score_reference",
            "score_timing",
            "score_rest_intervals_seconds",
            "performed_breath_gaps_seconds",
            "control_hz",
        ):
            self.assertEqual(b0[key], b1[key])

    def test_b0_is_all_straight_and_b1_selects_only_contextual_b08_b16_candidates(self) -> None:
        b0 = compiler.compile_plan(FULL_ARI_B0_PLAN)
        b1 = compiler.compile_plan(FULL_ARI_B1_PLAN)
        self.assertEqual([event["id"] for event in b0["events"] if event["vibrato"]["enabled"]], [])

        selected = [
            event
            for event in b1["events"]
            if event["vibrato_policy"] is not None
            and event["vibrato_policy"]["decision"] == "selected"
        ]
        self.assertEqual(
            [event["id"] for event in selected],
            ["b08_e0_rearticulate", "b16_e0_rearticulate"],
        )
        b08, b16 = selected
        self.assertEqual(b08["vibrato_policy"]["policy_rule_id"], compiler.POLICY_RULE_SUSTAINED_CANDIDATE)
        self.assertEqual(b08["vibrato"]["onset_seconds"], 0.72)
        self.assertEqual(b08["vibrato"]["end_fade_seconds"], 0.18)
        self.assertEqual(b16["vibrato_policy"]["policy_rule_id"], compiler.POLICY_RULE_GLOBAL_CADENCE_CANDIDATE)
        self.assertTrue(b16["musical_context"]["global_cadence"])
        self.assertEqual(b16["vibrato"]["rate_hz"], 3.45)
        self.assertEqual(b16["vibrato"]["depth_cents"], 18.0)
        self.assertEqual(b16["vibrato"]["onset_seconds"], 1.44)
        self.assertEqual(b16["vibrato"]["ramp_seconds"], 0.18)
        self.assertEqual(b16["vibrato"]["end_fade_seconds"], 0.24)
        b10_tail = next(event for event in b1["events"] if event["id"] == "b10_e2_slur")
        self.assertFalse(b10_tail["vibrato"]["enabled"])
        self.assertEqual(b10_tail["vibrato_policy"]["policy_rule_id"], compiler.POLICY_RULE_SHORT_LOCAL_TAIL_OFF)

        cents = b1["vibrato_cents"]
        self.assertEqual(float(cents[3383]), 0.0)  # before b16's 1.44 s onset
        self.assertGreater(float(numpy.max(numpy.abs(cents[3400:3450]))), 10.0)
        self.assertEqual(float(cents[3455]), 0.0)  # final half-open b16 row
        self.assertEqual(float(cents[3456]), 0.0)  # release starts at nominal pitch

    def test_multi_rule_selection_must_map_every_selected_event_to_its_fired_rule(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            payload = self._raw(FULL_ARI_B1_PLAN)
            selection = payload["expression_policy"]["active_selection_provenance"]
            del selection["source_policy_rule_ids_by_event"]["b16_e0_rearticulate"]
            path = _write_plan(Path(temporary), payload)
            with self.assertRaisesRegex(compiler.ScoreExpressionError, "keys must exactly match"):
                compiler.compile_plan(path)

    def test_all_slurs_are_explicit_and_only_authored_rearticulations_break_sequences(self) -> None:
        raw = self._raw(FULL_ARI_B0_PLAN)
        voiced = self._voiced(raw)
        slurs = [event for event in voiced if event["articulation"] == "slur"]
        self.assertEqual(len(slurs), 43)
        self.assertTrue(all(event.get("slur_from_previous") is True for event in slurs))
        rearticulations = [event["score_location"] for event in voiced if event["articulation"] == "rearticulate"]
        self.assertEqual(
            rearticulations,
            [
                "b02_e0", "b03_e0", "b04_e0", "b06_e0", "b07_e0", "b08_e0",
                "b09_e1", "b11_e0", "b12_e0", "b14_e0", "b15_e0", "b16_e0",
            ],
        )


if __name__ == "__main__":
    unittest.main()
