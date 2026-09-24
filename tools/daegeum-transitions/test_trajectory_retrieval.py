#!/usr/bin/env python3
"""Deterministic tests for direct contiguous F0-proxy trajectory retrieval."""

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

from trajectory_retrieval import (  # noqa: E402
    FEATURE_SCHEMA,
    RND06_SCHEMA,
    TrajectoryRetrievalError,
    build_direct_trajectory_retrieval,
    parse_duration_grid,
    parse_target_midi,
)


def _digest(source_id: str) -> str:
    return hashlib.sha256(source_id.encode("utf-8")).hexdigest()


def _slot_curve(target: tuple[float, ...], count: int) -> np.ndarray:
    """Match the tool's three equal-duration score-note-slot template."""

    positions = np.arange(count, dtype=np.float64) / max(1, count - 1)
    centres = (np.arange(len(target), dtype=np.float64) + 0.5) / len(target)
    nodes = np.concatenate(([0.0], centres, [1.0]))
    values = np.concatenate(([target[0]], np.asarray(target), [target[-1]]))
    return np.interp(positions, nodes, values)


def _catalog_source(source_id: str, relative_path: str, *, frame_count: int) -> dict[str, object]:
    return {
        "source_id": source_id,
        "sha256": _digest(source_id),
        "relative_path": relative_path,
        "native": {"sample_rate_hz": 1000, "frame_count": frame_count},
    }


def _write_track(bundle: Path, source: dict[str, object], midi: np.ndarray, *, invalid_index: int | None = None) -> None:
    source_id = str(source["source_id"])
    count = len(midi)
    features = bundle / "features"
    features.mkdir(exist_ok=True)
    confidence = np.full(count, 0.93, dtype=np.float64)
    rms = np.linspace(-21.0, -20.5, count, dtype=np.float64)
    f0 = 440.0 * np.power(2.0, (midi - 69.0) / 12.0)
    if invalid_index is not None:
        confidence[invalid_index] = 0.0
        f0[invalid_index] = np.nan
        midi[invalid_index] = np.nan
    np.savez_compressed(
        features / f"{source_id}.npz",
        native_frame_center=np.arange(count, dtype=np.int64) * 10,
        time_s=np.arange(count, dtype=np.float64) * 0.01,
        f0_hz=f0,
        midi_proxy=midi,
        voicing_confidence=confidence,
        rms_dbfs=rms,
        onset_flux=np.full(count, 0.01, dtype=np.float64),
    )
    (features / f"{source_id}.json").write_text(json.dumps({
        "schema": FEATURE_SCHEMA,
        "source_id": source_id,
        "source_sha256": source["sha256"],
        "relative_path": source["relative_path"],
        "feature_count": count,
        "npz": f"features/{source_id}.npz",
        "analysis": {"feature_hop_s": 0.01, "feature_window_s": 0.05},
    }, sort_keys=True), encoding="utf-8")


def _write_manifest(path: Path, entries: list[dict[str, object]]) -> None:
    path.write_text(json.dumps({"entries": entries}, ensure_ascii=False, sort_keys=True), encoding="utf-8")


def _manifest_entry(sequence: int, source_id: str, *, bpm: int = 84, beat: str = "3/4") -> dict[str, object]:
    return {
        "extend_seq": sequence,
        "catalog_record": {"division": "대금산조", "beat": beat, "bpm": bpm},
        "file_info_record": {"division": "대금산조"},
        "download": {
            "relative_path": f"audio/extend-{sequence:06d}.wav",
            "sha256": _digest(source_id),
        },
    }


def _make_bundle(root: Path) -> tuple[Path, Path]:
    bundle = root / "bundle"
    bundle.mkdir()
    count = 217  # 2.16s at 10ms feature-hop including both feature centres.
    source_a = _catalog_source("src_a", "extend-001520.wav", frame_count=3_000)
    source_b = _catalog_source("src_b", "extend-001585.wav", frame_count=3_000)
    source_c = _catalog_source("src_c", "extend-001521.wav", frame_count=3_000)
    (bundle / "source_catalog.json").write_text(json.dumps({
        "schema": f"{RND06_SCHEMA}.source-catalog.v1",
        "files": [source_a, source_b, source_c],
    }, sort_keys=True), encoding="utf-8")
    # A is an exact 77→74→72 trajectory under one -1 semitone global shift.
    _write_track(bundle, source_a, _slot_curve((78.0, 75.0, 73.0), count))
    # B is deliberately the wrong second interval, though it shares an NGC-ish
    # filename.  It must not outrank the direct matched trajectory.
    _write_track(bundle, source_b, _slot_curve((78.0, 75.0, 70.5), count))
    # C is a match interrupted by an invalid feature row.  It must never yield
    # a 217-row direct contiguous voiced span across that interruption.
    _write_track(bundle, source_c, _slot_curve((78.0, 75.0, 73.0), count), invalid_index=108)
    manifest = root / "ngc.manifest.json"
    _write_manifest(manifest, [
        _manifest_entry(1520, "src_a"),
        _manifest_entry(1521, "src_c"),
        _manifest_entry(1585, "src_b"),
    ])
    return bundle, manifest


