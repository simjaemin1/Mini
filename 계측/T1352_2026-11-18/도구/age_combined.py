import json
D = '/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1352'
G = [('끔', ['S0_1020', 'S0_7', 'S0_42']), ('ⓐ', ['SL_1020', 'SL_7', 'SL_42']), ('ⓑ', ['SS_1020', 'SS_7', 'SS_42']), ('ⓐ + ⓑ', ['SLS_1020', 'SLS_7', 'SLS_42']),
     ('묶음', ['SB0_1020', 'SB0_7', 'SB0_42']), ('묶음 + ⓐ + ⓑ', ['SBLS_1020', 'SBLS_7', 'SBLS_42'])]
B = ['0~1', '2~3', '4~7', '8~15', '16+']
print('| 꾸민 판(씨 셋 합) | ' + ' | '.join(f'나이 {b} 닿음 · 넘침 평균 · 넘침 > 0 · 1인 곳간 p50(판별) · K 위' for b in B) + ' |')
print('|---|' + '---|' * len(B))
for name, tags in G:
    cells = []
    for b in B:
        n = 0; s = 0.0; pos = 0; ok = 0; ph = []
        for t in tags:
            x = json.load(open(f'{D}/runs/news_{t}.json'))
            r = [y for y in x['ageBands'] if y['band'] == b][0]
            n += r['n']; pos += r['overPos']; ok += r['overK']
            if r['n']: s += r['overMean'] * r['n']; ph.append(r['perHeadP50'])
        cells.append(f"{n} · {round(s / n, 1) if n else '—'} · {pos} · {('~'.join(str(v) for v in sorted({min(ph), max(ph)}))) if ph else '—'} · {ok}")
    print(f'| {name} | ' + ' | '.join(cells) + ' |')
