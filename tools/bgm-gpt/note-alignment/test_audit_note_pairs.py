"""Synthetic private-pair selection/read-only IO tests; no real data/models."""
from contextlib import contextmanager
import copy
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
import wave
import zipfile
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_note_pairs as audit


def fixture():
    records = [dict(output_file=f"sample_{i:03}.wav", source_stem=f"AP_E01_{i:05}", song_index=i)
               for i in range(1, 10)]
    heldout = [r["output_file"] for r in records if r["song_index"] in (4, 6)]
    train = [r["output_file"] for r in records if r["output_file"] not in heldout]
    manifest = dict(schema="mini.aihub-71470-private-audio-prep.v1", split="training", cluster_id="C001", records=records)
    split = dict(schema="mini.aihub-71470-ddsp-song-split.v1", status="materialized", cluster_id="C001",
        training_files=train, heldout_files=heldout, training_wavs=len(train), heldout_wavs=len(heldout),
        heldout_song_indices=[4, 6], source_manifest_sha256="bound-manifest")
    return manifest, split


class PairAuditTests(unittest.TestCase):
    def test_first_six_distinct_train_groups_before_any_audio_or_result(self):
        manifest, split = fixture()
        records = audit.choose_records(manifest, split, "bound-manifest")
        self.assertEqual([r["song_index"] for r in records], [1, 2, 3, 5, 7, 8])
        duplicate_title_clip = dict(manifest["records"][0], output_file="sample_extra.wav", source_stem="AP_EXTRA")
        manifest["records"].insert(1, duplicate_title_clip)
        split["training_files"].append("sample_extra.wav"); split["training_wavs"] += 1
        self.assertEqual([r["song_index"] for r in audit.choose_records(manifest, split, "bound-manifest")],
                         [1, 2, 3, 5, 7, 8])

    def test_bound_split_rejects_leak_duplicates_missing_or_official_validation(self):
        for bad in ("manifest_hash", "leak", "missing", "duplicate", "validation", "song_leak", "unsafe", "heldout_song"):
            manifest, split = fixture()
            if bad == "manifest_hash": split["source_manifest_sha256"] = "changed"
            elif bad == "leak": split["heldout_files"].append(split["training_files"][0]); split["heldout_wavs"] += 1
            elif bad == "missing": split["training_files"].pop(); split["training_wavs"] -= 1
            elif bad == "duplicate": manifest["records"].append(copy.deepcopy(manifest["records"][0]))
            elif bad == "validation": manifest["split"] = "validation"
            elif bad == "song_leak": manifest["records"][3]["song_index"] = 1
            elif bad == "unsafe": manifest["records"][0]["output_file"] = "../escape.wav"
            else: split["heldout_song_indices"] = []
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                audit.choose_records(manifest, split, "bound-manifest")

    def test_no_silent_replacement_if_fewer_than_six_training_titles(self):
        manifest, split = fixture()
        for r in manifest["records"]:
            if r["song_index"] not in (4, 6): r["song_index"] = 1
        with self.assertRaisesRegex(ValueError, "six_distinct"):
            audit.choose_records(manifest, split, "bound-manifest")

    def test_prepared_wave_hash_frame_format_limits_and_readonly_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "sample.wav"
            expected = np.arange(1600, dtype="<i2")
            with wave.open(str(path), "wb") as out:
                out.setnchannels(1); out.setsampwidth(2); out.setframerate(16000)
                out.writeframes(expected.tobytes())
            original = path.read_bytes()
            record = dict(output_file=path.name, output_sha256=audit.sha256(path), output_bytes=path.stat().st_size,
                          output_frames=len(expected))
            actual, returned = audit.read_audio(path.parent, record)
            np.testing.assert_array_equal(actual, expected.astype(np.float64) / 32768.)
            self.assertEqual(returned, path)
            self.assertEqual(path.read_bytes(), original)
            for key, changed in (("output_sha256", "wrong"), ("output_frames", 1599), ("output_bytes", 1)):
                with self.subTest(key=key), self.assertRaises(ValueError):
                    audit.read_audio(path.parent, {**record, key: changed})

    def test_tar_virtual_zip_reads_only_unique_MIDI_without_extracting(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            manifest, _ = fixture()
            selected = manifest["records"][:2]
            packed = io.BytesIO()
            with zipfile.ZipFile(packed, "w") as archive:
                for record in selected:
                    archive.writestr("/" + record["source_stem"] + ".mid", b"synthetic MIDI bytes only")
                    archive.writestr("/" + record["source_stem"] + ".wav", b"not decoded or extracted")
            tar_path = root / "TS_synthetic.tar"
            with tarfile.open(tar_path, "w") as tar:
                data = packed.getvalue()
                info = tarfile.TarInfo("dataset.zip"); info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
            before = tar_path.read_bytes()
            rows = list(audit.read_midis(tar_path, selected))
            self.assertEqual(len(rows), 2)
            self.assertTrue(all(raw == b"synthetic MIDI bytes only" for _, raw, _ in rows))
            self.assertTrue(all(meta["complete_member_CRC_checked"] for _, _, meta in rows))
            self.assertEqual(tar_path.read_bytes(), before)
            self.assertEqual(list(root.iterdir()), [tar_path])
            with self.assertRaisesRegex(ValueError, "unique_stem"):
                list(audit.read_midis(tar_path, manifest["records"][-1:]))
            with self.assertRaisesRegex(ValueError, "training_source"):
                list(audit.read_midis(root / "VS_synthetic.tar", selected))

    def test_private_json_size_symlink_and_regular_file_checks(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "input.json"
            path.write_text('{"synthetic": true}')
            self.assertEqual(audit.read_json(path), {"synthetic": True})
            alias = path.parent / "alias.json"; alias.symlink_to(path)
            with self.assertRaises(ValueError): audit.read_json(alias)
            with self.assertRaises(ValueError): audit.read_json(path.parent)

    def test_complete_readonly_audit_preserves_ineligible_case_and_does_not_train(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            manifest, split = fixture()
            for row in manifest["records"]:
                path = root / row["output_file"]
                with wave.open(str(path), "wb") as output:
                    output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000)
                    output.writeframes(np.zeros(1600, dtype="<i2").tobytes())
                row.update(output_sha256=audit.sha256(path), output_bytes=path.stat().st_size,
                    output_frames=1600, original={"sample_rate_hz": 48000, "bit_depth": 24})
            manifest_path, split_path = root / "private_manifest.json", root / "private_split.json"
            manifest_path.write_text(json.dumps(manifest))
            split["source_manifest_sha256"] = audit.sha256(manifest_path)
            split_path.write_text(json.dumps(split))
            source_tar = root / "TS_synthetic.tar"; source_tar.write_bytes(b"not read by mocked MIDI reader")
            selected = audit.choose_records(manifest, split, audit.sha256(manifest_path))
            feature_arrays = dict(pitch_hz=np.full(10, 440, np.float32), voiced_mask=np.ones(10, bool),
                                  rms_db=np.full(10, -30, np.float32))
            parsed = [dict(notes=[dict(start_seconds=0., end_seconds=1., pitch=69, status="paired")],
                alignment_candidate=(index != 1), warnings=[]) for index in range(6)]
            before = {p: p.read_bytes() for p in root.iterdir()}
            with patch.object(audit, "read_midis", return_value=iter((row, b"synthetic", {"fixture": True}) for row in selected)), \
                    patch.object(audit.parse_midi, "parse_midi", side_effect=parsed), \
                    patch.object(audit.acoustic, "extract_features", return_value=feature_arrays), \
                    patch.object(audit.alignment_metrics, "analyse", return_value={"diagnostic_only": True}) as analyse:
                report = audit.audit(manifest_path, split_path, source_tar)
            self.assertEqual(analyse.call_count, 5)
            self.assertEqual(report["selected_song_indices"], [1, 2, 3, 5, 7, 8])
            self.assertEqual(report["cases"][1]["timing_diagnostics"]["status"],
                             "nominal_score_requires_review_not_searched")
            self.assertEqual(report["aligned_training_pairs_approved"], 0)
            self.assertFalse(report["model_loaded"])
            self.assertFalse(report["Torch_imported"])
            self.assertEqual(report["heldout_files_read"], 0)
            self.assertEqual({p: p.read_bytes() for p in root.iterdir()}, before)

    def test_compact_report_only_omits_per_note_details_not_frame_counts(self):
        report = dict(identity=dict(per_note=[{"detail": 1}], fixed_source_support_frames=123,
            no_note_frames_on_support=45), best=dict(per_note=[], fixed_source_support_frames=123))
        compact = audit.compact_diagnostics(report)
        self.assertEqual(compact["identity"]["fixed_source_support_frames"], 123)
        self.assertEqual(compact["identity"]["no_note_frames_on_support"], 45)
        self.assertEqual(compact["identity"]["computed_per_note_detail_rows_not_saved"], 1)
        self.assertNotIn("per_note", compact["identity"])


if __name__ == "__main__":
    unittest.main()
