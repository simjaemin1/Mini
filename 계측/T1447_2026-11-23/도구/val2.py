#!/usr/bin/env python3
# T1447 값 환산 표(덧붙임 넷 ②) — PRICE2 판(서버 자 1020 · 날 100 · 200 · 300 · 400 · 마을 51)의 마을별 값 두 축
#   시세(`computeVillagePrices` · 칸이 없는 재화는 기준가 → 특산 표 baseValue) · 그림자 값(`shadowPricesOf` — 거래소)
#   → 원한 1 의 값 = VD × 그 마을 식량 값(VD = 10 · 30 · 100날) · 해코지 하나의 원한 · 문턱(0.45)까지 몇 번(가운데 마을)
import json, statistics as stt
S = '/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1447'
j = json.load(open(S + '/runs/PRICE2/probe.json'))
TH = 0.45
SPEC = {'wheat': 1, 'rice': 1.2, 'barley': 0.8}
HARMS = [
    ('나무 한 그루(r8 — 통나무 5)', {'wood': 5}),
    ('바위 한 개(돌 1)', {'stone': 1}),
    ('밀 한 칸(7단위)', {'wheat': 7}),
    ('열매 한 번(열매 2)', {'fruit': 2}),
    ('울타리 하나(판자 1 = 통나무 0.5)', {'wood': 0.5}),
    ('벽 하나(판자 2 = 통나무 1)', {'wood': 1}),
    ('상자 하나(판자 4 = 통나무 2)', {'wood': 2}),
]
def price(r, k, axis):
    if axis == 'q':
        v = r['q'].get(k, 0)
        if not v > 0: v = r['b'].get(k, 0)
        if not v > 0: v = SPEC.get(k, 0)
        return v
    return r['p'].get(k, 0)
out = []
for snap in j['prices']:
    rows = [r for r in snap['rows'] if r['pop'] > 0]
    day = {'d': snap['d'], 'n': len(rows), 'axes': {}}
    for axis in ('q', 'p'):
        A = {'price': {}, 'harm': []}
        for k in ('food', 'wood', 'stone', 'wheat', 'fruit'):
            v = sorted(price(r, k, axis) for r in rows)
            A['price'][k] = [round(v[int(.1 * (len(v) - 1))], 3), round(stt.median(v), 3), round(v[int(.9 * (len(v) - 1))], 3)]
        for nm, items in HARMS:
            line = {'name': nm}
            vals = sorted(sum(price(r, k, axis) * n for k, n in items.items()) for r in rows)
            line['val'] = round(stt.median(vals), 3)
            for VD in (10, 30, 100):
                gs = sorted((sum(price(r, k, axis) * n for k, n in items.items()) / (VD * price(r, 'food', axis))) if price(r, 'food', axis) > 0 else 0 for r in rows)
                g = stt.median(gs); g90 = gs[int(.9 * (len(gs) - 1))]
                line[f'g{VD}'] = round(g, 4); line[f'n{VD}'] = (int(-(-TH // g)) if g > 0 else None); line[f'g{VD}_90'] = round(g90, 3)
            A['harm'].append(line)
        day['axes'][axis] = A
    out.append(day)
json.dump(out, open(S + '/out_val.json', 'w'), ensure_ascii=False, indent=1)
AX = {'q': '시세(computeVillagePrices · 없으면 기준가)', 'p': '그림자 값(shadowPricesOf — 거래소)'}
for day in out:
    if day['d'] not in (200, 400): continue
    for axis in ('q', 'p'):
        A = day['axes'][axis]
        print(f"\n날 {day['d']} · {AX[axis]} — 마을 {day['n']} · 값(10 · 50 · 90 %) 식량 {A['price']['food']} · 통나무 {A['price']['wood']} · 돌 {A['price']['stone']} · 밀 {A['price']['wheat']} · 열매 {A['price']['fruit']}")
        print('| 해코지 | 값(가운데) | 원한 1 = 10날 식량 → 원한 · 문턱까지 | 30날 → | 100날(PM 시작값) → |')
        print('|---|---|---|---|---|')
        for h in A['harm']:
            print(f"| {h['name']} | {h['val']} | {h['g10']} · {h['n10']}번 | {h['g30']} · {h['n30']}번 | {h['g100']} · {h['n100']}번 (90 % 마을 {h['g100_90']}) |")
