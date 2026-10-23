"""Lightweight probe-boundary tests: no torch, model, weights, or recordings."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    "probe_generator_mps", Path(__file__).with_name("probe_generator_mps.py")
)
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)


class ProbeStaticBoundaryTests(unittest.TestCase):
    def test_clean_pinned_checkout_hashes_tracked_files_only(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "config.yaml").write_bytes(b"channels: 512\n")
            (root / "model.py").write_bytes(b"# synthetic fixture only\n")
            replies = [probe.REVISION + "\n", "", b"config.yaml\0model.py\0"]
            with patch.object(probe.subprocess, "check_output", side_effect=replies) as call:
                result = probe.validate_upstream(root)
            self.assertEqual(
                result,
                {
                    "config.yaml": hashlib.sha256(b"channels: 512\n").hexdigest(),
                    "model.py": hashlib.sha256(b"# synthetic fixture only\n").hexdigest(),
                },
            )
            self.assertEqual(call.call_count, 3)
            self.assertEqual(call.call_args_list[2].args[0][-2:], ["ls-files", "-z"])

    def test_wrong_revision_or_dirty_checkout_is_rejected_before_hashing(self):
        with tempfile.TemporaryDirectory() as folder:
            for head, state in (("0" * 40, ""), (probe.REVISION, " M model.py\n"),
                                (probe.REVISION, "?? extra.py\n")):
                with self.subTest(head=head, state=state):
                    with patch.object(probe.subprocess, "check_output", side_effect=[head, state]) as call:
                        with patch.object(probe, "sha256") as hash_file:
                            with self.assertRaisesRegex(ValueError, "clean_pinned_official_checkout_required"):
                                probe.validate_upstream(Path(folder))
                            hash_file.assert_not_called()
                    self.assertEqual(call.call_count, 2)

    def test_explicit_no_fallback_and_no_bytecode_environment_required(self):
        valid = {"PYTORCH_ENABLE_MPS_FALLBACK": "0", "PYTHONDONTWRITEBYTECODE": "1"}
        with patch.dict(os.environ, valid, clear=True):
            probe.require_mps_environment()
        for values, message in (
            ({}, "MPS_fallback"),
            ({**valid, "PYTORCH_ENABLE_MPS_FALLBACK": "1"}, "MPS_fallback"),
            ({**valid, "PYTHONDONTWRITEBYTECODE": "0"}, "bytecode"),
            ({"PYTORCH_ENABLE_MPS_FALLBACK": "0"}, "bytecode"),
        ):
            with self.subTest(values=values), patch.dict(os.environ, values, clear=True):
                with self.assertRaisesRegex(ValueError, message):
                    probe.require_mps_environment()

    def test_invalid_environment_stops_before_output_creation_or_runtime_import(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "not-created"
            with patch.dict(os.environ, {}, clear=True), patch.object(probe, "validate_upstream") as check:
                with self.assertRaisesRegex(ValueError, "MPS_fallback"):
                    probe.run(Path(folder), output)
            self.assertFalse(output.exists())
            check.assert_not_called()

    def test_network_blocker_rejects_without_contacting_network(self):
        with self.assertRaisesRegex(RuntimeError, "network_disabled_for_synthetic_probe"):
            probe.block_network("example.invalid", 443)

    def test_report_is_exclusive_private_json_and_preserves_nonreadiness(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "report.json"
            report = {
                "status": "synthetic_generator_forward_backward_passed_not_training_ready",
                "synthetic_only": True,
                "full_training_readiness_established": False,
                "sound_quality_established": False,
                "optimizer_steps": 0,
                "note": "합성 입력 검사만 수행",
            }
            probe.write_report(target, report)
            self.assertEqual(json.loads(target.read_text(encoding="utf-8")), report)
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)
            self.assertTrue(target.read_text(encoding="utf-8").endswith("\n"))
            with self.assertRaises(FileExistsError):
                probe.write_report(target, {"overwrite": True})
            self.assertEqual(json.loads(target.read_text(encoding="utf-8")), report)

    def test_report_rejects_nonfinite_json(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):
                probe.write_report(Path(folder) / "invalid.json", {"loss": float("nan")})


if __name__ == "__main__":
    unittest.main()
