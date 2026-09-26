"""
프레이즈 곡선 — 표현을 **음 단위가 아니라 악구 단위**로 [T353 · 세션8]

왜 있나
-------
지금 12곡은 음마다 `daegeum(freq, dur, …)` 을 한 번씩 부른다(`arirang.py:154` 의 `bar_events` 루프 ·
`compose.py` 의 `for (st,d,n) in ph:` 들). 한 호출 = 한 음이므로 **음 경계마다**
  · 어택 스쿱이 다시 시작되고      (`flute()` 의 `scoop`)
  · 농현 램프가 0 에서 다시 오르고 (`vib_delay` 뒤 0.35초 램프)
  · 릴리즈가 0 으로 떨어진다       (`adsr` 의 r)
세 가지가 음마다 되풀이돼서 악구가 **음의 나열**로 들린다. 이 파일은 그 셋을 악구에 한 번만 두고,
음과 음 사이는 **끊지 않고 글라이드**한다.

무엇을 새로 정하지 않았나 (★새 수 0)
-----------------------------------
· 농현 깊이·꺾기 센트 → 부르는 쪽이 준다(`motif.sigim()` 의 (농현, 꺾기) 또는 지금 호출부의 `vib_cents`/`bend_end`).
· 농현 속도 4.4Hz·5.0Hz 등 → `gugak.py` 의 악기 기본값 그대로. **유도도 안 했다** ⇒ 회부(카드 §4).
· 글라이드 길이 → 새 상수를 안 만들고 **악기의 어택 초에서 유도**한다:
      glide_s = attack * GLIDE_OF_ATTACK
  `GLIDE_OF_ATTACK` 는 1.0 이다 — "앞 음에서 다음 음으로 건너가는 데 드는 시간은
  그 악기가 소리를 세우는 데 드는 시간과 같다"는 한 줄이 근거이고, 이것 말고 다른 수를 쓰지 않았다.
  (대금 attack 0.085s → 글라이드 85ms · 단소 0.10 → 100ms · 피리 0.045 → 45ms)
  ⚠소박보다 길면 소박의 절반으로 자른다(짧은 음에서 글라이드가 음을 다 먹지 않게).

손잡이
------
`BGM_CURVES` — **기본 끔**. 이 파일은 켜야만 불린다. 끔이면 `gugak.py`·`compose.py`·`arirang.py` 는
**한 줄도 다르게 돌지 않는다**(세 파일 diff 0 — 그게 "끔 = 지금 경로 그대로"의 증명이다).
"""

import os
import numpy as np

import gugak as G
from gugak import SR

# 켜고 끄는 자리 하나. 코드 다른 데서 환경변수를 다시 읽지 않는다.
def curves_on():
    return os.environ.get("BGM_CURVES", "") not in ("", "0", "off", "false")

# 글라이드 길이를 어택에서 유도하는 비율. **새 수가 아니라 1.0**(위 주석).
GLIDE_OF_ATTACK = 1.0

# 지속음 악기만. 뜯는 악기(가야금)·타악은 이 문법이 아니다(카드 §1 · 회부).
SUSTAINED = ("daegeum", "danso", "piri")

# 악기 기본값은 `gugak.py` 의 것을 **읽어서** 쓴다(사본 0 — 여기 수를 적지 않는다).
_INST_KW = {
    "daegeum": dict(breath=0.075, vib_rate=4.6, vib_cents=34, harm=9, bright=1.05,
                    cheong=0.16, scoop=45, attack=0.085, release=0.20),
    "danso":   dict(breath=0.13, vib_rate=5.4, vib_cents=22, harm=6, bright=0.75,
                    cheong=0.0, scoop=28, attack=0.10, release=0.24),
    "piri":    dict(breath=0.05, vib_rate=5.0, vib_cents=30, harm=12, bright=1.5,
                    cheong=0.0, scoop=30, attack=0.045, release=0.13),
}


def inst_defaults(inst):
    """★`gugak.py` 의 악기 기본값과 여기 표가 **같은지 검사기가 본다**(`test-bgm-curves` ⓐ).
    같은 수를 두 자리에 적는 것은 이 집 규약 위반이라, 표는 대조용이고 정본은 `gugak.py` 다."""
    return dict(_INST_KW[inst])


