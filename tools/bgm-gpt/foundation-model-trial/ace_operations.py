"""Small private codec/cover calls. No inference occurs at import."""
import math
from pathlib import Path
import random

from ace_limits import ResourceCaps, ResourceGuard
from ace_runtime import sha256_file


def validate_audio_file(path, *, max_seconds=20):
    import soundfile as sf
    path = Path(path).resolve(strict=True)
    if not path.is_file() or path.stat().st_size > 32 * 1024 ** 2:
        raise ValueError("Pilot audio must be a local file under 32 MiB")
    info = sf.info(str(path))
    if info.samplerate != 48000 or info.channels != 2:
        raise ValueError("Pilot input must be prepared 48 kHz stereo")
    duration = info.frames / info.samplerate
    if not 0 < duration <= max_seconds:
        raise ValueError("Pilot input duration outside bounded range")
    return {"path": str(path), "sha256": sha256_file(path),
            "frames": info.frames, "duration_seconds": duration}


def vae_roundtrip(handler, waveform, torch_module, *, output_dir, caps=None):
    """Deterministic posterior-mode encode + upstream tiled decode, <=5 seconds.

    This is a codec-fidelity diagnostic, never a newly composed performance.
    Returns waveform and facts; the caller owns private audio/report storage.
    """
    t = torch_module
    shape = tuple(waveform.shape)
    if len(shape) != 3 or shape[:2] != (1, 2) or not 0 < shape[2] <= 240000:
        raise ValueError("Codec pilot requires [1,2,T], T <= 240000 at 48 kHz")
    if not bool(t.isfinite(waveform).all()):
        raise ValueError("Nonfinite codec input")
    with ResourceGuard(output_dir, caps or ResourceCaps(max_seconds=600)):
        with t.inference_mode(), handler._load_model_context("vae"):
            audio = waveform.to(device=handler.device, dtype=t.float32)
            latents = handler.vae.encode(audio).latent_dist.mode()
            decoded = handler.tiled_decode(latents, offload_wav_to_cpu=True)
            decoded = decoded.detach().float().cpu()
        if decoded.ndim != 3 or tuple(decoded.shape[:2]) != (1, 2):
            raise RuntimeError("Unexpected codec output shape")
        if not bool(t.isfinite(decoded).all()) or decoded.shape[-1] < shape[-1]:
            raise RuntimeError("Invalid or truncated codec output")
        decoded = decoded[..., :shape[-1]]
        return decoded, {"mode": "codec_reconstruction_only", "posterior": "mode",
                         "sample_rate": 48000, "input_shape": list(shape),
                         "latent_shape": list(latents.shape), "vae_dtype": "float32"}


def cover_once(handler, guide_path, reference_path, output_dir, *, seed=20261015,
               cover_strength=0.8, cover_noise_strength=0.0, caps=None, api=None):
    """One new-score guide cover, no LM and no automatic retries or normalization.

    A reference is style conditioning, not a promise of timbre identity or exact
    note/breath/vibrato adherence. Upstream internally repeats short references.
    """
    for value in (cover_strength, cover_noise_strength):
        if not math.isfinite(value) or not 0 <= value <= 1:
            raise ValueError("Cover strengths must be finite in [0,1]")
    if not isinstance(seed, int) or not 0 <= seed < 2 ** 32:
        raise ValueError("Seed must be a uint32")
    guide = validate_audio_file(guide_path)
    reference = validate_audio_file(reference_path)
    output = Path(output_dir).resolve(strict=True)
    if output in (Path(guide["path"]).parent, Path(reference["path"]).parent):
        raise ValueError("Generated files must be separate from prepared inputs")
    if api is None:
        from acestep import inference as api
    import numpy as np
    import torch
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    params = api.GenerationParams(
        task_type="cover", src_audio=guide["path"], reference_audio=reference["path"],
        caption="Solo Korean daegeum bamboo flute, dry close recording, natural breath and membrane buzz, no accompaniment or drums",
        lyrics="[Instrumental]", instrumental=True, seed=seed, audio_codes="",
        inference_steps=8, thinking=False, use_cot_caption=False, use_cot_language=False,
        use_cot_metas=False, use_cot_lyrics=False, enable_normalization=False,
        fade_in_duration=0.0, fade_out_duration=0.0, audio_cover_strength=cover_strength,
        cover_noise_strength=cover_noise_strength)
    config = api.GenerationConfig(batch_size=1, use_random_seed=False, seeds=[seed],
                                  allow_lm_batch=False, audio_format="wav32")
    with ResourceGuard(output, caps or ResourceCaps()):
        result = api.generate_music(handler, None, params, config, save_dir=str(output))
        if not result.success:
            raise RuntimeError(result.error or result.status_message)
        if len(result.audios) != 1:
            raise RuntimeError("Single-sample pilot returned unexpected batch size")
        if (sha256_file(guide["path"]) != guide["sha256"] or
                sha256_file(reference["path"]) != reference["sha256"]):
            raise RuntimeError("Prepared input changed during inference")
    return result, {"mode": "new_score_guide_cover", "guide": guide, "reference": reference,
                    "seed": seed, "batch_size": 1, "language_model_loaded": False,
                    "cover_strength": cover_strength, "cover_noise_strength": cover_noise_strength,
                    "normalization": False, "inference_steps": 8,
                    "exact_expression_or_daegeum_identity_guaranteed": False}
