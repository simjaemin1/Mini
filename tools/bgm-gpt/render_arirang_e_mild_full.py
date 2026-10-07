#!/usr/bin/env python3
"""Make a full-length diagnostic of the mild E5-onset edit against 004.

Only the first daegeum phrase's two E5 onsets are changed. Both 19.2-second
Gugak recordings are read-only, and 004 is used solely as a verified reference.
This script never changes the game BGM or the existing numbered comparisons.

    python3 tools/bgm-gpt/render_arirang_e_mild_full.py \
      --first '/path/to/w3-914-001__아리랑 01.flac' \
      --second '/path/to/w3-914-002__아리랑 02.flac' \
      --reference-004 '/path/to/004_아리랑_대금.m4a' \
      --output-dir '/path/to/청취'
"""

from __future__ import annotations

import argparse
from array import array
import json
import math
import os
from pathlib import Path
import tempfile

import numpy as np

import render_arirang_layers as arirang
import render_e_onset_psola as e_edit


OUTPUT_NAME = "010_아리랑_대금_E약보정.m4a"
PROVENANCE_NAME = "제작정보_E초입_010.json"
FIRST_SHA256 = e_edit.SOURCE_SHA256
SECOND_SHA256 = "8b5316217a10d0242aa6ae35f8e36a7724b59ef57771e4d1c883d5d2c8d31887"
REFERENCE_SHA256 = "61ca5c33c6c6a39f958f75879bf8008e7674a2dda873e2a35a83dd6679f6ae25"
MASTER_GAIN_DB = 1.36
MONO_TO_STEREO = np.float32(1 / math.sqrt(2))


def checked_file(path: Path, expected_name: str, expected_sha: str) -> str:
    if expected_name not in path.name:
        raise ValueError(f"Expected {expected_name} file: {path}")
    digest = arirang.sha256(path)
    if digest != expected_sha:
        raise ValueError(f"SHA-256 mismatch for {path}: {digest}")
    return digest


def stereo_array(samples: np.ndarray) -> array:
    result = array("f")
    result.frombytes(np.ascontiguousarray(samples, dtype="<f4").tobytes())
    return result


def write_aac_single_thread(path: Path, samples: array, description: str) -> None:
    """Use the 004 settings but request a single AAC encoding thread."""
    arirang.run(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-threads", "1",
        "-f", "f32le", "-ar", str(arirang.RATE), "-ac", str(arirang.CHANNELS),
        "-i", "pipe:0", "-af", f"volume={MASTER_GAIN_DB:.8f}dB",
        "-ar", str(arirang.RATE), "-ac", str(arirang.CHANNELS),
        "-c:a", "aac", "-b:a", arirang.AAC_BITRATE, "-threads", "1",
        "-movflags", "+faststart", "-metadata", f"comment={arirang.CREDIT}",
        "-metadata", f"copyright={arirang.CREDIT}",
        "-metadata", f"description={description}", str(path),
        input_bytes=arirang.pcm_to_le_bytes(samples),
    )


def boundary_diagnostics(original: np.ndarray, edited: np.ndarray,
                         section: dict) -> dict:
    start, end = section["active_s"]
    boundaries = (start - 0.016, end + 0.016)
    rows = []
    for at in boundaries:
        ix = e_edit.sample(at)
        outer = original[max(0, ix - e_edit.sample(0.005)):
                         min(len(original), ix + e_edit.sample(0.005))]
        changed = edited[max(0, ix - e_edit.sample(0.005)):
                         min(len(edited), ix + e_edit.sample(0.005))]
        difference = changed - outer
        signal_rms = math.sqrt(float(np.mean(outer * outer)))
        difference_rms = math.sqrt(float(np.mean(difference * difference)))
        step_original = original[ix] - original[ix - 1]
        step_edited = edited[ix] - edited[ix - 1]
        rows.append({
            "at_s": at,
            "difference_rms_db_relative_to_original_10ms": round(
                20 * math.log10(max(difference_rms, 1e-12) / max(signal_rms, 1e-12)), 2),
            "additional_one_sample_step": round(float(step_edited - step_original), 9),
        })
    return {"boundaries": rows}


