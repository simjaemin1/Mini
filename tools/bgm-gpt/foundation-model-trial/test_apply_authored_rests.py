import unittest
import numpy as np
from apply_authored_rests import rest_envelope


class AuthoredRestTests(unittest.TestCase):
    def test_exact_rests_unaffected_notes_bounded_smooth_envelope(self):
        times = [(4.533333333333333,4.8), (9.066666666666666,9.6),
                 (14.133333333333333,14.4), (18.666666666666668,19.2)]
        plan = {"events": [{"articulation": "release", "start_seconds": a,
                            "end_seconds": b} for a,b in times]}
        mask = rest_envelope(921600,48000,plan)
        self.assertTrue(np.all((mask>=0)&(mask<=1)))
        self.assertTrue(np.all(mask[:200000]==1))
        self.assertLess(float(np.max(np.abs(np.diff(mask)))), .004)
        for a,b in times:
            self.assertTrue(np.all(mask[int(np.ceil(a*48000)):int(np.ceil(b*48000))]==0))

    def test_missing_rest_rejected(self):
        with self.assertRaises(ValueError):
            rest_envelope(921600,48000,{"events": []})


if __name__ == "__main__":
    unittest.main()
