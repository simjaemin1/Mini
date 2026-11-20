#!/usr/bin/env python3
# T1391 판 표 — runs/<tag>/<tag>-<seed>.json(판 자) + .json.t1391.json(관찰기) → out/*.md · out/sum.json
#   python3 ana.py [목록 JSON …]   (기본 s2.json — 있는 판만 읽는다 · 끝나지 않은 판은 '…' 표)
import json, os, sys, math
D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, 'out'); os.makedirs(OUT, exist_ok=True)
LISTS = sys.argv[1:] or ['s2.json']
RUNS = []
for L in LISTS:
    for r in json.load(open(os.path.join(D, L), encoding='utf-8')):
        RUNS.append(r)
INFO_R = 5000 / 2.5   # 서버 세계 infoRange 5000(econ) ÷ 2.5 = 정보 반경 셀(`_infoR`)

def load(r):
    tag, seed = r['tag'], r['seed']
    base = os.path.join(D, 'runs', tag, f'{tag}-{seed}.json')
    h = j = None
    try: h = json.load(open(base + '.t1391.json', encoding='utf-8'))
    except Exception: pass
    try: j = json.load(open(base, encoding='utf-8'))
    except Exception: pass
    return h, j

def wrows(h):
    C = h['wcols']; return [dict(zip(C, x)) for x in h['w']]

def vmrows(h):
    C = h['vcols']; return [dict(zip(C, x)) for x in h['vm']]

def gini(xs):
    xs = sorted(x for x in xs if x is not None)
    n = len(xs); s = sum(xs)
    if n == 0 or s == 0: return None
    cum = 0
    for i, x in enumerate(xs, 1): cum += i * x
    return round((2 * cum) / (n * s) - (n + 1) / n, 3)

def ageb(a):
    if a is None: return 'na'
    return '0-9' if a < 10 else '10-15' if a < 16 else '16-19' if a < 20 else '20-39' if a < 40 else '40+'

