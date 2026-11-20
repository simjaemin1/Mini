#!/usr/bin/env python3
# T1376 고침 앞(LB · land1084 나무) ↔ 고침 뒤(L · 합친 나무) 같은 씨 300날 견줌 표
#   python3 cmp_lb.py <runs> 1020 7 42
import json, os, sys
D = sys.argv[1]; SEEDS = sys.argv[2:]
def an(t):
    p = os.path.join(D, f'an_{t}.json')
    return json.load(open(p)) if os.path.exists(p) else None
def lin(t):
    out = []
    for z in ('hanbando', 'nippon'):
        f = os.path.join(D, f'rows_{t}_{z}.jsonl')
        R = [json.loads(l) for l in open(f) if l.strip()] if os.path.exists(f) else []
        out.append(f"{sum(1 for r in R if r.get('xzLinger', 0) > 0)}/{len(R)}")
    return ' · '.join(out)
f = lambda n: f'{n:,}'
print('| 씨 | 넘은 캐러밴(앞 → 뒤) | 팔기 성사 | 곳간 입금 | 몸 넘김 | 머문 이웃 존 상인 보인 날(한 · 닛) | 인구 한 · 닛 | 굶어 죽음 한 · 닛 | 교역 행 한 · 닛 | 합 보존(앞 · 뒤) |')
print('|---|---|---|---|---|---|---|---|---|---|')
for s in SEEDS:
    B, A = an(f'LB{s}'), an(f'L{s}')
    if not B or not A: print(f'| {s} | (없음) |'); continue
    cb, ca = B['crossed'], A['crossed']; fb, fa = B['final'], A['final']
    print(f"| {s} | {f(cb['arriveOut'])} → {f(ca['arriveOut'])} | {f(cb['soldOk'])} → {f(ca['soldOk'])} | {f(cb['deposited'])} → {f(ca['deposited'])} | {f(B['bodies']['handoffs'])} → {f(A['bodies']['handoffs'])} | "
          f"{lin(f'LB{s}')} → {lin(f'L{s}')} | {f(fb['hanbando']['pop'])} · {f(fb['nippon']['pop'])} → {f(fa['hanbando']['pop'])} · {f(fa['nippon']['pop'])} | "
          f"{fb['hanbando']['fdDeaths']} · {fb['nippon']['fdDeaths']} → {fa['hanbando']['fdDeaths']} · {fa['nippon']['fdDeaths']} | {f(fb['hanbando']['trades'])} · {f(fb['nippon']['trades'])} → {f(fa['hanbando']['trades'])} · {f(fa['nippon']['trades'])} | "
          f"{'○' if B['bodies']['both']['n'] == 0 and B['bodies']['vanished']['n'] == 0 and B['crossed']['lost'] == 0 else '✗'} · {'○' if A['bodies']['both']['n'] == 0 and A['bodies']['vanished']['n'] == 0 and A['crossed']['lost'] == 0 else '✗'} |")
