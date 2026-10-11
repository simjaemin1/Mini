"""Synthetic-only tests for frozen-model VB01 component diagnosis."""

from __future__ import annotations

from contextlib import nullcontext
import json
import math
from types import SimpleNamespace
import unittest

import numpy as np

import diagnose_vibrato_components as diagnostic
import mac_mps_ddsp_pilot as pilot


def _metric(state: str, amplitude: float | None) -> dict:
    return {
        "state": state, "amplitude_cents": amplitude, "frequency_hz": 5.5,
        "voiced_fraction": 1.0, "common_input_voiced_frames": 50,
        "median_absolute_f0_error_cents": 2.0,
        "longest_input_voiced_pitch_gap_frames": 0,
        "periodicity_proxy": 0.95, "raw_whole_rms_dbfs": -30.0,
    }


class _Tensor:
    def __init__(self, value: float):
        self.array = np.full((1, pilot.WINDOW_SAMPLES, 1), value, np.float32)
        self.shape = self.array.shape
        self.device = SimpleNamespace(type="mps")

    def detach(self):
        return self

    def cpu(self):
        return self

    def numpy(self):
        return self.array


class _HookHandle:
    def __init__(self, module):
        self.module = module

    def remove(self):
        self.module.hook = None


class _Reverb:
    def __init__(self):
        self.hook = None

    def register_forward_pre_hook(self, hook):
        self.hook = hook
        return _HookHandle(self)


class _Model:
    def __init__(self, module, fail=False):
        self.module = module
        self.reverb = _Reverb()
        self.fail = fail

    def __call__(self, _pitch, _loudness):
        harmonic = self.module.harmonic_synth()
        if self.fail:
            raise RuntimeError("synthetic_fail")
        self.reverb.hook(self.reverb, (_Tensor(2.0),))
        return _Tensor(3.0)


class _Torch:
    @staticmethod
    def no_grad():
        return nullcontext()

    @staticmethod
    def isfinite(_value):
        return SimpleNamespace(all=lambda: SimpleNamespace(item=lambda: True))


class VibratoComponentsTests(unittest.TestCase):
    def test_hook_captures_three_tracks_and_always_restores_upstream(self):
        module = SimpleNamespace(harmonic_synth=lambda: _Tensor(1.0))
        original = module.harmonic_synth
        model = _Model(module)
        tracks = diagnostic._capture_components(model, module, None, None, _Torch)
        self.assertEqual(tuple(tracks), diagnostic.OUTPUT_TRACKS)
        self.assertEqual([float(tracks[name][0]) for name in diagnostic.OUTPUT_TRACKS], [1, 2, 3])
        self.assertIs(module.harmonic_synth, original)
        self.assertIsNone(model.reverb.hook)
        with self.assertRaisesRegex(RuntimeError, "synthetic_fail"):
            diagnostic._capture_components(_Model(module, fail=True), module, None, None, _Torch)
        self.assertIs(module.harmonic_synth, original)

    def test_periodicity_proxy_prefers_clean_tone_over_seeded_noise(self):
        t = np.arange(pilot.WINDOW_SAMPLES) / pilot.SAMPLE_RATE
        sine = (0.05 * np.sin(2 * math.pi * 400.0 * t)).astype(np.float32)
        noise = np.random.default_rng(42).normal(0, 0.05, sine.size).astype(np.float32)
        pitch = np.full(pilot.WINDOW_FRAMES, 400.0, np.float32)
        voiced = np.ones(pilot.WINDOW_FRAMES, bool)
        middle = np.zeros(pilot.WINDOW_FRAMES, bool)
        middle[175:225] = True
        sine_quality = diagnostic._periodicity_at_measured_f0(sine, pitch, voiced, middle)
        noise_quality = diagnostic._periodicity_at_measured_f0(noise, pitch, voiced, middle)
        self.assertGreater(sine_quality, 0.98)
        self.assertLess(noise_quality, 0.25)

    def test_aggregate_preserves_all_24_and_fixed_input_denominator(self):
        rows = []
        for index in range(24):
            input_state = "modulated" if index < 20 else "not_modulated"
            full_state = "modulated" if index < 12 else "not_modulated"
            rows.append({"song_index": 1 + index % 4, "tracks": {
                "input_16k": _metric(input_state, 20.0),
                "harmonic_only": _metric("modulated", 17.0),
                "harmonic_plus_noise": _metric("modulated", 15.0),
                "full_with_reverb": _metric(full_state, 12.234 if index < 12 else 8.0),
            }})
        prior = {"counts": {"input64_positive_evaluated": 20,
                              "input64_positive_output64_positive": 12},
                 "input64_output64_amplitude_ratio_median_when_both_strict": 0.6117}
        report = diagnostic._aggregate(rows, prior_report=prior, elapsed=2.0)
        self.assertEqual(report["input_positive_crops"], 20)
        self.assertEqual(report["tracks"]["harmonic_only"]["input_positive_20_strict_reproduced"], 20)
        self.assertEqual(report["tracks"]["full_with_reverb"]["input_positive_20_strict_reproduced"], 12)
        self.assertEqual(report["paired_same_crops"]["harmonic_strict_full_not_strict_count"], 8)
        self.assertEqual(len(report["heldout_song_group_aggregates"]), 4)
        self.assertEqual(report["replay_of_existing_full"]["full_to_input_amplitude_ratio_median_both_strict"], 0.6117)
        self.assertNotIn("song_index", json.dumps(report))

    def test_aggregate_fails_closed_if_old_full_is_not_reproduced(self):
        rows = [{"song_index": 1, "tracks": {name: _metric("modulated", 20.0)
                for name in diagnostic.TRACKS}} for _ in range(24)]
        prior = {"counts": {"input64_positive_evaluated": 20,
                              "input64_positive_output64_positive": 12},
                 "input64_output64_amplitude_ratio_median_when_both_strict": 0.6117}
        with self.assertRaisesRegex(diagnostic.ComponentError, "input_replay_mismatch"):
            diagnostic._aggregate(rows, prior_report=prior, elapsed=1.0)


if __name__ == "__main__":
    unittest.main()
