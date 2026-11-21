#!/usr/bin/env python3
# T1405 진단 · 판 표 — 마을-날 줄(t1405 훅)만 읽는다(세계 0)
#   실행: python3 t1405_diag.py <팔=시드=마을-날 JSON> … [--out <json>]
#   칸(해마다 · 날 0 ~ 364 = 1년째 …):
#     · 떠난 사람(econ `_emigTot` 차) · 0.25 밑 마을-날(사람 > 0) · 굶어 죽음 · 세계 인구(해 끝 날) · 빈 마을(사람 ≥ 5 였다가 0) · 가장 큰 다섯(해 안 가장 큰 사람) · 200명 넘은 마을
#     · 누가 떠났나 — 떠난 마을-날을 그날 마을 크기(100명 넘음 · 50명 밑 · 그 사이) × 까닭(부담 B ≥ 겪은 일 E = 붐빔 · 아니면 굶주림 기억)으로 가른다
#       (+ 그 앞 30날 굶어 죽음이 있던 마을 · 그 앞 30날 들어온 사람이 있던 마을)
#     · 큰 마을(그 해 떠난 사람이 가장 많은 열 곳) — 처음 0.25 밑에 닿기 앞 30날: 난 사람 · 자연사 · 들어온 사람 · 출생 깎인 몫(행복 항 ÷ 깎기 앞 몫) · 영토 ÷ 목표 영토 · B · S · K 셋
#     · 받아서 0.25 밑 — 그날 들어온 사람이 있고 전날 h ≥ 0.25 · 그날 h < 0.25 인 마을-날(받는 쪽이 받아서 붐빈 날)
#     · 0.25 밑 마을-날도 같은 두 갈래(크기 × 까닭)로 · 그 날 모자란 깊이(0.25 − h) 평균 · 도구 몫(있으면 — T1363 칸) 0.5 밑 마을-날과 그 날 굶어 죽음
#     · 판 줄(그림 · 30날 칸): 떠난 사람 · 0.25 밑 마을-날 · 가장 큰 마을 사람 · 200명 넘는 마을 수 · 세계 인구
import json, sys, collections, statistics
A = sys.argv[1:]
OUT = A[A.index('--out') + 1] if '--out' in A else None
RUNS = [a for a in A if a.count('=') >= 2 and not a.startswith('--')]
YR = lambda d: d // 365 + 1

def load(p):
    J = json.load(open(p)); C = {c: i for i, c in enumerate(J['cols'])}
    V = collections.defaultdict(list)
    for r in J['rows']: V[r[C['v']]].append(r)
    return J, C, V

