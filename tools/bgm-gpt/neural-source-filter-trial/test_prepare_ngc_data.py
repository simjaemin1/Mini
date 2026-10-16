"""Synthetic-only data preparation tests; no source archive or model reads."""
import contextlib
import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prepare_ngc_data as prep


class PreparationTests(unittest.TestCase):
    def test_over_budget_uses_explicit_front60_for_each_file(self):
        selected = [(Path(f"file{i}"), "fit") for i in range(10)]
        with patch.object(prep, "probe", return_value=100.), \
                patch.object(prep, "digest", side_effect=lambda path: str(path)):
            rows, bounded = prep.plan_ranges(selected)
        self.assertTrue(bounded)
        self.assertEqual(sum(row["requested_seconds"] for row in rows), 600)
        self.assertTrue(all(row["extract_start_seconds"] == 0 for row in rows))

    def test_duplicate_source_sha_is_rejected_before_decode(self):
        with patch.object(prep, "probe", return_value=10.), patch.object(prep, "digest", return_value="same"):
            with self.assertRaisesRegex(ValueError, "Duplicate source SHA"):
                prep.plan_ranges([(Path("a"), "fit"), (Path("b"), "heldout")])

    def test_real_synthetic_features_preserve_uncertainty_and_alignment(self):
        wave = .05 * np.sin(2 * np.pi * 300 * np.arange(24007) / 24000)
        measured = prep.condition(wave)
        self.assertEqual(len(measured["waveform"]), 24000)
        self.assertEqual(len(measured["pitch_hz"]), 100)
        self.assertAlmostEqual(float(np.median(measured["pitch_hz"])), 300., delta=2)
        silent = prep.condition(np.zeros(24000))
        self.assertFalse(silent["voiced_mask"].any())
        self.assertTrue((silent["pitch_hz"] == 0).all())

    def test_private_npz_manifest_and_file_group_holdout(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".done").touch()
            source = root / "public.flac"
            source.touch()
            output = root / "output"
            output.mkdir(mode=0o700)
            wave = (.05 * np.sin(2 * np.pi * 300 * np.arange(24000) / 24000)).astype(np.float32)
            with patch.object(prep, "candidates", return_value=[(source, "heldout")]), \
                    patch.object(prep, "probe", return_value=1.), patch.object(prep, "decode", return_value=wave), \
                    patch.object(prep, "cpu_budget", contextlib.nullcontext), contextlib.redirect_stdout(None):
                manifest = prep.prepare(root, output)
            self.assertEqual(manifest["status"], "complete")
            self.assertEqual(manifest["AIHub_files_used"], 0)
            self.assertFalse(manifest["heldout_is_blind"])
            self.assertEqual(manifest["files"][0]["split"], "heldout")
            archive = output / manifest["files"][0]["npz_file"]
            self.assertEqual(stat.S_IMODE(archive.stat().st_mode), 0o600)
            with np.load(archive, allow_pickle=False) as data:
                self.assertEqual(set(data.files), {"waveform", "pitch_hz", "rms_db", "voiced_mask"})
            self.assertTrue(json.loads((output / "manifest.json").read_text())["originals_unchanged"])


if __name__ == "__main__":
    unittest.main()
