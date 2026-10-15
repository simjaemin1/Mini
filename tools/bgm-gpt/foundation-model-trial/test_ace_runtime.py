"""Synthetic/mock tests only: never import real torch or any model weights."""
import contextlib
import io
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace as NS
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ace_limits as limits
import ace_operations as ops
import ace_runtime as runtime


class Model:
    def __init__(self):
        self.moves = []

    def to(self, *args, **kwargs):
        self.moves.append((args, kwargs))
        return self

    def eval(self):
        return self


class Tensor:
    def __init__(self, shape):
        self.shape, self.ndim = shape, len(shape)

    def to(self, **_kwargs):
        return self

    def detach(self):
        return self

    def float(self):
        return self

    def cpu(self):
        return self

    def __getitem__(self, _key):
        return self


class TestPilot(unittest.TestCase):
    def test_import_does_not_import_model_packages(self):
        script = ("import sys;sys.path.insert(0,sys.argv[1]);import ace_runtime,ace_operations;"
                  "assert not {'torch','transformers','acestep'} & set(sys.modules)")
        subprocess.run([sys.executable, "-B", "-c", script, str(Path(__file__).parent)], check=True)

    def test_caps_hard_ceiling(self):
        for kwargs in ({"max_seconds": float("nan")}, {"max_seconds": 3601},
                       {"max_rss_bytes": 13 * limits.GIB}, {"min_free_disk_bytes": 11 * limits.GIB}):
            with self.assertRaises(ValueError):
                limits.ResourceCaps(**kwargs)

    def test_driver_pool_is_conservatively_bounded(self):
        self.assertEqual(limits.cap_violation(limits.ResourceCaps(), elapsed=0,
                         rss_bytes=8 * limits.GIB, mps_driver_bytes=5 * limits.GIB,
                         free_disk_bytes=20 * limits.GIB), "rss_plus_mps_driver_conservative_cap")

    def test_watchdog_hard_stop_is_tested_without_killing_process(self):
        with tempfile.TemporaryDirectory() as directory:
            guard = limits.ResourceGuard(directory)
            guard.stop = NS(wait=lambda _timeout: False)
            state = dict(elapsed=1000, rss_bytes=1, free_disk_bytes=20 * limits.GIB)
            with patch.object(guard, "snapshot", return_value=state), \
                    patch.object(limits.os, "_exit", side_effect=SystemExit(124)) as hard_exit, \
                    contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit):
                    guard._watch()
            hard_exit.assert_called_once_with(124)

    def test_cap_reasons_and_safe_boundary(self):
        caps = limits.ResourceCaps()
        state = dict(elapsed=900, rss_bytes=12 * limits.GIB, free_disk_bytes=12 * limits.GIB)
        self.assertIsNone(limits.cap_violation(caps, **state))
        for key, value, reason in (("elapsed", 901, "wall_time_cap"),
                                  ("rss_bytes", 13 * limits.GIB, "process_rss_cap"),
                                  ("free_disk_bytes", 11 * limits.GIB, "free_disk_floor")):
            self.assertEqual(limits.cap_violation(caps, **{**state, key: value}), reason)

    def test_subclass_bf16_main_fp32_vae_no_mlx(self):
        class Base:
            def _load_main_model_from_checkpoint(self, **kwargs):
                return self.dtype, kwargs
        t = NS(bfloat16="bf16", float32="fp32")
        handler = runtime.runtime_subclass_factory(Base, t)()
        self.assertEqual(handler._load_main_model_from_checkpoint(device="mps")[0], "bf16")
        self.assertEqual(handler._get_vae_dtype("mps"), "fp32")
        self.assertEqual(handler._get_vae_dtype("cpu"), "fp32")
        self.assertFalse(handler._init_mlx_vae())
        self.assertIsNone(handler.mlx_vae)
        with self.assertRaisesRegex(RuntimeError, "implicit CPU retry disabled"):
            handler._tiled_decode_cpu_fallback(None)

    def test_cpu_diagnostic_keeps_original_main_dtype(self):
        class Base:
            dtype = "fp32"
            def _load_main_model_from_checkpoint(self, **_kwargs):
                return self.dtype
        cls = runtime.runtime_subclass_factory(Base, NS(), experimental_bf16=False)
        self.assertEqual(cls()._load_main_model_from_checkpoint(), "fp32")

    def test_text_loads_bf16_directly_and_stays_cpu(self):
        model = Model()
        auto = NS(from_pretrained=Mock(return_value=model))
        tokenizer = NS(from_pretrained=Mock(return_value="tokenizer"))
        cls = runtime.runtime_subclass_factory(object, NS())
        handler = cls()
        handler.dtype, handler.offload_to_cpu = "bf16", True
        with patch.dict(sys.modules, {"transformers": NS(AutoModel=auto, AutoTokenizer=tokenizer)}):
            handler._load_text_encoder_and_tokenizer(checkpoint_dir="/unused", device="mps")
        self.assertEqual(auto.from_pretrained.call_args.kwargs["dtype"], "bf16")
        self.assertTrue(auto.from_pretrained.call_args.kwargs["local_files_only"])
        self.assertEqual(model.moves, [((), {"device": "cpu", "dtype": "bf16"})])

    def test_missing_local_assets_never_download(self):
        with tempfile.TemporaryDirectory() as directory:
            handler = runtime.runtime_subclass_factory(object, NS())()
            with self.assertRaises(FileNotFoundError):
                handler._ensure_models_present(checkpoint_path=Path(directory))

    def test_source_pin_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(
                runtime.subprocess, "check_output", return_value="different\n"):
            with self.assertRaises(ValueError):
                runtime.verify_official_source(directory)

    def test_probe_missing_mps_does_not_infer(self):
        result = runtime.bf16_backend_probe(NS(backends=NS(mps=NS(is_available=lambda: False))))
        self.assertEqual(result, {"passed": False, "reason": "mps_unavailable"})

    def test_codec_mode_and_validation(self):
        latent = Tensor((1, 64, 125))
        vae = NS(encode=Mock(return_value=NS(latent_dist=NS(mode=Mock(return_value=latent)))))
        handler = NS(device="mps", vae=vae, _load_model_context=lambda _name: contextlib.nullcontext(),
                     tiled_decode=Mock(return_value=Tensor((1, 2, 240000))))
        t = NS(float32="fp32", isfinite=lambda _x: NS(all=lambda: True),
               inference_mode=contextlib.nullcontext)
        with tempfile.TemporaryDirectory() as directory, patch.object(ops, "ResourceGuard", lambda *a: contextlib.nullcontext()):
            _, facts = ops.vae_roundtrip(handler, Tensor((1, 2, 240000)), t, output_dir=directory)
            self.assertEqual(facts["posterior"], "mode")
            self.assertEqual(facts["mode"], "codec_reconstruction_only")
            with self.assertRaises(ValueError):
                ops.vae_roundtrip(handler, Tensor((2, 2, 240000)), t, output_dir=directory)

    def test_cover_single_batch_no_lm_with_seeds_and_new_guide(self):
        api = NS(GenerationParams=lambda **kw: NS(**kw), GenerationConfig=lambda **kw: NS(**kw),
                 generate_music=Mock(return_value=NS(success=True, audios=[{}])))
        torch = NS(manual_seed=Mock())
        numpy = NS(random=NS(seed=Mock()))
        def audio(path):
            return {"path": str(path), "sha256": "a" * 64, "duration_seconds": 19.2}
        with tempfile.TemporaryDirectory() as directory, patch.object(ops, "validate_audio_file", audio), \
                patch.object(ops, "sha256_file", return_value="a" * 64), \
                patch.object(ops, "ResourceGuard", lambda *a: contextlib.nullcontext()), \
                patch.dict(sys.modules, {"torch": torch, "numpy": numpy}):
            _, facts = ops.cover_once("handler", "/input/new-score.wav", "/input/reference.wav", directory, api=api)
        args = api.generate_music.call_args.args
        self.assertIsNone(args[1])
        self.assertEqual(args[2].src_audio, "/input/new-score.wav")
        self.assertFalse(args[2].thinking or args[2].use_cot_caption or args[2].enable_normalization)
        self.assertEqual(args[3].batch_size, 1)
        self.assertFalse(facts["exact_expression_or_daegeum_identity_guaranteed"])
        torch.manual_seed.assert_called_once_with(20261015)


if __name__ == "__main__":
    unittest.main()
