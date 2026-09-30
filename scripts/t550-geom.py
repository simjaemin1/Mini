#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T550 표 짜는 기계 · 판정 0)
# 쓰는 법: python3 scripts/t550-geom.py <안.json> <T524 디렉터리 | ''> <표.json>
# 재민 닛폰 안 — 기하 표(길이 · 폭 · 끝점이 닿는 것 · 겹침). 새 문턱 0: 자 = 그 피처 제 폭(반폭) + 2셀 · 한반도 분포.
import json, math, sys, collections
import numpy as np
P = json.load(open(sys.argv[1], encoding='utf-8'))
SZ = 32; ZW, ZH = 49984, 130016
T524 = sys.argv[2] if len(sys.argv) > 2 else None
kind = None
if T524:
    J = json.load(open(f'{T524}/nippon.json', encoding='utf-8')); raw = open(J['bin'], 'rb').read(); N = J['N']
    kind = np.frombuffer(raw[:N], np.uint8).reshape(J['NY'], J['NX'])
def cellkind(x, y):
    if kind is None: return None
    cx, cy = int(x // SZ), int(y // SZ)
    if 0 <= cx < kind.shape[1] and 0 <= cy < kind.shape[0]: return int(kind[cy, cx])
    return 0
def pts(f): return [(p['pos'][0], p['pos'][1], p['width']) for p in f['path']]
def plen(ps): return sum(math.hypot(b[0]-a[0], b[1]-a[1]) for a, b in zip(ps, ps[1:]))
def seg_d(px, py, a, b):
    ax, ay, bx, by = a[0], a[1], b[0], b[1]; dx, dy = bx-ax, by-ay; L2 = dx*dx+dy*dy
    t = 0 if L2 == 0 else max(0, min(1, ((px-ax)*dx+(py-ay)*dy)/L2))
    qx, qy = ax+dx*t, ay+dy*t; return math.hypot(px-qx, py-qy), a[2]+(b[2]-a[2])*t
def dist_to_path(px, py, ps):
    best = (1e18, 0)
    for a, b in zip(ps, ps[1:]):
        d = seg_d(px, py, a, b)
        if d[0] < best[0]: best = d
    return best
rivers = [(r['name'], pts(r), r) for r in P['rivers']]
ridges = [(r['name'], pts(r), r) for r in P['ridges']]
lakes = P['lakes']
def lake_hit(px, py, margin):
    for l in lakes:
        a = l.get('a', l.get('radius')); b = l.get('b', l.get('radius'))
        dx, dy = px-l['center'][0], py-l['center'][1]
        if (dx/(a+margin))**2 + (dy/(b+margin))**2 <= 1: return l['name']
    return None
def what_at(px, py, w, me, kindset):
    """끝점이 닿는 것 — 반폭+2셀 안. 순서: 존 밖 · 바다 띠 · 호수 · 다른 강 · 산맥 · 뭍"""
    m = w/2 + 2*SZ
    if px < -m or px > ZW+m or py < -m or py > ZH+m: return '존 밖'
    if px < m: return '경계 서(한반도)'
    if px > ZW-m: return '경계 동(태평양)'
    if py < m: return '경계 북(베링)'
    if py > ZH-m: return '경계 남(남창해)'
    if kind is not None:
        r = int(math.ceil(m/SZ)); cx, cy = int(px//SZ), int(py//SZ); ks = set()
        for yy in range(cy-r, cy+r+1):
            for xx in range(cx-r, cx+r+1):
                if 0 <= xx < kind.shape[1] and 0 <= yy < kind.shape[0] and (xx-cx)**2+(yy-cy)**2 <= r*r: ks.add(int(kind[yy, xx]))
        if 2 in ks: return '바다 띠'
    lk = lake_hit(px, py, m)
    if lk: return '호수 ' + lk
    for n, ps, _ in rivers:
        if n == me: continue
        d, ww = dist_to_path(px, py, ps)
        if d <= ww/2 + m: return '강 ' + n
    for n, ps, _ in ridges:
        d, ww = dist_to_path(px, py, ps)
        if d <= ww/2: return '산맥 ' + n
    return '뭍'
out = {'rivers': [], 'ridges': [], 'lakes': []}
for n, ps, f in rivers:
    ws = [p[2] for p in ps]; L = plen(ps)/SZ
    a, b = ps[0], ps[-1]
    ea = what_at(a[0], a[1], a[2], n, None); eb = what_at(b[0], b[1], b[2], n, None)
    # 산맥 관통: 점이 산맥 몸 안(반폭)인 구간 수(끝 한 덩이는 발원으로 봐서 뺀다)
    cross = collections.Counter()
    for (x, y, w) in ps[1:-1]:
        for rn, rps, _ in ridges:
            d, ww = dist_to_path(x, y, rps)
            if d <= ww/2: cross[rn] += 1
    out['rivers'].append(dict(name=n, jm='_jm' in f, L=round(L), w0=ws[0], w1=ws[-1], wmin=min(ws), wmax=max(ws), pts=len(ps), end0=ea, end1=eb, cross=dict(cross), x0=a[0], y0=a[1], x1=b[0], y1=b[1]))
for n, ps, f in ridges:
    ws = [p[2] for p in ps]; L = plen(ps)/SZ
    touch = []
    for m2, ps2, _ in ridges:
        if m2 == n: continue
        d0, w0 = dist_to_path(ps[0][0], ps[0][1], ps2); d1, w1 = dist_to_path(ps[-1][0], ps[-1][1], ps2)
        if d0 <= w0/2 + ps[0][2]/2: touch.append(('시작', m2))
        if d1 <= w1/2 + ps[-1][2]/2: touch.append(('끝', m2))
    # 겹침(몸통끼리): 점 중 다른 산맥 몸 안인 비율
    ov = collections.Counter()
    for (x, y, w) in ps:
        for m2, ps2, _ in ridges:
            if m2 == n: continue
            d, ww = dist_to_path(x, y, ps2)
            if d <= ww/2: ov[m2] += 1
    out['ridges'].append(dict(name=n, jm='_jm' in f, L=round(L), wmin=min(ws), wmax=max(ws), pts=len(ps), touch=touch, overlapPts={k: v for k, v in ov.items()}, x0=ps[0][0], y0=ps[0][1], x1=ps[-1][0], y1=ps[-1][1]))
for l in lakes:
    a = l.get('a', l.get('radius')); b = l.get('b', l.get('radius')); cx, cy = l['center']
    inout = []
    for n, ps, _ in rivers:
        for (x, y, w) in (ps[0], ps[-1]):
            if ((x-cx)/(a+w/2+2*SZ))**2 + ((y-cy)/(b+w/2+2*SZ))**2 <= 1: inout.append(n)
    through = [n for n, ps, _ in rivers if n not in inout and any(((x-cx)/a)**2+((y-cy)/b)**2 <= 1 for (x, y, w) in ps)]
    nearest_ridge = min(((dist_to_path(cx, cy, ps)[0]-dist_to_path(cx, cy, ps)[1]/2)/SZ, n) for n, ps, _ in ridges) if ridges else None
    k = cellkind(cx, cy)
    edge = min(cx, ZW-cx, cy, ZH-cy) < max(a, b)
    out['lakes'].append(dict(name=l['name'], jm='_jm' in l, cx=cx, cy=cy, a=round(a/SZ), b=round(b/SZ), inout=inout, through=through, ridgeCells=round(nearest_ridge[0]) if nearest_ridge else None, ridge=nearest_ridge[1] if nearest_ridge else None, kind=k, edge=edge))
json.dump(out, open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('rivers', len(out['rivers']), 'ridges', len(out['ridges']), 'lakes', len(out['lakes']))