def summary(r):
    h, j = load(r)
    if not h: return None
    W = wrows(h); V = vmrows(h); names = h['names']
    if not W: return None
    last = W[-1]; days = last['day']
    by = {x['day']: x for x in W}
    S = lambda k: sum((x.get(k) or 0) for x in W)
    nvil = j['villages'] if j else len(names)
    W2 = [x for x in W if x['day'] > 365]
    pmin = min(W2, key=lambda x: x['pop']) if W2 else {'pop': None, 'day': None}   # 둘째 해 최저(보호기 뒤)
    o = {'tag': r['tag'], 'seed': r['seed'], 'kind': r.get('kind', 'sbc'), 'env': r.get('env', {}), 'days': days, 'done': bool(j),
         'pop365': by[365]['pop'] if 365 in by else None, 'pop730': by[730]['pop'] if 730 in by else None, 'popEnd': last['pop'],
         'popMin': pmin['pop'], 'popMinDay': pmin['day'], 'vil': nvil, 'emptyEnd': nvil - last['alive'],
         'empty365': (nvil - by[365]['alive']) if 365 in by else None,
         'fd': S('fd'), 'dead': S('dead'), 'emigEcon': S('emig'),
         'gangsEnd': last['gangs'], 'gangsPeak': max(x['gangs'] for x in W), 'memEnd': last['members'], 'memPeak': max(x['members'] for x in W),
         'waitPeak': max(x['waitN'] for x in W), 'waitMemPeak': max(x['waitMem'] for x in W),
         'lootN': S('lootN'), 'lootAmt': round(S('lootAmt'), 1), 'lootFood': round(S('lootFood'), 1),
         'killed': S('killed'), 'raided': S('raided'), 'lost': round(S('lost'), 1),
         'cargo': round(S('cargo'), 1), 'foodImp': round(S('foodImp'), 1), 'sent': S('sent'), 'newCar': S('newCar'), 'esc': S('esc'),
         'sup': S('sup'), 'supDead': S('supDead'), 'gStarve': S('starve'), 'disband': S('disband'), 'exo': S('exo'), 'convB': S('convB'), 'denForm': S('denForm'),
         'leave': S('leave'), 'arrive': S('arrive'), 'none': S('none'),
         'emTry': S('emTry'), 'emMove': S('emMove'), 'emBandit': S('emBandit'), 'emStay': S('emStay'),
         'u25': S('u25'), 'u32': S('u32'), 't1391': h.get('t1391'), 'ages': h.get('ages')}
    # 불행한 날의 까닭(마을-날 평균)
    u = sum(x['u25'] for x in V)
    o['cause'] = {k: (round(sum(x[k] for x in V) / u, 3) if u else None) for k in ('uG', 'uE', 'uB', 'uS', 'uStv')} if V and 'uG' in V[0] else None
    # 마을별 최악 — 처음 사람 → 가장 적었을 때
    seedPop = dict(zip(j['names'], j['seedPop'])) if j and j.get('seedPop') else {}
    worst = None
    for vi, nm in enumerate(names):
        rows = [x for x in V if x['v'] == vi]
        if not rows: continue
        nmin = min((x['Nmin'] for x in rows if x['Nmin'] is not None), default=None)
        n0 = seedPop.get(nm)
        fdv = sum(x['fd'] for x in rows)
        if nmin is None: continue
        drop = (n0 - nmin) if n0 is not None else None
        key = (drop if drop is not None else 0, fdv)
        if worst is None or key > worst[0]: worst = (key, {'v': nm, 'n0': n0, 'nmin': nmin, 'fd': fdv})
    o['worst'] = worst[1] if worst else None
    # 지니 · 가장 가난한 다섯(그 판 마을 식량 일수 평균 — feSum ÷ days)
    lastM = max(x['m'] for x in V)
    nend = [x['Nend'] for x in V if x['m'] == lastM]
    o['giniEnd'] = gini(nend)
    m12 = [x['Nend'] for x in V if x['m'] == 11]
    o['gini365'] = gini(m12) if m12 else None
    fe = {}
    for x in V:
        a = fe.setdefault(x['v'], [0, 0, 0, 0]); a[0] += x['feSum']; a[1] += x['days']; a[2] += x['fd']; a[3] += x['lootAmt']
    rank = sorted(((a[0] / a[1] if a[1] else 0), vi, a) for vi, a in fe.items())
    o['poor5fd'] = sum(a[2] for _, _, a in rank[:5])
    o['poor5'] = [names[vi] for _, vi, _ in rank[:5]]
    half = len(rank) // 2
    lp = sum(a[3] for _, _, a in rank[:half]); lr = sum(a[3] for _, _, a in rank[half:])
    o['lootPoorShare'] = round(lp / (lp + lr), 3) if lp + lr > 0 else None
    # 전환 줄(T1391)
    conv = [c for c in h.get('conv', []) if c.get('k') in ('join', 'joinWait', 'found')]
    o['conv'] = {'n': len(conv), 'join': sum(1 for c in conv if c['k'] == 'join'), 'joinWait': sum(1 for c in conv if c['k'] == 'joinWait'), 'found': sum(1 for c in conv if c['k'] == 'found'),
                 'in365': sum(1 for c in conv if c['day'] < 365), 'out365': sum(1 for c in conv if c['day'] >= 365),
                 'formed': sum(1 for c in h.get('conv', []) if c.get('k') == 'formed'), 'waitStarve': sum(1 for c in h.get('conv', []) if c.get('k') == 'waitStarve'),
                 'waitGone': sum(1 for c in h.get('conv', []) if c.get('k') == 'waitGone'), 'age': {}}
    for c in conv: b = ageb(c.get('age')); o['conv']['age'][b] = o['conv']['age'].get(b, 0) + 1
    # 단 수명 · 은거지 가까운 마을
    G = h.get('gangs', [])
    o['gangLife'] = round(sum(g['last'] - g['first'] + 1 for g in G) / len(G), 1) if G else None
    o['gangsSeen'] = len(G)
    # 덧붙임 팔 — 새 단 은거지 · 털 마을
    found = [c for c in h.get('conv', []) if c.get('k') == 'found']
    o['richTargets'] = {}
    for c in found:
        if c.get('rich'): o['richTargets'][c['rich']] = o['richTargets'].get(c['rich'], 0) + 1
    o['dissolveCamp'] = sum(1 for c in h.get('conv', []) if c.get('k') == 'dissolveCamp')
    # 보호기 안 · 밖(습격 · 전환)
    o['loot365'] = sum((x.get('lootN') or 0) for x in W if x['day'] < 365)
    o['bxWalk'] = (j.get('bodyExit') or {}).get('walk') if j else None   # 몸 층 — 걸어 나간 몸(도적 전환 `bandit` · 단에 듦 `desert` · 이주 `move`)
    o['bxDied'] = (j.get('bodyExit') or {}).get('died') if j else None
    o['killed365'] = sum((x.get('killed') or 0) for x in W if x['day'] < 365)
    return o

