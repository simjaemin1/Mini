#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T639 ② 바다 위 하구 꼬리 자르기 · 기본 표만 · --apply 로 정본)
# 끝이 해안 띠(서버 `generateCoastlineWaterTiles` · 정본 coastShift)에서 **반폭 + 2셀 + 1셀** 밖에서 멈추게 강 꼬리만 자른다
#   — T610 ⓒ "바다 앞 멈춤" 자(`t610-east2.py` stopL = L − (r + SZ) · r = 반폭 + 2셀 = T549 "닿음" 자) 그대로 · 새 수 0.
#   발원 쪽부터 걸어 처음으로 띠에 그 거리 안으로 드는 점을 찾고, 앞 점과 그 점 사이에서 거리 = r + SZ 인 자리(이분)를 새 끝으로 한다.
#   폭은 그 자리의 보간 폭(반올림) · 이름 · 앞쪽 점 무변.
# 쓰는 법: python3 scripts/t639-trim-tails.py <존> <강 이름,…> [--apply]
import json, math, sys, os, subprocess
import numpy as np
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
Z, NAMES = sys.argv[1], sys.argv[2].split(','); APPLY = '--apply' in sys.argv; SZ = 32
GAME = os.path.join(ROOT, 'server', 'hanbando-terrain.json')
cells = json.loads(subprocess.check_output(['node', '-e', f"""
const ZC=require('./server/zone-config');const Z=ZC.ZONES['{Z}'];
const s=require('./server/chunk').generateCoastlineWaterTiles(Object.assign({{id:'{Z}'}},Z),32,ZC.findZoneAt,Object.values(ZC.ZONES).filter(z=>z.isOcean).map(z=>({{x0:z.worldOffsetX,y0:z.worldOffsetY,x1:z.worldOffsetX+z.zoneWidth,y1:z.worldOffsetY+z.zoneHeight}})));
console.log(JSON.stringify([...s].map(k=>k.split('_').map(Number))));"""], cwd=ROOT))
BC = (np.array(cells, float) + 0.5) * SZ
D = json.load(open(GAME, encoding='utf-8'))
dist = lambda p: float(np.sqrt(((BC - p) ** 2).sum(1)).min())
rows = []
for nm in NAMES:
    rv = [r for r in D[Z]['rivers'] if r['name'] == nm]; assert len(rv) == 1, nm; rv = rv[0]; P = rv['path']
    pos = lambda q: np.array(q['pos'] if isinstance(q, dict) else q, float); wid = lambda q: q['width'] if isinstance(q, dict) else rv.get('width', 0)
    need = lambda w: w / 2 + 2 * SZ + SZ
    k = next((i for i, q in enumerate(P) if dist(pos(q)) < need(wid(q))), None)
    if k is None: rows.append({'name': nm, 'act': '이미 띠 밖'}); continue
    assert k > 0, (nm, '발원이 띠 안')
    a, b, wa, wb = pos(P[k - 1]), pos(P[k]), wid(P[k - 1]), wid(P[k])
    lo, hi = 0.0, 1.0
    for _ in range(40):
        t = (lo + hi) / 2; p = a + (b - a) * t; w = wa + (wb - wa) * t
        if dist(p) >= need(w): lo = t
        else: hi = t
    t = lo; p = a + (b - a) * t; w = round(wa + (wb - wa) * t)
    end = {'pos': [int(round(p[0])), int(round(p[1]))], 'width': w}
    old_end = P[-1]
    newP = P[:k] + ([end] if t > 1e-6 else [])
    rows.append({'name': nm, 'act': '꼬리 자름', 'pts': f'{len(P)}→{len(newP)}', 'cut_at': k, 'oldEnd': old_end['pos'] if isinstance(old_end, dict) else old_end,
                 'newEnd': end['pos'], 'newEndCell': [end['pos'][0] // SZ, end['pos'][1] // SZ], 'width': w, 'distToBand': round(dist(np.array(end['pos'], float)) / SZ, 1), 'need': round(need(w) / SZ, 1),
                 'cut': round(sum(math.hypot(*(pos(P[i + 1]) - pos(P[i]))) for i in range(k - 1, len(P) - 1)) / SZ - t * math.hypot(*(b - a)) / SZ, 1)})
    rv['path'] = newP
    for kk in ('_bbox', '_segIdx'): rv.pop(kk, None)
for r in rows: print(json.dumps(r, ensure_ascii=False))
if APPLY:   # 쓰기는 node 로(정본 json 은 JSON.stringify 꼴 — 파이썬 float 표기가 끼지 않게 · 바뀐 강 path 만 갈아 끼운다)
    upd = {r['name']: rv['path'] for r in rows if r['act'] == '꼬리 자름' for rv in D[Z]['rivers'] if rv['name'] == r['name']}
    js = "const fs=require('fs');const F=process.argv[1];const raw=fs.readFileSync(F,'utf8');const D=JSON.parse(raw);const U=JSON.parse(process.argv[2]);" \
         f"for(const r of D['{Z}'].rivers) if(U[r.name]) r.path=U[r.name];" \
         "fs.writeFileSync(F, raw.includes('\\n') ? JSON.stringify(D,null,1) : JSON.stringify(D));"
    subprocess.check_call(['node', '-e', js, GAME, json.dumps(upd)], cwd=ROOT)
    print('기록:', GAME)
