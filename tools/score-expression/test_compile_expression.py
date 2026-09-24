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

import compile_expression as compiler


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
                "steady_loudness_db": -28.0,
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