def monthly(r):
    h, _ = load(r)
    if not h: return None
    W = wrows(h); M = {}
    for x in W:
        m = (x['day'] - 1) // 30
        a = M.setdefault(m, {'lootN': 0, 'lootFood': 0.0, 'cargo': 0.0, 'foodImp': 0.0, 'fd': 0, 'u25': 0, 'conv': 0, 'emMove': 0, 'gangs': 0, 'members': 0, 'killed': 0})
        a['lootN'] += x['lootN'] or 0; a['lootFood'] += x['lootFood'] or 0; a['cargo'] += x['cargo'] or 0; a['foodImp'] += x['foodImp'] or 0
        a['fd'] += x['fd'] or 0; a['u25'] += x['u25'] or 0; a['conv'] += x.get('emBandit') or 0; a['emMove'] += x.get('emMove') or 0
        a['gangs'] = x['gangs']; a['members'] = x['members']; a['killed'] += x['killed'] or 0
    return M

def recovery(r):
    # 사람을 덜어 낸 마을-달(이주 emMove · 도적 emBandit) — 그 달 평균 행복 → 다음 달
    h, _ = load(r)
    if not h: return None
    V = vmrows(h); idx = {(x['v'], x['m']): x for x in V}
    out = {}
    for k in ('emMove', 'emBandit'):
        ds = []
        for x in V:
            if (x.get(k) or 0) <= 0 or not x['days']: continue
            y = idx.get((x['v'], x['m'] + 1))
            if not y or not y['days']: continue
            ds.append(y['hSum'] / y['days'] - x['hSum'] / x['days'])
        out[k] = {'n': len(ds), 'up': sum(1 for d in ds if d > 0), 'mean': round(sum(ds) / len(ds), 4) if ds else None}
    return out

def richEffect(r):
    # 덧붙임 팔 — 털 마을(새 단 은거지가 곁에 선 마을)의 앞 → 뒤(곳간 일수 · 짐 · 호위 · 목책 · 털림 · 토벌)
    h, _ = load(r)
    if not h: return None
    V = vmrows(h); names = h['names']; ni = {n: i for i, n in enumerate(names)}
    found = [c for c in h.get('conv', []) if c.get('k') in ('found', 'dissolveCamp') and c.get('rich')]
    first = {}
    for c in found: first.setdefault(c['rich'], c['day'])
    sorties = h.get('sorties', [])
    res = []
    for nm, d in first.items():
        vi = ni.get(nm)
        if vi is None: continue
        m0 = (d - 1) // 30
        rows = sorted((x for x in V if x['v'] == vi), key=lambda x: x['m'])
        pre = [x for x in rows if m0 - 3 <= x['m'] < m0]; post = [x for x in rows if m0 < x['m'] <= m0 + 3]
        def avg(xs, k, per_day=False):
            if not xs: return None
            if per_day:
                dd = sum(x['days'] for x in xs); return round(sum(x[k] for x in xs) / dd, 2) if dd else None
            return round(sum(x[k] for x in xs) / len(xs), 2)
        res.append({'v': nm, 'day': d, 'n': sum(1 for c in found if c['rich'] == nm),
                    'fePre': avg(pre, 'feSum', True), 'fePost': avg(post, 'feSum', True), 'cargoPre': avg(pre, 'cargo'), 'cargoPost': avg(post, 'cargo'),
                    'escPre': avg(pre, 'esc'), 'escPost': avg(post, 'esc'), 'palPre': pre[-1]['palEnd'] if pre else None, 'palPost': post[-1]['palEnd'] if post else None,
                    'lootPre': avg(pre, 'lootAmt'), 'lootPost': avg(post, 'lootAmt'), 'fdPost': sum(x['fd'] for x in post),
                    'sorties': sum(1 for s in sorties if s.get('vil') == nm and s['day'] >= d)})
    return res

