"""Synthetic spectral controls only; no models, checkpoints or source recordings.

The tiny Slaney-matrix substitute checks the exact official analysis math
without importing BigVGAN, librosa or any model-provided Python.
"""
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

import numpy as np
import torch
import torch.nn.functional as functional

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_spectral_pitch_trial as trial


def configuration():
    return {"sampling_rate": 24000, "num_mels": 100, "n_fft": 1024,
            "win_size": 1024, "hop_size": 256, "fmin": 0, "fmax": None}


def source():
    times = np.arange(115200, dtype=np.float64) / 24000
    return (0.031 + 0.043 * np.sin(2 * np.pi * 735 * times)
            + 0.012 * np.sin(2 * np.pi * 2111 * times)).astype(np.float32)


def basis():
    # A deterministic nonnegative mock matrix, not a substitute for a real
    # Slaney filterbank in production. Each row samples a distinct bin region.
    matrix = np.zeros((100, 513), dtype=np.float32)
    for row in range(100):
        index = 1 + row * 5
        matrix[row, index:index + 3] = [0.125, 0.5, 0.25]
    return matrix


def reference_warp(magnitude, semitones):
    if semitones == 0:
        return magnitude.astype(np.float32, copy=True)
    ratio = 2 ** (semitones / 12)
    positions = np.arange(513, dtype=np.float64) / ratio
    low = np.floor(positions).astype(np.int64)
    high = np.minimum(low + 1, 512)
    fraction = (positions - low)[:, None]
    return ((1 - fraction) * magnitude[low]
            + fraction * magnitude[high]).astype(np.float32)


def reference_mel(waveform, matrix, semitones):
    tensor = torch.from_numpy(waveform.copy()).unsqueeze(0)
    padded = functional.pad(tensor.unsqueeze(1), (384, 384), mode="reflect").squeeze(1)
    spectrum = torch.stft(padded, n_fft=1024, hop_length=256, win_length=1024,
        window=torch.hann_window(1024), center=False, pad_mode="reflect",
        normalized=False, onesided=True, return_complex=True)
    magnitude = torch.sqrt(torch.view_as_real(spectrum).pow(2).sum(-1) + 1e-9)
    shifted = reference_warp(magnitude[0].numpy(), semitones)
    projected = torch.matmul(torch.from_numpy(matrix), torch.from_numpy(shifted).unsqueeze(0))
    return torch.log(torch.clamp(projected, min=1e-5))


