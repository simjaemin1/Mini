#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T610 ① 닛폰 동쪽 **안2** · 정본 무접촉 · 판정 0 — 재민 눈)
# =============================================================================
# T595 안(`t591-east.py`)은 막다른 하구 15줄기를 가장 가까운 바다 띠까지 곧게 늘였다 → 두 강 줄기와 띠 사이 뭍이 갇혔다(7.30%).
# 안2 = 같은 15줄기 · 같은 문법(하구에서 곧게 · 폭 = 하구 폭 · T550 ②ⓒ) — 줄기마다 **갇힘이 안 늘어나는 첫 안**을 고른다(순서 = 넓은 강 먼저):
#   ⓐ 안 그대로 — 가장 가까운 띠 칸 + 2셀(길에 다른 강이 먼저 닿으면 합류)
#   ⓑ 합류 — 가장 가까운 **제 폭 이상인 다른 강**(이미 고른 연장 포함)까지(길이 띠를 안 지나는 것만)
#   ⓒ 바다 앞에서 멈춤 — ⓐ 방향으로 가되 끝이 띠에서 반폭 + 2셀 **밖**(= T549 "닿음" 자의 바로 바깥 · 끝과 띠 사이 뭍 3셀 길)
#   ⓓ 빼기 — 연장 0(지금 그대로)
#   갇힘 = 지나갈 수 있는 칸(뭍 + 다리) 중 본토(도가이 광장 칸의 성분)와 이어지지 않은 **1,000셀 이상 덩이**(`t549-terrain-check` 이름 문턱) — 4이웃(서버 걸음 = 축 4방) · 다리는 지나간다.
#   (띠 b 의 섬 · 강 칸 가장자리 부스러기는 그 아래라 안 센다 — 끝 판정은 T524 자 전체로 다시 잰다)
#   새 수 0 — 반폭 + 2셀(T549 · T591) · +2셀(T550) · 4이웃(다리 층 불변식)만 쓴다.
# 바탕 = T524 자 셀 종류(지금 정본 · `T588_COAST=b` 로 잰 판을 준다) · 강 칸은 셀 중심이 선분에서 폭/2 안(`terrain._isPointInRiver` 와 같은 꼴 · 끝 확인은 T524 자로 다시).
# 쓰는 법: python3 scripts/t610-east2.py <지금 T524 dir> <T595 안_east.json(줄기 목록)> <out 안2.json(존 절)>  → 옆에 *_east2.json(표)
# =============================================================================
import json, math, sys, numpy as np
from scipy import ndimage
DNOW, EROWS, OUT = sys.argv[1:4]
ROOT = __file__.rsplit('/scripts/', 1)[0]
SZ = 32
J = json.load(open(f'{DNOW}/nippon.json')); N = J['N']; NY, NX = J['NY'], J['NX']
K = np.frombuffer(open(J['bin'], 'rb').read()[:N], np.uint8).reshape(NY, NX).copy()
P = json.load(open(f'{ROOT}/server/hanbando-terrain.json', encoding='utf-8'))['nippon']
import subprocess
ZC = json.loads(subprocess.check_output(['node', '-e', "const Z=require('./server/zone-config.js').ZONES.nippon;console.log(JSON.stringify({b:Z.bridges,ms:Z.mainSquare}))"], cwd=ROOT))
BR = np.zeros((NY, NX), bool)
for i in range(0, len(ZC['b']), 2): BR[ZC['b'][i + 1], ZC['b'][i]] = True
MS = (int(ZC['ms']['x'] // SZ), int(ZC['ms']['y'] // SZ))
if K[MS[1], MS[0]] != 1:   # 광장 칸이 뭍이 아니면(물 · 바위) 본토 성분(T524 `main`)의 가장 가까운 뭍 칸을 닻으로
    CB = np.frombuffer(open(J['bin'], 'rb').read()[3 * N:7 * N], np.int32).reshape(NY, NX)
    yy, xx = np.nonzero((CB == J['main']) & (K == 1)); j = int(np.argmin((xx - MS[0]) ** 2 + (yy - MS[1]) ** 2)); MS = (int(xx[j]), int(yy[j]))
NAMES = [r['name'] for r in json.load(open(EROWS, encoding='utf-8'))['rows']]
NAMES.sort(key=lambda n: -max(p['width'] for p in {f['name']: f for f in P['rivers']}[n]['path']))   # 넓은 강이 먼저 바다를 고른다(지류가 줄기를 막지 않게)
BAND = K == 2
by, bx = np.nonzero(BAND); BC = np.stack([bx * SZ + SZ // 2, by * SZ + SZ // 2], 1)
FOUR = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
NAMED = 1000   # `t549-terrain-check` 가 이름 붙이는 본토 밖 성분 문턱(= T580_EMPTY_MIN 1000) — 새 수 0

def stroke(mask, a, b, w):
    """셀 중심이 선분 a-b 에서 w/2 안인 칸을 True 로."""
    r = w / 2
    x0, x1 = int(max(0, (min(a[0], b[0]) - r) // SZ)), int(min(NX - 1, (max(a[0], b[0]) + r) // SZ))
    y0, y1 = int(max(0, (min(a[1], b[1]) - r) // SZ)), int(min(NY - 1, (max(a[1], b[1]) + r) // SZ))
    if x1 < x0 or y1 < y0: return
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1) * SZ + SZ / 2, np.arange(y0, y1 + 1) * SZ + SZ / 2)
    dx, dy = b[0] - a[0], b[1] - a[1]; L = dx * dx + dy * dy
    t = np.clip(((gx - a[0]) * dx + (gy - a[1]) * dy) / (L or 1), 0, 1)
    d = np.hypot(a[0] + t * dx - gx, a[1] + t * dy - gy)
    mask[y0:y1 + 1, x0:x1 + 1] |= d < r

def trapped(water):
    pas = ((K == 1) & ~water) | BR
    lab, n = ndimage.label(pas, structure=FOUR)
    m = lab[MS[1], MS[0]]
    sz = np.bincount(lab.ravel()); sz[0] = 0; sz[m] = 0
    return int(sz[sz >= NAMED].sum())   # 이름 붙는 덩이(≥ 1,000셀)만 — 강 칸 가장자리와 띠 사이 부스러기는 안 센다(끝 표에 따로)

def band_near(x, y, r):
    cx, cy = int(x // SZ), int(y // SZ); R = int(math.ceil(r / SZ))
    y0, y1, x0, x1 = max(0, cy - R), min(NY, cy + R + 1), max(0, cx - R), min(NX, cx + R + 1)
    return bool(BAND[y0:y1, x0:x1].any()) if y1 > y0 and x1 > x0 else True

def mouth(f):
    a, b = f['path'][0], f['path'][-1]
    return (len(f['path']) - 1, 'end') if b['width'] >= a['width'] else (0, 'start')

def seg_d(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)); return math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1])

RIV = {f['name']: f for f in P['rivers']}
def first_hit(m, tgt, me, w):
    """m → tgt 직선에서 다른 강(물가)에 먼저 닿는 점(T591 east 와 같은 식)."""
    n = max(1, int(math.hypot(tgt[0] - m[0], tgt[1] - m[1]) // SZ))
    for k in range(1, n + 1):
        q = (m[0] + (tgt[0] - m[0]) * k / n, m[1] + (tgt[1] - m[1]) * k / n)
        for g in P['rivers']:
            if g is me: continue
            for a, b in zip(g['path'], g['path'][1:]):
                if seg_d(q, a['pos'], b['pos']) < (a['width'] + b['width']) / 4 + w / 2: return [round(q[0]), round(q[1])], g['name']
    return None

def nearest_other(m, me, w):
    best = None
    for g in P['rivers']:
        if g is me: continue
        for a, b in zip(g['path'], g['path'][1:]):
            if (a['width'] + b['width']) / 2 < w: continue   # 지류는 제 폭 이상인 줄기로만 든다(큰 강이 작은 강으로 안 든다)
            d = seg_d(m, a['pos'], b['pos'])
            if best is None or d < best[0]:
                ax, ay = a['pos']; bx_, by_ = b['pos']; dx, dy = bx_ - ax, by_ - ay; L = dx * dx + dy * dy
                t = 0 if L == 0 else max(0, min(1, ((m[0] - ax) * dx + (m[1] - ay) * dy) / L))
                best = (d, [round(ax + t * dx), round(ay + t * dy)], g['name'])
    return best

def crosses_band(m, tgt):
    n = max(1, int(math.hypot(tgt[0] - m[0], tgt[1] - m[1]) // SZ))
    for k in range(0, n):   # 끝점(합류점)은 빼고
        q = (m[0] + (tgt[0] - m[0]) * k / n, m[1] + (tgt[1] - m[1]) * k / n)
        cx, cy = int(q[0] // SZ), int(q[1] // SZ)
        if 0 <= cx < NX and 0 <= cy < NY and BAND[cy, cx]: return True
    return False

WATER = np.zeros((NY, NX), bool)   # 고른 연장 칸(누적)
T0 = trapped(WATER)
rows = []
for name in NAMES:
    f = RIV[name]; i, side = mouth(f); m = f['path'][i]['pos']; w = f['path'][i]['width']; r = w / 2 + 2 * SZ
    if band_near(m[0], m[1], r): rows.append(dict(name=name, act='이미 닿음(띠 b)', cells=0, width=w, trapped=T0)); continue
    d2 = (BC[:, 0] - m[0]) ** 2 + (BC[:, 1] - m[1]) ** 2; j = int(np.argmin(d2)); near = BC[j].tolist(); L = math.sqrt(float(d2[j]))
    ux, uy = (near[0] - m[0]) / (L or 1), (near[1] - m[1]) / (L or 1)
    tries = []
    tA = [round(near[0] + ux * 2 * SZ), round(near[1] + uy * 2 * SZ)]; h = first_hit(m, tA, f, w)
    tries.append(('ⓐ 안(띠 +2셀)', h[0] if h else tA, f'강 {h[1]} 합류' if h else '새 바다 띠'))
    no = nearest_other(m, f, w)
    if no and not crosses_band(m, no[1]): tries.append(('ⓑ 합류', no[1], f'강 {no[2]} 합류'))
    stopL = L - (r + SZ)   # 끝이 띠에서 반폭 + 2셀 + 1셀
    if stopL > SZ:
        tC = [round(m[0] + ux * stopL), round(m[1] + uy * stopL)]; h = first_hit(m, tC, f, w)
        tries.append(('ⓒ 바다 앞 멈춤', h[0] if h else tC, f'강 {h[1]} 합류' if h else f'띠 앞 {round((r + SZ) / SZ)}셀'))
    pick = None
    for act, tgt, why in tries:
        Wt = WATER.copy(); stroke(Wt, m, tgt, w); t = trapped(Wt)
        if t <= T0: pick = (act, tgt, why, Wt, t); break
    if not pick:
        rows.append(dict(name=name, act='ⓓ 빼기', cells=0, width=w, trapped=T0, tried=[a for a, _, _ in tries])); continue
    act, tgt, why, WATER, T0 = pick
    n = max(1, int(math.hypot(tgt[0] - m[0], tgt[1] - m[1]) // 256))
    add = [{'pos': [round(m[0] + (tgt[0] - m[0]) * k / n), round(m[1] + (tgt[1] - m[1]) * k / n)], 'width': w} for k in range(1, n + 1)]
    f['path'] = (f['path'] + add) if side == 'end' else (add[::-1] + f['path'])
    rows.append(dict(name=name, act=act, frm=m, to=tgt, cells=round(math.hypot(tgt[0] - m[0], tgt[1] - m[1]) / SZ), width=w, why=why, trapped=T0))
json.dump(P, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
json.dump(dict(zone='nippon', rows=rows), open(OUT.replace('.json', '_east2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'안2 — 줄기 {len(rows)} · 연장 합 {sum(r["cells"] for r in rows)}셀 · 갇힌 칸(래스터) {T0}')
for r in rows: print(f"  {r['name']} {r['act']} · {r['cells']}셀 · 폭 {r['width']} · {r.get('why', '')} · 갇힌 {r['trapped']}")
