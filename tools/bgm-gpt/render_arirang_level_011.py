#!/usr/bin/env python3
"""Render the unapproved 005 phrase-level balance comparison 011.

The verified 005 AAC is read-only. Only a stereo-common gain envelope is
applied; score, pitch, speed, instrument timing, and 19.2-second cut remain.
The whole-file loudness is restored by a common gain, so the first phrase gets
louder too. This is an R&D audition, not a game-BGM replacement.
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


OUTPUT_NAME = "011_아리랑_대금가야금_뒷절음량균형.m4a"
PROVENANCE_NAME = "제작정보_음량_011.json"
REFERENCE_SHA256 = "388ee8fc8ddffd354f18b0715dde486e35391f529c67e8a551afe3c02a44379e"
SOURCE_SHA256 = {
    "w3-914-001": "e29a65963d39aba6ef98c641c558d528d33858dbbe0d616971133d0b35d2f876",
    "w3-914-002": "8b5316217a10d0242aa6ae35f8e36a7724b59ef57771e4d1c883d5d2c8d31887",
    "s1-914-001": "2c7e7d0b7fde41709ccf75ffd7a4ffc076ab3d77126d3490983d2e38ecaea110",
    "s1-914-002": "879bf89c4633ccd08ac62eaafce5d66121a5842cadb4f7b9874e746e3b9d2533",
}
JOIN_S = 19.2
RAMP_S = 3.0
START_REDUCTION_DB = -4.0
END_REDUCTION_DB = -2.5
FRAMES = arirang.TOTAL_SAMPLES
RATE = arirang.RATE
DESCRIPTION = "005 레벨 비교: 002 악구 smooth 램프 3초, 음정 무보정"


def pcm_array(samples: np.ndarray) -> array:
    result = array("f")
    result.frombytes(np.ascontiguousarray(samples, dtype="<f4").tobytes())
    return result


def measure(samples: np.ndarray) -> dict[str, float]:
    return arirang.measure(samples=pcm_array(samples))


def section_lufs(samples: np.ndarray, start: float, end: float) -> float:
    return measure(samples[int(start * RATE):int(end * RATE)])["input_i"]


def section_rms_dbfs(samples: np.ndarray, start: float, end: float) -> float:
    part = samples[int(start * RATE):int(end * RATE)]
    return round(float(20 * math.log10(math.sqrt(float(np.mean(part * part))) + 1e-12)), 3)


def metrics(samples: np.ndarray) -> dict[str, object]:
    before = section_rms_dbfs(samples, 19.1, 19.2)
    after = section_rms_dbfs(samples, 19.2, 19.3)
    split = int(JOIN_S * RATE)
    return {
        "whole": measure(samples),
        "section_lufs": {
            "0_19p2": section_lufs(samples, 0, 19.2),
            "19p2_38p4": section_lufs(samples, 19.2, 38.4),
            "16p2_19p2": section_lufs(samples, 16.2, 19.2),
            "19p2_22p2": section_lufs(samples, 19.2, 22.2),
            "22p2_25p2": section_lufs(samples, 22.2, 25.2),
        },
        "join_100ms_rms_dbfs": {
            "before": before, "after": after, "difference": round(after - before, 3),
        },
        "join_sample_delta_max": round(float(np.max(np.abs(samples[split] - samples[split - 1]))), 8),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-005", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    reference = args.reference_005.resolve()
    output_dir = args.output_dir.resolve()
    if "005_아리랑_대금_가야금" not in reference.name:
        raise ValueError(f"Expected the 005 reference: {reference}")
    reference_hash = arirang.sha256(reference)
    if reference_hash != REFERENCE_SHA256:
        raise ValueError(f"Unexpected 005 SHA-256: {reference_hash}")
    arirang.validate_output(reference)
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / OUTPUT_NAME
    metadata_path = output_dir / PROVENANCE_NAME
    existing = [str(path) for path in (destination, metadata_path) if path.exists()]
    if existing:
        raise FileExistsError(f"Will not overwrite: {existing}")

    source = np.asarray(arirang.decode(reference), dtype=np.float32).reshape(-1, 2)[:FRAMES].copy()
    source_stats = metrics(source)
    if abs(source_stats["whole"]["input_i"] - (-20.02)) > 0.1:
        raise ValueError("The 005 reference did not measure near -20.02 LUFS")

    frames = np.arange(FRAMES)
    after = (frames - int(JOIN_S * RATE)) / RATE
    local_gain_db = np.zeros(FRAMES, dtype=np.float32)
    active = after >= 0
    progress = np.clip(after[active] / RAMP_S, 0, 1)
    smoothstep = progress * progress * (3 - 2 * progress)
    local_gain_db[active] = START_REDUCTION_DB + (
        END_REDUCTION_DB - START_REDUCTION_DB
    ) * smoothstep
    local_gain = np.power(10.0, local_gain_db / 20.0).astype(np.float32)
    balanced = source * local_gain[:, None]
    common_gain_db = source_stats["whole"]["input_i"] - measure(balanced)["input_i"]
    balanced *= np.float32(10.0 ** (common_gain_db / 20.0))

    with tempfile.TemporaryDirectory(prefix=".bgm-011-", dir=output_dir) as temp:
        staged = Path(temp) / OUTPUT_NAME
        arirang.run(
            "ffmpeg", "-hide_banner", "-v", "error", "-y",
            "-f", "f32le", "-ar", str(RATE), "-ac", "2", "-i", "pipe:0",
            "-t", "38.4", "-c:a", "aac", "-b:a", "192k",
            "-metadata", f"comment={arirang.CREDIT}",
            "-metadata", f"copyright={arirang.CREDIT}",
            "-metadata", f"description={DESCRIPTION}",
            "-movflags", "+faststart", str(staged),
            input_bytes=np.ascontiguousarray(balanced, dtype="<f4").tobytes(),
        )
        arirang.validate_output(staged)
        actual = np.asarray(arirang.decode(staged), dtype=np.float32).reshape(-1, 2)[:FRAMES]
        actual_stats = metrics(actual)
        if abs(actual_stats["whole"]["input_i"] - source_stats["whole"]["input_i"]) > 0.1:
            raise ValueError("Output integrated LUFS does not match 005")
        if actual_stats["whole"]["input_tp"] > -1.5:
            raise ValueError("Output exceeds the -1.5 dBTP true-peak ceiling")
        provenance = {
            "status": "R&D listening comparison only; not accepted as game BGM",
            "credit": arirang.CREDIT,
            "reference_005": {"path": str(reference), "sha256": reference_hash},
            "underlying_gugak_source_sha256": SOURCE_SHA256,
            "processing": {
                "local_gain_db_first_phrase": 0.0,
                "local_gain_db_second_phrase_start": START_REDUCTION_DB,
                "local_gain_db_second_phrase_after_22p2s": END_REDUCTION_DB,
                "ramp": "3-second smoothstep from 19.2 to 22.2 s",
                "common_gain_db": round(common_gain_db, 4),
                "net_gain_db_first_phrase": round(common_gain_db, 4),
                "net_gain_db_second_phrase_start": round(common_gain_db + START_REDUCTION_DB, 4),
                "net_gain_db_second_phrase_after_22p2s": round(common_gain_db + END_REDUCTION_DB, 4),
                "pitch_or_speed_processing": False,
            },
            "reference_005_metrics": source_stats,
            "output_011": {"filename": OUTPUT_NAME, "sha256": arirang.sha256(staged), "metrics": actual_stats},
            "caveats": [
                "Common loudness normalization raises the first phrase too; do not describe this as changing only the second phrase.",
                "The natural decay-to-attack contrast at 19.2 s remains; this file is not a finished seamless loop.",
                "FFmpeg AAC may produce different file hashes for the same PCM on separate runs.",
            ],
        }
        staged_metadata = Path(temp) / PROVENANCE_NAME
        staged_metadata.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.link(staged, destination)
        os.link(staged_metadata, metadata_path)
    print(json.dumps({"output": str(destination), "sha256": provenance["output_011"]["sha256"], "metadata": str(metadata_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
