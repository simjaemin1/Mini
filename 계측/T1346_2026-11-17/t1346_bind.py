#!/usr/bin/env python3
# T1346 가름 판 표 — 묶음 갈래를 하나씩 묶거나 후보를 더한 판(시드 1020)의 1년째 굶음 · 2년째 굶음(날 365 ~ 460 — 묶음 판의 2년째 굶음은 모두 이 안) · 끔비 날 400 · 가을 출생
#   실행: python3 t1346_bind.py <판 지도 JSON> [--ref BK] [--out <폴더>]   — 판 지도 꼴은 t1346_table.py 와 같다(hook t1346 | t1342) · 끔 팔 이름 `off`
import json, os, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from t1346_table import load, csum
A = sys.argv[1:]; M = json.load(open(A[0]))
REF = A[A.index('--ref') + 1] if '--ref' in A else 'BK'
OUT = A[A.index('--out') + 1] if '--out' in A else os.path.dirname(os.path.abspath(__file__))
O = {a: load(v['seeds']['1020'], '1020') for a, v in M.items() if '1020' in v['seeds']}
def born_aut(e):
    p = os.path.join(e['dir'], 'sbc-1020.json.t1342.json')
    if not os.path.exists(p): return None
    J = json.load(open(p)); C = {c: i for i, c in enumerate(J['cols'])}
    return sum(r[C['born']] or 0 for r in J['rows'] if 184 <= r[C['day']] <= 274)
ref = O[REF]; ry2 = csum(ref['FI'], 365, 460)
md = ['| 판 | 1년째 굶음 | 2년째 굶음(날 365 ~ 460) · 묶음 대비 | 굶주림 철 앞쪽(날 184 ~ 460) | 끔비 날 400 | 가을 출생(9 ~ 11월) | 판 날 |', '|---|---:|---|---:|---:|---:|---:|']
R = {}
for a, o in O.items():
    y1 = csum(o['FI'], 0, 364); y2 = csum(o['FI'], 365, 460) if o['last'] >= 460 else None
    r4 = round(o['P'][400] / O['off']['P'][400], 3) if o['last'] >= 400 else None
    sh = None if (y2 is None or not ry2) else round(100 * (y2 - ry2) / ry2, 1)
    ba = born_aut(M[a]['seeds']['1020'])
    R[a] = {'y1': y1, 'y2': y2, 'share': sh, 'r400': r4, 'bornAut': ba, 'last': o['last'], 'season': csum(o['FI'], 184, 460) if o['last'] >= 460 else None}
    md.append(f"| {M[a]['label']} | {y1:,} | {'—' if y2 is None else f'{y2:,}'}{'' if sh is None or a == REF else f' ({sh:+.0f}%)'} | {'—' if R[a]['season'] is None else f'{R[a][chr(115)+chr(101)+chr(97)+chr(115)+chr(111)+chr(110)]:,}'} | {'—' if r4 is None else f'{r4:.3f}'} | {'—' if ba is None else f'{ba:,}'} | {o['last']} |")
open(os.path.join(OUT, 't1346-bind.md'), 'w').write('\n'.join(md) + '\n'); json.dump(R, open(os.path.join(OUT, 't1346-bind.json'), 'w'), ensure_ascii=False, indent=1)
print('\n'.join(md))
