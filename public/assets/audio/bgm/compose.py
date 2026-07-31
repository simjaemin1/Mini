"""
compose.py — 장면별 BGM 작곡/렌더링

장면 4 × 분위기 2 = 8곡.
  village_day / village_night / battle / journey  ×  trad(전통색) / amb(앰비언트)

음계는 평조(0,2,5,7,9) · 계면조(0,3,5,7,10) 5음계,
리듬은 굿거리 · 중중모리 · 자진모리 · 세마치 · 진양조 장단을 쓴다.
"""
import numpy as np
from gugak import *   # noqa
import gugak as G

# ------------------------------------------------------------------ 음계
PYEONGJO = [0, 2, 5, 7, 9]        # 평조 (황 태 중 임 남)
GYEMYEONJO = [0, 3, 5, 7, 10]     # 계면조 (황 협 중 임 무)


def deg_midi(root, mode, deg):
    o, i = divmod(deg, len(mode))
    return root + 12 * o + mode[i]


def dg(root, mode, deg):
    return mtof(deg_midi(root, mode, deg))


# ------------------------------------------------------------------ 장단
# (소박 위치, 타법, 세기).
#   G=덩(양손)  g=쿵(궁편)  c=덕(채편 단타)  d=더(채편 여리게)
#   i=기덕(채편 겹채)  r=더러러러(채편 굴림)  b=북  k=꽹과리
#
# ★기덕과 더러러러는 '덕을 여러 번 치는 것' 이 아니라 손목 한 번에 나오는
#   **하나의 주법**이다. 국악원 녹음에 둘 다 따로 들어 있는데도 예전 판은
#   덕을 0.5소박 간격으로 두세 번 찍어 흉내내고 있었다 — 주석엔 '기덕' 이라
#   써 놓고 실제로는 덕 두 개였다. 이제 그 녹음을 그대로 쓴다.
JANGDAN = {
    # ── 굿거리 12소박 (3소박 4박) — 덩기덕 / 쿵 더러러러 / 쿵기덕 / 쿵 더러러러
    #    서울대 논문(이보형)의 기본형은 "덩-기덕 / 궁기덕기덕 / 궁-기덕 / 궁딱-" 로,
    #    4박의 겹가락을 딱(덕)으로 맺는 갈래다. 여기서는 위키백과 형(4박도 굴림)을 쓴다.
    #    ★박마다 첫 소박에 무게가 실리는 AA형이라는 점이 핵심이다.
    "gutgeori": (12, [
        # 더러러러는 **강** 녹음을 쓴다. 굿거리의 굴림은 장식이 아니라
        # 박을 밀고 가는 손이라, 여린 굴림으로는 장단이 서지 않는다.
        # (_pick 은 세기 0.72 이상을 '강' 으로 읽는다)
        (0, "G", 1.00), (2, "i", 0.46), (3, "g", 0.72), (4, "r", 0.80),
        (6, "g", 0.86), (8, "i", 0.46), (9, "g", 0.62), (10, "r", 0.78),
    ]),
    # ── 중중모리 12소박 — 덩-딱 / 궁-딱 / 궁궁척 / 궁--
    #    (이보형, 3소박 느린 4박자 장단 연구. 전반 A · 후반 B 의 AB형)
    "jungjungmori": (12, [
        (0, "G", 1.00), (2, "c", 0.42), (3, "g", 0.66), (5, "c", 0.40),
        (6, "g", 0.78), (7, "g", 0.52), (8, "c", 0.46), (9, "g", 0.60),
    ]),
    # ── 세마치 9소박 (3소박 3박) — 덩 덩 덕 쿵 덕
    #    ★2박 머리도 '덩'(양손)이다. 예전에는 쿵(궁편)으로 쳐서 뼈대가 약했다.
    "semachi": (9, [
        (0, "G", 1.00), (3, "G", 0.78), (5, "c", 0.46),
        (6, "g", 0.66), (8, "c", 0.42),
    ]),
    # ── 자진모리 12소박 — 덩 쿵 덩 따궁딱
    "jajinmori": (12, [
        (0, "G", 1.00), (3, "g", 0.78), (6, "G", 0.92),
        (9, "c", 0.62), (10, "g", 0.70), (11, "d", 0.58),
    ]),
    # ── 휘모리 8소박 (2소박 4박) — 덩 덩 쿵덕 쿵
    #    ★2박도 덩이다. 예전 판은 덩 덕 쿵 덕 더 로, 위키백과 구음과 달랐다.
    "hwimori": (8, [
        (0, "G", 1.00), (2, "G", 0.82), (4, "g", 0.76), (5, "c", 0.60),
        (6, "g", 0.66),
    ]),
    # ── 진양조 24소박 — 6박 한 각 × 4각.
    #    1각은 합장단만 두고 비운다("첫 각을 쭉 쉬어주다가 맺는다").
    "jinyang": (24, [
        (0, "G", 1.00),
        (6, "g", 0.62), (8, "c", 0.40), (10, "g", 0.50),
        (12, "G", 0.76), (15, "c", 0.38),
        (18, "g", 0.58), (20, "c", 0.36), (22, "r", 0.30),
    ]),
}


