"""Read-only note/audio timing diagnostics, not ground-truth alignment labels.

Score times transform as audio_time=offset+scale*score_time. Pitch is never
shifted or octave-wrapped. Every candidate retains the same audio-only source
support denominator; missing/ambiguous note mapping costs200c per frame.
"""
import numpy as np

MAX_FRAMES, MAX_CANDIDATES, MISSING_COST, MAX_NOTE_REPORT = 6000, 3000, 200., 128


def _vector(value, name):
    result = np.asarray(value, dtype=np.float64)
    if result.ndim != 1 or not np.isfinite(result).all():
        raise ValueError("finite_1d_array_required:" + name)
    return result


def _prepare(notes, times, pitch_hz, voiced, rms_db):
    times, pitch, rms = [_vector(v, name) for v, name in ((times, "times"), (pitch_hz, "pitch_hz"), (rms_db, "rms_db"))]
    voice = np.asarray(voiced)
    if (not 1 <= len(times) <= MAX_FRAMES or len(pitch) != len(times) or len(rms) != len(times)
            or voice.dtype != np.bool_ or voice.shape != times.shape or np.any(np.diff(times) <= 0)
            or np.any(times < 0) or np.any(pitch < 0)):
        raise ValueError("one_to6000_ordered_frames_matching_boolean_voicing_required")
    if not isinstance(notes, (list, tuple)) or len(notes) > 10000:
        raise ValueError("bounded_note_interval_list_required")
    starts, ends, midi = [], [], []
    for row in notes:
        if row.get("status", "paired") != "paired":
            raise ValueError("unmatched_or_nonpaired_MIDI_notes_require_explicit_review")
        try:
            start, end, note = float(row["start_seconds"]), float(row["end_seconds"]), float(row["pitch"])
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError("numeric_paired_note_intervals_required") from error
        if not np.isfinite([start, end, note]).all() or start < 0 or end <= start or not 0 <= note <= 127 or note != round(note):
            raise ValueError("positive_note_interval_and_integer_MIDI_pitch_required")
        starts.append(start); ends.append(end); midi.append(note)
    starts, ends, midi = np.asarray(starts), np.asarray(ends), np.asarray(midi)
    so, eo = np.argsort(starts, kind="stable"), np.argsort(ends, kind="stable")
    return dict(times=times, pitch=pitch, support=voice & (pitch > 0) & (rms > -60),
        starts=starts, ends=ends, midi=midi, start_order=so, end_order=eo,
        start_weights=np.r_[0, np.cumsum(so + 1)], end_weights=np.r_[0, np.cumsum(eo + 1)])


def _summary(fixed, active, cents, cost):
    mapped = fixed & (active == 1)
    errors, denominator = cents[mapped], int(fixed.sum())
    return dict(fixed_source_support_frames=denominator, unique_note_frames_on_support=int(mapped.sum()),
        no_note_frames_on_support=int((fixed & (active == 0)).sum()),
        ambiguous_frames_on_support=int((fixed & (active > 1)).sum()),
        note_mapping_coverage=float(mapped.sum() / denominator) if denominator else None,
        median_signed_cents=float(np.median(errors)) if len(errors) else None,
        median_abs_cents=float(np.median(np.abs(errors))) if len(errors) else None,
        p95_abs_cents=float(np.quantile(np.abs(errors), .95)) if len(errors) else None,
        near_fraction={str(bound): float((np.abs(errors) <= bound).sum() / denominator) if denominator else None for bound in (50, 100, 200)},
        capped_absolute_200c_sum=float(cost[fixed].sum()),
        capped_absolute_200c_mean=float(cost[fixed].mean()) if denominator else None,
        missing_and_ambiguous_cost_cents=MISSING_COST,
        conditional_error_statistics_do_not_remove_missing_from_denominator=True)


