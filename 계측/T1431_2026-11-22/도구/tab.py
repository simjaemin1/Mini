#!/usr/bin/env python3
# T1431 표 — out/sum.json(ana.py)에서 보고 표(두 해 · 3시드 · `_raidScrum` 식 ↔ T1431)
import json, os
D = os.path.dirname(os.path.abspath(__file__)); S = json.load(open(os.path.join(D, 'out', 'sum.json'), encoding='utf-8'))
def g(t): o = S.get(t); return o if o and 'err' not in o else None
def r2(x): return '—' if x is None else f'{x:.2f}'
rows = []
for seed in ('1020', '7', '42'):
    off, a, b = g('OFF_' + seed), g('ALL_' + seed), g('B_' + seed)
    for nm, o in (('스크럼 식(T1404 넷)', a), ('T1431 몸 전투', b)):
        if not o: rows.append(f'| {seed} | {nm} | (판 없음) |' + ' |' * 13); continue
        t = o.get('t1431') or {}
        n = t.get('n'); fled = t.get('fled'); fight = t.get('fight')
        full = o['day'] >= 730
        popR = (o['popEnd'] / off['popEnd']) if off and off['day'] == o['day'] else None
        fiR = (o['foodImp'] / off['foodImp']) if off and off['day'] == o['day'] else None
        rows.append('| {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | {} |'.format(
            seed, nm, o['day'], o['raided'],
            f"{fled} ({100*fled/n:.0f} %)" if n else '—', f"{fight} ({100*fight/n:.0f} %)" if n else '—', t.get('repel', '—') if n else '—',
            o['killed'], t.get('escDead', '—') if n else '—', o.get('fellOther'), round(o.get('lootAmt') or 0), r2(fiR), r2(popR), o['empty'], o.get('heapPeak')))
print('| 시드 | 판 | 날 | 털린 캐러밴 | 달아남 | 싸움 | 호위 승 | 행상 죽음 | 호위 죽음 | 도적 죽음 | 도적에게 간 짐 | 교역 식량 수입 끔비 | 인구 끔비 | 빈 마을 | 힙 봉우리 MB |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for r in rows: print(r)