# 타법마다 (주법, 차지하는 길이[소박], 여운[초]).
# 굴림은 길다 — 국악원 녹음은 8타가 1.72초에 걸쳐 점점 빨라진다.
# 그래서 여운을 짧게 끊어 다음 박(쿵)을 넘어가지 않게 한다.
STROKE_ART = {"c": ("sus", 0.40, 0.90), "d": ("soft", 0.40, 0.90),
              "i": ("double", 0.70, 0.90), "r": ("roll", 2.00, 0.25)}

# 각 장단이 곡에서 실제로 도는 속도 — (소박 길이[초], 스윙).
# 장단은 이름이 아니라 **속도가 정체**다. 굿거리를 자진모리 속도로 치면
# 굿거리가 아니다. 시연 화면도 반드시 이 표를 써야 곡과 같은 것이 들린다.
# ★스윙은 0 이다. 굿거리·중중모리는 이미 **3소박** 장단이라 셋잇단 자체가 흔들림이다.
#   거기에 또 스윙을 얹으면(예전 판 0.28) 각 박의 셋째 소박이 55ms 씩 밀려
#   박이 어긋나 들린다. 논문·위키 어느 쪽도 굿거리를 고르지 않은 소박으로 적지 않는다.
TEMPO = {"gutgeori":     (0.395, 0.00),   # 한 주기 4.74초
         "jungjungmori": (0.340, 0.00),   #        4.08초
         "semachi":      (0.235, 0.00),   #        2.12초
         "jajinmori":    (0.155, 0.00),   #        1.86초
         "hwimori":      (0.132, 0.00),   #        1.06초
         "jinyang":      (0.300, 0.00)}   #        7.20초 — 가장 느리다


def play_jangdan(mix, name, t0, sobak, gain=1.0, seed=0, drum="janggu",
                 pan=-0.12, send=0.30, humanize=0.012, swing=0.0):
    """장단 한 주기를 믹스에 찍는다."""
    ncy, pat = JANGDAN[name]
    rng = np.random.default_rng(seed)
    # 각 타점이 다음 타점까지 비워 두는 자리(소박). 굴림은 이 자리를 다 쓴다.
    gap = [min(3.0, (pat[i + 1][0] if i + 1 < len(pat) else ncy) - pat[i][0])
           for i in range(len(pat))]
    for (pos, kind, v), room in zip(pat, gap):
        # 삼소박 스윙(굿거리 계열의 밀고 당김)
        sw = swing * (0.5 if (pos % 3) == 2 else 0.0)
        at = t0 + (pos + sw) * sobak + rng.normal(0, humanize)
        v = v * (1 + rng.normal(0, 0.06))
        # ★세기(v)를 악기에 그대로 넘긴다.
        #   예전에는 항상 amp=1.0 으로 부르고 볼륨만 줄였는데, 그러면 샘플러가
        #   늘 '강' 녹음을 골라 크기만 작아진 소리가 났다. 여린 장구는 센 장구를
        #   줄인 게 아니라 어택 자체가 다른 소리다.
        if kind == "G":
            # 덩 = 양손 동시. 국악원에 실제 '덩' 녹음이 있으므로 두 손을 겹쳐
            # 흉내내지 않고 그대로 쓴다(없으면 궁+채로 자동 대체된다).
            mix.add(janggu_gung(0.85, v, seed=int(rng.integers(1 << 20)), art="both"),
                    at, gain * gain_of(drum, "g"), pan * 1.2, send)
        elif kind == "g":
            mix.add(janggu_gung(0.85, v, seed=int(rng.integers(1 << 20))),
                    at, gain * gain_of(drum, "g"), pan * 1.2, send)
        if kind in STROKE_ART:
            art, beats, ring = STROKE_ART[kind]
            # 굴림은 다음 타점까지의 자리를 다 쓴다 — 그래야 녹음의 '빨라진 대목'
            # 을 그만큼 끌어와 굴림으로 들린다. 나머지 타법은 정해진 길이대로.
            if kind == "r":
                beats = max(beats, room)
            y = janggu_chae(max(0.30, beats * sobak), v, ring=ring,
                            seed=int(rng.integers(1 << 20)), art=art)
            # ★겹채(기덕)는 '기'(앞꾸밈)+'덕'(본타)이라, 파일 앞머리를 박에 놓으면
            #   정작 본타가 93~145ms 늦게 떨어진다. 소박 395ms 짜리 굿거리에서
            #   그건 3분의 1박이 밀리는 것이다. 본타가 박에 오도록 그만큼 당긴다.
            # ★굴림은 에너지가 여러 타에 퍼져서, 같은 세기로 쳐도 단타보다
            #   훨씬 작게 들린다(실측 -14.9dB). 그만큼 올려 줘야 장단이 선다.
            lv = 3.0 if kind == "r" else 1.0
            mix.add(y, at - G.LAST_ANCHOR, gain * gain_of(drum, "c") * lv, -pan * 1.6, send)
        if kind == "b":
            mix.add(buk(1.2, seed=int(rng.integers(1 << 20))), at, gain * v, pan, send)
        if kind == "k":
            mix.add(kkwaenggwari(1.0, seed=int(rng.integers(1 << 20))), at, gain * v, -pan, send)


