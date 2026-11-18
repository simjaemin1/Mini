#!/usr/bin/env python3
# T1373 표 — 서버 판 훅(`t1373hook.js`) 마을-날 줄에서 카드 ①ⓐ ~ ⓓ · ③ · ⑤ · ⑦ 칸
#   python3 t1373_table.py <판 지도 JSON> <out 머리>   — 지도: {"팔": {"label": "…", "seeds": {"1020": "<훅 JSON>", …}}, …}
#   달력: 날 0 = 1년 3월 1일(서버 달력 `dateOf` — 윤년 4/100/400) · 1년째 = 날 0 ~ 364 · 2년째 = 365 ~ 729 · 3년째 = 730 ~ 1,094
#   K 위 죽음 = 그날 죽음 − 굶어 죽음 − 자연사(econ `_deadTot − _fdDeadTot − _natDeadTot` 의 날 차) — 인구 식 dP 가 음수로 쌓여 가장 늙은 사람을 지운 수.
#   땅 몫 · 땔감 몫 — 그날 인구 식의 로지스틱 음수 몫을 쪼갠다(θ = 4 · econ `LOGISTIC_THETA`):
#     지금(T1373_HOME_CAP=0): 지우는 K = min(slotK, fuelK) — 그날 로지스틱 음수 = N·((N/min)^θ − 1) · 땔감만이었다면 N·max(0, (N/fuelK)^θ − 1) · 땅 몫 = 나머지
#     ⓐ(켬): 지우는 K = fuelK — 땅 몫은 식에 없다(0) · 판에서 따로 센다: slotK < N ≤ fuelK 인 마을-날(땅만 넘긴 날)의 K 위 죽음
#     로지스틱이 음수가 아닌 날의 K 위 죽음(건강 · 행복 몫 · 어제 쌓인 분수)은 "그 밖".
import json, sys, collections, math
THETA = 4
CAL = {int(k): v for k, v in json.load(open('/tmp/t1373r/cal.json')).items()}
YEARS = [(0, 364), (365, 729), (730, 1094)]
WMON = (12, 1, 2)

def load(path):
    d = json.load(open(path))
    C = {c: i for i, c in enumerate(d['cols'])}
    V = collections.defaultdict(dict)
    for r in d['rows']:
        V[r[C['v']]][r[C['day']]] = r
    mode = 'now' if (d.get('env') or {}).get('HOME') == '0' else 'home'
    return dict(C=C, V=V, names=d['names'], last=d['last'], env=d.get('env') or {}, mode=mode, err=d.get('err'), err2=d.get('err2'))

def g(o, r, k):
    i = o['C'].get(k)
    return None if i is None else r[i]

def year_of(day):
    for i, (a, b) in enumerate(YEARS):
        if a <= day <= b: return i
    return None

def site_cap(o, r):
    hc = g(o, r, 'homeCap')
    if hc is not None: return hc
    ls = g(o, r, 'lsize')
    return None if ls is None else math.floor(ls * 25 / 124) * 6

CUT = int(__import__('os').environ.get('T1373_CUT', '100000'))   # 날 자르기(두 판을 같은 날까지 견줄 때 — 기어 세운 판)

