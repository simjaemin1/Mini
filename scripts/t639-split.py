#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T639 ③ 흔들림 가르기 · 관측 전용 · 판정 0)
# 두 판(t17 JSON 3시드)의 마을 인구 차를 ⓐ 남해안(지형이 실제로 바뀐 곳) · ⓑ 그 밖으로 나눈다.
#   ⓐ = 바뀐 물 칸(옛/새 셀 꼴 u8 — t614-mask.js · 손그림 물이 생기거나 없어진 칸)에서 **물 자 140셀**(villages.js 물 탐색 반경) 안의 마을 + 자리를 옮긴 마을
#   몫 % = Σ Δ ÷ 옛 판 세계 인구 · 흔들림 바닥 = T611 한 마을 1셀 |Δ| 평균 3.7%(세계 몫)
# 쓰는 법: python3 scripts/t639-split.py <옛 kind.u8> <새 kind.u8> <NX> <NY> <옛 판 머리(…-{seed}.json)> <새 판 머리> [시드…=1020,7,42]
import json, sys, numpy as np
from scipy import ndimage as nd
ko, kn = (np.fromfile(sys.argv[i], np.uint8).reshape(int(sys.argv[4]), int(sys.argv[3])) for i in (1, 2))
A, B = sys.argv[5], sys.argv[6]; SEEDS = (sys.argv[7] if len(sys.argv) > 7 else '1020,7,42').split(',')
ch = (ko == 2) != (kn == 2); D = nd.distance_transform_edt(~ch)
V = json.load(open('server/hanbando-terrain.json', encoding='utf-8'))['hanbando']['villages']
import subprocess
old = json.loads(subprocess.check_output(['git', 'show', '43be2b9:server/hanbando-terrain.json']))['hanbando']['villages']
om = {v['name']: v for v in old}
grpA = set()
for v in V:
    cx, cy = round(v['x'] / 32), round(v['y'] / 32); o = om[v['name']]
    if D[cy, cx] <= 140 or (o['x'], o['y']) != (v['x'], v['y']): grpA.add(v['name'])
FLOOR = 3.7
print('ⓐ 남해안 마을', len(grpA), sorted(grpA))
print('| 시드 | 옛 판 | 새 판 | Δ | ⓐ 몫(곳 · Δ · %) | ⓑ 몫(곳 · Δ · %) | ⓑ |Δ%| ≤ 바닥 3.7% |')
print('|---|---:|---:|---:|---|---|---|')
out = []
for s in SEEDS:
    a, b = json.load(open(A.replace('{seed}', s))), json.load(open(B.replace('{seed}', s)))
    pa = {v['name']: v['pop'] for v in a['vpop']}; pb = {v['name']: v['pop'] for v in b['vpop']}
    tot = a['base']['pop']; names = set(pa) | set(pb)
    dA = sum(pb.get(n, 0) - pa.get(n, 0) for n in names if n in grpA); dB = sum(pb.get(n, 0) - pa.get(n, 0) for n in names if n not in grpA)
    nA = sum(1 for n in names if n in grpA and pa.get(n) != pb.get(n)); nB = sum(1 for n in names if n not in grpA and pa.get(n) != pb.get(n))
    pA, pB = 100 * dA / tot, 100 * dB / tot
    out.append(dict(seed=s, a=tot, b=b['base']['pop'], dA=dA, dB=dB, pA=pA, pB=pB))
    print(f"| {s} | {tot:,} | {b['base']['pop']:,} | {b['base']['pop'] - tot:+,} | {nA} · {dA:+,} · {pA:+.1f}% | {nB} · {dB:+,} · {pB:+.1f}% | {'○' if abs(pB) <= FLOOR else '✗'} |")
m = sum(abs(r['pB']) for r in out) / len(out)
print(f'\nⓑ |Δ%| 평균 {m:.1f}% · 바닥 {FLOOR}% → {"안 ○" if m <= FLOOR else "밖 ✗"}')
