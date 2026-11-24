#!/usr/bin/env python3
# T1431 만남 줄(도적 로그 `[T1431]`)을 센다 — 호위 0 / 있음 × 달아남 · 싸움(이김 · 짐 · 비김) · 쓰러짐
import re, sys, glob, os, json
D = os.path.dirname(os.path.abspath(__file__))
pat = re.compile(r'D(\d+) 캐러밴#(\d+)\(.*?(가는 길|귀로) · 호위 (\d+) · 행복 ([\d.]+)\) ↔ 도적단#(\d+) (\d+)명 — (.*) \[T1431\]')
out = {}
for tag in sys.argv[1:]:
    seen = set(); C = {'n': 0, 'e0': 0, 'e0fled': 0, 'eFled': 0, 'eFight': 0, 'win': 0, 'lost': 0, 'draw': 0, 'escD': 0, 'banD': 0, 'trD': 0, 'happy': [], 'G': [], 'E': []}
    for f in glob.glob(os.path.join(D, 'runs', tag, '*.log')):
        for line in open(f, encoding='utf-8', errors='replace'):
            m = pat.search(line)
            if not m: continue
            key = m.group(0)
            if key in seen: continue   # 큐 로그가 두 번 찍힐 수 있다
            seen.add(key)
            d, cid, leg, E, h, gid, G, res = m.groups(); E = int(E); G = int(G)
            C['n'] += 1; C['happy'].append(float(h)); C['G'].append(G); C['E'].append(E)
            fled = '달아났다' in res
            if E == 0: C['e0'] += 1; C['e0fled'] += fled
            elif fled: C['eFled'] += 1
            else: C['eFight'] += 1
            if not fled:
                if '물리쳤다' in res: C['win'] += 1
                elif '비겼다' in res: C['draw'] += 1
                else: C['lost'] += 1
                mm = re.search(r'쓰러짐 호위 (\d+) · 행상 (\d+) · 도적 (\d+)', res)
                if mm: C['escD'] += int(mm.group(1)); C['trD'] += int(mm.group(2)); C['banD'] += int(mm.group(3))
    hs = C.pop('happy'); Gs = C.pop('G'); Es = C.pop('E')
    C['happyMean'] = round(sum(hs) / len(hs), 3) if hs else None
    C['Gmean'] = round(sum(Gs) / len(Gs), 2) if Gs else None; C['Emean'] = round(sum(Es) / len(Es), 2) if Es else None
    C['Emax'] = max(Es) if Es else None; C['Gmin'] = min(Gs) if Gs else None; C['Gmax'] = max(Gs) if Gs else None
    out[tag] = C
print(json.dumps(out, ensure_ascii=False, indent=1))
