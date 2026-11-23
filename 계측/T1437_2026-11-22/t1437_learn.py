#!/usr/bin/env python3
# T1437 배우는 빠르기 · 잊음 — 훅 칸(runs/*.t1437.json)에서
#   ① 30날 칸마다: 여유분 가운데 · 열에 아홉 / 버틸 날 가운데 / 식량 날치 가운데 · 열에 하나 / 기근 블록 안 마을-날 몫(곳간 날치 < 버틸 날 — 끔 = 30) /
#      굶는 마을-날(그날 못 먹은 몫 > 0) / 굶어 죽음
#   ② 해 넘김(날 366) 앞뒤 — 여유분이 뛰는 크기(마을마다 날 365 → 366 · 날 366 → 430)
#   ③ 잊음 — 둘째 해(날 366 ~)에 굶은 마을마다: 그 앞 한 해 창에 굶은 적(못 먹은 날)이 있었나 · 그날 여유분 · 그 앞 가장 큰 여유분(이미 겪은 것을 잊었나)
#   ④ 날씨 · 풍흉(훅 `wx` · `ys` 칸이 있는 판만) — 가뭄 · 흉년 마다 그 마을이 그 동안 / 뒤 30날 안에 굶었나 · 그때 여유분 · 앞 한 해 창에 같은 일이 있었나
# 쓰는 법: python3 t1437_learn.py <out.json> <run.json> …
import json, sys, os, math
import gzip
def _load(f):   # 판 칸은 .json.gz 로 싣는다(레포 크기) — 날것 .json 도 읽는다
    return json.load(gzip.open(f, 'rt', encoding='utf-8') if str(f).endswith('.gz') else open(f, encoding='utf-8'))

def q(a, p):
    a = [x for x in a if x is not None]
    if not a: return None
    s = sorted(a); return s[min(len(s) - 1, int(math.floor(p * len(s))))]

def r1(x): return None if x is None else round(x, 1)

def spans(code, ch):
    out, i = [], 0
    while i < len(code):
        if code[i] == ch:
            j = i
            while j < len(code) and code[j] == ch: j += 1
            out.append((i, j - 1)); i = j
        else: i += 1
    return out

