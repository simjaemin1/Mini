#!/usr/bin/env python3
# T1334 두 해 판 표 — 판 JSON · 훅(`sbc-<시드>.json.t1275.json` 날 줄 · `.t1297.json` 마을-날 줄 · `.t1334.json` 아이 날 줄) · 굶어 죽음 누계(`sbc-<시드>.fd-deaths.json`)만 읽는다 · 세계 0
#   실행: python3 t1334_table.py <판 지도 JSON> [--out <폴더>]
#     판 지도 = { "<팔>": { "label": "…", "world": "<세계>", "aut": "mig|1|-", "seeds": { "1020": {"json": "<판 JSON>", "dir": "<판 폴더>", "out": "<판 .out>"}, … } }, … }  (끔 팔 이름 = "off")
#   달력: 날 0 = 1년 3월 1일(달력 정본 `server/calendar.js` · 1 · 2년 평년) — 1년째 = 날 0 ~ 364 · 2년째 = 365 ~ 729 · 3년째(판 끝까지) = 730 ~ 800(3월 1일 ~ 5월 10일)
#     날 400 = 2년 4월 5일 · 600 = 2년 10월 22일 · 800 = 3년 5월 10일 · 철 = 봄 3 ~ 5월 · 여름 6 ~ 8월 · 가을 9 ~ 11월 · 겨울 12 ~ 2월
#   칸(팔 × 시드):
#     날 400 · 600 · 800 인구(마을 명부 합 · 여덟 수 인구와 같은 자) · 끔비(같은 시드 · 같은 날 끔 판 인구로 나눔)
#     한 해 평균 인구(2년째 365 ~ 729 날 평균 — 한 날 자의 철 치우침을 뺀다) · 그 끔비
#     해마다 굶어 죽음(1년째 · 2년째 · 3년째 판 끝까지 — 누계 줄의 차) · 빈 마을(날 400 · 800)
#     꼭대기(명 · 날) · 꼭대기 뒤 내림(꼭대기 → 판 끝 %) · 가장 큰 내림(앞선 꼭대기에서 가장 크게 떨어진 % · 그 날)
#     2년째 가장 큰 내림(2년째 안에서 앞선 꼭대기 — 1년째 꼭대기도 친다 — 에서 가장 크게 떨어진 %)
#     철마다 난 사람(`bornE` — econ 출생 줄 · 해 × 철) · 곳간 10일치 밑 마을-날 %(사람 있는 마을-날 가운데 · 해마다)
import json, os, sys, collections

def rd(p):
    try: return json.load(open(p))
    except Exception: return None

SEASON = lambda m: 0 if 3 <= m <= 5 else 1 if 6 <= m <= 8 else 2 if 9 <= m <= 11 else 3
SN = ['봄', '여름', '가을', '겨울']
YEAR = lambda d: 1 if d < 365 else 2 if d < 730 else 3
# 날 → (해, 달, 날) — 달력 정본(평년 · 3월 1일 시작)을 옮겨 셈 · t1334 훅 줄이 있으면 그 줄을 쓴다
MD = [31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 28]   # 3월 ~ 2월
def date_of(d):
    y = d // 365 + 1; r = d % 365; m = 3
    for L in MD:
        if r < L: return (y, m, r + 1)
        r -= L; m = m + 1 if m < 12 else 1
    return (y, 2, 28)

