"""Tiny synthetic CPU/MPS graph tests; no dataset, weights, or model I/O."""
from pathlib import Path
import sys
import unittest

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nsf_lite import HOP, INNER_HOP, INNER_RATE, NSFLite, excitation, validate_controls


def controls(frames=10):
    return (torch.full((1, frames), 440.), torch.full((1, frames), -24.),
            torch.ones(1, frames), torch.ones(1, frames))


class NeuralSourceFilterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(1)

    def test_cpu_shape_bound_exact_written_rests_and_gradients(self):
        model = NSFLite(channels=8, dilations=(1, 2, 4))
        pitch, level, uv, active = controls()
        active[:, 4:6] = 0
        audio, facts = model(pitch, level, uv, active, noise_seed=4)
        self.assertEqual(audio.shape, (1, 1, 10 * HOP))
        self.assertEqual(facts["sample_rate_hz"], 24000)
        self.assertLessEqual(float(audio.detach().abs().max()), .950001)
        self.assertTrue(torch.equal(audio[:, :, 4 * HOP:6 * HOP], torch.zeros(1, 1, 2 * HOP)))
        audio.square().mean().backward()
        for parameter in model.parameters():
            self.assertIsNotNone(parameter.grad)
            self.assertTrue(bool(torch.isfinite(parameter.grad).all()))
        self.assertTrue(any(bool(parameter.grad.abs().sum() > 0) for parameter in model.parameters()))

    def test_unvoiced_active_breath_keeps_noise_but_written_rest_is_zero(self):
        model = NSFLite(channels=8, dilations=(1, 2))
        pitch, level, uv, active = controls(6)
        pitch.zero_()
        uv.zero_()
        audio1, _ = model(pitch, level, uv, active, noise_seed=1)
        audio2, _ = model(pitch, level, uv, active, noise_seed=2)
        self.assertGreater(float(audio1.detach().square().mean()), 0)
        self.assertGreater(float((audio1 - audio2).detach().abs().max()), 1e-8)
        silent, _ = model(pitch, level, uv, torch.zeros_like(active), noise_seed=1)
        self.assertTrue(torch.equal(silent, torch.zeros_like(silent)))

    def test_future_f0_and_context_do_not_change_source_phase_or_output_prefix(self):
        first = controls(12)
        second = tuple(value.clone() for value in first)
        second[0][:, 8:] = 880
        second[1][:, 8:] = -10
        second[2][:, 8:] = .3
        a, phase_a = excitation(validate_controls(*first), noise_seed=8)
        b, phase_b = excitation(validate_controls(*second), noise_seed=8)
        self.assertTrue(torch.equal(phase_a[:, :8 * INNER_HOP], phase_b[:, :8 * INNER_HOP]))
        self.assertTrue(torch.equal(a[:, :, :8 * INNER_HOP], b[:, :, :8 * INNER_HOP]))
        model = NSFLite(channels=8, dilations=(1, 2, 4))
        audio_a, _ = model(*first, noise_seed=8)
        audio_b, _ = model(*second, noise_seed=8)
        self.assertTrue(torch.equal(audio_a[:, :, :8 * HOP], audio_b[:, :, :8 * HOP]))

    def test_noise_seed_is_separate_from_global_model_rng_and_repeatable(self):
        model = NSFLite(channels=8, dilations=(1, 2))
        inputs = controls(5)
        state = torch.random.get_rng_state().clone()
        first, _ = model(*inputs, noise_seed=4)
        self.assertTrue(torch.equal(state, torch.random.get_rng_state()))
        torch.rand(9)
        second, _ = model(*inputs, noise_seed=4)
        self.assertTrue(torch.equal(first, second))

    def test_harmonics_are_excluded_above_output_nyquist_and_fir_rejects_stopband(self):
        inputs = list(controls(40))
        inputs[0].fill_(3000)
        source, _ = excitation(validate_controls(*inputs), harmonics=8, noise_seed=3)
        fft = torch.fft.rfft(source[0, 0].double())
        frequencies = torch.fft.rfftfreq(source.shape[-1], 1 / INNER_RATE)
        self.assertLess(float(fft[frequencies >= 12000].abs().max() / fft.abs().max()), 1e-6)
        model = NSFLite()
        response = torch.fft.rfft(model.fir[0, 0].double(), n=8192).abs()
        grid = torch.fft.rfftfreq(8192, 1 / INNER_RATE)
        self.assertLess(float(response[grid > 14000].max() / response[0]), .005)
        self.assertAlmostEqual(float(model.fir.abs().sum()), 1, places=6)

    def test_invalid_controls_and_precision_fail_closed(self):
        for changed in ("shape", "nan", "pitch", "uv", "mask", "level"):
            values = list(controls())
            if changed == "shape": values[0] = values[0][:, :5]
            if changed == "nan": values[0][0, 0] = float("nan")
            if changed == "pitch": values[0][0, 0] = 13000
            if changed == "uv": values[2][0, 0] = 1.1
            if changed == "mask": values[3][0, 0] = -1
            if changed == "level": values[1][0, 0] = 100
            with self.assertRaises(ValueError): validate_controls(*values)
        with self.assertRaisesRegex(ValueError, "float32"):
            NSFLite().double()(*controls())

    @unittest.skipUnless(torch.backends.mps.is_available(), "local MPS unavailable")
    def test_tiny_mps_finite_forward_and_backprop(self):
        model = NSFLite().to("mps")
        audio, facts = model(*controls(4), noise_seed=6)
        self.assertEqual(audio.device.type, "mps")
        self.assertTrue(bool(torch.isfinite(audio).all()))
        self.assertEqual(facts["shape"], (1, 1, 4 * HOP))
        audio.square().mean().backward()
        for parameter in model.parameters():
            self.assertTrue(bool(torch.isfinite(parameter.grad).all()))
        torch.mps.synchronize()


if __name__ == "__main__":
    unittest.main()
