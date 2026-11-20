#!/usr/bin/env python3
# 보고 자리표 값 — out/sum.json(+ 관찰기) → rep/vals.json · python3 vals.py
import os, json, math, importlib.util, sys
D = os.path.dirname(os.path.abspath(__file__))
os.environ['T1391_ANA'] = 'none'; sys.argv = ['ana.py', 's2.json', 's3.json', 'wB.json', 'wW.json']
spec = importlib.util.spec_from_file_location('ana', os.path.join(D, 'ana.py')); A = importlib.util.module_from_spec(spec); spec.loader.exec_module(A)
SUM = json.load(open(os.path.join(D, 'out', 'sum.json'), encoding='utf-8'))
K = {(s['tag'].split('_')[0], s['kind'], s['seed']): s for s in SUM}
SEEDS = (1020, 7, 42)
f = A.fmt
def g(a, k, kind='sbc', seeds=SEEDS):
    return [K[(a, kind, sd)].get(k) if (a, kind, sd) in K else None for sd in seeds]
def ssum(a, k, kind='sbc', seeds=SEEDS):
    xs = [x for x in g(a, k, kind, seeds) if x is not None]; return sum(xs) if xs else None
def csum(a, k, kind='sbc', seeds=SEEDS):
    xs = [K[(a, kind, sd)]['conv'][k] for sd in seeds if (a, kind, sd) in K]; return sum(xs) if xs else None
V = {}
for a in ('OFF', 'NH', 'ALL', 'AR'):
    for k in ('emTry', 'emMove', 'emStay', 'emBandit', 'fd', 'dead', 'gStarve', 'lootN', 'killed', 'exo', 'sup', 'disband', 'u25', 'u32', 'cargo', 'foodImp', 'newCar', 'esc', 'poor5fd'):
        V[f'@@{a}_{k.upper()}@@'] = f(ssum(a, k))
    for k in ('join', 'joinWait', 'found', 'formed', 'waitStarve', 'in365', 'out365'):
        V[f'@@{a}_C{k.upper()}@@'] = f(csum(a, k))
    V[f'@@{a}_POP730@@'] = ' · '.join(f(x) for x in g(a, 'pop730'))
    V[f'@@{a}_POP365@@'] = ' · '.join(f(x) for x in g(a, 'pop365'))
    V[f'@@{a}_EMPTY@@'] = ' · '.join(f(x) for x in g(a, 'emptyEnd'))
    V[f'@@{a}_MEMPEAK@@'] = ' · '.join(f(x) for x in g(a, 'memPeak'))
    V[f'@@{a}_GINI@@'] = ' · '.join(f(x, 3) for x in g(a, 'giniEnd'))
    V[f'@@{a}_FDS@@'] = ' · '.join(f(x) for x in g(a, 'fd'))
    V[f'@@{a}_GSTARVES@@'] = ' · '.join(f(x) for x in g(a, 'gStarve'))
    off = g('OFF', 'pop730'); mine = g(a, 'pop730')
    V[f'@@{a}_RATIO@@'] = ' · '.join((f'{m / o:.2f}' if (m and o) else '—') for m, o in zip(mine, off))
    tr = [((m / o) if (m and o) else None) for m, o in zip(mine, off)]
    tr = [x for x in tr if x is not None]
    V[f'@@{a}_RATIO_AVG@@'] = f'{sum(tr) / len(tr):.2f}' if tr else '—'
    fdo = ssum('OFF', 'fd'); fdm = ssum(a, 'fd')
    V[f'@@{a}_FD_X@@'] = f'{fdm / fdo:.2f}' if (fdo and fdm is not None) else '—'
# 보호기 몫(all · 3시드)
ci, co = csum('ALL', 'in365') or 0, csum('ALL', 'out365') or 0
V['@@PROT_SHARE@@'] = f"all {ci / (ci + co) * 100:.0f}%({f(ci)} / {f(ci + co)})" if ci + co else '—'
ni, no = csum('NH', 'in365') or 0, csum('NH', 'out365') or 0
V['@@PROT_SHARE@@'] += f" · nohome {ni / (ni + no) * 100:.0f}%({f(ni)} / {f(ni + no)})" if ni + no else ''
V['@@WAITSTARVE@@'] = f"all {f(csum('ALL', 'waitStarve'))} · all + 부자 곁 {f(csum('AR', 'waitStarve'))} · nohome {f(csum('NH', 'waitStarve'))}(3시드 두 해)"
# 부자 곁 새 단 은거지 — 제 마을에서 몇 칸(관찰기 conv found 줄 · 마을 자리는 판 로그를 안 쓰고 found 줄의 camp 와 마을 이름만 — 거리는 따로 못 잰다 → 판 자 로그의 은거지 줄)
far = []
for r in A.RUNS:
    if not r['tag'].startswith('AR_') or r.get('kind', 'sbc') != 'sbc': continue
    h, _ = A.load(r)
    if not h: continue
    for c in h.get('conv', []):
        if c.get('k') == 'found' and c.get('rich'): far.append((r['tag'], c['day'], c['v'], c['rich'], c['camp']))
