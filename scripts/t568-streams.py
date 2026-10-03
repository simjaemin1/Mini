#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T568 PM 자 · 라이브 DB 사본(맥 ~/Mini/_db/) 지도 굽기·개울 미리보기 · 제품 무변 · 디렉터리 = 환경변수 T568_DIR)
import json, sqlite3, sys
import numpy as np
from scipy import ndimage
import os; D = os.environ.get('T568_DIR', '/tmp/out/live')
kind = np.load(f'{D}/kind.npy'); NY, NX = kind.shape
acc = np.fromfile(f'{D}/acc.u32', np.uint32).reshape(NY, NX)
terr = np.load(f'{D}/terr.npy')
land = kind == 1
water = (kind == 2) | (kind == 3)
c = sqlite3.connect(f'{D}/live.db')
def rows(t): return np.array(c.execute('select village_id,cx,cy from village_buildings where type=?', (t,)).fetchall(), np.int64).reshape(-1, 3)
houses = rows('house')
built = np.zeros((NY, NX), bool)
for t in ('yard', 'plaza', 'garden', 'dryfield', 'farmland', 'ditch', 'granary', 'hall', 'shelter'):
    r = rows(t); r = r[(r[:, 1] < NX) & (r[:, 2] < NY)]; built[r[:, 2], r[:, 1]] = True
fields = np.zeros((NY, NX), bool)
for t in ('garden', 'dryfield', 'farmland'):
    r = rows(t); fields[r[:, 2], r[:, 1]] = True
