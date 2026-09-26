#!/usr/bin/env python3
"""Deterministic policy gate for the offline sustained-score renderer.

This has no sample-bank or WAV dependency.  ①~⑩ guard the pure explicit-articulation
policy (``render_articulation``) that GPT R&D wrote for ``render_score``.

★[T391 2026-09-26] 그 정책은 **옵션**이 됐다 — ``render_score.ARTICULATION_CONTRACT`` (기본 끔).
기본 굽기는 배포판을 구운 규칙(``450c6e44`` · 붙은 음은 이어 분다)으로 되돌렸다(카드 없는 정본
변경은 되돌리는 것이 규약 · "무표기 = 재발음" 이 옳은지는 #70 재민 판정). 그래서 ⑪ 이 뒤집혔다:
옛 ⑪ 은 "렌더러에 옛 시간 창 규칙이 **없다**" 를 물었고, 지금 ⑪ 은 "스위치가 **하나**이고 기본이
끔이며, 끄면 옛 규칙 · 켜면 계약이 **실제로** 탄다" 를 문다(⑪b·⑪c 는 가짜 악기로 play() 를 불러 잰다).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.dont_write_bytecode = True     # ★[T391] bgm 모듈을 import 해도 배포 폴더에 __pycache__ 를 떨구지 않는다


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

# A phrase-start helper must not turn a valid explicit staccato head into a
# conflicting (staccato + phrase_start) annotation.  This protects future
# score authoring even though the current village score has no such edge.
phrase_staccato, _ = plan_sustained_score(
    [[(0, 12, 0)]], 0.0, 0.10,
    annotations={(0, 0): {"staccato": True}}, phrase_start_bars=(0,),
)
check(
    phrase_staccato[0][0]["kind"] == "detached",
    "⑩ explicit staccato at a phrase start remains a valid detached head",
    repr(phrase_staccato[0][0]),
)

# ★[T391] 옛 ⑪("렌더러에 prev_end 시간 창 규칙이 없다")은 카드 없는 정본 변경을 지키고 있었다.
#   지금 계약: 스위치는 render_score 의 **한 자리**이고 기본은 끔 · 끄면 배포 규칙 · 켜면 이 정책이 탄다.
renderer_source = (ROOT / "public" / "assets" / "audio" / "bgm" / "render_score.py").read_text(
    encoding="utf-8"
)
import re as _re  # noqa: E402
switch_lines = _re.findall(r"^ARTICULATION_CONTRACT\s*=\s*(\w+)\s*$", renderer_source, _re.M)
check(
    switch_lines == ["False"]
    and "def _play_contract(" in renderer_source
    and "articulation_render_options(" in renderer_source
    and "plan_sustained_score(" in renderer_source
    and "(s - prev_end) < 0.05" in renderer_source,
    "⑪ 스위치 한 자리(`ARTICULATION_CONTRACT = False`) · 계약 경로(`_play_contract`)와 배포 규칙(prev_end 0.05소박 창)이 둘 다 있다",
    repr(switch_lines),
)

# ⑪b·⑪c — 소스 글자가 아니라 **실제로 불러서** 잰다. 가짜 악기(샘플 뱅크가 설치된 척)와 가짜 믹서로
#   맞닿은 두 음 한 장단을 불게 하고, 악기에 넘어간 인자를 본다. 뱅크·WAV 는 여전히 필요 없다.
try:
    import numpy as _np  # noqa: E402
    import render_score as _RS  # noqa: E402
except Exception as exc:  # 넘파이가 없으면 **실패**로 적는다(자명 통과 금지)
    _RS = None
    check(False, "⑪b·⑪c render_score 를 불러올 수 있다", repr(exc))
if _RS is not None:
    def _run(contract):
        calls, adds = [], []

        def fake(freq, dur, amp=1.0, **kw):
            calls.append(dict(kw, _dur=dur))
            return _np.zeros(64, _np.float32)
        fake._supports_explicit_sample_entry = True

        class _Mix:
            def add(self, y, at, *a, **k):
                adds.append(at)
        saved = getattr(_RS, "ARTICULATION_CONTRACT", None)   # 스위치가 없는 판(462b4acc)이면 ⑪·⑪b 가 빨갛다
        _RS.ARTICULATION_CONTRACT = contract
        try:
            _RS.play(_Mix(), fake, 67, [(0, 6, 0), (6, 6, 1)], 0.0, 0.10, "daegeum",
                     gain=0.5, pan=0.0, send=0.3, seed=7, ncy=12)
        finally:
            if saved is None:
                del _RS.ARTICULATION_CONTRACT
            else:
                _RS.ARTICULATION_CONTRACT = saved
        return calls, adds
    off, off_at = _run(False)
    on, on_at = _run(True)
    check(
        len(off) == 2 and off[1].get("legato") == _RS.XFADE == 0.070
        and off[0].get("ring") == _RS.XFADE and "entry_mode" not in off[1]
        and abs(off[0]["_dur"] - 0.6) < 1e-12,
        "⑪b 기본(끔) = 배포 규칙 — 맞닿은 둘째 음이 70ms 로 **이어 분다**(legato) · 첫 음은 적힌 길이 그대로 넘겨준다(ring 70ms)",
        repr([{k: v for k, v in c.items() if k in ("legato", "ring", "entry_mode", "_dur")} for c in off]),
    )
    check(
        len(on) == 2 and on[1].get("entry_mode") == "head" and "legato" not in on[1]
        and abs(on[0].get("ring", -1) - REARTICULATE_RELEASE) < 1e-12
        and abs(on[0]["_dur"] - (0.6 - REARTICULATE_RELEASE)) < 1e-12
        and len(on_at) == 2 and abs(on_at[0]) < 1e-9 and abs(on_at[1] - 0.6) < 1e-9,
        "⑪c 켬 = 계약 — 같은 두 음이 **재발음**(head · legato 없음) · 첫 음은 35ms 안에서 닫힌다 · 떨림(jitter) 없이 적힌 자리",
        repr([{k: v for k, v in c.items() if k in ("legato", "ring", "entry_mode", "_dur")} for c in on]) + f" at={on_at}",
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
    "⑫ renderer summaries tolerate the expanded articulation diagnostic record",
)

print(f"\n=== PASS {passed} / FAIL {failed} ===")
raise SystemExit(1 if failed else 0)
