#!/usr/bin/env python3
"""Recover only complete CRC-verified G storages from a truncated local ZIP.

Pickle is decoded into inert descriptors with a five-global allowlist. Missing
D/optimizer data is never invented. No model is instantiated or executed.
"""
import argparse
from collections import Counter, OrderedDict
from dataclasses import dataclass
import hashlib
import io
import json
import os
from pathlib import Path
import pickle
import pickletools
import struct
import zipfile
import zlib

import numpy as np

PARENT_SHA = "7ba1bd724fc731cf126f49f64a5fe1f9d3fb42da6be3c45e5b3766f732532a0c"
EXPECTED_ELEMENTS, EXPECTED_KEYS = 11303652, 288
PRIVATE_ROOT = Path.home() / "Mini/_bgm/gpt"
MAX_OUTPUT_BYTES = 80_000_000


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1048576), b""):
            digest.update(chunk)
    return digest.hexdigest()


@dataclass(frozen=True)
class StorageKind:
    name: str
    width: int
    dtype: str


@dataclass(frozen=True)
class StorageRef:
    key: str
    kind: StorageKind
    numel: int


@dataclass
class TensorRef:
    storage: StorageRef
    offset: int
    size: tuple
    stride: tuple
    requires_grad: bool


def rebuild(storage, offset, size, stride, requires_grad, hooks, metadata=None):
    if (not isinstance(storage, StorageRef) or type(offset) is not int or offset < 0
            or not isinstance(size, tuple) or not isinstance(stride, tuple)
            or len(size) != len(stride) or len(size) > 8
            or any(type(v) is not int or v < 0 for v in size + stride)
            or type(requires_grad) is not bool or metadata is not None):
        raise ValueError("unsupported_tensor_descriptor")
    return TensorRef(storage, offset, size, stride, requires_grad)


class DescriptorUnpickler(pickle.Unpickler):
    """No torch rebuilds/imports: all tensors remain inert shape descriptors."""
    def __init__(self, stream):
        super().__init__(stream)
        self.storages = {}

    def find_class(self, module, name):
        allowed = {("collections", "OrderedDict"): OrderedDict,
                   ("collections", "Counter"): Counter,
                   ("torch._utils", "_rebuild_tensor_v2"): rebuild,
                   ("torch", "FloatStorage"): StorageKind("FloatStorage", 4, "<f4"),
                   ("torch", "ByteStorage"): StorageKind("ByteStorage", 1, "u1")}
        if (module, name) not in allowed:
            raise ValueError("unsupported_pickle_global:" + module + "." + name)
        return allowed[(module, name)]

    def persistent_load(self, pid):
        if not isinstance(pid, tuple) or len(pid) != 5 or pid[0] != "storage":
            raise ValueError("unsupported_persistent_id")
        _, kind, key, device, count = pid
        if (not isinstance(kind, StorageKind) or not isinstance(key, str) or not key.isdigit()
                or device != "cpu" or type(count) is not int or not 0 <= count <= 100_000_000):
            raise ValueError("unsupported_CPU_storage_descriptor")
        result = StorageRef(key, kind, count)
        if key in self.storages and self.storages[key] != result:
            raise ValueError("inconsistent_repeated_storage")
        self.storages[key] = result
        return result


def descriptors(payload):
    # No extension, instance, dynamic-global, or out-of-band-buffer opcodes.
    forbidden = {"EXT1", "EXT2", "EXT4", "INST", "OBJ", "NEWOBJ", "NEWOBJ_EX",
                 "STACK_GLOBAL", "PERSID", "NEXT_BUFFER", "READONLY_BUFFER"}
    for op, _, _ in pickletools.genops(payload):
        if op.name in forbidden:
            raise ValueError("unsupported_pickle_opcode:" + op.name)
    reader = DescriptorUnpickler(io.BytesIO(payload))
    return reader.load(), reader.storages


