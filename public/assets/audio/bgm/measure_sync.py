"""층별 실제 타점이 격자에서 얼마나 밀렸는지, 상호상관으로 한 번에 잰다.

타점을 하나씩 찾아 격자에 맞추는 방식은 저음 악기에서 못 쓴다 —
거문고는 73Hz 라 한 주기가 13.7ms 이고, 그 울림 자체가 어택처럼 검출된다
(실측: 같은 조각을 정확히 1.000초에 놓아도 +25~32ms 로 읽히고,
 뒤로 100ms 간격의 가짜 타점이 줄줄이 붙는다).
그래서 **층 전체의 어택 강도 곡선**을 격자 임펄스열과 상호상관해
층 하나에 지연 하나를 낸다. 가짜 타점은 격자와 안 맞으니 저절로 묻힌다.
"""
import os, numpy as np
import sampler as S, gugak as G, compose as C, render_score as R
import score_village_day as SC

INST = ["daegeum", "danso", "piri", "gayageum", "geomungo",
        "janggu_gung", "janggu_chae", "wind", "water", "crickets"]
CACHE = "_sync"


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


def onset_strength(y, hop=64):
    """어택 강도 곡선. 대역별 에너지 상승분의 합 — 저음의 울림에 덜 속는다."""
    m = (y.mean(0) if y.ndim > 1 else y).astype(np.float32)
    n = 1024
    w = np.hanning(n).astype(np.float32)
    F = np.array([np.abs(np.fft.rfft(m[i:i + n] * w))
                  for i in range(0, len(m) - n, hop)], dtype=np.float32)
    F = np.log1p(F * 40.0)
    d = np.maximum(0.0, np.diff(F, axis=0)).sum(axis=1)
    return d / (d.max() + 1e-9), hop / G.SR


def lag_of(y, grid, span=0.30):
    """격자 대비 층 전체의 지연(초). +면 늦게 난다."""
    d, dt = onset_strength(y)
    g = np.zeros(len(d), np.float32)
    for t in grid:
        i = int(round(t / dt))
        if 0 <= i < len(g):
            g[i] = 1.0
    k = int(span / dt)
    sc = np.array([float(np.dot(d[max(0, s):len(d) + min(0, s)],
                                g[max(0, -s):len(g) + min(0, -s)]))
                   for s in range(-k, k + 1)])
    best = int(np.argmax(sc)) - k
    # 부드러운 최대치 — 이웃 3점 포물선 보간
    i = best + k
    if 0 < i < len(sc) - 1:
        a, b, c = sc[i - 1], sc[i], sc[i + 1]
        den = (a - 2 * b + c)
        if abs(den) > 1e-12:
            best = best + 0.5 * (a - c) / den
    peak = sc.max() / (sc.mean() + 1e-12)
    return best * dt, peak


def grids():
    sob, ncy = SC.SOBAK, SC.NCY_S
    _, pat = C.JANGDAN["gutgeori"]
    G_ = {}
    G_["거문고"] = [b * ncy * sob + s * sob for b in range(SC.NBAR)
                 if SC.GEO_ON[b] for (s, d, g) in SC.GEO]
    G_["가야금"] = [b * ncy * sob + s * sob for b in range(SC.NBAR)
                 for (s, d, g) in SC.GAYA[SC.GAYA_PLAN[b]]]
    G_["장구"] = [b * ncy * sob + p * sob for b in range(SC.NBAR)
                if SC.DRUM[b] > 0 for (p, k, v) in pat]
    G_["대금"] = [b * ncy * sob + s * sob for b in range(SC.NBAR)
                for (s, d, g) in SC.MELODY[b]]
    return {k: np.array(v) for k, v in G_.items()}


KEEP = {"거문고": {"geomungo"}, "가야금": {"gayageum"},
        "장구": {"janggu_gung", "janggu_chae"}, "대금": {"daegeum"}}


def stems(bank, force=False):
    os.makedirs(CACHE, exist_ok=True)
    out = {}
    orig = G.Mix.render
    G.Mix.render = lambda self, *a, **k: orig(self, *a, **{**k, "norm": False})
    try:
        for name, keep in KEEP.items():
            p = f"{CACHE}/{name}.npy"
            if os.path.exists(p) and not force:
                out[name] = np.load(p)
                continue
            S.install(bank, [C, R])
            y = only(keep)
            np.save(p, y)
            out[name] = y
    finally:
        G.Mix.render = orig
    return out


if __name__ == "__main__":
    import sys
    force = "-f" in sys.argv
    bank = S.Bank(["samples_gaya", "samples_daegeum", "samples_piri", "samples_danso",
                   "samples_geomungo", "samples_janggu"])
    ys = stems(bank, force)
    gs = grids()
    print("층별 격자 대비 지연 (+ = 늦게 남)")
    ref = None
    for name in ("장구", "거문고", "가야금", "대금"):
        lag, pk = lag_of(ys[name], gs[name])
        if ref is None:
            ref = lag
        print(f"  {name:5s} {lag*1000:+7.1f}ms   (장구 대비 {(lag-ref)*1000:+7.1f}ms) "
              f"  상관 선명도 {pk:.1f}")
