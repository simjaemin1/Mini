"""Small synthetic NumPy tests: no source recordings, Torch, or audio I/O."""
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parent))
import fit_level_head as head


class HeadTests(unittest.TestCase):
    def test_fixed_linear_fit_recovers_signal_without_mutation(self):
        rng=np.random.default_rng(17)
        x=rng.normal(size=(2000,43))
        y=-40+7*x[:,0]-3*x[:,2]
        original=x.tobytes(),y.tobytes()
        model,facts=head.fit(x,y)
        estimate=head.predict(model,x)
        self.assertLess(np.sqrt(np.mean((estimate-y)**2)),.05)
        self.assertEqual(original,(x.tobytes(),y.tobytes()))
        self.assertEqual(facts["frames"],2000)
        self.assertFalse(facts["heldout_used_for_fit_or_statistics"])

    def test_balancing_and_declared_training_target_floor(self):
        y=np.array([-100.]*10+[-70.]*20+[-50.]*30+[-30.]*40+[-10.]*50)
        weights,counts=head.balanced_weights(y)
        bins=np.searchsorted(head.RMS_STRATA,y,side="right")
        self.assertEqual(counts.tolist(),[10,20,30,40,50])
        np.testing.assert_allclose([weights[bins==i].sum() for i in range(5)],30)
        x=np.zeros((100,43));targets=np.full(100,-240.)
        model,facts=head.fit(x,targets)
        self.assertEqual(facts["clipped_fit_target_frames"],100)
        np.testing.assert_allclose(head.predict(model,x),-100)

    def constant_model(self,db):
        return dict(mean=np.zeros(43),scale=np.ones(43),coefficient=np.zeros(43),intercept=np.array(db))

    def test_runtime_is_continuous_gain_without_reference_envelope(self):
        wave=np.full(12000,.01,np.float32)
        x=np.zeros((100,43))
        before=wave.tobytes()
        result,controls,facts=head.apply_head(self.constant_model(-20),x,wave)
        np.testing.assert_allclose(result,.1,rtol=1e-6)
        self.assertEqual(before,wave.tobytes())
        self.assertTrue(facts["AGC"])
        self.assertTrue(facts["output_postprocessing"])
        self.assertFalse(facts["reference_RMS_or_reference_waveform_used_for_runtime_gain"])
        np.testing.assert_allclose(controls["smoothed_gain_db"],20)

    def test_bounds_silence_and_saturation_are_not_hidden(self):
        x=np.zeros((100,43));zero=np.zeros(12000,np.float32)
        result,controls,facts=head.apply_head(self.constant_model(-20),x,zero)
        self.assertEqual(np.count_nonzero(result),0)
        self.assertEqual(facts["limited_gain_frames"],100)
        self.assertLessEqual(np.max(controls["smoothed_gain_db"]),60)
        result,_,facts=head.apply_head(self.constant_model(10),x,np.ones(12000,np.float32))
        self.assertEqual(facts["saturated_sample_count"],12000)
        self.assertGreater(result.max(),1)

    def test_centered_smoothing_does_not_shift_gain_step(self):
        model=self.constant_model(-40)
        model["coefficient"][0]=10
        x=np.zeros((100,43));x[50:,0]=1
        wave=np.full(12000,.01,np.float32)
        _,controls,facts=head.apply_head(model,x,wave)
        g=controls["smoothed_gain_db"]
        self.assertLess(g[49],5)
        self.assertGreater(g[50],5)
        self.assertEqual(facts["causal_latency_samples"],0)
        self.assertEqual(facts["offline_noncausal_context_ms"],25)

    def test_invalid_fit_or_runtime_shapes_are_not_repaired(self):
        with self.assertRaises(ValueError):head.fit(np.zeros((10,42)),np.zeros(10))
        with self.assertRaises(ValueError):head.fit(np.zeros((10,43)),np.full(10,np.nan))
        with self.assertRaises(ValueError):head.predict(self.constant_model(-20),np.zeros((10,42)))
        with self.assertRaises(ValueError):head.apply_head(self.constant_model(-20),np.zeros((99,43)),np.zeros(12000))
        with self.assertRaises(ValueError):head.apply_head(self.constant_model(-20),np.zeros((100,43)),np.zeros(11999))


if __name__=="__main__":
    unittest.main()
