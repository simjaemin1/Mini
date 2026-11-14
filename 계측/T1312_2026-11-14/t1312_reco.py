#!/usr/bin/env python3
# T1306 켬 기본 권고표 — 판 표 JSON 셋(T1283 · T1297 · T1306)과 밭 랩 표(T1284 `sum2.js` 출력)만 읽는다 · 세계 0 · 판정 0(목표를 넘는지 표지만 · 고르기는 재민)
#   실행: python3 t1306_reco.py <T1283 표 JSON> <T1297 표 JSON> <T1306 표 JSON> <밭 랩 md(KY · KYB · KYG)> [--out <폴더>]
#   표지 넷(판이 있는 시드만 · 1020 만 돌린 줄은 이름에 적는다): 1020 끔비 ≥ 1.10(카드 목표 — 묶음 줄의 자) · 세 시드 끔비 ≥ 0.98(끔 세계 목표 자) · 꼭대기 뒤 내림 ≤ 10% · 굶어 죽음 ≤ 같은 시드 끔
#   T1302(영토를 몸이 · 다른 세션) 칸은 자리만(결과가 오면 채운다 · 이 카드는 비워 둔다)
#   끝 25날 평균 끔비 — T1306 표 JSON 의 `avg25`(376 ~ 400날 인구 평균 ÷ 끔 판 같은 날 평균 · 훅 날 줄이 있는 판만)
#   CPU — 몸 세계 하루 CPU(T1274 실측 · 2 ~ 100날 평균 · zone 프로세스 사용자 + 시스템 초 — 끔 221.3 · 나무꾼만 283.4 · v2 만 215.6 · 묶음 377.5)와
#         빠른 판 400날 한 판 초(이 카드 판 · 동시 2 · 코어 2 · 그 세계 세 시드 평균 — 다른 날 판은 동시 수가 달라 견주지 않는다)
import json, sys, os
T83, T97, T06, T12 = (json.load(open(p)) for p in sys.argv[1:5]); LAB = open(sys.argv[5]).read()
OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
SEEDS = ['1020', '7', '42']
CPU = {'off': 221.3, 'lumber': 283.4, 'v2': 215.6, 'bundle': 377.5}   # T1274 표 3(보고/T1274_2026-11-12.md) — 몸 세계 하루 CPU 초
def S(tab, k): return (tab.get(k) or {}).get('seeds') or {}
ROWS = [  # (이름, 켠 것[T1283, T1297, 단계 문, 이주 문, 무리 셈(T1312), v2, 나무꾼 몸], 세계, 표, 키)
  ('끔', '· · · · · · ·', 'off', T83, 'off'),
  ('끔 + T1297', '· ○ · · · · ·', 'off', T97, 'offB'),
  ('끔 + T1297 + 이주 문', '· ○ · ○ · · ·', 'off', T06, 'offM'),
  ('끔 + T1297 + 이주 문 + T1312', '· ○ · ○ ○ · ·', 'off', T12, 'offMH'),
  ('끔 + T1297 + T1306 둘', '· ○ ○ ○ · · ·', 'off', T06, 'offG'),
  ('v2 만', '· · · · · ○ ·', 'v2', T83, 'v2'),
  ('v2 만 + T1283', '○ · · · · ○ ·', 'v2', T83, 'v2T'),
  ('v2 만 + T1283 + T1297', '○ ○ · · · ○ ·', 'v2', T97, 'v2TB'),
  ('v2 만 + T1283 + T1297 + 이주 문', '○ ○ · ○ · ○ ·', 'v2', T06, 'v2M'),
  ('v2 만 + T1283 + T1297 + 이주 문 + T1312', '○ ○ · ○ ○ ○ ·', 'v2', T12, 'v2MH'),
  ('v2 만 + T1283 + T1297 + T1306 둘', '○ ○ ○ ○ · ○ ·', 'v2', T06, 'v2G'),
  ('묶음(나무꾼 몸 + v2)', '· · · · · ○ ○', 'bundle', T83, 'bundle'),
  ('묶음 + T1283', '○ · · · · ○ ○', 'bundle', T83, 'bundleT'),
  ('묶음 + T1283 + T1297', '○ ○ · · · ○ ○', 'bundle', T97, 'bundleTB'),
  ('묶음 + T1283 + T1297 + 이주 문', '○ ○ · ○ · ○ ○', 'bundle', T06, 'bundleM'),
  ('묶음 + T1283 + T1297 + 이주 문 + T1312', '○ ○ · ○ ○ ○ ○', 'bundle', T12, 'bundleMH'),
  ('묶음 + T1283 + T1297 + 단계 문(1020 만)', '○ ○ ○ · · ○ ○', 'bundle', T06, 'bundleGo'),
  ('묶음 + T1283 + T1297 + T1306 둘', '○ ○ ○ ○ · ○ ○', 'bundle', T06, 'bundleG'),
]
off = S(T83, 'off')
md = ['| 조합 | T1283 · T1297 · 단계 문 · 이주 문 · 무리 셈 · v2 · 나무꾼 몸 | 끔비 1020 · 7 · 42 | 끝 25날 평균 끔비 | 꼭대기 뒤 내림(%) | 굶어 죽음(명 · 400날) | 빈 마을(곳) | 1020 ≥ 1.10 · 끔비 ≥ 0.98 · 내림 ≤ 10% · 굶음 ≤ 끔 | 몸 세계 하루 CPU(초 · T1274 · 그 세계) | 빠른 판(초 · 세 시드 평균) | T1302 영토를 몸이(자리) |',
      '|---|---|---|---|---|---|---|---|---|---|---|']