def one(f):
    d = _load(f); tag = os.path.basename(f).split('.')[0]; dfc = d.get('dfc') or 1.0
    arm = d['arm']; V = d['vil']; last = d['last']; gateOnlyHarv = 'BUF_AT' in tag
    bins = {}
    for v in V:
        d0 = v.get('d0', 1)
        for i in range(len(v['S'])):
            day = d0 + i; N = v['N'][i]
            B = bins.setdefault((day - 1) // 30, {'bf': [], 'nd': [], 'fd': [], 'blk': 0, 'vd': 0, 'st': 0, 'dead': 0})
            B['dead'] += v['fd'][i] or 0
            if not (N and N > 0): continue
            fd = (v['S'][i] or 0) / (N * dfc); B['fd'].append(fd); B['vd'] += 1
            nd = v['nd'][i] if arm != 'off' else 30
            if nd is not None and gateOnlyHarv and v['bf'][i] is not None: nd = nd - v['bf'][i]   # 재는 팔 `T1437_BUF_AT`(값의 기준에만) — 기근 문은 (가)
            if v['bf'][i] is not None: B['bf'].append(v['bf'][i])
            if nd is not None:
                B['nd'].append(nd)
                if fd < nd: B['blk'] += 1
            if (v['sh'][i] or 0) > 1e-6: B['st'] += 1
    rows = [[k * 30 + 1, r1(q(B['bf'], .5)), r1(q(B['bf'], .9)), r1(q(B['nd'], .5)), r1(q(B['fd'], .5)), r1(q(B['fd'], .1)), r1(100 * B['blk'] / max(1, B['vd'])), B['st'], B['dead']] for k, B in sorted(bins.items())]
    # ② 해 넘김
    jump = []
    for v in V:
        d0 = v.get('d0', 1)
        def at(day):
            i = day - d0
            return v['bf'][i] if 0 <= i < len(v['bf']) else None
        a, b, c = at(365), at(366), at(430)
        if a is not None and b is not None: jump.append((b - a, None if c is None else c - b))
    # ③ 잊음 — 둘째 해 굶은 마을
    forget = []
    for v in V:
        d0 = v.get('d0', 1); sh = v['sh']; bf = v['bf']
        eps = []   # 굶은 날 덩이(못 먹은 몫 > 0 이 이어진 날)
        i = 0
        while i < len(sh):
            if (sh[i] or 0) > 1e-6:
                j = i
                while j < len(sh) and (sh[j] or 0) > 1e-6: j += 1
                eps.append((i, j - 1)); i = j
            else: i += 1
        for (a, b) in eps:
            day = d0 + a
            if day < 366: continue
            prior = [e for e in eps if e[1] < a and e[1] >= a - 365]
            bmax = max([x for x in bf[max(0, a - 365):a] if x is not None] or [0])
            forget.append({'v': v['name'], 'day': day, 'len': b - a + 1, 'dead': sum(v['fd'][a:b + 1]), 'bf': bf[a], 'bfMaxYear': bmax, 'priorInWindow': len(prior), 'priorAny': len([e for e in eps if e[1] < a])})
    # ④ 날씨 · 풍흉
    ev = {'D': [], 'B': []}
    for v in V:
        if not v.get('wx'): continue
        d0 = v.get('d0', 1); sh = v['sh']; bf = v['bf']
        for ch, code in (('D', v['wx']), ('B', v['ys'])):
            for (a, b) in spans(code, ch):
                lo, hi = a, min(len(sh) - 1, b + 30)
                st = sum(1 for k in range(lo, hi + 1) if (sh[k] or 0) > 1e-6)
                dead = sum(v['fd'][lo:hi + 1])
                prev = [s for s in spans(code[:a], ch) if s[1] >= a - 365]
                fd0 = (v['S'][a] or 0) / (max(1, v['N'][a]) * dfc) if v['N'][a] else None
                fdmin = min([(v['S'][k] or 0) / (v['N'][k] * dfc) for k in range(lo, hi + 1) if v['N'][k]] or [None]) if any(v['N'][lo:hi + 1]) else None
                ev[ch].append({'v': v['name'], 'day': d0 + a, 'len': b - a + 1, 'starveDays': st, 'dead': dead, 'bf': bf[a], 'fd0': r1(fd0), 'fdMin': r1(fdmin), 'prevInWindow': len(prev)})
    def evsum(E):
        if not E: return None
        return {'n': len(E), 'starved': sum(1 for e in E if e['starveDays'] > 0), 'dead': sum(e['dead'] for e in E),
                'drop': r1(q([e['fd0'] - e['fdMin'] for e in E if e['fd0'] is not None and e['fdMin'] is not None], .5)),
                'drop90': r1(q([e['fd0'] - e['fdMin'] for e in E if e['fd0'] is not None and e['fdMin'] is not None], .9)),
                'y1': sum(1 for e in E if e['day'] <= 365), 'y2': sum(1 for e in E if e['day'] > 365),
                'starvedY2': sum(1 for e in E if e['day'] > 365 and e['starveDays'] > 0)}
    return {'tag': tag, 'arm': arm, 'bins': rows,
            'jump': {'n': len(jump), 'med': r1(q([j[0] for j in jump], .5)), 'p90': r1(q([j[0] for j in jump], .9)), 'after64med': r1(q([j[1] for j in jump if j[1] is not None], .5))},
            'forget': {'episodes': len(forget), 'dead': sum(x['dead'] for x in forget), 'noPrior': sum(1 for x in forget if x['priorInWindow'] == 0),
                       'noPriorButEarlier': sum(1 for x in forget if x['priorInWindow'] == 0 and x['priorAny'] > 0), 'rows': forget[:40]},
            'events': {k: evsum(E) for k, E in ev.items()}, 'eventRows': {k: E[:60] for k, E in ev.items()}}

def main():
    out = sys.argv[1]; R = [one(f) for f in sys.argv[2:]]
    json.dump(R, open(out, 'w'), ensure_ascii=False)
    for r in R:
        print('==', r['tag'], '해 넘김 여유분 뜀', r['jump'], '· 둘째 해 굶음', {k: v for k, v in r['forget'].items() if k != 'rows'}, '· 날씨', r['events'])
        for b in r['bins']:
            print('   ', b)

if __name__ == '__main__':
    main()
