"""
arirang.py — 본조 아리랑 선율을 얹은 장면별 BGM

원본 악보(8notes, Trad. Korean, G장조 3/4, 16마디)를 음표 검출로 옮겨 적었다.
쓰인 음은 D5 E5 G5 A5 B5 D6 뿐 — 즉 sol la do re mi 의 5음계라
기존 트랙의 국악 편성에 그대로 얹힌다.

서양식 화성 진행(G-Em-D-C)은 따르지 않는다. 국악에는 기능 화성이 없고,
반주는 do·sol 을 중심으로 한 5음계 지속음과 뜯음으로 짠다.

3/4 한 마디 = 세마치 한 장단(3대박 × 3소박) 로 정확히 대응시킨다.
"""
import numpy as np
from gugak import *   # noqa
from compose import (JANGDAN, play_jangdan, Melodist, PYEONGJO, GYEMYEONJO,
                     deg_midi, dg)

# ------------------------------------------------------------------ 선율
# 5음계 인덱스 n:  do=0 기준.  반음 = 12*(n//5) + [0,2,4,7,9][n%5]
#   -2=sol(아래)  -1=la(아래)  0=do  1=re  2=mi  3=sol(위)
ARI_PENTA = [0, 2, 4, 7, 9]


def ari_midi(do, n):
    o, i = divmod(n, 5)
    return do + 12 * o + ARI_PENTA[i]


def ari_f(do, n):
    return mtof(ari_midi(do, n))


# (마디 안 박 위치, 길이(박), 음) — 3/4 이므로 한 마디 3박
_M1 = [(0.0, 1.5, -2), (1.5, 0.5, -1), (2.0, 0.5, -2), (2.5, 0.5, -1)]
_M2 = [(0.0, 1.5, 0), (1.5, 0.5, 1), (2.0, 0.5, 0), (2.5, 0.5, 1)]
_M3 = [(0.0, 1.0, 2), (1.0, 0.5, 1), (1.5, 0.5, 2), (2.0, 0.5, 0), (2.5, 0.5, -1)]
_M6 = [(0.0, .5, 2), (.5, .5, 1), (1.0, .5, 0), (1.5, .5, -1), (2.0, .5, -2), (2.5, .5, -1)]
_M7 = [(0.0, 1.5, 0), (1.5, 0.5, 1), (2.0, 1.0, 0)]

ARIRANG = [
    _M1,                                   # 1  아 - 리 - 랑
    _M2,                                   # 2  아 - 리 - 랑
    _M3,                                   # 3  아 라 리 요
    _M1,                                   # 4  아 - 리 - 랑
    _M2,                                   # 5  고 개 로
    _M6,                                   # 6  넘 어 간 다
    _M7,                                   # 7
    [(0.0, 2.0, 0)],                       # 8  (+ 4분쉼표)
    [(0.0, 2.0, 3), (2.0, 1.0, 3)],        # 9  나 를 버 리 고 — 높은 sol
    [(0.0, 1.0, 3), (1.0, 1.0, 2), (2.0, 1.0, 1)],   # 10
    _M3,                                   # 11 가 시 는 님 은
    _M1,                                   # 12
    _M2,                                   # 13 십 리 도 못 가 서
    _M6,                                   # 14 발 병 난 다
    _M7,                                   # 15
    [(0.0, 3.0, 0)],                       # 16
]
NBAR = len(ARIRANG)

# 마디별 반주 근음(5음계 인덱스). 화성 진행이 아니라 선율의 무게중심을 따라간다.
ARI_BASS = [0, 0, -1, -2, 0, -1, 0, 0, 0, 0, -1, -2, 0, -1, 0, 0]


def ornament(bar, rng, level=1.0):
    """
    시김새. level 0=본가락, 1=한 겹, 2=촘촘히.
      · 긴 음 앞에 잔가락(윗음 스침)
      · 프레이즈 끝 음에 퇴성(끌어내림)
      · 같은 음 반복 구간에 추성(밀어올림)
    """
    if level <= 0:
        return [(t, d, n, 0, 0) for (t, d, n) in bar]
    out = []
    for k, (t, d, n) in enumerate(bar):
        last = (k == len(bar) - 1)
        bend = 0
        grace = None
        if d >= 1.5 and rng.random() < 0.55 * level:
            grace = (t, 0.16, n + 1)              # 윗음을 스치고 내려앉기
        elif d >= 1.0 and rng.random() < 0.30 * level:
            grace = (t, 0.14, n - 1)              # 아래에서 밀어올리기(추성)
        if last and d >= 1.0 and rng.random() < 0.6 * level:
            bend = -40
        if grace:
            gt, gd, gn = grace
            out.append((gt, gd, gn, 0, 1))
            out.append((gt + gd, d - gd, n, bend, 0))
        else:
            out.append((t, d, n, bend, 0))
    return out


