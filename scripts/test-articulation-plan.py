#!/usr/bin/env python3
"""Regression contract for the offline sustained-instrument articulation planner."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "public" / "assets" / "audio" / "bgm"))

from articulation import (  # noqa: E402
    BREATH_START,
    DETACHED,
    REARTICULATE,
    SLUR,
    plan_articulations,
)


passed = 0
failed = 0


def check(condition: bool, label: str) -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {label}")
    else:
        failed += 1
        print(f"  ✗ {label}")


def expect_value_error(label: str, fn) -> None:
    try:
        fn()
    except ValueError:
        check(True, label)
    else:
        check(False, label)


print("=== BGM R&D-02 — sustained-instrument articulation contract ===\n")

# Do not mutate the author's score while deriving renderer instructions.
score = [
    {"start": 0.0, "end": 0.50, "pitch": 69},
    {"start": 0.50, "end": 1.00, "pitch": 71},
]
before = repr(score)
plan = plan_articulations(score)
check(repr(score) == before, "① 입력 score event를 바꾸지 않는다")
check(
    [item["kind"] for item in plan] == [BREATH_START, REARTICULATE],
    "② 첫 음은 breath_start, 표시 없는 붙은 다음 음은 rearticulate다",
)
check(
    plan[0]["sample_mode"] == "head"
    and plan[1]["sample_mode"] == "head"
    and plan[1]["attack_style"] == "tongue",
    "③ 첫 음·재어택은 recorded head를, 재어택은 tongue 스타일을 요청한다",
)

# A touching boundary and the former 50 ms cutoff must never create legato by
# timing alone.  The tiny real gap remains observable to a renderer.
tiny_gap = plan_articulations(
    [
        {"start": 0.0, "end": 0.50, "pitch": 69},
        {"start": 0.51, "end": 1.00, "pitch": 71},
    ]
)
check(
    tiny_gap[1]["kind"] == BREATH_START
    and tiny_gap[1]["reason"] == "literal_score_gap"
    and abs(tiny_gap[1]["gap_before"] - 0.01) < 1e-12,
    "④ 10 ms gap은 숨/쉼으로 보이며 자동 slur가 되지 않는다",
)
check(
    plan[1]["kind"] != SLUR and tiny_gap[1]["kind"] != SLUR,
    "⑤ 0 ms·10 ms 어느 경우도 시간만으로 slur를 추정하지 않는다",
)

slurred = plan_articulations(
    [
        {"start": 0.0, "end": 0.50, "pitch": 69, "tie_to_next": True},
        {"start": 0.50, "end": 1.00, "pitch": 71},
    ]
)
check(
    slurred[1]["kind"] == SLUR
    and slurred[1]["sample_mode"] == "steady"
    and slurred[1]["join_from_previous"]
    and not slurred[1]["release_before"],
    "⑥ 명시적 tie만 steady body + crossfade slur를 만든다",
)

detached = plan_articulations(
    [
        {"start": 0.0, "end": 0.50, "pitch": 69},
        {"start": 0.50, "end": 0.82, "pitch": 71, "staccato": True},
    ]
)
check(
    detached[1]["kind"] == DETACHED
    and detached[1]["release_before"]
    and detached[1]["attack_style"] == "detached",
    "⑦ explicit staccato는 detached이며 앞 음을 닫는다",
)

after_rest = plan_articulations(
    [
        {"start": 0.0, "end": 0.50, "pitch": 69},
        {"start": 0.50, "end": 0.75, "rest": True},
        {"start": 0.75, "end": 1.25, "pitch": 71},
    ]
)
check(
    len(after_rest) == 2
    and after_rest[1]["kind"] == BREATH_START
    and after_rest[1]["reason"] == "explicit_rest_or_breath"
    and abs(after_rest[1]["gap_before"] - 0.25) < 1e-12,
    "⑧ score rest 뒤에는 새 breath_start와 실제 무음 길이를 보존한다",
)

# Producers can deliberately override a derived reading.  A slur across a
# gap is retained as intent but flagged so a sampler cannot hide the repair.
override = plan_articulations(
    [
        {"start": 0.0, "end": 0.50, "pitch": 69},
        {
            "start": 0.53,
            "end": 1.00,
            "pitch": 71,
            "articulation_override": "slur",
        },
    ]
)
check(
    override[1]["kind"] == SLUR
    and override[1]["explicit_override"] == SLUR
    and override[1]["requires_timeline_reconciliation"],
    "⑨ explicit override는 gap보다 우선하되 renderer 경고를 남긴다",
)

direct_override = plan_articulations(
    [
        {"start": 0.0, "end": 0.50, "pitch": 69},
        {"start": 0.53, "end": 1.00, "pitch": 71, "articulation": "tongue"},
    ]
)
check(
    direct_override[1]["kind"] == REARTICULATE
    and direct_override[1]["explicit_override"] == REARTICULATE,
    "⑩ articulation 별칭(tongue)도 시간 추정보다 우선한다",
)

# The same pure planner can be called one bar at a time without guessing a
# cross-bar connection; an explicit notation link is still required.
first_bar = plan_articulations([{"start": 0.0, "end": 0.50, "pitch": 69, "tie_to_next": True}])
second_bar = plan_articulations(
    [{"start": 0.50, "end": 1.00, "pitch": 71}], previous=first_bar[-1]
)
check(second_bar[0]["kind"] == SLUR, "⑪ previous plan의 tie_to_next로 마디 경계 slur를 잇는다")

expect_value_error(
    "⑫ 이전 음 없이 slur를 요청하면 조용히 합성하지 않고 오류를 낸다",
    lambda: plan_articulations([{"start": 0.0, "end": 0.5, "articulation": "slur"}]),
)
expect_value_error(
    "⑬ 충돌한 score 표기는 author가 override로 결정하도록 오류를 낸다",
    lambda: plan_articulations(
        [{"start": 0.0, "end": 0.5}, {"start": 0.5, "end": 1.0, "slur_from_previous": True, "staccato": True}]
    ),
)

print(f"\n=== PASS {passed} / FAIL {failed} ===")
raise SystemExit(1 if failed else 0)
