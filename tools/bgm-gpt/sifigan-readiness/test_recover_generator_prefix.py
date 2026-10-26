"""Tiny CPU tensors only: no model construction, recordings, training, or GPU."""
from collections import Counter, OrderedDict
import copy
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import recover_generator_prefix as recovery


def serialized(state):
    handle = io.BytesIO()
    torch.save(state, handle)
    return handle.getvalue()


def payload_offset(raw, name):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entry = archive.getinfo(name)
    header = struct.unpack("<IHHHHHIIIHH", raw[entry.header_offset:entry.header_offset + 30])
    return entry.header_offset + 30 + header[-2] + header[-1]


class RecoveryContracts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.generator = OrderedDict(a=torch.tensor([1., 2., 3.]), b=torch.tensor([[4., 5., 6.]]))
        self.generator._metadata = OrderedDict({"": {"version": 1}})
        shared = dict(generator_config={"in_channels": 43}, normalizer_mean=[0.] * 43,
                      normalizer_scale=[1.] * 43, source_credit="National Gugak Center")
        self.prior = dict(generator=copy.deepcopy(self.generator), completed_steps=1000,
                          quality_approved=False, data_gate_sha256="original-gate", **shared)
        self.state = dict(generator=self.generator, discriminator={"weight": torch.ones(2048)},
                          optimizer_g={"state": {0: {"step": torch.tensor(1500.)}}},
                          scheduler_g={"last_epoch": 1500, "milestones": Counter({1000: 1})},
                          completed_steps=1500, format="private_sifigan_level_fix_v1",
                          original_data_gate_sha256="original-gate", data_gate_sha256="new-level-gate",
                          numpy_sampler_rng={"bit_generator": "PCG64", "state": {"state": 123}},
                          **shared)
        self.partial, self.parent = self.root / "partial.pt", self.root / "parent.pt"
        self.output = self.root / "recovery"
        self.write_fixture()
        self.private_patch = patch.object(recovery, "PRIVATE_ROOT", self.root)
        self.private_patch.start()

    def tearDown(self):
        self.private_patch.stop()
        self.temp.cleanup()

    def write_fixture(self):
        self.raw = serialized(self.state)
        self.partial.write_bytes(self.raw[:payload_offset(self.raw, "archive/data/2") + 4096])
        self.parent.write_bytes(serialized(self.prior))

    def run_recovery(self, **changes):
        options = dict(expected_parent_sha=recovery.sha256(self.parent), expected_keys=2, expected_elements=6)
        options.update(changes)
        return recovery.recover(self.partial, self.parent, self.output, **options)

    def test_complete_generator_recovered_exactly_without_missing_state(self):
        source_sha, parent_sha = recovery.sha256(self.partial), recovery.sha256(self.parent)
        report = self.run_recovery()
        result = torch.load(self.output / "recovered_generator_only.pt", weights_only=True, map_location="cpu")
        for key, expected in self.generator.items():
            self.assertTrue(torch.equal(result["generator"][key], expected))
        self.assertEqual(result["generator"]._metadata, self.generator._metadata)
        self.assertEqual(result["completed_steps"], 1500)
        self.assertTrue(result["full_optimizer_unavailable"])
        self.assertFalse(result["quality_approved"])
        self.assertNotIn("optimizer_g", result)
        self.assertNotIn("discriminator", result)
        self.assertFalse(report["model_run"])
        self.assertFalse(report["full_training_resume_available"])
        self.assertEqual(report["source_metadata_without_unavailable_tensors"]["scheduler_g"],
                         self.state["scheduler_g"])
        self.assertEqual(report["source_metadata_without_unavailable_tensors"]["numpy_sampler_rng"],
                         self.state["numpy_sampler_rng"])
        self.assertEqual(report["first_incomplete_member"]["name"], "archive/data/2")
        self.assertEqual(report["source_partial_sha256"], source_sha)
        self.assertEqual(recovery.sha256(self.partial), source_sha)
        self.assertEqual(recovery.sha256(self.parent), parent_sha)
        self.assertEqual(json.loads((self.output / "recovery_audit.json").read_text())["completed_steps"], 1500)

    def test_tampered_generator_crc_rejected_without_output(self):
        raw = bytearray(self.partial.read_bytes())
        raw[payload_offset(self.raw, "archive/data/0")] ^= 1
        self.partial.write_bytes(raw)
        with self.assertRaisesRegex(ValueError, "CRC_or_size_invalid"):
            self.run_recovery()
        self.assertFalse(self.output.exists())

    def test_missing_generator_descriptor_is_not_trusted(self):
        offset = payload_offset(self.raw, "archive/data/1")
        self.partial.write_bytes(self.raw[:offset + 12])
        with self.assertRaisesRegex(ValueError, "generator_storage_not_complete"):
            self.run_recovery()
        self.assertFalse(self.output.exists())

    def test_unknown_globals_and_dynamic_global_opcode_rejected(self):
        with self.assertRaisesRegex(ValueError, "unsupported_pickle_global"):
            recovery.descriptors(b"\x80\x02cbuiltins\neval\n.")
        with self.assertRaisesRegex(ValueError, "unsupported_pickle_opcode"):
            recovery.descriptors(b"\x80\x04\x8c\x08builtins\x8c\x04eval\x93.")

    def test_parent_hash_shape_normalizer_and_gate_mismatch_rejected(self):
        with self.assertRaisesRegex(ValueError, "known_valid1000_generator_hash"):
            self.run_recovery(expected_parent_sha="0" * 64)
        for change, pattern in (("shape", "shape_dtype_stride"), ("normalizer", "normalizer_changed"),
                                ("gate", "original_data_gate_changed")):
            original = copy.deepcopy(self.prior)
            if change == "shape":
                self.prior["generator"]["b"] = torch.tensor([4., 5., 6.])
            elif change == "normalizer":
                self.prior["normalizer_scale"][0] = 2.
            else:
                self.prior["data_gate_sha256"] = "wrong-gate"
            self.parent.write_bytes(serialized(self.prior))
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, pattern):
                self.run_recovery()
            self.prior = original

    def test_nonfinite_generator_and_wrong_element_count_rejected(self):
        with self.assertRaisesRegex(ValueError, "element_count"):
            self.run_recovery(expected_elements=7)
        self.generator["a"][0] = float("nan")
        self.write_fixture()
        with self.assertRaisesRegex(ValueError, "nonfinite_or_wrong_size"):
            self.run_recovery()
        self.assertFalse(self.output.exists())

    def test_existing_output_and_external_output_rejected(self):
        self.output.mkdir()
        marker = self.output / "keep"
        marker.write_text("preserve")
        with self.assertRaisesRegex(ValueError, "fresh_private_recovery_output"):
            self.run_recovery()
        self.assertEqual(marker.read_text(), "preserve")
        self.output = self.root.parent / "outside-recovery"
        with self.assertRaisesRegex(ValueError, "fresh_private_recovery_output"):
            self.run_recovery()

    def test_wrong_step_and_outside_storage_descriptors_rejected(self):
        self.state["completed_steps"] = 1499
        self.write_fixture()
        with self.assertRaisesRegex(ValueError, "1500_metadata"):
            self.run_recovery()
        with self.assertRaisesRegex(ValueError, "unsupported_tensor_descriptor"):
            recovery.rebuild(recovery.StorageRef("0", recovery.StorageKind("FloatStorage", 4, "<f4"), 3),
                             0, (3,), (-1,), False, None)


if __name__ == "__main__":
    unittest.main()