if __name__ == '__main__':
    SUM = []
    for r in RUNS:
        s = summary(r)
        if s: SUM.append(s)
    json.dump(SUM, open(os.path.join(OUT, 'sum.json'), 'w'), ensure_ascii=False, indent=1)
    print('runs', len(SUM), [ (s['tag'], s['days'], s['done']) for s in SUM ])

# ── 표 ───────────────────────────────────────────────────────────────────────
def fmt(x, nd=0):
    if x is None: return '—'
    if isinstance(x, float) and nd == 0: x = round(x)
    if isinstance(x, (int,)) or (isinstance(x, float) and nd == 0): return f'{int(x):,}'
    return f'{x:,.{nd}f}'
ARMN = {'OFF': '끔(지금)', 'NH': 'nohome', 'ALL': 'all', 'AR': 'all + 부자 곁', 'R': '부자 곁만'}
def arm(tag): return tag.split('_')[0]

def tables(SUM, seeds=(1020, 7, 42), kind='sbc'):
    S = {(s['tag'].split('_')[0], s['seed']): s for s in SUM if s['kind'] == kind}
    out = []
    # 표 A — 불행한 사람이(문 부른 수 · 이웃 · 남은 마을-날 · 도적)
    out.append('| 팔 | 시드 | 불행 이탈 문(번) | 이웃 마을로 | 제 마을에 남음(마을-날) | 도적 | 그중 선 단에 듦 · 모이는 단 · 새 단 |')
    out.append('|---|---|---|---|---|---|---|')
    for a in ('OFF', 'NH', 'ALL', 'AR'):
        tot = [0, 0, 0, 0, 0, 0, 0]
        for sd in seeds:
            s = S.get((a, sd))
            if not s: continue
            c = s['conv']
            row = [s['emTry'], s['emMove'], s['emStay'], s['emBandit'], c['join'], c['joinWait'], c['found']]
            tot = [x + y for x, y in zip(tot, row)]
            out.append(f"| {ARMN[a]} | {sd}{'' if s['done'] else ' …'+str(s['days'])} | {fmt(row[0])} | {fmt(row[1])} | {fmt(row[2])} | {fmt(row[3])} | {fmt(row[4])} · {fmt(row[5])} · {fmt(row[6])} |")
        out.append(f"| **{ARMN[a]}** | **합** | **{fmt(tot[0])}** | **{fmt(tot[1])}** | **{fmt(tot[2])}** | **{fmt(tot[3])}** | {fmt(tot[4])} · {fmt(tot[5])} · {fmt(tot[6])} |")
    return '\n'.join(out)

def main_table(SUM, kind='sbc', seeds=(1020, 7, 42), arms=('OFF', 'NH', 'ALL', 'AR', 'R')):
    S = {(s['tag'].split('_')[0], s['seed']): s for s in SUM if s['kind'] == kind}
    H = ['팔', '시드', '인구 365 · 730(끔비)', '둘째 해 최저(날)', '빈 마을 365 · 끝', '굶어 죽음', '죽음 전체', '마을별 최악(처음→최저 · 굶음)', '단 끝 · 봉우리', '단원 봉우리', '습격(약탈 건)', '행상 피살', '약탈 식량', '교역 식량 · 짐 전체', '캐러밴 · 호위', '토벌']
    out = ['| ' + ' | '.join(H) + ' |', '|' + '---|' * len(H)]
    for sd in seeds:
        off = S.get(('OFF', sd))
        for a in arms:
            s = S.get((a, sd))
            if not s: continue
            r = lambda k: (f"({s[k] / off[k]:.2f})" if off and off.get(k) and s.get(k) is not None and a != 'OFF' else '')
            w = s['worst'] or {}
            out.append('| ' + ' | '.join([ARMN[a], f"{sd}{'' if s['done'] else ' …' + str(s['days'])}", f"{fmt(s['pop365'])} · {fmt(s['pop730'])}{r('pop730')}", f"{fmt(s['popMin'])}({s['popMinDay']})",
                f"{fmt(s['empty365'])} · {fmt(s['emptyEnd'])}", fmt(s['fd']), fmt(s['dead']), f"{w.get('v', '—')} {fmt(w.get('n0'))}→{fmt(w.get('nmin'))} · {fmt(w.get('fd'))}",
                f"{fmt(s['gangsEnd'])} · {fmt(s['gangsPeak'])}", fmt(s['memPeak']), fmt(s['lootN']), fmt(s['killed']), fmt(s['lootFood']), f"{fmt(s['foodImp'])} · {fmt(s['cargo'])}",
                f"{fmt(s['newCar'])} · {fmt(s['esc'])}", fmt(s['sup'])]) + ' |')
    return '\n'.join(out)

