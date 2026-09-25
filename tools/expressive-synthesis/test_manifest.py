"""Deterministic, no-PyTorch tests for the explicit R&D corpus gate."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from manifest import (
    CONTROLS_SCHEMA,
    MANIFEST_SCHEMA,
    TARGET_SCHEMA,
    ManifestValidationError,
    validate_manifest_file,
)


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def valid_manifest(controls_digest: str, target_digest: str) -> dict[str, object]:
    return {
        "schema": MANIFEST_SCHEMA,
        "r_and_d_scope": {
            "r_and_d_only": True,
            "no_default_assets": True,
            "no_runtime_bgm": True,
            "no_game_output": True,
            "no_public_release": True,
        },
        "rights_gate": {
            "r_and_d_training_authorized_for_this_manifest": True,
            "no_default_asset_or_runtime_use": True,
            "no_game_or_public_distribution_clearance": True,
            "requires_new_rights_review_for_scope_expansion": True,
        },
        "instrument": {
            "id": "daegeum",
            "sustained": True,
            "render_family": "harmonic_noise_source_filter",
        },
        "entries": [
            {
                "entry_id": "rnd_001",
                "entry_gate": {
                    "r_and_d_only": True,
                    "not_default_asset": True,
                    "not_runtime_bgm": True,
                    "not_game_asset": True,
                    "not_public_distribution": True,
                },
                "source": {
                    "source_id": "ngc_001",
                    "sha256": "a" * 64,
                    "relative_path": "provenance/ngc_001.wav",
                },
                "native_source_span": {
                    "frame_range": [120, 240],
                    "sample_rate_hz": 16000,
                    "single_contiguous_source_frame_span": True,
                    "not_a_game_asset": True,
                },
                "controls_npz": {
                    "relative_path": "derived/rnd_001_controls.npz",
                    "sha256": controls_digest,
                    "schema": CONTROLS_SCHEMA,
                },
                "target_npz": {
                    "relative_path": "derived/rnd_001_target.npz",
                    "sha256": target_digest,
                    "schema": TARGET_SCHEMA,
                },
            }
        ],
    }


class ManifestValidationTests(unittest.TestCase):
    def write_fixture(self, root: Path) -> tuple[Path, dict[str, object]]:
        derived = root / "derived"
        derived.mkdir()
        controls = b"synthetic-controls-for-validator-only"
        target = b"synthetic-target-for-validator-only"
        (derived / "rnd_001_controls.npz").write_bytes(controls)
        (derived / "rnd_001_target.npz").write_bytes(target)
        manifest = valid_manifest(digest(controls), digest(target))
        path = root / "explicit-rnd.json"
        path.write_text(json.dumps(manifest, sort_keys=True), encoding="utf-8")
        return path, manifest

    def test_accepts_explicit_rnd_manifest_and_reports_stably(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path, _ = self.write_fixture(Path(temp))
            first = validate_manifest_file(path, verify_files=True)
            second = validate_manifest_file(path, verify_files=True)
        self.assertEqual(first, second)
        self.assertEqual(first["entry_count"], 1)
        self.assertTrue(first["interpretation_limits"]["only_explicit_manifest_entries_were_accepted"])
        self.assertTrue(first["interpretation_limits"]["not_a_default_asset_or_game_output_authorization"])

    def test_rejects_missing_game_output_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path, manifest = self.write_fixture(Path(temp))
            scope = manifest["r_and_d_scope"]
            assert isinstance(scope, dict)
            scope["no_game_output"] = False
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ManifestValidationError, "no_game_output"):
                validate_manifest_file(path)

    def test_rejects_path_escape_even_without_file_verification(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path, manifest = self.write_fixture(Path(temp))
            entries = manifest["entries"]
            assert isinstance(entries, list)
            controls = entries[0]["controls_npz"]
            assert isinstance(controls, dict)
            controls["relative_path"] = "../outside.npz"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ManifestValidationError, "safe relative path"):
                validate_manifest_file(path)

    def test_rejects_hash_mismatch_when_explicit_file_verification_requested(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path, _ = self.write_fixture(Path(temp))
            (Path(temp) / "derived" / "rnd_001_target.npz").write_bytes(b"tampered")
            with self.assertRaisesRegex(ManifestValidationError, "does not match"):
                validate_manifest_file(path, verify_files=True)


if __name__ == "__main__":
    unittest.main()
