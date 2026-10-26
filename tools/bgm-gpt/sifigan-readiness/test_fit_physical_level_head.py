import unittest
import numpy as np
import fit_physical_level_head as head


class PhysicalHeadTests(unittest.TestCase):
    def test_basis_matches_direct_power_and_c0_units(self):
        import pysptk
        basis,error=head.make_basis(pysptk.mc2sp)
        self.assertLess(error,1e-9)
        rng=np.random.default_rng(12)
        mc=rng.normal(0,.02,40)
        np.testing.assert_allclose(mc@basis,np.log(pysptk.mc2sp(mc,.466,2048)),atol=1e-10)
        raw=np.zeros((20,43));raw[:,0]=1.
        x=head.physical_features(raw,basis)
        np.testing.assert_allclose(x[:,0],20/np.log(10),atol=1e-10)
        np.testing.assert_allclose(x[:,1],0,atol=1e-10)

    def test_power_is_averaged_before_log_and_centered(self):
        basis=np.zeros((40,1025));basis[0,:]=2.
        raw=np.zeros((21,43));raw[10,0]=np.log(10)/2
        result=head.physical_features(raw,basis)
        expected=10*np.log10((12+10)/13)
        np.testing.assert_allclose(result[4:17,0],expected)
        np.testing.assert_allclose(result[:4,0],0)
        self.assertEqual(np.argmax(result[:,0]),4)
        self.assertEqual(result.shape,(21,5))

    def test_finite_validation(self):
        with self.assertRaises(ValueError):head.physical_features(np.zeros((0,43)),np.zeros((40,1025)))
        with self.assertRaises(ValueError):head.fit_ridge(np.zeros((2,2)),np.zeros(2))
        with self.assertRaises(ValueError):head.apply_gain(np.array([np.nan]),np.zeros(120))

    def test_one_dimensional_ridge_fit_and_unpenalized_intercept(self):
        x=np.linspace(-70,-10,400)[:,None];y=x[:,0]+3
        model,facts=head.fit_ridge(x,y)
        self.assertLess(np.sqrt(np.mean((head.predict(model,x)-y)**2)),.1)
        self.assertEqual(facts['linear_dimensions'],1)
        constant,_=head.fit_ridge(np.zeros((10,1)),np.full(10,-37.))
        np.testing.assert_allclose(head.predict(constant,np.zeros((3,1))),-37.)

    def test_cv_excludes_each_validation_recording_and_heldout(self):
        recordings={}
        for index,case in enumerate(sorted(head.FIT)):
            power=np.linspace(-70,-10,40)+index
            x=np.column_stack((power,np.zeros((40,4))))
            recordings[case]=(x,power+2)
        model,facts=head.select_fit_only(recordings)
        scores={c:r['recording_balanced_CV_RMSE_db'] for c,r in facts['candidates'].items()}
        self.assertEqual(facts['selected_candidate'],min(scores,key=scores.get))
        self.assertEqual(len(model['mean']),len(head.CANDIDATES[facts['selected_candidate']]))
        for candidate in facts['candidates'].values():
            self.assertEqual(len(candidate['folds']),8)
            for fold in candidate['folds']:
                self.assertNotIn(fold['validation_case'],fold['training_cases'])
                self.assertEqual(len(fold['training_cases']),7)
                self.assertFalse(fold['validation_used_for_fit_or_normalizer'])
        recordings['deepvib48']=recordings[next(iter(recordings))]
        with self.assertRaises(ValueError):head.select_fit_only(recordings)

    def test_gain_is_continuous_reference_free_and_reconstructable(self):
        wave=(.1*np.sin(2*np.pi*440*np.arange(2400)/24000)).astype(np.float32)
        levels=head.level_metrics.frame_rms_db(wave)+6
        unchanged=wave.copy()
        result,controls,facts=head.apply_gain(levels,wave)
        np.testing.assert_allclose(result,wave*10**(.3),rtol=1e-6,atol=1e-8)
        np.testing.assert_array_equal(wave,unchanged)
        self.assertEqual(set(controls),{'predicted_level_dbfs','carrier_measured_level_dbfs',
            'desired_gain_db','bounded_gain_db','smoothed_gain_db'})
        self.assertTrue(facts['AGC']);self.assertTrue(facts['offline_noncausal'])
        self.assertFalse(facts['reference_RMS_or_reference_waveform_used_for_runtime_gain'])
        _,bounded,facts=head.apply_gain(np.full(20,1000.),wave)
        self.assertEqual(facts['limited_gain_frames'],20)
        self.assertLessEqual(np.abs(bounded['smoothed_gain_db']).max(),60.)


if __name__=='__main__':unittest.main()
