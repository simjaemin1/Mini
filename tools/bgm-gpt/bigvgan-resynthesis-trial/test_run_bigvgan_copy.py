"""Synthetic/mock controls only: no BigVGAN import, checkpoint, or real audio.

Torch supplies only small CPU tensors. The fake generator has two parameters
and never instantiates, imports, or reads the public 112M-parameter model.
"""
import copy
import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_bigvgan_copy as trial


def configuration():
    return {"sampling_rate": 24000, "num_mels": 100, "n_fft": 1024,
            "win_size": 1024, "hop_size": 256, "fmin": 0, "fmax": None}


def signal():
    # Deliberately neither unit-peak nor normalized; both ends are nonzero.
    t = np.arange(trial.SAMPLES, dtype=np.float64) / trial.SR
    return (0.017 + 0.063 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)


class TinyGenerator:
    """Recording fake, not a neural network or a public checkpoint reader."""
    def __init__(self, output=None):
        self.output = torch.from_numpy(signal()).reshape(1, 1, -1) if output is None else output
        self.device = None
        self.float_called = False
        self.weight_norm_removed = False
        self.evaluation = False
        self.requires_grad = None
        self.state = None
        self.strict = None
        self.calls = 0

    def to(self, device):
        self.device = device
        return self

    def float(self):
        self.float_called = True
        return self

    def load_state_dict(self, state, *, strict):
        self.state, self.strict = state, strict

    def remove_weight_norm(self):
        self.weight_norm_removed = True

    def eval(self):
        self.evaluation = True
        return self

    def requires_grad_(self, enabled):
        self.requires_grad = enabled
        return self

    def parameters(self):
        return [torch.zeros(2, dtype=torch.float32)]

    def __call__(self, mel):
        self.calls += 1
        self.mel = mel.clone()
        self.inference_mode_enabled = torch.is_inference_mode_enabled()
        return self.output


