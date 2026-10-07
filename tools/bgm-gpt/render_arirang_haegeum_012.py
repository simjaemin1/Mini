#!/usr/bin/env python3
"""Render unapproved Arirang 012: haegeum first, daegeum second.

The first daegeum phrase is *replaced*, never masked. The complete 24-second
haegeum source carries its natural tail past the 19.2-second handoff. The
second-phrase stems use 011's three-second relative level curve; the crossing
haegeum tail does not, preserving its continuity. Originals are read-only.

    python3 tools/bgm-gpt/render_arirang_haegeum_012.py \
      --gugak-root /path/to/_bgm/국악원 \
      --reference-005 /path/to/005_아리랑_대금_가야금.m4a \
      --reference-011 /path/to/011_아리랑_대금가야금_뒷절음량균형.m4a \
      --output-dir /new/listening/directory
"""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import tempfile

import numpy as np

import render_arirang_layers as arirang


OUTPUT_NAME = "012_아리랑_앞해금_뒤대금_가야금.m4a"
PROVENANCE_NAME = "제작정보_해금교대_012.json"
REFERENCE_005_SHA256 = "388ee8fc8ddffd354f18b0715dde486e35391f529c67e8a551afe3c02a44379e"
REFERENCE_011_SHA256 = "5ce0fd62e03cd2f530897020da0c733cb4a130b6bc50a675c796f88e9eb26497"
SOURCES = {
    "haegeum_001": (
        "해금/경기민요/아리랑/s3-914-001__아리랑 001.flac",
        "f67c46faba26958541f3c1bbf4b677e1847ca97037ea3e16b0669b4c3b1cdc03",
    ),
    "gayageum_001": (
        "가야금/경기민요/아리랑/s1-914-001__아리랑 01.flac",
        "2c7e7d0b7fde41709ccf75ffd7a4ffc076ab3d77126d3490983d2e38ecaea110",
    ),
    "gayageum_002": (
        "가야금/경기민요/아리랑/s1-914-002__아리랑 02.flac",
        "879bf89c4633ccd08ac62eaafce5d66121a5842cadb4f7b9874e746e3b9d2533",
    ),
    "daegeum_001_reference": (
        "대금/민요/아리랑/w3-914-001__아리랑 01.flac",
        "e29a65963d39aba6ef98c641c558d528d33858dbbe0d616971133d0b35d2f876",
    ),
    "daegeum_002": (
        "대금/민요/아리랑/w3-914-002__아리랑 02.flac",
        "8b5316217a10d0242aa6ae35f8e36a7724b59ef57771e4d1c883d5d2c8d31887",
    ),
}
GAYAGEUM_GAIN_DB = {"001": -10.11, "002": -7.07}  # Original 005 stem gains.
DESCRIPTION = "아리랑 앞절 해금 교대, 뒤 대금; 011과 동일 뒷절 3초 레벨 곡선 — 미채택 R&D"
RATE = arirang.RATE
PHRASE = arirang.PHRASE_SAMPLES
FRAMES = arirang.TOTAL_SAMPLES


def pcm(path: Path) -> np.ndarray:
    decoded = np.asarray(arirang.decode(path), dtype=np.float32)
    if len(decoded) % 2:
        raise ValueError(f"Odd stereo sample count: {path}")
    return decoded.reshape(-1, 2).copy()


def level(samples: np.ndarray) -> dict[str, float]:
    return arirang.measure(samples=np.ascontiguousarray(samples, dtype="<f4"))


def gain_db(samples: np.ndarray, db: float) -> np.ndarray:
    return samples * np.float32(10.0 ** (db / 20.0))


def second_phrase_curve() -> np.ndarray:
    seconds = np.arange(PHRASE, dtype=np.float64) / RATE
    progress = np.clip(seconds / 3.0, 0.0, 1.0)
    smoothstep = progress * progress * (3.0 - 2.0 * progress)
    local_db = -4.0 + 1.5 * smoothstep
    return np.power(10.0, local_db / 20.0).astype(np.float32)


def window_lufs(samples: np.ndarray, start: float, end: float) -> float:
    return level(samples[round(start * RATE):round(end * RATE)])["input_i"]


