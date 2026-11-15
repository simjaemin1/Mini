#!/usr/bin/env python3
# T1312 진단 ② — 죽음 누가 · 어디서(T1312 훅 마을-날 줄만 읽는다 · 세계 0)
#   읽는 것: 판 폴더의 `sbc-<시드>.json.t1312.json`(마을-날 — 죽음 `dead` · 굶어 죽음 `fd` · 늙어 죽음 `nat` · 떠난 사람 `emig` · 닿은 사람 `arr` · 그날 늘림 `dP` · K · 사람 수 N)
#   재는 것: 죽음 까닭 셋(굶어 죽음 · 늙어 죽음(T1206 생명표) · 그 밖 = 죽음 − 굶어 − 늙어 — 인구 식이 K 위에서 끌어낸 가장 늙은 사람 등) ×
#            마을 몫(받은 마을 = 400날 닿은 사람 ≥ 10 이고 닿은 ≥ 떠난 · 보낸 마을 = 떠난 사람 ≥ 10 이고 떠난 > 닿은 · 나머지) × 철(날 1 ~ 200 · 201 ~ 300 · 301 ~ 400)
#            · K 위 마을-날(그날 늘림 dP < 0) 수 · 그 밖 죽음이 가장 많은 마을 다섯(떠난 · 닿은 · 400날 인구 · K)
# 실행: python3 t1312_deaths.py <이름>=<폴더>@<시드> …
import json, sys, os, collections
WIN = [(1, 200), (201, 300), (301, 400)]
def arm(name, spec):
    d, s = spec.rsplit('@', 1)
    h = json.load(open(os.path.join(d, f'sbc-{s}.json.t1312.json'))); c = {k: i for i, k in enumerate(h['cols'])}
    em = collections.Counter(); ar = collections.Counter()
    for q in h['rows']:
        v = h['names'][q[c['v']]]; em[v] += q[c['emig']] or 0; ar[v] += q[c['arr']] or 0
    kind = lambda v: 'recv' if (ar[v] >= 10 and ar[v] >= em[v]) else ('send' if em[v] >= 10 else 'rest')   # 닿은 ≥ 떠난(그리고 ≥ 10) = 받은 마을 · 아니면 떠난 ≥ 10 = 보낸 마을
    T = collections.defaultdict(collections.Counter); W = collections.defaultdict(collections.Counter); other = collections.Counter(); negK = collections.Counter(); last = {}
    for q in h['rows']:
        v = h['names'][q[c['v']]]; day = q[c['day']]; k = kind(v)
        dd, fd, nat = q[c['dead']] or 0, q[c['fd']] or 0, q[c['nat']] or 0; ot = dd - fd - nat
        T[k]['dead'] += dd; T[k]['fd'] += fd; T[k]['nat'] += nat; T[k]['other'] += ot; other[v] += ot
        for lo, hi in WIN:
            if lo <= day <= hi: W[(lo, hi)]['dead'] += dd; W[(lo, hi)]['fd'] += fd; W[(lo, hi)]['nat'] += nat; W[(lo, hi)]['other'] += ot
        if (q[c['dP']] or 0) < 0: negK[k] += 1
        last[v] = (q[c['N']], q[c['K']])
    nv = collections.Counter(kind(v) for v in em.keys() | ar.keys() | set(last))
    return {'name': name, 'T': T, 'W': W, 'negK': negK, 'nv': nv, 'top': sorted(other.items(), key=lambda kv: -kv[1])[:5], 'em': em, 'ar': ar, 'last': last}
if __name__ == '__main__':
    R = [arm(*a.split('=', 1)) for a in sys.argv[1:]]
    KN = {'send': '보낸 마을(떠난 ≥ 10 · 떠난 > 닿은)', 'recv': '받은 마을(닿은 ≥ 10 · 닿은 ≥ 떠난)', 'rest': '나머지'}
    print('| 판 | 마을 몫(곳) | 죽음 전부 | ㄴ 굶어 죽음 | ㄴ 늙어 죽음 | ㄴ 그 밖(K 위 가장 늙은 사람 등) | K 위 마을-날(dP < 0) |')
    print('|---|---|---:|---:|---:|---:|---:|')
    for r in R:
        for k in ('send', 'recv', 'rest'):
            t = r['T'][k]; print(f"| {r['name']} | {KN[k]} ({r['nv'][k]}) | {t['dead']:,} | {t['fd']:,} | {t['nat']:,} | {t['other']:,} | {r['negK'][k]:,} |")
    print('\n| 판 | 날 | 죽음 전부 | ㄴ 굶어 | ㄴ 늙어 | ㄴ 그 밖 |')
    print('|---|---|---:|---:|---:|---:|')
    for r in R:
        for w in WIN:
            t = r['W'][w]; print(f"| {r['name']} | {w[0]} ~ {w[1]} | {t['dead']:,} | {t['fd']:,} | {t['nat']:,} | {t['other']:,} |")
    print('\n| 판 | 그 밖 죽음이 가장 많은 마을(그 밖 · 떠난 · 닿은 · 400날 인구 · K) |')
    print('|---|---|')
    for r in R: print(f"| {r['name']} | " + ' · '.join(f"{v} {n:,} · {r['em'][v]:,} · {r['ar'][v]:,} · {r['last'].get(v, (None, None))[0]} · {r['last'].get(v, (None, None))[1]}" for v, n in r['top']) + ' |')
