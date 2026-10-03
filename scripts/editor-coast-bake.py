#!/usr/bin/env python3
# === scripts/editor-coast-bake.py — 맵 에디터 해안 층 데이터(lab/map-editor-coast.json)를 굽는다 [PM 2026-10-03] ===
# 왜: 재민 10-03 "맵 에디터에 해안선이 적용된 버전으로 볼 수 있어야" — 해안 = T588 b · 한반도 남쪽 90셀 평행이동(족보 564).
#   정본 굽기(T604 추신3 `coastShift`)가 들어오기 전 **미리보기**다. 마스크는 서버 정본 `chunk.generateCoastlineWaterTiles` 를
#   `scripts/t588-coast-mask.js`(T588_COAST=b)로 떨군 것 그대로 — 평행이동만 여기서(행을 남쪽으로 S칸 민다 · 비교 그림 T604_해안_* 과 같은 식).
# 쓰는 법: python3 scripts/editor-coast-bake.py   → lab/map-editor-coast.json  (그다음 node scripts/build-map-editor.js ~/Mini/map-editor.html)
#   ★[T601 추신2] 마스크는 이 스크립트가 **그 자리에서** `t588-coast-mask.js` 를 불러 뜬다(임시 폴더 · 사본 0 · 묵은 /tmp 파일을 안 읽는다).
#     해안 손잡이 = env `T588_COAST`(비면 b — 재민 10-03 확정 · 족보 564). 옛 줄(미리 뜬 마스크 경로 틀 `/tmp/cm_{z}.u8`)은 인자로 그대로 된다.
#   ★정본 해안(T604 추신3 `coastShift` — zone-config 존 칸)이 들어오면: 서버 마스크가 이미 이동한 판이므로 여기 평행이동은 **0** 이 된다
#     (존 칸 `coastShift` 가 있는 존은 SHIFT 를 안 쓴다 · 도장 = "정본"). 같은 줄 하나로 다시 굽는다 — 굽기 한 줄(`reset-bake-all.sh`) 8단계가 부른다.
import numpy as np, base64, io, json, sys
from PIL import Image
SHIFT = {'hanbando': 90}   # 재민 10-03 확정(족보 564) · 닛폰·중원북은 T604 추신3 그림 뒤
GEOM = {'hanbando': (2188, 4063), 'nippon': (2187, 4063), 'jungwon_n': (3125, 4063)}
import os, subprocess, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
VAR = os.environ.get('T588_COAST') or 'b'
# 존 기하 · 정본 coastShift(있으면) — zone-config 에서 읽는다(박힌 수 대신)
zc = json.loads(subprocess.check_output(['node', '-e', "const Z=require('./server/zone-config').ZONES;const o={};for(const k of %s){const z=Z[k];o[k]={nx:Math.ceil(z.zoneWidth/32),ny:Math.ceil(z.zoneHeight/32),shift:(typeof z.coastShift==='number'?z.coastShift:null)}}process.stdout.write(JSON.stringify(o))" % json.dumps(list(GEOM.keys()))]))
for z in GEOM:
    GEOM[z] = (zc[z]['nx'], zc[z]['ny'])
CANON = {z for z in GEOM if zc[z]['shift'] is not None}   # 정본 이동이 서버 마스크에 든 존
if len(sys.argv) > 1:
    src = sys.argv[1]
else:
    tmp = tempfile.mkdtemp(prefix='ecb-'); src = os.path.join(tmp, 'cm_{z}.u8')
    env = dict(os.environ, T588_COAST=VAR)
    for z in GEOM:
        subprocess.check_call(['node', 'scripts/t588-coast-mask.js', z, src.format(z=z)], env=env, stdout=subprocess.DEVNULL)
if CANON:
    out = {'stamp': '%s 정본 · coastShift %s' % (VAR, ' '.join('%s %d' % (z, zc[z]['shift']) for z in sorted(CANON))), 'note': '해안 = T588 %s · 정본 이동(zone-config coastShift — 서버 마스크 그대로) · 1px = 1셀' % VAR, 'zones': {}}
elif VAR == 'b':
    out = {'stamp': 'b+90 · 2026-10-03', 'note': '해안 = T588 b · 한반도 남쪽 90셀 이동 · 정본 굽기(T604 추신3) 전 미리보기 · 1px = 1셀', 'zones': {}}
else:
    out = {'stamp': '%s+90 · 미리보기' % VAR, 'note': '해안 = T588 %s · 한반도 남쪽 90셀 이동 · 정본 굽기(T604 추신3) 전 미리보기 · 1px = 1셀' % VAR, 'zones': {}}
for z, (nx, ny) in GEOM.items():
    m = np.fromfile(src.format(z=z), dtype=np.uint8).reshape(ny, nx) > 0
    s = 0 if z in CANON else SHIFT.get(z, 0)
    if s:
        o = np.zeros_like(m); o[s:] = m[:-s]; m = o
    im = Image.fromarray(m.astype(np.uint8), 'P')
    im.putpalette([0, 0, 0, 64, 140, 210] + [0] * 762)
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True, transparency=0)
    out['zones'][z] = {'nx': nx, 'ny': ny, 'shift': s, 'cells': int(m.sum()), 'png': 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()}
    print(z, '바다 셀', int(m.sum()), '· png', len(b.getvalue()), 'B')
json.dump(out, open('lab/map-editor-coast.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('→ lab/map-editor-coast.json')
