"""층 전체를 처음부터 끝까지 훑어 **진폭이 급변하는 자리를 모두** 찾는다.

음 경계만 재는 것으로는 '정말 하나도 없나' 에 답할 수 없다.
악보가 모르는 자리(늘려 이은 이음매, 조각 안의 결함, 시김새 도중)에서도
튈 수 있기 때문이다. 그래서 격자 없이 전 구간을 훑는다.

  잣대  20ms 실효값을 5ms 마다 뽑아, **40ms 안에 몇 dB 움직였나** 를 본다.
        사람 귀는 그보다 느린 변화는 셈여림으로 듣고, 그보다 빠르면 '툭' 으로 듣는다.
  기준  같은 잣대로 **늘리지 않은 진짜 녹음**을 재서 나온 값이 자연 바닥이다.
        거기에 못 미치면 더 다듬을 게 없다는 뜻이다.
"""
import numpy as np
import sampler as S, gugak as G, compose as C, render_score as R
import score_village_day as SC
from audit_join import only


def jumps(y, win=0.020, hop=0.005, gap=0.040, floor_db=-42.0):
    m = np.abs(y.mean(0) if y.ndim > 1 else y).astype(np.float64)
    w = int(win * G.SR)
    env = np.sqrt(np.convolve(m * m, np.ones(w) / w, mode="same"))
    h = int(hop * G.SR)
    e = env[::h]
    k = max(1, int(gap / hop))
    ref = float(e.max()) * 10 ** (floor_db / 20)
    a, b = e[:-k], e[k:]
    ok = (a > ref) & (b > ref)                 # 쉼표 앞뒤는 계단이 아니다
    d = np.zeros(len(a))
    d[ok] = np.abs(20 * np.log10(b[ok] / a[ok]))
    return d, ok, h, hop


def natural_floor(bank, insts=("daegeum", "danso", "piri"), **kw):
    """늘리지 않은 진짜 녹음을 같은 잣대로 잰 값 = 자연 바닥."""
    out = []
    for inst in insts:
        for m, x, me in bank.by_inst.get(inst, []):
            h = me.get("hold")
            if not h or h[1] - h[0] < 0.8:
                continue
            seg = x[int(h[0] * G.SR):int(h[1] * G.SR)]
            seg = seg.mean(1) if seg.ndim > 1 else seg
            d, ok, _, _ = jumps(seg[None, :].repeat(2, 0), **kw)
            if ok.sum() > 20:
                out.append(d[ok])
    return np.concatenate(out) if out else np.zeros(1)


def report(name, d, ok, hop):
    v = d[ok]
    if not len(v):
        print(f"  {name}: 잴 구간 없음")
        return
    n = len(v)
    print(f"  {name:14s} 표본 {n:6d}  중앙 {np.median(v):5.2f}dB  "
          f"99% {np.percentile(v,99):5.2f}  최대 {v.max():5.2f}   "
          f"6dB↑ {int((v>6).sum()):4d}곳  12dB↑ {int((v>12).sum()):3d}곳")
    return v


if __name__ == "__main__":
    bank = S.Bank(["samples_gaya", "samples_daegeum", "samples_piri", "samples_danso",
                   "samples_geomungo", "samples_janggu"])
    nat = natural_floor(bank)
    print(f"자연 바닥 (늘리지 않은 국악원 녹음 자체, 40ms 안 변화)"
          f"  중앙 {np.median(nat):.2f}dB  99% {np.percentile(nat,99):.2f}  "
          f"최대 {nat.max():.2f}")
    orig = G.Mix.render
    G.Mix.render = lambda self, *a, **k: orig(self, *a, **{**k, "norm": False})
    S.install(bank, [C, R])
    print("\n층별 전 구간 훑기 (격자 없이, 처음부터 끝까지)")
    worst = {}
    for lab, keep in (("대금", {"daegeum"}), ("가야금", {"gayageum"}),
                      ("거문고", {"geomungo"}), ("단소·피리", {"danso", "piri"}),
                      ("전체 합", None)):
        S.install(bank, [C, R])
        y = only(keep)
        d, ok, h, hop = jumps(y)
        report(lab, d, ok, hop)
        if lab == "대금":
            i = np.argsort(-np.where(ok, d, 0))[:8]
            worst["대금"] = [(float(d[j]), j * hop) for j in i]
    G.Mix.render = orig
    print("\n대금에서 가장 크게 움직인 여덟 자리")
    sob, nsb = SC.SOBAK, SC.NCY_S
    for v, t in worst.get("대금", []):
        print(f"  {v:5.1f}dB  {t:7.2f}s  = {int(t//(nsb*sob)):2d}장단 "
              f"{(t % (nsb*sob))/sob:5.2f}소박")
