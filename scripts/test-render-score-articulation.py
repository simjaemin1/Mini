#!/usr/bin/env python3
"""Deterministic policy gate for the offline sustained-score renderer.

This has no sample-bank or WAV dependency.  It guards the failure mode that
made a touching score timestamp act as an implicit slur in ``render_score``.
"""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "public" / "assets" / "audio" / "bgm"))

from articulation import BREATH_START, REARTICULATE, SLUR  # noqa: E402
from render_articulation import (  # noqa: E402
    DETACHED_RELEASE,
    REARTICULATE_RELEASE,
    XFADE,
    articulation_render_options,
    plan_sustained_score,
)


passed = 0
failed = 0


def check(condition: bool, label: str, detail: str = "") -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {label}")
    else:
        failed += 1
        print(f"  ✗ {label}" + (f" — {detail}" if detail else ""))


print("=== BGM R&D — render_score explicit-articulation policy ===\n")

# The two notes touch exactly.  There is deliberately no score link.
bars = [[(0, 6, 0), (6, 6, 1)]]
plans, levels = plan_sustained_score(bars, 0.0, 0.10)
flat = plans[0]
check(
    [plan["kind"] for plan in flat] == [BREATH_START, REARTICULATE],
    "① touching but unmarked notes are breath + rearticulate, never an inferred slur",
    repr([plan["kind"] for plan in flat]),
)
check(
    len(levels) == 2
    and all(not item[2] for item in levels)
    and abs(levels[0][0]) < 1e-12
    and abs(levels[0][1] - 0.6) < 1e-12
    and abs(levels[1][0] - 0.6) < 1e-12
    and abs(levels[1][1] - 1.2) < 1e-12,
    "② level smoother receives no false tie flag for a timing-only boundary",
    repr(levels),
)

first = articulation_render_options(flat[0], flat[1], 0.6, tail_ring=0.45)
second = articulation_render_options(flat[1], None, 0.6, tail_ring=0.45)
check(
    first["entry_mode"] == "head"
    and first["legato"] == 0.0
    and abs(first["duration"] - (0.6 - REARTICULATE_RELEASE)) < 1e-12
    and abs(first["ring"] - REARTICULATE_RELEASE) < 1e-12,
    "③ outgoing unmarked note releases inside its written duration before the next head",
    repr(first),
)
check(
    second["entry_mode"] == "head" and second["legato"] == 0.0,
    "④ re-articulation enters through a head rather than a steady body",
    repr(second),
)

# A score mark—and only that mark—changes the same timeline into a slur.
slur_plans, slur_levels = plan_sustained_score(
    bars, 0.0, 0.10, annotations={(0, 1): {"slur_from_previous": True}}
)
slur_first, slur_second = slur_plans[0]
slur_out = articulation_render_options(slur_first, slur_second, 0.6, tail_ring=0.45)
slur_in = articulation_render_options(slur_second, None, 0.6, tail_ring=0.45)
check(
    slur_second["kind"] == SLUR and slur_levels[1][2] is True,
    "⑤ explicit slur annotation is the sole route to a true tie flag",
    repr(slur_second),
)
check(
    slur_out["duration"] == 0.6
    and slur_out["ring"] == XFADE
    and slur_in["entry_mode"] == "steady"
    and slur_in["legato"] == XFADE,
    "⑥ explicit slur alone preserves the outgoing tone and requests steady-body crossfade entry",
    repr((slur_out, slur_in)),
)

# A bar boundary does not implicitly continue the breath.  The same score
# edge can still be made a slur explicitly, which is important for an author
# working in compact per-bar notation.
long_bars = [[(0, 12, 0)], [(0, 12, 1)]]
boundary, _ = plan_sustained_score(long_bars, 0.0, 0.10, phrase_start_bars=(1,))
check(
    [boundary[0][0]["kind"], boundary[1][0]["kind"]] == [BREATH_START, BREATH_START],
    "⑦ a declared phrase/bar start is a fresh breath even when its timestamps touch",
    repr([boundary[0][0]["kind"], boundary[1][0]["kind"]]),
)
linked_boundary, _ = plan_sustained_score(
    long_bars, 0.0, 0.10,
    annotations={(1, 0): {"slur_from_previous": True}},
    phrase_start_bars=(1,),
)
check(
    linked_boundary[1][0]["kind"] == SLUR,
    "⑧ an explicit cross-bar slur overrides the default fresh-breath reading",
    repr(linked_boundary[1][0]),
)

# Detached is also a head edge; its larger within-score closure stays explicit.
detached_plans, _ = plan_sustained_score(
    bars, 0.0, 0.10, annotations={(0, 1): {"staccato": True}}
)
detached_out = articulation_render_options(
    detached_plans[0][0], detached_plans[0][1], 0.6, tail_ring=0.45
)
check(
    abs(detached_out["duration"] - (0.6 - DETACHED_RELEASE)) < 1e-12
    and abs(detached_out["ring"] - DETACHED_RELEASE) < 1e-12,
    "⑨ explicit detached edge uses its own declared release, not a legato fallback",
    repr(detached_out),
)

# The pure policy cannot be allowed to become a disconnected helper while
# ``render_score.play`` quietly restores its old timestamp heuristic.
renderer_source = (ROOT / "public" / "assets" / "audio" / "bgm" / "render_score.py").read_text(
    encoding="utf-8"
)
check(
    "articulation_render_options(" in renderer_source
    and "plan_sustained_score(" in renderer_source
    and "prev_end" not in renderer_source
    and "(s - prev_end)" not in renderer_source,
    "⑩ renderer consumes the canonical policy and contains no legacy prev_end timing-legato branch",
)

# ENTRY has grown from a historical (entry, skip) pair into a diagnostic
# record that also carries the chosen canonical articulation/release.  A
# complete score render must not fail after producing audio merely because
# its command-line summary still assumes the old tuple length.
jeongak_source = (ROOT / "public" / "assets" / "audio" / "bgm" / "render_jeongak.py").read_text(
    encoding="utf-8"
)
check(
    "for e, _ in ENTRY" not in renderer_source
    and "for e, v in ENTRY" not in renderer_source
    and "for e, _ in ENTRY" not in jeongak_source
    and "item[0] for item in ENTRY" in renderer_source
    and "item[0] for item in ENTRY" in jeongak_source,
    "⑪ renderer summaries tolerate the expanded articulation diagnostic record",
)

print(f"\n=== PASS {passed} / FAIL {failed} ===")
raise SystemExit(1 if failed else 0)