class BigVGANCopyTests(unittest.TestCase):
    def reconstruct(self, *, x=None, h=None, output=None, mel_function=None, checkpoint=None):
        model = TinyGenerator(output)
        factory = Mock(return_value=model)
        mel = torch.full((1, 100, 450), -3.125, dtype=torch.float32)
        mel_function = Mock(return_value=mel) if mel_function is None else mel_function
        checkpoint = {"generator": {"synthetic_state": 1}} if checkpoint is None else checkpoint
        # A sentinel path must never be opened: torch.load is always mocked.
        with patch.object(torch, "load", return_value=checkpoint) as loader:
            result = trial.reconstruct(signal() if x is None else x,
                configuration() if h is None else h, Path("/no-checkpoint-read.pt"),
                torch_module=torch, model_class=factory, mel_function=mel_function)
        return result, model, factory, mel_function, loader

    def test_exact_unscaled_source_450_frames_and_untrimmed_output(self):
        source = signal()
        unchanged = source.tobytes()
        (wave, mel, facts), model, factory, mel_function, loader = self.reconstruct(x=source)
        factory.assert_called_once_with(configuration(), use_cuda_kernel=False)
        loader.assert_called_once_with(Path("/no-checkpoint-read.pt"),
                                       map_location="cpu", weights_only=True)
        tensor, config = mel_function.call_args.args
        self.assertEqual(tuple(tensor.shape), (1, 115200))
        self.assertEqual(tensor.dtype, torch.float32)
        self.assertEqual(str(tensor.device), "cpu")
        np.testing.assert_array_equal(tensor.numpy()[0], source)
        self.assertEqual(config, configuration())
        self.assertEqual(source.tobytes(), unchanged)
        np.testing.assert_array_equal(wave, signal())
        self.assertEqual(wave.shape, (115200,))
        self.assertEqual(mel.shape, (100, 450))
        self.assertEqual(model.device, "cpu")
        self.assertTrue(model.float_called and model.weight_norm_removed and model.evaluation)
        self.assertFalse(model.requires_grad)
        self.assertTrue(model.strict and model.inference_mode_enabled)
        self.assertEqual(model.state, {"synthetic_state": 1})
        self.assertEqual(facts["parameters"], 2)
        self.assertEqual(facts["additional_padding_or_trim_samples"], 0)
        self.assertEqual(facts["input_gain_db"], 0)
        self.assertFalse(facts["input_normalized"])
        self.assertFalse(facts["source_PCM_inserted_into_output"])
        self.assertFalse(facts["source_timing_searched_or_warped"])
        self.assertFalse(facts["naturalness_approved"])

    def test_mel_cannot_mutate_caller_source_through_tensor_alias(self):
        source = signal()
        unchanged = source.tobytes()
        def mutate_only_private_tensor(tensor, _config):
            tensor.zero_()
            return torch.zeros((1, 100, 450), dtype=torch.float32)
        self.reconstruct(x=source, mel_function=mutate_only_private_tensor)
        self.assertEqual(source.tobytes(), unchanged)

    def test_invalid_input_rejected_before_model_or_weight_loading(self):
        source = signal()
        bad = [source.astype(np.float64), source.astype(np.float16), source[:-1],
               source.reshape(1, -1), np.zeros_like(source), np.full_like(source, np.nan),
               np.full_like(source, np.inf), np.full_like(source, 1.00001)]
        for value in bad:
            with self.subTest(shape=value.shape, dtype=value.dtype), \
                    patch.object(torch, "load") as loader:
                factory = Mock()
                with self.assertRaisesRegex(ValueError, "115200_float32_mono_required"):
                    trial.reconstruct(value, configuration(), Path("/must-not-open.pt"),
                        torch_module=torch, model_class=factory, mel_function=Mock())
                loader.assert_not_called()
                factory.assert_not_called()

    def test_config_mismatch_rejected_before_model_creation(self):
        for key, value in {"sampling_rate": 48000, "num_mels": 80, "n_fft": 2048,
                           "win_size": 512, "hop_size": 512, "fmin": 1, "fmax": 12000}.items():
            with self.subTest(key=key):
                h = configuration()
                h[key] = value
                factory = Mock()
                with self.assertRaisesRegex(ValueError, "exact_official24k"):
                    trial.reconstruct(signal(), h, Path("/must-not-open.pt"),
                        torch_module=torch, model_class=factory, mel_function=Mock())
                factory.assert_not_called()

    def test_bad_mel_shape_or_nonfinite_values_are_not_synthesized(self):
        for mel in (torch.zeros((1, 100, 451)), torch.zeros((1, 100, 449)),
                    torch.zeros((100, 450)), torch.zeros((1, 80, 450)),
                    torch.full((1, 100, 450), float("nan"))):
            with self.subTest(shape=tuple(mel.shape)):
                model = TinyGenerator()
                with patch.object(torch, "load", return_value={"generator": {}}), \
                        self.assertRaisesRegex(ValueError, "1x100x450_finite"):
                    trial.reconstruct(signal(), configuration(), Path("/mock-only.pt"),
                        torch_module=torch, model_class=Mock(return_value=model),
                        mel_function=Mock(return_value=mel))
                self.assertEqual(model.calls, 0)

    def test_wrong_length_or_nonfinite_output_not_trimmed_or_repaired(self):
        for output in (torch.zeros((1, 1, 115456)), torch.zeros((1, 1, 114944)),
                       torch.zeros((1, 115200)), torch.full((1, 1, 115200), float("nan")),
                       torch.full((1, 1, 115200), float("inf"))):
            with self.subTest(shape=tuple(output.shape)), \
                    self.assertRaisesRegex(ValueError, "untrimmed_115200"):
                self.reconstruct(output=output)

    def test_silent_and_saturated_output_not_normalized_or_clipped(self):
        for peak in (0.0, 1e-10, 1.0, -1.0, 1.01):
            with self.subTest(peak=peak), \
                    self.assertRaisesRegex(ValueError, "silent_or_saturated"):
                self.reconstruct(output=torch.full((1, 1, 115200), peak))

    def test_missing_generator_and_state_dict_failure_have_no_fallback(self):
        for checkpoint in ({"not_generator": {}}, [1, 2]):
            with self.subTest(checkpoint=checkpoint), \
                    self.assertRaisesRegex(ValueError, "generator_state_dict_required"):
                self.reconstruct(checkpoint=checkpoint)
        model = TinyGenerator()
        model.load_state_dict = Mock(side_effect=RuntimeError("strict_state_mismatch"))
        with patch.object(torch, "load", return_value={"generator": {}}), \
                self.assertRaisesRegex(RuntimeError, "strict_state_mismatch"):
            trial.reconstruct(signal(), configuration(), Path("/mock-only.pt"),
                torch_module=torch, model_class=Mock(return_value=model), mel_function=Mock())
        self.assertEqual(model.calls, 0)

    def fixture(self, root):
        """Only tiny synthetic files; never accesses original audio or model weights."""
        original = root / "synthetic-original.flac"
        original.write_bytes(b"not real audio")
        archive = root / "synthetic-controls.npz"
        np.savez_compressed(archive, source_waveform_24k=signal().astype(np.float64))
        model = root / "model"
        model.mkdir()
        weights = model / "bigvgan_generator.pt"
        weights.write_bytes(b"synthetic sentinel, never deserialized")
        config = model / "config.json"
        config.write_text(json.dumps(configuration()))
        upstream = root / "upstream"
        upstream.mkdir()
        (upstream / "LICENSE").write_text("synthetic test license")
        (model / "LICENSE").write_text("synthetic test license")
        row = {"case": "arirang002", "start_seconds": 0, "end_seconds": 4.8,
               "source_path": str(original), "source_sha256": trial.private.sha256(original),
               "controls_archive": {"file": archive.name, "sha256": trial.private.sha256(archive)}}
        report = {"schema": "mini.world-source-copy.v1", "status": "complete", "cases": [row]}
        report_path = root / "source-report.json"
        report_path.write_text(json.dumps(report))
        hashes = {"SOURCE_SHA": trial.private.sha256(original),
                  "WEIGHTS_SHA": trial.private.sha256(weights),
                  "CONFIG_SHA": trial.private.sha256(config)}
        return report_path, report, archive, hashes

    def test_exact_sha_bound_synthetic_inputs_loaded_without_torch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path, _report, _archive, hashes = self.fixture(root)
            with patch.multiple(trial, **hashes), \
                    patch.object(trial.subprocess, "check_output", side_effect=[trial.UPSTREAM + "\n", ""]), \
                    patch.object(torch, "load") as loader:
                x, h, bindings = trial.load_bound_inputs(root, path)
            loader.assert_not_called()
            self.assertEqual(x.dtype, np.float32)
            np.testing.assert_array_equal(x, signal())
            self.assertEqual(h, configuration())
            for name, digest in bindings.items():
                self.assertEqual(trial.private.sha256(Path(name)), digest)

    def test_bad_source_or_archive_binding_fails_before_archive_decode(self):
        for fault in ("source_sha", "archive_sha", "archive_name", "interval", "duplicate"):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                path, report, _archive, hashes = self.fixture(root)
                row = report["cases"][0]
                if fault == "source_sha": row["source_sha256"] = "0" * 64
                if fault == "archive_sha": row["controls_archive"]["sha256"] = "0" * 64
                if fault == "archive_name": row["controls_archive"]["file"] = "../synthetic-controls.npz"
                if fault == "interval": row["start_seconds"] = .1
                if fault == "duplicate": report["cases"].append(copy.deepcopy(row))
                path.write_text(json.dumps(report))
                with patch.multiple(trial, **hashes), patch.object(trial.np, "load") as archive_loader, \
                        patch.object(torch, "load") as weight_loader, self.assertRaises(ValueError):
                    trial.load_bound_inputs(root, path)
                archive_loader.assert_not_called()
                weight_loader.assert_not_called()

    def test_model_hash_or_dirty_upstream_rejected_before_model_loading(self):
        for fault in ("weights", "config", "revision", "dirty"):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                path, _report, _archive, hashes = self.fixture(root)
                if fault == "weights": hashes["WEIGHTS_SHA"] = "0" * 64
                if fault == "config": hashes["CONFIG_SHA"] = "0" * 64
                outputs = [("0" * 40 if fault == "revision" else trial.UPSTREAM) + "\n",
                           " M bigvgan.py\n" if fault == "dirty" else ""]
                with patch.multiple(trial, **hashes), \
                        patch.object(trial.subprocess, "check_output", side_effect=outputs), \
                        patch.object(torch, "load") as weight_loader, self.assertRaises(ValueError):
                    trial.load_bound_inputs(root, path)
                weight_loader.assert_not_called()

    def test_failed_bindings_stop_run_before_output_or_heavy_imports(self):
        with patch.object(trial, "load_bound_inputs", side_effect=ValueError("binding_failed")), \
                patch.object(trial.private, "fresh_private_dir") as output, \
                patch.object(torch, "load") as loader, \
                self.assertRaisesRegex(ValueError, "binding_failed"):
            trial.run(Path("/not-real"), Path("/not-real.json"), Path("/not-output"))
        output.assert_not_called()
        loader.assert_not_called()

    def test_regular_path_and_exclusive_private_json(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "new.json"
            trial.write_json(path, {"naturalness_approved": False})
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            with self.assertRaises(FileExistsError):
                trial.write_json(path, {"replacement": True})
            self.assertEqual(json.loads(path.read_text()), {"naturalness_approved": False})
            link = root / "link.json"
            link.symlink_to(path)
            for bad, limit in ((Path("relative.json"), 1000), (link, 1000), (path, 1), (root, 1000)):
                with self.subTest(path=bad), self.assertRaisesRegex(ValueError, "regular_file"):
                    trial.regular(bad, limit)


if __name__ == "__main__":
    unittest.main()