def _evaluate(data, offset, scale, detailed):
    if not np.isfinite([offset, scale]).all() or scale <= 0:
        raise ValueError("finite_offset_and_positive_scale_required")
    score_time = (data["times"] - offset) / scale
    n = len(data["starts"])
    if n:
        begun = np.searchsorted(data["starts"][data["start_order"]], score_time, side="right")
        ended = np.searchsorted(data["ends"][data["end_order"]], score_time, side="right")
        active = begun - ended
        # Weighted active ID sum correctly recovers a unique older note after
        # a nested overlapping note has ended; last-started-note lookup cannot.
        ids = data["start_weights"][begun] - data["end_weights"][ended] - 1
        outside = (score_time < data["starts"].min()) | (score_time >= data["ends"].max())
    else:
        active, ids = np.zeros(len(score_time), int), np.full(len(score_time), -1, int)
        outside = np.ones(len(score_time), bool)
    support, cents = data["support"], np.full(len(score_time), np.nan)
    mapped = support & (active == 1)
    target = 440 * np.exp2((data["midi"][ids[mapped]] - 69) / 12.) if n else np.empty(0)
    cents[mapped] = 1200 * np.log2(data["pitch"][mapped] / target)
    cost = np.full(len(score_time), MISSING_COST)
    cost[mapped] = np.minimum(np.abs(cents[mapped]), MISSING_COST)
    result = dict(offset_seconds=float(offset), scale=float(scale), **_summary(support, active, cents, cost),
        outside_score_extent_frames_on_support=int((support & outside).sum()),
        inside_score_gap_frames_on_support=int((support & ~outside & (active == 0)).sum()))
    if detailed:
        per_note = []
        intersecting_notes = 0
        for index, (start, end) in enumerate(zip(data["starts"], data["ends"])):
            region = (score_time >= start) & (score_time < end)
            if not region.any():
                continue
            intersecting_notes += 1
            if len(per_note) >= MAX_NOTE_REPORT:
                continue
            relative = (score_time - start) / (end - start)
            boundary = region & ((relative < .1) | (relative >= .9))
            per_note.append(dict(note_index=index, pitch=int(data["midi"][index]),
                start_seconds=float(offset + scale * start), end_seconds=float(offset + scale * end),
                all=_summary(support & region, active, cents, cost),
                boundary_outer10percent=_summary(support & boundary, active, cents, cost),
                steady_inner80percent=_summary(support & region & ~boundary, active, cents, cost)))
        errors = cents[mapped]
        octave = np.rint(errors / 1200.)
        result.update(per_note=per_note, total_audio_frames=len(score_time),
            per_note_report_limit=MAX_NOTE_REPORT, notes_intersecting_audio_frames=intersecting_notes,
            per_note_details_truncated=intersecting_notes > len(per_note),
            audio_unvoiced_or_quiet_frames=int((~support).sum()),
            ambiguous_frames_all=int((active > 1).sum()), no_note_frames_all=int((active == 0).sum()),
            notes_without_any_audio_frame=n - intersecting_notes,
            octave_error_frames=int(((octave != 0) & (np.abs(errors - octave * 1200) <= 50)).sum()),
            nearest_integer_semitones_diagnostic=int(np.rint(np.median(errors) / 100)) if len(errors) else None,
            pitch_transposition_applied=False, octave_wrapping_applied=False, audio_or_score_modified=False,
            training_accepted=False, human_verified_labels=False,
            support_rule="audio voiced & pitch_Hz>0 & RMS_dBFS>-60; fixed for every affine candidate",
            interval_rule="start inclusive, end exclusive; overlap is ambiguous and costs200c",
            boundary_rule="outer10percent of each transformed note duration; unchanged audio timestamps",
            limits=["Acoustic pitch and voicing are estimates, not instrument/score ground truth.",
                "Affine improvement is diagnostic, not verified alignment, correct score identity, or a training label.",
                "Vibrato affects absolute cents;50/100/200c fractions are diagnostics, not acceptance thresholds."])
    return result


def evaluate(notes, times, pitch_hz, voiced, rms_db, offset=0., scale=1.):
    return _evaluate(_prepare(notes, times, pitch_hz, voiced, rms_db), offset, scale, True)


def search_affine(notes, times, pitch_hz, voiced, rms_db, scales=None, offsets=None, max_candidates=MAX_CANDIDATES):
    data = _prepare(notes, times, pitch_hz, voiced, rms_db)
    scales = _vector(np.linspace(.3, 1.5, 61) if scales is None else scales, "scales")
    offsets = _vector(np.linspace(-1., 1., 41) if offsets is None else offsets, "offsets")
    if (not len(scales) or not len(offsets) or np.any(scales <= 0) or np.any(np.diff(scales) <= 0)
            or np.any(np.diff(offsets) <= 0) or type(max_candidates) is not int or not 1 <= max_candidates <= MAX_CANDIDATES):
        raise ValueError("ordered_positive_scale_grid_finite_offset_grid_and_max3000_required")
    extra_identity = not (np.any(scales == 1) and np.any(offsets == 0))
    count = len(scales) * len(offsets) + extra_identity
    if count > max_candidates:
        raise ValueError("affine_search_max3000_candidates_including_identity")
    identity = _evaluate(data, 0., 1., True)
    candidates = []
    if len(data["starts"]) and data["support"].any():
        pairs = [(float(offset), float(scale)) for scale in scales for offset in offsets]
        if extra_identity: pairs.append((0., 1.))
        for offset, scale in pairs:
            candidates.append(_evaluate(data, offset, scale, False))
        def rank(row):
            identity_tie = row["offset_seconds"] == 0 and row["scale"] == 1
            return (row["capped_absolute_200c_sum"], not identity_tie,
                abs(row["offset_seconds"]) + abs(np.log(row["scale"])), row["offset_seconds"], row["scale"])
        best_row = min(candidates, key=rank)
        best = _evaluate(data, best_row["offset_seconds"], best_row["scale"], True)
        status = "diagnostic_affine_search_complete_not_verified_alignment"
    else:
        best, candidates = identity, [dict(offset_seconds=0., scale=1., capped_absolute_200c_sum=identity["capped_absolute_200c_sum"])]
        status = "no_supported_audio_or_no_notes_identity_only_no_alignment_established"
    candidate_count = len(candidates)
    candidates = sorted(candidates, key=lambda row: (row["capped_absolute_200c_sum"],
        not (row["offset_seconds"] == 0 and row["scale"] == 1), abs(row["offset_seconds"]) + abs(np.log(row["scale"]))))[:5]
    return dict(schema="mini.note-audio-affine-diagnostics.v1", status=status, identity=identity, best=best,
        candidates=candidates, top_candidates=candidates, candidate_count=candidate_count,
        candidate_summaries_limited_to_top5=True, requested_grid_candidate_count=int(count),
        grid=dict(scales=scales.tolist(), offsets_seconds=offsets.tolist(), identity_added=bool(extra_identity)),
        objective="sum min(abs(unwrapped_cents),200) over fixed audio support; missing/ambiguous=200",
        identity_preferred_on_exact_objective_tie=True, best_is_diagnostic_not_ground_truth=True,
        training_accepted=False, human_verified_labels=False, audio_or_score_modified=False)


def analyse(notes, times, pitch_hz, voiced, rms_db, **search_options):
    """Compact JSON-compatible entrypoint used by the read-only pair auditor."""
    return search_affine(notes, times, pitch_hz, voiced, rms_db, **search_options)
