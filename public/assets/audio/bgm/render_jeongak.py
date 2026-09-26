"""
render_jeongak.py — 같은 악보를 **정악풍**으로.

대금·가야금 모두 **진짜 정악 악기 녹음**이다.
  정악대금  jungak_deageum 5파일 → 조각 113개 (국악원에서 새로 받음)
  정악가야금 jungak_gayageum 7파일 → 조각 100개
정악·산조를 가르는 것이 음색만이 아니라 연주법이므로, 아래를 바꾼다.

  빠르기   소박 0.395 → 0.50초. 한 장단 4.74 → 6.0초. 정악은 느리다.
  시김새   깊은 농현(±100센트·5Hz)을 걷어내고 **요성**(±8센트·3Hz)만.
           맺음에서만 퇴성으로 끌어내린다.
  호흡     여운을 길게. 악구 끝은 1.35 → 2.0초.
  장단     굴림(더러러러)을 뺀다. 정악 장단은 잔가락이 적다. 세기도 낮춘다.
  음색     손대지 않는다. 진짜 정악대금 녹음이라 기울일 이유가 없다.

★[T391 2026-09-26] 대금 이음 규칙의 기본은 배포판을 구운 것(`450c6e44`)이다 — 산조판과 같은
  "붙은 음은 이어 분다". GPT R&D 의 "무표기 = 재발음" 계약은 `render_score.ARTICULATION_CONTRACT`
  (기본 끔 · #70)가 켤 때만 탄다. 스위치는 그 한 자리다.
"""
import numpy as np
import scipy.signal as sps
from gugak import *   # noqa
import gugak as G
import compose as C
import sampler as S
import score_village_day as SC
from motif import sigim
import render_score as RS      # ★[T391] 스위치(`RS.ARTICULATION_CONTRACT`)는 부를 때 읽는다 — 한 자리에서 켠다
from render_score import (play, ride_levels, dmidi, ROOT, RIDE, ENTRY,
                          plan_sustained_score)

SOB = 0.500          # 정악은 느리다 (산조판 0.395)
TAIL = 2.0           # 악구 끝 여운

# 굴림(r)을 뺀 정악풍 장단 — 잔가락을 덜고 큰 타점만
C.JANGDAN["gutgeori_jeong"] = (12, [
    (0, "G", 1.00), (3, "g", 0.62), (6, "g", 0.74), (9, "g", 0.54)])
C.TEMPO["gutgeori_jeong"] = (SOB, 0.00)


def dark(y, sr=None):
    """관이 긴 악기 쪽으로 음색을 기울인다 — 저역 +3dB, 고역 -4dB. EQ다."""
    sr = sr or G.SR
    b1, a1 = sps.butter(2, 520 / (sr / 2), btype="low")
    b2, a2 = sps.butter(2, 3400 / (sr / 2), btype="high")
    lo = sps.lfilter(b1, a1, y, axis=-1)
    hi = sps.lfilter(b2, a2, y, axis=-1)
    return (y + 0.42 * lo - 0.37 * hi).astype(np.float32)