def run(arm, seed, p):
    J, C, V = load(p); g = lambda r, k: r[C[k]]
    names = J['names']; last = J.get('last') or 0
    res = {'arm': arm, 'seed': seed, 'last': last, 'years': {}}
    yrs = sorted(set(YR(g(r, 'day')) for r in J['rows']))
    for y in yrs:
        lo, hi = 365 * (y - 1), 365 * y - 1
        full = last >= hi
        emig = u25 = fd = born = imm = nat = kov = 0
        groups = collections.Counter(); grpN = collections.Counter(); kinds = collections.Counter()
        u25g = collections.Counter(); u25d = []; lowTool = lowToolFd = toolDays = 0
        recvPush = 0; recvPushN = 0
        maxN = {}; popEnd = 0; endDay = min(hi, last)
        per = collections.Counter()
        for vi, rows in V.items():
            prevH = None; hist = []
            for r in rows:
                d = g(r, 'day')
                if d < lo - 30:
                    continue
                if d > hi: break
                if d < lo:
                    hist.append(r); prevH = g(r, 'h'); continue
                N = g(r, 'N') or 0; h = g(r, 'h'); e = g(r, 'emig') or 0
                emig += e; fd += g(r, 'fd') or 0; born += g(r, 'born') or 0; imm += g(r, 'imm') or 0; nat += g(r, 'nat') or 0; kov += g(r, 'kov') or 0
                if N > 0 and h is not None and h < 0.25:
                    u25 += 1; u25d.append(0.25 - h)
                    u25g[('big' if N > 100 else ('small' if N < 50 else 'mid'), 'B' if (g(r, 'B') or 0) >= (g(r, 'E') or 0) else 'E')] += 1
                tcv = g(r, 'tc') if 'tc' in C else None
                if tcv is not None and N > 0:
                    toolDays += 1
                    if tcv < 0.5: lowTool += 1; lowToolFd += g(r, 'fd') or 0
                maxN[vi] = max(maxN.get(vi, 0), N)
                if d == endDay: popEnd += N
                if (g(r, 'imm') or 0) > 0 and prevH is not None and prevH >= 0.25 and h is not None and h < 0.25: recvPush += 1; recvPushN += g(r, 'imm') or 0
                if e > 0:
                    per[vi] += e
                    size = 'big' if N > 100 else ('small' if N < 50 else 'mid')
                    B = g(r, 'B') or 0; E = g(r, 'E') or 0
                    why = 'B' if B >= E else 'E'
                    groups[(size, why)] += e
                    fd30 = sum((g(q, 'fd') or 0) for q in hist[-30:]); im30 = sum((g(q, 'imm') or 0) for q in hist[-30:])
                    if fd30 > 0: kinds['fd30'] += e
                    if im30 > 0: kinds['imm30'] += e
                    if B >= 0.3: kinds['B03'] += e
                prevH = h; hist.append(r)
                if len(hist) > 40: hist = hist[-40:]
        # 빈 마을(사람 ≥ 5 → 0 · 그 해 안)
        emptied = []
        for vi, rows in V.items():
            seen5 = False
            for r in rows:
                d = g(r, 'day')
                if d > hi: break
                N = g(r, 'N') or 0
                if N >= 5: seen5 = True
                if seen5 and N == 0 and d >= lo: emptied.append((names[vi], d)); break
        top = sorted(maxN.items(), key=lambda t: -t[1])[:5]
        res['years'][y] = {'full': full, 'emig': emig, 'u25': u25, 'fd': fd, 'born': born, 'imm': imm, 'nat': nat, 'kov': kov, 'popEnd': popEnd if full else None,
                           'top5': [(names[v], n) for v, n in top], 'over200': sum(1 for v, n in maxN.items() if n > 200),
                           'groups': {f'{a}|{b}': c for (a, b), c in groups.items()}, 'kinds': dict(kinds), 'recvPush': recvPush, 'recvPushN': recvPushN,
                           'emptied': emptied, 'topLeave': [(names[v], c) for v, c in per.most_common(10)], 'leaveVillages': len(per),
                           'u25g': {f'{a}|{b}': c for (a, b), c in u25g.items()}, 'u25depth': round(statistics.mean(u25d), 4) if u25d else None,
                           'lowTool': lowTool if toolDays else None, 'lowToolFd': lowToolFd if toolDays else None, 'toolDays': toolDays or None}
    # 판 줄(30날 칸) — 그림 · 표
    S = collections.defaultdict(lambda: {'emig': 0, 'u25': 0, 'maxN': 0, 'over200': 0, 'pop': 0, 'fd': 0, 'days': set()})
    for vi, rows in V.items():
        for r in rows:
            d = g(r, 'day'); b = S[d // 30]; N = g(r, 'N') or 0; h = g(r, 'h')
            b['emig'] += g(r, 'emig') or 0; b['fd'] += g(r, 'fd') or 0
            if N > 0 and h is not None and h < 0.25: b['u25'] += 1
            b['maxN'] = max(b['maxN'], N)
    byDay = collections.defaultdict(lambda: [0, 0, 0])   # 날 → 세계 인구 · 가장 큰 마을 · 200 넘는 마을 수
    for vi, rows in V.items():
        for r in rows:
            d = g(r, 'day'); N = g(r, 'N') or 0; x = byDay[d]; x[0] += N; x[1] = max(x[1], N); x[2] += 1 if N > 200 else 0
    def popAt(k):
        ds = [d for d in range(k * 30, k * 30 + 30) if d in byDay]
        return byDay[max(ds)][0] if ds else None
    res['series'] = [{'bin': k, 'd0': k * 30, 'emig': S[k]['emig'], 'u25': S[k]['u25'], 'fd': S[k]['fd'], 'maxN': S[k]['maxN'], 'pop': popAt(k),
                      'over200': max((byDay[d][2] for d in range(k * 30, k * 30 + 30) if d in byDay), default=0)} for k in sorted(S)]
    res['maxNever'] = max((x[1] for x in byDay.values()), default=0)
    res['maxNdays200'] = sum(1 for x in byDay.values() if x[2] > 0)
    # 큰 마을(판에서 한 번이라도 180명 넘음) — 가장 컸던 날: 무엇이 세웠나(h · S · B · 영토 ÷ 인구 목표 식 · K 셋 중 묶은 항)
    #   인구 목표 식 = ⌈인구 ÷ 6⌉ × 600 + 1,500(랩 · 서버 영토 상한 `_terrCap` 의 그 식 — T1380 카드 합격선의 "목표 식(그 마을 인구)")
    big = []
    for vi, rows in V.items():
        rs = [r for r in rows if (g(r, 'N') or 0) > 0]
        if not rs: continue
        m = max(rs, key=lambda r: (g(r, 'N'), -g(r, 'day')))
        if g(m, 'N') <= 180: continue
        N = g(m, 'N'); Tp = -(-N // 6) * 600 + 1500
        K3 = {'자리': g(m, 'Kslot'), '식량 흐름': g(m, 'Kprod'), '땔감': g(m, 'Kfuel')}
        kb = min((k for k in K3 if K3[k] is not None), key=lambda k: K3[k], default=None)
        late = [r for r in rs if g(r, 'day') >= max(0, last - 120)]
        big.append({'v': names[vi], 'N': N, 'day': g(m, 'day'), 'h': g(m, 'h'), 'S': g(m, 'S'), 'B': g(m, 'B'), 'G': g(m, 'G'), 'T': g(m, 'T'), 'Tpop': Tp,
                    'TperTpop': round(g(m, 'T') / Tp, 3) if g(m, 'T') else None, 'K': g(m, 'K'), 'Kbind': kb, 'Kslot': K3['자리'], 'Kprod': K3['식량 흐름'], 'Kfuel': K3['땔감'],
                    'hLate': round(statistics.mean([g(r, 'h') for r in late if g(r, 'h') is not None]), 3) if late else None,
                    'u25': sum(1 for r in rs if g(r, 'h') is not None and g(r, 'h') < 0.25), 'emig': sum(g(r, 'emig') or 0 for r in rs)})
    res['big'] = sorted(big, key=lambda b: -b['N'])
    # 주고받기 — 들어온 사람 가운데 받은 마을이 그 앞뒤 30날 안에 제 사람을 떠나보낸 몫(받는 쪽 문이 "더 행복한가"만 볼 때 붐빈 마을끼리 오가는 사람)
    for y in res['years']:
        lo, hi = 365 * (y - 1), 365 * y - 1; tot = pp = 0
        for vi, rows in V.items():
            em = [g(r, 'day') for r in rows if (g(r, 'emig') or 0) > 0]
            for r in rows:
                d = g(r, 'day'); im = g(r, 'imm') or 0
                if d < lo or d > hi or not im: continue
                tot += im
                if any(abs(e - d) <= 30 for e in em): pp += im
        res['years'][y]['immTot'] = tot; res['years'][y]['immToSender'] = pp
    # 영토 ÷ 인구 목표 식 — 해마다 큰 마을(100명 넘음) 마을-날 평균 · 떠난 날(붐빔 무리) 평균
    for y in res['years']:
        lo, hi = 365 * (y - 1), 365 * y - 1; a = []; b = []
        for vi, rows in V.items():
            for r in rows:
                d = g(r, 'day'); N = g(r, 'N') or 0; T = g(r, 'T')
                if d < lo or d > hi or N <= 100 or not T: continue
                q = T / (-(-N // 6) * 600 + 1500); a.append(q)
                if (g(r, 'emig') or 0) > 0: b.append(q)
        res['years'][y]['terrBig'] = round(statistics.mean(a), 3) if a else None
        res['years'][y]['terrLeave'] = round(statistics.mean(b), 3) if b else None
    # 큰 마을 — 두 해 떠난 사람 위 열 곳: 처음 0.25 밑 앞 30날
    tot = collections.Counter()
    for vi, rows in V.items():
        for r in rows:
            if g(r, 'day') <= 729: tot[vi] += g(r, 'emig') or 0
    tops = []
    for vi, c in tot.most_common(10):
        rows = V[vi]; first = next((r for r in rows if (g(r, 'N') or 0) > 0 and g(r, 'h') is not None and g(r, 'h') < 0.25), None)
        if first is None: continue
        d0 = g(first, 'day'); pre = [r for r in rows if d0 - 30 <= g(r, 'day') < d0]
        def sm(k): return sum((g(r, k) or 0) for r in pre)
        def mn(k):
            xs = [g(r, k) for r in pre if g(r, k) is not None]
            return round(statistics.mean(xs), 3) if xs else None
        cut = []
        for r in pre:
            hp = g(r, 'happy'); oth = (g(r, 'logi') or 0) + (g(r, 'health') or 0) + (g(r, 'prest') or 0)
            if hp is not None and hp < 0 and oth > 0: cut.append(min(1, -hp / oth))
        Ns = [g(r, 'N') for r in rows if g(r, 'day') <= 729]
        N0 = g(first, 'N') or 0; T0 = g(first, 'T')
        tops.append({'v': names[vi], 'leave2y': c, 'firstU25': d0, 'N0': N0, 'T0': T0, 'Tpop0': -(-N0 // 6) * 600 + 1500,
                     'TperTpop0': round(T0 / (-(-N0 // 6) * 600 + 1500), 3) if T0 else None, 'h0': g(first, 'h'), 'S0': g(first, 'S'), 'B0': g(first, 'B'), 'E0': g(first, 'E'),
                     'Nmax2y': max(Ns) if Ns else None, 'Nend': rows[-1][C['N']] if rows else None,
                     'born30': sm('born'), 'nat30': sm('nat'), 'imm30': sm('imm'), 'emig30': sm('emig'), 'fd30': sm('fd'), 'cut30': round(statistics.mean(cut), 3) if cut else None,
                     'B30': mn('B'), 'S30': mn('S'), 'G30': mn('G'), 'E30': mn('E'), 'T30': mn('T'), 'Tt30': mn('Tt'), 'K30': mn('K'), 'Kslot30': mn('Kslot'), 'Kprod30': mn('Kprod'), 'Kfuel30': mn('Kfuel'), 'fdays30': mn('fdays'),
                     'leaveSmall': c if (g(first, 'N') or 0) < 50 else 0})
    res['tops'] = tops
    return res

R = [run(*a.split('=', 2)) for a in RUNS]
for r in R:
    print(f"== {r['arm']} {r['seed']} (날 {r['last']})")
    for y, x in r['years'].items():
        print(f"  {y}년째{'' if x['full'] else '(덜 참)'}: 떠남 {x['emig']} · 0.25 밑 마을-날 {x['u25']} · 굶어 죽음 {x['fd']} · 난 {x['born']} · 들어옴 {x['imm']} · 자연사 {x['nat']} · K 위 {x['kov']} · 해 끝 인구 {x['popEnd']} · "
              f"가장 큰 다섯 {x['top5']} · 200 넘음 {x['over200']} · 빈 마을 {x['emptied']} · 떠난 마을 {x['leaveVillages']} · 받아서 0.25 밑 {x['recvPush']}({x['recvPushN']})")
        print(f"     무리: {x['groups']} · {x['kinds']} · 위 열 {x['topLeave'][:5]}")
        print(f"     0.25 밑 무리: {x['u25g']} · 깊이 {x['u25depth']} · 도구 몫 0.5 밑 마을-날 {x['lowTool']}(그 날 굶음 {x['lowToolFd']}) / {x['toolDays']}")
    print(f"   가장 큰 마을(판 전체) {r['maxNever']} · 200 넘는 마을이 있던 날 {r['maxNdays200']} · 영토 ÷ 인구 목표 식(큰 마을 · 떠난 날) " +
          ' / '.join(f"{y}년 {x.get('terrBig')} · {x.get('terrLeave')}" for y, x in r['years'].items()))
    for b in r['big'][:8]: print('    큰', b)
    for t in r['tops'][:10]: print('   ', t)
if OUT: json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1)
