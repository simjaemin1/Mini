#!/usr/bin/env python3
# T1363 ⑤ 봄 흐름 고점(T1346 회부 4) — 표만(고침 안 · 새 수가 드는 일): 흐름 문(`T1346_BIRTH_FLOW`) 켠 판에서 봄에 분 마을의 늦여름 굶음
#   실행: python3 t1363_spring.py <시드=마을-날 JSON(t1346 훅 — surPC · impPC · N · foodDays · fdTot)> … [--out <json>]
#   칸(해마다 · 2년째 = 날 396 ~ 670 · 3년째 = 날 761 ~ 1035 · 달력 정본에서 뽑은 날):
#     봄 = 4 · 5월(4/1 ~ 5/31) · 여름 꺾임 = 6 · 7월 · 늦여름 ~ 겨울 앞 = 7 ~ 12월
#     · 마을마다 봄 늘림(4/1 → 6/1 사람 %) · 봄 흐름(장부 + 들여옴 ÷ 사람 하루치 · 평균) · 6 · 7월 흐름 · 7 ~ 12월 굶어 죽음 · 곳간 날 수 6/1 · 7/1
#     · 세계 — 7 ~ 12월 굶음 가운데 봄에 20% 넘게 분 마을 몫 · 봄 흐름이 6 · 7월에 0 밑으로 꺾인 마을 몫
import json, sys, collections, statistics
A = sys.argv[1:]
OUT = A[A.index('--out') + 1] if '--out' in A else None
RUNS = [a for a in A if '=' in a and not a.startswith('--')]
Y = {2: dict(apr=396, jun=457, jul=487, aug=518, jan=671), 3: dict(apr=761, jun=822, jul=852, aug=883, jan=1036)}

def table(tag, p):
    J = json.load(open(p)); C = {c: i for i, c in enumerate(J['cols'])}; names = J['names']
    V = collections.defaultdict(dict)
    for r in J['rows']: V[r[C['v']]][r[C['day']]] = r
    res = {'tag': tag, 'last': J.get('last'), 'years': {}}
    for y, D0 in Y.items():
        if (J.get('last') or 0) < D0['jan']: continue
        rows = []
        for v, D in V.items():
            def at(d, k):
                r = D.get(d); return None if r is None else r[C[k]]
            def mean(lo, hi, f):
                xs = [f(D[d]) for d in range(lo, hi) if d in D and f(D[d]) is not None]
                return statistics.mean(xs) if xs else None
            flow = lambda r: (r[C['surPC']] + r[C['impPC']]) if (r[C['surPC']] is not None and r[C['impPC']] is not None) else None
            n0, n1 = at(D0['apr'], 'N'), at(D0['jun'], 'N')
            if not n0: continue
            fd = 0; prev = None
            for d in range(D0['apr'] - 1, D0['jan']):
                r = D.get(d)
                if r is None: continue
                f = r[C['fdTot']] or 0
                if prev is not None and d >= D0['jul']: fd += max(0, f - prev)
                prev = f
            rows.append({'v': names[v], 'n_apr': n0, 'n_jun': n1, 'grow': round((n1 - n0) / n0, 3) if n1 is not None else None,
                         'flowSpring': round(mean(D0['apr'], D0['jun'], flow), 3) if mean(D0['apr'], D0['jun'], flow) is not None else None,
                         'flowSummer': round(mean(D0['jun'], D0['aug'], flow), 3) if mean(D0['jun'], D0['aug'], flow) is not None else None,
                         'food_jun': at(D0['jun'], 'foodDays'), 'food_jul': at(D0['jul'], 'foodDays'), 'fdLate': fd})
        tot = sum(r['fdLate'] for r in rows)
        grew = [r for r in rows if r['grow'] is not None and r['grow'] >= 0.2]
        turned = [r for r in rows if r['flowSpring'] is not None and r['flowSummer'] is not None and r['flowSpring'] > 0 and r['flowSummer'] < 0]
        res['years'][y] = {'fdLate': tot, 'fdLateGrew': sum(r['fdLate'] for r in grew), 'grewN': len(grew),
                           'fdLateTurned': sum(r['fdLate'] for r in turned), 'turnedN': len(turned),
                           'rows': sorted([r for r in rows if r['fdLate'] > 0], key=lambda r: -r['fdLate'])}
    return res

R = [table(t, p) for t, p in (a.split('=', 1) for a in RUNS)]
for r in R:
    for y, x in r['years'].items():
        print(f"== {r['tag']} · {y}년째 — 7 ~ 12월 굶어 죽음 {x['fdLate']} · 봄에 20% 넘게 분 마을 {x['grewN']}곳 몫 {x['fdLateGrew']} · 봄 흐름 + → 6 · 7월 − 로 꺾인 마을 {x['turnedN']}곳 몫 {x['fdLateTurned']}")
        for q in x['rows'][:6]: print('   ', q)
if OUT: json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1)
