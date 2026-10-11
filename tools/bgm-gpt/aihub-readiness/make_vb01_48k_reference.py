#!/usr/bin/env python3
"""Make private, exact-clock 48 kHz source references for three bound VB01 pairs.

The original AI Hub WAVs are only read from a local TAR-wrapped ZIP.  Existing
VB01 evaluation files are read and hashed, never changed.  The three 4-second
references retain the source PCM samples and original level; the existing 16 kHz
listening pairs were independently RMS-matched and must not be confused with them.
"""

from __future__ import annotations

from contextlib import ExitStack
import hashlib
import html
import io
import json
import math
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tarfile
import wave
import zipfile

import numpy as np

from inspect_source_tar import MAX_TAR_BYTES, SourceInspectionError, _open_regular_readonly, _tar_parts, _zip_structure
import mac_mps_ddsp_pilot as pilot
from prepare_selected_audio import _ReadableJoinedTarParts, _read_selected_wav


SCHEMA = "mini.aihub-71470-vb01-48k-source-reference.v1"
SOURCE_SCHEMA = "mini.aihub-71470-private-audio-prep.v1"
SELECTION_SCHEMA = "mini.aihub-71470-heldout-vb01-selection.v1"
BINDING_SCHEMA = "mini.aihub-71470-heldout-vb01-reproduction.v1"
RATE = 48_000
SECONDS = 4
FRAMES = RATE * SECONDS
PAIR_COUNT = 3
MIN_FREE_AFTER = 8 * 1024**3
MAX_SOURCE_WAV = 256 * 1024**2
MAX_PREPARED_WAV = 128 * 1024**2
MAX_SMALL_JSON = 64 * 1024
MAX_HTML = 32 * 1024


class ReferenceError(Exception):
    """Fixed non-private failure category for public CLI output."""


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _private_doc(path: Path, limit: int) -> tuple[dict, str]:
    try:
        data = pilot._private_file(path, max_bytes=limit)
        doc = json.loads(data)
    except (pilot.PilotError, ValueError, UnicodeError) as exc:
        raise ReferenceError("private_document_invalid") from exc
    if not isinstance(doc, dict):
        raise ReferenceError("private_document_invalid")
    return doc, _sha(data)


def _source_records(source: dict, selection: dict, binding: dict, report: dict) -> list[tuple[int, dict, dict]]:
    if (source.get("schema") != SOURCE_SCHEMA or source.get("cluster_id") != "C001"
            or source.get("split") != "training" or source.get("source_tar_count") != 1
            or selection.get("schema") != SELECTION_SCHEMA
            or binding.get("schema") != BINDING_SCHEMA
            or binding.get("status") != "complete_bound_to_checkpoint"):
        raise ReferenceError("bound_input_contract_invalid")
    source_rows = source.get("records")
    selected_rows = selection.get("records")
    notes = report.get("private_pair_notes")
    pair_digests = binding.get("private_pair_wav_digests")
    if (not isinstance(source_rows, list) or not isinstance(selected_rows, list)
            or not isinstance(notes, list) or not isinstance(pair_digests, list)):
        raise ReferenceError("bound_input_contract_invalid")
    by_file = {row.get("output_file"): row for row in source_rows if isinstance(row, dict)}
    if len(by_file) != len(source_rows):
        raise ReferenceError("source_record_duplicate")
    ranked = [row for row in selected_rows if isinstance(row, dict) and row.get("planned_pair_rank")]
    if len(ranked) != PAIR_COUNT or sorted(row["planned_pair_rank"] for row in ranked) != [1, 2, 3]:
        raise ReferenceError("three_pair_selection_required")
    notes_by_rank = {row.get("planned_song_rank"): row for row in notes if isinstance(row, dict)}
    if len(notes_by_rank) != len(notes):
        raise ReferenceError("pair_notes_duplicate")
    digest_names = {row.get("name") for row in pair_digests if isinstance(row, dict)}
    expected_names = {f"pair_{rank:02d}_{kind}.wav" for rank in range(1, 4)
                      for kind in ("source_input_16k", "reconstruction")}
    if digest_names != expected_names or len(pair_digests) != len(expected_names):
        raise ReferenceError("pair_digest_set_invalid")
    result = []
    for item in sorted(ranked, key=lambda row: row["planned_pair_rank"]):
        rank = item["planned_pair_rank"]
        note = notes_by_rank.get(rank)
        source_row = by_file.get(item.get("output_file"))
        original = source_row.get("original") if isinstance(source_row, dict) else None
        if (not isinstance(note, dict) or note.get("status") != "saved"
                or note.get("pair_number") != rank or not isinstance(source_row, dict)
                or not isinstance(original, dict)
                or item.get("output_sha256") != source_row.get("output_sha256")
                or item.get("song_index") != source_row.get("song_index")
                or type(item.get("crop_start_frame_100hz")) is not int
                or item["crop_start_frame_100hz"] < 0
                or original.get("sample_rate_hz") != RATE
                or original.get("channels") != 1
                or original.get("bit_depth") != 16
                or original.get("codec") != "pcm_s16le"):
            raise ReferenceError("selected_source_mismatch")
        result.append((rank, item, source_row))
    return result


