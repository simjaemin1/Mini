"""
gugak.py — 국악기 신디사이저 (numpy/scipy)

청동기 후기 배경 마을 시뮬레이션 게임용 BGM 합성 엔진.
악기: 대금 / 단소 / 가야금 / 장구(궁편·채편) / 북 / 징 / 꽹과리 / 패드 / 바람

모든 악기는 (n,) mono float32 를 돌려주고, 믹서에서 팬/리버브를 건다.
"""
import numpy as np
from scipy import signal as sps

SR = 44100
rng_global = np.random.default_rng(20260729)


# ---------------------------------------------------------------- utils
def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def adsr(n, a, d, s, r, curve=2.0):
    """샘플 수 n 에 맞춘 ADSR. a/d/r 은 초."""
    a = max(1, int(a * SR)); d = max(1, int(d * SR)); r = max(1, int(r * SR))
    if a + d + r > n:
        k = n / (a + d + r + 1e-9)
        a = max(1, int(a * k)); d = max(1, int(d * k)); r = max(1, int(r * k))
    sus = max(0, n - a - d - r)
    env = np.concatenate([
        np.linspace(0, 1, a) ** (1 / curve),
        s + (1 - s) * (np.linspace(1, 0, d) ** curve),
        np.full(sus, s),
        s * (np.linspace(1, 0, r) ** curve),
    ])
    if len(env) < n:
        env = np.pad(env, (0, n - len(env)))
    return env[:n].astype(np.float32)


def expdecay(n, tau, hold=0.0):
    t = np.arange(n) / SR
    e = np.exp(-np.maximum(0.0, t - hold) / tau)
    return e.astype(np.float32)


def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    return sps.lfilter([1 - a], [1, -a], x).astype(np.float32)


def bp(x, lo, hi, order=2):
    lo = max(20.0, lo); hi = min(SR / 2 - 200.0, hi)
    b, a = sps.butter(order, [lo / (SR / 2), hi / (SR / 2)], btype="band")
    return sps.lfilter(b, a, x).astype(np.float32)


def lp(x, fc, order=2):
    b, a = sps.butter(order, min(0.99, fc / (SR / 2)), btype="low")
    return sps.lfilter(b, a, x).astype(np.float32)


def hp(x, fc, order=2):
    b, a = sps.butter(order, min(0.99, fc / (SR / 2)), btype="high")
    return sps.lfilter(b, a, x).astype(np.float32)


def peak_eq(x, f0, q, gain_db):
    """RBJ peaking EQ."""
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    al = np.sin(w0) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w0), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w0), 1 - al / A]
    return sps.lfilter(b, a, x).astype(np.float32)


def low_shelf(x, f0, gain_db, s=0.8):
    A = 10 ** (gain_db / 40); w0 = 2 * np.pi * f0 / SR
    al = np.sin(w0) / 2 * np.sqrt((A + 1 / A) * (1 / s - 1) + 2)
    c = np.cos(w0); sq = 2 * np.sqrt(A) * al
    b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c),
         A * ((A + 1) - (A - 1) * c - sq)]
    a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c),
         (A + 1) + (A - 1) * c - sq]
    return sps.lfilter(b, a, x).astype(np.float32)


def high_shelf(x, f0, gain_db, s=0.8):
    A = 10 ** (gain_db / 40); w0 = 2 * np.pi * f0 / SR
    al = np.sin(w0) / 2 * np.sqrt((A + 1 / A) * (1 / s - 1) + 2)
    c = np.cos(w0); sq = 2 * np.sqrt(A) * al
    b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c),
         A * ((A + 1) + (A - 1) * c - sq)]
    a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c),
         (A + 1) - (A - 1) * c - sq]
    return sps.lfilter(b, a, x).astype(np.float32)


def master_eq(stereo, low_db=-4.5, mud_db=-2.5, pres_db=2.6, air_db=4.0, hpf=38.0):
    """버스 EQ — 저역 정리 + 중고역 존재감 + 공기감."""
    out = np.empty_like(stereo)
    for ch in range(stereo.shape[0]):
        y = hp(stereo[ch], hpf, order=2)
        y = low_shelf(y, 135.0, low_db)
        y = peak_eq(y, 265.0, 0.9, mud_db)
        y = peak_eq(y, 2600.0, 0.8, pres_db)
        y = high_shelf(y, 6200.0, air_db)
        out[ch] = y
    return out


def pitch_warp(x, cents_fn):
    """cents_fn: 길이 n 의 센트 편차 배열 -> 가변 리샘플(비브라토/농현)."""
    n = len(x)
    ratio = 2 ** (cents_fn / 1200.0)
    pos = np.cumsum(ratio)
    pos -= pos[0]
    pos = np.clip(pos, 0, n - 1)
    return np.interp(pos, np.arange(n), x).astype(np.float32)


def soft_clip(x, drive=1.0):
    return np.tanh(x * drive).astype(np.float32)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


