"""Synthetic TRAIN inventory tests; no real archive, WAV, model or GPU."""
import copy
import base64
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zlib
from unittest.mock import patch

import build_note_inventory as inventory
from test_parse_midi import event, track, smf


def fixture():
    train = [dict(output_file=f"train_{i:03}.wav", source_stem=f"MIDI_T_{i:03}", song_index=i % 15 + 1, output_sha256="a" * 64) for i in range(216)]
    held = [dict(output_file=f"held_{i:03}.wav", source_stem=f"MIDI_H_{i:03}", song_index=i % 4 + 16, output_sha256="b" * 64) for i in range(34)]
    records = []
    for index, row in enumerate(train):
        records.append(row)
        if index < len(held): records.append(held[index])
    manifest = dict(schema="mini.aihub-71470-private-audio-prep.v1", split="training", cluster_id="C001", records=records)
    split = dict(schema="mini.aihub-71470-ddsp-song-split.v1", status="materialized", cluster_id="C001",
        training_files=[r["output_file"] for r in reversed(train)], heldout_files=[r["output_file"] for r in held],
        training_wavs=216, heldout_wavs=34, training_song_groups=15, heldout_song_indices=[16, 17, 18, 19],
        source_manifest_sha256="bound-manifest")
    return manifest, split, train


