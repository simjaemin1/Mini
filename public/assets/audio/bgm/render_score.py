"""
render_score.py — **손으로 쓴 그 악보 그대로** 국악기 음원으로 연주한다.

    손으로 쓴 악보 (score_village_day.py)
        ├─→ to_midi.py       MIDI. 음표만. 음색은 재생기가 정한다 (판단용)
        └─→ render_score.py  같은 음표를 국립국악원 녹음으로 (게임용)

두 갈래가 **같은 음표**를 쓴다. 악보가 확정되면 음색만 갈아끼우면 되는 구조다.
시김새는 여기서 붙인다 — 악보에는 '어느 음을 얼마나' 만 적고,
'어떻게 흔들고 밀고 꺾는지' 는 국악 문법(motif.sigim)이 정한다.

★[T391 2026-09-26] **기본값은 배포판을 구운 규칙이다**(착지 전 `450c6e44` 그대로):
  붙은 음은 이어 분다 — 앞 음 끝에서 0.05소박 안에 오면 어택을 지우고 70ms 로 맞물린다
  (장단을 넘을 때는 20ms 창 · 악구를 맺은 다음 자리는 새 숨). 배포 `village_day_trad` 가 이 규칙으로 구워졌다.
  GPT R&D(`462b4acc`)가 이 기본값을 카드 없이 "표기 없는 붙은 음 = 재발음" 으로 바꿨다 — 그 규칙은
  **지우지 않고** 옵션으로 남긴다(`ARTICULATION_CONTRACT` · 기본 끔). 옳은지는 재민 판정(#70)이고,
  켜는 것은 이 파일 한 자리다. 켜면 `render_jeongak.py` 도 같이 켜진다(같은 스위치를 읽는다).
"""
import numpy as np
from gugak import *   # noqa
import gugak as G
import compose as C
import sampler as S
import score_village_day as SC
from motif import sigim
from articulation import SLUR
from render_articulation import (XFADE as CONTRACT_XFADE, articulation_render_options,
                                 plan_sustained_score)

PYE = [0, 2, 5, 7, 9]
ROOT = dict(dae=67, dan=79, piri=67, gaya=55, geo=43)

XFADE = 0.070                              # 이어 부는 자리에서 앞뒤 음이 맞물리는 길이(초)
SMOOTH, ALPHA, LIM2_DB = 0.70, 0.95, 12.0  # 잔물결 깎기: 자 길이 · 세기 · 한계
RIDE, ENTRY = {}, []

# ★[T391] GPT R&D 의 명시-연음 계약("무표기 붙은 음 = 재발음 · 명시 slur 만 이음") — **기본 끔**.
#   False 면 위 머리말의 배포 규칙(450c6e44)으로 굽는다. True 면 `_play_contract` 가 모든 play() 를 받고
#   build() 는 `plan_sustained_score` 로 대금 계획을 짠다(=`462b4acc` 판 그대로). #70 이 켜면 이 한 자리.
ARTICULATION_CONTRACT = False


def dmidi(root, deg):
    o, i = divmod(int(deg), 5)
    return root + 12 * o + PYE[i]