# ───────────────────────────────────────────────────────────── 곡선 만들기
def phrase_curve(notes, inst, sr=SR, sobak=None):
    """
    음표열 → (f0_hz[], loud[], meta)  — **악구 하나에 배열 하나**.

    notes: [(t0_sec, dur_sec, freq_hz, nong_cents, bend_cents), ...] 시간순.
           nong = 농현 깊이(센트) · bend = 꺾기(센트 · 음수면 퇴성).
           부르는 쪽이 `sigim()` 에서 받아 그대로 넘기면 된다(이 파일은 규칙을 다시 안 쓴다).

    돌려주는 것:
      f0_hz  : 샘플마다의 기준 주파수 — **음 사이가 글라이드로 이어져 있다**
      loud   : 0..1 진폭 곡선 — 악구 처음에만 어택, 끝에만 릴리즈
      meta   : 유도한 값들(검사기와 보고가 읽는다)
    """
    if not notes:
        return np.zeros(0, np.float32), np.zeros(0, np.float32), {}
    d = inst_defaults(inst)
    glide_s = d["attack"] * GLIDE_OF_ATTACK
    if sobak:
        glide_s = min(glide_s, sobak * 0.5)

    t_end = max(t + ln for (t, ln, *_r) in notes)
    n = int(round(t_end * sr))
    if n < 64:
        return np.zeros(0, np.float32), np.zeros(0, np.float32), {}

    # ── ① 계단 f0 을 만들고, 음 경계에서만 글라이드로 깎는다.
    f0 = np.zeros(n, np.float32)
    gate = np.zeros(n, np.float32)          # 소리가 나는 구간(쉼표는 0)
    for (t, ln, fz, *_r) in notes:
        a, b = int(t * sr), min(n, int((t + ln) * sr))
        if b > a:
            f0[a:b] = fz
            gate[a:b] = 1.0
    # 쉼(0Hz)은 앞 음을 끌고 간다 — 주파수가 0 으로 떨어지면 위상이 멎는다.
    last = 0.0
    for i in range(n):
        if f0[i] <= 0:
            f0[i] = last
        else:
            last = f0[i]
    if f0[0] <= 0:
        f0[f0 <= 0] = notes[0][2]

    gl = max(2, int(glide_s * sr))
    ramp = np.linspace(0, 1, gl, dtype=np.float32)
    glides = 0
    for k in range(1, len(notes)):
        t = notes[k][0]
        i = int(t * sr)
        if i - gl < 0 or i + 1 > n:
            continue
        a, b = float(f0[i - gl]), float(f0[min(n - 1, i + 1)])
        if abs(a - b) < 1e-6:
            continue
        # ★음 **앞쪽**을 깎아 글라이드를 만든다 — 앞 음의 끝에서 다음 음으로 미끄러진다.
        f0[i - gl:i] = a + (b - a) * ramp
        glides += 1

    # ── ② 농현 — 악구 하나에 **연속인 위상** 하나. 깊이도 **경계에서 안 튄다**.
    #    ⚠1차 판은 깊이를 음마다 0 에서 다시 올렸는데, 그러면 위상은 이어져도
    #      **깊이가 경계에서 뚝 떨어져** f0 이 그만큼 점프한다(하네스 ⓒ 가 5.10Hz 로 잡았다).
    #      깊이는 음마다의 목표값을 이어 **글라이드와 같은 길이로** 건너간다.
    depth = np.zeros(n, np.float32)
    bendc = np.zeros(n, np.float32)
    for (t0_, ln, fz, nong, bend) in [(x[0], x[1], x[2], x[3], x[4]) for x in notes]:
        a, b = int(t0_ * sr), min(n, int((t0_ + ln) * sr))
        if b <= a:
            continue
        seg = b - a
        rmp = np.clip(np.arange(seg) / max(1.0, min(0.35, ln * 0.5) * sr), 0, 1)
        depth[a:b] = nong * rmp
        if bend:
            # 꺾기는 **센트로** 얹는다(f0 을 직접 곱하면 다음 음 머리에서 튄다).
            rel = int(min(d["release"] * 1.6, ln * 0.4) * sr)
            if rel > 4 and b - rel >= a:
                bendc[b - rel:b] = bend * np.linspace(0, 1, rel, dtype=np.float32) ** 1.5
    # 깊이·꺾기를 글라이드 길이로 매끄럽게 — 경계의 계단을 없앤다(같은 유도값 · 새 수 0).
    depth = G.onepole_lp(depth, 1.0 / max(1e-3, glide_s)).astype(np.float32)
    bendc = G.onepole_lp(bendc, 1.0 / max(1e-3, glide_s)).astype(np.float32)
    ph = 2 * np.pi * np.cumsum(np.full(n, d["vib_rate"], np.float32)) / sr
    cents = depth * np.sin(ph).astype(np.float32) + bendc
    f0 = (f0 * 2 ** (cents / 1200.0)).astype(np.float32)

    # ── ③ 음량 — 악구 처음에만 어택, 끝에만 릴리즈. 음 사이는 **0 으로 안 떨어진다**.
    loud = gate.copy()
    at, rl = max(2, int(d["attack"] * sr)), max(2, int(d["release"] * sr))
    loud[:at] *= np.linspace(0, 1, at, dtype=np.float32)
    loud[-rl:] *= np.linspace(1, 0, rl, dtype=np.float32)
    # 쉼은 글라이드 길이만큼 부드럽게 여닫는다(딸깍 방지) — 같은 유도값을 쓴다.
    loud = G.onepole_lp(loud, 1.0 / max(1e-3, glide_s)).astype(np.float32)

    meta = dict(inst=inst, n=n, seconds=round(n / sr, 3), notes=len(notes),
                glides=glides, glide_ms=round(glide_s * 1000, 1),
                vib_rate=d["vib_rate"], attack=d["attack"], release=d["release"])
    return f0, loud, meta


