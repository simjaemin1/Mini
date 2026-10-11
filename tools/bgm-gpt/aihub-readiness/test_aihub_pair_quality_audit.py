"""Synthetic-only tests for private read-only WN01 pair triage."""

from __future__ import annotations

import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
import wave
import zipfile


SCRIPT = Path(__file__).with_name("aihub_pair_quality_audit.py")
PRIVATE = "PRIVATE_PERFORMER_phrase"


def _zip(members: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in members.items():
            archive.writestr(name, data)
    return buffer.getvalue()


def _tar(path: Path, source_zip: bytes) -> None:
    _tar_part(path, "VS_S.zip.part0", source_zip)


def _tar_part(path: Path, member_name: str, payload: bytes) -> None:
    with tarfile.open(path, "w") as archive:
        member = tarfile.TarInfo(member_name)
        member.size = len(payload)
        archive.addfile(member, io.BytesIO(payload))


def _label(stem: str, *, instrument: str = "WN01", seconds: float = 0.5) -> bytes:
    return json.dumps({
        "music_type_info": {"instrument_cd": instrument},
        "music_source_info": {"music_src_nm": stem, "play_time": seconds, "music_src_fmt": "wav"},
        "performer": "PRIVATE PERFORMER",
    }).encode()


def _wav(value: int = 1000, *, seconds: float = 0.5, rate: int = 48_000) -> bytes:
    sample = value.to_bytes(3, "little", signed=True)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(3)
        audio.setframerate(rate)
        audio.writeframes(sample * int(seconds * rate))
    return buffer.getvalue()


def _wav8(value: int = 255, *, seconds: float = 0.5, rate: int = 48_000) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(1)
        audio.setframerate(rate)
        audio.writeframes(bytes([value]) * int(seconds * rate))
    return buffer.getvalue()


def _midi() -> bytes:
    events = b"\x00\x90\x45\x50\x83\x60\x80\x45\x00\x00\xff\x2f\x00"
    return b"MThd\x00\x00\x00\x06\x00\x00\x00\x01\x01\xe0" + b"MTrk" + len(events).to_bytes(4, "big") + events


def _run(source: Path | list[Path], label: Path) -> subprocess.CompletedProcess[str]:
    sources = [source] if isinstance(source, Path) else source
    command = [sys.executable, str(SCRIPT)]
    for path in sources:
        command.extend(["--source-tar", str(path)])
    command.extend(["--label-zip", str(label)])
    return subprocess.run(
        command,
        capture_output=True, text=True, check=False,
    )


class PairQualityAuditTests(unittest.TestCase):
    def test_good_pcm24_midi_candidate_has_aggregate_output_only(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "source.tar"
            label = directory / "label.zip"
            _tar(source, _zip({
                f"/audio/{PRIVATE}.wav": _wav(),
                f"/score/{PRIVATE}.mid": _midi(),
            }))
            label.write_bytes(_zip({"/labels/private.json": _label(PRIVATE)}))
            before = {path.name: path.stat().st_size for path in directory.iterdir()}
            result = _run(source, label)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            report = json.loads(result.stdout)
            self.assertEqual(report["labels"]["wn01_labels"], 1)
            self.assertEqual(report["basename_matching"]["unique_wav_midi_basename"], 1)
            self.assertEqual(report["basename_matching"]["both_payloads_parsed"], 1)
            self.assertEqual(report["basename_matching"]["rough_midi_wav_duration_delta_gt_1s"], 0)
            self.assertEqual(report["wav"]["sample_rate_hz_counts"], {"48000": 1})
            self.assertEqual(report["wav"]["sample_width_bits_counts"], {"24": 1})
            self.assertEqual(report["wav"]["counts"]["duration_delta_gt_0_1s"], 0)
            self.assertEqual(report["midi"]["counts"]["note_on_total"], 1)
            self.assertEqual(report["midi"]["median_rough_duration_seconds"], 0.5)
            self.assertIn("do not prove", report["interpretation"])
            self.assertEqual(before, {path.name: path.stat().st_size for path in directory.iterdir()})
            for private in (PRIVATE, "PRIVATE PERFORMER", str(directory), "private.json"):
                self.assertNotIn(private, result.stdout)

    def test_silence_clipping_and_duration_mismatch_are_flags_not_failures(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "source.tar"
            label = directory / "label.zip"
            _tar(source, _zip({
                "audio/silent.wav": _wav(0), "score/silent.mid": _midi(),
                "audio/clipped.wav": _wav(8_388_607), "score/clipped.mid": _midi(),
            }))
            label.write_bytes(_zip({
                "silent.json": _label("silent", seconds=1.0),
                "clipped.json": _label("clipped"),
            }))
            report = json.loads(_run(source, label).stdout)
            self.assertEqual(report["basename_matching"]["unique_wav_midi_basename"], 2)
            self.assertEqual(report["wav"]["counts"]["near_silent"], 1)
            self.assertEqual(report["wav"]["counts"]["obvious_clipping"], 1)
            self.assertEqual(report["wav"]["counts"]["duration_delta_gt_0_1s"], 1)

    def test_positive_endpoint_8bit_pcm_is_flagged_as_clipped(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "source.tar"
            label = directory / "label.zip"
            _tar(source, _zip({"song.wav": _wav8(), "song.mid": _midi()}))
            label.write_bytes(_zip({"song.json": _label("song")}))
            report = json.loads(_run(source, label).stdout)
            self.assertEqual(report["wav"]["sample_width_bits_counts"], {"8": 1})
            self.assertEqual(report["wav"]["counts"]["obvious_clipping"], 1)

    def test_midi_extension_is_a_pair_and_both_extensions_are_ambiguous(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "source.tar"
            label = directory / "label.zip"
            label.write_bytes(_zip({"song.json": _label("song")}))
            for entries, expected_unique, expected_ambiguous in (
                ({"song.wav": _wav(), "song.midi": _midi()}, 1, 0),
                ({"song.wav": _wav(), "song.midi": _midi(), "song.mid": _midi()}, 0, 1),
            ):
                with self.subTest(entries=sorted(entries)):
                    _tar(source, _zip(entries))
                    report = json.loads(_run(source, label).stdout)
                    self.assertEqual(report["basename_matching"].get("unique_wav_midi_basename", 0), expected_unique)
                    self.assertEqual(report["basename_matching"].get("ambiguous_basename", 0), expected_ambiguous)

    def test_ambiguous_and_missing_basename_are_not_read(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "source.tar"
            label = directory / "label.zip"
            _tar(source, _zip({
                "one/ambiguous.wav": _wav(), "two/ambiguous.wav": _wav(),
                "one/ambiguous.mid": _midi(), "one/wavonly.wav": _wav(),
            }))
            label.write_bytes(_zip({
                "one.json": _label("ambiguous"),
                "two.json": _label("wavonly"),
                "three.json": _label("missing"),
                "four.json": _label("not_wn01", instrument="WN02"),
            }))
            report = json.loads(_run(source, label).stdout)
            self.assertEqual(report["labels"]["wn01_labels"], 3)
            self.assertEqual(report["basename_matching"]["ambiguous_basename"], 1)
            self.assertEqual(report["basename_matching"]["wav_only"], 1)
            self.assertEqual(report["basename_matching"]["neither_found"], 1)
            self.assertEqual(report["wav"]["counts"], {})

    def test_duplicate_label_stem_skips_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "source.tar"
            label = directory / "label.zip"
            _tar(source, _zip({"same.wav": _wav(), "same.mid": _midi()}))
            label.write_bytes(_zip({"one.json": _label("same"), "two.json": _label("same")}))
            report = json.loads(_run(source, label).stdout)
            self.assertEqual(report["labels"]["wn01_labels"], 2)
            self.assertEqual(report["labels"]["duplicate_label_stems"], 1)
            self.assertEqual(report["labels"]["unique_wn01_stems"], 0)
            self.assertEqual(report["basename_matching"], {})

    def test_non_wav_label_format_is_not_assumed_to_be_a_wav_pair(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "source.tar"
            label = directory / "label.zip"
            _tar(source, _zip({"song.wav": _wav(), "song.mid": _midi()}))
            document = json.loads(_label("song"))
            document["music_source_info"]["music_src_fmt"] = "mp3"
            label.write_bytes(_zip({"one.json": json.dumps(document).encode()}))
            report = json.loads(_run(source, label).stdout)
            self.assertEqual(report["labels"]["unsupported_label_source_format"], 1)
            self.assertEqual(report["labels"]["unique_wn01_stems"], 0)
            self.assertEqual(report["basename_matching"], {})

    def test_split_zip_parts_in_separate_tars_are_audited_without_reassembly_file(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            first = directory / "first.tar"
            second = directory / "second.tar"
            label = directory / "label.zip"
            source_zip = _zip({"audio/song.wav": _wav(), "score/song.mid": _midi()})
            split = len(source_zip) // 2
            _tar_part(first, "source.zip.part0", source_zip[:split])
            _tar_part(second, "source.zip.part1", source_zip[split:])
            label.write_bytes(_zip({"one.json": _label("song")}))
            before = sorted(path.name for path in directory.iterdir())
            result = _run([second, first], label)
            self.assertEqual(result.returncode, 0, result.stdout)
            report = json.loads(result.stdout)
            self.assertEqual(report["basename_matching"]["both_payloads_parsed"], 1)
            self.assertEqual(report["limits"]["max_total_payload_bytes"], 2 * 1024 ** 3)
            self.assertEqual(sorted(path.name for path in directory.iterdir()), before)

    def test_invalid_midi_is_counted_without_payload_or_name_leak(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "source.tar"
            label = directory / "label.zip"
            _tar(source, _zip({f"{PRIVATE}.wav": _wav(), f"{PRIVATE}.mid": b"MThd PRIVATE MIDI"}))
            label.write_bytes(_zip({"private.json": _label(PRIVATE)}))
            result = _run(source, label)
            self.assertEqual(result.returncode, 0)
            report = json.loads(result.stdout)
            self.assertEqual(report["wav"]["counts"]["parsed"], 1)
            self.assertEqual(report["midi"]["counts"]["invalid_midi"], 1)
            self.assertNotIn(PRIVATE, result.stdout)

    def test_unsafe_source_and_relative_input_rejected_without_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "source.tar"
            label = directory / "label.zip"
            _tar(source, _zip({"../PRIVATE_ESCAPE.wav": _wav()}))
            label.write_bytes(_zip({"one.json": _label("PRIVATE_ESCAPE")}))
            result = _run(source, label)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(json.loads(result.stdout)["code"], "unsafe_zip_member")
            self.assertNotIn("PRIVATE_ESCAPE", result.stdout)
            relative = _run(Path("private-source.tar"), label)
            self.assertEqual(relative.returncode, 2)
            self.assertEqual(json.loads(relative.stdout)["code"], "expected_absolute_regular_file")
            self.assertNotIn("private-source.tar", relative.stdout)


if __name__ == "__main__":
    unittest.main()
