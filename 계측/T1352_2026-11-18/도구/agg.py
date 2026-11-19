#!/usr/bin/env python3
# T1352 판 표 — runs/ 의 meta · mig · news(t1352-news-analyze) · an1292 · cmp 를 읽어 보고 표 줄을 낸다
import json, os, subprocess, sys
D = '/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1352/runs'
R = '/home/claude/mini'
def J(p):
    try: return json.load(open(p))
    except Exception: return None
def news(tag):
    p = f'{D}/news_{tag}.json'
    if not os.path.exists(p):
        subprocess.run(['node', 'scripts/t1352-news-analyze.js', D, tag, '--json', p], cwd=R, stdout=subprocess.DEVNULL)
    return J(p)
def cmp(a, b):
    r = subprocess.run(['node', 'scripts/t1324-mig-analyze.js', D, a, '--cmp', D, b], cwd=R, capture_output=True, text=True)
    try: return json.loads(r.stdout)
    except Exception: return None
def an(tag):
    p = f'{D}/an1292_{tag}.json'
    try: return json.loads(open(p).read().lstrip()[open(p).read().lstrip().find('{'):])
    except Exception: return None
def knob(tag):
    m = J(f'{D}/meta_{tag}.json') or {}
    e = m.get('env') or {}
    k = []
    if e.get('T1334_BUNDLE') == '1': k.append('묶음')
    if e.get('T1352_NEWS_LOCAL') == '1': k.append('ⓐ')
    if e.get('T1352_NEWS_SEAM') == '1': k.append('ⓑ')
    return ' + '.join(k) if k else '끔'
