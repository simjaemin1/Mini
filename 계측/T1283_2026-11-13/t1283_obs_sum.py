#!/usr/bin/env python3
# T1283 관찰 묶음 표 — 팔마다 3시드 훅(`sbc-<시드>.json.t1283.json`)을 더해 한 표로(읽기만 · 세계 0)
#   표 1 나무꾼 흐름(철마다 · 3시드 합): 나감(깊은 기근 · 기근 · 밖) · 그중 나무꾼이 농부보다 쌌던(기회비용) 몫 · 나감 때 값 가중 통나무 · 식량(가운데) · 들어옴 · 죽음/떠남 · 새로 난 나무꾼
#   표 2 피커 판단(전환 날 · 철마다): 기근 문 안 판단 몫 · 그중 식량 일 · 나무꾼을 고른 판단(기근 밖 · 안)
#   표 3 나무꾼 0 ∧ 땔감 모자란 마을-날 — 무엇이 막았나(기근 문 · 주거 문 조건 참 · 한계 가치 농부 승 · 그 밖) · 말뚝 모자람 > 0 몫
# 실행: python3 t1283_obs_sum.py 팔=폴더1,폴더2,폴더3 [팔=…] — 폴더 안 sbc-<시드>.json.t1283.json 을 모두 읽는다
import json, sys, os, glob, collections, statistics as st
FOOD = {'farmer', 'fisher', 'hunter', 'forager'}
PH = [(0, 75), (75, 125), (125, 200), (200, 300), (300, 400)]
def ph(day):
    for lo, hi in PH:
        if lo < day <= hi: return f'{lo + 1} ~ {hi}'
    return None
def files(dirs):
    out = []
    for d in dirs: out += sorted(glob.glob(os.path.join(d, 'sbc-*.json.t1283.json')))
    return out
def arm(name, dirs):
    F = collections.OrderedDict((f'{lo + 1} ~ {hi}', collections.Counter()) for lo, hi in PH)
    W = collections.defaultdict(list); P = collections.OrderedDict((k, collections.Counter()) for k in F); B = collections.OrderedDict((k, collections.Counter()) for k in F)
    seeds = []
    for p in files(dirs):
        d = json.load(open(p)); c = {k: i for i, k in enumerate(d['cols'])}; J = d['jobs']; seeds.append(os.path.basename(p).split('.')[0][4:])
        for r in d['rows']:
            k = ph(r[c['day']])
            if k is None: continue
            a = F[k]; fd = r[c['foodDays']]; o = r[c['ljOut']]
            a['out'] += o; a['in'] += r[c['ljIn']]; a['gone'] += r[c['ljGone']]; a['born'] += r[c['ljBorn']]
            if o:
                if fd is not None and fd < 10: a['hard'] += o
                elif fd is not None and fd < 30: a['fam'] += o
                else: a['ok'] += o
                if r[c['ocLJ']] is not None and r[c['ocFarmer']] is not None and r[c['ocLJ']] < r[c['ocFarmer']]: a['cheap'] += o
                W[(k, 'w')] += [r[c['wWood']]] * o; W[(k, 'f')] += [r[c['wFood']]] * o
            nd = r[c['need']]
            if nd is not None:
                q = P[k]; j = J[nd] if nd >= 0 else None; fam = fd is not None and fd < 30
                q['n'] += 1
                if fam: q['fam'] += 1
                if fam and j in FOOD: q['famFood'] += 1
                if j == 'lumberjack': q['lj_fam' if fam else 'lj_ok'] += 1
            if r[c['N']] > 0 and r[c['lj']] == 0 and r[c['fuelCov']] is not None and r[c['fuelCov']] < 1:
                b = B[k]; b['vd'] += 1
                if fd is not None and fd < 30: b['famine'] += 1
                else:
                    hs = [x for x in [r[c['housing']], r[c['beds']]] if x is not None]
                    if hs and r[c['N']] >= min(hs) * 0.95 and r[c['wood']] < 2 * r[c['N']]: b['house'] += 1
                    elif r[c['gainFarmer']] is not None and r[c['gainLJ']] is not None and r[c['gainFarmer']] > r[c['gainLJ']]: b['marg'] += 1
                    else: b['other'] += 1
                if r[c['postNeed']] > 0: b['post'] += 1
    print(f"\n#### {name} — 시드 {' · '.join(seeds)} 합\n")
    print('| 날 | 나무꾼 나감 | ㄴ 깊은 기근(< 10일치) · 기근(< 30) · 밖 | ㄴ 나무꾼이 농부보다 쌌다 | 나감 때 값 가중 통나무 · 식량(가운데) | 들어옴 | 죽음/떠남 | 새로 난 나무꾼 |')
    print('|---|---:|---|---:|---|---:|---:|---:|')
    for k, a in F.items():
        ww = st.median(W[(k, 'w')]) if W[(k, 'w')] else None; wf = st.median(W[(k, 'f')]) if W[(k, 'f')] else None
        print(f"| {k} | {a['out']} | {a['hard']} · {a['fam']} · {a['ok']} | {a['cheap']} | {'—' if ww is None else f'{ww:.1f}'} · {'—' if wf is None else f'{wf:.1f}'} | {a['in']} | {a['gone']} | {a['born']} |")
    print('\n| 날 | 피커 판단(전환 날) | ㄴ 기근 문 안 | ㄴ 그중 식량 일 | 나무꾼을 고름(기근 밖 · 안) |')
    print('|---|---:|---:|---:|---|')
    for k, q in P.items():
        n = q['n'] or 1
        print(f"| {k} | {q['n']} | {q['fam']} ({100 * q['fam'] / n:.0f}%) | {q['famFood']} | {q['lj_ok']} · {q['lj_fam']} |")
    print('\n| 날 | 나무꾼 0 ∧ 땔감 충당 < 1 마을-날 | 기근 문 | 주거 문 조건 참(그래도 0) | 한계 가치 농부 승 | 그 밖 | 말뚝 모자람 > 0 |')
    print('|---|---:|---|---:|---:|---:|---:|')
    for k, b in B.items():
        n = b['vd'] or 1
        print(f"| {k} | {b['vd']} | {b['famine']} ({100 * b['famine'] / n:.0f}%) | {b['house']} | {b['marg']} | {b['other']} | {b['post']} |")
if __name__ == '__main__':
    for a in sys.argv[1:]:
        nm, ds = a.split('=', 1); arm(nm, ds.split(','))
