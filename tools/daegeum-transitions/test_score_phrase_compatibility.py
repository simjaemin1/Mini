#!/usr/bin/env python3
"""Deterministic tests for offline score-to-source compatibility reports."""

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
from score_phrase_compatibility import (  # noqa: E402
    REPORT_FILENAME,
    TSV_FILENAME,
    ScorePhraseCompatibilityError,
    build_score_phrase_compatibility,
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


def _truth_labels() -> dict[str, bool]:
    return {
        "all_results_remain_unreviewed": True,
        "automatic_measurements_are_not_a_musical_phrase_or_arirang_style_label": True,
        "source_is_one_sha_verified_ngc_manifest_catalog_recording": True,
        "raw_span_is_one_contiguous_native_coordinate_range": True,
        "not_evidence_of_same_breath": True,
        "not_evidence_of_slur": True,
        "not_evidence_of_natural_legato": True,
        "not_an_approved_transition_or_phrase": True,
        "not_a_transition_bank_item": True,
        "not_a_training_item": True,
        "not_a_game_asset": True,
    }


def _plan_payload() -> dict[str, object]:
    return {
        "schema": PLAN_SCHEMA,
        "r_and_d_scope": _scope(),
        "instrument": {"id": "daegeum", "sustained": True},
        "control_hz": 100,
        "events": [
            {
                "id": "breath",
                "start_seconds": 0.0,
                "end_seconds": 1.0,
                "pitch_hz": 523.2511306011972,
                "articulation": "breath_start",
                "steady_loudness_db": -28.0,
            },
            {
                "id": "explicit-slur",
                "start_seconds": 1.0,
                "end_seconds": 2.0,
                "pitch_hz": 587.3295358348151,
                "articulation": "slur",
                "slur_from_previous": True,
                "steady_loudness_db": -28.0,
            },
        ],
    }


def _make_fixture(root: Path, *, mismatch_second_half: bool = False) -> tuple[Path, Path, Path]:
    """Make a cache-only source contour; deliberately omit fixture.wav."""

    plan_path = root / "authorial-plan.json"
    _write_json(plan_path, _plan_payload())
    score = compile_plan(plan_path)

    bundle = root / "bundle"
    bundle.mkdir()
    source = {
        "source_id": "src_fixture",
        "sha256": _digest_bytes(b"src_fixture"),
        "relative_path": "fixture.wav",
        "native": {"sample_rate_hz": 2_000, "frame_count": 2_010},
    }
    catalog_path = bundle / "source_catalog.json"
    _write_json(catalog_path, {"schema": f"{RND06_SCHEMA}.source-catalog.v1", "files": [source]})

    # A 0.5 source/score ratio maps each 100 Hz authored control point to an
    # existing 200 Hz proxy row.  No test fixture interpolation is involved.
    source_midi = np.full(len(score["f0_hz"]), np.nan, dtype=np.float64)
    score_voiced = score["f0_hz"] > 0.0
    source_midi[score_voiced] = 69.0 + 12.0 * np.log2(score["f0_hz"][score_voiced] / 440.0) - 12.0
    if mismatch_second_half:
        source_midi[100:] -= 1.0
    source_f0 = 440.0 * np.power(2.0, (source_midi - 69.0) / 12.0)
    features = bundle / "features"
    features.mkdir()
    count = len(source_midi)
    np.savez_compressed(
        features / "src_fixture.npz",
        native_frame_center=np.arange(count, dtype=np.int64) * 10,
        time_s=np.arange(count, dtype=np.float64) / 200.0,
        f0_hz=source_f0,
        midi_proxy=source_midi,
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
        "analysis": {"feature_hop_s": 0.005, "feature_window_s": 0.025},
    })

    pool_path = root / "phrase-pool.json"
    _write_json(pool_path, {
        "schema": f"{RND06_SCHEMA}.source-led-phrase-pool.v1",
        "input": {
            "bundle": {
                "directory_basename": "bundle",
                "source_catalog_sha256": _digest_bytes(catalog_path.read_bytes()),
            },
        },
        "candidates": [{
            "candidate_id": "pool_fixture_explicit_slur_measurement_only",
            "priority_rank": 1,
            "profile_id": "fixture_proxy",
            "source": {
                "source_id": source["source_id"],
                "sha256": source["sha256"],
                "relative_path": source["relative_path"],
                "sample_rate_hz": 2_000,
                "frame_count": 2_010,
                "ngc_extend_seq": 42,
            },
            "native_source_span": {
                "frame_range": [0, 2_010],
                "frame_count": 2_010,
                "single_contiguous_source_frame_range": True,
            },
            "feature_span": {"feature_index_range": [0, count]},
            "automatic_candidate_status": _truth_labels(),
        }],
    })
    return bundle, plan_path, pool_path


