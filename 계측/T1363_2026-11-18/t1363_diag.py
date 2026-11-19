#!/usr/bin/env python3
# T1363 ① 진단 — 굶주림 ↔ 도구 나선 — 마을-날 줄(t1363 훅 · 랩 자 t1363lab)만 읽는다(세계 0)
#   실행: python3 t1363_diag.py <판 이름=마을-날 JSON> … [--out <json>] [--maxyear 2(두 해만)]
#   칸(마을-날 · 도구 쓰는 일꾼 > 0 인 마을만):
#     · 도구 몫 0.5 밑 마을-날 · 그 날들의 굶어 죽음 몫(굶어 죽음은 마을 누계 `fdTot` 의 날 차)
#     · 나선 — 마을마다 한 해 안 굶어 죽음이 난 마을의 "나선 시작 날" = 그 해 첫 굶어 죽음 앞 120날 안에서
#       처음으로 기근 블록(곳간 < 사람 × 30) ∧ 도구 몫 < 0.5 가 함께 선 날(없으면 나선 아님)
#     · 그 날 앞뒤 30날 — 석공 수 · 석공 목표 · 돌 · 재료 문턱 · 만든 석기 · 생산 도구 배수 · 식량 흐름 K ·
#       피커가 낸 일(`need`)과 그날 옮긴 사람 '옛 일>새 일' 수(`moves`)
import json, sys, collections, statistics
A = sys.argv[1:]
OUT = A[A.index('--out') + 1] if '--out' in A else None
MAXY = int(A[A.index('--maxyear') + 1]) if '--maxyear' in A else 3   # 몇 해째까지 보나(두 해 = 2)
RUNS = [a for a in A if '=' in a and not a.startswith('--')]

def load(p):
    J = json.load(open(p)); C = {c: i for i, c in enumerate(J['cols'])}
    names = J['names']; V = collections.defaultdict(dict)
    for r in J['rows']: V[r[C['v']]][r[C['day']]] = r
    return J, C, names, V

