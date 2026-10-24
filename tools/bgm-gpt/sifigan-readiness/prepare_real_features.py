#!/usr/bin/env python3
"""Bounded CPU-only WORLD/SPTK features for a three-excerpt real-data gate.

This is preparation, not model training or a quality/generalization verdict.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "foundation-model-trial"))
from ace_limits import GIB, ResourceCaps, ResourceGuard

RATE, HOP, SAMPLES, FRAMES = 24000, 120, 115200, 960
LIMIT = 20_000_000
CASES = (
    ("sus04", "sanjo_deageum_scale_sus_04.wv", "fit", 0., "9109f088737f34e67a2cbe14ef218b643361139c4c994f901c384064fef4b2f5"),
    ("vib39", "sanjo_deageum_scale_vib_39.wv", "fit", 2., "36287485c7083892aae5384e04bb52207c908626201709f441dba45c25a5aa1a"),
    ("arirang002", "w3-914-002__아리랑 02.flac", "heldout", 0., "8b5316217a10d0242aa6ae35f8e36a7724b59ef57771e4d1c883d5d2c8d31887"),
)


def digest(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def selected(manifest):
    rows = json.loads(Path(manifest).read_text())["files"]
    result = []
    for case, basename, split, start, expected in CASES:
        matches = [row for row in rows if Path(row["source_path"]).name == basename]
        if len(matches) != 1 or matches[0]["source_sha256"] != expected:
            raise ValueError("fixed_source_manifest_binding_required:" + case)
        path = Path(matches[0]["source_path"]).resolve(strict=True)
        if digest(path) != expected:
            raise ValueError("source_sha_mismatch:" + case)
        result.append(dict(case=case, split=split, start_seconds=start,
                           source_path=str(path), source_sha256=expected))
    if len({row["source_sha256"] for row in result}) != len(result):
        raise ValueError("source_split_overlap")
    return result


def decode(row):
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=sample_rate,channels", "-of", "json", row["source_path"]],
        capture_output=True, check=True, timeout=30)
    stream = json.loads(probe.stdout)["streams"][0]
    native_rate = int(stream["sample_rate"])
    if native_rate < RATE:
        raise ValueError("native_source_below24k_no_16k_upscale")
    result = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", row["source_path"],
        "-ss", str(row["start_seconds"]), "-t", "4.8", "-vn", "-ac", "1", "-ar", str(RATE),
        "-f", "f64le", "pipe:1"], capture_output=True, check=True, timeout=60)
    wave = np.frombuffer(result.stdout, dtype="<f8").copy()
    if wave.shape != (SAMPLES,) or not np.isfinite(wave).all():
        raise ValueError("fixed_finite_decode_length_required")
    return wave, dict(native_sample_rate=native_rate, native_channels=int(stream["channels"]))


def continuous_f0(f0):
    """Official interpolation + centered 255-tap 20 Hz low-pass equivalent."""
    from scipy.signal import firwin, lfilter
    voiced = f0 > 0
    if not voiced.any():
        return np.zeros_like(f0)
    cf0 = np.interp(np.arange(len(f0)), np.flatnonzero(voiced), f0[voiced])
    cutoff = 20
    while cutoff < RATE / HOP / 2:
        taps = firwin(255, cutoff / (RATE / HOP / 2))
        filtered = lfilter(taps, 1, np.pad(cf0, (255, 255), "edge"))[382:-128]
        if len(filtered) != len(f0):
            raise ValueError("cf0_filter_alignment_failed")
        if (filtered >= 0).all():
            return filtered
        cutoff = 70 if cutoff == 20 else cutoff * 2
    raise ValueError("official_cf0_lowpass_remained_negative")


def extract(wave):
    import pyworld
    import pysptk
    f0, times = pyworld.harvest(wave, RATE, f0_floor=70., f0_ceil=1800., frame_period=5.)
    sp = pyworld.cheaptrick(wave, f0, times, RATE, fft_size=2048)
    ap = pyworld.d4c(wave, f0, times, RATE, threshold=.85, fft_size=2048)
    mcep = pysptk.sp2mc(sp, order=39, alpha=.466)
    bap = pyworld.code_aperiodicity(ap, RATE)
    cf0 = continuous_f0(f0)
    if min(len(f0), len(cf0), len(mcep), len(bap)) < FRAMES:
        raise ValueError("insufficient_feature_frames")
    features = np.concatenate((mcep[:FRAMES], bap[:FRAMES]), axis=1)
    if features.shape != (FRAMES, 43):
        raise ValueError("exact40mcep_plus3bap_required")
    f0, cf0 = f0[:FRAMES], cf0[:FRAMES]
    arrays = dict(waveform=wave.astype(np.float32), f0=f0.astype(np.float32),
                  cf0=cf0.astype(np.float32), features=features.astype(np.float32))
    if not all(np.isfinite(value).all() for value in arrays.values()):
        raise ValueError("nonfinite_features")
    if (f0 < 0).any() or (f0 > 1800).any() or (cf0 < 0).any():
        raise ValueError("invalid_f0_values")
    voiced = f0 > 0
    return arrays, dict(voiced_frames=int(voiced.sum()), voiced_fraction=float(voiced.mean()),
        low_voicing_warning=bool(voiced.mean() < .5), all_unvoiced=bool(not voiced.any()),
        voiced_f0_min_max=[float(f0[voiced].min()), float(f0[voiced].max())] if voiced.any() else None,
        voiced_ap_all_one_fraction=float(np.mean(np.all(ap[:FRAMES][voiced] >= .999, axis=1))) if voiced.any() else None,
        uncertainty="F0/AP measurements are not a reliable musical correctness or vibrato verdict",
        endpoint_frames_trimmed=int(len(times) - FRAMES))


def fit_statistics(items):
    fit = [arrays["features"].astype(np.float64) for split, arrays in items if split == "fit"]
    if not fit:
        raise ValueError("fit_features_required")
    data = np.concatenate(fit)
    mean, scale = data.mean(axis=0), data.std(axis=0, ddof=0)
    scale[scale == 0] = 1.
    return mean, scale


def save_npz(path, **arrays):
    buffer = io.BytesIO()
    np.savez_compressed(buffer, **arrays)
    payload = buffer.getvalue()
    if sum(p.stat().st_size for p in path.parent.iterdir() if p.is_file()) + len(payload) > LIMIT:
        raise ValueError("20MB_preparation_output_cap")
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as handle:
        handle.write(payload)
    return digest(path)


def prepare(manifest: Path, output: Path) -> dict:
    output, manifest = Path(output).resolve(), Path(manifest).resolve(strict=True)
    if output.exists():
        raise ValueError("fresh_output_directory_required")
    rows = selected(manifest)
    source_root = Path(json.loads(manifest.read_text())["source_root"]).resolve()
    if output.is_relative_to(source_root):
        raise ValueError("source_archive_is_read_only")
    output.mkdir(mode=0o700)
    started = time.monotonic()
    report = dict(schema="mini.sifigan-real-features.v1", status="started", files=[],
        input_manifest_sha256=digest(manifest), source_credit="국악기 음원 제공 — 국립국악원 (공공누리 제1유형)",
        AIHub_files_used=0, heldout_is_blind=False, model_training_performed=False,
        sound_quality_approved=False, full_training_readiness_established=False,
        sample_rate=RATE, hop_size=HOP, samples=SAMPLES, frames=FRAMES,
        feature_spec=dict(f0_floor=70., f0_ceil=1800., frame_period_ms=5., fft_size=2048,
            d4c_threshold=.85, mcep_order=39, mcep_alpha=.466, bap_dimensions=3,
            highpass_hz=0, waveform_gain=1., cf0_lowpass_hz=20),
        adaptations=["No highpass vs upstream causal70Hz: target and conditioning remain aligned",
            "FFT2048 vs default1024 for70Hz floor", "Native originals only; no16k upscaling",
            "Final WORLD endpoint discarded to exactly960frames; no interior frame masking"],
        statistics_fit_cases=[r["case"] for r in rows if r["split"] == "fit"],
        features_are_normalized=False, source_split_unit="whole_source_SHA_not_windows")
    with ResourceGuard(output, ResourceCaps(max_seconds=300, max_rss_bytes=4 * GIB)) as guard:
        items = []
        for row in rows:
            wave, native = decode(row)
            arrays, facts = extract(wave)
            filename = row["case"] + ".npz"
            checksum = save_npz(output / filename, **arrays)
            report["files"].append(dict(row, **native, **facts, npz_file=filename, npz_sha256=checksum))
            items.append((row["split"], arrays))
        mean, scale = fit_statistics(items)
        report["stats_sha256"] = save_npz(output / "stats.npz", mean=mean, scale=scale)
        report["stats_file"] = "stats.npz"
        report["statistics"] = "fit-only channelwise population std; zero std mapped to1; heldout never fits"
        if any(digest(row["source_path"]) != row["source_sha256"] for row in rows):
            raise RuntimeError("original_source_changed")
        report.update(status="complete", originals_unchanged=True,
                      elapsed_seconds=time.monotonic() - started, resources=guard.snapshot())
    payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
    if sum(p.stat().st_size for p in output.iterdir()) + len(payload) > LIMIT:
        raise ValueError("20MB_preparation_output_cap")
    with os.fdopen(os.open(output / "manifest.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as handle:
        handle.write(payload)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.manifest, args.output)


if __name__ == "__main__":
    os.umask(0o077)
    main()
