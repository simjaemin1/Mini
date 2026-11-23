#!/usr/bin/env python3
# T1404 보고 표 — out/sum.json(ana.py) · 관찰기 줄 → out/tab*.md(마크다운 표) · out/vals.json(본문 자리표 값)
import json, os, glob, statistics as stt
D = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(D, 'out')
S = json.load(open(os.path.join(OUT, 'sum.json'), encoding='utf-8'))
SEEDS = ['1020', '7', '42']
f0 = lambda x: '—' if x is None else f'{x:,.0f}'
f1 = lambda x: '—' if x is None else f'{x:,.1f}'
f2 = lambda x: '—' if x is None else f'{x:.2f}'
f3 = lambda x: '—' if x is None else f'{x:.3f}'
pc = lambda x: '—' if x is None else f'{x * 100:.1f}%'
def rat(a, b): return None if (a is None or not b) else a / b
ARMS = [('OFF', '끔(지금)'), ('ALL', '넷 다 켬(㉡ = 쥔 도구만)')]
STEP = [('OFF_1020', '끔(지금)'), ('L_1020', '㉣ 길목에 선다'), ('LR_1020', '㉣ + ㉠ 부자 곁 숨을 자리'), ('ALL_1020', '넷 다(㉡ 쥔 도구만)'), ('ALLT_1020', '넷 다(㉡ 석기 — tool)'), ('FS_1020', '㉡ + ㉢ 만(약탈 없이)'), ('NOFEAR_1020', '넷 다 + 상인이 단을 모름(진단 대조 · 제품 밖)')]
def row(tag, lab, off):
    o = S.get(tag); b = S.get(off) if off else None
    if not o: return None
    if o.get('partial'): return '| ' + lab + ' | ' + tag.split('_')[-1] + f" | 날 {o['day']} 에서 끊음(계획 {o['plan']}날 — 첫 해는 아래 표 · 회부 11) |" + ' |' * 17
    pr = lambda k: rat(o.get(k), b.get(k)) if b else None
    return '| ' + ' | '.join([lab, tag.split('_')[-1], f"{f0(o['pop365'])} · {f0(o['popEnd'])}" + (f"({f2(pr('popEnd'))})" if b and o is not b else ''), str(o['empty']), f0(o['fd']), f0(o['poor5']),
        f"{f2(o['gMean'])} · {o['gPeak']}", f"{o['mPeak']} · {f1(o['mMean'])}", f0(o['gStarve']), f"{o['home']} · {o['split']}", f0(o['lootN']), f1(o['lootFood']), f0(o['killed']), pc(o['raidShare']),
        f1(o['foodImp']) + (f"({f2(pr('foodImp'))})" if b and o is not b else ''), f"{f3(o['escY1'])} · {f3(o['escY2'])}", f"{f1(o['pal365'])} · {f1(o['palEnd'])}", f0(o['warEnd']), f0(o['sup']), f0(o['fgFood'])]) + ' |'
HDR = '| 판 | 시드 | 인구 365 · 730(끔비) | 빈 마을(끝) | 굶어 죽음 | 가난한 다섯 굶음 | 단 평균 · 봉우리 | 단원 봉우리 · 평균 | 단 굶어 죽음 | 떠남(마을로 · 갈라짐) | 약탈 건 | 약탈 식량 | 행상 피살 | 털린 캐러밴 몫 | 교역 식량 수입(끔비) | 캐러밴 하나 호위 1년 · 2년 | 목책 365 · 끝 | 전사 끝 | 토벌 | 사냥 채집 식량 |\n|' + '---|' * 20
# 3시드 — 끔 · 넷 다
L = [HDR]
for s in SEEDS:
    for a, lab in ARMS:
        r = row(f'{a}_{s}', lab, f'OFF_{s}' if a != 'OFF' else None)
        if r: L.append(r)
open(os.path.join(OUT, 'tabMain.md'), 'w').write('\n'.join(L) + '\n')
# 첫 해(1 ~ 365날) — 세 시드 끔 · 넷 다(42 넷 다는 날 390 에서 끊겨 세 시드를 같이 보는 자리)
L = ['| 판 | 시드 | 인구 365(끔비) | 빈 마을(360날) | 굶어 죽음 | 단 평균 · 단원 봉우리 | 단 굶어 죽음 | 떠남(마을로 · 갈라짐) | 약탈 건 · 행상 피살 | 털린 캐러밴 몫 | 교역 식량 수입(끔비) | 길목 표 쌍(날 평균) | 사냥 · 채집 |', '|' + '---|' * 13]
for s_ in SEEDS:
    b0 = (S.get(f'OFF_{s_}') or {}).get('y1') or {}
    for a, lab in ARMS:
        o = (S.get(f'{a}_{s_}') or {}).get('y1')
        if not o: continue
        rr = (lambda k: f"({f2(rat(o.get(k), b0.get(k)))})" if a != 'OFF' else '')
        L.append(f"| {lab} | {s_} | {f0(o['pop365'])}{rr('pop365')} | {o['empty360']} | {f0(o['fd'])} | {f2(o['gMean'])} · {f0(o['mPeak'])} | {f0(o['gStarve'])} | {f0(o['home'])} · {f0(o['split'])} | {f0(o['lootN'])} · {f0(o['killed'])} | {pc(rat(o['raided'], o['sent']))} | {f1(o['foodImp'])}{rr('foodImp')} | {f0(o.get('pairsMean'))} | {f1(o['fgFood'])} |")