class DirectTrajectoryRetrievalTest(unittest.TestCase):
    def test_parsers_preserve_target_and_duration_requirements(self) -> None:
        self.assertEqual(parse_target_midi("77,74,72"), (77.0, 74.0, 72.0))
        self.assertEqual(parse_duration_grid("2.0,2.16,2.32"), (2.0, 2.16, 2.32))
        with self.assertRaises(TrajectoryRetrievalError):
            parse_target_midi("77,74")
        with self.assertRaises(TrajectoryRetrievalError):
            parse_duration_grid("2.16,2.0")

    def test_scans_direct_contiguous_npz_span_under_one_global_shift(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, _ = _make_bundle(root)
            result = build_direct_trajectory_retrieval(
                bundle,
                root / "out",
                target_midi="77,74,72",
                duration_grid_seconds="2.16",
                top=3,
                stride_frames=1,
                template_samples=37,
            )
            first = result["trajectories"][0]
            self.assertEqual(first["source"]["source_id"], "src_a")
            self.assertAlmostEqual(first["one_global_pitch_shift_proxy"]["semitones"], -1.0, places=5)
            self.assertLess(first["trajectory_fit_proxies"]["interval_error_rms_cents"], 0.01)
            self.assertLess(first["trajectory_fit_proxies"]["smoothed_curve_residual_rms_cents"], 0.01)
            self.assertEqual(first["feature_span"]["feature_index_range"], [0, 217])
            self.assertEqual(first["duration_grid_fit"]["requested_note_slot_duration_seconds"], 0.72)
            self.assertTrue(first["automatic_path_status"]["trajectory_was_scanned_directly_from_feature_npz_not_candidate_pairs"])
            self.assertTrue(first["automatic_path_status"]["not_evidence_of_natural_legato"])
            self.assertTrue(first["automatic_path_status"]["not_an_approved_transition_path"])
            self.assertTrue(first["native_source_span"]["not_a_verified_phrase_or_gesture_boundary"])
            self.assertEqual(first["continuity_proxies"], first["feature_frame_continuity_proxies"])
            self.assertIsNotNone(first["continuity_proxies"]["maximum_adjacent_smoothed_pitch_step_cents"])
            self.assertEqual(result["counts"]["direct_windows_scanned"], 2)
            self.assertNotIn("candidates", json.dumps(result, sort_keys=True).lower())

    def test_ngc_first_65_requires_complete_exact_range_but_general_range_can_be_scoped(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, manifest = _make_bundle(root)
            # A partial manifest must not be casually called the first 65
            # official 3/4 84-BPM sources.
            with self.assertRaises(TrajectoryRetrievalError):
                build_direct_trajectory_retrieval(
                    bundle,
                    root / "first65-out",
                    duration_grid_seconds="2.16",
                    ngc_extended_manifest=manifest,
                    ngc_first_65_3_4_84=True,
                    top=3,
                    stride_frames=1,
                    template_samples=37,
                )
            result = build_direct_trajectory_retrieval(
                bundle,
                root / "out",
                duration_grid_seconds="2.16",
                ngc_extended_manifest=manifest,
                ngc_extend_seq_range="1520:1521",
                top=3,
                stride_frames=1,
                template_samples=37,
            )
            self.assertEqual(result["counts"]["selected_source_count"], 2)
            self.assertEqual(
                {item["source_id"] for item in result["input_bundle"]["selected_feature_files"]},
                {"src_a", "src_c"},
            )
            self.assertEqual(result["trajectories"][0]["source"]["ngc_extend_seq"], 1520)
            # C cannot cross its inserted invalid feature row, so only A has a
            # full 2.16-second direct run.
            self.assertEqual(result["counts"]["direct_windows_scanned"], 1)

    def test_ngc_manifest_sha_must_match_catalog_source_before_mapping(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, manifest = _make_bundle(root)
            data = json.loads(manifest.read_text(encoding="utf-8"))
            data["entries"][0]["download"]["sha256"] = "0" * 64
            manifest.write_text(json.dumps(data, sort_keys=True), encoding="utf-8")
            with self.assertRaises(TrajectoryRetrievalError):
                build_direct_trajectory_retrieval(
                    bundle,
                    root / "out",
                    duration_grid_seconds="2.16",
                    ngc_extended_manifest=manifest,
                    ngc_extend_seq_range="1520:1520",
                    top=1,
                    stride_frames=1,
                    template_samples=37,
                )

    def test_source_filter_duration_grid_outputs_are_deterministic_and_non_overwriting(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, _ = _make_bundle(root)
            first = root / "first"
            second = root / "second"
            kwargs = {
                "duration_grid_seconds": "2.0,2.16",
                "source_filters": ("extend-001520.wav",),
                "top": 2,
                "stride_frames": 1,
                "template_samples": 37,
            }
            build_direct_trajectory_retrieval(bundle, first, **kwargs)
            build_direct_trajectory_retrieval(bundle, second, **kwargs)
            for filename in ("direct_trajectory_retrieval.json", "direct_trajectory_retrieval.tsv"):
                initial = (first / filename).read_text(encoding="utf-8")
                self.assertEqual(initial, (second / filename).read_text(encoding="utf-8"))
                self.assertNotIn(str(root), initial)
            with self.assertRaises(TrajectoryRetrievalError):
                build_direct_trajectory_retrieval(bundle, first, **kwargs)


if __name__ == "__main__":
    unittest.main()
