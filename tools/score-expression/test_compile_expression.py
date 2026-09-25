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
import ddsp_gugak_public_runtime as runtime


TRACKED_SOURCE_LED_ARI_PLAN = HERE / "plans" / "ari_source_led_response_r1.json"


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
        # intentional control-rate quantization, not a claim that the later
        # preview renderer has the public runtime's 250 Hz <20 ms dwell gate.
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
        self.assertEqual([event["id"] for event in events if event["vibrato"]["enabled"]], ["b10_e2_slur_explicit_vibrato"])
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
            self.assertEqual(manifest["controls"]["score_feature_dim"], 9)
            self.assertTrue(manifest["interpretation_limits"]["touching_timestamps_never_infer_slur"])
            with numpy.load(output / compiler.CONTROL_FILENAME) as controls:
                self.assertEqual(controls["score_features"].shape[1], 9)
                self.assertEqual(int(controls["sample_rate_hz"]), 48_000)
            text = (output / compiler.MANIFEST_FILENAME).read_text(encoding="utf-8")
            self.assertNotIn(str(root), text)
            with self.assertRaisesRegex(compiler.ScoreExpressionError, "fresh"):
                compiler.render_controls(plan=path, output_dir=output)


if __name__ == "__main__":
    unittest.main()
