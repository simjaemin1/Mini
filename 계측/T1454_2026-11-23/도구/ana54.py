#!/usr/bin/env python3
# T1454 판 읽기 — ① 400날 세 시드: 끔(OFF) · 낡음 켬(ON) · 켬 + 느려짐(SLOW) — 여덟 수 · 날 줄 · 계측기 날 줄이 같은가 · 인구 끔비
#                 ② 두 해(730날) 세 시드: 켬 + 느려짐(HDON) · 같은 + 추상 집 노후 끔(HD0 — 덧붙임 셋 ①) — 인구 · 나무꾼 · 집 · 지은 집 · 통나무 · 빈 마을 · 지붕 · 뼈대
import json, os
D = os.path.dirname(os.path.abspath(__file__))
def load(tag, seed):
    p = os.path.join(D, 'runs', tag, f'{tag}-{seed}.json'); q = os.path.join(D, 'runs', tag, 'probe.json')
    J = json.load(open(p)) if os.path.exists(p) else None
    P = json.load(open(q)) if os.path.exists(q) else None
    return J, P
def strip(o):
    o = dict(o)
    for k in ['tag', 'env', 'wallS', 'dir']: o.pop(k, None)
    return json.dumps(o, sort_keys=True)
out = {'same': [], 'arm': []}
print('| 시드 | 끔 인구(400날) | 켬 인구 | 켬 + 느려짐 인구 | 느려짐 ÷ 켬 — 판 JSON · 날 줄 · 계측기 | 켬 ÷ 끔 | 빈 마을(끔 · 켬 · 느려짐) | 굶어 죽음(끔 · 켬 · 느려짐) |')
print('|---|---|---|---|---|---|---|---|')
for s in (1020, 7, 42):
    O, PO = load(f'OFF_{s}', s); N, PN = load(f'ON_{s}', s); W, PW = load(f'SLOW_{s}', s)
    if not (N and W): print(f'| {s} | 판 없음 |'); continue
    same = strip(N) == strip(W) and (PN or {}).get('days') == (PW or {}).get('days')
    pop = lambda J: J['eight']['pop'] if J else None
    ratio = round(pop(N) / pop(O), 3) if O else None
    out['same'].append({'seed': s, 'same': same, 'pop': [pop(O), pop(N), pop(W)], 'ratio': ratio})
    print(f"| {s} | {pop(O)} | {pop(N)} | {pop(W)} | {'비트 같음' if same else '다름'} | {ratio} | {(O or {}).get('empty')} · {N.get('empty')} · {W.get('empty')} | {(O or {}).get('deadTot')} · {N.get('deadTot')} · {W.get('deadTot')} |")
print()
print('| 시드 · 730날 | 인구(노후 켬 → 끔 · 끔비) | 굶어 죽음 누계 | 빈 마을 | 나무꾼 | 집 칸(econ) | 지은 집(채) | 통나무 재고 | 추상 노후 — 닳은 집 칸 · 다시 채울 통나무(켬) | 물리 손질 통나무(켬 → 끔) · 뼈대 손질(번) | 잉여 없어 못 고친 부위-날(켬) | 지붕 · 뼈대 가운데(켬 → 끔) |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|')
for s in (1020, 7, 42):
    A, PA = load(f'HDON_{s}', s); B, PB = load(f'HD0_{s}', s)
    if not (A and B and PA and PB): print(f'| {s} | 판 없음 |'); continue
    da = PA['days'][-1]; db = PB['days'][-1]; a0 = PA['days'][0]; b0 = PB['days'][0]
    va = da.get('v') or {}; vb = db.get('v') or {}
    wear = sum(r['housing'] * 0.0015 for r in PA['days'])
    r = {'seed': s, 'pop': [A['eight']['pop'], B['eight']['pop']], 'lj': [da.get('lj'), db.get('lj')], 'houses': [da.get('houses'), db.get('houses')],
         'built': [da.get('houses', 0) - a0.get('houses', 0), db.get('houses', 0) - b0.get('houses', 0)], 'housing': [da.get('housing'), db.get('housing')],
         'wood': [da.get('wood'), db.get('wood')], 'empty': [A.get('empty'), B.get('empty')], 'roof': [va.get('roofMed'), vb.get('roofMed')], 'frame': [va.get('frameMed'), vb.get('frameMed')],
         'frameRep': [va.get('frameRep'), vb.get('frameRep')], 'dead': [A.get('deadTot'), B.get('deadTot')], 'repWood': [va.get('wood'), vb.get('wood')], 'noWood': [va.get('noWood'), vb.get('noWood')],
         'wear': round(wear, 1), 'wearWood': round(wear * 1.5, 1),
         'emptyNames': [[A['names'][i] for i in range(len(A['names'])) if A['rows'][-1][1][i] == 0], [B['names'][i] for i in range(len(B['names'])) if B['rows'][-1][1][i] == 0]]}
    out['arm'].append(r)
    f = lambda k: f"{r[k][0]} → {r[k][1]}"
    en = r['emptyNames'][1]
    print(f"| {s} | {f('pop')}({round(r['pop'][1] / r['pop'][0], 3) if r['pop'][0] else '-'}) | {f('dead')} | {f('empty')}{'(' + ' · '.join(en) + ')' if en else ''} | {f('lj')} | {round(r['housing'][0])} → {round(r['housing'][1])} | {f('built')} | {round(r['wood'][0])} → {round(r['wood'][1])} | {round(r['wear'])} · {round(r['wearWood'])} | {r['repWood'][0]} → {r['repWood'][1]} · {r['frameRep'][0]} → {r['frameRep'][1]} | {r['noWood'][0]} | {r['roof'][0]} · {r['frame'][0]} → {r['roof'][1]} · {r['frame'][1]} |")
json.dump(out, open(os.path.join(D, 'out54.json'), 'w'), ensure_ascii=False, indent=1)
