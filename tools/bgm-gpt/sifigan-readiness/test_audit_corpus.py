"""Synthetic gate/statistics tests: no original recordings or model execution."""
import importlib.util
import json
from pathlib import Path
import stat
import tempfile
import unittest

import numpy as np


SPEC = importlib.util.spec_from_file_location("audit_corpus", Path(__file__).with_name("audit_corpus.py"))
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


def arrays(frames=140, hz=440.):
    return dict(waveform=np.full(frames * 120, .1, dtype=np.float32),
        f0=np.full(frames, hz, dtype=np.float32), cf0=np.full(frames, hz, dtype=np.float32),
        features=np.repeat(np.arange(frames, dtype=np.float32)[:, None], 43, axis=1),
        rms_db=np.full(frames, -20., dtype=np.float32), ap_all_one=np.zeros(frames, dtype=bool),
        yin_hz=np.full(frames, hz, dtype=np.float32), periodicity=np.full(frames, .98, dtype=np.float32))


def fixture(root, *, bad_fit=False):
    corpus = root / "corpus"
    corpus.mkdir()
    rows = []
    for case, split in (("sus04", "fit"), ("arirang001", "heldout")):
        original = corpus / (case + ".source-fixture")
        original.write_bytes((case + " is not real audio").encode())
        values = arrays()
        if split == "heldout":
            values["features"][:] = 10000.
        if bad_fit and split == "fit":
            values["waveform"][:] = 0.
        archive = corpus / (case + ".npz")
        np.savez_compressed(archive, **values)
        rows.append(dict(case=case, split=split, source_path=str(original),
            source_sha256=audit.digest(original), npz_file=archive.name,
            npz_sha256=audit.digest(archive), frames=140))
    manifest = corpus / "manifest.json"
    report = dict(schema=audit.SCHEMA, status="complete", sample_rate=24000, hop_size=120, files=rows)
    manifest.write_text(json.dumps(report), encoding="utf-8")
    return manifest, report


