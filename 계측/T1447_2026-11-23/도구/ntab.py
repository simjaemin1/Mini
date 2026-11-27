#!/usr/bin/env python3
# T1447 N 표 — 그림 실험 판(G3 · G6P · G12)의 날마다 막힌 칸으로: 명분 문턱 = min(⌈사유지 ½⌉, N, 둘레) 에 처음 닿은 날(놓은 지 며칠) · N = 5 · 10 · 15 · 20 · 30
import json, math, os
S = os.path.dirname(os.path.abspath(__file__))
CLS = {'S': '작은', 'M': '중간', 'L': '큰'}
PLACE = {('touch', 'grow'): '붙음 · 자랄 쪽', ('gap', 'grow'): '떨어짐 · 자랄 쪽', ('touch', 'away'): '붙음 · 안 자랄 쪽', ('gap', 'away'): '떨어짐 · 안 자랄 쪽'}
NS = [5, 10, 15, 20, 30]
out = []
print('| 사유지 | 마을 · 자리 | 첫 막힘 | ' + ' | '.join(f'N {n}' for n in NS) + ' | 끝 막힌 칸 / 둘레 |')
print('|---|---|---|' + '---|' * len(NS) + '---|')
for tag, s in [('G3', 3), ('G6P', 6), ('G12', 12)]:
    j = json.load(open(os.path.join(S, 'runs', tag, 'probe.json')))
    placed = [e for e in j['placed'] if not e.get('fail')]
    d0 = j['cfg']['d0']
    for i, e in enumerate(placed):
        size, rim = e['size'], e['perim']
        ser = [(r['d'], r['t'][i][3]) for r in j['days']]
        first = next((d - d0 for d, b in ser if b > 0), None)
        cells = []
        for n in NS:
            need = min(math.ceil(size / 2), n, rim)
            hit = next((d - d0 for d, b in ser if b >= need), None)
            cells.append(f"{hit}날({need})" if hit is not None else f"—({need})")
        out.append(dict(tag=tag, v=e['vname'], cls=e['cls'], size=size, rim=rim, first=first, n={n: c for n, c in zip(NS, cells)}, end=ser[-1][1] if ser else 0))
        print(f"| {s}×{s} | {CLS[e['cls']]} {e['vname']} · {PLACE[(e['mode'], e['side'])]} | {first if first is not None else '—'}{'날' if first is not None else ''} | " + ' | '.join(cells) + f" | {ser[-1][1] if ser else 0} / {rim} |")
json.dump(out, open(os.path.join(S, 'ntab.json'), 'w'), ensure_ascii=False, indent=1)
