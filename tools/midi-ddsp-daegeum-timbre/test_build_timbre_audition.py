#!/usr/bin/env python3
"""Offline tests for the non-ML Daegeum-timbre proxy builder."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest
import wave

import numpy as np


MODULE_PATH = Path(__file__).with_name("build_timbre_audition.py")
SPEC = importlib.util.spec_from_file_location("non_ml_daegeum_timbre_test", MODULE_PATH)
assert SPEC and SPEC.loader
tool = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = tool
SPEC.loader.exec_module(tool)


RATE = 8000


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _wav(path: Path, samples: np.ndarray, *, stereo_24: bool = False) -> None:
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2 if stereo_24 else 1)
        output.setsampwidth(3 if stereo_24 else 2)
        output.setframerate(RATE)
        if stereo_24:
            values = np.rint(np.clip(samples, -1.0, 1.0) * ((1 << 23) - 1)).astype(np.int32)
            values = np.repeat(values[:, None], 2, axis=1).reshape(-1)
            unsigned = values.astype(np.uint32)
            raw = np.column_stack(
                (
                    unsigned & 0xFF,
                    (unsigned >> 8) & 0xFF,
                    (unsigned >> 16) & 0xFF,
                )
            ).astype(np.uint8).tobytes()
        else:
            raw = np.rint(np.clip(samples, -1.0, 32767.0 / 32768.0) * 32768.0).astype("<i2").tobytes()
        output.writeframes(raw)


def _canonical(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def _fixture(root: Path) -> tuple[Path, Path, Path, dict[int, Path]]:
    corpus_dir = root / "corpus"
    audio_dir = corpus_dir / "audio"
    audio_dir.mkdir(parents=True)
    entries = []
    paths: dict[int, Path] = {}
    time = np.arange(int(0.72 * RATE), dtype=np.float64) / RATE
    for sequence in range(tool.EXPECTED_FIRST_SEQUENCE, tool.EXPECTED_LAST_SEQUENCE + 1):
        ordinal = sequence - tool.EXPECTED_FIRST_SEQUENCE + 1
        # The subset deliberately has a brighter harmonic balance than the
        # flute fixture, so the static curve is non-zero without any fitting.
        samples = 0.05 * np.sin(2 * math.pi * (180 + ordinal % 7 * 20) * time)
        samples += 0.025 * np.sin(2 * math.pi * (900 + ordinal % 5 * 70) * time)
        samples *= np.minimum(1.0, time / 0.03) * np.minimum(1.0, (time[-1] - time) / 0.05)
        path = audio_dir / f"extend-{sequence:06d}.wav"
        _wav(path, samples, stereo_24=True)
        paths[sequence] = path
        digest = _sha(path)
        wav_server = f"/tmusic/05_Daegeum/Daegeum_SJ_{ordinal:03d}.wav"
        entries.append(
            {
                "extend_seq": sequence,
                "selection": {
                    "instrument_code": "EXTEND0001",
                    "instrument_name": "대금",
                    "division_exact": "대금산조",
                },
                "catalog_record": {
                    "extendSeq": sequence,
                    "extendNmKor": f"대금산조 {ordinal:02d}",
                    "instrCd": "EXTEND0001",
                    "instrDivCd": "INDV0001",
                    "division": "대금산조",
                    "wavFilePath": wav_server,
                    "mp3FilePath": wav_server.replace(".wav", ".mp3"),
                    "player": "박종현",
                    "beat": "3/4",
                    "bpm": 84,
                },
                "download": {
                    "state": "downloaded",
                    "relative_path": f"audio/{path.name}",
                    "sha256": digest,
                    "native_wav": {"sha256": digest},
                },
            }
        )
    license_evidence = {
        "catalog_page_sha256": "b" * 64,
        "catalog_page_url": "https://www.gugak.go.kr/digitaleum/front/extend/list.do",
        "notice": "공공누리 제1유형(출처표시)",
        "observed_at_utc": "2026-09-24T11:57:17Z",
    }
    corpus = {
        "schema": tool.CORPUS_SCHEMA,
        "scope": {
            "service": "National Gugak Center digital-eum extended download catalog",
            "instrument_code": "EXTEND0001",
            "instrument_name": "대금",
            "division_exact": "대금산조",
        },
        "license_evidence": license_evidence,
        "entries": entries,
    }
    corpus_path = corpus_dir / "ngc-extended-daegeum-sanjo.manifest.json"
    corpus_path.write_text(json.dumps(corpus, ensure_ascii=False), encoding="utf-8")
    rows = [
        {
            "extendSeq": e["catalog_record"]["extendSeq"],
            "wavFilePath": e["catalog_record"]["wavFilePath"],
            "mp3FilePath": e["catalog_record"]["mp3FilePath"],
        }
        for e in entries
    ]
    rows_sha = hashlib.sha256(_canonical(rows)).hexdigest()
    rights = {
        "schema": tool.RIGHTS_SCHEMA,
        "controlled_manifest_binding": {
            "manifest_basename": corpus_path.name,
            "manifest_sha256": _sha(corpus_path),
            "schema": tool.CORPUS_SCHEMA,
            "selected_count": 192,
            "extend_sequence": {"first": 1520, "last": 1711, "contiguous": True},
            "selected_catalog_row_sha256": rows_sha,
            "historical_catalog_type1_receipt": license_evidence,
        },
        "current_official_ngc_metadata": {
            "live_file_list": {
                "exact_daegeum_sanjo_row_count": 192,
                "all_controlled_192_rows_and_server_paths_match": True,
                "controlled_selected_catalog_row_sha256": rows_sha,
            }
        },
        "fail_closed_rights_decision": {
            "sample_transformation_or_non_ml_derivative_synthesis": {
                "status": "CONDITIONALLY_PERMITTED_BY_OBSERVED_TYPE1",
                "conditions": ["source attribution", "respect moral rights", "do not imply NGC endorsement"],
            },
            "ml_training_or_ml_derived_game_audio": {"status": "BLOCKED_FAIL_CLOSED"},
            "no_training_or_shipping_authorized_by_this_report": True,
            "policy_basis": "offline synthetic test",
        },
    }
    rights_path = root / "rights.json"
    rights_path.write_text(json.dumps(rights, ensure_ascii=False), encoding="utf-8")

    report_dir = root / "runtime"
    bridge_dir = report_dir / tool.FLUTE_VARIANT
    bridge_dir.mkdir(parents=True)
    bridge_time = np.arange(int(tool.RELEASE_END_SECONDS * RATE), dtype=np.float64) / RATE
    flute = 0.025 * np.sin(2 * math.pi * 440.0 * bridge_time)
    flute += 0.004 * np.sin(2 * math.pi * 880.0 * bridge_time)
    flute *= np.minimum(1.0, bridge_time / 0.04)
    release = bridge_time >= tool.ACTIVE_END_SECONDS
    flute[release] *= (tool.RELEASE_END_SECONDS - bridge_time[release]) / (
        tool.RELEASE_END_SECONDS - tool.ACTIVE_END_SECONDS
    )
    flute_path = bridge_dir / "authorial_score_bridge6.wav"
    _wav(flute_path, flute)
    report = {
        "schema": tool.FLUTE_REPORT_SCHEMA,
        "status": "succeeded",
        "scope": {
            "no_default_bgm_changed": True,
            "not_a_game_asset": True,
            "not_a_training_result": True,
            "r_and_d_only": True,
            "pretrained_weight_game_license_clearance_not_established": True,
        },
        "variants": {
            tool.FLUTE_VARIANT: {
                "audio": {
                    "relative_path": f"{tool.FLUTE_VARIANT}/{flute_path.name}",
                    "sha256": _sha(flute_path),
                },
                "post_model_authorial_release": {
                    "applied": True,
                    "start_seconds": tool.ACTIVE_END_SECONDS,
                    "end_seconds": tool.RELEASE_END_SECONDS,
                },
            }
        },
    }
    report_path = report_dir / "official_flute_rnd_report.json"
    report_path.write_text(json.dumps(report), encoding="utf-8")
    return rights_path, corpus_path, report_path, paths


class NonMlDaegeumTimbreTests(unittest.TestCase):
    def test_deterministic_pack_keeps_timeline_and_verifies_every_hash(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            rights, corpus, report, paths = _fixture(root)
            source_hashes = {sequence: _sha(path) for sequence, path in paths.items()}
            first_dir = root / "first"
            second_dir = root / "second"
            first = tool.build_timbre_audition(rights, corpus, report, first_dir)
            second = tool.build_timbre_audition(rights, corpus, report, second_dir)
            self.assertEqual(first, second)
            self.assertEqual(
                source_hashes, {sequence: _sha(path) for sequence, path in paths.items()}
            )
            self.assertEqual(
                (first_dir / tool.MANIFEST_FILENAME).read_bytes(),
                (second_dir / tool.MANIFEST_FILENAME).read_bytes(),
            )
            for filename in (tool.A_FILENAME, tool.B_FILENAME, tool.C_FILENAME):
                self.assertEqual(
                    (first_dir / filename).read_bytes(), (second_dir / filename).read_bytes()
                )
                with wave.open(str(first_dir / filename), "rb") as audio:
                    self.assertEqual(audio.getnframes(), round(tool.RELEASE_END_SECONDS * RATE))
                    self.assertEqual(audio.getframerate(), RATE)
                    self.assertEqual(audio.getnchannels(), 1)
                    self.assertEqual(audio.getsampwidth(), 2)
            self.assertNotEqual(
                (first_dir / tool.A_FILENAME).read_bytes(),
                (first_dir / tool.B_FILENAME).read_bytes(),
            )
            self.assertEqual(
                first["inputs"]["ngc_corpus"]["total_source_count"], 192
            )
            self.assertEqual(
                len(first["inputs"]["ngc_corpus"]["all_source_hash_receipts"]), 192
            )
            self.assertEqual(
                len(first["inputs"]["ngc_corpus"]["decoded_declared_subset"]),
                len(tool.DECLARED_SOURCE_SEQUENCES),
            )
            self.assertTrue(first["scope_and_warnings"]["not_trained"])
            self.assertTrue(first["scope_and_warnings"]["not_a_default_game_asset"])
            self.assertGreater(
                first["variants"]["B_ngc_spectral_envelope_proxy"]["temporal_integrity"][
                    "full_phrase_short_time_rms_envelope_correlation"
                ],
                0.95,
            )
            self.assertGreater(
                first["variants"]["C_conservative_dry_wet_proxy"]["temporal_integrity"][
                    "authorial_release_short_time_rms_envelope_correlation"
                ],
                0.95,
            )

    def test_fails_closed_on_rights_or_any_non_subset_hash_without_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            rights, corpus, report, paths = _fixture(root)
            blocked = json.loads(rights.read_text(encoding="utf-8"))
            blocked["fail_closed_rights_decision"][
                "sample_transformation_or_non_ml_derivative_synthesis"
            ]["status"] = "BLOCKED_FAIL_CLOSED"
            rights.write_text(json.dumps(blocked, ensure_ascii=False), encoding="utf-8")
            output = root / "blocked-output"
            with self.assertRaisesRegex(tool.NonMlTimbreError, "not permitted"):
                tool.build_timbre_audition(rights, corpus, report, output)
            self.assertFalse(output.exists())

            rights, corpus, report, paths = _fixture(root / "second-fixture")
            non_subset = next(
                sequence
                for sequence in sorted(paths)
                if sequence not in tool.DECLARED_SOURCE_SEQUENCES
            )
            paths[non_subset].write_bytes(paths[non_subset].read_bytes() + b"tamper")
            output = root / "tampered-output"
            with self.assertRaisesRegex(tool.NonMlTimbreError, "hash mismatch"):
                tool.build_timbre_audition(rights, corpus, report, output)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
