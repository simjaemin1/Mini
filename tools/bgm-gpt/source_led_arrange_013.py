#!/usr/bin/env python3
"""Build one R&D-only source-led Arirang phrase *arrangement*, not new-score audio.

Uses eight uninterrupted 4.8 s spans from one NGC Daegeum recording.  There
is no note-level selection, pitch shifting, time stretching, crossfade, or
synthetic note.  The only audio changes are span order, whole-piece constant
gain, and AAC encoding.  Default mode audits boundaries and writes nothing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile

import numpy as np


SOURCE_RELATIVE = Path("정리/악구/대금/민요/아리랑/w3-914-002__아리랑 02.flac")
SOURCE_SHA256 = "8b5316217a10d0242aa6ae35f8e36a7724b59ef57771e4d1c883d5d2c8d31887"
OUTPUT_FILENAME = "013_아리랑_원연주악구_재배열_RnD.m4a"
SIDECAR_FILENAME = "source_led_arrangement_013.json"
SAMPLE_RATE = 44100
FRAMES_PER_BLOCK = round(4.8 * SAMPLE_RATE)
TERMINAL_SILENCE_TRIM_SECONDS = 0.1
ORDER = ("A", "B", "A", "D", "C", "B", "A", "D")
# C/D meet inside the original low-energy breath at 14.30 s.  Cutting at
# nominal 14.40 s would slice into D's already-loud first attack.
BLOCKS = {"A": (0.0, 4.8), "B": (4.8, 9.6),
          "C": (9.6, 14.3), "D": (14.3, 19.2)}
CREDIT = "국악기 음원 제공 — 국립국악원 (공공누리 제1유형)"


def run(*args: str, stdin: bytes | None = None) -> subprocess.CompletedProcess[bytes]:
    result = subprocess.run(args, input=stdin, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"{' '.join(args)}\n{result.stderr.decode(errors='replace')}")
    return result


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fp:
        for buf in iter(lambda: fp.read(1 << 20), b""):
            h.update(buf)
    return h.hexdigest()


def decode(source: Path) -> np.ndarray:
    if digest(source) != SOURCE_SHA256:
        raise ValueError("Original NGC source SHA-256 changed")
    raw = run("ffmpeg", "-v", "error", "-i", str(source), "-ac", "1",
              "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1").stdout
    result = np.frombuffer(raw, dtype="<f4").copy()
    if len(result) != 4 * FRAMES_PER_BLOCK:
        raise ValueError(f"Source frame count unexpected: {len(result)}")
    return result


def rms_db(samples: np.ndarray) -> float:
    if len(samples) == 0:
        return float("-inf")
    rms = math.sqrt(float(np.mean(samples.astype(np.float64) ** 2)))
    return 20 * math.log10(max(rms, 1e-12))


def frame(seconds: float) -> int:
    return round(seconds * SAMPLE_RATE)


def boundary_audit(source: np.ndarray) -> list[dict]:
    results = []
    for i in range(len(ORDER) - 1):
        left, right = ORDER[i], ORDER[i + 1]
        end = frame(BLOCKS[left][1])
        start = frame(BLOCKS[right][0])
        item = {"join": f"{left}->{right}",
                "arrangement_second": round(sum(BLOCKS[name][1] - BLOCKS[name][0] for name in ORDER[:i + 1]), 3)}
        for ms in (1, 10, 50):
            n = round(ms / 1000 * SAMPLE_RATE)
            item[f"before_{ms}ms_dbfs"] = round(rms_db(source[end - n:end]), 2)
            item[f"after_{ms}ms_dbfs"] = round(rms_db(source[start:start + n]), 2)
        item["sample_step_dbfs"] = round(20 * math.log10(max(abs(float(source[start]) - float(source[end - 1])), 1e-12)), 2)
        results.append(item)
    return results


def measure_raw(audio: np.ndarray) -> dict:
    raw = run(
        "ffmpeg", "-hide_banner", "-nostats", "-f", "f32le", "-ar", str(SAMPLE_RATE),
        "-ac", "1", "-i", "pipe:0", "-af", "loudnorm=I=-20:TP=-1.5:LRA=11:print_format=json",
        "-f", "null", "-", stdin=audio.astype("<f4", copy=False).tobytes(),
    )
    match = re.search(r'\{\s*"input_i".*?\}', raw.stderr.decode(errors="replace"), re.S)
    if not match:
        raise ValueError("Loudness measurement missing")
    data = json.loads(match.group())
    return {key: float(data[key]) for key in ("input_i", "input_tp", "input_lra")}


def measure_file(path: Path) -> dict:
    raw = run("ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
              "-af", "loudnorm=I=-20:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-")
    match = re.search(r'\{\s*"input_i".*?\}', raw.stderr.decode(errors="replace"), re.S)
    if not match:
        raise ValueError("Encoded loudness measurement missing")
    data = json.loads(match.group())
    return {key: float(data[key]) for key in ("input_i", "input_tp", "input_lra")}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gugak-root", type=Path, required=True,
                        help="Root of the downloaded NGC corpus containing 정리/악구")
    parser.add_argument("--output-dir", type=Path,
                        help="Where the one numbered audition and its sidecar will be written")
    parser.add_argument("--render", action="store_true", help="Write the one numbered R&D audition and sidecar")
    args = parser.parse_args()
    source_path = args.gugak_root / SOURCE_RELATIVE
    source = decode(source_path)
    joins = boundary_audit(source)
    result = {
        "kind": "source_led_original_phrase_rearrangement_not_authored_score_render",
        "status": "unreviewed_rnd_only",
        "source_relative_path": SOURCE_RELATIVE.as_posix(),
        "source_sha256": SOURCE_SHA256,
        "source_duration_seconds": 19.2, "sample_rate_hz": SAMPLE_RATE,
        "source_blocks_seconds": {k: [a, b] for k, (a, b) in BLOCKS.items()},
        "arrangement": list(ORDER),
        "duration_seconds": round(sum(BLOCKS[name][1] - BLOCKS[name][0] for name in ORDER)
                                  - TERMINAL_SILENCE_TRIM_SECONDS, 3),
        "terminal_silence_trim_seconds": TERMINAL_SILENCE_TRIM_SECONDS,
        "trimmed_source_tail_rms_dbfs": round(rms_db(source[frame(19.1):frame(19.2)]), 2),
        "joins": joins,
        "claims": {"new_note_sequence": False, "new_daegeum_performance": False,
                   "authored_score_render": False, "music_quality_approved": False,
                   "game_asset": False, "original_source_modified": False},
        "credit": CREDIT,
    }
    if not args.render:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    if args.output_dir is None:
        parser.error("--render requires --output-dir")
    output_dir = args.output_dir
    output = output_dir / OUTPUT_FILENAME
    sidecar = output_dir / SIDECAR_FILENAME
    # Fail before writing if a candidate join is at a high-energy waveform
    # discontinuity or has an unsupported RMS change at an alleged rest.
    if any(j["sample_step_dbfs"] > -38 for j in joins):
        raise ValueError("Join sample step too high for an unprocessed cut")
    assembled = np.concatenate([
        source[frame(a):frame(b)]
        for block in ORDER for a, b in (BLOCKS[block],)
    ])
    if rms_db(assembled[-frame(TERMINAL_SILENCE_TRIM_SECONDS):]) > -80:
        raise ValueError("Terminal crop would remove audible source content")
    assembled = assembled[:-frame(TERMINAL_SILENCE_TRIM_SECONDS)]
    if len(assembled) != frame(result["duration_seconds"]):
        raise ValueError("Assembled duration mismatch")
    before = measure_raw(assembled)
    gain_db = -20.0 - before["input_i"]
    if before["input_tp"] + gain_db > -1.8:
        raise ValueError("No headroom for AAC reconstruction")
    if output.exists() or sidecar.exists():
        raise FileExistsError("Unreviewed output or sidecar already exists")
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="bgm-source-led-") as temporary:
        wav = Path(temporary) / "arrangement.wav"
        run("ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SAMPLE_RATE),
            "-ac", "1", "-i", "pipe:0", "-c:a", "pcm_f32le", str(wav),
            stdin=assembled.astype("<f4", copy=False).tobytes())
        run("ffmpeg", "-v", "error", "-i", str(wav), "-af", f"volume={gain_db:.8f}dB",
            "-ac", "2", "-c:a", "aac", "-b:a", "192k", "-metadata", f"comment={CREDIT}",
            "-metadata", "title=Arirang NGC Daegeum source-led rearrangement — unreviewed R&D",
            str(output))
    after = measure_file(output)
    if not (-20.2 <= after["input_i"] <= -19.8 and after["input_tp"] <= -1.5):
        raise ValueError(f"Encoded loudness/peak gate failed: {after}")
    result.update({"global_gain_db": round(gain_db, 6), "raw_loudness": before,
                   "encoded_loudness": after, "output_filename": OUTPUT_FILENAME,
                   "output_sha256": digest(output)})
    sidecar.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "loudness": after,
                      "joins": joins, "sha256": result["output_sha256"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
