#!/usr/bin/env python3
# T1404 판 셈 — runs/<tag>/<tag>-<seed>.json.t1404.json(관찰기 줄)에서 보고 표의 수를 뽑는다(읽기만 · 판 결과 그대로)
#   python3 ana.py            → out/sum.json(판마다 셈) · 표 md(out/tab*.md)
import json, glob, os, statistics as stt
D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, 'out'); os.makedirs(OUT, exist_ok=True)

def load(tag):
    fs = sorted(glob.glob(os.path.join(D, 'runs', tag, '*.t1404.json')))
    if not fs: return None
    j = json.load(open(fs[0], encoding='utf-8'))
    rj = None
    for f in glob.glob(os.path.join(D, 'runs', tag, '*.json')):
        if f.endswith('.t1404.json'): continue
        try: rj = json.load(open(f, encoding='utf-8'))
        except Exception: pass
    j['_run'] = rj
    return j

def pairs_log(tag):   # 도적 층 날 줄 `도적 day N: … 길목쌍 K` — 길목 표(`S.pairs` — 상인이 위험 · 단을 보는 쌍)에 든 쌍 수
    import re
    fs = [f for f in glob.glob(os.path.join(D, 'runs', tag, '*.log'))]
    xs = []
    for f in fs:
        for line in open(f, encoding='utf-8', errors='replace'):
            m = re.search(r'도적 day (\d+): .*길목쌍 (\d+)', line)
            if m: xs.append((int(m.group(1)), int(m.group(2))))
    return xs

