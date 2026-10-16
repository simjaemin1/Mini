"""Bounded local-only public NGC daegeum preparation; no model or AIHub input.

Original compressed audio is read-only. Uncertain F0 remains zero/unvoiced.
The held-out files have been encountered previously and are NOT blind tests.
"""
import argparse
from contextlib import contextmanager
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time

import numpy as np
from scipy.signal import resample_poly

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "aihub-readiness"))
import mac_mps_ddsp_features as features

DEFAULT_ROOT = Path.home() / "Mini/_bgm/국악원/정리"
SR, HOP, MAX_SECONDS, CPU_LIMIT = 24000, 240, 600, 120
FIXED = (
    "단음/산조대금/기본음계/sanjo_deageum_scale_sus_04.wv",
    "단음/산조대금/기본음계/sanjo_deageum_scale_vib_39.wv",
    "단음/산조대금/기본음계/sanjo_deageum_scale_deep_vib_48.wv",
    "단음/산조대금/연주/Sanjo_deageum_2.flac",
    "단음/산조대금/시김새/Sanjo_deageum_1.wv")


def digest(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def candidates(root):
    if not (root / ".done").is_file():
        raise ValueError("Organized source archive is not marked complete")
    selected = [(root / name, "heldout" if i == 2 else "fit") for i, name in enumerate(FIXED)]
    arirang = sorted((root / "악구/대금/민요/아리랑").glob("*.flac"))[:5]
    selected += [(path, "heldout" if i >= 3 else "fit") for i, path in enumerate(arirang)]
    if not arirang or len(selected) > 10:
        raise ValueError("Expected five fixed files plus at most five public Arirang files")
    for path, _split in selected:
        if not stat.S_ISREG(path.stat().st_mode) or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError("Source must remain inside the organized public NGC archive")
    return selected


def probe(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                             "-of", "json", str(path)], capture_output=True, check=True, timeout=15)
    duration = float(json.loads(result.stdout)["format"]["duration"])
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Invalid source duration")
    return duration


def plan_ranges(selected):
    rows = [{"source_path": str(path), "split": split, "source_sha256": digest(path),
             "source_duration_seconds": probe(path)} for path, split in selected]
    if len({row["source_sha256"] for row in rows}) != len(rows):
        raise ValueError("Duplicate source SHA across source-file groups")
    bounded = sum(row["source_duration_seconds"] for row in rows) > MAX_SECONDS
    for row in rows:
        row.update(extract_start_seconds=0.,
                   requested_seconds=min(row["source_duration_seconds"], 60.) if bounded
                   else row["source_duration_seconds"])
    if sum(row["requested_seconds"] for row in rows) > MAX_SECONDS + 1e-6:
        raise ValueError("Audio preparation exceeds 600 seconds")
    return rows, bounded


def decode(path, seconds):
    result = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(path),
                             "-t", str(seconds), "-vn", "-ac", "1", "-ar", str(SR),
                             "-f", "f32le", "pipe:1"], capture_output=True, check=True, timeout=45)
    wave = np.frombuffer(result.stdout, dtype="<f4").copy()
    if not len(wave) or not np.isfinite(wave).all() or len(wave) > math.ceil(seconds * SR) + SR:
        raise ValueError("Invalid or oversized decoded waveform")
    return wave


def condition(wave):
    count = len(wave) // HOP
    if count < 1:
        raise ValueError("Source shorter than one 10 ms conditioning frame")
    wave = np.asarray(wave[:count * HOP], dtype=np.float32)
    measured = features.extract_features(resample_poly(wave, 2, 3))
    if any(len(measured[key]) != count for key in ("pitch_hz", "rms_db", "voiced_mask")):
        raise ValueError("Waveform and 100 Hz features are not synchronized")
    if np.any(measured["pitch_hz"][~measured["voiced_mask"]] != 0):
        raise ValueError("Uncertain F0 must remain zero; interpolation is forbidden")
    return {"waveform": wave, "pitch_hz": measured["pitch_hz"],
            "rms_db": measured["rms_db"], "voiced_mask": measured["voiced_mask"]}


