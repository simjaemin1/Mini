#!/usr/bin/env python3
# T1438 판 읽기 — 계측기(probe.json) · 판 JSON · 서버 기준선 → 표(마크다운) · out/nums.json
import json, os
D = '/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1438'
R = '/home/claude/mini'
B = json.load(open(R + '/계측/서버기준선_2026-11-18.json'))['byseed']
def probe(t):
    p = os.path.join(D, 'runs', t, 'probe.json')
    return {d['d']: d for d in json.load(open(p))['days']} if os.path.exists(p) else None
def runj(t, s):
    p = os.path.join(D, 'runs', t, f'{t}-{s}.json')
    return json.load(open(p)) if os.path.exists(p) else None
HOUSE_FIBER = 8 * 4 + 6   # 이엉 8(풀 4씩) + 결속 풀 6 — hut-stages 공정 표
HOUSE_WOOD = 1.5          # econ 집 자재 단가(칸 하나) — economy-sim HOUSE_WOOD(T400 끔)
out, nums = [], {}
def row(tag, seed, days, off=None):
    P = probe(tag); J = runj(tag, seed)
    if not P: return None
    last = max(P); d = min(days, last); a = P[d]; v = a['v'] or {}
    a0 = P[0] if 0 in P else P[min(P)]
    built = a['houses'] - a0['houses']
    fib = v.get('fiber', 0); wd = v.get('wood', 0); st = v.get('stone', 0)
    crew = sum(min(2, 1) for _ in range(0))  # 자리
    popd = sum(P[k]['pop'] for k in P if k <= d)   # 사람-날
    capd = 2 * a['vils'] * d                        # 크루 손(마을마다 하루 2 인일)
    r = {'tag': tag, 'seed': seed, 'day': d, 'pop': a['pop'], 'houses': a['houses'], 'built': built, 'housing': a['housing'], 'lj': a['lj'], 'wood': a['wood'],
         'roofMed': v.get('roofMed'), 'roofMin': v.get('roofMin'), 'frameMed': v.get('frameMed'), 'frameMin': v.get('frameMin'), 'granMed': v.get('granMed'), 'granMin': v.get('granMin'),
         'repairs': v.get('repairs'), 'roofRep': v.get('roofRep'), 'frameRep': v.get('frameRep'), 'granRep': v.get('granRep'), 'fiber': fib, 'woodR': round(wd, 1), 'stoneR': round(st, 1),
         'labor': round(v.get('labor', 0), 1), 'ded': v.get('ded'), 'noWood': v.get('noWood'), 'collapse': (v.get('collapse', 0) or 0) + (v.get('pCollapse', 0) or 0), 'writes': v.get('writes'),
         'fiberPct': round(100 * fib / (built * HOUSE_FIBER), 1) if built > 0 else None, 'fiberDay': round(fib / d, 1) if d else None,
         'woodPct': round(100 * wd / ((a['housing'] - a0['housing']) * HOUSE_WOOD), 1) if a['housing'] > a0['housing'] else None, 'woodDay': round(wd / d, 2) if d else None,
         'laborPctCrew': round(100 * v.get('labor', 0) / capd, 2) if capd else None, 'laborPctPop': round(100 * v.get('labor', 0) / popd, 3) if popd else None,
         'z': a.get('z'), 'final': (J or {}).get('eight', {}).get('pop'), 'empty': (J or {}).get('empty'), 'firstEmpty': (J or {}).get('firstEmpty'), 'dead': (J or {}).get('deadTot')}
    if off:
        O = probe(off)
        if O and d in O: r['popOff'] = O[d]['pop']; r['ratio'] = round(a['pop'] / O[d]['pop'], 4); r['ljOff'] = O[d]['lj']; r['housesOff'] = O[d]['houses']; r['woodOff'] = O[d]['wood']; r['housingOff'] = O[d]['housing']
    elif str(seed) in B and days == 400 and J:
        r['popOff'] = B[str(seed)]['eight']['pop']; r['ratio'] = round(J['eight']['pop'] / r['popOff'], 4); r['popEnd'] = J['eight']['pop']
    return r
runs = [('ON_MID_1020', 1020, 400, 'OFF_1020'), ('ON_MID_7', 7, 400, None), ('ON_MID_42', 42, 400, None), ('ON_MID_1020', 1020, 730, 'OFF_1020'),
        ('ON_LO_1020', 1020, 400, 'OFF_1020'), ('ON_HI_1020', 1020, 400, 'OFF_1020')]
res = [x for x in (row(*r) for r in runs) if x]
nums['rows'] = res
json.dump(nums, open(D + '/out/nums.json', 'w'), ensure_ascii=False, indent=1)
for r in res: print(json.dumps({k: r.get(k) for k in ('tag', 'day', 'pop', 'popOff', 'ratio', 'houses', 'built', 'lj', 'ljOff', 'roofMed', 'roofMin', 'frameMed', 'frameMin', 'granMed', 'fiber', 'fiberPct', 'fiberDay', 'woodR', 'woodPct', 'woodDay', 'labor', 'laborPctCrew', 'laborPctPop', 'ded', 'collapse', 'empty', 'firstEmpty')}, ensure_ascii=False))
