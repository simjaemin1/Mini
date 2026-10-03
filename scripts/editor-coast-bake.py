#!/usr/bin/env python3
# === scripts/editor-coast-bake.py — 맵 에디터 해안 층 데이터(lab/map-editor-coast.json)를 굽는다 [PM 2026-10-03] ===
# 왜: 재민 10-03 "맵 에디터에 해안선이 적용된 버전으로 볼 수 있어야" — 해안 = T588 b · 한반도 남쪽 90셀 평행이동(족보 564).
#   정본 굽기(T604 추신3 `coastShift`)가 들어오기 전 **미리보기**다. 마스크는 서버 정본 `chunk.generateCoastlineWaterTiles` 를
#   `scripts/t588-coast-mask.js`(T588_COAST=b)로 떨군 것 그대로 — 평행이동만 여기서(행을 남쪽으로 S칸 민다 · 비교 그림 T604_해안_* 과 같은 식).
# 쓰는 법: for z in hanbando nippon jungwon_n; do T588_COAST=b node scripts/t588-coast-mask.js $z /tmp/cm_$z.u8; done
#          python3 scripts/editor-coast-bake.py   → lab/map-editor-coast.json  (그다음 node scripts/build-map-editor.js ~/Mini/map-editor.html)
# 1px = 1셀 · 팔레트 PNG(0 = 투명 · 1 = 바다) — 에디터가 그대로 drawImage 한다.
import numpy as np, base64, io, json, sys
from PIL import Image
SHIFT = {'hanbando': 90}   # 재민 10-03 확정(족보 564) · 닛폰·중원북은 T604 추신3 그림 뒤
GEOM = {'hanbando': (2188, 4063), 'nippon': (2187, 4063), 'jungwon_n': (3125, 4063)}
src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/cm_{z}.u8'
out = {'stamp': 'b+90 · 2026-10-03', 'note': '해안 = T588 b · 한반도 남쪽 90셀 이동 · 정본 굽기(T604 추신3) 전 미리보기 · 1px = 1셀', 'zones': {}}
for z, (nx, ny) in GEOM.items():
    m = np.fromfile(src.format(z=z), dtype=np.uint8).reshape(ny, nx) > 0
    s = SHIFT.get(z, 0)
    if s:
        o = np.zeros_like(m); o[s:] = m[:-s]; m = o
    im = Image.fromarray(m.astype(np.uint8), 'P')
    im.putpalette([0, 0, 0, 64, 140, 210] + [0] * 762)
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True, transparency=0)
    out['zones'][z] = {'nx': nx, 'ny': ny, 'shift': s, 'cells': int(m.sum()), 'png': 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()}
    print(z, '바다 셀', int(m.sum()), '· png', len(b.getvalue()), 'B')
json.dump(out, open('lab/map-editor-coast.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('→ lab/map-editor-coast.json')
