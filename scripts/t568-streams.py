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
    print(A, json.dumps(out['runs'][A], ensure_ascii=False))
print('base', out['base'])
json.dump(out, open(f'{D}/streams.json', 'w'), indent=1)