def seed_data(e):
    d = e.get('dir'); r = rd(e['json']); s = e['seed']
    run = r and r.get('byseed', {}).get(s)
    o = {'eight': run.get('eight') if run else None, 'emptyEnd': run.get('empty') if run else None}
    sj = rd(os.path.join(d, f'sbc-{s}.json')) if d else None   # 판 JSON 날 줄 [날 · 마을별 사람 · 도적 된 사람 · 죽음 누계 · 죽은 상인] — 죽음 전부(굶음 · 늙음 · 인구 식 K 위 · 전쟁 …)
    o['deadcum'] = {q[0]: sum(q[3]) for q in sj['rows']} if sj and sj.get('rows') else {}
    h5 = rd(os.path.join(d, f'sbc-{s}.json.t1275.json')) if d else None
    o['pop'] = {q[0]: q[1] for q in h5['days']} if h5 else {}
    fd = rd(os.path.join(d, f'sbc-{s}.fd-deaths.json')) if d else None
    cum = {}; last = 0
    if fd:
        rows = {q[0]: q[1] for q in fd['rows']}
        for day in range(0, max(list(rows) + [0]) + 1): last = rows.get(day, last); cum[day] = last
    o['fdcum'] = cum; o['famine'] = fd['fdDeadTot'] if fd else None
    h7 = rd(os.path.join(d, f'sbc-{s}.json.t1297.json')) if d else None
    o['bornYS'] = collections.Counter(); o['low'] = collections.Counter(); o['vd'] = collections.Counter(); o['emptyAt'] = {}
    o['fdQ'] = collections.Counter()
    if h7:
        c = {k: i for i, k in enumerate(h7['cols'])}
        nEmpty = collections.Counter()
        for q in h7['rows']:
            day = q[c['day']]; y, m, _ = date_of(day)
            b = q[c['bornE']] or 0
            if b: o['bornYS'][(y, SEASON(m))] += b
            N = q[c['N']] or 0
            if N:
                o['vd'][y] += 1
                fdd = q[c['foodDays']]
                if fdd is not None and fdd < 10: o['low'][y] += 1
            else: nEmpty[day] += 1
        o['emptyAt'] = nEmpty
    h34 = rd(os.path.join(d, f'sbc-{s}.json.t1334.json')) if d else None
    o['kid'] = {}
    if h34:
        c = {k: i for i, k in enumerate(h34['cols'])}
        for q in h34['rows']: o['kid'][q[c['day']]] = {k: q[i] for k, i in c.items()}
    return o

def stats(o, base):
    P = o['pop']; B = base['pop'] if base else {}
    days = sorted(P)
    x = {}
    for D in (400, 600, 800):
        x[f'p{D}'] = P.get(D); x[f'r{D}'] = round(P[D] / B[D], 3) if P.get(D) and B.get(D) else None
    y2 = [P[d] for d in days if 365 <= d <= 729]; y2b = [B[d] for d in days if 365 <= d <= 729 and d in B]
    x['avgY2'] = round(sum(y2) / len(y2), 1) if y2 else None
    x['rAvgY2'] = round((sum(y2) / len(y2)) / (sum(y2b) / len(y2b)), 3) if y2 and y2b and len(y2b) == len(y2) else None
    y1 = [P[d] for d in days if d <= 364]; x['avgY1'] = round(sum(y1) / len(y1), 1) if y1 else None
    cum = o['fdcum']; g = lambda d: cum.get(d, cum.get(max([k for k in cum if k <= d] or [0]), 0)) if cum else 0
    last = max(cum) if cum else 0
    x['fdY1'] = g(364); x['fdY2'] = g(729) - g(364); x['fdY3'] = g(last) - g(729) if last >= 730 else None; x['famine'] = o['famine']
    for D in (400, 600, 800): x[f'fd{D}'] = g(D) if last >= D else None   # 그날까지 굶어 죽음 누계(목표 ④ 를 그 날 자로)
    dc = o.get('deadcum') or {}
    if dc:
        gd = lambda d: dc.get(d, dc.get(max([k for k in dc if k <= d] or [min(dc)]), 0))
        dl = max(dc)
        x['deadY1'] = gd(364); x['deadY2'] = gd(729) - gd(364); x['deadY3'] = gd(dl) - gd(729) if dl >= 730 else None
        x['deadW2'] = gd(min(dl, 800)) - gd(639) if dl >= 640 else None   # 둘째 겨울(날 640 = 2년 12월 1일 ~ 판 끝) 죽음 전부
        x['fdW2'] = g(min(last, 800)) - g(639) if last >= 640 else None
        x['otherW2'] = (x['deadW2'] - x['fdW2']) if x.get('deadW2') is not None and x.get('fdW2') is not None else None   # 굶음 밖 죽음(늙음 · 인구 식 K 위 · 그 밖)
    x['empty400'] = o['emptyAt'].get(400, 0) if o['emptyAt'] is not None else None; x['empty800'] = o['emptyAt'].get(800, 0) if days and days[-1] >= 800 else None
    if days:
        pk = max(days, key=lambda d: (P[d], -d)); x['peak'] = P[pk]; x['peakDay'] = pk
        x['drop'] = round(100 * (P[pk] - P[days[-1]]) / P[pk], 1)
        run = 0; dd = 0; ddDay = None; dd2 = 0; dd2Day = None
        for d in days:
            run = max(run, P[d]); f = (run - P[d]) / run if run else 0
            if f > dd: dd, ddDay = f, d
            if 365 <= d <= 729 and f > dd2: dd2, dd2Day = f, d
        x['maxDD'] = round(100 * dd, 1); x['maxDDDay'] = ddDay; x['dd2'] = round(100 * dd2, 1); x['dd2Day'] = dd2Day
        for D in (400, 800):   # 그 날까지 판의 꼭대기 뒤 내림(T1319 자 — 날 400 판의 꼭대기 → 날 400)
            dd_ = [d for d in days if d <= D]
            if dd_ and dd_[-1] >= D:
                pkD = max(dd_, key=lambda d: (P[d], -d)); x[f'drop{D}'] = round(100 * (P[pkD] - P[dd_[-1]]) / P[pkD], 1)
    for y in (1, 2, 3):
        for si in range(4): x[f'born{y}{si}'] = o['bornYS'].get((y, si), 0)
        x[f'low{y}'] = round(100 * o['low'][y] / o['vd'][y], 1) if o['vd'][y] else None
    return x