def summ(tag):
    j = load(tag)
    if not j: return None
    wc = j['wcols']; ix = {k: i for i, k in enumerate(wc)}; w = j['w']
    S = lambda k, a=0, b=10**9: sum((r[ix[k]] or 0) for r in w if a <= r[ix['day']] <= b)
    last = w[-1]; day = last[ix['day']]
    at = lambda d: next((r for r in w if r[ix['day']] == d), None)
    r365 = at(365)
    vc = j['vcols']; vix = {k: i for i, k in enumerate(vc)}; vm = j['vm']
    names = j['names']
    # 마을별 — 사람당 식량 평균(달 평균의 평균) · 굶어 죽음 합 · 끝 인구
    per = {}
    for row in vm:
        v = row[vix['v']]; o = per.setdefault(v, {'fe': 0.0, 'days': 0, 'fd': 0, 'Nend': None, 'm': -1, 'lootN': 0, 'raided': 0})
        o['fe'] += row[vix['feSum']] or 0; o['days'] += row[vix['days']] or 0; o['fd'] += row[vix['fd']] or 0; o['lootN'] += row[vix['lootN']] or 0; o['raided'] += row[vix['raided']] or 0
        if row[vix['m']] > o['m']: o['m'] = row[vix['m']]; o['Nend'] = row[vix['Nend']]
    poor = sorted(per.items(), key=lambda kv: (kv[1]['fe'] / max(1, kv[1]['days'])))[:5]
    poor5 = sum(o['fd'] for _, o in poor)
    empty = sum(1 for o in per.values() if (o['Nend'] or 0) == 0)
    gangs = j['gangs']
    st4 = (j.get('bandit') or {}).get('t1404') or {}
    b = j.get('bandit') or {}
    wk = j.get('walk') or {}
    dens = [r for r in (wk.get('rows') or []) if r['kind'] == 'den']
    gcamp = [r for r in (wk.get('rows') or []) if r['kind'] == 'gang']
    sent = S('sent'); raided = S('raided'); newCar = S('newCar'); esc = S('esc')
    out = {
        'tag': tag, 'day': day, 'pop365': r365[ix['pop']] if r365 else None, 'popEnd': last[ix['pop']], 'alive': last[ix['alive']], 'empty': empty,
        'fd': S('fd'), 'dead': S('dead'), 'poor5': poor5,
        'gPeak': max(r[ix['gangs']] for r in w), 'gMean': round(stt.mean(r[ix['gangs']] for r in w), 2), 'mPeak': max(r[ix['members']] for r in w), 'mEnd': last[ix['members']],
        'mMean': round(stt.mean(r[ix['members']] for r in w), 2),
        'gStarve': S('starve'), 'disband': S('disband'), 'denForm': S('denForm'), 'exo': S('exo'), 'sup': S('sup'), 'supDead': S('supDead'),
        'lootN': S('lootN'), 'lootFood': round(S('lootFood'), 1), 'lootAmt': round(S('lootAmt'), 1), 'killed': S('killed'), 'raided': raided, 'sent': sent,
        'raidShare': round(raided / sent, 4) if sent else None, 'foodImp': round(S('foodImp'), 1), 'newCar': newCar, 'escPer': round(esc / newCar, 3) if newCar else None,
        'escY1': None, 'escY2': None, 'warEnd': last[ix['war']], 'palEnd': last[ix['pal']], 'pal365': r365[ix['pal']] if r365 else None, 'riskEnd': last[ix['risk']],
        'fgFood': round(S('fgFood'), 1), 'split': S('split'), 'home': S('home'), 'meet': S('meet'),
        't1404': st4, 'gangsN': len(gangs), 'denWalk': [r.get('walk') for r in dens], 'denStraight': [r.get('straight') for r in dens], 'campWalk': [r.get('walk') for r in gcamp],
        'usedPairs': wk.get('usedLastYear'),
        'gangLife': round(stt.mean([(g['last'] - g['first'] + 1) for g in gangs]), 1) if gangs else None,
        'knobs': (j.get('env') or {}).get('KNOBS'),
    }
    if 'heapMB' in ix:   # V8 힙(관찰기 날 끝 · 힙 탐침을 단 뒤에 돈 판만)
        hs = [(r[ix['day']], r[ix['heapMB']]) for r in w if r[ix['heapMB']] is not None]
        out['heapPeak'] = max((h for _, h in hs), default=None); out['heap365'] = next((h for d, h in hs if d == 365), None); out['heapEnd'] = hs[-1][1] if hs else None
        out['heap2000'] = next((d for d, h in hs if h >= 2000), None); out['heap1500'] = next((d for d, h in hs if h >= 1500), None)
    pl = pairs_log(tag)
    out['pairsMean'] = round(stt.mean(x for _, x in pl)) if pl else None
    out['pairsSeries'] = [[d, x] for d, x in pl if d % 30 == 0]
    t78 = (b.get('t1078') or {}).get('dead') or {}; t79 = b.get('t1079') or {}; t04 = b.get('t1104') or {}
    out['fellOther'] = t78.get('other', 0); out['fellStarve'] = t78.get('starve', 0); out['joinN'] = t79.get('joinN', 0); out['bExo'] = b.get('exo', 0)
    out['denForm'] = b.get('denForm'); out['loot1104Food'] = round(t04.get('food', 0) or 0, 1); out['n0Sum'] = sum((g.get('n0') or 0) for g in gangs)
    # 첫 해(1 ~ 365날) — 한 시드 걸음 표(걸음 판 둘은 365날만 돌았다)
    wy = [r for r in w if r[ix['day']] <= 365]
    e365 = sum(1 for row in vm if row[vix['m']] == 11 and (row[vix['Nend']] or 0) == 0)
    out['y1'] = {'fd': S('fd', 1, 365), 'gStarve': S('starve', 1, 365), 'lootN': S('lootN', 1, 365), 'killed': S('killed', 1, 365), 'raided': S('raided', 1, 365), 'sent': S('sent', 1, 365),
                 'foodImp': round(S('foodImp', 1, 365), 1), 'fgFood': round(S('fgFood', 1, 365), 1), 'home': S('home', 1, 365), 'split': S('split', 1, 365),
                 'mPeak': max((r[ix['members']] for r in wy), default=None), 'gMean': round(stt.mean(r[ix['gangs']] for r in wy), 2) if wy else None,
                 'pop365': r365[ix['pop']] if r365 else None, 'empty360': e365, 'lastDay': wy[-1][ix['day']] if wy else None}
    out['y1']['pairsMean'] = round(stt.mean(x for d, x in pl if d <= 365)) if [1 for d, _ in pl if d <= 365] else None
    # 호위 — 해마다 캐러밴 하나당(그해 새 캐러밴의 호위 합 ÷ 그해 새 캐러밴)
    for y, (a, bb) in (('escY1', (1, 365)), ('escY2', (366, 730))):
        n = S('newCar', a, bb); e = S('esc', a, bb); out[y] = round(e / n, 3) if n else None
    return out

PLAN = {}
for ln in ('main.json', 'war.json', 'nr.json', 'rest.json', 'rest2.json', 'rest3.json'):   # 뒤 목록이 앞을 덮는다(걸음 둘은 rest3 에서 365날)
    try:
        for r in json.load(open(os.path.join(D, ln), encoding='utf-8')): PLAN[r['tag']] = r['days']
    except Exception: pass
TAGS = sorted({os.path.basename(p) for p in glob.glob(os.path.join(D, 'runs', '*')) if not os.path.basename(p).startswith(('DIAG', 'SMK'))})
R = {t: summ(t) for t in TAGS}
R = {k: v for k, v in R.items() if v}
for k, v in R.items(): v['plan'] = PLAN.get(k); v['partial'] = bool(PLAN.get(k) and v['day'] < PLAN[k])
json.dump(R, open(os.path.join(OUT, 'sum.json'), 'w'), ensure_ascii=False, indent=1)
for t, o in R.items():
    print(t, {k: o[k] for k in ('day', 'popEnd', 'empty', 'fd', 'gPeak', 'mPeak', 'gStarve', 'lootN', 'lootFood', 'killed', 'raidShare', 'foodImp', 'escPer', 'poor5', 'split', 'home', 'fgFood', 'denWalk')})
