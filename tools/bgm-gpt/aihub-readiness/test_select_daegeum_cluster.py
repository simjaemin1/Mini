"""Synthetic-only checks for private WN01 metadata cluster selection."""

from __future__ import annotations

import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile


SCRIPT = Path(__file__).with_name("select_daegeum_cluster.py")
PRIVATE_PERFORMER = "SECRET_PLAYER_황"
PRIVATE_PLACE = "SECRET_PLACE_연습실"
PRIVATE_TITLE = "SECRET_SONG_가락"
PRIVATE_STEM = "SECRET_AUDIO_STEM_001"


def _label(stem: str, *, instrument: str = "WN01", performer: str = PRIVATE_PERFORMER,
           place: str = PRIVATE_PLACE, channel: str | int = "1", title: str = PRIVATE_TITLE,
           duration: float = 10.0, rate: int = 48_000, bit_depth: int = 24,
           tonguing: object = None) -> bytes:
    document = {
        "music_type_info": {"instrument_cd": instrument, "main_instr_player": performer},
        "get_info": {"get_place": place},
        "music_source_info": {
            "channel": channel,
            "music_src_nm": stem,
            "music_src_fmt": "wav",
            "play_time": duration,
            "samplingRate": rate,
            "bitDepth": bit_depth,
            "music_nm_kor": title,
        },
    }
    if tonguing is not None:
        document["annotation_data_info"] = {"single_tonguing_cd": tonguing}
    return json.dumps(document, ensure_ascii=False).encode("utf-8")


def _zip(path: Path, members: dict[str, bytes]) -> None:
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, raw in members.items():
            archive.writestr(name, raw)


def _run(label: Path, *, split: str = "training", output: Path | None = None) -> subprocess.CompletedProcess[str]:
    command = [sys.executable, str(SCRIPT), "--label-zip", str(label), "--split", split]
    if output is not None:
        command.extend(("--output", str(output)))
    return subprocess.run(command, capture_output=True, text=True, check=False)