out = []
for name, on, world, tab, key in ROWS:
    sd = S(tab, key)
    if not sd: md.append(f'| {name} | {on} | — | — | — | — | — | — | {CPU[world]:g} | — | (자리) |'); continue
    a6 = S(T12, key) or S(T06, key)
    rat = {s: (sd[s]['pop'] / off[s]['pop']) if sd.get(s) and sd[s].get('pop') else None for s in SEEDS}
    avg = {s: (a6.get(s) or {}).get('avg25') for s in SEEDS}
    fam = {s: sd[s].get('famine') if sd.get(s) else None for s in SEEDS}
    drop = {s: sd[s].get('drop') if sd.get(s) else None for s in SEEDS}
    emp = {s: sd[s].get('empty') if sd.get(s) else None for s in SEEDS}
    av = [s for s in SEEDS if sd.get(s)]   # 판이 있는 시드만(1020 만 돌린 줄은 이름에 적는다)
    g0 = rat['1020'] is not None and rat['1020'] >= 1.10
    g1 = all(rat[s] is not None and rat[s] >= 0.98 for s in av); g2 = all(drop[s] is not None and drop[s] <= 10 for s in av); g3 = all(fam[s] is not None and fam[s] <= off[s]['famine'] for s in av)
    goals = ' · '.join('○' if g else '✗' for g in (g0, g1, g2, g3))
    secs = [sd[s].get('secs') for s in SEEDS if sd.get(s) and sd[s].get('secs')]
    f3 = lambda d, f: ' · '.join(f(d[s]) if d[s] is not None else '—' for s in SEEDS)
    md.append(f"| {name} | {on} | {f3(rat, lambda x: f'{x:.3f}')} | {f3(avg, lambda x: f'{x:.3f}')} | {f3(drop, lambda x: f'{x:g}')} | "
              f"{f3(fam, lambda x: f'{x:,}')} | {f3(emp, str)} | {goals} | {CPU[world]:g} | {round(sum(secs) / len(secs)) if len(secs) == 3 else '—'} | (자리) |")
    out.append({'name': name, 'on': on, 'ratio': rat, 'avg25': avg, 'drop': drop, 'famine': fam, 'empty': emp, 'goals': goals, 'cpuDay': CPU[world], 'secs': secs})
# 밭 랩(헤드리스 econ · 800날 · 켬/끔 = 세 시드 인구 합 ÷ 끔 판 합)
lab = [l for l in LAB.split('\n') if l.startswith('| ') and not l.startswith('| 판 ')]
md.append('')
md.append('| 밭 랩(헤드리스 econ · 800날 · T1243 + T1276 + T1284) | 켬/끔(인구 합) | 빈 마을(곳) | 굶어 죽음(명) | 출생(명) | 주거 문 몫(출생 0 마을-날) |')
md.append('|---|---:|---:|---:|---:|---:|')
NAME = {'off': '끔(T1276 판)', 'KY': '밭', 'KYB': '밭 + T1297', 'KYG': '밭 + T1297 + 단계 문'}
for l in lab:
    c = [x.strip() for x in l.strip('|').split('|')]
    if c[0] in NAME: md.append(f'| {NAME[c[0]]} | {c[5]} | {c[6]} | {c[9]} | {c[7]} | {c[10]} |')
    if c[0] == 'KYB': md.append(f'| 밭 + T1297 + 이주 문(랩 무동작 — 걸을 문이 없어 아무도 안 떠난다 · 150날 관찰기 바이트 같음) | {c[5]} | {c[6]} | {c[9]} | {c[7]} | {c[10]} |')
    if c[0] == 'KYB': md.append(f'| 밭 + T1297 + 이주 문 + T1312(랩 무동작 — 손잡이를 읽는 줄은 server/villages.js · bandits.js 뿐) | {c[5]} | {c[6]} | {c[9]} | {c[7]} | {c[10]} |')
txt = '\n'.join(md); print(txt)
if OUT: os.makedirs(OUT, exist_ok=True); open(os.path.join(OUT, 't1312-reco.md'), 'w').write(txt + '\n'); json.dump(out, open(os.path.join(OUT, 't1312-reco.json'), 'w'), ensure_ascii=False)
