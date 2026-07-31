"""
motif.py — 음을 무작위로 걷는 대신, **동기 하나를 정해 놓고 풀어가는** 작곡 엔진.

예전 `Melodist` 는 음계 위를 확률로 걸었다. 그래서 매번 다른 선율이 나왔지만
어느 것도 기억에 남지 않았다. 기억에 남으려면 **같은 것이 돌아와야** 한다.

여기서 하는 일은 둘이다.

 ① 동기(動機) 전개 — 짧은 주제를 정하고, 되풀이·자리옮김·늘이기·줄이기·조각내기로
    곡 전체를 그 하나에서 길러낸다.

 ② 시김새 문법 — 국악에서 변주는 '음을 바꾸는 것' 이 아니라
    **같은 음을 어떻게 흔들고 밀고 꺾느냐** 다. 산조가야금 12현에는 음마다
    농현·추성·퇴성·굴림이 따로 녹음돼 있는데, 지금까지는 그걸 아무렇게나 골랐다.
    음계 자리마다 붙는 시김새는 정해져 있다 — 그 규칙을 여기 적는다.
"""
import numpy as np

# ─────────────────────────────────────────────────────────── 음계
# 도(degree)는 5음계 안에서의 자리. 0=궁, 1=상, 2=각, 3=치, 4=우, 5=궁'(한 옥타브 위)
PYEONGJO = [0, 2, 5, 7, 9]      # 평조 — 궁 G 면 G A C D E (산조가야금 12현과 같다)
GYEMYEONJO = [0, 3, 5, 7, 10]   # 계면조 — 본청 A 면 A C D E G


def deg_midi(root, mode, deg):
    o, i = divmod(int(deg), len(mode))
    return root + 12 * o + mode[i]


# ─────────────────────────────────────────────────────── 시김새 문법
# (농현 깊이[센트], 꺾기[센트]).  꺾기 음수 = 퇴성(끝을 끌어내림), 양수 = 추성(밀어올림).
# sampler.choose_art 가 이 두 값을 보고 실제 국악원 녹음을 고른다.
#
# 평조: 담백하다. 농현이 얕고, 곧게 뻗는 음이 있어도 된다.
# 계면조: 짙다. 본청은 굵게 떨고, 3음은 꺾어 내리고, 5음은 밀어 올린다.
SIGIMSAE = {
    "pyeongjo": {
        0: (8, 0),      # 궁 — 뿌리. 얕게만.
        1: (10, 0),     # 상
        2: (14, 0),     # 각
        3: (10, 0),     # 치 — 평조의 두 번째 축
        4: (16, +18),   # 우 — 위로 밀어 올리는 성질
    },
    "gyemyeonjo": {
        0: (26, 0),     # 본청 — 굵은 농현. 계면조의 얼굴.
        1: (30, -22),   # 3음 — 꺾어 내린다
        2: (12, 0),     # 4음 — 지나가는 자리
        3: (18, +22),   # 5음 — 밀어 올린다
        4: (24, -18),   # b7 — 내려 꺾어 본청으로
    },
}


