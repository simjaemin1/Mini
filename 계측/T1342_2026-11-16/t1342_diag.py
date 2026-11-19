#!/usr/bin/env python3
# T1342 ① 진단 — 훅 `sbc-<시드>.json.t1342.json`(마을-날 줄 + 사람마다 길)에서
#   (1) 날 400 ~ 800 30날 줄(세계 합 · 둘째 겨울에 가장 많이 죽은 마을)
#   (2) 둘째 겨울(날 640 ~ 729 · 2년 12월 1일 ~ 3년 2월 말) K 위 죽음(인구 식 고리)을 마을 갈래로 — 무리가 든 마을(앞 45날 닿은 사람 ≥ 그날 인구 25%) ·
#       첫 해에 불어난 마을(날 365 인구 ÷ 날 0 인구 위 사분위) · 영토가 못 따라간 마을(2년째 영토 셀 ÷ 사람이 날 365 의 반 밑) · 그 밖
#   (3) 무리: 닿은 날마다 받는 마을 · 떠난 마을 수 · 사람 수 · 그날 받는 마을 인구 ÷ K
#   (4) 첫 겨울(날 275 ~ 364)과 둘째 겨울 견줌 — 보호막이 삼킨 압력(로지스틱 음수 합) · 닿은 사람 · K 위 마을-날
#   python3 t1342_diag.py <판 지도 JSON> [--out 폴더]
import json, sys, os, collections
def rd(p):
    try: return json.load(open(p))
    except Exception: return None
def load(d, s):
    J = rd(os.path.join(d, f'sbc-{s}.json.t1342.json'))
    if not J or 'rows' not in J: return None
    C = {c: i for i, c in enumerate(J['cols'])}
    byv = collections.defaultdict(dict)
    for r in J['rows']: byv[r[C['v']]][r[C['day']]] = r
    return J, C, byv
def g(r, C, k, dflt=0):
    x = r[C[k]] if r else None
    return dflt if x is None else x
def knf(r, C):
    a, b = g(r, C, 'Kslot', None), g(r, C, 'Kfuel', None)
    if a is None or b is None: return None
    return max(0.0, min(a, b))
