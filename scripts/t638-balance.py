#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T638 ① 밸런스 표 · 판정 0)
# 한 존 절(또는 그 x 구간)의 밀도 넷 — 자는 한반도(같은 셈):
#   ⓐ 강 1,000셀당 다리 셀  ⓑ 산맥 1,000셀당 고개(= 고개 계곡 · 강을 따라가지 않는 계곡)  ⓒ 강–산맥 가로지름당 계곡(그 가로지름을 덮는 계곡이 있나)
#   ⓓ 바다 띠 밖 뭍 100만 셀당 마을 후보
#   강 · 산맥 길이 = 중심선 길이(셀) · 다리 = zone-config flat 셀 · 가로지름 = 강 표본(1셀)이 산맥 몸(그 자리 반폭) 안인 연속 구간 · (강, 산맥) 쌍마다 하나
#   계곡 갈래: 계곡 표본의 절반 넘게가 어떤 강 물가(반폭 + 2셀) 안 → 협곡(가로지름 계곡) · 아니면 고개 계곡.
# 쓰는 법: python3 scripts/t638-balance.py <존> <존 절.json> <T524 dir> <다리 flat.json> [--x <셀 시작>,<셀 끝>]
import json, math, sys, numpy as np
Z, PL, D, BRF = sys.argv[1:5]
X0, X1 = (int(v) for v in sys.argv[sys.argv.index('--x') + 1].split(',')) if '--x' in sys.argv else (0, 10 ** 9)
SZ = 32
P = json.load(open(PL, encoding='utf-8'))
if Z in P and 'rivers' not in P: P = P[Z]
J = json.load(open(f'{D}/{Z}.json')); N = J['N']
K = np.frombuffer(open(J['bin'], 'rb').read()[:N], np.uint8).reshape(J['NY'], J['NX'])
BR = json.load(open(BRF)); BR = BR['bridges'] if isinstance(BR, dict) else BR
inx = lambda x: X0 * SZ <= x < X1 * SZ
def samples(f, step=SZ):
    out = []
    for a, b in zip(f['path'], f['path'][1:]):
        ax, ay = a['pos']; bx, by = b['pos']; L = math.hypot(bx - ax, by - ay); n = max(1, int(L // step))
        for k in range(n):
            t = (k + .5) / n; out.append((ax + (bx - ax) * t, ay + (by - ay) * t, (a['width'] + (b['width'] - a['width']) * t) / 2, L / n))
    return out
def segd(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]), t
def near(f, x, y, pad=0):
    for a, b in zip(f['path'], f['path'][1:]):
        d, t = segd((x, y), a['pos'], b['pos'])
        if d < (a['width'] + (b['width'] - a['width']) * t) / 2 + pad: return True
    return False
def bbox(f, m):
    xs = [p['pos'][0] for p in f['path']]; ys = [p['pos'][1] for p in f['path']]; w = max(p['width'] for p in f['path']) / 2 + m
    return min(xs) - w, min(ys) - w, max(xs) + w, max(ys) + w
inb = lambda b, x, y: b[0] <= x <= b[2] and b[1] <= y <= b[3]
RV = [(f, samples(f), bbox(f, 2 * SZ)) for f in P['rivers']]
RG = [(g, samples(g), bbox(g, 0)) for g in P['ridges']]
VL = [(v, samples(v), bbox(v, 0)) for v in P.get('valleys', [])]
rlen = sum(L for f, S, _ in RV for x, y, hw, L in S if inx(x)) / SZ
glen = sum(L for g, S, _ in RG for x, y, hw, L in S if inx(x)) / SZ
nbr = sum(1 for i in range(0, len(BR), 2) if X0 <= BR[i] < X1)
canyon, passv = [], []
for v, S, b in VL:
    if not any(inx(x) for x, *_ in S): continue
    on = sum(1 for x, y, *_ in S if any(inb(rb, x, y) and near(f, x, y, 2 * SZ) for f, _, rb in RV))
    (canyon if on > len(S) / 2 else passv).append(v['name'])
cross = []
for f, S, rb in RV:
    for g, GS, gb in RG:
        if not (rb[0] <= gb[2] and gb[0] <= rb[2] and rb[1] <= gb[3] and gb[1] <= rb[3]): continue
        run = []
        for x, y, hw, L in S + [(None,) * 4]:
            if x is not None and inb(gb, x, y) and near(g, x, y):
                run.append((x, y)); continue
            if run:
                mx, my = run[len(run) // 2]
                if inx(mx):
                    cov = sum(1 for px, py in run if any(inb(vb, px, py) and near(v, px, py) for v, _, vb in VL))
                    cross.append(dict(river=f['name'], ridge=g['name'], cells=len(run), covered=cov * 2 >= len(run)))
                run = []
land = (K != 2); land[:, :X0] = False; land[:, min(X1, land.shape[1]):] = False
Lm = land.sum() / 1e6
nv = sum(1 for v in P.get('villages', []) if inx(v['x']))
out = dict(zone=Z, x=[X0, X1], riverCells=round(rlen), ridgeCells=round(glen), bridgeCells=nbr, bridgePerKRiver=round(1000 * nbr / max(1, rlen), 2),
           passValleys=len(passv), passPerKRidge=round(1000 * len(passv) / max(1, glen), 2), canyons=len(canyon),
           crossings=len(cross), crossCovered=sum(1 for c in cross if c['covered']), valleyPerCross=round(sum(1 for c in cross if c['covered']) / max(1, len(cross)), 2),
           villages=nv, landM=round(Lm, 3), villagesPerMLand=round(nv / Lm, 2), uncovered=[c for c in cross if not c['covered']], passNames=passv, canyonNames=canyon)
print(json.dumps(out, ensure_ascii=False))
