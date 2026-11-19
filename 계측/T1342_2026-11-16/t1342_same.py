#!/usr/bin/env python3
# T1342 ① — 둘째 겨울에 가장 많이 죽은 마을(묶음 그대로)을 끔 · 고침 판의 같은 마을과 견준다(날 639 사람 · 날 640 ~ 729 가장 큰 인구 ÷ K(땅 · 땔감) · 닿음 · K 위 죽음)
#   python3 t1342_same.py <판 지도 JSON> <시드> [--out 폴더]
import json, sys, os, collections
def rd(d, s):
    J = json.load(open(os.path.join(d, f'sbc-{s}.json.t1342.json'))); C = {c: i for i, c in enumerate(J['cols'])}
    by = collections.defaultdict(dict)
    for r in J['rows']: by[J['names'][r[C['v']]]][r[C['day']]] = r
    return J, C, by
def row(C, D):
    g = lambda r, k: (r[C[k]] or 0) if r else 0
    r639 = D.get(639); nk = 0; arr = 0; kov = 0; dep = 0
    for d in range(640, 730):
        r = D.get(d)
        if not r: continue
        k = min(g(r, 'Kslot') or 1e9, g(r, 'Kfuel') or 1e9)
        if k > 0: nk = max(nk, g(r, 'N') / k)
        arr += g(r, 'arr'); kov += g(r, 'kovD'); dep += g(r, 'dep')
    return {'N639': g(r639, 'N'), 'NK': round(nk, 2), 'arr': arr, 'dep': dep, 'kov': kov, 'terr639': g(r639, 'terr'), 'K639': g(r639, 'K')}
def main():
    A = sys.argv[1:]; M = json.load(open(A[0])); s = A[1]; out = A[A.index('--out') + 1] if '--out' in A else os.path.dirname(os.path.abspath(__file__))
    arms = [a for a in ('BKAM', 'off', 'BKG2', 'BKG') if a in M and s in M[a]['seeds']]
    D = {a: rd(M[a]['seeds'][s]['dir'], s) for a in arms}
    J, C, by = D['BKAM']
    top = sorted(by, key=lambda v: -sum(((by[v].get(d) or [0] * 30)[C['kovD']] or 0) for d in range(640, 730)))[:8]
    L = [f'| 마을 | ' + ' | '.join(f"{M[a]['label'].split('(')[0].strip()} — 날 639 사람 · 둘째 겨울 가장 큰 인구 ÷ K · 닿음 · 떠남 · K 위 죽음" for a in arms) + ' |', '|---|' + '---|' * len(arms)]
    R = {}
    for v in top:
        cells = []
        for a in arms:
            J2, C2, by2 = D[a]; x = row(C2, by2.get(v, {})); R.setdefault(v, {})[a] = x
            cells.append(f"{x['N639']:,} · {x['NK']} · {x['arr']:,} · {x['dep']:,} · {x['kov']:,}")
        L.append(f'| {v} | ' + ' | '.join(cells) + ' |')
    open(os.path.join(out, f't1342-same-{s}.md'), 'w').write('\n'.join(L) + '\n'); json.dump(R, open(os.path.join(out, f't1342-same-{s}.json'), 'w'), ensure_ascii=False, indent=1)
    print('\n'.join(L))
if __name__ == '__main__': main()