# 악기마다 실제로 녹음돼 있는 주법이 다르다. 자리(role)에 맞는 주법을 여기서 고른다.
# 왼쪽이 우선. 그 악기에 없는 주법은 sampler 가 알아서 건너뛴다.
VOCAB = {
    # ★깊은 농현을 기본으로 두면 안 된다. 그건 ±100센트를 5Hz 로 흔드는 주법이라
    #   모든 음에 걸면 선율이 쉬지 않고 떨어 '속사포' 처럼 들린다.
    #   실측: 79음 중 76음이 깊은 농현이었다. 긴 음과 맺음에만 아껴 쓴다.
    # ★지금은 **지속음만** 쓴다. 농현·시김새 녹음은 조각마다 흔들림이 제각각이라
    #   이어 붙이면 떨다 말다 한다. 기준점을 먼저 만들고, 거기서 하나씩 얹는다.
    "daegeum":  {"cadence": ["sus"],
                 "peak":    ["sus"],
                 "long":    ["sus"],
                 "leap":    ["sus"],
                 "repeat":  ["sus"],
                 # ★잔가락(짧은 음)을 끊어치기로 몰면 안 된다. 잔가락은 큰 음 사이를
                 #   **이어 붙이는 손**이지 끊는 손이 아니다. 게다가 국악원 대금
                 #   끊어치기 녹음은 17개뿐이라 그 몇 개가 수백 번 되풀이된다.
                 "short":   ["sus"],
                 "mid":     ["sus"]},
    "danso":    {"cadence": ["yoseong", "sigimsae"],
                 "peak":    ["overblow"],                   # 역취 = 세게 불어 한 옥타브 위로
                 "long":    ["yoseong"],
                 "leap":    ["sigimsae", "overblow"],       # 역취는 아껴야 산다
                 "repeat":  ["sigimsae"],
                 "short":   ["sigimsae", "sus"],
                 "mid":     ["sigimsae", "sus"]},
    "piri":     {"cadence": ["toegim"],
                 "peak":    ["nong_shallow"],
                 "long":    ["nong_shallow"],
                 "leap":    ["nong_shallow"],
                 "repeat":  ["toegim"],
                 # 피리 끊어치기 녹음은 12개뿐이라, 전투처럼 잔가락이 많은 곡에서
                 # 한 녹음이 40번씩 되풀이된다. 지속음(297개·17음)을 먼저 쓴다.
                 "short":   ["sus", "nong_shallow"],
                 "mid":     ["sus"]},
    "gayageum": {"cadence": ["toegim", "nong_break"],       # 퇴성으로 끌어내려 놓는다
                 "peak":    ["chuseong"],                   # 추성으로 밀어 올린다
                 "long":    ["nong_break", "nong_deep"],    # 꺾는 농현 = 산조가야금의 얼굴
                 "leap":    ["chuseong"],
                 "repeat":  ["gullim"],                     # 굴림으로 같은 음을 굴린다
                 "fall":    ["gliss"],                      # 크게 미끄러져 내릴 때
                 "short":   ["sus"],
                 "mid":     ["nong_shallow", "sus"]},
    "geomungo": {"cadence": ["toegim", "jeonseong"],
                 "peak":    ["chuseong", "jeonseong"],
                 "long":    ["jeonseong", "nong_shallow"],  # 전성 = 술대로 굴려 떠는 소리
                 "leap":    ["ssarang", "sulgidung"],       # 싸랭·슬기둥 = 거문고 고유의 손
                 "repeat":  ["sulgidung"],
                 "short":   ["jachul", "sus"],
                 "mid":     ["sus", "nong_shallow"]},
}


def sigim(mode_name, deg, dur, role="mid", prev_deg=None, repeat=False, inst=None):
    """
    이 음을 어떻게 흔들고 밀고 꺾을지. 규칙은 여섯 개다.

      ㉠ 긴 음은 반드시 흔든다 — 국악에서 긴 음을 곧게 뻗는 일은 거의 없다.
      ㉡ 악구 맺음은 끌어내리며 놓는다(퇴성).
      ㉢ 3도 이상 뛰어 올라간 음은 밀어 올려 받는다(추성·청성).
      ㉣ 같은 음이 이어지면 두 번째는 다르게 — 안 그러면 기계가 된다.
      ㉤ 크게 떨어질 때는 미끄러져 내린다(글리산도).
      ㉥ 짧은 음(0.7소박 미만)에는 아무것도 얹지 않는다. 얹을 시간이 없다.

    돌려주는 것: (농현 깊이[센트], 꺾기[센트], 주법 이름)
    앞의 둘은 소리를 실제로 구부리는 값이고, 셋째는 **어느 녹음을 꺼낼지**다.
    셋째가 중요하다 — 청성·굴림·글리산도·전성·슬기둥은 값으로 흉내낼 수 없고
    국악원 녹음에 통째로 들어 있다.
    """
    base = SIGIMSAE[mode_name]
    nong, bend = base[int(deg) % 5]
    v = VOCAB.get(inst or "", {})

    def pick(key):
        return (v.get(key) or [None])[0]

    if dur < 0.7:                                   # ㉥
        return 0.0, 0.0, pick("short")
    art = pick("mid")
    if dur >= 2.5:                                  # ㉠
        nong = max(nong, 24 if mode_name == "gyemyeonjo" else 18)
        art = pick("long") or art
    elif dur >= 1.5:
        nong = max(nong, 14 if mode_name == "gyemyeonjo" else 11)
    if prev_deg is not None:
        if deg - prev_deg >= 2:                     # ㉢ 도약해 올라감
            bend = max(bend, +18)
            art = pick("leap") or art
        elif prev_deg - deg >= 3:                   # ㉤ 크게 떨어짐
            nong = max(nong, 20)
            art = pick("fall") or pick("long") or art
    if repeat:                                      # ㉣
        nong = nong + 10 if nong < 20 else nong - 8
        bend = -bend
        art = pick("repeat") or art
    if role == "peak":                              # 정점은 도약 규칙보다 세다
        bend = max(bend, +20)
        art = pick("peak") or art
    if role == "cadence":                           # ㉡ 맺음이 가장 세다
        bend = min(bend, -20)
        nong = max(nong, 20)
        art = pick("cadence") or art
    return float(nong), float(bend), art


