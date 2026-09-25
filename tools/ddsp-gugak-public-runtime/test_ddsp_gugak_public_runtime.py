"""Offline contract tests for the public DDSP-Gugak CPU runtime.

These do not import Torch, source checkouts, checkpoints, audio, or CREPE.
"""

from __future__ import annotations

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


class PublicRuntimeTests(unittest.TestCase):
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
        self.assertAlmostEqual(frames[1620]["f0_hz"], frames[1619]["f0_hz"], places=6)
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
        self.assertGreater(frames[1515]["vibrato_cents"], 0.0)
        self.assertAlmostEqual(frames[100]["loudness_linear"], 10 ** (-30 / 20), places=8)
        self.assertAlmostEqual(frames[800]["loudness_linear"], 10 ** (-28 / 20), places=8)

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
        self.assertAlmostEqual(record["post_gain_shared_interval_rms"], runtime.LISTENING_TARGET_RMS, places=12)
        self.assertAlmostEqual(scaled[-1] / samples[-1], record["constant_gain_applied_to_entire_file"], places=12)
        with self.assertRaisesRegex(runtime.RuntimeContractError, "would clip"):
            runtime.level_match_shared_interval_whole_file([0.001] * active_count + [1.0])

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