B = np.array(c.execute("select x,y from buildings where type in ('floor','wall')").fetchall(), float).reshape(-1, 2)
bx, by = (B[:, 0] // 32).astype(int), (B[:, 1] // 32).astype(int)
bld = np.zeros((NY, NX), bool); ok = (bx < NX) & (by < NY); bld[by[ok], bx[ok]] = True
lot = np.zeros((NY, NX), bool)
dd = [(dx, dy) for dy in range(-7, 8) for dx in range(-7, 8) if (dx + .5) ** 2 + (dy + .5) ** 2 < 6.5 ** 2]
for _, x, y in houses:
    for dx, dy in dd:
        if 0 <= x + dx < NX and 0 <= y + dy < NY: lot[y + dy, x + dx] = True
Dw0 = np.load(f'{D}/Dw.npy')
# ★★[T571 2026-10-03 · 세션3] 물길 점검 자 — 랩 `lab/마을실험실.html` STREAM-CORE `streamAudit` 과 **같은 정의**(한 정의 · 두 언어 · 숫자 새로 0):
#   ⓐ 두 물(강·호수·바다 = 물 셀 8방 성분)에 닿는 개울 성분 수 ⓑ 끊긴 조각(물에 안 닿는 개울 성분) ⓒ 강 기슭 2셀 안을 **따라** 흐르는 줄기 셀 비율
#   (체비셰프 2 안에 물 · 물까지 4걸음 이상) ⓓ 나란한 두 개울(서로 다른 가지가 1셀 틈 — 축·대각 거리 2, 사이 칸 개울 아님 — 으로 n셀 이상) 가지 쌍 수
#   ⓔ 큰 물을 가로지르는 개울(개울 ∩ 물 · 물 셀에서 다시 나오는 흐름 — 구조상 0). 가지 = 줄기(집수 ≥ A) 나무를 합류점에서 자른 마디.
#   흐름 방향 `down.i32`(t568-flow.js 의 6번째 인자 출력)가 있을 때만 잰다. 판(T571_MODES, 쉼표): land = 이 스크립트 본래 판(뭍에만 — 기본) ·
#   foot = 물까지 바위 없는 개울만(기슭에서 시작) · gorge = 바위 위도 잇고 둘레 한 칸 바위를 깎는다(계곡 · 개울 폭 + 2). 기본 출력(land 판 runs)은 종전과 같다.
DOWN_F = f'{D}/down.i32'
down = np.fromfile(DOWN_F, np.int32) if os.path.exists(DOWN_F) else None
rock = kind == 4
S8 = np.ones((3, 3), bool)
def _shift(a, dy, dx, fill=0):   # a[y+dy, x+dx] 를 (y, x) 자리에(가장자리 밖 = fill)
    out = np.full_like(a, fill); H, W = a.shape
    ys0, ys1 = max(0, -dy), H - max(0, dy); xs0, xs1 = max(0, -dx), W - max(0, dx)
    out[ys0:ys1, xs0:xs1] = a[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx]; return out
def _jump(nxt, val=None):   # 포인터 건너뛰기 — nxt 사슬 끝까지(끝 = 자기 자신) · val 이 있으면 사슬 위 OR
    nxt = nxt.copy(); v = None if val is None else val.copy()
    while True:
        n2 = nxt[nxt]
        if v is not None: v |= v[nxt]
        if np.array_equal(n2, nxt): return nxt, v
        nxt = n2
WL, NW = ndimage.label(water, structure=S8)
def stream_mask(A, mode):   # 판별 개울 — land 는 위 본래 식과 같다
    if mode == 'land': return land & (acc >= A), land & (acc >= 4 * A), None
    if mode == 'foot':
        f = down.copy(); N0 = f.size; ar = np.arange(N0)
        wet = np.zeros(N0, bool); ok = f >= 0; wet[ok] = water.ravel()[f[ok]]
        nxt = np.where(ok & ~wet, f, ar)                   # 물에 닿으면 사슬 끝
        _, bad = _jump(nxt, rock.ravel().copy())           # 물까지 길에 바위가 하나라도
        clean = (~bad).reshape(NY, NX) & land
        return clean & (acc >= A), clean & (acc >= 4 * A), None
    if mode == 'gorge':
        lr = land | rock
        g1 = lr & (acc >= A); g2 = lr & (acc >= 4 * A)
        return g1, g2, None
    raise SystemExit('판?: ' + mode)
def full_mask(A, mode):
    s1, s2, _ = stream_mask(A, mode)
    base = (land | rock) if mode == 'gorge' else land
    s = s1 | (ndimage.binary_dilation(s2, structure=np.ones((2, 2), bool)) & base)
    carve = (ndimage.binary_dilation(s & rock, structure=S8) & rock) if mode == 'gorge' else None
    return s, s1, carve
def stream_audit(s, trunk):
    if down is None: return None
    SL, NS = ndimage.label(s, structure=S8)
    pr = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0: continue
            nb = _shift(WL, dy, dx); m = (SL > 0) & (nb > 0)
            pr.append(SL[m].astype(np.int64) * (NW + 1) + nb[m])
    pr = np.unique(np.concatenate(pr)) if pr else np.zeros(0, np.int64)
    touch = np.bincount((pr // (NW + 1)).astype(np.int64), minlength=NS + 1)
    size = np.bincount(SL.ravel(), minlength=NS + 1)
    two = int((touch[1:] >= 2).sum()); fragm = touch[1:] == 0
    # 기슭 따라 — 줄기 셀 중 체비셰프 2 안에 물 · 물까지 걸음 > 3
    nearW = ndimage.binary_dilation(water, structure=np.ones((5, 5), bool))
    wf = water.ravel(); T = np.flatnonzero(trunk.ravel())
    c, wet = T.copy(), np.zeros(T.size, bool)
    for _ in range(3):
        c = np.where(wet | (c < 0), c, down[np.maximum(c, 0)]); wet |= (c >= 0) & wf[np.maximum(c, 0)]
    bank = int((nearW.ravel()[T] & ~wet).sum())
    # 가지 — 줄기 나무를 합류점(위 줄기 2+)·머리(0)에서 자른 마디: 시작 칸으로 이름 붙임
    N0 = trunk.size; tf = trunk.ravel(); dT = down[T]; okd = dT >= 0; okd[okd] = tf[dT[okd]]
    src, dst = T[okd], dT[okd]
    inS = np.bincount(dst, minlength=N0); upOf = np.full(N0, -1, np.int64); upOf[dst] = src
    ar = np.arange(N0); nxt = ar.copy(); one = tf & (inS == 1); nxt[one] = upOf[one]
    link, _ = _jump(nxt)
    L2 = link.reshape(NY, NX)
    par = {5: 0, 10: 0, 20: 0}; keys = []
    for ox, oy in ((2, 0), (0, 2), (2, 2), (2, -2)):
        q = _shift(trunk, oy, ox, False); mid = _shift(s, oy // 2, ox // 2, False); lq = _shift(L2, oy, ox, -1)
        m = trunk & q & ~mid & (lq != L2)
        a, b = L2[m].astype(np.int64), lq[m].astype(np.int64)
        keys.append(np.minimum(a, b) * N0 + np.maximum(a, b))
    if keys:
        _, cnt = np.unique(np.concatenate(keys), return_counts=True)
        for n in par: par[n] = int((cnt >= n).sum())
    onw = int((s & water).sum()); thr = int((water.ravel() & (down != -1)).sum())
    return dict(waterComps=int(NW), comps=int(NS), cells=int(s.sum()), two=two, frag=int(fragm.sum()), fragCells=int(size[1:][fragm].sum()),
                trunk=int(T.size), bankAlong=bank, bankPct=round(100 * bank / max(1, T.size), 2), links=int(np.unique(link[tf]).size),
                parallel=par, onWater=onw, through=thr)
MODES = [m for m in os.environ.get('T571_MODES', 'land').split(',') if m]
L = land.sum()
def fr_stats(Dw):
    f = Dw[land]; return dict(p50=float(np.median(f)), p90=float(np.percentile(f, 90)), p95=float(np.percentile(f, 95)), gt100=float(100 * (f > 100).mean()), gt50=float(100 * (f > 50).mean()))
out = dict(base=fr_stats(Dw0), runs={})
for A in [int(a) for a in sys.argv[1:]]:
    s1 = land & (acc >= A)
    s2 = land & (acc >= 4 * A)
    s = s1 | (ndimage.binary_dilation(s2, structure=np.ones((2, 2), bool)) & land)   # 큰 개울 2셀
    Dw = ndimage.distance_transform_edt(~(water | s))
    hit_houses = 0
    for _, x, y in houses:
        if any(0 <= x + dx < NX and 0 <= y + dy < NY and s[y + dy, x + dx] for dx, dy in dd): hit_houses += 1
    tm = terr > 0
    out['runs'][A] = dict(cells=int(s.sum()), pct_land=float(100 * s.sum() / L), w2=int((s & ~s1).sum() + (s2.sum())),
                          fresh=fr_stats(Dw), terr_hit=int((s & tm).sum()), terr_pct=float(100 * (s & tm).sum() / tm.sum()),
                          houses_hit=hit_houses, houses=len(houses), fields_hit=int((s & fields).sum()), fields=int(fields.sum()),
                          built_hit=int((s & built).sum()), bld_hit=int((s & bld).sum()), lot_hit=int((s & lot).sum()),
                          villages_crossed=int(len(np.unique(terr[s & tm]))))
    np.save(f'{D}/stream_{A}.npy', s)
    if down is not None: out['runs'][A]['audit'] = stream_audit(s, s1)   # ★[T571] 물길 점검 자(land 판 = 이 스크립트 본래 개울)
    print(A, json.dumps(out['runs'][A], ensure_ascii=False))
    for mode in MODES:   # ★[T571] 다른 판(foot · gorge) — 점검 자만
        if mode == 'land' or down is None: continue
        sv, sv1, cv = full_mask(A, mode)
        au = stream_audit(sv, sv1); au['pct_land'] = float(100 * (sv & land).sum() / L)
        if cv is not None: au['carve'] = int(cv.sum())
        out.setdefault('variants', {}).setdefault(mode, {})[A] = au
        print(A, mode, json.dumps(au, ensure_ascii=False))
print('base', out['base'])
json.dump(out, open(f'{D}/streams.json', 'w'), indent=1)
