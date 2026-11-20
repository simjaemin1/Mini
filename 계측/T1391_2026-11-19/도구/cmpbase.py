#!/usr/bin/env python3
# 기준선 파일 둘(같은 조건 · 다른 나무로 뜬 `--make`)의 날 지문 · 여덟 수 · 판 지문 · 전쟁 누계를 견준다 — python3 cmpbase.py <A.json> <B.json>
import json, sys
A, B = (json.load(open(p, encoding='utf-8')) for p in sys.argv[1:3])
out = {'cond': A.get('cond') == B.get('cond'), 'days': (A.get('days'), B.get('days')), 'head': (A.get('head'), B.get('head'))}
for sd in A['byseed']:
    a, b = A['byseed'][sd], B['byseed'].get(sd)
    if not b: out[sd] = 'B 에 없음'; continue
    da, db = a['days'], b['days']
    same = sum(1 for x, y in zip(da, db) if x == y)
    first = next((i for i, (x, y) in enumerate(zip(da, db)) if x != y), None)
    out[sd] = {'dayFp': f'{same}/{max(len(da), len(db))}', 'firstDiffIdx': first, 'eight': a['eight'] == b['eight'], 'runHash': a.get('runHash') == b.get('runHash'), 'war': a.get('war') == b.get('war'),
               'pop': (a['eight'].get('pop'), b['eight'].get('pop')), 'warA': {k: a['war'].get(k) for k in ('declare', 'battle', 'casualties', 'captives') if k in (a.get('war') or {})}}
print(json.dumps(out, ensure_ascii=False))
