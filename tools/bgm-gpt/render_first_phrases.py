#!/usr/bin/env python3
"""Render three controlled listening copies from five intact gugak phrases.

This script reads its inputs and writes only to --output-dir.  It never edits
the source recordings.  The repertoire/ID pairing remains provisional until
the National Gugak Center's serial download audit finishes.
"""

import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import re
import statistics
import subprocess


RATE = 44100
IDS = [f"w3-714-{n:03d}" for n in range(1, 6)]
CREDIT = "국악기 음원 제공 — 국립국악원 (공공누리 제1유형)"
TARGET_LUFS = -20.0
MAX_TRUE_PEAK = -1.5
# FFmpeg afftdn at 44.1 kHz preserves the buffer length but shifts its signal
# by 1,102 samples.  Verified against all five source phrases before AAC.
AFFTDN_DELAY_SAMPLES = 1102
NAMES = (
    "001_대금_원음연결.m4a",
    "002_대금_악구음량균형.m4a",
    "003_대금_음량균형_약한잡음정제.m4a",
)


def run(*args, input_bytes=None):
    result = subprocess.run(args, input=input_bytes, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"{' '.join(map(str, args))}\n{result.stderr.decode(errors='replace')}")
    return result


def probe(path):
    result = run(
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=sample_rate,channels", "-of", "json", str(path),
    )
    return json.loads(result.stdout)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def decode(path):
    result = run(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
        "-ar", str(RATE), "-ac", "1", "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1",
    )
    samples = array("f")
    samples.frombytes(result.stdout)
    return samples


def measure(samples):
    result = run(
        "ffmpeg", "-hide_banner", "-nostats", "-f", "f32le", "-ar", str(RATE),
        "-ac", "1", "-i", "pipe:0", "-af",
        "loudnorm=I=-20:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-",
        input_bytes=samples.tobytes(),
    )
    match = re.search(r'\{\s*"input_i".*?\}', result.stderr.decode(), re.S)
    if not match:
        raise RuntimeError("Could not read FFmpeg loudness measurement")
    values = json.loads(match.group())
    return {key: float(values[key]) for key in ("input_i", "input_tp", "input_lra")}


def denoise(samples):
    result = run(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "f32le",
        "-ar", str(RATE), "-ac", "1", "-i", "pipe:0", "-af",
        "afftdn=nr=5:nf=-55:gs=1", "-ar", str(RATE), "-ac", "1",
        "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1",
        input_bytes=samples.tobytes(),
    )
    out = array("f")
    out.frombytes(result.stdout)
    if len(out) != len(samples):
        raise ValueError(f"afftdn changed sample count: {len(out)} != {len(samples)}")
    aligned = out[AFFTDN_DELAY_SAMPLES:]
    aligned.extend([0.0] * AFFTDN_DELAY_SAMPLES)
    return aligned


def write_m4a(path, samples, gain_db, description):
    run(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le",
        "-ar", str(RATE), "-ac", "1", "-i", "pipe:0", "-af",
        f"volume={gain_db:.6f}dB", "-ar", str(RATE), "-ac", "1",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        "-metadata", f"comment={CREDIT}",
        "-metadata", f"description={description}", str(path),
        input_bytes=samples.tobytes(),
    )


def resolve_source(source_id, source_dir, gugak_root):
    if source_dir:
        direct = source_dir / f"{source_id}.flac"
        if direct.is_file():
            return direct
    if gugak_root:
        returned_stem = source_id
        name_map = gugak_root / "tools" / ".map_phrase.tsv"
        if name_map.is_file():
            with name_map.open(encoding="utf-8") as handle:
                for line in handle:
                    fields = line.rstrip("\n").split("\t")
                    if len(fields) == 3 and fields[0] == source_id and fields[1]:
                        returned_stem = Path(fields[1]).stem
        organized = gugak_root / "정리" / "악구" / "대금"
        matches = sorted(organized.rglob(f"{returned_stem}__*.flac")) if organized.exists() else []
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            raise ValueError(f"multiple organized sources for {source_id}: {matches}")
    raise FileNotFoundError(f"no source file for {source_id}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument("--gugak-root", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    if not args.source_dir and not args.gugak_root:
        parser.error("provide --source-dir during download or --gugak-root after organization")
    args.output_dir.mkdir(parents=True, exist_ok=True)

    sources = [resolve_source(source_id, args.source_dir, args.gugak_root) for source_id in IDS]
    phrases = []
    source_info = []
    for source_id, source_path in zip(IDS, sources):
        if not source_path.is_file():
            raise FileNotFoundError(source_path)
        metadata = probe(source_path)
        stream = metadata["streams"][0]
        if int(stream["sample_rate"]) != RATE or int(stream["channels"]) != 1:
            raise ValueError(f"unexpected source format: {source_path}")
        samples = decode(source_path)
        if len(samples) != 7.2 * RATE:
            raise ValueError(f"unexpected phrase length: {source_path}: {len(samples)}")
        loudness = measure(samples)
        phrases.append(samples)
        source_info.append({"id": source_id, "path": str(source_path),
                            "sha256": sha256(source_path),
                            "duration_s": len(samples) / RATE, **loudness})

    median_i = statistics.median(info["input_i"] for info in source_info)
    phrase_gains = [median_i - info["input_i"] for info in source_info]
    raw = array("f")
    balanced = array("f")
    for phrase, gain_db in zip(phrases, phrase_gains):
        raw.extend(phrase)
        scalar = 10 ** (gain_db / 20)
        balanced.extend(sample * scalar for sample in phrase)
    cleaned = denoise(balanced)
    versions = (raw, balanced, cleaned)
    descriptions = (
        "다섯 완전 악구를 개별 보정 없이 차례로 연결(비교용 공통 음량 조정만)",
        "악구별 평균 음량 차이만 보정, 내부 강약과 길이 그대로",
        "악구별 음량 보정 뒤 약한 FFT 잡음 정제(nr=5, nf=-55)",
    )
    measurements = [measure(version) for version in versions]
    common_target = min(
        TARGET_LUFS,
        *(m["input_i"] + MAX_TRUE_PEAK - m["input_tp"] for m in measurements),
    )
    if not math.isfinite(common_target):
        raise ValueError("invalid common loudness target")

    outputs = []
    for name, samples, description, loudness in zip(
        NAMES, versions, descriptions, measurements
    ):
        gain_db = common_target - loudness["input_i"]
        output_path = args.output_dir / name
        write_m4a(output_path, samples, gain_db, description)
        outputs.append({"path": str(output_path), "sha256": sha256(output_path),
                        "description": description,
                        "gain_db": round(gain_db, 4), "source_loudness": loudness,
                        "duration_s": len(samples) / RATE})

    info = {"credit": CREDIT, "identification": "provisional until finish.py map completes",
            "sample_rate": RATE, "common_target_lufs": common_target,
            "denoise_delay_compensated_samples": AFFTDN_DELAY_SAMPLES,
            "source_median_lufs": median_i,
            "source_phrase_gains_db": [round(gain, 4) for gain in phrase_gains],
            "sources": source_info, "outputs": outputs}
    info_path = args.output_dir / "제작정보.json"
    info_path.write_text(json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(info, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
