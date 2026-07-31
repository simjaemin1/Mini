"""대금 선율의 이음새를 잰다 — 구멍(끊김)과 계단(음량 도약).

두 가지를 따로 잰다.
  구멍  경계 앞뒤 ±60ms 안에서 소리가 양쪽 음보다 얼마나 푹 꺼지는가.
        여기가 깊으면 '조각을 이어붙인 티' 로 들린다.
  계단  새 음이 앞 음보다 몇 dB 크게/작게 서는가.
"""
import numpy as np
import sampler as S, gugak as G, compose as C, render_score as R
import score_village_day as SC

INST = ["daegeum", "danso", "piri", "gayageum", "geomungo",
        "janggu_gung", "janggu_chae", "wind", "water", "crickets"]


def sil(*a, **k):
    return np.zeros(0, np.float32)


def only(keep):
    sv = {}
    for mod in (C, R, G):
        for n in INST:
            if hasattr(mod, n):
                sv[(mod, n)] = getattr(mod, n)
                if keep is not None and n not in keep:
                    setattr(mod, n, sil)
    try:
        return R.build()
    finally:
        for (m, n), f in sv.items():
            setattr(m, n, f)


def bounds():
    sob, nsb = SC.SOBAK, SC.NCY_S
    out, pe, cd = [], None, False
    for b, bar in enumerate(SC.MELODY):
        cad = (b % 4 == 3 or b == SC.NBAR - 1)
        for j, (s, d, g) in enumerate(bar):
            st = b * nsb * sob + s * sob
            out.append((st, pe is not None and st - pe < 0.02 and not cd))
            pe = st + d * sob
            cd = cad and j == len(bar) - 1
    return out


def audit(y, bnds, win=0.020):
    m = np.abs(y.mean(0) if y.ndim > 1 else y).astype(np.float64)
    w = int(win * G.SR)
    env = np.sqrt(np.convolve(m * m, np.ones(w) / w, mode="same"))
    n = len(env)
    mx = env.max()

    def seg(t0, t1):
        a, b = max(0, int(t0 * G.SR)), min(n, int(t1 * G.SR))
        return env[a:b] if b > a + 4 else np.zeros(1)
    holes, steps, bumps = [], [], []
    for tb, tied in bnds:
        if not tied:
            continue
        a = float(np.median(seg(tb - 0.090, tb - 0.020)))
        b = float(np.median(seg(tb + 0.030, tb + 0.100)))
        if min(a, b) <= mx * 10 ** (-46 / 20):
            continue
        win = seg(tb - 0.060, tb + 0.060)
        holes.append(20 * np.log10((float(win.min()) + 1e-12) / min(a, b)))
        bumps.append(20 * np.log10((float(win.max()) + 1e-12) / max(a, b)))
        steps.append(20 * np.log10(b / a))
    return np.array(holes), np.array(steps), np.array(bumps)


if __name__ == "__main__":
    bank = S.Bank(["samples_gaya", "samples_daegeum", "samples_piri", "samples_danso",
                   "samples_geomungo", "samples_janggu"])
    orig = G.Mix.render
    G.Mix.render = lambda self, *a, **k: orig(self, *a, **{**k, "norm": False})
    S.install(bank, [C, R])
    y = only({"daegeum"})
    G.Mix.render = orig
    h, s, bp = audit(y, bounds())
    print(f"이음새 {len(h)}곳")
    print(f"  구멍 깊이  중앙 {np.median(h):6.1f}dB  최악 {h.min():6.1f}dB  "
          f"12dB 넘게 꺼지는 곳 {(h < -12).sum()}   완전무음 {(h < -60).sum()}")
    print(f"  레벨 계단  중앙 {np.median(np.abs(s)):6.2f}dB  최대 {np.abs(s).max():6.1f}dB  "
          f"3dB 넘는 곳 {(np.abs(s) > 3).sum()}")
    print(f"  넘어가며 부풀기  중앙 {np.median(bp):6.2f}dB  최대 {bp.max():6.1f}dB  "
          f"2dB 넘는 곳 {(bp > 2).sum()}")
