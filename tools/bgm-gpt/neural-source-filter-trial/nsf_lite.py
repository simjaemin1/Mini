"""Small, from-scratch neural source-filter decoder; no external weights.

API: audio, facts = model(f0_hz, loudness_db, voicing, active, noise_seed=7).
All controls are finite [batch, frames] at 100 Hz; audio is [batch, 1,
frames*240] at 24 kHz. Loudness is unnormalized dBFS conditioning, not an
assertion that output RMS equals that value. The caller trains the decoder.

Unlike additive DDSP's final sum of weighted sinusoids, a learned, nonlinear,
causal dilated-convolution filter transforms harmonic AND noise excitation
into waveform samples. This is an NSF-inspired small research architecture,
not an implementation of SiFi-GAN, a pretrained model, or a quality guarantee.
F0 excitation is explicit, but actual output F0 must still be measured.

CPU float64 phase and left-held controls avoid future-input-dependent phase.
Two-times internal sampling and a fixed FIR reduce aliasing (not eliminate
every nonlinear alias). The FIR is L1-normalized for a strict output bound;
its DC gain is consequently below unity. Controls are intentionally detached.
Voicing gates harmonics ONLY: active=1/voicing=0 preserves learned breath/noise;
active=0 forces exact silence. Soft active edges/releases must be authored by
the caller; they are not learned breathing. There is no audio/data/model I/O.
"""
from __future__ import annotations

import math

import torch
from torch import nn
from torch.nn import functional as F

SAMPLE_RATE, CONTROL_HZ, OVERSAMPLE = 24_000, 100, 2
HOP = SAMPLE_RATE // CONTROL_HZ
INNER_RATE, INNER_HOP = SAMPLE_RATE * OVERSAMPLE, HOP * OVERSAMPLE


def validate_controls(f0_hz, loudness_db, voicing, active):
    values = [value.detach().to(device="cpu", dtype=torch.float64)
              for value in (f0_hz, loudness_db, voicing, active)]
    if (any(value.ndim != 2 or not value.numel() for value in values)
            or any(value.shape != values[0].shape for value in values)
            or not all(bool(torch.isfinite(value).all()) for value in values)):
        raise ValueError("finite_matching_batch_by_100hz_frames_required")
    pitch, level, uv, mask = values
    if (bool(((pitch < 0) | (pitch > SAMPLE_RATE * .45)).any())
            or bool(((level < -120) | (level > 6)).any())
            or bool(((uv < 0) | (uv > 1) | (mask < 0) | (mask > 1)).any())
            or bool(((uv > 0) & (pitch <= 0)).any())):
        raise ValueError("invalid_pitch_dbfs_voicing_or_active_control_range")
    return values


def excitation(controls, *, harmonics=8, noise_seed=0):
    """CPU-only sources; local Generator never changes global/model RNG state."""
    if not isinstance(noise_seed, int) or not 0 <= noise_seed < 2 ** 63:
        raise ValueError("noise_seed_must_be_nonnegative_int63")
    pitch, _, uv, _ = controls
    sampled_f0 = pitch.repeat_interleave(INNER_HOP, dim=-1)
    phase = torch.cumsum(sampled_f0 / INNER_RATE, dim=-1, dtype=torch.float64)
    periodic = torch.zeros_like(phase)
    normalization = sum(1 / index for index in range(1, harmonics + 1))
    for index in range(1, harmonics + 1):
        valid = sampled_f0 * index < SAMPLE_RATE * .45
        periodic += torch.sin(2 * math.pi * (phase * index).remainder(1)) * valid / index
    periodic *= uv.repeat_interleave(INNER_HOP, dim=-1) / normalization
    generator = torch.Generator(device="cpu").manual_seed(noise_seed)
    noise = torch.randn(periodic.shape, generator=generator, dtype=torch.float32) * .1
    sources = torch.stack((periodic.float(), noise), dim=1)
    return sources, phase


