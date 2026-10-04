#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T614 안 짜는 기계 · 정본 무접촉 · 판정 0)
# 재민 작업 파일(월드 mf) → 한반도·닛폰 지형 절 안(json) — **남해안 손질만**(T614 §1 · 하구 줄임 · 지움 · 강1 · 어촌6 · 숲 셋).
#   닛폰 동쪽 새 땅(id 6~66 · 하야가와·후카가와 연장)은 T615 몫이라 **안 얹는다**(`--all` 이면 얹는다 — 비교용).
#   셈은 t615-make-plan.py 와 같다(존 local = 월드 − 존 원점) · 단 정본 강 길은 **안 자른 통째**(내장판 mf 와 정본 길이 점마다 같다 — 확인함)라 자르지 않는다.
# 쓰는 법: python3 scripts/t614-make-plan.py <editor-work.json> <안.json> [--all]
import json, sys, os, math, subprocess
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
W = json.load(open(sys.argv[1], encoding='utf-8'))
B = json.load(open(os.path.join(ROOT, 'lab', 'map-editor-baked.json'), encoding='utf-8'))['work']
HC = json.load(open(os.path.join(ROOT, 'server', 'hanbando-terrain.json'), encoding='utf-8'))
OUT = sys.argv[2]; ALL = '--all' in sys.argv
WZ = json.loads(subprocess.check_output(['node', '-e', "const {ZONES}=require('./server/zone-config.js');const o={};for(const [k,z] of Object.entries(ZONES))o[k]=[z.worldOffsetX,z.worldOffsetY,z.zoneWidth,z.zoneHeight];console.log(JSON.stringify(o))"], cwd=ROOT))
ZS = ('hanbando', 'nippon')
SCOPE = {'986', '1005', '1022', '1026', '1008', '1015', '1025', '1027', '3', '1943', '2881', '2882', '2825', '2823', '2826', '2827', '1101', '2992', '3005'}
KEY = {'river': 'rivers', 'ridge': 'ridges', 'lake': 'lakes', 'forest': 'forests', 'valley': 'valleys', 'village': 'villages', 'ore': 'ores', 'pass': 'passes'}
R = lambda v: int(math.floor(v + 0.5)) if v >= 0 else -int(math.floor(-v + 0.5))
def zone_at(x, y):
    for z in ZS:
        a, b, w, h = WZ[z]
        if a <= x < a + w and b <= y < b + h: return z
    return None
def lp(f, z):
    a, b = WZ[z][0], WZ[z][1]
    if 'path' in f: return [[p['x'] - a, p['y'] - b] for p in f['path']]
    return [f['center']['x'] - a, f['center']['y'] - b]
def section_of(f):   # 옛 것: 안(지금까지 고친 절) 중 같은 이름 · 같은 첫 점이 있는 곳 — 경계 조각(닛폰 절의 솔여울 2823 = 한반도 1008 첫 점)은 앞 것이 빠진 뒤에 찾힌다
    k = KEY[f['type']]
    for z in ZS:
        for e in plan[z].get(k, []):
            if e.get('name') != f['name']: continue
            if 'path' in f:
                p0 = e['path'][0]; p0 = p0['pos'] if isinstance(p0, dict) else p0
                if [R(c) for c in lp(f, z)[0]] == [R(c) for c in p0]: return z
            elif 'center' in e or 'x' in e:
                c = e['center'] if 'center' in e else [e['x'], e['y']]
                if [R(v) for v in c] == [R(v) for v in lp(f, z)]: return z
    return None
bm = {str(f['id']): f for f in B['mf']}; wm = {str(f['id']): f for f in W['mf']}
same = lambda a, b: json.dumps({**a, 'id': str(a['id'])}, sort_keys=True) == json.dumps({**b, 'id': str(b['id'])}, sort_keys=True)
plan = {z: {k: [dict(x) for x in v] if isinstance(v, list) else v for k, v in HC[z].items()} for z in ZS}
log = []
for i in sorted(set(bm) | set(wm), key=lambda s: int(s)):
    o, n = bm.get(i), wm.get(i)
    if o is not None and n is not None and same(o, n): continue
    if not ALL and i not in SCOPE: continue
    f = o or n; t = f['type']; k = KEY[t]
    z = section_of(o) if o is not None else zone_at(*(([n['path'][0]['x'], n['path'][0]['y']]) if 'path' in n else [n['center']['x'], n['center']['y']]))
    if z is None: log.append((i, t, f['name'], '절 못 찾음')); continue
    L = plan[z][k]
    if o is not None:
        idx = None
        for j, e in enumerate(L):
            if e.get('name') != o['name']: continue
            if 'path' in o:
                p0 = e['path'][0]; p0 = p0['pos'] if isinstance(p0, dict) else p0
                if [R(c) for c in lp(o, z)[0]] == [R(c) for c in p0]: idx = j; break
            else: idx = j; break
        if idx is None: log.append((i, t, f['name'], z, '정본 항목 못 찾음')); continue
        if n is None: L.pop(idx); log.append((i, t, o['name'], z, '지움')); continue
        e = {kk: vv for kk, vv in L[idx].items() if kk not in ('_bbox', '_segIdx')}
    else:
        e = {'name': n['name'], '_jm': n['id']}
        L.append(e); idx = len(L) - 1
    if 'path' in n:
        e['path'] = [{'pos': [R(p['x'] - WZ[z][0]), R(p['y'] - WZ[z][1])], 'width': R(p['w'])} for p in n['path']]
    elif t == 'village':
        e['x'] = R(n['center']['x'] - WZ[z][0]); e['y'] = R(n['center']['y'] - WZ[z][1])
    elif t == 'forest':
        e['center'] = [R(n['center']['x'] - WZ[z][0]), R(n['center']['y'] - WZ[z][1])]
    L[idx] = e
    log.append((i, t, n['name'], z, '새로' if o is None else '바꿈'))
json.dump(plan, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
for r in log: print(*r)
print({z: {k: len(v) for k, v in plan[z].items() if isinstance(v, list)} for z in ZS})
