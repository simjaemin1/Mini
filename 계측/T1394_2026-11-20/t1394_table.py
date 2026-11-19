#!/usr/bin/env python3
# T1394 판 표 — `<폴더>/<세계>-<팔>-<시드>.t1394.json` 들에서 팔마다 한 줄:
#   인구 날 364 · 400 · 729 · 1,094 · 굶어 죽음 1 · 2 · 3년째(마을 누계 `fdTot` 의 해 끝 차) · 빈 마을(그날 사람 0) 날 400 · 729 · 1,094 · 비었던 마을(한 번이라도 0) ·
#   도구 몫 0.5 밑 마을-날(두 해 · 도구 쓰는 일꾼 > 0) · K 위 죽음 1 · 2 · 3년째(`deadTot − fdTot − natTot`) · 떠남(빠진 사람 − 죽음 · 두 해)
#   쓰는 법: python3 t1394_table.py <폴더> [--json out.json] [--md out.md]
import json, sys, os, re, collections
args = sys.argv[1:]
D0 = args[0]
outj = args[args.index('--json') + 1] if '--json' in args else None
outm = args[args.index('--md') + 1] if '--md' in args else None
YE = [364, 729, 1094]
res = {}
for fn in sorted(os.listdir(D0)):
    m = re.match(r'(.+)-(\d+)\.t1394\.json$', fn)
    if not m: continue
    arm, seed = m.group(1), int(m.group(2))
    try: D = json.load(open(os.path.join(D0, fn)))
    except Exception as e: continue
    if 'cols' not in D: continue
    C = {c: i for i, c in enumerate(D['cols'])}
    g = lambda r, k: r[C[k]]
    last = D['last']
    byd = collections.defaultdict(list)
    for r in D['rows']: byd[g(r, 'day')].append(r)
    days = sorted(byd)
    def at(d):
        ds = [x for x in days if x <= d]
        return byd[ds[-1]] if ds and (d - ds[-1]) <= 2 else None
    pop = {d: (sum(g(r, 'N') for r in at(d)) if at(d) else None) for d in [364, 400, 729, 1094]}
    emp = {d: (sum(1 for r in at(d) if g(r, 'N') == 0) if at(d) else None) for d in [400, 729, 1094]}
    cum = lambda rs, k: sum(g(r, k) for r in rs) if rs else None
    fd, kov = [], []
    prevF = prevK = 0
    for d in YE:
        rs = at(d)
        if rs is None: fd.append(None); kov.append(None); continue
        F = cum(rs, 'fdTot'); K = sum(g(r, 'deadTot') - g(r, 'fdTot') - g(r, 'natTot') for r in rs)
        fd.append(F - prevF); kov.append(K - prevK); prevF, prevK = F, K
    ever = set(); firstEmpty = {}
    low = 0; low2 = 0; gone = 0; dead2 = 0
    names = D['names']
    for r in D['rows']:
        d = g(r, 'day')
        if g(r, 'N') == 0 and g(r, 'v') not in firstEmpty: firstEmpty[g(r, 'v')] = d
        if d <= 729 and (g(r, 'toolDeps') or 0) > 0 and (g(r, 'toolStock') or 0) / g(r, 'toolDeps') < 0.5: low += 1
        if d <= 729: gone += g(r, 'gone')
    lr = at(729) or at(last)
    if lr: dead2 = sum(g(r, 'deadTot') for r in lr)
    res[f'{arm}|{seed}'] = {'arm': arm, 'seed': seed, 'last': last, 'pop': pop, 'empty': emp, 'everEmpty': {names[v]: d for v, d in sorted(firstEmpty.items(), key=lambda x: x[1])},
                            'starved': fd, 'starved2y': (fd[0] or 0) + (fd[1] or 0) if fd[1] is not None else None, 'kov': kov, 'toolLowDays2y': low, 'left2y': gone - dead2 if lr else None,
                            'env': D.get('env')}
if outj: open(outj, 'w').write(json.dumps(res, ensure_ascii=False, indent=1))
L = ['| 팔 | 시드 | 끝 날 | 인구 364 · 400 · 729 · 1,094 | 굶어 죽음 1 · 2 · 3년째 (두 해) | 빈 마을 날 400 · 729 · 1,094 · 비었던 마을(첫 빈 날) | 도구 몫 0.5 밑 마을-날(두 해) | K 위 죽음 1 · 2 · 3년째 | 떠남(두 해) |', '|---|---|---|---|---|---|---|---|---|']
f = lambda x: '—' if x is None else f'{x:,}'
for k, r in sorted(res.items(), key=lambda kv: (kv[1]['arm'], [1020, 7, 42].index(kv[1]['seed']) if kv[1]['seed'] in (1020, 7, 42) else 9)):
    ev = ' · '.join(f'{n} {d}' for n, d in r['everEmpty'].items()) or '0'
    L.append(f"| {r['arm']} | {r['seed']} | {r['last']} | {' · '.join(f(r['pop'][d]) for d in [364, 400, 729, 1094])} | {' · '.join(f(x) for x in r['starved'])} ({f(r['starved2y'])}) | "
             f"{' · '.join(f(r['empty'][d]) for d in [400, 729, 1094])} · {ev} | {f(r['toolLowDays2y'])} | {' · '.join(f(x) for x in r['kov'])} | {f(r['left2y'])} |")
txt = '\n'.join(L)
if outm: open(outm, 'w').write(txt + '\n')
print(txt)
