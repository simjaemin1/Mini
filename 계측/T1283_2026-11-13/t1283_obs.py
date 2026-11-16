#!/usr/bin/env python3
# T1283 관찰 표 — 계측 훅 마을-날 줄(`sbc-<시드>.json.t1283.json`)만 읽는다 · 세계 0
#   ① 나무꾼 흐름(25날 창 · 51마을 합): 나감(다른 일로 — 간 곳별) · 들어옴 · 죽음/떠남 · 새로 난 나무꾼
#   ② 나무꾼이 나간 마을-날의 문: 기근 문(곳간 식량 < 30일치 — 피커가 식량 일만 고른다) · 깊은 기근(< 10일치 — 날마다 둘) ·
#      그날 값 가중 통나무 · 식량(0.05 ~ 200 자름) · 전환 문 기회비용(나무꾼 < 농부면 나무꾼이 먼저 뽑힌다)
#   ③ 나무꾼이 다시 못 선 까닭(나무꾼 0 · 땔감 충당 < 1 인 마을-날): 기근 문 · 주거 문(집 다 참 ∧ 통나무 < 2 × 사람) · 한계 가치(농부 > 나무꾼)
# 실행: python3 t1283_obs.py <훅 파일> [<훅 파일> …]  → 표준 출력에 마크다운
import json, sys, collections
FOOD = {'farmer', 'fisher', 'hunter', 'forager'}
def load(p):
    d = json.load(open(p)); c = {k: i for i, k in enumerate(d['cols'])}
    return d, c
def win(day, w=25): return ((day - 1) // w + 1) * w
def flows(d, c, w=25):
    J = d['jobs']; agg = collections.OrderedDict()
    for r in d['rows']:
        k = win(r[c['day']], w); a = agg.setdefault(k, collections.Counter())
        a['out'] += r[c['ljOut']]; a['in'] += r[c['ljIn']]; a['gone'] += r[c['ljGone']]; a['born'] += r[c['ljBorn']]
        if r[c['outTo']]:
            for t in r[c['outTo']].split(','):
                j, n = t.split(':'); a['to:' + J[int(j)]] += int(n)
        if r[c['ljOut']]:
            fd = r[c['foodDays']]
            if fd is not None and fd < 10: a['out@hard'] += r[c['ljOut']]
            elif fd is not None and fd < 30: a['out@famine'] += r[c['ljOut']]
            else: a['out@ok'] += r[c['ljOut']]
            if r[c['ocLJ']] is not None and r[c['ocFarmer']] is not None and r[c['ocLJ']] < r[c['ocFarmer']]: a['out@ljCheaper'] += r[c['ljOut']]
            a['wW_sum'] += r[c['wWood']] * r[c['ljOut']]; a['wF_sum'] += r[c['wFood']] * r[c['ljOut']]
    return agg
def lj_last(d, c):
    by = collections.defaultdict(int)
    last = max(r[c['day']] for r in d['rows'])
    return sum(r[c['lj']] for r in d['rows'] if r[c['day']] == last)
def blocked(d, c, lo, hi):
    # 나무꾼 0 · 땔감 모자란 마을-날에 무엇이 나무꾼을 막았나
    n = collections.Counter()
    for r in d['rows']:
        day = r[c['day']]
        if not (lo < day <= hi): continue
        if r[c['N']] <= 0: continue
        fc = r[c['fuelCov']]
        if r[c['lj']] > 0 or fc is None or fc >= 1: continue
        n['villageDays'] += 1
        fd = r[c['foodDays']]
        if fd is not None and fd < 30: n['famineGate'] += 1
        else:
            housePress = r[c['housing']] is not None and r[c['N']] >= (min(x for x in [r[c['housing']], r[c['beds']]] if x is not None)) * 0.95 and r[c['wood']] < 2 * r[c['N']]
            if housePress: n['houseGateOpen'] += 1
            elif r[c['gainFarmer']] is not None and r[c['gainLJ']] is not None and r[c['gainFarmer']] > r[c['gainLJ']]: n['marginalFarmerWins'] += 1
            else: n['other'] += 1
        if r[c['capLJ']] is not None and r[c['capLJ']] <= 0: n['noSlot'] += 1
        if r[c['postNeed']] > 0: n['postShort'] += 1
    return n
if __name__ == '__main__':
    for p in sys.argv[1:]:
        d, c = load(p)
        print(f"\n### {p.split('/')[-1]} · env {d['env']} · 끝 날 나무꾼 {lj_last(d, c)}\n")
        A = flows(d, c)
        print('| 날 창 | 나감 | ㄴ 깊은 기근 · 기근 · 기근 밖 | ㄴ 나무꾼이 더 쌌다(기회비용 < 농부) | 나감 때 값 가중 통나무 · 식량(평균) | 간 곳(많은 차례) | 들어옴 | 죽음/떠남 | 새로 난 나무꾼 |')
        print('|---|---:|---|---:|---|---|---:|---:|---:|')
        for k, a in A.items():
            to = sorted([(n, j[3:]) for j, n in a.items() if j.startswith('to:')], reverse=True)[:3]
            o = a['out'] or 0
            ww = (a['wW_sum'] / o) if o else 0; wf = (a['wF_sum'] / o) if o else 0
            print(f"| {k - 24} ~ {k} | {o} | {a['out@hard']} · {a['out@famine']} · {a['out@ok']} | {a['out@ljCheaper']} | {ww:.1f} · {wf:.1f} | {' · '.join(f'{j} {n}' for n, j in to)} | {a['in']} | {a['gone']} | {a['born']} |")
        for lo, hi in [(100, 200), (200, 300), (300, 400)]:
            b = blocked(d, c, lo, hi)
            print(f"\n{lo} ~ {hi}날 · 나무꾼 0 ∧ 땔감 충당 < 1 마을-날 {b['villageDays']}: 기근 문 {b['famineGate']} · 주거 문 열림(그래도 0) {b['houseGateOpen']} · 한계 가치 농부 승 {b['marginalFarmerWins']} · 그 밖 {b['other']} · 자리 0 {b['noSlot']} · 말뚝 모자람 > 0 {b['postShort']}")
