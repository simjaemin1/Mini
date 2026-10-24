"""Gate/state tests with synthetic byte fixtures, never a model or real audio.

Static tests use a torch stub. One optional test serializes tiny CPU tensors
using an available torch installation; it creates no model or optimizer.
"""
import hashlib
import importlib.util
import io
import json
from collections import Counter, OrderedDict
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("train_real_gate", HERE / "train_real_gate.py")
gate = importlib.util.module_from_spec(SPEC)
with patch.object(sys, "path", [str(HERE), *sys.path]):
    SPEC.loader.exec_module(gate)


class FakeTensor:
    """Only the device-copy/hash interface, not tensor arithmetic."""

    def __init__(self, payload=b"12345678", dtype="float32", shape=(2,), device="mps"):
        self.payload, self.dtype, self.shape, self.device = payload, dtype, shape, device

    def detach(self):
        return self

    def cpu(self):
        return FakeTensor(self.payload, self.dtype, self.shape, "cpu")

    def contiguous(self):
        return self

    def numpy(self):
        return types.SimpleNamespace(dtype=self.dtype, shape=self.shape, tobytes=lambda: self.payload)


TORCH_STUB = types.SimpleNamespace(Tensor=FakeTensor)


def fixture(root):
    """Hash-bound static manifest; .npz contents are deliberately not real arrays."""
    files = []
    for case, split in (("sus04", "fit"), ("vib39", "fit"), ("arirang002", "heldout")):
        original = root / (case + ".source-fixture")
        original.write_bytes((case + ": not audio").encode())
        features = root / (case + ".npz")
        features.write_bytes((case + ": not a real NPZ").encode())
        files.append({
            "case": case, "split": split, "source_path": str(original),
            "source_sha256": hashlib.sha256(original.read_bytes()).hexdigest(),
            "npz_file": features.name,
            "npz_sha256": hashlib.sha256(features.read_bytes()).hexdigest(),
        })
    stats = root / "stats.npz"
    stats.write_bytes(b"synthetic statistics byte fixture")
    report = {
        "schema": gate.FEATURE_SCHEMA, "status": "complete", "files": files,
        "stats_file": stats.name, "stats_sha256": hashlib.sha256(stats.read_bytes()).hexdigest(),
    }
    manifest = root / "manifest.json"
    manifest.write_text(json.dumps(report), encoding="utf-8")
    return manifest, report


