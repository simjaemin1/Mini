#!/usr/bin/env python3
# T1419 판 표 — `python3 t1419_table.py`(이 폴더 runs/ 의 훅 칸 → t1419-table.md · .json)
# T1419 판 표 — 랩(끔 · 가 · 나 × 1020 · 7 · 42 × 800날) · 서버(1020 400날) → table.md · table.json
import json, os, sys, statistics as st
D0 = os.path.dirname(os.path.abspath(__file__)); O = os.environ.get('T1419_RUNS', D0 + '/runs'); R = O
ARMS = [('off', '끔'), ('harv', '(가)'), ('flow', '(나)')]
SEEDS = ['1020', '7', '42']
def lab(arm, seed):
    k = {'off': 'Loff', 'harv': 'Lharv', 'flow': 'Lflow'}[arm] + '-' + seed
    f = f'{O}/{k}.t1419.json'
    if not os.path.exists(f): return None
    d = json.load(open(f)); t = None
    tf = f'{O}/{k}.t17.json'
    if os.path.exists(tf): t = json.load(open(tf))
    return d, t
def srv(arm):
    k = {'off': 'Soff', 'harv': 'Sharv', 'flow': 'Sflow'}[arm] + '-1020'
    import glob
    fs = glob.glob(f'{R}/{k}*.t1419.json')
    for f in fs:
        try: return json.load(open(f))
        except Exception: pass
    return None
def mk(d, day):
    for m in d['marks']:
        if m['day'] == day: return m
    return None
def summ(d, last):
    ms = [m for m in d['marks'] if m['day'] <= last]
    if not ms: return None
    e = ms[-1]; m4 = mk(d, 400) or e
    return dict(day=e['day'], pop=e['pop'], fdDead=e['fdDead'], emig=e['emig'], empty=e['empty'], fdMed=e['fdMed'], fd10=e['fd10'], fd60=e['fd60'],
                lj0=round(st.mean(m['lj0'] for m in ms), 1), f30d=round(st.mean(m['f30d'] for m in ms), 1), f10d=round(st.mean(m['f10d'] for m in ms), 1), f60d=round(st.mean(m['f60d'] for m in ms), 1),
                hLo=round(st.mean(m['hLo'] for m in ms), 1), h40=round(st.mean(m['h40'] for m in ms), 1),
                wood0_400=m4['wood0'], wood0=e['wood0'], woodPx400=m4['woodPx'], woodPx=e['woodPx'], woodTr=round(st.mean(m['woodTr'] for m in ms)), woodTr400=round(st.mean(m['woodTr'] for m in ms if m['day'] <= 400)),
                built=round(sum(m['built'] for m in ms)), housing=e['housing'], mines=e['mines'], mines400=m4['mines'], minesSum=sum(x or 0 for x in e['mines']), minesSum400=sum(x or 0 for x in m4['mines']), bronze=e['bronze'], jobs=e['jobs'])
out = {'lab': {}, 'srv': {}, 'need': {}}
for a, _ in ARMS:
    for s in SEEDS:
        r = lab(a, s)
        if r: out['lab'][f'{a}-{s}'] = dict(summ(r[0], 800), t17=(r[1]['base']['pop'] if r[1] else None), series=r[0]['marks'], stat=r[0].get('stat'))
        if r and a == 'harv': out['need'][s] = r[0]['need']
    d = srv(a)
    if d: out['srv'][a] = dict(summ(d, 400), series=d['marks'], stat=d.get('stat'))
json.dump(out, open(D0 + '/t1419-table.json', 'w'), ensure_ascii=False)
L = []
L.append('| 시드 · 팔 | 사람 날 800(끔비) | 굶어 죽음 | 빈 마을 | 식량 날치 가운데 · 10 밑 · 60 위(마을 · 날 800) | 30 밑 마을-날 % | 나무꾼 0 마을-날 % | 곳간 나무 1 밑 마을 날 400 · 800 | 나무 값 가운데 날 400 · 800 | 100날 나무 교역(단 · 800날 고름) | 지은 주거 | 집 짓기 0.15 띠 마을-날 % | 광산 일곱 사람 날 400 → 800 | 청동 |')
L.append('|---|---|---:|---:|---|---:|---:|---|---|---:|---:|---:|---|---:|')
for s in SEEDS:
    base = out['lab'].get(f'off-{s}')
    for a, an in ARMS:
        x = out['lab'].get(f'{a}-{s}')
        if not x: continue
        r = f" (×{x['pop'] / base['pop']:.3f})" if base and a != 'off' else ''
        L.append(f"| {s} · {an} | {x['pop']:,}{r} | {x['fdDead']} | {x['empty']} | {x['fdMed']} · {x['fd10']} · {x['fd60']} | {x['f30d']} | {x['lj0']} | {x['wood0_400']} · {x['wood0']} | {x['woodPx400']} · {x['woodPx']} | {x['woodTr']:,} | {x['built']:,} | {x['hLo']} | {x['minesSum400']} → {x['minesSum']} | {x['bronze']} |")
L.append('')
L.append('| 서버 1020 · 팔 | 사람 날 400(끔비) | 굶어 죽음 | 빈 마을 | 떠난 사람 | 식량 날치 가운데 · 10 밑 · 60 위 | 30 밑 마을-날 % | 나무꾼 0 마을-날 % | 곳간 나무 1 밑 마을 날 400 | 나무 값 가운데 날 400 | 100날 나무 교역 | 지은 주거 | 광산 일곱 사람 날 400 | 청동 |')
L.append('|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---|---:|')
b = out['srv'].get('off')
for a, an in ARMS:
    x = out['srv'].get(a)
    if not x: continue
    r = f" (×{x['pop'] / b['pop']:.3f})" if b and a != 'off' else ''
    L.append(f"| {an} | {x['pop']:,}{r} | {x['fdDead']} | {x['empty']} | {x['emig']} | {x['fdMed']} · {x['fd10']} · {x['fd60']} | {x['f30d']} | {x['lj0']} | {x['wood0_400']} | {x['woodPx400']} | {x['woodTr']:,} | {x['built']:,} | {' · '.join(str(m) for m in x['mines'])} | {x['bronze']} |")
open(D0 + '/t1419-table.md', 'w').write('\n'.join(L) + '\n')
print('\n'.join(L))
