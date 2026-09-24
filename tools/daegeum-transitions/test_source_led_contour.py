#!/usr/bin/env python3
"""Deterministic tests for source-led feature-proxy contour scaffolding."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import numpy as np  # noqa: E402

from source_led_contour import (  # noqa: E402
    FEATURE_SCHEMA,
    RND06_SCHEMA,
    SourceLedContourError,
    build_source_led_contour,
)


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True), encoding="utf-8")


def _truth_path_status() -> dict[str, bool]:
    return {
        "all_results_remain_unreviewed": True,
        "trajectory_was_scanned_directly_from_feature_npz_not_candidate_pairs": True,
        "source_is_one_verified_recording": True,
        "strictly_consecutive_voiced_feature_rows": True,
        "not_evidence_of_same_breath": True,
        "not_evidence_of_slur": True,
        "not_evidence_of_natural_legato": True,
        "not_an_approved_transition_path": True,
        "not_a_transition_bank_item": True,
        "not_a_training_item": True,
        "not_a_game_asset": True,
    }


def _truth_boundary_status() -> dict[str, bool]:
    return {
        "all_results_remain_unreviewed": True,
        "unreviewed_automatic_boundary_candidate": True,
        "automatic_measurement_is_not_a_musical_phrase_label": True,
        "not_evidence_of_same_breath": True,
        "not_evidence_of_slur": True,
        "not_evidence_of_natural_legato": True,
        "not_an_approved_transition": True,
        "not_transition_bank_item": True,
        "not_training_item": True,
        "not_game_asset": True,
    }


def _make_bundle(root: Path, *, gap_at: int | None = None) -> tuple[Path, dict[str, object], str]:
    bundle = root / "bundle"
    bundle.mkdir()
    source = {
        "source_id": "src_fixture",
        "sha256": _digest("src_fixture"),
        "relative_path": "fixture.wav",
        "native": {"sample_rate_hz": 1000, "frame_count": 500},
    }
    catalog = {"schema": f"{RND06_SCHEMA}.source-catalog.v1", "files": [source]}
    catalog_path = bundle / "source_catalog.json"
    _write_json(catalog_path, catalog)
    count = 24
    midi = np.full(count, 69.0, dtype=np.float64)
    midi[4:8] = np.asarray([69.00, 69.02, 68.99, 69.01])
    midi[9:15] = np.asarray([71.00, 71.02, 70.99, 71.01, 71.00, 71.02])
    midi[15:20] = np.asarray([72.0, 72.4, 72.8, 73.2, 73.6])
    f0 = 440.0 * np.power(2.0, (midi - 69.0) / 12.0)
    # The one missing proxy is deliberately preserved rather than filled.
    midi[8] = np.nan
    f0[8] = np.nan
    confidence = np.full(count, 0.91, dtype=np.float64)
    confidence[8] = 0.0
    rms = np.full(count, -20.0, dtype=np.float64)
    rms[4:8] += np.asarray([0.0, 0.1, -0.1, 0.0])
    rms[9:15] += np.asarray([0.0, 0.1, 0.0, -0.1, 0.1, 0.0])
    rms[15:20] += np.asarray([0.0, 0.4, 0.8, 1.2, 1.6])
    time_s = np.arange(count, dtype=np.float64) * 0.01
    if gap_at is not None:
        time_s[gap_at:] += 0.10
    features = bundle / "features"
    features.mkdir()
    np.savez_compressed(
        features / "src_fixture.npz",
        native_frame_center=np.arange(count, dtype=np.int64) * 10,
        time_s=time_s,
        f0_hz=f0,
        midi_proxy=midi,
        voicing_confidence=confidence,
        rms_dbfs=rms,
        onset_flux=np.linspace(0.001, 0.010, count, dtype=np.float64),
    )
    _write_json(features / "src_fixture.json", {
        "schema": FEATURE_SCHEMA,
        "source_id": source["source_id"],
        "source_sha256": source["sha256"],
        "relative_path": source["relative_path"],
        "feature_count": count,
        "npz": "features/src_fixture.npz",
        "analysis": {"feature_hop_s": 0.01, "feature_window_s": 0.05},
    })
    return bundle, source, hashlib.sha256(catalog_path.read_bytes()).hexdigest()


def _trajectory_row(source: dict[str, object]) -> dict[str, object]:
    return {
        "trajectory_id": "trajectory_fixture_000005_000019_g01",
        "priority_rank": 1,
        "source": {
            "source_id": source["source_id"],
            "sha256": source["sha256"],
            "relative_path": source["relative_path"],
            "sample_rate_hz": 1000,
            "frame_count": 500,
        },
        # The native span deliberately encloses the trajectory feature centres
        # by a little feature-window context, as the real retrieval rows do.
        "native_source_span": {"frame_range": [40, 200], "frame_count": 160},
        "feature_span": {"feature_index_range": [5, 19]},
        "automatic_path_status": _truth_path_status(),
    }


def _trajectory_report(source: dict[str, object], catalog_sha: str) -> dict[str, object]:
    return {
        "schema": f"{RND06_SCHEMA}.direct-f0-trajectory-retrieval.v1",
        "input_bundle": {
            "directory_basename": "bundle",
            "source_catalog_sha256": catalog_sha,
        },
        "trajectories": [_trajectory_row(source)],
    }


class SourceLedContourTest(unittest.TestCase):
    def test_direct_report_is_deterministic_and_does_not_need_a_wav(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, source, catalog_sha = _make_bundle(root)
            report = root / "direct.json"
            _write_json(report, _trajectory_report(source, catalog_sha))
            first = root / "first"
            second = root / "second"
            kwargs = {
                "priority_rank": 1,
                "coarse_max_points": 5,
                "stable_min_feature_frames": 3,
                "stable_max_pitch_span_cents": 20.0,
                "stable_max_rms_range_db": 1.0,
            }
            one = build_source_led_contour(bundle, report, first, **kwargs)
            two = build_source_led_contour(bundle, report, second, **kwargs)
            self.assertEqual(one, two)
            for filename in ("source_led_contour.json", "source_led_contour.tsv"):
                initial = (first / filename).read_text(encoding="utf-8")
                self.assertEqual(initial, (second / filename).read_text(encoding="utf-8"))
                self.assertNotIn(str(root), initial)
            self.assertFalse((bundle / "fixture.wav").exists())
            self.assertEqual(one["source"]["source_catalog_sha256"], catalog_sha)
            self.assertEqual(one["native_source_span"]["frame_range"], [40, 200])
            self.assertEqual(one["feature_cache"]["feature_index_range"], [4, 20])
            self.assertEqual(one["feature_cache"]["input_declared_feature_span"], {"feature_index_range": [5, 19]})
            self.assertTrue(one["interpretation_limits"]["source_audio_not_read_written_transformed_or_rendered"])
            self.assertTrue(one["interpretation_limits"]["contour_is_not_expert_transcription_or_score_annotation"])
            self.assertGreaterEqual(one["counts"]["stable_region_suggestion_count"], 1)
            self.assertEqual(one["coarse_feature_proxy_contour"][0]["sequence_index"], 1)
            self.assertTrue(
                one["low_variation_feature_proxy_region_suggestions"][0][
                    "feature_proxy_low_variation_suggestion_not_expert_transcription_or_articulation_label"
                ]
            )
            with self.assertRaises(SourceLedContourError):
                build_source_led_contour(bundle, report, first, **kwargs)

    def test_phrase_boundary_triage_report_uses_the_same_verified_span_contract(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, source, catalog_sha = _make_bundle(root)
            candidate = {
                "candidate_id": "phrase_boundary_fixture_01",
                "priority_rank": 1,
                "source": {
                    "source_id": source["source_id"],
                    "sha256": source["sha256"],
                    "relative_path": source["relative_path"],
                    "sample_rate_hz": 1000,
                    "frame_count": 500,
                },
                "native_source_span": {
                    "frame_range": [90, 150],
                    "frame_count": 60,
                    "single_contiguous_source_frame_range": True,
                },
                "automatic_boundary_status": _truth_boundary_status(),
            }
            report = {
                "schema": f"{RND06_SCHEMA}.source-led-phrase-boundary-triage.v1",
                "input": {"bundle": {"directory_basename": "bundle", "source_catalog_sha256": catalog_sha}},
                "candidates": [candidate],
            }
            input_path = root / "boundary.json"
            _write_json(input_path, report)
            result = build_source_led_contour(
                bundle,
                input_path,
                root / "out",
                priority_rank=1,
                coarse_max_points=4,
                include_stable_region_suggestions=False,
            )
            self.assertEqual(result["input_selection"]["kind"], "phrase_boundary_triage_report_row")
            self.assertEqual(result["input_truth_labels"]["field"], "automatic_boundary_status")
            self.assertEqual(result["counts"]["stable_region_suggestion_count"], 0)
            self.assertEqual(result["feature_cache"]["input_declared_feature_span"], None)
            self.assertNotIn("breath", json.dumps(result["coarse_feature_proxy_contour"], sort_keys=True).lower())

    def test_rejects_catalog_mismatch_and_feature_timeline_gap(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, source, catalog_sha = _make_bundle(root)
            report = root / "direct.json"
            bad_report = _trajectory_report(source, catalog_sha)
            bad_report["input_bundle"]["source_catalog_sha256"] = "0" * 64  # type: ignore[index]
            _write_json(report, bad_report)
            with self.assertRaises(SourceLedContourError):
                build_source_led_contour(bundle, report, root / "catalog-mismatch", priority_rank=1)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, source, catalog_sha = _make_bundle(root, gap_at=12)
            report = root / "direct.json"
            _write_json(report, _trajectory_report(source, catalog_sha))
            with self.assertRaises(SourceLedContourError):
                build_source_led_contour(bundle, report, root / "timeline-gap", priority_rank=1)


if __name__ == "__main__":
    unittest.main()
