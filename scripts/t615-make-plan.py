#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T615 안 짜는 기계 · 정본 무접촉 · `t550-make-plan.py` 그대로 + 존 사각을 zone-config 에서)
# 재민 editor-work.json(월드 mf) → 닛폰 지형 절 안(json). 정본 nippon 절을 바탕으로(T408 접합·광맥·후보 그대로),
# 재민이 새로 그은 것(내장판에 없는 id)을 얹고, 손댄 옛 강 둘(사키가와·미도리가와 · 닛폰수해)은 새 것으로 바꾼다.
# 에디터 splitByZone/buildExportMulti 와 같은 셈(400px 촘촘 · 존 경계에서 자름 · 반올림).
import json, math, sys
# 쓰는 법: python3 scripts/t615-make-plan.py <editor-work.json> <안.json> [--zone nippon]
#   내장판(`lab/map-editor-baked.json` 의 work.mf)에 없는 id = 새로 그은 것 · 같은 id 에 내용이 다르면 = 손댄 것(옛 절의 같은 이름을 새 것으로 바꾼다).
import os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
W = json.load(open(sys.argv[1], encoding='utf-8'))
B = json.load(open(os.path.join(ROOT, 'lab', 'map-editor-baked.json'), encoding='utf-8'))['work']
HC = json.load(open(os.path.join(ROOT, 'server', 'hanbando-terrain.json'), encoding='utf-8'))
OUT = sys.argv[2]
ZID = sys.argv[sys.argv.index('--zone') + 1] if '--zone' in sys.argv else 'nippon'
import subprocess
# ★[T615] 존 사각은 zone-config 에서(닛폰 7000 · 베링 17000 뒤 — T550 때 박은 표는 옛 폭) — 에디터 WZONES 와 같은 값(editor-baked-check)
WZ = json.loads(subprocess.check_output(['node', '-e', "const {ZONES}=require('./server/zone-config.js');const o={};for(const [k,z] of Object.entries(ZONES))o[k]=[[z.worldOffsetX,z.worldOffsetY],[z.zoneWidth,z.zoneHeight]];console.log(JSON.stringify(o))"], cwd=ROOT))
def zone_at(x, y):
    for z, (o, s) in WZ.items():
        if o[0] <= x < o[0] + s[0] and o[1] <= y < o[1] + s[1]: return z
    return None
def split(path):
    dense = []
    for a, b in zip(path, path[1:]):
        d = math.hypot(b['x'] - a['x'], b['y'] - a['y']); n = max(1, math.ceil(d / 400))
        for k in range(n):
            t = k / n; dense.append({'x': a['x'] + (b['x'] - a['x']) * t, 'y': a['y'] + (b['y'] - a['y']) * t, 'w': a['w'] + (b['w'] - a['w']) * t})
    dense.append(path[-1]); runs = []; cur = None
    for p in dense:
        z = zone_at(p['x'], p['y'])
        if cur is None or cur['zone'] != z: cur = {'zone': z, 'pts': [p]}; runs.append(cur)
        else: cur['pts'].append(p)
    return runs
R = lambda v: int(math.floor(v + 0.5)) if v >= 0 else -int(math.floor(-v + 0.5))
def local_path(f, zone='nippon'):
    o = WZ[zone][0]; out = []
    for run in split(f['path']):
        if run['zone'] != zone or len(run['pts']) < 2: continue
        out.append([{'pos': [R(p['x'] - o[0]), R(p['y'] - o[1])], 'width': R(p['w'])} for p in run['pts']])
    return out
bm = {f['id']: f for f in B['mf']}
changed = [f for f in W['mf'] if json.dumps(f, sort_keys=True) != json.dumps(bm.get(f['id']), sort_keys=True)]
# ★[T615] 그 존에 한 점이라도 닿는 것만(재민 작업 파일엔 다른 존 손질도 섞여 있다 — 한반도 강 · 어촌6 등은 이 안 밖) · 마을 칸은 안 옮긴다(후보는 정본 그대로)
def _touches(f):
    if f['type'] not in ('river', 'ridge', 'valley', 'lake', 'forest'): return False
    if 'path' in f: return any(zone_at(p['x'], p['y']) == ZID for p in f['path'])
    return zone_at(f['center']['x'], f['center']['y']) == ZID
