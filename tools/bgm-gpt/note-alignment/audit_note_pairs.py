#!/usr/bin/env python3
"""Small read-only score/audio timing audit, NOT aligned training labels or ML.

Only six predeclared, distinct TRAIN song groups are examined. MIDI is read
in memory through the existing safe TAR/ZIP reader. No audio/model/archive is
created, extracted, uploaded or modified. A private JSON report goes to stdout.
"""
from __future__ import annotations

import sys
sys.dont_write_bytecode = True

from collections import defaultdict
from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path
import stat
import tarfile
import threading
import time
import wave
import zipfile

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "aihub-readiness"))
import prepare_selected_audio as source
import mac_mps_ddsp_features as acoustic
import parse_midi
import alignment_metrics

MAX_JSON = 2_000_000
MAX_WAV = 2_000_000
MAX_WAV_SECONDS = 60
MAX_SECONDS = 120
MAX_RSS = 512 * 1024 ** 2
SOURCE_CREDIT = "국악 악보 및 음원 데이터 — AI Hub (71470); 승인된 비공개 연구개발"


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as handle:
        while block := handle.read(1024 * 1024):
            h.update(block)
    return h.hexdigest()


def read_json(path):
    path = Path(path)
    info = path.lstat()
    if not path.is_absolute() or not stat.S_ISREG(info.st_mode) or info.st_size > MAX_JSON:
        raise ValueError("bounded_regular_absolute_JSON_required")
    return json.loads(path.read_text())


def choose_records(manifest, split, manifest_hash, count=6):
    if (manifest.get("schema") != "mini.aihub-71470-private-audio-prep.v1"
            or manifest.get("split") != "training" or manifest.get("cluster_id") != "C001"
            or split.get("schema") != "mini.aihub-71470-ddsp-song-split.v1"
            or split.get("status") != "materialized" or split.get("cluster_id") != "C001"
            or split.get("source_manifest_sha256") != manifest_hash):
        raise ValueError("bound_existing_C001_training_manifest_split_required")
    records = manifest.get("records", [])
    names = [r["output_file"] for r in records]
    train, heldout = split["training_files"], split["heldout_files"]
    if (len(names) != len(set(names)) or len(train) != len(set(train))
            or len(heldout) != len(set(heldout)) or set(train) & set(heldout)
            or set(names) != set(train) | set(heldout)
            or split["training_wavs"] != len(train) or split["heldout_wavs"] != len(heldout)):
        raise ValueError("exact_disjoint_exhaustive_existing_file_split_required")
    groups = defaultdict(set)
    stems = set()
    for record in records:
        name, stem = record["output_file"], record["source_stem"]
        for value in (name, stem):
            if (not isinstance(value, str) or not value or Path(value).name != value
                    or value in (".", "..") or "\\" in value or ":" in value):
                raise ValueError("safe_unique_file_and_source_stem_required")
        if stem in stems or type(record["song_index"]) is not int:
            raise ValueError("unique_source_stems_and_integer_song_indices_required")
        stems.add(stem)
        groups[record["song_index"]].add("train" if name in train else "heldout")
    if any(len(value) != 1 for value in groups.values()):
        raise ValueError("song_group_cannot_cross_split")
    if {g for g, value in groups.items() if value == {"heldout"}} != set(split["heldout_song_indices"]):
        raise ValueError("heldout_song_indices_changed")
    chosen, seen = [], set()
    for record in records:
        if record["output_file"] in train and record["song_index"] not in seen:
            seen.add(record["song_index"])
            chosen.append(record)
            if len(chosen) == count:
                return chosen
    raise ValueError("six_distinct_training_song_groups_required")


def read_audio(folder, record):
    path = Path(folder) / record["output_file"]
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= MAX_WAV
            or info.st_size != record["output_bytes"] or sha256(path) != record["output_sha256"]):
        raise ValueError("prepared_WAV_hash_or_size_changed")
    with wave.open(str(path), "rb") as audio:
        if (audio.getframerate(), audio.getnchannels(), audio.getsampwidth(), audio.getcomptype()) != (16000, 1, 2, "NONE"):
            raise ValueError("existing_16k_mono_PCM16_required")
        frames = audio.getnframes()
        if frames != record["output_frames"] or not 0 < frames <= 16000 * MAX_WAV_SECONDS:
            raise ValueError("bounded_original_prepared_frame_count_required")
        payload = audio.readframes(frames)
    if len(payload) != frames * 2:
        raise ValueError("truncated_prepared_WAV")
    return np.frombuffer(payload, dtype="<i2").astype(np.float64) / 32768., path