def _inputs_digest(paths: list[Path]) -> dict[str, str]:
    return {path.name: _digest_bytes(path.read_bytes()) for path in paths}


class ScorePhraseCompatibilityTests(unittest.TestCase):
    def test_exact_cache_proxy_measurement_is_deterministic_and_never_claims_slur(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, plan, pool = _make_fixture(root)
            tracked_inputs = [
                bundle / "source_catalog.json",
                bundle / "features" / "src_fixture.npz",
                bundle / "features" / "src_fixture.json",
                plan,
                pool,
            ]
            before = _inputs_digest(tracked_inputs)
            first = root / "first"
            second = root / "second"
            kwargs = {"min_time_ratio": 0.4, "max_time_ratio": 0.6}
            one = build_score_phrase_compatibility(bundle, plan, pool, first, **kwargs)
            two = build_score_phrase_compatibility(bundle, plan, pool, second, **kwargs)

            self.assertEqual(one, two)
            self.assertEqual(before, _inputs_digest(tracked_inputs))
            self.assertFalse((bundle / "fixture.wav").exists())
            for filename in (REPORT_FILENAME, TSV_FILENAME):
                first_text = (first / filename).read_text(encoding="utf-8")
                self.assertEqual(first_text, (second / filename).read_text(encoding="utf-8"))
                self.assertNotIn(str(root), first_text)

            candidate = one["ranked_candidates"][0]
            self.assertEqual(candidate["measurement_rank"], 1)
            self.assertEqual(candidate["automated_disposition"], "measurement_in_band_but_unreviewed_not_approved")
            self.assertEqual(candidate["numeric_mismatch_flags"], [])
            self.assertAlmostEqual(
                candidate["single_global_measurements"]["uniform_time_ratio_source_seconds_per_score_second"],
                0.5,
            )
            self.assertAlmostEqual(candidate["single_global_measurements"]["global_pitch_offset_semitones"], 12.0)
            self.assertLess(candidate["pitch_fit_measurements"]["pitch_rmse_cents"], 0.001)
            self.assertEqual(candidate["natural_phrase_or_slur_status"], "not_claimed_not_approved_not_inferred")
            self.assertTrue(one["interpretation_limits"]["source_audio_not_read_written_transformed_or_rendered"])
            self.assertTrue(one["interpretation_limits"]["score_controls_not_written_or_transformed"])
            self.assertTrue(one["interpretation_limits"]["authorial_breath_rearticulation_slur_release_controls_are_not_inferred_from_source"])
            boundary = candidate["authored_control_boundary_measurements"]
            self.assertTrue(any(item["authorial_articulation"] == "slur" for item in boundary))
            self.assertTrue(all(item["source_proxy_is_not_a_matching_breath_slur_legato_or_gesture_label"] for item in boundary))

    def test_numeric_mismatch_is_rejected_and_missing_truth_label_refuses_report(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, plan, pool = _make_fixture(root, mismatch_second_half=True)
            result = build_score_phrase_compatibility(
                bundle,
                plan,
                pool,
                root / "mismatch",
                min_time_ratio=0.4,
                max_time_ratio=0.6,
                max_pitch_rmse_cents=1.0,
                max_p95_absolute_pitch_error_cents=1.0,
                max_interval_error_cents=1.0,
            )
            candidate = result["ranked_candidates"][0]
            self.assertEqual(candidate["automated_disposition"], "rejected_measurement_mismatch")
            self.assertIn("pitch_rmse_exceeds_measurement_gate", candidate["numeric_mismatch_flags"])
            self.assertTrue(result["interpretation_limits"]["no_candidate_is_approved_or_called_a_natural_phrase_slur_or_legato"])

            invalid = json.loads(pool.read_text(encoding="utf-8"))
            del invalid["candidates"][0]["automatic_candidate_status"]["not_evidence_of_slur"]
            invalid_path = root / "missing-truth.json"
            _write_json(invalid_path, invalid)
            refused_output = root / "refused"
            with self.assertRaisesRegex(ScorePhraseCompatibilityError, "not_slur_evidence"):
                build_score_phrase_compatibility(
                    bundle,
                    plan,
                    invalid_path,
                    refused_output,
                    min_time_ratio=0.4,
                    max_time_ratio=0.6,
                )
            self.assertFalse(refused_output.exists())


if __name__ == "__main__":
    unittest.main()
