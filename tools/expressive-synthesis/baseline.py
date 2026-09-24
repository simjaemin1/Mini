"""Small, maintained-PyTorch expressive-synthesis baseline.

This module intentionally has no dependency on the repository's archived
MIDI-DDSP experiments.  It implements a compact, inspectable experiment path:

``score features -> continuous controls -> harmonic/noise reconstruction``.

It is not a production synthesizer, an expert transcription system, a labeler,
or a game-asset exporter.  Importing this module does not require PyTorch so
the corpus gates can be tested on ordinary Python installations.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class BaselineConfig:
    """Conservative dimensions for one sustained-instrument R&D experiment."""

    score_feature_dim: int = 8
    hidden_size: int = 96
    harmonic_count: int = 16
    sample_rate_hz: int = 16_000
    hop_size: int = 160
    f0_min_hz: float = 55.0
    f0_max_hz: float = 1_500.0
    loudness_min_db: float = -80.0
    loudness_max_db: float = 0.0

    def validate(self) -> None:
        if self.score_feature_dim < 1:
            raise ValueError("score_feature_dim must be positive")
        if self.hidden_size < 4:
            raise ValueError("hidden_size must be at least four")
        if self.harmonic_count < 1:
            raise ValueError("harmonic_count must be positive")
        if self.sample_rate_hz < 2 or self.hop_size < 1:
            raise ValueError("sample_rate_hz and hop_size must be positive")
        if not 0.0 < self.f0_min_hz < self.f0_max_hz < self.sample_rate_hz / 2:
            raise ValueError("f0 range must be positive, increasing, and below Nyquist")
        if not self.loudness_min_db < self.loudness_max_db <= 0.0:
            raise ValueError("loudness dB range must be increasing and no louder than 0 dB")


def require_torch() -> tuple[Any, Any]:
    """Load maintained PyTorch only for a requested model/smoke/train action."""

    try:
        import torch
        from torch import nn
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "PyTorch is not installed. Run setup_train_wsl.sh --setup "
            "--allow-install first; this harness never installs it implicitly."
        ) from exc
    return torch, nn


def build_score_to_source_filter(config: BaselineConfig) -> Any:
    """Build a compact score-to-controls harmonic/noise reconstruction model.

    The returned model accepts a float tensor shaped ``[batch, frames,
    score_feature_dim]`` and returns a mapping containing continuous F0 and
    loudness controls plus a reconstructed waveform.  It makes no claim that
    its automatically learned controls are musical notation, breath/slur
    labels, or approved performance analysis.
    """

    config.validate()
    torch, nn = require_torch()

    class ScoreToContinuousControlsAndSourceFilter(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.config = config
            self.encoder = nn.Sequential(
                nn.Linear(config.score_feature_dim, config.hidden_size),
                nn.SiLU(),
                nn.Linear(config.hidden_size, config.hidden_size),
                nn.SiLU(),
            )
            self.temporal = nn.GRU(
                config.hidden_size,
                config.hidden_size,
                num_layers=1,
                batch_first=True,
            )
            # f0, loudness, harmonic mixture, and noise amplitude.
            self.control_head = nn.Linear(config.hidden_size, 3 + config.harmonic_count)
            # A small learned FIR gives the noise source a source-filter path
            # without introducing obsolete or unmaintained external code.
            self.noise_filter = nn.Conv1d(1, 1, kernel_size=9, padding=4, bias=False)
            with torch.no_grad():
                self.noise_filter.weight.fill_(1.0 / 9.0)

        def _controls(self, score_features: Any) -> dict[str, Any]:
            if score_features.ndim != 3:
                raise ValueError("score_features must have shape [batch, frames, features]")
            if score_features.shape[-1] != config.score_feature_dim:
                raise ValueError(
                    f"score_features has {score_features.shape[-1]} features; "
                    f"expected {config.score_feature_dim}"
                )
            encoded, _ = self.temporal(self.encoder(score_features))
            raw = self.control_head(encoded)
            f0_hz = config.f0_min_hz + torch.sigmoid(raw[..., 0]) * (
                config.f0_max_hz - config.f0_min_hz
            )
            loudness_db = config.loudness_min_db + torch.sigmoid(raw[..., 1]) * (
                config.loudness_max_db - config.loudness_min_db
            )
            harmonic_logits = raw[..., 2 : 2 + config.harmonic_count]
            harmonic_amplitudes = torch.softmax(harmonic_logits, dim=-1)
            noise_amplitude = torch.sigmoid(raw[..., -1]) * 0.15
            return {
                "f0_hz": f0_hz,
                "loudness_db": loudness_db,
                "harmonic_amplitudes": harmonic_amplitudes,
                "noise_amplitude": noise_amplitude,
            }

        def _reconstruct(self, controls: dict[str, Any], noise: Any | None) -> Any:
            f0_hz = controls["f0_hz"].repeat_interleave(config.hop_size, dim=1)
            loudness_db = controls["loudness_db"].repeat_interleave(config.hop_size, dim=1)
            harmonic_amplitudes = controls["harmonic_amplitudes"].repeat_interleave(
                config.hop_size, dim=1
            )
            noise_amplitude = controls["noise_amplitude"].repeat_interleave(
                config.hop_size, dim=1
            )
            harmonic_orders = torch.arange(
                1,
                config.harmonic_count + 1,
                device=f0_hz.device,
                dtype=f0_hz.dtype,
            )
            nyquist_mask = (
                f0_hz.unsqueeze(-1) * harmonic_orders
                < float(config.sample_rate_hz) / 2.0
            ).to(harmonic_amplitudes.dtype)
            harmonic_amplitudes = harmonic_amplitudes * nyquist_mask
            harmonic_amplitudes = harmonic_amplitudes / harmonic_amplitudes.sum(
                dim=-1, keepdim=True
            ).clamp_min(1.0e-6)
            phase = torch.cumsum(
                (2.0 * torch.pi * f0_hz) / float(config.sample_rate_hz), dim=1
            )
            harmonic_source = (
                torch.sin(phase.unsqueeze(-1) * harmonic_orders)
                * harmonic_amplitudes
            ).sum(dim=-1)
            amplitude = torch.pow(10.0, loudness_db / 20.0)
            if noise is None:
                noise = torch.randn_like(harmonic_source)
            if noise.shape != harmonic_source.shape:
                raise ValueError("noise must have shape [batch, frames * hop_size]")
            filtered_noise = self.noise_filter(noise.unsqueeze(1)).squeeze(1)
            # tanh only protects this experimental baseline from unbounded
            # training activations; it is not an audio mastering operation.
            return torch.tanh(amplitude * harmonic_source + noise_amplitude * filtered_noise)

        def forward(self, score_features: Any, noise: Any | None = None) -> dict[str, Any]:
            controls = self._controls(score_features)
            controls["waveform"] = self._reconstruct(controls, noise)
            return controls

    return ScoreToContinuousControlsAndSourceFilter()