def archive_identity(path):
    s = Path(path).stat()
    return dict(size=s.st_size, inode=s.st_ino, device=s.st_dev, modified_ns=s.st_mtime_ns)


def compact_diagnostics(analysis):
    """Keep exact note events and global counts, not bulky per-note statistics.

    The pure metrics module can recompute these details later. This triage
    does not omit any frame from its global numerator/denominator.
    """
    for key in ("identity", "best"):
        row = analysis.get(key)
        if isinstance(row, dict) and "per_note" in row:
            row["per_note_details_omitted_from_triage_report"] = True
            row["computed_per_note_detail_rows_not_saved"] = len(row.pop("per_note"))
    return analysis


def read_midis(source_tar, selected):
    """Yield only six bounded MIDI payloads; the 5GB source TAR is not copied."""
    path = Path(source_tar)
    if not path.name.startswith("TS_"):
        raise ValueError("official_training_source_TAR_required")
    before = archive_identity(path)
    with ExitStack() as stack:
        handle, info = source._open_regular_readonly(path, ".tar", source.MAX_TAR_BYTES)
        stack.enter_context(handle)
        archive = stack.enter_context(tarfile.open(fileobj=handle, mode="r:"))
        parts, _, _ = source._tar_parts([(archive, info.st_size, handle.fileno())])
        view = source._ReadableJoinedTarParts(parts)
        _, paths = source._zip_structure(view)
        by_name = defaultdict(list)
        for name, indices in paths.items():
            if name.lower().endswith(".mid"):
                by_name[name.rsplit("/", 1)[-1]].extend((name, index) for index in indices)
        with zipfile.ZipFile(view) as zipped:
            infos = zipped.infolist()
            for record in selected:
                matches = by_name[record["source_stem"] + ".mid"]
                if len(matches) != 1:
                    raise ValueError("one_unique_stem_matched_MIDI_required")
                name, index = matches[0]
                member = infos[index]
                if not 0 < member.file_size <= 8 * 1024 ** 2:
                    raise ValueError("bounded_MIDI_member_required")
                raw = zipped.read(member)  # complete read checks ZIP CRC
                if len(raw) != member.file_size:
                    raise ValueError("MIDI_member_size_changed")
                yield record, raw, dict(member=name, bytes=len(raw), zip_CRC32=member.CRC,
                    sha256=hashlib.sha256(raw).hexdigest(), complete_member_CRC_checked=True)
    if archive_identity(path) != before:
        raise ValueError("source_TAR_changed_during_readonly_audit")


class ReadOnlyBudget:
    """No GPU, output files or training; separate small-read CPU/RSS limits.

    This is not the training/inference guard and does not relax its 12GiB
    disk floor. Large jobs remain blocked; this process only emits small JSON.
    """
    def __enter__(self):
        import psutil
        self.started, self.process = time.monotonic(), psutil.Process()
        self.stop = threading.Event()
        def watch():
            while not self.stop.wait(.25):
                if time.monotonic() - self.started > MAX_SECONDS or self.process.memory_info().rss > MAX_RSS:
                    print('{"status":"readonly_audit_resource_aborted"}', file=sys.stderr, flush=True)
                    os._exit(124)
        self.thread = threading.Thread(target=watch, daemon=True)
        self.thread.start()
        return self
    def __exit__(self, *_):
        self.stop.set()
        self.thread.join(1)