V['@@RICH_FOUND@@'] = ' · '.join(f"{t} {d}날 {v} → {rr} 곁 {cp}" for t, d, v, rr, cp in far) or '없음'
json.dump(V, open(os.path.join(D, 'rep', 'vals.json'), 'w'), ensure_ascii=False, indent=1)
print(json.dumps({k: V[k] for k in list(V)[:12]}, ensure_ascii=False)); print(len(V))
# 같은 세계 확인(부자 곁만 = 끔 · 팔이 안 닿은 짝)
def same(ta, tb):
    import json as _j
    pa = os.path.join(D, 'runs', ta, f"{ta}-{ta.split('_')[1]}.json"); pb = os.path.join(D, 'runs', tb, f"{tb}-{tb.split('_')[1]}.json")
    try:
        ha = _j.load(open(pa + '.t1391.json')); hb = _j.load(open(pb + '.t1391.json')); ra = _j.load(open(pa)); rb = _j.load(open(pb))
    except Exception: return None
    n = min(len(ha['w']), len(hb['w']))
    return {'days': n, 'w': ha['w'][:n] == hb['w'][:n], 'vm': [x for x in ha['vm'] if x[0] < n // 30] == [x for x in hb['vm'] if x[0] < n // 30], 'run': all(ra.get(k) == rb.get(k) for k in ra if k != 'env')}
sr = same('R_1020', 'OFF_1020')
V['@@SAMER@@'] = (f"날 줄 {sr['days']}날 · 마을-달 줄 · 판 JSON(여덟 수 · 날 줄) 다 같음" if sr and sr['w'] and sr['vm'] and sr['run'] else f'다름 {sr}')
V['@@SAMER_TEXT@@'] = f"R_1020(`T1391_DEN_RICH=1` 만) 두 해가 끔과 바이트로 같다 — {V['@@SAMER@@']}. NPC 마을 해체가 0(T1143)이라 `formGang` 이 한 번도 안 불려 팔이 닿을 자리가 없다(끔 세 시드 판 장부 `t1039Depart` 0 · 관찰기 해체 단 자리 줄 0). 7 · 42 는 돌리지 않았다."
V['@@ALIAS_TEXT@@'] = ("all + 부자 곁 7 · 42 와 all 7 · 42 는 같은 세계다 — 두 판 다 새 단 · 해체 단이 0 이라 팔이 닿지 않았다. "
                       "AR_7 두 해 관찰기 줄과 첫 ALL_7 판(상자 메모리 한도에 날 ~620 에서 죽은 판)의 600날 줄이 같고 · AR_42 판(멈춘 날 600)과 ALL_42 두 해 판의 600날 줄이 같다 — "
                       "그래서 ALL_7 칸은 AR_7 판 · AR_42 칸은 ALL_42 판의 수다(다시 돌리지 않았다 · 두 판 다 남은 날에도 새 단 · 해체 0).")
json.dump(V, open(os.path.join(D, 'rep', 'vals.json'), 'w'), ensure_ascii=False, indent=1)
print(V['@@SAMER@@'])
# 되먹임 상관(all − 끔 같은 시드-달)
for kind in ('sbc', 'war', 'body'):
    try: C = json.load(open(os.path.join(D, 'out', f'corr_{kind}.json')))
    except Exception: continue
    c = C.get('ALL') or {}
    K2 = kind.upper()
    V[f'@@CORR_{K2}_CF@@'] = f(c.get('cargo~fd'), 2) if c.get('cargo~fd') is not None else '—'
    V[f'@@CORR_{K2}_FC@@'] = f(c.get('fd~convNext'), 2) if c.get('fd~convNext') is not None else '—'
    V[f'@@CORR_{K2}_UC@@'] = f(c.get('u25~convNext'), 2) if c.get('u25~convNext') is not None else '—'
    V[f'@@CORR_{K2}_LC@@'] = f(c.get('loot~cargo'), 2) if c.get('loot~cargo') is not None else '—(약탈 0)'
    V[f'@@CORR_{K2}_CARGO@@'] = f(c.get('sumCargo')) if c.get('sumCargo') is not None else '—'
    V[f'@@CORR_{K2}_N@@'] = f(c.get('n')) if c.get('n') is not None else '—'
json.dump(V, open(os.path.join(D, 'rep', 'vals.json'), 'w'), ensure_ascii=False, indent=1)
print('corr', V.get('@@CORR_SBC_FC@@'), V.get('@@CORR_SBC_CF@@'), V.get('@@CORR_SBC_CARGO@@'))
fo = ssum('OFF', 'foodImp'); fa = ssum('ALL', 'foodImp'); fn = ssum('NH', 'foodImp')
V['@@ALL_FOODIMP_X@@'] = f'{fa / fo:.2f}' if fo and fa else '—'
V['@@NH_FOODIMP_X@@'] = f'{fn / fo:.2f}' if fo and fn else '—'
json.dump(V, open(os.path.join(D, 'rep', 'vals.json'), 'w'), ensure_ascii=False, indent=1)
print('foodimp x', V['@@ALL_FOODIMP_X@@'], V['@@NH_FOODIMP_X@@'])
V['@@DIFF_ADD@@'] = '146'
V['@@RICH_FAR@@'] = '1020 의 새 단 하나 — 어촌8(≈ 78, 1800) 사람의 은거지가 ≈ 1,725칸 밖 임업3 곁(1793, 1986)'
json.dump(V, open(os.path.join(D, 'rep', 'vals.json'), 'w'), ensure_ascii=False, indent=1)