# ─────────────────────────────────────────── 음량 흐름 다듬기
def ride_levels(sub, notes, win=0.030, floor_db=-58.0, max_db=9.0,
                strength=0.85, k=5, ramp=0.030, report=None):
    """음마다 크기를 재서 **이웃과 어울리는 크기**로 되돌리고, 남은 잔물결을 훑는다.

    1단계 — 앞 음에 뒷 음을 맞추는 식(사슬)은 쓰지 않는다. 그러면 첫 음이 곡
    전체의 기준이 되고 보정값이 계속 곱해져 한계에 붙어 버린다(실제로 그랬다).
    대신 **이웃 5개의 중앙값**을 목표로 삼는다. 크레셴도 같은 느린 흐름은
    중앙값도 따라가므로 살아남고, 한 음만 튀는 것은 눌린다.

    2단계 — 음마다 크기를 맞춰도 경계에서는 여전히 튄다. 한 음 안에서도 앞뒤가
    다르기 때문이다. 그래서 음이 아니라 **시간**을 본다. 0.7초 자로 문지른
    느린 흐름을 목표로 잡고 그보다 빠른 잔물결만 깎는다.
    """
    x = np.abs(sub.dry).max(axis=0).astype(np.float64)
    n = len(x)
    w = int(win * G.SR)
    env = np.sqrt(np.convolve(x * x, np.ones(w) / w, mode="same"))
    ref = float(env.max()) * 10 ** (floor_db / 20)
    if ref <= 1e-12:                       # 이 층이 통째로 꺼져 있다 (스템 뽑는 중)
        return np.ones(n, np.float64)
    lim = 10 ** (max_db / 20)

    def med(t0, t1):
        a, b = max(0, int(t0 * G.SR)), min(n, int(t1 * G.SR))
        return float(np.median(env[a:b])) if b > a + 8 else 0.0

    L = np.array([med(st + 0.035, min(en - 0.015, st + 0.32)) for (st, en, _) in notes])
    ok = L > ref
    T = np.array([np.median([L[j] for j in range(max(0, i - k // 2),
                                                 min(len(L), i + k // 2 + 1)) if ok[j]]
                            or [L[i]]) for i in range(len(L))])
    gi = np.where(ok, np.clip((T / np.maximum(L, 1e-12)) ** strength, 1 / lim, lim), 1.0)

    g = np.ones(n, np.float64)
    prev = 1.0
    for i, (st, en, tied) in enumerate(notes):
        i0, i1 = max(0, int((st - ramp) * G.SR)), min(n, int((st + ramp) * G.SR))
        if i1 > i0 + 2:                    # 보정 자체가 계단이 되면 안 된다
            u = 0.5 - 0.5 * np.cos(np.pi * np.linspace(0, 1, i1 - i0))
            g[i0:i1] = prev * (1 - u) + gi[i] * u
        g[i1:] = gi[i]
        prev = gi[i]

    e2 = env * g
    ln = int(SMOOTH * G.SR)
    sm = np.convolve(e2, np.ones(ln) / ln, mode="same")
    lim2 = 10 ** (LIM2_DB / 20)
    gg = np.clip((sm / np.maximum(e2, ref)) ** ALPHA, 1 / lim2, lim2)
    gg = 1.0 + (gg - 1.0) * np.clip(e2 / ref, 0.0, 1.0)      # 쉼표는 건드리지 않는다
    # ★쉬었다가 새로 부는 음의 **어택은 건드리지 않는다.** 숨을 새로 넣는
    #   자리라 빠르게 솟는 게 맞는데, 잔물결로 보고 깎으면 관악기가 아니게 된다.
    keep = np.zeros(n, np.float64)
    for (st, en, tied) in notes:
        if tied:
            continue
        i0, i1 = max(0, int((st - 0.03) * G.SR)), min(n, int((st + 0.20) * G.SR))
        if i1 > i0:
            keep[i0:i1] = 1.0
    gg = 1.0 + (gg - 1.0) * (1.0 - keep)
    lb = int(0.06 * G.SR)
    g = g * np.convolve(gg, np.ones(lb) / lb, mode="same")
    sub.dry *= g.astype(np.float32)
    sub.snd *= g.astype(np.float32)
    if report is not None:
        tie = np.array([t for (_, _, t) in notes])
        m = ok[:-1] & ok[1:] & tie[1:]
        if m.any():
            b0 = np.abs(20 * np.log10(L[1:][m] / L[:-1][m]))
            b1 = np.abs(20 * np.log10((L[1:] * gi[1:])[m] / (L[:-1] * gi[:-1])[m]))
            report.update(n=int(m.sum()), med0=float(np.median(b0)),
                          med1=float(np.median(b1)), max0=float(b0.max()),
                          max1=float(b1.max()), big0=int((b0 > 3).sum()),
                          big1=int((b1 > 3).sum()))
    return g


def play(mix, fn, root, bar_notes, t0, sobak, inst, gain, pan, send,
         gaya=False, cadence_last=True, seed=0, legato=0.94, ncy=None,
         tie_first=False, first_src=None, tail_ring=0.45, log=None, jeongak=False,
         articulation_plans=None, following_plan=None):
    """한 장단을 분다/뜯는다. ★[T391] 기본은 배포판 규칙(`450c6e44`) — 아래 본문이 그 판 그대로다.

    `ARTICULATION_CONTRACT` 가 켜져 있거나 호출자가 `articulation_plans` 를 **명시**하면
    GPT R&D 의 명시-연음 계약(`_play_contract`)으로 넘긴다. 명시한 호출자는 계약을 고른 것이다.
    """
    if ARTICULATION_CONTRACT or articulation_plans is not None:
        return _play_contract(mix, fn, root, bar_notes, t0, sobak, inst, gain, pan, send,
                              gaya=gaya, cadence_last=cadence_last, seed=seed, legato=legato,
                              ncy=ncy, tie_first=tie_first, first_src=first_src,
                              tail_ring=tail_ring, log=log, jeongak=jeongak,
                              articulation_plans=articulation_plans,
                              following_plan=following_plan)
    rng = np.random.default_rng(seed)
    kn, kb = ("nonghyeon", "bend") if gaya else ("vib_cents", "bend_end")
    prev, seen = None, {}
    n = len(bar_notes)
    # ★장단이 바뀌어도 숨은 이어진다. play() 는 장단마다 따로 불리므로
    #   여기서 이어 주지 않으면 장단머리마다 다시 부는 꼴이 된다.
    prev_end = bar_notes[0][0] if (tie_first and bar_notes) else None
    if tie_first:
        G.LAST_SRC = first_src
    bar_art = bar_nong = None              # 그 악구를 대표하는 시김새 — 가장 긴 음이 정한다
    if bar_notes and not gaya:
        _, dl, gl = max(bar_notes, key=lambda x: x[1])
        bar_nong, _, bar_art = sigim("pyeongjo", gl, dl, "mid", None, False, inst)
        if bar_art == "nong_deep" and dl < 4.0:      # 깊은 농현은 4소박 넘는 음에만
            bar_art, bar_nong = "nong_shallow", min(bar_nong, 14.0)
    for i, (s, d, g) in enumerate(bar_notes):
        role = "cadence" if (cadence_last and i == n - 1) else "mid"
        rep = seen.get(g, 0) > 0
        seen[g] = seen.get(g, 0) + 1
        nong, bend, art = sigim("pyeongjo", g, d, role, prev, rep, inst)
        # ★시김새를 음마다 바꾸면 안 된다. 흔들다가 갑자기 곧게 뻗으면 같은
        #   악기가 아닌 것처럼 들린다. 한 악구 안에서는 하나로 간다(맺음만 예외).
        if role != "cadence" and bar_art is not None:
            art, nong = bar_art, bar_nong
        # ★정악은 산조처럼 깊게 흔들지 않는다. 농현(±100센트, 5Hz)을 걷어내고
        #   **요성**(얕고 느린 떨림)만 남긴다. 맺음에서만 퇴성으로 끌어내린다.
        if jeongak and not gaya:
            # ★없는 주법을 부르면 안 된다. 대금이 가진 것은
            #   지속음·얕은농현·깊은농현·시김새·스타카토 뿐이라 '퇴성' 을
            #   부르면 엉뚱한 조각으로 떨어진다(실측: 붙든 구간 80ms 짜리를
            #   골라 -51dBFS). 퇴성은 bend_end 로 만들고 주법은 지속음으로 둔다.
            art = "sus"
            nong = 8.0
            bend = bend if role == "cadence" else 0.0
        prev = g
        kw = {kn: nong, kb: bend, "seed": int(rng.integers(1 << 20))}
        if jeongak:
            kw["vib_rate"], kw["vib_delay"] = 3.0, 0.45   # 느리게, 늦게 걸린다
        if art:
            kw["art"] = art
        # ★앞 음이 바로 앞에서 끝났으면 **이어 분다** — 어택을 지우고 겹쳐 넣는다.
        tie = prev_end is not None and (s - prev_end) < 0.05 and not gaya
        if tie:
            kw["legato"] = XFADE
            kw["prefer_src"] = getattr(G, "LAST_SRC", None)
        # ★뒤에 바로 다음 음이 오면 **넘겨준다.** 여운 0.9초를 두면 두 음이
        #   겹쳐 들리고, 22ms 로 바짝 자르면 반대로 구멍이 뚫린다(실측 무음 20ms).
        nxt = bar_notes[i + 1][0] if i + 1 < n else (ncy if ncy else None)
        cont = nxt is not None and (nxt - (s + d)) < 0.05
        # 악구의 마지막 음은 뒤에 가릴 것이 없다 — 여운을 길게 준다.
        kw["ring"] = XFADE if cont else (0.9 if gaya else
                                         (tail_ring if i == n - 1 else 0.45))
        ln = d * sobak * (1.0 if cont else legato)   # 이어지는 자리는 적힌 길이 그대로
        y = fn(G.mtof(dmidi(root, g)), ln, 1.0, **kw)
        if log is not None:
            log.append((getattr(G, "LAST_ENTRY", "head"), getattr(G, "LAST_SKIP", 0.0)))
        mix.add(y, t0 + s * sobak + rng.normal(0, 0.003 if tie else 0.007),
                gain, pan, send)
        prev_end = s + d
    return getattr(G, "LAST_SRC", None)


def _play_contract(mix, fn, root, bar_notes, t0, sobak, inst, gain, pan, send,
                   gaya=False, cadence_last=True, seed=0, legato=0.94, ncy=None,
                   tie_first=False, first_src=None, tail_ring=0.45, log=None, jeongak=False,
                   articulation_plans=None, following_plan=None):
    """Render one monophonic bar under the explicit articulation contract.

    ★[T391] GPT R&D(`462b4acc`)의 play() 본문 그대로 — 기본 경로가 아니다(`ARTICULATION_CONTRACT`).
    바뀐 것은 이름과 `XFADE`→`CONTRACT_XFADE`(render_articulation 의 값) 뿐이다.

    ``tie_first`` is retained only as a source-compatible argument for older
    callers.  It is deliberately no longer a timing-derived legato switch.
    Supply ``articulation_plans`` (from :func:`plan_sustained_score`) when a
    caller needs an explicit cross-bar slur.  Without it, the compact tuple
    score is planned locally and every unmarked adjacent note re-articulates.
    """
    rng = np.random.default_rng(seed)
    kn, kb = ("nonghyeon", "bend") if gaya else ("vib_cents", "bend_end")
    prev, seen = None, {}
    n = len(bar_notes)
    if articulation_plans is None:
        articulation_plans, _unused_levels = plan_sustained_score([bar_notes], t0, sobak)
        articulation_plans = articulation_plans[0]
    else:
        articulation_plans = list(articulation_plans)
    if len(articulation_plans) != n:
        raise ValueError(
            f"{inst}: expected one articulation plan per bar note, got "
            f"{len(articulation_plans)} plans for {n} notes"
        )

    # ``first_src`` may inform an actually marked cross-bar slur.  It cannot
    # turn a touching bar boundary into one by itself.
    previous_source = first_src if articulation_plans and articulation_plans[0]["kind"] == SLUR else None
    bar_art = bar_nong = None              # 그 악구를 대표하는 시김새 — 가장 긴 음이 정한다
    if bar_notes and not gaya:
        _, dl, gl = max(bar_notes, key=lambda x: x[1])
        bar_nong, _, bar_art = sigim("pyeongjo", gl, dl, "mid", None, False, inst)
        if bar_art == "nong_deep" and dl < 4.0:      # 깊은 농현은 4소박 넘는 음에만
            bar_art, bar_nong = "nong_shallow", min(bar_nong, 14.0)
    for i, (s, d, g) in enumerate(bar_notes):
        plan = articulation_plans[i]
        next_plan = (articulation_plans[i + 1] if i + 1 < n else following_plan)
        supports_sample_entry = bool(getattr(fn, "_supports_explicit_sample_entry", False))
        role = "cadence" if (cadence_last and i == n - 1) else "mid"
        rep = seen.get(g, 0) > 0
        seen[g] = seen.get(g, 0) + 1
        nong, bend, art = sigim("pyeongjo", g, d, role, prev, rep, inst)
        # ★시김새를 음마다 바꾸면 안 된다. 흔들다가 갑자기 곧게 뻗으면 같은
        #   악기가 아닌 것처럼 들린다. 한 악구 안에서는 하나로 간다(맺음만 예외).
        if role != "cadence" and bar_art is not None:
            art, nong = bar_art, bar_nong
        # ★정악은 산조처럼 깊게 흔들지 않는다. 농현(±100센트, 5Hz)을 걷어내고
        #   **요성**(얕고 느린 떨림)만 남긴다. 맺음에서만 퇴성으로 끌어내린다.
        if jeongak and not gaya:
            # ★없는 주법을 부르면 안 된다. 대금이 가진 것은
            #   지속음·얕은농현·깊은농현·시김새·스타카토 뿐이라 '퇴성' 을
            #   부르면 엉뚱한 조각으로 떨어진다(실측: 붙든 구간 80ms 짜리를
            #   골라 -51dBFS). 퇴성은 bend_end 로 만들고 주법은 지속음으로 둔다.
            art = "sus"
            nong = 8.0
            bend = bend if role == "cadence" else 0.0
        prev = g
        kw = {kn: nong, kb: bend, "seed": int(rng.integers(1 << 20))}
        if jeongak:
            kw["vib_rate"], kw["vib_delay"] = 3.0, 0.45   # 느리게, 늦게 걸린다
        # ``art`` is sample-bank metadata, not a parameter of the bare
        # synthesis fallback.  The same capability marker gates it and the
        # explicit head/steady entry policy below.
        if art and supports_sample_entry:
            kw["art"] = art

        # ★시간이 맞닿았다는 사실은 연음 표기가 아니다. 오직 canonical plan의
        # 명시 slur만 실제 샘플의 steady body + crossfade를 요청한다.
        opts = articulation_render_options(
            plan, next_plan, d * sobak,
            tail_ring=(0.9 if gaya else (tail_ring if i == n - 1 else 0.45)),
        )
        if opts["legato"] > 0 and not gaya and supports_sample_entry:
            kw["legato"] = CONTRACT_XFADE
            if previous_source is not None:
                kw["prefer_src"] = previous_source
        # A sampler wrapper advertises this only after it has been installed.
        # The bare synthesis functions deliberately do not receive an unknown
        # keyword; they still honour the same no-implicit-legato timeline.
        if supports_sample_entry and not gaya:
            kw["entry_mode"] = opts["entry_mode"]
            kw["ring"] = opts["ring"]
        # The bare synthesis fallback has its release inside ``dur`` and no
        # ``ring`` parameter. Keep its physical end at the same score time
        # without pretending it has a recorded steady-body entry.
        ln = opts["duration"] if supports_sample_entry else opts["duration"] + opts["ring"]
        y = fn(G.mtof(dmidi(root, g)), ln, 1.0, **kw)
        if log is not None:
            log.append((getattr(G, "LAST_ENTRY", "head"), getattr(G, "LAST_SKIP", 0.0),
                        plan["kind"], opts["release_inside_score"]))
        # Score-boundary performance semantics must not be undone by random
        # onset jitter.  Humanisation belongs inside the recorded/expressive
        # source, not in a ±7 ms accidental fake slur.
        mix.add(y, t0 + s * sobak,
                gain, pan, send)
        previous_source = getattr(G, "LAST_SRC", None)
    return getattr(G, "LAST_SRC", None)


def build(spec=None):
    sob, nsb = SC.SOBAK, SC.NCY_S
    dur = SC.NBAR * nsb * sob + 4.0
    mix = G.Mix(dur, tail=3.5)
    dae = G.Mix(dur, tail=3.5)      # 대금만 따로 받는다 — 음량 흐름을 다듬어 합친다
    rv = G.Reverb(dur=2.6, decay=1.5, pre=0.015, damp=2400, seed=11, width=0.85)

    def bt(b):
        return b * nsb * sob

    if ARTICULATION_CONTRACT:
        # [GPT R&D · 옵션] 대금의 연결을 시간 창으로 추정하지 않는다. 점수표에 slur/tie를
        # 명시한 자리만 `notes`의 true가 되고, 4장단 악구 시작은 새 숨이다.
        # 기본 score에는 확정한 slur가 없으므로 "표기 없음 = 재발음"이 된다(#70 판정 전).
        phrase_starts = tuple(range(0, SC.NBAR, 4))
        dae_plans, notes = plan_sustained_score(
            SC.MELODY, 0.0, sob,
            annotations=getattr(SC, "DAEGEUM_ARTICULATION", {}),
            phrase_start_bars=phrase_starts,
        )
    else:
        # 대금 음마다 (시작, 끝, 앞 음에 바로 이어지는가) — 장단을 넘어서도 이어진다.
        # ★악구를 맺은 다음 자리는 이어지는 자리가 아니다. 맺음음은 끌어내리며
        #   잦아들고 다음 악구는 새로 시작한다. 거기까지 다리면 악구가 없어진다.
        notes, tie0, _pe, _cad = [], [], None, False
        for b, bar in enumerate(SC.MELODY):
            cad = (b % 4 == 3 or b == SC.NBAR - 1)
            for j, (s, d, gg) in enumerate(bar):
                st = bt(b) + s * sob
                t = _pe is not None and st - _pe < 0.02 and not _cad
                if j == 0:
                    tie0.append(t)
                notes.append((st, st + d * sob, t))
                _pe = st + d * sob
                _cad = cad and j == len(bar) - 1

    ENTRY.clear()
    dsrc = None
    for b, bar in enumerate(SC.MELODY):
        lvl = 0.66 if b < SC.NBAR - 2 else (0.52 if b == SC.NBAR - 2 else 0.36)
        if ARTICULATION_CONTRACT:
            following = dae_plans[b + 1][0] if b + 1 < len(dae_plans) and dae_plans[b + 1] else None
            dsrc = play(dae, daegeum, ROOT["dae"], bar, bt(b), sob, "daegeum",
                        gain=lvl, pan=0.10, send=0.34, seed=100 + b, ncy=nsb,
                        cadence_last=(b % 4 == 3 or b == SC.NBAR - 1),
                        first_src=dsrc, log=ENTRY, articulation_plans=dae_plans[b],
                        following_plan=following)
        else:
            dsrc = play(dae, daegeum, ROOT["dae"], bar, bt(b), sob, "daegeum",
                        gain=lvl, pan=0.10, send=0.34, seed=100 + b, ncy=nsb,
                        cadence_last=(b % 4 == 3 or b == SC.NBAR - 1),
                        tie_first=tie0[b], first_src=dsrc, log=ENTRY)
        for s, d, g in SC.GAYA[SC.GAYA_PLAN[b]]:
            nong, bend, art = sigim("pyeongjo", g, d, "mid", None, False, "gayageum")
            y = gayageum(G.mtof(dmidi(ROOT["gaya"], g)), d * sob, 1.0,
                         art=art, nonghyeon=nong, bend=bend, seed=700 + b * 9 + int(s))
            mix.add(y, bt(b) + s * sob - G.LAST_ANCHOR, 0.44, -0.20, 0.30)
        if SC.GEO_ON[b]:
            for i, (s, d, g) in enumerate(SC.GEO):
                art = ("sulgidung", "jeonseong")[(b + i) % 2]
                y = geomungo(G.mtof(dmidi(ROOT["geo"], g)), d * sob, 1.0,
                             art=art, vib_cents=14.0, seed=800 + b * 5 + i)
                # ★거문고는 저음이라 소리가 서는 데 100ms 가 걸린다. 앞머리를
                #   박에 놓으면 장구보다 89ms 늦게 들린다(실측). 그만큼 당긴다.
                mix.add(y, bt(b) + s * sob - G.LAST_ANCHOR, 0.42, 0.24, 0.26)
        if b in SC.DANSO:
            play(mix, danso, ROOT["dan"], SC.DANSO[b], bt(b), sob, "danso",
                 gain=0.36, pan=0.34, send=0.42, seed=300 + b, tail_ring=1.35)
        if b in SC.PIRI_BARS:
            play(mix, piri, ROOT["piri"], SC.PIRI_BARS[b], bt(b), sob, "piri",
                 gain=0.26, pan=-0.34, send=0.40, seed=400 + b, cadence_last=False,
                 ncy=nsb, tail_ring=1.35)
        g = SC.DRUM[b]
        if g > 0:
            C.play_jangdan(mix, "gutgeori", bt(b), sob, gain=g, seed=500 + b,
                           drum="janggu" if g > 0.5 else "soft",
                           humanize=0.011, swing=0.0, send=0.28)
    RIDE.clear()
    ride_levels(dae, notes, report=RIDE)
    mix.dry += dae.dry
    mix.snd += dae.snd
    mix.add(G.wind(dur, 0.040, seed=7), 0.0, 1.0, 0.0, 0.10)
    mix.add(G.water(dur, 0.030, seed=8), 0.0, 1.0, 0.30, 0.10)
    return mix.render(rv, wet=1.0, target_db=-16.0, loop=False)


if __name__ == "__main__":
    import os
    from collections import Counter
    bank = S.Bank([r for r in ["samples_gaya", "samples_daegeum", "samples_piri",
                               "samples_danso", "samples_geomungo", "samples_janggu"]
                   if os.path.exists(os.path.join(r, "_index.json"))])
    import sys
    S.install(bank, [C, sys.modules[__name__]])
    use = {}
    op = S.Bank._pick

    def pick(self, inst, midi, rr, dur=0.5, amp=1.0, art=None, prefer_src=None):
        g = op(self, inst, midi, rr, dur=dur, amp=amp, art=art, prefer_src=prefer_src)
        if g:
            use.setdefault(inst, {})
            a = g[2].get("art")
            use[inst][a] = use[inst].get(a, 0) + 1
        return g
    S.Bank._pick = pick
    y = build()
    S.Bank._pick = op
    G.write_wav("out_samples/village_day_score.wav", y)
    m = y.mean(0) if y.ndim > 1 else y
    print(f"국악기판 {len(m)/G.SR:.1f}초 · 음 {sum(sum(d.values()) for d in use.values())}개")
    for inst, d in sorted(use.items(), key=lambda x: -sum(x[1].values())):
        print(f"  {inst:12s}{sum(d.values()):5d}  " +
              " · ".join(f"{S.ART_NAME_KO.get(k,k)}{v}" for k, v in
                         sorted(d.items(), key=lambda x: -x[1])[:5]))
    # ENTRY now retains the canonical articulation kind and release policy in
    # addition to the historical (entry, skip) pair.  Keep this CLI summary
    # deliberately positional-tolerant so renderer metadata can grow without
    # turning a successful WAV render into a post-render unpacking failure.
    # ★[T391] 기본 경로는 옛 (entry, skip) 두 칸, 계약 경로는 네 칸 — 이 요약은 둘 다 읽는다.
    ec = Counter(item[0] for item in ENTRY)
    sk = np.array([item[1] for item in ENTRY if item[0] == "mid"])
    print(f"\n대금 진입점  조각 앞머리(숨 새로) {ec.get('head',0)}음"
          f" · 조각 중간(이어 불기) {ec.get('mid',0)}음")
    if len(sk):
        print(f"  중간 진입 지점  중앙 {np.median(sk)*1000:.0f}ms  "
              f"최대 {sk.max()*1000:.0f}ms   0ms(=못 뗀 것) {int((sk<0.005).sum())}음")
    if RIDE:
        print(f"\n대금 음 경계 {RIDE['n']}곳 레벨 계단"
              f"  중앙 {RIDE['med0']:.2f} → {RIDE['med1']:.2f}dB"
              f"  최대 {RIDE['max0']:.1f} → {RIDE['max1']:.1f}dB"
              f"  3dB 넘는 곳 {RIDE['big0']} → {RIDE['big1']}")
