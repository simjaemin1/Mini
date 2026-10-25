#!/usr/bin/env python3
"""Bounded, native-source 24k SiFi-GAN corpus plus independent diagnostics.

All Arirang files and deep-vibrato are evaluation-only and historically seen.
No diagnostics are silently used to mask, correct, or interpolate measured F0.
"""
import argparse
import hashlib
import io
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from prepare_real_features import continuous_f0, digest
sys.path.insert(0, str(HERE.parent / "foundation-model-trial"))
from ace_limits import GIB, ResourceCaps, ResourceGuard

RATE, HOP, WINDOW = 24000, 120, 1536
MAX_FILES, MAX_SECONDS, MAX_BYTES = 15, 1200., 400_000_000
FIXED = (
    ("sus04", "fit", "scale-sustained", "단음/산조대금/기본음계/sanjo_deageum_scale_sus_04.wv"),
    ("vib39", "fit", "scale-vibrato", "단음/산조대금/기본음계/sanjo_deageum_scale_vib_39.wv"),
    ("deepvib48", "heldout", "scale-deep-vibrato", "단음/산조대금/기본음계/sanjo_deageum_scale_deep_vib_48.wv"),
    ("sanjo2", "fit", "performance-taepyeongga", "단음/산조대금/연주/Sanjo_deageum_2.flac"),
    ("daru1", "fit", "articulation-daruchigi", "단음/산조대금/시김새/Sanjo_deageum_1.wv"),
    ("nina29", "fit", "articulation-noniro", "단음/산조대금/시김새/sanjo_deageum_nina_29.wv"),
    ("nira23", "fit", "articulation-nira", "단음/산조대금/시김새/sanjo_deageum_nira_23.wv"),
    ("staccato60", "fit", "articulation-staccato", "단음/산조대금/시김새/sanjo_deageum_stacatto_60.wv"),
    ("chung34", "fit", "articulation-crescendo", "단음/산조대금/시김새/sanjo_deageum_scale_chung_34.wv"),
) + tuple((f"arirang{i:03}", "heldout", "title-arirang", f"악구/대금/민요/아리랑/w3-914-{i:03}__아리랑 {i:02}.flac") for i in range(1, 5))


def probe(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=sample_rate,channels:format=duration", "-of", "json", str(path)],
        capture_output=True, check=True, timeout=20)
    value = json.loads(result.stdout)
    stream, duration = value["streams"][0], float(value["format"]["duration"])
    rate, channels = int(stream["sample_rate"]), int(stream["channels"])
    if rate < RATE or channels < 1 or not math.isfinite(duration) or duration <= 0:
        raise ValueError("finite_native_source_at_least24k_required")
    return dict(native_sample_rate=rate, native_channels=channels, source_duration_seconds=duration)


def plan(source_root):
    root = Path(source_root).resolve(strict=True)
    if len(FIXED) > MAX_FILES or not (root / ".done").is_file():
        raise ValueError("bounded_complete_public_archive_required")
    rows = []
    for case, split, group, relative in FIXED:
        path = (root / relative).resolve(strict=True)
        if not path.is_relative_to(root) or not path.is_file() or path.suffix not in {".wv", ".flac", ".wav"}:
            raise ValueError("read_only_lossless_public_source_required")
        rows.append(dict(case=case, split=split, source_group=group, source_path=str(path),
            source_sha256=digest(path), **probe(path)))
    if len({r["source_sha256"] for r in rows}) != len(rows):
        raise ValueError("duplicate_source_SHA_in_corpus")
    if sum(r["source_duration_seconds"] for r in rows) > MAX_SECONDS:
        raise ValueError("full_source1200second_cap_no_silent_truncation")
    groups = {}
    for row in rows:
        groups.setdefault(row["source_group"], set()).add(row["split"])
        if row["case"].startswith("arirang") and row["split"] != "heldout":
            raise ValueError("all_arirang_evaluation_only")
    if any(len(splits) != 1 for splits in groups.values()):
        raise ValueError("same_piece_group_split_leakage")
    return rows


def decode(row):
    result = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", row["source_path"],
        "-vn", "-ac", "1", "-ar", str(RATE), "-f", "f64le", "pipe:1"],
        capture_output=True, check=True, timeout=120)
    wave = np.frombuffer(result.stdout, dtype="<f8").copy()
    if wave.ndim != 1 or len(wave) < HOP or not np.isfinite(wave).all():
        raise ValueError("finite_mono_decoded_waveform_required")
    if abs(len(wave) / RATE - row["source_duration_seconds"]) > .02:
        raise ValueError("decode_duration_metadata_mismatch")
    if len(wave) > MAX_SECONDS * RATE:
        raise ValueError("decoded_duration_cap")
    return wave