# 방금 연주한 음원의 '본타' 가 파일 시작에서 얼마나 뒤인지(초).
# 겹채(기덕)처럼 앞꾸밈이 붙은 타법은 이만큼 당겨 놓아야 박에 맞는다.
LAST_ANCHOR = 0.0
# 방금 쓴 음원 파일. 이어 부는 다음 음이 같은 녹음을 고르게 한다.
LAST_SRC = None
LAST_ENTRY = "head"   # 마지막 음이 조각의 앞머리에서 났나 중간에서 났나
LAST_SKIP = 0.0       # 그때 앞에서 떼어낸 길이(초)


# ---------------------------------------------------------------- 리버브
# 전체 잔향 세기. 곡마다 정해 둔 wet 값에 이걸 곱한다.
#   0.00 = 잔향 없음 (마른 소리 그대로)
#   0.08 = 살짝 (잔향이 마른 소리보다 약 23dB 작음)
#   0.30 = 예전 판을 고친 직후 수준 (약 11dB 작음)
# 예전 판은 여기 개념 자체가 없었고, 임펄스 응답을 봉우리로 정규화해
# 잔향이 마른 소리보다 **+15.8dB 컸다** — 소리가 제 잔향에 파묻혀 있었다.
WET_SCALE = 0.0


def make_ir(dur=2.6, decay=1.5, pre=0.012, damp=4200.0, seed=7, width=1.0):
    """합성 임펄스 응답 (스테레오). 초기 반사 + 지수감쇠 노이즈 테일."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    out = np.zeros((2, n), np.float32)
    for ch in range(2):
        tail = rng.normal(0, 1, n).astype(np.float32)
        env = np.exp(-np.arange(n) / (decay * SR))
        # 고역이 먼저 죽도록 2밴드 감쇠.
        # ★고역을 훨씬 세게 눌러야 '방' 이지, 안 그러면 '치익' 하는 잡음이다.
        #   예전 판은 9kHz 까지 열어 두고 0.5 로 섞어 꼬리 중심주파수가 3430Hz,
        #   4kHz 위 에너지가 35% 였다 — 장구 몸통(100~400Hz)과 무관한 흰 잡음.
        #   5kHz·0.15 로 낮추면 중심 1659Hz, 4kHz 위 6% 가 된다.
        hi = lp(tail * env * np.exp(-np.arange(n) / (decay * 0.35 * SR)), 5000)
        lo = lp(tail * env, damp)
        t = (lo + 0.15 * hi)
        # 초기 반사
        er = np.zeros(n, np.float32)
        for k in range(14):
            d = int((pre + rng.uniform(0.004, 0.075)) * SR)
            if d < n:
                er[d] += rng.uniform(0.25, 0.75) * (-1) ** k
        t = t + er * 0.8
        p = int(pre * SR)
        t = np.concatenate([np.zeros(p, np.float32), t[:-p]])
        out[ch] = t
    # 좌우 상관 낮추기
    out[1] = out[1] * width + out[0] * (1 - width)
    # ★봉우리가 아니라 **에너지**로 맞춘다.
    #   봉우리로 맞추면(예전 판) 1.8초짜리 잡음 꼬리의 에너지 합이 ∑ir²=1269 이 되어
    #   잔향을 통과시키는 것만으로 진폭이 36배 커진다. 그래서 wet=0.30 이
    #   '30% 섞기' 가 아니라 마른 소리보다 **+15.8dB 큰** 잡음 구름이 됐다.
    #   장구가 제 잔향 밑에 파묻혀 '치익' 소리만 남았던 이유다.
    #   ∑ir²=1 이면 통과해도 크기가 유지되어 wet 이 비로소 비율이 된다.
    out /= (np.sqrt(float(np.mean((out ** 2).sum(axis=1)))) + 1e-9)
    return out


class Reverb:
    def __init__(self, **kw):
        self.ir = make_ir(**kw)

    def apply(self, stereo):
        wet = np.stack([
            sps.fftconvolve(stereo[0], self.ir[0])[: stereo.shape[1] + len(self.ir[0])],
            sps.fftconvolve(stereo[1], self.ir[1])[: stereo.shape[1] + len(self.ir[1])],
        ])
        return wet.astype(np.float32)


# ---------------------------------------------------------------- 대금 / 단소
def flute(freq, dur, amp=1.0, breath=0.055, vib_rate=5.0, vib_cents=28.0,
          vib_delay=0.28, harm=8, bright=1.0, cheong=0.0, scoop=35.0,
          attack=0.07, release=0.16, seed=None, bend_end=0.0):
    """
    가로/세로 관악기 공통 몸통.
    cheong>0 이면 대금 청(갈대막) 특유의 떨림 소음을 얹는다.
    scoop: 어택에서 아래에서 밀어올리는 센트량.
    bend_end: 릴리즈 구간 퇴성(끝을 아래로 흘림) 센트.
    """
    rng = np.random.default_rng(seed if seed is not None else rng_global.integers(1 << 30))
    n = int(dur * SR)
    if n < 64:
        return np.zeros(0, np.float32)
    t = np.arange(n) / SR

    # --- 피치 궤적: 어택 스쿱 + 지연 비브라토(요성) + 퇴성
    cents = np.zeros(n, np.float32)
    sc = int(min(dur * 0.5, 0.09) * SR)
    if sc > 4:
        cents[:sc] -= scoop * (1 - np.linspace(0, 1, sc) ** 0.6)
    vd = int(min(vib_delay, dur * 0.5) * SR)
    ramp = np.clip((np.arange(n) - vd) / (0.35 * SR), 0, 1)
    drift = onepole_lp(rng.normal(0, 1, n).astype(np.float32), 1.2)
    drift /= (np.std(drift) + 1e-9)
    rate = vib_rate * (1 + 0.06 * drift)
    ph = 2 * np.pi * np.cumsum(rate) / SR
    cents += vib_cents * ramp * np.sin(ph)
    cents += 6.0 * drift
    if bend_end:
        rel = int(min(release * 1.6, dur * 0.4) * SR)
        if rel > 4:
            cents[-rel:] += bend_end * np.linspace(0, 1, rel) ** 1.5

    f = freq * 2 ** (cents / 1200.0)
    phase = 2 * np.pi * np.cumsum(f) / SR

    # --- 하모닉 스택 (관악: 짝수차도 살아있되 급격히 감소)
    sig = np.zeros(n, np.float32)
    for k in range(1, harm + 1):
        if freq * k > SR * 0.45:
            break
        a = (1.0 / k ** (1.9 - 0.55 * bright))
        if k % 2 == 0:
            a *= 0.55
        # 세게 불 때 상배음이 늦게 붙는 느낌
        ka = 1.0 if k <= 2 else np.clip((t - 0.02 * k) / 0.12, 0, 1)
        sig += (a * ka * np.sin(phase * k + rng.uniform(0, 6.283))).astype(np.float32)
    sig /= 1.6

    # --- 숨소리
    nz = rng.normal(0, 1, n).astype(np.float32)
    br = bp(nz, max(700, freq * 1.6), min(9000, freq * 9)) * breath
    # 숨의 흔들림은 음마다 속도·위상이 달라야 한다.
    # (고정 3.1Hz 로 두면 모든 음의 숨소리가 같은 위상으로 떨려 배경이 어지러워진다)
    br *= (1 + 0.26 * np.sin(2 * np.pi * rng.uniform(2.2, 4.4) * t + rng.uniform(0, 6.283)))

    # --- 청 (대금 갈대막 떨림): 신호에 노이즈 링모듈 + 살짝 왜곡
    ch = 0.0
    if cheong > 0:
        buzz = bp(nz, freq * 2.4, min(11000, freq * 7)) * (0.5 + 0.5 * np.sin(phase))
        drv = soft_clip(sig * 2.4) - sig
        ch = (buzz * 0.7 + drv * 0.5) * cheong

    env = adsr(n, attack, 0.10, 0.82, release, curve=1.7)
    # 관악 특유의 미세한 세기 흔들림
    env = env * (1 + 0.07 * onepole_lp(rng.normal(0, 1, n).astype(np.float32), 2.5) * 3)
    out = (sig + br + ch) * env
    out = lp(out, min(14000, freq * 12 + 2500))
    return (out * amp * 0.28).astype(np.float32)


def daegeum(freq, dur, amp=1.0, **kw):
    """대금: 저·중음, 청 울림, 깊은 요성."""
    p = dict(breath=0.075, vib_rate=4.6, vib_cents=34, harm=9, bright=1.05,
             cheong=0.16, scoop=45, attack=0.085, release=0.20)
    p.update(kw)
    return flute(freq, dur, amp, **p)


def danso(freq, dur, amp=1.0, **kw):
    """단소/소금: 맑고 바람기 많은 고음."""
    p = dict(breath=0.13, vib_rate=5.4, vib_cents=22, harm=6, bright=0.75,
             cheong=0.0, scoop=28, attack=0.10, release=0.24)
    p.update(kw)
    return flute(freq, dur, amp, **p) * 0.9


def piri(freq, dur, amp=1.0, **kw):
    """피리: 겹서 리드. 배음이 빽빽하고 살짝 거칠다."""
    p = dict(breath=0.05, vib_rate=5.0, vib_cents=30, harm=12, bright=1.5,
             cheong=0.0, scoop=30, attack=0.045, release=0.13)
    p.update(kw)
    s = flute(freq, dur, 1.0, **p)
    s = soft_clip(s * 2.0) * 0.6
    s = peak_eq(s, 1400, 1.1, 5.0)
    return (s * amp).astype(np.float32)


# ---------------------------------------------------------------- 가야금 / 거문고
_ks_cache = {}


def _ks_raw(freq, dur, damp, bright, seed):
    """Karplus-Strong (lfilter 로 벡터화). 고정 피치 원음."""
    key = (round(freq, 3), round(dur, 3), round(damp, 3), round(bright, 3), seed)
    if key in _ks_cache:
        return _ks_cache[key]
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    D = int(SR / freq)
    D = max(4, D)
    exc = np.zeros(n, np.float32)
    L = min(D, n)
    burst = rng.normal(0, 1, L).astype(np.float32)
    burst = lp(burst, 1200 + 5200 * bright)
    burst *= np.hanning(L) ** 0.5
    exc[:L] = burst
    exc[0] += 0.6 * bright  # 손톱/술대 어택 클릭

    # 루프 필터: y[n] = x[n] + g*(c0*y[n-D] + c1*y[n-D-1])
    g = damp
    c0, c1 = 0.62, 0.38
    a = np.zeros(D + 2)
    a[0] = 1.0
    a[D] = -g * c0
    a[D + 1] = -g * c1
    y = sps.lfilter([1.0], a, exc).astype(np.float32)
    y /= (np.max(np.abs(y)) + 1e-9)
    _ks_cache[key] = y
    return y


def gayageum(freq, dur, amp=1.0, nonghyeon=0.0, seed=None, bright=0.55,
             damp=0.9955, body=True, bend=0.0):
    """
    가야금: 명주현 뜯음.
    nonghyeon: 농현(왼손 흔들기) 센트 폭. bend: 전성/퇴성(끝 음 밀거나 흘림) 센트.
    """
    seed = int(seed if seed is not None else rng_global.integers(1 << 20))
    base = _ks_raw(freq, max(dur, 2.6), damp, bright, seed % 97)
    n = int(dur * SR)
    y = base[:n].copy() if n <= len(base) else np.pad(base, (0, n - len(base)))

    if nonghyeon > 0 or bend:
        t = np.arange(n) / SR
        cents = np.zeros(n, np.float32)
        if nonghyeon > 0:
            ramp = np.clip((t - 0.16) / 0.30, 0, 1)
            cents += nonghyeon * ramp * np.sin(2 * np.pi * 4.4 * t)
        if bend:
            k = int(min(0.35, dur * 0.5) * SR)
            if k > 4:
                cents[-k:] += bend * np.linspace(0, 1, k) ** 1.4
        y = pitch_warp(y, cents)

    y = y * expdecay(len(y), max(0.55, 1.7 - freq / 700), hold=0.02)
    if body:
        # 오동나무 공명통. 현만 있고 통이 없으면 얇고 전자적으로 들린다.
        n2 = len(y)
        rng2 = np.random.default_rng(seed % 9973)
        nail = bp(rng2.normal(0, 1, n2).astype(np.float32), 1400, 5200) * \
            expdecay(n2, 0.006) * 0.16          # 손톱/살이 명주현을 뜯는 순간
        box = resonators(y, [(128, 3.4, 0.42), (238, 4.0, 0.34), (382, 4.0, 0.22),
                             (560, 3.2, 0.11), (890, 2.6, 0.06)])
        y = y * 0.95 + box * 0.55 + nail
        y = hp(y, 95)
    y *= adsr(len(y), 0.002, 0.02, 0.95, min(0.22, dur * 0.35), curve=1.4)
    y /= (np.max(np.abs(y)) + 1e-9)
    return (y * amp * 0.5).astype(np.float32)


def geomungo(freq, dur, amp=1.0, seed=None, hard=1.0, buzz=1.0):
    """
    거문고. 뜯는 악기가 아니라 **술대(대나무 채)로 때리는** 악기다.
    술대가 대모(가죽 보호대)를 치는 '탁' 소리가 음보다 먼저 오고,
    괘(프렛) 위에서 굵은 명주현이 스치며 잔 떨림을 낸다.
    """
    seed = int(seed if seed is not None else rng_global.integers(1 << 20))
    rng = np.random.default_rng(seed % 8191)
    n = int(dur * SR)
    if n < 64:
        return np.zeros(0, np.float32)
    nz = rng.normal(0, 1, n).astype(np.float32)

    # ① 술대 타격 — 이 소리가 거문고를 거문고로 만든다
    slap = bp(nz, 900, 5400, order=2) * expdecay(n, 0.0075) * hard
    slap += bp(nz, 170, 760, order=2) * expdecay(n, 0.030) * 0.55 * hard   # 대모의 낮은 '퍽'
    slap += bp_reso(nz * expdecay(n, 0.003), 1380, 9, 1.0) * expdecay(n, 0.014) * 0.45

    # ② 현 — 굵고 어둡게, 오래 운다
    s = _ks_raw(freq, max(dur, 3.0), 0.9918, 0.22, seed % 97)[:n]
    if len(s) < n:
        s = np.pad(s, (0, n - len(s)))
    s = s * expdecay(n, max(0.7, 2.0 - freq / 500), hold=0.03)

    # ③ 괘에 현이 닿아 나는 잔 떨림 — 처음 0.3초에만
    if buzz:
        g = expdecay(n, 0.13)
        rat = (soft_clip(s * 3.5) - s) * g * 0.25 * buzz
        s = s + rat

    # ④ 오동나무 통 — 거문고 통은 크고 낮다
    box = resonators(s, [(102, 3.5, 0.55), (196, 4.5, 0.50), (300, 4.0, 0.30),
                         (470, 3.0, 0.16)])
    y = slap * 2.0 + s * 0.72 + box * 0.85
    y = lp(y, 3200)
    y = hp(y, 70)
    y /= (np.max(np.abs(y)) + 1e-9)
    return (y * amp * 0.62).astype(np.float32)


# ---------------------------------------------------------------- 막(膜)·통 물리
from scipy import special as _sp

_MEM_CACHE = {}


def membrane_modes(nmodes=16):
    """
    원형막의 고유모드. (각차수 m, 베셀 영점 z, 기본음 대비 진동수비)
    사인파 하나로는 북 소리가 나지 않는다 — 막은 1.000 : 1.593 : 2.136 : 2.295 …
    라는 비조화 모드 다발로 울린다. 이것이 '북처럼 들리는' 이유다.
    """
    if nmodes in _MEM_CACHE:
        return _MEM_CACHE[nmodes]
    rows = []
    for m in range(6):
        for z in _sp.jn_zeros(m, 5):
            rows.append((m, float(z)))
    j01 = float(_sp.jn_zeros(0, 1)[0])
    rows.sort(key=lambda r: r[1])
    out = [(m, z, z / j01) for m, z in rows[:nmodes]]
    _MEM_CACHE[nmodes] = out
    return out


def bp_reso(x, f0, q, gain=1.0):
    """공진형 대역통과(RBJ) — 통·판의 울림 하나."""
    w0 = 2 * np.pi * f0 / SR
    al = np.sin(w0) / (2 * q)
    b = [al, 0.0, -al]
    a = [1 + al, -2 * np.cos(w0), 1 - al]
    return (gain * sps.lfilter(b, a, x)).astype(np.float32)


def resonators(x, specs):
    """몸통 공명 — [(주파수, Q, 세기)] 를 병렬로 더한다."""
    out = np.zeros_like(x)
    for f0, q, g in specs:
        out += bp_reso(x, f0, q, g)
    return out.astype(np.float32)


def modal_hit(f0, dur, strike=0.4, t60=0.35, hi_damp=1.1, glide=0.18,
              glide_t=0.02, nmodes=16, seed=None):
    """
    막을 한 번 때린 소리. 타격 위치(strike: 0=한복판, 1=테두리)에 따라
    어떤 모드가 살아나는지가 달라진다 — 한복판을 치면 축대칭 모드만 남아
    둥글고, 테두리를 치면 높은 모드가 붙어 날카로워진다.
    """
    rng = np.random.default_rng(seed if seed is not None else rng_global.integers(1 << 30))
    n = int(dur * SR)
    if n < 32:
        return np.zeros(0, np.float32)
    t = np.arange(n) / SR
    # 장력 변조 — 세게 치면 막이 팽팽해져 처음에 음이 올라갔다 내려온다
    ph = 2 * np.pi * np.cumsum(f0 * (1 + glide * np.exp(-t / glide_t))) / SR
    y = np.zeros(n, np.float32)
    tot = 0.0
    for (m, z, ratio) in membrane_modes(nmodes):
        w = abs(float(_sp.jv(m, z * np.clip(strike, 0.02, 0.98))))
        if w < 5e-3:
            continue
        dec = max(0.004, t60 / (1 + hi_damp * (ratio - 1)))
        y += (w * np.sin(ph * ratio + rng.uniform(0, 6.283))
              * np.exp(-t / dec)).astype(np.float32)
        tot += w
    if tot > 0:
        y /= tot
    return y.astype(np.float32)


# ---------------------------------------------------------------- 타악
def janggu_gung(dur=0.9, amp=1.0, tune=142.0, seed=None, strike=0.34,
                stick=0.30, damp=1.0):
    """
    장구 궁편(왼쪽). 손바닥이나 궁굴채로 한복판 가까이를 친다.
    소가죽이 두꺼워 낮고 둥근 '덩/쿵'.  stick 0=손바닥 1=궁굴채.
    """
    rng = np.random.default_rng(seed if seed is not None else rng_global.integers(1 << 30))
    n = int(dur * SR)
    head = modal_hit(tune, dur, strike=strike, t60=0.34 / damp, hi_damp=1.25,
                     glide=0.16, glide_t=0.022, seed=int(rng.integers(1 << 20)))
    # 손/채가 가죽에 닿는 소리
    nz = rng.normal(0, 1, n).astype(np.float32)
    touch = lp(nz, 1500 + 2600 * stick) * expdecay(n, 0.009 + 0.010 * (1 - stick))
    touch += bp_reso(nz * expdecay(n, 0.002), 830, 7, 1.0) * expdecay(n, 0.011) * 1.1
    # 오동나무 통 + 통 안 공기. 궁편·채편이 한 통을 나눠 쓰므로 울림이 깊다
    body = resonators(head * 0.7 + touch, [(84, 3.2, 0.55), (163, 5.0, 0.85),
                                           (298, 6.0, 0.40), (505, 5.0, 0.18)])
    y = head + touch * (0.75 + 0.45 * stick) + body * 0.75
    y = lp(y, 4500 + 3000 * stick)
    y /= (np.max(np.abs(y)) + 1e-9)
    return (y * amp * 0.62).astype(np.float32)


def janggu_chae(dur=0.45, amp=1.0, tune=430.0, seed=None, strike=0.72,
                open_=0.0):
    """
    장구 채편(오른쪽). 가는 대나무 열채로 테두리 쪽을 때린다.
    개가죽이 얇고 팽팽해 아주 건조하고 날카로운 '딱/기덕'.
    """
    rng = np.random.default_rng(seed if seed is not None else rng_global.integers(1 << 30))
    n = int(dur * SR)
    head = modal_hit(tune, dur, strike=strike, t60=0.052 + 0.09 * open_,
                     hi_damp=1.6, glide=0.10, glide_t=0.008,
                     seed=int(rng.integers(1 << 20)))
    nz = rng.normal(0, 1, n).astype(np.float32)
    # 대나무가 가죽을 때리는 순간 — 아주 짧고 밝다
    click = bp(nz, 2600, 11000, order=2) * expdecay(n, 0.0032)
    wood = bp_reso(nz * expdecay(n, 0.004), 1250, 10, 1.0) * expdecay(n, 0.018)
    body = resonators(head, [(612, 6.0, 0.28), (1140, 8.0, 0.22), (298, 5.0, 0.12)])
    y = head * 0.55 + click * 1.7 + wood * 0.75 + body * 0.35
    y = hp(y, 260)
    y /= (np.max(np.abs(y)) + 1e-9)
    return (y * amp * 0.42).astype(np.float32)


def buk(dur=1.3, amp=1.0, tune=88.0, seed=None, strike=0.30):
    """북: 통이 굵은 소가죽 북. 나무채로 가운데를 친다."""
    rng = np.random.default_rng(seed if seed is not None else rng_global.integers(1 << 30))
    n = int(dur * SR)
    head = modal_hit(tune, dur, strike=strike, t60=0.46, hi_damp=1.4,
                     glide=0.22, glide_t=0.026, seed=int(rng.integers(1 << 20)))
    nz = rng.normal(0, 1, n).astype(np.float32)
    touch = lp(nz, 1800) * expdecay(n, 0.007)
    touch += bp(nz, 800, 4200, order=2) * expdecay(n, 0.0045) * 1.8   # 나무 북채
    body = resonators(head * 0.8 + touch, [(66, 3.0, 0.7), (124, 4.5, 0.55),
                                           (232, 5.5, 0.28)])
    y = head + touch * 0.85 + body * 0.8
    y = lp(y, 4200)
    y /= (np.max(np.abs(y)) + 1e-9)
    return (y * amp * 0.8).astype(np.float32)


def jing(dur=4.5, amp=1.0, base=118.0, seed=None):
    """징: 큰 놋 징. 비조화 배음이 뒤늦게 피어오른다(蕩)."""
    rng = np.random.default_rng(seed if seed is not None else rng_global.integers(1 << 30))
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n, np.float32)
    ratios = [1.0, 1.47, 2.09, 2.61, 3.31, 4.02, 4.77, 5.61, 6.9, 8.3, 9.9]
    for i, r in enumerate(ratios):
        f = base * r * (1 + rng.uniform(-0.004, 0.004))
        beat = 1 + 0.02 * np.sin(2 * np.pi * rng.uniform(0.4, 1.9) * t)
        bloom = np.clip(t / (0.05 + 0.22 * i / len(ratios)), 0, 1)
        dec = np.exp(-t / (2.6 / (1 + 0.55 * i)))
        y += (np.sin(2 * np.pi * f * np.cumsum(beat) / SR) * bloom * dec / (1 + 0.5 * i)).astype(np.float32)
    y += bp(rng.normal(0, 1, n).astype(np.float32), 2000, 9000) * expdecay(n, 0.05) * 0.25
    y = soft_clip(y * 1.4) * 0.6
    return (y * amp * 0.5).astype(np.float32)


def kkwaenggwari(dur=1.2, amp=1.0, base=430.0, seed=None):
    """꽹과리: 작고 째지는 놋쇠. 전투 강세용."""
    rng = np.random.default_rng(seed if seed is not None else rng_global.integers(1 << 30))
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n, np.float32)
    for i, r in enumerate([1.0, 1.72, 2.44, 3.19, 4.31, 5.7, 7.2, 9.1]):
        f = base * r * (1 + rng.uniform(-0.01, 0.01))
        y += np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * np.exp(-t / (0.45 / (1 + 0.4 * i))) / (1 + 0.6 * i)
    y += bp(rng.normal(0, 1, n).astype(np.float32), 3000, 12000) * expdecay(n, 0.02) * 0.5
    y = soft_clip(y * 2.0) * 0.5
    y = hp(y, 400)
    return (y * amp * 0.36).astype(np.float32)


def bak(dur=0.5, amp=1.0, seed=None):
    """박(拍) — 나무 짝. 악절 구분."""
    rng = np.random.default_rng(seed if seed is not None else 5)
    n = int(dur * SR)
    y = bp(rng.normal(0, 1, n).astype(np.float32), 700, 6000) * expdecay(n, 0.035)
    y += np.sin(2 * np.pi * 380 * np.arange(n) / SR) * expdecay(n, 0.02) * 0.4
    return (y * amp * 0.45).astype(np.float32)


# ---------------------------------------------------------------- 앰비언트
def pad(freq, dur, amp=1.0, detune=7.0, voices=5, cutoff=1800, attack=1.6,
        release=2.2, seed=None, saw=0.25):
    """느리게 피어오르는 배경 패드."""
    rng = np.random.default_rng(seed if seed is not None else rng_global.integers(1 << 30))
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n, np.float32)
    for v in range(voices):
        d = (v - (voices - 1) / 2) * detune
        f = freq * 2 ** (d / 1200.0)
        drift = onepole_lp(rng.normal(0, 1, n).astype(np.float32), 0.35)
        drift /= (np.std(drift) + 1e-9)
        ph = 2 * np.pi * np.cumsum(f * (1 + 0.0012 * drift)) / SR
        s = np.sin(ph + rng.uniform(0, 6))
        if saw:
            s = (1 - saw) * s + saw * (2 * ((ph / (2 * np.pi)) % 1.0) - 1)
        y += s.astype(np.float32)
    y /= voices
    # 느린 필터 스윕
    y = lp(y, cutoff)
    y = y * (1 + 0.18 * np.sin(2 * np.pi * 0.07 * t + rng.uniform(0, 6)))
    y *= adsr(n, attack, 0.5, 0.85, release, curve=1.5)
    return (y * amp * 0.30).astype(np.float32)


def wind(dur, amp=1.0, seed=None, lo=180, hi=1500, gust=0.11):
    """바람: 필터 스윕 노이즈."""
    rng = np.random.default_rng(seed if seed is not None else rng_global.integers(1 << 30))
    n = int(dur * SR)
    nz = rng.normal(0, 1, n).astype(np.float32)
    y = bp(nz, lo, hi)
    env = onepole_lp(rng.normal(0, 1, n).astype(np.float32), 0.13)
    env /= (np.std(env) + 1e-9)
    y = y * (0.55 + gust * 3.0 * np.clip(env, -1.5, 1.5))
    y *= adsr(n, 2.0, 0.5, 0.9, 2.5)
    return (y * amp * 0.20).astype(np.float32)


def water(dur, amp=1.0, seed=None):
    """개울: 고역 노이즈 + 미세한 물방울."""
    rng = np.random.default_rng(seed if seed is not None else 21)
    n = int(dur * SR)
    y = bp(rng.normal(0, 1, n).astype(np.float32), 900, 7000)
    mod = onepole_lp(rng.normal(0, 1, n).astype(np.float32), 4.0)
    mod /= (np.std(mod) + 1e-9)
    y *= (0.6 + 0.4 * np.clip(mod, -1.5, 1.5))
    return (y * amp * 0.10).astype(np.float32)


def crickets(dur, amp=1.0, seed=None):
    """풀벌레: 아주 낮게 깔리는 밤 질감."""
    rng = np.random.default_rng(seed if seed is not None else 33)
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n, np.float32)
    for _ in range(6):
        # 순음이 아니라 좁은 대역 잡음 — 스펙트럼에 선이 서지 않게
        f = rng.uniform(3400, 5800)
        band = bp(rng.normal(0, 1, n).astype(np.float32), f * 0.90, f * 1.12, order=3)
        rate = rng.uniform(8, 16)
        wob = onepole_lp(rng.normal(0, 1, n).astype(np.float32), 0.25)
        wob /= (np.std(wob) + 1e-9)
        pulse = (np.sin(2 * np.pi * np.cumsum(rate * (1 + 0.15 * wob)) / SR
                        + rng.uniform(0, 6)) > 0.62).astype(np.float32)
        pulse = onepole_lp(pulse, 70)
        # 개체마다 길게 쉬었다 운다
        gate = np.clip(onepole_lp(rng.normal(0, 1, n).astype(np.float32), 0.06) * 60, 0, 1)
        y += band * pulse * gate * rng.uniform(0.6, 1.0)
    y = bp(y, 3000, 7500)
    y *= (0.7 + 0.3 * np.sin(2 * np.pi * 0.05 * t))
    return (y * amp * 0.05).astype(np.float32)


# ---------------------------------------------------------------- 믹서
class Mix:
    def __init__(self, dur, tail=0.0):
        self.n = int(dur * SR)
        self.nt = int((dur + tail) * SR)
        self.dry = np.zeros((2, self.nt), np.float32)
        self.snd = np.zeros((2, self.nt), np.float32)  # 리버브 send

    def add(self, x, at, gain=1.0, pan=0.0, send=0.3):
        if len(x) == 0:
            return
        if x.ndim > 1:                 # 스테레오 음원은 좌우를 그대로 살린다
            return self._add_stereo(x, at, gain, pan, send)
        i = int(at * SR)
        if i >= self.nt:
            return
        if i < 0:            # 휴머나이즈로 0보다 앞서면 앞부분을 잘라낸다
            x = x[-i:]
            i = 0
            if len(x) == 0:
                return
        seg = x[: self.nt - i]
        l = gain * np.sqrt((1 - pan) / 2 + 0.5) if False else gain * np.cos((pan + 1) * np.pi / 4)
        r = gain * np.sin((pan + 1) * np.pi / 4)
        self.dry[0, i:i + len(seg)] += seg * l
        self.dry[1, i:i + len(seg)] += seg * r
        self.snd[0, i:i + len(seg)] += seg * l * send
        self.snd[1, i:i + len(seg)] += seg * r * send

    def _add_stereo(self, x, at, gain, pan, send):
        i = int(at * SR)
        if i >= self.nt:
            return
        if i < 0:
            x = x[-i:]
            i = 0
            if len(x) == 0:
                return
        seg = x[: self.nt - i]
        # pan 은 좌우 균형으로만 쓴다(모노처럼 한쪽으로 몰지 않는다)
        bl, br = min(1.0, 1 - pan), min(1.0, 1 + pan)
        for ch, w in ((0, bl), (1, br)):
            v = seg[:, ch] * gain * w
            self.dry[ch, i:i + len(v)] += v
            self.snd[ch, i:i + len(v)] += v * send

    def render(self, reverb, wet=0.9, loop=True, target_db=-14.5, peak_db=-1.2,
               eq=None, norm=True):
        """norm=False 면 라우드니스 정규화를 건너뛴다 (층별 스템 비교용)."""
        # 곡마다 정해 둔 wet 의 상대 비는 그대로 두고, 전체 세기만 여기서 한 번에 건다.
        # WET_SCALE=0 이면 잔향 없이 마른 소리 그대로 — 합성곱도 건너뛴다.
        wet = wet * WET_SCALE
        if wet <= 0.0:
            wetsig = np.zeros((2, 0), np.float32)
        else:
            wetsig = reverb.apply(self.snd) * wet
        n_total = max(self.dry.shape[1], wetsig.shape[1])
        out = np.zeros((2, n_total), np.float32)
        out[:, : self.dry.shape[1]] += self.dry
        out[:, : wetsig.shape[1]] += wetsig
        out = master_eq(out, **(eq or {}))   # 접기 전에 EQ → 이음매 보존
        if loop:
            # 꼬리를 앞으로 접어 심리스 루프.
            # 이음매에서 파형이 튀지 않도록 본체 앞머리에만 아주 짧은 페이드인.
            n = self.n
            tail = out[:, n:]
            folded = out[:, :n].copy()
            k = int(0.012 * SR)
            folded[:, :k] *= np.linspace(0, 1, k) ** 0.5
            m = min(tail.shape[1], n)
            folded[:, :m] += tail[:, :m]
            out = folded
        else:
            out = out[:, : self.n]
        if not norm:
            return out.astype(np.float32)
        # 라우드니스 정규화 + 부드러운 리미팅
        rms = np.sqrt(np.mean(out ** 2) + 1e-12)
        out *= (10 ** (target_db / 20)) / rms
        out = np.tanh(out * 1.05) / 1.05
        pk = np.max(np.abs(out)) + 1e-9
        out *= min(1.0, (10 ** (peak_db / 20)) / pk)
        return out.astype(np.float32)


def fade_edges(x, ms=6):
    k = int(SR * ms / 1000)
    if k * 2 >= x.shape[1]:
        return x
    r = np.linspace(0, 1, k)
    x[:, :k] *= r
    x[:, -k:] *= r[::-1]
    return x


def write_wav(path, stereo):
    from scipy.io import wavfile
    data = np.clip(stereo.T, -1, 1)
    wavfile.write(path, SR, (data * 32767).astype(np.int16))