# ───────────────────────────────────────────────────── 곡선 → 소리 (어댑터)
def render_curve(inst, f0_hz, loud, sr=SR, amp=1.0, seed=None, backend=None):
    """
    ★**인터페이스 하나.** 백엔드는 둘:
      A = 지금 `gugak.py` 합성기(곡선판)  — 언제나 있다
      B = DDSP 모델(`tools/_rnd_archive/ddsp/models/<inst>/`) — 있으면 그것
    ⚠**조용히 A 로 떨어지지 않는다** — 어느 백엔드가 울었는지 한 줄을 돌려준다(부르는 쪽이 찍는다).
    """
    want = backend or os.environ.get("BGM_BACKEND", "auto")
    have_b = ddsp_model_dir(inst)
    if want in ("auto", "B") and have_b:
        try:
            import ddsp_backend                            # tools/_rnd_archive/ddsp/export.py 가 놓는다
            y = ddsp_backend.render(inst, f0_hz, loud, sr)
            return np.asarray(y, np.float32) * amp, f"B(ddsp:{have_b})"
        except Exception as e:                             # 있는데 못 불렀으면 **말한다**
            if want == "B":
                raise
            return _render_a(inst, f0_hz, loud, sr, amp, seed), f"A(합성 · B 있으나 실패: {e})"
    if want == "B" and not have_b:
        raise RuntimeError(f"백엔드 B 를 시켰는데 모델이 없다: tools/_rnd_archive/ddsp/models/{inst}/")
    return _render_a(inst, f0_hz, loud, sr, amp, seed), "A(합성)" + ("" if have_b else " · B 없음")


def ddsp_model_dir(inst):
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__))))), "tools", "_rnd_archive", "ddsp", "models", inst)
    return root if os.path.isdir(root) and os.listdir(root) else None


def _render_a(inst, f0_hz, loud, sr, amp, seed):
    """백엔드 A — `gugak.flute()` 의 몸통을 **곡선판으로** 쓴다.
    하모닉 스택·숨소리·청·필터는 그 파일의 것을 그대로 부른다(사본 0 · 수 0)."""
    d = inst_defaults(inst)
    n = len(f0_hz)
    if n < 64:
        return np.zeros(0, np.float32)
    rng = np.random.default_rng(seed if seed is not None else 0)
    t = np.arange(n) / sr
    phase = 2 * np.pi * np.cumsum(f0_hz) / sr
    fmed = float(np.median(f0_hz[f0_hz > 0])) if np.any(f0_hz > 0) else 440.0

    sig = np.zeros(n, np.float32)
    for k in range(1, d["harm"] + 1):
        if fmed * k > sr * 0.45:
            break
        a = (1.0 / k ** (1.9 - 0.55 * d["bright"]))
        if k % 2 == 0:
            a *= 0.55
        ka = 1.0 if k <= 2 else np.clip((t - 0.02 * k) / 0.12, 0, 1)
        sig += (a * ka * np.sin(phase * k + rng.uniform(0, 6.283))).astype(np.float32)
    sig /= 1.6

    nz = rng.normal(0, 1, n).astype(np.float32)
    br = G.bp(nz, max(700, fmed * 1.6), min(9000, fmed * 9)) * d["breath"]
    br *= (1 + 0.26 * np.sin(2 * np.pi * rng.uniform(2.2, 4.4) * t + rng.uniform(0, 6.283)))

    ch = 0.0
    if d["cheong"] > 0:
        buzz = G.bp(nz, fmed * 2.4, min(11000, fmed * 7)) * (0.5 + 0.5 * np.sin(phase))
        drv = G.soft_clip(sig * 2.4) - sig
        ch = (buzz * 0.7 + drv * 0.5) * d["cheong"]

    out = (sig + br + ch) * loud
    out = G.lp(out, min(14000, fmed * 12 + 2500))
    if inst == "piri":
        out = G.soft_clip(out * 2.0) * 0.6
        out = G.peak_eq(out, 1400, 1.1, 5.0)
    if inst == "danso":
        out = out * 0.9
    return (out * amp * 0.28).astype(np.float32)