@contextmanager
def cpu_budget():
    def expired(_signum, _frame):
        raise TimeoutError("120-second process CPU preparation limit")
    previous = signal.signal(signal.SIGPROF, expired)
    signal.setitimer(signal.ITIMER_PROF, CPU_LIMIT)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_PROF, 0)
        signal.signal(signal.SIGPROF, previous)


def write_manifest(path, value):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)


def prepare(root, output):
    os.umask(0o077)
    root, output = Path(root).resolve(strict=True), Path(output).resolve(strict=True)
    if any(output.iterdir()) or stat.S_IMODE(output.stat().st_mode) != 0o700:
        raise ValueError("Use a new empty private 0700 output directory")
    started, cpu_started = time.monotonic(), time.process_time()
    rows, bounded = plan_ranges(candidates(root))
    manifest = {"schema": "mini.nsf-public-ngc-data.v1", "status": "preparing",
        "source_root": str(root), "archive_done_sha256": digest(root / ".done"),
        "source_credit": "국립국악원 디지털음원 https://www.gugak.go.kr/digitaleum/",
        "license_scope": "local research preparation only; no new license determination or redistribution",
        "AIHub_files_used": 0, "models_loaded": 0, "network_used": False,
        "sample_rate": SR, "feature_rate_hz": 100, "feature_sample_rate": 16000,
        "feature_method": "existing FFT-YIN; 64ms centered F0/RMS; 10ms hop; no F0 interpolation",
        "rms_definition": "16k helper RMS dB synchronized to 24k waveform; not recomputed at24k",
        "split_unit": "immutable source file SHA, never windows", "heldout_is_blind": False,
        "front60_policy_triggered": bounded, "max_audio_seconds": MAX_SECONDS,
        "process_cpu_limit_seconds": CPU_LIMIT, "feature_helper_sha256": digest(features.__file__),
        "preparation_script_sha256": digest(__file__), "files": []}
    decoded_hashes = set()
    try:
        with cpu_budget():
            for index, row in enumerate(rows):
                raw = decode(row["source_path"], row["requested_seconds"])
                arrays = condition(raw)
                decoded_hash = hashlib.sha256(arrays["waveform"].tobytes()).hexdigest()
                if decoded_hash in decoded_hashes:
                    raise ValueError("Duplicate decoded waveform SHA across source groups")
                decoded_hashes.add(decoded_hash)
                destination = output / f"{index:02d}_{row['split']}.npz"
                with destination.open("xb") as handle:
                    np.savez(handle, **arrays)
                if digest(row["source_path"]) != row["source_sha256"]:
                    raise ValueError("Original source changed during preparation")
                manifest["files"].append({**row, "npz_file": destination.name,
                    "npz_sha256": digest(destination), "decoded_waveform_sha256": decoded_hash,
                    "samples": len(arrays["waveform"]), "feature_frames": len(arrays["pitch_hz"]),
                    "retained_seconds": len(arrays["waveform"]) / SR,
                    "trimmed_tail_samples": len(raw) - len(arrays["waveform"]),
                    "voiced_frames": int(arrays["voiced_mask"].sum())})
            if any(digest(row["source_path"]) != row["source_sha256"] for row in rows):
                raise ValueError("Original source hash changed")
            manifest.update(status="complete", originals_unchanged=True)
    except BaseException as exc:
        manifest.update(status="failed", error_type=type(exc).__name__, error=str(exc)[:500])
        raise
    finally:
        manifest.update(elapsed_seconds=time.monotonic() - started,
                        process_cpu_seconds=time.process_time() - cpu_started)
        write_manifest(output / "manifest.json", manifest)
    print(json.dumps({"status": manifest["status"], "output": str(output), "files": len(rows),
                      "retained_seconds": sum(row["retained_seconds"] for row in manifest["files"]),
                      "process_cpu_seconds": manifest["process_cpu_seconds"]}), flush=True)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.source_root, args.output)
