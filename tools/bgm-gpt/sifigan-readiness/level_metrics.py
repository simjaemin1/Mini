"""Quiet-inclusive, source-fixed level diagnostics; NumPy only, no audio I/O.

Arrays are 24kHz mono waveforms on identical timestamps. Optional frame RMS
arrays are dBFS on the 5ms grid. Otherwise the independent 64ms centered,
reflect-padded RMS definition is computed here. No candidate-selected mask,
time/phase alignment, silence deletion, waveform gain edit, or quality score.
"""
import hashlib

import numpy as np


RATE, HOP, WINDOW = 24000, 120, 1536
QUIET_DBFS, RMS_AMPLITUDE_FLOOR = -60.0, 1e-12
MIXED_WINDOW_FRAMES, MIXED_STRIDE_FRAMES = 70, 35
BOUNDARY_CONTEXT_FRAMES = 20


def _vector(value, name):
    raw = np.asarray(value)
    if raw.dtype.kind not in "fiu" or raw.ndim != 1 or not len(raw):
        raise ValueError("nonempty_numeric_1d_array_required:" + name)
    result = raw.astype(np.float64, copy=False)
    if not np.isfinite(result).all():
        raise ValueError("finite_array_required:" + name)
    return result


def _rms(value):
    if not len(value):
        return None
    scale = float(np.max(np.abs(value)))
    return float(scale * np.sqrt(np.mean((value / scale) ** 2))) if scale else 0.0


def _db(value):
    return float(20 * np.log10(value)) if value is not None and value > 0 else None


def _db_difference(first, second):
    a, b = _db(first), _db(second)
    return float(a - b) if a is not None and b is not None else None


def _quantile(value, q):
    return float(np.quantile(value, q)) if len(value) else None


def _fraction(count, total):
    return float(count / total) if total else None


def _correlation(first, second):
    if len(first) < 2:
        return None
    a, b = first - first.mean(), second - second.mean()
    aa, bb = float(np.dot(a, a)), float(np.dot(b, b))
    if aa <= 1e-16 or bb <= 1e-16:
        return None
    return float(np.clip(np.dot(a, b) / np.sqrt(aa * bb), -1, 1))


