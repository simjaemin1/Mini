#!/usr/bin/env python3
"""No-source-write contracts for continuous-source score-lattice measurement."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

import numpy as np


HERE = Path(__file__).resolve().parent
MODULE_PATH = HERE / "continuous_source_score_lattice.py"
SPEC = importlib.util.spec_from_file_location("continuous_source_score_lattice_test", MODULE_PATH)
assert SPEC and SPEC.loader
lattice = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = lattice
SPEC.loader.exec_module(lattice)


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _pcm16_stereo(path: Path, *, sample_rate: int, seconds: float) -> None:
    timeline = np.arange(int(sample_rate * seconds), dtype=np.float64) / sample_rate
    # A transient test-only score-like contour with one global octave offset.
    mono = np.zeros_like(timeline)
    first = timeline < 0.40
    second = (timeline >= 0.40) & (timeline < 0.80)
    mono[first] = 0.35 * np.sin(2.0 * np.pi * 220.0 * timeline[first])
    mono[second] = 0.35 * np.sin(2.0 * np.pi * (440.0 * 2.0 ** (3.0 / 12.0)) * timeline[second])
    interleaved = np.column_stack((mono, mono)).reshape(-1)
    payload = np.round(np.clip(interleaved, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
    fmt = struct.pack("<HHIIHH", 1, 2, sample_rate, sample_rate * 4, 4, 16)
    body = b"WAVE" + b"fmt " + struct.pack("<I", len(fmt)) + fmt + b"data" + struct.pack("<I", len(payload)) + payload
    path.write_bytes(b"RIFF" + struct.pack("<I", len(body)) + body)


def _plan(path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "schema": "mini.score-expression.plan.v1",
                "r_and_d_scope": {
                    "r_and_d_only": True,
                    "no_default_assets": True,
                    "no_runtime_bgm": True,
                    "no_game_output": True,
                    "no_public_release": True,
                },
                "instrument": {"id": "daegeum", "sustained": True},
                "control_hz": 100,
                "events": [
                    {
                        "id": "breath",
                        "start_seconds": 0.0,
                        "end_seconds": 0.4,
                        "pitch_hz": 440.0,
                        "articulation": "breath_start",
                        "steady_loudness_db": -28.0,
                    },
                    {
                        "id": "explicit_slur",
                        "start_seconds": 0.4,
                        "end_seconds": 0.8,
                        "pitch_hz": 523.2511306011972,
                        "articulation": "slur",
                        "slur_from_previous": True,
                        "steady_loudness_db": -28.0,
                    },
                    {"id": "release", "start_seconds": 0.8, "end_seconds": 1.0, "articulation": "release"},
                ],
            },
            sort_keys=True,
        ),
        encoding="utf-8",
    )


def _baseline(path: Path, *, source: Path, root: Path) -> None:
    byte_sha = _digest(source)
    relative_sha = hashlib.sha256(source.relative_to(root).as_posix().encode("utf-8")).hexdigest()
    frame_count = 3 * 8_000
    candidate = {
        "file_extension": "wav",
        "recording_candidate_class": "long_native_wav_continuous_recording_candidate",
        "manual_review_locator": {
            "source_root_id": "downloads",
            "byte_sha256": byte_sha,
            "relative_path_sha256": relative_sha,
        },
        "native_wav_descriptor": {
            "container_id": "RIFF",
            "encoding": "PCM",
            "sample_rate_hz": 8_000,
            "channels": 2,
            "bits_per_sample": 16,
            "frame_count": frame_count,
            "duration_seconds": 3.0,
            "resampled": False,
        },
        "provenance_evidence": {
            "training_or_game_rights_proven": False,
            "ngc_origin_proven": False,
            "matches_known_controlled_ngc_manifest_by_local_byte_sha256": False,
        },
    }
    path.write_text(
        json.dumps(
            {
                "schema": lattice.SOURCE_SCOUT_SCHEMA,
                "policy": {"not_a_training_or_game_approval": True},
                "unapproved_rnd_source_baseline_manifest": {
                    "schema": lattice.SOURCE_BASELINE_SCHEMA,
                    "status": "unreviewed_local_source_candidates_no_rights_approval",
                    "does_not_authorize": ["model_training", "game_asset_inclusion"],
                    "candidates": [candidate],
                },
            },
            sort_keys=True,
        ),
        encoding="utf-8",
    )


class ContinuousSourceScoreLatticeTests(unittest.TestCase):
    def test_score_lattice_search_is_exhaustive_on_the_declared_grid_and_keeps_single_offset(self) -> None:
        score_midi = np.array([69.0] * 40 + [72.0] * 40 + [np.nan] * 21, dtype=np.float64)
        score = {
            "duration_seconds": 1.0,
            "f0_hz": 440.0 * np.power(2.0, (score_midi - 69.0) / 12.0),
            "frame_times_seconds": np.arange(len(score_midi), dtype=np.float64) / 100.0,
            "source_sample_rate_hz": 8_000,
        }
        source = np.full(241, np.nan, dtype=np.float64)
        source[50:90] = 57.0
        source[90:130] = 60.0
        feature = {
            "midi_proxy": source,
            "voicing_confidence": np.where(np.isfinite(source), 0.99, 0.0),
            "frame_times_seconds": np.arange(len(source), dtype=np.float64) / 100.0,
            "measurement": {"hop_native_frames": 80},
        }
        result = lattice._search_all_lattice_spans(feature, score, np=np)
        counts = result["counts"]
        self.assertGreater(counts["all_lattice_span_count"], 0)
        self.assertGreater(counts["measurement_in_band_but_unreviewed_not_approved_count"], 0)
        self.assertTrue(result["lattice"]["all_integer_start_and_end_boundaries_in_uniform_time_ratio_band_evaluated"])
        best = next(
            row for row in result["reported_nearest_exact_full_measurement_spans_not_quality_rankings"]
            if row["automated_disposition"] == "measurement_in_band_but_unreviewed_not_approved"
        )
        self.assertAlmostEqual(best["single_global_measurements"]["global_pitch_offset_semitones"], 12.0, places=5)
        self.assertTrue(best["global_pitch_offset_measurement_not_applied"])
        self.assertTrue(best["measurement_lattice_span"]["not_a_phrase_breath_slur_or_legato_boundary"])

    def test_end_to_end_report_is_path_free_and_never_changes_fixture_source(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            downloads = root / "Private Downloads"
            downloads.mkdir()
            source = downloads / "Secret_Continuous_Daegeum.wav"
            _pcm16_stereo(source, sample_rate=8_000, seconds=3.0)
            before = _digest(source)
            baseline = root / "baseline.json"
            _baseline(baseline, source=source, root=downloads)
            plan = root / "plan.json"
            _plan(plan)
            output = root / "_bgm_rnd" / "lattice"
            output.parent.mkdir()
            report = lattice.build_report(
                source_root=downloads,
                source_baseline_report=baseline,
                score_plan=plan,
                output_dir=output,
            )
            saved = (output / lattice.REPORT_FILENAME).read_text(encoding="utf-8")
            self.assertEqual(before, _digest(source))
            self.assertNotIn(str(root), saved)
            self.assertNotIn("Secret_Continuous_Daegeum.wav", saved)
            self.assertTrue(report["interpretation_limits"]["source_audio_read_only_no_copy_render_resample_pitch_shift_time_stretch_or_training"])
            source_report = report["sources"][0]
            self.assertTrue(source_report["source_byte_sha256_verified_before_and_after_in_memory_measurement"])
            self.assertEqual(source_report["natural_phrase_breath_reattack_slur_legato_status"], "not_claimed_not_inferred_not_approved")
            self.assertFalse(source_report["provenance_evidence_preserved"]["training_or_game_rights_proven"])
            with self.assertRaisesRegex(lattice.ContinuousSourceScoreError, "fresh"):
                lattice.build_report(
                    source_root=downloads,
                    source_baseline_report=baseline,
                    score_plan=plan,
                    output_dir=output,
                )

    def test_refuses_source_root_destination_and_baseline_rights_escalation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            downloads = root / "downloads"
            downloads.mkdir()
            source = downloads / "Daegeum.wav"
            _pcm16_stereo(source, sample_rate=8_000, seconds=3.0)
            baseline = root / "baseline.json"
            _baseline(baseline, source=source, root=downloads)
            plan = root / "plan.json"
            _plan(plan)
            with self.assertRaisesRegex(lattice.ContinuousSourceScoreError, "inside the source root"):
                lattice.build_report(
                    source_root=downloads,
                    source_baseline_report=baseline,
                    score_plan=plan,
                    output_dir=downloads / "illegal-output",
                )
            invalid = json.loads(baseline.read_text(encoding="utf-8"))
            invalid["unapproved_rnd_source_baseline_manifest"]["candidates"][0]["provenance_evidence"]["training_or_game_rights_proven"] = True
            baseline.write_text(json.dumps(invalid), encoding="utf-8")
            with self.assertRaisesRegex(lattice.ContinuousSourceScoreError, "rights proof"):
                lattice.build_report(
                    source_root=downloads,
                    source_baseline_report=baseline,
                    score_plan=plan,
                    output_dir=root / "_bgm_rnd" / "refused",
                )


if __name__ == "__main__":
    unittest.main()
