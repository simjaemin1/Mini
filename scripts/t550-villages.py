#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T550 ③ⓑ 마을 후보 · 정본 무접촉 · 판정 0 — 재민이 에디터에서 고친다)
# =============================================================================
# 닛폰 마을 후보를 **기계가 뽑아 표·그림으로 낸다**(카드 §③ⓑ). 새 수 0 — 자는 전부 한반도에서 읽는다:
#   수   = 한반도 51 × (닛폰 뭍 / 한반도 뭍)                                      (밀도 비례)
#   자리 = 뭍 · 민물 걸음 ≤ 한반도 p50(T524 자 · 86셀) · 그 성분이 후보 한 몫(뭍/수) 이상 · 존 가장자리 여백(절차 배치기 600/900px) 밖
#          · 후보끼리 최근접 ≥ 한반도 정본 51곳의 최근접 거리 p80(px)                  (간격)
#          · 옛 16 은 둔다(지우는 건 재민) — "설 자리 0"(T524 `cell -1`)만 가장 가까운 자리로 옮긴다(T535 문법)
#          · 새 것은 **가장 먼 점 먼저**(이미 있는 후보들에서 가장 먼 허용 칸) — 결정론
#   꼴   = 광맥 걸음 ≤ 한반도 p95(127셀) → mining(자리 = 그 광맥 중심) · 바다 띠/큰 강 ≤ 한반도 민물 p50 → riverside
#          · 숲 ≤ 한반도 숲 p50 → forest · 나머지 plain   (큰 강 = 그 자리 폭 ≥ 한반도 강 점 폭 p50)
# 쓰는 법: python3 scripts/t550-villages.py <안(nippon 절).json> <T524 닛폰 디렉터리> <T524 한반도 json> <정본 hanbando-terrain.json> <후보 얹은 안.json>
#   → 옆에 *_villages.json(표)
# =============================================================================
import json, math, sys
import numpy as np
from scipy import ndimage as ndi
P = json.load(open(sys.argv[1], encoding='utf-8')); TD = sys.argv[2]; H = json.load(open(sys.argv[3], encoding='utf-8'))
HC = json.load(open(sys.argv[4], encoding='utf-8')); OUT = sys.argv[5]
J = json.load(open(f'{TD}/nippon.json', encoding='utf-8')); N = J['N']; NY, NX = J['NY'], J['NX']; raw = open(J['bin'], 'rb').read()
kind = np.frombuffer(raw[:N], np.uint8).reshape(NY, NX)
cb = np.frombuffer(raw[3 * N:7 * N], np.int32).reshape(NY, NX)
off = 11 * N; D = {}
for k in ('fresh', 'forest', 'ore', 'rock', 'sea'): D[k] = np.frombuffer(raw[off:off + 2 * N], np.uint16).reshape(NY, NX); off += 2 * N
SZ = 32
land = kind == 1; L = int(land.sum())
HB_LAND = H['counts']['land'] if 'counts' in H and 'land' in H['counts'] else int(H['dist']['fresh']['n'])
TARGET = round(len(HC['hanbando']['villages']) * L / HB_LAND)
# ★[T616] 카드가 수를 따로 셈한 판(51 × 닛폰 뭍 ÷ 한반도 뭍 · 바다 띠 밖 셀)이면 `--target <수>` 로 준다(없으면 위 식 그대로)
if '--target' in sys.argv: TARGET = int(sys.argv[sys.argv.index('--target') + 1])
P50F, P95O, P50FO = H['dist']['fresh']['p50'], H['dist']['ore']['p95'], H['dist']['forest']['p50']
hv = HC['hanbando']['villages']
nn = sorted(min(math.hypot(a['x'] - b['x'], a['y'] - b['y']) for b in hv if b is not a) for a in hv)
SEP = nn[int(0.8 * (len(nn) - 1))]
ws = sorted(p['width'] for r in HC['hanbando']['rivers'] for p in r['path'])
WBIG = ws[len(ws) // 2]
# 큰 강 칸 + 바다 띠 → 유클리드 거리(셀)
big = np.zeros((NY, NX), bool)
for r in P['rivers']:
    for a, b in zip(r['path'], r['path'][1:]):
        if (a['width'] + b['width']) / 2 < WBIG: continue
        n = max(1, int(math.hypot(b['pos'][0] - a['pos'][0], b['pos'][1] - a['pos'][1]) // 16))
        for k in range(n + 1):
            x = a['pos'][0] + (b['pos'][0] - a['pos'][0]) * k / n; y = a['pos'][1] + (b['pos'][1] - a['pos'][1]) * k / n
            cx, cy = int(x // SZ), int(y // SZ)
            if 0 <= cx < NX and 0 <= cy < NY: big[cy, cx] = True
dBigSea = ndi.distance_transform_edt(~(big | (kind == 2)))
# 허용 칸
comp_area = {c['id']: c['area'] for c in J['compsB']}
share = L / TARGET
okcomp = np.isin(cb, [cid for cid, a in comp_area.items() if a >= share])
# 존 가장자리 띠는 뺀다 — 절차 배치기(`chunk.generateVillagesForZone`)의 여백 그대로(가로 600px · 세로 900px · 새 수 0)
yy, xx = np.mgrid[0:NY, 0:NX]
inner = (xx * SZ >= 600) & ((xx + 1) * SZ <= NX * SZ - 600) & (yy * SZ >= 900) & ((yy + 1) * SZ <= NY * SZ - 900)
allow = land & (D['fresh'] <= P50F) & okcomp & inner
# ★[T616] 새 후보를 존의 한쪽에만(`--min-x <px>` · 닛폰 동쪽 = 40,000 = 세계 520,000) — 카드 "차이만큼 동쪽에"(없으면 존 전체 · 종전 그대로)
if '--min-x' in sys.argv: allow &= (xx * SZ >= float(sys.argv[sys.argv.index('--min-x') + 1]))
if '--max-x' in sys.argv: allow &= ((xx + 1) * SZ <= float(sys.argv[sys.argv.index('--max-x') + 1]))   # ★[T638] 반대쪽(서쪽)만
ay, ax = np.nonzero(allow)
APX = np.stack([ax * SZ + SZ / 2, ay * SZ + SZ / 2], 1)
def nearest_allowed(x, y):
    d2 = (APX[:, 0] - x) ** 2 + (APX[:, 1] - y) ** 2; j = int(np.argmin(d2)); return APX[j].tolist(), math.sqrt(float(d2[j]))
rows = []; V = []
vin = {v['name']: v for v in J['vills']}
for v in P['villages']:
    a = vin.get(v['name'], {})
    if a.get('cell', 0) == -1:
        (nx, ny), d = nearest_allowed(v['x'], v['y'])
        rows.append(dict(name=v['name'], kind='옛 · 옮김', frm=[round(v['x']), round(v['y'])], to=[round(nx), round(ny)], moved=round(d), why=a.get('why')))
        V.append(dict(v, x=nx, y=ny))
    else:
        rows.append(dict(name=v['name'], kind='옛', at=[round(v['x']), round(v['y'])], why=a.get('why')))
        V.append(dict(v))
# 새 후보 — 가장 먼 점 먼저
added = 0
while len(V) < TARGET:
    have = np.array([[v['x'], v['y']] for v in V])
    dmin = np.full(len(APX), np.inf)
    for hx, hy in have: dmin = np.minimum(dmin, np.hypot(APX[:, 0] - hx, APX[:, 1] - hy))
    j = int(np.argmax(dmin))
    if dmin[j] < SEP: break
    added += 1; V.append({'name': f'새후보{added}', 'x': float(APX[j][0]), 'y': float(APX[j][1]), 'type': None, '_new': True})
    rows.append(dict(name=f'새후보{added}', kind='새', at=[round(APX[j][0]), round(APX[j][1])], nearest=round(float(dmin[j]))))
# 꼴(새 것만 — 옛 16 의 꼴은 재민 몫이라 그대로)
ores = [(o['name'], o['center'][0], o['center'][1]) for o in P.get('ores', [])]
for v, r in zip(V, rows):
    if not v.get('_new'): continue
    cx, cy = int(v['x'] // SZ), int(v['y'] // SZ)
    t = 'plain'
    if D['ore'][cy, cx] <= P95O and ores:
        o = min(ores, key=lambda q: math.hypot(q[1] - v['x'], q[2] - v['y'])); t = 'mining'; r['ore'] = o[0]
        ox, oy = int(o[1] // SZ), int(o[2] // SZ)
        if 0 <= ox < NX and 0 <= oy < NY and land[oy, ox] and okcomp[oy, ox] and inner[oy, ox]: v['x'], v['y'] = float(o[1]), float(o[2]); r['at'] = [o[1], o[2]]   # 광산N = 광맥N 중심(뭍 · 큰 성분 · 여백 안 — 민물 자는 안 쓴다 · 광맥은 산 기슭)
        else: r['oreCenter'] = '바위/물/허용 밖 — 자리는 그대로'
    elif dBigSea[cy, cx] <= P50F: t = 'riverside'
    elif D['forest'][cy, cx] <= P50FO: t = 'forest'
    v['type'] = t; r['type'] = t
    r.update(fresh=int(D['fresh'][cy, cx]), ore=int(D['ore'][cy, cx]), forest=int(D['forest'][cy, cx]), bigsea=round(float(dBigSea[cy, cx])))
out = [{'name': v['name'], 'x': v['x'], 'y': v['y'], 'type': v['type']} for v in V]
P['villages'] = out
json.dump(P, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
meta = dict(target=TARGET, land=L, hbLand=HB_LAND, sep=round(SEP), wBig=WBIG, p50fresh=P50F, p95ore=P95O, p50forest=P50FO, allowCells=int(allow.sum()), share=round(share), old=len(P['villages']) - added, added=added)
json.dump(dict(meta=meta, rows=rows), open(OUT.replace('.json', '_villages.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(meta, ensure_ascii=False))
for r in rows: print(' ', json.dumps(r, ensure_ascii=False))
