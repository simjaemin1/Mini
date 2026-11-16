#!/usr/bin/env python3
# T1293 실험 F(측정만 · 제품 아님) — 포화 문턱을 값표 목표(세계 몫 상한까지 `_targetV2`) 대신 녹임 흐름 × 30날(상한 앞 · `_consEMA × 30`)로.
#   쓰는 법: python3 F-patch.py <작업 트리 뿌리>  — 그 트리의 sim/economy-sim-v2.js 한 줄을 바꾼다(제품 가지에는 안 든다)
import sys, pathlib
p = pathlib.Path(sys.argv[1]) / 'sim' / 'economy-sim-v2.js'
s = p.read_text(encoding='utf-8')
old = 'room = T ? Math.max(0, T.target - T.sEff) : 0;'
new = 'room = T ? Math.max(0, ((v._consEMA || {})[id] || 0) * 30 - T.sEff) : 0;   /* ★[T1293 실험 F] 상한 앞 흐름 목표 */'
assert s.count(old) == 1, 'patch site'
p.write_text(s.replace(old, new), encoding='utf-8')
print('F patched', p)
