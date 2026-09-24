"""Authorial articulation markup for the controlled browser Ari score slice.

The browser runtime remains untouched for this R&D pass.  This tiny,
dependency-free module is the source-of-truth for the offline controlled
render, so its b09/b10 decisions cannot drift into a second hand-written
``DEFAULT_SCORE`` in an audition script.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from articulation import REARTICULATE


# These are the live browser village-day Ari grid values, deliberately not
# arirang.py's historical offline do=72 rendering constants.
BROWSER_DO = 70.0
BROWSER_BEAT_S = 0.72
SCORE_BAR_START_ONE_BASED = 8
SCORE_BAR_END_ONE_BASED = 10
ARIRANG_INDEX_START_ZERO_BASED = 7
ARIRANG_INDEX_END_ZERO_BASED = 9

# Key: (zero-based Arirang bar index, source-event index inside that bar).
# Absence is meaningful: adjacent unmarked notes are re-articulated by the
# canonical planner.  The two same-pitch 70→70 candidate boundaries (b07→b08
# and b15→b16) intentionally stay absent until a real phrase source supports
# an authorial link.
ARI_EXPLICIT_ARTICULATION: dict[tuple[int, int], dict[str, Any]] = {
    # b09: the repeated 77 is a deliberate tongue re-articulation.
    (8, 1): {"articulation": REARTICULATE},
    # b10: one named continuous 77→74→72 phrase, including the bar crossing.
    (9, 0): {"slur_from_previous": True},
    (9, 1): {"slur_from_previous": True},
    (9, 2): {"slur_from_previous": True},
}

# Kept visible in provenance and tests: these edges are candidate-only, not
# tacitly upgraded to legato by equal timestamps.
CANDIDATE_ONLY_EDGES: tuple[tuple[str, str], ...] = (
    ("b07_e2", "b08_e0"),
    ("b15_e2", "b16_e0"),
)


def annotation_for(bar_zero_based: int, event_index: int) -> dict[str, Any]:
    """Return a caller-safe copy of this source event's explicit markup."""
    return dict(ARI_EXPLICIT_ARTICULATION.get((bar_zero_based, event_index), {}))


def controlled_village_day_ari_score(
    *, do: float = BROWSER_DO, beat_s: float = BROWSER_BEAT_S
) -> list[dict[str, Any]]:
    """Return the b08--b10 no-ornament controlled score used for R&D audio.

    The compact list deliberately includes b08's written rest.  That lets the
    canonical planner prove that b09 begins with a new breath rather than
    relying on an implied boundary.  MIDI values are derived from ``do`` so a
    caller cannot accidentally preserve a stale static pitch map.
    """
    do = float(do)
    beat_s = float(beat_s)
    if beat_s <= 0:
        raise ValueError("beat_s must be positive")

    def event(
        ident: str,
        score_bar_one_based: int,
        arirang_index_zero_based: int,
        event_index: int,
        degree: int,
        start_beats: float,
        duration_beats: float,
        **extra: Any,
    ) -> dict[str, Any]:
        result: dict[str, Any] = {
            "id": ident,
            "score_bar_one_based": score_bar_one_based,
            "browser_arirang_index_zero_based": arirang_index_zero_based,
            "degree": degree,
            "start": start_beats * beat_s,
            "end": (start_beats + duration_beats) * beat_s,
            # ARI_PENTA[degree] for the only degrees in this controlled slice:
            # 0=do, 1=re, 2=mi, 3=sol.
            "midi": do + (0.0, 2.0, 4.0, 7.0)[degree],
        }
        result.update(annotation_for(arirang_index_zero_based, event_index))
        result.update(extra)
        return result

    # b08 (ARIRANG index 7): written 2-beat tone then an explicit 1-beat rest.
    # b09 (index 8): 77 for 2 beats then 77 for 1 beat.
    # b10 (index 9): 77→74→72, one beat each.
    return [
        event("b08_e0", 8, 7, 0, 0, 0.0, 2.0,
              phrase_start=True, release_to_rest=True),
        {
            "id": "b08_rest",
            "score_bar_one_based": 8,
            "browser_arirang_index_zero_based": 7,
            "start": 2.0 * beat_s,
            "end": 3.0 * beat_s,
            "rest": True,
        },
        event("b09_e0", 9, 8, 0, 3, 3.0, 2.0, breath_before=True),
        event("b09_e1", 9, 8, 1, 3, 5.0, 1.0),
        event("b10_e0", 10, 9, 0, 3, 6.0, 1.0),
        event("b10_e1", 10, 9, 1, 2, 7.0, 1.0),
        event("b10_e2", 10, 9, 2, 1, 8.0, 1.0),
    ]


def authority_document() -> dict[str, Any]:
    """Stable, truthfully scoped authority wording for R&D provenance."""
    return {
        "source": "authorial source-score markup in ari_articulation.py",
        "not_runtime_parity": (
            "This controlled source map does not read, replace, or assert parity with "
            "bgm.js planPerformancePhrase(); the legacy runtime remains unchanged."
        ),
        "authorial_choices": {
            "b09_e1": "rearticulate",
            "b10_e0_to_b10_e2": "explicit_slur_sequence",
            "b07_e2_to_b08_e0": "candidate_only_unmarked",
            "b15_e2_to_b16_e0": "candidate_only_unmarked",
        },
    }
