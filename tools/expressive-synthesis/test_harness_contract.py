"""No-PyTorch contract checks for the isolated expressive-synthesis harness."""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent


class HarnessContractTests(unittest.TestCase):
    def test_requirements_are_pinned_and_minimal(self) -> None:
        for name in ("requirements-cuda124.txt", "requirements-cpu.txt"):
            text = (HERE / name).read_text(encoding="utf-8")
            self.assertIn("torch==2.6.0", text)
            self.assertIn("numpy==1.26.4", text)
            self.assertNotIn("midi-ddsp", text.lower())

    def test_baseline_is_independent_from_archived_ddsp(self) -> None:
        text = (HERE / "baseline.py").read_text(encoding="utf-8").lower()
        self.assertIn("harmonic/noise", text)
        self.assertIn("continuous", text)
        self.assertNotIn("tools/ddsp", text)
        self.assertNotIn("import ddsp", text)
        self.assertNotIn("from ddsp", text)

    def test_launcher_has_explicit_rights_and_no_implicit_install_gates(self) -> None:
        launcher = HERE / "setup_train_wsl.sh"
        syntax = subprocess.run(["bash", "-n", str(launcher)], capture_output=True, text=True)
        self.assertEqual(syntax.returncode, 0, syntax.stderr)
        help_result = subprocess.run(["bash", str(launcher), "--help"], capture_output=True, text=True)
        self.assertEqual(help_result.returncode, 0, help_result.stderr)
        self.assertIn("--allow-install", help_result.stdout)
        self.assertIn("--confirm-rnd-only", help_result.stdout)
        duplicate_mode = subprocess.run(
            ["bash", str(launcher), "--check", "--smoke"], capture_output=True, text=True
        )
        self.assertEqual(duplicate_mode.returncode, 2)
        self.assertIn("exactly one", duplicate_mode.stderr)

    def test_cpu_readiness_check_does_not_require_torch_before_setup(self) -> None:
        # The documented first --check must be usable on a clean WSL/Python
        # environment.  CPU mode makes this portable to the no-GPU test host.
        # This host intentionally has an unsupported system Python, so use a
        # tiny fake, valid 3.11 venv interpreter that refuses ``import torch``
        # and proves the launcher treats that absence as pre-setup state.
        with tempfile.TemporaryDirectory() as temporary:
            fake_venv = Path(temporary) / "not-created"
            fake_bin = fake_venv / "bin"
            fake_bin.mkdir(parents=True)
            fake_python = fake_bin / "python"
            fake_python.write_text(
                "#!/usr/bin/env bash\n"
                "case \"${2:-}\" in\n"
                "  *'import sys'*) printf '3.11\\n'; exit 0 ;;\n"
                "  *'import torch'*) exit 1 ;;\n"
                "esac\n"
                "exit 0\n",
                encoding="utf-8",
            )
            fake_python.chmod(0o755)
            result = subprocess.run(
                [
                    "bash", str(HERE / "setup_train_wsl.sh"), "--check",
                    "--profile", "cpu", "--venv", str(fake_venv),
                ],
                capture_output=True,
                text=True,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Environment check passed", result.stdout)

    def test_smoke_help_is_available_without_importing_torch(self) -> None:
        result = subprocess.run(
            [sys.executable, str(HERE / "smoke_synthetic.py"), "--help"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("CPU-only", result.stdout)
        self.assertNotIn("cuda", result.stdout.lower().replace("cpu", ""))


if __name__ == "__main__":
    unittest.main()
