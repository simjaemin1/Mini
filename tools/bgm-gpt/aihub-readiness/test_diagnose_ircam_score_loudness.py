"""Synthetic/public-score tests only; no AI Hub WAV, checkpoint, or network."""

from __future__ import annotations

import math
import hashlib
import io
from pathlib import Path
import sys
import unittest
from contextlib import nullcontext, redirect_stderr, redirect_stdout
from unittest.mock import patch

import numpy as np


sys.path.insert(0, str(Path(__file__).resolve().parent))
import diagnose_ircam_score_loudness as diagnostic
import mac_mps_ddsp_long_trial as trial


def fake_pairs() -> dict:
    """Three synthetic songs with an intentionally non-monotone middle bin."""
    rms, feature, pitch, songs = [], [], [], []
    for song in range(3):
        for center, value in [(-39.0, -7.0), (-37.0, -7.5), (-35.0, -6.0), (-33.0, -5.0)]:
            for repeat in range(12):
                rms.append(center + (repeat % 3 - 1) * 0.1)
                feature.append(value + song * 0.04)
                pitch.append(440.0)
                songs.append(song + 1)
    return {"rms_dbfs": np.asarray(rms, dtype=np.float32),
            "weighted_log": np.asarray(feature, dtype=np.float32),
            "pitch_hz": np.asarray(pitch, dtype=np.float32),
            "song_index": np.asarray(songs, dtype=np.int32)}