def check_sources(root: Path) -> tuple[dict[str, Path], dict[str, str]]:
    paths = {}
    hashes = {}
    for name, (relative, expected) in SOURCES.items():
        path = root / "정리/악구" / relative
        actual = arirang.sha256(path)
        if actual != expected:
            raise ValueError(f"Source SHA-256 mismatch: {name} {actual}")
        paths[name], hashes[name] = path, actual
    return paths, hashes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gugak-root", required=True, type=Path)
    parser.add_argument("--reference-005", required=True, type=Path)
    parser.add_argument("--reference-011", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    root = args.gugak_root.resolve()
    ref005 = args.reference_005.resolve()
    ref011 = args.reference_011.resolve()
    output_dir = args.output_dir.resolve()
    for path, expected in ((ref005, REFERENCE_005_SHA256),
                           (ref011, REFERENCE_011_SHA256)):
        actual = arirang.sha256(path)
        if actual != expected:
            raise ValueError(f"Reference SHA-256 mismatch: {path} {actual}")
    for protected in (root, root / "raw", root / "정리"):
        if output_dir == protected or protected in output_dir.parents:
            parser.error("Output must be outside the National Gugak Center sources")
    if output_dir == ref005.parent or output_dir == ref011.parent:
        # The numbered user-facing directory is deliberately not a default
        # render target; a separately QA'd file can be promoted later.
        parser.error("Render into a new experiment directory first")
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / OUTPUT_NAME
    info_path = output_dir / PROVENANCE_NAME
    if destination.exists() or info_path.exists():
        raise FileExistsError("Refusing to overwrite an existing audition")
    source_paths, source_hashes = check_sources(root)
    audio = {name: pcm(path) for name, path in source_paths.items()}
    if len(audio["haegeum_001"]) < 24 * RATE - 10:
        raise ValueError("Haegum source is missing its original 19.2s+ tail")
    for name in ("gayageum_001", "gayageum_002", "daegeum_001_reference", "daegeum_002"):
        if len(audio[name]) != PHRASE:
            raise ValueError(f"Unexpected phrase length for {name}")

    haegeum_gain = (level(audio["daegeum_001_reference"])["input_i"]
                    - level(audio["haegeum_001"][:PHRASE])["input_i"])
    mix = np.zeros((FRAMES, 2), dtype=np.float32)
    haegeum = gain_db(audio["haegeum_001"], haegeum_gain)
    mix[:len(haegeum)] += haegeum  # Full 24 s; no boundary cut or fade.
    mix[:PHRASE] += gain_db(audio["gayageum_001"], GAYAGEUM_GAIN_DB["001"])
    second = (audio["daegeum_002"]
              + gain_db(audio["gayageum_002"], GAYAGEUM_GAIN_DB["002"]))
    mix[PHRASE:] += second * second_phrase_curve()[:, None]
    reference_loudness = arirang.measure(path=ref011)
    master_gain = reference_loudness["input_i"] - level(mix)["input_i"]

    with tempfile.TemporaryDirectory(prefix=".bgm-012-", dir=output_dir) as temp:
        stage = Path(temp) / OUTPUT_NAME
        arirang.run(
            "ffmpeg", "-hide_banner", "-v", "error", "-y", "-threads", "1",
            "-f", "f32le", "-ar", str(RATE), "-ac", "2", "-i", "pipe:0",
            "-af", f"volume={master_gain:.8f}dB", "-t", "38.4", "-c:a", "aac",
            "-b:a", "192k", "-threads", "1", "-movflags", "+faststart",
            "-metadata", f"comment={arirang.CREDIT}",
            "-metadata", f"copyright={arirang.CREDIT}",
            "-metadata", f"description={DESCRIPTION}", str(stage),
            input_bytes=np.ascontiguousarray(mix, dtype="<f4").tobytes(),
        )
        decoded = pcm(stage)[:FRAMES]
        if len(decoded) != FRAMES or np.max(np.abs(decoded)) >= 1:
            raise ValueError("Unexpected duration or clipped decoded samples")
        final_level = arirang.measure(path=stage)
        if (abs(final_level["input_i"] - reference_loudness["input_i"]) > 0.05
                or final_level["input_tp"] > -1.5):
            raise ValueError("Output loudness or true peak outside audition limit")
        before = window_lufs(decoded, 16.2, 19.2)
        after = window_lufs(decoded, 19.2, 22.2)
        metadata = {
            "status": "R&D listening comparison only; not accepted as game BGM",
            "credit": arirang.CREDIT,
            "output": str(destination),
            "output_sha256": arirang.sha256(stage),
            "sources": {name: {"path": str(source_paths[name]), "sha256": source_hashes[name]}
                        for name in SOURCES},
            "reference_005": {"path": str(ref005), "sha256": REFERENCE_005_SHA256},
            "reference_011": {"path": str(ref011), "sha256": REFERENCE_011_SHA256},
            "processing": {
                "haegeum_replaces_first_daegeum": True,
                "first_haegeum_full_original_tail_carried": True,
                "haegeum_gain_db": round(haegeum_gain, 3),
                "gayageum_gain_db_by_phrase": GAYAGEUM_GAIN_DB,
                "second_phrase_new_stems_curve": "-4.0 dB at 19.2 s, smoothstep to -2.5 dB at 22.2 s",
                "crossing_haegeum_tail_curve": "none; preserve original continuity",
                "master_gain_db": round(master_gain, 3),
                "pitch_or_time_stretch": False,
                "aac_generations_from_original_pcm": 1,
            },
            "format": {"duration_s": 38.4, "sample_rate": RATE, "channels": 2, "codec": "AAC"},
            "reference_011_loudness": reference_loudness,
            "output_loudness": final_level,
            "join_3s_lufs": {"before": before, "after": after,
                              "rise": round(after - before, 2)},
            "join_one_sample_step": round(float(np.max(np.abs(decoded[PHRASE] - decoded[PHRASE-1]))), 8),
            "decoded_clipped_samples": int(np.sum(np.abs(decoded) >= 1)),
            "caveats": [
                "A natural, stronger attack still occurs at the 19.2-second phrase boundary.",
                "Musical timbre and quality require user listening; QA is technical only.",
                "AAC output bytes may differ across otherwise identical renders.",
            ],
        }
        staged_info = Path(temp) / PROVENANCE_NAME
        staged_info.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.link(stage, destination)
        os.link(staged_info, info_path)
    print(json.dumps({"output": str(destination), "sha256": metadata["output_sha256"],
                      "provenance": str(info_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
