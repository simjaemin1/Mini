#!/usr/bin/env python3
# T1363 판 표 — 두 해(날 400 · 800) · 세 해(날 1,094) · 해마다 굶음 · K 위 죽음 · 도구 몫 0.5 밑 마을-날 · 마을별 최악 · 끔비 — 마을-날 줄 훅만 읽는다(세계 0)
#   (T1346 표 `계측/T1346_2026-11-17/t1346_table.py` 를 옮겨 t1363 훅 칸을 더했다 — 같은 셈 · 같은 칸 뜻)
#   실행: python3 t1346_table.py <판 지도 JSON> [--out <폴더>] [--base off] [--tag 이름]
#   판 지도 = { "<팔>": { "label": "…", "seeds": { "1020": {"dir": "/tmp/sbc-…", "hook": "t1346"|"t1342"}, … } }, … }
#   훅 셋 가운데 하나(같은 칸 — 사람 = 그 마을 econ 명부 · 창업 마을 밖 · t1373 훅은 도구 몫 칸이 없어 그 칸은 —):
#     · t1363(`계측/T1363_2026-11-18/t1363hook.js`) · t1346(`계측/T1346_2026-11-17/t1346hook.js`) — 30날마다 덮어 쓴다 · 굶음 · K 위 죽음은 마을 누계(`fdTot` · `kovTot`) · 도구 몫(`toolCov`)
#     · t1342(`계측/T1342_2026-11-16/t1342hook.js` · 판 끝에 한 번) — 굶음 · K 위 죽음은 마을-날 차(`fdD` · `kovD`)
#     세계 누계는 마을마다 오른 몫만 더한다(누계가 줄어든 날 — 마을이 명부에서 빠진 날 — 은 0 · 지난 몫은 남는다).
#   칸(T1342 · T1334 표와 같은 뜻):
#     · 인구 날 400 · 800 · 1,094 · 끔비(같은 시드 끔 판 그 날)
#     · 굶어 죽음 1 · 2 · 3년째(날 0 ~ 364 · 365 ~ 729 · 730 ~ 판 끝(≤ 1,094)) · 굶주림 철(날 184 ~ 548) · K 위 죽음 같은 칸
#     · 꼭대기 뒤 내림 % — 그 날까지 꼭대기 → 그 날(날 400 · 800 · 1,094) · 2년째 · 3년째 안 가장 큰 내림(앞선 꼭대기)
#     · 목표 넷(T1342 그대로) — ① 1020 끔비 ≥ 1.10 ② 끔비 ≥ 0.98 ③ 그 날 내림 ≤ 10% ④ 그 날까지 다 찬 해(날 800 = 3년째 70날도)마다 굶음 ≤ 같은 시드 끔
#     · 마을별 최악 — 한 마을 한 해 굶음 ÷ 그 해 그 마을 가장 많은 사람(가장 큰 값 · 마을 · 해) · 굶어서 빈 마을(사람 ≥ 5 → 0 · 앞 60날 그 마을 굶음 ≥ 1) ·
#       한 마을 한 해 가장 큰 내림(그 해 안 앞선 꼭대기 → 가장 낮은 곳 · 꼭대기 ≥ 20명)
import json, os, sys, collections
A = sys.argv[1:]
OUT = A[A.index('--out') + 1] if '--out' in A else os.path.dirname(os.path.abspath(__file__))
BASE = A[A.index('--base') + 1] if '--base' in A else 'off'
TAG = A[A.index('--tag') + 1] if '--tag' in A else 't1363-table'
SEEDS = ['1020', '7', '42']

def load(e, s):
    d, h = e['dir'], e.get('hook', 't1346')
    p = os.path.join(d, f'sbc-{s}.json.{h}.json')
    J = json.load(open(p)); C = {c: i for i, c in enumerate(J['cols'])}
    names = J['names']; nm = lambda v: names[str(v)] if isinstance(names, dict) else names[v]
    P = collections.Counter(); FI = collections.Counter(); KI = collections.Counter(); SW = collections.Counter(); TL = collections.Counter(); TA = collections.Counter(); FL = collections.Counter()
    vN = collections.defaultdict(dict); vF = collections.defaultdict(collections.Counter)
    lastF, lastK = {}, {}
    for r in J['rows']:
        day, v, n = r[C['day']], r[C['v']], r[C['N']] or 0
        P[day] += n; vN[v][day] = n
        if r[C['foodDays']] is not None: SW[day] += r[C['foodDays']] * n   # 사람 가중 곳간 날 수(그림 ③)
        tc = r[C['toolCov']] if 'toolCov' in C else None
        if tc is not None: TA[day] += 1; TL[day] += (1 if tc < 0.5 else 0)   # 도구 몫 0.5 밑 마을-날(도구 쓰는 일꾼 > 0 인 마을)
        if h in ('t1346', 't1363', 't1373'):   # t1373 훅(`계측/T1373_2026-11-18/t1373hook.js`)도 마을 누계 fdTot · kovTot 를 쓴다(도구 몫 칸은 없다 — 표에 —)
            f, k = r[C['fdTot']] or 0, r[C['kovTot']] or 0
            df = max(0, f - lastF.get(v, f)); dk = max(0, k - lastK.get(v, k)); lastF[v] = f; lastK[v] = k
        else:
            df, dk = max(0, r[C['fdD']] or 0), max(0, r[C['kovD']] or 0)
        FI[day] += df; KI[day] += dk; vF[v][day] += df
        if tc is not None and tc < 0.5: FL[day] += df   # 도구 몫 0.5 밑 날의 굶어 죽음
    days = sorted(P)
    return {'days': days, 'P': P, 'FI': FI, 'KI': KI, 'TL': TL, 'TA': TA, 'FL': FL, 'S': {d: SW[d] / P[d] for d in days if P[d]}, 'vN': vN, 'vF': vF, 'nm': nm, 'last': days[-1] if days else 0, 'hasTool': 'toolCov' in C}