def gain_of(drum, head):
    if drum == "janggu":
        return 1.0
    if drum == "soft":
        return 0.55 if head == "g" else 0.40
    return 1.0


# ------------------------------------------------------------------ 선율 생성
class Melodist:
    """5음계 위를 걷는 선율 생성기. 프레이즈 은행을 만들어 재사용/변주한다."""

    def __init__(self, mode, seed, lo=-3, hi=8, center=2):
        self.mode = mode
        self.rng = np.random.default_rng(seed)
        self.lo, self.hi, self.center = lo, hi, center

    def phrase(self, n_sobak, density=0.62, start=None, cadence=True,
               dur_pool=(1, 1.5, 2, 3, 4, 6), long_bias=0.0):
        r = self.rng
        cur = self.center if start is None else start
        notes = []
        t = 0.0
        while t < n_sobak - 0.4:
            remain = n_sobak - t
            pool = [d for d in dur_pool if d <= remain + 0.01]
            if not pool:
                break
            w = np.array([d ** (0.55 + long_bias) for d in pool], float)
            w /= w.sum()
            d = float(r.choice(pool, p=w))
            if r.random() > density:            # 쉼
                t += d
                continue
            # 진행: 대체로 순차, 가끔 도약, 프레이즈 끝은 안정음
            if cadence and t + d >= n_sobak - 0.5:
                cur = min(self.hi, max(self.lo, round(cur / 5) * 5))  # 으뜸/옥타브
            else:
                step = int(r.choice([-2, -1, -1, 0, 1, 1, 2, 3, -3],
                                    p=[.08, .21, .16, .06, .21, .12, .08, .04, .04]))
                cur = int(np.clip(cur + step, self.lo, self.hi))
            notes.append((t, d, cur))
            t += d
        return notes

    def vary(self, notes, amount=0.4):
        r = self.rng
        out = []
        for (t, d, n) in notes:
            if r.random() < amount:
                n = int(np.clip(n + r.choice([-1, 1, 2, -2]), self.lo, self.hi))
            if r.random() < amount * 0.4:
                d = max(1.0, d + r.choice([-1, 1]))
            out.append((t, d, n))
        return out


# ------------------------------------------------------------------ 곡 조립기
def render_track(spec):
    """spec 딕셔너리를 받아 스테레오 float32 를 돌려준다."""
    fn = spec["fn"]
    return fn(spec)


