#!/usr/bin/env python3
# T1306 판 표 — 판 JSON(여덟 수 · 죽음 장부) · 훅 세 벌(t1275 날 줄 · t1297 마을-날 · t1306 마을-날 + 이주 문 셈) · 굶어 죽음 누계만 읽는다 · 세계 0
#   실행: python3 t1306_table.py <판 지도 JSON> <기준선 JSON> [--out <폴더>]
#   판 지도 = { "<팔 이름>": { "label": "…", "seeds": { "1020": {"json": "<판 JSON>", "dir": "<판 폴더>", "out": "<판 출력 .out>"}, … } }, … }
#   칸: 인구 · 끔비 · 끝 25날 평균 끔비(376 ~ 400날 인구 평균 ÷ 끔 판 같은 날 평균) · 빈 마을 · 꼭대기(날) · 꼭대기 뒤 내림 % · 굶어 죽음 · 죽음 전부 · 난 사람(bornE · 없으면 새 얼굴 중 늘림 선 날 = *) · ㄴ 곳간 10일치 밑 %
#       · 떠난 사람(불행 이탈 · econ `_emigTot`) · 걸어 닿은 사람(길 위 장부 — 서버 판 로그) · 400날 길 위 · 훅이 본 닿음(전에 어느 마을 명부에서 본 몸 — 그날 나 그날 떠난 새 주민은 닿은 마을의 새 얼굴로 잡혀 빠진다 ·
#         새 얼굴 − 그 마을 난 사람을 더해도 아래 몫은 ±1%p) · ㄴ 닿은 날 곳간 30일치 밑 마을 % · ㄴ 20 · 10일치 밑(명) · ㄴ 같은 마을-날 셋 이상 함께 닿은 % · 이주 문(본 · 얇음 · 모름 — JSON) · 단계 문 마을-날 · 평균 비율(JSON) · 판 초
import json, sys, os, re
MAP = json.load(open(sys.argv[1])); BASE = json.load(open(sys.argv[2]))['byseed']
OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
SEEDS = ['1020', '7', '42']
def rd(p):
    try: return json.load(open(p))
    except Exception: return None
def secs(p, s):   # 그 시드 판 하나가 걸린 초(`· 시드 <s> <날>일 판 <초>초` — 동시 2 · 코어 2 · 빠른 시계)
    try:
        m = re.search(r'시드 ' + s + r' \d+일 판 (\d+)초', open(p).read()); return int(m.group(1)) if m else None
    except Exception: return None