class SpectralPitchTests(unittest.TestCase):
    def test_zero_shift_is_float32_bit_identity_and_never_mutates_input(self):
        original = np.random.default_rng(18).random((513, 450), dtype=np.float32)
        original[0, 0] = -0.0
        before = original.tobytes()
        shifted = trial.warp_magnitude(original, 0)
        self.assertEqual(shifted.dtype, np.float32)
        self.assertEqual(shifted.shape, original.shape)
        self.assertEqual(shifted.tobytes(), before)
        self.assertEqual(original.tobytes(), before)

    def test_one_semitone_matches_direct_inverse_bin_interpolation(self):
        original = np.random.default_rng(19).random((513, 450))
        before = original.tobytes()
        expected = reference_warp(original, 1)
        shifted = trial.warp_magnitude(original, 1)
        self.assertEqual(shifted.dtype, np.float32)
        np.testing.assert_allclose(shifted, expected, rtol=2e-6, atol=2e-7)
        self.assertEqual(original.tobytes(), before)

    def test_spectral_peak_moves_up_one_semitone_without_time_resampling(self):
        original = np.zeros((513, 450), dtype=np.float32)
        frame_codes = np.linspace(0.1, 0.9, 450, dtype=np.float32)
        original[128] = frame_codes
        shifted = trial.warp_magnitude(original, 1)
        peaks = np.argmax(shifted, axis=0)
        self.assertTrue(np.all(np.abs(peaks - 128 * 2 ** (1 / 12)) < 1))
        np.testing.assert_allclose(shifted[136] / frame_codes,
            np.full(450, shifted[136, 0] / frame_codes[0]), rtol=2e-6)
        # A flat spectrum with a unique time code must keep all450 columns.
        flat = np.repeat(frame_codes[None, :], 513, axis=0)
        np.testing.assert_allclose(trial.warp_magnitude(flat, 1), flat, rtol=2e-6)

    def test_dc_and_nyquist_do_not_wrap(self):
        original = np.zeros((513, 450), dtype=np.float32)
        original[0] = 0.25
        shifted = trial.warp_magnitude(original, 1)
        np.testing.assert_array_equal(shifted[0], original[0])
        self.assertTrue(np.all(shifted[2:] == 0))
        original.fill(0)
        original[512] = 0.75
        self.assertTrue(np.all(trial.warp_magnitude(original, 1) == 0))

    def test_bad_magnitudes_and_unsupported_pitch_values_are_rejected(self):
        valid = np.ones((513, 450), dtype=np.float32)
        invalid = [valid[:-1], valid[:, :-1], valid[None], valid.T,
                   valid.astype(np.float16), valid.astype(np.int16),
                   np.full_like(valid, -0.1), np.full_like(valid, np.nan),
                   np.full_like(valid, np.inf)]
        for magnitude in invalid:
            with self.subTest(shape=magnitude.shape, dtype=magnitude.dtype):
                with self.assertRaises(ValueError):
                    trial.warp_magnitude(magnitude, 1)
        for semitones in (-1, 0.5, 2, np.nan, np.inf):
            with self.subTest(semitones=semitones), self.assertRaises(ValueError):
                trial.warp_magnitude(valid, semitones)

    def test_make_mel_matches_official_analysis_for_both_allowed_shifts(self):
        matrix = basis()
        for semitones in (0, 1):
            with self.subTest(semitones=semitones):
                waveform = source()
                before = waveform.tobytes()
                filters = Mock(return_value=matrix.copy())
                tensor = torch.from_numpy(waveform.copy()).unsqueeze(0)
                tensor_before = tensor.numpy().tobytes()
                result = trial.make_mel(tensor, configuration(), semitones,
                    torch_module=torch, mel_basis_function=filters)
                expected = reference_mel(waveform, matrix, semitones)
                self.assertEqual(tuple(result.shape), (1, 100, 450))
                self.assertEqual(result.dtype, torch.float32)
                self.assertTrue(bool(torch.isfinite(result).all()))
                torch.testing.assert_close(result, expected, rtol=1e-6, atol=1e-6)
                self.assertEqual(waveform.tobytes(), before)
                self.assertEqual(tensor.numpy().tobytes(), tensor_before)
                filters.assert_called_once()
                self.assertEqual(filters.call_args.kwargs,
                    {"sr": 24000, "n_fft": 1024, "n_mels": 100, "fmin": 0, "fmax": None})

    def test_make_mel_reflect_padding_hann_and_no_centered_analysis(self):
        waveform = source()
        with patch.object(torch, "stft", wraps=torch.stft) as stft:
            trial.make_mel(torch.from_numpy(waveform.copy()).unsqueeze(0), configuration(), 0, torch_module=torch,
                mel_basis_function=Mock(return_value=basis()))
        stft.assert_called_once()
        padded = stft.call_args.args[0]
        self.assertEqual(tuple(padded.shape), (1, 115968))
        np.testing.assert_array_equal(padded.numpy()[0, 384:-384], waveform)
        np.testing.assert_array_equal(padded.numpy()[0, :384], waveform[1:385][::-1])
        np.testing.assert_array_equal(padded.numpy()[0, -384:], waveform[-385:-1][::-1])
        self.assertFalse(stft.call_args.kwargs["center"])
        self.assertTrue(stft.call_args.kwargs["return_complex"])
        torch.testing.assert_close(stft.call_args.kwargs["window"], torch.hann_window(1024))

    def test_make_mel_natural_log_and_floor_without_energy_normalization(self):
        filters = Mock(return_value=np.zeros((100, 513), dtype=np.float32))
        result = trial.make_mel(torch.from_numpy(source()).unsqueeze(0), configuration(), 1, torch_module=torch,
            mel_basis_function=filters)
        expected = torch.full((1, 100, 450), float(np.log(1e-5)))
        torch.testing.assert_close(result, expected, rtol=0, atol=0)

    def test_make_mel_rejects_bad_inputs_before_basis_creation(self):
        valid = torch.from_numpy(source()).unsqueeze(0)
        invalid = (valid[0], valid[:, :-1], valid.double(),
                   torch.zeros_like(valid), torch.full_like(valid, float("nan")),
                   torch.full_like(valid, 1.01))
        for waveform in invalid:
            with self.subTest(shape=tuple(waveform.shape), dtype=waveform.dtype):
                filters = Mock(return_value=basis())
                with self.assertRaises(ValueError):
                    trial.make_mel(waveform, configuration(), 0,
                        torch_module=torch, mel_basis_function=filters)
                filters.assert_not_called()
        for key, value in {"sampling_rate": 48000, "num_mels": 80,
                           "n_fft": 2048, "hop_size": 512, "fmax": 12000}.items():
            with self.subTest(config=key):
                config = configuration()
                config[key] = value
                filters = Mock(return_value=basis())
                with self.assertRaises(ValueError):
                    trial.make_mel(valid, config, 0, torch_module=torch,
                        mel_basis_function=filters)
                filters.assert_not_called()

    def test_make_mel_rejects_invalid_filterbank_without_mutating_input(self):
        invalid = (basis()[:-1], basis()[:, :-1],
                   np.full((100, 513), -1, dtype=np.float32),
                   np.full((100, 513), np.inf, dtype=np.float32),
                   np.full((100, 513), np.nan, dtype=np.float32))
        waveform = torch.from_numpy(source()).unsqueeze(0)
        before = waveform.numpy().tobytes()
        for matrix in invalid:
            with self.subTest(shape=matrix.shape), self.assertRaises(ValueError):
                trial.make_mel(waveform, configuration(), 0, torch_module=torch,
                    mel_basis_function=Mock(return_value=matrix))
        self.assertEqual(waveform.numpy().tobytes(), before)


if __name__ == "__main__":
    torch.set_num_threads(1)
    unittest.main()
