#!/usr/bin/env python3
"""Read-only, aggregate 32 ms versus 64 ms YIN comparison on private C001 audio.

Both trackers use the same 16 kHz / 10 ms frame centers, 80--1400 Hz search,
0.17 YIN threshold, and -60 dBFS RMS gate as ``mac_mps_ddsp_features``.
No model is trained, audio is not copied, and no filenames, waveforms, F0 traces,
or event times are printed. Low pitch and noise-like strata are *proxies*, not
ground-truth pitch or breath labels. A larger modulation estimate is not proof
that a tracker is more accurate on real daegeum recordings.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
import json
import math
from pathlib import Path
import random
import sys

import numpy as np

from audit_vibrato_boundaries import (
    AuditError,
    Event,
    _eligible_events,
    _load_labels,
    _load_manifest,
    _read_wav,
)
from mac_mps_ddsp_features import (
    BLOCK_SIZE,
    RMS_FLOOR_DB,
    SAMPLE_RATE,
    YIN_MAX_HZ,
    YIN_MIN_HZ,
    YIN_THRESHOLD,
    _yin_pitch_for_chunk,
)


WINDOWS = (512, 1024)
NOISE_LIKE_FLATNESS_MIN = 0.40
QUIET_RMS_DB = -50.0
NEAR_SILENT_RMS_DB = -60.0
STRATA = (
    "all_frames",
    "audible_tonal_proxy",
    "quiet_below_minus_50_dbfs",
    "near_silent_below_minus_60_dbfs",
    "noise_like_spectrum_proxy",
    "low_80_to_150_hz_by_64ms_reference",
    "vb01_start_outside",
    "vb01_start_inside",
    "vb01_core",
    "vb01_end_inside",
    "vb01_end_outside",
)


@dataclass
class Bucket:
    frames: int = 0
    voiced_32: int = 0
    voiced_64: int = 0
    both_voiced: int = 0
    only_32: int = 0
    only_64: int = 0
    cents_differences: list[float] = field(default_factory=list)

    def add(self, mask: np.ndarray, pitch32: np.ndarray, voiced32: np.ndarray,
            pitch64: np.ndarray, voiced64: np.ndarray) -> None:
        if mask.dtype != np.bool_ or not (
            mask.shape == pitch32.shape == voiced32.shape == pitch64.shape == voiced64.shape
        ):
            raise ValueError("invalid_comparison_grid")
        self.frames += int(np.count_nonzero(mask))
        self.voiced_32 += int(np.count_nonzero(mask & voiced32))
        self.voiced_64 += int(np.count_nonzero(mask & voiced64))
        both = mask & voiced32 & voiced64
        self.both_voiced += int(np.count_nonzero(both))
        self.only_32 += int(np.count_nonzero(mask & voiced32 & ~voiced64))
        self.only_64 += int(np.count_nonzero(mask & ~voiced32 & voiced64))
        if np.any(both):
            cents = np.abs(1200.0 * np.log2(pitch32[both] / pitch64[both]))
            self.cents_differences.extend(float(x) for x in cents)

    def report(self) -> dict:
        differences = np.asarray(self.cents_differences, dtype=np.float64)
        quantiles = (
            [round(float(x), 1) for x in np.quantile(differences, [0.5, 0.9, 0.99])]
            if differences.size >= 20 else None
        )
        return {
            "frames": self.frames,
            "voiced_32ms": self.voiced_32,
            "voiced_64ms": self.voiced_64,
            "both_voiced": self.both_voiced,
            "only_32ms": self.only_32,
            "only_64ms": self.only_64,
            "shared_voiced_abs_difference_cents_p50_p90_p99": quantiles,
            "shared_voiced_disagreement_over_50_cents": int(np.count_nonzero(differences > 50)),
            "shared_voiced_disagreement_over_600_cents": int(np.count_nonzero(differences > 600)),
        }


def extract_yin(audio: np.ndarray, window: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray | None]:
    """Match the candidate extractor's centered frames without its loudness FFT."""
    if window not in WINDOWS:
        raise ValueError("unsupported_yin_window")
    signal = np.asarray(audio, dtype=np.float64)
    if signal.ndim != 1 or signal.size < BLOCK_SIZE or not np.all(np.isfinite(signal)):
        raise ValueError("invalid_mono_audio")
    count = signal.size // BLOCK_SIZE
    padded = np.pad(signal, (window // 2, window // 2), mode="reflect")
    frames = np.lib.stride_tricks.sliding_window_view(padded, window)[
        : count * BLOCK_SIZE : BLOCK_SIZE
    ]
    pitch = np.zeros(count, dtype=np.float32)
    voiced = np.zeros(count, dtype=np.bool_)
    rms_db = np.zeros(count, dtype=np.float32)
    flatness = np.zeros(count, dtype=np.float32) if window == WINDOWS[0] else None
    hann = np.hanning(window + 1)[:-1] if flatness is not None else None
    for start in range(0, count, 256):
        end = min(count, start + 256)
        chunk = np.asarray(frames[start:end], dtype=np.float64)
        rms = np.sqrt(np.mean(chunk * chunk, axis=1))
        block_rms_db = 20.0 * np.log10(np.maximum(rms, 1e-12))
        pitch[start:end], voiced[start:end] = _yin_pitch_for_chunk(
            chunk, block_rms_db, sample_rate=SAMPLE_RATE
        )
        rms_db[start:end] = block_rms_db
        if flatness is not None:
            power = np.abs(np.fft.rfft(chunk * hann, axis=1))[:, 1:] ** 2
            arithmetic = np.mean(power, axis=1)
            floor = np.maximum(arithmetic * 1e-12, 1e-16)
            geometric = np.exp(np.mean(np.log(np.maximum(power, floor[:, None])), axis=1))
            flatness[start:end] = geometric / np.maximum(arithmetic, 1e-16)
    return pitch, voiced, rms_db, flatness


def _event_masks(times: np.ndarray, event: Event | None) -> dict[str, np.ndarray]:
    empty = np.zeros(times.shape, dtype=np.bool_)
    keys = STRATA[-5:]
    if event is None:
        return {key: empty for key in keys}
    a, b = event.start, event.end
    bounds = (
        (a - .25, a - .05), (a + .05, a + .25),
        (a + .10, b - .10),
        (b - .25, b - .05), (b + .05, b + .25),
    )
    return {key: (times >= start) & (times < end)
            for key, (start, end) in zip(keys, bounds)}


def _periodic_depth_ratio(pitch32: np.ndarray, voiced32: np.ndarray,
                          pitch64: np.ndarray, voiced64: np.ndarray,
                          times: np.ndarray, core: np.ndarray) -> float | None:
    """Exploratory 3.5--8.5 Hz fit on *identical* shared-voiced VB01 frames."""
    shared = core & voiced32 & voiced64
    if np.count_nonzero(core) < 50 or np.count_nonzero(shared) < 45:
        return None
    if np.count_nonzero(shared) / np.count_nonzero(core) < .80:
        return None
    indices = np.flatnonzero(shared)
    if np.max(np.diff(indices), initial=0) > 4:
        return None
    tracks = [1200.0 * np.log2(p[shared] / np.median(p[shared])) for p in (pitch32, pitch64)]
    if any(np.any(np.abs(np.diff(track)) > 100) for track in tracks):
        return None
    t = times[shared] - float(np.mean(times[shared]))
    baseline = np.column_stack((np.ones(t.size), t))
    residual_energy = []
    for track in tracks:
        coefficients, *_ = np.linalg.lstsq(baseline, track, rcond=None)
        residual = track - baseline @ coefficients
        residual_energy.append(float(np.dot(residual, residual)))
    if min(residual_energy) < 1e-6:
        return None
    best_score, best_amplitudes, best_gains = -1.0, None, None
    for frequency in np.arange(3.5, 8.501, .25):
        phase = 2.0 * math.pi * frequency * t
        design = np.column_stack((baseline, np.sin(phase), np.cos(phase)))
        amplitudes, gains = [], []
        for track, baseline_sse in zip(tracks, residual_energy):
            coefficient, *_ = np.linalg.lstsq(design, track, rcond=None)
            residual = track - design @ coefficient
            amplitudes.append(math.hypot(float(coefficient[-2]), float(coefficient[-1])))
            gains.append(max(0.0, 1.0 - float(np.dot(residual, residual)) / baseline_sse))
        score = min(gains)
        if score > best_score:
            best_score, best_amplitudes, best_gains = score, amplitudes, gains
    if best_amplitudes is None or best_gains is None:
        return None
    if min(best_gains) < .40 or min(best_amplitudes) < 8.0:
        return None
    return float(best_amplitudes[0] / best_amplitudes[1])


def compare_audio(audio: np.ndarray, event: Event | None,
                  buckets: dict[str, Bucket]) -> float | None:
    """Update aggregate-only buckets for one clip; return one optional depth ratio."""
    pitch32, voiced32, rms_db, flatness = extract_yin(audio, 512)
    pitch64, voiced64, _, _ = extract_yin(audio, 1024)
    assert flatness is not None
    times = np.arange(pitch32.size) * BLOCK_SIZE / SAMPLE_RATE
    masks = {
        "all_frames": np.ones(times.shape, dtype=np.bool_),
        "audible_tonal_proxy": (rms_db >= QUIET_RMS_DB) & (flatness < .20),
        "quiet_below_minus_50_dbfs": rms_db < QUIET_RMS_DB,
        "near_silent_below_minus_60_dbfs": rms_db < NEAR_SILENT_RMS_DB,
        "noise_like_spectrum_proxy": (rms_db >= QUIET_RMS_DB) &
                                     (flatness >= NOISE_LIKE_FLATNESS_MIN),
        "low_80_to_150_hz_by_64ms_reference": voiced64 &
                                               (pitch64 >= 80.0) & (pitch64 < 150.0),
    }
    masks.update(_event_masks(times, event))
    for name in STRATA:
        buckets[name].add(masks[name], pitch32, voiced32, pitch64, voiced64)
    return _periodic_depth_ratio(
        pitch32, voiced32, pitch64, voiced64, times, masks["vb01_core"]
    ) if event is not None else None


def audit(prepared_dir: Path, label_zip: Path, *, max_clips: int = 250,
          seed: int = 71470) -> dict:
    if not 5 <= max_clips <= 250:
        raise AuditError("invalid_clip_limit")
    records = _load_manifest(prepared_dir)
    rng = random.Random(seed)
    rng.shuffle(records)
    selected = records[:max_clips]
    labels = _load_labels(label_zip, {stem for _, stem in selected})
    buckets = {key: Bucket() for key in STRATA}
    ratios: list[float] = []
    clips_with_event = 0
    for filename, stem in selected:
        duration, entries = labels[stem]
        events = _eligible_events(duration, entries)
        event = rng.choice(events) if events else None
        audio = _read_wav(prepared_dir / filename)
        if abs(len(audio) / SAMPLE_RATE - duration) > .05:
            raise AuditError("wav_label_duration_mismatch")
        if event is not None:
            clips_with_event += 1
        ratio = compare_audio(audio, event, buckets)
        if ratio is not None and math.isfinite(ratio):
            ratios.append(ratio)
    depth_quantiles = (
        [round(float(x), 3) for x in np.quantile(ratios, [.1, .5, .9])]
        if len(ratios) >= 5 else None
    )
    return {
        "schema": "mini.aihub-71470-private-yin-window-audit.v1",
        "read_only": True,
        "clips": len(selected),
        "clips_with_isolated_vb01_event": clips_with_event,
        "hop_seconds": BLOCK_SIZE / SAMPLE_RATE,
        "windows_seconds": [x / SAMPLE_RATE for x in WINDOWS],
        "common_pitch_range_hz": [YIN_MIN_HZ, YIN_MAX_HZ],
        "common_yin_threshold": YIN_THRESHOLD,
        "common_rms_gate_dbfs": RMS_FLOOR_DB,
        "seed": seed,
        "strata": {key: buckets[key].report() for key in STRATA},
        "vb01_periodic_depth_ratio_32_over_64": {
            "accepted_events": len(ratios),
            "p10_p50_p90": depth_quantiles,
        },
        "interpretation_limits": [
            "No ground-truth F0 or breath/voicing labels; disagreement is not accuracy.",
            "Low-pitch stratum is conditioned on the 64 ms estimate and may contain octave errors.",
            "Quiet and spectral-flatness strata are acoustic proxies, not verified rests or breaths.",
            "One isolated VB01 event at most per clip; labels and audio onset may not align exactly.",
            "VB01 depth ratio is conditional on both trackers voicing the same stable frames; not a model-quality score.",
            "No source audio, frame curves, event times, or filenames are included in this report.",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepared-dir", type=Path, required=True)
    parser.add_argument("--label-zip", type=Path, required=True)
    parser.add_argument("--max-clips", type=int, default=250)
    parser.add_argument("--seed", type=int, default=71470)
    args = parser.parse_args(argv)
    try:
        result = audit(args.prepared_dir, args.label_zip,
                       max_clips=args.max_clips, seed=args.seed)
    except AuditError as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 2
    except Exception:
        print(json.dumps({"error": "unexpected_audit_error"}), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
