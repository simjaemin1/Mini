"""
sampler.py — 실제 국악기 녹음 음원을 쓰는 샘플러

폴더에 wav 를 넣어두면
  ① 악기별로 분류하고
  ② 앞뒤 묵음을 다듬고
  ③ 음정을 자동으로 알아내서(파일명에 음이름이 없어도 됨)
  ④ 색인(JSON)을 만든 다음
  ⑤ 아무 음높이나 리샘플링으로 연주한다.

음원이 없는 악기는 기존 합성음(gugak.py)으로 자동 대체되므로,
가야금만 넣어도 그 자리만 진짜 소리로 바뀐다.

    python3 sampler.py scan  samples/     # 색인 만들기
    python3 sampler.py check samples/     # 무엇이 들어왔는지 표로 보기
"""
import os
import re
import json
import glob
import numpy as np
from scipy import signal as sps
from scipy.io import wavfile
from fractions import Fraction

import gugak as G

SR = G.SR
INDEX_NAME = "_index.json"

# ------------------------------------------------------------------ 악기 이름
# 폴더명이나 파일명에 아래 낱말이 있으면 그 악기로 분류한다.
ALIASES = {
    "gayageum":   ["가야금", "gayageum", "kayagum", "kayageum"],
    "geomungo":   ["거문고", "geomungo", "komungo", "kumungo"],
    "daegeum":    ["대금", "daegeum", "taegum", "taegeum"],
    "danso":      ["단소", "danso", "소금", "sogeum"],
    "piri":       ["피리", "piri", "태평소", "taepyeongso"],
    "haegeum":    ["해금", "haegeum", "haegum"],
    "ajaeng":     ["아쟁", "ajaeng"],
    "janggu_gung": ["궁편", "궁글", "gung", "janggu_gung", "장구_궁", "장구궁"],
    "janggu_chae": ["채편", "열채", "chae", "janggu_chae", "장구_채", "장구채"],
    "janggu":     ["장구", "janggu", "changgo"],     # 궁/채 구분 없이 들어온 경우
    "buk":        ["북", "buk", "puk", "소고", "sogo"],
    "jing":       ["징", "jing"],
    "kkwaenggwari": ["꽹과리", "kkwaenggwari", "꽹가리", "쇠"],
    "bak":        ["박", "bak"],
}
PITCHED = {"gayageum", "geomungo", "daegeum", "danso", "piri", "haegeum", "ajaeng"}
# 음이 '줄' 위에 고정된 악기. 이것만 줄 맞추기(repair_pitches)를 적용한다.
# '줄맞춤'(검출값을 정해진 줄 집합으로 스냅)은 **열린 줄만 뜯는 악기**에만 맞다.
# 가야금 12현은 조율된 열두 음이 전부라 그게 옳다.
# ★거문고는 넣으면 안 된다. 괘(프렛)가 16개라 한 줄이 여러 음을 내고,
#   게다가 국악원 녹음은 대현·문현·유현이 **따로** 들어 있다:
#       대현 D2~F#3 / 문현 D#2~G#4 / 유현 G#2~G#4
#   이걸 한 악기로 뭉쳐 8음(D#2~F3)짜리 한 벌로 맞추면
#   유현의 G4 녹음이 'D#3' 이라는 딱지를 달게 된다 — 악보가 D#3 을 부르면
#   두 옥타브 위 소리가 울린다. 실제로 그러고 있었다.
STRINGED = {"gayageum", "ajaeng", "yanggeum", "geum", "seul"}

# 숨이나 활로 **계속 이어 낼 수 있는** 악기. 음원보다 긴 음을 요청받으면
# 뒤에 무음을 덧대는 대신 지속 구간을 겹쳐 이어 붙인다.
# (뜯는 악기는 넣으면 안 된다 — 가야금·거문고는 원래 소리가 잦아드는 게 맞다)
SUSTAINING = {"daegeum", "danso", "piri", "haegeum", "ajaeng"}

# 악기별 실제 음역(Hz). 자기상관은 배음이 센 음에서 한두 옥타브 아래를 짚는데,
# 그 악기가 낼 수 없는 음역을 아예 후보에서 빼면 그 오류가 사라진다.
# (단소를 D2 로 읽는 것 같은 사고를 막는다 — 단소는 A4 아래로 못 내려간다)
RANGE_HZ = {
    "danso":    (380.0, 2200.0),   # A4 ~ F6 근방
    "daegeum":  (230.0, 1700.0),   # D4 ~ D6
    "piri":     (170.0, 1100.0),   # G#3 ~ G5
    "gayageum": (85.0, 700.0),     # G2 ~ D5
    "geomungo": (70.0, 650.0),     # E2 ~ E4
    "haegeum":  (140.0, 1200.0),
    "ajaeng":   (70.0, 500.0),
}

# 국악원 파일명에 붙는 주법·세기. 이걸 무시하면 한 선율 안에서
# 지속음·끊어치기·뜯기가 뒤죽박죽 섞여 악기 소리로 안 들린다.
ARTICULATION = [
    ("staccato", "staccato"), ("pluck_flick", "pluck"), ("pluck", "pluck"),
    # ── 장구 타법 (국립국악원 표): 굴림·양손·겹채는 단타가 아니다
    ("deoreoreoreo", "roll"), ("deong", "both"), ("gideok", "double"),
    ("kung", "sus"), ("deok", "sus"), ("_deo_", "soft"),
    ("deep_vib", "nong_deep"), ("sus_vib", "yoseong"), ("scale_vib", "nong_shallow"),
    ("teasung", "toegim"), ("taesung", "toegim"), ("toesung", "toegim"),
    ("chung", "cheongseong"), ("jachul", "jachul"),
    ("ssareag", "ssarang"), ("sulgidung", "sulgidung"), ("sul_munhyun", "suldae"),
    ("stacatto", "staccato"), ("naniru", "sigimsae"), ("nina", "sigimsae"),
    ("nira", "sigimsae"), ("noniro", "sigimsae"),

    # ── 시김새: 국악의 '음을 흔들고 밀고 꺾는' 주법. 여기가 가야금의 정체다.
    #    지금까지는 이걸 합성 비브라토로 흉내냈는데, 산조가야금 녹음에는
    #    실제 연주가 통째로 들어 있다. 흉내낼 이유가 없다.
    ("deep_nonghyun", "nong_deep"), ("shallow_nonghyun", "nong_shallow"),
    ("break_nonghyon", "nong_break"), ("break_nonghyun", "nong_break"),
    ("nonghyun", "nong_shallow"), ("nonghyeon", "nong_shallow"),
    ("chosung", "chuseong"), ("chuseong", "chuseong"),
    ("eaontuigim", "toegim"), ("toegim", "toegim"), ("twigim", "toegim"),
    ("gullim", "gullim"), ("glissando", "gliss"), ("gliss", "gliss"),
    ("junsung", "jeonseong"), ("jeonseong", "jeonseong"),
    ("yoseong", "yoseong"), ("overblow", "overblow"), ("sigimsae", "sigimsae"),
    ("sus", "sus"), ("vib", "nong_shallow"), ("tremolo", "gullim"),
]
# 주법끼리의 '가까움'. 원하는 주법이 없을 때 어디로 대체할지 정한다.
ART_KIN = [{"sus", "yoseong", "overblow"}, {"yoseong", "sigimsae", "nong_shallow"},
           {"sus", "pluck", "nong_shallow"},
           {"nong_shallow", "nong_deep", "nong_break", "jeonseong"},
           {"chuseong", "toegim", "nong_break"},
           {"sus", "cheongseong", "jachul"}, {"ssarang", "sulgidung", "suldae", "pluck"},
           {"staccato", "pluck"}, {"gullim", "jeonseong"},
           {"sus", "soft"}, {"sus", "double"}]
ART_NAME_KO = {"sus": "지속음", "pluck": "뜯기", "staccato": "끊어치기",
               "nong_shallow": "얕은 농현", "nong_deep": "깊은 농현",
               "nong_break": "꺾는 농현", "chuseong": "추성(밀어올림)",
               "toegim": "퇴김", "gullim": "굴림", "gliss": "글리산도",
               "jeonseong": "전성", "yoseong": "요성(흔들기)",
               "overblow": "역취(세게 불기)", "sigimsae": "시김새 패턴",
               "cheongseong": "청성(높은음)", "jachul": "자출", "ssarang": "싸랭",
               "sulgidung": "슬기둥", "suldae": "술대",
               "roll": "굴림(더러러러)", "both": "양손(덩)",
               "double": "겹채(기덕)", "soft": "여린채(더)"}
DYNAMIC = [("loud", "loud"), ("mid", "mid"), ("qui", "qui"),
            ("_f_", "loud"), ("_mf", "mid"), ("_p_", "qui")]

# 국악원 타악기 파일 이름 끝의 번호는 **세기**다 (1=강, 2=중, 3=약).
# 장구는 loud/mid/qui 로 받아서 티가 났지만 꽹과리·좌고·박은 번호뿐이라
# 지금까지 전부 '중' 으로 읽혀 세기 구분이 아예 없었다.
# 실측으로 확인: 꽹과리 1_1/1_2/1_3 = -0.3/-1.7/-15.8dB, 4_1/4_2/4_3 = -0.8/-8.6/-15.0dB,
#               좌고 1/2/3 = -2.8/-3.3/-6.7dB — 일곱 묶음 전부 번호순으로 작아진다.
# 징만 뺀다: 번호가 4개고 크기도 -0.3/-2.1/-0.3/-0.3 로 단조롭지 않다(세기가 아니라 타법).
DYN_BY_TAIL_NUM = {"kkwaenggwari", "buk", "bak"}
_TAIL_NUM = re.compile(r'_(\d+)(?=\.[^.]*$|$)')


def dyn_of(rel, inst):
    d = tag_of(rel, DYNAMIC, None)
    if d is not None:
        return d
    if inst in DYN_BY_TAIL_NUM:
        m = _TAIL_NUM.search(os.path.splitext(os.path.basename(rel))[0])
        if m:
            return {"1": "loud", "2": "mid", "3": "qui"}.get(m.group(1), "mid")
    return "mid"


def tag_of(name, table, default):
    low = name.lower()
    for key, val in table:
        if key in low:
            return val
    return default

NOTE_RE = re.compile(r'(?<![A-Za-z])([A-Ga-g])\s?([#b♯♭]?)\s?(-?[0-9])(?![0-9])')
STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def classify(path):
    """경로(폴더+파일명)에서 악기 이름을 알아낸다."""
    low = path.lower()
    hit, hitlen = None, 0
    for inst, words in ALIASES.items():
        for w in words:
            if w.lower() in low and len(w) > hitlen:
                hit, hitlen = inst, len(w)
    return hit


