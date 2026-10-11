"""Synthetic-only tests for read-only AI Hub source TAR structural inspection."""

from __future__ import annotations

import io
import json
from pathlib import Path
import struct
import subprocess
import sys
import tarfile
import tempfile
import unittest
import warnings
import zipfile


SCRIPT = Path(__file__).with_name("inspect_source_tar.py")


def zip_bytes(members: dict[str, bytes]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, payload in members.items():
            archive.writestr(name, payload)
    return output.getvalue()


def write_tar(path: Path, members: list[tuple[str, bytes, bytes | None]]) -> None:
    with tarfile.open(path, "w") as archive:
        for name, payload, kind in members:
            info = tarfile.TarInfo(name)
            info.type = kind or tarfile.REGTYPE
            info.size = len(payload) if info.isfile() else 0
            archive.addfile(info, io.BytesIO(payload) if info.isfile() else None)


def run_inspector(source: Path | list[Path], label: Path | None = None) -> subprocess.CompletedProcess[str]:
    sources = [source] if isinstance(source, Path) else source
    command = [sys.executable, str(SCRIPT)]
    for path in sources:
        command.extend(["--tar", str(path)])
    if label is not None:
        command.extend(["--label-zip", str(label)])
    return subprocess.run(command, capture_output=True, text=True, check=False)


class InspectSourceTarTests(unittest.TestCase):
    def test_byte_offset_suffixes_across_tars_require_exact_cumulative_sizes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            first = directory / "offset-zero.tar"
            second = directory / "offset-next.tar"
            payload = zip_bytes({"nested/song.wav": b"sound", "nested/song.mid": b"score"})
            cut = len(payload) // 2
            self.assertGreater(cut, 1)
            write_tar(first, [("source.zip.part0", payload[:cut], None)])
            write_tar(second, [(f"source.zip.part{cut}", payload[cut:], None)])
            result = run_inspector([second, first])
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            report = json.loads(result.stdout)
            self.assertEqual(report["zip_part_numbering"], "byte_offset")
            self.assertEqual([part["part_number"] for part in report["parts"]], [0, cut])
            self.assertEqual([part["part_index"] for part in report["parts"]], [0, 1])
            self.assertEqual(report["zip"]["members"], 2)

            write_tar(second, [(f"source.zip.part{cut + 1}", payload[cut:], None)])
            result = run_inspector([first, second])
            self.assertEqual(result.returncode, 2)
            self.assertEqual(json.loads(result.stdout)["code"], "missing_zip_part")

    def test_numeric_suffix_is_bounded_before_integer_conversion(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source.tar"
            write_tar(source, [("source.zip.part" + "9" * 1000, b"x", None)])
            result = run_inspector(source)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(json.loads(result.stdout)["code"], "zip_part_limit")

    def test_split_parts_across_separate_tars_are_read_without_copying(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            first = directory / "part-zero.tar"
            second = directory / "part-one.tar"
            payload = zip_bytes({"nested/song.wav": b"sound", "nested/song.mid": b"score"})
            cut = len(payload) // 2
            write_tar(first, [("source.zip.part0", payload[:cut], None)])
            write_tar(second, [("source.zip.part1", payload[cut:], None)])
            result = run_inspector([second, first])
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            report = json.loads(result.stdout)
            self.assertEqual(report["tar_members"], 2)
            self.assertEqual(report["zip"]["members"], 2)
            self.assertEqual([part["tar_index"] for part in report["parts"]], [1, 0])
            self.assertEqual(sorted(p.name for p in directory.iterdir()), ["part-one.tar", "part-zero.tar"])

    def test_bounded_zip64_end_record_is_supported(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source.tar"
            ordinary = zip_bytes({"song.wav": b"audio"})
            end = ordinary.rfind(b"PK\x05\x06")
            self.assertGreater(end, 0)
            _, disk, cd_disk, disk_entries, entries, cd_size, cd_offset, comment = struct.unpack_from(
                "<4sHHHHIIH", ordinary, end
            )
            self.assertEqual((disk, cd_disk, comment), (0, 0, 0))
            zip64 = struct.pack(
                "<4sQHHIIQQQQ", b"PK\x06\x06", 44, 45, 45, 0, 0,
                disk_entries, entries, cd_size, cd_offset,
            )
            locator = struct.pack("<4sIQI", b"PK\x06\x07", 0, end, 1)
            classic_end = struct.pack(
                "<4sHHHHIIH", b"PK\x05\x06", 0, 0, 0xFFFF, 0xFFFF,
                0xFFFFFFFF, 0xFFFFFFFF, 0,
            )
            payload = ordinary[:end] + zip64 + locator + classic_end
            write_tar(source, [("source.zip.part0", payload, None)])
            result = run_inspector(source)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertEqual(json.loads(result.stdout)["zip"]["members"], 1)

    def test_zip64_multidisk_and_oversized_central_directory_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source.tar"
            ordinary = zip_bytes({"song.wav": b"audio"})
            end = ordinary.rfind(b"PK\x05\x06")
            _, _, _, disk_entries, entries, cd_size, cd_offset, _ = struct.unpack_from(
                "<4sHHHHIIH", ordinary, end
            )
            zip64 = struct.pack(
                "<4sQHHIIQQQQ", b"PK\x06\x06", 44, 45, 45, 0, 0,
                disk_entries, entries, cd_size, cd_offset,
            )
            invalid_locator = struct.pack("<4sIQI", b"PK\x06\x07", 0, end, 2)
            sentinel_end = struct.pack(
                "<4sHHHHIIH", b"PK\x05\x06", 0, 0, 0xFFFF, 0xFFFF,
                0xFFFFFFFF, 0xFFFFFFFF, 0,
            )
            write_tar(source, [("source.zip.part0", ordinary[:end] + zip64 + invalid_locator + sentinel_end, None)])
            result = run_inspector(source)
            self.assertEqual(json.loads(result.stdout)["code"], "multidisk_or_invalid_zip64")

            oversized_directory = bytearray(ordinary)
            struct.pack_into("<I", oversized_directory, end + 12, 16 * 1024**2 + 1)
            write_tar(source, [("source.zip.part0", bytes(oversized_directory), None)])
            result = run_inspector(source)
            self.assertEqual(json.loads(result.stdout)["code"], "zip_directory_limit")

            extended_zip64 = bytearray(zip64)
            struct.pack_into("<Q", extended_zip64, 4, 45)
            write_tar(source, [("source.zip.part0", ordinary[:end] + extended_zip64 + b"x" +
                                struct.pack("<4sIQI", b"PK\x06\x07", 0, end, 1) + sentinel_end, None)])
            result = run_inspector(source)
            self.assertEqual(json.loads(result.stdout)["code"], "zip64_end_record_invalid")

    def test_wn01_extensionless_stems_link_wav_and_mid_separately(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            source = directory / "source.tar"
            label = directory / "label.zip"
            write_tar(source, [("source.zip.part0", zip_bytes({
                "sources/a/ABCDEFGHIJKL.wav": b"audio a",
                "sources/a/ABCDEFGHIJKL.mid": b"score a",
                "sources/b/MNOPQRSTUVWX.wav": b"audio b",
                "sources/c/ZZZZZZZZZZZZ.wav": b"non WN01",
            }), None)])
            label.write_bytes(zip_bytes({
                "one.json": json.dumps({
                    "music_source_info": {"music_src_nm": "ABCDEFGHIJKL", "music_src_fmt": "wav"},
                    "instrument": {"instrument_cd": "WN01"},
                }).encode(),
                "two.json": json.dumps({
                    "music_source_info": {"music_src_nm": "MNOPQRSTUVWX", "music_src_fmt": "wav"},
                    "instrument": {"instrument_cd": "WN01"},
                }).encode(),
                "three.json": json.dumps({
                    "music_source_info": {"music_src_nm": "ZZZZZZZZZZZZ", "music_src_fmt": "wav"},
                    "instrument": {"instrument_cd": "ZZ99"},
                }).encode(),
            }))
            result = run_inspector(source, label)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            report = json.loads(result.stdout)
            self.assertEqual(report["label"]["wn01_label_documents"], 2)
            self.assertEqual(report["label"]["wn01_documents_with_valid_wav_stem"], 2)
            self.assertEqual(report["wn01_pair_linkage"]["unique_wn01_stems"], 2)
            self.assertEqual(report["wn01_pair_linkage"]["both_wav_and_mid_uniquely_named"], 1)
            self.assertEqual(report["wn01_pair_linkage"]["mid_name_status"], {
                "missing": 1, "unique_basename": 1,
            })
            self.assertNotIn("ABCDEFGHIJKL", result.stdout)

    def test_midi_extension_is_accepted_but_two_score_extensions_are_ambiguous(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            source = directory / "source.tar"
            label = directory / "label.zip"
            label.write_bytes(zip_bytes({"one.json": json.dumps({
                "music_type_info": {"instrument_cd": "WN01"},
                "music_source_info": {"music_src_nm": "song", "music_src_fmt": "wav"},
            }).encode()}))
            for members, linked, ambiguous in (
                ({"song.wav": b"a", "song.midi": b"b"}, 1, 0),
                ({"song.wav": b"a", "song.midi": b"b", "song.mid": b"c"}, 0, 1),
            ):
                with self.subTest(members=sorted(members)):
                    write_tar(source, [("source.zip.part0", zip_bytes(members), None)])
                    report = json.loads(run_inspector(source, label).stdout)
                    self.assertEqual(report["wn01_pair_linkage"]["both_wav_and_mid_uniquely_named"], linked)
                    self.assertEqual(report["wn01_pair_linkage"]["mid_name_status"].get("ambiguous_basename", 0), ambiguous)

    def test_private_extension_is_bucketed_without_leaking_name(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source.tar"
            write_tar(source, [("source.zip.part0", zip_bytes({
                "song.PRIVATE_PERSON": b"secret", "song.wav": b"audio",
            }), None)])
            result = run_inspector(source)
            self.assertEqual(result.returncode, 0)
            report = json.loads(result.stdout)
            self.assertEqual(report["zip"]["file_suffix_counts"], {"(other)": 1, ".wav": 1})
            self.assertNotIn("PRIVATE_PERSON", result.stdout)

    def test_very_long_part_number_returns_fixed_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source.tar"
            write_tar(source, [("source.zip.part" + "9" * 5000, b"invalid", None)])
            result = run_inspector(source)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(json.loads(result.stdout)["code"], "zip_part_limit")
            self.assertEqual(result.stderr, "")

    def test_single_part_zip_structure_and_filename_links_without_name_leaks(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            source = directory / "source.tar"
            label = directory / "label.zip"
            audio = b"RIFF private audio bytes"
            midi = b"MThd private score bytes"
            payload = zip_bytes({
                "/sources/audio/phrase.wav": audio,
                "/sources/score/phrase.mid": midi,
                "/sources/audio/other.wav": b"second audio",
            })
            write_tar(source, [("VS_S.zip.part0", payload, None)])
            label.write_bytes(zip_bytes({
                "/labels/one.json": json.dumps({
                    "music_src_file_name": "phrase.wav",
                    "music_score_file_name": "/sources/score/phrase.mid",
                    "missing_file_name": "missing.wav",
                }).encode(),
            }))
            before = sorted(p.name for p in directory.iterdir())
            result = run_inspector(source, label)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            report = json.loads(result.stdout)
            self.assertEqual(report["tar_members"], 1)
            self.assertEqual(report["parts"][0]["part_number"], 0)
            self.assertEqual(report["zip"]["members"], 3)
            self.assertEqual(report["zip"]["file_suffix_counts"], {".mid": 1, ".wav": 2})
            self.assertEqual(report["filename_linkage"]["exact_path"], 1)
            self.assertEqual(report["filename_linkage"]["unique_basename"], 1)
            self.assertEqual(report["filename_linkage"]["missing"], 1)
            self.assertEqual(before, sorted(p.name for p in directory.iterdir()))
            for private in ("phrase.wav", "phrase.mid", "missing.wav", "private audio bytes", str(directory)):
                self.assertNotIn(private, result.stdout)

    def test_contiguous_split_parts_read_as_one_zip_without_reassembly_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            source = directory / "source.tar"
            payload = zip_bytes({"nested/song.wav": b"x" * 500, "nested/song.mid": b"midi"})
            cut = len(payload) // 2
            write_tar(source, [
                ("source.zip.part1", payload[cut:], None),
                ("source.zip.part0", payload[:cut], None),
            ])
            result = run_inspector(source)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            report = json.loads(result.stdout)
            self.assertEqual([part["part_number"] for part in report["parts"]], [0, 1])
            self.assertEqual(report["zip"]["members"], 2)
            self.assertEqual(sorted(p.name for p in directory.iterdir()), ["source.tar"])

    def test_unsafe_tar_members_and_missing_part_rejected(self) -> None:
        cases = (
            ([("../bad.zip.part0", b"x", None)], "unsafe_tar_member"),
            ([("bad.zip.part0", b"x", tarfile.SYMTYPE)], "unsafe_tar_member"),
            ([("bad.zip.part1", b"x", None)], "missing_zip_part"),
            ([("a.zip.part0", b"x", None), ("b.zip.part1", b"y", None)], "mixed_or_duplicate_zip_parts"),
        )
        for members, expected in cases:
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as temp:
                source = Path(temp) / "source.tar"
                write_tar(source, members)
                result = run_inspector(source)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(json.loads(result.stdout)["code"], expected)
                self.assertNotIn("bad.zip", result.stdout)

    def test_unsafe_zip_name_or_duplicate_name_rejected(self) -> None:
        for members, expected in (
            ({"../escape.wav": b"audio"}, "unsafe_zip_member"),
            ({"//absolute.wav": b"audio"}, "unsafe_zip_member"),
            ({"a\\b.wav": b"audio"}, "unsafe_zip_member"),
        ):
            with self.subTest(members=members), tempfile.TemporaryDirectory() as temp:
                source = Path(temp) / "source.tar"
                write_tar(source, [("source.zip.part0", zip_bytes(members), None)])
                result = run_inspector(source)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(json.loads(result.stdout)["code"], expected)
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source.tar"
            buffer = io.BytesIO()
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                with zipfile.ZipFile(buffer, "w") as archive:
                    archive.writestr("same.wav", b"a")
                    archive.writestr("same.wav", b"b")
            write_tar(source, [("source.zip.part0", buffer.getvalue(), None)])
            result = run_inspector(source)
            self.assertEqual(json.loads(result.stdout)["code"], "duplicate_zip_member")

    def test_label_json_is_bounded_and_not_represented_as_training_alignment(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            source = directory / "source.tar"
            label = directory / "label.zip"
            write_tar(source, [("source.zip.part0", zip_bytes({"a.wav": b"audio"}), None)])
            label.write_bytes(zip_bytes({"a.json": b"{not json"}))
            result = run_inspector(source, label)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(json.loads(result.stdout)["code"], "invalid_or_unreadable_label_zip")
            self.assertNotIn("not json", result.stdout)

    def test_zip_end_record_and_nonregular_source_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            source = directory / "source.tar"
            write_tar(source, [("source.zip.part0", b"not a ZIP", None)])
            result = run_inspector(source)
            self.assertEqual(json.loads(result.stdout)["code"], "zip_end_record_missing")
            source.unlink()
            source.symlink_to(directory / "other.tar")
            result = run_inspector(source)
            self.assertEqual(json.loads(result.stdout)["code"], "expected_absolute_regular_file")


if __name__ == "__main__":
    unittest.main()