def prefix(path):
    """Read exact local payload sizes and verify descriptors+CRC, no ZIP repair."""
    size = path.stat().st_size
    with path.open("rb") as handle:
        header = handle.read(30)
        fields = struct.unpack("<IHHHHHIIIHH", header)
        if fields[0] != 0x04034B50:
            raise ValueError("local_ZIP_header_required")
        name = handle.read(fields[-2]).decode("utf-8")
        handle.read(fields[-1])
        if name != "archive/data.pkl":
            raise ValueError("fixed_archive_pickle_member_required")
        sample = handle.read(1_000_000)
        end = next(position + 1 for op, _, position in pickletools.genops(sample) if op.name == "STOP")
        payload = sample[:end]
        state, storages = descriptors(payload)
        members, position, incomplete = {}, 0, None
        while position + 30 <= size:
            handle.seek(position)
            values = struct.unpack("<IHHHHHIIIHH", handle.read(30))
            if values[0] != 0x04034B50:
                raise ValueError("partial_local_header_stream_required")
            if values[2] != 0x0808 or values[3] != 0:
                raise ValueError("only_UTF8_stored_descriptor_ZIP_supported")
            name = handle.read(values[-2]).decode("utf-8")
            handle.read(values[-1])
            offset = handle.tell()
            if name == "archive/data.pkl":
                length = len(payload)
            elif name.startswith("archive/data/"):
                ref = storages[name.rsplit("/", 1)[-1]]
                length = ref.numel * ref.kind.width
            elif name in ("archive/.format_version", "archive/.storage_alignment", "archive/byteorder"):
                handle.seek(offset)
                length = handle.read(256).find(b"PK\x07\x08")
                if length < 0:
                    raise ValueError("metadata_descriptor_missing")
            else:
                raise ValueError("unexpected_prefix_member:" + name)
            if offset + length + 16 > size:
                incomplete = dict(name=name, expected_bytes=length,
                                  available_payload_bytes=max(0, size - offset))
                break
            handle.seek(offset)
            data, descriptor = handle.read(length), handle.read(16)
            signature, crc, compressed, uncompressed = struct.unpack("<IIII", descriptor)
            if (signature != 0x08074B50 or compressed != length or uncompressed != length
                    or zlib.crc32(data) & 0xFFFFFFFF != crc or name in members):
                raise ValueError("local_member_CRC_or_size_invalid:" + name)
            if name == "archive/byteorder" and data != b"little":
                raise ValueError("little_endian_checkpoint_required")
            members[name] = dict(offset=offset, bytes=length, crc32=crc)
            position = offset + length + 16
        if incomplete is None:
            raise ValueError("expected_truncated_storage_member_not_found")
    return state, members, incomplete


def tensor_arrays(generator, members, handle, expected_keys, expected_elements):
    if not isinstance(generator, OrderedDict) or len(generator) != expected_keys:
        raise ValueError("expected_generator_OrderedDict_keys_required")
    arrays, used, count = OrderedDict(), set(), 0
    for name, tensor in generator.items():
        if (not isinstance(name, str) or not isinstance(tensor, TensorRef)
                or tensor.storage.kind.name != "FloatStorage"):
            raise ValueError("only_generator_float32_tensor_descriptors")
        key = "archive/data/" + tensor.storage.key
        if key not in members:
            raise ValueError("generator_storage_not_complete:" + name)
        upper = tensor.offset + sum((n - 1) * stride for n, stride in zip(tensor.size, tensor.stride) if n)
        if tensor.offset < 0 or upper >= tensor.storage.numel:
            raise ValueError("generator_tensor_view_outside_storage")
        handle.seek(members[key]["offset"])
        flat = np.frombuffer(handle.read(members[key]["bytes"]), dtype="<f4").copy()
        if len(flat) != tensor.storage.numel or not np.isfinite(flat).all():
            raise ValueError("generator_storage_nonfinite_or_wrong_size")
        # Caller materializes torch.as_strided only after validated bounds.
        arrays[name] = (flat, tensor)
        count += int(np.prod(tensor.size, dtype=np.int64))
        used.add(key)
    if count != expected_elements or len(used) != expected_keys:
        raise ValueError("generator_element_count_or_unique_storages_mismatch")
    return arrays, count


def contains_tensor(value):
    if isinstance(value, (TensorRef, StorageRef, StorageKind)):
        return True
    if isinstance(value, dict):
        return any(contains_tensor(v) for v in value.values())
    if isinstance(value, (list, tuple)):
        return any(contains_tensor(v) for v in value)
    return False


