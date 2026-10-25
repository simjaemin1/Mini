"""Synthetic sampler and early-boundary tests, never models or original audio."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("train_corpus_pilot", HERE / "train_corpus_pilot.py")
pilot = importlib.util.module_from_spec(SPEC)
with patch.object(sys, "path", [str(HERE), *sys.path]):
    SPEC.loader.exec_module(pilot)


def windows(count=100, *, cases=4, bins=3, split="fit"):
    return [dict(case="fit" + str(i % cases), split=split,
                 pitch_bin="bin" + str((i // cases) % bins), start_frame=i * 35,
                 frame_count=70, accepted=True) for i in range(count)]


def file_rows(rows):
    result = {}
    for row in rows:
        case = row["case"]
        result[case] = dict(case=case, split=row["split"], source_path="/synthetic/" + case + ".wav",
                            source_sha256="source-" + case, npz_sha256="npz-" + case)
    return result


def grouped(rows):
    return pilot.select_groups(rows, file_rows(rows))


class CorpusPilotBoundaryTests(unittest.TestCase):
    def test_exact_100_windows_four_cases_three_bins_is_enough(self):
        groups = grouped(windows())
        self.assertEqual(sum(map(len, groups)), 100)
        self.assertEqual(len(groups), 12)
        self.assertEqual({row["case"] for group in groups for row in group}, {"fit0", "fit1", "fit2", "fit3"})

    def test_insufficient_case_or_pitch_coverage_is_rejected(self):
        for cases, bins in ((3, 3), (4, 2)):
            with self.subTest(cases=cases, bins=bins):
                with self.assertRaisesRegex(ValueError, "four_fit_cases_and_three_pitch_bins"):
                    grouped(windows(cases=cases, bins=bins))

    def test_99_fit_windows_is_not_enough_even_with_many_heldout_windows(self):
        heldout = [dict(row, case="heldout" + str(i)) for i, row in enumerate(windows(110, split="heldout"))]
        with self.assertRaisesRegex(ValueError, "100_audited_fit_windows"):
            grouped(windows(99) + heldout)

    def test_declared_heldout_rows_never_enter_sampler_groups(self):
        heldout = [dict(row, case="arirang001") for row in windows(30, split="heldout")]
        heldout += [dict(row, case="deepvib48") for row in windows(30, split="heldout")]
        groups = grouped(heldout + windows())
        actual = [row for group in groups for row in group]
        self.assertEqual(len(actual), 100)
        self.assertTrue(all(row["split"] == "fit" for row in actual))
        self.assertFalse(any(row["case"] in ("arirang001", "deepvib48") for row in actual))

    def test_group_keys_have_deterministic_sorted_order(self):
        def keys(groups):
            return [(group[0]["case"], group[0]["pitch_bin"]) for group in groups]
        expected = keys(grouped(windows()))
        self.assertEqual(expected, sorted(expected))
        self.assertEqual(keys(grouped(list(reversed(windows())))), expected)

    def test_group_balance_is_by_case_pitch_pair_not_equal_case_weight(self):
        rows = windows()
        groups = grouped(rows)
        for group in groups:
            self.assertEqual(len({(row["case"], row["pitch_bin"]) for row in group}), 1)

    def test_invalid_environment_stops_before_output_or_model_imports(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "not-created"
            with patch.dict(os.environ, {}, clear=True):
                with self.assertRaisesRegex(ValueError, "MPS_fallback"):
                    pilot.run(Path(folder), Path(folder) / "unused.json", output)
            self.assertFalse(output.exists())

    def test_invalid_step_limit_is_rejected_before_path_resolution(self):
        for limit in (0, 501, 1001):
            with self.subTest(limit=limit), patch.object(pilot.base, "require_mps_environment"):
                with self.assertRaisesRegex(ValueError, "step_ceiling"):
                    pilot.run("nonexistent-upstream", "nonexistent-gate", "unused-output", limit)

    def test_existing_output_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            gate = root / "gate.json"
            gate.write_text("{}", encoding="utf-8")
            output = root / "existing-output"
            output.mkdir()
            sentinel = output / "preserved.txt"
            sentinel.write_text("keep", encoding="utf-8")
            with patch.object(pilot.base, "require_mps_environment"):
                with self.assertRaisesRegex(ValueError, "fresh_private_output"):
                    pilot.run(root, gate, output)
            self.assertEqual(sentinel.read_text(), "keep")
            self.assertEqual(list(output.iterdir()), [sentinel])

    def test_heldout_window_relabel_does_not_bypass_recording_split(self):
        rows = windows()
        trusted = file_rows(rows)
        trusted["arirang001"] = dict(case="arirang001", split="heldout")
        malicious = dict(rows[0], case="arirang001", split="fit")
        with self.assertRaisesRegex(ValueError, "window_and_recording_split"):
            pilot.select_groups(rows + [malicious], trusted)

    def test_unaccepted_unknown_or_negative_window_is_rejected(self):
        for change, message in (({"accepted": False}, "only_accepted"),
                                ({"case": "unknown"}, "window_and_recording_split"),
                                ({"start_frame": -1}, "nonnegative")):
            rows = windows()
            trusted = file_rows(rows)
            rows[0].update(change)
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, message):
                pilot.select_groups(rows, trusted)

    def test_protected_recording_cannot_be_declared_fit_even_in_both_tables(self):
        for case in ("arirang001", "deepvib48", "deep_vib_example"):
            rows = list(file_rows([dict(case=case, split="fit")]).values())
            with self.subTest(case=case), self.assertRaisesRegex(ValueError, "protected_recordings"):
                pilot.validate_file_splits(rows, rows)

    def test_gate_recording_must_match_bound_corpus(self):
        original = list(file_rows(windows()).values())
        for field in ("split", "source_path", "source_sha256", "npz_sha256"):
            gate = [dict(row) for row in original]
            gate[0][field] = "changed"
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "does_not_match_bound_corpus"):
                pilot.validate_file_splits(gate, original)
        actual = pilot.validate_file_splits(original, original)
        self.assertEqual(set(actual), {"fit0", "fit1", "fit2", "fit3"})

    def test_duplicate_cases_or_source_recordings_are_rejected(self):
        rows = list(file_rows(windows()).values())
        with self.assertRaisesRegex(ValueError, "unique_cases"):
            pilot.validate_file_splits(rows + [dict(rows[0])], rows)
        rows[1]["source_sha256"] = rows[0]["source_sha256"]
        with self.assertRaisesRegex(ValueError, "duplicate_or_split_leaking"):
            pilot.validate_file_splits(rows, rows)


if __name__ == "__main__":
    unittest.main()
