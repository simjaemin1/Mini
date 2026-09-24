#!/usr/bin/env python3
"""Small deterministic tests for the read-only Daegeum phrase-pool triage."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import sys
import unittest


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import numpy as np  # noqa: E402

from phrase_pool import (  # noqa: E402
    PhrasePoolError,
    Profile,
    _candidate_rows,
    parse_pitch_classes,
)


def _track(*, octave_spike: bool = False) -> SimpleNamespace:
    count = 420
    time_s = np.arange(count, dtype=np.float64) * 0.01
    # The first 2.64 seconds rise by four semitones.  Remaining points make
    # the full-source RMS distribution non-degenerate; this fixture contains
    # no WAV because phrase_pool must operate from cached features alone.
    midi = 69.0 + np.linspace(0.0, 6.0, count, dtype=np.float64)
    if octave_spike:
        midi[120] += 14.0
    rms = -25.0 + np.linspace(0.0, 8.0, count, dtype=np.float64)
    rms[:12] = -55.0
    rms[253:265] = -54.0
    return SimpleNamespace(
        source=SimpleNamespace(source_id="src_fixture", sample_rate_hz=1000, frame_count=5000),
        time_s=time_s,
        native_frame_center=np.arange(count, dtype=np.int64) * 10,
        f0_hz=440.0 * np.power(2.0, (midi - 69.0) / 12.0),
        midi_proxy=midi,
        voicing_confidence=np.full(count, 0.91, dtype=np.float64),
        rms_dbfs=rms,
        onset_flux=np.full(count, 0.002, dtype=np.float64),
        feature_window_seconds=0.05,
    )


class PhrasePoolTest(unittest.TestCase):
    def test_feature_only_window_reports_a_contiguous_native_coordinate_span(self) -> None:
        rows, counts = _candidate_rows(
            _track(),
            profile=Profile("fixture_rising", 2.64, "rising", minimum_endpoint_delta_semitones=3.0),
            pitch_classes=(0, 2, 4, 7, 9),
            minimum_voicing=0.5,
            maximum_edge_energy_percentile=1.0,
            maximum_time_gap_factor=1.5,
            edge_window_seconds=0.12,
            stride_feature_frames=1,
            pitch_smoothing_window_feature_frames=5,
            maximum_smoothed_adjacent_pitch_step_semitones=6.0,
            np=np,
        )
        self.assertGreater(len(rows), 0)
        row = rows[0]
        self.assertTrue(row["native_source_span"]["single_contiguous_source_frame_range"])
        self.assertTrue(row["native_source_span"]["coordinate_only_not_a_verified_phrase_or_gesture_boundary"])
        self.assertEqual(row["feature_span"]["feature_frame_count"], 265)
        self.assertAlmostEqual(row["feature_span"]["center_duration_seconds"], 2.64)
        self.assertGreater(row["native_source_span"]["frame_range"][1], row["native_source_span"]["frame_range"][0])
        self.assertEqual(counts["rejected_for_smoothed_adjacent_pitch_step_proxy"], 0)

    def test_one_octave_like_proxy_outlier_is_not_silently_called_a_phrase_candidate(self) -> None:
        rows, counts = _candidate_rows(
            _track(octave_spike=True),
            profile=Profile("fixture_rising", 2.64, "rising", minimum_endpoint_delta_semitones=3.0),
            pitch_classes=(0, 2, 4, 7, 9),
            minimum_voicing=0.5,
            maximum_edge_energy_percentile=1.0,
            maximum_time_gap_factor=1.5,
            edge_window_seconds=0.12,
            stride_feature_frames=1,
            pitch_smoothing_window_feature_frames=5,
            maximum_smoothed_adjacent_pitch_step_semitones=2.0,
            np=np,
        )
        self.assertGreater(counts["rejected_for_smoothed_adjacent_pitch_step_proxy"], 0)
        for row in rows:
            self.assertLessEqual(
                row["contour_proxies"]["maximum_adjacent_median_smoothed_pitch_step_semitones"],
                2.0,
            )

    def test_lattice_parser_refuses_non_five_or_repeated_pitch_classes(self) -> None:
        self.assertEqual(parse_pitch_classes("0,2,4,7,9"), (0, 2, 4, 7, 9))
        with self.assertRaises(PhrasePoolError):
            parse_pitch_classes("0,2,4,7")
        with self.assertRaises(PhrasePoolError):
            parse_pitch_classes("0,2,4,7,7")


if __name__ == "__main__":
    unittest.main()