class ScoreLoudnessFeasibilityTests(unittest.TestCase):
    def test_pava_is_monotone_and_no_extrapolation(self) -> None:
        self.assertEqual(diagnostic._pava([0.0, 2.0, 1.0, 4.0], [1, 1, 1, 1]),
                         [0.0, 1.5, 1.5, 4.0])
        support = diagnostic._support_bins(fake_pairs(), normalizer_std=1.0)
        self.assertEqual(support["status"], "train_only_candidate_range")
        fit = [row["monotone_candidate_weighted_log"] for row in support["usable_run"]]
        self.assertTrue(np.all(np.diff(fit) >= 0))
        self.assertGreater(support["max_monotonic_fit_adjustment_checkpoint_std"], 0)
        self.assertIsNone(diagnostic._interpolate_supported(-40.1, support))
        self.assertIsNone(diagnostic._interpolate_supported(-31.9, support))
        self.assertIsNotNone(diagnostic._interpolate_supported(-36.0, support))

    def test_score_coverage_flags_unsupported_attack_and_rest(self) -> None:
        compiled, candidate, sha = diagnostic._score_candidate()
        self.assertEqual(candidate["manifest"]["plan_sha256"], sha)
        self.assertFalse(candidate["manifest"]["inference_ready"])
        support = diagnostic._support_bins(fake_pairs(), normalizer_std=1.0)
        coverage = diagnostic._score_coverage(compiled, candidate, fake_pairs(), support,
                                               normalizer_mean=-6.0, normalizer_std=1.0)
        self.assertFalse(coverage["score_candidate_inference_ready"])
        self.assertFalse(coverage["all_sounding_state_frames_supported"])
        self.assertTrue(coverage["release_requires_sample_domain_mute"])
        self.assertGreater(coverage["states"]["breath_start"]
                           ["frames_outside_train_supported_center_range"], 0)
        self.assertGreater(coverage["states"]["release"]
                           ["frames_outside_train_supported_center_range"], 0)
        self.assertFalse(coverage["all_nominal_pitches_minimally_supported"])
        self.assertEqual(len(coverage["nominal_pitch_coverage"]), 5)

    def test_selected_synthetic_window_uses_exact_training_loudness(self) -> None:
        seconds = 4
        frames = seconds * 16_000
        timeline = np.arange(frames, dtype=np.float64) / 16_000.0
        audio = (0.06 * np.sin(2 * math.pi * 220.0 * timeline)).astype(np.float32)
        selected = trial.select_nonoverlapping_windows(audio)
        self.assertEqual(len(selected), 1)
        rms, weighted_log, pitch, songs = diagnostic._stable_pairs(selected[0], 7)
        self.assertGreater(len(rms), 250)
        self.assertEqual(len(rms), len(weighted_log))
        self.assertEqual(len(rms), len(pitch))
        self.assertTrue(np.all(songs == 7))
        self.assertTrue(np.all((pitch > 210) & (pitch < 230)))
        self.assertTrue(np.all(np.isfinite(weighted_log)))
        self.assertAlmostEqual(float(np.median(rms)),
                               20.0 * math.log10(0.06 / math.sqrt(2)), delta=0.2)

    def test_unsupported_anchor_cannot_generate_mapping(self) -> None:
        pairs = fake_pairs()
        pairs["rms_dbfs"] = np.concatenate([pairs["rms_dbfs"], np.full(300, -12.0)])
        pairs["weighted_log"] = np.concatenate([pairs["weighted_log"], np.full(300, 4.0)])
        pairs["pitch_hz"] = np.concatenate([pairs["pitch_hz"], np.full(300, 440.0)])
        pairs["song_index"] = np.concatenate([pairs["song_index"],
                                             np.repeat(np.array([4, 5, 6]), 100)])
        support = diagnostic._support_bins(pairs, normalizer_std=1.0)
        self.assertEqual(support["status"], "anchor_bin_unsupported")
        self.assertIsNone(diagnostic._interpolate_supported(-36.0, support))

    def test_end_of_run_checkpoint_recheck_fails_closed_on_report_change(self) -> None:
        marker_bytes = b'{"step":1000}'
        marker = {"step": 1000, "sha256": "a" * 64}
        binding = {"checkpoint_step": 1000, "checkpoint_sha256": "a" * 64,
                   "checkpoint_marker_sha256": hashlib.sha256(marker_bytes).hexdigest(),
                   "training_report_sha256": "b" * 64}
        with (patch.object(diagnostic.trial, "_checkpoint_marker", return_value=(marker, Path("dummy.pt"))),
              patch.object(diagnostic.pilot, "_private_file", return_value=marker_bytes),
              patch.object(diagnostic.pilot, "_read_json", return_value=({}, "b" * 64)) as report):
            diagnostic._recheck_checkpoint_binding(Path("dummy"), binding)
            report.return_value = ({}, "c" * 64)
            with self.assertRaisesRegex(diagnostic.DiagnosticError, "checkpoint_changed"):
                diagnostic._recheck_checkpoint_binding(Path("dummy"), binding)

    def test_unexpected_error_never_prints_private_path_or_traceback(self) -> None:
        secret = "/private/licensed/secret_sample.wav"
        arguments = ["diagnostic", "--source-manifest", "/a", "--split-manifest", "/b",
                     "--checkpoint-dir", "/c", "--upstream-root", "/d", "--output-dir", "/e"]
        out, err = io.StringIO(), io.StringIO()
        with (patch.object(diagnostic, "run", side_effect=RuntimeError(secret)),
              patch.object(sys, "argv", arguments), redirect_stdout(out), redirect_stderr(err)):
            self.assertEqual(diagnostic.main(), 2)
        self.assertNotIn(secret, out.getvalue() + err.getvalue())
        self.assertNotIn("Traceback", out.getvalue() + err.getvalue())
        self.assertIn("unexpected_private_diagnostic_error", out.getvalue())
        self.assertEqual(err.getvalue(), "")

    def test_aggregate_run_completes_without_private_audio(self) -> None:
        pairs = fake_pairs()
        counts = {"clips_examined": 15, "clips_with_selected_windows": 15,
                  "clips_with_stable_pairs": 15, "selected_windows": 15,
                  "stable_100hz_frames": len(pairs["rms_dbfs"]),
                  "training_song_groups_with_pairs": 3}
        binding = {"checkpoint_loudness_mean": -6.0, "checkpoint_loudness_std": 1.0}
        with (patch.object(diagnostic.pilot, "_network_disabled", return_value=nullcontext()),
              patch.object(diagnostic, "_check_bindings",
                           return_value=([{}] * 15, Path("dummy_train"), binding)),
              patch.object(diagnostic.trial, "_balanced_training_records",
                           return_value=[{}] * 15),
              patch.object(diagnostic, "_collect_train_pairs", return_value=(pairs, counts)),
              patch.object(diagnostic, "_recheck_checkpoint_binding"),
              patch.object(diagnostic.trial, "_atomic_private_bytes") as write):
            result = diagnostic.run(
                source_manifest=Path("source"), split_manifest=Path("split"),
                checkpoint_dir=Path("checkpoint"), upstream_root=Path("upstream"),
                output_dir=Path("output"), clips=15, minutes=1)
        self.assertEqual(result["status"], "train_only_feasibility_completed")
        payload = write.call_args.args[2]
        self.assertIn(b'"selected_training_window_seconds": 4.0', payload)
        self.assertIn(b'"inference_ready": false', payload)


if __name__ == "__main__":
    unittest.main()