changed = [f for f in changed if _touches(f)]
plan = {k: [dict(x) for x in v] if isinstance(v, list) else v for k, v in HC[ZID].items()}
for k in ('rivers', 'ridges', 'lakes', 'forests'):
    plan[k] = [{kk: vv for kk, vv in f.items() if kk not in ('_bbox', '_segIdx')} for f in plan[k]]
plan.setdefault('valleys', [])
# 지운 옛 것: 내장판 mf 에 있는데 작업 파일에 없는 것(그 존 안) — 옛 절에서 같은 이름을 뺀다
wm = {f['id'] for f in W['mf']}
def _center(f):
    if 'path' in f: return sum(p['x'] for p in f['path']) / len(f['path']), sum(p['y'] for p in f['path']) / len(f['path'])
    return f['center']['x'], f['center']['y']
deleted = [f for f in B['mf'] if f['id'] not in wm and zone_at(*_center(f)) == ZID]
for f in deleted:
    k = {'river': 'rivers', 'ridge': 'ridges', 'lake': 'lakes', 'forest': 'forests', 'valley': 'valleys'}[f['type']]
    plan[k] = [x for x in plan[k] if x['name'] != f['name']]
print('지운 옛 것:', [(f['type'], f['name']) for f in deleted])
# 손댄 옛 것: 내장판에 같은 id 가 있고 내용이 다른 것 — 옛 절에서 같은 이름을 뺀다
replaced = {f['name']: {'river': 'rivers', 'ridge': 'ridges', 'lake': 'lakes', 'forest': 'forests', 'valley': 'valleys'}[f['type']] for f in changed if f['id'] in bm}
for nm, k in replaced.items():
    plan[k] = [f for f in plan[k] if f['name'] != nm]
print('손댄 옛 것:', replaced)
o = WZ[ZID][0]; added = {'rivers': 0, 'ridges': 0, 'lakes': 0, 'forests': 0, 'valleys': 0}
for f in changed:
    t = f['type']
    if t in ('river', 'ridge', 'valley'):
        for i, lp in enumerate(local_path(f, ZID)):
            fe = {'name': f['name'] + (f'_{i+1}' if i else ''), 'path': lp, '_jm': f['id']}
            if t == 'ridge':
                fe['noValley'] = bool(f.get('flags', {}).get('noValley'))
                for fl in ('noFit', 'pinStart'):
                    if f.get('flags', {}).get(fl): fe[fl] = True
            key = {'river': 'rivers', 'ridge': 'ridges', 'valley': 'valleys'}[t]; plan[key].append(fe); added[key] += 1
    elif t == 'lake':
        if zone_at(f['center']['x'], f['center']['y']) != ZID: continue
        rx = f.get('rx', f.get('radius')); ry = f.get('ry', f.get('radius'))
        plan['lakes'].append({'name': f['name'], 'center': [R(f['center']['x'] - o[0]), R(f['center']['y'] - o[1])], 'shape': 'circle' if rx == ry else 'ellipse', 'rx': R(rx), 'ry': R(ry), 'a': R(rx), 'b': R(ry), 'rotation': 0, 'radius': R((rx + ry) / 2), '_jm': f['id']}); added['lakes'] += 1
    elif t == 'forest':
        if zone_at(f['center']['x'], f['center']['y']) != ZID: continue
        plan['forests'].append({'name': f['name'], 'center': [R(f['center']['x'] - o[0]), R(f['center']['y'] - o[1])], 'rx': R(f['rx']), 'ry': R(f['ry']), 'densityMult': round(f['density'], 2), '_jm': f['id']}); added['forests'] += 1
json.dump(plan, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
print('changed mf', len(changed), 'added', added, 'plan', {k: len(v) for k, v in plan.items() if isinstance(v, list)})
