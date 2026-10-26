"""Synthetic CPU differentiability tests, no recordings/models."""
import unittest
import torch
import level_loss as module


class LevelLossTests(unittest.TestCase):
    def test_identical_signal_zero_loss(self):
        wave = torch.randn(1, 1, 8400) * .02
        level, quiet = module.losses(wave, wave)
        self.assertEqual(float(level), 0.)
        self.assertEqual(float(quiet), 0.)

    def test_gain_error_is_not_removed(self):
        reference = torch.ones(1, 1, 8400) * .01
        level, quiet = module.losses(reference * 10, reference)
        self.assertAlmostEqual(float(level), 1., places=5)
        self.assertEqual(float(quiet), 0.)

    def test_silent_target_and_nonzero_prediction_have_finite_useful_gradient(self):
        predicted = torch.full((1, 1, 8400), .01, requires_grad=True)
        reference = torch.zeros_like(predicted)
        loss = module.weighted(predicted, reference)
        loss.backward()
        self.assertTrue(torch.isfinite(loss))
        self.assertTrue(torch.isfinite(predicted.grad).all())
        self.assertGreater(float(predicted.grad.sum()), 0.)

    def test_reference_does_not_receive_gradient(self):
        p = torch.full((1, 1, 8400), .1, requires_grad=True)
        r = torch.full((1, 1, 8400), .01, requires_grad=True)
        module.weighted(p, r).backward()
        self.assertIsNone(r.grad)

    def test_quiet_denominator_does_not_depend_on_prediction(self):
        r = torch.zeros(1, 1, 8400)
        _, quiet = module.losses(torch.ones_like(r) * .001, r)
        self.assertAlmostEqual(float(quiet), 2., places=4)
        _, silent = module.losses(torch.zeros_like(r), r)
        self.assertEqual(float(silent), 0.)

    def test_polarity_invariant_not_samplewise_waveform_mse(self):
        r = torch.randn(1, 1, 8400) * .01
        self.assertEqual(float(module.weighted(-r, r)), 0.)

    def test_shape_dtype_contract(self):
        r = torch.ones(1, 1, 8400)
        for p in (r.double(), r[:, :, :800], r[:, 0]):
            with self.assertRaises(ValueError):
                module.losses(p, r)


if __name__ == "__main__":
    unittest.main()