class ClusterSelectorTests(unittest.TestCase):
    def test_ranked_private_song_groups_and_aggregate_stdout(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            label = directory / "label.zip"
            manifest_path = directory / "private-manifest.json"
            _zip(label, {
                "/labels/a.json": _label(PRIVATE_STEM, duration=12.0,
                                         tonguing={"time": "0.100-0.200"}),
                "/labels/b.json": _label("SECRET_AUDIO_STEM_002", duration=9.0),
                "/labels/c.json": _label("another_stem", performer="OTHER_PRIVATE_PLAYER",
                                          duration=20.0, title="OTHER_PRIVATE_TITLE"),
                "/labels/d.json": _label("not_wind", instrument="WN02", duration=500.0),
            })
            result = _run(label, output=manifest_path)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            summary = json.loads(result.stdout)
            self.assertEqual(summary["counts"]["wn01_labels"], 3)
            self.assertEqual(summary["counts"]["candidate_records"], 3)
            self.assertEqual(summary["ranked_clusters"], 2)
            self.assertEqual(summary["top_clusters"][0]["records"], 2)
            self.assertEqual(summary["top_clusters"][0]["total_seconds"], 21.0)
            self.assertEqual(summary["top_clusters"][0]["with_optional_tonguing_label"], 1)
            self.assertEqual(stat.S_IMODE(manifest_path.stat().st_mode), 0o600)
            manifest = json.loads(manifest_path.read_text())
            self.assertEqual(manifest["schema"], "mini.aihub-71470-daegeum-clusters.v1")
            self.assertEqual(manifest["split"], "training")
            self.assertEqual(manifest["clusters"][0]["performer"], PRIVATE_PERFORMER)
            self.assertEqual(manifest["clusters"][0]["place"], PRIVATE_PLACE)
            self.assertEqual(manifest["clusters"][0]["channel"], "1")
            self.assertEqual(manifest["clusters"][0]["songs"][0]["title"], PRIVATE_TITLE)
            records = manifest["clusters"][0]["songs"][0]["records"]
            self.assertEqual([record["stem"] for record in records],
                             [PRIVATE_STEM, "SECRET_AUDIO_STEM_002"])
            self.assertEqual(records[0]["source_format"], "wav")
            self.assertEqual(records[0]["sample_rate_hz"], 48_000)
            self.assertEqual(records[0]["bit_depth"], 24)
            for private in (PRIVATE_PERFORMER, PRIVATE_PLACE, PRIVATE_TITLE, PRIVATE_STEM,
                            "OTHER_PRIVATE_PLAYER", str(directory), "label.zip"):
                self.assertNotIn(private, result.stdout + result.stderr)

    def test_duplicate_stems_are_removed_from_all_clusters(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            label = directory / "label.zip"
            _zip(label, {
                "a.json": _label("same", duration=10),
                "b.json": _label("same", duration=12, performer="OTHER"),
                "c.json": _label("unique", duration=3),
            })
            summary = json.loads(_run(label).stdout)
            self.assertEqual(summary["counts"]["duplicate_stem_values"], 1)
            self.assertEqual(summary["counts"]["duplicate_stem_records_removed"], 2)
            self.assertEqual(summary["counts"]["candidate_records"], 1)
            self.assertEqual(summary["top_clusters"][0]["total_seconds"], 3.0)

    def test_cross_instrument_duplicate_stem_is_not_assumed_solo(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            label = directory / "label.zip"
            _zip(label, {
                "wind.json": _label("shared", instrument="WN01"),
                "other.json": _label("SHARED", instrument="WN02"),
                "unique.json": _label("wind_only", instrument="WN01"),
            })
            summary = json.loads(_run(label).stdout)
            self.assertEqual(summary["counts"]["duplicate_stem_values"], 1)
            self.assertEqual(summary["counts"]["duplicate_stem_records_removed"], 1)
            self.assertEqual(summary["counts"]["candidate_records"], 1)

    def test_invalid_metadata_does_not_silently_enter_training_cluster(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            label = directory / "label.zip"
            empty_performer = json.loads(_label("a"))
            empty_performer["music_type_info"]["main_instr_player"] = ""
            unsafe_stem = json.loads(_label("b"))
            unsafe_stem["music_source_info"]["music_src_nm"] = "../private.wav"
            bad_rate = json.loads(_label("c"))
            bad_rate["music_source_info"]["samplingRate"] = 0
            bad_duration = json.loads(_label("d"))
            bad_duration["music_source_info"]["play_time"] = "nan"
            _zip(label, {
                "a.json": json.dumps(empty_performer).encode(),
                "b.json": json.dumps(unsafe_stem).encode(),
                "c.json": json.dumps(bad_rate).encode(),
                "d.json": json.dumps(bad_duration).encode(),
                "e.json": _label("good"),
            })
            summary = json.loads(_run(label).stdout)
            self.assertEqual(summary["counts"]["candidate_records"], 1)
            self.assertEqual(summary["counts"]["incomplete_cluster_key"], 1)
            self.assertEqual(summary["counts"]["invalid_stem"], 1)
            self.assertEqual(summary["counts"]["invalid_audio_format_metadata"], 1)
            self.assertEqual(summary["counts"]["invalid_duration"], 1)

    def test_unsafe_or_duplicate_archive_members_fail_without_manifest(self) -> None:
        for members in (
            {"/labels/good.json": _label("good"), "../escape.json": _label("bad")},
            {"/labels/same.json": _label("first"), "labels/same.json": _label("second")},
        ):
            with self.subTest(members=list(members)):
                with tempfile.TemporaryDirectory() as temporary:
                    directory = Path(temporary)
                    label = directory / "label.zip"
                    output = directory / "manifest.json"
                    _zip(label, members)
                    result = _run(label, output=output)
                    self.assertEqual(result.returncode, 2)
                    self.assertFalse(output.exists())
                    self.assertEqual(json.loads(result.stdout)["status"], "error")
                    self.assertNotIn("good", result.stdout + result.stderr)
                    self.assertNotIn("first", result.stdout + result.stderr)

    def test_no_overwrite_and_no_repository_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            label = directory / "label.zip"
            output = directory / "manifest.json"
            _zip(label, {"one.json": _label("one")})
            output.write_text("DO NOT REPLACE")
            result = _run(label, output=output)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(output.read_text(), "DO NOT REPLACE")
            self.assertEqual(json.loads(result.stdout)["code"], "output_exists")
            forbidden = SCRIPT.parent / "do-not-write-private-manifest.json"
            result = _run(label, output=forbidden)
            self.assertEqual(result.returncode, 2)
            self.assertFalse(forbidden.exists())
            self.assertEqual(json.loads(result.stdout)["code"], "output_not_private_directory")

    def test_validation_split_is_explicit_in_private_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            label = directory / "label.zip"
            output = directory / "manifest.json"
            _zip(label, {"one.json": _label("one")})
            result = _run(label, split="validation", output=output)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stdout)["split"], "validation")
            self.assertEqual(json.loads(output.read_text())["split"], "validation")

    def test_canonical_archive_name_cannot_claim_opposite_split(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            label = directory / "VL_R_validation.zip"
            output = directory / "manifest.json"
            _zip(label, {"one.json": _label("one")})
            result = _run(label, split="training", output=output)
            self.assertEqual(json.loads(result.stdout)["code"], "label_archive_split_mismatch")
            self.assertFalse(output.exists())

    def test_duplicate_json_key_fails_closed_without_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            label = directory / "label.zip"
            output = directory / "manifest.json"
            duplicate_key = _label("one").decode().replace(
                '"instrument_cd": "WN01"',
                '"instrument_cd": "WN01", "instrument_cd": "WN02"',
            )
            _zip(label, {"one.json": duplicate_key.encode()})
            result = _run(label, output=output)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(json.loads(result.stdout)["code"], "duplicate_json_key")
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
