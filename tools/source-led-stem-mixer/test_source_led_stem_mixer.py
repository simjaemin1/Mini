"""Deterministic fixtures for the R&D-only source-led stem mixer."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

import numpy


HERE = Path(__file__).resolve().parent
NATIVE_WAV_DIR = HERE.parent / "daegeum-transitions"
for directory in (HERE, NATIVE_WAV_DIR):
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))

import source_led_stem_mixer as mixer
from native_wav import inspect_wav, read_native_wav, sha256_file


def _native_summary(path: Path) -> dict[str, object]:
    native = inspect_wav(path)["native_audio"]
    return {
        "sample_rate_hz": native["sample_rate_hz"],
        "channels": native["channels"],
        "frame_count": native["frame_count"],
        "encoding": native["encoding"],
    }


def _write_pcm16(path: Path, samples: numpy.ndarray, sample_rate_hz: int) -> None:
    values = numpy.asarray(samples, dtype=numpy.float32)
    if values.ndim == 1:
        values = values[:, None]
    if values.ndim != 2 or values.shape[0] < 1 or values.shape[1] not in {1, 2}:
        raise AssertionError("fixture must be a nonempty mono/stereo matrix")
    pcm = numpy.rint(numpy.clip(values, -1.0, 32767.0 / 32768.0) * 32768.0).astype("<i2")
    payload = pcm.tobytes()
    channels = values.shape[1]
    block_align = channels * 2
    byte_rate = sample_rate_hz * block_align
    fmt = struct.pack("<HHIIHH", 1, channels, sample_rate_hz, byte_rate, block_align, 16)
    header = b"RIFF" + (36 + len(payload)).to_bytes(4, "little") + b"WAVE"
    header += b"fmt " + len(fmt).to_bytes(4, "little") + fmt
    header += b"data" + len(payload).to_bytes(4, "little")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header + payload)


def _triage_gate() -> dict[str, bool]:
    return {
        "raw_source_sha256_verified_via_candidate_catalog_and_actual_direct_wav": True,
        "source_catalog_sha256_link_verified": True,
        "triage_candidate_and_report_trajectory_provenance_agree": True,
        "triage_direct_trajectory_catalog_link_and_sha256_attestation_preserved_not_rehashed": True,
        "triage_raw_source_attestation_matches_catalog_and_actual_native_descriptor": True,
        "triage_report_schema_and_sha256_identity_recorded": True,
        "triage_unreviewed_not_phrase_not_approved_not_training_not_game_limits_verified": True,
    }


def _lead_fixture(root: Path, *, sample_rate_hz: int = 48_000) -> tuple[Path, Path, numpy.ndarray]:
    directory = root / "lead"
    raw = directory / "A_raw_lead_stem.wav"
    samples = numpy.array(
        [
            [0.10, -0.10],
            [0.05, -0.05],
            [0.03, -0.03],
            [0.02, -0.02],
            [0.00, 0.00],
            [-0.02, 0.02],
            [-0.03, 0.03],
            [0.01, -0.01],
        ],
        dtype=numpy.float32,
    )
    _write_pcm16(raw, samples, sample_rate_hz)
    descriptor = inspect_wav(raw)
    native = descriptor["native_audio"]
    manifest = {
        "schema": mixer.LEAD_MANIFEST_SCHEMA,
        "artifact_kind": "unreviewed_source_led_raw_lead_stem_audition",
        "input": {
            "selected_path": {"kind": "phrase_boundary_triage_report"},
            "phrase_boundary_triage_gate": _triage_gate(),
        },
        "selected_path": {
            "source": {"source_id": "lead_source", "sha256": "a" * 64},
            "span": {"frame_range": [100, 108]},
        },
        "A_raw_lead_stem": {
            "schema": mixer.RAW_LEAD_STEM_SCHEMA,
            "artifact": raw.name,
            "artifact_role": "unreviewed_source_led_raw_lead_stem_rnd_only",
            "raw_audio_is_source_faithful": True,
            "source_audio_frames_byte_for_byte_copied": True,
            "single_contiguous_source_frame_range": [100, 108],
            "no_candidate_clip_stitching_or_crossfade": True,
            "not_a_game_asset": True,
            "not_a_training_item": True,
            "no_backing_mix_or_runtime_asset": True,
            "not_a_verified_phrase_or_gesture_boundary": True,
            "not_an_approved_transition_or_phrase": True,
            "source_sample_bytes_sha256": mixer._payload_sha256(raw, native),
            "source_sample_bytes": native["data_byte_length"],
            "processing": {
                "gain": "none",
                "pitch_shift": "none",
                "time_stretch": "none",
                "resample": "none",
                "channel_change": "none",
                "fade": "none",
            },
            "output_native_audio": _native_summary(raw),
        },
        "interpretation_limits": {
            "not_a_game_asset": True,
            "not_a_training_item": True,
            "no_runtime_BGM_or_public_asset_was_read_or_written": True,
            "all_events_remain_unreviewed_automatic_candidates": True,
            "boundary_triage_A_is_raw_lead_stem_only_with_no_backing_mix": True,
        },
    }
    manifest_path = directory / "span_audition.json"
    manifest_path.write_text(json.dumps(manifest, sort_keys=True), encoding="utf-8")
    return manifest_path, raw, read_native_wav(raw).samples


def _support_fixture(root: Path, *, source_sha_override: str | None = None, start_seconds: float | None = None) -> Path:
    directory = root / "support"
    source = directory / "verified-inputs" / "support.wav"
    # The 44.1 kHz source proves resampling is support-only and explicit.
    samples = numpy.array(
        [[0.0, 0.0], [0.25, 0.40], [0.30, 0.45], [0.35, 0.50], [0.40, 0.55], [0.0, 0.0]],
        dtype=numpy.float32,
    )
    _write_pcm16(source, samples, 44_100)
    start_frame = 2
    manifest = {
        "schema": mixer.SUPPORT_HIT_MANIFEST_SCHEMA,
        "r_and_d_scope": {
            "r_and_d_only": True,
            "no_default_assets": True,
            "no_runtime_bgm": True,
            "no_game_output": True,
            "no_public_release": True,
        },
        "rights_gate": {
            "r_and_d_mixing_authorized_for_this_manifest": True,
            "no_default_asset_or_runtime_use": True,
            "no_game_or_public_distribution_clearance": True,
            "requires_new_rights_review_for_scope_expansion": True,
        },
        "source_roots": {"fixture_support_root": str((directory / "verified-inputs").resolve())},
        "support_hits": [
            {
                "hit_id": "support_001",
                "hit_gate": {
                    "r_and_d_only": True,
                    "not_default_asset": True,
                    "not_runtime_bgm": True,
                    "not_game_asset": True,
                    "not_public_distribution": True,
                    "not_a_training_item": True,
                    "source_audio_is_direct_native_wav": True,
                },
                "source": {
                    "source_id": "support_source",
                    "root_id": "fixture_support_root",
                    "relative_path": "support.wav",
                    "sha256": source_sha_override or sha256_file(source),
                    "native_audio": _native_summary(source),
                },
                "native_source_span": {
                    "frame_range": [1, 5],
                    "single_contiguous_source_frame_range": True,
                },
                "placement": {
                    "start_frame_48k": start_frame,
                    "start_seconds": start_seconds if start_seconds is not None else start_frame / 48_000,
                    "gain_db": -6.0,
                    "pan": 1.0,
                },
            }
        ],
    }
    path = directory / "explicit-support-hits.json"
    path.write_text(json.dumps(manifest, sort_keys=True), encoding="utf-8")
    return path


class SourceLedStemMixerTests(unittest.TestCase):
    def test_mix_keeps_raw_lead_untouched_and_records_44k_support_crop(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            lead_manifest, raw_lead, lead_samples = _lead_fixture(root)
            support_manifest = _support_fixture(root)
            before = sha256_file(raw_lead)
            output = root / "_bgm_rnd" / "mix"
            result = mixer.build_source_led_mixed_preview(
                lead_manifest=lead_manifest,
                support_hit_manifest=support_manifest,
                output_dir=output,
            )
            self.assertEqual(sha256_file(raw_lead), before)
            self.assertTrue(result["A_raw_lead_stem"]["source_faithful"])
            self.assertTrue(result["A_raw_lead_stem"]["retained_untouched"])
            self.assertTrue(result["M_mixed_preview"]["not_source_faithful"])
            self.assertEqual(result["support_hits"][0]["mix_placement"]["start_frame"], 2)
            self.assertTrue(result["support_hits"][0]["mix_placement"]["support_resample"]["applied"])
            self.assertEqual(result["support_hits"][0]["mix_placement"]["support_resample"]["source_sample_rate_hz"], 44100)
            mixed_path = output / mixer.MIX_FILENAME
            mixed = read_native_wav(mixed_path)
            self.assertEqual(mixed.metadata["native_audio"]["sample_rate_hz"], 48_000)
            self.assertEqual(mixed.metadata["native_audio"]["channels"], 2)
            self.assertEqual(mixed.metadata["native_audio"]["encoding"], "IEEE_FLOAT")
            self.assertAlmostEqual(float(mixed.samples[0, 0]), float(lead_samples[0, 0]), places=6)
            self.assertAlmostEqual(float(mixed.samples[0, 1]), float(lead_samples[0, 1]), places=6)
            # Hard-right support pan leaves left untouched but raises right.
            self.assertAlmostEqual(float(mixed.samples[2, 0]), float(lead_samples[2, 0]), places=6)
            self.assertGreater(float(mixed.samples[2, 1]), float(lead_samples[2, 1]))
            manifest_text = (output / mixer.MIX_MANIFEST_FILENAME).read_text(encoding="utf-8")
            self.assertNotIn(str(root), manifest_text)

    def test_optional_support_manifest_renders_separate_lead_only_m(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            lead_manifest, raw_lead, _ = _lead_fixture(root)
            before = sha256_file(raw_lead)
            result = mixer.build_source_led_mixed_preview(
                lead_manifest=lead_manifest,
                output_dir=root / "_bgm_rnd" / "lead-only",
            )
            self.assertEqual(result["input"]["support_hit_manifest"]["support_hit_count"], 0)
            self.assertFalse(result["input"]["support_hit_manifest"]["provided"])
            self.assertEqual(sha256_file(raw_lead), before)

    def test_rejects_support_sha_or_timestamp_mismatch_before_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            lead_manifest, _, _ = _lead_fixture(root)
            bad_sha = _support_fixture(root, source_sha_override="0" * 64)
            output = root / "_bgm_rnd" / "bad-sha"
            with self.assertRaisesRegex(mixer.SourceLedStemMixerError, "SHA-256"):
                mixer.build_source_led_mixed_preview(
                    lead_manifest=lead_manifest, support_hit_manifest=bad_sha, output_dir=output
                )
            self.assertFalse(output.exists())
            bad_time = _support_fixture(root, start_seconds=0.5)
            with self.assertRaisesRegex(mixer.SourceLedStemMixerError, "timestamp"):
                mixer.build_source_led_mixed_preview(
                    lead_manifest=lead_manifest,
                    support_hit_manifest=bad_time,
                    output_dir=root / "_bgm_rnd" / "bad-time",
                )

    def test_rejects_non_48k_lead_instead_of_converting_it(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            lead_manifest, _, _ = _lead_fixture(root, sample_rate_hz=44_100)
            output = root / "_bgm_rnd" / "bad-lead"
            with self.assertRaisesRegex(mixer.SourceLedStemMixerError, "48 kHz"):
                mixer.build_source_led_mixed_preview(lead_manifest=lead_manifest, output_dir=output)
            self.assertFalse(output.exists())

    def test_rejects_support_root_escape_before_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            lead_manifest, _, _ = _lead_fixture(root)
            support_manifest = _support_fixture(root)
            payload = json.loads(support_manifest.read_text(encoding="utf-8"))
            payload["support_hits"][0]["source"]["relative_path"] = "../outside.wav"
            support_manifest.write_text(json.dumps(payload), encoding="utf-8")
            output = root / "_bgm_rnd" / "root-escape"
            with self.assertRaisesRegex(mixer.SourceLedStemMixerError, "safe relative path"):
                mixer.build_source_led_mixed_preview(
                    lead_manifest=lead_manifest,
                    support_hit_manifest=support_manifest,
                    output_dir=output,
                )
            self.assertFalse(output.exists())

    def test_refuses_existing_output_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            lead_manifest, raw_lead, _ = _lead_fixture(root)
            output = root / "_bgm_rnd" / "already-there"
            output.mkdir(parents=True)
            before = sha256_file(raw_lead)
            with self.assertRaisesRegex(mixer.SourceLedStemMixerError, "fresh"):
                mixer.build_source_led_mixed_preview(lead_manifest=lead_manifest, output_dir=output)
            self.assertEqual(sha256_file(raw_lead), before)


if __name__ == "__main__":
    unittest.main()
