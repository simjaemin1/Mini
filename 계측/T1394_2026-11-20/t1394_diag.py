#!/usr/bin/env python3
# T1394 진단 — t1394 훅 마을-날 줄(`<이름>-<시드>.t1394.json`)에서 ⓐ 빈 마을의 죽는 차례 ⓑ 곳간 돌 0 ∧ 돌밭 있는 마을-날의 피커 차례
#   ⓒ 석공 목표가 읽는 마모 · 석공 한 사람이 실제로 낸 석기 ⓓ 겨울 땅 돌 배수(0.95)가 돌밭 바닥 마을을 STONE_NET 문 밖으로 미는 경계.
#   쓰는 법: python3 t1394_diag.py <t1394.json> [--maxday 729] [--json out.json]
#   피커 차례(econ `pickDeficitJob_rational` 글 그대로 — 마을-날 칸으로 다시 가른다 · 그날 econ 틱 안 땅 = 훅의 `landStoneEff`):
#     L1 석공 먼저(치명 도구 ∧ 쪼을 돌 ∧ 석공 < 목표) → L2 STONE_NET 채집꾼(치명 도구 ∧ 땅 돌 ≥ 0.25 ∧ 곳간 돌 < 하루 재료 ∧ 채집꾼 자리) →
#     기근 블록(곳간 < 사람 × 30 → 식량 일) → L3 돌 모자람 채집꾼(땅 돌 ≥ 0.25 ∧ 곳간 돌 < 하루 재료 × 석공 목표) → …
import json, sys, collections
args = sys.argv[1:]
f = args[0]
maxday = int(args[args.index('--maxday') + 1]) if '--maxday' in args else 10 ** 9
outj = args[args.index('--json') + 1] if '--json' in args else None
D = json.load(open(f))
C = {c: i for i, c in enumerate(D['cols'])}
names = D['names']
rows = [r for r in D['rows'] if r[C['day']] <= maxday]
g = lambda r, k: r[C[k]]
byv = collections.defaultdict(list)
for r in rows: byv[g(r, 'v')].append(r)
res = {'file': f, 'env': D.get('env'), 'last': min(D['last'], maxday)}

# ⓐ 빈 마을 — 사람 0 이 된 첫 날 · 그 앞 120날 줄(20날마다)과 사람이 빠진 길(굶어 · 그 밖 죽음 · 떠남)
empt = []
for vi, rs in byv.items():
    rs.sort(key=lambda r: r[C['day']])
    d0 = next((g(r, 'day') for r in rs if g(r, 'N') == 0), None)
    if d0 is None: continue
    peak = max(rs, key=lambda r: g(r, 'N') if g(r, 'day') <= d0 else -1)
    pre = [r for r in rs if d0 - 150 <= g(r, 'day') <= d0]
    fd = g(pre[-1], 'fdTot') - g(pre[0], 'fdTot'); dead = g(pre[-1], 'deadTot') - g(pre[0], 'deadTot')
    gone = sum(g(r, 'gone') for r in pre[1:]); born = sum(g(r, 'born') for r in pre[1:])
    emig = g(pre[-1], 'emigTot') - g(pre[0], 'emigTot')
    tl = []
    for r in pre[::15] + [pre[-1]]:
        tl.append({k: g(r, k) for k in ['day', 'N', 'foodDays', 'famine', 'stone', 'landStone', 'landStoneEff', 'toolStock', 'toolDeps', 'toolCrit', 'n_mason', 'masonT', 'n_forager', 'n_farmer', 'n_fisher', 'fdTot', 'deadTot', 'emigTot', 'bandit', 'housing', 'homeCap', 'kSlot', 'kProd', 'kFuel', 'health', 'fuelCov', 'need']})
    empt.append({'v': names[vi], 'day': d0, 'peakN': g(peak, 'N'), 'peakDay': g(peak, 'day'), 'last150': {'starved': fd, 'otherDead': dead - fd, 'gone': gone, 'born': born, 'leftAlive': gone - dead, 'emigTot': emig}, 'timeline': tl})
res['empty'] = sorted(empt, key=lambda x: x['day'])

# ⓑ 곳간 돌 < 하루 재료 ∧ 돌밭(원래 땅 돌 ≥ 0.25) 마을-날 — 피커가 그날 어느 줄에서 섰을 것인가
cls = collections.Counter(); jobs = collections.Counter(); n = 0; masonsIdle = 0; foragers = []; famineN = 0
for r in rows:
    if g(r, 'N') < 3 or g(r, 'landStone') is None: continue
    if not (g(r, 'stone') < (g(r, 'stoneWork') or 0.2) and g(r, 'landStone') >= 0.25): continue
    n += 1
    crit = g(r, 'toolCrit') == 1; fam = g(r, 'famine') == 1
    eff = g(r, 'landStoneEff') if g(r, 'landStoneEff') is not None else g(r, 'landStone')
    slot = (g(r, 'capForager') or 0) > g(r, 'n_forager')
    famineN += fam
    if crit and eff >= 0.25 and slot: c = 'L2 STONE_NET 채집꾼(치명 도구 · 기근 블록 앞)'
    elif crit and eff < 0.25: c = 'L2 닫힘 — 겨울 · 날씨 배수로 땅 돌 0.25 밑(ⓓ)'
    elif crit and not slot: c = 'L2 닫힘 — 채집꾼 자리 없음'
    elif fam: c = '기근 블록(치명 도구 아님 → L3 돌 줄 앞에서 식량 일)'
    else: c = 'L3 돌 모자람 채집꾼 줄까지 닿음(기근 아님)'
    cls[c] += 1
    jobs['석공 있음' if g(r, 'n_mason') > 0 else '석공 0'] += 1
    masonsIdle += g(r, 'n_mason')
    foragers.append(g(r, 'n_forager'))
