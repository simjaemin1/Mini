"""Synthetic orphan inspection tests: no models, pickle, or actual audio."""
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_level_trial_files as audit


class OrphanTests(unittest.TestCase):
    def test_partial_is_identified_without_torch_or_pickle_load(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory).resolve() / "partial.pt"
            path.write_bytes(b"PK\x03\x04truncated archive without central directory")
            result = audit.partial_checkpoint(path)
            self.assertFalse(result["zipfile_is_zipfile"])
            self.assertTrue(result["full_checkpoint_incomplete"])
            self.assertFalse(result["checkpoint_unpickled_or_loaded"])
            self.assertFalse(result["full_resumable_checkpoint_recovered"])
            self.assertEqual(result["bytes"], path.stat().st_size)

    def test_exact_reference_and_baseline_binding(self):
        reference = np.zeros(audit.saved.SAMPLES, np.float32)
        reference[0] = -0.
        generated = np.full(audit.saved.SAMPLES, .01, np.float32)
        audit.validate_orphan(reference, generated, reference, generated + np.float32(1e-8))
        with self.assertRaisesRegex(ValueError, "baseline_not_parent"):
            audit.validate_orphan(reference, generated, reference, generated + np.float32(.01))
        wrong = reference.copy(); wrong[0] = 0.
        with self.assertRaisesRegex(ValueError, "byte_exact"):
            audit.validate_orphan(wrong, generated, reference)

    def test_nonfinite_wrong_dtype_or_length_rejected(self):
        reference = np.zeros(audit.saved.SAMPLES, np.float32)
        for value in (reference[:-1], reference.astype(np.float64), np.full(audit.saved.SAMPLES, np.nan, np.float32)):
            with self.assertRaises(ValueError):
                audit.validate_orphan(reference, value, reference)


if __name__ == "__main__":
    unittest.main()
