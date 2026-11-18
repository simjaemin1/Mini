#!/usr/bin/env python3
# T1346 ① 진단 — 2년째(날 365 ~ 729) 굶어 죽음을 마을-날 줄로(t1342 훅 `sbc-<시드>.json.t1342.json` 만 읽는다 · 세계 0)
#   실행: python3 t1346_diag.py <판 지도 JSON> [--out <폴더>] [--arms BK,off] [--md]
#     판 지도 = { "<팔>": { "label": "…", "seeds": { "1020": {"dir": …}, … } }, … }(T1342 판 지도 그 꼴)
#   칸 자(날 0 = 1년 3월 1일 · 달력 정본 — 가을 = 날 184 ~ 274 · 겨울 = 275 ~ 364 · 2년 봄 = 365 ~ 456):
#     · 마을 종류 = 이름 머리(농촌 · 어촌 · 임업 · 광산)
#     · 가을에 분 마을 = 가을 출생 ≥ 겨울 들머리(날 274) 사람의 10% · 받은 마을 = 가을 · 겨울(날 184 ~ 364) 닿음 ≥ 10% · 보낸 마을 = 떠남 ≥ 10% · 그 밖 = 셋 다 아님
#     · 곳간 궤적 = 그날 곳간 날 수(`foodDays` — econ 곳간 식량 환산 ÷ (사람 × 하루 소비)) — 날 184 · 274 · 304 · 334 · 364 · 394 · 424 · 456
#     · 행복 = 그날 h(T1205 — 0.25 밑이면 불행 이탈 몸 문이 사람을 내보낸다)
#   10% 는 갈래 이름표의 자다(판 결과에 안 닿는다 — 갈래를 나누는 선일 뿐).
import json, os, sys, collections
A = sys.argv[1:]
OUT = A[A.index('--out') + 1] if '--out' in A else os.path.dirname(os.path.abspath(__file__))
ARMS = A[A.index('--arms') + 1].split(',') if '--arms' in A else None
KIND = lambda nm: next((k for k in ('농촌', '어촌', '임업', '광산') if nm.startswith(k)), '그 밖')
TRAJ = [184, 274, 304, 334, 364, 394, 424, 456]
def load(d, s):
    p = os.path.join(d, f'sbc-{s}.json.t1342.json')
    if not os.path.exists(p): return None
    J = json.load(open(p)); C = {c: i for i, c in enumerate(J['cols'])}
    byv = collections.defaultdict(dict)
    for r in J['rows']: byv[r[C['v']]][r[C['day']]] = r
    return J, C, byv
def one(J, C, byv):
    names = J['names']; nm = lambda v: names[str(v)] if isinstance(names, dict) else names[v]
    g = lambda r, k: (r[C[k]] or 0) if r else 0
    V = []
    for v, D in byv.items():
        fd2 = sum(g(r, 'fdD') for d, r in D.items() if 365 <= d < 730)
        fd1 = sum(g(r, 'fdD') for d, r in D.items() if d < 365)
        N274 = g(D.get(274) or D.get(273), 'N')
        bornAut = sum(g(r, 'born') for d, r in D.items() if 184 <= d < 275)
        bornWin = sum(g(r, 'born') for d, r in D.items() if 275 <= d < 365)
        arrAW = sum(g(r, 'arr') for d, r in D.items() if 184 <= d < 365)
        depAW = sum(g(r, 'dep') for d, r in D.items() if 184 <= d < 365)
        base = max(1, N274)
        role = []
        if bornAut >= 0.1 * base: role.append('가을에 분')
        if arrAW >= 0.1 * base: role.append('받은')
        if depAW >= 0.1 * base: role.append('보낸')
        if not role: role = ['그 밖']
        tr = [round(g(D.get(d), 'foodDays'), 1) if D.get(d) and D.get(d)[C['foodDays']] is not None else None for d in TRAJ]
        hs = [round(g(D.get(d), 'h'), 2) if D.get(d) and D.get(d)[C['h']] is not None else None for d in (274, 334, 394)]
        Ns = [g(D.get(d), 'N') for d in (184, 274, 364, 456)]
        first0 = next((d for d in sorted(D) if 184 <= d < 730 and D[d][C['foodDays']] is not None and D[d][C['foodDays']] < 1 and g(D[d], 'N') > 0), None)
        V.append({'v': v, 'name': nm(v), 'kind': KIND(nm(v)), 'role': role, 'fdY1': fd1, 'fdY2': fd2, 'N274': N274, 'bornAut': bornAut, 'bornWin': bornWin,
                  'arrAW': arrAW, 'depAW': depAW, 'traj': tr, 'h': hs, 'N': Ns, 'first0': first0,
                  'emptied': (Ns[-1] == 0 and Ns[1] > 0)})
    return V