if __name__ == '__main__' and 'tables' in os.environ.get('T1391_ANA', 'tables'):
    open(os.path.join(OUT, 'tabA.md'), 'w').write(tables(SUM))
    open(os.path.join(OUT, 'tabMain.md'), 'w').write(main_table(SUM))
    print(open(os.path.join(OUT, 'tabA.md')).read()); print(); print(open(os.path.join(OUT, 'tabMain.md')).read())

def feedback_table(kind='sbc', seeds=(1020, 7, 42), arms=('OFF', 'NH', 'ALL')):
    # 달마다 고리 네 칸(약탈 → 교역 → 굶음 · 불행 → 도적) — 팔마다 시드 합
    runs = {}
    for r in RUNS:
        if r.get('kind', 'sbc') != kind or r['seed'] not in seeds: continue
        a = r['tag'].split('_')[0]
        if a not in arms: continue
        M = monthly(r)
        if not M: continue
        runs.setdefault(a, []).append(M)
    months = sorted({m for L in runs.values() for M in L for m in M})
    H = ['달'] + [f'{ARMN[a]} 약탈(건 · 식량) → 짐 → 굶어 죽음 · 불행 마을-날 → 도적(전환 · 단원)' for a in arms if a in runs]
    out = ['| ' + ' | '.join(H) + ' |', '|' + '---|' * len(H)]
    for m in months:
        cells = [f'{m + 1}' + (' (열흘)' if m == 24 else '')]
        for a in arms:
            if a not in runs: continue
            t = {'lootN': 0, 'lootFood': 0, 'cargo': 0, 'fd': 0, 'u25': 0, 'conv': 0, 'members': 0}
            for M in runs[a]:
                x = M.get(m)
                if not x: continue
                for k in t: t[k] += x[k]
            cells.append(f"{fmt(t['lootN'])} · {fmt(t['lootFood'])} → {fmt(t['cargo'])} → {fmt(t['fd'])} · {fmt(t['u25'])} → {fmt(t['conv'])} · {fmt(t['members'])}")
        out.append('| ' + ' | '.join(cells) + ' |')
    return '\n'.join(out), {a: len(v) for a, v in runs.items()}

def corr(xs, ys):
    n = len(xs)
    if n < 3: return None
    mx, my = sum(xs) / n, sum(ys) / n
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs)); sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if sx == 0 or sy == 0: return None
    return round(sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy), 3)

def feedback_corr(kind='sbc', seeds=(1020, 7, 42), arm_='ALL', base='OFF'):
    # 팔 − 끔(같은 시드 · 같은 달) 차이의 상관 — 약탈↑ ↔ 짐↓ · 짐↓ ↔ 굶음↑ · 굶음 · 불행↑ ↔ 다음 달 도적↑
    pairs = []
    for sd in seeds:
        pick = lambda a_: next((r for r in RUNS if r.get('kind', 'sbc') == kind and r['tag'].split('_')[0] == a_ and r['seed'] == sd), None)
        ra, rb = pick(arm_), pick(base)
        if not ra or not rb: continue
        A, Bm = monthly(ra), monthly(rb)
        if not A or not Bm: continue
        for m in sorted(A):
            if m not in Bm or m + 1 not in A or m == 24: continue
            d = {k: A[m][k] - Bm[m][k] for k in ('lootN', 'cargo', 'fd', 'u25', 'conv')}
            d['convNext'] = A[m + 1]['conv'] - Bm.get(m + 1, {'conv': 0})['conv']
            pairs.append(d)
    if not pairs: return None
    g = lambda k: [p[k] for p in pairs]
    return {'n': len(pairs), 'loot~cargo': corr(g('lootN'), g('cargo')), 'cargo~fd': corr(g('cargo'), g('fd')), 'fd~convNext': corr(g('fd'), g('convNext')), 'u25~convNext': corr(g('u25'), g('convNext')),
            'sumLoot': sum(g('lootN')), 'sumCargo': round(sum(g('cargo'))), 'sumFd': sum(g('fd')), 'sumConv': sum(g('conv'))}