def decoded_difference(reference: Path, candidate: Path,
                       change_mask: np.ndarray) -> dict:
    old = np.asarray(arirang.decode(reference), dtype=np.float32).reshape(-1, 2)
    new = np.asarray(arirang.decode(candidate), dtype=np.float32).reshape(-1, 2)
    frames = arirang.TOTAL_SAMPLES
    if len(old) < frames or len(new) < frames:
        raise RuntimeError("Unexpected AAC-decoded duration")
    old, new = old[:frames], new[:frames]
    # AAC's transform overlap can affect a few frames outside an edit. For
    # an honest preservation figure, keep 100 ms away from each changed span.
    stable = ~change_mask.copy()
    halo = e_edit.sample(0.1)
    for section in e_edit.SECTIONS:
        start, end = section["active_s"]
        stable[max(0, e_edit.sample(start - 0.016) - halo):
               min(frames, e_edit.sample(end + 0.016) + halo)] = False
    delta = new[stable] - old[stable]
    reference_rms = math.sqrt(float(np.mean(old[stable] ** 2)))
    error_rms = math.sqrt(float(np.mean(delta ** 2)))
    return {
        "stable_frames_excluding_100ms_aac_halo": int(np.sum(stable)),
        "error_rms_db_relative_to_reference": round(
            20 * math.log10(max(error_rms, 1e-12) / max(reference_rms, 1e-12)), 2),
        "maximum_absolute_sample_error": round(float(np.max(np.abs(delta))), 8),
        "exact_sample_fraction_after_aac": round(float(np.mean(delta == 0)), 8),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--first", type=Path, required=True)
    parser.add_argument("--second", type=Path, required=True)
    parser.add_argument("--reference-004", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    first, second, reference = (args.first.resolve(), args.second.resolve(),
                                args.reference_004.resolve())
    output_dir = args.output_dir.resolve()
    hashes = {
        "first": checked_file(first, "w3-914-001", FIRST_SHA256),
        "second": checked_file(second, "w3-914-002", SECOND_SHA256),
        "reference_004": checked_file(reference, "004_아리랑_대금", REFERENCE_SHA256),
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    output, provenance = output_dir / OUTPUT_NAME, output_dir / PROVENANCE_NAME
    existing = [str(path) for path in (output, provenance) if path.exists()]
    if existing:
        raise FileExistsError(f"Will not overwrite: {existing}")

    original_mono = e_edit.decode_source(first)
    edited_mono = original_mono.copy()
    section_details = []
    for section in e_edit.SECTIONS:
        edited_mono, details = e_edit.psola_onset(edited_mono, section, 0.5)
        details.update(boundary_diagnostics(original_mono, edited_mono, section))
        section_details.append(details)

    source_stereo_1, _ = arirang.checked_source(first)
    source_stereo_2, _ = arirang.checked_source(second)
    source_1 = np.asarray(source_stereo_1, dtype=np.float32).reshape(-1, 2)
    reproduced_1 = np.repeat((original_mono.astype(np.float32) * MONO_TO_STEREO)[:, None], 2, axis=1)
    if not np.array_equal(source_1, reproduced_1):
        raise RuntimeError("Mono-to-stereo PCM does not reproduce the 004 renderer")

    changed_1 = np.repeat((edited_mono.astype(np.float32) * MONO_TO_STEREO)[:, None], 2, axis=1)
    changed = np.zeros(arirang.TOTAL_SAMPLES, dtype=bool)
    for section in e_edit.SECTIONS:
        start, end = section["active_s"]
        changed[max(0, e_edit.sample(start - 0.016)):
                min(arirang.TOTAL_SAMPLES, e_edit.sample(end + 0.016) + 1)] = True
    if not np.array_equal(source_1[~changed[:arirang.PHRASE_SAMPLES]],
                          changed_1[~changed[:arirang.PHRASE_SAMPLES]]):
        raise RuntimeError("An untouched first-phrase PCM frame changed")
    first_change = changed_1 != source_1
    if np.any(first_change & ~changed[:arirang.PHRASE_SAMPLES, None]):
        raise RuntimeError("A PCM change escaped the two E-onset intervals")
    corrected_first = stereo_array(changed_1)
    original_full = arirang.append_phrase(source_stereo_1, source_stereo_2)
    corrected_full = arirang.append_phrase(corrected_first, source_stereo_2)
    if original_full[arirang.PHRASE_SAMPLES * 2:] != corrected_full[arirang.PHRASE_SAMPLES * 2:]:
        raise RuntimeError("The second 19.2-second phrase changed")

    with tempfile.TemporaryDirectory(prefix=".e-mild-full-", dir=output_dir) as temp:
        stage = Path(temp)
        reference_rebuild = stage / "004_아리랑_대금.m4a"
        write_aac_single_thread(reference_rebuild, original_full, arirang.VERSIONS[0][1])
        rebuild_hash = arirang.sha256(reference_rebuild)
        # The native AAC encoder can produce a small, run-dependent difference
        # even with bit-identical input PCM. Verify decoded fidelity separately
        # instead of claiming the compressed file must have the same SHA-256.
        rebuilt_decoded = np.asarray(arirang.decode(reference_rebuild), dtype=np.float32)
        reference_decoded = np.asarray(arirang.decode(reference), dtype=np.float32)
        if len(rebuilt_decoded) != len(reference_decoded):
            raise RuntimeError("004 rebuild decoded to a different number of samples")
        baseline_rms = math.sqrt(float(np.mean((rebuilt_decoded - reference_decoded) ** 2)))
        reference_rms = math.sqrt(float(np.mean(reference_decoded ** 2)))
        baseline_error_db = 20 * math.log10(max(baseline_rms, 1e-12) / max(reference_rms, 1e-12))
        if baseline_error_db > -50:
            raise RuntimeError(f"Could not closely reproduce 004 AAC: {baseline_error_db:.2f} dB")
        candidate = stage / OUTPUT_NAME
        write_aac_single_thread(candidate, corrected_full,
                         "대금 001+002, 앞절 E5 초입 두 곳만 약보정한 전곡 맥락 비교 — 미채택 R&D")
        arirang.validate_output(candidate)
        reference_level = arirang.measure(path=reference)
        candidate_level = arirang.measure(path=candidate)
        if abs(candidate_level["input_i"] - reference_level["input_i"]) > 0.05:
            raise RuntimeError("Full-track LUFS differs from 004 by over 0.05 LU")
        encoded_probe = arirang.probe(candidate)
        raw_probe = json.loads(arirang.run(
            "ffprobe", "-v", "error", "-show_entries",
            "format_tags=comment,copyright,description", "-of", "json", str(candidate)).stdout)
        tags = raw_probe["format"]["tags"]
        if tags.get("comment") != arirang.CREDIT or tags.get("copyright") != arirang.CREDIT:
            raise RuntimeError("Gugak source credit missing")
        preserved = int(np.sum(~changed))
        details = {
            "status": "diagnostic R&D; not approved or connected to game BGM",
            "credit": arirang.CREDIT,
            "sources": {"first": str(first), "second": str(second),
                        "reference_004": str(reference)},
            "source_sha256": hashes,
            "output": str(output),
            "output_sha256": arirang.sha256(candidate),
            "reference_rebuild_sha256": rebuild_hash,
            "reference_rebuild_matches_004_compressed_sha256": rebuild_hash == REFERENCE_SHA256,
            "reference_rebuild_decoded_error_db_relative_to_004": round(baseline_error_db, 2),
            "method": "Same ④ AAC settings with single-thread encoding and +1.36 dB gain; PSOLA mild curve at two first-phrase E5 onsets only",
            "whole_duration_s": 38.4,
            "sample_rate": arirang.RATE,
            "channels": arirang.CHANNELS,
            "master_gain_db": MASTER_GAIN_DB,
            "format": encoded_probe,
            "tags": tags,
            "reference_loudness": reference_level,
            "candidate_loudness": candidate_level,
            "pre_aac_bit_identical_frames_outside_changed_intervals": preserved,
            "pre_aac_bit_identical_fraction": round(preserved / arirang.TOTAL_SAMPLES, 8),
            "second_phrase_pre_aac_bit_identical": True,
            "decoded_non_e_comparison_to_004": decoded_difference(reference, candidate, changed),
            "decoded_non_e_comparison_to_same_run_004_rebuild": decoded_difference(
                reference_rebuild, candidate, changed),
            "sections": section_details,
        }
        metadata = stage / PROVENANCE_NAME
        metadata.write_text(json.dumps(details, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.link(candidate, output)
        os.link(metadata, provenance)
    print(json.dumps(details, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
