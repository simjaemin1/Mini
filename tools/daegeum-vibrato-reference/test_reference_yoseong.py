#!/usr/bin/env python3
"""Synthetic contract tests for the fail-closed reference-shape extractor."""

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

from reference_yoseong import (  # noqa: E402
    FEATURE_SCHEMA,
    OUTPUT_SCHEMA,
    RND06_SCHEMA,
    ReferenceYoseongError,
    extract_reference_shape,
    parse_window_seconds,
)


def _digest(label: str) -> str:
    return hashlib.sha256(label.encode("utf-8")).hexdigest()


def _write_bundle(
    root: Path,
    midi: np.ndarray,
    *,
    confidence: np.ndarray | None = None,
    rms: np.ndarray | None = None,
    source_id: str = "src_synthetic",
) -> Path:
    bundle = root / "bundle"
    features = bundle / "features"
    features.mkdir(parents=True)
    count = len(midi)
    source_sha = _digest(source_id)
    native_centres = 1200 + np.arange(count, dtype=np.int64) * 480
    feature_time = 0.025 + np.arange(count, dtype=np.float64) * 0.01
    if confidence is None:
        confidence = np.full(count, 0.96, dtype=np.float64)
    if rms is None:
        rms = np.full(count, -22.0, dtype=np.float64)
    f0 = 440.0 * np.power(2.0, (midi - 69.0) / 12.0)
    np.savez_compressed(
        features / f"{source_id}.npz",
        native_frame_center=native_centres,
        time_s=feature_time,
        f0_hz=f0,
        midi_proxy=midi,
        voicing_confidence=confidence,
        rms_dbfs=rms,
        onset_flux=np.full(count, 0.002, dtype=np.float64),
    )
    metadata = {
        "schema": FEATURE_SCHEMA,
        "source_id": source_id,
        "source_sha256": source_sha,
        "relative_path": "extend-009999.wav",
        "feature_count": count,
        "npz": f"features/{source_id}.npz",
        "analysis": {
            "feature_hop_s": 0.01,
            "feature_window_s": 0.05,
            "f0_method": "synthetic_test_proxy",
            "f0_range_hz": [65.0, 1000.0],
            "f0_is_not_a_human_pitch_label": True,
        },
    }
    (features / f"{source_id}.json").write_text(
        json.dumps(metadata, sort_keys=True), encoding="utf-8"
    )
    catalog = {
        "schema": f"{RND06_SCHEMA}.source-catalog.v1",
        "files": [{
            "source_id": source_id,
            "sha256": source_sha,
            "relative_path": "extend-009999.wav",
            "native": {
                "sample_rate_hz": 48000,
                "frame_count": int(native_centres[-1] + 2400),
            },
            "rights": {
                "status": "unverified_local_rnd_only",
                "training_or_distribution_requires_source_term_confirmation": True,
            },
        }],
    }
    (bundle / "source_catalog.json").write_text(
        json.dumps(catalog, sort_keys=True), encoding="utf-8"
    )
    return bundle


