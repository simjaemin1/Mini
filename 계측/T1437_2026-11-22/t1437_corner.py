#!/usr/bin/env python3
# T1437 코너 케이스 — 훅 칸(runs/*.t1437.json)에서
#   ① 마을 꼴마다 굶어 죽음(해마다) — 광산(교역으로 먹는 마을) ↔ 그 밖
#   ② 늘 넉넉한 마을 — 둘째 해(날 366 ~) 여유분이 가장 작았던 날이 5날치 밑인 마을 · 그 마을이 그 뒤 굶었나
#   ③ 되먹임 — 둘째 해 여유분 가운데의 앞 · 뒤 반(날 366 ~ 583 · 584 ~ 800) · 여유분 > 60 마을 수
#   ④ 비었다 다시 선 마을(`ex`) · 판 중에 새로 선 마을(첫 칸 날 > 1)
#   ⑤ 사람이 한꺼번에 는 날(하루에 10 % 넘게 · 5명 넘게) — 그날 앞 · 뒤 여유분(날치 자는 사람당이라 새 입이 낙폭으로 든다)
# 쓰는 법: python3 t1437_corner.py <out.json> <run.json> …
import json, sys, os, math, re
import gzip
def _load(f):   # 판 칸은 .json.gz 로 싣는다(레포 크기) — 날것 .json 도 읽는다
    return json.load(gzip.open(f, 'rt', encoding='utf-8') if str(f).endswith('.gz') else open(f, encoding='utf-8'))

def q(a, p):
    a = [x for x in a if x is not None]
    if not a: return None
    s = sorted(a); return s[min(len(s) - 1, int(math.floor(p * len(s))))]

def r1(x): return None if x is None else round(x, 1)
typ = lambda nm: re.sub(r'[0-9]+$', '', nm or '')

def one(f):
    d = _load(f); tag = os.path.basename(f).split('.')[0]; V = d['vil']; L = d['last']
    bytype = {}
    for v in V:
        t = typ(v['name']); d0 = v.get('d0', 1); y = bytype.setdefault(t, [0, 0, 0])
        for i, x in enumerate(v['fd']):
            day = d0 + i; y[0 if day <= 365 else (1 if day <= 730 else 2)] += x or 0
    low = []
    for v in V:
        d0 = v.get('d0', 1); bf = v['bf']
        y2 = [(d0 + i, b) for i, b in enumerate(bf) if b is not None and d0 + i >= 366]
        if not y2: continue
        dmin, bmin = min(y2, key=lambda z: z[1])
        if bmin < 5:
            after = sum(v['fd'][dmin - d0:]); st = sum(1 for x in v['sh'][dmin - d0:] if (x or 0) > 1e-6)
            low.append({'v': v['name'], 'day': dmin, 'bf': bmin, 'deadAfter': after, 'starveDaysAfter': st})
    half = lambda a, b: q([x for v in V for i, x in enumerate(v['bf']) if x is not None and a <= v.get('d0', 1) + i <= b], .5)
    over60 = len({v['name'] for v in V for i, x in enumerate(v['bf']) if x is not None and x > 60 and v.get('d0', 1) + i >= 366})
    refound = [v['name'] for v in V if v.get('ex', 0) > 0]
    newv = [v['name'] for v in V if v.get('d0', 1) > 1]
    surge = []
    for v in V:
        d0 = v.get('d0', 1); N = v['N']; bf = v['bf']
        for i in range(1, len(N)):
            if N[i - 1] and N[i] - N[i - 1] > max(5, 0.1 * N[i - 1]):
                b0 = bf[i - 1]; b1 = bf[min(len(bf) - 1, i + 1)]; b30 = bf[min(len(bf) - 1, i + 30)]
                surge.append({'v': v['name'], 'day': d0 + i, 'from': N[i - 1], 'to': N[i], 'bf0': b0, 'bf1': b1, 'bf30': b30})
    return {'tag': tag, 'arm': d['arm'], 'byType': bytype, 'lowBuf': {'n': len(low), 'dead': sum(x['deadAfter'] for x in low), 'starved': sum(1 for x in low if x['starveDaysAfter'] > 0), 'rows': low[:20]},
            'feedback': {'y2a': r1(half(366, 583)), 'y2b': r1(half(584, 800)), 'over60': over60},
            'refound': refound, 'new': newv, 'surge': {'n': len(surge), 'rows': surge[:20]}}

def main():
    out = sys.argv[1]; R = [one(f) for f in sys.argv[2:]]
    json.dump(R, open(out, 'w'), ensure_ascii=False)
    for r in R:
        print('==', r['tag'], '꼴마다 굶어 죽음', r['byType'], '· 여유분 5 밑', {k: v for k, v in r['lowBuf'].items() if k != 'rows'}, '· 되먹임', r['feedback'], '· 다시 섬', r['refound'], '· 새 마을', r['new'][:5], '· 몰려옴', r['surge']['n'])

if __name__ == '__main__':
    main()
