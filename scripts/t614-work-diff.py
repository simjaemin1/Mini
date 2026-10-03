#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T614 ① 차이 자 · 관측 전용 · 판정 0)
# 두 에디터 작업 파일(월드 mf)의 차이 표 — id · 이름 · 꼴 · 존 · 점 수 · 하구(끝 점) 이동 셀 · 발원(첫 점) 이동 셀 · 지움/새로/바꿈.
# 쓰는 법: python3 scripts/t614-work-diff.py <옛 work.json> <새 work.json> [--json out.json]
#   옛 work 가 `lab/map-editor-baked.json` 이면 그 안의 `.work` 를 읽는다. 셀 = 32px.
import json, math, sys, subprocess, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
def load(p):
    j = json.load(open(p, encoding='utf-8'))
    return j['work'] if 'work' in j and 'mf' in j['work'] else j
A, Bw = load(sys.argv[1]), load(sys.argv[2])
WZ = json.loads(subprocess.check_output(['node', '-e', "const {ZONES}=require('./server/zone-config.js');const o={};for(const [k,z] of Object.entries(ZONES))if(!z.isOcean)o[k]=[z.worldOffsetX,z.worldOffsetY,z.zoneWidth,z.zoneHeight];console.log(JSON.stringify(o))"], cwd=ROOT))
KO = {'hanbando': '한반도', 'nippon': '닛폰', 'jungwon_n': '중원북'}
TK = {'river': '강', 'ridge': '산맥', 'lake': '호수', 'forest': '숲', 'valley': '계곡', 'village': '마을', 'ore': '광맥', 'pass': '고개'}
def zone_at(x, y):
    for z, (a, b, w, h) in WZ.items():
        if a <= x < a + w and b <= y < b + h: return z
    return '바다'
def zones(f):
    pts = f['path'] if 'path' in f else [f['center']]
    out = []
    for p in pts:
        z = zone_at(p['x'], p['y'])
        if z not in out: out.append(z)
    return out
C = lambda d: round(d / 32, 1)
am = {str(f['id']): f for f in A['mf']}; bm = {str(f['id']): f for f in Bw['mf']}
same = lambda a, b: json.dumps({**a, 'id': str(a['id'])}, sort_keys=True) == json.dumps({**b, 'id': str(b['id'])}, sort_keys=True)
rows = []
for i in sorted(set(am) | set(bm), key=lambda s: int(s)):
    o, n = am.get(i), bm.get(i)
    if o is not None and n is not None and same(o, n): continue
    f = n or o; r = {'id': int(i), 'name': f['name'], 'type': f['type'], 'zones': zones(f)}
    if o is None: r['kind'] = '새로'
    elif n is None: r['kind'] = '지움'
    else:
        r['kind'] = '바꿈'
        if 'path' in f:
            r['mouth'] = C(math.hypot(n['path'][-1]['x'] - o['path'][-1]['x'], n['path'][-1]['y'] - o['path'][-1]['y']))
            r['src'] = C(math.hypot(n['path'][0]['x'] - o['path'][0]['x'], n['path'][0]['y'] - o['path'][0]['y']))
            k = 0
            while k < min(len(o['path']), len(n['path'])) and o['path'][k] == n['path'][k]: k += 1
            r['common'] = k
            r['mouthDir'] = '줄임' if len(n['path']) < len(o['path']) and k == len(n['path']) else ('늘임' if len(n['path']) > len(o['path']) and k == len(o['path']) else '다시 그음')
        elif 'center' in f:
            r['move'] = C(math.hypot(n['center']['x'] - o['center']['x'], n['center']['y'] - o['center']['y']))
            r['from'] = [o['center']['x'], o['center']['y']]; r['to'] = [n['center']['x'], n['center']['y']]
    if 'path' in f:
        r['pts'] = [len(o['path']) if o else 0, len(n['path']) if n else 0]
        r['ends'] = [[f['path'][0]['x'], f['path'][0]['y']], [f['path'][-1]['x'], f['path'][-1]['y']]]
    rows.append(r)
if '--json' in sys.argv: json.dump(rows, open(sys.argv[sys.argv.index('--json') + 1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('| id | 이름 | 꼴 | 존 | 무엇 | 점 수(옛→새) | 하구 이동(셀) | 발원 이동(셀) | 비고 |')
print('|---:|---|---|---|---|---|---:|---:|---|')
for r in rows:
    pts = f"{r['pts'][0]}→{r['pts'][1]}" if 'pts' in r else ''
    note = ''
    if r['kind'] == '바꿈' and 'mouthDir' in r: note = f"하구 {r['mouthDir']}(앞 {r['common']}점 같음)"
    if r['kind'] == '바꿈' and 'move' in r: note = f"중심 {r['from']} → {r['to']} · {r['move']}셀"
    if r['kind'] == '새로' and 'ends' in r: note = f"x {r['ends'][0][0]:,}~{r['ends'][1][0]:,}"
    print(f"| {r['id']} | {r['name']} | {TK.get(r['type'], r['type'])} | {'·'.join(KO.get(z, z) for z in r['zones'])} | {r['kind']} | {pts} | {r.get('mouth', '')} | {r.get('src', '')} | {note} |")
from collections import Counter
print('\n합: ' + ' · '.join(f'{k} {v}' for k, v in Counter(r['kind'] for r in rows).items()) + f' · 전부 {len(rows)}')
