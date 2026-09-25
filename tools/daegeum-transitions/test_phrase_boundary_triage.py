#!/usr/bin/env python3
"""Deterministic checks for source-led Daegeum boundary triage coordinates."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import numpy as np  # noqa: E402

from native_wav import inspect_wav, sha256_file  # noqa: E402
from phrase_boundary_triage import (  # noqa: E402
    NGC_FETCH_SCHEMA,
    PHRASE_BOUNDARY_TRIAGE_SCHEMA,
    PhraseBoundaryTriageError,
    build_phrase_boundary_triage,
)
from trajectory_retrieval import FEATURE_SCHEMA, RND06_SCHEMA, TRAJECTORY_RETRIEVAL_SCHEMA  # noqa: E402


def _write_pcm16(path: Path, *, frames: int = 1300, sample_rate: int = 1000) -> None:
    """Small genuine WAV whose SHA/native frame count tests the raw gate."""

    samples: list[int] = []
    for frame in range(frames):
        samples.extend((((frame * 157) % 20_000) - 10_000, ((frame * 241) % 20_000) - 10_000))
    payload = struct.pack("<" + "h" * len(samples), *samples)
    block_align = 4
    byte_rate = sample_rate * block_align
    header = b"RIFF" + (36 + len(payload)).to_bytes(4, "little") + b"WAVE"
    header += b"fmt " + (16).to_bytes(4, "little") + struct.pack(
        "<HHIIHH", 1, 2, sample_rate, byte_rate, block_align, 16
    )
    header += b"data" + len(payload).to_bytes(4, "little")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header + payload)


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _feature_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _fixture(root: Path, *, all_high_energy: bool = False) -> dict[str, Path | str | int]:
    raw_root = root / "raw"
    raw = raw_root / "audio" / "fixture.wav"
    _write_pcm16(raw)
    descriptor = inspect_wav(raw)
    native = descriptor["native_audio"]
    assert isinstance(native, dict)
    source_id = "src_fixture"
    source_sha = sha256_file(raw)
    source = {
        "source_id": source_id,
        "sha256": source_sha,
        "relative_path": "audio/fixture.wav",
        "native": {
            "sample_rate_hz": native["sample_rate_hz"],
            "frame_count": native["frame_count"],
        },
    }
    bundle = root / "bundle"
    features = bundle / "features"
    features.mkdir(parents=True)
    catalog = {"schema": f"{RND06_SCHEMA}.source-catalog.v1", "files": [source]}
    catalog_path = bundle / "source_catalog.json"
    catalog_path.write_text(json.dumps(catalog, sort_keys=True), encoding="utf-8")
    count = 121
    energy = np.full(count, -18.0, dtype=np.float64)
    if not all_high_energy:
        # The two deliberately lower-energy regions are only objective fixture
        # proxies.  They do not model or label a phrase/breath/gesture.
        energy[32:40] = -52.0
        energy[40:44] = -21.0
        energy[90:94] = -21.0
        energy[94:102] = -53.0
    flux = np.full(count, 0.02, dtype=np.float64)
    flux[40] = 0.90
    flux[90] = 0.08
    midi = np.linspace(77.0, 72.0, count, dtype=np.float64)
    feature_npz = features / f"{source_id}.npz"
    np.savez_compressed(
        feature_npz,
        native_frame_center=np.arange(count, dtype=np.int64) * 10,
        time_s=np.arange(count, dtype=np.float64) * 0.01,
        f0_hz=440.0 * np.power(2.0, (midi - 69.0) / 12.0),
        midi_proxy=midi,
        voicing_confidence=np.full(count, 0.95, dtype=np.float64),
        rms_dbfs=energy,
        onset_flux=flux,
    )
    feature_meta = features / f"{source_id}.json"
    feature_meta.write_text(json.dumps({
        "schema": FEATURE_SCHEMA,
        "source_id": source_id,
        "source_sha256": source_sha,
        "relative_path": source["relative_path"],
        "feature_count": count,
        "npz": f"features/{source_id}.npz",
        "analysis": {"feature_hop_s": 0.01, "feature_window_s": 0.02},
    }, sort_keys=True), encoding="utf-8")
    npz_sha = _feature_digest(feature_npz)
    meta_sha = _feature_digest(feature_meta)
    trajectory = {
        "trajectory_id": "trajectory_src_fixture_000050_000080_g01",
        "path_id": "trajectory_src_fixture_000050_000080_g01",
        "priority_rank": 1,
        "source": {
            "source_id": source_id,
            "sha256": source_sha,
            "relative_path": source["relative_path"],
            "sample_rate_hz": native["sample_rate_hz"],
            "frame_count": native["frame_count"],
            "feature_npz": f"features/{source_id}.npz",
            "feature_npz_sha256": npz_sha,
            "feature_metadata": f"features/{source_id}.json",
            "feature_metadata_sha256": meta_sha,
            "ngc_extend_seq": 1520,
        },
        "automatic_path_status": {
            "source_is_one_verified_recording": True,
            "strictly_consecutive_voiced_feature_rows": True,
            "trajectory_was_scanned_directly_from_feature_npz_not_candidate_pairs": True,
            "all_results_remain_unreviewed": True,
            "not_evidence_of_same_breath": True,
            "not_evidence_of_slur": True,
            "not_evidence_of_natural_legato": True,
            "not_an_approved_transition_path": True,
            "not_a_transition_bank_item": True,
            "not_a_training_item": True,
            "not_a_game_asset": True,
        },
        "feature_span": {
            "feature_index_range": [50, 80],
            "native_frame_center_range": [500, 790],
        },
        "native_source_span": {
            "frame_range": [480, 811],
            "feature_center_frame_range": [500, 790],
            "frame_range_is_an_unreviewed_feature_window_enclosure_for_raw_review_only": True,
        },
    }
    report = {
        "schema": TRAJECTORY_RETRIEVAL_SCHEMA,
        "input_bundle": {
            "directory_basename": bundle.name,
            "source_catalog_sha256": _sha(catalog_path),
            "selected_feature_files": [{
                "source_id": source_id,
                "relative_path": source["relative_path"],
                "feature_npz": f"features/{source_id}.npz",
                "feature_npz_sha256": npz_sha,
                "feature_metadata": f"features/{source_id}.json",
                "feature_metadata_sha256": meta_sha,
                "ngc_extend_seq": 1520,
            }],
        },
        "trajectories": [trajectory],
    }
    report_path = root / "direct_trajectory_retrieval.json"
    report_path.write_text(json.dumps(report, sort_keys=True), encoding="utf-8")
    manifest = {
        "schema": NGC_FETCH_SCHEMA,
        "r_and_d_only": {
            "human_review_and_rights_review_required_before_training_or_shipping": True,
            "no_game_default_or_runtime_changes": True,
            "no_musical_gesture_or_legato_claim_from_download": True,
        },
        "scope": {
            "division_exact": "대금산조",
            "instrument_code": "EXTEND0001",
            "instrument_name": "대금",
        },
        "submitted_purpose": {"usePurposeGb": "비상업용", "usePurpose": "연구용"},
        "license_evidence": {"not_a_model_training_or_game_distribution_clearance": True},
        "entries": [{
            "extend_seq": 1520,
            "catalog_record": {"division": "대금산조", "beat": "3/4", "bpm": 84},
            "file_info_record": {"division": "대금산조"},
            "selection": {
                "instrument_code": "EXTEND0001",
                "instrument_name": "대금",
                "division_exact": "대금산조",
                "selection_is_exact_metadata_filter_not_title_match": True,
            },
            "download": {
                "relative_path": "audio/fixture.wav",
                "sha256": source_sha,
                "native_wav": {"native_audio": {
                    "sample_rate_hz": native["sample_rate_hz"],
                    "frame_count": native["frame_count"],
                }},
            },
            "musical_status": {
                "approved_transition": False,
                "eligible_for_model_training_or_game_asset": False,
                "automatic_filename_or_catalog_metadata_is_not_a_legato_or_transition_label": True,
            },
        }],
    }
    manifest_path = root / "ngc.manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    return {
        "bundle": bundle,
        "raw_root": raw_root,
        "raw": raw,
        "manifest": manifest_path,
        "report": report_path,
        "trajectory_id": trajectory["trajectory_id"],
    }


class PhraseBoundaryTriageTest(unittest.TestCase):
    def _run(self, fixture: dict[str, Path | str | int], output: Path, **kwargs: object) -> dict[str, object]:
        return build_phrase_boundary_triage(
            bundle_dir=fixture["bundle"],
            raw_daegeum_dirs=fixture["raw_root"],
            ngc_extended_manifest=fixture["manifest"],
            output_dir=output,
            trajectory_retrieval=fixture["report"],
            trajectory_id=str(fixture["trajectory_id"]),
            ngc_extend_seq_range="1520:1520",
            maximum_bracket_seconds=0.20,
            context_seconds=0.04,
            minimum_trajectory_guard_seconds=0.04,
            maximum_low_energy_percentile=0.35,
            max_boundary_candidates_per_side=8,
            top=4,
            **kwargs,
        )

    def test_ranks_one_source_contiguous_coordinates_with_conservative_labels(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = _fixture(root)
            result = self._run(fixture, root / "out")
            self.assertEqual(result["schema"], PHRASE_BOUNDARY_TRIAGE_SCHEMA)
            self.assertTrue(result["interpretation_limits"]["source_audio_not_decoded_copied_written_or_rendered"])
            self.assertGreater(result["counts"]["returned_candidate_count"], 0)
            first = result["candidates"][0]
            self.assertEqual(first["source"]["source_id"], "src_fixture")
            self.assertEqual(first["source"]["ngc_extend_seq"], 1520)
            raw_start, raw_end = first["native_source_span"]["frame_range"]
            self.assertLessEqual(raw_start, 480)
            self.assertGreaterEqual(raw_end, 811)
            self.assertTrue(first["native_source_span"]["single_contiguous_source_frame_range"])
            status = first["automatic_boundary_status"]
            self.assertTrue(status["unreviewed_automatic_boundary_candidate"])
            self.assertTrue(status["automatic_measurement_is_not_a_musical_phrase_label"])
            self.assertTrue(status["not_an_approved_transition_or_phrase"])
            self.assertTrue(status["not_a_game_asset"])
            self.assertIn("measurements_are_not_a_phrase_head", json.dumps(first, sort_keys=True))
            names = sorted(path.name for path in (root / "out").iterdir())
            self.assertEqual(names, ["phrase_boundary_triage.json", "phrase_boundary_triage.tsv"])
            self.assertNotIn(str(root), (root / "out" / "phrase_boundary_triage.json").read_text(encoding="utf-8"))

    def test_output_is_deterministic_and_never_overwrites(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = _fixture(root)
            first = root / "first"
            second = root / "second"
            self._run(fixture, first)
            self._run(fixture, second)
            for filename in ("phrase_boundary_triage.json", "phrase_boundary_triage.tsv"):
                self.assertEqual((first / filename).read_bytes(), (second / filename).read_bytes())
            with self.assertRaises(PhraseBoundaryTriageError):
                self._run(fixture, first)

    def test_no_low_energy_bracket_returns_no_candidate_not_a_mid_sustain_crop(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = _fixture(root, all_high_energy=True)
            result = self._run(fixture, root / "out")
            self.assertEqual(result["counts"]["returned_candidate_count"], 0)
            self.assertEqual(result["counts"]["candidate_pairs_before_top"], 0)
            self.assertEqual(sorted(path.name for path in (root / "out").iterdir()), [
                "phrase_boundary_triage.json", "phrase_boundary_triage.tsv",
            ])

    def test_report_raw_and_manifest_identity_fail_closed_before_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = _fixture(root)
            report = json.loads(Path(fixture["report"]).read_text(encoding="utf-8"))
            report["input_bundle"]["source_catalog_sha256"] = "0" * 64
            Path(fixture["report"]).write_text(json.dumps(report), encoding="utf-8")
            with self.assertRaises(PhraseBoundaryTriageError):
                self._run(fixture, root / "bad-report")
            self.assertFalse((root / "bad-report").exists())

            fixture = _fixture(root / "raw-case")
            Path(fixture["raw"]).write_bytes(Path(fixture["raw"]).read_bytes() + b"changed")
            with self.assertRaises(PhraseBoundaryTriageError):
                self._run(fixture, root / "bad-raw")
            self.assertFalse((root / "bad-raw").exists())

            fixture = _fixture(root / "manifest-case")
            manifest = json.loads(Path(fixture["manifest"]).read_text(encoding="utf-8"))
            manifest["entries"][0]["musical_status"]["approved_transition"] = True
            Path(fixture["manifest"]).write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            with self.assertRaises(PhraseBoundaryTriageError):
                self._run(fixture, root / "bad-manifest")
            self.assertFalse((root / "bad-manifest").exists())

    def test_cli_dry_run_does_not_need_input_paths(self) -> None:
        result = subprocess.run(
            [sys.executable, str(HERE / "phrase_boundary_triage.py"), "--dry-run"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("will not decode/copy/render audio", result.stdout)
        self.assertIn("not decode/copy/render audio", result.stdout)


if __name__ == "__main__":
    unittest.main()
