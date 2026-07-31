"""대금 음마다 **첫머리가 얼마나 센지** 잰다.
  어택비 = (음 시작 40ms 안의 봉우리) / (120~350ms 구간의 지속부 크기), dB
악보상 이어지는 음(73)은 낮아야 맞고, 숨을 새로 넣는 음(6)은 높아야 맞다.
"""
import numpy as np
import sampler as S, gugak as G, compose as C, render_score as R
import score_village_day as SC
from audit_join import only, bounds


def notes_of():
    return bounds()


def attack_db(y, notes):
    m = np.abs(y.mean(0) if y.ndim > 1 else y).astype(np.float64)
    w = int(0.002 * G.SR)
    env = np.convolve(m, np.ones(w) / w, mode="same")
    n = len(env)
    sob, nsb = SC.SOBAK, SC.NCY_S
    out, ends = [], {}
    for i, (st, tied) in enumerate(notes):
        en = notes[i + 1][0] if i + 1 < len(notes) else st + 2.0
        a, b = int(st * G.SR), int(min(st + 0.040, en) * G.SR)
        c, d = int(min(st + 0.120, en) * G.SR), int(min(st + 0.350, en) * G.SR)
        if b <= a + 8 or d <= c + 8 or d > n:
            continue
        pk, sus = float(env[a:b].max()), float(np.median(env[c:d]))
        if sus <= 1e-9:
            continue
        out.append((20 * np.log10(pk / sus), tied, st))
    return out


if __name__ == "__main__":
    bank = S.Bank(["samples_gaya", "samples_daegeum", "samples_piri", "samples_danso",
                   "samples_geomungo", "samples_janggu"])
    orig = G.Mix.render
    G.Mix.render = lambda self, *a, **k: orig(self, *a, **{**k, "norm": False})
    S.install(bank, [C, R])
    y = only({"daegeum"})
    G.Mix.render = orig
    r = attack_db(y, notes_of())
    for lab, sel in (("이어지는 음", True), ("새 숨(악구 첫 음)", False)):
        v = np.array([q[0] for q in r if q[1] == sel])
        if not len(v):
            continue
        print(f"{lab:18s} {len(v):3d}음  어택비 중앙 {np.median(v):5.1f}dB  "
              f"75% {np.percentile(v,75):5.1f}  90% {np.percentile(v,90):5.1f}  "
              f"최대 {v.max():5.1f}  4dB 넘는 음 {(v>4).sum()}")
