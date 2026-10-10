#!/usr/bin/env python3
"""Private source-led daegeum audition; not an authored-score or model render.

Preserve the complete 001 and 002 phrases, then repeat the uninterrupted
second half of 002 as a short coda. No note cuts, pitch shift, time stretch,
crossfade, individual-note gain, or synthetic instrument is used.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np


DEFAULT_OUTPUT_DIR = Path("/Users/simjaemin1/Mini/_bgm/gpt/청취/원연주_새변주_시험")
SCRATCH_ROOT = Path("/Users/simjaemin1/Mini/_bgm/gpt").resolve()
REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_DIR = Path("/Users/simjaemin1/Mini/_bgm/국악원/정리/악구/대금/민요/아리랑")
SOURCES = {
    "001": ("w3-914-001__아리랑 01.flac", "e29a65963d39aba6ef98c641c558d528d33858dbbe0d616971133d0b35d2f876"),
    "002": ("w3-914-002__아리랑 02.flac", "8b5316217a10d0242aa6ae35f8e36a7724b59ef57771e4d1c883d5d2c8d31887"),
}
SAMPLE_RATE = 44_100
PLAN = (("001", 0.0, 19.2), ("002", 0.0, 19.2), ("002", 9.6, 19.2))
OUTPUT_FILENAME = "014_대금_C조_앞절뒷절후렴_원연주_RnD.m4a"
SIDECAR_FILENAME = "014_제작정보_원연주_앞절뒷절후렴.json"
CREDIT = "국악기 음원 제공 — 국립국악원 (공공누리 제1유형)"


def run(*args: str, data: bytes | None = None) -> subprocess.CompletedProcess[bytes]:
    proc = subprocess.run(args, input=data, capture_output=True)
    if proc.returncode:
        raise RuntimeError(f"{' '.join(args)}\n{proc.stderr.decode(errors='replace')}")
    return proc


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def frame(seconds: float) -> int:
    return round(seconds * SAMPLE_RATE)


def rms_db(audio: np.ndarray) -> float:
    return round(20 * math.log10(max(math.sqrt(float(np.mean(audio.astype(np.float64) ** 2))), 1e-12)), 2)


def decode(path: Path) -> np.ndarray:
    raw = run("ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1").stdout
    return np.frombuffer(raw, dtype="<f4").copy()


def meter(audio: np.ndarray) -> dict[str, float]:
    report = run("ffmpeg", "-hide_banner", "-nostats", "-f", "f32le", "-ar", str(SAMPLE_RATE),
                 "-ac", "1", "-i", "pipe:0", "-af", "loudnorm=I=-20:TP=-1.5:LRA=11:print_format=json",
                 "-f", "null", "-", data=audio.astype("<f4", copy=False).tobytes())
    match = re.search(r'\{\s*"input_i".*?\}', report.stderr.decode(errors="replace"), re.S)
    if not match:
        raise ValueError("Loudness meter did not return JSON")
    values = json.loads(match.group())
    return {key: float(values[key]) for key in ("input_i", "input_tp", "input_lra")}


def join_audit(parts: list[np.ndarray]) -> list[dict]:
    results = []
    for i, left in enumerate(parts):
        right = parts[(i + 1) % len(parts)]
        item = {"join": f"{i + 1}->{(i + 1) % len(parts) + 1}",
                "is_loop": i == len(parts) - 1,
                "sample_step_dbfs": round(20 * math.log10(max(abs(float(right[0]) - float(left[-1])), 1e-12)), 2)}
        for milliseconds in (1, 10, 50, 100):
            count = round(SAMPLE_RATE * milliseconds / 1000)
            item[f"before_{milliseconds}ms_dbfs"] = rms_db(left[-count:])
            item[f"after_{milliseconds}ms_dbfs"] = rms_db(right[:count])
        results.append(item)
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR,
                        help="Audition directory outside the repository and NGC source tree")
    args = parser.parse_args()
    output_dir = args.output_dir.resolve()
    source_dir = SOURCE_DIR.resolve()
    if SCRATCH_ROOT not in output_dir.parents:
        raise ValueError("Auditions must stay inside Mini/_bgm/gpt scratch")
    if output_dir == REPO_ROOT or REPO_ROOT in output_dir.parents:
        raise ValueError("Auditions must not be written in the repository tree")
    if output_dir == source_dir or source_dir in output_dir.parents:
        raise ValueError("NGC originals are read-only")
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / OUTPUT_FILENAME
    sidecar = output_dir / SIDECAR_FILENAME
    if output.exists() or sidecar.exists():
        raise FileExistsError("This unreviewed audition or sidecar already exists")
    decoded: dict[str, np.ndarray] = {}
    for key, (name, expected_hash) in SOURCES.items():
        path = SOURCE_DIR / name
        if sha256(path) != expected_hash:
            raise ValueError(f"NGC original changed: {path}")
        decoded[key] = decode(path)
        if len(decoded[key]) != frame(19.2):
            raise ValueError(f"Unexpected source length: {path}")
    parts = [decoded[key][frame(start):frame(end)] for key, start, end in PLAN]
    if any(len(part) != frame(end - start) for part, (_, start, end) in zip(parts, PLAN)):
        raise ValueError("Wrong source span length")
    joins = join_audit(parts)
    if any(item["sample_step_dbfs"] > -38 for item in joins):
        raise ValueError("Audible-risk source cut; do not render")
    if joins[1]["after_10ms_dbfs"] > -55:
        raise ValueError("Repeated coda does not begin at a breath")
    assembled = np.concatenate(parts)
    if len(assembled) != frame(48.0):
        raise ValueError("Wrong assembled length")
    raw_meter = meter(assembled)
    gain_db = -20.0 - raw_meter["input_i"]
    if raw_meter["input_tp"] + gain_db > -2.0:
        raise ValueError("Insufficient AAC peak headroom")
    with tempfile.TemporaryDirectory(prefix="ngc-coda-", dir=output_dir) as temp:
        candidate = Path(temp) / "candidate.m4a"
        run("ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1",
            "-i", "pipe:0", "-af", f"volume={gain_db:.8f}dB", "-ac", "2", "-c:a", "aac",
            "-b:a", "192k", "-metadata", f"comment={CREDIT}",
            "-metadata", "title=NGC Daegeum Arirang C-key phrase/coda audition — unreviewed R&D",
            str(candidate), data=assembled.astype("<f4", copy=False).tobytes())
        file_meter = meter(decode(candidate))
        encoded = decode(candidate)
        exact = encoded[:len(assembled)]
        if len(exact) != len(assembled):
            raise ValueError("AAC decode shorter than the 48-second grid")
        codec_parts = [exact[:frame(19.2)], exact[frame(19.2):frame(38.4)], exact[frame(38.4):]]
        codec_joins = join_audit(codec_parts)
        if not (-20.2 <= file_meter["input_i"] <= -19.8 and file_meter["input_tp"] <= -1.5):
            raise ValueError(f"Encoded loudness failed: {file_meter}")
        if any(item["sample_step_dbfs"] > -38 for item in codec_joins):
            raise ValueError("AAC join step failed")
        report = {
            "kind": "source_led_contiguous_ngc_daegeum_phrase_coda_not_authored_score_or_model",
            "status": "unreviewed_private_rnd_only",
            "credit": CREDIT,
            "source_files": {key: {"path": str(SOURCE_DIR / name), "sha256": digest}
                             for key, (name, digest) in SOURCES.items()},
            "source_key": "C (from prior score/source audit; 003/004 E-flat excluded)",
            "segments": [{"source": key, "start_seconds": start, "end_seconds": end,
                          "duration_seconds": end - start, "rms_dbfs": rms_db(part)}
                         for (key, start, end), part in zip(PLAN, parts)],
            "duration_seconds": 48.0,
            "sample_rate_hz": SAMPLE_RATE,
            "channels": 2,
            "transformations": ["whole-piece constant gain", "AAC stereo encoding"],
            "global_gain_db": round(gain_db, 6),
            "source_join_audit": joins,
            "decoded_join_audit": codec_joins,
            "decoded_aac_padding_frames": len(encoded) - len(assembled),
            "raw_loudness": raw_meter,
            "encoded_loudness": file_meter,
            "claims": {"authored_new_8bar_melody": False, "ml_model_output": False,
                       "new_instrument_performance": False, "musically_approved": False,
                       "game_asset": False, "browser_loop_verified": False,
                       "original_sources_modified": False},
        }
        candidate.rename(output)
    report["output"] = str(output)
    report["output_sha256"] = sha256(output)
    sidecar.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "duration": 48.0,
                      "loudness": file_meter, "joins": codec_joins}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
