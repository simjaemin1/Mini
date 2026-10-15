#!/usr/bin/env python3
"""Local-only 4.8s comparisons: static LUFS gain, never compression/AGC/EQ.

Use explicit labels such as original_reference, codec_only, novel_score and
historical_baseline. Labels describe the caller's provenance, not a model test.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile

import numpy as np

from prepare_inputs import fresh_private_dir, sha256

SR, CHANNELS, SECONDS = 48_000, 2, 4.8
FRAMES = round(SR * SECONDS)
REQUESTED_LUFS, PEAK_MARGIN_DBFS = -24.0, -1.1


def ffmpeg(args: list[str], data: bytes | None = None) -> subprocess.CompletedProcess:
    process = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-nostats", "-n",
        "-protocol_whitelist", "file,pipe", *args], input=data, capture_output=True, timeout=60)
    if process.returncode:
        raise ValueError("local_ffmpeg_failed")
    return process


def decode(path: Path, trim: bool) -> np.ndarray:
    arguments = ["-v", "error", "-i", str(path), "-map", "0:a:0", "-vn", "-sn", "-dn"]
    if trim:
        arguments += ["-t", str(SECONDS)]
    result = ffmpeg(arguments + ["-ar", str(SR), "-ac", str(CHANNELS), "-f", "f32le", "pipe:1"])
    audio = np.frombuffer(result.stdout, dtype="<f4").reshape(-1, CHANNELS)
    if not np.all(np.isfinite(audio)) or len(audio) < FRAMES:
        raise ValueError("finite_audio_at_least_4p8s_required")
    return audio


def measure(audio: np.ndarray) -> dict:
    result = ffmpeg(["-v", "info", "-f", "f32le", "-ar", str(SR), "-ac", str(CHANNELS),
        "-i", "pipe:0", "-af", "ebur128=peak=true", "-f", "null", "-"], audio.astype("<f4").tobytes())
    summary = result.stderr.decode("utf-8", "replace").rsplit("Summary:", 1)[-1]
    matches = {key: re.search(pattern, summary) for key, pattern in (
        ("integrated_lufs", r"I:\s*(-?[\d.]+)\s+LUFS"),
        ("true_peak_dbfs", r"Peak:\s*(-?[\d.]+)\s+dBFS"))}
    if not all(matches.values()):
        raise ValueError("finite_non_silent_loudness_required")
    values = {key: float(match.group(1)) for key, match in matches.items()}
    if not all(math.isfinite(value) for value in values.values()) or values["integrated_lufs"] <= -69:
        raise ValueError("finite_non_silent_loudness_required")
    return values


def common_target(measurements: list[dict], requested: float = REQUESTED_LUFS) -> float:
    overshoot = max(row["true_peak_dbfs"] + requested - row["integrated_lufs"]
                    - PEAK_MARGIN_DBFS for row in measurements)
    return requested - max(0.0, overshoot)


def parse_items(items: list[str]) -> list[tuple[str, Path]]:
    if not 2 <= len(items) <= 4:
        raise ValueError("two_to_four_label_equals_local_path_inputs_required")
    parsed = []
    for item in items:
        label, separator, value = item.partition("=")
        path = Path(value)
        if (not separator or not label.strip() or len(label) > 100 or not path.is_absolute()
                or path.suffix.lower() not in {".wav", ".m4a"}
                or not stat.S_ISREG(path.lstat().st_mode)):
            raise ValueError("label_and_absolute_regular_wav_or_m4a_required")
        parsed.append((label.strip(), path))
    if len({label for label, _ in parsed}) != len(parsed):
        raise ValueError("unique_labels_required")
    return parsed


def encode(audio: np.ndarray, path: Path, gain_db: float) -> None:
    ffmpeg(["-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", str(CHANNELS),
        "-i", "pipe:0", "-af", f"volume={gain_db:.12f}dB", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", str(path)], audio.astype("<f4").tobytes())


def compare(items: list[str], output_dir: Path) -> dict:
    parsed = parse_items(items)
    inputs = []
    for label, path in parsed:
        digest = sha256(path)
        audio = decode(path, trim=True)
        if len(audio) != FRAMES:
            raise ValueError("source_excerpt_frame_count_invalid")
        inputs.append({"label": label, "path": path, "sha256": digest,
                       "audio": audio, "measurement": measure(audio)})
    target = common_target([row["measurement"] for row in inputs])
    destination = fresh_private_dir(output_dir)
    previous_umask = os.umask(0o077)
    try:
        attempts = []
        with tempfile.TemporaryDirectory(prefix=".encoding_", dir=destination) as temporary:
            for attempt in range(4):
                results = []
                for index, row in enumerate(inputs, 1):
                    path = Path(temporary) / f"attempt{attempt}_{index:02d}.m4a"
                    gain = target - row["measurement"]["integrated_lufs"]
                    encode(row["audio"], path, gain)
                    decoded = decode(path, trim=False)
                    # AAC tail padding is not programme audio; require exact container duration too.
                    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                        "stream=duration,sample_rate,channels", "-of", "json", str(path)],
                        capture_output=True, check=True, timeout=20)
                    stream = json.loads(probe.stdout)["streams"][0]
                    if (abs(float(stream["duration"]) - SECONDS) > 1 / SR or int(stream["sample_rate"]) != SR
                            or int(stream["channels"]) != CHANNELS or len(decoded) > FRAMES + 1023):
                        raise ValueError("aac_duration_or_decoded_padding_invalid")
                    stats = measure(decoded)
                    results.append({"path": path, "gain_db": gain, "measurement": stats,
                                    "decoded_frames": len(decoded), "programme_frames": FRAMES})
                excess = max(row["measurement"]["true_peak_dbfs"] - PEAK_MARGIN_DBFS for row in results)
                attempts.append({"common_target_lufs": target, "max_peak_excess_db": max(0.0, excess)})
                if excess <= 1e-9:
                    break
                target -= excess + 0.1
            else:
                raise ValueError("aac_common_peak_target_not_converged")
            if any(abs(row["measurement"]["integrated_lufs"] - target) > .3 for row in results):
                raise ValueError("decoded_lufs_not_matched_with_static_gain")
            if any(sha256(row["path"]) != row["sha256"] for row in inputs):
                raise ValueError("input_changed_during_comparison")
            outputs = []
            for index, (source, result) in enumerate(zip(inputs, results), 1):
                path = destination / f"{index:02d}.m4a"
                descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(descriptor, "wb") as handle:
                    handle.write(result["path"].read_bytes())
                outputs.append({"label": source["label"], "source_path": str(source["path"]),
                    "source_sha256": source["sha256"], "source_first4p8s": source["measurement"],
                    "static_gain_db": result["gain_db"], "file": path.name, "sha256": sha256(path),
                    "decoded": result["measurement"], "decoded_frames": result["decoded_frames"],
                    "programme_frames": result["programme_frames"]})
        report = {"schema": "mini.foundation-local-static-lufs-comparison.v1", "status": "ready",
            "seconds": SECONDS, "sample_rate_hz": SR, "channels": CHANNELS,
            "requested_target_lufs": REQUESTED_LUFS, "actual_common_target_lufs": target,
            "true_peak_ceiling_dbfs": -1.0, "measurement_margin_db": .1, "attempts": attempts,
            "processing": "first4.8s; 48k stereo conversion; one constant gain per input; AAC192k",
            "no_compression_AGC_EQ_pitch_time_edits": True, "labels_are_caller_provenance": True,
            "codec_only_is_not_new_music": True, "historical_baseline_is_not_model_input": True,
            "model_inference_or_external_upload": False, "script_sha256": sha256(Path(__file__)),
            "aac_tail_padding_policy": "container exactly4.8s; record full decoded frames; peak/LUFS measured including codec tail padding",
            "outputs": outputs}
        descriptor = os.open(destination / "comparison.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
        return report
    finally:
        os.umask(previous_umask)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("items", nargs="+")
    args = parser.parse_args()
    try:
        report = compare(args.items, args.output_dir)
        print(json.dumps({"status": report["status"], "outputs": len(report["outputs"]),
                          "actual_common_target_lufs": report["actual_common_target_lufs"]}))
        return 0
    except Exception:
        print(json.dumps({"status": "blocked", "reason": "local_static_comparison_failed_no_source_changed"}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