res['stone0'] = {'villageDays': n, 'famineShare': round(famineN / max(1, n), 3), 'pickerLine': dict(cls.most_common()), 'masonDays': dict(jobs), 'idleMasonDays': masonsIdle,
                 'foragerMean': round(sum(foragers) / max(1, len(foragers)), 2)}

# ⓑ' 돌 흐름 — 돌밭 마을(원래 땅 돌 ≥ 0.25)의 그날 주운 돌 대 유지 소비(사람 × (0.02 + 0.04)) · 석공 재료(석공 × 하루 재료)
tot = collections.Counter()
for r in rows:
    if g(r, 'N') < 3 or (g(r, 'landStone') or 0) < 0.25: continue
    tot['days'] += 1; tot['made'] += g(r, 'stoneMade') or 0; tot['maint'] += g(r, 'N') * 0.06; tot['masonNeed'] += g(r, 'n_mason') * (g(r, 'stoneWork') or 0.2)
    tot['stone0'] += 1 if (g(r, 'stone') or 0) < (g(r, 'stoneWork') or 0.2) else 0
    tot['foragers'] += g(r, 'n_forager'); tot['people'] += g(r, 'N')
res['stoneFlow'] = {k: round(v, 1) for k, v in tot.items()}

# ⓒ 석공 목표 대 마모 — 마을-날(석공 ≥ 1): 목표가 읽는 마모(그날 직업 수 × 마모 식) · 석공 한 사람이 그날 실제로 낸 석기(누계 차) · 목표 식이 가정한 0.5
mt = collections.defaultdict(list)
for vi, rs in byv.items():
    rs.sort(key=lambda r: r[C['day']])
    for a, b in zip(rs, rs[1:]):
        if g(b, 'n_mason') < 1 or g(b, 'N') < 10: continue
        made = (g(b, 'stToolCum') or 0) - (g(a, 'stToolCum') or 0); weap = (g(b, 'stWeapCum') or 0) - (g(a, 'stWeapCum') or 0)
        hasStone = (g(a, 'stone') or 0) >= (g(a, 'stoneWork') or 0.2)
        key = ('돌 있음' if hasStone else '돌 없음') + (' · 치명 도구' if g(b, 'toolCrit') else '')
        mt[key].append((made / g(b, 'n_mason'), weap / g(b, 'n_mason'), g(b, 'wear') or 0, made, g(b, 'masonT') or 0, g(b, 'n_mason'), g(b, 'N'), g(b, 'masonSk') or 0))
res['mason'] = {}
for k, L in mt.items():
    m = len(L)
    res['mason'][k] = {'days': m, 'perMasonTool': round(sum(x[0] for x in L) / m, 3), 'perMasonWeap': round(sum(x[1] for x in L) / m, 3), 'wear': round(sum(x[2] for x in L) / m, 3),
                       'made': round(sum(x[3] for x in L) / m, 3), 'masonT': round(sum(x[4] for x in L) / m, 2), 'masons': round(sum(x[5] for x in L) / m, 2), 'N': round(sum(x[6] for x in L) / m, 1),
                       'madeLtWear': round(sum(1 for x in L if x[3] < x[2]) / m, 3), 'skill': round(sum(x[7] for x in L) / m, 2)}

# ⓓ 겨울 경계 — 원래 땅 돌이 [0.25, 0.25/0.95) 인 마을(돌밭 바닥)의 철 · 날씨 배수 뒤 땅 돌이 0.25 밑인 날 · 그 날 치명 도구 ∧ 돌 0
bd = collections.Counter(); bdv = set()
for r in rows:
    ls = g(r, 'landStone'); le = g(r, 'landStoneEff')
    if ls is None or le is None or g(r, 'N') < 3: continue
    if 0.25 <= ls < 0.25 / 0.95:
        bdv.add(g(r, 'v')); bd['floorDays'] += 1
        if le < 0.25:
            bd['pushedOut'] += 1
            if g(r, 'toolCrit') and (g(r, 'stone') or 0) < (g(r, 'stoneWork') or 0.2): bd['pushedOut∧치명∧돌0'] += 1
res['winterEdge'] = dict(bd, floorVillages=len(bdv), allVillages=len(byv))
# 끝 줄 요약 — 굶어 죽음 · 빈 마을 · 인구
lastd = max(g(r, 'day') for r in rows)
fin = [r for r in rows if g(r, 'day') == lastd]
res['end'] = {'day': lastd, 'pop': sum(g(r, 'N') for r in fin), 'starved': sum(g(r, 'fdTot') for r in fin), 'empty': sum(1 for r in fin if g(r, 'N') == 0)}
txt = json.dumps(res, ensure_ascii=False, indent=1)
if outj: open(outj, 'w').write(txt)
print(json.dumps({k: res[k] for k in ['env', 'end', 'stone0', 'stoneFlow', 'mason', 'winterEdge']}, ensure_ascii=False, indent=1))
for e in res['empty']: print('빈', e['v'], e['day'], e['peakN'], e['peakDay'], e['last150'])
