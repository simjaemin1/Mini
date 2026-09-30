#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T549 ⓪-c 자 · 판정 0 · 표만)
# =============================================================================
# 해안선 띠 마스크(`t549-coast-band.js` 가 떨군 u8 · 1 = 띠 바다)의 **모양**을 잰다.
#   ① 1셀 돌기: 뭍 셀인데 4방 중 3곳 이상이 바다(곶 끝 한 칸) · 바다 셀인데 4방 중 3곳 이상이 뭍(파인 한 칸)
#      · 해안 1,000셀당 수(해안 셀 = 바다에 4방으로 닿은 뭍 셀)
#   ② 박스 카운팅 프랙탈 차원 D: 해안 셀 집합을 상자 s = 2·4·…·128 셀로 덮은 수 N(s) → log N 대 log(1/s) 기울기
#      (실제 해안 1.2~1.3 은 카드가 든 자 · 매끈한 선 = 1.0)
#   ③ 곶·만 반경 분포(입도 분석): 반지름 r 원판으로 뭍을 **열면**(깎고 다시 붙이면) 폭 2r 보다 가는 곶이 떨어져 나간다 —
#      r−1 → r 사이에 새로 떨어져 나간 조각 수 = "반경 r 곶" 수. 바다를 열면 만. r = 1·2·3·5·8·13·21·34 셀.
#   ④ 가로 줄마다 해안 x 가 옆 줄과 몇 셀 뛰나(동해안 · 남해안은 세로 줄) — 한 줄 사이 점프 p50 · p95 · 최대.
#   완만 안 둘(자로만 · 정본 무변): `--open r` 형태학 열림+닫힘 r 셀을 마스크에 얹은 판도 같은 표로.
# 쓰는 법: python3 scripts/t549-coast-shape.py <NX> <NY> <이름=u8경로[@morph r]> ... > out.json   (폭은 파일 크기 ÷ NY 로 · NX 는 기록용)
# =============================================================================
import json, sys
import numpy as np
from scipy import ndimage as ndi

NX, NY = int(sys.argv[1]), int(sys.argv[2])

def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]; return (x * x + y * y) <= r * r

def open_(m, r):   # 이진 열림(원판 반지름 r + 0.5) — 거리 변환으로 · +0.5 = 디지털 원판의 네 끝 1셀 꼭지(x²+y² ≤ r² 의 (0,±r))를 없앤다
    rho = r + 0.5     #   (그냥 r 이면 열림·닫힘이 오히려 1셀 돌기를 새로 세운다 — 첫 판에서 8.1 · 10.1/1000 으로 늘어 알았다)
    er = ndi.distance_transform_edt(m) > rho
    return ndi.distance_transform_edt(~er) <= rho

def smooth(sea, r):  # 완만 안: 바다 열림 → 닫힘(r 셀) · 둘 다 원판
    s = open_(sea, r); return ~open_(~s, r)

def metrics(sea):
    # 바깥은 가장자리 값을 잇는다(존 밖이 바다면 바다 · 뭍이면 뭍) — 테두리에서 가짜 해안이 서지 않게
    P = np.pad(sea, 1, mode='edge'); land = ~P
    n4 = lambda A: A[:-2, 1:-1].astype(np.int8) + A[2:, 1:-1] + A[1:-1, :-2] + A[1:-1, 2:]
    seaN = n4(P); landN = n4(land)
    L = ~sea; S = sea
    coast = L & (seaN > 0)
    spike_land = int((L & (seaN >= 3)).sum()); spike_sea = int((S & (landN >= 3)).sum())
    C = int(coast.sum())
    # 박스 카운팅
    ss = [2, 4, 8, 16, 32, 64, 128]; Ns = []
    ys, xs = np.nonzero(coast)
    for s in ss:
        Ns.append(len(set(zip((ys // s).tolist(), (xs // s).tolist()))))
    lx = np.log(1 / np.array(ss, float)); ly = np.log(np.array(Ns, float))
    D = float(np.polyfit(lx, ly, 1)[0])
    Dlo = float(np.polyfit(lx[:4], ly[:4], 1)[0]); Dhi = float(np.polyfit(lx[3:], ly[3:], 1)[0])
    # 입도(곶 = 뭍 열림 · 만 = 바다 열림) — 해안 근처 창만(속도) : 해안에서 40셀 안
    near = ndi.binary_dilation(coast, structure=np.ones((3, 3), bool), iterations=40)
    yy, xx = np.nonzero(near); y0, y1, x0, x1 = yy.min(), yy.max() + 1, xx.min(), xx.max() + 1
    win = lambda A: A[max(0, y0 - 40):y1 + 40, max(0, x0 - 40):x1 + 40]
    RS = [1, 2, 3, 5, 8, 13, 21, 34]
    def gran(m):
        m = win(m); prev = m.copy(); out = {}
        for r in RS:
            o = open_(m, r); gone = prev & ~o
            lab, n = ndi.label(gone, structure=np.ones((3, 3), bool))
            if n:
                sz = ndi.sum(np.ones_like(gone, dtype=np.int32), lab, index=np.arange(1, n + 1)); n = int((sz >= max(2, r)).sum())
            out[r] = n; prev = o & prev
        return out
    capes = gran(L); bays = gran(S)
    # 줄 사이 점프 — 동해안: 줄마다 가장 동쪽 뭍 x · 남해안: 열마다 가장 남쪽 뭍 y
    def jumps(axis):
        if axis == 'E':
            v = np.array([np.nonzero(L[y])[0].max() if L[y].any() else -1 for y in range(L.shape[0])])
        else:
            v = np.array([np.nonzero(L[:, x])[0].max() if L[:, x].any() else -1 for x in range(L.shape[1])])
        v = v[v >= 0]; d = np.abs(np.diff(v))
        return dict(p50=int(np.median(d)), p95=int(np.percentile(d, 95)), max=int(d.max()), ge5=int((d >= 5).sum()), n=int(len(d)))
    return dict(bandPct=100 * float(S.sum()) / S.size, coast=C, spikeLand=spike_land, spikeSea=spike_sea,
                spikePer1k=round(1000 * (spike_land + spike_sea) / max(1, C), 2), D=round(D, 3), Dsmall=round(Dlo, 3), Dlarge=round(Dhi, 3),
                boxN=dict(zip(ss, Ns)), capes=capes, bays=bays, jumpE=jumps('E'), jumpS=jumps('S'))

out = {}
for a in sys.argv[3:]:
    name, rest = a.split('=', 1)
    r = None
    if '@' in rest: rest, r = rest.split('@'); r = int(r)
    raw = np.fromfile(rest, np.uint8)
    nx = raw.size // NY   # 폭은 파일 크기에서(한반도 2,188 · 닛폰 1,875) — 높이는 같다
    sea = raw.reshape(NY, nx).astype(bool)
    if r: sea = smooth(sea, r)
    out[name] = metrics(sea)
    print(name, json.dumps({k: v for k, v in out[name].items() if k in ('bandPct', 'coast', 'spikeLand', 'spikeSea', 'spikePer1k', 'D', 'Dsmall', 'Dlarge', 'jumpE')}, ensure_ascii=False), file=sys.stderr)
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
