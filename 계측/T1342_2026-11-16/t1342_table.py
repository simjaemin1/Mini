#!/usr/bin/env python3
# T1342 두 해 판 표 · 가름 판 몫 · 권고표 — 판 JSON · 훅(t1275 · t1297 · t1334 · t1342) · 굶어 죽음 누계만 읽는다 · 세계 0
#   실행: python3 t1342_table.py <판 지도 JSON> [--out <폴더>]
#     판 지도 = { "<팔>": { "label": "…", "world": "bundle|v2|offw|off", "kind": "base|bind|fix", "seeds": { "1020": {"json": …, "dir": …}, … } }, … } (끔 팔 = "off" · 묶음 그대로 = "BKAM")
#   T1334 표 함수(`계측/T1334_2026-11-15/t1334_table.py` seed_data · stats)를 그대로 부른다(사본 0) — 칸 뜻은 그 머리말.
#   더하는 칸(t1342 훅): 둘째 겨울(날 640 ~ 729) K 위 죽음(인구 식 고리 — econ `_deadTot` − 굶음 − 자연사) · 자연사 · 굶음 · 떠남 · 닿음 · 무리 든 마을의 K 위 죽음(앞 45날 닿은 사람 ≥ 그날 인구 25%)
#   목표 넷(T1342 카드 · 두 해 모두 = 날 400 · 날 800): ① 1020 끔비 ≥ 1.10 ② 세 시드 끔비 ≥ 0.98 ③ 그 날까지 꼭대기 뒤 내림 ≤ 10% ④ 해마다 굶어 죽음 ≤ 같은 시드 끔(1년째 · 2년째 — 날 800 줄은 3년째 70날도)
import json, os, sys, collections, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('t1334_table', os.path.join(HERE, '..', 'T1334_2026-11-15', 't1334_table.py'))
T34 = importlib.util.module_from_spec(spec); spec.loader.exec_module(T34)
rd = T34.rd
def k42(e):
    d, s = e.get('dir'), e['seed']
    J = rd(os.path.join(d, f'sbc-{s}.json.t1342.json')) if d else None
    if not J or 'rows' not in J: return {}
    C = {c: i for i, c in enumerate(J['cols'])}
    byv = collections.defaultdict(dict)
    for r in J['rows']: byv[r[C['v']]][r[C['day']]] = r
    g = lambda r, k: (r[C[k]] or 0) if r else 0
    o = collections.Counter()
    for v, D in byv.items():
        for d, r in D.items():
            for k in ('kovD', 'natD', 'fdD', 'dep', 'arr'):
                if 640 <= d <= 729: o[k + 'W2'] += g(r, k)
                if 275 <= d <= 364: o[k + 'W1'] += g(r, k)
                y = 1 if d < 365 else 2 if d < 730 else 3
                o[f'{k}Y{y}'] += g(r, k)
            if 640 <= d <= 729 and g(r, 'kovD') > 0:
                N = max(1, g(r, 'N')); a45 = sum(g(D.get(x), 'arr') for x in range(d - 45, d + 1))
                if a45 >= 0.25 * N: o['kovFloodW2'] += g(r, 'kovD')
            if 640 <= d <= 729 and g(r, 'logi') < 0: o['logiNegW2'] += g(r, 'logi')
            if 275 <= d <= 364 and g(r, 'logi') < 0: o['logiNegW1'] += g(r, 'logi')
    o['trips'] = len(J.get('trips', [])); o['depOk'] = J.get('depOk') or 0
    return dict(o)
def goals(x, base, s, D):
    if not x or not base: return None
    r = x.get(f'r{D}'); dr = x.get(f'drop{D}')
    g1 = (r is not None and r >= 1.10) if s == '1020' else None
    g2 = r is not None and r >= 0.98
    g3 = dr is not None and dr <= 10
    ys = (1, 2) if D <= 730 else (1, 2, 3)
    g4 = all((x.get(f'fdY{y}') or 0) <= (base.get(f'fdY{y}') or 0) for y in ys if not (y == 2 and D < 730))
    return {'g1': g1, 'g2': g2, 'g3': g3, 'g4': g4}
