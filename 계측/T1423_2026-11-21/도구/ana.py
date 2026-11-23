#!/usr/bin/env python3
# T1423 봇 판 표 — runs/BOT_<팔>_<시드>/probe.json → out/bot.json · out/tab*.md
import json, os, sys, statistics as st
D = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(D, 'out'); os.makedirs(OUT, exist_ok=True)
SEEDS = ['1020', '7', '42']; ARMS = ['ON', 'CTRL', 'OFF']; KINDS = ['head', 'pass', 'gate', 'road', 'field']
KO = {'head': '다리 머리 앞', 'pass': '고개', 'gate': '마을 문 앞', 'road': '길 한가운데', 'field': '길과 상관없는 들'}
BLOCKING = {'head', 'pass', 'gate'}
def load(arm, seed):
    f = os.path.join(D, 'runs', f'BOT_{arm}_{seed}', 'probe.json')
    if not os.path.exists(f): return None
    try: return json.load(open(f))
    except Exception: return None
res = {}
for seed in SEEDS:
    for arm in ARMS:
        r = load(arm, seed)
        if not r: continue
        T = r.get('t1423') or {}
        meets = T.get('meets') or []; known = T.get('known') or []; jobs = T.get('jobs') or []
        days = r.get('days') or []; P = r.get('placed')
        last = days[-1]['d'] if days else None
        o = {'placed': P, 'lastDay': last, 'iso': r.get('iso'), 'groups': {}, 'err': r.get('err')}
        fd0, fd1 = r.get('fd0') or {}, r.get('fd1') or {}
        o['fdVil'] = sum(1 for k in fd1 if fd1[k][0] - (fd0.get(k) or [0])[0] > 0)
        o['fd'] = sum(fd1[k][0] - (fd0.get(k) or [0])[0] for k in fd1)
        o['dead'] = sum(fd1[k][1] - (fd0.get(k) or [0, 0])[1] for k in fd1)
        o['pop'] = days[-1].get('pop') if days else None
        for kind in KINDS:
            G = (r.get('groups') or {}).get(kind)
            if not G: continue
            ids = set(x for x in G['ids'] if x)
            gm = [m for m in meets if set(m['ids']) & ids]
            blk = [m for m in gm if m['block']]; pas = [m for m in gm if not m['block']]
            kn = [k for k in known if set(k['ids']) & ids]
            jb = [j for j in jobs if set(j['ids']) & ids]
            broke = [h for j in jb for h in (j.get('hit') or []) if not h.get('gone') and h['id'] in ids]
            brokeDays = sorted(j['breakDay'] for j in jb if j.get('breakDay') is not None)
            stand = [row['g'][kind][0] for row in days if kind in row.get('g', {})]
            wait = sum(row['g'][kind][1] for row in days if kind in row.get('g', {}))
            pr = [p for p in G['pairs'] if p.get('ratio') is not None or p.get('cut')]
            o['groups'][kind] = {'placed': G['placed'], 'refused': G['refused'], 'gate': G['gate'], 'routes': G['routes'],
                'pairs': len(pr), 'pairMax': max([p['ratio'] for p in pr if p.get('ratio') is not None] or [None]) if pr else None,
                'pairMed': st.median([p['ratio'] for p in pr if p.get('ratio') is not None]) if [p for p in pr if p.get('ratio') is not None] else None,
                'pairCut': sum(1 for p in pr if p.get('cut')), 'pairOver3': sum(1 for p in pr if (p.get('ratio') or 0) > 3),
                'meet': len(gm), 'meetBlock': len(blk), 'meetPass': len(pas), 'cut': sum(1 for m in gm if m['cut']),
                'ratios': sorted(m['ratio'] for m in pas if m.get('ratio') is not None),
                'firstMeet': min([m['d'] for m in gm] or [None]) if gm else None, 'firstLearn': min([k['learnDay'] for k in kn] or [None]) if kn else None,
                'firstBreak': brokeDays[0] if brokeDays else None, 'broke': len(broke), 'jobs': len(jb),
                'standEnd': stand[-1] if stand else None, 'wait': wait,
                'reach': [h.get('reach') for h in broke], 'step': [h.get('step') for h in broke], 'bodies': sum(len(j.get('pids') or []) for j in jb),
                'walkLen': [l for j in jb for l in (j.get('len') or [])]}
        res[f'{arm}_{seed}'] = o
json.dump(res, open(os.path.join(OUT, 'bot.json'), 'w'), ensure_ascii=False, indent=1)
f0 = lambda x: '—' if x is None else (f'{x:,.0f}' if isinstance(x, (int, float)) else str(x))
f2 = lambda x: '—' if x is None else f'{x:.2f}'
L = []
L.append('| 자리 · 시드 | 울타리(놓음/거절) | 지나는 교역로 | 쌍 걸음 비(가운데 · 가장 큼 · 못 닿음) | 만남(막힘/돌아감) · 돌아간 비 | 앎 · 부숨(첫 날 − 놓은 날) | 부순 울타리 · 남음 | 곁에 선 캐러밴(몸-날) 켬 · 대조 · 끔 |')
L.append('|---|---|---|---|---|---|---|---|')
for kind in KINDS:
    for seed in SEEDS:
        o = res.get(f'ON_{seed}'); c = res.get(f'CTRL_{seed}'); f = res.get(f'OFF_{seed}')
        if not o or kind not in o['groups']: continue
        g = o['groups'][kind]; P = o['placed']
        rr = g['ratios']; rs = (f'{min(rr):.2f}~{max(rr):.2f}' if rr else '—')
        fb = (g['firstBreak'] - P) if g['firstBreak'] is not None else None
        fl = (g['firstLearn'] - P) if g['firstLearn'] is not None else None
        L.append(f"| {KO[kind]} · {seed} | {g['placed']}/{g['refused']} | {g['routes']} | {f2(g['pairMed'])} · {f2(g['pairMax'])} · {g['pairCut']} | {g['meetBlock']}/{g['meetPass']} · {rs} | {f0(fl)} · {f0(fb)} | {g['broke']} · {f0(g['standEnd'])} | {g['wait']} · {c['groups'][kind]['wait'] if c and kind in c['groups'] else '—'} · {f['groups'][kind]['wait'] if f and kind in f['groups'] else '—'} |")
open(os.path.join(OUT, 'tabGroup.md'), 'w').write('\n'.join(L) + '\n')
L = ['| 팔 · 시드 | 놓은 날 · 끝 날 | 고립 귀환(놓은 뒤) | 굶어 죽은 마을(놓은 뒤) · 굶어 죽음 · 죽음 | 인구(끝) |', '|---|---|---|---|---|']
for seed in SEEDS:
    for arm in ARMS:
        o = res.get(f'{arm}_{seed}')
        if not o: continue
        L.append(f"| {arm} · {seed} | {o['placed']} · {o['lastDay']} | {f0(o['iso'])} | {o['fdVil']} · {o['fd']} · {o['dead']} | {f0(o['pop'])} |")
open(os.path.join(OUT, 'tabWorld.md'), 'w').write('\n'.join(L) + '\n')
print(open(os.path.join(OUT, 'tabGroup.md')).read()); print(open(os.path.join(OUT, 'tabWorld.md')).read())
for k, o in res.items():
    if o.get('err'): print('ERR', k, o['err'][:200])