def bar_events(bar_i, rng, level):
    """마디 하나 → [(박위치, 길이, 음, 퇴성센트, 잔가락여부)]"""
    return ornament(ARIRANG[bar_i % NBAR], rng, level)


# ------------------------------------------------------------------ 공통 조립기
def build_arirang(root_do, beat, passes, plan, rv, target_db=-14.5,
                  eq=None, bed=None, wet=0.9, jangdan_name="semachi",
                  drum_gain=0.6, seed=0):
    """
    root_do : 아리랑 do 의 MIDI 번호
    beat    : 한 박(대박) 길이(초). 소박 = beat/3
    passes  : [절 설정 dict, ...] — 절마다 편성이 달라진다
    plan    : 마디별 추가 배치 콜백 (mix, t0, bar, p, rng) 또는 None
    """
    sob = beat / 3.0
    bar_len = 3 * beat
    dur = NBAR * bar_len * len(passes)
    mix = Mix(dur, tail=5.0)
    rng = np.random.default_rng(seed)
    acc = root_do - 24                      # 반주 저역 기준

    for pi, P in enumerate(passes):
        for b in range(NBAR):
            t0 = (pi * NBAR + b) * bar_len

            # --- 장단
            if P.get("drum", 1.0) > 0:
                play_jangdan(mix, jangdan_name, t0, sob,
                             gain=drum_gain * P["drum"], seed=1000 + pi * 37 + b,
                             drum="janggu" if P.get("drum", 1) >= 0.8 else "soft",
                             send=P.get("dsend", 0.3), swing=P.get("swing", 0.10))
            if P.get("buk") and b % P["buk"] == 0:
                mix.add(buk(1.1, 0.5 * P.get("drum", 1),
                            seed=int(rng.integers(1 << 20))), t0, 1.0, 0.12, 0.22)
            if P.get("kkwaeng") and b % 2 == 0:
                mix.add(kkwaenggwari(0.9, 0.30 * P.get("drum", 1),
                                     seed=int(rng.integers(1 << 20))),
                        t0, 1.0, 0.45, 0.26)

            # --- 거문고 근음
            bass = ARI_BASS[b]
            if P.get("bass", True) and b % P.get("bass_every", 1) == 0:
                mix.add(geomungo(ari_f(acc, bass), bar_len * 0.9,
                                 0.46 * P.get("bass_amp", 1.0),
                                 seed=int(rng.integers(1 << 20))),
                        t0, 1.0, -0.34, 0.30)

            # --- 가야금 반주
            gp = P.get("gaya")
            if gp:
                pat = gp["pat"]
                for i, (pos, dn) in enumerate(pat):
                    mix.add(gayageum(ari_f(acc + 12, bass + dn), gp.get("len", 1.6),
                                     gp["amp"] * (1.0 if i == 0 else 0.85),
                                     nonghyeon=14 if i == 0 else 0,
                                     seed=int(rng.integers(1 << 20))),
                            t0 + pos * beat + rng.normal(0, 0.012), 1.0,
                            gp.get("pan", 0.30), 0.34)

            # --- 본가락
            for lead in P["leads"]:
                inst = lead["inst"]
                oct_ = lead.get("oct", 0)
                lvl = lead.get("orn", 1.0)
                for (bt, bd, n, bend, is_grace) in bar_events(b, rng, lvl):
                    f = ari_f(root_do + 12 * oct_, n)
                    ln = bd * beat * lead.get("legato", 0.95)
                    amp = lead["amp"] * (0.55 if is_grace else 1.0)
                    kw = dict(seed=int(rng.integers(1 << 20)))
                    if inst is daegeum:
                        kw.update(vib_cents=lead.get("vib", 34) if bd >= 1 else 18,
                                  vib_delay=0.20 if bd >= 1 else 0.34,
                                  bend_end=bend)
                    elif inst is danso:
                        kw.update(vib_cents=lead.get("vib", 22), bend_end=bend)
                    elif inst is piri:
                        kw.update(vib_cents=lead.get("vib", 28), vib_delay=0.10,
                                  bend_end=bend)
                    elif inst is gayageum:
                        kw = dict(seed=kw["seed"], nonghyeon=lead.get("vib", 18),
                                  bend=bend * 0.6)
                        ln = max(ln, 1.4)
                    mix.add(inst(f, ln, amp, **kw),
                            t0 + bt * beat, 1.0, lead.get("pan", -0.18),
                            lead.get("send", 0.44))

            if plan:
                plan(mix, t0, b, P, rng, beat)

    if bed:
        bed(mix, dur, rng)
    return mix.render(rv, wet=wet, target_db=target_db, eq=eq)


