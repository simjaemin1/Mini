#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T615 ① 지류 · 정본 무접촉 · 판정 0 — 재민 눈)
# =============================================================================
# 닛폰 동쪽(셀 x ≥ 1,250 = 세계 520,000) 강 길이 밀도를 **한반도와 같은 자로 잰 한반도 값**까지 지류로 채운다.
#   자(새 수 0):
#     · 목표 = 한반도 강 길이 ÷ 한반도 뭍(바다 띠 밖 셀) — 같은 셈을 닛폰 동쪽에(인자로 받는다 · 보고에 값)
#     · 폭 = 한반도 지류(하구가 다른 강에 닿는 강 37) 머리 폭 p50 · 하구 폭 p50(인자) · 하구 ≤ 본류 그 자리 폭 × 0.8(`add-tributaries.js`)
#     · 길이 = 한반도 지류 길이 [최소, 최대](인자)
#     · 발원 = 재민 산맥 몸 바깥 1셀(`t549-terrain-check` "산에서 남" = 산맥 중심선까지 반폭 + 지류 반폭 안)
#     · 본류 = 재민 강(작업 파일에서 그은 것 · `_jm`) · 본류 폭 ≥ 200 · 본류 끝 30셀 안 금지 · 다른 강과 60셀(길 앞 60%) · 마을 중심 20셀 금지
#       (전부 `add-tributaries.js` 의 HOST_MIN_W · HOST_END_CLEAR · MIN_SEP · SEP_UPTO · VIL_CLEAR)
#     · 길은 곧게(T550 ②ⓒ 문법) · 바위 · 다른 물(띠 · 강 · 호수)을 안 지난다(머리 1셀 · 하구 본류 칸은 뺀다)
#     · 갇힘 — 본토와 4이웃으로 안 이어지는 1,000셀 이상 덩이(`t549-terrain-check` 이름 문턱)가 **늘면 뺀다**(T610 ⓓ)
#   고르는 순서: 길 위 민물까지 거리(T524 걸음 아님 · 직선 거리 변환) 평균이 큰 후보부터 — 물 없는 땅을 먼저 메운다 · 하나 고를 때마다 다시 잰다.
# 쓰는 법: python3 scripts/t615-tribs.py <안.json> <T524 dir> <out 안.json> --target <셀/만셀> --head <폭> --mouth <폭> --len <최소,최대>
# =============================================================================
import json, math, sys, numpy as np
from scipy import ndimage
PL, D, OUT = sys.argv[1:4]
arg = lambda k: sys.argv[sys.argv.index(k) + 1]
TARGET = float(arg('--target')); HEAD_W = float(arg('--head')); MOUTH_W = float(arg('--mouth')); LMIN, LMAX = (float(x) for x in arg('--len').split(','))
SZ = 32; X0C = 1250
HOST_MIN_W, HOST_END_CLEAR, MIN_SEP, SEP_UPTO, VIL_CLEAR, MOUTH_RATIO = 200, 30, 60, 0.6, 20, 0.8   # add-tributaries.js
NAMED = 1000
P = json.load(open(PL, encoding='utf-8'))
J = json.load(open(f'{D}/nippon.json')); N = J['N']; NY, NX = J['NY'], J['NX']; raw = open(J['bin'], 'rb').read()
K = np.frombuffer(raw[:N], np.uint8).reshape(NY, NX)
CB = np.frombuffer(raw[3 * N:7 * N], np.int32).reshape(NY, NX)
import subprocess, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ZC = json.loads(subprocess.check_output(['node', '-e', "const Z=require('./server/zone-config.js').ZONES.nippon;console.log(JSON.stringify({b:Z.bridges}))"], cwd=ROOT))
BR = np.zeros((NY, NX), bool)
for i in range(0, len(ZC['b']), 2): BR[ZC['b'][i + 1], ZC['b'][i]] = True
yy, xx = np.nonzero((CB == J['main']) & (K == 1)); ANCH = (int(xx[len(xx) // 2]), int(yy[len(yy) // 2]))
FOUR = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])

def stroke(mask, a, b, wa, wb):
    r = max(wa, wb) / 2
    x0, x1 = int(max(0, (min(a[0], b[0]) - r) // SZ)), int(min(NX - 1, (max(a[0], b[0]) + r) // SZ))
    y0, y1 = int(max(0, (min(a[1], b[1]) - r) // SZ)), int(min(NY - 1, (max(a[1], b[1]) + r) // SZ))
    if x1 < x0 or y1 < y0: return
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1) * SZ + SZ / 2, np.arange(y0, y1 + 1) * SZ + SZ / 2)
    dx, dy = b[0] - a[0], b[1] - a[1]; L = dx * dx + dy * dy
    t = np.clip(((gx - a[0]) * dx + (gy - a[1]) * dy) / (L or 1), 0, 1)
    d = np.hypot(a[0] + t * dx - gx, a[1] + t * dy - gy)
    mask[y0:y1 + 1, x0:x1 + 1] |= d < (wa + (wb - wa) * t) / 2

def trapped(water):
    pas = ((K == 1) & ~water) | BR
    lab, n = ndimage.label(pas, structure=FOUR)
    m = lab[ANCH[1], ANCH[0]]; sz = np.bincount(lab.ravel()); sz[0] = 0; sz[m] = 0
    return int(sz[sz >= NAMED].sum())

def segd(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]), t

JM_R = [f for f in P['rivers'] if '_jm' in f]
JM_G = [g for g in P['ridges'] if '_jm' in g]
VILL = [(v['x'], v['y']) for v in P.get('villages', [])]
def east_len():
    land = (K != 2); land[:, :X0C] = False; Lc = land.sum() / 1e4; L = 0
    for f in P['rivers']:
        for a, b in zip(f['path'], f['path'][1:]):
            ax, ay = a['pos']; bx, by = b['pos']; n = max(1, int(math.hypot(bx - ax, by - ay) // SZ))
            for k in range(n):
                if ax + (bx - ax) * (k + .5) / n >= X0C * SZ: L += math.hypot(bx - ax, by - ay) / n
    return L / SZ, Lc
L0, LAND = east_len(); NEED = TARGET * LAND - L0
print(f'동쪽 뭍 {LAND:.1f}만셀 · 강 {L0:.0f}셀({L0 / LAND:.1f}/만셀) · 목표 {TARGET}/만셀 → 더할 {NEED:.0f}셀')

# 본류 표본(재민 강 · 폭 ≥ 200 · 끝 30셀 밖)
HOSTS = []
for f in JM_R:
    pts = f['path']; cum = [0]
    for a, b in zip(pts, pts[1:]): cum.append(cum[-1] + math.hypot(b['pos'][0] - a['pos'][0], b['pos'][1] - a['pos'][1]))
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        HOSTS.append((f, a, b, cum[i], cum[-1]))
def nearest_host(p):
    best = None
    for f, a, b, c0, tot in HOSTS:
        d, t = segd(p, a['pos'], b['pos']); w = a['width'] + (b['width'] - a['width']) * t
        pos = c0 + t * math.hypot(b['pos'][0] - a['pos'][0], b['pos'][1] - a['pos'][1])
        if w < HOST_MIN_W or pos < HOST_END_CLEAR * SZ or pos > tot - HOST_END_CLEAR * SZ: continue
        if best is None or d < best[0]:
            q = [a['pos'][0] + (b['pos'][0] - a['pos'][0]) * t, a['pos'][1] + (b['pos'][1] - a['pos'][1]) * t]
            best = (d, f, q, w)
    return best

WATER = (K == 2) | (K == 3)
ADDED = np.zeros((NY, NX), bool)
def edt():
    return ndimage.distance_transform_edt(~(WATER | ADDED))
DIST = edt()
T0 = trapped(ADDED)

def candidates():
    out = []
    for g in JM_G:
        pts = g['path']
        for a, b in zip(pts, pts[1:]):
            ax, ay = a['pos']; bx, by = b['pos']; L = math.hypot(bx - ax, by - ay)
            if L == 0: continue
            nx, ny = -(by - ay) / L, (bx - ax) / L
            n = max(1, int(L // (16 * SZ)))
            for k in range(n):
                t = (k + .5) / n; cx, cy = ax + (bx - ax) * t, ay + (by - ay) * t; hw = (a['width'] + (b['width'] - a['width']) * t) / 2
                for s in (1, -1):
                    h = (cx + s * nx * (hw + SZ), cy + s * ny * (hw + SZ))
                    if h[0] < X0C * SZ: continue
                    out.append((g['name'], h))
    return out
CANDS = candidates()

def check(head, host):
    d, f, q, hw = host
    L = math.hypot(q[0] - head[0], q[1] - head[1]) / SZ
    if not (LMIN <= L <= LMAX): return None, f'길이 {L:.0f}'
    mw = min(MOUTH_W, hw * MOUTH_RATIO)
    n = max(2, int(L)); mean = 0; cnt = 0
    for k in range(n + 1):
        t = k / n; x, y = head[0] + (q[0] - head[0]) * t, head[1] + (q[1] - head[1]) * t
        cx, cy = int(x // SZ), int(y // SZ)
        if not (0 <= cx < NX and 0 <= cy < NY): return None, '존 밖'
        if any(math.hypot(x - vx, y - vy) < VIL_CLEAR * SZ for vx, vy in VILL): return None, '마을'
        dist_end = (L - t * L)   # 하구까지 남은 셀
        if dist_end > hw / 2 / SZ + 1:   # 본류 칸 전
            if K[cy, cx] == 4 and t * L > 1: return None, '바위'
            if WATER[cy, cx] or ADDED[cy, cx]: return None, '물'
            if t <= SEP_UPTO and DIST[cy, cx] < MIN_SEP: return None, '이격'
            mean += DIST[cy, cx]; cnt += 1
    return (mean / max(1, cnt), mw, L), 'ok'

picked = []; rejected = {}
total = 0
while total < NEED:
    scored = []
    for gname, h in CANDS:
        host = nearest_host(h)
        if not host: continue
        r, why = check(h, host)
        if not r: rejected[why] = rejected.get(why, 0) + 1; continue
        scored.append((r[0], gname, h, host, r))
    if not scored: print('후보 다 씀'); break
    scored.sort(key=lambda s: (-s[0], s[2][0], s[2][1]))
    took = False
    for sc, gname, h, host, (mean, mw, L) in scored:
        d, f, q, hw = host
        trial = ADDED.copy()
        n = max(1, int(L * SZ // 256)); pts = []
        for k in range(n + 1):
            t = k / n; pts.append({'pos': [round(h[0] + (q[0] - h[0]) * t), round(h[1] + (q[1] - h[1]) * t)], 'width': round(HEAD_W + (mw - HEAD_W) * t)})
        for a, b in zip(pts, pts[1:]): stroke(trial, a['pos'], b['pos'], a['width'], b['width'])
        tr = trapped(trial)
        if tr > T0: rejected['갇힘'] = rejected.get('갇힘', 0) + 1; CANDS.remove((gname, h)); continue
        ADDED = trial; DIST = edt()
        k = sum(1 for p in picked if p['host'] == f['name']) + 1
        name = f"{f['name']}_지류{k}"
        P['rivers'].append({'name': name, 'path': pts, '_t615': '지류', '_host': f['name'], '_src': gname})
        picked.append(dict(name=name, host=f['name'], src=gname, cells=round(L), head=HEAD_W, mouth=mw, meanDist=round(mean)))
        total += L; took = True; CANDS.remove((gname, h)); break
    if not took: print('갇힘 · 남은 후보 없음'); break
json.dump(P, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
json.dump(dict(target=TARGET, land=LAND, len0=L0, need=NEED, added=total, rows=picked, rejected=rejected), open(OUT.replace('.json', '_tribs.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'지류 {len(picked)} · {total:.0f}셀 → 동쪽 {(L0 + total) / LAND:.1f}/만셀 · 거름 {rejected}')
for p in picked: print(f"  {p['name']} ← {p['src']} · {p['cells']}셀 · 폭 {p['head']:.0f}→{p['mouth']:.0f} · 물까지 평균 {p['meanDist']}셀")