def diagnostics(wave):
    """64ms centered reflect-padded FFT-YIN, 5ms hop, 70..1800Hz.

    Periodicity is 1-CMNDF at its chosen integer-lag trough, not confidence.
    The cumulative-energy difference formula follows mac_mps_ddsp_features.
    """
    count = len(wave) // HOP
    view = np.lib.stride_tricks.sliding_window_view(
        np.pad(wave, (WINDOW // 2, WINDOW // 2), mode="reflect"), WINDOW)[:count * HOP:HOP]
    rms_db, yin, periodicity = (np.zeros(count, np.float32) for _ in range(3))
    tau_min, tau_max = math.ceil(RATE / 1800), math.floor(RATE / 70)
    lags = np.arange(tau_max + 1)
    for start in range(0, count, 256):
        frames = np.asarray(view[start:start + 256], dtype=np.float64)
        energy = frames * frames
        rms = 20 * np.log10(np.maximum(np.sqrt(energy.mean(axis=1)), 1e-12))
        rms_db[start:start + len(frames)] = rms
        spectrum = np.fft.rfft(frames, n=4096, axis=1)
        ac = np.fft.irfft(spectrum * spectrum.conj(), n=4096, axis=1)
        prefix = np.concatenate((np.zeros((len(frames), 1)), np.cumsum(energy, axis=1)), axis=1)
        difference = np.maximum(prefix[:, WINDOW - lags] + prefix[:, WINDOW, None]
            - prefix[:, lags] - 2 * ac[:, :tau_max + 1], 0.)
        cumulative = np.cumsum(difference[:, 1:], axis=1)
        cmnd = np.ones_like(difference)
        np.divide(difference[:, 1:] * lags[1:], cumulative, out=cmnd[:, 1:], where=cumulative > 1e-15)
        for index in np.flatnonzero(rms > -60.):
            crossing = np.flatnonzero(cmnd[index, tau_min:tau_max + 1] < .17)
            if not len(crossing):
                continue
            lag = tau_min + int(crossing[0])
            while lag < tau_max and cmnd[index, lag + 1] < cmnd[index, lag]:
                lag += 1
            refined = float(lag)
            if 1 < lag < tau_max:
                left, mid, right = cmnd[index, lag - 1:lag + 2]
                curvature = left - 2 * mid + right
                if curvature > 1e-12:
                    refined += float(np.clip(.5 * (left - right) / curvature, -1, 1))
            hz = RATE / refined
            if 70 <= hz <= 1800 and math.isfinite(hz):
                yin[start + index] = hz
                periodicity[start + index] = np.clip(1 - cmnd[index, lag], 0, 1)
    return dict(rms_db=rms_db, yin_hz=yin, periodicity=periodicity)


def extract(wave):
    import pyworld
    import pysptk
    frames, original_samples = len(wave) // HOP, len(wave)
    wave = np.ascontiguousarray(wave[:frames * HOP], dtype=np.float64)
    f0, times = pyworld.harvest(wave, RATE, f0_floor=70., f0_ceil=1800., frame_period=5.)
    sp = pyworld.cheaptrick(wave, f0, times, RATE, fft_size=2048)
    ap = pyworld.d4c(wave, f0, times, RATE, threshold=.85, fft_size=2048)
    mcep, bap = pysptk.sp2mc(sp, order=39, alpha=.466), pyworld.code_aperiodicity(ap, RATE)
    cf0 = continuous_f0(f0)
    if min(len(f0), len(cf0), len(mcep), len(bap)) < frames:
        raise ValueError("insufficient_aligned_WORLD_frames")
    features = np.concatenate((mcep[:frames], bap[:frames]), axis=1).astype(np.float32)
    if features.shape != (frames, 43):
        raise ValueError("40mcep_plus3bap_required")
    arrays = dict(waveform=wave.astype(np.float32), f0=f0[:frames].astype(np.float32),
        cf0=cf0[:frames].astype(np.float32), features=features,
        ap_all_one=np.all(ap[:frames] >= .999, axis=1), **diagnostics(wave))
    if any(not np.isfinite(value).all() for value in arrays.values()):
        raise ValueError("nonfinite_corpus_arrays")
    if (arrays["f0"] < 0).any() or (arrays["f0"] > 1800).any() or (arrays["cf0"] < 0).any():
        raise ValueError("invalid_F0_values")
    voiced = arrays["f0"] > 0
    return arrays, dict(frames=frames, samples=len(wave), duration_seconds=len(wave) / RATE,
        trimmed_tail_samples=original_samples - len(wave), endpoint_frames_trimmed=len(times) - frames,
        extractor_versions=dict(numpy=np.__version__, pyworld=getattr(pyworld, "__version__", "unknown"),
            pysptk=getattr(pysptk, "__version__", "unknown")),
        waveform_peak=float(np.abs(wave).max()), waveform_rms=float(np.sqrt(np.mean(wave * wave))),
        voiced_frames=int(voiced.sum()), voiced_fraction=float(voiced.mean()),
        voiced_ap_all_one_fraction=float(arrays["ap_all_one"][voiced].mean()) if voiced.any() else None,
        voiced_f0_min_max=[float(arrays["f0"][voiced].min()), float(arrays["f0"][voiced].max())] if voiced.any() else None)


def save_npz(path, **arrays):
    buffer = io.BytesIO()
    np.savez_compressed(buffer, **arrays)
    payload = buffer.getvalue()
    if sum(p.stat().st_size for p in path.parent.iterdir() if p.is_file()) + len(payload) > MAX_BYTES:
        raise ValueError("400MB_corpus_output_cap")
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as handle:
        handle.write(payload)
    return digest(path)


def prepare(source_root: Path, output: Path) -> dict:
    source_root, output = Path(source_root).resolve(strict=True), Path(output).resolve()
    if output.exists() or output.is_relative_to(source_root):
        raise ValueError("fresh_private_output_outside_read_only_archive_required")
    output.mkdir(mode=0o700)
    started = time.monotonic()
    report = dict(schema="mini.sifigan-corpus.v1", status="preparing", files=[], source_root=str(source_root),
        sample_rate=RATE, hop_size=HOP, heldout_is_blind=False, all_arirang_evaluation_only=True,
        source_credit="국악기 음원 제공 — 국립국악원 (공공누리 제1유형)", AIHub_files_used=0,
        features_are_normalized=False, model_training_performed=False, sound_quality_approved=False,
        full_native_duration=True, split_unit="whole_source_SHA_and_title_group_not_windows",
        feature_spec=dict(f0_floor=70., f0_ceil=1800., frame_period_ms=5., fft_size=2048,
            d4c_threshold=.85, mcep_order=39, mcep_alpha=.466, bap_dimensions=3,
            highpass_hz=0, gain=1., cf0_lowpass_hz=20),
        diagnostic_spec=dict(sample_rate=RATE, centered_window_samples=WINDOW, hop_samples=HOP,
            pad_mode="reflect", method="FFT-YIN linear-autocorrelation and cumulative-energy CMNDF",
            f0_floor=70., f0_ceil=1800., threshold=.17, rms_floor_db=-60., rms_minimum_amplitude=1e-12,
            periodicity="clip(1-CMNDF_selected_integer_trough,0,1); not calibrated confidence; invalid=0",
            frame_times="frame_index*0.005seconds; same WORLD grid", ap_all_one="all FFT bins>=0.999",
            automatic_frame_corrections_or_exclusions=False),
        adaptations=["No70Hz causal highpass; no target/conditioning filter delay", "FFT2048 vs upstream1024",
            "No16k helper inputs/upsampling; native originals directly to24k", "Sub5ms audio tail and WORLD endpoint only trimmed"],
        code_bindings={str(path.relative_to(HERE.parent)): digest(path) for path in
            (Path(__file__).resolve(), HERE / "prepare_real_features.py", HERE.parent / "foundation-model-trial/ace_limits.py")})
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=600, max_rss_bytes=4 * GIB)) as guard:
            rows = plan(source_root)
            report["source_archive_done_sha256"] = digest(source_root / ".done")
            # Accumulate sufficient statistics only from fit, not whole corpus copies in RAM.
            count, total, squares = 0, np.zeros(43), np.zeros(43)
            decoded_hashes = set()
            for row in rows:
                arrays, facts = extract(decode(row))
                decoded_hash = hashlib.sha256(arrays["waveform"].tobytes()).hexdigest()
                if decoded_hash in decoded_hashes:
                    raise ValueError("duplicate_decoded_source_PCM_in_corpus")
                decoded_hashes.add(decoded_hash)
                filename = row["case"] + ".npz"
                checksum = save_npz(output / filename, **arrays)
                report["files"].append(dict(row, **facts, npz_file=filename, npz_sha256=checksum,
                    decoded_waveform_sha256=decoded_hash))
                if row["split"] == "fit":
                    features = arrays["features"].astype(np.float64)
                    count += len(features)
                    total += features.sum(axis=0)
                    squares += (features * features).sum(axis=0)
                if digest(row["source_path"]) != row["source_sha256"]:
                    raise RuntimeError("source_changed_during_preparation")
                del arrays
            if not count:
                raise ValueError("fit_frames_required")
            mean = total / count
            scale = np.sqrt(np.maximum(squares / count - mean * mean, 0))
            scale[scale == 0] = 1
            report["stats_sha256"] = save_npz(output / "stats.npz", mean=mean, scale=scale)
            report.update(stats_file="stats.npz", statistics_fit_frames=count,
                statistics="fit-only unfiltered rawframes population variance; later training gate must refit acceptedframes",
                stats_are_validated_training_window_stats=False)
            if any(digest(row["source_path"]) != row["source_sha256"] for row in rows):
                raise RuntimeError("original_source_changed")
            report.update(status="complete", originals_unchanged=True, resources=guard.snapshot(),
                total_duration_seconds=sum(r["duration_seconds"] for r in report["files"]),
                source_total_duration_seconds=sum(r["source_duration_seconds"] for r in rows))
    except BaseException as error:
        report.update(status="failed", error_type=type(error).__name__, error=str(error)[:500])
        raise
    finally:
        report["elapsed_seconds"] = time.monotonic() - started
        payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
        if sum(p.stat().st_size for p in output.iterdir() if p.is_file()) + len(payload) > MAX_BYTES:
            raise ValueError("400MB_corpus_output_cap")
        with os.fdopen(os.open(output / "manifest.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as handle:
            handle.write(payload)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.source_root, args.output)


if __name__ == "__main__":
    os.umask(0o077)
    main()