def main():
    A = sys.argv[1:]; out = A[A.index('--out') + 1] if '--out' in A else os.path.dirname(os.path.abspath(__file__))
    M = json.load(open(A[0]))
    D = {}
    for arm, v in M.items():
        for s, e in v['seeds'].items():
            e = dict(e); e['seed'] = s; D[(arm, s)] = seed_data(e)
    SEEDS = ['1020', '7', '42']
    T = {}
    for arm, v in M.items():
        T[arm] = {'label': v['label'], 'world': v.get('world'), 'aut': v.get('aut'), 'seeds': {}}
        for s in v['seeds']:
            T[arm]['seeds'][s] = stats(D[(arm, s)], D.get(('off', s)))
    json.dump(T, open(os.path.join(out, 't1334-table.json'), 'w'), ensure_ascii=False, indent=1)
    f3 = lambda x: '—' if x is None else f'{x:.3f}'
    i0 = lambda x: '—' if x is None else f'{x:,}'
    md = []
    md.append('| 팔 | 시드 | 인구 날 400 · 600 · 800(명) | 끔비 400 · 600 · 800 | 2년째 평균 인구(끔비) | 굶어 죽음 1 · 2 · 3년째(명) | 빈 마을 400 · 800 | 꼭대기(날) | 꼭대기 뒤 내림 · 가장 큰 내림(날) · 2년째 가장 큰 내림 % | 가을 난 사람 1 · 2년째 | 곳간 10일치 밑 마을-날 % 1 · 2년째 |')
    md.append('|---|---|---|---|---|---|---|---|---|---|---|')
    for arm, v in T.items():
        for s in SEEDS:
            x = v['seeds'].get(s)
            if not x: continue
            md.append(f"| {v['label']} | {s} | {i0(x['p400'])} · {i0(x['p600'])} · {i0(x['p800'])} | {f3(x['r400'])} · {f3(x['r600'])} · {f3(x['r800'])} | "
                      f"{i0(round(x['avgY2'])) if x['avgY2'] else '—'}({f3(x['rAvgY2'])}) | {i0(x['fdY1'])} · {i0(x['fdY2'])} · {i0(x['fdY3'])} | {'—' if x['empty400'] is None else x['empty400']} · {'—' if x['empty800'] is None else x['empty800']} | "
                      f"{i0(x.get('peak'))}({x.get('peakDay')}) | {x.get('drop')} · {x.get('maxDD')}({x.get('maxDDDay')}) · {x.get('dd2')} | {i0(x['born12'])} · {i0(x['born22'])} | {x['low1']} · {x['low2']} |")
    # 철마다 난 사람(해 × 철)
    md2 = ['| 팔 | 시드 | ' + ' | '.join(f'{y}년 {SN[si]}' for y in (1, 2) for si in range(4)) + ' | 3년 봄(5월 10일까지) |', '|---|---|' + '---:|' * 9]
    for arm, v in T.items():
        for s in SEEDS:
            x = v['seeds'].get(s)
            if not x: continue
            md2.append(f"| {v['label']} | {s} | " + ' | '.join(i0(x[f'born{y}{si}']) for y in (1, 2) for si in range(4)) + f" | {i0(x['born30'])} |")
    open(os.path.join(out, 't1334-table.md'), 'w').write('\n'.join(md) + '\n\n**철마다 난 사람(명 · econ 출생 줄 `bornE` · 해 × 철)**\n\n' + '\n'.join(md2) + '\n')
    # 가을 출생 판정 자료 — mig 대 1 · 같은 날짜(3 · 6 · 9 · 12월 1일)
    Q = [(0, '1년 3월 1일'), (92, '1년 6월 1일'), (184, '1년 9월 1일'), (275, '1년 12월 1일'), (365, '2년 3월 1일'), (457, '2년 6월 1일'), (549, '2년 9월 1일'), (640, '2년 12월 1일'), (730, '3년 3월 1일')]
    pairs = [(a, b) for a in T for b in T if T[a].get('aut') == 'mig' and T[b].get('aut') == '1' and T[a].get('world') == T[b].get('world')]
    am = []; AJ = {}
    for a, b in pairs:
        w = T[a]['world']; AJ[w] = {'mig': a, '1': b, 'rows': [], 'year': {}}
        am.append(f"\n**{w} — 가을 문 `mig`(이주 문만) : `1`(출생 + 이주) · 세 시드 합**\n")
        am.append('| 날짜(날) | 인구 mig : 1(명) | 굶어 죽음 누계 mig : 1(명) | 그 철 굶어 죽음 mig : 1 | 그 철 죽음 전부 mig : 1 | 산 아이(판에서 난 사람) mig : 1 | 돌 안 된 아이(365날 안에 난 산 사람) mig : 1 | 그 철 난 사람 mig : 1 |')
        am.append('|---|---|---|---|---|---|---|---|')
        prevd = None
        for d, lab in Q:
            def S(arm, f):
                t = 0; ok = False
                for s in SEEDS:
                    o = D.get((arm, s))
                    if not o: continue
                    v = f(o, s)
                    if v is not None: t += v; ok = True
                return t if ok else None
            pop = lambda arm: S(arm, lambda o, s: o['pop'].get(d) if d else (o['pop'].get(1)))
            fdc = lambda arm: S(arm, lambda o, s: o['fdcum'].get(d, 0) if (o['fdcum'] and d <= max(o['fdcum'])) else None)
            fdq = lambda arm: S(arm, lambda o, s: (o['fdcum'].get(d, 0) - o['fdcum'].get(prevd, 0)) if (o['fdcum'] and prevd is not None and d <= max(o['fdcum'])) else None)
            kid = lambda arm, k: S(arm, lambda o, s: (o['kid'].get(d) or o['kid'].get(d + 1) or {}).get(k))
            bq = lambda arm: S(arm, lambda o, s: o['bornYS'].get((date_of(prevd)[0], SEASON(date_of(prevd)[1])), 0) if prevd is not None else None)   # 그 철(앞 날짜 ~ 이 날짜) 난 사람 = econ 출생 줄
            dq = lambda arm: S(arm, lambda o, s: (o['deadcum'].get(d, 0) - o['deadcum'].get(prevd, 0)) if (o.get('deadcum') and prevd is not None and d <= max(o['deadcum'])) else None)   # 그 철 죽음 전부(판 JSON 죽음 누계)
            row = {'day': d, 'label': lab, 'pop': [pop(a), pop(b)], 'fdcum': [fdc(a), fdc(b)], 'fdq': [fdq(a), fdq(b)], 'kids': [kid(a, 'bornAlive'), kid(b, 'bornAlive')],
                   'kids365': [kid(a, 'born365'), kid(b, 'born365')], 'bornQ': [bq(a), bq(b)], 'deadQ': [dq(a), dq(b)]}
            AJ[w]['rows'].append(row)
            pr = lambda p: f"{i0(p[0])} : {i0(p[1])}"
            am.append(f"| {lab}({d}) | {pr(row['pop'])} | {pr(row['fdcum'])} | {pr(row['fdq']) if prevd is not None else '—'} | {pr(row['deadQ']) if prevd is not None else '—'} | {pr(row['kids'])} | {pr(row['kids365'])} | {pr(row['bornQ']) if prevd is not None else '—'} |")
            prevd = d
        ya = lambda arm, lo, hi: S2(arm, lo, hi)
        def S2(arm, lo, hi):
            t = 0
            for s in SEEDS:
                o = D.get((arm, s))
                if not o: return None
                v = [o['pop'][dd] for dd in range(lo, hi + 1) if dd in o['pop']]
                if not v: return None
                t += sum(v) / len(v)
            return t
        def D2(arm, lo, hi):
            t = 0
            for s in SEEDS:
                o = D.get((arm, s))
                if not o or not o.get('deadcum'): return None
                dc = o['deadcum']; t += dc.get(hi, dc[max(dc)]) - dc.get(lo - 1, 0)
            return t
        def F2(arm, lo, hi):
            t = 0
            for s in SEEDS:
                o = D.get((arm, s))
                if not o or not o['fdcum']: return None
                t += o['fdcum'].get(hi, max(o['fdcum'].values())) - o['fdcum'].get(lo - 1, 0)
            return t
        for key, lo, hi, lab in [('y1', 1, 364, '1년째(날 1 ~ 364)'), ('y2', 365, 729, '2년째(날 365 ~ 729)'), ('last365', 436, 800, '판 끝 365날(날 436 ~ 800)')]:
            pa, pb, fa, fb = ya(a, lo, hi), ya(b, lo, hi), F2(a, lo, hi), F2(b, lo, hi)
            AJ[w]['year'][key] = {'avgPop': [pa, pb], 'famine': [fa, fb], 'dead': [D2(a, lo, hi), D2(b, lo, hi)]}
        am.append('')
        am.append('| 한 해 | 평균 인구 mig : 1(명 · 세 시드 합) | mig ÷ 1 | 굶어 죽음 mig : 1(명) | 죽음 전부 mig : 1(명) |')
        am.append('|---|---|---|---|---|')
        for key, lab in [('y1', '1년째(날 1 ~ 364)'), ('y2', '2년째(날 365 ~ 729)'), ('last365', '판 끝 365날(날 436 ~ 800)')]:
            yv = AJ[w]['year'][key]; pa, pb = yv['avgPop']; fa, fb = yv['famine']
            da, db = yv['dead']
            am.append(f"| {lab} | {i0(round(pa)) if pa else '—'} : {i0(round(pb)) if pb else '—'} | {f3(pa / pb) if pa and pb else '—'} | {i0(fa)} : {i0(fb)} | {i0(da)} : {i0(db)} |")
    open(os.path.join(out, 't1334-autumn.md'), 'w').write('\n'.join(am).strip() + '\n')
    # 켬 기본 권고표(두 해 판) — 목표 넷을 날 400 · 날 800 · 2년째 평균으로 · T1302 포함 줄은 자리만
    #   목표 넷(T1319 자 그대로): ① 1020 끔비 ≥ 1.10(묶음 세계 자) ② 세 시드 끔비 ≥ 0.98 ③ 꼭대기 뒤 내림 ≤ 10% ④ 굶어 죽음 ≤ 같은 시드 끔(판 끝까지 누계)
    #   둘째 해 무너짐 = 2년째 가장 큰 내림 > 10% · 끔보다 못해짐 = 날 600 · 800 · 2년째 평균 끔비 가운데 하나라도 < 1.000
    RJ = []
    rc = ['| 조합 | 끔비 날 400(1020 · 7 · 42) | 끔비 날 800 | 2년째 평균 끔비 | 꼭대기 뒤 내림 % · 2년째 가장 큰 내림 % | 굶어 죽음 2년째(끔) | 굶어 죽음 800날 누계(끔) | 빈 마을 800 | 목표 넷 날 400 | 목표 넷 날 800 | 둘째 해 무너짐 · 끔보다 못해짐 |',
          '|---|---|---|---|---|---|---|---|---|---|---|']
    def goals(arm, key):
        xs = [T[arm]['seeds'].get(sd) for sd in SEEDS]; bs = [T['off']['seeds'].get(sd) for sd in SEEDS] if 'off' in T else [None] * 3
        if not all(xs) or not all(bs): return None
        rk = 'r' + key
        g1 = xs[0][rk] is not None and xs[0][rk] >= 1.10
        g2 = all(x[rk] is not None and x[rk] >= 0.98 for x in xs)
        g3 = all(x.get('drop' + key) is not None and x.get('drop' + key) <= 10 for x in xs)
        fk = lambda x: x.get('fd' + key)
        g4 = all(fk(x) is not None and fk(b) is not None and fk(x) <= fk(b) for x, b in zip(xs, bs)) if all(fk(x) is not None for x in xs + bs) else None
        return [g1, g2, g3, g4]
    mk = lambda g: '—' if g is None else ' · '.join('○' if v else ('✗' if v is not None else '—') for v in g)
    for arm, v in T.items():
        if arm == 'off': continue
        xs = [v['seeds'].get(sd) for sd in SEEDS]
        if not all(xs): continue
        bs = [T['off']['seeds'].get(sd) for sd in SEEDS] if 'off' in T else [None] * 3
        if not all(bs): continue   # 끔 판이 다 없으면 끔비 · 목표를 못 잰다
        g4, g8 = goals(arm, '400'), goals(arm, '800')
        coll = any((x.get('dd2') or 0) > 10 for x in xs); worse = any(any((x[k] is not None and x[k] < 1.0) for k in ('r600', 'r800', 'rAvgY2')) for x in xs)
        all8 = bool(g8) and all(g8)
        RJ.append({'arm': arm, 'label': v['label'], 'world': v.get('world'), 'aut': v.get('aut'), 'g400': g4, 'g800': g8, 'all800': all8, 'collapse2': coll, 'worseThanOff': worse,
                   'r400': [x['r400'] for x in xs], 'r800': [x['r800'] for x in xs], 'rAvgY2': [x['rAvgY2'] for x in xs], 'drop': [x.get('drop') for x in xs], 'dd2': [x.get('dd2') for x in xs],
                   'fdY2': [x['fdY2'] for x in xs], 'fdY2off': [b['fdY2'] for b in bs], 'famine': [x['famine'] for x in xs], 'famineOff': [b['famine'] for b in bs], 'empty800': [x['empty800'] for x in xs]})
        nm = f"**{v['label']}**" if all8 else v['label']
        rc.append(f"| {nm} | {' · '.join(f3(x['r400']) for x in xs)} | {' · '.join(f3(x['r800']) for x in xs)} | {' · '.join(f3(x['rAvgY2']) for x in xs)} | "
                  f"{' · '.join(str(x.get('drop')) for x in xs)} / {' · '.join(str(x.get('dd2')) for x in xs)} | {' · '.join(i0(x['fdY2']) for x in xs)}({' · '.join(i0(b['fdY2']) for b in bs)}) | "
                  f"{' · '.join(i0(x['famine']) for x in xs)}({' · '.join(i0(b['famine']) for b in bs)}) | {' · '.join('—' if x['empty800'] is None else str(x['empty800']) for x in xs)} | {mk(g4)} | {mk(g8)} | {'✗' if coll else '○'} · {'✗' if worse else '○'} |")
    rc.append('| 묶음 + … + **T1302**(영토를 몸이) — 자리 | (T1318 · T1329 수) | (자리) | (자리) | (자리) | (자리) | (자리) | (자리) | (자리) | (자리) | (자리) |')
    rc.append('')
    rc.append('* 목표 넷(T1319 자 그대로) — ① 1020 끔비 ≥ 1.10(묶음 세계의 자 · 끔 세계 줄은 늘 ✗) ② 세 시드 끔비 ≥ 0.98 ③ 꼭대기 뒤 내림 ≤ 10%(그 날까지의 꼭대기 → 그 날) ④ 굶어 죽음 ≤ 같은 시드 끔(그 날까지 누계 — 날 400 · 날 800) · 굵은 줄 = 날 800 에 넷 다 ○')
    rc.append('* 둘째 해 무너짐 = 2년째(날 365 ~ 729) 안에서 앞선 꼭대기(1년째 꼭대기 포함)에서 10% 넘게 떨어진 시드가 있다 · 끔보다 못해짐 = 날 600 · 800 · 2년째 평균 가운데 끔비 < 1.000 인 시드가 있다(○ = 없다)')
    rc.append('* T1302 포함 줄 — 묶음에 T1302(영토를 몸이 · 관측자 없는 개간 · 말뚝)를 넣으면 끔비가 1.39 → 1.06(T1318 중간 · 일감 몸 하나 — T1329 S13 이 고치는 중). 이 카드 판은 T1302 없이 — T1318 · T1329 판 수가 오면 이 줄에 받아 적는다.')
    open(os.path.join(out, 't1334-reco.md'), 'w').write('\n'.join(rc) + '\n')
    json.dump(RJ, open(os.path.join(out, 't1334-reco.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(AJ, open(os.path.join(out, 't1334-autumn.json'), 'w'), ensure_ascii=False, indent=1)
    print('arms', {k: sorted(v['seeds']) for k, v in T.items()})

if __name__ == '__main__':
    main()
