#!/usr/bin/env python3
# T1447 30 % 판 표(덧붙임 셋 할 일) — 푸는 몫 10 · 30 · 50 · 100 % 판(F10 · F30 · F50 · F100 · 서버 자 1020 · 날 200 → 600 · 마을 24 · 사유지 3 · 6 · 12 칸 돌림)
#   토벌마다: 푼 칸 · 그 칸을 마을이 가진 수(+10 · +30날 · 끝) · 다시 막힌 날 · 다시 명분이 선 날 · 같은 사유지 다음 토벌 · 몸 · 일손(사람-날) · 먹을 것
#   + 첫 토벌 그림 한 줄(같은 사유지 · 네 몫 — 첫 토벌까지는 네 판이 같은 세계다)
import json, os, sys, math, importlib.util
S = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('render', os.path.join(S, 'render.py'))
R = importlib.util.module_from_spec(spec)
_argv = sys.argv; sys.argv = ['x']
try: spec.loader.exec_module(R)
except SystemExit: pass
sys.argv = _argv
from PIL import Image, ImageDraw
TAGS = [('F10', 10), ('F30', 30), ('F50', 50), ('F100', 100)]
out = {'runs': []}
md = []
for tag, pct in TAGS:
    f = os.path.join(S, 'runs', tag, 'probe.json')
    if not os.path.exists(f): md.append(f'{tag}: 판 없음'); continue
    j = json.load(open(f))
    placed = [e for e in j['placed'] if not e.get('fail')]
    days = j['days']; dix = {r['d']: k for k, r in enumerate(days)}; dend = days[-1]['d'] if days else 0
    st = (j.get('stat') or {}).get('raid') or {}
    rows = st.get('rows') or []
    picks = j.get('picks') or []
    raids = []
    for p in picks:
        i = p['i']; e = placed[i] if 0 <= i < len(placed) else None
        if e is None: continue
        tl = p['tl']
        def got_at(dd):
            g = 0
            for d, n in tl:
                if d <= dd: g = n
            return g
        reblk = next((r['d'] for r in days if r['d'] > p['d'] and r['t'][i][3] > 0), None)
        recas = next((r['d'] for r in days if r['d'] > p['d'] + 1 and len(r['t'][i]) > 6 and r['t'][i][6] == 1), None)
        nxt = next((q['d'] for q in picks if q['i'] == i and q['d'] > p['d']), None)
        live_after = days[dix[p['d'] + 1]]['t'][i][7] if (p['d'] + 1) in dix and len(days[dix[p['d'] + 1]]['t'][i]) > 7 else None
        rr = next((r for r in rows if r['vil'] == p['vname'] and r['d'] <= p['d'] and p['d'] - r['d'] <= max(2, (r.get('walkDays') or 1) + 1)), None)
        short = days[dix[p['d']]]['t'][i][2] - days[dix[p['d']]]['t'][i][1] if p['d'] in dix else None
        raids.append(dict(tag=tag, pct=pct, vname=e['vname'], cls=e['cls'], size=e['size'], d=p['d'], n=p['n'], of=p['of'], live_after=live_after,
                          g10=got_at(p['d'] + 10), g30=got_at(p['d'] + 30), gend=got_at(dend), reblk=(reblk - p['d']) if reblk else None,
                          recas=(recas - p['d']) if recas else None, nxt=(nxt - p['d']) if nxt else None, short=short,
                          bodies=rr and rr.get('bodies'), walk=rr and rr.get('walkDays'), labor=rr and rr.get('labor'), food=rr and rr.get('food'), dist=rr and rr.get('dist'), dep=rr and rr['d']))
    # 사유지마다 — 막힘 · 명분 · 토벌 횟수
    per = []
    for i, e in enumerate(placed):
        firstblk = next((r['d'] for r in days if r['t'][i][3] > 0), None)
        firstcas = next((r['d'] for r in days if len(r['t'][i]) > 6 and r['t'][i][6] == 1), None)
        castdays = sum(1 for r in days if len(r['t'][i]) > 6 and r['t'][i][6] == 1)
        n = sum(1 for q in picks if q['i'] == i)
        last = days[-1]['t'][i]
        per.append(dict(vname=e['vname'], cls=e['cls'], size=e['size'], mode=e['mode'], side=e['side'], firstblk=firstblk, firstcas=firstcas, casdays=castdays, raids=n,
                        live_end=last[7] if len(last) > 7 else None, pop_end=last[0], fd=last[4]))
    why = {k: st.get(k, 0) for k in ['casus', 'noNeed', 'noFight', 'far', 'cool', 'food', 'busy', 'go', 'arrive', 'abort', 'unclaimed', 'split', 'lost']}
    out['runs'].append(dict(tag=tag, pct=pct, raids=raids, per=per, why=why, err=j.get('err')))