def analyse(o):
    if CUT < 100000:
        for vi in list(o['V']): o['V'][vi] = {d: r for d, r in o['V'][vi].items() if d <= CUT}
    days = sorted({d for vv in o['V'].values() for d in vv})
    last = days[-1] if days else 0
    P = collections.Counter()
    out = dict(last=last, mode=o['mode'], env=o['env'])
    # 마을-날 흐름
    yr = lambda: [0, 0, 0]
    fd_y, kov_y, land_y, fuel_y, oth_y, gated_y, empty_y = yr(), yr(), yr(), yr(), yr(), yr(), yr()
    oth_kind = {'health': yr(), 'happy': yr(), 'carry': yr()}
    site = collections.Counter()   # ⓓ — 사람 · econ 주거가 집터 수 × 6 을 넘은 마을-날 · 주거 문 막힘의 까닭(집터 · 주거)
    bind = collections.Counter(); bind_over = collections.Counter()
    landonly_days = 0; landonly_deaths = 0          # ⓐ — slotK < N ≤ fuelK 인 마을-날 · 그날 K 위 죽음
    landonly_logi = [0, 0]                          #     그 가운데 로지스틱이 음수였던 마을-날 · 그날 K 위 죽음(ⓐ 켬이면 0 이어야 한다 — 지우는 K 가 fuelK 뿐)
    season_only_days = 0; season_only_deaths = 0    # ⓒ — 계절 배수만이 slotK 를 N 밑으로 내린 날(slotK < N ≤ 계절 뺀 slotK) · 그날 K 위 죽음
    mon_split = collections.defaultdict(lambda: [0.0, 0.0, 0.0])   # (해, 달) → [땅 · 땔감 · 그 밖]
    fuel_under = collections.Counter(); fuel_under_deaths = collections.Counter(); fuel_under_wood = collections.defaultdict(list)
    sea_slot = collections.defaultdict(lambda: [0.0, 0.0, 0]); sea_wcap = collections.defaultdict(lambda: [0.0, 0.0, 0])
    pc = collections.defaultdict(lambda: [0.0, 0])   # (계절, 일) → [산출 합 · 일꾼-날]
    housing_vs_site = []                               # ⓓ — (econ 주거 · 집터 수 × 6 · 사람) 날 364 · 729
    worst_drop = (0.0, None, None); worst_fd = (0.0, None, None); empties = []
    for vi, vv in o['V'].items():
        name = o['names'][vi]
        dd = sorted(vv)
        prevN = None; prevK = 0; prevF = 0
        seenEmpty = False
        ypeak = {}
        for d in dd:
            r = vv[d]; N = g(o, r, 'N') or 0
            P[d] += N
            y = year_of(d)
            kov = (g(o, r, 'kovTot') or 0); fd = (g(o, r, 'fdTot') or 0)
            dk = kov - prevK if prevN is not None else 0; dfd = fd - prevF if prevN is not None else 0
            prevK, prevF = kov, fd
            n0 = prevN if prevN is not None else N
            prevN = N
            if N == 0 and not seenEmpty and d > 0:
                seenEmpty = True; empties.append((name, d))
            if y is None: continue
            if y not in ypeak: ypeak[y] = [N, N, 0.0, 0]   # 꼭대기 · 그 뒤 바닥 · 가장 큰 내림 몫 · 그해 굶어 죽음
            pk = ypeak[y]
            if N > pk[0]: pk[0] = N; pk[1] = N
            if N < pk[1]: pk[1] = N
            if pk[0] > 0: pk[2] = max(pk[2], (pk[0] - pk[1]) / pk[0])
            pk[3] += dfd
            fd_y[y] += dfd; kov_y[y] += dk
            if g(o, r, 'gated'): gated_y[y] += 1
            sc = site_cap(o, r); hs = g(o, r, 'housing')
            if sc is not None and N > 0 and d <= 729:
                site['vdays'] += 1
                if N > sc: site['N_over'] += 1
                if hs is not None and hs > sc: site['housing_over'] += 1
                if g(o, r, 'gated'):
                    site['gated'] += 1
                    mb = g(o, r, 'mapBeds')
                    h = min(hs if hs is not None else 1e18, mb if mb is not None else 1e18)
                    site['gated_site' if (o['mode'] == 'home' and sc <= h) else 'gated_housing'] += 1
            sK, pK, fK = g(o, r, 'slotK'), g(o, r, 'prodK'), g(o, r, 'fuelK')
            if N > 0 and sK is not None and pK is not None and fK is not None and d <= 729:
                if o['mode'] == 'home':   # ⓐ — K 에 slotK 가 없다
                    b = 'prodK' if pK <= fK else 'fuelK'
                else:
                    m = min(sK, pK, fK)
                    b = 'slotK' if sK == m else ('prodK' if pK == m else 'fuelK')
                bind[b] += 1
                if g(o, r, 'gated'): bind['gated'] += 1
                if n0 > min(sK, fK): bind_over['slot' if sK <= fK else 'fuel'] += 1
            # 땅 · 땔감 몫
            if dk > 0 and sK is not None and fK is not None:
                logi = g(o, r, 'logi') or 0
                if logi >= 0 or n0 <= 0:
                    sp = (0.0, 0.0, float(dk))
                    ht, hp = (g(o, r, 'hTerm') or 0), (g(o, r, 'hapTerm') or 0)
                    oth_kind['health' if ht < 0 and ht <= hp else ('happy' if hp < 0 else 'carry')][y] += dk
                else:
                    Knf = min(sK, fK) if o['mode'] == 'now' else fK
                    tot = n0 * max(0.0, (n0 / max(1e-9, Knf)) ** THETA - 1)
                    fu = n0 * max(0.0, (n0 / max(1e-9, fK)) ** THETA - 1)
                    if tot <= 0: sp = (0.0, 0.0, float(dk))
                    else:
                        lf = max(0.0, min(1.0, (tot - fu) / tot))
                        sp = (dk * lf, dk * (1 - lf), 0.0)
                land_y[y] += sp[0]; fuel_y[y] += sp[1]; oth_y[y] += sp[2]
                ym = (y, CAL.get(d, [0, 0, 0])[1])
                ms = mon_split[ym]; ms[0] += sp[0]; ms[1] += sp[1]; ms[2] += sp[2]
            if sK is not None and fK is not None and sK < n0 <= fK:
                landonly_days += 1; landonly_deaths += max(0, dk)
                if (g(o, r, 'logi') or 0) < 0: landonly_logi[0] += 1; landonly_logi[1] += max(0, dk)
            sns = g(o, r, 'slotNoSea')
            if sK is not None and sns is not None and sK < n0 <= sns and n0 <= (fK if fK is not None else 1e18):
                season_only_days += 1; season_only_deaths += max(0, dk)
            if fK is not None and N > 0 and fK < n0:
                fuel_under[y] += 1; fuel_under_deaths[y] += max(0, dk); fuel_under_wood[y].append(g(o, r, 'wood') or 0)
            se = g(o, r, 'sea')
            if se is not None and sns is not None and sK is not None and sns > 0:
                s = sea_slot[se]; s[0] += sK; s[1] += sns; s[2] += 1
            wc, wc0 = g(o, r, 'wcap'), g(o, r, 'wcapNoSea')
            if se is not None and wc is not None and wc0 is not None and wc0 > 0:
                s = sea_wcap[se]; s[0] += wc; s[1] += wc0; s[2] += 1
            if se is not None:
                for job, prod in (('n_farmer', 'pFood'), ('n_fisher', 'pFish'), ('n_hunter', 'pMeat')):
                    n = g(o, r, job) or 0; p = g(o, r, prod) or 0
                    if n > 0: q = pc[(se, job)]; q[0] += p; q[1] += n
            if d in (364, 729) and N > 0:
                housing_vs_site.append((d, name, g(o, r, 'housing'), g(o, r, 'mapBeds'), site_cap(o, r), N, g(o, r, 'houses')))
        for y, pk in ypeak.items():
            if pk[2] > worst_drop[0]: worst_drop = (pk[2], name, y + 1)
            if pk[0] > 0 and pk[3] / pk[0] > worst_fd[0]: worst_fd = (pk[3] / pk[0], name, y + 1)
    # 세계 줄
    pop_y = [P.get(b) if b <= last else None for (_, b) in YEARS]
    def winter_drop(y):
        a = 275 + 365 * y; b = a + 89
        if a > last: return None
        pre = P.get(a); lo = min(P[d] for d in range(a, min(b, last) + 1) if d in P)
        return None if not pre else round(100 * (pre - lo) / pre, 1)
    # 빈 마을 — 해 끝에 사람 0 인 마을 수
    empty_end = []
    for (_, b) in YEARS:
        if b > last: empty_end.append(None); continue
        empty_end.append(sum(1 for vi, vv in o['V'].items() if b in vv and (g(o, vv[b], 'N') or 0) == 0))
    out.update(
        pop=pop_y, pop400=P.get(400), pop800=P.get(800) if last >= 800 else None, popLast=P.get(last),
        fd=fd_y, kov=kov_y, land=[round(x) for x in land_y], fuel=[round(x) for x in fuel_y], other=[round(x) for x in oth_y],
        other_kind={k: v for k, v in oth_kind.items()}, site=dict(site),
        empty_end=empty_end, empties=empties[:12], n_empty=len(empties),
        worst_drop=(round(100 * worst_drop[0], 1), worst_drop[1], worst_drop[2]), worst_fd=(round(100 * worst_fd[0], 1), worst_fd[1], worst_fd[2]),
        winter_drop=[winter_drop(0), winter_drop(1), winter_drop(2)], gated=gated_y,
        bind=dict(bind), bind_over=dict(bind_over), landonly=(landonly_days, landonly_deaths), landonly_logi=tuple(landonly_logi), seasononly=(season_only_days, season_only_deaths),
        mon={f'{y + 1}.{m:02d}': [round(x) for x in v] for (y, m), v in sorted(mon_split.items(), key=lambda kv: (kv[0][0], (kv[0][1] - 3) % 12))},
        fuel_under={y + 1: (fuel_under[y], fuel_under_deaths[y], round(sorted(fuel_under_wood[y])[len(fuel_under_wood[y]) // 2]) if fuel_under_wood[y] else None) for y in range(3) if y in fuel_under or y * 365 <= last},
        sea_slot={k: (round(v[0] / v[1], 3) if v[1] else None, v[2]) for k, v in sea_slot.items()},
        sea_wcap={k: (round(v[0] / v[1], 3) if v[1] else None, v[2]) for k, v in sea_wcap.items()},
        pc={f'{k[0]}|{k[1]}': round(v[0] / v[1], 3) for k, v in pc.items() if v[1]},
        housing=housing_vs_site,
        P={d: P[d] for d in sorted(P)})
    return out

def monthly_food(o):
    # ⑤ 달마다 곳간에 든 식량(그날 만든 곡식 + 생선 + 고기 · 세계 합) — (해, 달) → 합
    M = collections.Counter()
    for vi, vv in o['V'].items():
        prevAcc = {}
        for d in sorted(vv):
            r = vv[d]
            c = CAL.get(d)
            if not c: continue
            y = year_of(d)
            if y is None: continue
            # 곳간에 든 식량 = 그날 만든 곡식 · 생선 · 고기 − (작물 철 켬이면) 밭에 든 몫 + 그날 거둔 것
            ca = g(o, r, 'cropAcc'); pa = prevAcc.get(vi); prevAcc[vi] = ca
            dAcc = (ca - pa) if (ca is not None and pa is not None) else 0
            M[(y + 1, c[1])] += (g(o, r, 'pFood') or 0) + (g(o, r, 'pFish') or 0) + (g(o, r, 'pMeat') or 0) - max(0, dAcc) + (g(o, r, 'cropIn') or 0)
    return {f'{y}.{m:02d}': round(v) for (y, m), v in sorted(M.items(), key=lambda kv: (kv[0][0], (kv[0][1] - 3) % 12))}

if __name__ == '__main__':
    MAP = json.load(open(sys.argv[1])); OUTP = sys.argv[2]
    res = {}
    for arm, e in MAP.items():
        res[arm] = {'label': e.get('label', arm), 'seeds': {}}
        for s, p in e['seeds'].items():
            try:
                o = load(p)
            except Exception as ex:
                res[arm]['seeds'][s] = {'err': str(ex)}; continue
            a = analyse(o); a['food'] = monthly_food(o); a['err'] = o['err']; a['err2'] = o['err2']
            res[arm]['seeds'][s] = a
    json.dump(res, open(OUTP + '.json', 'w'), ensure_ascii=False)
    for arm, e in res.items():
        for s, a in e['seeds'].items():
            if 'err' in a and len(a) == 1: print(arm, s, 'ERR', a['err']); continue
            print(f"{arm} {s} last {a['last']} mode {a['mode']} pop {a['pop']} fd {a['fd']} kov {a['kov']} land {a['land']} fuel {a['fuel']} other {a['other']} empty {a['empty_end']} n_empty {a['n_empty']} worst {a['worst_drop']} {a['worst_fd']} wdrop {a['winter_drop']} gated {a['gated']}")
            print(f"   bind {a['bind']} over {a['bind_over']} landonly {a['landonly']} seasononly {a['seasononly']} fuel_under {a['fuel_under']}")
