"""Source-fixed numerical diagnostics for a bounded reconstruction pilot.

Only NumPy arrays are consumed; this module reads no audio, model or dataset.
Feature arrays must use the same timestamps. ``ref_rms`` and ``gen_rms`` are
frame RMS in dBFS, not linear amplitudes. No offset/phase search, interpolation,
candidate-selected reference mask, or perceptual approval is performed.
"""
import hashlib

import numpy as np


CONFIDENCE = 0.90
RMS_FLOOR_DBFS = -60.0


def _vector(value, name):
    result = np.asarray(value, dtype=np.float64)
    if result.ndim != 1 or not len(result) or not np.isfinite(result).all():
        raise ValueError("nonempty_finite_1d_array_required:" + name)
    return result


def _rms(value):
    return float(np.sqrt(np.mean(value * value))) if len(value) else None


def _db(value):
    return float(20 * np.log10(value)) if value > 0 else None


def _fraction(count, denominator):
    return float(count / denominator) if denominator else None


def _correlation(first, second):
    if len(first) < 2:
        return None
    a, b = first - np.mean(first), second - np.mean(second)
    aa, bb = float(np.dot(a, a)), float(np.dot(b, b))
    if aa <= 1e-16 or bb <= 1e-16:
        return None
    return float(np.clip(np.dot(a, b) / np.sqrt(aa * bb), -1, 1))


def _detrend(value, indices):
    """OLS line on original frame indices, never closing gaps or realigning."""
    if not len(value):
        return value.copy()
    centered = value - np.mean(value)
    time = indices.astype(np.float64) - np.mean(indices)
    denominator = float(np.dot(time, time))
    return centered - time * (np.dot(time, centered) / denominator) if denominator else centered


def _waveform(value):
    rms = _rms(value)
    return {"samples": len(value), "finite": True,
            "peak": float(np.max(np.abs(value))), "rms": rms,
            "rms_dbfs": _db(rms),
            "samples_at_or_above_unit_peak": int(np.count_nonzero(np.abs(value) >= 1)),
            "effectively_silent_rms_below_1e_minus8": bool(rms < 1e-8)}