WIN = [(d, min(d + 30, 801)) for d in range(400, 800, 30)]
def lines30(J, C, byv, vs=None):
    out = []
    for a, b in WIN:
        s = collections.Counter(); nk = []; fdy = []
        for v, D in byv.items():
            if vs is not None and v not in vs: continue
            for d in range(a, b):
                r = D.get(d)
                if not r: continue
                for k in ('born', 'dep', 'arr', 'fdD', 'kovD', 'natD'): s[k] += g(r, C, k)
            r = D.get(b - 1)
            if r:
                s['N'] += g(r, C, 'N'); k_ = knf(r, C)
                if k_: nk.append(g(r, C, 'N') / max(1, k_))
                if g(r, C, 'foodDays', None) is not None: fdy.append(g(r, C, 'foodDays'))
        out.append({'a': a, 'b': b - 1, **s, 'NK': round(max(nk), 2) if nk else None, 'NKmed': round(sorted(nk)[len(nk) // 2], 2) if nk else None,
                    'fdays': round(sorted(fdy)[len(fdy) // 2], 1) if fdy else None})
    return out
def arrivals(byv, C, v, d0, d1):
    D = byv.get(v, {}); return sum(g(D.get(d), C, 'arr') for d in range(d0, d1 + 1))
def classify(J, C, byv, a=640, b=729):
    # 마을 갈래 — 마을마다 둘째 겨울 K 위 죽음을 그날 갈래로
    N0 = {v: g(D.get(min(D)), C, 'N') for v, D in byv.items() if D}
    N365 = {v: g(D.get(365), C, 'N') for v, D in byv.items()}
    gr = sorted((N365[v] / max(1, N0[v]), v) for v in byv)
    q3 = gr[int(len(gr) * 0.75)][0] if gr else 0
    tpc365 = {v: (g(byv[v].get(365), C, 'terr', None) or 0) / max(1, N365[v]) for v in byv}
    cls = collections.Counter(); byvil = collections.defaultdict(collections.Counter)
    for v, D in byv.items():
        for d in range(a, b + 1):
            r = D.get(d)
            if not r: continue
            k = g(r, C, 'kovD')
            if k <= 0: continue
            N = max(1, g(r, C, 'N'))
            if arrivals(byv, C, v, d - 45, d) >= 0.25 * N: c = 'flood'
            elif N365[v] / max(1, N0[v]) >= q3: c = 'grewY1'
            elif (g(r, C, 'terr', None) or 0) / N < 0.5 * tpc365[v]: c = 'terrLag'
            else: c = 'other'
            cls[c] += k; byvil[v][c] += k
    return cls, byvil
def herd(J, C, byv, a=640, b=729):
    # 닿은 날 · 받는 마을마다 — 떠난 마을 수 · 사람 · 떠난 날 퍼짐 · 그날 인구 ÷ K(K 넘겼나)
    g2 = collections.defaultdict(list)
    for dd, f, da, t in J.get('trips', []):
        if a - 30 <= da <= b: g2[(t, da)].append((dd, f))
    out = []
    for (t, da), L in g2.items():
        r = byv.get(t, {}).get(da); k_ = knf(r, C) if r else None
        out.append({'to': J['names'][t], 'day': da, 'n': len(L), 'src': len(set(f for _, f in L)), 'depSpan': max(d for d, _ in L) - min(d for d, _ in L),
                    'N': g(r, C, 'N') if r else None, 'NK': round(g(r, C, 'N') / max(1, k_), 2) if (r and k_) else None})
    out.sort(key=lambda x: -x['n'])
    return out
def winter_cmp(J, C, byv):
    res = {}
    for nm, a, b in (('w1', 275, 364), ('w2', 640, 729)):
        s = collections.Counter(); over = 0
        for v, D in byv.items():
            for d in range(a, b + 1):
                r = D.get(d)
                if not r: continue
                lg = g(r, C, 'logi')
                if lg < 0: s['logiNeg'] += lg
                for k in ('arr', 'dep', 'kovD', 'fdD', 'born'): s[k] += g(r, C, k)
                k_ = knf(r, C)
                if k_ and g(r, C, 'N') > k_: over += 1
        res[nm] = {**{k: round(x, 1) for k, x in s.items()}, 'overKvd': over}
    return res
def main():
    A = sys.argv[1:]; out = A[A.index('--out') + 1] if '--out' in A else os.path.dirname(os.path.abspath(__file__))
    M = json.load(open(A[0]))
    R = {}
    for arm, v in M.items():
        for s, e in v['seeds'].items():
            L = load(e['dir'], s)
            if not L: continue
            J, C, byv = L
            cls, byvil = classify(J, C, byv)
            R[f'{arm}|{s}'] = {'arm': arm, 'label': v.get('label', arm), 'seed': s, 'lines': lines30(J, C, byv), 'cls': dict(cls),
                               'top': [(J['names'][vv], dict(c)) for vv, c in sorted(byvil.items(), key=lambda kv: -sum(kv[1].values()))[:8]],
                               'herd': herd(J, C, byv)[:15], 'winter': winter_cmp(J, C, byv),
                               'tripsN': len(J.get('trips', [])), 'depOk': J.get('depOk'), 'depFail': J.get('depFail'), 'arrUnk': J.get('arrUnk'), 'err': J.get('err')}
    json.dump(R, open(os.path.join(out, 't1342-diag.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({k: {'cls': v['cls'], 'winter': v['winter'], 'trips': v['tripsN'], 'depOk': v['depOk'], 'err': v['err']} for k, v in R.items()}, ensure_ascii=False, indent=1))
if __name__ == '__main__' and '--md' not in sys.argv: main()

# ---- md — 보고 §1 조각(묶음 그대로 · 끔 · 고침 판 · 시드 1020 · 42 → t1342-diag-<시드>.md) ----
def md(R, out, arms=('BKAM', 'off', 'BKG2'), seed='1020'):
    L = []
    f = lambda x: '—' if x is None else (f'{x:,}' if isinstance(x, int) else str(x))
    for arm in arms:
        r = R.get(f'{arm}|{seed}')
        if not r: continue
        L.append(f"**{r['label']} · 시드 {seed} — 날 400 ~ 800 30날 줄(세계 합)**\n")
        L.append('| 날 | 사람(끝날) | 인구 ÷ K(땅 · 땔감) 가장 큰 마을 · 가운데 마을 | 곳간 날 수(가운데 마을) | 난 사람 | 떠남 | 닿음 | 굶어 죽음 | K 위 죽음 | 자연사 |')
        L.append('|---|---:|---|---:|---:|---:|---:|---:|---:|---:|')
        for l in r['lines']:
            L.append(f"| {l['a']} ~ {l['b']} | {f(l.get('N'))} | {l.get('NK')} · {l.get('NKmed')} | {l.get('fdays')} | {f(l.get('born', 0))} | {f(l.get('dep', 0))} | {f(l.get('arr', 0))} | {f(l.get('fdD', 0))} | {f(l.get('kovD', 0))} | {f(l.get('natD', 0))} |")
        w = r['winter']
        L.append('')
        L.append(f"* 첫 겨울(날 275 ~ 364) — 닿음 {f(w['w1'].get('arr', 0))} · K 위 마을-날 {w['w1'].get('overKvd', 0)} · 인구 식 음수 합 {w['w1'].get('logiNeg', 0)} · K 위 죽음 {f(w['w1'].get('kovD', 0))} / "
                 f"둘째 겨울(날 640 ~ 729) — 닿음 {f(w['w2'].get('arr', 0))} · K 위 마을-날 {w['w2'].get('overKvd', 0)} · 인구 식 음수 합 {w['w2'].get('logiNeg', 0)} · K 위 죽음 {f(w['w2'].get('kovD', 0))}")
        c = r['cls']; tot = sum(c.values()) or 1
        L.append(f"* 둘째 겨울 K 위 죽음 갈래 — 무리 든 마을 {c.get('flood', 0):,}({100 * c.get('flood', 0) / tot:.1f}%) · 영토가 못 따라간 마을 {c.get('terrLag', 0):,}({100 * c.get('terrLag', 0) / tot:.1f}%) · "
                 f"첫 해 불어난 마을 {c.get('grewY1', 0):,}({100 * c.get('grewY1', 0) / tot:.1f}%) · 그 밖 {c.get('other', 0):,}({100 * c.get('other', 0) / tot:.1f}%)")
        if r['herd']:
            L.append('* 가장 큰 무리(닿은 날 · 받는 마을 · 사람 · 떠난 마을 수 · 떠난 날 퍼짐 · 그날 인구 ÷ K): ' + ' / '.join(
                f"날 {h['day']} {h['to']} {h['n']}명 · {h['src']}마을 · {h['depSpan']}날 · {h['NK']}" for h in r['herd'][:6]))
        L.append('')
    open(os.path.join(out, f't1342-diag-{seed}.md'), 'w').write('\n'.join(L) + '\n')
if __name__ == '__main__' and '--md' in sys.argv:
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else HERE if 'HERE' in dir() else '.'
    R = json.load(open(os.path.join(out, 't1342-diag.json')))
    for sd in ('1020', '42'): md(R, out, seed=sd)
