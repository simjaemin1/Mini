"""Pure contracts for the contained official MIDI-DDSP FLUTE R&D runner."""

from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import run_official_flute_rnd as runner


def _expression(value: float) -> dict[str, float]:
    return {field: value for field in runner.DOCUMENTED_BRIDGE_FIELDS}


class OfficialFluteRndTests(unittest.TestCase):
    def test_bridge_assignments_preserve_explicit_note_boundaries(self) -> None:
        rows = [
            {"pitch": 70, "onset": 0, "offset": 360, "note_length": 360},
            {"pitch": 0, "onset": 360, "offset": 540, "note_length": 180},
            {"pitch": 77, "onset": 540, "offset": 900, "note_length": 360},
            {"pitch": 77, "onset": 900, "offset": 1080, "note_length": 180},
        ]
        bridge = [
            {"midi_note": 70, "onset_seconds": 0.0, "offset_seconds": 1.44, "midi_ddsp_expression": _expression(0.2)},
            {"midi_note": 77, "onset_seconds": 2.16, "offset_seconds": 3.6, "midi_ddsp_expression": _expression(0.8)},
            {"midi_note": 77, "onset_seconds": 3.6, "offset_seconds": 4.32, "midi_ddsp_expression": _expression(0.4)},
        ]
        assignments = runner.bridge_row_assignments(rows, bridge)
        self.assertEqual([index for index, _ in assignments], [0, 2, 3])

    def test_bridge_assignment_fails_closed_when_timestamps_do_not_match(self) -> None:
        rows = [{"pitch": 70, "onset": 0, "offset": 361, "note_length": 361}]
        bridge = [{"midi_note": 70, "onset_seconds": 0.0, "offset_seconds": 1.44, "midi_ddsp_expression": _expression(0.2)}]
        with self.assertRaisesRegex(runner.RuntimeContractError, "exactly one"):
            runner.bridge_row_assignments(rows, bridge)

    def test_report_directory_is_fresh_child_of_ignored_rnd_root_only(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "_bgm_rnd").mkdir()
            destination = root / "_bgm_rnd" / "run-a"
            self.assertEqual(runner.require_fresh_rnd_directory(destination, repo_root=root), destination)
            with self.assertRaises(runner.RuntimeContractError):
                runner.require_fresh_rnd_directory(destination, repo_root=root)
            with self.assertRaises(runner.RuntimeContractError):
                runner.require_fresh_rnd_directory(root / "public" / "assets", repo_root=root)

    def test_post_model_release_ends_at_zero_and_removes_tail(self) -> None:
        import numpy as np

        output = runner.apply_authorial_release_and_truncate(
            np.ones(12, dtype=np.float32),
            release_start_seconds=0.5,
            release_end_seconds=1.0,
            sample_rate=10,
        )
        self.assertEqual(output.shape, (10,))
        self.assertEqual(output[0], 1.0)
        self.assertEqual(output[5], 1.0)
        self.assertEqual(output[-1], 0.0)

    def test_json_scalar_accepts_numpy_style_scalar_but_not_arrays(self) -> None:
        import numpy as np

        self.assertEqual(runner._json_scalar(np.int32(4)), 4)
        with self.assertRaises(TypeError):
            runner._json_scalar(np.ones(2, dtype=np.float32))


if __name__ == "__main__":
    unittest.main()
