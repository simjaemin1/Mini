"""Contracts for the pure/read-only trained-renderer readiness report."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import renderer_readiness as readiness


class RendererReadinessTests(unittest.TestCase):
    def _repo(self, root: Path) -> Path:
        repo = root / "repo"
        for relative in readiness.HARNESS_FILES:
            path = repo / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("stub\n", encoding="utf-8")
        return repo

    def _ngc_manifest(self, root: Path) -> Path:
        path = root / "ngc.json"
        path.write_text(
            json.dumps(
                {
                    "schema": "fixture.ngc.v1",
                    "r_and_d_only": {
                        "human_review_and_rights_review_required_before_training_or_shipping": True
                    },
                    "license_evidence": {"not_a_model_training_or_game_distribution_clearance": True},
                    "entries": [
                        {"musical_status": {"eligible_for_model_training_or_game_asset": False}},
                        {"musical_status": {"eligible_for_model_training_or_game_asset": False}},
                    ],
                }
            ),
            encoding="utf-8",
        )
        return path

    def test_ngc_manifest_is_explicitly_ineligible_not_reinterpreted_as_training_permission(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            report = readiness._inspect_ngc_manifest(self._ngc_manifest(root), repo_root=root)
        self.assertFalse(report["training_ready"])
        self.assertEqual(report["entry_count"], 2)
        self.assertEqual(report["entries_explicitly_ineligible_for_model_training_or_game_asset"], 2)
        self.assertTrue(report["human_review_and_rights_review_required_before_training_or_shipping"])
        self.assertTrue(report["license_evidence_explicitly_not_training_or_game_clearance"])

    def test_model_inventory_does_not_treat_a_checkpoint_extension_as_a_real_renderer(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            checkpoint = root / "models" / "unverified.pt"
            checkpoint.parent.mkdir()
            checkpoint.write_bytes(b"not a model")
            inventory = readiness._model_artifacts(root, repo_root=root)
        self.assertEqual(inventory["model_artifact_count"], 1)
        self.assertIn("not a legitimate/compatible", inventory["interpretation_limit"])

    def test_report_remains_fail_closed_without_cuda_model_or_approved_pairs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repo = self._repo(root)
            absent_python = root / "missing-python"
            report = readiness.build_readiness_report(
                repo_root=repo,
                runtime_pythons=[absent_python],
                model_roots=[repo / "models"],
                ngc_manifest=self._ngc_manifest(root),
            )
        renderer = report["actual_score_conditioned_daegeum_renderer"]
        self.assertFalse(renderer["ready"])
        self.assertTrue(renderer["fail_closed"])
        self.assertTrue(any("No model/checkpoint" in item for item in renderer["blockers"]))
        self.assertTrue(any("paired audio/score/gesture" in item for item in renderer["blockers"]))
        self.assertTrue(report["rnd_harness"]["all_required_rnd_harness_files_present"])

    def test_cli_writes_only_a_fresh_non_asset_report_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repo = self._repo(root)
            report_dir = root / "_bgm_rnd" / "readiness"
            report_dir.parent.mkdir()
            command = [
                sys.executable,
                str(HERE / "renderer_readiness.py"),
                "--repo-root",
                str(repo),
                "--runtime-python",
                str(root / "missing-python"),
                "--model-root",
                str(repo / "models"),
                "--ngc-manifest",
                str(self._ngc_manifest(root)),
                "--report-dir",
                str(report_dir),
            ]
            completed = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            output = json.loads(completed.stdout)
            self.assertEqual(output["schema"], readiness.REPORT_SCHEMA)
            saved = json.loads((report_dir / readiness.REPORT_FILENAME).read_text(encoding="utf-8"))
            self.assertFalse(saved["actual_score_conditioned_daegeum_renderer"]["ready"])
            second = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(second.returncode, 2)
            self.assertIn("fresh R&D", second.stderr)


if __name__ == "__main__":
    unittest.main()