def parse_note(name):
    """파일명에 'A3' 'C#4' 같은 음이름이 있으면 MIDI 번호로."""
    m = NOTE_RE.search(name)
    if not m:
        return None
    letter, acc, octv = m.group(1).upper(), m.group(2), int(m.group(3))
    v = STEP[letter] + (1 if acc in ("#", "♯") else -1 if acc in ("b", "♭") else 0)
    return 12 * (octv + 1) + v


# ------------------------------------------------------------------ 음원 읽기
def read_wav(path, stereo=False):
    """stereo=True 면 (n,2) 를 그대로 돌려준다.
    통 울림과 공간감은 좌우 차이에 들어 있어서, 모노로 합치면 악기가 납작해진다."""
    sr, d = wavfile.read(path)
    x = d.astype(np.float32)
    if np.max(np.abs(x)) > 2:
        x = x / 32768.0
    if x.ndim > 1:
        # 국립국악원 음원은 2채널로 저장돼 있지만 좌우가 **완전히 같다**(듀얼모노).
        # 실제로 재보면 L-R 차이가 -200dB — 공간 정보가 아예 없다.
        # 그걸 스테레오라고 들고 다니면 메모리만 두 배 쓴다.
        if not stereo or np.max(np.abs(x[:, 0] - x[:, 1])) < 1e-6:
            x = x.mean(1)
    if sr != SR:
        f = Fraction(SR, sr).limit_denominator(1000)
        x = sps.resample_poly(x, f.numerator, f.denominator, axis=0).astype(np.float32)
    return x.astype(np.float32)


def room_floor(x):
    """파일에 깔린 방 안 잡음의 크기. '소리가 끝난 자리' 를 재는 절대 기준이다."""
    return float(np.percentile(G.onepole_lp(np.abs(x), 60), 5))


def trim(x, thresh_db=-42.0, pre_ms=4.0, tail_db=-60.0, floor=0.0):
    a, b = trim_span(x, thresh_db, pre_ms, tail_db, floor)
    return x[a:b]


def trim_span(x, thresh_db=-42.0, pre_ms=4.0, tail_db=-60.0, floor=0.0):
    """묵음을 걷어낸 뒤 남는 구간 [처음, 끝). 위치를 그대로 돌려줘야
    원본 어디서 나온 조각인지 기록할 수 있다."""
    if len(x) == 0:
        return 0, 0
    env = G.onepole_lp(np.abs(x), 60)
    pk = env.max() + 1e-12
    on = np.where(env > pk * 10 ** (thresh_db / 20))[0]
    if len(on) == 0:
        return 0, len(x)
    a = max(0, on[0] - int(pre_ms / 1000 * SR))
    # ★꼬리 기준을 '봉우리 대비' 로만 잡으면 안 된다. 약하게 친 녹음은 봉우리가
    #  낮아서 -60dB 선이 방 안 잡음보다 **아래로** 내려간다. 그러면 소리가 끝난
    #  뒤의 방 소리까지 통째로 음원이 된다 — 실제로 쿵/약이 3.54초, 더/약이
    #  3.88초짜리 잡음 덩어리가 돼 있었다(중심주파수 9~12kHz = 그냥 히스).
    #  방 잡음 위로 확실히 올라온 마지막 지점에서 끊는다.
    cut = max(pk * 10 ** (tail_db / 20), floor * 4.0)
    off = np.where(env > cut)[0]
    if len(off) == 0 or off[-1] <= a:
        off = on
    b = min(len(x), off[-1] + int(0.05 * SR))
    return a, b


def detect_pitch(x, fmin=55.0, fmax=1400.0):
    """
    자기상관으로 기본음을 찾는다. 반환 (midi, 신뢰도 0~1).
    옥타브 오류를 줄이려고 배음 자기상관(HPS 유사) 검증을 덧붙였다.
    """
    if len(x) < SR * 0.08:
        return None, 0.0
    # 어택 뒤 지속부만 본다
    i0 = int(len(x) * 0.12)
    seg = x[i0:i0 + int(min(1.2, len(x) / SR - 0.12) * SR)]
    if len(seg) < 2048:
        return None, 0.0
    seg = seg - seg.mean()
    w = seg * np.hanning(len(seg))
    n = 1 << int(np.ceil(np.log2(len(w) * 2)))
    F = np.fft.rfft(w, n)
    ac = np.fft.irfft(np.abs(F) ** 2)[:len(w)]
    if ac[0] <= 0:
        return None, 0.0
    ac = ac / ac[0]
    lo, hi = int(SR / fmax), min(len(ac) - 1, int(SR / fmin))
    if hi <= lo + 2:
        return None, 0.0
    reg = ac[lo:hi]
    peak = float(reg.max())
    if peak <= 0:
        return None, 0.0
    # ★가장 큰 봉우리가 아니라 **문턱을 넘는 가장 짧은 주기**를 고른다.
    #   주기 신호는 2배·3배 지연에서도 자기상관이 거의 같아서,
    #   최대값만 보면 한두 옥타브 아래로 잘못 잡힌다.
    loc = (reg[1:-1] > reg[:-2]) & (reg[1:-1] >= reg[2:])
    cand = np.where(loc & (reg[1:-1] > 0.82 * peak))[0] + 1
    k = int(cand[0]) + lo if len(cand) else int(np.argmax(reg)) + lo
    conf = float(np.clip(ac[k], 0, 1))
    # 포물선 보간
    if 0 < k < len(ac) - 1:
        a, b, c = ac[k - 1], ac[k], ac[k + 1]
        d = (a - c) / (2 * (a - 2 * b + c) + 1e-12)
        k = k + float(np.clip(d, -1, 1))
    f0 = SR / k
    if not (fmin <= f0 <= fmax):
        return None, 0.0
    return 69 + 12 * np.log2(f0 / 440.0), conf