class RealGateStaticTests(unittest.TestCase):
    def test_completed_bound_fixed_split_is_accepted_without_loading_arrays(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            manifest, report = fixture(root)
            actual, fits, bindings, stats = gate.validate_data(manifest)
            self.assertEqual(actual, report)
            self.assertEqual(set(fits), {"sus04", "vib39"})
            self.assertEqual(stats, (root / "stats.npz").resolve())
            self.assertEqual(len(bindings), 8)
            self.assertEqual(bindings[str(manifest.resolve())], gate.base.sha256(manifest))

    def test_schema_and_completion_status_are_required(self):
        with tempfile.TemporaryDirectory() as folder:
            manifest, valid = fixture(Path(folder))
            for key, value in (("schema", "other.schema"), ("status", "started")):
                report = {**valid, key: value}
                manifest.write_text(json.dumps(report), encoding="utf-8")
                with self.subTest(key=key), self.assertRaisesRegex(ValueError, "completed_real_feature_manifest"):
                    gate.validate_data(manifest)

    def test_source_feature_or_statistics_tampering_is_rejected(self):
        for target, message in (("source", "original_or_feature"), ("features", "original_or_feature"),
                                ("statistics", "fit_only_normalizer")):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                manifest, report = fixture(root)
                row = report["files"][0]
                path = {"source": Path(row["source_path"]), "features": root / row["npz_file"],
                        "statistics": root / "stats.npz"}[target]
                path.write_bytes(b"changed static fixture")
                with self.assertRaisesRegex(ValueError, message):
                    gate.validate_data(manifest)

    def test_wrong_fit_cases_or_extra_heldout_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            manifest, valid = fixture(Path(folder))
            for change in ("fit_case", "extra_heldout"):
                report = json.loads(json.dumps(valid))
                if change == "fit_case":
                    report["files"][0]["case"] = "unapproved_case"
                else:
                    report["files"].append(dict(report["files"][2]))
                manifest.write_text(json.dumps(report), encoding="utf-8")
                with self.subTest(change=change), self.assertRaisesRegex(ValueError, "fixed_two_fit_one_heldout"):
                    gate.validate_data(manifest)

    def test_same_whole_source_sha_across_splits_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            manifest, report = fixture(Path(folder))
            fit, heldout = report["files"][0], report["files"][2]
            heldout["source_path"], heldout["source_sha256"] = fit["source_path"], fit["source_sha256"]
            manifest.write_text(json.dumps(report), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "source_file_split_leakage"):
                gate.validate_data(manifest)

    def test_cpu_tree_keeps_numeric_key_and_sequence_structure(self):
        tensor = FakeTensor()
        source = {1: tensor, "optimizer": [{"step": 1}, (FakeTensor(b"abcd", shape=(1,)), 0.5)]}
        with patch.dict(sys.modules, {"torch": TORCH_STUB}):
            result = gate.cpu_tree(source)
        self.assertEqual(set(result), {1, "optimizer"})
        self.assertEqual(result[1].device, "cpu")
        self.assertEqual(result[1].payload, tensor.payload)
        self.assertEqual(tensor.device, "mps")
        self.assertIsInstance(result["optimizer"], list)
        self.assertIsInstance(result["optimizer"][1], tuple)
        self.assertEqual(result["optimizer"][0], {"step": 1})
        self.assertEqual(result["optimizer"][1][0].device, "cpu")

    def test_digest_is_device_and_dict_order_independent_but_value_sensitive(self):
        with patch.dict(sys.modules, {"torch": TORCH_STUB}):
            state = {"weight": FakeTensor(), "step": 1, "betas": (0.5, 0.9)}
            alternate = {"betas": (0.5, 0.9), "step": 1, "weight": FakeTensor(device="cpu")}
            expected = gate.tree_digest(state)
            self.assertEqual(gate.tree_digest(alternate), expected)
            self.assertEqual(gate.tree_digest(gate.cpu_tree(state)), expected)
            for tensor in (FakeTensor(b"abcdefgh"), FakeTensor(dtype="float64"), FakeTensor(shape=(1, 2))):
                self.assertNotEqual(gate.tree_digest({**state, "weight": tensor}), expected)
            self.assertNotEqual(gate.tree_digest({**state, "step": 2}), expected)
            self.assertNotEqual(gate.tree_digest({**state, "betas": [0.5, 0.9]}), expected)

    def test_mapping_subclasses_and_state_metadata_survive_cpu_copy(self):
        weights = OrderedDict(weight=FakeTensor())
        weights._metadata = OrderedDict([("", {"version": 1})])
        state = {"model": weights, "scheduler": {"milestones": Counter({100000: 1})}}
        with patch.dict(sys.modules, {"torch": TORCH_STUB}):
            result = gate.cpu_tree(state)
            self.assertEqual(gate.tree_digest(result), gate.tree_digest(state))
            self.assertIsInstance(result["model"], OrderedDict)
            self.assertIsInstance(result["model"]._metadata, OrderedDict)
            self.assertEqual(result["model"]._metadata, weights._metadata)
            self.assertIsNot(result["model"]._metadata, weights._metadata)
            self.assertIsInstance(result["scheduler"]["milestones"], Counter)
            self.assertEqual(list(result["scheduler"]["milestones"].elements()), [100000])
            without_metadata = {**state, "model": OrderedDict(weights)}
            self.assertNotEqual(gate.tree_digest(without_metadata), gate.tree_digest(state))
            plain_scheduler = {**state, "scheduler": {"milestones": {100000: 1}}}
            self.assertNotEqual(gate.tree_digest(plain_scheduler), gate.tree_digest(state))

    def test_nonfinite_scalar_state_is_not_hashable_as_a_valid_state(self):
        with patch.dict(sys.modules, {"torch": TORCH_STUB}):
            with self.assertRaises(ValueError):
                gate.tree_digest({"loss": float("nan")})

    def test_invalid_device_environment_precedes_output_creation(self):
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder) / "not-created"
            with patch.object(gate.base, "require_mps_environment", side_effect=ValueError("disabled")):
                with self.assertRaisesRegex(ValueError, "disabled"):
                    gate.run(Path(folder), Path(folder) / "unused.json", destination)
            self.assertFalse(destination.exists())

    @unittest.skipUnless(importlib.util.find_spec("torch") is not None, "optional CPU torch unavailable")
    def test_tiny_cpu_state_bytesio_weights_only_roundtrip_preserves_types(self):
        # No model, optimizer instance, real data, files, or device other than CPU.
        import torch
        weights = OrderedDict(weight=torch.tensor([1.25, -0.5], dtype=torch.float32))
        weights._metadata = OrderedDict([("", {"version": 1})])
        state = {
            "generator": weights,
            "optimizer": {"state": {0: {"step": torch.tensor(1.), "exp_avg": torch.zeros(2)}},
                          "param_groups": [{"params": [0], "betas": (0.5, 0.9)}]},
            "scheduler": {"milestones": Counter({100000: 1}), "last_epoch": 1},
            "completed_steps": 1,
        }
        expected = gate.tree_digest(state)
        buffer = io.BytesIO()
        torch.save(gate.cpu_tree(state), buffer)
        buffer.seek(0)
        with torch.serialization.safe_globals([Counter]):
            restored = torch.load(buffer, map_location="cpu", weights_only=True)
        self.assertEqual(gate.tree_digest(restored), expected)
        self.assertIsInstance(restored["generator"], OrderedDict)
        self.assertEqual(restored["generator"]._metadata, weights._metadata)
        self.assertIsInstance(restored["scheduler"]["milestones"], Counter)
        self.assertEqual(restored["generator"]["weight"].device.type, "cpu")


if __name__ == "__main__":
    unittest.main()