def done(tag): return os.path.exists(f'{D}/meta_{tag}.json') and os.path.exists(f'{D}/mig_{tag}.json')
mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
tags = [t for t in sys.argv[2:]]
out = []
if mode == 'natural':
    out.append('| 판 | 손잡이 | 넘은 주민(한→닛 · 닛→한) | 불행 이탈 한 · 닛(받는 곳 고름(그중 이웃 존) / 없음) | 아는 이웃 존 줄 셈(제 · 같은 존 · 이음매) | 이웃 존 줄 걸림(정보 반경 밖 · 침상 · 행복 · 곳간) | 넘은 사람 고른 줄 길(제 · 같은 존 · 이음매) · 나이 평균 · 최대(셈) | 받는 마을 1인 곳간 p50 · 최저 | 길 위 하루 · 굶은 하루 · 죽음 | 몰림 최대(마을 · 사람 · 닿은 날 수 · K 위 닿음 — 판 전체) | 두 존 합 보존(셈 떠남 = 붙음 + 집 + 죽음 + 길 위 · 떠남 로그 줄) | 두 존 날 줄 = 같은 씨 끔 판 | 300날 인구 한 · 닛 | 굶어 죽음 누계 한 · 닛 |')
    out.append('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for t in tags:
        if not done(t): out.append(f'| {t} | (아직) |'); continue
        n = news(t); m = J(f'{D}/meta_{t}.json'); P = m['perfEnd']
        seed = t.split('_')[1]; base = f'N0_{seed}' if not t.startswith('NB') else f'NB0_{seed}'
        c = cmp(base, t) if t != base and done(base) else None
        def zs(z):
            if not c: return '?'
            r = c['res'][z]
            return '같음' if (r['firstDiff'] is None and r['compared'] >= 300) else f"{r['firstDiff']}날 갈림"
        same = '—(끔 판)' if t == base else ('·'.join(zs(z) for z in ['hanbando', 'nippon']) if c else '?')
        tt = {z: (P[z].get('t1324') or {}) for z in ['hanbando', 'nippon']}
        t1147 = ' · '.join(f"{tt[z]['t1147']['pick']}({tt[z].get('pick', 0)})/{tt[z]['t1147']['none']}" for z in ['hanbando', 'nippon'])
        k = [tt[z].get('t1352') or {} for z in ['hanbando', 'nippon']]
        kn = ' · '.join(str(sum((x.get(f) or 0) for x in k)) for f in ['own', 'local', 'seam']) if any(x.get('localOn') or x.get('seamOn') for x in k) else '—(끔)'
        w = [tt[z].get('why') or {} for z in ['hanbando', 'nippon']]
        why = ' · '.join(str(sum((x.get(f) or 0) for x in w)) for f in ['far', 'beds', 'h', 'food'])
        days = m.get('DAYS', 300)
        def rowAt(z):
            try:
                for l in open(f'{D}/rows_{t}_{z}.jsonl'):
                    r = json.loads(l)
                    if r.get('day') == days: return r
            except Exception: pass
            return {}
        RW = {z: rowAt(z) for z in ['hanbando', 'nippon']}
        pop = ' · '.join(f"{RW[z].get('pop', '?'):,}" if isinstance(RW[z].get('pop'), int) else '?' for z in ['hanbando', 'nippon'])
        fd = ' · '.join(str(RW[z].get('fdDeaths', '?')) for z in ['hanbando', 'nippon'])
        bd = n.get('byDir') or {}
        cr = f"{n['crossed']}({(bd.get('hanbando→nippon') or {}).get('crossed', 0)} · {(bd.get('nippon→hanbando') or {}).get('crossed', 0)})"
        ph = n['perHead']; phs = f"{ph['p50']} · {ph['min']}" if ph['n'] else '—'
        rd = n['road']; road = f"{rd['days']} · {rd['hungry']} · {rd['dead']}"
        hm = n['herdMax']; herd = f"{hm['vil'].split('|')[1]}@{hm['vil'].split('|')[0][:1]} · {hm['n']} · {hm['days']}" if hm else '—'
        pc = n.get('perfConserve') or {}
        cons = (f"{'○' if pc.get('ok') and pc.get('handOk') else '✗'} {pc.get('depart')}={pc.get('joined')}+{pc.get('home')}+{pc.get('dead')}+{pc.get('onRoad')} · 줄 {pc.get('departLog')}/{pc.get('depart')}") if pc else '?'
        pk = {f: sum((x.get(f) or 0) for x in k) for f in ['pickOwn', 'pickLocal', 'pickSeam', 'ageN', 'ageSum']}; amax = max([(x.get('ageMax') or 0) for x in k] + [0])
        picks = (f"{pk['pickOwn']} · {pk['pickLocal']} · {pk['pickSeam']} · {round(pk['ageSum'] / pk['ageN'], 1)} · {amax}" if pk['ageN'] else f"{pk['pickOwn']} · {pk['pickLocal']} · {pk['pickSeam']} · — · —") if kn != '—(끔)' else '—(끔)'
        ok = sum(h['overK'] for h in n['herd']); herd = herd + (f" · K 위 {ok}" if hm else '')
        out.append(f"| {t} | {knob(t)} | **{cr}** | {t1147} | {kn} | {why} | {picks} | {phs} | {road} | {herd} | {cons} | {same} | {pop} | {fd} |")
elif mode == 'staged':
    out.append('| 판 | 손잡이 | 꾸밈 떠남 한 · 닛(시도 90 · 90) | 넘은 주민(한→닛 · 닛→한) | 이웃 존 줄 걸림(정보 반경 밖 · 침상 · 행복 · 곳간) | 소식 길(제 · 같은 존 · 이음매) | 나이 p50 · p90 · 최대(경계 날) | 받는 마을 1인 곳간 p50 · 최저(닿은 때) | 길 위 하루 · 굶은 하루 · 죽음 | 몰림 최대(마을 · 사람 · 날 수 · 같은 줄 · 들은 인구 밖 넘침 합) | K 위 닿음 | 두 존 합 보존(로그 맞춤 떠남=끝 · 둘 · 사라짐 · 셈) |')
    out.append('|---|---|---|---|---|---|---|---|---|---|---|---|')
    for t in tags:
        if not done(t): out.append(f'| {t} | (아직) |'); continue
        n = news(t)
        st = n['staged']; sd = ' · '.join(str(st[z]['took']) for z in ['hanbando', 'nippon'])
        bd = n.get('byDir') or {}
        cr = f"{n['crossed']}({(bd.get('hanbando→nippon') or {}).get('crossed', 0)} · {(bd.get('nippon→hanbando') or {}).get('crossed', 0)})"
        via = ' · '.join(str(n['via'].get(v, 0)) for v in ['own', 'local', 'seam'])
        ag = n['ageAll']; age = f"{ag['p50']} · {ag['p90']} · {ag['max']}" if ag['n'] else '—'
        ph = n['perHead']; phs = f"{ph['p50']} · {ph['min']}" if ph['n'] else '—'
        rd = n['road']; road = f"{rd['days']} · {rd['hungry']} · {rd['dead']}"
        hm = n['herdMax']; h0 = n['herd'][0] if n['herd'] else None; herd = f"{hm['vil'].split('|')[1]}@{hm['vil'].split('|')[0][:1]} · {hm['n']} · {hm['days']} · {hm['sameLineMax']} · {h0['over'] if h0 else '—'}" if hm else '—'
        mP = (J(f'{D}/meta_{t}.json') or {}).get('perfEnd') or {}; wz = [((mP.get(z) or {}).get('t1324') or {}).get('why') or {} for z in ['hanbando', 'nippon']]
        why = ' · '.join(str(sum((x.get(f) or 0) for x in wz)) for f in ['far', 'beds', 'h', 'food'])
        ok = sum(h['overK'] for h in n['herd'])
        c = n['conserve']; pc = n.get('perfConserve') or {}; cons = f"{'○' if c['red'] == 0 and c['balance']['ok'] and pc.get('ok') else '✗'} {c['balance']['depart']}={c['balance']['sum']} · {c['bad'].get('twoIn', 0)} · {c['bad'].get('crossedNoIn', 0)} · 셈 {pc.get('depart')}={pc.get('joined')}+{pc.get('home')}+{pc.get('dead')}+{pc.get('onRoad')}"
        out.append(f"| {t} | {knob(t)} | {sd} | **{cr}** | {why} | {via} | {age} | {phs} | {road} | {herd} | {ok} | {cons} |")
elif mode == 'age':
    out.append('| 판 | 손잡이 | ' + ' | '.join(f'나이 {b} 닿음 · 넘침 평균 · 넘침>0 · 1인 곳간 p50 · K 위' for b in ['0~1', '2~3', '4~7', '8~15', '16+']) + ' |')
    out.append('|---|---|' + '---|' * 5)
    for t in tags:
        if not done(t): continue
        n = news(t)
        cells = []
        for b in n['ageBands']:
            cells.append(f"{b['n']} · {b['overMean'] if b['overMean'] is not None else '—'} · {b['overPos']} · {b['perHeadP50'] if b['perHeadP50'] is not None else '—'} · {b['overK']}")
        out.append(f"| {t} | {knob(t)} | " + ' | '.join(cells) + ' |')
print('\n'.join(out))
