"""Pure articulation-to-render policy for sustained BGM score notes.

This deliberately depends only on :mod:`articulation`, so a regression test
can prove the score semantics without NumPy, a WAV bank, or a renderer.  The
audio renderer imports these functions rather than reimplementing a private
"touching notes means legato" heuristic.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from articulation import BREATH_START, DETACHED, REARTICULATE, SLUR, plan_articulations


XFADE = 0.070
REARTICULATE_RELEASE = 0.035
DETACHED_RELEASE = 0.060
TIME_EPSILON = 1e-6


def plan_sustained_score(
    bars: Sequence[Sequence[Sequence[float]]],
    t0: float,
    sobak: float,
    *,
    annotations: Mapping[tuple[int, int], Mapping[str, Any]] | None = None,
    phrase_start_bars: Sequence[int] = (),
    bar_sobaks: float = 12.0,
) -> tuple[list[list[dict[str, Any]]], list[tuple[float, float, bool]]]:
    """Turn compact tuple score notes into canonical sustained-instrument plans.

    ``bars`` keeps the historical ``(position, duration, degree)`` notation.
    Its timing is deliberately *not* interpreted as a legato instruction. An
    author may add a mapping such as ``{(8, 0): {"slur_from_previous": True}}``
    in ``annotations``; absent that score mark, touching notes become
    ``rearticulate`` through :func:`articulation.plan_articulations`.

    ``bar_sobaks`` is explicit because the helper is reusable for other
    scores; the current village score's 12 is merely its caller's value.
    """
    if bar_sobaks <= 0:
        raise ValueError("bar_sobaks must be positive")
    active_annotations: Mapping[tuple[int, int], Mapping[str, Any]] = (
        {} if annotations is None else annotations
    )
    if not isinstance(active_annotations, Mapping):
        raise ValueError("articulation annotations must be a mapping keyed by (bar, note)")

    phrase_starts = set(phrase_start_bars)
    events: list[dict[str, Any]] = []
    locators: list[tuple[int, int]] = []
    for bar_index, bar in enumerate(bars):
        for note_index, note in enumerate(bar):
            try:
                position, duration, degree = note
            except (TypeError, ValueError) as exc:
                raise ValueError(
                    f"score note {(bar_index, note_index)!r} must be (position, duration, degree)"
                ) from exc
            start = float(t0) + (bar_index * float(bar_sobaks) + float(position)) * float(sobak)
            end = start + float(duration) * float(sobak)
            annotation = active_annotations.get((bar_index, note_index), {})
            if annotation is None:
                annotation = {}
            if not isinstance(annotation, Mapping):
                raise ValueError(
                    f"articulation annotation {(bar_index, note_index)!r} must be a mapping"
                )
            event = dict(annotation)
            event.update(start=start, end=end, degree=degree,
                         bar_index=bar_index, note_index=note_index)
            # A phrase boundary is a breath unless the score author writes a
            # stronger, explicit link. Do not fabricate a conflict with an
            # intentional score link: the canonical planner preserves it.
            incoming_link = any(event.get(key) for key in (
                "tie_from_previous", "slur_from_previous", "same_breath_from_previous",
            ))
            # Do not inject a second, conflicting boolean intent on top of a
            # score author's explicit fresh-breath or detached marking.  In
            # particular, a staccato phrase head is a valid authoring choice,
            # not a reason to force ``phrase_start`` and make the canonical
            # planner reject the score as ambiguous.
            has_explicit_boundary_intent = any(event.get(key) for key in (
                "breath_before", "phrase_start", "rest_before", "detached", "staccato",
            ))
            if bar_index in phrase_starts and not incoming_link \
                    and not has_explicit_boundary_intent \
                    and "articulation" not in event and "articulation_override" not in event:
                event["phrase_start"] = True
            events.append(event)
            locators.append((bar_index, note_index))

    plans = plan_articulations(events, time_epsilon=TIME_EPSILON)
    by_bar: list[list[dict[str, Any]]] = [[] for _ in bars]
    for locator, plan in zip(locators, plans):
        bar_index, _note_index = locator
        by_bar[bar_index].append(plan)
    level_notes = [
        (float(plan["start"]), float(plan["end"]), plan["kind"] == SLUR)
        for plan in plans
    ]
    return by_bar, level_notes


def articulation_render_options(
    plan: Mapping[str, Any],
    next_plan: Mapping[str, Any] | None,
    duration: float,
    *,
    tail_ring: float,
) -> dict[str, float | str | bool]:
    """Map canonical articulation intent to one offline sample-render event.

    The incoming plan controls whether this note may enter through a recorded
    steady body. The *next* plan controls how this note ends. Keeping those
    directions separate is what prevents a touching timestamp from silently
    turning either edge into a legato connection.
    """
    kind = plan["kind"]
    if kind not in (BREATH_START, SLUR, REARTICULATE, DETACHED):
        raise ValueError(f"unknown articulation kind: {kind!r}")
    duration = float(duration)
    if duration <= 0:
        raise ValueError("rendered note duration must be positive")

    # Only the *incoming* explicit slur requests a steady-body entry and an
    # equal-power crossfade. Every other kind deliberately retains a head.
    options: dict[str, float | str | bool] = {
        "entry_mode": "steady" if kind == SLUR else "head",
        "legato": XFADE if kind == SLUR else 0.0,
        "prefer_previous_source": kind == SLUR,
        "duration": duration,
        "ring": float(tail_ring),
        "release_inside_score": 0.0,
    }
    if next_plan is None:
        return options

    gap = float(next_plan["start"]) - float(plan["end"])
    next_kind = next_plan["kind"]
    touching = abs(gap) <= TIME_EPSILON
    if next_kind == SLUR and touching:
        # The following event explicitly carries the phrase onward. Preserve
        # this note through its full written duration and let the following
        # steady body crossfade only at this named score edge.
        options["ring"] = XFADE
        return options
    if gap > TIME_EPSILON:
        # A written rest/gap may retain a natural tail, but it never reaches
        # into the next onset and is never reclassified as legato.
        options["ring"] = min(float(tail_ring), gap)
        return options

    # A touching breath, tongue re-attack, or detached note needs the prior
    # note to close before the incoming recorded head. Release it within the
    # previous written duration; do not move the next score onset.
    release = DETACHED_RELEASE if next_kind == DETACHED else REARTICULATE_RELEASE
    if duration > release + 0.020:
        options["duration"] = duration - release
        options["ring"] = release
        options["release_inside_score"] = release
    else:
        # Never make an ultra-short score note negative. A zero tail is still
        # an explicit non-legato edge and leaves its next head unambiguous.
        options["ring"] = 0.0
    return options
