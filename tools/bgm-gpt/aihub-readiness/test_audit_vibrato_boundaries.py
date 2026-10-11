"""Synthetic-only checks for the conservative VB01 acoustic diagnostic."""

from __future__ import annotations

import math
from collections import Counter
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import numpy as np


sys.path.insert(0, str(Path(__file__).parent))
import audit_vibrato_boundaries as audit  # noqa: E402


def _tone(
    duration: float = 1.2, *, frequency: float = 440.0, vibrato_cents: float = 0.0,
    vibrato_hz: float = 5.5, breath_noise: float = 0.0, gliss_cents: float = 0.0,
    seed: int = 42,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    t = np.arange(round(duration * audit.SAMPLE_HZ)) / audit.SAMPLE_HZ
    cents = vibrato_cents * np.sin(2 * math.pi * vibrato_hz * t) + gliss_cents * t / duration
    instantaneous = frequency * 2 ** (cents / 1200.0)
    phase = np.cumsum(instantaneous) * 2 * math.pi / audit.SAMPLE_HZ
    # A modest second harmonic and broadband breath component, not a perfect sine.
    signal = 0.35 * np.sin(phase) + 0.08 * np.sin(2 * phase)
    signal += breath_noise * rng.normal(size=t.size)
    return signal.astype(np.float32)


class PitchModulationTests(unittest.TestCase):
    def test_flat_tone_is_not_modulated(self) -> None:
        sound = _tone(vibrato_cents=0, breath_noise=0.004)
        observed = audit.analyze_window(sound, 0.35, 0.85)
        self.assertEqual(observed.state, "not_modulated", observed)

    def test_true_vibrato_is_modulated(self) -> None:
        sound = _tone(vibrato_cents=35, breath_noise=0.007)
        observed = audit.analyze_window(sound, 0.35, 0.85)
        self.assertEqual(observed.state, "modulated", observed)
        self.assertGreater(observed.amplitude_cents or 0, 20)

    def test_breathy_vibrato_is_detected_when_trackable(self) -> None:
        sound = _tone(vibrato_cents=45, breath_noise=0.02)
        observed = audit.analyze_window(sound, 0.35, 0.85)
        self.assertEqual(observed.state, "modulated", observed)

    def test_white_noise_does_not_create_false_confident_vibrato(self) -> None:
        rng = np.random.default_rng(123)
        noise = (0.08 * rng.normal(size=audit.SAMPLE_HZ * 2)).astype(np.float32)
        observed = audit.analyze_window(noise, 0.35, 0.85)
        self.assertEqual(observed.state, "indeterminate", observed)

    def test_rest_is_indeterminate(self) -> None:
        sound = np.zeros(audit.SAMPLE_HZ * 2, dtype=np.float32)
        observed = audit.analyze_window(sound, 0.35, 0.85)
        self.assertEqual(observed.state, "indeterminate", observed)

    def test_linear_glissando_is_not_vibrato(self) -> None:
        sound = _tone(gliss_cents=100, breath_noise=0.003)
        observed = audit.analyze_window(sound, 0.35, 0.85)
        self.assertEqual(observed.state, "not_modulated", observed)

    def test_flat_to_vibrato_to_flat_boundary_pattern(self) -> None:
        first = _tone(0.65, vibrato_cents=0)
        middle = _tone(1.20, vibrato_cents=40)
        last = _tone(0.65, vibrato_cents=0)
        sound = np.concatenate((first, middle, last))
        states = [
            audit.analyze_window(sound, 0.05, 0.55).state,
            audit.analyze_window(sound, 0.85, 1.35).state,
            audit.analyze_window(sound, 1.95, 2.45).state,
        ]
        self.assertEqual(states, ["not_modulated", "modulated", "not_modulated"])

    def test_eligible_event_excludes_nearby_articulation(self) -> None:
        annotations = [(1.0, 2.0, "VB01"), (3.0, 4.0, "VB01"), (4.2, 4.4, "DW01")]
        self.assertEqual(audit._eligible_events(6.0, annotations), [audit.Event(1.0, 2.0)])

    def test_pitch_class_histogram_only_for_trackable_frames(self) -> None:
        observed = audit.analyze_window(_tone(frequency=440), 0.35, 0.85)
        self.assertNotEqual(observed.state, "indeterminate")
        self.assertIsNotNone(observed.pitch_class_frames)
        self.assertGreater(observed.pitch_class_frames[9], 20)  # A, no octave claim.
        self.assertEqual(sum(observed.pitch_class_frames), observed.pitch_class_frames[9])
        self.assertGreater(observed.absolute_midi_frames[69 - audit.ABSOLUTE_MIDI_MIN], 20)

    def test_absolute_midi_keeps_octaves_separate(self) -> None:
        lower = audit.analyze_window(_tone(frequency=440), 0.35, 0.85)
        upper = audit.analyze_window(_tone(frequency=880), 0.35, 0.85)
        self.assertEqual(lower.state, "not_modulated")
        self.assertEqual(upper.state, "not_modulated")
        self.assertEqual(sum(lower.pitch_class_frames), lower.pitch_class_frames[9])
        self.assertEqual(sum(upper.pitch_class_frames), upper.pitch_class_frames[9])
        self.assertGreater(lower.absolute_midi_frames[69 - audit.ABSOLUTE_MIDI_MIN], 20)
        self.assertEqual(lower.absolute_midi_frames[81 - audit.ABSOLUTE_MIDI_MIN], 0)
        self.assertGreater(upper.absolute_midi_frames[81 - audit.ABSOLUTE_MIDI_MIN], 20)
        self.assertEqual(upper.absolute_midi_frames[69 - audit.ABSOLUTE_MIDI_MIN], 0)

    def test_same_register_support_uses_fixed_note_sets(self) -> None:
        counts = Counter({67: 3, 69: 2, 71: 7, 72: 4, 74: 5, 76: 6, 78: 8})
        result = audit._same_register_five_note_support(counts)
        self.assertEqual(result["current_score_G4_A4_C5_D5_E5"], 20)
        self.assertEqual(result["score_plus_two_A4_B4_D5_E5_Fsharp5"], 28)


class PrivateInputSafetyTests(unittest.TestCase):
    def test_manifest_rejects_output_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            os.chmod(directory, 0o700)
            manifest = directory / "private_manifest.json"
            manifest.write_text(json.dumps({
                "schema": audit.SCHEMA,
                "split": "training",
                "records": [{"output_file": "../escape.wav", "source_stem": "S001"}],
            }))
            os.chmod(manifest, 0o600)
            with self.assertRaisesRegex(audit.AuditError, "invalid_prepared_record_path"):
                audit._load_manifest(directory)

    def test_private_input_rejects_symlink_and_world_readable_file(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            label = directory / "label.zip"
            label.write_bytes(b"test")
            os.chmod(label, 0o644)
            with self.assertRaisesRegex(audit.AuditError, "private_input_permissions"):
                audit._private_regular_file(label, 1024, ".zip")
            os.chmod(label, 0o600)
            link = directory / "link.zip"
            link.symlink_to(label)
            with self.assertRaisesRegex(audit.AuditError, "input_inside_repository_or_symlink"):
                audit._private_regular_file(link, 1024, ".zip")

    def test_malformed_target_kind_has_fixed_error(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            label = Path(temporary) / "label.zip"
            document = {
                "music_source_info": {"music_src_nm": "S001", "play_time": "2.0"},
                "music_type_info": None,
                "annotation_data_info": {"single_tonguing_cd": []},
            }
            with zipfile.ZipFile(label, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("a.json", json.dumps(document))
            os.chmod(label, 0o600)
            with self.assertRaisesRegex(audit.AuditError, "prepared_record_not_daegeum"):
                audit._load_labels(label, {"S001"})

    def test_cumulative_uncompressed_archive_limit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            label = Path(temporary) / "label.zip"
            with zipfile.ZipFile(label, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("a.json", b"{}" * 100)
            os.chmod(label, 0o600)
            with patch.object(audit, "MAX_LABEL_UNCOMPRESSED_BYTES", 100):
                with self.assertRaisesRegex(audit.AuditError, "label_archive_uncompressed_limit"):
                    audit._load_labels(label, set())


if __name__ == "__main__":
    unittest.main()
