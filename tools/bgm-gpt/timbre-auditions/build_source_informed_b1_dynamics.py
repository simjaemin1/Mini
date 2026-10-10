#!/usr/bin/env python3
"""Private B1 amplitude-only A/B, guided by the NGC Ari 002 final C5.

This does not transfer the source performance, train a model, or repair the
DDSP decoder's timbre. It deliberately changes only the final notated C5 and
its release, with a low-rate, <=2 dB gain contour. All upstream score controls,
note timing, vibrato, breaths and all earlier audio samples stay unchanged.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np


ROOT = Path("/Users/simjaemin1/Mini/_bgm/gpt/새선율_시험")
SOURCE = Path("/Users/simjaemin1/Mini/_bgm/국악원/정리/악구/대금/민요/아리랑/w3-914-002__아리랑 02.flac")
DRY = Path("/Users/simjaemin1/.codex/worktrees/durango-mini-bgm-rnd-01/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20261010-075800-b1-final-c-private/published_daegeum_decoder_dry_authorial_gate.wav")
B1 = ROOT / "비공개_전체곡_실험/새선율_8마디_대금모델_끝음약비브라토_B1_권리미확인_비공개.m4a"
PLAN = ROOT / "new_ari_8bar_ddsp_gugak_legacy100_b1_final_c_vibrato_r1.json"
DEFAULT_OUTPUT_DIR = ROOT / "음색_시험/다이내믹"
OUTPUT_NAME = "B1_끝음_C5_원연주참고_완만한음량곡선_비공개.m4a"
REPORT_NAME = "B1_끝음_C5_원연주참고_완만한음량곡선_제작정보.json"
TEMP_NAME = ".B1_dynamic_loudness_probe.m4a"
OUT = DEFAULT_OUTPUT_DIR / OUTPUT_NAME
REPORT = DEFAULT_OUTPUT_DIR / REPORT_NAME
TEMP = DEFAULT_OUTPUT_DIR / TEMP_NAME

PINNED = {
    SOURCE: "8b5316217a10d0242aa6ae35f8e36a7724b59ef57771e4d1c883d5d2c8d31887",
    DRY: "c74bce36480206cfd3123b8ac3ca5975fe31dfb4a645502ef3fe97cfb22d9d4d",
    B1: "1e892c40c2025baccd13424d0c7fb9e7ec5dc48d22054f79109a3fb63703ecb4",
    PLAN: "a09a8daa9cc68c636c7fc3ecc86aea912dd182250caa4db9eec2f3680160b244",
}
SAMPLE_RATE = 16000
SCORE_SECONDS = 19.2
# These broad anchor points follow the source's slow b08 C5 rise-and-fall, not
# its fast amplitude fluctuations. The source itself has a much wider range.
# The gain is intentionally bounded to avoid making a loudness-flutter artifact.
KNOTS_SECONDS_DB = [
    (16.800, 0.0),
    (17.100, 0.55),
    (17.500, 2.0),
    (17.900, 1.15),
    (18.300, 0.15),
    (18.600, -0.35),
    (18.667, -0.35),
    (18.950, 0.0),
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decode_float(path: Path, rate: int) -> np.ndarray:
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-i", str(path), "-ac", "1",
         "-ar", str(rate), "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1"],
        capture_output=True, check=True,
    )
    return np.frombuffer(proc.stdout, dtype="<f4").astype(np.float64)


def read_dry() -> np.ndarray:
    with wave.open(str(DRY), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getframerate() != SAMPLE_RATE or wav.getsampwidth() != 2:
            raise ValueError("pinned dry B1 format changed")
        if wav.getnframes() != round(SCORE_SECONDS * SAMPLE_RATE):
            raise ValueError("pinned dry B1 duration changed")
        return np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float64) / 32768.0


def smoothstep(x: np.ndarray) -> np.ndarray:
    return x * x * (3.0 - 2.0 * x)


def curve_db(length: int) -> np.ndarray:
    """C1-continuous, zero slope at all low-rate contour anchors."""
    t = np.arange(length, dtype=np.float64) / SAMPLE_RATE
    gain = np.zeros(length, dtype=np.float64)
    for (left_t, left_db), (right_t, right_db) in zip(KNOTS_SECONDS_DB, KNOTS_SECONDS_DB[1:]):
        which = (t >= left_t) & (t < right_t)
        phase = np.clip((t[which] - left_t) / (right_t - left_t), 0.0, 1.0)
        gain[which] = left_db + (right_db - left_db) * smoothstep(phase)
    return gain


def measure_lufs(path: Path) -> float:
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "info", "-i", str(path), "-af",
         "loudnorm=I=-20:TP=-1.0:LRA=7:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True, check=True,
    )
    found = re.search(r'"input_i"\s*:\s*"(-?[\d.]+)"', proc.stderr)
    if not found:
        raise ValueError("ffmpeg did not report integrated LUFS")
    return float(found.group(1))


def encode(audio: np.ndarray, path: Path, global_db: float) -> None:
    # Match B1's inferred fixed +34 dB listening gain. No compressor/limiter or
    # dynamic loudness normalization is applied; the tiny extra gain is global.
    rendered = np.asarray(audio * 10 ** ((34.0 + global_db) / 20), dtype="<f4")
    subprocess.run(
        ["ffmpeg", "-y", "-nostdin", "-v", "error", "-f", "f32le", "-ar",
         str(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0", "-ar", "44100",
         "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(path)],
        input=rendered.tobytes(), capture_output=True, check=True,
    )


def check_existing() -> None:
    """Read-only verification; this path never invokes the AAC encoder."""
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    if (report.get("output", {}).get("path") != str(OUT)
            or report["output"]["sha256"] != sha256(OUT)
            or report["inputs"]["source_ngc_ari_002"]["sha256"] != PINNED[SOURCE]
            or report.get("no_training") is not True
            or report.get("no_game_or_public_release") is not True
            or report.get("checkpoint_rights_cleared_for_game") is not False
            or report.get("ngc_original_modified") is not False
            or report.get("gain_knots_seconds_db") != [list(pair) for pair in KNOTS_SECONDS_DB]):
        raise ValueError("existing R&D artifact provenance differs from pinned inputs and contour")
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration:stream=codec_name,sample_rate,channels", "-of", "json", str(OUT)],
        capture_output=True, text=True, check=True,
    )
    info = json.loads(probe.stdout)
    stream = info["streams"][0]
    if (abs(float(info["format"]["duration"]) - SCORE_SECONDS) > 1e-6
            or stream["codec_name"] != "aac"
            or int(stream["sample_rate"]) != 44100
            or int(stream["channels"]) != 1):
        raise ValueError("existing R&D artifact format/length changed")
    b1_lufs, variant_lufs = measure_lufs(B1), measure_lufs(OUT)
    if (abs(b1_lufs - variant_lufs) > .06
            or abs(variant_lufs - float(report["variant_integrated_lufs"])) > .03):
        raise ValueError("existing R&D artifact whole-clip loudness changed")
    print(json.dumps({"status": "PASS_READ_ONLY", "output": str(OUT),
                      "sha256": sha256(OUT), "duration_seconds": SCORE_SECONDS,
                      "b1_lufs": b1_lufs, "variant_lufs": variant_lufs,
                      "scope": "last C5 16.8–18.667 s and its release tail to 18.95 s only, plus whole-clip -0.18 dB alignment"},
                     ensure_ascii=False))


def main() -> None:
    global OUT, REPORT, TEMP
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="read-only verification of an existing audition")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR,
                        help="private R&D output directory (default: Mini scratch, never the repo)")
    args = parser.parse_args()
    output_dir = args.output_dir.expanduser().resolve()
    repo_root = Path(__file__).resolve().parents[3]
    ngc_root = SOURCE.parents[5]
    scratch_root = Path("/Users/simjaemin1/Mini/_bgm/gpt").resolve()
    if scratch_root not in output_dir.parents:
        raise ValueError("private audition output must stay inside Mini/_bgm/gpt scratch")
    if output_dir == repo_root or repo_root in output_dir.parents:
        raise ValueError("private audition output cannot be written inside the repository")
    if output_dir == ngc_root or ngc_root in output_dir.parents:
        raise ValueError("NGC original audio tree is read-only")
    OUT, REPORT, TEMP = (output_dir / OUTPUT_NAME, output_dir / REPORT_NAME, output_dir / TEMP_NAME)
    for path, expected in PINNED.items():
        if sha256(path) != expected:
            raise ValueError(f"pinned private B1 input changed: {path}")
    if args.check:
        check_existing()
        return
    if OUT.exists() or REPORT.exists() or TEMP.exists():
        raise FileExistsError("existing audition, sidecar, or probe must not be overwritten")
    output_dir.mkdir(parents=True, exist_ok=True)
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    selected = [e for e in plan["events"] if e["id"] == "b08_e0_rearticulate"]
    if len(selected) != 1 or selected[0]["pitch_name"] != "C5" or abs(selected[0]["start_seconds"] - 16.8) > 1e-8:
        raise ValueError("final C5 event no longer matches the audited plan")

    dry = read_dry()
    source = decode_float(SOURCE, SAMPLE_RATE)
    if len(source) != len(dry):
        raise ValueError("NGC source 002 and B1 must each be 19.2 seconds")
    gain_db = curve_db(len(dry))
    adjusted = dry * np.power(10.0, gain_db / 20.0)
    if not np.array_equal(dry[:round(16.8 * SAMPLE_RATE)], adjusted[:round(16.8 * SAMPLE_RATE)]):
        raise ValueError("audio changed before the final C5")
    if np.max(np.abs(gain_db)) > 2.00001 or np.any(~np.isfinite(adjusted)):
        raise ValueError("gain safety gate failed")

    # Compare source's broad measured trajectory with our intentionally smaller
    # shaped gain. This records evidence, not a claim of exact phrase matching.
    def window_rms_db(x: np.ndarray, center: float) -> float:
        a, b = round((center - .2) * SAMPLE_RATE), round((center + .2) * SAMPLE_RATE)
        return 20 * math.log10(max(float(np.sqrt(np.mean(x[a:b] ** 2))), 1e-12))

    source_windows = {f"{center:.1f}": round(window_rms_db(source, center), 3)
                      for center in (17.0, 17.2, 17.5, 17.8, 18.1, 18.4, 18.6)}
    target_lufs = measure_lufs(B1)
    try:
        encode(adjusted, TEMP, 0.0)
        probe_lufs = measure_lufs(TEMP)
        correction_db = target_lufs - probe_lufs
        if abs(correction_db) > 0.4:
            raise ValueError(f"unexpected global LUFS correction {correction_db:+.2f} dB")
        encode(adjusted, OUT, correction_db)
    finally:
        TEMP.unlink(missing_ok=True)
    final_lufs = measure_lufs(OUT)
    if abs(final_lufs - target_lufs) > 0.06:
        raise ValueError(f"LUFS mismatch {target_lufs} vs {final_lufs}")
    decoded = decode_float(OUT, SAMPLE_RATE)
    baseline_decoded = decode_float(B1, SAMPLE_RATE)
    # ffmpeg AAC decoding at 16 kHz retains a small padded tail (47 samples
    # for this exact encoder). Check equality with B1, while the container's
    # declared timeline remains the score's exact 19.2 seconds.
    if len(decoded) != len(baseline_decoded) or len(decoded) < len(dry):
        raise ValueError("encoded output duration/padding differs from B1")
    if np.max(np.abs(decoded)) >= .98:
        raise ValueError("encoded output too close to clipping")
    slope_db_per_second = np.diff(gain_db) * SAMPLE_RATE
    maximum_gain_slope = float(np.max(np.abs(slope_db_per_second)))
    if maximum_gain_slope > 7.0:
        raise ValueError("gain contour changes too quickly")
    boundary_checks = []
    for t, _ in KNOTS_SECONDS_DB:
        index = round(t * SAMPLE_RATE)
        lo, hi = index - round(.05 * SAMPLE_RATE), index + round(.05 * SAMPLE_RATE)
        local_diffs = np.abs(np.diff(decoded[lo:hi]))
        boundary_jump = float(abs(decoded[index] - decoded[index - 1]))
        local_p995 = float(np.quantile(local_diffs, .995))
        ratio = boundary_jump / max(local_p995, 1e-12)
        if ratio >= 1.0:
            raise ValueError(f"unusual sample jump at contour knot {t}")
        boundary_checks.append({"seconds": t, "sample_jump": round(boundary_jump, 6),
                                "nearby_sample_jump_p995": round(local_p995, 6),
                                "ratio": round(ratio, 3), "passed": True})

    report = {
        "schema": "mini.private-bgm-b1-source-informed-dynamics.v1",
        "status": "unreviewed_private_rnd_only",
        "description": "Full 19.2-second B1 audition; only final C5 b08 dynamics and its release altered; not a learned or transferred performance.",
        "inputs": {"source_ngc_ari_002": {"path": str(SOURCE), "sha256": sha256(SOURCE)},
                   "b1_dry": {"path": str(DRY), "sha256": sha256(DRY)},
                   "b1_listening": {"path": str(B1), "sha256": sha256(B1)},
                   "b1_plan": {"path": str(PLAN), "sha256": sha256(PLAN)}},
        "source_reference_window_rms_dbfs_400ms": source_windows,
        "source_interpretation": "NGC Ari 002 b08 C5 grows toward about 17.5 s then decays; source and authored score are not the same performance; fast source fluctuations were not copied.",
        "builder_script_sha256": sha256(Path(__file__)),
        "gain_knots_seconds_db": KNOTS_SECONDS_DB,
        "maximum_gain_change_db": float(np.max(np.abs(gain_db))),
        "maximum_gain_slope_db_per_second": round(maximum_gain_slope, 3),
        "contour_knot_click_checks": boundary_checks,
        "unchanged_exact_pcm_before_seconds": 16.8,
        "other_changes": "one global loudness alignment after the local dynamics, applied to the entire track; AAC re-encode at 128k/44.1k mono",
        "global_lufs_alignment_db": round(correction_db, 3),
        "b1_integrated_lufs": target_lufs,
        "variant_integrated_lufs": final_lufs,
        "duration_seconds": SCORE_SECONDS,
        "decoded_16khz_samples_including_aac_padding": len(decoded),
        "no_training": True,
        "no_game_or_public_release": True,
        "checkpoint_rights_cleared_for_game": False,
        "ngc_original_modified": False,
        "output": {"path": str(OUT), "sha256": sha256(OUT)},
        "limitations": "Only gain, not breath-noise spectrum, articulation, decoder quality, or broader phrase dynamics. Musical improvement requires listening judgment.",
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"audio": str(OUT), "report": str(REPORT),
                      "b1_lufs": target_lufs, "variant_lufs": final_lufs,
                      "global_db": round(correction_db, 3)}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        print(f"private B1 dynamic audition: {exc}", file=sys.stderr)
        raise SystemExit(2)