class NoteInventoryTests(unittest.TestCase):
    def test_all216_training_original_order_not_first_per_title_and_heldout_untouched(self):
        manifest, split, expected = fixture()
        before = copy.deepcopy((manifest, split))
        actual = inventory.choose_all_training(manifest, split, "bound-manifest")
        self.assertEqual(actual, expected)
        self.assertEqual(len({r["song_index"] for r in actual}), 15)
        self.assertEqual((manifest, split), before)
        self.assertFalse(set(r["output_file"] for r in actual) & set(split["heldout_files"]))

    def test_changed_bound_split_counts_heldout_leak_or_declared_SHA_rejected(self):
        for bad in ("hash", "count", "groups", "leak", "declared_SHA"):
            manifest, split, _ = fixture()
            if bad == "hash": split["source_manifest_sha256"] = "changed"
            if bad == "count": split["training_wavs"] = 215
            if bad == "groups": split["training_song_groups"] = 14
            if bad == "leak": split["heldout_files"][0] = split["training_files"][0]
            if bad == "declared_SHA": manifest["records"][0]["output_sha256"] = "not-a-sha"
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                inventory.choose_all_training(manifest, split, "bound-manifest")

    def test_compact_all_parser_fields_reconstruct_exactly_and_new_field_not_silently_lost(self):
        raw = smf(track([event(0, b"\x90\x3c\x40"), event(120, b"\x90\x40\x40"),
            event(120, b"\x80\x3c\x32"), event(120, b"\x80\x40\x28"), event(0, b"\xb0\x40\x7f"),
            event(0, b"\xe0\x00\x50"), event(0, b"\x90\x43\x40")]))
        parsed = inventory.audit.parse_midi.parse_midi(raw)
        rows = inventory.compact_notes(parsed)
        rebuilt = [dict(zip(inventory.NOTE_COLUMNS, row)) for row in rows]
        self.assertEqual(rebuilt, parsed["notes"])
        self.assertIsNone(rebuilt[-1]["end_seconds"])
        self.assertEqual(len(parsed["sustain_events"]), 1)
        self.assertEqual(len(parsed["pitch_bend_events"]), 1)
        self.assertGreater(len(parsed["warnings"]), 0)
        parsed["notes"][0]["new_unhandled_field"] = True
        with self.assertRaisesRegex(ValueError, "silent_field_loss"):
            inventory.compact_notes(parsed)

    def test_complete_metadata_only_report_retains_refusal_and_reads_zero_WAVs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest, split, selected = fixture()
            manifest_path, split_path = root / "manifest.json", root / "split.json"
            manifest_path.write_text(json.dumps(manifest))
            split["source_manifest_sha256"] = inventory.audit.sha256(manifest_path)
            split_path.write_text(json.dumps(split))
            source_tar = root / "TS_synthetic.tar"; source_tar.write_bytes(b"stub only")
            raw = smf(track([event(0, b"\x90\x3c\x40"), event(480, b"\x80\x3c\x20")]))
            before = {path: path.read_bytes() for path in root.iterdir()}
            def read_midis(path, rows):
                self.assertEqual(rows, selected)
                for index, record in enumerate(rows):
                    payload = b"bad MIDI fixed case" if index == 7 else raw
                    yield record, payload, dict(member=record["source_stem"] + ".mid", bytes=len(payload),
                        sha256=hashlib.sha256(payload).hexdigest(), complete_member_CRC_checked=True)
            with patch.object(inventory.audit, "read_midis", side_effect=read_midis), \
                    patch.object(inventory.audit, "read_audio", side_effect=AssertionError("must not read WAV")), \
                    patch.object(inventory.audit.acoustic, "extract_features", side_effect=AssertionError("must not extract")):
                report = inventory.build(manifest_path, split_path, source_tar)
            self.assertEqual(report["training_files_read"], 216)
            self.assertEqual(report["heldout_files_read"], 0)
            self.assertEqual(len(report["cases"]), 216)
            self.assertEqual(report["cases"][7]["status"], "MIDI_parse_refused_case_preserved")
            self.assertEqual(report["totals"]["parsed_files"], 215)
            self.assertEqual(report["totals"]["parse_refused_files"], 1)
            self.assertEqual(report["totals"]["paired_note_count"], 215)
            self.assertEqual(sum(r["files"] for r in report["by_song_index"]), 216)
            first = report["cases"][0]
            metadata = dict(report["shared_parser_metadata"], **first["parsed_metadata"])
            metadata["notes"] = [dict(zip(report["note_columns"], row)) for row in first["note_rows"]]
            self.assertEqual(metadata, inventory.audit.parse_midi.parse_midi(raw))
            self.assertFalse(report["prepared_WAV_hashes_independently_reverified_this_phase"])
            self.assertEqual(report["aligned_training_pairs_approved"], 0)
            self.assertEqual({path: path.read_bytes() for path in root.iterdir()}, before)
            self.assertLess(len(inventory.encoded_report(report).encode()), 1_000_000)
            self.assertEqual(inventory.decode_report(inventory.encoded_report(report)), report)
            self.assertTrue(all(isinstance(value, str) for value in report["source_tar_identity_before_after"].values()))

    def test_complete_report_size_refuses_instead_of_dropping_notes(self):
        report = dict(schema=inventory.DECODED_SCHEMA, notes=[[1, 2, 3]])
        with patch.object(inventory, "MAX_REPORT_BYTES", 8), self.assertRaisesRegex(ValueError, "no_notes_dropped"):
            inventory.encoded_report(report)
        with patch.object(inventory, "MAX_DECODED_BYTES", 8), self.assertRaisesRegex(ValueError, "no_notes_dropped"):
            inventory.encoded_report(report)

    def test_lossless_pack_roundtrip_all_fields_unicode_zero_None_large_timestamp(self):
        report = dict(schema=inventory.DECODED_SCHEMA, note_columns=inventory.NOTE_COLUMNS,
            note_rows=[[0, None, 0., None, 0, 0, 60, 0, "unmatched_note_on", None, 0, None, None]],
            metadata={"원래": "악보", "bool": False, "mtime_ns": 1793800000000000129},
            nested=[{"pedal": 0, "bend": 8192, "warnings": []}])
        payload = inventory.encoded_report(report)
        envelope = json.loads(payload)
        self.assertEqual(envelope["schema"], inventory.PACKED_SCHEMA)
        self.assertEqual(envelope["compression"], "zlib/base64")
        self.assertEqual(inventory.decode_report(payload + "\n"), report)
        raw = zlib.decompress(base64.b64decode(envelope["payload_base64"], validate=True))
        self.assertEqual(envelope["decoded_bytes"], len(raw))
        self.assertEqual(envelope["decoded_sha256"], hashlib.sha256(raw).hexdigest())

    def test_bad_envelope_SHA_base64_zlib_truncation_trailing_and_schema_rejected(self):
        original = json.loads(inventory.encoded_report(dict(schema=inventory.DECODED_SCHEMA, notes=[])))
        compressed = base64.b64decode(original["payload_base64"])
        changes = [("schema", "wrong"), ("decoded_schema", "wrong"), ("compression", "wrong"),
            ("decoded_bytes", True), ("decoded_bytes", 8_000_001), ("decoded_sha256", "0" * 64),
            ("payload_base64", "%%%"), ("payload_base64", base64.b64encode(b"bad zlib").decode()),
            ("payload_base64", base64.b64encode(compressed[:-1]).decode()),
            ("payload_base64", base64.b64encode(compressed + b"trailing").decode()),
            ("payload_base64", base64.b64encode(compressed + compressed).decode())]
        for key, value in changes:
            with self.subTest(key=key, value=str(value)[:20]), self.assertRaises(ValueError):
                inventory.decode_report(json.dumps({**original, key: value}))
        raw = b'{"schema":"wrong"}'
        changed = {**original, "decoded_bytes": len(raw), "decoded_sha256": hashlib.sha256(raw).hexdigest(),
            "payload_base64": base64.b64encode(zlib.compress(raw)).decode()}
        with self.assertRaisesRegex(ValueError, "decoded_nominal"):
            inventory.decode_report(json.dumps(changed))

    def test_expansion_bounded_before_full_decompress_and_stdout_limit_includes_newline(self):
        raw = b"x" * 10001
        envelope = dict(schema=inventory.PACKED_SCHEMA, decoded_schema=inventory.DECODED_SCHEMA,
            decoded_bytes=1000, decoded_sha256=hashlib.sha256(raw).hexdigest(), compression="zlib/base64",
            payload_base64=base64.b64encode(zlib.compress(raw)).decode())
        with patch.object(inventory, "MAX_DECODED_BYTES", 1000), self.assertRaisesRegex(ValueError, "complete_zlib"):
            inventory.decode_report(json.dumps(envelope))
        report = dict(schema=inventory.DECODED_SCHEMA, notes=[])
        payload = inventory.encoded_report(report)
        with patch.object(inventory, "MAX_REPORT_BYTES", len(payload.encode())), self.assertRaisesRegex(ValueError, "no_notes_dropped"):
            inventory.encoded_report(report)
        with patch.object(inventory, "MAX_REPORT_BYTES", 8), self.assertRaisesRegex(ValueError, "bounded_one_MB"):
            inventory.decode_report(payload)


if __name__ == "__main__":
    unittest.main()