open(os.path.join(OUT, 'tabY1.md'), 'w').write('\n'.join(L) + '\n')
# 한 시드 걸음(1020) — 첫 해(1 ~ 365날 · ㉣ 만 · ㉣ + ㉠ 는 365날만 돌았다 — 두 해 판은 첫 해 몫을 잘라 견준다)
L = ['| 판(1020 · 첫 해) | 인구 365(끔비) | 빈 마을(360날) | 굶어 죽음 | 단 평균 · 단원 봉우리 | 단 굶어 죽음 | 떠남(마을로 · 갈라짐) | 약탈 건 · 행상 피살 | 털린 캐러밴 몫 | 교역 식량 수입(끔비) | 길목 표 쌍(날 평균) | 사냥 · 채집 |', '|' + '---|' * 12]
b0 = (S.get('OFF_1020') or {}).get('y1') or {}
for t, lab in STEP:
    o = (S.get(t) or {}).get('y1')
    if not o: continue
    rr = (lambda k: f"({f2(rat(o.get(k), b0.get(k)))})" if t != 'OFF_1020' else '')
    L.append(f"| {lab} | {f0(o['pop365'])}{rr('pop365')} | {o['empty360']} | {f0(o['fd'])} | {f2(o['gMean'])} · {f0(o['mPeak'])} | {f0(o['gStarve'])} | {f0(o['home'])} · {f0(o['split'])} | {f0(o['lootN'])} · {f0(o['killed'])} | {pc(rat(o['raided'], o['sent']))} | {f1(o['foodImp'])}{rr('foodImp')} | {f0(o.get('pairsMean'))} | {f1(o['fgFood'])} |")
open(os.path.join(OUT, 'tabStep.md'), 'w').write('\n'.join(L) + '\n')
# 전쟁 조건
L = [HDR]
for t, lab in (('OFF_W', '끔(지금)'), ('ALL_W', '넷 다(㉡ 쥔 도구만)')):
    r = row(t, lab, 'OFF_W' if t != 'OFF_W' else None)
    if r: L.append(r)
open(os.path.join(OUT, 'tabWar.md'), 'w').write('\n'.join(L) + '\n')
# 되먹임 — 길목 표(상인이 단을 보는 쌍) → 캐러밴 · 호위 · 식량 수입 → 굶음 · 인구 · 빈 마을(§4)
FEED = [('OFF', '끔(지금)'), ('ALL', '넷 다 켬'), ('NOFEAR', '넷 다 + 상인이 단을 모름(진단 대조 · 제품 밖)')]
L = ['| 판 | 시드 | 길목 표에 든 쌍(날 평균 · 전체 1,275) | 새 캐러밴(끔비) | 캐러밴 하나 호위(두 해) | 교역 식량 수입(끔비) | 약탈 건 · 행상 피살 | 굶어 죽음 · 가난한 다섯 | 인구 730(끔비) | 빈 마을 |', '|---|---|---|---|---|---|---|---|---|---|']
for s_ in SEEDS:
    b0 = S.get(f'OFF_{s_}')
    for a, lab in FEED:
        o = S.get(f'{a}_{s_}')
        if not o: continue
        if o.get('partial'): L.append(f"| {lab} | {s_} | 날 {o['day']} 에서 끊음(두 해 없음 — 첫 해 표) |" + ' |' * 7); continue
        r_ = (lambda k: f"({f2(rat(o.get(k), b0.get(k)))})" if (b0 and o is not b0) else '')
        L.append(f"| {lab} | {s_} | {f0(o.get('pairsMean'))} | {f0(o['newCar'])}{r_('newCar')} | {f3(o['escPer'])} | {f1(o['foodImp'])}{r_('foodImp')} | {f0(o['lootN'])} · {f0(o['killed'])} | {f0(o['fd'])} · {f0(o['poor5'])} | {f0(o['popEnd'])}{r_('popEnd')} | {o['empty']} |")