def diag(tag, p):
    J, C, names, V = load(p)
    g = lambda r, k: r[C[k]] if k in C else None
    days_low = days_all = 0; fd_low = fd_all = 0
    spirals = []; famine_vy = 0
    for v, D in V.items():
        ds = sorted(D); prevF = None
        fdd = {}
        for d in ds:
            r = D[d]; f = g(r, 'fdTot') or 0
            fdd[d] = max(0, f - prevF) if prevF is not None else 0; prevF = f
            cov = g(r, 'toolCov')
            if cov is None or d > 365 * MAXY - 1: continue   # 도구 몫 칸은 본 해까지만 센다
            days_all += 1; fd_all += fdd[d]
            if cov < 0.5: days_low += 1; fd_low += fdd[d]
        for y in range(1, MAXY + 1):
            lo, hi = 365 * (y - 1), 365 * y - 1
            dd = [d for d in ds if lo <= d <= hi and fdd.get(d, 0) > 0]
            if not dd: continue
            famine_vy += 1
            d0 = dd[0]; tot = sum(fdd[d] for d in ds if lo <= d <= hi)
            st = next((d for d in ds if d0 - 120 <= d <= d0 and g(D[d], 'famine') == 1 and (g(D[d], 'toolCov') if g(D[d], 'toolCov') is not None else 9) < 0.5), None)
            rec = {'v': names[v], 'year': y, 'firstDeath': d0, 'deaths': tot, 'spiral': st}
            if st is not None:
                def win(a, b, k):
                    xs = [g(D[d], k) for d in ds if a <= d <= b and g(D[d], k) is not None]
                    return round(statistics.mean(xs), 3) if xs else None
                rec.update({k + '_pre': win(st - 30, st - 1, k) for k in ('N', 'toolCov', 'toolBoost', 'n_mason', 'masonT', 'stone', 'stoneWork', 'toolMade', 'kProd', 'foodDays', 'n_forager', 'n_farmer')})
                rec.update({k + '_post': win(st, st + 30, k) for k in ('N', 'toolCov', 'toolBoost', 'n_mason', 'masonT', 'stone', 'stoneWork', 'toolMade', 'kProd', 'foodDays', 'n_forager', 'n_farmer')})
                need = collections.Counter(); did = collections.Counter()
                for d in ds:
                    if st - 30 <= d <= st + 30:
                        n_ = g(D[d], 'need')
                        if n_: need[n_] += 1
                        mv = g(D[d], 'moves')   # 그날 옮긴 사람 '옛 일>새 일' 수(t1363 훅) — 없으면(랩 자) `did`
                        if isinstance(mv, dict):
                            for kk, c in mv.items(): did[kk] += c
                        else:
                            w_ = g(D[d], 'did')
                            if w_: did[w_ if not str(w_).startswith('hold') else 'hold'] += 1
                rec['need'] = dict(need.most_common()); rec['did'] = dict(did.most_common())
                rec['needStart'] = g(D[st], 'need'); mv0 = g(D[st], 'moves'); rec['movesStart'] = mv0 if isinstance(mv0, dict) else None   # 나선 시작 날 그날 피커가 낸 일 · 그날 옮긴 사람
                rec['masonOut'] = sum(c for kk, c in did.items() if kk.startswith('mason>')); rec['masonIn'] = sum(c for kk, c in did.items() if kk.endswith('>mason'))
            spirals.append(rec)
    sp = [s for s in spirals if s['spiral'] is not None]
    res = {'tag': tag, 'lowDays': days_low, 'allDays': days_all, 'fdLow': fd_low, 'fdAll': fd_all,
           'famineVillageYears': famine_vy, 'spiralVillageYears': len(sp),
           'spiralDeaths': sum(s['deaths'] for s in sp), 'famineDeaths': sum(s['deaths'] for s in spirals),
           'spiralStartMedian': statistics.median([s['spiral'] for s in sp]) if sp else None,
           'spirals': sorted(spirals, key=lambda s: -s['deaths'])}
    agg_need = collections.Counter(); agg_did = collections.Counter()
    for s in sp:
        for k, c in (s.get('need') or {}).items(): agg_need[k] += c
        for k, c in (s.get('did') or {}).items(): agg_did[k] += c
    res['needAgg'] = dict(agg_need.most_common()); res['didAgg'] = dict(agg_did.most_common())
    res['needStartAgg'] = dict(collections.Counter(s['needStart'] or '없음' for s in sp).most_common())   # 나선 시작 날 그날 피커가 낸 일(없음 = 그날 전환 문 안 섬)
    ms = collections.Counter()
    for s in sp:
        for k, c in (s.get('movesStart') or {}).items(): ms[k] += c
    res['movesStartAgg'] = dict(ms.most_common())
    for k in ('toolCov', 'n_mason', 'masonT', 'stone', 'toolMade', 'foodDays', 'N'):   # 나선 시작 앞 30날 · 뒤 30날 평균의 중앙(나선 마을-해)
        pre = [s[k + '_pre'] for s in sp if s.get(k + '_pre') is not None]; post = [s[k + '_post'] for s in sp if s.get(k + '_post') is not None]
        res[k + 'PreMed'] = round(statistics.median(pre), 3) if pre else None; res[k + 'PostMed'] = round(statistics.median(post), 3) if post else None
    return res

R = [diag(t, p) for t, p in (a.split('=', 1) for a in RUNS)]
for r in R:
    print(f"== {r['tag']} — 도구 몫 0.5 밑 마을-날 {r['lowDays']:,}/{r['allDays']:,} · 그 날 굶어 죽음 {r['fdLow']}/{r['fdAll']} · "
          f"굶은 마을-해 {r['famineVillageYears']} · 나선 {r['spiralVillageYears']}(굶음 {r['spiralDeaths']}/{r['famineDeaths']}) · 나선 시작 날 중앙 {r['spiralStartMedian']}")
    print('   피커가 낸 일(나선 시작 ±30날):', r['needAgg'], '· 옮긴 사람 옛 일:', r['didAgg'])
    print('   나선 시작 날 그날 — 피커가 낸 일:', r['needStartAgg'], '· 옮긴 사람:', r['movesStartAgg'])
    print('   앞 30날 → 뒤 30날 중앙:', ' · '.join(f"{k} {r[k + 'PreMed']} → {r[k + 'PostMed']}" for k in ('toolCov', 'n_mason', 'masonT', 'stone', 'toolMade', 'foodDays', 'N')))
    for s in r['spirals'][:8]:
        print('  ', {k: s[k] for k in s if k not in ('need', 'did')}, s.get('need'), s.get('did'))
if OUT: json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1)
