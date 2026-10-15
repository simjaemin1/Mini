"""Bounded ACE-Step research adapter; imports never load models or contact HF.

Only the private launcher calls real inference. Official source is not patched.
MPS BF16 is an explicit experimental deviation; failed probes never auto-retry.
"""
import hashlib
import os
from pathlib import Path
import subprocess
import sys

from ace_limits import ResourceCaps, ResourceGuard

PINNED_COMMIT = "ca1e85fe9430179831e6bc6be790c332190a3866"
MODEL_NAME = "acestep-v15-turbo"


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def offline_environment(checkpoint_dir):
    """Set before importing official modules; no missing-asset auto-download."""
    for key in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE"):
        os.environ[key] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    checkpoints = Path(checkpoint_dir).resolve(strict=True)
    os.environ["ACESTEP_CHECKPOINTS_DIR"] = str(checkpoints)
    cache = checkpoints.parent / "runtime-cache"
    for key, folder in (("HF_HOME", "huggingface"), ("HF_MODULES_CACHE", "hf-modules"),
                        ("TORCH_HOME", "torch"), ("MPLCONFIGDIR", "matplotlib")):
        os.environ[key] = str(cache / folder)
    os.environ["GRADIO_ANALYTICS_ENABLED"] = "False"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"


def verify_official_source(source_dir):
    path = Path(source_dir).resolve(strict=True)
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=path, text=True).strip()
    if commit != PINNED_COMMIT:
        raise ValueError("Official source commit differs from frozen pilot")
    subprocess.run(["git", "diff", "--quiet", "HEAD", "--", "acestep"], cwd=path, check=True)
    return commit


def bf16_backend_probe(torch_module):
    """Tiny actual MPS linear/SDPA vs CPU-FP32 probe, not a music-quality test."""
    t = torch_module
    if not t.backends.mps.is_available():
        return {"passed": False, "reason": "mps_unavailable"}
    generator = t.Generator(device="cpu").manual_seed(72391)
    pairs = {}
    try:
        x = t.randn((2, 16, 64), generator=generator) * 0.2
        w = t.randn((64, 64), generator=generator) * 0.2
        q = t.randn((1, 2, 16, 32), generator=generator) * 0.2
        with t.inference_mode():
            pairs["linear"] = (t.nn.functional.linear(x, w), t.nn.functional.linear(
                x.to("mps", t.bfloat16), w.to("mps", t.bfloat16)).float().cpu())
            qm = q.to("mps", t.bfloat16)
            pairs["sdpa"] = (t.nn.functional.scaled_dot_product_attention(q, q, q),
                             t.nn.functional.scaled_dot_product_attention(qm, qm, qm).float().cpu())
        metrics = {}
        for name, (reference, actual) in pairs.items():
            finite = bool(t.isfinite(actual).all())
            error = (actual - reference).square().mean().sqrt()
            relative = float(error / reference.square().mean().sqrt().clamp_min(1e-8))
            metrics[name] = {"finite": finite, "relative_l2_error": relative}
        passed = all(v["finite"] and v["relative_l2_error"] <= 0.03 for v in metrics.values())
        return {"passed": passed, "relative_l2_limit": 0.03, "metrics": metrics,
                "torch_version": t.__version__, "experimental_dtype": "bfloat16"}
    except Exception as exc:
        return {"passed": False, "reason": type(exc).__name__, "message": str(exc)[:300]}
    finally:
        pairs.clear()
        t.mps.empty_cache()


def runtime_subclass_factory(base_class, torch_module, *, experimental_bf16=True):
    t = torch_module

    class PrivatePilotHandler(base_class):
        def _load_main_model_from_checkpoint(self, **kwargs):
            if experimental_bf16:
                self.dtype = t.bfloat16
            return super()._load_main_model_from_checkpoint(**kwargs)

        def _get_vae_dtype(self, device=None):
            # Pinned upstream uses FP16 on MPS; pilot deliberately keeps FP32.
            return t.float32

        def _load_text_encoder_and_tokenizer(self, *, checkpoint_dir, device):
            from transformers import AutoModel, AutoTokenizer
            path = str(Path(checkpoint_dir) / "Qwen3-Embedding-0.6B")
            self.text_tokenizer = AutoTokenizer.from_pretrained(path, local_files_only=True)
            self.text_encoder = AutoModel.from_pretrained(
                path, dtype=self.dtype, local_files_only=True, attn_implementation="sdpa")
            target = "cpu" if self.offload_to_cpu else device
            self.text_encoder = self.text_encoder.to(device=target, dtype=self.dtype).eval()
            return path

        def _init_mlx_vae(self):
            self.use_mlx_vae, self.mlx_vae = False, None
            return False

        def _tiled_decode_cpu_fallback(self, _latents):
            raise RuntimeError("MPS VAE decode failed; implicit CPU retry disabled for this pilot")

        def _ensure_models_present(self, *, checkpoint_path, **_kwargs):
            required = (f"{MODEL_NAME}/model.safetensors", f"{MODEL_NAME}/config.json",
                        f"{MODEL_NAME}/silence_latent.pt", "vae/config.json",
                        "vae/diffusion_pytorch_model.safetensors",
                        "Qwen3-Embedding-0.6B/config.json",
                        "Qwen3-Embedding-0.6B/model.safetensors")
            if any(not (Path(checkpoint_path) / name).is_file() for name in required):
                raise FileNotFoundError("Required local pilot assets are incomplete; downloading disabled")
            return None

        @staticmethod
        def _sync_model_code_if_needed(config_path, checkpoint_path):
            from acestep.model_downloader import _check_code_mismatch
            if _check_code_mismatch(config_path, checkpoint_path):
                raise RuntimeError("Checkpoint code differs; automatic source rewriting disabled")

    return PrivatePilotHandler


def initialize_runtime(source_dir, checkpoint_dir, output_dir, *, device="mps", caps=None):
    """Load exactly one handler; CPU mode is an explicit separate diagnostic."""
    if device not in ("mps", "cpu"):
        raise ValueError("Pilot supports explicit MPS or CPU only")
    verify_official_source(source_dir)
    offline_environment(checkpoint_dir)
    sys.path.insert(0, str(Path(source_dir).resolve()))
    import torch
    from acestep.handler import AceStepHandler
    with ResourceGuard(output_dir, caps or ResourceCaps(max_seconds=600)):
        probe = bf16_backend_probe(torch) if device == "mps" else {"passed": True, "mode": "official_cpu_fp32"}
        if not probe["passed"]:
            raise RuntimeError(f"MPS BF16 probe failed; no automatic retry: {probe}")
        handler = runtime_subclass_factory(AceStepHandler, torch,
                                          experimental_bf16=device == "mps")()
        status, success = handler.initialize_service(
            project_root=str(Path(checkpoint_dir).parent), config_path=MODEL_NAME, device=device,
            use_flash_attention=False, compile_model=False, offload_to_cpu=True,
            offload_dit_to_cpu=True, quantization=None, use_mlx_dit=False)
        if not success:
            raise RuntimeError(status)
        if handler.device != device:
            raise RuntimeError("Upstream silently changed requested device")
        handler.private_pilot_metadata = {"probe": probe, "source_commit": PINNED_COMMIT,
                                         "mps_vae_dtype_override": "float32",
                                         "mlx_dit": False, "mlx_vae": False,
                                         "implicit_mps_decode_retry": False,
                                         "runtime_sha256": sha256_file(__file__)}
        return handler
