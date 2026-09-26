"""Pure contract tests for the MIDI-DDSP WSL transfer readiness scaffold."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import cpu_synthetic_smoke
import transfer_readiness as readiness


def _digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _scope() -> dict[str, bool]:
    return {
        "r_and_d_only": True,
        "only_explicit_derived_feature_entries": True,
        "no_ngc_or_unapproved_source": True,
        "no_default_assets": True,
        "no_runtime_bgm": True,
        "no_game_output": True,
        "no_public_release": True,
    }


def _rights() -> dict[str, bool]:
    return {
        "r_and_d_training_authorized_for_this_transfer_manifest": True,
        "paired_source_rights_review_completed_for_this_transfer_manifest": True,
        "derived_feature_use_authorized_for_this_transfer_manifest": True,
        "pretrained_weight_terms_reviewed_for_this_r_and_d_experiment": True,
        "no_default_asset_or_runtime_use": True,
        "no_game_or_public_distribution_clearance": True,
        "requires_new_rights_review_for_scope_expansion": True,
    }


def _entry_gate() -> dict[str, bool]:
    return {
        "r_and_d_only": True,
        "approved_for_this_transfer_manifest": True,
        "not_default_asset": True,
        "not_runtime_bgm": True,
        "not_game_asset": True,
        "not_public_distribution": True,
    }


class TransferReadinessTests(unittest.TestCase):
    def _dataset_fixture(self, root: Path) -> tuple[Path, dict[str, object]]:
        derived = root / "derived"
        derived.mkdir()
        rights = root / "rights"
        rights.mkdir()
        download_receipt = b"synthetic user-held AI Hub 71470 download receipt"
        terms_receipt = b"synthetic user-held AI Hub 71470 current terms and FAQ receipt"
        (rights / "download-receipt.txt").write_bytes(download_receipt)
        (rights / "terms-faq-receipt.txt").write_bytes(terms_receipt)
        entries: list[dict[str, object]] = []
        for entry_id, source_record_id, split in (
            ("take_001", "source_001", "train"),
            ("take_002", "source_002", "held_out"),
        ):
            controls = f"synthetic-controls-{entry_id}".encode("ascii")
            target = f"synthetic-target-{entry_id}".encode("ascii")
            controls_name = f"{entry_id}_controls.npz"
            target_name = f"{entry_id}_target.npz"
            (derived / controls_name).write_bytes(controls)
            (derived / target_name).write_bytes(target)
            entries.append(
                {
                    "entry_id": entry_id,
                    "source_record_id": source_record_id,
                    "split": split,
                    "entry_gate": _entry_gate(),
                    "controls_npz": {
                        "schema": "mini.midi-ddsp-transfer-train.derived-feature.v1",
                        "relative_path": f"derived/{controls_name}",
                        "sha256": _digest(controls),
                        "byte_length": len(controls),
                    },
                    "target_npz": {
                        "schema": "mini.midi-ddsp-transfer-train.derived-feature.v1",
                        "relative_path": f"derived/{target_name}",
                        "sha256": _digest(target),
                        "byte_length": len(target),
                    },
                }
            )
        manifest: dict[str, object] = {
            "schema": readiness.DATASET_SCHEMA,
            "r_and_d_scope": _scope(),
            "rights_gate": _rights(),
            "source_provenance": {
                "platform": readiness.AIHUB_PLATFORM,
                "dataset_id": readiness.AIHUB_RECOMMENDED_DATASET_ID,
                "dataset_title": readiness.AIHUB_RECOMMENDED_DATASET_TITLE,
                "reported_daegeum_clip_count": readiness.AIHUB_REPORTED_DAEGEUM_CLIP_COUNT,
                "candidate_only_not_release_clearance": True,
                "raw_wav_midi_and_sigimsae_not_read_by_readiness_tool": True,
                "ngc_192_not_used": True,
                "attribution_plan_recorded": True,
                "attribution_plan": "Synthetic test-only attribution plan; no release authorization.",
                "commercial_or_game_release_not_cleared_by_repository": True,
                "local_download_receipt": {
                    "relative_path": "rights/download-receipt.txt",
                    "sha256": _digest(download_receipt),
                    "byte_length": len(download_receipt),
                },
                "local_terms_faq_receipt": {
                    "relative_path": "rights/terms-faq-receipt.txt",
                    "sha256": _digest(terms_receipt),
                    "byte_length": len(terms_receipt),
                },
            },
            "instrument": {
                "id": "daegeum",
                "sustained": True,
                "approved_for_this_synthesis_only_transfer_experiment": True,
            },
            "entries": entries,
        }
        path = root / "approved-transfer.json"
        path.write_text(json.dumps(manifest, sort_keys=True), encoding="utf-8")
        return path, manifest

    def test_pinned_environment_and_synthesis_only_config_validate(self) -> None:
        lock = readiness.validate_environment_lock(HERE / "wsl_py38_tf27_environment.lock.json")
        config = readiness.validate_fine_tune_config(HERE / "daegeum_synthesis_only_finetune_config.json")
        self.assertEqual(lock["python"], {"major": 3, "minor": 8, "venv_only": True})
        self.assertEqual(config["frozen_components"], ["expression_generator"])
        self.assertEqual(config["trainable_components"], ["synthesis_generator"])
        self.assertEqual(config["memory_profile"]["effective_batch_size"], 8)

    def test_dataset_requires_source_disjoint_train_and_held_out_split(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path, manifest = self._dataset_fixture(root)
            report = readiness.validate_approved_dataset_manifest(
                path, verify_feature_hashes=True, repository_root=root
            )
            self.assertEqual(report["split_counts"], {"train": 1, "held_out": 1})
            self.assertFalse(report["source_record_overlap_between_train_and_held_out"])
            entries = manifest["entries"]
            assert isinstance(entries, list)
            held_out = entries[1]
            assert isinstance(held_out, dict)
            held_out["source_record_id"] = "source_001"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(readiness.TransferReadinessError, "must not overlap"):
                readiness.validate_approved_dataset_manifest(path, verify_feature_hashes=True, repository_root=root)

    def test_dataset_rejects_raw_media_reference_even_when_no_file_is_opened(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path, manifest = self._dataset_fixture(root)
            entries = manifest["entries"]
            assert isinstance(entries, list)
            first = entries[0]
            assert isinstance(first, dict)
            first["audio_wav"] = {"relative_path": "forbidden.wav"}
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(readiness.TransferReadinessError, "derived features only"):
                readiness.validate_approved_dataset_manifest(path, verify_feature_hashes=False, repository_root=root)

    def test_dataset_requires_distinct_local_receipts_for_aihub_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path, manifest = self._dataset_fixture(root)
            provenance = manifest["source_provenance"]
            assert isinstance(provenance, dict)
            provenance.pop("local_download_receipt")
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(readiness.TransferReadinessError, "local_download_receipt"):
                readiness.validate_approved_dataset_manifest(path, verify_feature_hashes=True, repository_root=root)

    def test_config_refuses_expression_generator_unfreeze(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config = json.loads((HERE / "daegeum_synthesis_only_finetune_config.json").read_text(encoding="utf-8"))
            freeze = config["freeze_policy"]
            assert isinstance(freeze, dict)
            freeze["frozen_components"] = []
            bad = root / "bad-config.json"
            bad.write_text(json.dumps(config), encoding="utf-8")
            with self.assertRaisesRegex(readiness.TransferReadinessError, "expression_generator"):
                readiness.validate_fine_tune_config(bad)

    def test_runtime_and_cuda_reports_require_exact_legacy_wsl_rtx4060_profile(self) -> None:
        runtime = {
            "probe_succeeded": True,
            "python_version": [3, 8, 18],
            "platform_system": "linux",
            "wsl_detected": True,
            "distributions": dict(readiness.EXPECTED_DISTRIBUTIONS),
            "tensorflow_import_succeeded": True,
            "tensorflow_gpu_devices": ["/physical_device:GPU:0"],
            "pip_check_succeeded": True,
        }
        self.assertEqual(readiness.validate_runtime_probe(runtime), [])
        self.assertEqual(
            readiness.validate_cuda_inventory(
                {"probe_succeeded": True, "gpus": [{"name": "NVIDIA GeForce RTX 4060 Laptop GPU", "memory_mib": 8188}]}
            ),
            [],
        )
        runtime["python_version"] = [3, 9, 0]
        self.assertIn("exactly 3.8", " ".join(readiness.validate_runtime_probe(runtime)))

    def test_cpu_synthetic_smoke_loads_no_model_or_audio(self) -> None:
        report = cpu_synthetic_smoke.run_cpu_synthetic_smoke(HERE / "daegeum_synthesis_only_finetune_config.json")
        self.assertTrue(report["passed"])
        self.assertFalse(report["model_checkpoint_dataset_or_audio_loaded"])
        self.assertFalse(report["model_training_performed"])
        completed = subprocess.run(
            [sys.executable, str(HERE / "cpu_synthetic_smoke.py"), "--config", str(HERE / "daegeum_synthesis_only_finetune_config.json")],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertTrue(json.loads(completed.stdout)["passed"])


if __name__ == "__main__":
    unittest.main()
