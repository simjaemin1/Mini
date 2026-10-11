"""Dependency-light 16 kHz / 100 Hz conditioning for the IRCAM DDSP pilot.

Only NumPy is imported.  This is a candidate acoustic F0 extractor, *not*
CREPE and not an acoustic-to-score aligner.  Uncertain or quiet frames have
pitch_hz == 0 and voiced_mask == False so that a training caller can explicitly
mask or exclude them.  Do not silently interpolate such frames as if measured.

Loudness intentionally follows the upstream, somewhat unusual, definition in
https://github.com/acids-ircam/ddsp_pytorch/blob/master/ddsp/core.py :
mean_frequency(log(abs(librosa.stft(...)) + 1e-7) + librosa.A_weighting(freqs)),
with the terminal center=True frame dropped.  This pilot fixes librosa 0.11's
default constant zero padding; older librosa releases defaulted to reflect,
so the boundary frames are not interchangeable.  The A-weighting constants follow
https://github.com/librosa/librosa/blob/main/librosa/core/convert.py .
Its A-weight is in dB while the spectrogram is a natural logarithm.  We retain
that mixture for source compatibility; this is not a standard loudness meter.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np


SAMPLE_RATE = 16_000
BLOCK_SIZE = 160
N_FFT = 2_048
YIN_WINDOW = 1_024
YIN_MIN_HZ = 80.0
YIN_MAX_HZ = 1_400.0
YIN_THRESHOLD = 0.17
RMS_FLOOR_DB = -60.0
_CHUNK_FRAMES = 256


def _a_weighting_db(frequencies_hz: np.ndarray) -> np.ndarray:
    """Replicate librosa.A_weighting's current default -80 dB floor."""
    f_sq = np.asarray(frequencies_hz, dtype=np.float64) ** 2
    c = np.array([12194.217, 20.598997, 107.65265, 737.86223]) ** 2
    with np.errstate(divide="ignore"):
        weight = 2.0 + 20.0 * (
            np.log10(c[0])
            + 2.0 * np.log10(f_sq)
            - np.log10(f_sq + c[0])
            - np.log10(f_sq + c[1])
            - 0.5 * np.log10(f_sq + c[2])
            - 0.5 * np.log10(f_sq + c[3])
        )
    return np.maximum(-80.0, weight)


