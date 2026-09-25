#!/usr/bin/env python3
"""Deterministic tests for full-corpus cache-grid score span screening."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
SCORE_EXPRESSION_DIR = HERE.parent / "score-expression"
for module_dir in (HERE, SCORE_EXPRESSION_DIR):
    if str(module_dir) not in sys.path:
        sys.path.insert(0, str(module_dir))

import numpy as np  # noqa: E402

from compile_expression import PLAN_SCHEMA, compile_plan  # noqa: E402
from exhaustive_score_span_search import (  # noqa: E402
    REPORT_FILENAME,
    TSV_FILENAME,
    ExhaustiveScoreSpanSearchError,
    build_exhaustive_score_span_search,
)
from source_led_contour import FEATURE_SCHEMA, RND06_SCHEMA  # noqa: E402


def _digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True), encoding="utf-8")


def _scope() -> dict[str, bool]:
    return {
        "r_and_d_only": True,
        "no_default_assets": True,
        "no_runtime_bgm": True,
        "no_game_output": True,
        "no_public_release": True,
    }


def _plan_payload() -> dict[str, object]:
    # One second makes the default 0.80--1.25 ratio window exactly 80--125
    # cache hops.  The explicit rest and slur deliberately exercise the same
    # authored-control semantics as the actual Ari plan.
    return {
        "schema": PLAN_SCHEMA,
        "r_and_d_scope": _scope(),
        "instrument": {"id": "daegeum", "sustained": True},
        "control_hz": 100,
        "events": [
            {
                "id": "head",
                "start_seconds": 0.0,
                "end_seconds": 0.3,
                "pitch_hz": 261.6255653005986,
                "articulation": "breath_start",
                "steady_loudness_db": -28.0,
            },
            {
                "id": "second_head",
                "start_seconds": 0.45,
                "end_seconds": 0.7,
                "pitch_hz": 329.6275569128699,
                "articulation": "breath_start",
                "steady_loudness_db": -28.0,
            },
            {
                "id": "written_slur",
                "start_seconds": 0.7,
                "end_seconds": 0.85,
                "pitch_hz": 293.6647679174076,
                "articulation": "slur",
                "slur_from_previous": True,
                "steady_loudness_db": -28.0,
            },
            {
                "id": "release",
                "start_seconds": 0.85,
                "end_seconds": 1.0,
                "articulation": "release",
            },
        ],
    }


def _make_fixture(root: Path, *, fitting_span: bool) -> tuple[Path, Path]:
    """Create a feature-only source; fixture.wav intentionally never exists."""

    plan_path = root / "authorial-plan.json"
    _write_json(plan_path, _plan_payload())
    score = compile_plan(plan_path)
    bundle = root / "bundle"
    bundle.mkdir()
    source = {
        "source_id": "src_fixture",
        "sha256": _digest_bytes(b"src_fixture"),
        "relative_path": "fixture.wav",
        "native": {"sample_rate_hz": 1_000, "frame_count": 2_500},
    }
    _write_json(bundle / "source_catalog.json", {
        "schema": f"{RND06_SCHEMA}.source-catalog.v1",
        "files": [source],
    })
    count = 250
    midi = np.full(count, 38.0, dtype=np.float64)
    if fitting_span:
        # At local start 20 and duration 100 feature hops, a 100 Hz score maps
        # to exactly the source rows 20...120.  One 12-semitone global offset
        # therefore yields a perfect numeric comparison, without changing
        # either the fixture cache or the score controls.
        score_f0 = score["f0_hz"].astype(np.float64, copy=False)
        voiced = score_f0 > 0.0
        score_midi = np.full(score_f0.shape, np.nan, dtype=np.float64)
        score_midi[voiced] = 69.0 + 12.0 * np.log2(score_f0[voiced] / 440.0)
        midi[20 + np.flatnonzero(voiced)] = score_midi[voiced] - 12.0
    f0_hz = 440.0 * np.power(2.0, (midi - 69.0) / 12.0)
    features = bundle / "features"
    features.mkdir()
    np.savez_compressed(
        features / "src_fixture.npz",
        native_frame_center=np.arange(count, dtype=np.int64) * 10,
        time_s=np.arange(count, dtype=np.float64) / 100.0,
        f0_hz=f0_hz,
        midi_proxy=midi,
        voicing_confidence=np.full(count, 0.95, dtype=np.float64),
        rms_dbfs=np.full(count, -20.0, dtype=np.float64),
        onset_flux=np.linspace(0.001, 0.010, count, dtype=np.float64),
    )
    _write_json(features / "src_fixture.json", {
        "schema": FEATURE_SCHEMA,
        "source_id": source["source_id"],
        "source_sha256": source["sha256"],
        "relative_path": source["relative_path"],
        "feature_count": count,
        "npz": "features/src_fixture.npz",
        "analysis": {"feature_hop_s": 0.01, "feature_window_s": 0.025},
    })
    return bundle, plan_path


def _input_digests(bundle: Path, plan: Path) -> dict[str, str]:
    paths = [
        bundle / "source_catalog.json",
        bundle / "features" / "src_fixture.npz",
        bundle / "features" / "src_fixture.json",
        plan,
    ]
    return {path.name: _digest_bytes(path.read_bytes()) for path in paths}


class ExhaustiveScoreSpanSearchTests(unittest.TestCase):
    def test_feature_grid_scan_finds_known_global_offset_fit_without_reading_audio(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, plan = _make_fixture(root, fitting_span=True)
            before = _input_digests(bundle, plan)
            first = root / "first"
            second = root / "second"
            one = build_exhaustive_score_span_search(bundle, plan, first, top_results=32)
            two = build_exhaustive_score_span_search(bundle, plan, second, top_results=32)

            self.assertEqual(one, two)
            self.assertEqual(before, _input_digests(bundle, plan))
            self.assertFalse((bundle / "fixture.wav").exists())
            for filename in (REPORT_FILENAME, TSV_FILENAME):
                first_text = (first / filename).read_text(encoding="utf-8")
                self.assertEqual(first_text, (second / filename).read_text(encoding="utf-8"))
                self.assertNotIn(str(root), first_text)

            self.assertEqual(one["exhaustive_enumeration"]["source_track_count"], 1)
            self.assertEqual(one["exhaustive_enumeration"]["span_step_range_inclusive"], [80, 125])
            self.assertEqual(
                one["counts"]["feature_grid_single_source_spans_scanned"],
                sum(250 - steps for steps in range(80, 126)),
            )
            self.assertGreaterEqual(one["counts"]["all_numeric_measurement_gates_in_band_unreviewed_count"], 1)
            desired = [
                row for row in one["all_numeric_measurement_in_band_candidates_ranked_by_measurement_only"]
                if row["source_feature_contour"]["feature_index_range"] == [20, 121]
            ]
            self.assertEqual(len(desired), 1)
            row = desired[0]
            self.assertEqual(row["automated_disposition"], "measurement_in_band_but_unreviewed_not_approved")
            self.assertAlmostEqual(row["single_global_measurements"]["global_pitch_offset_semitones"], 12.0)
            self.assertLess(row["pitch_fit_measurements"]["pitch_rmse_cents"], 0.001)
            self.assertEqual(row["natural_phrase_or_slur_status"], "not_claimed_not_approved_not_inferred")
            self.assertTrue(one["interpretation_limits"]["source_audio_not_read_written_transformed_or_rendered"])
            self.assertTrue(one["measurement_contract"]["no_local_time_warp"])
            self.assertTrue(any(
                item["authorial_articulation"] == "slur"
                and item["source_proxy_is_not_a_matching_breath_slur_legato_or_gesture_label"]
                for item in row["authored_control_boundary_measurements"]
            ))

    def test_flat_cache_is_rejected_and_existing_output_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, plan = _make_fixture(root, fitting_span=False)
            result = build_exhaustive_score_span_search(bundle, plan, root / "rejected", top_results=8)
            self.assertEqual(result["counts"]["all_numeric_measurement_gates_in_band_unreviewed_count"], 0)
            self.assertEqual(result["overall_disposition"], "no_scanned_span_passed_all_fixed_numeric_measurement_gates")
            self.assertGreater(result["counts"]["numeric_measurement_mismatch_rejected_count"], 0)
            self.assertTrue(all(
                row["automated_disposition"] == "rejected_measurement_mismatch"
                for row in result["best_coverage_qualified_candidates_ranked_by_exact_rmse"]
            ))

            existing = root / "existing"
            existing.mkdir()
            with self.assertRaisesRegex(ExhaustiveScoreSpanSearchError, "fresh"):
                build_exhaustive_score_span_search(bundle, plan, existing)
            with self.assertRaisesRegex(ExhaustiveScoreSpanSearchError, "top-results"):
                build_exhaustive_score_span_search(bundle, plan, root / "invalid-top", top_results=0)


if __name__ == "__main__":
    unittest.main()
