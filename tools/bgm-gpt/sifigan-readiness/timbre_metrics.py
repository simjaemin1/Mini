"""Source-fixed spectral diagnostics, not an instrument-identity/quality score.

No waveform RMSE: analysis/resynthesis need not preserve phase or noise samples.
Per-frame spectral normalization below is analysis ONLY, never audio processing.
"""
import hashlib

import numpy as np

import level_metrics

RATE, HOP, FFT = 24000, 120, 2048
BANDS = (("0_1k", 0., 1000.), ("1_3k", 1000., 3000.),
         ("3_6k", 3000., 6000.), ("6_12k", 6000., 12000.01))


def _waves(candidate, reference):
    y, x = np.asarray(candidate, np.float64), np.asarray(reference, np.float64)
    if (x.ndim != 1 or y.shape != x.shape or len(x) < FFT or len(x) % HOP
            or not np.isfinite(x).all() or not np.isfinite(y).all()):
        raise ValueError("finite_equal_mono_24k_whole5ms_waves_required")
    return y, x


def _magnitude(wave):
    count = len(wave) // HOP
    frames = np.lib.stride_tricks.sliding_window_view(
        np.pad(wave, (FFT // 2, FFT // 2), mode="reflect"), FFT)[:count * HOP:HOP]
    return np.abs(np.fft.rfft(frames * np.hanning(FFT), axis=1))


def _stats(values):
    values = np.asarray(values, np.float64)
    if not len(values):
        return dict(count=0, mean=None, p50=None, p95=None, maximum=None)
    return dict(count=int(values.size), mean=float(values.mean()), p50=float(np.median(values)),
                p95=float(np.quantile(values, .95)), maximum=float(values.max()))


def _unit(magnitude):
    norm = np.linalg.norm(magnitude, axis=1)
    result = np.zeros_like(magnitude)
    np.divide(magnitude, norm[:, None], out=result, where=norm[:, None] > 1e-15)
    return result, norm


def summary(wave, reference):
    """Positive spectral-shape distances with unchanged source-only support.

    Primary mask: source64ms RMS>-60dBFS, without any candidate or F0 criterion.
    Quiet/all-frame counts and candidate silence remain explicit. There is no
    numerical pass threshold or mapping from these values to daegeum identity.
    """
    y, x = _waves(wave, reference)
    xm, ym = _magnitude(x), _magnitude(y)
    frequencies = np.fft.rfftfreq(FFT, 1 / RATE)
    bins = frequencies >= 70.
    xu, xn = _unit(xm[:, bins])
    yu, yn = _unit(ym[:, bins])
    source_rms = level_metrics.frame_rms_db(x)
    support = source_rms > -60.
    distances = np.linalg.norm(yu - xu, axis=1)
    cosine = np.clip(np.sum(xu * yu, axis=1), 0., 1.)
    xp, yp = xm * xm, ym * ym
    # Real-FFT interior bins represent both positive and negative frequencies.
    # DC and Nyquist occur only once. This weighting is for band energy only.
    xp[:, 1:-1] *= 2
    yp[:, 1:-1] *= 2
    xt, yt = xp.sum(axis=1), yp.sum(axis=1)
    bands = {}
    for name, low, high in BANDS:
        mask = (frequencies >= low) & (frequencies < high)
        xf, yf = np.zeros(len(xp)), np.zeros(len(yp))
        np.divide(xp[:, mask].sum(axis=1), xt, out=xf, where=xt > 1e-30)
        np.divide(yp[:, mask].sum(axis=1), yt, out=yf, where=yt > 1e-30)
        bands[name] = dict(source_fraction=_stats(xf[support]), candidate_fraction=_stats(yf[support]),
                          absolute_fraction_difference=_stats(np.abs(yf[support] - xf[support])))
    return dict(schema="mini.source-fixed-spectral-shape-diagnostics.v1", sample_rate=RATE,
        samples=len(x), frames=len(xm), hop_samples=HOP, FFT=FFT, window="symmetric Hann; centered reflect",
        bins=">=70Hz through Nyquist; unweighted magnitude L2 normalization per frame",
        support="source64ms RMS>-60dBFS; no candidate or F0 exclusion", source_support_frames=int(support.sum()),
        source_quiet_frames=int((~support).sum()), candidate_zero_spectral_norm_on_source_support=int((support & (yn <= 1e-15)).sum()),
        source_support_mask_sha256=hashlib.sha256(support.tobytes()).hexdigest(),
        unit_magnitude_L2_distance_on_support=_stats(distances[support]),
        unit_magnitude_L2_distance_all_frames=_stats(distances),
        cosine_similarity_on_support=_stats(cosine[support]), spectral_energy_bands_on_support=bands,
        spectral_band_energy_definition="one-sided STFT power; interior bins doubled; DC/Nyquist weight1",
        audio_modified=False, perceptually_approved=False,
        limits=["Spectral shape is a descriptive diagnostic, not learned/perceptual instrument identity.",
            "Phase/noise realizations and analysis-window placement can change magnitudes; WORLD is not a neural quality upper bound.",
            "Per-frame magnitude normalization is for analysis only; it does not alter audio or certify level accuracy.",
            "Source-quiet frames remain counted and in all-frame diagnostics; level_metrics reports quiet leakage separately."])


def parameter_summary(full_sp, compact_sp, full_ap, compact_ap, source_support):
    """Compression-only parameter differences before either WORLD rendering.

    SP is power (10log10), AP is amplitude-relative (20log10). This is not a
    comparison of model outputs and cannot prove the representation sufficient.
    """
    sp, sc, ap, ac = [np.asarray(a, np.float64) for a in (full_sp, compact_sp, full_ap, compact_ap)]
    mask = np.asarray(source_support)
    if (sp.ndim != 2 or not len(sp) or sp.shape[1] != FFT // 2 + 1 or any(a.shape != sp.shape for a in (sc, ap, ac))
            or mask.shape != (len(sp),) or mask.dtype != np.bool_
            or any(not np.isfinite(a).all() for a in (sp, sc, ap, ac))
            or (sp <= 0).any() or (sc <= 0).any()
            or any(((a < 0) | (a > 1)).any() for a in (ap, ac))):
        raise ValueError("aligned_positive_power_and_bounded_AP_with_source_bool_mask_required")
    db = 10 * (np.log10(np.maximum(sc, 1e-30)) - np.log10(np.maximum(sp, 1e-30)))
    apdb = 20 * (np.log10(np.maximum(ac, 1e-12)) - np.log10(np.maximum(ap, 1e-12)))
    freqs = np.fft.rfftfreq(FFT, 1 / RATE)
    bands = {}
    for name, low, high in BANDS:
        fm = (freqs >= low) & (freqs < high)
        bands[name] = dict(power_abs_db=_stats(np.abs(db[mask][:, fm]).ravel()),
            AP_abs_linear=_stats(np.abs(ac[mask][:, fm] - ap[mask][:, fm]).ravel()),
            AP_abs_amplitude_db=_stats(np.abs(apdb[mask][:, fm]).ravel()))
    return dict(schema="mini.WORLD43-compression-parameter-diagnostics.v1", frames=len(sp),
        source_support_frames=int(mask.sum()), source_quiet_frames=int((~mask).sum()),
        power_abs_db_on_support=_stats(np.abs(db[mask]).ravel()),
        power_abs_db_all_frames=_stats(np.abs(db).ravel()),
        power_shape_abs_db_after_per_frame_median_offset_on_support=
            _stats(np.abs((db - np.median(db, axis=1)[:, None])[mask]).ravel()),
        AP_abs_linear_on_support=_stats(np.abs(ac[mask] - ap[mask]).ravel()),
        full_AP_all_one_frames=int(np.all(ap >= .999, axis=1).sum()),
        compact_AP_all_one_frames=int(np.all(ac >= .999, axis=1).sum()),
        compact_AP_near_all_noise_frames=int((ac.mean(axis=1) >= .999).sum()),
        bands=bands, power_db_floor=1e-30, AP_amplitude_db_floor=1e-12,
        perceptually_approved=False, representation_sufficiency_proven=False)
