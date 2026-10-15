import tempfile
from pathlib import Path
import unittest

import numpy as np
import soundfile as sf

from run_trial import prepare_guide


class GuideLevelTests(unittest.TestCase):
    def test_static_gain_preserves_exact_rests_and_source(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / "public_b0_sine_guide_19p2s_48k_stereo.wav"
            audio = np.full((48000, 2), .02, dtype="float32")
            audio[1000:2000] = 0
            sf.write(source, audio, 48000, subtype="FLOAT")
            original = source.read_bytes()
            output, facts = prepare_guide(root, root, 16)
            actual, rate = sf.read(output, dtype="float32", always_2d=True)
            np.testing.assert_array_equal(actual[1000:2000], 0)
            np.testing.assert_allclose(actual, audio * 10 ** .8, rtol=1e-6)
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual(rate, 48000)
            self.assertFalse(facts["notes_or_rests_edited"])

    def test_invalid_gain_fails_before_reading_input(self):
        for gain in (-1, 21, float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                prepare_guide(Path("missing"), Path("missing"), gain)


if __name__ == "__main__":
    unittest.main()
