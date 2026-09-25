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
            reconstruction = manifest["renderer"]["slur_audio_rate_reconstruction"]
            self.assertTrue(reconstruction["canonical_slur_reconstructed_at_48khz"])
            self.assertEqual(reconstruction["sample_rate_hz"], 48_000)
            self.assertFalse(reconstruction["oscillator_phase_reset_at_slur_boundaries"])
            self.assertFalse(reconstruction["new_attack_or_amplitude_envelope_added_by_reconstruction"])
            self.assertTrue(reconstruction["boundaries"][0]["target_at_12ms_exact"])
            plan_identity = manifest["input_controls"]["score_expression_plan"]
            self.assertEqual(plan_identity["basename"], "explicit-score-plan.json")
            self.assertRegex(plan_identity["sha256"], r"^[0-9a-f]{64}$")
            sidecar = sidecar_path.read_text(encoding="utf-8")
            self.assertNotIn(str(root), sidecar)
            self.assertNotIn("public/assets/audio/bgm", sidecar)

    def test_reconstructs_the_canonical_12ms_slur_at_audio_rate_without_phase_or_attack_reset(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            controls = preview.load_rnd_score_controls(self._controls(root))
            sample_times, audio_f0, reconstruction = preview.reconstruct_audio_rate_slur_f0(controls)
            boundary = reconstruction["boundaries"][0]
            start = int(boundary["transition_start_sample_48k"])
            end = int(boundary["transition_end_sample_48k"])
            source_hz = float(boundary["source_boundary_f0_hz"])
            target_hz = float(boundary["target_entry_f0_hz"])
            self.assertAlmostEqual(float(audio_f0[start]), source_hz, places=9)
            self.assertAlmostEqual(float(audio_f0[end]), target_hz, places=9)
            # 4/8 ms probes use the compiler's same log-frequency minimum-jerk
            # formula.  The former 100 Hz numpy.interp path was linear Hz and
            # cannot satisfy these values or attach at exactly 12 ms.
            for milliseconds in (4, 8):
                index = start + milliseconds * 48
                expected = float(
                    compiler.slur_transition_hz(
                        source_hz,
                        target_hz,
                        numpy.asarray([milliseconds / 1_000.0], dtype=numpy.float64),
                    )[0]
                )
                self.assertAlmostEqual(float(audio_f0[index]), expected, places=8)
            curve = audio_f0[start : end + 1]
            self.assertTrue(numpy.all(numpy.diff(curve) <= 1.0e-9))
            self.assertLess(float(boundary["intermediate_pitch_dwell_seconds"]), 0.020)
            self.assertFalse(reconstruction["oscillator_phase_reset_at_slur_boundaries"])
            self.assertFalse(reconstruction["new_attack_or_amplitude_envelope_added_by_reconstruction"])
            generic_linear_hz = numpy.interp(sample_times, controls["frame_times_seconds"], controls["f0_hz"])
            self.assertGreater(abs(float(generic_linear_hz[start + 4 * 48]) - float(audio_f0[start + 4 * 48])), 1.0)

    def test_audio_rate_preview_rejoins_an_early_authored_target_motion_in_log_frequency(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = _plan()
            events = payload["events"]
            assert isinstance(events, list)
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
            plan = _write_plan(root)
            plan.write_text(json.dumps(payload, sort_keys=True), encoding="utf-8")
            controls_dir = root / "controls"
            compiler.render_controls(plan=plan, output_dir=controls_dir)
            controls = preview.load_rnd_score_controls(controls_dir)
            _, audio_f0, reconstruction = preview.reconstruct_audio_rate_slur_f0(controls)
            boundary = reconstruction["boundaries"][0]
            end = int(boundary["transition_end_sample_48k"])
            rejoin = int(boundary["target_rejoin_sample_48k"])
            target = float(boundary["target_entry_f0_hz"])
            rejoin_hz = float(boundary["target_rejoin_f0_hz"])
            self.assertNotAlmostEqual(rejoin_hz, target, places=2)
            self.assertAlmostEqual(float(audio_f0[end]), target, places=9)
            self.assertAlmostEqual(float(audio_f0[rejoin]), rejoin_hz, places=9)
            midpoint = (end + rejoin) // 2
            expected_midpoint = numpy.sqrt(target * rejoin_hz)
            self.assertAlmostEqual(float(audio_f0[midpoint]), float(expected_midpoint), places=8)

    def test_audio_rate_preview_keeps_an_ascending_canonical_transition_monotonic(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = _plan()
            events = payload["events"]
            assert isinstance(events, list)
            events[2]["pitch_hz"] = 523.251131
            plan = _write_plan(root)
            plan.write_text(json.dumps(payload, sort_keys=True), encoding="utf-8")
            controls_dir = root / "controls"
            compiler.render_controls(plan=plan, output_dir=controls_dir)
            controls = preview.load_rnd_score_controls(controls_dir)
            _, audio_f0, reconstruction = preview.reconstruct_audio_rate_slur_f0(controls)
            boundary = reconstruction["boundaries"][0]
            start = int(boundary["transition_start_sample_48k"])
            end = int(boundary["transition_end_sample_48k"])
            curve = audio_f0[start : end + 1]
            self.assertAlmostEqual(float(curve[0]), float(boundary["source_boundary_f0_hz"]), places=9)
            self.assertAlmostEqual(float(curve[-1]), float(boundary["target_entry_f0_hz"]), places=9)
            self.assertTrue(numpy.all(numpy.diff(curve) >= -1.0e-9))
            self.assertLess(float(boundary["intermediate_pitch_dwell_seconds"]), 0.020)

    def test_rejects_a_sha_repaired_archive_with_a_slur_voicing_dip_before_creating_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            controls = self._controls(root)
            archive_path = controls / compiler.CONTROL_FILENAME
            with numpy.load(archive_path, allow_pickle=False) as archive:
                rewritten = {key: archive[key].copy() for key in archive.files}
            rewritten["voicing"][30] = 0.5  # fixture slur boundary at 0.30 s
            numpy.savez_compressed(archive_path, **rewritten)
            manifest_path = controls / compiler.MANIFEST_FILENAME
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["controls"]["sha256"] = preview._sha256(archive_path)
            manifest_path.write_text(json.dumps(manifest, sort_keys=True), encoding="utf-8")
            output = root / "preview"
            with self.assertRaisesRegex(preview.SyntheticPreviewError, "voicing dip"):
                preview.render_synthetic_preview(controls_dir=controls, output_dir=output)
            self.assertFalse(output.exists())

    def test_rejects_stale_or_incomplete_slur_manifest_before_creating_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name, expected in (("missing-policy", "slur_transition_policy"), ("missing-boundary", "slur_boundary_f0"), ("alternate-policy", "canonical value")):
                case_root = root / name
                case_root.mkdir()
                controls = self._controls(case_root)
                manifest_path = controls / compiler.MANIFEST_FILENAME
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                if name == "missing-policy":
                    del manifest["controls"]["slur_transition_policy"]
                elif name == "missing-boundary":
                    slur = next(event for event in manifest["events"] if event["articulation"] == "slur")
                    del slur["slur_boundary_f0"]
                else:
                    manifest["controls"]["slur_transition_policy"]["pitch_transition_milliseconds"] = 8
                manifest_path.write_text(json.dumps(manifest, sort_keys=True), encoding="utf-8")
                output = root / f"{name}-preview"
                with self.assertRaisesRegex(preview.SyntheticPreviewError, expected):
                    preview.render_synthetic_preview(controls_dir=controls, output_dir=output)
                self.assertFalse(output.exists())

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