def recover(partial, parent, output, *, expected_parent_sha=PARENT_SHA,
            expected_keys=EXPECTED_KEYS, expected_elements=EXPECTED_ELEMENTS):
    partial, parent, output = Path(partial), Path(parent), Path(output)
    for path in (partial, parent):
        if not path.is_absolute() or path.is_symlink() or not path.is_file() or path.stat().st_size > 850_000_000:
            raise ValueError("bounded_absolute_regular_checkpoint_required")
    if (not output.is_absolute() or output.exists() or output.is_symlink()
            or not output.resolve().is_relative_to(PRIVATE_ROOT.resolve(strict=True))):
        raise ValueError("fresh_private_recovery_output_required")
    before, parent_sha = sha256(partial), sha256(parent)
    if parent_sha != expected_parent_sha:
        raise ValueError("known_valid1000_generator_hash_required")
    state, members, incomplete = prefix(partial)
    if state.get("completed_steps") != 1500 or state.get("format") != "private_sifigan_level_fix_v1":
        raise ValueError("expected_partial_level_fix1500_metadata_required")
    with zipfile.ZipFile(parent) as archive:
        prior, _ = descriptors(archive.read("archive/data.pkl"))
    if prior.get("completed_steps") != 1000 or prior.get("quality_approved") is not False:
        raise ValueError("valid1000_research_generator_required")
    for key in ("generator_config", "normalizer_mean", "normalizer_scale"):
        if state[key] != prior[key]:
            raise ValueError("parent_generator_config_or_normalizer_changed")
    if state["original_data_gate_sha256"] != prior["data_gate_sha256"]:
        raise ValueError("original_data_gate_changed")
    generator, old_generator = state["generator"], prior["generator"]
    if set(generator) != set(old_generator):
        raise ValueError("generator_keys_differ_from_valid_parent")
    for key, tensor in generator.items():
        old = old_generator[key]
        if (not isinstance(tensor, TensorRef) or not isinstance(old, TensorRef)
                or (tensor.size, tensor.stride, tensor.storage.kind) != (old.size, old.stride, old.storage.kind)):
            raise ValueError("generator_shape_dtype_stride_differs_from_valid_parent")
    with partial.open("rb") as handle:
        arrays, count = tensor_arrays(generator, members, handle, expected_keys, expected_elements)
    if count * 4 + 2_000_000 > MAX_OUTPUT_BYTES:
        raise ValueError("80MB_generator_recovery_budget_exceeded")
    import torch  # CPU tensors only; no module/model construction or inference.
    recovered = OrderedDict()
    for key, (flat, tensor) in arrays.items():
        recovered[key] = torch.as_strided(torch.from_numpy(flat), tensor.size, tensor.stride, tensor.offset).clone()
    if hasattr(generator, "_metadata"):
        recovered._metadata = generator._metadata
    metadata = {key: value for key, value in state.items() if not contains_tensor(value)}
    report = dict(schema="mini.sifigan-generator-prefix-recovery.v1",
        status="generator_only_recovered_not_quality_approved", completed_steps=1500,
        source_partial_path=str(partial), source_partial_sha256=before,
        source_partial_bytes=partial.stat().st_size, valid1000_generator_path=str(parent),
        valid1000_generator_sha256=parent_sha, completed_CRC_verified_members=len(members),
        first_incomplete_member=incomplete, recovered_generator_keys=len(recovered), recovered_generator_elements=count,
        generator_all_finite=True, parent_key_shape_dtype_stride_match=True,
        full_optimizer_unavailable=True, full_training_resume_available=False,
        quality_approved=False, model_run=False, source_checkpoint_modified=False,
        source_metadata_without_unavailable_tensors=metadata,
        excluded_tensor_state_fields=[key for key, value in state.items() if contains_tensor(value) and key != "generator"],
        source_credit=prior["source_credit"], recovery_tool_sha256=sha256(__file__))
    output.mkdir(mode=0o700)
    destination = output / "recovered_generator_only.pt"
    with destination.open("xb") as handle:
        torch.save(dict(generator=recovered, generator_config=state["generator_config"],
            completed_steps=1500, normalizer_mean=state["normalizer_mean"], normalizer_scale=state["normalizer_scale"],
            data_gate_sha256=state["data_gate_sha256"], source_credit=prior["source_credit"],
            format="private_recovered_sifigan_generator_only_v1", recovered_generator_only=True,
            full_optimizer_unavailable=True, quality_approved=False,
            source_partial_sha256=before, valid1000_generator_sha256=parent_sha), handle)
    destination.chmod(0o600)
    # Verify our new small inference state through the standard safe loader.
    loaded = torch.load(destination, map_location="cpu", weights_only=True)
    if set(loaded["generator"]) != set(recovered) or any(
            not torch.equal(loaded["generator"][key], value) for key, value in recovered.items()):
        raise ValueError("recovered_generator_roundtrip_failed")
    if sha256(partial) != before or sha256(parent) != parent_sha:
        raise ValueError("source_checkpoint_changed_during_recovery")
    report.update(recovered_path=str(destination), recovered_sha256=sha256(destination),
                  recovered_bytes=destination.stat().st_size, input_hashes_unchanged=True)
    payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
    if len(payload) + destination.stat().st_size > MAX_OUTPUT_BYTES:
        raise ValueError("80MB_final_recovery_budget_exceeded")
    with (output / "recovery_audit.json").open("xb") as handle:
        handle.write(payload)
    (output / "recovery_audit.json").chmod(0o600)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--partial", type=Path, required=True)
    parser.add_argument("--parent-generator", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = recover(args.partial, args.parent_generator, args.output)
    print(json.dumps({key: result[key] for key in ("status", "recovered_bytes", "full_optimizer_unavailable")}))
