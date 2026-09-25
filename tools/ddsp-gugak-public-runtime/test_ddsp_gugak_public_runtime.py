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
        self.assertEqual(frames[1620]["f0_hz"], 0.0)
        self.assertEqual(frames[360]["f0_hz"], 0.0)
        self.assertEqual(frames[360]["loudness_linear"], 0.0)
        self.assertEqual(summary["renderer_gate"]["audio_rate_upsampling"], "linear interpolation from the compiled 250 Hz voicing curve")
        self.assertEqual(summary["renderer_gate"]["written_rest_entry_fades"], [{"rest_start_frame": 360, "rest_start_seconds": 1.44, "fade_start_frame": 356, "fade_start_seconds": 1.424, "fade_duration_seconds": 0.016}])
        self.assertEqual(summary["renderer_gate"]["hard_zero_rest_ranges"], [{"start_frame": 360, "end_frame_exclusive": 540, "start_seconds": 1.44, "end_seconds": 2.16, "start_sample": 23040, "end_sample_exclusive": 34560}])
        self.assertGreater(frames[1515]["vibrato_cents"], 0.0)
        self.assertAlmostEqual(frames[100]["loudness_linear"], 10 ** (-30 / 20), places=8)
        self.assertAlmostEqual(frames[800]["loudness_linear"], 10 ** (-28 / 20), places=8)

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

    def test_level_match_fails_instead_of_silently_clipping(self) -> None:
        with self.assertRaisesRegex(runtime.RuntimeContractError, "would clip"):
            runtime._level_match([1.0, -1.0], active_rms=0.001)

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