def summary(predicted, reference, ref_pitch, ref_periodicity, gen_pitch,
            gen_periodicity, ref_rms, gen_rms):
    """Return JSON-safe diagnostics, never an auditory-quality pass/fail.

    Pitch coverage/near50 denominators are fixed solely from the reference:
    F0>0, periodicity>=0.90, frame RMS>-60dBFS. Candidate dropouts cannot
    remove reference frames. Conditional error/contour statistics use only
    actually measured candidate frames and disclose that smaller count.
    Level-contour statistics instead use every reference frame above -60dBFS,
    including reference-unvoiced estimates; candidate silence is not excluded.
    """
    wave, target = _vector(predicted, "predicted"), _vector(reference, "reference")
    if len(wave) != len(target):
        raise ValueError("identical_waveform_sample_count_required_no_alignment")
    values = [_vector(v, name) for v, name in (
        (ref_pitch, "ref_pitch"), (ref_periodicity, "ref_periodicity"),
        (gen_pitch, "gen_pitch"), (gen_periodicity, "gen_periodicity"),
        (ref_rms, "ref_rms_dbfs"), (gen_rms, "gen_rms_dbfs"))]
    rp, rc, gp, gc, rr, gr = values
    if len({len(v) for v in values}) != 1:
        raise ValueError("identical_feature_frame_counts_required_no_alignment")
    if (np.any(rp < 0) or np.any(gp < 0)
            or np.any((rc < 0) | (rc > 1)) or np.any((gc < 0) | (gc > 1))):
        raise ValueError("nonnegative_pitch_and_unit_interval_periodicity_required")

    support = (rp > 0) & (rc >= CONFIDENCE) & (rr > RMS_FLOOR_DBFS)
    generated_voiced = (gp > 0) & (gc >= CONFIDENCE) & (gr > RMS_FLOOR_DBFS)
    shared = support & generated_voiced
    source_count, shared_count = int(support.sum()), int(shared.sum())
    cents = 1200 * np.log2(gp[shared] / rp[shared])
    near = int((np.abs(cents) <= 50).sum())
    octaves = np.rint(cents / 1200)
    octave_error = (octaves != 0) & (np.abs(cents - 1200 * octaves) <= 50)
    unvoiced = rp == 0

    # Source-only metrics retain every source-support frame, irrespective of G.
    indices, shared_indices = np.flatnonzero(support), np.flatnonzero(shared)
    source_curve = 1200 * np.log2(rp[support])
    source_shared = 1200 * np.log2(rp[shared])
    generated_shared = 1200 * np.log2(gp[shared])
    source_detrended = _detrend(source_curve, indices)
    source_shared_detrended = _detrend(source_shared, shared_indices)
    generated_detrended = _detrend(generated_shared, shared_indices)
    pitch_offset = float(np.median(cents)) if shared_count else None
    residual = cents - pitch_offset if shared_count else cents

    # Only genuinely consecutive reference frames form a pair; never bridge gaps.
    source_pairs = support[:-1] & support[1:]
    shared_pairs = source_pairs & generated_voiced[:-1] & generated_voiced[1:]
    pair_index, pair_shared_index = np.flatnonzero(source_pairs), np.flatnonzero(shared_pairs)
    source_steps = 1200 * np.log2(rp[pair_index + 1] / rp[pair_index])
    paired_source_steps = 1200 * np.log2(rp[pair_shared_index + 1] / rp[pair_shared_index])
    generated_steps = 1200 * np.log2(gp[pair_shared_index + 1] / gp[pair_shared_index])

    level_support = rr > RMS_FLOOR_DBFS
    level_count = int(level_support.sum())
    level_delta = gr[level_support] - rr[level_support]
    level_offset = float(np.median(level_delta)) if level_count else None
    level_residual = level_delta - level_offset if level_count else level_delta
    measured_wave, measured_reference = _waveform(wave), _waveform(target)
    wave_delta = (_db(measured_wave["rms"] / measured_reference["rms"])
                  if measured_reference["rms"] > 0 else None)

    return {
        "schema": "mini.sifigan-source-fixed-pilot-metrics.v1",
        "feature_frames": len(rp), "naturalness_approved": False,
        "periodicity_support_is_not_calibrated_confidence": True,
        "alignment": "identical timestamps; no offset/phase search, interpolation or time warping",
        "reference_waveform": measured_reference, "generated_waveform": measured_wave,
        "whole_waveform_rms_delta_db": wave_delta,
        "pitch": {
            "reference_support_rule": "F0>0 & periodicity>=0.90 & frame_RMS_dBFS>-60",
            "reference_support_frames": source_count,
            "reference_support_fraction_all_frames": _fraction(source_count, len(rp)),
            "reference_support_mask_sha256": hashlib.sha256(support.tobytes()).hexdigest(),
            "generated_confident_voiced_frames_all": int(generated_voiced.sum()),
            "shared_confident_voiced_frames": shared_count,
            "generated_missing_frames_on_reference_support": source_count - shared_count,
            "candidate_voicing_coverage": _fraction(shared_count, source_count),
            "near50c_frames": near,
            "near50c_fraction_reference_support": _fraction(near, source_count),
            "conditional_error_statistics_scope": "shared confident-voiced frames only; dropouts remain in coverage/near50 denominators",
            "median_signed_cents": pitch_offset,
            "median_abs_cents": float(np.median(np.abs(cents))) if shared_count else None,
            "p95_abs_cents": float(np.quantile(np.abs(cents), .95)) if shared_count else None,
            "octave_error_frames": int(octave_error.sum()),
            "octave_up_frames": int((octave_error & (octaves > 0)).sum()),
            "octave_down_frames": int((octave_error & (octaves < 0)).sum()),
            "reference_unvoiced_estimate_frames": int(unvoiced.sum()),
            "reference_other_uncertain_or_quiet_frames": int((~support & ~unvoiced).sum()),
            "generated_voicing_on_reference_unvoiced_estimates": int((unvoiced & generated_voiced).sum()),
            "unvoiced_note": "Reference pitch0 is an estimator result, not proof of natural unvoiced articulation.",
        },
        "pitch_contour": {
            "source_only_support_frames": source_count,
            "shared_measured_frames": shared_count,
            "complete_generated_support": bool(source_count and source_count == shared_count),
            "source_centered_rms_cents": _rms(source_curve - np.median(source_curve)) if source_count else None,
            "source_detrended_rms_cents": _rms(source_detrended),
            "source_detrended_rms_cents_on_shared_support": _rms(source_shared_detrended),
            "generated_detrended_rms_cents_on_shared_support": _rms(generated_detrended),
            "same_time_median_pitch_offset_cents": pitch_offset,
            "same_time_residual_rms_after_single_median_offset_cents": _rms(residual),
            "same_time_centered_correlation": _correlation(source_shared, generated_shared),
            "same_time_detrended_correlation": _correlation(source_shared_detrended, generated_detrended),
            "detrend": "OLS line on unchanged source frame indices; conditional candidate diagnostics never replace the source-only mask",
        },
        "adjacent_frame_pitch_proxy": {
            "source_consecutive_pairs": len(pair_index),
            "shared_measured_consecutive_pairs": len(pair_shared_index),
            "generated_pair_coverage": _fraction(len(pair_shared_index), len(pair_index)),
            "source_step_rms_cents": _rms(source_steps),
            "source_step_rms_cents_on_shared_pairs": _rms(paired_source_steps),
            "generated_step_rms_cents_on_shared_pairs": _rms(generated_steps),
            "same_time_step_difference_rms_cents": _rms(generated_steps - paired_source_steps),
            "note": "Adjacent feature-frame proxy, not acoustic-cycle jitter or proof of preserved vibrato; no gaps bridged.",
        },
        "level_contour": {
            "reference_support_rule": "reference frame_RMS_dBFS>-60, including unvoiced estimates",
            "reference_support_frames": level_count,
            "generated_frames_at_or_below_minus60_on_reference_support": int((level_support & (gr <= RMS_FLOOR_DBFS)).sum()),
            "single_median_generated_minus_reference_offset_db": level_offset,
            "residual_rms_after_single_median_offset_db": _rms(level_residual),
            "p95_abs_residual_after_single_median_offset_db": float(np.quantile(np.abs(level_residual), .95)) if level_count else None,
            "raw_rms_deviation_db": _rms(level_delta),
            "candidate_silence_excluded": False, "saved_audio_gain_changed": False,
        },
        "limits": [
            "Pitch/periodicity are supplied acoustic-estimator proxies, not exact F0 truth.",
            "Uncertain reference transitions are outside pitch support; their audible fidelity remains untested.",
            "Candidate dropouts reduce coverage and near50 fractions; conditional contour/error values alone can be misleading.",
            "No learned score performance, instrument identity, perceptual noise quality or listening approval is established.",
        ],
    }