def build(spec=None):
    sob, nsb = SOB, SC.NCY_S
    dur = SC.NBAR * nsb * sob + 5.0
    mix = G.Mix(dur, tail=4.0)
    dae = G.Mix(dur, tail=4.0)
    rv = G.Reverb(dur=2.6, decay=1.5, pre=0.015, damp=2400, seed=11, width=0.85)

    def bt(b):
        return b * nsb * sob

    # ★[T391] 기본은 배포판 규칙(`450c6e44`) — 산조판(render_score)과 같은 이음 규칙.
    #   GPT R&D 의 명시-연음 계약은 `render_score.ARTICULATION_CONTRACT` 가 켤 때만(#70 · 기본 끔).
    contract = RS.ARTICULATION_CONTRACT
    if contract:
        # The same authorial articulation map serves both Sanjo and Jeongak
        # renderers.  Tempo/style can differ; adjacent timestamps still cannot
        # manufacture an unmarked slur in either version.
        dae_plans, notes = plan_sustained_score(
            SC.MELODY, 0.0, sob,
            annotations=getattr(SC, "DAEGEUM_ARTICULATION", {}),
            phrase_start_bars=tuple(range(0, SC.NBAR, 4)),
        )
    else:
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
        if contract:
            following = dae_plans[b + 1][0] if b + 1 < len(dae_plans) and dae_plans[b + 1] else None
            dsrc = play(dae, daegeum, ROOT["dae"], bar, bt(b), sob, "daegeum",
                        gain=lvl, pan=0.10, send=0.34, seed=100 + b, ncy=nsb,
                        cadence_last=(b % 4 == 3 or b == SC.NBAR - 1),
                        first_src=dsrc, log=ENTRY, articulation_plans=dae_plans[b],
                        following_plan=following,
                        tail_ring=TAIL, jeongak=True)
        else:
            dsrc = play(dae, daegeum, ROOT["dae"], bar, bt(b), sob, "daegeum",
                        gain=lvl, pan=0.10, send=0.34, seed=100 + b, ncy=nsb,
                        cadence_last=(b % 4 == 3 or b == SC.NBAR - 1),
                        tie_first=tie0[b], first_src=dsrc, log=ENTRY,
                        tail_ring=TAIL, jeongak=True)
        # ★가야금만은 진짜 정악 악기다. 산조가야금의 잘게 뜯는 잔가락 대신
        #   성기게 — 정악 반주는 큰 박 머리를 짚고 기다린다.
        for s, d, g in SC.GAYA[0 if SC.GAYA_PLAN[b] < 2 else 1]:
            y = gayageum(G.mtof(dmidi(ROOT["gaya"], g)), d * sob, 1.0,
                         art="sus", nonghyeon=6.0, bend=0.0, vib_rate=3.0,
                         seed=700 + b * 9 + int(s), ring=1.2)
            mix.add(y, bt(b) + s * sob - G.LAST_ANCHOR, 0.50, -0.20, 0.30)
        if SC.GEO_ON[b]:
            for i, (s, d, g) in enumerate(SC.GEO):
                y = geomungo(G.mtof(dmidi(ROOT["geo"], g)), d * sob, 1.0,
                             art="jeonseong", vib_cents=8.0, vib_rate=3.0,
                             seed=800 + b * 5 + i)
                mix.add(y, bt(b) + s * sob - G.LAST_ANCHOR, 0.40, 0.24, 0.26)
        if b in SC.DANSO:
            play(mix, danso, ROOT["dan"], SC.DANSO[b], bt(b), sob, "danso",
                 gain=0.34, pan=0.34, send=0.42, seed=300 + b,
                 tail_ring=TAIL, jeongak=True)
        if b in SC.PIRI_BARS:
            play(mix, piri, ROOT["piri"], SC.PIRI_BARS[b], bt(b), sob, "piri",
                 gain=0.24, pan=-0.34, send=0.40, seed=400 + b, cadence_last=False,
                 ncy=nsb, tail_ring=TAIL, jeongak=True)
        g = SC.DRUM[b]
        if g > 0:
            C.play_jangdan(mix, "gutgeori_jeong", bt(b), sob, gain=g * 0.62,
                           seed=500 + b, drum="soft", humanize=0.010,
                           swing=0.0, send=0.30)
    RIDE.clear()
    ride_levels(dae, notes, report=RIDE)
    # ★음색 보정(dark)은 산조대금으로 정악대금을 흉내낼 때 쓰던 것이다.
    #   이제 진짜 정악대금 녹음이 있으므로 걸지 않는다.
    mix.dry += dae.dry
    mix.snd += dae.snd
    mix.add(G.wind(dur, 0.040, seed=7), 0.0, 1.0, 0.0, 0.10)
    mix.add(G.water(dur, 0.026, seed=8), 0.0, 1.0, 0.30, 0.10)
    return mix.render(rv, wet=1.0, target_db=-16.0, loop=False)


if __name__ == "__main__":
    import sys, os
    from collections import Counter
    import os
    dae = "samples_jdae" if os.path.exists("samples_jdae/_index.json") else "samples_daegeum"
    bank = S.Bank(["samples_jgaya", dae, "samples_piri",
                   "samples_danso", "samples_geomungo", "samples_janggu"])
    print("대금 음원:", dae)
    S.install(bank, [C, sys.modules[__name__]])
    y = build()
    os.makedirs("out_samples", exist_ok=True)
    G.write_wav("out_samples/village_day_jeongak.wav", y)
    # See render_score: ENTRY carries articulation metadata beyond its
    # historical (entry, skip) pair, so the CLI summary must not unpack it as
    # a fixed 2-tuple.  ★[T391] 기본 경로는 두 칸, 계약 경로는 네 칸 — 둘 다 읽는다.
    ec = Counter(item[0] for item in ENTRY)
    print(f"정악풍 {y.shape[1]/G.SR:.1f}초 · 한 장단 {12*SOB:.2f}초")
    print(f"  대금 진입점  앞머리 {ec.get('head',0)} · 중간 {ec.get('mid',0)}")
    print(f"  가야금 = 정악가야금 (조각 {len(bank.by_inst['gayageum'])}개)")
    if RIDE:
        print(f"  대금 경계 레벨 계단 중앙 {RIDE['med0']:.2f} → {RIDE['med1']:.2f}dB"
              f"  최대 {RIDE['max0']:.1f} → {RIDE['max1']:.1f}dB")
