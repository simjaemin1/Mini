#!/usr/bin/env python3
# T1312 진단 ① — 무리 이주(판 훅 줄만 읽는다 · 세계 0)
#   읽는 것: 판 폴더의 `sbc-<시드>.json.t1306.json`(마을-날 — 떠난 사람 `emig` · 훅이 본 닿음 `arrive` · 곳간 일치 `foodDays`) ·
#            `sbc-<시드>.json.t1297.json`(마을-날 — 굶어 죽음 `fdDead` · 새 얼굴 `born` · 이 마을에서 난 사람 `bornE`) ·
#            (있으면) `sbc-<시드>.json.t1312.json`(마을-날 — 정확한 닿음 `arr` · 죽음 까닭)
#   재는 것: ⓐ 무리 크기 — 떠나는 쪽(같은 마을-날 떠난 사람 수) · 닿는 쪽(같은 마을-날 닿은 사람 수)의 사람 몫 분포
#            ⓑ 무리가 든 마을의 곳간 30날 궤적 — 같은 마을-날 10명 이상 닿은 날 d 를 0 으로 d − 1 · d · d + 5 · 10 · 20 · 30 곳간 일치 가운데
#            ⓒ 그 마을 굶어 죽음 몫 — 무리가 든 날부터 30날 안에 그 마을에서 굶어 죽은 사람 ÷ 판 전체 굶어 죽음
#   닿음 = t1312 훅이 있으면 `arr`(정확) · 없으면 t1306 `arrive` + max(0, t1297 `born` − `bornE`)(그날 나 그날 떠난 새 주민 어림)
# 실행: python3 t1312_herd.py <팔>=<폴더>@<시드>[,<폴더>@<시드>…] …
import json, sys, os, collections, statistics
BK = [(1, 1), (2, 4), (5, 9), (10, 19), (20, 49), (50, 99), (100, None)]
lab = lambda lo, hi: f'{lo}' if hi == lo else (f'{lo} ~ {hi}' if hi else f'{lo} ~')
OFFS = [-1, 0, 5, 10, 20, 30]
def load(d, s):
    rd = lambda suf: json.load(open(os.path.join(d, f'sbc-{s}.json.{suf}.json'))) if os.path.exists(os.path.join(d, f'sbc-{s}.json.{suf}.json')) else None
    return rd('t1306'), rd('t1297'), rd('t1312')
def arm(name, specs):
    send = collections.Counter(); recv = collections.Counter(); traj = collections.defaultdict(list); fdIn = fdAll = 0; events = 0; seeds = []
    for spec in specs:
        d, s = spec.rsplit('@', 1); seeds.append(s)
        h6, h7, h12 = load(d, s)
        if not h6 or not h7: continue
        c6 = {k: i for i, k in enumerate(h6['cols'])}; c7 = {k: i for i, k in enumerate(h7['cols'])}
        k7 = {(q[c7['day']], h7['names'][q[c7['v']]]): q for q in h7['rows']}
        k12 = None
        if h12:
            c12 = {k: i for i, k in enumerate(h12['cols'])}; k12 = {(q[c12['day']], h12['names'][q[c12['v']]]): q[c12['arr']] for q in h12['rows']}
        fdays = {}; fdd = {}; arr = {}
        for q in h6['rows']:
            key = (q[c6['day']], h6['names'][q[c6['v']]]); r7 = k7.get(key)
            e = q[c6['emig']] or 0
            if e: send[e] += e
            if k12 is not None and k12.get(key) is not None: a = k12[key] or 0
            else: a = (q[c6['arrive']] or 0) + (max(0, (r7[c7['born']] or 0) - (r7[c7['bornE']] or 0)) if r7 else 0)
            if a: recv[a] += a; arr[key] = a
            fdays[key] = q[c6['foodDays']]; fdd[key] = (r7[c7['fdDead']] or 0) if r7 else 0
        fdAll += sum(fdd.values())
        hit = set()
        for (day, v), a in arr.items():
            if a < 10: continue
            events += 1
            for o in OFFS:
                x = fdays.get((day + o, v))
                if x is not None: traj[o].append(x)
            for t in range(day, day + 31):
                if (t, v) not in hit: hit.add((t, v)); fdIn += fdd.get((t, v), 0)
    def dist(C):
        tot = sum(C.values())
        return tot, [round(100 * sum(n for k, n in C.items() if k >= lo and (hi is None or k <= hi)) / tot) if tot else 0 for lo, hi in BK]
    st, sd = dist(send); rt, rd_ = dist(recv)
    med = {o: (round(statistics.median(traj[o]), 1) if traj[o] else None) for o in OFFS}
    return {'name': name, 'seeds': seeds, 'send': (st, sd), 'recv': (rt, rd_), 'events': events, 'traj': med, 'fdIn': fdIn, 'fdAll': fdAll}
if __name__ == '__main__':
    R = []
    for a in sys.argv[1:]:
        nm, sp = a.split('=', 1); R.append(arm(nm, sp.split(',')))
    print('| 판 · 시드 | 떠난 사람(명) · 같은 마을-날 무리 크기별 몫(%) ' + ' · '.join(lab(lo, hi) for lo, hi in BK) + ' | 닿은 사람(명) · 같은 마을-날 무리 크기별 몫(%) |')
    print('|---|---|---|')
    for r in R: print(f"| {r['name']} ({' · '.join(r['seeds'])}) | {r['send'][0]:,} · {' · '.join(map(str, r['send'][1]))} | {r['recv'][0]:,} · {' · '.join(map(str, r['recv'][1]))} |")
    print('\n| 판 | 10명 이상 무리가 든 마을-날 | 곳간 일치 가운데(일) — 든 날 d 를 0 으로 ' + ' · '.join(f'd{o:+d}' for o in OFFS) + ' | 그 마을 30날 안 굶어 죽음(명 · 판 전체 대비) |')
    print('|---|---:|---|---|')
    for r in R: print(f"| {r['name']} | {r['events']:,} | {' · '.join('—' if r['traj'][o] is None else str(r['traj'][o]) for o in OFFS)} | {r['fdIn']:,} / {r['fdAll']:,} ({(100 * r['fdIn'] / r['fdAll']) if r['fdAll'] else 0:.0f}%) |")
    json.dump(R, open(os.environ.get('T1312_HERD_OUT', '/dev/null'), 'w'), ensure_ascii=False)
