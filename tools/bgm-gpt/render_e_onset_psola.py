#!/usr/bin/env python3
"""Render non-destructive E5-onset auditions from NGC daegeum Arirang 001.

Reads only the explicitly provided original phrase. It does not touch game
audio or the existing 004 recording. The three equal-gain 3.3-second AAC
auditions contain 4.5–6.3 s and 11.8–13.05 s of that original recording,
separated by 0.25 s of silence. The pitch-synchronous variants modify only
two E5 onsets and return to the original before the following notes.

Requires ffmpeg, ffprobe, numpy, and scipy. Example::

    python3 tools/bgm-gpt/render_e_onset_psola.py \
      --source-flac '/Users/simjaemin1/Mini/_bgm/국악원/정리/악구/대금/민요/아리랑/w3-914-001__아리랑 01.flac' \
      --output-dir '/Users/simjaemin1/Mini/_bgm/gpt/청취'
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile


RATE = 44_100
ORIGINAL_DURATION_S = 19.2
SOURCE_ID = "w3-914-001"
SOURCE_SHA256 = "e29a65963d39aba6ef98c641c558d528d33858dbbe0d616971133d0b35d2f876"
CREDIT = "국악기 음원 제공 — 국립국악원 (공공누리 제1유형)"
E5_HZ = 659.2551138
REFERENCE_004_GAIN_DB = 1.36
GAP_S = 0.25
EDGE_FADE_S = 0.015
OUTPUTS = {
    "original": "007_E원본발췌.m4a",
    "mild": "008_E초입약보정.m4a",
    "strong": "009_E초입강보정.m4a",
}
PROVENANCE = "제작정보_E초입_007-009.json"

# Times are in the untouched 19.2-second original phrase. The strong second
# correction ends at 12.528 s so the next-note transition is unmodified from
# 12.544 s onward. The mild curves have exactly half the cent shifts.
SECTIONS = (
    {
        "name": "first E5",
        "audition_s": (4.5, 6.3),
        "active_s": (4.815, 5.49),
        "anchors_s": (4.95, 5.25, 5.45),
        "strong_pitch_map_semitones": (
            (4.815, 0), (4.875, -0.45), (5.00, -0.45),
            (5.10, -0.38), (5.25, -0.25), (5.40, -0.09),
            (5.455, 0), (5.49, 0),
        ),
    },
    {
        "name": "second E5",
        "audition_s": (11.8, 13.05),
        "active_s": (12.035, 12.528),
        "anchors_s": (12.15, 12.25, 12.5),
        "strong_pitch_map_semitones": (
            (12.035, 0), (12.10, -0.70), (12.25, -0.70),
            (12.40, -0.30), (12.48, -0.12), (12.50, 0),
            (12.528, 0),
        ),
    },
)


def sample(seconds: float) -> int:
    return round(seconds * RATE)


def run(*args: str) -> subprocess.CompletedProcess[bytes]:
    result = subprocess.run(args, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"Command failed: {args}\n{result.stderr.decode(errors='replace')}")
    return result


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def decode_source(path: Path) -> np.ndarray:
    info = json.loads(run(
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=sample_rate,channels", "-of", "json", str(path)
    ).stdout)
    if len(info.get("streams", [])) != 1:
        raise ValueError("Expected one mono audio stream")
    stream = info["streams"][0]
    if int(stream["sample_rate"]) != RATE or int(stream["channels"]) != 1:
        raise ValueError("Expected untouched 44.1-kHz mono source")
    if abs(float(info["format"]["duration"]) - ORIGINAL_DURATION_S) > 0.001:
        raise ValueError("Unexpected source phrase duration")
    pcm = run("ffmpeg", "-v", "error", "-i", str(path),
              "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-").stdout
    audio = np.frombuffer(pcm, dtype="<f4").astype(np.float64)
    if len(audio) != sample(ORIGINAL_DURATION_S):
        raise ValueError("Decoded source sample count changed")
    return audio


def pitch_cents(audio: np.ndarray, at_s: float) -> float:
    frame = audio[sample(at_s):sample(at_s + 0.045)].copy()
    frame = (frame - frame.mean()) * np.hanning(len(frame))
    ac = signal.fftconvolve(frame, frame[::-1], mode="full")[len(frame) - 1:]
    lo, hi = round(RATE / 730), round(RATE / 620)
    index = lo + int(np.argmax(ac[lo:hi]))
    delta = 0.5 * (ac[index - 1] - ac[index + 1]) / (
        ac[index - 1] - 2 * ac[index] + ac[index + 1]
    )
    return round(1200 * math.log2(RATE / (index + delta) / E5_HZ), 1)


def level_range_db(reference: np.ndarray, test: np.ndarray,
                   bounds_s: tuple[float, float], window_ms: int) -> dict:
    width = sample(window_ms / 1000)
    values = []
    times = np.arange(bounds_s[0], bounds_s[1], 0.005)
    for at_s in times:
        center = sample(at_s)
        sl = slice(center - width // 2, center + width // 2)
        ref = math.sqrt(float(np.mean(reference[sl] ** 2)))
        trial = math.sqrt(float(np.mean(test[sl] ** 2)))
        values.append(20 * math.log10(max(trial, 1e-9) / max(ref, 1e-9)))
    arr = np.array(values)
    return {
        "min": round(float(arr.min()), 2),
        "max": round(float(arr.max()), 2),
        "time_at_min_s": round(float(times[int(arr.argmin())]), 3),
    }


def psola_onset(original: np.ndarray, section: dict,
                map_scale: float) -> tuple[np.ndarray, dict]:
    start_s, end_s = section["active_s"]
    lower_s, upper_s = start_s - 0.03, end_s + 0.03
    fundamental = signal.sosfiltfilt(
        signal.butter(3, [540, 850], btype="bandpass", fs=RATE, output="sos"),
        original[sample(lower_s):sample(upper_s)],
    )
    peaks, _ = signal.find_peaks(fundamental, distance=49, prominence=0.003)
    marks = peaks + sample(lower_s)
    marks = marks[(marks >= sample(start_s - 0.02)) &
                  (marks <= sample(end_s + 0.02))]
    differences = np.diff(marks)
    if len(differences) < 100 or np.quantile(differences, 0.05) < 50 or \
            np.quantile(differences, 0.95) > 85:
        raise RuntimeError(f"Unreliable pitch marks in {section['name']}")
    periods = np.empty(len(marks))
    periods[0], periods[-1] = differences[0], differences[-1]
    periods[1:-1] = 0.5 * (differences[:-1] + differences[1:])
    map_times = np.array([point[0] for point in section["strong_pitch_map_semitones"]])
    map_values = np.array([point[1] * map_scale for point in section["strong_pitch_map_semitones"]])

    # Every output pulse takes the original cycle nearest that point in the
    # phrase, preserving its local attack/noise envelope. The rate of output
    # pulses follows the requested pitch curve; near the exit, phase is
    # reconciled to an original pulse by at most a few cents.
    target_marks = [float(marks[np.argmin(abs(marks - sample(start_s)))])]
    while target_marks[-1] < sample(end_s + 0.01):
        at = target_marks[-1]
        input_period = np.interp(at, marks, periods)
        semitone = np.interp(at / RATE, map_times, map_values)
        target_marks.append(at + input_period / (2 ** (semitone / 12)))
    target_marks = np.array(target_marks)
    final_index = np.where(target_marks <= sample(end_s))[0][-1]
    final_target = target_marks[final_index]
    final_source = marks[np.argmin(abs(marks - final_target))]
    warp = (final_source - final_target) / (final_target - target_marks[0])
    target_marks[:final_index + 1] += warp * (target_marks[:final_index + 1] - target_marks[0])
    target_marks[final_index + 1:] += final_source - final_target

    lower = max(0, sample(start_s) - sample(0.02))
    upper = min(len(original), sample(end_s) + sample(0.02))
    summed = np.zeros(upper - lower)
    weights = np.zeros(upper - lower)
    used = 0
    for target in target_marks:
        if not sample(start_s - 0.02) <= target <= sample(end_s + 0.02):
            continue
        source_i = int(np.argmin(abs(marks - target)))
        source = int(marks[source_i])
        center = int(round(target))
        half_width = int(round(1.15 * periods[source_i]))
        if not 50 <= half_width <= 100:
            continue
        offsets = np.arange(-half_width, half_width + 1)
        destination = center + offsets
        inside = (destination >= lower) & (destination < upper) & \
                 (source + offsets >= 0) & (source + offsets < len(original))
        offsets, destination = offsets[inside], destination[inside]
        window = 0.5 + 0.5 * np.cos(np.pi * offsets / half_width)
        summed[destination - lower] += original[source + offsets] * window
        weights[destination - lower] += window
        used += 1
    reconstructed = original[lower:upper].copy()
    valid = weights > 1e-5
    reconstructed[valid] = summed[valid] / weights[valid]
    times = np.arange(lower, upper) / RATE
    blend = np.clip((times - (start_s - 0.016)) / 0.032, 0, 1) * \
            np.clip(((end_s + 0.016) - times) / 0.032, 0, 1)
    blend = 0.5 - 0.5 * np.cos(np.pi * blend)
    output = original.copy()
    output[lower:upper] = original[lower:upper] * (1 - blend) + reconstructed * blend
    details = {
        "input_pitch_marks": len(marks), "output_pitch_marks": used,
        "end_phase_warp_cents": round(1200 * math.log2(1 + warp), 2),
        "pitch_cents_by_time": {
            str(at): {"original": pitch_cents(original, at),
                      "variant": pitch_cents(output, at)}
            for at in section["anchors_s"]
        },
        "level_ratio_db_by_window_ms": {
            str(width): level_range_db(original, output, section["active_s"], width)
            for width in (10, 50, 100)
        },
    }
    worst_10ms = details["level_ratio_db_by_window_ms"]["10"]
    if worst_10ms["min"] < -0.5 or worst_10ms["max"] > 0.5:
        raise RuntimeError(f"Unexpected E-onset level damage: {details}")
    return output, details


def excerpt(audio: np.ndarray) -> np.ndarray:
    pieces = []
    for section in SECTIONS:
        start_s, end_s = section["audition_s"]
        piece = audio[sample(start_s):sample(end_s)].copy()
        edge = sample(EDGE_FADE_S)
        piece[:edge] *= np.linspace(0, 1, edge)
        piece[-edge:] *= np.linspace(1, 0, edge)
        pieces.append(piece)
    return np.concatenate([pieces[0], np.zeros(sample(GAP_S)), pieces[1]])


def loudness(path: Path) -> dict:
    output = run("ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
                 "-af", "loudnorm=I=-20:TP=-1.5:LRA=7:print_format=json",
                 "-f", "null", "-").stderr.decode(errors="replace")
    start = output.rfind("{\n")
    if start < 0:
        raise RuntimeError("FFmpeg loudnorm measurement absent")
    data = json.loads(output[start:output.find("}", start) + 1])
    return {key: float(data[key]) for key in ("input_i", "input_tp", "input_lra")}


def encode(audio: np.ndarray, filename: str, temp_dir: Path) -> tuple[Path, dict]:
    wav = temp_dir / (Path(filename).stem + ".wav")
    wavfile.write(wav, RATE, audio.astype(np.float32))
    target = temp_dir / filename
    run("ffmpeg", "-y", "-v", "error", "-i", str(wav),
        "-af", f"volume={REFERENCE_004_GAIN_DB:.2f}dB",
        "-ar", str(RATE), "-ac", "2", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        "-metadata", f"comment={CREDIT}",
        "-metadata", f"copyright={CREDIT}",
        "-metadata", f"description=④ 대금 E5 초입 비교 — {filename}",
        str(target))
    probe = json.loads(run("ffprobe", "-v", "error", "-show_entries",
                           "format=duration:format_tags=comment,copyright:stream=codec_name,sample_rate,channels",
                           "-of", "json", str(target)).stdout)
    if len(probe.get("streams", [])) != 1:
        raise RuntimeError("Expected one AAC stream")
    stream, fmt = probe["streams"][0], probe["format"]
    if stream["codec_name"] != "aac" or int(stream["sample_rate"]) != RATE or \
            int(stream["channels"]) != 2 or abs(float(fmt["duration"]) - 3.3) > 0.001:
        raise RuntimeError(f"Audio format or duration mismatch in {target}")
    if fmt["tags"].get("comment") != CREDIT or fmt["tags"].get("copyright") != CREDIT:
        raise RuntimeError(f"Source credit missing in {target}")
    return target, {"sha256": sha256(target), "duration_s": float(fmt["duration"]),
                    "sample_count_before_aac": len(audio),
                    "codec": stream["codec_name"], "sample_rate": int(stream["sample_rate"]),
                    "channels": int(stream["channels"]), "loudness": loudness(target)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-flac", type=Path, required=True,
                        help="Explicit path to the untouched w3-914-001 FLAC")
    parser.add_argument("--output-dir", type=Path, required=True,
                        help="Destination for three numbered listening copies and provenance")
    args = parser.parse_args()
    source, output_dir = args.source_flac.resolve(), args.output_dir.resolve()
    if SOURCE_ID not in source.name or source.suffix.lower() != ".flac":
        raise ValueError(f"Expected {SOURCE_ID} original FLAC: {source}")
    source_hash = sha256(source)
    if source_hash != SOURCE_SHA256:
        raise ValueError(f"Original FLAC hash mismatch: {source_hash}")
    output_dir.mkdir(parents=True, exist_ok=True)
    destinations = [output_dir / name for name in OUTPUTS.values()]
    destinations.append(output_dir / PROVENANCE)
    existing = [str(path) for path in destinations if path.exists()]
    if existing:
        raise FileExistsError(f"Audition destination already exists: {existing}")

    original = decode_source(source)
    details = {
        "source_id": SOURCE_ID, "source_path": str(source), "source_sha256": source_hash,
        "reference_004_gain_db": REFERENCE_004_GAIN_DB,
        "level_policy": "Same +1.36 dB gain as 004; compare excerpt-local LUFS, not whole-track LUFS",
        "credit": CREDIT, "sample_rate": RATE,
        "method": "Pitch-synchronous overlap-add of original daegeum cycles, no generative model",
        "sections": [dict(section) for section in SECTIONS],
        "gap_s": GAP_S, "edge_fade_s": EDGE_FADE_S, "outputs": {},
    }
    with tempfile.TemporaryDirectory(prefix="e-psola-", dir=output_dir) as name:
        temp_dir = Path(name)
        rendered = {}
        for label, scale in (("original", 0), ("mild", 0.5), ("strong", 1.0)):
            full = original.copy()
            rows = []
            if label != "original":
                for section in SECTIONS:
                    full, row = psola_onset(full, section, scale)
                    rows.append(row)
            piece = excerpt(full)
            temp_file, metrics = encode(piece, OUTPUTS[label], temp_dir)
            rendered[label] = temp_file
            details["outputs"][label] = {
                "path": str(output_dir / OUTPUTS[label]), "pitch_map_scale": scale,
                "section_diagnostics": rows, **metrics,
            }
        reference_lufs = details["outputs"]["original"]["loudness"]["input_i"]
        for row in details["outputs"].values():
            if abs(row["loudness"]["input_i"] - reference_lufs) > 0.05:
                raise RuntimeError(f"Audition LUFS mismatch: {details['outputs']}")
        if not -22.8 <= reference_lufs <= -22.1:
            raise RuntimeError(f"Unexpected 004 excerpt-local loudness: {reference_lufs}")
        provenance_temp = temp_dir / PROVENANCE
        provenance_temp.write_text(json.dumps(details, ensure_ascii=False, indent=2) + "\n",
                                   encoding="utf-8")
        for label, temp_file in rendered.items():
            os.link(temp_file, output_dir / OUTPUTS[label])
        os.link(provenance_temp, output_dir / PROVENANCE)
    print(json.dumps({"source_sha256": source_hash,
                      "outputs": details["outputs"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
