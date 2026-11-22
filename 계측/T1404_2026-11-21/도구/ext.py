#!/usr/bin/env python3
# T1404 보고 글 — out/sum.json(ana.py) · 진단 판 · 관찰기 줄 · ev/* → ev/extra.json(build.py 가 읽는 글 줄)
#   python3 ext.py   (판이 다 돈 뒤 · 수는 다 판 결과에서 읽는다 — 손으로 옮긴 수 0)
import json, os, glob, re, statistics as stt
D = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(D, 'out'); EV = os.path.join(D, 'ev')
S = json.load(open(os.path.join(OUT, 'sum.json'), encoding='utf-8'))
SEEDS = ['1020', '7', '42']
f0 = lambda x: '—' if x is None else f'{x:,.0f}'
f1 = lambda x: '—' if x is None else f'{x:,.1f}'
f2 = lambda x: '—' if x is None else f'{x:.2f}'
f3 = lambda x: '—' if x is None else f'{x:.3f}'
pc = lambda x: '—' if x is None else f'{x * 100:.1f}%'
def g(t, k): o = S.get(t); return (o.get(k) if (not o.get('partial') or k in ('y1', 'day', 'plan', 'partial', 'tag', 'heapPeak', 'heap365', 'heapEnd', 'heap2000', 'heap1500', 'pairsSeries')) else None) if o else None
def ser(a, k, fmt=f0): return ' · '.join(fmt(g(f'{a}_{s}', k)) for s in SEEDS)
def rat(a, b): return None if (a is None or not b) else a / b
def ratio(a, k): return ' · '.join(f2(rat(g(f'{a}_{s}', k), g(f'OFF_{s}', k))) for s in SEEDS)
def tot(a, k): v = [g(f'{a}_{s}', k) for s in SEEDS]; return None if any(x is None for x in v) else sum(v)
def med(xs): xs = [x for x in xs if x is not None]; return stt.median(xs) if xs else None
def jl(t, seed):
    fs = sorted(glob.glob(os.path.join(D, 'runs', t, f'{t}-{seed}.json.t1404.json')))
    return json.load(open(fs[0], encoding='utf-8')) if fs else None
def rd(p):
    try: return open(os.path.join(EV, p), encoding='utf-8').read()
    except Exception: return ''

