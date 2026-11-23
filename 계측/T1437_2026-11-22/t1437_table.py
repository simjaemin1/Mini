#!/usr/bin/env python3
# T1437 판 표 — 훅 칸(runs/*.t1437.json)에서 팔마다 카드 열(굶어 죽음 해마다 · 인구 · 나무꾼 0 마을-날 · 곳간 나무 없는 마을 · 나무 값 · 식량 날치 가운데 · 광부 · 청동 · 빈 마을)
#   + 여유분 · 버틸 날의 해마다 띠 + 배우는 빠르기(30날 칸마다 굶어 죽음 · 여유분 가운데 · 식량 날치 가운데)
# 쓰는 법: python3 t1437_table.py <out.json> <run.json> …   (팔 = 파일 이름 앞머리 · L<팔>-<시드>[-…] / S<팔>-<시드>)
import json, sys, os, math
import gzip
def _load(f):   # 판 칸은 .json.gz 로 싣는다(레포 크기) — 날것 .json 도 읽는다
    return json.load(gzip.open(f, 'rt', encoding='utf-8') if str(f).endswith('.gz') else open(f, encoding='utf-8'))

def q(a, p):
    a = [x for x in a if x is not None]
    if not a: return None
    s = sorted(a); return s[min(len(s) - 1, int(math.floor(p * len(s))))]

def r1(x): return None if x is None else round(x, 1)

def one(f):
    d = _load(f)
    tag = os.path.basename(f).split('.')[0]
    last = d['last']; dfc = d.get('dfc') or 1.0
    V = d['vil']; M = d['marks']
    mk = {m['day']: m for m in M}
    endm = M[-1] if M else {}
    # 해마다 굶어 죽음(판 날 기준 — 1 ~ 365 · 366 ~ 730 · 731 ~ 끝)
    yrs = [(1, 365), (366, 730), (731, 10 ** 9)]
    dead = [0, 0, 0]
    bins = {}   # 30날 칸 → [굶어 죽음, 여유분[], 식량 날치[], 굶는 마을 수 합]
    for v in V:
        d0 = v.get('d0', 1)
        for i, x in enumerate(v['fd']):
            day = d0 + i
            for k, (a, b) in enumerate(yrs):
                if a <= day <= b: dead[k] += x or 0
            B = bins.setdefault((day - 1) // 30, [0, [], [], 0])
            B[0] += x or 0
            if v['bf'][i] is not None: B[1].append(v['bf'][i])
            if v['N'][i] and v['N'][i] > 0: B[2].append((v['S'][i] or 0) / (v['N'][i] * dfc))
            if (v['sh'][i] or 0) > 1e-6: B[3] += 1
    # 여유분 · 버틸 날 띠(해마다 · 산 마을-날)
    bandsB, bandsN = {}, {}
    for v in V:
        d0 = v.get('d0', 1)
        for i in range(len(v['bf'])):
            day = d0 + i; y = 1 if day <= 365 else (2 if day <= 730 else 3)
            if v['bf'][i] is not None: bandsB.setdefault(y, []).append(v['bf'][i])
            if v['nd'][i] is not None: bandsN.setdefault(y, []).append(v['nd'][i])
    lj = [m['lj0'] for m in M if m.get('lj0') is not None]
    row = {
        'tag': tag, 'arm': d['arm'], 'arm2': d.get('arm2'), 'last': last,
        'pop': endm.get('pop'), 'live': endm.get('live'), 'empty': endm.get('empty'),
        'dead': dead, 'deadTot': sum(dead), 'fdDeadMark': endm.get('fdDead'),
        'lj0': r1(sum(lj) / len(lj)) if lj else None,
        'wood0_400': (mk.get(400) or {}).get('wood0'), 'wood0_end': endm.get('wood0'),
        'woodPx400': (mk.get(400) or {}).get('woodPx'), 'woodPxEnd': endm.get('woodPx'),
        'fdMed': endm.get('fdMed'), 'fd10': endm.get('fd10'), 'fd60': endm.get('fd60'),
        'miner': (endm.get('jobs') or {}).get('miner'), 'lumberjack': (endm.get('jobs') or {}).get('lumberjack'),
        'farmer': (endm.get('jobs') or {}).get('farmer'), 'mason': (endm.get('jobs') or {}).get('mason'),
        'mines400': (mk.get(400) or {}).get('mines'), 'minesEnd': endm.get('mines'), 'bronze': endm.get('bronze'),
        'housing': endm.get('housing'), 'h40': endm.get('h40'), 'hLo': endm.get('hLo'),
        'buf': {y: [r1(q(a, .5)), r1(q(a, .9)), r1(max(a))] for y, a in bandsB.items()},
        'need': {y: [r1(q(a, .5)), r1(q(a, .9))] for y, a in bandsN.items()},
        'bins': [[k * 30 + 1, B[0], r1(q(B[1], .5)), r1(q(B[1], .9)), r1(q(B[2], .5)), B[3]] for k, B in sorted(bins.items())],
        'marks': [[m['day'], m['pop'], m['fdDead'], m.get('fdMed'), m.get('lj0'), m.get('wood0'), m.get('woodPx'), m.get('empty'), (m.get('jobs') or {}).get('miner')] for m in M],
    }
    return row

def main():
    out = sys.argv[1]
    rows = [one(f) for f in sys.argv[2:]]
    json.dump(rows, open(out, 'w'), ensure_ascii=False)
    off = {r['tag'].split('-')[1]: r for r in rows if r['arm'] == 'off'}
    for r in rows:
        sd = r['tag'].split('-')[1]; o = off.get(sd)
        ratio = (r['pop'] / o['pop']) if (o and o['pop']) else None
        print(f"{r['tag']:34s} 사람 {r['pop']} ({ratio and round(ratio, 3)}) · 굶어 죽음 {r['dead']} = {r['deadTot']} · 빈 {r['empty']} · 나무꾼0 {r['lj0']}% · 나무없는곳간 {r['wood0_400']}/{r['wood0_end']} · 나무값 {r['woodPx400']}/{r['woodPxEnd']} · 식량날치 {r['fdMed']} · 광부 {r['miner']} · 광산 {r['minesEnd'] and sum(x or 0 for x in r['minesEnd'])} · 청동 {r['bronze']} · 여유분 {r['buf']} · 버틸날 {r['need']}")

if __name__ == '__main__':
    main()