class GatedFilter(nn.Module):
    def __init__(self, channels, dilation):
        super().__init__()
        self.left = 2 * dilation
        self.filter = nn.Conv1d(channels, channels * 2, 3, dilation=dilation)
        self.mix = nn.Conv1d(channels, channels, 1)

    def forward(self, hidden, condition):
        first, second = (self.filter(F.pad(hidden, (self.left, 0))) + condition).chunk(2, dim=1)
        residual = self.mix(torch.tanh(first) * torch.sigmoid(second))
        return (hidden + residual) / math.sqrt(2)


class NSFLite(nn.Module):
    """FP32 CPU/MPS-compatible operations; MPS support needs a local smoke test.

    A single frame-rate conditioning projection is shared by all filter blocks;
    it is upsampled once, not rebuilt independently for every waveform layer.
    No BatchNorm, stochastic layers, recurrent caches, or lookahead are used.
    """
    def __init__(self, channels=16, dilations=(1, 2, 4, 8, 16, 32), harmonics=8, fir_taps=65):
        super().__init__()
        if (not 4 <= channels <= 24 or not 1 <= len(dilations) <= 6
                or any(not isinstance(d, int) or not 1 <= d <= 64 for d in dilations)
                or not 1 <= harmonics <= 16 or fir_taps < 17 or fir_taps > 129 or fir_taps % 2 != 1):
            raise ValueError("small_decoder_configuration_required")
        self.harmonics, self.fir_taps = harmonics, fir_taps
        self.condition = nn.Conv1d(4, channels * 2, 1)
        self.input = nn.Conv1d(2, channels, 1)
        self.blocks = nn.ModuleList(GatedFilter(channels, d) for d in dilations)
        self.output = nn.Conv1d(channels, 1, 1)
        time = torch.arange(fir_taps, dtype=torch.float64) - (fir_taps - 1) / 2
        cutoff = .45 / OVERSAMPLE
        kernel = 2 * cutoff * torch.sinc(2 * cutoff * time)
        kernel *= torch.hann_window(fir_taps, periodic=False, dtype=torch.float64)
        kernel /= kernel.abs().sum()
        self.register_buffer("fir", kernel.float().reshape(1, 1, -1))

    def forward(self, f0_hz, loudness_db, voicing, active, *, noise_seed=0):
        controls = validate_controls(f0_hz, loudness_db, voicing, active)
        if self.input.weight.dtype != torch.float32:
            raise ValueError("decoder_requires_float32_weights")
        device = self.input.weight.device
        sources, _phase = excitation(controls, harmonics=self.harmonics, noise_seed=noise_seed)
        pitch, level, uv, mask = controls
        features = torch.stack((torch.log2(pitch.clamp_min(20) / 440),
                                (level + 40) / 40, uv, mask), dim=1).float().to(device)
        condition = torch.tanh(self.condition(features)).repeat_interleave(INNER_HOP, dim=-1)
        hidden = self.input(sources.to(device))
        for block in self.blocks:
            hidden = block(hidden, condition)
        bounded = .95 * torch.tanh(self.output(hidden))
        audio = F.conv1d(F.pad(bounded, (self.fir_taps - 1, 0)), self.fir, stride=OVERSAMPLE)
        output_mask = mask.float().repeat_interleave(HOP, dim=-1).unsqueeze(1).to(device)
        audio = audio * output_mask
        facts = {"f0_hz": pitch.float(), "loudness_db": level.float(),
                 "voicing": uv.float(), "active": mask.float(), "noise_seed": noise_seed,
                 "sample_rate_hz": SAMPLE_RATE, "control_hz": CONTROL_HZ, "hop_samples": HOP,
                 "shape": tuple(audio.shape), "internal_sample_rate_hz": INNER_RATE,
                 "phase": "CPU float64 causal cumsum; controls left-held",
                 "harmonic_nyquist_limit_hz": SAMPLE_RATE * .45,
                 "fir_group_delay_seconds": (self.fir_taps - 1) / (2 * INNER_RATE),
                 "fir_dc_gain": float(self.fir.detach().cpu().sum()),
                 "rest_mask": "explicit authored active, separate from harmonic voicing",
                 "quality_or_exact_pitch_claim": False}
        return audio, facts