def main():
    A = sys.argv[1:]; out = A[A.index('--out') + 1] if '--out' in A else HERE
    M = json.load(open(A[0])); SEEDS = ['1020', '7', '42']
    D = {}; K = {}
    for arm, v in M.items():
        for s, e in v['seeds'].items():
            e = dict(e); e['seed'] = s; D[(arm, s)] = T34.seed_data(e); K[(arm, s)] = k42(e)
    T = {}
    for arm, v in M.items():
        T[arm] = {'label': v['label'], 'world': v.get('world'), 'kind': v.get('kind'), 'seeds': {}}
        for s in v['seeds']:
            x = T34.stats(D[(arm, s)], D.get(('off', s))); x.update(K[(arm, s)])
            cum = D[(arm, s)]['fdcum']; gg = lambda d: cum.get(d, cum.get(max([k for k in cum if k <= d] or [0]), 0)) if cum else 0
            x['fdL1'] = gg(548) - gg(183); x['fdL2'] = gg(800) - gg(548)   # 굶주림 철(9월 1일 ~ 8월 31일 — 첫 겨울 굶음이 3월 1일 해 바뀜에 갈리지 않는 자): 1년 9월 ~ 2년 8월 · 2년 9월 ~ 판 끝
            T[arm]['seeds'][s] = x
    json.dump(T, open(os.path.join(out, 't1342-table.json'), 'w'), ensure_ascii=False, indent=1)
    f3 = lambda x: '—' if x is None else f'{x:.3f}'
    i0 = lambda x: '—' if x is None else f'{int(round(x)):,}'
    md = ['| 팔 | 시드 | 인구 날 400 · 600 · 800(명) | 끔비 400 · 600 · 800 | 2년째 평균(끔비) | 굶어 죽음 1 · 2 · 3년째(명) | 꼭대기(날) · 꼭대기 뒤 내림 % · 2년째 가장 큰 내림 % | '
          '둘째 겨울(날 640 ~ 729) 죽음 — K 위 · 그 가운데 무리 든 마을 · 자연사 · 굶음(명) | 둘째 겨울 떠남 · 닿음(명) |', '|---|---|---|---|---|---|---|---|---|']
    for arm, v in T.items():
        for s in SEEDS:
            x = v['seeds'].get(s)
            if not x: continue
            md.append(f"| {v['label']} | {s} | {i0(x['p400'])} · {i0(x['p600'])} · {i0(x['p800'])} | {f3(x['r400'])} · {f3(x['r600'])} · {f3(x['r800'])} | "
                      f"{i0(x['avgY2'])}({f3(x['rAvgY2'])}) | {i0(x['fdY1'])} · {i0(x['fdY2'])} · {i0(x['fdY3'])} | {i0(x.get('peak'))}({x.get('peakDay')}) · {x.get('drop')} · {x.get('dd2')} | "
                      f"{i0(x.get('kovDW2'))} · {i0(x.get('kovFloodW2'))} · {i0(x.get('natDW2'))} · {i0(x.get('fdDW2'))} | {i0(x.get('depW2'))} · {i0(x.get('arrW2'))} |")
    open(os.path.join(out, 't1342-table.md'), 'w').write('\n'.join(md) + '\n')
    # 가름 판 몫 — 묶음 그대로(BKAM) 대비 둘째 겨울 K 위 죽음이 준 몫(%) · 시드마다
    bm = ['| 묶은 후보 | 시드 | 둘째 겨울 K 위 죽음(명 · 묶음 그대로 → 묶음) | 준 몫 % | 둘째 겨울 죽음 전부(K 위 + 자연사 + 굶음) | 둘째 해 굶음 | 끔비 날 800 | 둘째 겨울 떠남 · 닿음 |', '|---|---|---|---|---|---|---|---|']
    BJ = {}
    for arm, v in T.items():
        if v.get('kind') != 'bind': continue
        for s in SEEDS:
            x = v['seeds'].get(s); b = T.get('BKAM', {}).get('seeds', {}).get(s)
            if not x or not b: continue
            kb, kx = b.get('kovDW2') or 0, x.get('kovDW2') or 0
            sh = round(100 * (kb - kx) / kb, 1) if kb else None
            BJ.setdefault(arm, {})[s] = {'kovB': kb, 'kovX': kx, 'share': sh}
            tot = lambda z: (z.get('kovDW2') or 0) + (z.get('natDW2') or 0) + (z.get('fdDW2') or 0)
            bm.append(f"| {v['label']} | {s} | {i0(kb)} → {i0(kx)} | {sh} | {i0(tot(b))} → {i0(tot(x))} | {i0(b.get('fdY2'))} → {i0(x.get('fdY2'))} | {f3(b.get('r800'))} → {f3(x.get('r800'))} | "
                      f"{i0(x.get('depW2'))} · {i0(x.get('arrW2'))} |")
    open(os.path.join(out, 't1342-bind.md'), 'w').write('\n'.join(bm) + '\n'); json.dump(BJ, open(os.path.join(out, 't1342-bind.json'), 'w'), ensure_ascii=False, indent=1)
    # 권고표 — 두 해 목표 넷(날 400 · 날 800)
    rc = ['| 줄 | 끔비 날 400(1020 · 7 · 42) | 끔비 날 800 | 2년째 평균 끔비 | 꼭대기 뒤 내림 % 날 400 · 800 | 굶어 죽음 1년째 · 2년째(끔) | 굶주림 철 굶어 죽음 1년 9월 ~ 2년 8월(끔) | 둘째 겨울 K 위 죽음 | 목표 넷 날 400 | 목표 넷 날 800 | 두 해 목표 넷 |',
          '|---|---|---|---|---|---|---|---|---|---|---|']
    RJ = {}
    ok = lambda b: '—' if b is None else ('○' if b else '✗')
    for arm, v in T.items():
        if arm == 'off' or v.get('kind') == 'bind': continue
        S = [v['seeds'].get(s) for s in SEEDS]; B = [T.get('off', {}).get('seeds', {}).get(s) for s in SEEDS]
        if not all(S) or not all(B): continue
        G = {D: [goals(S[i], B[i], SEEDS[i], D) for i in range(3)] for D in (400, 800)}
        agg = {}
        for D in (400, 800):
            gg = G[D]
            agg[D] = {'g1': gg[0]['g1'] if v.get('world') != 'offw' else False, 'g2': all(x['g2'] for x in gg), 'g3': all(x['g3'] for x in gg), 'g4': all(x['g4'] for x in gg)}
        both = all(agg[400][k] and agg[800][k] for k in ('g1', 'g2', 'g3', 'g4'))
        RJ[arm] = {'agg': agg, 'both': both, 'per': G}
        jj = lambda f: ' · '.join(f(x) for x in S)
        rc.append(f"| {'**' if both else ''}{v['label']}{'**' if both else ''} | {jj(lambda x: f3(x['r400']))} | {jj(lambda x: f3(x['r800']))} | {jj(lambda x: f3(x['rAvgY2']))} | "
                  f"{jj(lambda x: str(x.get('drop400')))} / {jj(lambda x: str(x.get('drop800')))} | {jj(lambda x: str(x['fdY1']))} / {jj(lambda x: str(x['fdY2']))}"
                  f"({' · '.join(str(b['fdY1']) for b in B)} / {' · '.join(str(b['fdY2']) for b in B)}) | {jj(lambda x: str(x.get('fdL1')))}({' · '.join(str(b.get('fdL1')) for b in B)}) | "
                  f"{jj(lambda x: i0(x.get('kovDW2')))} | "
                  f"{' · '.join(ok(agg[400][k]) for k in ('g1', 'g2', 'g3', 'g4'))} | {' · '.join(ok(agg[800][k]) for k in ('g1', 'g2', 'g3', 'g4'))} | {ok(both)} |")
    open(os.path.join(out, 't1342-reco.md'), 'w').write('\n'.join(rc) + '\n'); json.dump(RJ, open(os.path.join(out, 't1342-reco.json'), 'w'), ensure_ascii=False, indent=1)
    print('\n'.join(md)); print(); print('\n'.join(bm)); print(); print('\n'.join(rc))
if __name__ == '__main__': main()
