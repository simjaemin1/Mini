#!/usr/bin/env python3
# T1447 그림 실험 표 — 판마다 사유지 하나 한 줄: 막힌 칸이 25 · 50 · 75 % · 10 · 30 · 100칸에 닿은 날(놓은 지 몇 날) · 끝 막힌 칸 · 둘레 · 그날 인구 · 모자란 땅 · 굶음
import json, sys, os, math
CLS = {'S': '작은', 'M': '중간', 'L': '큰'}
PLACE = {('touch', 'grow'): '붙음 · 자랄 쪽', ('gap', 'grow'): '떨어짐 · 자랄 쪽', ('touch', 'away'): '붙음 · 안 자랄 쪽', ('gap', 'away'): '떨어짐 · 안 자랄 쪽'}
def main(runs, out):
    rows = []
    for run in runs:
        tag = os.path.basename(run.rstrip('/'))
        j = json.load(open(os.path.join(run, 'probe.json')))
        placed = [e for e in j['placed'] if not e.get('fail')]
        fails = [e for e in j['placed'] if e.get('fail')]
        d0 = j['cfg']['d0']
        days = j['days']
        for i, e in enumerate(placed):
            ser = [(r['d'], r['t'][i]) for r in days]   # [pop, terr, tgt, blk, fd, grown]
            first = {}
            for d, t in ser:
                b = t[3]
                for p in (25, 50, 75):
                    if 100 * b / e['size'] >= p and ('p%d' % p) not in first: first['p%d' % p] = (d, t)
                for n in (10, 30, 100):
                    if b >= n and ('n%d' % n) not in first: first['n%d' % n] = (d, t)
                if b >= 1 and 'b1' not in first: first['b1'] = (d, t)
            last = ser[-1] if ser else None
            gr = [t[5] for d, t in ser]
            # 놓은 뒤 넓힌 날 수(영토가 는 날)
            grow_days = sum(1 for a, b in zip(ser, ser[1:]) if b[1][1] > a[1][1])
            rows.append(dict(tag=tag, cls=e['cls'], vname=e['vname'], pop0=e['pop0'], terr0=e['terr0'], tgt0=e['target0'], size=e['size'], perim=e['perim'], mode=e['mode'], side=e['side'],
                             d0=d0, first={k: [v[0], v[0] - d0, v[1]] for k, v in first.items()}, last=last, grow_days=grow_days, ndays=len(ser)))
        for e in fails:
            rows.append(dict(tag=tag, cls=e['cls'], vname=e['vname'], pop0=e['pop0'], terr0=e['terr0'], tgt0=e['target0'], size=None, perim=None, mode=e['mode'], side=e['side'], d0=d0, fail=True))
    json.dump(rows, open(out, 'w'), ensure_ascii=False, indent=1)
    # 표(마크다운)
    endd = (rows[0]['d0'] + (rows[0].get('ndays') or 0) - 1) if rows else 0
    print(f'| 사유지 | 마을(놓은 날 인구 · 영토 · 목표) | 자리 | 첫 막힘 | 25% | 50% | 75% | 10칸 | 30칸 | 100칸 | 끝(날 {endd}) 막힌 칸 / 둘레 | 그동안 넓힌 날 | 끝 인구 · 모자란 땅(목표 − 영토) · 굶어 죽음 |')
    print('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for r in rows:
        if r.get('fail'):
            print(f"| {r['tag']} | {CLS[r['cls']]} {r['vname']}({r['pop0']} · {r['terr0']} · {r['tgt0']}) | {PLACE[(r['mode'], r['side'])]} | 자리 없음(물 · 산) |  |  |  |  |  |  |  |  |  |")
            continue
        f = r['first']
        cell = lambda k: (f"{f[k][1]}날" if k in f else '—')
        L = r['last'][1] if r['last'] else [0] * 6
        sq = int(math.sqrt(r['size']))
        print(f"| {sq}×{sq}={r['size']}칸 | {CLS[r['cls']]} {r['vname']}({r['pop0']} · {r['terr0']} · {r['tgt0']}) | {PLACE[(r['mode'], r['side'])]} | {cell('b1')} | {cell('p25')} | {cell('p50')} | {cell('p75')} | {cell('n10')} | {cell('n30')} | {cell('n100')} | {L[3]} / {r['perim']} | {r['grow_days']}/{r['ndays']} | {L[0]} · {L[2] - L[1]} · {L[4]} |")

if __name__ == '__main__':
    a = sys.argv[1:]; out = 'hits.json'
    if '--out' in a: i = a.index('--out'); out = a[i + 1]; a = a[:i] + a[i + 2:]
    main(a, out)