def seed_row(a, s, e):
    r = rd(e['json']); r = r and r['byseed'].get(s); d = e.get('dir')
    o = {'pop': r['eight']['pop'] if r else None, 'empty': r.get('empty') if r else None, 'secs': secs(e.get('out', ''), s)}
    o['ratio'] = round(o['pop'] / BASE[s]['eight']['pop'], 3) if o['pop'] else None
    h5 = rd(os.path.join(d, f'sbc-{s}.json.t1275.json')) if d else None
    if h5:
        D = h5['days']; pk = max(D, key=lambda q: (q[1], -q[0])); last = D[-1]
        o['peak'] = pk[1]; o['peakDay'] = pk[0]; o['drop'] = round(100 * (pk[1] - last[1]) / pk[1], 1)
        o['traj'] = {q[0]: q[1] for q in D if q[0] % 50 == 0}   # 50날 눈금 인구(판 끝 = 400날 · 여덟 수 인구와 같은 날)
        o['tail25'] = sum(q[1] for q in D if 376 <= q[0] <= 400) / max(1, sum(1 for q in D if 376 <= q[0] <= 400))   # 끝 25날(376 ~ 400) 인구 평균 — 판 끝 한 날의 흔들림(무리 이주 · 봄 되살아남) 덜기
    fd = rd(os.path.join(d, f'sbc-{s}.fd-deaths.json')) if d else None
    o['famine'] = fd['fdDeadTot'] if fd else None
    sj = rd(os.path.join(d, f'sbc-{s}.json')) if d else None
    o['dead'] = sj.get('deadTot') if sj else None
    h7 = rd(os.path.join(d, f'sbc-{s}.json.t1297.json')) if d else None
    if h7:
        c = {k: i for i, k in enumerate(h7['cols'])}; ex = 'bornE' in c
        born = low = 0
        for q in h7['rows']:
            b = (q[c['bornE']] or 0) if ex else ((q[c['born']] or 0) if (q[c['dP']] or 0) > 0 else 0)
            born += b
            if b and q[c['foodDays']] is not None and q[c['foodDays']] < 10: low += b
        o['born'] = born; o['bornLow'] = round(100 * low / born) if born else 0; o['bornExact'] = ex
    try:   # 길 위 장부가 받는 마을에 붙인 사람(서버 판 로그 `D<날> 후보 <n>명이 걸어서 닿았다 … [T765]` 합 — 불행 이탈 · 해체 남은 사람 · 해산 몸 모두 · 훅 없는 판도 센다)
        lg = open(os.path.join(d, f'sbc-{s}.log'), encoding='utf-8', errors='replace').read() if d else ''
        o['ledger'] = sum(int(x) for x in re.findall(r'D\d+ 후보 (\d+)명이 걸어서 닿았다', lg)) if lg else None
        o['roadDead'] = len(re.findall(r'길 위 후보 1명이 굶어 죽었다', lg)) if lg else None
    except Exception: o['ledger'] = None
    h6 = rd(os.path.join(d, f'sbc-{s}.json.t1306.json')) if d else None
    if h6:
        c = {k: i for i, k in enumerate(h6['cols'])}
        o['emig'] = sum((q[c['emig']] or 0) for q in h6['rows'])
        arr = [(q[c['arrive']] or 0, q[c['foodDays']]) for q in h6['rows'] if q[c['arrive']]]
        o['arrive'] = sum(n for n, _ in arr); th = sum(n for n, f in arr if f is not None and f < 30)
        o['arriveThin'] = round(100 * th / o['arrive']) if o['arrive'] else 0
        o['arrive20'] = sum(n for n, f in arr if f is not None and f < 20); o['arrive10'] = sum(n for n, f in arr if f is not None and f < 10)   # 닿은 날 20 · 10일치 밑 마을에 닿은 사람(명)
        o['herd3'] = round(100 * sum(n for n, _ in arr if n >= 3) / o['arrive']) if o['arrive'] else 0   # 같은 마을-날에 셋 이상 함께 닿은 사람 몫(%) — 무리 이주
        o['road'] = o['emig'] - o['ledger'] if o.get('ledger') is not None else None   # 판 끝(400날) 길 위 = 떠난 사람 − 닿은 사람(길 위 굶어 죽음 0 — `roadDead`) · 여덟 수 인구(마을 명부)에 안 든다
        if h7:   # 훅이 못 본 닿음 어림 — 그 마을-날 새 얼굴(t1297 `born`) − 그 마을에서 난 사람(`bornE`)의 양수 몫(그날 나 그날 떠나 여기 닿은 새 주민)을 더한 30일치 밑 몫(JSON 만 · 몫이 훅 자와 얼마나 다른지)
            c7 = {k: i for i, k in enumerate(h7['cols'])}; k7 = {(q[c7['day']], h7['names'][q[c7['v']]]): q for q in h7['rows']}
            tot = th2 = 0
            for q in h6['rows']:
                r7 = k7.get((q[c['day']], h6['names'][q[c['v']]])); x = max(0, ((r7[c7['born']] or 0) - (r7[c7['bornE']] or 0))) if r7 and 'bornE' in c7 else 0
                n = (q[c['arrive']] or 0) + x
                if n: tot += n; th2 += n if (q[c['foodDays']] is not None and q[c['foodDays']] < 30) else 0
            o['arriveThinNF'] = round(100 * th2 / tot, 1) if tot else None
        rs = [q[c['r']] for q in h6['rows'] if q[c['r']] is not None and q[c['r']] < 1]
        o['graded'] = len(rs); o['rMean'] = round(sum(rs) / len(rs), 3) if rs else None
        st = h6.get('stat') or {}
        o['mig'] = {k: st.get(k) for k in ('seen', 'ok', 'thin', 'unknown')} if st and st.get('seen') else None
        o['lag'] = round(st['lagSum'] / max(1, st['seen'] - st['unknown']), 2) if st and st.get('seen') else None
    return o
