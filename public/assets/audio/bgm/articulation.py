"""Score-event articulation planning for sustained gugak instruments.

This module deliberately has no audio, NumPy, or sampler dependency.  It is
the boundary between a score's *meaning* and a later renderer's sample/
controller choices.  In particular, adjacent timestamps are not evidence of
legato: an unmarked next note is a re-articulation by default.

Input events are mappings with ``start`` and ``end`` seconds.  The planner
understands these optional, score-level annotations:

``articulation_override`` / ``articulation``
    One of ``breath_start``, ``slur``, ``rearticulate`` or ``detached``.
    This is authoritative, including across a score gap.  The resulting plan
    keeps that gap visible so the renderer can reconcile the timeline rather
    than silently inventing a connection.
``tie_from_previous`` / ``slur_from_previous`` / ``same_breath_from_previous``
    Explicitly continue the previous sounding event.
``tie_to_next`` / ``slur_to_next`` / ``same_breath_to_next``
    The equivalent annotation on the preceding event.
``breath_before`` / ``phrase_start`` / ``rest_before``
    Start a fresh breath before this event.
``detached`` / ``staccato``
    Make a deliberately separated articulation.

An event with ``rest: True`` (or ``kind: 'rest'``) contributes no plan item
but makes the next sounding event a ``breath_start``.  A literal gap also
starts a breath by default.  ``time_epsilon`` is only floating-point
tolerance; it is *not* a musical legato threshold.

Each returned dictionary is intended for :mod:`sampler`-style offline
rendering: ``sample_mode`` selects the primary recorded head or steady body,
``join_from_previous`` requests a crossfade, and ``release_before`` tells the
renderer whether it must close the previous note before this one.  The
separate ``onset_body_recipe`` makes one otherwise easy-to-miss distinction
explicit: a new breath can use a full recorded head, while a tongue/re-attack
ideally uses a short articulation transient followed by a steady body.  A
library that lacks a separately labelled tongue transient must report that
limitation instead of silently treating the two as equivalent.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


BREATH_START = "breath_start"
SLUR = "slur"
REARTICULATE = "rearticulate"
DETACHED = "detached"

KINDS = frozenset((BREATH_START, SLUR, REARTICULATE, DETACHED))

_ALIASES = {
    "breath": BREATH_START,
    "breath_start": BREATH_START,
    "new_breath": BREATH_START,
    "legato": SLUR,
    "slur": SLUR,
    "tied": SLUR,
    "rearticulate": REARTICULATE,
    "tongue": REARTICULATE,
    "portato": REARTICULATE,
    "detached": DETACHED,
    "staccato": DETACHED,
}
_LINK_FROM = ("tie_from_previous", "slur_from_previous", "same_breath_from_previous")
_LINK_TO = ("tie_to_next", "slur_to_next", "same_breath_to_next")
_BREATH_BEFORE = ("breath_before", "phrase_start", "rest_before")
_DETACHED = ("detached", "staccato")


def plan_articulations(
    events: Sequence[Mapping[str, Any]],
    *,
    previous: Mapping[str, Any] | None = None,
    time_epsilon: float = 1e-6,
) -> list[dict[str, Any]]:
    """Return immutable-style render plans for monophonic score events.

    ``events`` is never modified.  ``previous`` may be the final dictionary
    returned by an earlier call, which makes a bar boundary explicit instead
    of guessing from its duration.  The function raises ``ValueError`` for a
    malformed score annotation rather than silently changing performance
    intent.

    The default is intentionally conservative:

    * first event, an explicit rest, or a literal score gap -> ``breath_start``
    * an explicit tie/slur/same-breath mark -> ``slur``
    * an explicit detached/staccato mark -> ``detached``
    * any other adjacent note -> ``rearticulate``

    Thus a 1 ms or 50 ms adjacency never turns into a slur merely because of
    its duration.  Only explicit score context can do that.
    """
    if time_epsilon < 0:
        raise ValueError("time_epsilon must be non-negative")

    plans: list[dict[str, Any]] = []
    prior = _normalize_previous(previous)
    pending_rest = False

    for index, raw_event in enumerate(events):
        event = _require_mapping(raw_event, index)
        start, end = _event_times(event, index)

        if _is_rest(event):
            # Keep the silent interval in the context rather than emitting a
            # fake playable note.  ``prior`` remains the last sounding event
            # so the next plan reports the real silence in ``gap_before``.
            pending_rest = True
            continue

        if prior is not None and start < prior["start"] - time_epsilon:
            raise ValueError(
                f"event {index} starts before the preceding sounding event; "
                "split polyphony before articulation planning"
            )

        gap_before = None if prior is None else start - prior["end"]
        kind, reason, override = _classify(
            event,
            index=index,
            prior=prior,
            pending_rest=pending_rest,
            gap_before=gap_before,
            time_epsilon=time_epsilon,
        )
        plan = {
            "event_index": index,
            "start": start,
            "end": end,
            "kind": kind,
            "reason": reason,
            "gap_before": gap_before,
            "explicit_override": override,
            # Renderer-facing contract.  A sampler can choose ``head`` from
            # a recorded attack and ``steady`` from its hold region without
            # this planner knowing any sample-library filenames.
            "sample_mode": "steady" if kind == SLUR else "head",
            # ``sample_mode`` is deliberately kept as a small compatibility
            # surface for existing sample renderers.  This recipe is the
            # higher-fidelity contract: a re-articulation is not assumed to
            # sound like a fresh phrase head just because both begin with an
            # audible attack.
            "onset_body_recipe": _onset_body_recipe(kind),
            "join_from_previous": kind == SLUR,
            "release_before": kind in (BREATH_START, DETACHED),
            "attack_style": _attack_style(kind),
            # Preserve the outgoing score link in the carry object.  This is
            # what lets a caller plan each bar separately without treating a
            # mere boundary timestamp as a legato instruction.
            "links_to_next": _any_truthy(event, _LINK_TO),
            # A slur over a literal gap is permitted when an author asks for
            # it, but must be visible to the renderer/audit.
            "requires_timeline_reconciliation": bool(
                kind == SLUR and gap_before is not None and gap_before > time_epsilon
            ),
        }
        plans.append(plan)
        prior = plan
        pending_rest = False

    return plans


def _classify(
    event: Mapping[str, Any],
    *,
    index: int,
    prior: Mapping[str, Any] | None,
    pending_rest: bool,
    gap_before: float | None,
    time_epsilon: float,
) -> tuple[str, str, str | None]:
    override = _override(event, index)
    if override is not None:
        if override == SLUR and prior is None:
            raise ValueError(f"event {index} requests a slur but has no previous sounding event")
        return override, "explicit_override", override

    linked = _any_truthy(event, _LINK_FROM) or (
        prior is not None and (_any_truthy(prior, _LINK_TO) or bool(prior.get("links_to_next")))
    )
    new_breath = _any_truthy(event, _BREATH_BEFORE)
    detached = _any_truthy(event, _DETACHED)
    requested = sum(bool(value) for value in (linked, new_breath, detached))
    if requested > 1:
        raise ValueError(
            f"event {index} has conflicting articulation annotations; "
            "use articulation_override to choose one"
        )

    if linked:
        if prior is None:
            raise ValueError(f"event {index} links to a previous note but none was supplied")
        return SLUR, "explicit_score_link", None
    if detached:
        return DETACHED, "explicit_detached", None
    if prior is None:
        return BREATH_START, "first_sounding_event", None
    if pending_rest or new_breath:
        return BREATH_START, "explicit_rest_or_breath", None
    if gap_before is not None and gap_before > time_epsilon:
        return BREATH_START, "literal_score_gap", None
    return REARTICULATE, "unmarked_note_change", None


def _normalize_previous(previous: Mapping[str, Any] | None) -> dict[str, Any] | None:
    if previous is None:
        return None
    if not isinstance(previous, Mapping):
        raise ValueError("previous must be a mapping returned by plan_articulations")
    start, end = _event_times(previous, "previous")
    # Copy link annotations too: a score event passed from an earlier batch
    # can explicitly slur to the first event of this batch.
    normalized = dict(previous)
    normalized["start"] = start
    normalized["end"] = end
    return normalized


def _event_times(event: Mapping[str, Any], index: int | str) -> tuple[float, float]:
    try:
        start = float(event["start"])
        end = float(event["end"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"event {index} must have numeric start and end") from exc
    if not (end > start):
        raise ValueError(f"event {index} must have end > start")
    return start, end


def _require_mapping(event: Mapping[str, Any], index: int) -> Mapping[str, Any]:
    if not isinstance(event, Mapping):
        raise ValueError(f"event {index} must be a mapping")
    return event


def _is_rest(event: Mapping[str, Any]) -> bool:
    return bool(event.get("rest")) or event.get("kind") == "rest"


def _any_truthy(event: Mapping[str, Any], keys: Sequence[str]) -> bool:
    return any(bool(event.get(key)) for key in keys)


def _override(event: Mapping[str, Any], index: int) -> str | None:
    raw = event.get("articulation_override")
    if raw is None:
        raw = event.get("articulation")
    if raw is None:
        return None
    key = str(raw).strip().lower().replace("-", "_").replace(" ", "_")
    try:
        return _ALIASES[key]
    except KeyError as exc:
        allowed = ", ".join(sorted(KINDS))
        raise ValueError(f"event {index} has unknown articulation {raw!r}; use one of {allowed}") from exc


def _attack_style(kind: str) -> str:
    if kind == BREATH_START:
        return "breath"
    if kind == SLUR:
        return "none"
    if kind == DETACHED:
        return "detached"
    return "tongue"


def _onset_body_recipe(kind: str) -> str:
    """Describe the intended physical realization without inventing audio.

    The planner stays data-agnostic: it does not claim every source bank has
    all of these materials.  It does make the distinction available to a
    renderer so a full breath head is never accidentally used as the only
    possible re-attack implementation.
    """
    if kind == BREATH_START:
        return "recorded_full_head"
    if kind == SLUR:
        return "recorded_steady_body"
    if kind == REARTICULATE:
        return "short_tongue_transient_then_recorded_steady_body"
    if kind == DETACHED:
        return "recorded_full_head_then_declared_silence"
    raise ValueError(f"unsupported articulation mode: {kind}")