def csum(I, lo, hi): return sum(v for d, v in I.items() if lo <= d <= hi)

def stats(o, b):
    P, days, L = o['P'], o['days'], o['last']
    x = {'last': L}
    for D in (400, 800, 1094):
        x[f'p{D}'] = P.get(D) if L >= D else None
        x[f'r{D}'] = round(P[D] / b['P'][D], 3) if (b and L >= D and b['last'] >= D and b['P'].get(D)) else None
    for y, (lo, hi) in ((1, (0, 364)), (2, (365, 729)), (3, (730, 1094))):
        x[f'fdY{y}'] = csum(o['FI'], lo, hi) if L >= lo else None
        x[f'kovY{y}'] = csum(o['KI'], lo, hi) if L >= lo else None
        x[f'full{y}'] = L >= hi
    x['fdSeason'] = csum(o['FI'], 184, 548) if L >= 548 else None
    for y, (lo, hi) in (('2y', (0, 729)), ('y1', (0, 364)), ('y2', (365, 729)), ('y3', (730, 1094))):
        ok_ = L >= lo and o.get('hasTool', True)
        x[f'lowTool{y}'] = csum(o['TL'], lo, hi) if ok_ else None; x[f'allTool{y}'] = csum(o['TA'], lo, hi) if ok_ else None; x[f'fdLow{y}'] = csum(o['FL'], lo, hi) if ok_ else None
    x['kovSeason'] = csum(o['KI'], 184, 548) if L >= 548 else None
    run, dd2, dd3 = 0, 0, 0
    for d in days:
        run = max(run, P[d]); f = (run - P[d]) / run if run else 0
        if 365 <= d <= 729: dd2 = max(dd2, f)
        if 730 <= d <= 1094: dd3 = max(dd3, f)
    x['dd2'] = round(100 * dd2, 1); x['dd3'] = round(100 * dd3, 1) if L >= 730 else None
    for D in (400, 800, 1094):
        dd_ = [d for d in days if d <= D]
        if dd_ and dd_[-1] >= D:
            pk = max(dd_, key=lambda d: (P[d], -d)); x[f'drop{D}'] = round(100 * (P[pk] - P[dd_[-1]]) / P[pk], 1)
    # 마을별 최악
    worst = (0, None, None, 0, 0); ddW = (0, None, None); emptied = []
    for v, D in o['vN'].items():
        ds = sorted(D)
        for y in (1, 2, 3):
            lo, hi = 365 * (y - 1), 365 * y - 1
            yd = [d for d in ds if lo <= d <= hi]
            if not yd: continue
            fd = sum(o['vF'][v][d] for d in yd); nmax = max(D[d] for d in yd)
            if nmax > 0 and fd / nmax > worst[0]: worst = (fd / nmax, o['nm'](v), y, fd, nmax)
            pk, best = 0, 0
            for d in yd:
                pk = max(pk, D[d])
                if pk >= 20 and (pk - D[d]) / pk > best: best = (pk - D[d]) / pk
            if best > ddW[0]: ddW = (best, o['nm'](v), y)
        prev = 0
        for d in ds:
            n = D[d]
            if prev >= 5 and n == 0:
                if sum(o['vF'][v].get(q, 0) for q in range(d - 60, d + 1)) >= 1: emptied.append((o['nm'](v), d)); break
            prev = max(prev, n) if n > 0 else prev
    x.update({'worstFdShare': round(100 * worst[0], 1), 'worstFdVil': worst[1], 'worstFdYear': worst[2], 'worstFd': worst[3], 'worstFdN': worst[4],
              'emptied': emptied, 'worstVilDrop': round(100 * ddW[0], 1), 'worstVilDropVil': ddW[1], 'worstVilDropYear': ddW[2]})
    return x

