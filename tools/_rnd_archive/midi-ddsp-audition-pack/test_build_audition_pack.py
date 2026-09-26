#!/usr/bin/env python3
"""Tests for the fixed-gain, monitoring-only MIDI-DDSP R&D audition pack."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest
import wave

import numpy as np


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from build_audition_pack import (  # noqa: E402
    ACTIVE_END_SECONDS,
    A_KEY,
    A_OUTPUT_FILENAME,
    B_KEY,
    B_OUTPUT_FILENAME,
    B_RELEASE_END_SECONDS,
    B_RELEASE_START_SECONDS,
    MANIFEST_FILENAME,
    MidiDdspAuditionPackError,
    PEAK_CEILING_DBFS,
    TARGET_ACTIVE_RMS_DBFS,
    _constant_gain_pcm16,
    _rms,
    build_audition_pack,
)


RATE_HZ = 1000
ACTIVE_FRAMES = int(ACTIVE_END_SECONDS * RATE_HZ)
B_RELEASE_START = int(B_RELEASE_START_SECONDS * RATE_HZ)
B_RELEASE_END = int(B_RELEASE_END_SECONDS * RATE_HZ)
A_TOTAL_FRAMES = 7480


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _write_pcm16_mono(path: Path, samples: np.ndarray) -> None:
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE_HZ)
        output.setcomptype("NONE", "not compressed")
        output.writeframes(samples.astype("<i2", copy=False).tobytes())


def _read_pcm16_mono(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as source:
        if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (1, 2, RATE_HZ):
            raise AssertionError("unexpected fixture/output WAVE format")
        return np.frombuffer(source.readframes(source.getnframes()), dtype="<i2").copy()


def _source_samples(*, peak_ceiling_failure: bool) -> tuple[np.ndarray, np.ndarray]:
    frames = np.arange(ACTIVE_FRAMES, dtype=np.float64)
    # Both phases are deterministic and deliberately have different source
    # levels, exercising attenuation/amplification without a dynamics process.
    a_active = np.rint(3000.0 * np.sin(2.0 * math.pi * frames / 97.0)).astype(np.int16)
    a_tail = np.rint(1300.0 * np.cos(2.0 * math.pi * np.arange(A_TOTAL_FRAMES - ACTIVE_FRAMES) / 61.0)).astype(np.int16)
    a = np.concatenate((a_active, a_tail))
    if peak_ceiling_failure:
        # RMS is about 207 PCM units but its 3,000-unit sparse peak would be
        # ~30,000 after reaching -24 dBFS: below hard int16 clipping yet above
        # the mandatory -3 dBFS ceiling.
        b_active = np.zeros(ACTIVE_FRAMES, dtype=np.int16)
        b_active[:31] = 3000
    else:
        b_active = np.rint(700.0 * np.cos(2.0 * math.pi * frames / 89.0)).astype(np.int16)
    release_frames = np.arange(B_RELEASE_END - B_RELEASE_START, dtype=np.float64)
    release = np.rint(
        700.0
        * np.cos(2.0 * math.pi * release_frames / 89.0)
        * (1.0 - release_frames / max(1, release_frames.size))
    ).astype(np.int16)
    b = np.concatenate((b_active, release))
    return a, b


def _make_successful_report(root: Path, *, peak_ceiling_failure: bool = False) -> tuple[Path, np.ndarray, np.ndarray]:
    report = root / "official-runtime-report"
    a_dir = report / A_KEY
    b_dir = report / B_KEY
    a_dir.mkdir(parents=True)
    b_dir.mkdir(parents=True)
    a, b = _source_samples(peak_ceiling_failure=peak_ceiling_failure)
    a_path = a_dir / "authorial_score.wav"
    b_path = b_dir / "authorial_score_bridge6.wav"
    _write_pcm16_mono(a_path, a)
    _write_pcm16_mono(b_path, b)
    payload = {
        "schema": "mini.midi-ddsp-official-flute-rnd.v1",
        "status": "succeeded",
        "scope": {"r_and_d": True, "default_bgm_changed": False},
        "variants": {
            A_KEY: {
                "audio": {
                    "relative_path": f"{A_KEY}/authorial_score.wav",
                    "sha256": _sha256(a_path),
                }
            },
            B_KEY: {
                "audio": {
                    "relative_path": f"{B_KEY}/authorial_score_bridge6.wav",
                    "sha256": _sha256(b_path),
                }
            },
        },
    }
    (report / "official_flute_rnd_report.json").write_text(
        json.dumps(payload, sort_keys=True), encoding="utf-8"
    )
    return report, a, b


class MidiDdspAuditionPackTests(unittest.TestCase):
    def test_builds_deterministic_fixed_gain_pack_and_preserves_release_shape(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            report, a_source, b_source = _make_successful_report(root)
            sources_before = {
                path.relative_to(report).as_posix(): _sha256(path)
                for path in report.rglob("*.wav")
            }
            report_before = _sha256(report / "official_flute_rnd_report.json")
            first_output = root / "first-output"
            second_output = root / "second-output"
            first = build_audition_pack(report, first_output)
            second = build_audition_pack(report, second_output)

            self.assertEqual(first, second)
            self.assertEqual(report_before, _sha256(report / "official_flute_rnd_report.json"))
            self.assertEqual(
                sources_before,
                {path.relative_to(report).as_posix(): _sha256(path) for path in report.rglob("*.wav")},
            )
            self.assertFalse((report / A_OUTPUT_FILENAME).exists())
            self.assertFalse((report / B_OUTPUT_FILENAME).exists())
            self.assertEqual(
                (first_output / A_OUTPUT_FILENAME).read_bytes(),
                (second_output / A_OUTPUT_FILENAME).read_bytes(),
            )
            self.assertEqual(
                (first_output / B_OUTPUT_FILENAME).read_bytes(),
                (second_output / B_OUTPUT_FILENAME).read_bytes(),
            )
            self.assertEqual(
                (first_output / MANIFEST_FILENAME).read_text(encoding="utf-8"),
                (second_output / MANIFEST_FILENAME).read_text(encoding="utf-8"),
            )

            a_output = _read_pcm16_mono(first_output / A_OUTPUT_FILENAME)
            b_output = _read_pcm16_mono(first_output / B_OUTPUT_FILENAME)
            self.assertEqual(a_output.size, a_source.size)
            self.assertEqual(b_output.size, b_source.size)
            target_rms = 32768.0 * 10.0 ** (TARGET_ACTIVE_RMS_DBFS / 20.0)
            self.assertAlmostEqual(_rms(a_output[:ACTIVE_FRAMES]), target_rms, delta=0.6)
            self.assertAlmostEqual(_rms(b_output[:ACTIVE_FRAMES]), target_rms, delta=0.6)
            self.assertAlmostEqual(_rms(a_output[:ACTIVE_FRAMES]), _rms(b_output[:ACTIVE_FRAMES]), delta=0.6)
            peak_ceiling = 32768.0 * 10.0 ** (PEAK_CEILING_DBFS / 20.0)
            self.assertLessEqual(float(np.max(np.abs(a_output.astype(np.int32)))), peak_ceiling)
            self.assertLessEqual(float(np.max(np.abs(b_output.astype(np.int32)))), peak_ceiling)

            b_gain = target_rms / _rms(b_source[:ACTIVE_FRAMES])
            a_gain = target_rms / _rms(a_source[:ACTIVE_FRAMES])
            self.assertTrue(np.array_equal(a_output, _constant_gain_pcm16(a_source, gain=a_gain)))
            self.assertTrue(np.array_equal(b_output, _constant_gain_pcm16(b_source, gain=b_gain)))
            self.assertTrue(
                np.array_equal(
                    b_output[B_RELEASE_START:B_RELEASE_END],
                    _constant_gain_pcm16(b_source[B_RELEASE_START:B_RELEASE_END], gain=b_gain),
                )
            )
            operation = first["level_matching_operation"]
            self.assertEqual(operation["shared_target_rms_dbfs_before_output_quantization"], -24.0)
            self.assertEqual(operation["whole_file_peak_ceiling_dbfs_after_output_quantization"], -3.0)
            self.assertTrue(operation["one_constant_gain_per_entire_file_only"])
            self.assertTrue(operation["amplification_is_monitoring_only_and_not_dynamic_processing"])
            self.assertTrue(operation["limiter_not_applied"])
            self.assertTrue(operation["compression_not_applied"])
            self.assertTrue(first["interpretation_limits"]["amplification_is_listening_only_not_model_output"])
            b_release = first["variants"][B_KEY]["release_shape_integrity"]
            self.assertTrue(b_release["same_one_whole_file_gain_applied"])
            self.assertTrue(b_release["output_samples_equal_to_pcm16_round(source_samples_times_same_gain)"])

    def test_fails_closed_before_writing_if_constant_gain_exceeds_peak_ceiling(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            report, _, _ = _make_successful_report(root, peak_ceiling_failure=True)
            output = root / "must-not-be-written"
            with self.assertRaisesRegex(MidiDdspAuditionPackError, "exceeds.*monitoring ceiling"):
                build_audition_pack(report, output)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
