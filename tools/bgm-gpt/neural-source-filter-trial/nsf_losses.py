"""Phase-tolerant NSF losses. CPU STFT keeps MPS complex-FFT out of the graph.

The device copy is differentiable: CPU spectral losses propagate to an MPS
generator. No pointwise waveform L1/MSE is used. These losses are not proof of
natural timbre, pitch accuracy, or perceptual quality.
"""
import torch

FFT_SIZES = (256, 512, 1024)
LOSS_WEIGHTS = {"spectral_convergence": 1., "log_magnitude_l1": 1.,
                "rms_db_l1": .05, "dc_penalty": 10.}


def nsf_loss(prediction, target):
    prediction, target = prediction.float().cpu(), target.detach().float().cpu()
    if (prediction.shape != target.shape or prediction.ndim != 3 or prediction.shape[1] != 1
            or prediction.shape[-1] % 240 or not torch.isfinite(target).all()):
        raise ValueError("matching_batch_mono_24k_10ms_aligned_audio_required")
    if not bool(torch.isfinite(prediction).all()):
        raise ValueError("nonfinite_prediction")
    predicted, expected = prediction[:, 0], target[:, 0]
    convergence, logarithmic = [], []
    for size in FFT_SIZES:
        window = torch.hann_window(size, dtype=torch.float32)
        settings = dict(n_fft=size, hop_length=size // 4, win_length=size,
                        window=window, center=True, pad_mode="constant", return_complex=True)
        p = torch.stft(predicted, **settings).abs()
        t = torch.stft(expected, **settings).abs()
        convergence.append(torch.linalg.vector_norm(p - t) / torch.linalg.vector_norm(t).clamp_min(1e-4))
        logarithmic.append((p.clamp_min(1e-5).log() - t.clamp_min(1e-5).log()).abs().mean())
    def frame_db(audio):
        power = audio.reshape(audio.shape[0], -1, 240).square().mean(-1)
        return 10 * (power + 1e-8).log10()
    terms = {"spectral_convergence": torch.stack(convergence).mean(),
             "log_magnitude_l1": torch.stack(logarithmic).mean(),
             "rms_db_l1": (frame_db(predicted) - frame_db(expected)).abs().mean(),
             "dc_penalty": predicted.mean(-1).square().mean()}
    total = sum(terms[name] * weight for name, weight in LOSS_WEIGHTS.items())
    if not bool(torch.isfinite(total)):
        raise ValueError("nonfinite_nsf_loss")
    return total, terms