class SourceGateTests(unittest.TestCase):
    def test_good_window_and_high_register_vibrato_pass_without_derivative_gate(self):
        values = arrays(70)
        self.assertTrue(audit.assess_window(values, 0)["accepted"])
        time = np.arange(70) * .005
        vibrato = (1300 * 2 ** (180 * np.sin(2 * np.pi * 7 * time) / 1200)).astype(np.float32)
        values.update(f0=vibrato, cf0=vibrato.copy(), yin_hz=vibrato.copy())
        result = audit.assess_window(values, 0)
        self.assertTrue(result["accepted"])
        self.assertEqual(result["pitch_bin"], "1200-1800Hz")
        self.assertFalse(audit.POLICY["pitch_derivative_or_vibrato_depth_gate"])

    def test_short_unvoiced_attack_kept_only_with_supported_context(self):
        values = arrays(70)
        for key in ("f0", "yin_hz", "periodicity"):
            values[key][:14] = 0.
        values["ap_all_one"][:14] = True  # unvoiced AP does not count as voiced AP failure
        result = audit.assess_window(values, 0)
        self.assertTrue(result["accepted"])
        self.assertEqual(result["reference_supported_fraction"], .8)
        values["periodicity"][14] = 0.
        self.assertIn("insufficient_reference_support", audit.assess_window(values, 0)["rejection_reasons"])

    def test_wrong_harvest_octave_is_rejected_not_repaired(self):
        values = arrays(70)
        before = values["f0"].copy()
        values["f0"] *= 2
        result = audit.assess_window(values, 0)
        self.assertFalse(result["accepted"])
        self.assertIn("harvest_reference_disagreement", result["rejection_reasons"])
        np.testing.assert_array_equal(values["f0"], before * 2)

    def test_ten_percent_voiced_all_one_ap_is_strictly_rejected(self):
        values = arrays(70)
        values["ap_all_one"][:6] = True
        self.assertTrue(audit.assess_window(values, 0)["accepted"])
        values["ap_all_one"][6] = True
        result = audit.assess_window(values, 0)
        self.assertIn("excess_or_undefined_voiced_AP_all_one", result["rejection_reasons"])

    def test_silence_and_nonfinite_values_are_reported(self):
        values = arrays(70)
        values["waveform"][:] = 0
        self.assertIn("near_silent_window", audit.assess_window(values, 0)["rejection_reasons"])
        values = arrays(70)
        values["features"][0, 0] = np.nan
        self.assertIn("nonfinite_values", audit.assess_window(values, 0)["rejection_reasons"])

    def test_alignment_and_boolean_ap_schema_are_required(self):
        self.assertEqual(audit.validate_arrays(arrays())["features"].shape, (140, 43))
        values = arrays()
        values["waveform"] = values["waveform"][:-1]
        with self.assertRaisesRegex(ValueError, "aligned"):
            audit.validate_arrays(values)
        values = arrays()
        values["ap_all_one"] = values["ap_all_one"].astype(np.float32)
        with self.assertRaisesRegex(ValueError, "boolean"):
            audit.validate_arrays(values)

    def test_statistics_match_union_of_frames_not_overlapping_window_copies(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            manifest, _ = fixture(root)
            result = audit.audit(manifest, root / "audit")
            self.assertTrue(result["training_eligible"])
            self.assertEqual(result["statistics_fit_cases"], ["sus04"])
            self.assertEqual(result["statistics_fit_frame_count"], 140)
            self.assertEqual(result["counts_by_case"]["sus04"]["accepted_windows"], 3)
            self.assertEqual(len(result["heldout_windows"]), 3)
            self.assertFalse(result["heldout_used_for_statistics"])
            with np.load(result["stats_path"], allow_pickle=False) as statistics:
                np.testing.assert_allclose(statistics["mean"], np.arange(140).mean())
                np.testing.assert_allclose(statistics["scale"], np.arange(140).std())
            self.assertEqual(audit.digest(result["stats_path"]), result["stats_sha256"])
            self.assertEqual(stat.S_IMODE((root / "audit/window_gate.json").stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(Path(result["stats_path"]).stat().st_mode), 0o600)
            self.assertEqual(json.loads((root / "audit/window_gate.json").read_text())["status"], "complete")

    def test_no_eligible_fit_never_fabricates_normalizer(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            manifest, _ = fixture(root, bad_fit=True)
            result = audit.audit(manifest, root / "audit")
            self.assertEqual(result["status"], "complete")
            self.assertFalse(result["training_eligible"])
            self.assertIsNone(result["stats_sha256"])
            self.assertFalse((root / "audit/stats.npz").exists())
            self.assertEqual(len(result["heldout_windows"]), 3)

    def test_all_arirang_and_deep_vibrato_are_protected_holdouts(self):
        for case in ("arirang001", "deepvib48", "deep_vib_test"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as folder:
                manifest, report = fixture(Path(folder).resolve())
                report["files"][1].update(case=case, split="fit")
                manifest.write_text(json.dumps(report), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "must_be_heldout"):
                    audit.validate_manifest(manifest)

    def test_whole_recording_split_overlap_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            manifest, report = fixture(Path(folder).resolve())
            fit, heldout = report["files"]
            heldout.update(case="generic_holdout", source_path=fit["source_path"], source_sha256=fit["source_sha256"])
            manifest.write_text(json.dumps(report), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "split_leakage"):
                audit.validate_manifest(manifest)

    def test_feature_tamper_and_unsafe_archive_path_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            manifest, report = fixture(Path(folder).resolve())
            archive = manifest.parent / report["files"][0]["npz_file"]
            archive.write_bytes(b"changed byte fixture")
            with self.assertRaisesRegex(ValueError, "feature_sha_changed"):
                audit.validate_manifest(manifest)
            report["files"][0]["npz_file"] = "../outside.npz"
            manifest.write_text(json.dumps(report), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "safe_basename"):
                audit.validate_manifest(manifest)

    def test_streamed_population_statistics_match_concatenation_and_zero_scale(self):
        values = np.repeat(np.arange(9, dtype=np.float64)[:, None], 43, axis=1)
        mean, scale, count = audit.fit_statistics([values[:3], values[3:]])
        np.testing.assert_allclose(mean, values.mean(axis=0))
        np.testing.assert_allclose(scale, values.std(axis=0))
        self.assertEqual(count, 9)
        _, scale, _ = audit.fit_statistics([np.ones((4, 43))])
        np.testing.assert_array_equal(scale, np.ones(43))


if __name__ == "__main__":
    unittest.main()