# ------------------------------------------------------------------ 한 파일 = 여러 음
def onsets(x, hop=512, win=2048, thresh=1.6, min_gap=0.16, hf=0.0):
    """hf>0 이면 그 주파수 위만 보고 타점을 찾는다.
    ★관악기는 어택이 부드러워서 전대역 플럭스로는 타점을 놓친다. 그러면 조각 하나에
      음이 두세 개 들어가고, 그 조각을 한 음으로 알고 늘어놓으면 속사포가 된다.
      실측: 대금 조각 40개 표본 **전부** 타점이 2개 이상이었고,
      악보 30음짜리 구간에서 실제로는 179번 소리가 났다."""
    if hf > 0:
        return _onsets_hf(x, hf, min_gap)
    """
    스펙트럼 플럭스로 타점을 찾는다.
    국립국악원 '단음' 은 한 파일에 여러 음이 이어 녹음돼 있어서
    파일을 통째로 쓰면 안 되고 음 단위로 잘라야 한다.
    """
    if len(x) < win * 2:
        return [0]
    f, t, Z = sps.stft(x, SR, nperseg=win, noverlap=win - hop)
    M = np.abs(Z)
    flux = np.maximum(0, np.diff(M, axis=1)).sum(0)
    if flux.max() <= 0:
        return [0]
    flux = flux / flux.max()
    # 이동 중앙값 위로 솟은 봉우리만
    k = 31
    pad = np.pad(flux, (k // 2, k // 2), mode="edge")
    base = np.array([np.median(pad[i:i + k]) for i in range(len(flux))])
    det = flux - base * thresh
    idx = []
    gap = int(min_gap * SR / hop)
    i = 1
    while i < len(det) - 1:
        if det[i] > 0.02 and det[i] >= det[i - 1] and det[i] > det[i + 1]:
            idx.append(i)
            i += gap
        else:
            i += 1
    if not idx:
        return [0]
    starts = [max(0, int(t[i] * SR) - int(0.012 * SR)) for i in idx]
    if starts[0] > int(0.25 * SR):
        starts = [0] + starts
    return starts


def split_notes(x, min_len=0.25, max_len=9.0, floor_db=-46.0, floor=0.0, hf=0.0):
    """
    타점마다 잘라 [(조각, 시작표본, 끝표본)] 로. 너무 짧거나 조용한 건 버린다.
    ★위치를 '표본 번호' 로 돌려주는 게 중요하다. trim() 이 앞뒤를 더 깎기 때문에
      원본에서의 정확한 구간을 모르면 스테레오 원본을 같은 자리에서 못 자른다.
    """
    st = onsets(x, hf=hf)
    st.append(len(x))
    peak = np.max(np.abs(x)) + 1e-12
    out = []
    for a, b in zip(st[:-1], st[1:]):
        e = min(b, a + int(max_len * SR))
        seg = x[a:e]
        if len(seg) < int(min_len * SR):
            continue
        if np.max(np.abs(seg)) < peak * 10 ** (floor_db / 20):
            continue
        t = trim(seg, floor=floor)
        # trim 이 앞에서 얼마나 깎았는지 되짚어 절대 위치를 구한다
        off = 0
        if len(t) < len(seg):
            for k in range(len(seg) - len(t) + 1):
                if seg[k] == t[0] and np.array_equal(seg[k:k + len(t)], t):
                    off = k
                    break
        out.append((t, a + off, a + off + len(t)))
    return out


def flatten_pitch(x, fmin=200.0, fmax=1800.0, hop_ms=12.0):
    """음정의 흔들림을 펴서 **평탄음**으로 만든다.
    ★국악원 대금 지속음 조각은 12개뿐이고 가진 음이 C4 B4 D#5 B5 C6 D6 E6 —
      악보가 부르는 음과 거의 안 겹친다. 그래서 '지속음' 을 달라고 해도
      농현 녹음이 대신 나오고, 결국 계속 떤다.
      없는 걸 만들지 말고, 있는 녹음의 **흔들림만 펴서** 쓴다."""
    n = len(x)
    hop = max(64, int(hop_ms / 1000 * SR))
    win = int(0.040 * SR)
    if n < win * 2:
        return x
    mono = x.mean(1) if x.ndim > 1 else x
    lo, hi = int(SR / fmax), int(SR / fmin)
    f0 = []
    for i in range(0, n - win, hop):
        w = mono[i:i + win] - mono[i:i + win].mean()
        if np.max(np.abs(w)) < 1e-4:
            f0.append(np.nan); continue
        ac = np.correlate(w, w, "full")[win - 1:]
        seg = ac[lo:hi]
        f0.append(SR / (lo + int(np.argmax(seg))) if len(seg) and seg.max() > 0 else np.nan)
    f0 = np.array(f0, float)
    good = ~np.isnan(f0)
    if good.sum() < 4:
        return x
    med = float(np.median(f0[good]))
    f0[~good] = med
    # 옥타브 오검출 접기
    f0 = np.where(f0 > med * 1.5, f0 / 2, np.where(f0 < med * 0.67, f0 * 2, f0))
    cents = -1200.0 * np.log2(np.clip(f0, 1e-6, None) / med)
    cents = np.clip(cents, -250, 250)
    full = np.interp(np.arange(n), np.arange(len(cents)) * hop, cents).astype(np.float32)
    full = G.onepole_lp(full, 12.0)          # 급격한 검출 튐을 눌러 준다
    if x.ndim > 1:
        return np.stack([G.pitch_warp(x[:, c], full) for c in range(x.shape[1])], 1)
    return G.pitch_warp(x, full)


def track_f0(x, fmin=180.0, fmax=1900.0, hop_ms=20.0):
    """20ms 마다 기본 주파수(반음 단위). 못 잡은 자리는 nan."""
    n = len(x)
    hop = max(64, int(hop_ms / 1000 * SR))
    win = int(0.040 * SR)
    if n < win * 2:
        return np.zeros(0), hop
    mono = (x.mean(1) if x.ndim > 1 else x).astype(np.float64)
    lo, hi = int(SR / fmax), int(SR / fmin)
    nf = (n - win) // hop
    if nf < 1:
        return np.zeros(0), hop
    L = 1 << int(np.ceil(np.log2(win * 2)))
    F = np.stack([mono[i * hop:i * hop + win] for i in range(nf)])
    F -= F.mean(1, keepdims=True)
    amp = np.sqrt((F ** 2).mean(1))
    S_ = np.fft.rfft(F, L, axis=1)
    ac = np.fft.irfft(S_ * np.conj(S_), L, axis=1)[:, :hi + 1]
    lag = lo + np.argmax(ac[:, lo:hi], axis=1)
    f0 = SR / np.maximum(lag, 1)
    # ★약하거나 주기성이 없는 프레임은 버린다. 안 그러면 숨소리·꼬리에서
    #   엉뚱한 값이 나오고, 그 한 프레임 때문에 '음정 폭 21반음' 이 나온다.
    conf = ac[np.arange(nf), lag] / np.maximum(ac[:, 0], 1e-12)
    f0[(amp < max(1e-4, 0.08 * float(amp.max()))) | (conf < 0.35)] = np.nan
    good = ~np.isnan(f0)
    if good.sum() >= 3:
        med = float(np.median(f0[good]))
        f0 = np.where(f0 > med * 1.5, f0 / 2, np.where(f0 < med * 0.67, f0 * 2, f0))
    return 69 + 12 * np.log2(np.maximum(f0, 1e-6) / 440.0), hop


def hold_span(x, tol=0.75):
    """조각 안에서 **한 음정을 붙들고 있는 가장 긴 구간** (시작초, 끝초, 전체폭반음).

    ★낱개 녹음이라고 다 낱개가 아니다. 니라·깊은 농현 같은 시김새 시범
      녹음은 한 파일에 여러 음이 들어 있는데 색인에는 음정 하나로 적힌다 —
      실측 nira_23 은 midi 68 로 적혀 있지만 실제로는 67.5~76.0, 8.4반음짜리
      가락이다. 그걸 지속음이라 믿고 1.2초 틀면 악보에 없는 가락이 나온다.
    """
    m, hop = track_f0(x)
    if len(m) < 3:
        return 0.0, len(x) / SR, 0.0
    good = ~np.isnan(m)
    if good.sum() < 3:
        return 0.0, len(x) / SR, 0.0
    span = float(np.nanpercentile(m, 95) - np.nanpercentile(m, 5))
    best, i = (0, 0), 0
    while i < len(m):
        if not good[i]:
            i += 1
            continue
        j, ref = i, m[i]
        while j < len(m) and good[j] and abs(m[j] - ref) <= tol:
            j += 1
        if j - i > best[1] - best[0]:
            best = (i, j)
        i = max(j, i + 1)
    a, b = best
    return a * hop / SR, min(len(x), b * hop + int(0.040 * SR)) / SR, span


def steady_start(y, settle=1.5, cap=0.42, frac=0.55):
    """어택이 끝나고 **소리가 안정되는** 시각(초).

    조각마다 어택 길이가 제각각이라 '앞에서 몇 밀리초' 로는 못 맞춘다.
    실측: 국악원 대금 조각의 69%가 0.49초보다 짧아서, 길이를 보는 규칙은
    안전장치에 걸려 실제로는 거의 아무것도 못 떼어냈다.
    """
    m = np.abs(y.mean(1) if y.ndim > 1 else y).astype(np.float64)
    if len(m) < 256:
        return 0.0
    ev = G.onepole_lp(m, 45.0)
    base = float(np.median(ev[int(len(ev) * 0.35):int(len(ev) * 0.88)]))
    if base <= 1e-9:
        return 0.0
    lim = min(int(cap * SR), int(len(ev) * frac))
    if lim < 8:
        return 0.0
    i = int(np.argmax(ev[:lim]))
    th = base * settle
    while i < lim and ev[i] > th:
        i += 1
    return float(min(i, lim)) / SR


def loop_extend(x, need, head=0.35, tail=0.88, min_seg=0.055, period=0.0, flatten=True):
    """지속 구간을 크로스페이드로 이어 붙여 원하는 길이까지 늘린다.
    ★예전 판은 음원보다 긴 음을 요청받으면 **뒤에 무음을 덧대고 페이드**했다.
      그래서 긴 음이 이어지는 게 아니라 도중에 사그라들었다 —
      관악기가 숨을 놓는 것처럼 들린다. 대금은 17%, 단소는 28% 의 음이 그랬고
      모자란 양의 중앙값이 0.6초였다. 곡에서 긴 음을 못 쓴 이유가 이것이다."""
    n = len(x)
    if n >= need:
        return x
    if n < int(0.030 * SR):      # 30ms 도 안 되면 겹칠 것이 없다
        return x
    # head=0 이면 어택은 부른 쪽에서 이미 떼어냈다는 뜻 — 앞머리부터 반복해도 된다.
    a, b = int(n * head), int(n * tail)          # 어택 뒤 ~ 릴리즈 앞
    if b - a < int(min_seg * SR):
        a, b = 0, n                              # 그래도 짧으면 통째로 반복
    if period > 8:                               # 되풀이 길이를 기본 주기의 정수배로
        k = max(1, int(round((b - a) / period)))
        b2 = a + int(round(k * period))
        if a + int(min_seg * SR) <= b2 <= n:
            b = b2
    seg = x[a:b]
    # ★되풀이할 토막 자체가 안에서 커졌다 작아졌다 하면, 늘린 소리는 그 굴곡이
    #   토막 길이마다 되풀이돼 **웅웅거린다.** 큰 굴곡만 펴서 쓴다
    #   (숨소리·잔결은 그대로 — 0.9 제곱으로 부분만).
    if flatten and len(seg) > 512:
        mo = np.abs(seg.mean(1) if seg.ndim > 1 else seg).astype(np.float32)
        ev = G.onepole_lp(mo, 26.0)
        mu = float(np.mean(ev))
        if mu > 1e-7:
            w = ((mu / np.maximum(ev, mu * 0.20)) ** 0.9).astype(np.float32)
            seg = seg * (w[:, None] if seg.ndim > 1 else w)
    xf = max(2, min(int(0.030 * SR), (b - a) // 4))
    w = np.linspace(0, 1, xf, dtype=np.float32)
    if x.ndim > 1:
        w = w[:, None]
    out = [x[:b].copy()]
    cur = b
    guard = 0
    while cur < need and guard < 4000:
        nxt = seg.copy()
        prev = out[-1]
        nxt[:xf] = nxt[:xf] * w + prev[-xf:] * (1 - w)
        out[-1] = prev[:-xf]
        out.append(nxt)
        cur += (b - a) - xf
        guard += 1
    out.append(x[b:])
    return np.concatenate(out, axis=0)


def _second_attack(x):
    """한 몸짓 안의 두 번째 타점 위치(초). 없으면 0."""
    if len(x) < 2048:
        return 0.0
    f, t, Z = sps.stft(x, SR, nperseg=1024, noverlap=768)
    M = np.abs(Z)[f > 1200]              # 고역만 본다 — 북편의 저역 부풀음은 타점이 아니다
    fl = np.maximum(0, np.diff(M, axis=1)).sum(0)
    if fl.max() <= 0:
        return 0.0
    fl = fl / fl.max()
    for i in range(1, len(fl) - 1):
        if fl[i] > 0.18 and fl[i] >= fl[i - 1] and fl[i] > fl[i + 1]:
            return float(t[i])
    return 0.0


SUS_TARGET = 0.105     # 불어 내는 악기 한 음의 지속부 목표 실효값


def perceived_attack(y, thr=0.30, look=0.50, cap=0.18, dead=0.025):
    """소리가 **실제로 서는** 시각(초). 파일의 첫 표본이 아니다.

    낮은 줄은 소리가 서기까지 시간이 걸린다 — 거문고 술대 소리는 봉우리의
    30%에 이르는 데 100ms 가 걸리는데, 그 앞머리를 박에 맞춰 놓으면
    가야금·장구보다 90ms 늦게 들린다. 연주할 때 그만큼 앞당기려고 잰다.
    dead(25ms) 아래는 0 으로 본다 — 그 정도는 귀가 구별 못 한다.
    """
    m = np.abs(y.mean(1) if y.ndim > 1 else y)
    if len(m) == 0:
        return 0.0
    m = m[:int(look * SR)]
    ev = G.onepole_lp(m, 60.0)
    mx = float(ev.max())
    if mx <= 1e-9:
        return 0.0
    t = int(np.argmax(ev > mx * thr)) / SR
    return 0.0 if t < dead else float(min(t, cap))


def _onsets_hf(x, hf=700.0, min_gap=0.09, thr=0.14):
    if len(x) < 4096:
        return [0]
    f, t, Z = sps.stft(x, SR, nperseg=1024, noverlap=896)
    fl = np.maximum(0, np.diff(np.abs(Z)[f > hf], axis=1)).sum(0)
    if fl.max() <= 0:
        return [0]
    fl = fl / fl.max()
    out = [0]
    i, gap = 1, max(1, int(min_gap * SR / 128))
    while i < len(fl) - 1:
        if fl[i] > thr and fl[i] >= fl[i - 1] and fl[i] > fl[i + 1]:
            p = max(0, int(t[i] * SR) - int(0.010 * SR))
            if p - out[-1] > int(min_gap * SR):
                out.append(p)
            i += gap
        else:
            i += 1
    return out


def _align(det, canon):
    """
    검출된 음 목록(시간순)을 기준 줄 목록(오름차순)에 순서를 지키며 맞춘다.
    여분은 버린다. 반환: det 인덱스 → canon 인덱스 (없으면 None)
    농현·시김새 녹음은 음을 구부려서 검출값이 반음쯤 어긋나므로
    '값' 이 아니라 '순서' 로 맞춰야 한다.
    """
    n, m = len(det), len(canon)
    if n < m:
        return None
    INF = 1e9
    # dp[i][j] = det[:i] 를 canon[:j] 에 맞춘 최소 비용
    dp = [[INF] * (m + 1) for _ in range(n + 1)]
    bt = [[None] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0
    for i in range(n + 1):
        for j in range(m + 1):
            if dp[i][j] >= INF:
                continue
            if i < n:                                  # det[i] 버리기
                c = dp[i][j] + 1.2
                if c < dp[i + 1][j]:
                    dp[i + 1][j], bt[i + 1][j] = c, ("skip", i, j)
            if i < n and j < m:                        # det[i] ↔ canon[j]
                c = dp[i][j] + min(4.0, abs(det[i] - canon[j]))
                if c < dp[i + 1][j + 1]:
                    dp[i + 1][j + 1], bt[i + 1][j + 1] = c, ("map", i, j)
    if dp[n][m] >= INF:
        return None
    out = {}
    i, j = n, m
    while bt[i][j]:
        kind, pi, pj = bt[i][j]
        if kind == "map":
            out[pi] = pj
        i, j = (pi, pj) if kind == "skip" else (pi, pj)
    return out


def fit_tuning(canon, max_pc=5):
    """
    검출된 줄 음높이 목록을 **하나의 전역 조율 오프셋 + 정수 반음** 으로 설명한다.

    국악기는 A440 평균율이 아니다. 산조가야금 12현을 재보면 전체가 30센트쯤
    높고, 도(do)는 +45센트, 레는 +12센트 하는 식으로 음마다 편차가 다르다.
    그래서 반올림만 하면 72.52 가 C#5 로 읽히는 사고가 난다 — 실제로는
    '50센트 높게 조율된 C5' 다. 5음계라는 사실을 제약으로 넣으면 구분된다.

    반환 (정수 MIDI 목록, 전역 오프셋 반음, 평균 오차 센트)
    """
    canon = list(canon)
    best = None
    # 오프셋은 ±반음의 절반까지만 본다. 5음계는 이조해도 5음계라서
    # 범위를 넓히면 '전부 반음 올리고 -75센트' 같은 헛수가 이긴다.
    for o in np.arange(-0.49, 0.4901, 0.005):
        k = [int(round(c - o)) for c in canon]
        if len(k) != len(set(k)):                 # 두 줄이 같은 음이 되면 탈락
            continue
        if len(set(v % 12 for v in k)) > max_pc:  # 5음계를 벗어나면 탈락
            continue
        err = float(np.mean([abs(c - o - kk) for c, kk in zip(canon, k)]))
        if best is None or err < best[2]:
            best = (k, float(o), err)
    if best is None:                              # 5음계가 아니면 제약을 푼다
        o = float(np.median([c - round(c) for c in canon]))
        k = [int(round(c - o)) for c in canon]
        best = (k, o, float(np.mean([abs(c - o - kk) for c, kk in zip(canon, k)])))
    return best[0], best[1], best[2] * 100


def repair_pitches(entries):
    """
    한 악기의 녹음은 결국 **정해진 줄** 위에 떨어진다.
    ① 가장 단정한 주법(지속음)에서 줄 집합을 뽑고
    ② 나머지 파일은 '낮은 줄부터 차례로' 라는 순서로 맞춘다.
    자기상관은 배음이 센 음에서 옥타브를 헛잡고,
    농현 녹음은 음을 구부려 값이 어긋나므로 이 보정이 반드시 필요하다.
    """
    from collections import Counter, defaultdict
    by_inst = defaultdict(list)
    for e in entries:
        by_inst[e["inst"]].append(e)
    keep, fixed, dropped, tuning = [], [], [], {}
    for inst, es in by_inst.items():
        # ★줄 맞추기는 **줄 악기에만** 쓴다.
        #   가야금·거문고는 음이 줄 위에 고정돼 있어서 '낮은 줄부터 차례로' 가 성립한다.
        #   관악기는 지공을 반쯤 막아 음을 만들고, 시김새(느니르나니 같은 것)는
        #   여러 음이 미끄러지는 연주라 '한 줄에 한 음' 으로 맞출 수가 없다.
        #   억지로 맞추면 단소 음계가 D#4 A4 C5 C#5 처럼 엉뚱하게 나온다.
        if inst not in STRINGED:
            keep += es
            continue
        pitched = [e for e in es if e.get("midi") is not None]
        if len(pitched) < 6:
            keep += es
            continue
        # ── ① 기준 줄: 'sus' 주법 파일 중 가장 흔한 음 개수를 가진 것
        by_src = defaultdict(list)
        for e in pitched:
            by_src[e["src"]].append(e)
        for v in by_src.values():
            v.sort(key=lambda x: x.get("at", 0))
        sus = {k: v for k, v in by_src.items() if v[0].get("art") == "sus"} or by_src
        cnt = Counter(len(v) for v in sus.values())
        n_str = cnt.most_common(1)[0][0]
        cands = [v for v in sus.values() if len(v) == n_str]
        # 여러 후보의 중앙값으로 기준 줄을 정한다(한 파일의 오검출에 휘둘리지 않게)
        canon = [float(np.median([c[i]["midi"] for c in cands])) for i in range(n_str)]
        canon = sorted(canon)
        if len(set(round(c) for c in canon)) < 3:
            keep += es
            continue
        # ── ② 파일마다 순서로 맞추기
        lo_c, hi_c = canon[0] - 0.9, canon[-1] + 0.9
        for src, v in by_src.items():
            rep = max(1, round(len(v) / n_str))
            target = [canon[i // rep] for i in range(n_str * rep)]
            amap = _align([x["midi"] for x in v], target)
            for i, e in enumerate(v):
                if amap is not None and i in amap:
                    want = target[amap[i]]
                elif lo_c <= e["midi"] <= hi_c:
                    # 순서 맞추기가 실패한 파일(글리산도처럼 음 수가 안 맞는 것)은
                    # 값이 줄 범위 안일 때만 가장 가까운 줄로 붙인다.
                    want = min(canon, key=lambda c: abs(c - e["midi"]))
                    if abs(want - e["midi"]) > 0.9:
                        e["_drop"] = True
                        continue
                else:
                    # 줄 범위 밖 = 옥타브 오검출이거나 반쪽 조각. 쓰면 딴 악기가 된다.
                    e["_drop"] = True
                    continue
                if abs(e["midi"] - want) > 0.25:
                    fixed.append([e["src"], e.get("at"), round(e["midi"], 2), round(want, 2)])
                    e["how"] += "+줄맞춤"
                e["midi"] = float(want)
        # ── ③ 확정된 줄 집합을 '전역조율 + 정수반음' 으로 해석해 이름을 붙인다.
        #     midi 값 자체는 측정값을 그대로 둔다(그래야 재생 때 평균율로 보정된다).
        strings, off, resid = fit_tuning(canon)
        tuning[inst] = dict(strings=strings, offset_semi=round(off, 3),
                            residual_cents=round(resid, 1),
                            measured=[round(c, 2) for c in canon])
        for e in es:
            if e.pop("_drop", False):
                dropped.append((f"{e['src']} @{e.get('at')}s", "줄 순서에 맞지 않는 여분"))
            else:
                j = int(np.argmin([abs(e["midi"] - c) for c in canon]))
                e["string"] = j + 1
                e["note"] = strings[j]
                e["cents"] = round((e["midi"] - off - strings[j]) * 100, 1)
                keep.append(e)
    return keep, fixed, dropped, tuning


# ------------------------------------------------------------------ 색인 만들기
def scan(root):
    root = os.path.abspath(root)
    files = []
    for ext in ("wav", "WAV", "aif", "aiff", "AIF", "AIFF", "flac", "FLAC"):
        files += glob.glob(os.path.join(root, "**", f"*.{ext}"), recursive=True)
    files = sorted(set(files))
    entries, skipped = [], []
    os.makedirs(os.path.join(root, "_trimmed"), exist_ok=True)

    # ── 1차: 악기마다 '가장 크게 녹음된 파일' 을 먼저 찾아둔다.
    #    타악기는 한 파일이 한 타점이라, 파일마다 최대치를 0.97 로 맞추면
    #    강·중·약이 전부 같은 크기가 된다 = 세기를 지우는 짓이다.
    #    실제로 원본 쿵은 강 -0.3 / 중 -5.4 / 약 -11.6dB 인데
    #    내 처리를 거치면 셋 다 -0.3dB 가 돼 있었다.
    #    악기 하나당 배율 하나만 써서 녹음된 세기 차를 그대로 남긴다.
    ref = {}
    for p in files:
        rel = os.path.relpath(p, root)
        if rel.startswith("_trimmed"):
            continue
        inst = classify(rel)
        if inst is None:
            continue
        try:
            xr = read_wav(p, stereo=False)
        except Exception:
            continue
        ref[inst] = max(ref.get(inst, 0.0), float(np.max(np.abs(xr))))

    # ── 2차: 실제로 자르고 저장한다.
    for p in files:
        rel = os.path.relpath(p, root)
        if rel.startswith("_trimmed"):
            continue
        inst = classify(rel)
        if inst is None:
            skipped.append((rel, "악기 이름을 못 찾음"))
            continue
        try:
            xs = read_wav(p, stereo=True)          # 원본 그대로(스테레오면 스테레오)
            x = xs.mean(1) if xs.ndim > 1 else xs  # 분석·음정검출은 모노로
        except Exception as e:
            skipped.append((rel, f"읽기 실패: {e}"))
            continue
        file_peak = float(np.max(np.abs(x)))
        if file_peak < 1e-4:
            skipped.append((rel, "무음"))
            continue
        rf = room_floor(x)
        # 한 파일에 음이 여러 개면 타점마다 잘라낸다.
        # ★단, 타악기는 자르면 안 된다. 국악원 '낱개 타법' 은 **한 파일 = 한 몸짓**이다.
        #   더러러러는 0.17~2.2초에 걸친 여덟 번의 굴림이 통째로 하나의 주법인데
        #   타점마다 자르면 굴림이 아니라 덕 네 개가 된다.
        #   징은 더 심하다 — 35초 동안 한 번 친 여운이 맥놀이로 흔들리는 걸
        #   타점 65개로 읽어 여운 한복판을 58조각으로 썰어 놨었다.
        #   박도 2파일이 8조각이 돼 있었다. 전부 '친 소리' 가 아니라 '울리던 소리' 다.
        if inst in PITCHED and len(x) > int(2.5 * SR):
            # 관악기는 고역으로 타점을 잡아야 한 음씩 갈라진다
            pieces = split_notes(x, floor=rf, min_len=0.16,
                                 hf=700.0 if inst in SUSTAINING else 0.0)
        else:
            a0, b0 = trim_span(x, floor=rf)
            pieces = [(x[a0:b0], a0, b0)]
        if not pieces:
            skipped.append((rel, "쓸 만한 음을 못 찾음"))
            continue
        fname_midi = parse_note(os.path.basename(rel)) if inst in PITCHED else None
        # ★타악기는 **악기 하나당 배율 하나**. 파일마다 맞추면 강·중·약이 사라진다.
        #   가락악기는 한 파일에 음계가 통째로 들어 있어 파일별 정규화가 맞고,
        #   파일끼리의 크기 차가 '세기' 라는 근거도 없다(라벨이 안 붙어 있다).
        #   근거 있는 쪽에만 손댄다.
        norm_by = ref.get(inst, file_peak) if inst not in PITCHED else file_peak
        gain = 0.97 / max(norm_by, 1e-9)
        for pi, (seg, i0, i1) in enumerate(pieces):
            if len(seg) < int(0.02 * SR):
                continue
            pk = float(np.max(np.abs(seg)))
            if pk < 1e-4:
                continue
            # ★조각마다 정규화하면 강/중/약 녹음이 전부 같은 크기가 되어
            #   세기 층이 사라진다. 파일 전체 최대치로만 맞춘다.
            #   ★★ 그리고 이 배율은 **딱 한 번만** 곱해야 한다.
            #   (예전 판은 모노 파일에서 두 번 곱해 조용한 녹음의 어택을 잘라먹었다:
            #    최대 -27dBFS 짜리 약음 녹음이 22배 과증폭돼 표본의 18%가 잘렸다.)
            midi, conf, how = None, 0.0, "타악"
            if inst in PITCHED:
                if len(pieces) == 1 and fname_midi is not None:
                    midi, conf, how = fname_midi, 1.0, "파일명"
                else:
                    fmin, fmax = RANGE_HZ.get(inst, (55.0, 1400.0))
                    # 음정 검출에는 '파일 대비' 로 맞춘 것을 준다 —
                    # 저장 배율(악기 대비)이 바뀌어도 예전에 확정한 조율이 흔들리지 않게.
                    midi, conf = detect_pitch(seg * (0.97 / file_peak),
                                              fmin=fmin, fmax=fmax)
                    how = "자동검출"
                    if midi is not None:
                        midi = float(round(midi, 2))
                if midi is None:
                    continue                      # 음정을 못 잡은 조각은 버린다
            tag = f"__{pi:03d}" if len(pieces) > 1 else ""
            out = os.path.join(root, "_trimmed",
                               os.path.splitext(rel.replace(os.sep, "__"))[0] + tag + ".wav")
            # 저장은 원본 채널 수 그대로 (분석에 쓴 모노가 아니라).
            # 위치는 split_notes 가 준 표본 번호를 그대로 쓴다 — trim 이 깎은 만큼도 반영돼 있다.
            src_seg = (xs[i0:i1] if xs.ndim > 1 else seg) * gain
            top = float(np.max(np.abs(src_seg)))
            if top > 1.0:                          # 있을 수 없는 일이지만, 조용히 넘어가지 않는다
                skipped.append((f"{rel} @{i0/SR:.2f}s", f"진폭 초과 {top:.2f} — 배율 오류"))
                continue
            wavfile.write(out, SR, (np.clip(src_seg, -1, 1) * 32767).astype(np.int16))
            art = tag_of(rel, ARTICULATION, "sus")
            ent = dict(src=rel, wav=os.path.relpath(out, root), inst=inst,
                       midi=midi, conf=round(float(conf), 3), how=how,
                       at=round(i0 / SR, 2), peak=round(pk / file_peak, 4),
                       art=art, dyn=dyn_of(rel, inst),
                       secs=round(len(seg) / SR, 3))
            if inst in SUSTAINING:
                # ★낱개 녹음은 조각마다 **어택 세기가 제각각**이다(실측: 어택/지속 비가
                #   1.03~561, 부드러운 게 99개 센 게 13개). 그대로 이어 붙이면
                #   부드럽게 시작한 음 다음에 세게 부는 조각이 와서 툭 튄다.
                #   조각의 **지속부 크기**를 적어 두고, 이을 때 그걸로 맞춘다.
                ev = G.onepole_lp(np.abs(seg * gain), 40)
                a1, b1 = int(0.10 * SR), int(0.30 * SR)
                if len(ev) > b1:
                    ent["sus_rms"] = round(float(np.median(ev[a1:b1])), 5)
                    ent["atk"] = round(float(np.argmax(ev)) / SR, 3)
            if art == "double":
                # ★겹채(기덕)는 '기'(앞꾸밈) + '덕'(본타) 두 타다.
                #   음악에서 박에 맞춰야 하는 것은 **본타**지 앞꾸밈이 아니다.
                #   파일 앞머리를 박에 놓으면 본타가 93~145ms 늦게 떨어진다 —
                #   소박이 395ms 인 굿거리에서 그건 3분의 1박이 밀리는 것이다.
                #   본타가 시작에서 얼마나 뒤인지 적어 두고, 연주할 때 그만큼 당겨 놓는다.
                a2 = _second_attack(seg)
                if a2 > 0.02:
                    ent["anchor"] = round(a2, 4)
            if art == "roll":
                # 굴림은 한 몸짓 안에 여러 타가 들어 있고 **점점 빨라진다**
                # (국악원 더러러러: 0.37 → 0.19초 간격). 그 타점 위치를 적어 둔다.
                # 음악에 넣을 때 앞부분만 쓰면 느린 갈래 셋이 되어 굴림으로 안 들린다.
                ent["sub"] = [round(i / SR, 3) for i in onsets(seg)]
            entries.append(ent)
    entries, fixed, dropped, tuning = repair_pitches(entries)
    skipped += dropped
    idx = dict(root=root, count=len(entries), entries=entries, skipped=skipped,
               repaired=fixed, tuning=tuning)
    with open(os.path.join(root, INDEX_NAME), "w") as f:
        json.dump(idx, f, ensure_ascii=False, indent=1)
    return idx


# ------------------------------------------------------------------ 연주
class Bank:
    """색인을 읽어 악기별 음원을 들고 있다가 요청한 음높이로 연주한다."""

    def __init__(self, root, stereo=True, merge=False):
        """root 는 폴더 하나 또는 여러 개. 악기마다 따로 받으므로 폴더가 악기 수만큼 생긴다."""
        roots = [root] if isinstance(root, (str, bytes, os.PathLike)) else list(root)
        self.roots = [os.path.abspath(r) for r in roots]
        self.root = self.roots[0]
        self.by_inst = {}
        self._range = {}
        self.tuning = {}
        self.source = {}
        self.dropped_src = {}
        for rt in self.roots:
            with open(os.path.join(rt, INDEX_NAME)) as f:
                idx = json.load(f)
            self.tuning.update(idx.get("tuning", {}))
            # ★'한 음을 붙들고 있는 구간' 은 색인에 없다 — 나중에 알게 된 사실이라
            #   따로 재서 옆에 캐시해 둔다. 한 번 재면 폴더당 1초 남짓이다.
            hp = os.path.join(rt, "_hold.json")
            hold, dirty = {}, False
            if os.path.exists(hp):
                try:
                    hold = json.load(open(hp))
                except Exception:
                    hold = {}
            for e in idx["entries"]:
                x = read_wav(os.path.join(rt, e["wav"]), stereo=stereo)
                e = dict(e, _root=rt)
                if e["inst"] in SUSTAINING:
                    h = hold.get(e["wav"])
                    if h is None:
                        a_, b_, sp_ = hold_span(x)
                        h = hold[e["wav"]] = [round(a_, 3), round(b_, 3), round(sp_, 2)]
                        dirty = True
                    e["hold"] = h
                self.by_inst.setdefault(e["inst"], []).append((e.get("midi"), x, e))
                self.source.setdefault(e["inst"], set()).add(os.path.basename(rt))
            if dirty:
                try:
                    json.dump(hold, open(hp, "w"))
                except Exception:
                    pass
        # ★같은 악기가 여러 폴더에 있으면 섞지 않는다 — 산조/정악은 별개의 악기다
        if not merge:
            for inst, items in list(self.by_inst.items()):
                per = {}
                for m, x, e in items:
                    per.setdefault(e["_root"], []).append((m, x, e))
                if len(per) > 1:
                    win = max(per, key=lambda r: len(per[r]))
                    self.by_inst[inst] = per[win]
                    self.dropped_src[inst] = {os.path.basename(r): len(v)
                                              for r, v in per.items() if r != win}
                    self.source[inst] = {os.path.basename(win)}
        for k in self.by_inst:
            self.by_inst[k].sort(key=lambda t: (t[0] is None, t[0] or 0))
        # 궁/채 구분 없이 '장구' 로만 들어온 경우: 밝기로 갈라준다
        if "janggu" in self.by_inst and not (
                "janggu_gung" in self.by_inst and "janggu_chae" in self.by_inst):
            self._split_janggu()

    def _split_janggu(self):
        items = self.by_inst.pop("janggu")
        scored = []
        for midi, x, e in items:
            xm = x.mean(1) if x.ndim > 1 else x
            F = np.abs(np.fft.rfft(xm * np.hanning(len(xm)))) ** 2
            fr = np.fft.rfftfreq(len(xm), 1 / SR)
            scored.append((float((F * fr).sum() / (F.sum() + 1e-12)), midi, x, e))
        scored.sort()
        half = max(1, len(scored) // 2)
        self.by_inst.setdefault("janggu_gung", []).extend(
            [(m, x, e) for _, m, x, e in scored[:half]])
        self.by_inst.setdefault("janggu_chae", []).extend(
            [(m, x, e) for _, m, x, e in scored[half:]])

    def has(self, inst):
        return bool(self.by_inst.get(inst))

    def range(self, inst):
        """그 악기 음원이 실제로 가진 음역 (min, max) MIDI."""
        if inst in self._range:
            return self._range[inst]
        ms = [m for m, _, _ in self.by_inst.get(inst, []) if m is not None]
        self._range[inst] = (min(ms), max(ms)) if ms else None
        return self._range[inst]

    def _dist(self, inst, midi):
        """그 악기가 가진 음들 중 가장 가까운 것까지의 거리(반음)."""
        key = ("_d", inst)
        if key not in self._range:
            self._range[key] = sorted({m for m, _, _ in self.by_inst.get(inst, [])
                                       if m is not None})
        ms = self._range[key]
        return min((abs(m - midi) for m in ms), default=99.0)

    def _pick(self, inst, midi, rr=0, dur=None, amp=1.0, art=None, prefer_src=None):
        """
        음높이만 보고 고르면 안 된다 — 한 선율 안에서 지속음·끊어치기·뜯기가
        섞이면 악기 소리로 들리지 않는다. 주법과 세기를 먼저 맞추고
        그 안에서 가장 가까운 음높이를 고른다.
        """
        cands = self.by_inst.get(inst)
        if not cands:
            return None
        if midi is None:
            # 타악. 예전에는 그냥 돌아가며 뽑았는데, 그러면
            #  ① 강/중/약 녹음이 세기와 무관하게 나오고(장단의 강약이 사라진다)
            #  ② 굴림(더러러러)·양손(덩) 같은 특수 타법이 단타 자리에 섞인다.
            # 세기를 먼저 맞추고, 특수 타법은 따로 부를 때만 쓰도록 벌점을 준다.
            want = "loud" if amp >= 0.72 else ("mid" if amp >= 0.38 else "qui")
            SPECIAL = {"roll", "both", "double", "soft"}

            def pscore(c):
                meta = c[2]
                s = 0.0
                if meta.get("dyn") != want:
                    s += 4.0
                a = meta.get("art")
                if art:
                    if a != art:
                        s += 10.0
                        if any({a, art} <= g for g in ART_KIN):
                            s -= 7.0
                elif a in SPECIAL:
                    s += 6.0          # 지정 없이 특수 타법이 끼어드는 걸 막는다
                return s
            best = min(pscore(c) for c in cands)
            pool = [c for c in cands if pscore(c) <= best + 0.01]
            return pool[rr % len(pool)]
        withp = [c for c in cands if c[0] is not None]
        if not withp:
            return cands[rr % len(cands)]
        # 원하는 주법: 지정이 없으면 음 길이로 정한다
        if art is None:
            art = "staccato" if (dur is not None and dur < 0.5) else \
                  ("pluck" if (dur is not None and dur < 1.3) else "sus")
        # 원하는 세기
        dyn = "loud" if amp >= 0.75 else ("mid" if amp >= 0.4 else "qui")

        def score(c):
            m, x, meta = c
            # 음높이가 최우선. 1.5반음을 넘어가면 벌점이 제곱으로 커져서
            # 어떤 주법 벌점보다도 무거워진다 — 실제 연주에서 '주법을 맞추려고
            # 4반음 틀린 음을 내는' 일은 없기 때문이다.
            d = abs(m - midi)
            # 음정이 주법을 이겨야 한다. 반음 안쪽이면 주법을 우선하되,
            # 그 밖으로 나가면 급격히 비싸진다 — 억지로 늘린 음은 그 악기가 아니다.
            # (무릎을 1.5→0.55 로 당기고 기울기를 6→14 로 세웠다.
            #  예전 값에서는 '청성' 하나 얻자고 1.36반음을 늘리는 일이 생겼다.)
            s = d + max(0.0, d - 0.55) ** 2 * 14.0
            # ★이어 부는 음은 **같은 녹음**에서 뽑는다. 이웃한 음이 서로 다른
            #   파일에서 오면 숨소리·울림·방이 매 음마다 바뀌어, 한 사람이 부는
            #   것이 아니라 조각을 붙인 것처럼 들린다.
            # ★한 음정을 붙들고 있는 대목이 요청 길이에 한참 못 미치는 조각은
            #   길게 끄는 음에 쓰면 안 된다 — 늘리다 못해 아주 조용한 대목까지
            #   끌어와, 실측으로 마지막 음이 0.26초 뒤부터 -35dB 로 가라앉았다.
            h = meta.get("hold")
            if h and inst in SUSTAINING and dur:
                need = min(float(dur), 1.2)
                s += 14.0 * float(np.clip(1.0 - (h[1] - h[0]) / max(need, 0.05), 0, 1)) ** 1.6
            if prefer_src is not None and meta.get("src") == prefer_src:
                s -= 1.6
            a = meta.get("art")
            if a != art:
                # ★작곡 쪽에서 "지속음" 을 지정했으면 그건 지켜야 한다.
                #   예전 벌점(8점)으로는 음정이 딱 맞는 농현 조각이 늘 이겨서,
                #   지속음을 달라고 해도 79음 중 38음이 농현으로 나갔다.
                #   지속음은 12조각뿐이라 몇 반음 늘려 써야 하지만, 그게 맞다.
                s += 40.0
                if any({a, art} <= g for g in ART_KIN):
                    s -= 5.5                               # 사촌 주법이면 벌점을 깎는다
            if meta.get("dyn") != dyn:
                s += 1.5
            if meta.get("secs", 9) < 0.6:
                s += 3.0                                   # 너무 짧게 잘린 조각은 뒤로
            return s
        best = min(withp, key=score)
        # 같은 점수대가 여럿이면 돌아가며 써서 기계 반복을 줄인다
        bs = score(best)
        tie = [c for c in withp if score(c) <= bs + 0.01]
        return tie[rr % len(tie)] if len(tie) > 1 else best

    def note(self, inst, midi, dur, amp=1.0, vib_cents=0.0, vib_rate=4.6,
             vib_delay=0.25, bend_end=0.0, rr=0, release=0.09, art=None, ring=0.9,
             legato=0.0, prefer_src=None):
        """
        inst 의 음원 하나를 골라 midi 음높이로 리샘플링해 dur 초만큼 연주.
        vib_cents/bend_end 는 농현·요성·퇴성 (가변 리샘플링으로 건다).
        """
        G.LAST_ANCHOR = 0.0
        G.LAST_ENTRY, G.LAST_SKIP = "head", 0.0
        # 악기의 실제 음역 밖을 요구하면 옥타브를 접어 넣는다.
        # 정악가야금은 D#2~G#4 뿐이라 G5 를 달라고 하면 11반음을 억지로 올려야 하는데,
        # 그건 실물에 없는 소리다. 옥타브를 내려 잡는 편이 음악적으로도 맞다.
        if midi is not None:
            rng_ = self.range(inst)
            if rng_:
                lo, hi = rng_
                while midi > hi + 2:
                    midi -= 12
                while midi < lo - 2:
                    midi += 12
                # 줄이 12개뿐이라 낮은 쪽은 듬성듬성하다(G2·C3·D3 뿐, A2 는 없다).
                # 없는 음을 억지로 2반음 늘려 쓰면 통 울림까지 같이 늘어나 다른 악기가 된다.
                # 연주자가 실제로 하는 일은 그게 아니라 **한 옥타브 옮겨 짚는 것**이다.
                d0 = self._dist(inst, midi)
                if d0 > 1.2:
                    for alt in (midi + 12, midi - 12):
                        if lo - 2 <= alt <= hi + 2 and self._dist(inst, alt) < min(0.6, d0):
                            midi, d0 = alt, self._dist(inst, alt)
        got = self._pick(inst, midi, rr, dur=dur, amp=amp, art=art, prefer_src=prefer_src)
        if got is None:
            return None
        s_midi, x, meta = got
        G.LAST_ANCHOR = float(meta.get("anchor", 0.0) or 0.0)
        G.LAST_SRC = meta.get("src")
        # 고른 음원이 이미 진짜 농현/시김새 녹음이면 합성 흔들림을 얹지 않는다.
        # 두 번 흔들면 멀미난다 — 실제로 이전 판이 그래서 어지러웠다.
        # ★타악기: 세기를 두 번 먹이지 않는다.
        #   악보의 v 는 '얼마나 세게 치나' 다. 그런데 이제 _pick 이 그 v 로
        #   강/중/약 **녹음을 고르고**, 고른 녹음은 이미 그만큼 작게 녹음돼 있다.
        #   거기에 v 를 볼륨으로 또 곱하면 여린 타점이 두 번 작아져 안 들린다
        #   (더/약은 녹음이 -16dB 인데 볼륨까지 0.25 를 곱하면 -28dB).
        #   고른 칸의 대표 세기로 나눠, 남는 차이만 볼륨으로 준다.
        if midi is None:
            nom = {"loud": 0.86, "mid": 0.55, "qui": 0.25}.get(str(meta.get("dyn")))
            if nom:
                amp = float(np.clip(amp / nom, 0.4, 1.6))
        # ★굴림(더러러러)은 '어디부터 트느냐' 가 곧 빠르기다.
        #   국악원 녹음은 시범이라 0.37초 간격으로 느리게 시작해 0.19초까지 빨라진다.
        #   맨 앞부터 틀고 자리가 모자라 끊으면 느린 세 타 = 그냥 덕 셋이 된다.
        #   자리를 채울 수 있는 **가장 늦은 타점**에서 들어가면 빨라진 대목이 울린다.
        #   자르는 위치는 반드시 타점 위 — 소리 한복판을 자르면 딸깍거린다.
        sub = meta.get("sub")
        if sub and midi is None and len(x) > 0:
            need = dur * 0.85
            cands = [t for t in sub if len(x) / SR - t >= need]
            if cands:
                pk0 = float(np.max(np.abs(x))) + 1e-9
                x = x[int(max(cands) * SR):]
                # ★굴림은 뒤로 갈수록 잦아든다. 빠른 대목을 쓰려고 뒤에서 들어가면
                #   그만큼 작아져서 안 들린다 — 실제로 그랬다.
                #   같은 녹음의 뒷부분을, 앞부분과 같은 크기로 되돌려 놓는다.
                pk1 = float(np.max(np.abs(x))) + 1e-9
                x = x * min(4.0, pk0 / pk1)
        # ★색인은 이 조각을 음정 하나로 적어 놨지만, 실제로는 여러 음이 든
        #   시김새 시범 녹음일 수 있다(실측 nira_23: 적힌 midi 68, 실제 67.5~76.0).
        #   **한 음정을 붙들고 있는 대목**만 떼어 쓴다.
        hd = meta.get("hold")
        if hd and inst in SUSTAINING and len(x) > int(0.12 * SR):
            ha, hb = int(hd[0] * SR), int(hd[1] * SR)
            if legato <= 0 and hd[0] < 0.15:
                ha = 0                      # 새로 부는 음은 어택을 살린다
            if hb - ha >= int(0.09 * SR):
                x = x[ha:hb]
        got_art = str(meta.get("art", ""))
        if art == "sus" and got_art != "sus" and inst in SUSTAINING:
            x = flatten_pitch(x)
            got_art = "sus"
        if got_art.startswith(("nong", "gul", "jeon")):
            vib_cents = 0.0
        if got_art.startswith(("chu", "toe", "gliss")):
            vib_cents = 0.0
            bend_end = 0.0          # 밀어올림·끌어내림이 이미 녹음 안에 들어 있다
        y = x
        if s_midi is not None and midi is not None:
            ratio = 2 ** ((midi - s_midi) / 12.0)
            if abs(ratio - 1.0) > 1e-4:
                fr = Fraction(1 / ratio).limit_denominator(220)
                y = sps.resample_poly(y, fr.numerator, fr.denominator,
                                      axis=0).astype(np.float32)
        y_full = y                      # 붙든 구간을 고집하다 모자랄 때 쓸 예비
        # 실제 악기는 손을 떼도 한동안 운다. 요청 길이에서 뚝 자르면 가짜로 들린다.
        # ★이어 부는 음은 **어택을 잘라내고** 앞 음 꼬리에 겹쳐 넣는다.
        #   관악기는 한 숨 안에서 음을 바꿀 때 다시 불지 않는다 — 손가락만 바꾼다.
        #   그런데 국악원 낱개 녹음은 음마다 숨 어택이 붙어 있어서, 그대로 이으면
        #   한 프레이즈 안에서 열 번을 다시 부는 꼴이 된다.
        # ★지속악기는 **조각의 중간**(지속부)에서 떼어 쓴다.
        #   앞머리를 쓰면 조각마다 제각각인 어택이 그대로 묻어난다 —
        #   실측으로 어택/지속 비가 1.03~561, 최대 55dB 차이였다.
        #   중간은 이미 안정된 소리라 그 편차가 아예 없다.
        # ★**앞 음에 이어지는 음만** 조각의 중간(지속부)에서 떼어 쓴다.
        #   거꾸로 **쉬었다가 처음 나오는 음**은 어택이 있어야 맞다 — 숨을
        #   새로 넣는 자리다. 거기까지 중간부터 떼면 소리가 허공에서 스르르
        #   생겨나 관악기로 안 들린다.
        per = SR / G.mtof(midi) if midi is not None else 0.0   # 목표 음 한 주기
        if inst in SUSTAINING and legato > 0:
            s0 = steady_start(y)
            body = y[int(s0 * SR):]
            if len(body) >= int(0.09 * SR):
                y = body
                G.LAST_ENTRY, G.LAST_SKIP = "mid", s0
                y = loop_extend(y, int((dur + ring) * SR) + int(0.05 * SR),
                                head=0.0, period=per)
            # ★이어 부는 음은 **앞 음과 겹쳐 건너간다.** 0 에서 14ms 만에 솟구치면
            #   그 자체가 혀로 끊어 부는 소리다 — 조각의 어택을 떼어내도
            #   페이드인이 어택을 새로 만든다. 앞 음의 페이드아웃과 **에너지가
            #   더해 1이 되는 곡선**으로 맞물리면 건너가는 동안 크기가 그대로다.
            fi = int(max(legato, 0.014) * SR)
            if fi > 4 and len(y) > fi:
                u = np.linspace(0.0, 1.0, fi, dtype=np.float32)
                w = np.sqrt(0.5 - 0.5 * np.cos(np.pi * u)).astype(np.float32)
                y[:fi] = y[:fi] * (w[:, None] if y.ndim > 1 else w)
        elif legato > 0 and len(y) > int(0.12 * SR):
            sk = int(min(0.09, max(0.030, float(meta.get("atk", 0.04)) + 0.020)) * SR)
            y = y[sk:]
            fi = int(min(legato, 0.014) * SR)
            if fi > 4:
                w = np.linspace(0, 1, fi, dtype=np.float32) ** 0.6
                y[:fi] = y[:fi] * (w[:, None] if y.ndim > 1 else w)
        n = int((dur + ring) * SR)
        # ★숨으로 이어 내는 악기는 음원이 짧다고 소리가 끊길 이유가 없다.
        #   지속 구간을 겹쳐 이어 붙여 요청한 길이만큼 실제로 이어지게 한다.
        if inst in SUSTAINING and len(y) < int((dur + ring) * SR):
            y = loop_extend(y, int((dur + ring) * SR) + int(0.05 * SR), period=per)
        if len(y) < n and inst in SUSTAINING:
            # ★여기서 무음을 덧대면 **음이 도중에 뚝 끊긴다.** 실측: 마지막 음이
            #   2.37초짜리인데 0.26초 만에 -55dB 로 떨어져 나머지가 통째로 비었다.
            #   쓸 만한 대목이 짧아 늘리기가 손을 든 경우다. 그럴 땐 붙든 대목을
            #   고집하지 말고 **조각 전체**로 다시 늘린다. 그래도 모자라면
            #   그냥 이어 붙인다 — 어떤 경우에도 무음으로 끝나지 않게.
            y = loop_extend(y, n + int(0.05 * SR), head=0.0, period=per)
            if len(y) < n and len(y_full) > len(y):
                y = loop_extend(y_full, n + int(0.05 * SR), head=0.0, period=per)
            if len(y) < n and len(y) > 8:
                xf2 = max(2, min(int(0.020 * SR), len(y) // 4))
                w2 = np.linspace(0, 1, xf2, dtype=np.float32)
                if y.ndim > 1:
                    w2 = w2[:, None]
                out, cur = [y.copy()], len(y)
                while cur < n and len(out) < 4000:
                    nx = y.copy()
                    nx[:xf2] = nx[:xf2] * w2 + out[-1][-xf2:] * (1 - w2)
                    out[-1] = out[-1][:-xf2]
                    out.append(nx)
                    cur += len(y) - xf2
                y = np.concatenate(out, axis=0)
        if len(y) < n:
            y = np.pad(y, ((0, n - len(y)),) + ((0, 0),) * (y.ndim - 1))
        else:
            y = y[:n].copy()
        if vib_cents or bend_end:
            t = np.arange(len(y)) / SR
            cents = np.zeros(len(y), np.float32)
            if vib_cents:
                ramp = np.clip((t - vib_delay) / 0.35, 0, 1)
                cents += vib_cents * ramp * np.sin(2 * np.pi * vib_rate * t)
            if bend_end:
                k = int(min(0.35, dur * 0.4) * SR)
                if k > 4:
                    cents[-k:] += bend_end * np.linspace(0, 1, k) ** 1.4
            if y.ndim > 1:
                y = np.stack([G.pitch_warp(y[:, c], cents) for c in range(y.shape[1])], 1)
            else:
                y = G.pitch_warp(y, cents)
        # 파일 안에서의 상대 세기를 유지하되, 조각 검출 편차가 그대로 음량차가
        # 되지 않도록 제곱근으로 완만하게 (0.21 → 0.46)
        y = y * float(meta.get("peak", 1.0) or 1.0) ** 0.5
        # ★이어 부는 음은 **지속부 크기**를 하나로 맞춘다. 봉우리(어택)로 맞추면
        #   부드러운 조각과 센 조각이 섞여 이음새에서 튄다 — 최대 55dB 차이였다.
        # ★불어 내는 악기는 **완성된 소리를 직접 재서** 크기를 맞춘다.
        #   색인의 sus_rms 는 원본 조각을 잰 값인데, 그 뒤로 중간부터 떼어 쓰고
        #   늘리고 음정도 옮기므로 실제 울리는 크기와 다르다 — 그래서 이음새마다
        #   최대 20dB 씩 튀었다. 0.85 제곱, 다 눌러 버리면 기계가 된다.
        if inst in SUSTAINING:
            k0, k1 = int(0.05 * SR), int(min(max(dur, 0.22), 0.45) * SR)
            sg = y[k0:k1]
            if len(sg) > 256:
                r_ = float(np.sqrt(np.mean(
                    (sg.mean(1) if sg.ndim > 1 else sg).astype(np.float64) ** 2)))
                if r_ > 1e-5:
                    # ★한계를 3.5배로 묶어 두면 **아주 조용한 대목을 떼어 온 음**은
                    #   끝까지 못 올라온다 — 실측: 마지막 음이 0.26초 뒤부터
                    #   -35dB 로 가라앉아 사라진 것처럼 들렸다. 12배까지 허용한다.
                    y = y * float(np.clip((SUS_TARGET / r_) ** 0.85, 0.30, 12.0))
        elif legato > 0:
            sr_ = float(meta.get("sus_rms", 0.0) or 0.0)
            if sr_ > 1e-5:
                y = y * float(np.clip(0.16 / sr_, 0.35, 2.8))
        # 여운 구간은 서서히 사그라들게 (급정지 금지)
        k = int(dur * SR)
        tail = len(y) - k
        # ★여운이 짧을 때(뒤에 바로 다음 음이 붙는 자리)는 **넘겨주는 자리** 지
        #   사그라드는 자리가 아니다. 감쇠 곡선(**1.8)을 쓰면 20ms 만에 -20dB 로
        #   떨어져 다음 음이 서기 전에 **소리가 끊긴다** — 실측: 이음새마다
        #   완전 무음이 20ms. 그 구멍이 '이어붙인 티' 였다.
        if tail > 8:
            u = np.linspace(0.0, 1.0, tail)
            fade = (np.sqrt(0.5 + 0.5 * np.cos(np.pi * u)) if tail < int(0.12 * SR)
                    else u[::-1] ** 1.8).astype(np.float32)
            y[k:] = y[k:] * (fade[:, None] if y.ndim > 1 else fade)
        if legato <= 0 and inst not in SUSTAINING:
            a = int(0.0015 * SR)
            ramp = np.linspace(0, 1, a)
            y[:a] = y[:a] * (ramp[:, None] if y.ndim > 1 else ramp)
        # ★박에 맞춰야 하는 것은 파일의 첫 표본이 아니라 **귀가 잡는 어택**이다.
        #   거문고는 73Hz 저음이라 봉우리의 30%에 이르는 데 100ms 가 걸린다 —
        #   가야금(7.6ms)·장구(6.1ms) 옆에서 그건 89ms 늦게 들린다.
        G.LAST_ANCHOR = perceived_attack(y)
        return (y * amp).astype(np.float32)


# ------------------------------------------------------------------ 합성음 대체
class Voices:
    """
    악기별로 '샘플이 있으면 샘플, 없으면 합성음' 을 돌려주는 얇은 층.
    작곡 코드는 이 객체만 보면 되므로 음원 유무에 따라 코드를 고칠 필요가 없다.
    """

    def __init__(self, bank=None):
        self.bank = bank
        self._rr = {}

    def _next_rr(self, key):
        v = self._rr.get(key, 0)
        self._rr[key] = v + 1
        return v

    def src(self, inst):
        return "샘플" if (self.bank and self.bank.has(inst)) else "합성"

    def pitched(self, inst, freq, dur, amp=1.0, **kw):
        midi = 69 + 12 * np.log2(max(1e-6, freq) / 440.0)
        if self.bank and self.bank.has(inst):
            y = self.bank.note(inst, midi, dur, amp,
                               vib_cents=kw.get("vib_cents", kw.get("nonghyeon", 0.0)),
                               bend_end=kw.get("bend_end", kw.get("bend", 0.0)),
                               rr=self._next_rr(inst))
            if y is not None:
                return y
        fn = dict(gayageum=G.gayageum, geomungo=G.geomungo, daegeum=G.daegeum,
                  danso=G.danso, piri=G.piri)[inst]
        if inst in ("gayageum", "geomungo"):
            return fn(freq, dur, amp, seed=kw.get("seed"),
                      **({"nonghyeon": kw.get("nonghyeon", 0.0),
                          "bend": kw.get("bend", 0.0)} if inst == "gayageum" else {}))
        return fn(freq, dur, amp, seed=kw.get("seed"),
                  vib_cents=kw.get("vib_cents", 30), bend_end=kw.get("bend_end", 0))

    def perc(self, inst, dur, amp=1.0, **kw):
        if self.bank and self.bank.has(inst):
            y = self.bank.note(inst, None, dur, amp, rr=self._next_rr(inst))
            if y is not None:
                return y
        fn = dict(janggu_gung=G.janggu_gung, janggu_chae=G.janggu_chae, buk=G.buk,
                  jing=G.jing, kkwaenggwari=G.kkwaenggwari, bak=G.bak)[inst]
        return fn(dur, amp, seed=kw.get("seed"))


# ------------------------------------------------------------------ 작곡 코드에 끼워넣기
def plan_octaves(score, bank, insts=None):
    """악기마다 성부 전체를 몇 옥타브 옮겨야 실제 음역 안에 들어오는지 정한다.
    음마다 따로 접으면 선율선이 튀어 곡이 망가진다."""
    f2m = lambda f: 69 + 12 * np.log2(max(1e-6, f) / 440.0)
    per = {}
    for notes in (score.values() if isinstance(score, dict) else [score]):
        for e in notes:
            if e.get("freq"):
                per.setdefault(e["inst"], []).append(f2m(e["freq"]))
    out = {}
    for inst, ps in per.items():
        if insts and inst not in insts:
            continue
        rng_ = bank.range(inst)
        if not rng_ or not ps:
            continue
        lo, hi = rng_
        ps = np.asarray(ps)
        best, bestn = 0, -1
        for k in range(-3, 4):
            q = ps + 12 * k
            inside = int(((q >= lo - 1.5) & (q <= hi + 1.5)).sum())
            if inside > bestn or (inside == bestn and abs(k) < abs(best)):
                best, bestn = k, inside
        if best:
            out[inst] = best
    return out


def install(bank, modules, octaves=None):
    """
    compose / arirang 모듈의 악기 이름을 '샘플 우선' 판으로 갈아끼운다.
    함수 서명은 그대로라 작곡 코드는 한 줄도 고치지 않는다.
    음원이 없는 악기는 원래 합성 함수가 그대로 쓰인다.
    반환값: 무엇이 샘플로 바뀌었는지 dict.
    """
    used = {}
    rr = {"n": 0}

    def next_rr():
        rr["n"] += 1
        return rr["n"]

    def choose_art(inst, dur, nong, bend, have):
        """
        작곡 코드는 '농현 26센트' 같은 **의도**만 말한다.
        그 의도에 맞는 **실제 연주 녹음**이 있으면 그걸 고르고, 없을 때만 흉내낸다.
        산조가야금에는 얕은/깊은/꺾는 농현·추성·퇴김·굴림이 통째로 녹음돼 있다.
        """
        def ok(a):
            return a in have
        # ① 음을 끌어내리거나 밀어올리라는 지시가 먼저다.
        #    산조에서 악구 끝의 퇴성은 농현보다 더 성격이 뚜렷한 몸짓이다.
        if bend <= -20 and ok("toegim"):        # 퇴성 — 끝을 끌어내림
            return "toegim"
        if bend >= 20 and ok("chuseong"):       # 추성 — 밀어올림
            return "chuseong"
        # ② 농현. 긴 음일수록 깊게 — 국악에서 긴 음을 곧게 뻗는 일은 거의 없다.
        if nong >= 22 and ok("nong_deep"):
            return "nong_deep"
        if nong >= 8 and dur is not None and dur >= 2.6 and ok("nong_deep"):
            return "nong_deep"
        if nong >= 8 and ok("nong_shallow"):
            return "nong_shallow"
        if dur is not None and dur < 0.5 and ok("staccato"):
            return "staccato"
        return "sus" if ok("sus") else None

    arts_of = {}
    for k, v in bank.by_inst.items():
        arts_of[k] = {m[2].get("art") for m in v}

    octaves = octaves or {}

    def wrap_pitched(inst, orig):
        have = arts_of.get(inst, set())
        oct_shift = 12 * octaves.get(inst, 0)

        def f(freq, dur, amp=1.0, **kw):
            midi = 69 + 12 * np.log2(max(1e-6, freq) / 440.0) + oct_shift
            nong = float(kw.get("vib_cents", kw.get("nonghyeon", 0.0)) or 0.0)
            bend = float(kw.get("bend_end", kw.get("bend", 0.0)) or 0.0)
            # 작곡 쪽에서 시김새를 **직접 지정**하면 그것을 따른다.
            # 아래 choose_art 는 농현 깊이/꺾기 값만 보고 어림잡는 것이라
            # 청성·굴림·글리산도·전성·슬기둥처럼 '값' 으로 표현되지 않는 주법에는
            # 영영 닿지 못한다 — 국악원이 준 녹음의 절반이 그래서 놀고 있었다.
            want = kw.get("art")
            art = want if (want and want in have) else choose_art(inst, dur, nong, bend, have)
            y = bank.note(inst, midi, dur, amp, art=art,
                          vib_cents=nong,
                          vib_rate=float(kw.get("vib_rate", 4.6)),
                          vib_delay=float(kw.get("vib_delay", 0.25)),
                          bend_end=bend, rr=next_rr(),
                          legato=float(kw.get("legato", 0.0) or 0.0),
                          prefer_src=kw.get("prefer_src"),
                          ring=float(kw.get("ring", 0.9)))
            if y is not None:
                return y
            # 합성음으로 떨어질 때는 art 를 떼고 넘긴다(합성 쪽은 모르는 인자다)
            skip = ("art", "legato", "prefer_src", "ring")
            return orig(freq, dur, amp, **{k: v for k, v in kw.items() if k not in skip})
        return f

    def wrap_perc(inst, orig):
        def f(dur=0.5, amp=1.0, **kw):
            # art 를 그대로 넘긴다 — 덩(양손)·굴림처럼 실제 녹음이 있는 타법을
            # 작곡 쪽에서 지정해 쓸 수 있어야 한다.
            y = bank.note(inst, None, dur, amp, rr=next_rr(), art=kw.get("art"),
                          ring=kw.get("ring", 0.9))
            drop = ("art", "ring")
            return y if y is not None else orig(dur, amp,
                                                **{k: v for k, v in kw.items() if k not in drop})
        return f

    PITCH = ["gayageum", "geomungo", "daegeum", "danso", "piri"]
    PERC = ["janggu_gung", "janggu_chae", "buk", "jing", "kkwaenggwari", "bak"]
    for inst in PITCH + PERC:
        if not bank.has(inst):
            used[inst] = "합성"
            continue
        used[inst] = "샘플"
        for mod in modules:
            if not hasattr(mod, inst):
                continue
            orig = getattr(G, inst)
            setattr(mod, inst,
                    wrap_pitched(inst, orig) if inst in PITCH else wrap_perc(inst, orig))
    return used


# ------------------------------------------------------------------ CLI
def report(idx):
    from collections import defaultdict
    per = defaultdict(list)
    for e in idx["entries"]:
        per[e["inst"]].append(e)
    print(f"\n음원 {idx['count']}개  ({idx['root']})\n")
    print(f"{'악기':14s} {'개수':>4s}  {'음역':>18s}  판별")
    print("-" * 62)
    NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    nm = lambda m: f"{NOTE[int(round(m)) % 12]}{int(round(m))//12 - 1}"
    for inst in sorted(per):
        es = per[inst]
        ms = [e["midi"] for e in es if e["midi"] is not None]
        rng = f"{nm(min(ms))} ~ {nm(max(ms))}" if ms else "(타악)"
        hows = {}
        for e in es:
            hows[e["how"]] = hows.get(e["how"], 0) + 1
        low = [e for e in es if e["midi"] is not None and e["conf"] < 0.55]
        warn = f"  ⚠신뢰도낮음 {len(low)}" if low else ""
        print(f"{inst:14s} {len(es):4d}  {rng:>18s}  "
              f"{' '.join(f'{k}{v}' for k, v in hows.items())}{warn}")
        arts = {}
        for e in es:
            arts[e.get("art", "sus")] = arts.get(e.get("art", "sus"), 0) + 1
        print("               주법: " + ", ".join(
            f"{ART_NAME_KO.get(a, a)} {n}" for a, n in sorted(arts.items(), key=lambda t: -t[1])))
        t = idx.get("tuning", {}).get(inst)
        if t:
            print(f"               조율: {' '.join(nm(s) for s in t['strings'])}   "
                  f"전역 {t['offset_semi']*100:+.0f}센트 (A≈{440*2**(t['offset_semi']/12):.1f}Hz) "
                  f"· 잔차 {t['residual_cents']:.0f}센트")
    if idx["skipped"]:
        print(f"\n건너뜀 {len(idx['skipped'])}개:")
        for rel, why in idx["skipped"][:15]:
            print(f"  - {rel}  ({why})")


if __name__ == "__main__":
    import sys
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    root = sys.argv[2] if len(sys.argv) > 2 else "samples"
    if cmd == "scan":
        report(scan(root))
    else:
        with open(os.path.join(os.path.abspath(root), INDEX_NAME)) as f:
            report(json.load(f))