def _pcm_wav(payload: bytes, *, rate: int, expected_frames: int | None = None) -> tuple[bytes, int]:
    try:
        with wave.open(io.BytesIO(payload), "rb") as reader:
            frames = reader.getnframes()
            if (reader.getnchannels() != 1 or reader.getsampwidth() != 2
                    or reader.getframerate() != rate or reader.getcomptype() != "NONE"
                    or (expected_frames is not None and frames != expected_frames)):
                raise ReferenceError("wav_format_or_length_mismatch")
            pcm = reader.readframes(frames)
    except (EOFError, wave.Error) as exc:
        raise ReferenceError("wav_unreadable") from exc
    if len(pcm) != frames * 2:
        raise ReferenceError("wav_pcm_truncated")
    return pcm, frames


def _crop_original(payload: bytes, start_100hz: int) -> tuple[bytes, int]:
    if type(start_100hz) is not int or start_100hz < 0:
        raise ReferenceError("crop_time_invalid")
    start = start_100hz * (RATE // 100)
    try:
        with wave.open(io.BytesIO(payload), "rb") as reader:
            if (reader.getnchannels() != 1 or reader.getsampwidth() != 2
                    or reader.getframerate() != RATE or reader.getcomptype() != "NONE"):
                raise ReferenceError("source_wav_format_invalid")
            if start + FRAMES > reader.getnframes():
                raise ReferenceError("source_crop_out_of_bounds")
            reader.setpos(start)
            pcm = reader.readframes(FRAMES)
    except (EOFError, wave.Error) as exc:
        raise ReferenceError("source_wav_unreadable") from exc
    if len(pcm) != FRAMES * 2:
        raise ReferenceError("source_crop_truncated")
    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(RATE)
        writer.writeframes(pcm)
    return output.getvalue(), start


def _check_full_resample(source_wav: bytes, prepared_wav: bytes, expected_sha: str) -> bytes:
    if _sha(prepared_wav) != expected_sha:
        raise ReferenceError("prepared_source_sha_mismatch")
    prepared_pcm, prepared_frames = _pcm_wav(prepared_wav, rate=16_000)
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
               "-i", "pipe:0", "-map", "0:a:0", "-ac", "1", "-ar", "16000",
               "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"]
    try:
        converted = subprocess.run(command, input=source_wav, capture_output=True,
                                   timeout=60, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ReferenceError("local_resample_failed") from exc
    if (converted.returncode or len(converted.stdout) != prepared_frames * 2
            or converted.stdout != prepared_pcm):
        raise ReferenceError("source_to_prepared_pcm_not_identical")
    return prepared_pcm


def _check_existing_pair(prepared_pcm: bytes, start_100hz: int, pair_wav: bytes) -> None:
    prepared = np.frombuffer(prepared_pcm, dtype="<i2").astype(np.float32) / 32768.0
    first = start_100hz * 160
    excerpt = prepared[first:first + 64_000]
    if excerpt.shape != (64_000,):
        raise ReferenceError("prepared_crop_out_of_bounds")
    left = excerpt.astype(np.float64)
    rms = float(np.sqrt(np.mean(left * left)))
    if not math.isfinite(rms) or rms < 1e-5:
        raise ReferenceError("prepared_crop_too_quiet")
    matched = (left * (0.035 / rms)).astype(np.float32)
    expected_pcm = np.rint(matched * 32767).astype("<i2").tobytes()
    pair_pcm, _ = _pcm_wav(pair_wav, rate=16_000, expected_frames=64_000)
    if expected_pcm != pair_pcm:
        raise ReferenceError("prepared_crop_to_pair_not_identical")


def _check_bound_files(bound_dir: Path, binding: dict) -> dict[str, bytes]:
    result_dir = bound_dir / "result"
    files: dict[str, bytes] = {}
    for row in binding["private_pair_wav_digests"]:
        name = row["name"]
        payload = pilot._private_file(result_dir / "pairs" / name, max_bytes=1_000_000)
        if len(payload) != row.get("bytes") or _sha(payload) != row.get("sha256"):
            raise ReferenceError("bound_pair_changed")
        files[name] = payload
    return files


def _html_page(relative_bound_path: str) -> bytes:
    safe = html.escape(relative_bound_path, quote=True)
    sections = []
    for rank in range(1, 4):
        sections.append(f'''<section><h2>{rank}번째 곡 · 같은 4초</h2>
<label>원 48kHz 녹음 · 원래 음량</label><audio controls preload="none" src="reference_{rank:02d}_original_48k.wav"></audio>
<label>16kHz 녹음 · 비교 청취용 음량 조정</label><audio controls preload="none" src="{safe}/result/pairs/pair_{rank:02d}_source_input_16k.wav"></audio>
<label>16kHz 모델 복원 · 비교 청취용 음량 조정</label><audio controls preload="none" src="{safe}/result/pairs/pair_{rank:02d}_reconstruction.wav"></audio>
</section>''')
    markup = '''<!doctype html><html lang="ko"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>대금 원본 48kHz · 모델 비교</title>
<style>body{max-width:800px;margin:2rem auto;padding:0 1rem;color:#202020;font:17px/1.6 system-ui,sans-serif}h1{font-size:1.6rem}.note{background:#f1f4f7;padding:1rem;border-radius:10px}section{border:1px solid #ddd;border-radius:10px;margin:1.2rem 0;padding:1rem}h2{margin-top:0;font-size:1.15rem}label{display:block;margin-top:.8rem;font-weight:650}audio{display:block;width:100%;margin-top:.3rem}</style>
<h1>대금 원본 음질과 모델 복원 비교</h1>
<p class="note">AI Hub의 원 48kHz 녹음에서 아래 비교와 정확히 같은 시작 시각·4초 길이로 잘랐습니다. 48kHz 항목은 원본 PCM 샘플과 원래 음량을 보존합니다. 16kHz의 녹음·모델 두 항목은 앞선 A/B 비교를 위해 각각 전체 RMS 음량을 맞춘 파일입니다. 따라서 첫 항목이 더 작거나 크게 들릴 수 있으며, 음량 차이를 음질 차이로 단정하지 마세요. 모두 이 Mac의 비공개 폴더에서만 재생됩니다.</p>
''' + "\n".join(sections) + '''\n<p>48kHz 원음의 숨결·공격음과 16kHz 입력·복원음의 차이를 들어 보세요. 이 시험은 주어진 원연주를 재현하는 능력만 보여 주며, 새 악보에 비브라토를 배치하는 능력은 검증하지 않습니다.</p></html>\n'''
    return markup.encode("utf-8")


def make_references(source_tar: Path, source_manifest: Path, bound_dir: Path,
                    output_dir: Path) -> dict:
    if output_dir.exists() or output_dir.is_symlink() or not output_dir.is_absolute():
        raise ReferenceError("new_absolute_output_dir_required")
    parent = pilot._private_dir(output_dir.parent)
    bound_resolved = pilot._private_dir(bound_dir)
    if (parent != source_tar.parent.resolve() or parent != source_manifest.parent.parent.resolve()
            or parent.parent != bound_resolved.parent or output_dir == bound_resolved):
        raise ReferenceError("output_must_be_new_private_archive_sibling")
    if source_tar.name[:3].upper() == "VS_":
        raise ReferenceError("training_tar_required")
    source, source_sha = _private_doc(source_manifest, pilot.MAX_MANIFEST_BYTES)
    selection, selection_sha = _private_doc(bound_dir / "vibrato_selection_private.json", MAX_SMALL_JSON)
    binding, binding_sha = _private_doc(bound_dir / "result" / "checkpoint_binding.json", MAX_SMALL_JSON)
    report, report_sha = _private_doc(bound_dir / "result" / "vibrato_reproduction_report.json", MAX_SMALL_JSON)
    if (binding.get("source_manifest_sha256") != source_sha
            or binding.get("selection_sha256") != selection_sha
            or binding.get("reproduction_report_sha256") != report_sha
            or selection.get("source_manifest_sha256") != source_sha):
        raise ReferenceError("bound_hash_contract_invalid")
    pairs = _source_records(source, selection, binding, report)
    bound_wavs = _check_bound_files(bound_dir, binding)
    expected_output = PAIR_COUNT * (FRAMES * 2 + 44) + MAX_SMALL_JSON + MAX_HTML
    if shutil.disk_usage(parent).free - expected_output < MIN_FREE_AFTER:
        raise ReferenceError("disk_reserve_below_8gib")
    original_stat = source_tar.stat()
    if not stat.S_ISREG(original_stat.st_mode) or original_stat.st_size > MAX_TAR_BYTES:
        raise ReferenceError("source_tar_invalid")
    references: list[tuple[str, bytes]] = []
    rows: list[dict] = []
    try:
        with ExitStack() as stack:
            handle, tar_stat = _open_regular_readonly(source_tar, ".tar", MAX_TAR_BYTES)
            stack.enter_context(handle)
            archive = stack.enter_context(tarfile.open(fileobj=handle, mode="r:"))
            parts, _, _ = _tar_parts([(archive, tar_stat.st_size, handle.fileno())])
            view = _ReadableJoinedTarParts(parts)
            _, paths = _zip_structure(view)
            with zipfile.ZipFile(view, "r") as source_zip:
                infos = source_zip.infolist()
                for rank, selected, record in pairs:
                    member = record["source_zip_member"]
                    indexes = paths.get(member)
                    if not isinstance(member, str) or not isinstance(indexes, list) or len(indexes) != 1:
                        raise ReferenceError("source_zip_member_not_unique")
                    info = infos[indexes[0]]
                    if info.file_size > MAX_SOURCE_WAV:
                        raise ReferenceError("source_wav_too_large")
                    original = _read_selected_wav(source_zip, info)
                    original_sha = _sha(original)
                    prepared_path = source_manifest.parent / record["output_file"]
                    prepared = pilot._private_file(prepared_path, max_bytes=MAX_PREPARED_WAV)
                    prepared_pcm = _check_full_resample(original, prepared, record["output_sha256"])
                    _check_existing_pair(prepared_pcm, selected["crop_start_frame_100hz"],
                                         bound_wavs[f"pair_{rank:02d}_source_input_16k.wav"])
                    reference, start_frame = _crop_original(original, selected["crop_start_frame_100hz"])
                    reference_pcm, frames = _pcm_wav(reference, rate=RATE, expected_frames=FRAMES)
                    # The output is an exact copy of the selected source PCM interval; no gain or resampling.
                    original_pcm, source_frames = _pcm_wav(original, rate=RATE)
                    if (source_frames < start_frame + FRAMES
                            or reference_pcm != original_pcm[2 * start_frame:2 * (start_frame + FRAMES)]
                            or frames != FRAMES):
                        raise ReferenceError("reference_pcm_invalid")
                    name = f"reference_{rank:02d}_original_48k.wav"
                    references.append((name, reference))
                    rows.append({"pair_number": rank, "source_zip_member": member,
                                 "source_wav_sha256": original_sha,
                                 "source_wav_bytes": len(original),
                                 "prepared_16k_sha256": record["output_sha256"],
                                 "bound_source_pair_sha256": _sha(bound_wavs[f"pair_{rank:02d}_source_input_16k.wav"]),
                                 "crop_start_frame_100hz": selected["crop_start_frame_100hz"],
                                 "crop_start_frame_48khz": start_frame,
                                 "crop_frames_48khz": FRAMES,
                                 "reference_name": name,
                                 "reference_sha256": _sha(reference),
                                 "reference_bytes": len(reference),
                                 "level": "unaltered_original_pcm"})
    except (OSError, tarfile.TarError, zipfile.BadZipFile, SourceInspectionError) as exc:
        raise ReferenceError("source_archive_read_failed") from exc
    if (source_tar.stat().st_size != original_stat.st_size
            or source_tar.stat().st_mtime_ns != original_stat.st_mtime_ns):
        raise ReferenceError("source_archive_changed_during_read")
    # The bound evaluation remains byte-for-byte immutable while references are added separately.
    if (_private_doc(bound_dir / "result" / "checkpoint_binding.json", MAX_SMALL_JSON)[1] != binding_sha
            or _private_doc(bound_dir / "vibrato_selection_private.json", MAX_SMALL_JSON)[1] != selection_sha
            or _private_doc(bound_dir / "result" / "vibrato_reproduction_report.json", MAX_SMALL_JSON)[1] != report_sha):
        raise ReferenceError("bound_documents_changed_during_read")
    _check_bound_files(bound_dir, binding)
    output_dir.mkdir(mode=0o700)
    os.chmod(output_dir, 0o700)
    try:
        for name, payload in references:
            _write_new(output_dir / name, payload)
        page = _html_page(os.path.relpath(bound_resolved, output_dir))
        _write_new(output_dir / "listen.html", page)
        manifest = {"schema": SCHEMA, "scope": "private_local_r_and_d_only_not_game_output",
                    "source_manifest_sha256": source_sha, "selection_sha256": selection_sha,
                    "bound_binding_sha256": binding_sha, "bound_report_sha256": report_sha,
                    "source_tar_bytes": original_stat.st_size, "source_tar_mtime_ns": original_stat.st_mtime_ns,
                    "source_to_16k_pcm_exact": True, "prepared_crop_to_bound_pair_exact": True,
                    "reference_level": "original_not_rms_matched", "references": rows,
                    "listen_html_sha256": _sha(page)}
        _write_new(output_dir / "reference_manifest_private.json",
                   (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        if shutil.disk_usage(parent).free < MIN_FREE_AFTER:
            raise ReferenceError("disk_reserve_below_8gib_after_write")
    except Exception:
        for path in output_dir.iterdir():
            if path.is_file() and not path.is_symlink():
                path.unlink()
        output_dir.rmdir()
        raise
    return {"status": "created_private_48k_references", "pairs": len(rows),
            "seconds_per_reference": SECONDS, "original_rate_hz": RATE,
            "source_to_16k_pcm_exact": True, "prepared_crop_to_bound_pair_exact": True}


def _write_new(path: Path, payload: bytes) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(descriptor, "wb") as target:
        target.write(payload)
    os.chmod(path, 0o600)


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-tar", type=Path, required=True)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--bound-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        report = make_references(args.source_tar, args.source_manifest, args.bound_dir, args.output_dir)
    except ReferenceError as exc:
        print(json.dumps({"status": "error", "code": str(exc)}))
        return 2
    except Exception:
        print(json.dumps({"status": "error", "code": "unexpected_private_reference_failure"}))
        return 2
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