# ─────────────────────────────────────────────────────── 동기와 전개
class Motif:
    """(자리[소박], 길이[소박], 음도) 목록. 소박 단위로만 다룬다."""

    def __init__(self, notes, span):
        self.notes = [tuple(n) for n in notes]
        self.span = float(span)

    def __len__(self):
        return len(self.notes)

    def shift(self, d):
        """자리옮김 — 같은 모양을 음계의 다른 자리에서 되풀이한다(모방진행)."""
        return Motif([(t, l, n + d) for t, l, n in self.notes], self.span)

    def augment(self, k=2.0):
        """확대 — 길이를 늘린다. 마지막에 주제를 크게 돌려줄 때."""
        return Motif([(t * k, l * k, n) for t, l, n in self.notes], self.span * k)

    def diminish(self, k=0.5):
        """축소 — 조여서 몰아갈 때."""
        return self.augment(k)

    def invert(self, axis=None):
        """뒤집기 — 오르내림을 거울로. 국악에선 드물어 아껴 쓴다."""
        a = self.notes[0][2] if axis is None else axis
        return Motif([(t, l, 2 * a - n) for t, l, n in self.notes], self.span)

    def head(self, k=2):
        """머리만 떼기 — 조각내어 되풀이하면 긴장이 쌓인다."""
        ns = self.notes[:k]
        return Motif(ns, ns[-1][0] + ns[-1][1] if ns else 0.0)

    def tail(self, k=2):
        ns = self.notes[-k:]
        t0 = ns[0][0]
        return Motif([(t - t0, l, n) for t, l, n in ns], self.span - t0)

    def ending(self, deg):
        """맺음음만 갈아끼운다 — 반종지(치로 맺음) / 온종지(궁으로 맺음)."""
        ns = list(self.notes)
        t, l, _ = ns[-1]
        ns[-1] = (t, l, deg)
        return Motif(ns, self.span)

    def stretch_last(self, k=2.0):
        """맺음음만 늘여 숨을 준다."""
        ns = list(self.notes)
        t, l, n = ns[-1]
        ns[-1] = (t, l * k, n)
        return Motif(ns, max(self.span, t + l * k))

    def place(self, t0, sobak):
        """초 단위 (시각, 길이, 음도) 로 펼친다."""
        return [(t0 + t * sobak, l * sobak, n) for t, l, n in self.notes]


def voice(motif, t0, sobak, mode_name, inst, cadence_last=True, peak_at=None):
    """
    동기를 '연주 지시' 로 바꾼다 — 음마다 시김새를 붙여서.
    돌려주는 것: (시각, 길이, 음도, 농현, 꺾기, 주법)
    """
    out = []
    prev = None
    seen = {}
    n = len(motif.notes)
    for i, (t, l, d) in enumerate(motif.notes):
        role = "mid"
        if cadence_last and i == n - 1:
            role = "cadence"
        elif peak_at is not None and i == peak_at:
            role = "peak"
        rep = seen.get(d, 0) > 0
        seen[d] = seen.get(d, 0) + 1
        nong, bend, art = sigim(mode_name, d, l, role, prev, rep, inst)
        out.append((t0 + t * sobak, l * sobak, d, nong, bend, art))
        prev = d
    return out
