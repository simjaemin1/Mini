"""Phase-insensitive, differentiable target-level supervision, never output DSP."""

RATE, HOP = 24000, 120
WINDOWS = (480, 960)  # 20/40ms, same unpadded timestamps on both waveforms
FLOOR_POWER = 1e-10  # additive -100dBFS power epsilon, not waveform clipping
LEVEL_WEIGHT, QUIET_WEIGHT = 5.0, 2.0


def losses(predicted, reference):
    """Mean absolute log-amplitude and quiet excess; each unit is20dB.

    Reference is detached, all pooling masks come from it alone. No phase
    alignment, target gain, pitch edit or modification of either waveform.
    A whole-file gain error remains penalized rather than being subtracted.
    """
    import torch
    import torch.nn.functional as functional
    if (predicted.shape != reference.shape or predicted.ndim != 3
            or predicted.shape[1] != 1 or predicted.shape[-1] < max(WINDOWS)
            or predicted.dtype != torch.float32 or reference.dtype != torch.float32
            or predicted.device != reference.device):
        raise ValueError("identical_float32_B1T_waveforms_required")
    absolute, quiet = [], []
    for window in WINDOWS:
        p = functional.avg_pool1d(predicted.square(), window, stride=HOP)
        r = functional.avg_pool1d(reference.detach().square(), window, stride=HOP)
        pd = 10 * torch.log10(p + FLOOR_POWER)
        rd = 10 * torch.log10(r + FLOOR_POWER)
        absolute.append((pd - rd).abs().mean() / 20)
        mask = (rd <= -60).to(pd.dtype)
        quiet.append(((pd - rd).clamp_min(0) * mask).sum() / mask.sum().clamp_min(1) / 20)
    return torch.stack(absolute).mean(), torch.stack(quiet).mean()


def weighted(predicted, reference):
    level, quiet = losses(predicted, reference)
    return LEVEL_WEIGHT * level + QUIET_WEIGHT * quiet