denOff = med([w for s in SEEDS for w in (g(f'OFF_{s}', 'denWalk') or [])]); denOn = med([w for s in SEEDS for w in (g(f'ALL_{s}', 'campWalk') or [])])
denOnD = med([w for s in SEEDS for w in (g(f'ALL_{s}', 'denWalk') or [])])
# ── 진단 판(서버 자 240날 · 위험 0 대조 · 몸 세계 60날) ──
dg = {t: (jl(t, 1020) or {}).get('bandit', {}).get('diag1404') for t in ('DIAG2_OFF_1020', 'DIAG2_NORISK_1020', 'DIAG_OFF_B')}
d0, dn, db = dg['DIAG2_OFF_1020'] or {}, dg['DIAG2_NORISK_1020'] or {}, dg['DIAG_OFF_B'] or {}
same = all((d0.get(k) == dn.get(k)) for k in ('car', 'noPair', 'notFirst', 'passed', 'farS', 'farW', 'ok', 'meetCall', 'meetNoT'))
onPair = d0.get('onPair') or {}
# ── 넷 다 1020 첫 해(재민 글) ──
J = jl('ALL_1020', 1020)
Y = {}
if J:
    ix = {k: i for i, k in enumerate(J['wcols'])}; w = J['w']
    y1 = [r for r in w if 1 <= r[ix['day']] <= 360]
    sm = lambda k: sum((r[ix[k]] or 0) for r in y1)
    live = [r for r in y1 if r[ix['day']] >= 46]
    hm = sorted({(r[ix['day']] - 1) // 30 + 1 for r in y1 if (r[ix['home']] or 0) > 0})
    Y = dict(raided=sm('raided'), sent=sm('sent'), killed=sm('killed'), lootN=sm('lootN'), fg=sm('fgFood'), home=sm('home'), starve=sm('starve'), denForm=sm('denForm'),
             mMin=min(r[ix['members']] for r in live), mMax=max(r[ix['members']] for r in live), gMin=min(r[ix['gangs']] for r in live), gMax=max(r[ix['gangs']] for r in live),
             pop360=next((r[ix['pop']] for r in w if r[ix['day']] == 360), None), first=next((r for r in w if (r[ix['gangs']] or 0) > 0), None), hm=hm, ix=ix)
    Y['firstDay'] = Y['first'][ix['day']] if Y['first'] else None; Y['firstN'] = Y['first'][ix['members']] if Y['first'] else None; Y['firstG'] = Y['first'][ix['gangs']] if Y['first'] else None
    Y['loot1104'] = None
st4 = g('ALL_1020', 't1404') or {}
smk = {}
HEAPT = [('ALL_42', '넷 다 42'), ('L_1020', '㉣ 만 1020'), ('LR_1020', '㉣ + ㉠ 1020'), ('NOFEAR_1020', '상인이 단을 모름 1020'), ('FS_1020', '㉡ + ㉢ 만(길목 안 나감) 1020')]
heapTxt = ' · '.join(f"{lab} 봉우리 {f0(g(t, 'heapPeak'))}MB(365날 {f0(g(t, 'heap365'))} · 2,000MB 넘은 날 {f0(g(t, 'heap2000'))})" for t, lab in HEAPT if g(t, 'heapPeak') is not None) or '—'
_j = jl('SMK_ALLT_1020', 1020)
if _j:
    _ix = {k: i for i, k in enumerate(_j['wcols'])}
    smk = dict(day=_j['w'][-1][_ix['day']], caps=' · '.join(str(x.get('cap')) for x in ((_j.get('t1404') or {}).get('gangs') or [])))
def dens(tag):   # 판 로그 `소굴#n 배치(x,y) 오지점수 s — 마을거리 a·교역로거리 b[·숲]`
    out = []
    for f in glob.glob(os.path.join(D, 'runs', tag, '*.log')):
        for line in open(f, encoding='utf-8', errors='replace'):
            m = re.search(r'소굴#(\d+) 배치\((\d+),(\d+)\) 오지점수 (\d+) — 마을거리 (\d+)·교역로거리 (\d+)(·숲)?', line)
            if m: out.append(dict(id=int(m.group(1)), x=int(m.group(2)), y=int(m.group(3)), sc=int(m.group(4)), dv=int(m.group(5)), dr=int(m.group(6)), forest=bool(m.group(7))))
            if len(out) >= 3: return out
    return out
DA, DO = dens('ALL_1020'), dens('OFF_1020')
pos = lambda L: [(d['x'], d['y']) for d in L]
sameO = [s_ for s_ in SEEDS[1:] if dens(f'OFF_{s_}') and pos(dens(f'OFF_{s_}')) == pos(DO)]
sameA = [s_ for s_ in SEEDS[1:] if dens(f'ALL_{s_}') and pos(dens(f'ALL_{s_}')) == pos(DA)]
sameTxt = lambda L: (' · '.join(L) + ' 도 같은 칸') if L else '다른 시드는 아직'
rng = lambda L, k: f"{min(x[k] for x in L)} ~ {max(x[k] for x in L)}" if L else '—'
denTxt = lambda L: ' / '.join(f"({d['x']},{d['y']}) 마을에서 {d['dv']}칸 · 교역로에서 {d['dr']}칸{' · 숲' if d['forest'] else ''}" for d in L)
loot04 = g('ALL_1020', 'loot1104Food'); fg04 = g('ALL_1020', 'fgFood')
fgShare = rat(fg04, (fg04 or 0) + (loot04 or 0)) if fg04 is not None and loot04 is not None else None
# ── 빈 마을(1020 넷 다) ──
def pervil(t, seed):
    j = jl(t, seed)
    if not j: return {}, []
    vix = {k: i for i, k in enumerate(j['vcols'])}; P = {}
    for r in j['vm']:
        v = r[vix['v']]; o = P.setdefault(v, {'fd': 0, 'raided': 0, 'Nend': None, 'm': -1, 'fe': 0.0, 'days': 0})
        o['fd'] += r[vix['fd']] or 0; o['raided'] += r[vix['raided']] or 0; o['fe'] += r[vix['feSum']] or 0; o['days'] += r[vix['days']] or 0
        if r[vix['m']] > o['m']: o['m'] = r[vix['m']]; o['Nend'] = r[vix['Nend']]
    return P, j['names']
EMP = []
for s in SEEDS + ['W']:
    tA, tO = (f'ALL_{s}', f'OFF_{s}'); seed = 1020 if s == 'W' else int(s)
    if (S.get(tA) or {}).get('partial'): continue   # 덜 돈 판(42 넷 다)은 첫 해 표 · 빈 마을 목록에서만
    PA, nm = pervil(tA, seed); PO, _ = pervil(tO, seed)
    for v, o in PA.items():
        if (o['Nend'] or 0) == 0 and o['days'] > 0:
            b = PO.get(v) or {}
            EMP.append(dict(seed=s, name=nm[v], raided=o['raided'], fd=o['fd'], fdOff=b.get('fd'), nOff=b.get('Nend'), fe=rat(o['fe'] / max(1, o['days']), (b.get('fe') or 0) / max(1, b.get('days') or 1))))
empTxt = ' · '.join(f"{e['name']}({e['seed']} — 털린 건 {e['raided']} · 굶어 죽음 {e['fd']}(끔 {f0(e['fdOff'])}) · 사람당 식량 끔의 {f2(e['fe'])} · 끔 끝 인구 {f0(e['nOff'])})" for e in EMP) or '없음'
popEndAll = [g(f'ALL_{s}', 'popEnd') for s in SEEDS]
mPeakMax = max([x for x in (g(f'ALL_{s}', 'mPeak') for s in SEEDS) if x is not None] or [0])
mShare = rat(mPeakMax, min([x for x in popEndAll if x] or [None]) if any(popEndAll) else None) if any(popEndAll) else None
def empties(t, seed):   # 판 끝에 빈 마을(관찰기 마을-달 줄) — (이름, 처음 0 이 된 달)
    j = jl(t, seed)
    if not j: return None
    vix = {k: i for i, k in enumerate(j['vcols'])}; last = {}; first0 = {}
    for r in sorted(j['vm'], key=lambda r: r[vix['m']]):
        v = r[vix['v']]; last[v] = r
        if (r[vix['Nend']] or 0) == 0 and v not in first0: first0[v] = r[vix['m']]
    return [(j['names'][v], first0.get(v, 0) + 1) for v, r in last.items() if (r[vix['Nend']] or 0) == 0]
def nmin(t, seed, name):
    j = jl(t, seed)
    if not j: return None
    vix = {k: i for i, k in enumerate(j['vcols'])}
    xs = [r[vix['Nmin']] for r in j['vm'] if j['names'][r[vix['v']]] == name]
    return min(xs) if xs else None
EMPR = [('ALL_1020', 1020, '1020 넷 다'), ('NOFEAR_1020', 1020, '1020 상인이 단을 모름'), ('FS_1020', 1020, '1020 ㉡ + ㉢ 만(약탈 0)'), ('LR_1020', 1020, '1020 ㉣ + ㉠(첫 해)'), ('L_1020', 1020, '1020 ㉣ 만(첫 해)'), ('ALL_7', 7, '7 넷 다'), ('ALL_42', 42, '42 넷 다(날 390)'), ('ALL_W', 1020, '전쟁 넷 다'), ('OFF_1020', 1020, '끔 1020'), ('OFF_7', 7, '끔 7'), ('OFF_42', 42, '끔 42'), ('OFF_W', 1020, '전쟁 끔')]
empAll = ' · '.join(f"{lab} {(', '.join(f'{n}({m}달째)' for n, m in (empties(t, sd) or [])) or '0')}" for t, sd, lab in EMPR if jl(t, sd))
n14 = nmin('OFF_1020', 1020, '농촌14')
emptyV = [g(f'ALL_{s}', 'empty') for s in SEEDS]; emptyAny = any((x or 0) > 0 for x in emptyV); emptyDone = all(x is not None for x in emptyV)

def y(t, k): o = (S.get(t) or {}).get('y1') or {}; return o.get(k)
X = {}
ORD = {1: '첫째', 2: '둘째', 3: '셋째', 4: '넷째', 5: '다섯째', 6: '여섯째', 7: '일곱째', 8: '여덟째', 9: '아홉째', 10: '열째', 11: '열한째', 12: '열두째'}
X['answer'] = (f"지금(끔) 소굴은 지난 한 해 쓰인 교역로에서 걸어 {f0(denOff)}칸(가운데) 떨어진 오지에 서고, 도적 하루가 하루 길 캐러밴을 처음 보는 날 그 캐러밴은 벌써 길목을 지났다 — 약탈 0 · 단은 결성 비축만 먹다 "
               f"굶어 줄고(두 해 단 굶어 죽음 {ser('OFF', 'gStarve')}) 흩어졌다 다시 선다. 손잡이 넷을 켜면 소굴이 마을 곁 숨을 자리(걸음 {f0(denOnD)}칸)에 서고, 단이 길목에 나가 서서 기다려 "
               f"판 자에서도 두 해 {ser('ALL', 'lootN')}건을 털고(털린 캐러밴 {ser('ALL', 'raidShare', pc)}), 사냥 · 채집이 단에 든 먹을 것의 {pc(fgShare)}(1020)를 대며, 비축이 열흘 바닥이면 "
               f"그 땅이 먹이는 수를 넘는 사람이 마을로 걸어가 단 굶어 죽음 {ser('ALL', 'gStarve')} · 단원 봉우리 {ser('ALL', 'mPeak')}이다. 대가: 길목 표(은거지 450칸 안 길)에 든 쌍이 "
               f"{ser('OFF', 'pairsMean')} → {ser('ALL', 'pairsMean')}으로 늘고 교역 식량 수입 끔비 {ratio('ALL', 'foodImp')} · 인구 끔비 {ratio('ALL', 'popEnd')} · "
               f"빈 마을 {ser('ALL', 'empty')}" + (f" — 과녁 '빈 마을 0' 은 못 맞혔다(상인이 단을 모르는 대조 1020: 식량 수입 끔비 {f2(rat(g('NOFEAR_1020', 'foodImp'), g('OFF_1020', 'foodImp')))} · 인구 끔비 {f2(rat(g('NOFEAR_1020', 'popEnd'), g('OFF_1020', 'popEnd')))} · 빈 마을 {f0(g('NOFEAR_1020', 'empty'))} — §4 · 회부 2)." if emptyAny else (" — 과녁 '빈 마을 0' 은 맞았다." if emptyDone else "."))
               + (f" 42 넷 다 두 해는 없다 — 기본 힙 판은 날 ~380 에 힙 한도로 죽고 큰 힙 판도 날 385 무렵 하루 2.5분으로 기어 날 {(S.get('ALL_42') or {}).get('day')} 에서 끊었다(첫 해 세 시드 표 · 회부 11 — 42 첫 해 빈 마을 {f0(y('ALL_42', 'empty360'))})." if (S.get('ALL_42') or {}).get('partial') else ''))
plain = ["**읽는 법:** 넷 다 켠 세계(1020)의 첫 해를 달(30날)로 끊었다. 단 · 단원 · 비축 = 그 달 끝 · 나머지 = 그 달 합. 판 = 보는 사람 없는 서버 자(몸 상한 1 — 단원 대부분이 몸 없이 장부로 선다).", '']
if Y:
    r60 = next((r for r in J['w'] if r[Y['ix']['day']] == 60), None)
    plain += [f"* 둘째 달(D{Y['firstDay']}부터)에 소굴 셋에 단 {r60[Y['ix']['gangs']] if r60 else '—'} · {r60[Y['ix']['members']] if r60 else '—'}명이 선다. 소굴은 마을 곁 숨을 자리다(마을에서 {rng(DA, 'dv')}칸 · 교역로에서 {rng(DA, 'dr')}칸) — 지금(끔)은 마을에서 {rng(DO, 'dv')}칸 떨어진 오지다.",
              f"* 단은 길목에 나가 서서 기다린다. 첫 해 {f0(Y['raided'])}번 캐러밴을 털었고(그해 떠난 캐러밴 {f0(Y['sent'])}대의 {pc(rat(Y['raided'], Y['sent']))}) 털릴 때마다 행상 한 사람이 그 자리에서 쓰러졌다(첫 해 {f0(Y['killed'])}명).",
              f"* 약탈이 없는 날엔 은거지 둘레에서 사냥 · 채집한다 — 첫 해 {f1(Y['fg'])}(장물까지 든 먹을 것의 {pc(fgShare)} · 두 해 1020). 은거지 땅은 사냥 · 채집만으로는 한 사람도 못 먹인다(§3 · 회부 3).",
              f"* 비축이 열흘 바닥이면 그 땅이 먹이는 수를 넘는 사람이 가장 가까운 산 마을로 걸어간다 — 첫 해 {f0(Y['home'])}명({' · '.join(ORD[m] for m in Y['hm']) or '—'} 달). 굶어 죽은 단원 {f0(Y['starve'])}.",
              f"* 단은 한 해 내내 {Y['gMin']} ~ {Y['gMax']} · 단원 {Y['mMin']} ~ {Y['mMax']}명 — 세계 인구(360날 {f0(Y['pop360'])}명)의 {pc(rat(Y['mMax'], Y['pop360']))} 밑. 두 해 봉우리는 {ser('ALL', 'mPeak')}(1020 · 7 · 42).",
              f"* 대가: 교역 식량 수입이 끔의 {ratio('ALL', 'foodImp')} · 두 해 끝 인구가 끔의 {ratio('ALL', 'popEnd')} · 빈 마을 {ser('ALL', 'empty')}(1020 · 7 · 42 — 42 는 두 해 없음). 상인이 길목 단을 모르는 대조(1020)에선 식량 수입 {f2(rat(g('NOFEAR_1020', 'foodImp'), g('OFF_1020', 'foodImp')))} · 인구 {f2(rat(g('NOFEAR_1020', 'popEnd'), g('OFF_1020', 'popEnd')))} · 빈 마을 {f0(g('NOFEAR_1020', 'empty'))}(§4)."]
X['plain'] = plain
X['glance'] = [
    ['소굴 → 쓰인 교역로 걸음(가운데 · 세 시드)', f"끔 {f0(denOff)}칸 → 켬 소굴 {f0(denOnD)}칸 · 은거지 전부 {f0(denOn)}칸", '§1 ⓐ'],
    ['약탈 0 의 까닭(끔)', f"캐러밴-날 {pc(rat(d0.get('noPair'), d0.get('car')))}가 단 없는 쌍 · 단 있는 쌍은 도적 하루가 처음 볼 때 벌써 지났다(하루 길) · 위험 0 대조 {'같음' if same else '다름'}", '§1 ⓑ'],
    ['단이 먹는 길(끔)', '결성 비축 + 장물 — 장물 0 이라 비축을 다 먹고 굶는다(사냥 · 채집 0)', '§1 ⓒ'],
    ['단 수 평균(1020 · 7 · 42)', f"끔 {ser('OFF', 'gMean', f2)} → 켬 {ser('ALL', 'gMean', f2)}", '§3-1'],
    ['단원 봉우리', f"끔 {ser('OFF', 'mPeak')} → 켬 {ser('ALL', 'mPeak')}(세계 인구의 {pc(mShare)} 밑)", '§3-1'],
    ['단 굶어 죽음(두 해)', f"끔 {ser('OFF', 'gStarve')} → 켬 {ser('ALL', 'gStarve')}", '§3-1'],
    ['약탈 건 · 털린 캐러밴 몫', f"끔 0 → 켬 {ser('ALL', 'lootN')} · {ser('ALL', 'raidShare', pc)}", '§3-1'],
    ['행상 피살', f"끔 0 → 켬 {ser('ALL', 'killed')}(털린 캐러밴마다 한 사람)", '§3-1 · 회부 4'],
    ['교역 식량 수입 끔비', ratio('ALL', 'foodImp'), '§3-1 · §4'],
    ['인구 730 끔비', ratio('ALL', 'popEnd'), '§3-1 · §4'],
    ['빈 마을(끝)', f"끔 {ser('OFF', 'empty')} → 켬 {ser('ALL', 'empty')}", '§4 · 회부 2'],
    ['가난한 다섯 마을 굶어 죽음', f"끔 {ser('OFF', 'poor5')} → 켬 {ser('ALL', 'poor5')}", '§3-1'],
    ['호위(캐러밴 하나 · 2년째)', f"끔 {ser('OFF', 'escY2', f3)} → 켬 {ser('ALL', 'escY2', f3)}", '§3-1'],
    ['목책(365 · 끝 — 마을 합)', f"끔 {ser('OFF', 'pal365', f1)} · {ser('OFF', 'palEnd', f1)} → 켬 {ser('ALL', 'pal365', f1)} · {ser('ALL', 'palEnd', f1)}", '§3-1'],
    ['전쟁 조건 360날(1020)', f"약탈 {f0(g('ALL_W', 'lootN'))} · 단 굶어 죽음 {f0(g('OFF_W', 'gStarve'))} → {f0(g('ALL_W', 'gStarve'))} · 인구 끔비 {f2(rat(g('ALL_W', 'popEnd'), g('OFF_W', 'popEnd')))} · 빈 마을 {f0(g('ALL_W', 'empty'))}", '§3-3'],
    ['상인이 단을 모르면(진단 대조 · 1020)', f"교역 식량 수입 끔비 {f2(rat(g('NOFEAR_1020', 'foodImp'), g('OFF_1020', 'foodImp')))} · 인구 끔비 {f2(rat(g('NOFEAR_1020', 'popEnd'), g('OFF_1020', 'popEnd')))} · 빈 마을 {f0(g('NOFEAR_1020', 'empty'))} · 약탈 {f0(g('NOFEAR_1020', 'lootN'))}", '§4'],
    ['42 넷 다(두 해)', f"날 {(S.get('ALL_42') or {}).get('day')} 에서 끊음 — 첫 해만(인구 365 끔비 {f2(rat(y('ALL_42', 'pop365'), y('OFF_42', 'pop365')))} · 빈 마을 {f0(y('ALL_42', 'empty360'))} · 약탈 {f0(y('ALL_42', 'lootN'))} · 단 굶어 죽음 {f0(y('ALL_42', 'gStarve'))})" if (S.get('ALL_42') or {}).get('partial') else '두 해 다 돌았다', '§3-1 첫 해 표 · 회부 11'],
    ['하네스 · 미끼 · 옛 코드 빨강', '20/20 · 3/3 · 빨강 ○(✓ 4 · ✗ 16 — 초록 넷 = 끔 줄 셋 · 몸 걸음 보존)', '§5'],
]
X['diagA'] = [
    '| 고르는 자 | 언제 | 어떻게(끔 = 지금) |', '|---|---|---|',
    '| 상시 소굴 `denScan`(`_denBegin` · `_denStep` · `_denEnd`) | 부팅 한 번(새 세계 · 저장이 있으면 그 소굴을 복원 — `init`) | 16칸 간격 후보 · 마을에서 `BDT_DEN_DV` 200칸 밖 · **오지 점수** `min(마을까지, 500) + min(교역로까지, 400) × 0.7 + 숲 60` 높은 차례 · 소굴끼리 `BDT_DEN_SEP` 250칸 · 셋(맵 4,063칸 ≥ 1,200) |',
    '| 해체 단 은거지 `campSpot`(`formGang`) | 마을이 무너진 날 | 제 마을 가운데에서 나선 · 영토 + `BDT_CAMP_BUF` 40칸 밖 · 걸을 수 있는 칸 · 점수 = 교역로 30칸(`BDT_RT_R`) 안 `(30 − 거리) × 1.4`(밖은 감점) + 숲 + 고향 근접 |',
    '| 소굴 단 재결성(`주둔지 n대`) | 소굴이 비고 날이 차면 | 소굴 칸 그대로(자리 고르기 0) |',
    '',
    f"오지 점수는 마을 · 교역로에서 **멀수록** 높다 — 소굴은 길목 밖에 서도록 짜였다. 끔 소굴(1020 — {sameTxt(sameO)}: 땅 · 마을 자리로만 고른다): {denTxt(DO)}. 켬(㉠ · 1020 — {sameTxt(sameA)}): {denTxt(DA)} — 털 것 점수가 셋 다 {', '.join(str(d['sc']) for d in DA)}(부팅 날 곳간이 같다 — 회부 6) (판 로그 `소굴#n 배치`).",
    '걸음 거리 = 판 끝, 지난 한 해 길 위 캐러밴이 있었던 쌍의 길 칸까지 코스 A*(호스트 `t1079Len` — 사람이 걷는 그 길) · 괄호 = 곧은 거리 · 은거지 = 판에서 본 단 전부(소굴 단 + 해체 단).',
]
fn = lambda d, k: f0(d.get(k)) if d else '—'
X['diagB'] = [
    '| `_t1104Pick` 줄(T1104 고르기 문 — 종전) | 서버 자 240날(1020) | 위험 0 대조(`banditRouteRisk` → 0) | 몸 세계 60날(`T577_BODY=1`) |', '|---|---|---|---|',
    f"| 도적 하루가 본 캐러밴-날 | {fn(d0, 'car')} | {fn(dn, 'car')} | {fn(db, 'car')} |",
    f"| ⓐ 그 쌍이 길목 표에 없다(은거지 450칸 안을 지나는 길이 아니다) | {fn(d0, 'noPair')}({pc(rat(d0.get('noPair'), d0.get('car')))}) | {fn(dn, 'noPair')} | {fn(db, 'noPair')} |",
    f"| ⓑ 그 쌍의 첫 단이 아니다 | {fn(d0, 'notFirst')} | {fn(dn, 'notFirst')} | {fn(db, 'notFirst')} |",
    f"| ⓒ **벌써 길목을 지났다** | {fn(d0, 'passed')} | {fn(dn, 'passed')} | {fn(db, 'passed')} |",
    f"| ⓓ 못 닿는다(곧은 거리 · 걸음) | {f0((d0.get('farS') or 0) + (d0.get('farW') or 0))} | {f0((dn.get('farS') or 0) + (dn.get('farW') or 0))} | {f0((db.get('farS') or 0) + (db.get('farW') or 0))} |",
    f"| 고름(나간 단) | {fn(d0, 'ok')} | {fn(dn, 'ok')} | {fn(db, 'ok')} |",
    f"| 만남 부름 · 그중 노린 단 없음 | {fn(d0, 'meetCall')} · {fn(d0, 'meetNoT')} | {fn(dn, 'meetCall')} · {fn(dn, 'meetNoT')} | {fn(db, 'meetCall')} · {fn(db, 'meetNoT')} |",
    '',
    f"* **ⓒ 가 뿌리:** 단이 그 쌍의 캐러밴을 처음 본 날(출발 뒤) — 가는 길 +1날 {onPair.get('outbound:1', 0)} · 귀로 +2 {onPair.get('inbound:2', 0)} · +3 {onPair.get('inbound:3', 0)} · +4 {onPair.get('inbound:4', 0)}. 다리가 다 장부 하루(`_tripDayMs` — 하루 {f0(d0.get('ppd') and d0['ppd'] / 32)}칸)라 도적 하루(econ 틱 뒤 · 새 날 이름)가 처음 보는 날엔 그 캐러밴이 벌써 길목을 지났다.",
    '* **ⓐ 가 양:** 소굴이 오지라 캐러밴-날의 99% 가 단 없는 쌍이다 — 단 있는 쌍이라도 ⓒ 로 0.',
    f"* 몸 · 호위 · 위험 인지는 그 앞에서 끝난다: 고름 0 이라 나간 단 0 · 만남 부름은 다 '노린 단 없음'. 위험 0 대조는 수 하나 안 바뀐다({'같음' if same else '다름'}) — 상인이 길을 돌린 탓이 아니다. 몸 세계(몸 상한 없음)도 같은 자리에서 0.",
    '* 라이브 세계 로그는 이 상자에서 못 읽는다(서버 손 0 — 회부 10).',
]
X['diagC'] = [
    '| 들어오는 것 | 나가는 것 |', '|---|---|',
    '| 결성 비축 — 소굴 재결성 한 사람 30(`BDT_DEN_FOOD` · 4 ~ 6명 `BDT_DEN_SZ0 ~ 1` · 30 ~ 60날마다 `BDT_DEN_CD0 ~ 1`) · 해체 단 한 사람 6(`formGang`) | 유지비 하루 한 사람 0.5(`BDT_UPKEEP`) |',
    '| 장물 — 식량류 × 0.5 · 잡화 × 0.25(`BDT_FENCE_F` · `BDT_FENCE_G` — 장물아비 환산) · 더미 상한 한 사람 60(`BDT_CAP`) | 비축 0 열흘(`BDT_STARVE`) → 한 사람 굶어 죽음 · 그 뒤 다섯 날마다(`g.zero − 5`) |',
    '',
    f"끔에선 장물 0 → 먹는 길은 결성 비축 하나다(사냥 · 채집 0 — 단은 econ 마을이 아니다). 4 ~ 6명 단의 비축 120 ~ 180 은 두 달이면 바닥 → 굶어 줄다 흩어지고 → 소굴이 다시 선다(두 해 소굴 재결성 {ser('OFF', 'denForm')} · 단 굶어 죽음 {ser('OFF', 'gStarve')}). 아래 표 = 두 해 합(끔 · 넷 다).",
    '',
]
X['impl'] = [
    '| 손잡이(다 끔 기본) | 고친 자리 | 무엇을(새 수 0) |', '|---|---|---|',
    '| ㉠ `T1404_DEN_ROUTE=1` | `_denStep` 첫 줄 → `_t1404Dens` · `formGang` 자리 → `_t1404Camp` · `campSpot(…, hide, sep)` | 마을마다 그 둘레의 **숨을 자리**(숲 — `forestMult > 1.2` 그 판정 · 바위 곁)를 `campSpot` 점수(길목 30칸 가점 · 영토 완충 밖)로 고르고, 점수 = 그 마을 털 것(`_t1391Loot` — `T1391_DEN_RICH` 팔 그 식). 소굴 개수 · 이격 · 차례는 `_denEnd` 그대로. 해체 단 = 정보 반경 안 털 것 많은 마을부터 · 없으면 제 마을 · 그것도 없으면 종전 자리. |',
    '| ㉡ `T1404_GANG_FORAGE=1`(`tool` = 석기 팔) | `daily` 유지비 앞 `_t1404Forage` | 단원이 은거지 땅에서 사냥 · 채집 — econ 그 표(`jobCapacity` 직업 자리 · `JOBS` base × 땅 × 숙련(1 + 0.05 × 숙련) × 도구 등급(맨손 0.25 · 석기 1.4 · 청동 1.4 · 철 1.8) · 채집 `forageSustain` MSY · `FORAGE_FOOD_FACTOR` 식량 환산) · 더 먹이는 일부터 자리를 채운다 · 더미 상한 한 사람 60 그대로. 땅 = 마을 시딩 그 읽개(`villages.js` 한 줄 `t1404Land` — 영토 없는 자리 = 크기 바닥 30). 도구 = 단이 쥔 것(더미 무기 짐의 도구) · `tool` = 다 석기(판정 재료 팔). |',
    '| ㉢ `T1404_GANG_SIZE=1` | `daily` 굶음 줄 → `_t1404Leave` · `_t1404Split` | 비축 0 열흘(종전 = 한 사람 굶어 죽음)이면 **그 땅이 먹이는 수**(㉡ 식으로 먹을 것 ≥ 사람 × 0.5 인 가장 큰 수 · ㉡ 끔 = 0)를 넘는 사람이 떠난다: 넘친 사람이 셋 이상이고 땅이 셋 이상 먹이면 갈라져 다른 길목(㉠ 자리 · 있는 단에서 250칸 밖)으로 걷고 · 아니면 가장 가까운 산 마을로(해산 문 `_t1079Home` — 받는 마을 문 그대로). 숫자 상한 0. |',
    '| ㉣ `T1404_RAID_LURK=1`(T1104 걸음 켬 위) | `_t1104Day` 은거지 갈래 → `_t1404Go` · `_t1404LurkDay` · `_t1104Meet` 첫 줄 → `_t1404Meet` | 단은 캐러밴을 골라 쫓지 않고 **길목에 나가 서서 기다린다** — 길목 = 이 단이 든 길목 표 쌍 중 지나간 캐러밴을 가장 많이 본 곳(기억 감쇠 `BDT_RISK_DK` · 처음엔 가장 가까운 곳). econ 이 캐러밴마다 부르는 만남 문에서, 오늘 장부가 그 길목을 지나고 몸 있는 단원이 다 그 칸에 서 있으면(T1184) 그 단을 준다 — 싸움 · 호위 · 손실 몫은 econ `_raidMeet` → `_raidScrum` 그대로. 몸 없는 단원(판 자 — 몸 상한 밖)은 장부로 선다 = 몸 판 · 판 자 같은 답. 만난 뒤 · 토벌대가 오면 은거지로. |',
    '',
    '* 끔 = 갈래가 하나도 안 닿는다(손잡이 넷 다 `process.env` 한 번 · 셈 칸 `S.stats.t1404` 도 켬에서만 선다) — 끈 판 같음 1/1(§6). 증인 `t1404()`(읽기만) · 하네스 문 `_t1404Probe`.',
    '* 몸: 소굴 단 · 해체 단 몸은 종전 그대로 · 길목으로 걷는 몸 = T1104 걸음 문(`t1104Walk`) · 갈라진 단 몸 = 걸어서 새 은거지로(장부 `S.ROAD` · 닿는 날 단이 선다) · 마을로 가는 몸 = 해산 걸음(`S.WALK`). 순간이동 · 사라짐 · 다시 나타남 0(하네스 ④d).',
]
X['main'] = [
    f"* **단 굶어 죽음** 끔 {ser('OFF', 'gStarve')} → 켬 {ser('ALL', 'gStarve')}. 굶음 줄 대신 ㉢ 떠남 — 마을로 {' · '.join(f0((g(f'ALL_{s}', 't1404') or {}).get('home')) for s in SEEDS)}명 · 갈라짐 {ser('ALL', 'split')}.",
    f"* **약탈** 끔 0 → 켬 {ser('ALL', 'lootN')}건 · 털린 캐러밴 몫 {ser('ALL', 'raidShare', pc)} · 행상 피살 {ser('ALL', 'killed')} · 장물 식량(털린 쪽 식량류) {ser('ALL', 'lootFood', f1)}.",
    f"* **단 수 · 단원** 단 평균 {ser('ALL', 'gMean', f2)} · 봉우리 {ser('ALL', 'gPeak')} · 단원 봉우리 {ser('ALL', 'mPeak')}(끔 {ser('OFF', 'mPeak')}) — 세계 인구의 {pc(mShare)} 밑(과녁 '봉우리 888 · 1,611 같은 수 0').",
    f"* **빈 마을** 끔 {ser('OFF', 'empty')} → 켬 {ser('ALL', 'empty')} — {empTxt}. 털려서가 아니라 굶어서 비었다 · 켠 판마다 다른 마을이 빈다(§4 · 회부 2).",
    f"* **호위 · 목책** 캐러밴 하나 호위 1년 끔 {ser('OFF', 'escY1', f3)} → 켬 {ser('ALL', 'escY1', f3)} · 2년 {ser('OFF', 'escY2', f3)} → {ser('ALL', 'escY2', f3)} · 목책(마을 합) 365날 {ser('OFF', 'pal365', f1)} → {ser('ALL', 'pal365', f1)} · 끝 {ser('OFF', 'palEnd', f1)} → {ser('ALL', 'palEnd', f1)}.",
    f"* **토벌** 끔 · 켬 다 0 — 판 자(몸 상한 1)에선 원정 몸이 없다(T1184 · 회부 8).",
]
def y(t, k): o = (S.get(t) or {}).get('y1') or {}; return o.get(k)
X['step'] = [
    '아래 표 = 첫 해(1 ~ 365날) — ㉣ 만 · ㉣ + ㉠ 는 365날만 돌았다(상자 재시작 · 힙 한도로 판이 밀려 시간을 줄였다) · 두 해 판은 첫 해 몫을 잘라 견준다 · 끔비 = 끔 1020 첫 해.',
    '',
]
X['step2'] = [
    '',
    f"* ㉣ 만(소굴 오지 그대로): 약탈 {f0(y('L_1020', 'lootN'))}(넷 다 {f0(y('ALL_1020', 'lootN'))}) · 단 굶어 죽음 {f0(y('L_1020', 'gStarve'))}(끔 {f0(y('OFF_1020', 'gStarve'))}) · 길목 표 쌍 날 평균 {f0(y('L_1020', 'pairsMean'))} — 오지 소굴 450칸 안을 지나는 길에서만 선다(§1 ⓑ ⓐ).",
    f"* ㉣ + ㉠: 약탈 {f0(y('LR_1020', 'lootN'))} · 단 굶어 죽음 {f0(y('LR_1020', 'gStarve'))} · 단원 봉우리 {f0(y('LR_1020', 'mPeak'))} · 길목 표 쌍 {f0(y('LR_1020', 'pairsMean'))} · 인구 365 끔비 {f2(rat(y('LR_1020', 'pop365'), y('OFF_1020', 'pop365')))} · 빈 마을(360날) {f0(y('LR_1020', 'empty360'))}.",
    f"* 넷 다(㉡ 쥔 도구 — 단 더미에 도구 짐이 없어 맨손): 단 굶어 죽음 {f0(y('ALL_1020', 'gStarve'))} · 사냥 · 채집 {f1(y('ALL_1020', 'fgFood'))}(두 해 {f1(g('ALL_1020', 'fgFood'))} — 거의 다 채집: 맨손 사냥 0.7 × 짐승 0.45 × 0.25 = 0.08 < 채집 0.13 ~ 0.19).",
    f"* 석기 팔(`tool`)은 {smk.get('day', '—')}날 맛보기 판(`SMK_ALLT_1020`)만 — 사냥꾼 넷(직업 자리 `floor(30 × 0.45 × 0.3)`) × 0.44 = 하루 1.76 + 채집 → 단 4 ~ 6명 몫 2.0 ~ 3.0 에 못 미쳐 **먹이는 수 0**(단마다 {smk.get('caps', '—')}). 두 해 판은 안 돌렸다(시간).",
    f"* ㉡ + ㉢ 만(약탈 없이 · 소굴 오지): 첫 해 약탈 {f0(y('FS_1020', 'lootN'))} · 단 굶어 죽음 {f0(y('FS_1020', 'gStarve'))} · 마을로 떠남 {f0(y('FS_1020', 'home'))} / 두 해 단 굶어 죽음 {f0(g('FS_1020', 'gStarve'))}(끔 {f0(g('OFF_1020', 'gStarve'))}) · 마을로 떠남 {f0((g('FS_1020', 't1404') or {}).get('home'))}(몸 {f0((g('FS_1020', 't1404') or {}).get('homeBody'))} · 사람 기록 {f0((g('FS_1020', 't1404') or {}).get('homeRec'))} · 둘 다 없음 {f0((g('FS_1020', 't1404') or {}).get('homeNone'))}) · 사냥 · 채집 {f1(g('FS_1020', 'fgFood'))} · 단원 봉우리 {f0(g('FS_1020', 'mPeak'))}.",
    "* 상인이 단을 모르는 대조(제품 밖 패치 `DIAG_NOFEAR` — `banditRouteRisk` 0 · `banditGang` 없음 · 약탈 문 `banditMeet` 은 그대로): §4.",
]
X['war'] = [
    f"* 끔 → 켬: 약탈 0 → {f0(g('ALL_W', 'lootN'))} · 행상 피살 {f0(g('ALL_W', 'killed'))} · 털린 캐러밴 {pc(g('ALL_W', 'raidShare'))} · 단 굶어 죽음 {f0(g('OFF_W', 'gStarve'))} → {f0(g('ALL_W', 'gStarve'))} · 단원 봉우리 {f0(g('OFF_W', 'mPeak'))} → {f0(g('ALL_W', 'mPeak'))} · 토벌 {f0(g('OFF_W', 'sup'))} → {f0(g('ALL_W', 'sup'))}(원정 전사 {f0(g('ALL_W', 'supDead'))}) · 인구 끔비 {f2(rat(g('ALL_W', 'popEnd'), g('OFF_W', 'popEnd')))} · 교역 식량 수입 끔비 {f2(rat(g('ALL_W', 'foodImp'), g('OFF_W', 'foodImp')))} · 빈 마을 {f0(g('OFF_W', 'empty'))} → {f0(g('ALL_W', 'empty'))} · 가난한 다섯 굶어 죽음 {f0(g('OFF_W', 'poor5'))} → {f0(g('ALL_W', 'poor5'))}.",
    f"* **몸 세계에서도 턴다:** 몸 상한이 없는 판이라 단원이 다 몸이다 — 만남 {f0((g('ALL_W', 't1404') or {}).get('met'))} 중 몸 없는 단원이 낀 만남 {f0((g('ALL_W', 't1404') or {}).get('metBodiless'))}(서버 자 1020 은 {f0(st4.get('met'))} 중 {f0(st4.get('metBodiless'))}) — 몸이 다 길목 칸에 서야 싸운다(T1184 · 하네스 ①a · ①c 가 같은 답을 본다).",
    '* 표의 "인구 365 · 730" 칸 = 전쟁 판은 360날 끝 값 하나(365 칸 —) · "호위 2년" · "목책 365" 칸 —.',
    '* 전쟁 조건은 벽시계 판이다(가상 시계 끔 · 하루 250ms) — 같은 손잡이라도 판마다 날 길이가 조금씩 다르다. 끔 · 켬 둘 다 옆에 서버 자 판 하나를 같이 돌렸다(같은 짐 · 켬 판은 상자 재시작 뒤 다시 돌았다).',
]
X['feed'] = [
    '길목 표 = 은거지에서 450칸(`BDT_RAID_R` — "소굴서 원정" 시절 사정거리) 안을 지나는 교역로 쌍. econ 상인은 그 쌍에서 **위험**(`banditRouteRisk` 0.15 → 약탈 확률 · 기대 손실)과 **길목 단**(`banditGang` — 호위 1.5 × 단원 · 호위가 모자라면 기대 손실 0.6)을 본다(`_legRiskV2` · `_escortOfV2` — econ 손 0).',
    '',
]
r_ = lambda t, k: f2(rat(g(t, k), g('OFF_1020', k)))
X['feed2'] = [
    '',
    f"* 길목 표에 든 쌍(날 평균 · 전체 1,275쌍): 끔 {ser('OFF', 'pairsMean')} → 켬 {ser('ALL', 'pairsMean')} — 소굴 · 은거지가 길목 곁(걸음 10 ~ 35칸)으로 오자 은거지 450칸 안을 지나는 쌍이 여섯 배쯤 됐다.",
    f"* 1020 두 해 — 넷 다 → 넷 다 + 상인이 단을 모름: 교역 식량 수입 끔비 {r_('ALL_1020', 'foodImp')} → {r_('NOFEAR_1020', 'foodImp')} · 새 캐러밴 끔비 {r_('ALL_1020', 'newCar')} → {r_('NOFEAR_1020', 'newCar')} · 인구 끔비 {r_('ALL_1020', 'popEnd')} → {r_('NOFEAR_1020', 'popEnd')} · 빈 마을 {f0(g('ALL_1020', 'empty'))} → {f0(g('NOFEAR_1020', 'empty'))} · 굶어 죽음 {f0(g('ALL_1020', 'fd'))} → {f0(g('NOFEAR_1020', 'fd'))}(끔 {f0(g('OFF_1020', 'fd'))}) · 가난한 다섯 {f0(g('ALL_1020', 'poor5'))} → {f0(g('NOFEAR_1020', 'poor5'))}(끔 {f0(g('OFF_1020', 'poor5'))}) · 약탈 {f0(g('ALL_1020', 'lootN'))} → {f0(g('NOFEAR_1020', 'lootN'))} · 2년째 호위 {f3(g('ALL_1020', 'escY2'))} → {f3(g('NOFEAR_1020', 'escY2'))}(끔 {f3(g('OFF_1020', 'escY2'))}).",
    f"* **빈 마을은 켠 판마다 다른 마을이다**(판 끝 · 처음 빈 달 — 판 첫 달 = 1달째): {empAll}. 털린 건은 1020 넷 다의 두 마을 1 · 0. 끔 1020 도 농촌14 가 {f0(n14)}명까지 줄었다가 살아났다.",
    f"* 이 대조는 상인이 보는 두 문(`banditRouteRisk` · `banditGang`)만 끈다 — 약탈 문(`banditMeet` · 싸움 · 행상 피살) · 소굴 자리 · 단 살림은 넷 다 그대로다. 그 두 문을 끄면 인구 · 식량 수입 · 빈 마을은 끔 쪽으로 다가가고({r_('ALL_1020', 'popEnd')} → {r_('NOFEAR_1020', 'popEnd')} · {r_('ALL_1020', 'foodImp')} → {r_('NOFEAR_1020', 'foodImp')} · {f0(g('ALL_1020', 'empty'))} → {f0(g('NOFEAR_1020', 'empty'))}) 굶어 죽음은 거의 그대로다({f0(g('ALL_1020', 'fd'))} → {f0(g('NOFEAR_1020', 'fd'))} · 끔 {f0(g('OFF_1020', 'fd'))}).",
    '* 450칸은 단이 소굴에서 원정 가던 시절의 수다. ㉣ 의 단은 제가 선 길목 하나에서만 턴다 — 상인이 볼 위험 쌍을 무엇으로 할지(450칸 그대로 · 단이 선 길목 · 턴 기록)는 새 수 · 판정이라 이 카드는 안 고쳤다(회부 2).',
]
X['harness'] = [
    '`scripts/test-t1404-bandit-live.js`(`@regress` · `@bait 3` · 운영 함수 그대로 · 꾸민 세계 아이 판 열한 개 · 날짜 · 벽시계 0 · 제 `/tmp` 0) — **20/20**.',
    '',
    '| 줄 | 보는 것 |', '|---|---|',
    '| ①a ①b | ㉣ 켬 — 단이 길목에 나가 서서 기다리다 하루 길 캐러밴(402 → 403)을 장부가 지나는 날 그 길목 칸에서 만난다 · 은거지로 돌아와 노획을 더미에 |',
    '| ①c | 몸 없는 단(판 자 · `BANDIT_BODIES=0`) = 같은 날 · 같은 싸움 · 같은 손실 몫(몸 판과 같은 답) |',
    '| ①d | 끔 — 같은 판에서 만남 0(종전 고르기 문은 하루 길을 못 잡는다) |',
    '| ②a ②c | ㉠ 켬 — 첫 소굴 · 해체 단 = 털 것 많은 마을 곁 숲 · 길목 30칸 안 · 영토 완충 밖 |',
    '| ②b | 끔 — 소굴 = 오지(마을에서 200칸 밖) |',
    '| ③a ③b | ㉡ 켬 — 날마다 더미에 드는 먹을 것 = 부모가 econ 표로 따로 센 값 · 석기 팔 > 맨손 / 끔 = 0 |',
    '| ④a ④b ④c | ㉢ 켬 — 40명 · 비축 0 → 넘친 사람이 갈라져 다른 길목으로 걷는다(장부가 닿는 날 선다) · 맨땅 6명 → 마을로 걸어가 주민 · 굶어 죽음 0 / 끔 = 굶어 죽음 |',
    '| ④d | 몸은 걷는다(틱마다 걸음 ≤ 걸음 × 틱) · 사람 수 보존(Σ 마을 + Σ 단 + 길 위 + 굶어 죽음 = 처음 합) |',
    '| ⑤a ⑤b ⑤c | 정적 — T1404 덩이 새 수 0 · ㉡ econ 수가 econ 글자와 같다 · ㉣ 은 T1104 걸음 켬 위 · 만남 문 하나 |',
    '',
    '| 미끼(파일 안 · 자리 꼭 한 번) | 바꾼 줄 | 빨강 줄(단언) |', '|---|---|---|',
    '| 1 길목 자리 — 숨을 자리를 안 본다 | `campSpot` 의 `hide` 줄 | ②a · ②c · ④a |',
    '| 2 굶지 않음 — 떠남 문을 안 연다(종전 굶음) | `daily` 의 ㉢ 줄 | ④a · ④b |',
    '| 3 판에서 턴다 — 몸 없는 단원도 몸으로 센다(T1184 그대로) | `_t1404Meet` 몸 줄 | ①c |',
    '',
    '* **옛 코드 빨강** `bash scripts/pm-old-code-red.sh origin/main test-t1404-bandit-live.js`(하네스 = 가지 · 제품 = 베이스 `c0bc91e17`) → **빨강 ○ · RC=1 · ✓ 4 · ✗ 16** — 초록 넷 = ①d · ③b · ④c(끔 줄 — 옛 코드도 끔이다) · ④d(몸 걸음 · 사람 수 보존 — 옛 코드에도 참).',
    f"* 있던 도적 하네스: `test-bandit-walk` 37/0 · `test-bandit-all` 32/0 · `test-bandit-camp` 35/0 · `test-t1391-unhappy-bandit` 20/20.",
    '* CI 표: `scripts/ci-class.json` 에 한 줄(나 · core · 가장 긴 판 15.8초) · `regress-unit.yml` core 블록을 `ci-class.js --write-yml --shards 5 --srv-shards 2` 로 다시 썼다(`test-ci-list` 16/16).',
]
def hsum(p):   # 러너 요약(`=== 러너 요약 ===` 아래 통과 · 실패 · 유보 줄) → '통과 n · 실패 m(이름) · 유보 k(이름)'
    t = rd(p)
    if '=== 러너 요약 ===' not in t: return '돌지 않음'
    t = t.split('=== 러너 요약 ===')[-1]
    def one(lab):
        m = re.search(r'^\s*' + lab + r' (\d+): (.*)$', t, re.M)
        return (int(m.group(1)), m.group(2).strip()) if m else (0, '')
    P, F, H = one('통과'), one('실패'), one('유보')
    out = f'통과 {P[0]} · 실패 {F[0]}' + (f'({F[1]})' if F[0] else '')
    if H[0]: out += f' · 유보 {H[0]}({H[1]})'
    return out
def hcount(p):
    t = rd(p)
    if '=== 러너 요약 ===' not in t: return None
    t = t.split('=== 러너 요약 ===')[-1]
    m = re.search(r'^\s*통과 (\d+):', t, re.M); f = re.search(r'^\s*실패 (\d+):', t, re.M); h = re.search(r'^\s*유보 (\d+):', t, re.M)
    return (int(m.group(1)) if m else 0, int(f.group(1)) if f else 0, int(h.group(1)) if h else 0)
X['guard'] = [
    ['끈 판 `계측/서버기준선_2026-11-18.json --vclock --plan 1020:400`', '같음 1/1 · 경제 400/400 · 생활층 400/400 · 판 636초(첫 판은 OOM — 무거운 판 셋이 같이 돌았다 · 다시 돈 판)', '`…/지키기/기준선1118.txt` · `기준선1118_OOM1.txt`'],
    ['랩 t17 1020 800날', '인구 6,198 · 소멸 0/51', '`…/지키기/t17.txt`'],
    ['게이트 셋', '번들 16/0 · 인라인 랩 둘 다 최신 · 배선 실패 0(경고 1)', '`…/지키기/게이트_*.txt`'],
    ['규약 다섯', 'test-body-fields 14/0 · test-coll-grid 20/0 · test-harness-lint 54/0 · test-hp-src 22/0 · test-lon-day 102/0', '`…/지키기/규약_*.txt`'],
    ['만진 하네스(`touched-harness --run -j 1` · 혼자 돈 판)', '@@H_TOUCH@@', '`…/지키기/하네스_만진.txt`'],
    ['CI core(만진 목록 밖 233)', '@@H_CORE@@', '`…/지키기/하네스_core.txt`'],
    ['서버 잡(만진 · core 밖 42)', '@@H_SRV@@', '`…/지키기/하네스_srv.txt`'],
    ['새 하네스 · 미끼 · 옛 코드 빨강', '20/20 · 3/3 · 빨강 ○(✓ 4 · ✗ 16)', '`…/지키기/하네스.txt` · `옛코드빨강.txt`'],
]
X['guardNote'] = [
    '* 손잡이 넷 다 끔 기본(끔 = 종전 바이트 — 끈 판 같음) · 새 수 0(하네스 ⑤a 가 T1404 덩이의 수 글자를 본다) · 미끼는 파일 안 `// @bait 3` · 하네스에 날짜 · 벽시계 0 · 검사 하네스 손 0.',
    '* 만진 목록 = `node scripts/touched-harness.js origin/main --list`(108 — `…/지키기/touched.txt`) · core · 서버 잡 목록은 `ci-class.js --core` · `--srv` 에서 만진 목록에 이미 든 것을 뺀 나머지를 같은 러너로 한 번(land1086 규칙).',
]
X['hoebu'] = [
    "**[정보 — T1391 회부 15 정정] `VILLAGE_NPC_CAP=Infinity` 는 몸 상한 없음이다(40 아님).** 판 자는 그 값이면 아이 env 에서 칸을 뺀다(`scripts/t577-server-run.js` `kidEnv` — `if (env.VILLAGE_NPC_CAP === 'Infinity') delete …`) → `server/villages.js` `NPC_CAP_PER_VILLAGE` 는 env 가 없으면 `Infinity`. T1391 회부 15 · 보고 §3-2 의 \"몸 상한 40\" 은 틀렸다 — 전쟁 기준선 조건 · 몸 세계(`T577_BODY`)는 무제한이다(이 카드 판 로그 `VILLAGE_NPC_CAP=∞(운영 기본)`).",
    f"**[재민 · 판정] 빈 마을(과녁 0) — 켠 판에 빈 마을이 선다.** 두 해 넷 다 {ser('ALL', 'empty')}(1020 · 7 · 42 — 42 는 첫 해 {f0(y('ALL_42', 'empty360'))}) · 끔 {ser('OFF', 'empty')}. 털려서 빈 게 아니다(1020 넷 다 두 마을 — 털린 건 {' · '.join(str(e['raided']) for e in EMP if e['seed'] == '1020')} · 굶어 죽음 {' · '.join(str(e['fd']) for e in EMP if e['seed'] == '1020')}). 켠 판마다 다른 마을이 빈다 — {empAll}. 약탈이 없는 ㉡ + ㉢ 만 판에도 하나 섰고 · 끔 1020 도 농촌14 가 {f0(n14)}명까지 줄었다(작은 마을 20명이 벼랑에 있다). 상인이 위험 · 길목 단을 보는 길목 표(은거지 450칸 — 쌍 {ser('OFF', 'pairsMean')} → {ser('ALL', 'pairsMean')})를 끈 대조는 식량 수입 · 인구를 끔 쪽으로 당기지만({f2(rat(g('ALL_1020', 'foodImp'), g('OFF_1020', 'foodImp')))} → {f2(rat(g('NOFEAR_1020', 'foodImp'), g('OFF_1020', 'foodImp')))} · {f2(rat(g('ALL_1020', 'popEnd'), g('OFF_1020', 'popEnd')))} → {f2(rat(g('NOFEAR_1020', 'popEnd'), g('OFF_1020', 'popEnd')))}) 빈 마을은 {f0(g('NOFEAR_1020', 'empty'))} 남는다. 까닭은 이 판들로 못 가른다(판 하나씩 · 손잡이가 단 수명을 바꾸면 세계가 갈린다). 빈 마을 0 을 과녁으로 둘지 · 상인이 볼 위험 쌍(450칸 · 단이 선 길목 · 턴 기록)을 무엇으로 할지 — 판정(새 수).",
    "**[재민 · 판정] ㉡ 땅이 먹이는 수 0.** 이 판들의 은거지는 다 `livelihood` 바닥 땅이다(짐승 0.45 · 나무 0.45 — 둘레 140칸 숲 몫 0 · 영토 없는 자리 크기 바닥 30) → 한 사람 사냥 · 채집 0.1 ~ 0.2 < 몫 0.5(석기여도 사냥꾼 0.44). 그래서 ㉢ 의 먹이는 수가 늘 0 — 약탈이 끊기면 단이 통째로 마을로 간다(1020 단#1 19명 · D583). ㉠ 의 \"숨을 자리\" = 숲 한 칸 · 바위 곁이면 된다(마을 곁은 트인 땅). 숨을 자리에 둘레 숲 몫을 물을지 · 은거지 땅 크기를 무엇으로 볼지 — 판정.",
    f"**[재민 · 판정 재료] 행상 피살 = 털린 캐러밴 수.** 털릴 때마다 행상 한 사람이 그 자리에서 쓰러진다(econ `_raidScrum` 종전 식 — 이 카드 손 0) — 두 해 {ser('ALL', 'killed')}명(1020 · 7 · 42). 그대로 둘지.",
    "**[재민 · 판정] ㉣ 켬 기본 · T1104 고르기 문.** T1104 고르기 문(`_t1104Pick`)은 판 자 · 몸 세계에서 늘 0 이다 — 하루 길 장부라 처음 보는 날엔 벌써 지났다(§1 ⓑ). ㉣ 이 그 자리를 대신한다(손잡이 넷 다 끔 기본 — 켤지 · 어느 것부터는 재민).",
    "**[재민 · 판정] 소굴 자리(㉠)는 새 세계에서만 선다 · 부팅 날엔 부자가 없다.** 소굴은 부팅에 한 번 고르고 저장에서 복원한다(`init` — 저장이 있으면 `denScan` 안 돈다) → 라이브 세계는 켜도 소굴이 오지 그대로(해체 단 · 갈라진 단만 ㉠ 자리). 또 부팅 날엔 마을 곳간이 다 같아 털 것 점수가 같다(1020 소굴 셋 다 " + ', '.join(str(d['sc']) for d in DA) + ") → 소굴 셋은 마을 목록 차례로 선다(이격 250칸). \"부자 먼저\" 는 해체 단 · 갈라진 단에서만 선다. 소굴을 언제 다시 고를지 — 판정.",
    "**[PM · 추상 하나] 길목에 선 단도 사냥 · 채집 몫을 받는다**(㉡ 는 단 단위 장부 — 몸은 길목에 있는데 은거지 땅 몫이 든다). 몸 판에서 사냥 · 채집하는 몸을 보일지.",
    f"**[재민 · 판정] 판 자에서 토벌 0.** T1184 원정은 뽑힌 몸이 있어야 하는데 판 자(몸 상한 1)엔 원정 몸이 없다(끔 · 켬 다 0 · 세 시드). 몸 세계(전쟁 조건 — 몸 상한 없음)에선 켬 {f0(g('ALL_W', 'sup'))}번(원정 전사 {f0(g('ALL_W', 'supDead'))}). 원정에도 \"몸 없는 사람은 장부로 선다\"(㉣ 의 그 규칙)를 둘지.",
    f"**[정보 — 일관된 몸] 사람 기록 없는 단원이 떠나면 받는 마을이 없다.** ㉢ 마을로 {f0(st4.get('home'))} 중 {f0(st4.get('homeNone'))}(1020) = 몸 0 · 사람 기록 0(소굴 재결성 — 황야에서 선 사람). 종전 해산(`_t1079Break` · T1079 `noRec`)도 같은 문이다. 소굴에서 '서는' 사람 자체가 회부 거리.",
    "**[정보] 라이브 세계 로그는 이 상자에서 못 읽는다**(서버 손 0) — §1 ⓑ 의 라이브 견줌은 빈칸. 라이브 로그 `🏴 도적 day N: … 약탈 누계 · 길목쌍` 줄로 견줄 수 있다.",
    "**[PM · 메모리] 켠 판이 기본 힙(≈ 2 GB)에 닿는다(길목에 안 나가는 ㉡ + ㉢ 만 판도).** 기본 힙으로 돈 판 — 넷 다 42 는 날 ~380 에 V8 힙 한도로 죽었고(`Ineffective mark-compacts near heap limit`) · ㉣ 만 1020 은 날 600 뒤 RSS 2.0 GB 에서 30날에 8분 넘게 기어가 끊었다(`…/지키기/힙한도.txt`). 힙 4,608MB 로 다시 돈 판의 V8 힙(관찰기 날 끝): " + heapTxt + ". 끔 판 힙은 이 카드가 안 쟀다(T1381 회부 11 — 끔 42 날 929 1,797MB). 라이브 힙 한도 · `T1381_WALK_HEAP` 과 같이 볼지 — PM.",
    f"**[재민 · 판정 재료] 단 크기는 약탈이 끊길 때만 본다.** ㉢ 은 비축 0 열흘에만 먹이는 수를 본다 — 장물이 들어오는 동안은 합류(T1079 남은 단 · T984 절망 이탈)로 큰다(1020 단#1 4 → 19 — 남은 단 8 · 절망 이탈 7 · 두 해 봉우리 {ser('ALL', 'mPeak')}). 약탈 흐름으로도 크기를 묶을지.",
]
X['evid'] = [
    '* 보고 표의 수는 다 `계측/T1404_@@DATE@@/표/sum.json`(판 JSON · 관찰기 줄에서 `도구/ana.py` 가 셈) · 표 `도구/mk.py` · 이 글 `도구/ext.py` · 조립 `도구/build.py`.',
    '* 판 다시 돌리기: `node 도구/chain.js <목록>` — `main.json`(서버 자 두 해 3시드 · 앞 넷이 돌았다) · `rest.json` · `rest2.json`(상자 재시작 · 힙 한도 뒤 남은 판 · 큰 힙) · `rest3.json`(걸음 둘 365날) · `war.json`(전쟁 조건 360날) · `nr.json`(상인이 단을 모름 — `진단/겁0대조.patch` 를 댄 나무) — 판마다 `T577_OUT` 관찰기 `도구/t1404hook.js`(읽기만 · 날 끝 V8 힙 칸은 rest2 · rest3 판부터).',
    '* 진단 판: `도구/diag.json` · `diag2.json`(서버 자 240날 · 위험 0 대조 — `진단/진단계측.patch` 를 댄 나무) · 몸 세계 60날 — 판 JSON 은 `진단/`.',
    '* 하네스: `node scripts/test-t1404-bandit-live.js` · 옛 코드 빨강 `bash scripts/pm-old-code-red.sh origin/main test-t1404-bandit-live.js`.',
]
X['readme'] = [
    '# 계측 T1404 — 도적은 길목에서 산다(@@DATE@@ · 세션8 · 코드 `@@CODE@@`)',
    '',
    '* `판/` — 서버 자 판 JSON(`<판>-<시드>.json`) · 관찰기 줄(`….json.t1404.json` — 세계-날 · 마을-달 · 단 · 쓰인 쌍 · 끝 걸음 거리).',
    '* `진단/` — 진단 판(서버 자 240날 · 위험 0 대조 · 몸 세계 60날) · 상인이 단을 모르는 대조(`NOFEAR_1020`) · 그 두 패치(제품 밖).',
    '* `표/` — `sum.json`(판마다 셈) · 보고 표(`tab*.md`).',
    '* `도구/` — 사슬 · 관찰기 · 셈 · 표 · 글 · 조립 · 꾸리기 · 판 목록.',
    '* `지키기/` — 끈 판 · t17 · 게이트 · 규약 · 만진 하네스 · core · 서버 잡 · 새 하네스 · 옛 코드 빨강 · CI 표 전.',
    '* 보고 = `보고/T1404_@@DATE@@.md` · 회부 = `인계/회부.md` "T1404".',
]
for row in X['guard']:
    if row[1] == '@@H_TOUCH@@': row[1] = hsum('하네스_만진.txt')
    elif row[1] == '@@H_CORE@@': row[1] = hsum('하네스_core.txt')
    elif row[1] == '@@H_SRV@@': row[1] = hsum('하네스_srv.txt')
KNOWN = {'test-guest-rejoin.js': 'KNOWN_ISSUES N.11(게스트가 같은 틱에 재접속하면 3번에 1번 걷던 자리를 잃는다 — ② 같은 줄) · 혼자 다시 세 판 3/3 초록(`…/지키기/하네스_srv_다시.txt` · 도적 층 손 밖)',
         'test-lab-mining.js': 'main 늘 빨강 — 같은 두 줄 "광부가 광맥 셀에 배치됨" · "광맥 재고가 실제로 줄어든다"가 `계측/T1327_2026-11-15/전수_단위.txt` 680 · 681줄에 있다 · T1364 흔들림표 ㉮ 3/3 · 5/5(랩 브라우저 판 · 이 가지 손 밖)'}
def hfails(p):
    t = rd(p)
    if '=== 러너 요약 ===' not in t: return []
    t = t.split('=== 러너 요약 ===')[-1]
    m = re.search(r'^\s*실패 \d+: (.*)$', t, re.M)
    return [re.sub(r'\(rc=\d+\)$', '', x) for x in (m.group(1).split() if m else []) if x != '없음']
FAILS = {p: hfails(p) for p in ('하네스_만진.txt', '하네스_core.txt', '하네스_srv.txt')}
fnote = []
for p, fl in FAILS.items():
    for f in fl: fnote.append(f"`{f}`({p.replace('하네스_', '').replace('.txt', '')}) — " + KNOWN.get(f, '**까닭 확인 중**'))
X['guardNote'].append('* 하네스 빨강: ' + (' · '.join(fnote) if fnote else '0'))
_re = rd('하네스_srv_다시.txt')
if _re:
    _n = _re.count('통과 1: test-guest-rejoin.js'); _k = _re.count('## 판')
    for row in X['guard']:
        if row[0].startswith('서버 잡'): row[1] += f' · test-guest-rejoin 혼자 다시 {_n}/{_k} 초록(KNOWN_ISSUES N.11)'; row[2] += ' · `하네스_srv_다시.txt`'
for row in X['guard']:
    if row[0].startswith('만진 하네스') and 'test-lab-mining' in row[1]: row[1] += ' — main 늘 빨강(T1327 · T1364)'
hc = hcount('하네스_만진.txt')
X['hTouch'] = (f'{hc[0]}/{hc[0] + hc[1] + hc[2]}' + (f'(유보 {hc[2]})' if hc[2] else '')) if hc else '돌지 않음'
json.dump(X, open(os.path.join(EV, 'extra.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('extra ok', {k: len(v) if isinstance(v, list) else len(v) for k, v in X.items()})
