"""Synthetic diagnostic/binding tests; no licensed audio, inference or GPU."""

from __future__ import annotations

import copy
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

import numpy as np

import bound_v2_dry_diagnostic as diagnostic
import mac_mps_ddsp_v2_dry_trial as v2


def source_wave() -> np.ndarray:
    samples = (0.03 * np.sin(2 * np.pi * 220 * np.arange(64_000) / 16_000)).astype(np.float32)
    samples[:16_000] = 0
    return samples


def metric_row(**changes) -> dict:
    row = {"quiet_frames": 100, "leaking_frames": 0, "longest_quiet_leak_frames": 0,
           "raw_rms_delta_db": 0, "song_index": 100, "kind": "transition",
           "input64_state": "modulated", "output64_state": "modulated"}
    row.update(changes)
    return row


def passing_rows():
    general = [metric_row(song_index=100 + index % 4, kind="sustain") for index in range(34)]
    general += [metric_row(song_index=100 + index % 4) for index in range(34)]
    vibrato = [metric_row(song_index=100 + index % 4,
                          input64_state="modulated" if index < 20 else "not_modulated",
                          output64_state="modulated" if index < 16 else "not_modulated")
               for index in range(24)]
    return general, vibrato, [general[-1]], {100, 101, 102, 103}


class AcousticAndGateTests(unittest.TestCase):
    def test_exact_source_has_no_raw_gain_leak_or_envelope_error(self):
        source = source_wave()
        result = diagnostic.acoustic_metrics(source, source.copy())
        self.assertEqual(result["quiet_frames"], 100)
        self.assertEqual(result["leaking_frames"], 0)
        self.assertEqual(result["raw_rms_delta_db"], 0)
        self.assertEqual(result["envelope_mae_db"], 0)
        self.assertEqual(result["attack_count"], 1)
        self.assertEqual(result["attack_matched"], 1)

    def test_quiet_hiss_and_hundred_ms_run_are_detected(self):
        source = source_wave()
        output = source.copy()
        output[:1_600] = 0.02
        result = diagnostic.acoustic_metrics(source, output)
        self.assertEqual(result["leaking_frames"], 10)
        self.assertEqual(result["longest_quiet_leak_frames"], 10)
        self.assertGreater(result["quiet_relative_overshoot_db_mean"], 0)

    def test_unmatched_reattack_is_not_hidden_by_level_matching(self):
        source = source_wave()
        output = np.roll(source, 8_000)
        result = diagnostic.acoustic_metrics(source, output)
        self.assertEqual(result["attack_count"], 1)
        self.assertEqual(result["attack_matched"], 0)

    def test_nonfinite_render_is_rejected(self):
        output = source_wave()
        output[0] = np.nan
        with self.assertRaisesRegex(diagnostic.DiagnosticError, "rendered_window_invalid"):
            diagnostic.acoustic_metrics(source_wave(), output)

    def test_all_numeric_checks_can_pass_but_human_review_stays_pending(self):
        result = diagnostic.preview_gate(*passing_rows())
        self.assertTrue(result["numerically_eligible_for_local_preview"])
        self.assertEqual(result["modulated_retained"], 16)
        self.assertEqual(result["input_modulated"], 20)
        self.assertEqual(result["human_echo_hiss_timbre_review"], "pending")
        self.assertEqual(result["game_suitability"], "not_established")

    def test_sustained_quiet_frames_cannot_dilute_bad_transition_leak(self):
        general, vibrato, previews, songs = passing_rows()
        general = [metric_row(kind="sustain", quiet_frames=20_000)] * 34
        general.append(metric_row(quiet_frames=20, leaking_frames=2))
        result = diagnostic.preview_gate(general, vibrato, previews, songs)
        self.assertEqual(result["quiet_to_active_quiet_leak_fraction"], 0.1)
        self.assertFalse(result["checks"]["quiet_to_active_quiet_leak"])

    def test_hundred_ms_tail_fails_even_if_total_leak_is_low(self):
        general, vibrato, previews, songs = passing_rows()
        general[-1]["longest_quiet_leak_frames"] = 10
        general[-1]["leaking_frames"] = 10
        result = diagnostic.preview_gate(general, vibrato, previews, songs)
        self.assertFalse(result["checks"]["no_100ms_quiet_leak"])

    def test_modulation_indeterminate_stays_in_denominator(self):
        general, vibrato, previews, songs = passing_rows()
        vibrato[0]["output64_state"] = "indeterminate"
        result = diagnostic.preview_gate(general, vibrato, previews, songs)
        self.assertEqual(result["input_modulated"], 20)
        self.assertEqual(result["modulated_retained"], 15)
        self.assertFalse(result["checks"]["modulation_retention"])

    def test_preview_rms_failure_cannot_be_replaced_by_successful_crop(self):
        general, vibrato, previews, songs = passing_rows()
        previews[0]["raw_rms_delta_db"] = -3.01
        result = diagnostic.preview_gate(general, vibrato, previews, songs)
        self.assertFalse(result["checks"]["planned_preview_raw_levels"])

    def test_common_source_gain_preserves_relative_levels(self):
        source = source_wave()
        output = source * 1.2
        left, right, note = diagnostic.common_source_gain(source, output)
        nonzero = np.abs(left) > 1e-5
        np.testing.assert_allclose(right[nonzero] / left[nonzero], 1.2, atol=2e-7)
        self.assertAlmostEqual(note["raw_rms_delta_db"], 20 * np.log10(1.2), places=5)
        self.assertAlmostEqual(diagnostic.acoustic_metrics(left, right)["raw_rms_delta_db"], note["raw_rms_delta_db"], places=5)

    def test_undertrained_output_is_rejected_instead_of_boosted(self):
        with self.assertRaisesRegex(diagnostic.DiagnosticError, "preview_raw_level_gate_failed"):
            diagnostic.common_source_gain(source_wave(), source_wave() * 0.5)


class PrivateBindingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name).resolve()
        self.folder.chmod(0o700)

    def test_frozen_configuration_allows_only_identical_retry(self):
        plan = {"schema": diagnostic.SCHEMA, "checkpoint_sha256": "a" * 64,
                "normalizer": [-20, 2], "seeds": diagnostic.SEEDS, "gates": diagnostic.GATES}
        self.assertFalse(diagnostic.freeze_or_retry(self.folder, plan))
        self.assertTrue(diagnostic.freeze_or_retry(self.folder, copy.deepcopy(plan)))
        changed = copy.deepcopy(plan)
        changed["checkpoint_sha256"] = "b" * 64
        with self.assertRaisesRegex(diagnostic.DiagnosticError, "frozen_diagnostic_configuration_changed"):
            diagnostic.freeze_or_retry(self.folder, changed)
        self.assertEqual(stat.S_IMODE((self.folder / diagnostic.FREEZE_NAME).stat().st_mode), 0o600)

    def test_report_over_old_sixteen_kib_limit_is_private_and_readable(self):
        value = {"rows": [{"index": index, "metric": "x" * 300} for index in range(100)]}
        diagnostic._write_json(self.folder, "large_report.json", value)
        path = self.folder / "large_report.json"
        self.assertGreater(path.stat().st_size, 16_384)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertEqual(diagnostic._json(path)[0], value)

    def test_cloud_directory_and_symlink_to_it_are_rejected(self):
        cloud = self.folder / "CloudStorage"
        cloud.mkdir(mode=0o700)
        alias = self.folder / "apparently_local"
        alias.symlink_to(cloud, target_is_directory=True)
        for path in (cloud, alias):
            with self.assertRaisesRegex(diagnostic.DiagnosticError, "cloud_sync_path_not_allowed"):
                diagnostic._local_paths_only([path])

    def test_snapshot_selects_internal_best_not_latest(self):
        payload = b"synthetic_selected_checkpoint"
        digest = hashlib.sha256(payload).hexdigest()
        filename = f"v2_step_000050_{digest[:12]}.pt"
        descriptor = os.open(self.folder / filename, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(payload)
        marker = {"schema": v2.SCHEMA, "step": 50, "sha256": digest,
                  "file": filename, "bytes": len(payload)}
        diagnostic._write_json(self.folder, "v2_step_000050.json", marker)
        report = {"schema": v2.SCHEMA, "status": "complete", "steps_target": 500,
                  "best_internal_validation_step": 50, "best_checkpoint_sha256": digest,
                  "latest_checkpoint_sha256": "b" * 64}
        diagnostic._write_json(self.folder, "v2_dry_trial_report.json", report)
        snapshot = diagnostic.checkpoint_snapshot(self.folder)
        self.assertEqual(snapshot["step"], 50)
        self.assertEqual(snapshot["checkpoint_sha256"], digest)
        with (self.folder / filename).open("ab") as stream:
            stream.write(b"changed")
        with self.assertRaises(diagnostic.DiagnosticError):
            diagnostic.checkpoint_snapshot(self.folder)

    def test_smoke_report_cannot_consume_final_diagnostic(self):
        diagnostic._write_json(self.folder, "v2_dry_trial_report.json", {
            "schema": v2.SCHEMA, "status": "complete", "steps_target": 50,
            "best_internal_validation_step": 50, "best_checkpoint_sha256": "a" * 64})
        with self.assertRaisesRegex(diagnostic.DiagnosticError, "complete_final_training_report_required"):
            diagnostic.checkpoint_snapshot(self.folder)

    def test_continuation_snapshot_tracks_relative_and_total_steps(self):
        import mac_mps_ddsp_v2_continuation as child
        payload = b"synthetic_child_checkpoint"
        digest = hashlib.sha256(payload).hexdigest()
        filename = f"child_step_000900_{digest[:12]}.pt"
        descriptor = os.open(self.folder / filename, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(payload)
        diagnostic._write_json(self.folder, "child_step_000900.json", {
            "schema": child.SCHEMA, "step": 900, "total_step": 1300,
            "sha256": digest, "file": filename, "bytes": len(payload)})
        diagnostic._write_json(self.folder, "v2_continuation_report.json", {
            "schema": child.SCHEMA, "status": "complete", "steps_target": 1000,
            "best_internal_validation_step": 900, "best_internal_validation_total_step": 1300,
            "parent_step": 400, "best_checkpoint_sha256": digest, "feasible_checkpoint_selected": True})
        snapshot = diagnostic.checkpoint_snapshot(self.folder)
        self.assertEqual(snapshot["_kind"], "continuation")
        self.assertEqual(snapshot["step"], 900)
        self.assertEqual(snapshot["total_step"], 1300)

    def test_completed_child_without_feasible_checkpoint_is_rejected(self):
        import mac_mps_ddsp_v2_continuation as child
        diagnostic._write_json(self.folder, "v2_continuation_report.json", {
            "schema": child.SCHEMA, "status": "complete", "steps_target": 1000,
            "best_internal_validation_step": 900, "best_internal_validation_total_step": 1300,
            "parent_step": 400, "best_checkpoint_sha256": "a" * 64, "feasible_checkpoint_selected": False})
        with self.assertRaisesRegex(diagnostic.DiagnosticError, "complete_final_training_report_required"):
            diagnostic.checkpoint_snapshot(self.folder)


class CheckpointContractTests(unittest.TestCase):
    def setUp(self):
        self.records = [{"song_index": song} for song in range(15)]
        fit, val = v2.partition_training_songs(self.records)
        self.contract = {
            "schema": v2.SCHEMA, "step": 500,
            "source_manifest_sha256": "a" * 64, "split_manifest_sha256": "b" * 64,
            "feature_sha256": diagnostic.v1.FEATURE_SHA256, "script_sha256": v2._code_sha256(),
            "v1_helper_script_sha256": diagnostic.v1._script_sha256(),
            "upstream_commit": diagnostic.pilot.UPSTREAM_SHA, "architecture": v2.ARCHITECTURE,
            "model_config": v2.MODEL_CONFIG, "loss_weights": v2.LOSS_WEIGHTS,
            "sampler": v2.SAMPLER, "internal_partition_sha256": v2._song_partition_sha(fit, val),
            "normalizer_fit_only": [-24, 2], "v1_baseline_checkpoint_sha256": "c" * 64,
            "fit_windows": 397, "validation_windows": 12,
            "model_state": {"decoder.weight": "synthetic"},
        }
        report = {key: value for key, value in self.contract.items() if key not in ("step", "model_state")}
        report.update({"fit_song_groups": 12, "validation_song_groups": 3,
                       "external_heldout_training_or_selection_songs": 0})
        self.snapshot = {"step": 500, "_report": report}

    def verify(self, contract=None):
        return diagnostic.verify_contract(contract or self.contract, self.snapshot,
            source_sha="a" * 64, split_sha="b" * 64, train_records=self.records)

    def test_fit_only_normalizer_and_architecture_are_bound(self):
        self.assertEqual(self.verify(), (-24.0, 2.0))

    def test_wet_reverb_tensors_cannot_enter_dry_architecture(self):
        changed = copy.deepcopy(self.contract)
        changed["model_state"]["reverb.ir"] = "synthetic"
        with self.assertRaisesRegex(diagnostic.DiagnosticError, "v2_dry_state_invalid"):
            self.verify(changed)

    def test_report_normalizer_mismatch_is_rejected(self):
        self.snapshot["_report"]["normalizer_fit_only"] = [-24, 3]
        with self.assertRaisesRegex(diagnostic.DiagnosticError, "v2_fit_only_normalizer_invalid"):
            self.verify()

    def test_source_or_partition_changes_are_rejected(self):
        for key in ("source_manifest_sha256", "internal_partition_sha256", "script_sha256"):
            changed = copy.deepcopy(self.contract)
            changed[key] = "d" * 64
            with self.assertRaisesRegex(diagnostic.DiagnosticError, "v2_checkpoint_contract_mismatch"):
                self.verify(changed)

    def test_external_heldout_selection_is_rejected(self):
        self.snapshot["_report"]["external_heldout_training_or_selection_songs"] = 1
        with self.assertRaisesRegex(diagnostic.DiagnosticError, "v2_training_report_contract_mismatch"):
            self.verify()


class ContinuationBindingTests(CheckpointContractTests):
    def setUp(self):
        super().setUp()
        self.parent_checkpoint = copy.deepcopy(self.contract)
        self.parent_checkpoint["step"] = 400
        self.parent_snapshot = copy.deepcopy(self.snapshot)
        self.parent_snapshot.update({"step": 400, "_kind": "v2",
                                     "checkpoint_sha256": "d" * 64,
                                     "checkpoint_marker_sha256": "e" * 64,
                                     "training_report_sha256": "f" * 64})
        self.feasibility = {"feasible": True, "checks": {"synthetic": True}}
        self.child = SimpleNamespace(
            SCHEMA="mini.aihub-71470-mac-mps-ddsp-dry-v2-continuation.v1",
            __file__=v2.__file__,
            PARENT_STEP=400, PARENT_CHECKPOINT_SHA256="d" * 64,
            INTERNAL_FEASIBILITY_CRITERIA={"validation_windows": 12,
                "all_window_raw_rms_abs_delta_db_max": 3.0,
                "active_drop_fraction_max": 0.05, "quiet_leak_fraction_max": 0.05},
            internal_feasibility=mock.Mock(return_value=self.feasibility))
        self.contract.update({"schema": self.child.SCHEMA, "step": 1000, "total_step": 1400,
            "parent_step": 400, "learning_rate": 3e-4,
            "parent_checkpoint_sha256": "d" * 64,
            "parent_checkpoint_marker_sha256": "e" * 64,
            "parent_training_report_sha256": "f" * 64,
            "parent_trainer_script_sha256": v2._code_sha256(),
            "parent_evaluator_script_sha256": diagnostic._digest(Path(diagnostic.__file__).read_bytes()),
            "private_runtime_script_sha256": diagnostic._digest(Path(diagnostic.pilot.__file__).read_bytes()),
            "internal_feasibility_criteria": self.child.INTERNAL_FEASIBILITY_CRITERIA,
            "fit_window_selection_sha256": "1" * 64,
            "validation_window_selection_sha256": "2" * 64,
            "validation": {"internal_feasibility": self.feasibility,
                           "raw_rms_delta_db_per_window": [0.0] * 12}})
        self.snapshot = {"step": 1000, "total_step": 1400, "_kind": "continuation",
            "_report": {key: value for key, value in self.contract.items()
                        if key not in ("step", "total_step", "model_state", "validation")}}
        self.snapshot["_report"].update({"fit_song_groups": 12, "validation_song_groups": 3,
            "external_heldout_training_or_selection_songs": 0, "feasible_checkpoint_selected": True})

    def verify(self, contract=None):
        with mock.patch.object(diagnostic.importlib, "import_module", return_value=self.child):
            return diagnostic.verify_contract(contract or self.contract, self.snapshot,
                source_sha="a" * 64, split_sha="b" * 64, train_records=self.records,
                parent_snapshot=self.parent_snapshot, parent_checkpoint=self.parent_checkpoint)

    def test_child_requires_matching_independently_verified_parent(self):
        self.assertEqual(self.verify(), (-24.0, 2.0))
        with mock.patch.object(diagnostic.importlib, "import_module", return_value=self.child):
            with self.assertRaisesRegex(diagnostic.DiagnosticError, "continuation_parent_binding_required"):
                diagnostic.verify_contract(self.contract, self.snapshot, source_sha="a" * 64,
                    split_sha="b" * 64, train_records=self.records)

    def test_child_cannot_change_parent_normalizer(self):
        self.contract["normalizer_fit_only"] = [-24, 3]
        self.snapshot["_report"]["normalizer_fit_only"] = [-24, 3]
        with self.assertRaisesRegex(diagnostic.DiagnosticError, "continuation_parent_normalizer_or_baseline_changed"):
            self.verify()

    def test_child_parent_checkpoint_swap_is_rejected(self):
        self.contract["parent_checkpoint_sha256"] = "3" * 64
        self.snapshot["_report"]["parent_checkpoint_sha256"] = "3" * 64
        with self.assertRaisesRegex(diagnostic.DiagnosticError, "v2_checkpoint_contract_mismatch"):
            self.verify()

    def test_feasibility_is_recomputed_not_trusted_from_saved_boolean(self):
        self.child.internal_feasibility.return_value = {"feasible": False, "checks": {"synthetic": False}}
        with self.assertRaisesRegex(diagnostic.DiagnosticError, "continuation_internally_feasible_checkpoint_required"):
            self.verify()

    def test_child_window_selection_hash_must_match_report(self):
        self.snapshot["_report"]["validation_window_selection_sha256"] = "4" * 64
        with self.assertRaisesRegex(diagnostic.DiagnosticError, "continuation_window_selection_binding_invalid"):
            self.verify()

    def test_actual_child_feasibility_checks_every_window_before_accepting(self):
        import mac_mps_ddsp_v2_continuation as child
        metrics = {"raw_rms_delta_db_per_window": [0.0] * 12,
                   "active_drop_fraction": 0.0, "active_frames": 100,
                   "quiet_leak_fraction": 0.0, "quiet_frames": 100,
                   "windows": 12, "songs": 3}
        metrics["internal_feasibility"] = child.internal_feasibility(metrics)
        self.child.internal_feasibility = child.internal_feasibility
        self.contract["validation"] = metrics
        self.assertEqual(self.verify(), (-24.0, 2.0))
        metrics["raw_rms_delta_db_per_window"][-1] = -7.0
        # A stale feasible=True field must not make this checkpoint admissible.
        with self.assertRaisesRegex(diagnostic.DiagnosticError, "continuation_internally_feasible_checkpoint_required"):
            self.verify()


if __name__ == "__main__":
    unittest.main()