# =================================================================== 마을 낮
def village_day_trad(S):
    root, mode = 55, PYEONGJO          # G 평조 — 산조가야금 12현에 그대로 얹힌다
    sobak = 0.395
    cyc_sobak = 12
    cycle = cyc_sobak * sobak          # 4.74s
    ncy = 23                           # ≈ 109s
    dur = ncy * cycle
    mix = Mix(dur, tail=4.0)
    rv = Reverb(dur=2.6, decay=1.45, pre=0.016, damp=4200, seed=3)
    mel = Melodist(mode, 11, lo=-1, hi=9, center=3)

    bank = [mel.phrase(24, 0.60), mel.phrase(24, 0.55, long_bias=0.3),
            mel.phrase(24, 0.66), mel.phrase(24, 0.5, long_bias=0.5)]
    rng = np.random.default_rng(101)

    # 루프이므로 빈 도입부를 두지 않는다. 밀도만 완만히 오르내린다.
    # 0-3 A(성김) / 4-11 B(가득) / 12-15 간주(소금 응답) / 16-22 A'(가득)
    for c in range(ncy):
        t0 = c * cycle
        dens = 0.72 if (c < 4 or 12 <= c < 16) else 1.0
        play_jangdan(mix, "gutgeori", t0, sobak,
                     gain=0.62 * dens, seed=200 + c,
                     drum="janggu" if dens > 0.9 else "soft", swing=0.28)
        # 가야금 오스티나토 (2소박마다 뜯기)
        if True:
            g = 0.60 if dens < 0.9 else 0.72
            # 한 옥타브 안에서 순차로 움직인다. 예전 식(steps[i%5]%10-5)은
            # A#2~G4 를 21반음씩 뛰어다녀 악기 음역을 벗어나고, 1.9초 울림이
            # 4~5개씩 겹쳐 배경이 웅웅거렸다.
            steps = [0, 2, 4, 2, 5, 4, 2, 0] if c % 4 < 2 else [0, 3, 5, 3, 6, 5, 3, 0]
            for i, s in enumerate([0, 2, 3, 5, 6, 8, 9, 11]):
                deg = steps[i] - 2
                f = dg(root, mode, deg)
                mix.add(gayageum(f, 1.15, 0.62 * g, nonghyeon=(16 if i % 3 == 0 else 0),
                                 seed=int(rng.integers(1 << 20))),
                        t0 + s * sobak + rng.normal(0, .012), 1.0, 0.30, 0.34)
        # 저음 지속 (거문고 근음)
        if c % 4 == 0:
            mix.add(geomungo(dg(root - 12, mode, 0), 3.4, 0.5,
                             seed=int(rng.integers(1 << 20))), t0, 1.0, -0.35, 0.30)

        # 대금 선율 — 두 주기(24소박) 단위
        if c % 2 == 0 and not (12 <= c < 16) and c < 22:
            idx = (c // 2) % len(bank)
            ph = bank[idx] if (c // 2) < 8 else mel.vary(bank[idx], 0.35)
            for (st, d, n) in ph:
                f = dg(root + 12, mode, n)
                ln = d * sobak * 0.94
                amp = 0.75 * (0.85 + 0.3 * rng.random())
                mix.add(daegeum(f, ln, amp,
                                vib_cents=34 if d >= 3 else 20,
                                vib_delay=0.22 if d >= 3 else 0.35,
                                bend_end=-38 if d >= 4 and rng.random() < .5 else 0,
                                seed=int(rng.integers(1 << 20))),
                        t0 + st * sobak, 1.0, -0.18, 0.42)
        # 소금 응답구 (간주 구간)
        if 12 <= c < 16 and c % 2 == 1:
            ph = mel.phrase(12, 0.55, start=6)
            for (st, d, n) in ph:
                mix.add(danso(dg(root + 12, mode, n + 2), d * sobak * 0.9, 0.5,
                              seed=int(rng.integers(1 << 20))),
                        t0 + st * sobak, 1.0, 0.42, 0.48)
    mix.add(wind(dur, 0.35, seed=9), 0, 1.0, 0.0, 0.15)
    return mix.render(rv, wet=0.85)


def village_day_amb(S):
    root, mode = 55, PYEONGJO
    dur = 112.0
    mix = Mix(dur, tail=5.0)
    rv = Reverb(dur=3.4, decay=2.3, pre=0.022, damp=3200, seed=5)
    rng = np.random.default_rng(77)
    mel = Melodist(mode, 21, lo=0, hi=8, center=3)

    # 패드: 8초마다 화음 교대 (근음-5도)
    chords = [[0, 2, 4], [0, 3, 5], [-1, 1, 3], [0, 2, 4], [1, 3, 5], [0, 2, 4],
              [0, 3, 5], [-1, 2, 4], [0, 2, 4], [0, 1, 3], [0, 2, 4], [0, 2, 5],
              [0, 2, 4], [1, 3, 5]]
    for i, ch in enumerate(chords):
        t0 = i * 8.0
        if t0 > dur:
            break
        for j, deg in enumerate(ch):
            mix.add(pad(dg(root - 12 + (12 if j else 0), mode, deg), 10.5,
                        0.42 * (1.0 if j == 0 else 0.62),
                        cutoff=900 + 260 * j, attack=2.6, release=3.4,
                        seed=int(rng.integers(1 << 20))),
                    t0, 1.0, (-0.3 + 0.3 * j), 0.45)

    # 드문드문 가야금 (하모닉스 느낌으로 밝게)
    t = 3.0
    while t < dur - 1:
        deg = int(rng.choice([0, 2, 4, 5, 7, 9]))
        mix.add(gayageum(dg(root + 12, mode, deg), 3.2, 0.38,
                         nonghyeon=12 if rng.random() < .4 else 0, bright=0.95,
                         seed=int(rng.integers(1 << 20))),
                t, 1.0, float(rng.uniform(-0.5, 0.5)), 0.55)
        t += float(rng.uniform(1.8, 4.6))

    # 단소 긴 음 — 아주 성기게
    t = 12.0
    while t < dur - 6:
        ph = mel.phrase(6, 0.45, dur_pool=(2, 3, 4, 6), long_bias=0.8)
        for (st, d, n) in ph:
            mix.add(danso(dg(root + 12, mode, n), d * 0.62, 0.42,
                          vib_cents=18, seed=int(rng.integers(1 << 20))),
                    t + st * 0.62, 1.0, -0.2, 0.55)
        t += float(rng.uniform(11, 17))

    # 아주 약한 궁편 맥박
    t = 0.0
    while t < dur:
        mix.add(janggu_gung(1.0, 0.20, seed=int(rng.integers(1 << 20))), t, 1.0, -0.1, 0.4)
        t += 4.0
    mix.add(wind(dur, 0.55, seed=4), 0, 1.0, 0.1, 0.25)
    mix.add(water(dur, 0.45, seed=8), 0, 1.0, -0.45, 0.3)
    return mix.render(rv, wet=1.0, target_db=-17.0)


# =================================================================== 마을 밤
def village_night_trad(S):
    root, mode = 45, GYEMYEONJO      # A 계면조(낮게) — 12현에 그대로 얹힌다
    sobak = 0.30
    cycle = 24 * sobak               # 진양조 7.2s
    ncy = 16                         # 115s
    dur = ncy * cycle
    mix = Mix(dur, tail=6.0)
    rv = Reverb(dur=4.2, decay=2.9, pre=0.028, damp=2800, seed=11, width=1.0)
    mel = Melodist(mode, 31, lo=-2, hi=6, center=2)
    rng = np.random.default_rng(303)

    for c in range(ncy):
        t0 = c * cycle
        if c >= 2:
            play_jangdan(mix, "jinyang", t0, sobak, gain=0.34, seed=400 + c,
                         drum="soft", send=0.5)
        # 거문고 근음 — 밤의 바닥
        if c % 2 == 0:
            mix.add(geomungo(dg(root - 12, mode, 0 if c % 4 == 0 else 4), 6.0, 0.46,
                             seed=int(rng.integers(1 << 20))), t0, 1.0, -0.4, 0.4)
        # 가야금: 아주 성긴 뜯음, 농현 깊게
        if c >= 1:
            for s in rng.choice([0, 4, 8, 12, 16, 20], size=3, replace=False):
                deg = int(rng.choice([0, 2, 3, 4, 5, 7]))
                mix.add(gayageum(dg(root, mode, deg), 3.6, 0.5, nonghyeon=26,
                                 bend=-30 if rng.random() < .35 else 0,
                                 seed=int(rng.integers(1 << 20))),
                        t0 + s * sobak, 1.0, 0.34, 0.5)
        # 대금 저취 — 길고 느린 선율
        if c >= 3 and c % 2 == 1:
            ph = mel.phrase(24, 0.42, dur_pool=(3, 4, 6, 8, 12), long_bias=0.9)
            for (st, d, n) in ph:
                mix.add(daegeum(dg(root, mode, n), d * sobak * 0.95, 0.62,
                                vib_cents=42, vib_delay=0.5, breath=0.10,
                                bend_end=-45 if d >= 6 else 0,
                                attack=0.16, release=0.35,
                                seed=int(rng.integers(1 << 20))),
                        t0 + st * sobak, 1.0, -0.16, 0.55)
        # 징 — 8주기마다 한 번, 아주 멀리
        if c % 8 == 4:
            mix.add(jing(6.0, 0.30, seed=int(rng.integers(1 << 20))), t0, 1.0, 0.5, 0.7)
    mix.add(crickets(dur, 1.7, seed=13), 0, 1.0, 0.3, 0.2)
    mix.add(wind(dur, 0.60, seed=17, lo=100, hi=900), 0, 1.0, -0.25, 0.25)
    return mix.render(rv, wet=1.0, target_db=-18.0)


def village_night_amb(S):
    root, mode = 45, GYEMYEONJO
    dur = 118.0
    mix = Mix(dur, tail=7.0)
    rv = Reverb(dur=5.0, decay=3.4, pre=0.03, damp=2400, seed=19)
    rng = np.random.default_rng(909)

    # 낮은 드론 두 겹
    for k, deg in enumerate([0, 4]):
        t = 0.0
        while t < dur:
            L = float(rng.uniform(16, 24))
            mix.add(pad(dg(root - 24 + 12 * k, mode, deg), L + 4, 0.5 - 0.12 * k,
                        cutoff=520 + 200 * k, attack=5.0, release=6.0, saw=0.12,
                        detune=4.0, seed=int(rng.integers(1 << 20))),
                    t, 1.0, -0.2 + 0.4 * k, 0.4)
            t += L
    # 상성 패드 — 화음 이동
    for i, deg in enumerate([2, 3, 2, 4, 1, 2, 3, 0]):
        t0 = i * 14.5
        if t0 > dur:
            break
        mix.add(pad(dg(root, mode, deg), 17.0, 0.34, cutoff=1400, attack=5.5,
                    release=6.5, seed=int(rng.integers(1 << 20))),
                t0, 1.0, float(rng.uniform(-0.4, 0.4)), 0.6)
    # 아주 드문 가야금 한 음
    t = 8.0
    while t < dur - 4:
        mix.add(gayageum(dg(root + 12, mode, int(rng.choice([0, 2, 3, 5, 7]))), 4.2,
                         0.30, nonghyeon=18, bright=0.6,
                         seed=int(rng.integers(1 << 20))),
                t, 1.0, float(rng.uniform(-0.5, 0.5)), 0.65)
        t += float(rng.uniform(6, 13))
    # 단소 숨결
    for t0 in [22, 47, 74, 99]:
        for k, deg in enumerate([4, 2, 0]):
            mix.add(danso(dg(root + 12, mode, deg), 3.4, 0.30, breath=0.20,
                          vib_cents=16, seed=int(rng.integers(1 << 20))),
                    t0 + k * 2.6, 1.0, -0.3, 0.62)
    # 먼 징
    for t0 in [5, 58]:
        mix.add(jing(8.0, 0.22, base=98, seed=int(rng.integers(1 << 20))), t0, 1.0, 0.45, 0.75)
    mix.add(crickets(dur, 1.3, seed=23), 0, 1.0, 0.25, 0.25)
    mix.add(wind(dur, 0.35, seed=29, lo=80, hi=600), 0, 1.0, -0.3, 0.3)
    return mix.render(rv, wet=1.0, target_db=-19.5,
                      eq=dict(hpf=52, low_db=-6.0, air_db=5.0))


# =================================================================== 전투
def battle_trad(S):
    root, mode = 57, GYEMYEONJO      # A 계면조 — 12현에 그대로 얹힌다
    dur_target = 108.0
    mix = Mix(dur_target + 2.0, tail=3.0)   # 실제 길이는 아래에서 맞춤
    rv = Reverb(dur=1.6, decay=0.85, pre=0.008, damp=5200, seed=31)
    rng = np.random.default_rng(555)
    mel = Melodist(mode, 41, lo=-1, hi=8, center=3)

    # 자진모리 → 휘모리 로 조여든다
    t = 0.0
    events = []
    c = 0
    while t < dur_target:
        if c < 14:
            name, sob = "jajinmori", 0.155
        elif c < 22:
            name, sob = "jajinmori", 0.142
        else:
            name, sob = "hwimori", 0.132
        ncy_s = JANGDAN[name][0]
        events.append((t, name, sob, c))
        t += ncy_s * sob
        c += 1
    dur = t
    mix.n = int(dur * SR)

    for (t0, name, sob, c) in events:
        cyc = JANGDAN[name][0] * sob
        heat = min(1.0, 0.35 + c / 16)
        play_jangdan(mix, name, t0, sob, gain=0.95 * heat, seed=700 + c,
                     drum="janggu", pan=-0.16, send=0.18, humanize=0.006)
        # 북 — 대박마다
        for s in range(0, JANGDAN[name][0], 3):
            mix.add(buk(0.9, 0.62 * heat, seed=int(rng.integers(1 << 20))),
                    t0 + s * sob, 1.0, 0.12, 0.2)
        # 꽹과리 — 주기 머리와 뒷박
        if c >= 4:
            mix.add(kkwaenggwari(0.9, 0.44 * heat, seed=int(rng.integers(1 << 20))),
                    t0, 1.0, 0.45, 0.25)
            if c % 2 == 1:
                mix.add(kkwaenggwari(0.7, 0.30 * heat,
                                     seed=int(rng.integers(1 << 20))),
                        t0 + (JANGDAN[name][0] - 2) * sob, 1.0, -0.45, 0.25)
        # 거문고 저음 리프 (오스티나토)
        if c >= 2:
            for i, s in enumerate([0, 3, 6, 9]):
                deg = [0, 0, 3, 2][i] if c % 2 == 0 else [0, 4, 3, 0][i]
                mix.add(geomungo(dg(root - 12, mode, deg), 1.2, 0.55 * heat,
                                 seed=int(rng.integers(1 << 20))),
                        t0 + s * sob, 1.0, -0.3, 0.18)
        # 피리 — 날카로운 선율
        if c >= 6 and c % 2 == 0:
            ph = mel.phrase(JANGDAN[name][0] * 2, 0.72, dur_pool=(1, 1.5, 2, 3, 4))
            for (st, d, n) in ph:
                mix.add(piri(dg(root + 12, mode, n), d * sob * 0.95, 0.55 * heat,
                             vib_cents=26, vib_delay=0.10,
                             seed=int(rng.integers(1 << 20))),
                        t0 + st * sob, 1.0, -0.1, 0.28)
        # 징 — 4주기마다 한 방
        if c % 4 == 0:
            mix.add(jing(3.6, 0.45 * heat, base=126, seed=int(rng.integers(1 << 20))),
                    t0, 1.0, 0.3, 0.3)
    return mix.render(rv, wet=0.6, target_db=-12.5,
                      eq=dict(hpf=42, low_db=-5.5, pres_db=3.2, air_db=4.5))


def battle_amb(S):
    """긴장형: 소리를 줄이고 압력을 높인 잠복/추격용."""
    root, mode = 57, GYEMYEONJO
    dur = 104.0
    mix = Mix(dur, tail=4.0)
    rv = Reverb(dur=2.8, decay=1.9, pre=0.018, damp=3000, seed=37)
    rng = np.random.default_rng(4242)

    # 저역 드론 + 반음 위 불협 층
    mix.add(pad(dg(root - 24, mode, 0), dur + 3, 0.34, cutoff=420, attack=6, release=6,
                saw=0.30, detune=9, seed=1), 0, 1.0, 0.0, 0.25)
    for t0 in [18, 44, 70, 92]:
        mix.add(pad(mtof(deg_midi(root - 12, mode, 0) + 1), 14, 0.20, cutoff=700,
                    attack=4, release=5, seed=int(rng.integers(1 << 20))),
                t0, 1.0, float(rng.uniform(-0.5, 0.5)), 0.5)

    # 심장박동 같은 궁편/북 — 점점 빨라짐
    t, per = 0.0, 1.55
    while t < dur:
        heat = t / dur
        mix.add(buk(1.1, 0.26 + 0.24 * heat, seed=int(rng.integers(1 << 20))),
                t, 1.0, -0.05, 0.28)
        mix.add(janggu_gung(0.7, 0.22 + 0.2 * heat, seed=int(rng.integers(1 << 20))),
                t + per * 0.5, 1.0, 0.1, 0.3)
        per = max(0.85, per * 0.985)
        t += per
    # 채편 자잘한 긴장 — 후반부
    t = dur * 0.45
    while t < dur:
        for k in range(int(rng.integers(2, 5))):
            mix.add(janggu_chae(0.28, 0.24, seed=int(rng.integers(1 << 20))),
                    t + k * 0.115, 1.0, float(rng.uniform(-0.5, 0.5)), 0.35)
        t += float(rng.uniform(1.6, 3.4))
    # 거문고 저현 한 방씩
    t = 6.0
    while t < dur - 2:
        mix.add(geomungo(dg(root - 12, mode, int(rng.choice([0, 3, 4]))), 2.6, 0.42,
                         seed=int(rng.integers(1 << 20))), t, 1.0, -0.35, 0.3)
        t += float(rng.uniform(4.5, 9.0))
    # 피리 비명 같은 짧은 상승 — 드물게
    for t0 in [31, 63, 88]:
        for k, deg in enumerate([2, 3, 5]):
            mix.add(piri(dg(root + 12, mode, deg), 0.5, 0.34, vib_cents=40,
                         seed=int(rng.integers(1 << 20))),
                    t0 + k * 0.34, 1.0, 0.25, 0.45)
    for t0 in [0, 52, 97]:
        mix.add(jing(6.5, 0.34, base=104, seed=int(rng.integers(1 << 20))), t0, 1.0, 0.4, 0.5)
    mix.add(wind(dur, 0.45, seed=43, lo=120, hi=2400), 0, 1.0, 0.0, 0.3)
    return mix.render(rv, wet=0.8, target_db=-15.5,
                      eq=dict(hpf=48, low_db=-8.5, pres_db=3.4, air_db=5.5))


# =================================================================== 원정/이동
def journey_trad(S):
    root, mode = 55, PYEONGJO       # G 평조 — 트인 느낌
    sobak = 0.235
    cyc_sobak = 9                   # 세마치
    cycle = cyc_sobak * sobak       # 2.115s
    ncy = 50                        # ≈ 106s
    dur = ncy * cycle
    mix = Mix(dur, tail=4.5)
    rv = Reverb(dur=3.2, decay=2.2, pre=0.02, damp=3600, seed=47)
    rng = np.random.default_rng(6161)
    mel = Melodist(mode, 51, lo=-1, hi=9, center=3)
    bank = [mel.phrase(18, 0.6), mel.phrase(18, 0.55, long_bias=0.35),
            mel.phrase(18, 0.65), mel.phrase(18, 0.5, long_bias=0.6)]

    for c in range(ncy):
        t0 = c * cycle
        if c >= 3:
            play_jangdan(mix, "semachi", t0, sobak, gain=0.58, seed=800 + c,
                         drum="janggu" if c >= 6 else "soft", send=0.28, swing=0.12)
        # 가야금 아르페지오 — 걷는 보폭
        if c >= 1:
            pat = [0, 2, 4, 2, 5, 4] if c % 4 < 2 else [0, 3, 5, 3, 7, 5]
            for i, s in enumerate([0, 1.5, 3, 4.5, 6, 7.5]):
                mix.add(gayageum(dg(root, mode, pat[i] - 3), 1.5, 0.5,
                                 nonghyeon=14 if i == 0 else 0,
                                 seed=int(rng.integers(1 << 20))),
                        t0 + s * sobak, 1.0, 0.32, 0.36)
        # 거문고 근음 — 두 주기마다
        if c % 2 == 0 and c >= 3:
            deg = [0, 0, 4, 2, 0, 3, 4, 0][(c // 2) % 8]
            mix.add(geomungo(dg(root - 12, mode, deg), 2.6, 0.45,
                             seed=int(rng.integers(1 << 20))), t0, 1.0, -0.36, 0.3)
        # 대금 — 두 주기(18소박) 단위 선율
        if c >= 6 and c % 2 == 0 and c < 48:
            idx = (c // 2) % len(bank)
            ph = bank[idx] if (c // 2) < 12 else mel.vary(bank[idx], 0.4)
            for (st, d, n) in ph:
                mix.add(daegeum(dg(root + 12, mode, n), d * sobak * 0.95, 0.72,
                                vib_cents=30 if d >= 3 else 18,
                                bend_end=-32 if d >= 4 and rng.random() < .4 else 0,
                                seed=int(rng.integers(1 << 20))),
                        t0 + st * sobak, 1.0, -0.18, 0.44)
        # 소금 하모니 — 후반
        if 26 <= c < 44 and c % 4 == 2:
            ph = mel.phrase(9, 0.5, start=6)
            for (st, d, n) in ph:
                mix.add(danso(dg(root + 12, mode, n + 2), d * sobak * 0.9, 0.42,
                              seed=int(rng.integers(1 << 20))),
                        t0 + st * sobak, 1.0, 0.44, 0.5)
        if c % 16 == 0 and c > 0:
            mix.add(jing(4.5, 0.30, base=132, seed=int(rng.integers(1 << 20))),
                    t0, 1.0, 0.35, 0.4)
    mix.add(wind(dur, 0.55, seed=53, lo=160, hi=2000), 0, 1.0, 0.05, 0.25)
    return mix.render(rv, wet=0.9, target_db=-14.5)


def journey_amb(S):
    root, mode = 55, PYEONGJO
    dur = 116.0
    mix = Mix(dur, tail=6.0)
    rv = Reverb(dur=4.4, decay=3.0, pre=0.026, damp=3000, seed=59)
    rng = np.random.default_rng(7373)

    # 걷는 저역 펄스
    t, per = 0.0, 1.0
    while t < dur:
        mix.add(janggu_gung(0.9, 0.30, tune=88, seed=int(rng.integers(1 << 20))),
                t, 1.0, -0.12, 0.35)
        if int(t) % 2 == 1:
            mix.add(janggu_chae(0.3, 0.12, seed=int(rng.integers(1 << 20))),
                    t + 0.5, 1.0, 0.3, 0.4)
        t += per
    # 넓은 패드 — 5도 병행으로 트인 느낌
    for i, deg in enumerate([0, 2, 0, 4, 1, 0, 3, 2, 0, 2]):
        t0 = i * 12.0
        if t0 > dur:
            break
        mix.add(pad(dg(root - 12, mode, deg), 15, 0.40, cutoff=760, attack=4.0,
                    release=5.0, seed=int(rng.integers(1 << 20))), t0, 1.0, -0.25, 0.45)
        mix.add(pad(dg(root, mode, deg + 3), 15, 0.24, cutoff=1400, attack=4.5,
                    release=5.5, seed=int(rng.integers(1 << 20))), t0, 1.0, 0.30, 0.55)
    # 가야금 성긴 아르페지오
    t = 4.0
    while t < dur - 3:
        base = int(rng.choice([0, 2, 3, 5]))
        for k, d in enumerate([0, 2, 4, 3]):
            mix.add(gayageum(dg(root, mode, base + d - 2), 2.6, 0.34, bright=0.8,
                             nonghyeon=10 if k == 3 else 0,
                             seed=int(rng.integers(1 << 20))),
                    t + k * 0.62, 1.0, float(rng.uniform(-0.45, 0.45)), 0.5)
        t += float(rng.uniform(5.5, 10.0))
    # 대금 모티프 — 멀리서
    for t0 in [20, 49, 78, 104]:
        for k, deg in enumerate([4, 2, 3, 0]):
            mix.add(daegeum(dg(root + 12, mode, deg), 2.2, 0.44, vib_cents=26,
                            breath=0.11, seed=int(rng.integers(1 << 20))),
                    t0 + k * 1.9, 1.0, -0.22, 0.6)
    mix.add(wind(dur, 0.75, seed=61, lo=140, hi=2600), 0, 1.0, 0.0, 0.3)
    return mix.render(rv, wet=1.0, target_db=-16.5)


TRACKS = {
    "village_day_trad":   dict(fn=village_day_trad,   title="마을 낮 · 전통",   scene="village_day", mood="trad"),
    "village_day_amb":    dict(fn=village_day_amb,    title="마을 낮 · 앰비언트", scene="village_day", mood="amb"),
    "village_night_trad": dict(fn=village_night_trad, title="마을 밤 · 전통",   scene="village_night", mood="trad"),
    "village_night_amb":  dict(fn=village_night_amb,  title="마을 밤 · 앰비언트", scene="village_night", mood="amb"),
    "battle_trad":        dict(fn=battle_trad,        title="전투 · 전통",     scene="battle", mood="trad"),
    "battle_amb":         dict(fn=battle_amb,         title="전투 · 앰비언트(긴장)", scene="battle", mood="amb"),
    "journey_trad":       dict(fn=journey_trad,       title="원정 · 전통",     scene="journey", mood="trad"),
    "journey_amb":        dict(fn=journey_amb,        title="원정 · 앰비언트",  scene="journey", mood="amb"),
}


if __name__ == "__main__":
    import sys, os, time, json
    outdir = os.path.join(os.path.dirname(__file__), "out")
    os.makedirs(outdir, exist_ok=True)
    names = sys.argv[1:] or list(TRACKS)
    meta = {}
    for name in names:
        spec = TRACKS[name]
        t0 = time.time()
        y = render_track(spec)
        write_wav(os.path.join(outdir, name + ".wav"), y)
        secs = y.shape[1] / SR
        rms = float(np.sqrt(np.mean(y ** 2)))
        meta[name] = dict(title=spec["title"], scene=spec["scene"], mood=spec["mood"],
                          seconds=round(secs, 3),
                          rms_db=round(float(20 * np.log10(rms + 1e-9)), 2),
                          peak_db=round(float(20 * np.log10(np.max(np.abs(y)) + 1e-9)), 2))
        print(f"{name:22s} {secs:7.2f}s  rms {meta[name]['rms_db']:6.2f}dB  "
              f"peak {meta[name]['peak_db']:6.2f}dB  ({time.time()-t0:.1f}s)")
    with open(os.path.join(outdir, "meta.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
