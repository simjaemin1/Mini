#!/usr/bin/env python3
# T1454 덧붙임 셋 ① — 추상 집 노후 끔(HD0) 갈래가 왜 인구를 깎나: 날별(100날마다) 인구 · 집 칸 · 통나무 · 나무꾼 · 굶어 죽음 누계 · 빈 마을 · 가장 많이 잃은 마을
import json, os, sys
D = os.path.dirname(os.path.abspath(__file__))
def L(tag, s):
    J = json.load(open(os.path.join(D, 'runs', tag, f'{tag}-{s}.json'))); P = json.load(open(os.path.join(D, 'runs', tag, 'probe.json')))
    return J, P
for s in [int(x) for x in (sys.argv[1:] or ['1020', '7', '42'])]:
    try: A, PA = L(f'HDON_{s}', s); B, PB = L(f'HD0_{s}', s)
    except Exception as e: print(s, '판 없음', e); continue
    print(f'\n## 시드 {s} — 노후 켬(HDON) → 끔(HD0)')
    print('| 날 | 인구 | 집 칸(housing) | 집(채) | 통나무 | 돌 | 나무꾼 | 굶어 죽음 누계 | 빈 마을 |')
    print('|---|---|---|---|---|---|---|---|---|')
    da = {r['d']: r for r in PA['days']}; db = {r['d']: r for r in PB['days']}
    ra = {r[0]: r for r in A['rows']}; rb = {r[0]: r for r in B['rows']}
    for d in [1, 100, 200, 300, 365, 400, 500, 600, 700, 730]:
        if d not in da or d not in db: continue
        x, y = da[d], db[d]; u, w = ra.get(d), rb.get(d)
        dead = lambda r: sum(r[3]) if r else None
        emp = lambda r: sum(1 for i, n in enumerate(r[1]) if n == 0) if r else None
        print(f"| {d} | {x['pop']} → {y['pop']} | {x['housing']} → {y['housing']} | {x['houses']} → {y['houses']} | {x['wood']} → {y['wood']} | {x['stone']} → {y['stone']} | {x['lj']} → {y['lj']} | {dead(u)} → {dead(w)} | {emp(u)} → {emp(w)} |")
    names = A['names']; la = A['rows'][-1]; lb = B['rows'][-1]
    diff = sorted(((lb[1][i] - la[1][i], names[i], la[1][i], lb[1][i], la[3][i], lb[3][i]) for i in range(len(names))))
    print('잃은 마을(끝 인구 켬 → 끔 · 굶어 죽음 누계):', ' · '.join(f"{n} {a}→{b}(죽음 {da_}→{db_})" for dd, n, a, b, da_, db_ in diff[:6]))
    print('얻은 마을:', ' · '.join(f"{n} {a}→{b}" for dd, n, a, b, da_, db_ in diff[-4:]))
    print('빈 마을(끔):', [(names[i], B['emptyDay'][i]) for i in range(len(names)) if lb[1][i] == 0])
    print('도적 켬:', A.get('bandit'), '끔:', B.get('bandit'))