def frame_rms_db(waveform):
    """Return 5ms-grid/64ms-window frame RMS dBFS, including quiet frames."""
    wave = _vector(waveform, "waveform")
    if len(wave) < HOP or len(wave) % HOP:
        raise ValueError("whole_5ms_waveform_frames_required")
    count, scale = len(wave) // HOP, float(np.max(np.abs(wave)))
    if not scale:
        return np.full(count, 20 * np.log10(RMS_AMPLITUDE_FLOOR))
    padded = np.pad(wave / scale, (WINDOW // 2, WINDOW // 2), mode="reflect")
    frames = np.lib.stride_tricks.sliding_window_view(padded, WINDOW)[:count * HOP:HOP]
    rms = scale * np.sqrt(np.mean(frames * frames, axis=1))
    return 20 * np.log10(np.maximum(rms, RMS_AMPLITUDE_FLOOR))


def _contour(rr, gr, mask):
    a, b = rr[mask], gr[mask]
    delta = b - a
    offset = _quantile(delta, .5)
    residual = delta - offset if len(delta) else delta
    pairs = mask[:-1] & mask[1:]
    da, db = np.diff(rr)[pairs], np.diff(gr)[pairs]
    return {
        "source_fixed_frames": int(mask.sum()),
        "single_median_generated_minus_source_offset_db": offset,
        "raw_deviation_rms_db": _rms(delta),
        "residual_rms_after_single_median_offset_db": _rms(residual),
        "p95_abs_residual_after_single_median_offset_db": _quantile(np.abs(residual), .95),
        "same_time_frame_level_pearson": _correlation(a, b),
        "source_p95_p05_span_db": float(np.quantile(a, .95) - np.quantile(a, .05)) if len(a) else None,
        "generated_p95_p05_span_db": float(np.quantile(b, .95) - np.quantile(b, .05)) if len(b) else None,
        "consecutive_source_pairs": int(pairs.sum()),
        "source_adjacent_step_rms_db": _rms(da),
        "generated_adjacent_step_rms_db": _rms(db),
        "same_time_adjacent_step_difference_rms_db": _rms(db - da),
        "candidate_silence_excluded": False,
    }


def _region(reference, predicted, rr, gr, mask):
    """Source-fixed frame cells select direct samples too, without gap closure."""
    count = int(mask.sum())
    if count:
        sample_mask = np.repeat(mask, HOP)
        source_rms, generated_rms = _rms(reference[sample_mask]), _rms(predicted[sample_mask])
        source_zero, generated_zero = bool(source_rms == 0), bool(generated_rms == 0)
    else:
        source_rms = generated_rms = None
        source_zero = generated_zero = None
    return {
        "source_fixed_frames": count,
        "source_frame_p50_dbfs": _quantile(rr[mask], .5),
        "source_frame_p95_dbfs": _quantile(rr[mask], .95),
        "generated_frame_p50_dbfs": _quantile(gr[mask], .5),
        "generated_frame_p95_dbfs": _quantile(gr[mask], .95),
        "generated_frames_above_minus60": int((mask & (gr > QUIET_DBFS)).sum()),
        "generated_fraction_above_minus60": _fraction(int((mask & (gr > QUIET_DBFS)).sum()), count),
        "source_direct_sample_rms": source_rms,
        "source_direct_sample_rms_dbfs": _db(source_rms),
        "generated_direct_sample_rms": generated_rms,
        "generated_direct_sample_rms_dbfs": _db(generated_rms),
        "direct_sample_generated_minus_source_db": _db_difference(generated_rms, source_rms),
        "source_exactly_zero": source_zero,
        "generated_exactly_zero": generated_zero,
        "level_contour": _contour(rr, gr, mask),
    }


def _fixed_intervals(mask):
    edges = np.flatnonzero(np.diff(np.r_[False, mask, False].astype(np.int8)))
    return [(int(a), int(b)) for a, b in edges.reshape(-1, 2)]


def _constant_gain_analysis(rr, gr, quiet, loud, gain, method):
    if gain is None:
        return {"available": False, "method": method,
                "reason": "both finite nonzero programme measurements are required",
                "saved_waveform_modified": False}
    shifted = gr + gain
    return {
        "available": True, "method": method, "constant_generated_gain_db": float(gain),
        "quiet_generated_frame_p50_dbfs": _quantile(shifted[quiet], .5),
        "quiet_generated_frame_p95_dbfs": _quantile(shifted[quiet], .95),
        "quiet_generated_fraction_above_minus60": _fraction(int((quiet & (shifted > QUIET_DBFS)).sum()), int(quiet.sum())),
        "quiet_median_generated_minus_source_db": _quantile(shifted[quiet] - rr[quiet], .5),
        "loud_contour_after_constant_gain": _contour(rr, shifted, loud),
        "saved_waveform_modified": False,
        "note": "An analytical constant only; it cannot repair time-varying envelope or quiet-region leakage.",
    }


def summary(predicted, reference, ref_rms=None, gen_rms=None, *,
            ref_pitch=None, ref_periodicity=None, gen_pitch=None, gen_periodicity=None,
            reference_lufs=None, generated_lufs=None):
    """JSON-safe whole-source level diagnostics; no pass/fail quality score.

    Optional ``ref_rms``/``gen_rms`` are paired dBFS arrays with one value per
    5ms frame. Supplied LUFS values must be actual caller measurements; this
    NumPy module does not calculate BS.1770 loudness. Without them it reports
    a separately labelled whole-RMS matching proxy, never calls it LUFS.
    """
    wave, source = _vector(predicted, "predicted"), _vector(reference, "reference")
    if wave.shape != source.shape or len(source) < HOP or len(source) % HOP:
        raise ValueError("same_24k_waveform_length_and_whole_5ms_frames_required")
    count = len(source) // HOP
    if (ref_rms is None) != (gen_rms is None):
        raise ValueError("both_or_neither_frame_RMS_arrays_required")
    rr, gr = ((frame_rms_db(source), frame_rms_db(wave)) if ref_rms is None else
              (_vector(ref_rms, "ref_rms_dbfs"), _vector(gen_rms, "gen_rms_dbfs")))
    if rr.shape != (count,) or gr.shape != (count,) or np.max(np.abs(np.r_[rr, gr])) > 10000:
        raise ValueError("finite_5ms_frame_RMS_dBFS_arrays_required")
    quiet, loud = rr <= QUIET_DBFS, rr > QUIET_DBFS
    all_frames = np.ones(count, dtype=bool)
    intervals = []
    for start, stop in _fixed_intervals(quiet):
        mask = np.zeros(count, dtype=bool)
        mask[start:stop] = True
        location = ("whole_clip" if start == 0 and stop == count else "clip_start" if start == 0
                    else "clip_end" if stop == count else "internal")
        intervals.append(dict(start_frame=start, end_frame_exclusive=stop,
            start_seconds=start * HOP / RATE, end_seconds_exclusive=stop * HOP / RATE,
            location=location, **_region(source, wave, rr, gr, mask)))

    transitions = []
    for index in np.flatnonzero(quiet[1:] != quiet[:-1]) + 1:
        index = int(index)
        start, stop = max(0, index - BOUNDARY_CONTEXT_FRAMES), min(count, index + BOUNDARY_CONTEXT_FRAMES)
        mask = np.zeros(count, dtype=bool)
        mask[start:stop] = True
        transitions.append(dict(boundary_frame=index, boundary_seconds=index * HOP / RATE,
            direction="quiet_to_loud" if quiet[index - 1] else "loud_to_quiet",
            start_frame=start, end_frame_exclusive=stop,
            classification="source-level threshold transition proxy, not annotated attack or breath",
            **_region(source, wave, rr, gr, mask)))

    mixed = []
    for start in range(0, count - MIXED_WINDOW_FRAMES + 1, MIXED_STRIDE_FRAMES):
        stop = start + MIXED_WINDOW_FRAMES
        quiet_count = int(quiet[start:stop].sum())
        if 0 < quiet_count < MIXED_WINDOW_FRAMES:
            mask = np.zeros(count, dtype=bool)
            mask[start:stop] = True
            mixed.append(dict(start_frame=start, end_frame_exclusive=stop,
                start_seconds=start * HOP / RATE, end_seconds_exclusive=stop * HOP / RATE,
                source_quiet_frames=quiet_count, source_loud_frames=MIXED_WINDOW_FRAMES - quiet_count,
                **_region(source, wave, rr, gr, mask)))

    source_rms, generated_rms = _rms(source), _rms(wave)
    rms_gain = _db_difference(source_rms, generated_rms)
    if (reference_lufs is None) != (generated_lufs is None):
        raise ValueError("both_or_neither_measured_LUFS_required")
    lufs_gain = None
    if reference_lufs is not None:
        measured = []
        for value in (reference_lufs, generated_lufs):
            scalar = np.asarray(value)
            if scalar.ndim != 0 or scalar.dtype.kind not in "fiu":
                raise ValueError("finite_measured_LUFS_scalars_required")
            number = float(scalar)
            # This broad bound excludes nonphysical values whose later contour
            # arithmetic could overflow even when their difference is finite.
            if not np.isfinite(number) or abs(number) > 10000:
                raise ValueError("finite_bounded_measured_LUFS_scalars_required")
            measured.append(number)
        lufs_gain = measured[0] - measured[1]
        if not np.isfinite(lufs_gain):
            raise ValueError("finite_measured_LUFS_difference_required")

    proxy = {"provided": False}
    optional = (ref_pitch, ref_periodicity, gen_pitch, gen_periodicity)
    if any(value is not None for value in optional):
        if any(value is None for value in optional):
            raise ValueError("all_four_or_no_optional_pitch_proxy_arrays_required")
        rp, rc, gp, gc = [_vector(v, name) for v, name in zip(optional,
            ("ref_pitch", "ref_periodicity", "gen_pitch", "gen_periodicity"))]
        if (any(v.shape != (count,) for v in (rp, rc, gp, gc)) or np.any(rp < 0) or np.any(gp < 0)
                or np.any((rc < 0) | (rc > 1)) or np.any((gc < 0) | (gc > 1))):
            raise ValueError("same_grid_nonnegative_pitch_and_unit_interval_proxy_required")
        candidate = (gp > 0) & (gc >= .90) & (gr > QUIET_DBFS)
        proxy = {"provided": True, "periodicity_is_not_calibrated_confidence": True,
            "reference_unvoiced_estimate_frames": int((rp == 0).sum()),
            "generated_voiced_estimate_on_source_quiet_frames": int((quiet & candidate).sum()),
            "generated_voiced_estimate_fraction_source_quiet": _fraction(int((quiet & candidate).sum()), int(quiet.sum())),
            "quiet_mask_independent_of_all_pitch_proxies": True}

    return {
        "schema": "mini.sifigan-quiet-inclusive-level-metrics.v1",
        "sample_rate": RATE, "samples": len(source), "seconds": len(source) / RATE,
        "feature_frames": count, "hop_samples": HOP, "rms_window_samples": WINDOW,
        "frame_RMS_source": "supplied dBFS arrays" if ref_rms is not None else "NumPy centered64ms reflected RMS",
        "source_quiet_rule": "reference_frame_RMS_dBFS<=-60; independent of all candidate measurements",
        "quiet_mask_sha256": hashlib.sha256(quiet.tobytes()).hexdigest(),
        "source_quiet_frames": int(quiet.sum()), "source_loud_frames": int(loud.sum()),
        "quiet": _region(source, wave, rr, gr, quiet),
        "loud": _region(source, wave, rr, gr, loud),
        "all_frames": _region(source, wave, rr, gr, all_frames),
        "source_fixed_quiet_intervals": intervals,
        "source_level_boundary_proxies": transitions,
        "source_fixed_mixed_windows": mixed,
        "mixed_window_definition": {"frames": MIXED_WINDOW_FRAMES, "stride_frames": MIXED_STRIDE_FRAMES,
            "selection": "contains at least one source-quiet and one source-loud frame"},
        "waveform": {"finite": True, "source_peak": float(np.max(np.abs(source))),
            "generated_peak": float(np.max(np.abs(wave))), "source_rms": source_rms,
            "generated_rms": generated_rms, "source_rms_dbfs": _db(source_rms),
            "generated_rms_dbfs": _db(generated_rms),
            "generated_minus_source_rms_db": _db_difference(generated_rms, source_rms),
            "generated_samples_at_or_above_unit_peak": int((np.abs(wave) >= 1).sum())},
        "whole_RMS_match_analysis": _constant_gain_analysis(rr, gr, quiet, loud, rms_gain,
            "whole-waveform RMS proxy; not LUFS"),
        "whole_LUFS_match_analysis": _constant_gain_analysis(rr, gr, quiet, loud, lufs_gain,
            "caller-supplied measured whole-clip LUFS difference"),
        "optional_pitch_proxy": proxy,
        "naturalness_approved": False, "saved_waveform_modified": False,
        "limits": [
            "Quiet is a source-energy threshold, not evidence of internal breath or intentional silence.",
            "Interval times are5ms frame cells of centered64ms RMS, not exact annotated onsets.",
            "Reflected analysis padding changes no waveform samples; no source or candidate interval is deleted.",
            "Conditional loud-only metrics coexist with quiet/all-frame diagnostics; quiet errors are never silently dropped.",
            "Static RMS/LUFS compensation is analysis only and cannot repair envelope, pitch, timbre or articulation.",
            "No perceptual approval or numerical pass threshold is defined.",
        ],
    }
