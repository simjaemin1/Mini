#!/usr/bin/env python3
"""Focused regression tests for the native WAV source reader."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest import mock

import numpy as np


MODULE_PATH = Path(__file__).with_name("native_wav.py")
SPEC = importlib.util.spec_from_file_location("rnd06_native_wav", MODULE_PATH)
assert SPEC and SPEC.loader
native_wav = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = native_wav
SPEC.loader.exec_module(native_wav)


def _chunk(identifier: bytes, payload: bytes) -> bytes:
    assert len(identifier) == 4
    return identifier + struct.pack("<I", len(payload)) + payload + (b"\0" if len(payload) & 1 else b"")


def _wave(chunks: list[bytes]) -> bytes:
    body = b"WAVE" + b"".join(chunks)
    return b"RIFF" + struct.pack("<I", len(body)) + body


def _fmt(audio_format: int, channels: int, rate: int, bits: int) -> bytes:
    block_align = channels * (bits // 8)
    return struct.pack(
        "<HHIIHH", audio_format, channels, rate, rate * block_align, block_align, bits
    )


def _bext(description: bytes = b"R&D source") -> bytes:
    result = bytearray(602)
    result[0:256] = description.ljust(256, b"\0")
    result[256:288] = b"National Gugak Center".ljust(32, b"\0")
    result[288:320] = b"asset-ref".ljust(32, b"\0")
    result[320:330] = b"2026-09-24"
    result[330:338] = b"12:34:56"
    struct.pack_into("<Q", result, 338, 48000)
    struct.pack_into("<H", result, 346, 2)
    return bytes(result)


class NativeWavTests(unittest.TestCase):
    def _write(self, directory: Path, name: str, contents: bytes) -> Path:
        path = directory / name
        path.write_bytes(contents)
        return path

    def test_pcm16_bwf_info_metadata_and_mono_are_native(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            samples = struct.pack("<hhhhhh", -32768, 32767, 0, 16384, 8192, -8192)
            info = b"INFO" + _chunk(b"INAM", b"Daegeum test\0")
            path = self._write(
                root,
                "source.wav",
                _wave(
                    [
                        _chunk(b"JUNK", b"abc"),
                        _chunk(b"bext", _bext(b"/Users/private/recording.wav")),
                        _chunk(b"LIST", info),
                        _chunk(b"fmt ", _fmt(1, 2, 48000, 16)),
                        _chunk(b"data", samples),
                    ]
                ),
            )

            metadata = native_wav.inspect_wav(path)
            self.assertEqual(metadata["native_audio"]["sample_rate_hz"], 48000)
            self.assertEqual(metadata["native_audio"]["channels"], 2)
            self.assertEqual(metadata["native_audio"]["frame_count"], 3)
            self.assertEqual(metadata["native_audio"]["bits_per_sample"], 16)
            self.assertEqual(metadata["native_audio"]["encoding"], "PCM")
            self.assertEqual(metadata["riff_metadata"]["bext"]["time_reference_samples"], 48000)
            self.assertEqual(metadata["riff_metadata"]["bext"]["version"], 2)
            self.assertEqual(
                metadata["riff_metadata"]["bext"]["description"],
                "[redacted-absolute-path]",
            )
            self.assertEqual(metadata["riff_metadata"]["info"]["INAM"], "Daegeum test")
            self.assertEqual(metadata["sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
            self.assertEqual(metadata["analysis_mono_policy"]["id"], "mean_channels")
            self.assertNotIn(str(root), json.dumps(metadata))
            self.assertNotIn("path", metadata)

            decoded = native_wav.read_native_wav(path)
            self.assertEqual(decoded.samples.shape, (3, 2))
            self.assertEqual(decoded.analysis_mono.shape, (3,))
            np.testing.assert_allclose(
                decoded.samples,
                np.array([[-1.0, 32767 / 32768], [0.0, 0.5], [0.25, -0.25]], dtype=np.float32),
                rtol=0,
                atol=1e-7,
            )
            np.testing.assert_allclose(
                decoded.analysis_mono,
                np.array([-1 / 65536, 0.25, 0.0], dtype=np.float32),
                rtol=0,
                atol=1e-7,
            )
            self.assertFalse(decoded.metadata["native_audio"]["resampled"])

    def test_float_and_pcm24_decode_without_resampling(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            float_values = np.array([0.125, -0.5, 1.25], dtype="<f4")
            float_path = self._write(
                root,
                "float.wav",
                _wave([_chunk(b"fmt ", _fmt(3, 1, 44100, 32)), _chunk(b"data", float_values.tobytes())]),
            )
            float_recording = native_wav.read_native_wav(float_path)
            self.assertEqual(float_recording.metadata["native_audio"]["sample_rate_hz"], 44100)
            np.testing.assert_array_equal(float_recording.samples[:, 0], float_values)
            np.testing.assert_array_equal(float_recording.analysis_mono, float_values)

            def pcm24(value: int) -> bytes:
                return (value & 0xFFFFFF).to_bytes(3, "little", signed=False)

            pcm24_path = self._write(
                root,
                "pcm24.wav",
                _wave(
                    [
                        _chunk(b"fmt ", _fmt(1, 1, 96000, 24)),
                        _chunk(b"data", pcm24(-8388608) + pcm24(0) + pcm24(8388607)),
                    ]
                ),
            )
            pcm24_recording = native_wav.read_native_wav(pcm24_path)
            self.assertEqual(pcm24_recording.metadata["native_audio"]["sample_rate_hz"], 96000)
            np.testing.assert_allclose(
                pcm24_recording.samples[:, 0],
                np.array([-1.0, 0.0, 8388607 / 8388608], dtype=np.float32),
                rtol=0,
                atol=1e-7,
            )

    def test_rejects_non_wav_and_malformed_data_without_writing_source(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            not_wav = self._write(root, "source.flac", b"fLaC")
            with self.assertRaises(native_wav.NativeWavError):
                native_wav.inspect_wav(not_wav)

            malformed = self._write(
                root,
                "broken.wav",
                _wave([_chunk(b"fmt ", _fmt(1, 1, 48000, 16)), _chunk(b"data", b"\0")]),
            )
            before = malformed.read_bytes()
            with self.assertRaises(native_wav.NativeWavError):
                native_wav.inspect_wav(malformed)
            self.assertEqual(malformed.read_bytes(), before)

    def test_metadata_inspection_has_no_numpy_runtime_dependency(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = self._write(
                root,
                "metadata-only.wav",
                _wave([_chunk(b"fmt ", _fmt(1, 1, 48000, 16)), _chunk(b"data", b"\0\0")]),
            )
            # The module itself must not import NumPy merely to build a source
            # catalog.  This mirrors a system-Python `build.py --dry-run`.
            with mock.patch.dict(sys.modules, {"numpy": None}):
                metadata = native_wav.inspect_wav(path)
            self.assertEqual(metadata["native_audio"]["frame_count"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