res = {a: {'label': m['label'], 'seeds': {s: seed_row(a, s, m['seeds'][s]) for s in SEEDS if s in m['seeds']}} for a, m in MAP.items()}
for a, R in res.items():   # 끝 25날 평균 끔비 = 그 판 376 ~ 400날 인구 평균 ÷ 같은 시드 끔 판(훅 날 줄) 같은 날 평균
    for s, o in R['seeds'].items():
        b = (res.get('off', {}).get('seeds', {}).get(s) or {}).get('tail25')
        o['avg25'] = round(o['tail25'] / b, 3) if o.get('tail25') and b else None
def fmt(x, k):
    if x is None: return '—'
    if k in ('ratio', 'avg25'): return f'{x:.3f}'
    if isinstance(x, float): return f'{x:g}'
    if isinstance(x, int): return f'{x:,}'
    return str(x)
COLS_A = [('pop', '인구(명)'), ('ratio', '끔비'), ('avg25', '끝 25날 평균 끔비'), ('empty', '빈 마을(곳)'), ('peak', '꼭대기(명 · 날)'), ('drop', '꼭대기 뒤 내림(%)'), ('famine', '굶어 죽음(명)'), ('dead', '죽음 전부(명)'),
          ('born', '난 사람(명)'), ('bornLow', 'ㄴ 곳간 10일치 밑 날(%)'), ('secs', '판(초)')]
COLS_B = [('emig', '떠난 사람(명)'), ('ledger', '걸어 닿은 사람(명 · 길 위 장부)'), ('road', '400날 길 위(명)'), ('arrive', '훅이 본 닿음(명)'),
          ('arriveThin', 'ㄴ 닿은 날 곳간 30일치 밑 마을(%)'), ('arrive20', 'ㄴ 20일치 밑(명)'), ('arrive10', 'ㄴ 10일치 밑(명)'), ('herd3', 'ㄴ 같은 마을-날 셋 이상 함께(%)')]
def table(COLS):
    md = ['| 판 | ' + ' | '.join(h + ' 1020 · 7 · 42' for _, h in COLS) + ' |', '|---|' + '---|' * len(COLS)]
    for a, R in res.items():
        cells = []
        for k, _ in COLS:
            v = []
            for s in SEEDS:
                o = R['seeds'].get(s)
                if not o: v.append('—'); continue
                if k == 'peak': v.append(f"{o['peak']:,} ({o['peakDay']})" if o.get('peak') else '—')
                elif k in ('born', 'bornLow'): v.append(fmt(o.get(k), k) + ('' if o.get('bornExact', True) or o.get(k) is None else '*'))
                else: v.append(fmt(o.get(k), k))
            cells.append(' · '.join(v))
        md.append(f"| {R['label']} | " + ' | '.join(cells) + ' |')
    return md
md = table(COLS_A) + [''] + table(COLS_B)
txt = '\n'.join(md); print(txt)
# 50날 눈금 — 인구(괄호 = 같은 날 끔비 · 끔 팔의 같은 날 인구 대비)
offT = {s: (res.get('off', {}).get('seeds', {}).get(s) or {}).get('traj') or {} for s in SEEDS}
DAYS = [50, 100, 150, 200, 250, 300, 350, 400]
tr = ['| 시드 · 판 | ' + ' | '.join(f'{d}날' for d in DAYS) + ' |', '|---|' + '---:|' * len(DAYS)]
for s in SEEDS:
    for a, R in res.items():
        o = R['seeds'].get(s); T = (o or {}).get('traj') or {}
        if not T: continue
        tr.append(f"| {s} · {R['label']} | " + ' | '.join((f"{T[d]:,}" + (f" ({T[d] / offT[s][d]:.2f})" if a != 'off' and offT[s].get(d) else '')) if T.get(d) else '—' for d in DAYS) + ' |')
trt = '\n'.join(tr)
if OUT:
    os.makedirs(OUT, exist_ok=True); json.dump(res, open(os.path.join(OUT, 't1306-table.json'), 'w'), ensure_ascii=False); open(os.path.join(OUT, 't1306-table.md'), 'w').write(txt + '\n')
    open(os.path.join(OUT, 't1306-traj.md'), 'w').write(trt + '\n')