json.dump(out, open(os.path.join(S, 'out30.json'), 'w'), ensure_ascii=False, indent=1)
# 표 ① 몫마다 한 줄
print('| 푸는 몫 | 토벌(닿음) | 명분 선 사유지-날 · 막은 까닭(땅 넉넉 · 몸 · 먹을 것 · 쿨) | 푼 칸 합 | 마을이 가진 칸(+30날 · 끝) | 다시 막힌 날(가운데) | 다시 명분(가운데) | 같은 사유지 다시 토벌 | 몸 · 일손(사람-날) · 먹을 것 합 |')
print('|---|---|---|---|---|---|---|---|---|')
def med(a):
    a = sorted(x for x in a if x is not None)
    return a[len(a) // 2] if a else None
for r in out['runs']:
    rs = r['raids']; w = r['why']
    again = sum(1 for x in rs if x['nxt'] is not None)
    print(f"| {r['pct']} % | {len(rs)} | {w['casus']} · {w['noNeed']} · {w['noFight']} · {w['food']} · {w['cool']} | {sum(x['n'] for x in rs)} | {sum(x['g30'] for x in rs)} · {sum(x['gend'] for x in rs)} | "
          f"{(str(med([x['reblk'] for x in rs])) + '날') if rs and med([x['reblk'] for x in rs]) is not None else '—'} | {(str(med([x['recas'] for x in rs])) + '날') if rs and med([x['recas'] for x in rs]) is not None else '—'} | {again} | {sum((x['bodies'] or 0) for x in rs)} · {sum((x['labor'] or 0) for x in rs)} · {round(sum((x['food'] or 0) for x in rs), 1)} |")
print()
print('| 몫 | 마을 | 사유지 | 떠난 날 → 닿은 날 | 몸 · 거리 · 가는 날 | 푼 칸 / 그 덩이 | 남은 사유지 | 마을이 가진 칸 +10 · +30 · 끝 | 다시 막힘 · 다시 명분 · 다음 토벌(날 뒤) | 그날 모자란 땅 |')
print('|---|---|---|---|---|---|---|---|---|---|')
for r in out['runs']:
    for x in r['raids']:
        print(f"| {x['pct']} % | {R.CLS[x['cls']]} {x['vname']} | {x['size']}칸 | {x['dep']} → {x['d']} | {x['bodies']} · {x['dist']} · {x['walk']} | {x['n']} / {x['of']} | {x['live_after']} | {x['g10']} · {x['g30']} · {x['gend']} | "
              f"{x['reblk'] if x['reblk'] is not None else '—'} · {x['recas'] if x['recas'] is not None else '—'} · {x['nxt'] if x['nxt'] is not None else '—'} | {x['short']} |")
print()
print('| 몫 | 사유지(크기 · 마을) | 첫 막힘 날 | 첫 명분 날 | 명분 선 날 수 | 토벌 횟수 | 끝 남은 칸 |')
print('|---|---|---|---|---|---|---|')
for r in out['runs']:
    for p in r['per']:
        if p['firstblk'] is None: continue
        print(f"| {r['pct']} % | {p['size']}칸 · {R.CLS[p['cls']]} {p['vname']}({R.PLACE.get((p['mode'], p['side']), '')}) | {p['firstblk']} | {p['firstcas'] or '—'} | {p['casdays']} | {p['raids']} | {p['live_end']} |")
# 그림 — 첫 토벌(사유지마다 · 네 몫 '토벌 뒤' 한 줄)
snaps = {}
for tag, pct in TAGS:
    f = os.path.join(S, 'runs', tag, 'probe.json')
    if not os.path.exists(f): continue
    j = json.load(open(f)); placed = [e for e in j['placed'] if not e.get('fail')]
    for s in j['snaps']:
        if s['why'] != '토벌 뒤': continue
        key = placed[s['i']]['vname']
        snaps.setdefault(key, {}).setdefault(pct, (placed[s['i']], s))   # 사유지마다 첫 토벌만
keys = sorted(snaps.keys())
if keys:
    TW, TH, lab = 300, 300, 230
    M = Image.new('RGB', (lab + TW * 4, 60 + TH * len(keys) + 30), (255, 255, 255)); dm = ImageDraw.Draw(M)
    dm.text((10, 8), 'T1447 30 % 판 — 첫 토벌 다음 날(같은 세계 · 푸는 몫만 다름) · 하늘색 = 토벌로 풀린 빈 칸 · 짙은 파랑 = 풀린 뒤 마을이 가진 칸 · 노랑 = 남은 사유지 · 빨강 = 막힌 칸', font=R.f14, fill=(0, 0, 0))
    for c, (tag, pct) in enumerate(TAGS): dm.text((lab + c * TW + 8, 36), f'푸는 몫 {pct} %', font=R.f14, fill=(0, 0, 0))
    for r, k in enumerate(keys):
        y0 = 60 + r * TH
        any_e = next(iter(snaps[k].values()))[0]
        dm.text((8, y0 + 8), f"{R.CLS[any_e['cls']]} {k}", font=R.f16b, fill=(0, 0, 0))
        dm.text((8, y0 + 32), f"사유지 {any_e['size']}칸 · {R.PLACE.get((any_e['mode'], any_e['side']), '')}", font=R.f12, fill=(40, 40, 40))
        for c, (tag, pct) in enumerate(TAGS):
            if pct not in snaps[k]: continue
            e, s = snaps[k][pct]
            th, _ = R.inset(e, s, box=TH - 40); th.thumbnail((TW - 10, TH - 40))
            M.paste(th, (lab + c * TW + 4, y0 + 4))
            dm.text((lab + c * TW + 6, y0 + TH - 30), f"날 {s['d']} · 막힘 {s['line']['blk']}", font=R.f12, fill=(0, 0, 0))
    os.makedirs(os.path.join(S, 'pix30'), exist_ok=True)
    M.save(os.path.join(S, 'pix30', '모음_30퍼센트판.png'))
    print('\n그림', len(keys), '줄')
