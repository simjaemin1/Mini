#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T615/T616 안 → 맵 에디터 작업 파일 · 정본 무접촉)
# 재민 작업 파일(editorWork · 월드 좌표 mf)에 이 판이 **더한 것만**(`_t615` · `_t616` 표시) 월드 좌표로 붙인다 — 재민 줄은 한 글자도 안 바꾼다.
#   강 · 계곡: path {x, y, w} · 숲: center {x, y} · rx · ry · density · 마을: center · radius 500(export-editor-work 와 같은 꼴) · id = 작업 파일 최대 id 뒤로.
# 쓰는 법: python3 scripts/t615-to-work.py <재민 작업.json> <안.json> <out 작업.json> [--zone nippon] [--tag _t615[,_t616]]
import json, sys, subprocess, os
WK, PL, OUT = sys.argv[1:4]
ZID = sys.argv[sys.argv.index('--zone') + 1] if '--zone' in sys.argv else 'nippon'
TAGS = (sys.argv[sys.argv.index('--tag') + 1] if '--tag' in sys.argv else '_t615').split(',')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
WZ = json.loads(subprocess.check_output(['node', '-e', "const {ZONES}=require('./server/zone-config.js');const o={};for(const [k,z] of Object.entries(ZONES))o[k]=[z.worldOffsetX,z.worldOffsetY];console.log(JSON.stringify(o))"], cwd=ROOT))
ox, oy = WZ[ZID]
W = json.load(open(WK, encoding='utf-8')); P = json.load(open(PL, encoding='utf-8'))
nid = max(f['id'] for f in W['mf'] + W.get('features', [])) + 1
FL = {'noFit': False, 'noValley': False, 'pinStart': False}
mine = lambda f: any(f.get(t) for t in TAGS)
cnt = {}
def add(o):
    global nid
    o['id'] = nid; nid += 1; W['mf'].append(o); cnt[o['type']] = cnt.get(o['type'], 0) + 1
for k, t in (('rivers', 'river'), ('valleys', 'valley')):
    for f in P.get(k, []):
        if mine(f): add({'type': t, 'name': f['name'], 'flags': dict(FL), 'path': [{'x': p['pos'][0] + ox, 'y': p['pos'][1] + oy, 'w': p['width']} for p in f['path']]})
for f in P.get('forests', []):
    if mine(f): add({'type': 'forest', 'name': f['name'], 'center': {'x': f['center'][0] + ox, 'y': f['center'][1] + oy}, 'rx': f['rx'], 'ry': f['ry'], 'density': f['densityMult']})
for v in P.get('villages', []):
    if mine(v): add({'type': 'village', 'name': v['name'], 'center': {'x': v['x'] + ox, 'y': v['y'] + oy}, 'radius': 500})
W.pop('stamp', None)
json.dump(W, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
print(OUT, '더함', cnt, 'mf', len(W['mf']))
