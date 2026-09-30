#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T549 수 칸) — T524 자 한 판(<dir>/nippon.json|.bin)에서 비교 표의 수를 뽑는다. 새 문턱 0(자 = 한반도 p95).
#   갇힌 % · 옆 존으로만 % · 물 없는 %(민물 > 한반도 p95) · 자원 사막 %(숲·광맥·산 셋 다 > 한반도 p95) · 성분 수(다리 판 · 다리 없는 판)
#   · 도하 없이 못 가는 쌍(시딩 후보 자리 쌍 중 다리 없는 판에서 다른 성분) · 걸음 거리 중앙값(민물 · 숲 · 광맥 · 산)
#   · 후보 16 중 설 수 있는 곳(자리 24셀 안에 본토 뭍 = 자 `nearPass` 반경) · 시딩 수
# 쓰는 법: python3 scripts/t549-summary.py <dir> <hanbando.json 경로> <out.json>
import json, sys
import numpy as np
d, hbp, outp = sys.argv[1], sys.argv[2], sys.argv[3]
J = json.load(open(f'{d}/nippon.json', encoding='utf-8')); H = json.load(open(hbp, encoding='utf-8'))
N = J['N']; NY, NX = J['NY'], J['NX']; raw = open(J['bin'], 'rb').read()
kind = np.frombuffer(raw[:N], np.uint8).reshape(NY, NX)
cb = np.frombuffer(raw[3 * N:7 * N], np.int32).reshape(NY, NX); c0 = np.frombuffer(raw[7 * N:11 * N], np.int32).reshape(NY, NX)
off = 11 * N; D = {}
for k in ('fresh', 'forest', 'ore', 'rock', 'sea'): D[k] = np.frombuffer(raw[off:off + 2 * N], np.uint16).reshape(NY, NX); off += 2 * N
TH = {k: H['dist'][k]['p95'] for k in ('fresh', 'forest', 'ore', 'rock')}
land = kind == 1; L = int(land.sum())
trapped = sum(c['area'] for c in J['compsB'] if c['cls'] == '갇힌 땅'); side = sum(c['area'] for c in J['compsB'] if c['cls'] == '옆 존으로만 열림')
dry = land & (D['fresh'] > TH['fresh']); desert = land & (D['forest'] > TH['forest']) & (D['ore'] > TH['ore']) & (D['rock'] > TH['rock'])
med = {k: int(np.median(D[k][land & (D[k] < 65535)])) for k in ('fresh', 'forest', 'ore', 'rock')}
V = [v for v in J['vills'] if v.get('cell', -1) is not None and v.get('cell', -1) >= 0]
stand = sum(1 for v in J['vills'] if v.get('compB') == J['main'])
cells = [v['cell'] for v in V if v.get('compB') == J['main']]
pairs = 0; nop = 0
for i in range(len(cells)):
    for j in range(i + 1, len(cells)):
        pairs += 1
        a, b = cells[i], cells[j]
        if c0.flat[a] != c0.flat[b]: nop += 1
out = dict(land=L, trapped=100 * trapped / L, side=100 * side / L, dry=100 * float(dry.sum()) / L, desert=100 * float(desert.sum()) / L,
           comps=len(J['compsB']), comps0=len(J['comps0']), pairs=pairs, noFordPairs=nop, med=med,
           standable=stand, cands=len(J['vills']), seeded=sum(1 for v in J['vills'] if v['seeded']),
           band=int((kind == 2).sum()), bandPct=100 * float((kind == 2).sum()) / N, mainArea=J['mainArea'],
           seededNames=[v['name'] for v in J['vills'] if v['seeded']])
json.dump(out, open(outp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({k: (round(v, 2) if isinstance(v, float) else v) for k, v in out.items()}, ensure_ascii=False))
