"""Regression tests for watchdog polling during a partial torch import."""
import contextlib
import io
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace as NS
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ace_limits as limits


class TestPartialImport(unittest.TestCase):
    def test_partial_import_skips_only_mps_measurement(self):
        driver = Mock(side_effect=AssertionError("Must not query an importing module"))
        partials = (NS(), NS(__spec__=NS(_initializing=True)), NS(backends=NS()),
                    NS(backends=NS(mps=NS(is_available=lambda: True))),
                    NS(__spec__=NS(_initializing=True), mps=NS(driver_allocated_memory=driver),
                       backends=NS(mps=NS(is_available=lambda: True))))
        psutil = NS(Process=lambda: NS(memory_info=lambda: NS(rss=1234)))
        with tempfile.TemporaryDirectory() as directory:
            guard = limits.ResourceGuard(directory)
            guard.started = 0
            for partial in partials:
                with self.subTest(partial=partial), patch.dict(
                        sys.modules, {"torch": partial, "psutil": psutil}), \
                        patch.object(limits.time, "monotonic", return_value=17), \
                        patch.object(limits.shutil, "disk_usage", return_value=NS(free=20 * limits.GIB)):
                    state = guard.snapshot()
                    self.assertEqual(state, dict(elapsed=17, rss_bytes=1234,
                                                 mps_driver_bytes=0, free_disk_bytes=20 * limits.GIB))
            driver.assert_not_called()

    def test_fully_imported_mps_measurement_is_not_disabled(self):
        torch = NS(__spec__=NS(_initializing=False), mps=NS(driver_allocated_memory=lambda: 4321),
                   backends=NS(mps=NS(is_available=lambda: True)))
        self.assertEqual(limits.ready_mps_driver_bytes(torch), 4321)

    def test_ready_backend_errors_are_not_silently_hidden(self):
        driver = Mock(side_effect=RuntimeError("ready backend failure"))
        torch = NS(mps=NS(driver_allocated_memory=driver),
                   backends=NS(mps=NS(is_available=lambda: True)))
        with self.assertRaisesRegex(RuntimeError, "ready backend failure"):
            limits.ready_mps_driver_bytes(torch)

    def test_watchdog_records_bounded_exception_details(self):
        with tempfile.TemporaryDirectory() as directory:
            guard = limits.ResourceGuard(directory)
            guard.stop = NS(wait=lambda _timeout: False)
            output = io.StringIO()
            with patch.object(guard, "snapshot", side_effect=AttributeError("partial torch details")), \
                    patch.object(limits.os, "_exit", side_effect=SystemExit(124)), \
                    contextlib.redirect_stderr(output):
                with self.assertRaises(SystemExit):
                    guard._watch()
            self.assertIn('"error_message": "partial torch details"', output.getvalue())


if __name__ == "__main__":
    unittest.main()