def _yin_pitch_for_chunk(
    frames: np.ndarray,
    rms_db: np.ndarray,
    *,
    sample_rate: int,
) -> tuple[np.ndarray, np.ndarray]:
    """FFT-autocorrelation YIN/CMND with a conservative voicing gate.

    See de Cheveigné & Kawahara (2002), DOI: 10.1121/1.1458024.  The FFT
    computes the linear (zero-padded) autocorrelation; prefix sums supply the
    two truncated-window energy terms of YIN's difference function.
    """
    count, window_size = frames.shape
    result = np.zeros(count, dtype=np.float32)
    voiced = np.zeros(count, dtype=np.bool_)
    tau_min = max(2, int(math.ceil(sample_rate / YIN_MAX_HZ)))
    tau_max = min(window_size // 2, int(math.floor(sample_rate / YIN_MIN_HZ)))
    if tau_max <= tau_min:
        raise ValueError("yin_window_too_short_for_pitch_range")

    fft_size = 1 << (2 * window_size - 2).bit_length()
    spectrum = np.fft.rfft(frames, n=fft_size, axis=1)
    autocorr = np.fft.irfft(spectrum * spectrum.conj(), n=fft_size, axis=1)
    squared = frames * frames
    prefix = np.concatenate(
        [np.zeros((count, 1), dtype=np.float64), np.cumsum(squared, axis=1)],
        axis=1,
    )
    lags = np.arange(tau_max + 1)
    difference = (
        prefix[:, window_size - lags]
        + prefix[:, window_size, None]
        - prefix[:, lags]
        - 2.0 * autocorr[:, : tau_max + 1]
    )
    np.maximum(difference, 0.0, out=difference)
    cumulative = np.cumsum(difference[:, 1:], axis=1)
    cmnd = np.ones_like(difference)
    np.divide(
        difference[:, 1:] * np.arange(1, tau_max + 1),
        cumulative,
        out=cmnd[:, 1:],
        where=cumulative > 1e-15,
    )

    for index in np.flatnonzero(rms_db > RMS_FLOOR_DB):
        crossing = np.flatnonzero(cmnd[index, tau_min : tau_max + 1] < YIN_THRESHOLD)
        if crossing.size == 0:
            continue
        lag = tau_min + int(crossing[0])
        # The first threshold crossing is on the descending side of a trough.
        while lag < tau_max and cmnd[index, lag + 1] < cmnd[index, lag]:
            lag += 1
        if cmnd[index, lag] >= YIN_THRESHOLD:
            continue
        refined_lag = float(lag)
        if 1 < lag < tau_max:
            left, mid, right = cmnd[index, lag - 1 : lag + 2]
            curvature = left - 2.0 * mid + right
            if curvature > 1e-12:
                refined_lag += float(np.clip(0.5 * (left - right) / curvature, -1.0, 1.0))
        estimate = sample_rate / refined_lag
        if YIN_MIN_HZ <= estimate <= YIN_MAX_HZ and np.isfinite(estimate):
            result[index] = estimate
            voiced[index] = True
    return result, voiced


def extract_features(
    audio: np.ndarray,
    sample_rate: int = SAMPLE_RATE,
    block_size: int = BLOCK_SIZE,
) -> dict[str, np.ndarray]:
    """Return 100 Hz source-compatible conditioning from mono float audio.

    Frames are centered at samples 0, 160, ... and the final librosa STFT
    center frame is omitted.  Thus four seconds at 16 kHz yields exactly 400
    samples for each output field.  A partial trailing hop is omitted too.
    """
    if sample_rate != SAMPLE_RATE or block_size != BLOCK_SIZE:
        raise ValueError("only_16khz_160_sample_block_supported")
    signal = np.asarray(audio, dtype=np.float64)
    if signal.ndim != 1 or signal.size < block_size:
        raise ValueError("mono_audio_at_least_one_block_required")
    if not np.all(np.isfinite(signal)):
        raise ValueError("nonfinite_audio")
    frame_count = signal.size // block_size
    # With the pinned librosa 0.11, stft(center=True) uses constant zero
    # padding and a periodic (FFTBINS) Hann. Upstream drops its last frame.
    padded = np.pad(signal, (N_FFT // 2, N_FFT // 2), mode="constant")
    frame_view = np.lib.stride_tricks.sliding_window_view(padded, N_FFT)[
        : frame_count * block_size : block_size
    ]
    # A 64 ms YIN window follows a 5-7 Hz vibrato substantially better than
    # the 128 ms spectral window, while still spanning several cycles at 80 Hz.
    yin_padded = np.pad(signal, (YIN_WINDOW // 2, YIN_WINDOW // 2), mode="reflect")
    yin_view = np.lib.stride_tricks.sliding_window_view(yin_padded, YIN_WINDOW)[
        : frame_count * block_size : block_size
    ]
    hann = np.hanning(N_FFT + 1)[:-1]
    frequencies = np.fft.rfftfreq(N_FFT, d=1.0 / sample_rate)
    a_weight = _a_weighting_db(frequencies)

    pitch_hz = np.zeros(frame_count, dtype=np.float32)
    voiced_mask = np.zeros(frame_count, dtype=np.bool_)
    rms_db = np.zeros(frame_count, dtype=np.float32)
    loudness = np.zeros(frame_count, dtype=np.float32)
    for start in range(0, frame_count, _CHUNK_FRAMES):
        end = min(start + _CHUNK_FRAMES, frame_count)
        frames = np.asarray(frame_view[start:end], dtype=np.float64)
        yin_frames = np.asarray(yin_view[start:end], dtype=np.float64)
        rms = np.sqrt(np.mean(yin_frames * yin_frames, axis=1))
        block_rms_db = 20.0 * np.log10(np.maximum(rms, 1e-12))
        rms_db[start:end] = block_rms_db.astype(np.float32)
        block_pitch, block_voiced = _yin_pitch_for_chunk(
            yin_frames, block_rms_db, sample_rate=sample_rate
        )
        pitch_hz[start:end] = block_pitch
        voiced_mask[start:end] = block_voiced

        magnitude = np.abs(np.fft.rfft(frames * hann, axis=1))
        # This is a natural logarithm plus the upstream dB A-weight, not dBFS.
        weighted_log_spectrum = np.log(magnitude + 1e-7) + a_weight[None, :]
        loudness[start:end] = weighted_log_spectrum.mean(axis=1).astype(np.float32)

    return {
        "pitch_hz": pitch_hz,
        "loudness": loudness,
        "voiced_mask": voiced_mask,
        "rms_db": rms_db,
    }


def normalize_loudness(segments: Sequence[np.ndarray]) -> tuple[float, float]:
    """Average segment means/stds for IRCAM-style loudness normalization.

    The upstream ``mean_std_loudness`` averages means and (unbiased PyTorch)
    standard deviations of the loader's units.  This function takes each
    input segment as one unit; a caller should not pass held-out segments.
    """
    if not segments:
        raise ValueError("at_least_one_training_segment_required")
    means: list[float] = []
    stds: list[float] = []
    for segment in segments:
        values = np.asarray(segment, dtype=np.float64)
        if values.ndim != 1 or values.size < 2 or not np.all(np.isfinite(values)):
            raise ValueError("invalid_loudness_segment")
        means.append(float(np.mean(values)))
        stds.append(float(np.std(values, ddof=1)))
    mean = math.fsum(means) / len(means)
    std = math.fsum(stds) / len(stds)
    if not math.isfinite(std) or std <= 1e-8:
        raise ValueError("loudness_has_no_variance")
    return mean, std