# =================================================================== 곡
def village_day_ari(S):
    """마을 낮 · 아리랑 — 세마치, 대금 본가락 + 가야금 뜯음."""
    rv = Reverb(dur=2.8, decay=1.6, pre=0.016, damp=4200, seed=103)
    GA = dict(pat=[(0, 0), (0.5, 2), (1, 4), (1.5, 2), (2, 3), (2.5, 4)],
              amp=0.30, len=1.5, pan=0.30)
    passes = [
        dict(drum=0.75, swing=0.14, gaya=GA, bass_every=2, bass_amp=0.9,
             leads=[dict(inst=daegeum, amp=0.66, orn=0.6, vib=30)]),
        dict(drum=1.0, swing=0.16, gaya=GA, buk=4, bass_every=1,
             leads=[dict(inst=daegeum, amp=0.72, orn=1.2, vib=36),
                    dict(inst=gayageum, amp=0.26, orn=0, oct=1, pan=0.40, send=0.5)]),
        dict(drum=0.9, swing=0.14, gaya=GA, bass_every=2,
             leads=[dict(inst=daegeum, amp=0.66, orn=1.0, vib=34),
                    dict(inst=danso, amp=0.30, orn=0.4, oct=1, pan=0.44, send=0.52)]),
    ]

    def bed(mix, dur, rng):
        mix.add(wind(dur, 0.40, seed=71), 0, 1.0, 0.05, 0.2)
        mix.add(water(dur, 0.30, seed=72), 0, 1.0, -0.45, 0.28)
    return build_arirang(root_do=72, beat=0.72, passes=passes, plan=None,
                         rv=rv, target_db=-14.8, bed=bed, drum_gain=0.62, seed=11)


def village_night_ari(S):
    """마을 밤 · 아리랑 — 아주 느리게, 대금 저취. 2절은 단소가 받는다."""
    rv = Reverb(dur=4.4, decay=3.0, pre=0.028, damp=2700, seed=107)
    GA = dict(pat=[(0, 0), (1.5, 4)], amp=0.26, len=3.4, pan=0.34)
    passes = [
        dict(drum=0.34, swing=0.0, dsend=0.5, gaya=GA, bass_every=2, bass_amp=0.9,
             leads=[dict(inst=daegeum, amp=0.60, orn=0.8, vib=42, legato=0.9,
                         send=0.55)]),
        dict(drum=0.28, swing=0.0, dsend=0.55, gaya=GA, bass_every=2, bass_amp=0.8,
             leads=[dict(inst=danso, amp=0.42, orn=1.3, vib=24, oct=1,
                         pan=-0.28, send=0.6),
                    dict(inst=daegeum, amp=0.30, orn=0, vib=44, pan=0.22, send=0.6)]),
    ]

    def bed(mix, dur, rng):
        mix.add(crickets(dur, 1.5, seed=73), 0, 1.0, 0.3, 0.2)
        mix.add(wind(dur, 0.55, seed=74, lo=100, hi=900), 0, 1.0, -0.25, 0.25)
        for t0 in [3.0, dur * 0.52]:
            mix.add(jing(6.5, 0.26, base=104, seed=int(rng.integers(1 << 20))),
                    t0, 1.0, 0.45, 0.7)
    return build_arirang(root_do=60, beat=1.26, passes=passes, plan=None,
                         rv=rv, target_db=-18.4, bed=bed, drum_gain=0.5, wet=1.0,
                         eq=dict(hpf=44, low_db=-5.0, air_db=4.5), seed=13)


def battle_ari(S):
    """전투 · 아리랑 — 몰아치는 3박. 피리가 본가락을 찢고, 북·꽹과리가 민다."""
    rv = Reverb(dur=1.8, decay=1.0, pre=0.009, damp=5000, seed=109)
    GA = dict(pat=[(0, 0), (1, 4), (2, 2)], amp=0.26, len=1.1, pan=0.28)
    passes = [
        dict(drum=0.85, swing=0.0, dsend=0.18, gaya=GA, buk=1, bass_every=1,
             leads=[dict(inst=daegeum, amp=0.52, orn=0.4, vib=26, send=0.26)]),
        dict(drum=1.0, swing=0.0, dsend=0.18, gaya=GA, buk=1, kkwaeng=True,
             bass_every=1,
             leads=[dict(inst=piri, amp=0.46, orn=0.9, vib=30, send=0.26),
                    dict(inst=daegeum, amp=0.26, orn=0, oct=-1, pan=0.25, send=0.3)]),
        dict(drum=1.0, swing=0.0, dsend=0.18, gaya=GA, buk=1, kkwaeng=True,
             bass_every=1,
             leads=[dict(inst=piri, amp=0.50, orn=1.4, vib=34, send=0.26),
                    dict(inst=piri, amp=0.22, orn=0, oct=1, pan=0.42, send=0.34)]),
        dict(drum=0.9, swing=0.0, dsend=0.2, gaya=GA, buk=2, bass_every=1,
             leads=[dict(inst=daegeum, amp=0.54, orn=0.7, vib=30, send=0.3)]),
    ]

    def plan(mix, t0, b, P, rng, beat):
        # 높은 sol 대목(9~10마디)에 징 한 방
        if b == 8:
            mix.add(jing(3.6, 0.42, base=126, seed=int(rng.integers(1 << 20))),
                    t0, 1.0, 0.3, 0.3)
        # 마디 끝 채편 잔가락
        if P.get("kkwaeng") and b % 4 == 3:
            for k in range(3):
                mix.add(janggu_chae(0.26, 0.22, seed=int(rng.integers(1 << 20))),
                        t0 + 2 * beat + k * beat / 3, 1.0, (rng.random() - .5), 0.3)
    return build_arirang(root_do=72, beat=0.555, passes=passes, plan=plan,
                         rv=rv, target_db=-12.8, wet=0.62, drum_gain=0.95,
                         eq=dict(hpf=42, low_db=-5.5, pres_db=3.2, air_db=4.5), seed=17)


