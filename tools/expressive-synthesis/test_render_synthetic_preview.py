"""End-to-end contracts for the isolated untrained synthetic preview."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest
import wave

import numpy


HERE = Path(__file__).resolve().parent
SCORE_EXPRESSION = HERE.parent / "score-expression"
for path in (HERE, SCORE_EXPRESSION):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import compile_expression as compiler
import render_synthetic_preview as preview


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
        "control_hz": 100,
        "events": [
            {
                "id": "breath",
                "start_seconds": 0.0,
                "end_seconds": 0.18,
                "pitch_hz": 440.0,
                "articulation": "breath_start",
                "steady_loudness_db": -24.0,
            },
            {
                "id": "tongue",
                "start_seconds": 0.18,
                "end_seconds": 0.30,
                "pitch_hz": 440.0,
                "articulation": "rearticulate",
                "steady_loudness_db": -26.0,
            },
            {
                "id": "slur",
                "start_seconds": 0.30,
                "end_seconds": 0.44,
                "pitch_hz": 392.0,
                "articulation": "slur",
                "slur_from_previous": True,
                "steady_loudness_db": -29.0,
                "vibrato": {
                    "enabled": True,
                    "rate_hz": 3.45,
                    "depth_cents": 23.0,
                    "onset_seconds": 0.03,
                    "ramp_seconds": 0.02,
                },
            },
            {
                "id": "release",
                "start_seconds": 0.44,
                "end_seconds": 0.50,
                "articulation": "release",
            },
        ],
    }


def _write_plan(root: Path) -> Path:
    path = root / "explicit-score-plan.json"
    path.write_text(json.dumps(_plan(), sort_keys=True), encoding="utf-8")
    return path


class SyntheticPreviewTests(unittest.TestCase):
    def _controls(self, root: Path) -> Path:
        controls = root / "controls"
        compiler.render_controls(plan=_write_plan(root), output_dir=controls)
        return controls

    def test_end_to_end_real_current_score_controls_artifact_is_labelled_and_audio_isolated(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            controls = self._controls(root)
            output = root / "preview"
            manifest = preview.render_synthetic_preview(
                controls_dir=controls,
                output_dir=output,
                seed=17,
            )
            wav_path = output / preview.PREVIEW_WAV_FILENAME
            sidecar_path = output / preview.PREVIEW_MANIFEST_FILENAME
            self.assertTrue(wav_path.is_file())
            self.assertTrue(sidecar_path.is_file())
            with wave.open(str(wav_path), "rb") as rendered:
                self.assertEqual(rendered.getnchannels(), 1)
                self.assertEqual(rendered.getsampwidth(), 2)
                self.assertEqual(rendered.getframerate(), 48_000)
                self.assertEqual(rendered.getnframes(), 24_000)
                samples = numpy.frombuffer(rendered.readframes(rendered.getnframes()), dtype="<i2")
            self.assertTrue(numpy.any(samples))
            self.assertFalse(manifest["renderer"]["trained_model_loaded"])
            self.assertFalse(manifest["renderer"]["source_audio_loaded"])
            self.assertIn("not a real or trained Daegeum", manifest["renderer"]["instrument_claim"])
            self.assertIn("UNTRAINED SYNTHETIC", manifest["output"]["label"])
            self.assertTrue(manifest["interpretation_limits"]["not_a_real_or_trained_daegeum_render"])
            plan_identity = manifest["input_controls"]["score_expression_plan"]
            self.assertEqual(plan_identity["basename"], "explicit-score-plan.json")
            self.assertRegex(plan_identity["sha256"], r"^[0-9a-f]{64}$")
            sidecar = sidecar_path.read_text(encoding="utf-8")
            self.assertNotIn(str(root), sidecar)
            self.assertNotIn("public/assets/audio/bgm", sidecar)

    def test_rejects_a_tampered_controls_archive_before_it_creates_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            controls = self._controls(root)
            archive = controls / compiler.CONTROL_FILENAME
            archive.write_bytes(archive.read_bytes() + b"tampered")
            output = root / "preview"
            with self.assertRaisesRegex(preview.SyntheticPreviewError, "SHA-256"):
                preview.render_synthetic_preview(controls_dir=controls, output_dir=output)
            self.assertFalse(output.exists())

    def test_refuses_default_bgm_destination_and_existing_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            controls = self._controls(root)
            blocked = preview._default_bgm_root() / "must-not-write-rnd-preview"
            with self.assertRaisesRegex(preview.SyntheticPreviewError, "default BGM"):
                preview.render_synthetic_preview(controls_dir=controls, output_dir=blocked)
            occupied = root / "occupied"
            occupied.mkdir()
            with self.assertRaisesRegex(preview.SyntheticPreviewError, "fresh"):
                preview.render_synthetic_preview(controls_dir=controls, output_dir=occupied)


if __name__ == "__main__":
    unittest.main()
