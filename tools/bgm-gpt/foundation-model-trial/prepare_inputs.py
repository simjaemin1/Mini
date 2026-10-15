#!/usr/bin/env python3
"""Prepare local-only reference copies and a neutral public-score sine guide.

No model is loaded. The guide is explicitly synthetic, not a daegeum render.
The only reference audio is the SHA-pinned National Gugak Center original.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import stat
import subprocess

import numpy as np

HERE = Path(__file__).resolve().parent
SCORE = HERE.parent / "new-arirang-score/new_ari_8bar_expression_b0_r1.json"
COMPILER = HERE.parents[1] / "score-expression/compile_expression.py"
SOURCE = Path.home() / "Mini/_bgm/국악원/정리/악구/대금/민요/아리랑/w3-914-002__아리랑 02.flac"
SOURCE_SHA = "8b5316217a10d0242aa6ae35f8e36a7724b59ef57771e4d1c883d5d2c8d31887"
SCORE_SHA = "13dd0ef219b99da7ae3dfda032de303136926083508e36965242c4e4a4762b3c"
PRIVATE_ROOT = Path.home() / "Mini/_bgm/gpt"
CREDIT = "국악기 음원 제공 — 국립국악원 (공공누리 제1유형)"
SR = 48_000


def sha256(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def compile_score() -> dict:
    if sha256(SCORE) != SCORE_SHA:
        raise ValueError("public_score_sha_changed")
    spec = importlib.util.spec_from_file_location("foundation_public_expression", COMPILER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.compile_plan(SCORE)


def sine_guide(compiled: dict) -> tuple[np.ndarray, dict]:
    if compiled["control_hz"] != 300 or not math.isclose(compiled["duration_seconds"], 19.2):
        raise ValueError("canonical_19_2s_300hz_score_required")
    if np.any(compiled["vibrato_cents"]) or np.any(compiled["reference_contour_cents"]):
        raise ValueError("straight_b0_guide_only")
    frames = round(compiled["duration_seconds"] * SR)
    samples = np.arange(frames)
    grid = compiled["frame_centers_48k"]
    f0 = np.interp(samples, grid, compiled["f0_hz"])
    amplitude = 10 ** (np.interp(samples, grid, compiled["loudness_db"]) / 20)
    amplitude *= np.interp(samples, grid, compiled["voicing"])
    phase = np.cumsum(2 * np.pi * f0 / SR, dtype=np.float64)
    mono = np.sin(phase) * amplitude
    rests = []
    for event in compiled["events"]:
        if event["articulation"] != "release":
            continue
        start = math.ceil(event["start_seconds"] * SR)
        end = math.ceil(event["end_seconds"] * SR)
        first = max(0, start - round(0.010 * SR))
        u = np.clip((start - np.arange(first, start)) / (0.010 * SR), 0, 1)
        mono[first:start] *= u ** 3 * (10 - 15 * u + 6 * u * u)
        mono[start:end] = 0
        rests.append({"start_sample_48k": start, "end_sample_48k": end})
    if not np.all(np.isfinite(mono)) or np.max(np.abs(mono)) > 0.9 or len(rests) != 4:
        raise ValueError("guide_audio_or_written_rests_invalid")
    guide = np.repeat(mono[:, None], 2, axis=1).astype(np.float32)
    return guide, {"duration_seconds": 19.2, "control_hz": 300, "vibrato_enabled": False,
        "pitched_events": sum(e["articulation"] != "release" for e in compiled["events"]),
        "rests": rests, "authored_slur_ms": 12, "control_grid_seconds": 1 / 300,
        "phase": "continuous float64 integration, then float32 samples",
        "amplitude": "10**(authored_loudness_db/20) * authored_voicing",
        "silence": "exact written rests, 10ms minimum-jerk fade immediately before each rest",
        "not_model_output_or_daegeum_timbre": True}


def _ffmpeg(arguments: list[str], data: bytes | None = None) -> None:
    process = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-n",
        "-protocol_whitelist", "file,pipe", *arguments], input=data,
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60)
    if process.returncode:
        raise ValueError("local_ffmpeg_preparation_failed")


def fresh_private_dir(path: Path) -> Path:
    if not path.is_absolute():
        raise ValueError("absolute_private_output_required")
    root = PRIVATE_ROOT.resolve(strict=True)
    resolved = path.resolve(strict=False)
    if resolved == root or root not in resolved.parents:
        raise ValueError("approved_private_output_root_required")
    if path.exists():
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o077 or any(path.iterdir()):
            raise ValueError("fresh_empty_0700_output_required")
    else:
        path.mkdir(mode=0o700, parents=False)
    return path


def prepare(output_dir: Path) -> dict:
    if not stat.S_ISREG(SOURCE.lstat().st_mode) or sha256(SOURCE) != SOURCE_SHA:
        raise ValueError("national_gugak_original_sha_changed")
    compiled = compile_score()
    guide, method = sine_guide(compiled)
    target = fresh_private_dir(output_dir)
    original_umask = os.umask(0o077)
    try:
        guide_path = target / "public_b0_sine_guide_19p2s_48k_stereo.wav"
        _ffmpeg(["-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "pipe:0",
                 "-c:a", "pcm_f32le", str(guide_path)], guide.astype("<f4").tobytes())
        files = [(guide_path, 19.2, "neutral_authorial_sine_guide_not_AI_generated")]
        for filename, duration, padded in (
            ("ngc_002_reference_full_19p2s_48k_stereo.wav", 19.2, False),
            ("ngc_002_reference_first_4p8s_48k_stereo.wav", 4.8, False),
            ("ngc_002_reference_first4p8_plus0p2pad_5s_48k_stereo.wav", 5.0, True)):
            path = target / filename
            arguments = ["-i", str(SOURCE)]
            filters = "pan=stereo|c0=c0|c1=c0,aresample=48000"
            if duration <= 5:
                filters += ",atrim=duration=4.8"
            if padded:
                filters += ",apad=pad_dur=0.2"
            arguments += ["-af", filters]
            arguments += ["-t", str(duration), "-ar", str(SR), "-ac", "2", "-c:a", "pcm_f32le", str(path)]
            _ffmpeg(arguments)
            files.append((path, duration, "continuous_original_first4.8s_plus0.2s_zero_pad" if padded else "continuous_original_reference"))
        if sha256(SOURCE) != SOURCE_SHA or sha256(SCORE) != SCORE_SHA:
            raise ValueError("original_or_score_changed_during_preparation")
        report = {"schema": "mini.foundation-model-local-input-preparation.v1", "status": "ready",
            "source_path": str(SOURCE), "source_sha256": SOURCE_SHA, "source_credit": CREDIT,
            "score_path": str(SCORE), "score_sha256": SCORE_SHA, "compiler_sha256": sha256(COMPILER),
            "script_sha256": sha256(Path(__file__)), "guide_method": method,
            "sample_rate_hz": SR, "channels": 2, "codec": "pcm_f32le",
            "reference_conversion": "44.1k mono to 48k dual-mono stereo; no EQ, AGC, pitch/time changes or rearrangement",
            "five_second_reference": "original first4.8s followed by0.2s silence; codec reconstruction reference, not newly generated music",
            "comparison_policy": "compare generated whole-score first4.8s with old A/B at matched duration and integrated loudness; preserve raw versions",
            "AIHub_audio_or_weights_used": False, "DDSP_Gugak_B_or_weights_used_as_input": False,
            "model_inference_performed": False, "external_upload_or_network": False,
            "outputs": [{"file": path.name, "sha256": sha256(path), "bytes": path.stat().st_size,
                         "duration_seconds": duration, "kind": kind} for path, duration, kind in files]}
        descriptor = os.open(target / "input_manifest.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)
            handle.write("\n")
        return {"status": "ready", "files": len(files), "guide_seconds": 19.2, "model_inference_performed": False}
    finally:
        os.umask(original_umask)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    try:
        result = prepare(args.output_dir)
    except Exception:
        result = {"status": "blocked", "reason": "local_input_preparation_failed_no_source_changed"}
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] == "ready" else 2


if __name__ == "__main__":
    raise SystemExit(main())