def journey_ari(S):
    """원정 · 아리랑 — 걷는 세마치. 가야금 아르페지오 위에 대금이 간다."""
    rv = Reverb(dur=3.4, decay=2.3, pre=0.02, damp=3500, seed=113)
    GA = dict(pat=[(0, 0), (0.5, 2), (1.0, 4), (1.5, 2), (2.0, 4), (2.5, 3)],
              amp=0.30, len=1.3, pan=0.32)
    passes = [
        dict(drum=0.55, swing=0.12, gaya=GA, bass_every=2, bass_amp=0.9,
             leads=[dict(inst=daegeum, amp=0.64, orn=0.5, vib=28)]),
        dict(drum=0.75, swing=0.12, gaya=GA, bass_every=1, buk=8,
             leads=[dict(inst=daegeum, amp=0.70, orn=1.1, vib=32),
                    dict(inst=danso, amp=0.26, orn=0, oct=1, pan=0.44, send=0.5)]),
        dict(drum=0.7, swing=0.12, gaya=GA, bass_every=2,
             leads=[dict(inst=daegeum, amp=0.66, orn=0.9, vib=30),
                    dict(inst=gayageum, amp=0.24, orn=0, pan=-0.42, send=0.5)]),
    ]

    def plan(mix, t0, b, P, rng, beat):
        if b == 0:
            mix.add(jing(4.5, 0.26, base=132, seed=int(rng.integers(1 << 20))),
                    t0, 1.0, 0.35, 0.42)

    def bed(mix, dur, rng):
        mix.add(wind(dur, 0.60, seed=75, lo=160, hi=2100), 0, 1.0, 0.05, 0.25)
    return build_arirang(root_do=72, beat=0.62, passes=passes, plan=plan,
                         rv=rv, target_db=-14.6, bed=bed, drum_gain=0.6, seed=19)


ARI_TRACKS = {
    "village_day_ari":   dict(fn=village_day_ari,   title="마을 낮 · 아리랑",
                              scene="village_day", mood="ari"),
    "village_night_ari": dict(fn=village_night_ari, title="마을 밤 · 아리랑",
                              scene="village_night", mood="ari"),
    "battle_ari":        dict(fn=battle_ari,        title="전투 · 아리랑",
                              scene="battle", mood="ari"),
    "journey_ari":       dict(fn=journey_ari,       title="원정 · 아리랑",
                              scene="journey", mood="ari"),
}


if __name__ == "__main__":
    import sys, os, time, json
    outdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
    os.makedirs(outdir, exist_ok=True)
    names = sys.argv[1:] or list(ARI_TRACKS)
    mpath = os.path.join(outdir, "meta_ari.json")
    meta = json.load(open(mpath)) if os.path.exists(mpath) else {}
    for name in names:
        spec = ARI_TRACKS[name]
        t0 = time.time()
        y = spec["fn"](spec)
        write_wav(os.path.join(outdir, name + ".wav"), y)
        rms = float(np.sqrt(np.mean(y ** 2)))
        meta[name] = dict(title=spec["title"], scene=spec["scene"], mood=spec["mood"],
                          seconds=round(y.shape[1] / SR, 3),
                          rms_db=round(float(20 * np.log10(rms + 1e-9)), 2),
                          peak_db=round(float(20 * np.log10(np.max(np.abs(y)) + 1e-9)), 2))
        print(f"{name:20s} {meta[name]['seconds']:7.2f}s  rms {meta[name]['rms_db']:6.2f}dB  "
              f"peak {meta[name]['peak_db']:6.2f}dB  ({time.time()-t0:.1f}s)")
    json.dump(meta, open(mpath, "w"), ensure_ascii=False, indent=1)