def goals(x, bx, s, D):
    # 끔 판이 그 날에 못 닿으면(기어감 · 죽음) ①②④ 는 모름(—) · ③ 은 제 판만 본다
    r, dr = x.get(f'r{D}'), x.get(f'drop{D}')
    if dr is None: return None
    g1 = (r >= 1.10) if (s == '1020' and r is not None) else None
    g2 = (r >= 0.98) if r is not None else None
    g3 = dr <= 10
    ys = [y for y, hi in ((1, 364), (2, 729), (3, 1094)) if D >= hi] + ([3] if D == 800 else [])
    g4 = all((x.get(f'fdY{y}') or 0) <= (bx.get(f'fdY{y}') or 0) for y in ys) if bx.get('last', 0) >= D else None
    return {'g1': g1, 'g2': g2, 'g3': g3, 'g4': g4, 'years': ys}

def main():
    M = json.load(open(A[0])); O = {}
    for arm, a in M.items():
        for s, e in a['seeds'].items():
            try: O[(arm, s)] = load(e, s)
            except Exception as err: print('skip', arm, s, err)
    T = {}
    for arm, a in M.items():
        T[arm] = {'label': a['label'], 'seeds': {}}
        for s in a['seeds']:
            if (arm, s) not in O: continue
            b = O.get((BASE, s)); x = stats(O[(arm, s)], b); bx = stats(b, b) if b else None
            if bx:
                for D in (400, 800, 1094):
                    g = goals(x, bx, s, D)
                    if g and O[(arm, s)]['last'] >= D: x[f'goals{D}'] = g
                for y in (1, 2, 3): x[f'offFdY{y}'] = bx.get(f'fdY{y}'); x[f'offKovY{y}'] = bx.get(f'kovY{y}')
            T[arm]['seeds'][s] = x
    json.dump(T, open(os.path.join(OUT, TAG + '.json'), 'w'), ensure_ascii=False, indent=1)
    f3 = lambda v: '—' if v is None else f'{v:.3f}'
    i0 = lambda v: '—' if v is None else f'{int(round(v)):,}'
    ok = lambda b: '—' if b is None else ('○' if b else '✗')
    gs = lambda g: '—' if not g else ' · '.join(ok(g[k]) for k in ('g1', 'g2', 'g3', 'g4'))
    md = ['| 팔 | 시드 | 인구 날 400 · 800 · 1,094(명) | 끔비 날 400 · 800 · 1,094 | 굶어 죽음 1 · 2 · 3년째 · 굶주림 철(명) | K 위 죽음 1 · 2 · 3년째(명) | 도구 몫 0.5 밑 마을-날 두 해(그 날 굶음) · 3년째 | 내림 % 날 400 · 800 · 1,094 · 2년째 · 3년째 가장 큰 | 목표 넷 날 400 / 800 / 1,094 | 마을별 최악 — 한 해 굶음 몫(마을 · 해) · 굶어서 빈 마을 · 한 해 가장 큰 내림(마을) |',
          '|---|---|---|---|---|---|---|---|---|---|']
    for arm, v in T.items():
        for s in SEEDS:
            x = v['seeds'].get(s)
            if not x: continue
            py = next((y for y in (1, 2, 3) if x.get(f'fdY{y}') is not None and not x.get(f'full{y}')), None)   # 판이 그 해 안에서 끝났다
            mk = lambda y: f"(날 {x['last']} 까지)" if y == py else ''
            em = x.get('emptied') or []
            md.append(f"| {v['label']} | {s} | {i0(x.get('p400'))} · {i0(x.get('p800'))} · {i0(x.get('p1094'))} | {f3(x.get('r400'))} · {f3(x.get('r800'))} · {f3(x.get('r1094'))} | "
                      f"{i0(x.get('fdY1'))}{mk(1)} · {i0(x.get('fdY2'))}{mk(2)} · {i0(x.get('fdY3'))}{mk(3)} · {i0(x.get('fdSeason'))} | {i0(x.get('kovY1'))}{mk(1)} · {i0(x.get('kovY2'))}{mk(2)} · {i0(x.get('kovY3'))}{mk(3)} | "
                      f"{i0(x.get('lowTool2y'))}({i0(x.get('fdLow2y'))}){'(날 ' + str(x['last']) + ' 까지)' if x['last'] < 729 else ''} · {i0(x.get('lowTooly3'))}{mk(3)} | "
                      f"{x.get('drop400', '—')} · {x.get('drop800', '—')} · {x.get('drop1094', '—')} · {x.get('dd2')} · {x.get('dd3') if x.get('dd3') is not None else '—'} | "
                      f"{gs(x.get('goals400'))} / {gs(x.get('goals800'))} / {gs(x.get('goals1094'))} | "
                      f"{x.get('worstFdShare')}%({x.get('worstFdVil')} · {x.get('worstFdYear')}년) · {len(em)}{('(' + ' · '.join(f'{a} 날 {b}' for a, b in em[:3]) + ')') if em else ''} · {x.get('worstVilDrop')}%({x.get('worstVilDropVil')}) |")
    open(os.path.join(OUT, TAG + '.md'), 'w').write('\n'.join(md) + '\n')
    print('\n'.join(md))

if __name__ == '__main__': main()
