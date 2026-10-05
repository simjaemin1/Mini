#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T651 표 · 제품 무변 · 새 수 0 · 판정 0)
# =============================================================================
# econ 이 재는 "바다까지 거리"(`server/villages.js seaDistPx` → `land._seaDistPx`)를 지형 정본 마스크와 마을마다 맞대 본다.
#   econ   = 시딩 씨앗(t17-metrics `LAB_SEEDCACHE`)의 `lp._seaDistPx` ÷ 32 — 엔진이 받은 그 값(사본 0)
#   ⓐ 곧은(제 존) = 제 존 해안 띠 마스크(`t588-coast-mask.js` = `chunk.generateCoastlineWaterTiles` · 해안 b)에 대한 유클리드 거리 변환
#                   (셀 중심 사이 · econ 과 같은 식을 독립으로 다시 잰 것 — 같으면 "정의는 같다")
#   ⓑ 곧은(세계) = 제 존 띠 ∪ 이웃 뭍 존들의 띠 ∪ 바다 존 사각 — 존 경계 너머 바다까지(econ 은 제 존 띠만 본다)
#   ⓒ 걸음     = T524 실걸음 BFS(4방 · 뭍 ∪ 다리만 · 바위·민물·띠는 못 지남) — 띠에 닿은 뭍 칸이 0 → +1 해서 "바다 칸까지 칸 수"
#   ⓓ 하구     = 띠에 닿은 민물 성분(바다로 이어진 강·호수)까지 곧은 거리 — "강 하구를 바다로 친다면"의 참고 칸(문턱 셈만)
#   문턱 둘 = 어장권 140셀(`LAND_SCAN_R`) · 자염 30셀(`SALT_COAST_PX` 960px) — 둘 다 정본 수 그대로.
#   가장 가까운 바다의 자리 = 그 칸이 제 띠의 어느 변(N/S/W/E — 존 가장자리 가까운 쪽) · 이웃 존 띠 · 바다 존.
# 쓰는 법: python3 scripts/t651-coast-table.py <zone> <seeds.json> <mask.u8> <T524 dir> <이웃 마스크 dir> <out.json>
# =============================================================================
import json, sys, subprocess, os, numpy as np
from scipy import ndimage
Z, SEEDS, MASK, AD, ND, OUT = sys.argv[1:7]
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SZ = 32; PAD = 300
ZC = json.loads(subprocess.check_output(['node', '-e', "const {ZONES}=require('./server/zone-config');const o={};for(const [k,z] of Object.entries(ZONES))o[k]={x:z.worldOffsetX,y:z.worldOffsetY,w:z.zoneWidth,h:z.zoneHeight,ocean:!!z.isOcean};console.log(JSON.stringify(o))"], cwd=ROOT))
zc = ZC[Z]; NX, NY = -(-zc['w'] // SZ), -(-zc['h'] // SZ)
M = np.fromfile(MASK, np.uint8).reshape(NY, NX) > 0
J = json.load(open(f'{AD}/{Z}.json')); N = J['N']
raw = open(J['bin'], 'rb').read()
ANX, ANY = J['NX'], J['NY']
K = np.frombuffer(raw[:N], np.uint8).reshape(ANY, ANX)
off = 3 * N + 2 * 4 * N + 4 * 2 * N   # kind·forest·ore(u8) · compB·comp0(i32) · fresh·forest·ore·rock(u16) → sea(u16)
DSEA = np.frombuffer(raw[off:off + 2 * N], np.uint16).reshape(ANY, ANX)
CB = np.frombuffer(raw[3 * N:7 * N], np.int32).reshape(ANY, ANX)   # 다리 판 성분 — ≥ 0 = 통행(뭍 ∪ 다리 · T524 passB)
# ⓒ' 걸음(8방) — 같은 통행 칸 위 8방 측지 거리(대각 √2 · skimage MCP_Geometric). 4방 BFS 의 계단 부풀림(최대 √2배)을 뺀 것 —
#     곧은 거리와의 차가 "막힌 것을 돌아간 몫"이다. 출발 = 띠에 닿은(8방) 통행 칸(값 = 그 칸과 띠 칸 사이 1).
from skimage.graph import MCP_Geometric
PASS = CB >= 0
SEA = M[:ANY, :ANX]
starts = np.argwhere(PASS & ndimage.binary_dilation(SEA, structure=np.ones((3, 3), bool)))
COST = np.where(PASS, 1.0, np.inf)
G8, _ = MCP_Geometric(COST, fully_connected=True).find_costs([tuple(x) for x in starts])
# ⓐ 제 존
E_own = ndimage.distance_transform_edt(~M)
# ⓑ 세계 창(존 + PAD 셀)
gx0, gy0 = zc['x'] // SZ - PAD, zc['y'] // SZ - PAD
WX, WY = NX + 2 * PAD, NY + 2 * PAD
W = np.zeros((WY, WX), np.uint8)   # 0 뭍 · 1 제 띠 · 2 이웃 띠 · 3 바다 존
SRC = np.zeros((WY, WX), np.int16) - 1; names = []
def put(x0, y0, sub, code, nm):
    ys, xs = max(0, y0 - gy0), max(0, x0 - gx0)
    ye, xe = min(WY, y0 - gy0 + sub.shape[0]), min(WX, x0 - gx0 + sub.shape[1])
    if ye <= ys or xe <= xs: return
    s = sub[ys - (y0 - gy0):ye - (y0 - gy0), xs - (x0 - gx0):xe - (x0 - gx0)]
    names.append(nm); W[ys:ye, xs:xe][s] = code; SRC[ys:ye, xs:xe][s] = len(names) - 1
for k, z in ZC.items():
    x0, y0, w, h = z['x'] // SZ, z['y'] // SZ, -(-z['w'] // SZ), -(-z['h'] // SZ)
    if x0 > gx0 + WX or y0 > gy0 + WY or x0 + w < gx0 or y0 + h < gy0: continue
    if z['ocean']: put(x0, y0, np.ones((h, w), bool), 3, '바다 존 ' + k)
    elif k != Z:
        p = f'{ND}/{k}.u8'
        if not os.path.exists(p): subprocess.check_call(['node', 'scripts/t588-coast-mask.js', k, p], cwd=ROOT, stdout=subprocess.DEVNULL)
        put(x0, y0, np.fromfile(p, np.uint8).reshape(h, w) > 0, 2, '이웃 띠 ' + k)
put(zc['x'] // SZ, zc['y'] // SZ, M, 1, '제 띠')
E_w, IDX = ndimage.distance_transform_edt(W == 0, return_indices=True)
# ⓓ 하구 = 띠에 닿은 민물 성분
FR = K == 3
lab, n = ndimage.label(FR)
touch = np.unique(lab[ndimage.binary_dilation(M[:ANY, :ANX]) & FR]); touch = touch[touch > 0]
EST = np.isin(lab, touch)
E_est = ndimage.distance_transform_edt(~(EST | M[:ANY, :ANX]))
META = json.load(open(MASK[:-3] + '.json', encoding='utf-8'))   # t588-coast-mask 의 존 기하 · 바다 변 · 구간 표(secs)
OSIDES = sorted({x['side'] for x in META['sides'] if x['side'] in 'NSWE'})
def side(cx, cy):   # 제 띠 칸 → 그 칸을 깎은 바다 변(이 존에 바다가 닿은 변 중 가장 가까운 것) · 그 변의 구간(coast-shape SECTIONS)
    d = {'W': cx, 'E': NX - 1 - cx, 'N': cy, 'S': NY - 1 - cy}
    sd = min(OSIDES, key=lambda k: d[k]) if OSIDES else min(d, key=d.get)
    wx, wy = zc['x'] + cx * SZ + SZ / 2, zc['y'] + cy * SZ + SZ / 2
    sec = next((q['id'] for q in META.get('secs', []) if q['zone'] == Z and q['side'] == sd and
                ((q['ax'] <= wx < q['bx']) if sd in 'NS' else (q['ay'] <= wy < q['by']))), '-')
    return sd + ' ' + sec
S = json.load(open(SEEDS, encoding='utf-8')); rows = []
for s in S:
    cx, cy = s['ccx'], s['ccy']; econ = s['lp']['_seaDistPx'] / SZ
    wx, wy = cx + PAD, cy + PAD
    ny_, nx_ = IDX[0][wy, wx], IDX[1][wy, wx]; src = names[SRC[ny_, nx_]]
    where = ('띠 ' + side(nx_ - PAD, ny_ - PAD)) if src == '제 띠' else src
    walk = int(DSEA[cy, cx]); walk = (0 if M[cy, cx] else None) if walk == 65535 else walk + 1   # 띠 위(자가 띠를 안 본 시딩) = 0
    r = dict(name=s['name'], cell=[cx, cy], econ=round(econ, 1), own=round(float(E_own[cy, cx]), 1), world=round(float(E_w[wy, wx]), 1), walk=walk, walk8=(0.0 if M[cy, cx] else None) if not np.isfinite(G8[cy, cx]) else round(float(G8[cy, cx]) + 1, 1),
             edgeWN=min(cx, cy),
             estuary=round(float(E_est[cy, cx]), 1) if cy < ANY and cx < ANX else None, nearest=where, nearestCell=[int(nx_ - PAD), int(ny_ - PAD)],
             onBand=bool(M[cy, cx]), kind=int(K[cy, cx]) if cy < ANY and cx < ANX else None)
    rows.append(r)
def cnt(key, th): return sum(1 for r in rows if r[key] is not None and r[key] <= th)
summ = {k: {'140': cnt(k, 140), '30': cnt(k, 30)} for k in ('econ', 'own', 'world', 'walk', 'walk8', 'estuary', 'edgeWN')}
json.dump(dict(zone=Z, n=len(rows), summary=summ, rows=rows), open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(Z, len(rows), json.dumps(summ, ensure_ascii=False))
print('econ≠ⓐ(>0.5셀)', [(r['name'], r['econ'], r['own']) for r in rows if abs(r['econ'] - r['own']) > 0.5])