class ReferenceYoseongTest(unittest.TestCase):
    def test_periodic_internal_window_exports_unreviewed_reference_only(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            time = np.arange(320, dtype=np.float64) * 0.01
            midi = 69.0 + 0.32 * np.sin(2.0 * np.pi * 4.0 * time + 0.4)
            rms = -22.0 + 0.7 * np.sin(2.0 * np.pi * 4.0 * time - 0.2)
            bundle = _write_bundle(root, midi, rms=rms)
            output = root / "reference.json"

            result = extract_reference_shape(
                bundle,
                output,
                window_seconds="1.2",
                stride_frames=3,
                contour_points=33,
                top=4,
            )

            self.assertEqual(result["schema"], OUTPUT_SCHEMA)
            self.assertEqual(result["status"], "reference_shape_unreviewed")
            self.assertTrue(result["b2_application_gate"]["reference_shape_available"])
            self.assertFalse(
                result["b2_application_gate"][
                    "may_be_interpreted_as_human_confirmed_yoseong"
                ]
            )
            selected = result["selection"]
            self.assertIsNotNone(selected)
            assert selected is not None
            self.assertEqual(selected["source"]["source_id"], "src_synthetic")
            self.assertEqual(selected["source"]["source_sha256"], _digest("src_synthetic"))
            self.assertIn(
                "catalog_declared", selected["source"]["source_sha256_authority"]
            )
            self.assertFalse(selected["claim_limits"]["yoseong_confirmed"])
            self.assertFalse(selected["claim_limits"]["gyeonggi_minyo_style_confirmed"])
            self.assertFalse(
                selected["claim_limits"][
                    "whole_source_phrase_score_compatibility_confirmed"
                ]
            )
            metrics = selected["proxy_metrics"]
            self.assertAlmostEqual(metrics["rate_hz_proxy"], 4.0, delta=0.25)
            self.assertGreater(metrics["depth_cents_proxy"], 20.0)
            contour = selected["normalized_reference_contour"]
            self.assertEqual(contour["sample_count"], 33)
            self.assertEqual(len(contour["pitch_residual_cents"]), 33)
            self.assertEqual(len(contour["rms_db_relative_to_candidate_median"]), 33)
            self.assertEqual(len(contour["contour_payload_sha256"]), 64)
            self.assertFalse(result["artifact_policy"]["training_item"])
            self.assertFalse(result["artifact_policy"]["game_asset"])

            encoded = output.read_text(encoding="utf-8")
            self.assertNotIn(str(root), encoded)
            self.assertNotIn("/private/", encoded)
            self.assertNotIn("/Users/", encoded)

    def test_non_periodic_straight_tone_is_blocked_without_shape(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            midi = np.full(300, 69.0, dtype=np.float64)
            bundle = _write_bundle(root, midi)
            result = extract_reference_shape(
                bundle,
                root / "blocked.json",
                window_seconds="0.9,1.2",
                stride_frames=4,
                top=3,
            )
            self.assertEqual(result["status"], "blocked")
            self.assertIsNone(result["selection"])
            self.assertFalse(result["b2_application_gate"]["reference_shape_available"])
            self.assertTrue(result["b2_application_gate"]["blocked"])
            self.assertGreater(
                result["rejection_counts"].get("periodic_pitch_depth_below_gate", 0),
                0,
            )

    def test_note_step_pattern_is_not_accepted_as_sustained_note_proxy(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            time = np.arange(300, dtype=np.float64) * 0.01
            # A four-Hz square-wave pitch switch is periodic but is composed of
            # explicit 300-cent note steps, so the adjacent-step gate must win.
            midi = 69.0 + 1.5 * np.sign(np.sin(2.0 * np.pi * 4.0 * time + 0.2))
            bundle = _write_bundle(root, midi)
            result = extract_reference_shape(
                bundle,
                root / "blocked.json",
                window_seconds="1.2",
                stride_frames=5,
                top=3,
            )
            self.assertEqual(result["status"], "blocked")
            self.assertGreater(
                result["rejection_counts"].get(
                    "pitch_motion_too_large_for_sustained_note_proxy", 0
                )
                + result["rejection_counts"].get(
                    "adjacent_pitch_step_exceeds_sustained_note_gate", 0
                ),
                0,
            )

    def test_metadata_identity_mismatch_and_source_bundle_write_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            time = np.arange(260, dtype=np.float64) * 0.01
            midi = 69.0 + 0.25 * np.sin(2.0 * np.pi * 4.2 * time)
            bundle = _write_bundle(root, midi)
            metadata_path = bundle / "features" / "src_synthetic.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["source_sha256"] = "0" * 64
            metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
            with self.assertRaises(ReferenceYoseongError):
                extract_reference_shape(bundle, root / "out.json", window_seconds="1.2")

            clean_bundle = _write_bundle(root / "clean", midi)
            with self.assertRaises(ReferenceYoseongError):
                extract_reference_shape(
                    clean_bundle,
                    clean_bundle / "must-not-write.json",
                    window_seconds="1.2",
                )

    def test_f0_and_midi_proxy_identity_mismatch_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            time = np.arange(260, dtype=np.float64) * 0.01
            midi = 69.0 + 0.25 * np.sin(2.0 * np.pi * 4.2 * time)
            bundle = _write_bundle(root, midi)
            npz_path = bundle / "features" / "src_synthetic.npz"
            with np.load(npz_path, allow_pickle=False) as archive:
                arrays = {name: archive[name] for name in archive.files}
            arrays["midi_proxy"] = arrays["midi_proxy"] + 1.0
            np.savez_compressed(npz_path, **arrays)
            with self.assertRaises(ReferenceYoseongError):
                extract_reference_shape(bundle, root / "out.json", window_seconds="1.2")

    def test_output_is_non_overwriting_and_window_parser_is_strict(self) -> None:
        self.assertEqual(parse_window_seconds("0.9,1.2"), (0.9, 1.2))
        with self.assertRaises(ReferenceYoseongError):
            parse_window_seconds("1.2,0.9")
        with self.assertRaises(ReferenceYoseongError):
            parse_window_seconds("0.9,0.9")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            time = np.arange(260, dtype=np.float64) * 0.01
            midi = 69.0 + 0.25 * np.sin(2.0 * np.pi * 4.2 * time)
            bundle = _write_bundle(root, midi)
            output = root / "out.json"
            extract_reference_shape(bundle, output, window_seconds="1.2")
            with self.assertRaises(ReferenceYoseongError):
                extract_reference_shape(bundle, output, window_seconds="1.2")


if __name__ == "__main__":
    unittest.main()