def summarize(V):
    tot = sum(x['fdY2'] for x in V) or 1
    byKind = collections.Counter(); byRole = collections.Counter(); byKR = collections.Counter()
    for x in V:
        byKind[x['kind']] += x['fdY2']
        for r in x['role']: byRole[r] += x['fdY2']
        byKR['+'.join(x['role'])] += x['fdY2']
    return {'fdY2': sum(x['fdY2'] for x in V), 'kind': dict(byKind), 'role': dict(byRole), 'roleSet': dict(byKR),
            'villagesY2': sum(1 for x in V if x['fdY2'] > 0), 'emptied': [x['name'] for x in V if x['emptied']],
            'top': sorted(V, key=lambda x: -x['fdY2'])[:10]}
def month_of(J, C):
    mon = collections.Counter(); born = collections.Counter()
    for r in J['rows']:
        d = r[C['day']]
        if 184 <= d < 730:
            m = (d - 184) // 30; mon[m] += r[C['fdD']] or 0; born[m] += r[C['born']] or 0
    return [mon[m] for m in range(19)], [born[m] for m in range(19)]
def main():
    M = json.load(open(A[0])); R = {}
    for arm, a in M.items():
        if ARMS and arm not in ARMS: continue
        for s, e in a['seeds'].items():
            L = load(e['dir'], s)
            if not L: continue
            J, C, byv = L
            V = one(J, C, byv); S = summarize(V); mf, mb = month_of(J, C)
            R[f'{arm}|{s}'] = {'arm': arm, 'label': a.get('label', arm), 'seed': s, 'sum': {k: v for k, v in S.items() if k != 'top'},
                               'top': S['top'], 'famineBy30': mf, 'bornBy30': mb, 'villages': V}
    json.dump(R, open(os.path.join(OUT, 't1346-diag.json'), 'w'), ensure_ascii=False, indent=1)
    if '--md' in A: md(R)
    for k, r in R.items():
        print(k, r['sum']['fdY2'], r['sum']['role'], r['sum']['kind'], 'emptied', r['sum']['emptied'])
def md(R):
    L = []
    mon = ['9월', '10월', '11월', '12월', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '1월', '2월', '3월']
    for k, r in R.items():
        S = r['sum']; tot = S['fdY2'] or 1
        L.append(f"**{r['label']} · 시드 {r['seed']} — 2년째 굶어 죽음 {S['fdY2']:,}명 · 굶은 마을 {S['villagesY2']} · 통째로 빈 마을 {len(S['emptied'])}{(' (' + ' · '.join(S['emptied']) + ')') if S['emptied'] else ''}**\n")
        L.append('* 30날 칸(1년 9월부터) 굶어 죽음: ' + ' · '.join(f"{mon[i]} {n}" for i, n in enumerate(r['famineBy30']) if n) + ' · 출생: ' + ' · '.join(f"{mon[i]} {n}" for i, n in enumerate(r['bornBy30'][:9])))
        L.append('* 갈래(겹침 — 한 마을이 둘 이상): ' + ' · '.join(f"{k2} {v:,}({100 * v / tot:.0f}%)" for k2, v in sorted(S['role'].items(), key=lambda kv: -kv[1])) +
                 ' / 마을 종류: ' + ' · '.join(f"{k2} {v:,}({100 * v / tot:.0f}%)" for k2, v in sorted(S['kind'].items(), key=lambda kv: -kv[1])))
        L.append('')
        L.append('| 마을 | 갈래 | 2년째 굶음 | 겨울 들머리 사람 | 가을 출생 · 겨울 출생 | 가을 · 겨울 닿음 · 떠남 | 곳간 날 수 9/1 · 12/1 · 12/31 · 1/30 · 3/1 · 3/31 · 4/30 · 6/1 | 행복 12/1 · 1/30 · 3/31 | 사람 9/1 · 12/1 · 3/1 · 6/1 | 곳간 처음 0 |')
        L.append('|---|---|---:|---:|---|---|---|---|---|---:|')
        for x in r['top'][:8]:
            if not x['fdY2']: continue
            tr = ' · '.join('—' if t is None else (f"{t:.0f}" if t >= 10 else f"{t:.1f}") for t in x['traj'])
            L.append(f"| {x['name']} | {' · '.join(x['role'])} | {x['fdY2']} | {x['N274']} | {x['bornAut']} · {x['bornWin']} | {x['arrAW']} · {x['depAW']} | {tr} | {' · '.join('—' if h is None else str(h) for h in x['h'])} | {' · '.join(str(n) for n in x['N'])} | {x['first0'] if x['first0'] is not None else '—'} |")
        L.append('')
    open(os.path.join(OUT, 't1346-diag.md'), 'w').write('\n'.join(L) + '\n')
if __name__ == '__main__': main()