def now_table(SUM, kind='sbc', seeds=(1020, 7, 42)):
    # 할 일 1 — 끔 세계 지금 수(두 해)
    S = {s['seed']: s for s in SUM if s['kind'] == kind and s['tag'].startswith('OFF_')}
    H = ['시드', '불행 이탈 떠난 사람(이웃 마을로)', '받은 마을에 닿음', '받는 곳 없음(마을-날)', '절망 이탈 → 단', '해체로 선 단', '단 끝 · 봉우리', '단원 봉우리', '습격(약탈 건)', '행상 피살', '약탈 식량', '토벌', '단 굶어 죽음', '해산', '불행 마을-날 0.25 밑 · 0.32 밑']
    out = ['| ' + ' | '.join(H) + ' |', '|' + '---|' * len(H)]
    tot = None
    for sd in seeds:
        s = S.get(sd)
        if not s: continue
        row = [s['emMove'], s['arrive'], s['emStay'], s['exo'], s['convB'], None, s['memPeak'], s['lootN'], s['killed'], s['lootFood'], s['sup'], s['gStarve'], s['disband'], None]
        out.append('| ' + ' | '.join([f"{sd}{'' if s['done'] else ' …' + str(s['days'])}", fmt(s['emMove']), fmt(s['arrive']), fmt(s['emStay']), fmt(s['exo']), fmt(s['convB']), f"{fmt(s['gangsEnd'])} · {fmt(s['gangsPeak'])}",
            fmt(s['memPeak']), fmt(s['lootN']), fmt(s['killed']), fmt(s['lootFood']), fmt(s['sup']), fmt(s['gStarve']), fmt(s['disband']), f"{fmt(s['u25'])} · {fmt(s['u32'])}"]) + ' |')
    return '\n'.join(out)

def cause_table(SUM, kind='sbc', seeds=(1020, 7, 42), arms=('OFF', 'NH', 'ALL', 'AR')):
    S = {(s['tag'].split('_')[0], s['seed']): s for s in SUM if s['kind'] == kind}
    H = ['팔', '시드', '불행 마을-날(0.25 밑)', '좋은 것 G', '겪은 일 E(굶주림 기억)', '인구 부담 B', '느린 행복 S', '그날 굶는 몫']
    out = ['| ' + ' | '.join(H) + ' |', '|' + '---|' * len(H)]
    for a in arms:
        for sd in seeds:
            s = S.get((a, sd))
            if not s or not s['cause']: continue
            c = s['cause']
            out.append('| ' + ' | '.join([ARMN[a], str(sd), fmt(s['u25']), fmt(c['uG'], 3), fmt(c['uE'], 3), fmt(c['uB'], 3), fmt(c['uS'], 3), fmt(c['uStv'], 3)]) + ' |')
    return '\n'.join(out)