def audit(prepared_manifest, split_path, source_tar):
    if "torch" in sys.modules:
        raise ValueError("fresh_noTorch_readonly_process_required")
    with ReadOnlyBudget() as budget:
        manifest_path, split_path, source_tar = map(Path, (prepared_manifest, split_path, source_tar))
        manifest, split = read_json(manifest_path), read_json(split_path)
        bindings = {str(p.resolve()): sha256(p) for p in (manifest_path, split_path, Path(__file__),
            Path(parse_midi.__file__), Path(alignment_metrics.__file__), Path(source.__file__),
            Path(acoustic.__file__), HERE.parent / "aihub-readiness/inspect_source_tar.py")}
        selected = choose_records(manifest, split, bindings[str(manifest_path.resolve())])
        identity = archive_identity(source_tar)
        cases = []
        for record, raw, member in read_midis(source_tar, selected):
            try:
                notes = parse_midi.parse_midi(raw)
            except parse_midi.MidiParseError as error:
                # Keep the predeclared case instead of silently choosing a
                # replacement whose score looks easier to align.
                notes = dict(status="MIDI_parse_refused_no_alignment_attempted",
                    error_category=str(error), alignment_candidate=False, notes=[])
            audio, wav_path = read_audio(manifest_path.parent, record)
            bindings[str(wav_path.resolve())] = record["output_sha256"]
            features = acoustic.extract_features(audio)
            times = np.arange(len(features["pitch_hz"]), dtype=np.float64) / 100.
            # The metrics helper never edits these arrays or the parsed score.
            if notes.get("alignment_candidate") is True:
                analysis = compact_diagnostics(alignment_metrics.analyse(notes["notes"], times, features["pitch_hz"],
                    features["voiced_mask"], features["rms_db"]))
            else:
                analysis = dict(status="nominal_score_requires_review_not_searched",
                    reason="parser_refusal_or_explicit_controller_overlap_unmatched_note_ambiguity",
                    training_accepted=False, human_verified_labels=False)
            cases.append(dict(sample=record["output_file"], source_stem=record["source_stem"],
                song_index=record["song_index"], split="training", duration_seconds=len(audio) / 16000.,
                source_MIDI=member, original_prepared_WAV_sha256=record["output_sha256"],
                original_native_format=record["original"], parsed_score=notes, timing_diagnostics=analysis,
                acoustic_frames=len(times), source_pitch_supported_frames=int(np.count_nonzero(
                    features["voiced_mask"] & (features["pitch_hz"] > 0) & (features["rms_db"] > -60.)))))
        if any(sha256(p) != checksum for p, checksum in bindings.items()) or archive_identity(source_tar) != identity:
            raise ValueError("bound_input_changed_during_readonly_audit")
        report = dict(schema="mini.private-score-audio-timing-triage.v1", status="diagnostic_only_not_training_alignment",
            source_credit=SOURCE_CREDIT, selection="manifest-order first record of first6 distinct TRAIN song indices",
            selected_song_indices=[r["song_index"] for r in selected], selected_files=[r["output_file"] for r in selected],
            heldout_files_read=0, existing_split_changed=False, input_bindings=bindings,
            source_tar_path=str(source_tar), source_tar_identity_before_after=identity,
            complete_source_tar_SHA_computed=False, exact_selected_MIDI_payloads_hashed=True,
            model_loaded=False, Torch_imported=False, GPU_used=False, optimizer_updates=0,
            audio_rendered_or_written=False, original_or_model_files_modified=False,
            note_alignment_ground_truth=False, aligned_training_pairs_approved=0,
            same_clip_affine_search_is_development_fit_not_validation_accuracy=True,
            limits=["C001/mono/single-track labels do not independently prove clean solo daegeum.",
                "Existing16k PCM16 copies are for timing diagnostics, not original timbre evaluation.",
                "YIN can miss/halve/double pitches; MIDI nominal pitches need not match ornaments or tuning.",
                "Global offset/scale cannot establish local note boundaries, articulation, breath or vibrato truth.",
                "No candidate timing map is promoted to training labels and no audio or score is modified.",
                "Full model training/rendering remains blocked by the separate12GiB free-disk floor."],
            elapsed_seconds=time.monotonic() - budget.started, cases=cases)
        if len(json.dumps(report, ensure_ascii=False, allow_nan=False).encode()) > MAX_JSON:
            raise ValueError("small_private_report_limit")
        return report


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepared-manifest", required=True, type=Path)
    parser.add_argument("--split", required=True, type=Path)
    parser.add_argument("--source-tar", required=True, type=Path)
    args = parser.parse_args()
    result = audit(args.prepared_manifest, args.split, args.source_tar)
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))
