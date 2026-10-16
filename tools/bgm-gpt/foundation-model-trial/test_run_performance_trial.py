"""Synthetic orchestration tests; never import torch or run any model."""
import contextlib
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace as NS
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_performance_trial as trial


class TestPerformanceTrial(unittest.TestCase):
    def test_two_conditions_initialize_once_and_never_codec(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            args = NS(output=root / "new", source=root, checkpoints=root,
                      assets=root / "assets.json", manifest=root / "inputs.json")
            provenance = {"records": {"guide": {"path": "/authored-performance.wav"},
                                      "reference": {"path": "/public-reference.wav"}}}
            def cover(_handler, guide, _reference, output, **kwargs):
                self.assertEqual(guide, "/authored-performance.wav")
                path = output / "generated.wav"
                path.touch()
                return NS(audios=[{"path": str(path)}]), {"seed": kwargs["seed"]}
            initialize = Mock(return_value=NS(private_pilot_metadata={"implicit_mps_decode_retry": False}))
            with patch.object(trial, "ResourceGuard", lambda *a: contextlib.nullcontext()), \
                    patch.object(trial, "verify_inputs_and_assets", return_value=provenance), \
                    patch.object(trial, "initialize_runtime", initialize), \
                    patch.object(trial, "cover_once", side_effect=cover) as calls, \
                    patch.object(trial, "check_audio", return_value={"frames": 921600}), \
                    patch.object(trial, "version", return_value="mock"), contextlib.redirect_stdout(None):
                trial.run(args)
            report = json.loads((args.output / "report.json").read_text())
            initialize.assert_called_once()
            self.assertEqual([call.kwargs["cover_noise_strength"] for call in calls.call_args_list], [0.5, 0.8])
            self.assertTrue(all(call.kwargs["seed"] == 20261016 and call.kwargs["cover_strength"] == 1.0
                                for call in calls.call_args_list))
            self.assertEqual(report["status"], "rendered_not_listening_approved")
            self.assertFalse(report["codec_reconstruction_run"])
            self.assertTrue(report["inputs_and_assets_unchanged"])

    def test_failed_first_condition_preserves_diagnostic_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            args = NS(output=root / "new", source=root, checkpoints=root,
                      assets=root / "assets.json", manifest=root / "inputs.json")
            provenance = {"records": {"guide": {"path": "g"}, "reference": {"path": "r"}}}
            with patch.object(trial, "ResourceGuard", lambda *a: contextlib.nullcontext()), \
                    patch.object(trial, "verify_inputs_and_assets", return_value=provenance), \
                    patch.object(trial, "initialize_runtime", return_value=NS(private_pilot_metadata={})), \
                    patch.object(trial, "cover_once", return_value=(NS(audios=[{"path": ""}]), {})) as cover, \
                    patch.object(trial, "version", return_value="mock"), contextlib.redirect_stdout(None):
                with self.assertRaisesRegex(RuntimeError, "without a saved WAV"):
                    trial.run(args)
            cover.assert_called_once()
            report = json.loads((args.output / "report.json").read_text())
            self.assertEqual(report["status"], "failed")
            self.assertEqual(report["stages"][0]["cover_noise_strength"], 0.5)

    def test_checked_record_detects_modified_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "data"
            path.touch()
            with self.assertRaises(ValueError):
                trial.checked_record({"path": str(path), "sha256": "0" * 64})

    def test_wrong_provenance_rejected_before_runtime(self):
        args = NS(manifest=Path("unused"))
        with patch.object(trial, "read_json", return_value={"provenance": {}}):
            with self.assertRaisesRegex(ValueError, "our AIHub-trained"):
                trial.verify_inputs_and_assets(args)


if __name__ == "__main__":
    unittest.main()