def prot_table(SUM, kind='sbc', seeds=(1020, 7, 42), arms=('NH', 'ALL', 'AR')):
    S = {(s['tag'].split('_')[0], s['seed']): s for s in SUM if s['kind'] == kind}
    H = ['팔', '시드', '도적 전환 보호기 안(365날 전) · 밖', '나이 16~19 · 20~39 · 그 밖', '모이는 단 굶어 이탈', '선 새 단(셋째 닿음)']
    out = ['| ' + ' | '.join(H) + ' |', '|' + '---|' * len(H)]
    for a in arms:
        for sd in seeds:
            s = S.get((a, sd))
            if not s: continue
            c = s['conv']; ag = c['age']
            other = sum(v for k, v in ag.items() if k not in ('16-19', '20-39'))
            out.append('| ' + ' | '.join([ARMN[a], f"{sd}{'' if s['done'] else ' …' + str(s['days'])}", f"{fmt(c['in365'])} · {fmt(c['out365'])}", f"{fmt(ag.get('16-19', 0))} · {fmt(ag.get('20-39', 0))} · {fmt(other)}", fmt(c['waitStarve']), fmt(c['formed'])]) + ' |')
    return '\n'.join(out)

def rich_table(SUM, kind='sbc', seeds=(1020, 7, 42), arms=('OFF', 'NH', 'ALL', 'AR', 'R')):
    S = {(s['tag'].split('_')[0], s['seed']): s for s in SUM if s['kind'] == kind}
    H = ['팔', '시드', '새 단(불행) · 해체 단 자리', '털 마을(새 단 수)', '마을 인구 지니 365 · 끝', '가장 가난한 다섯 마을 굶어 죽음', '약탈이 가난한 절반에 떨어진 몫', '단 수명(날 · 본 단 수)']
    out = ['| ' + ' | '.join(H) + ' |', '|' + '---|' * len(H)]
    for sd in seeds:
        for a in arms:
            s = S.get((a, sd))
            if not s: continue
            rt = ', '.join(f'{k} {v}' for k, v in sorted(s['richTargets'].items(), key=lambda kv: -kv[1])) or '—'
            out.append('| ' + ' | '.join([ARMN[a], f"{sd}{'' if s['done'] else ' …' + str(s['days'])}", f"{fmt(s['conv']['found'])} · {fmt(s['dissolveCamp'])}", rt, f"{fmt(s['gini365'], 3)} · {fmt(s['giniEnd'], 3)}",
                fmt(s['poor5fd']), fmt(s['lootPoorShare'], 3), f"{fmt(s['gangLife'], 1)} · {fmt(s['gangsSeen'])}"]) + ' |')
    return '\n'.join(out)

def rich_effect_table(kind='sbc'):
    H = ['판', '털 마을', '첫 새 단 날 · 새 단 수', '곳간 일수(사람당 식량) 앞 → 뒤', '짐(달) 앞 → 뒤', '호위(달) 앞 → 뒤', '목책 앞 → 뒤', '털림(달) 앞 → 뒤', '뒤 석 달 굶어 죽음', '그 뒤 토벌 출정']
    out = ['| ' + ' | '.join(H) + ' |', '|' + '---|' * len(H)]
    n = 0
    for r in RUNS:
        if r.get('kind', 'sbc') != kind or not r['tag'].startswith('AR_'): continue
        E = richEffect(r) or []
        for e in E:
            n += 1
            out.append('| ' + ' | '.join([r['tag'], e['v'], f"{e['day']} · {e['n']}", f"{fmt(e['fePre'], 2)} → {fmt(e['fePost'], 2)}", f"{fmt(e['cargoPre'], 1)} → {fmt(e['cargoPost'], 1)}",
                f"{fmt(e['escPre'], 1)} → {fmt(e['escPost'], 1)}", f"{fmt(e['palPre'], 2)} → {fmt(e['palPost'], 2)}", f"{fmt(e['lootPre'], 1)} → {fmt(e['lootPost'], 1)}", fmt(e['fdPost']), fmt(e['sorties'])]) + ' |')
    return '\n'.join(out), n

def same_world(tagA, tagB, seed):
    # 두 판 관찰기 줄이 같은가(덧붙임 팔만 = 끔 확인)
    ra = next((r for r in RUNS if r['tag'] == tagA), None); rb = next((r for r in RUNS if r['tag'] == tagB), None)
    if not ra or not rb: return None
    ha, _ = load(ra); hb, _ = load(rb)
    if not ha or not hb: return None
    return {'w': ha['w'] == hb['w'], 'vm': ha['vm'] == hb['vm'], 'gangs': ha['gangs'] == hb['gangs'], 'days': len(ha['w'])}