open(os.path.join(OUT, 'tabFeed.md'), 'w').write('\n'.join(L) + '\n')
# 단의 살림 — 두 해 합(ⓒ · 끔 · 넷 다)
L = ['| 판 | 시드 | 단이 선 수(소굴) · 처음 단원 합 | 절망 이탈로 든 사람 · 남은 단이 합친 사람 | 장물(은거지에 든 식량 — 장물아비 환산) | 사냥 · 채집(더미에 든 식량) | 단원 굶어 죽음 | 싸움 · 그 밖에 쓰러진 몸 | 마을로 떠남(㉢ — 몸 · 사람 기록 · 둘 다 없음) |', '|---|---|---|---|---|---|---|---|---|']
for s_ in SEEDS + ['W']:
    for a, lab in (('OFF', '끔(지금)'), ('ALL', '넷 다 켬')):
        o = S.get(f'{a}_{s_}')
        if not o: continue
        if o.get('partial'): L.append(f"| {lab} | {s_} | 날 {o['day']} 에서 끊음(두 해 합 없음) |" + ' |' * 6); continue
        t4 = o.get('t1404') or {}
        hm = f"{t4.get('home', 0)}({t4.get('homeBody', 0)} · {t4.get('homeRec', 0)} · {t4.get('homeNone', 0)})" if t4 else '—'
        L.append(f"| {lab} | {s_} | {o['denForm']} · {o['n0Sum']} | {o['bExo']} · {o['joinN']} | {f1(o['loot1104Food'])} | {f1(o['fgFood'])} | {f0(o['gStarve'])} | {f0(o['fellOther'])} | {hm} |")
open(os.path.join(OUT, 'tabGang.md'), 'w').write('\n'.join(L) + '\n')
# 소굴 → 쓰인 교역로 걸음(판 끝 · 지난 한 해 길 위 캐러밴이 있었던 쌍)
L = ['| 판 | 시드 | 소굴 셋 — 걸음 거리(곧은 거리) 칸 | 가운데 | 단 은거지(본 단 전부) 걸음 가운데 · 가장 멂 | 지난 한 해 쓰인 쌍 |', '|---|---|---|---|---|---|']
for s in SEEDS + ['W']:
    for a, lab in ARMS:
        o = S.get(f'{a}_{s}')
        if not o: continue
        if o.get('partial'): L.append(f"| {lab} | {s} | 날 {o['day']} 에서 끊음(판 끝 걸음 거리 안 잼 — 소굴 칸은 1020 켬과 같다) |" + ' |' * 3); continue
        dw = [x for x in (o['denWalk'] or []) if x is not None]; cw = [x for x in (o['campWalk'] or []) if x is not None]
        L.append(f"| {lab} | {s} | {' · '.join(f'{w}({st})' for w, st in zip(o['denWalk'] or [], o['denStraight'] or []))} | {f0(stt.median(dw)) if dw else '—'} | {f0(stt.median(cw)) if cw else '—'} · {f0(max(cw)) if cw else '—'} | {o.get('usedPairs')} |")
open(os.path.join(OUT, 'tabWalk.md'), 'w').write('\n'.join(L) + '\n')
# 도적단의 한 해 — ALL_1020 첫 해(달 = 30날)
def year_table(tag, a=1, b=360):
    fs = sorted(glob.glob(os.path.join(D, 'runs', tag, '*.t1404.json')))
    if not fs: return None
    j = json.load(open(fs[0], encoding='utf-8')); ix = {k: i for i, k in enumerate(j['wcols'])}; w = j['w']
    L = ['| 달 | 단 · 단원(달 끝) | 단 비축(달 끝) | 사냥 · 채집으로 더미에 든 식량 | 약탈(건 · 장물 식량) | 행상 피살 | 단원이 떠남(마을로 · 갈라짐) | 단 굶어 죽음 | 소굴에 새로 선 단 | 토벌 |', '|---|---|---|---|---|---|---|---|---|---|']
    for m in range((b - a + 1) // 30):
        rs = [r for r in w if a + 30 * m <= r[ix['day']] < a + 30 * (m + 1)]
        if not rs: continue
        sm = lambda k: sum((r[ix[k]] or 0) for r in rs); e = rs[-1]
        L.append(f"| {m + 1} | {e[ix['gangs']]} · {e[ix['members']]} | {f1(e[ix['gFood']])} | {f1(sm('fgFood'))} | {sm('lootN')} · {f1(sm('lootFood'))} | {sm('killed')} | {sm('home')} · {sm('split')} | {sm('starve')} | {sm('denForm')} | {sm('sup')} |")
    return '\n'.join(L) + '\n'
for tag, nm in (('ALL_1020', 'tabYear'), ('OFF_1020', 'tabYearOff'), ('ALLT_1020', 'tabYearT')):
    t = year_table(tag)
    if t: open(os.path.join(OUT, nm + '.md'), 'w').write(t)
print('tables ok', sorted(os.listdir(OUT)))
