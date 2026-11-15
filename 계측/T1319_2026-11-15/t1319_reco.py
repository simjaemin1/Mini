#!/usr/bin/env python3
# T1319 켬 기본 권고표 — T1312 권고표(t1312_reco.py) 그대로에 T1319 줄(K 문 · 가을 문 · 둘 · 받는 쪽 문 실험)과 칸 둘(K 문 · 가을 문)을 더하고, 목표 넷을 다 넘는 줄을 굵게 · 맨 아래 한 줄로 모은다
#   실행: python3 t1319_reco.py <T1283 표 JSON> <T1297 표 JSON> <T1306 표 JSON> <T1312 표 JSON> <T1319 표 JSON> <밭 랩 md> [--out <폴더>]
# (아래는 T1306 · T1312 권고표 머리말 그대로) T1306 켬 기본 권고표 — 판 표 JSON 셋(T1283 · T1297 · T1306)과 밭 랩 표(T1284 `sum2.js` 출력)만 읽는다 · 세계 0 · 판정 0(목표를 넘는지 표지만 · 고르기는 재민)
#   실행: python3 t1306_reco.py <T1283 표 JSON> <T1297 표 JSON> <T1306 표 JSON> <밭 랩 md(KY · KYB · KYG)> [--out <폴더>]
#   표지 넷(판이 있는 시드만 · 1020 만 돌린 줄은 이름에 적는다): 1020 끔비 ≥ 1.10(카드 목표 — 묶음 줄의 자) · 세 시드 끔비 ≥ 0.98(끔 세계 목표 자) · 꼭대기 뒤 내림 ≤ 10% · 굶어 죽음 ≤ 같은 시드 끔
#   T1302(영토를 몸이 · 다른 세션) 칸은 자리만(결과가 오면 채운다 · 이 카드는 비워 둔다)
#   끝 25날 평균 끔비 — T1306 표 JSON 의 `avg25`(376 ~ 400날 인구 평균 ÷ 끔 판 같은 날 평균 · 훅 날 줄이 있는 판만)
#   CPU — 몸 세계 하루 CPU(T1274 실측 · 2 ~ 100날 평균 · zone 프로세스 사용자 + 시스템 초 — 끔 221.3 · 나무꾼만 283.4 · v2 만 215.6 · 묶음 377.5)와
#         빠른 판 400날 한 판 초(이 카드 판 · 동시 2 · 코어 2 · 그 세계 세 시드 평균 — 다른 날 판은 동시 수가 달라 견주지 않는다)
import json, sys, os
T83, T97, T06, T12, T19 = (json.load(open(p)) for p in sys.argv[1:6]); LAB = open(sys.argv[6]).read()
OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
SEEDS = ['1020', '7', '42']
CPU = {'off': 221.3, 'lumber': 283.4, 'v2': 215.6, 'bundle': 377.5}   # T1274 표 3(보고/T1274_2026-11-12.md) — 몸 세계 하루 CPU 초
def S(tab, k): return (tab.get(k) or {}).get('seeds') or {}
ROWS = [  # (이름, 켠 것[T1283, T1297, 단계 문, 이주 문, 무리 셈(T1312), K 문, 가을 문, v2, 나무꾼 몸], 세계, 표, 키)
  ('끔', '· · · · · · · · ·', 'off', T83, 'off'),
  ('끔 + T1297', '· ○ · · · · · · ·', 'off', T97, 'offB'),
  ('끔 + T1297 + 이주 문', '· ○ · ○ · · · · ·', 'off', T06, 'offM'),
  ('끔 + T1297 + 이주 문 + T1312', '· ○ · ○ ○ · · · ·', 'off', T12, 'offMH'),
  ('끔 + … + T1312 + K 문', '· ○ · ○ ○ ○ · · ·', 'off', T19, 'offK'),
  ('끔 + … + T1312 + 가을 문 `1`', '· ○ · ○ ○ · ○ · ·', 'off', T19, 'offA'),
  ('끔 + … + T1312 + K 문 + 가을 문 `1`', '· ○ · ○ ○ ○ ○ · ·', 'off', T19, 'offKA'),
  ('끔 + … + T1312 + K 문 + 가을 문 `mig`(이주 문만)', '· ○ · ○ ○ ○ ◐ · ·', 'off', T19, 'offKAM'),
  ('끔 + T1297 + T1306 둘', '· ○ ○ ○ · · · · ·', 'off', T06, 'offG'),
  ('v2 만', '· · · · · · · ○ ·', 'v2', T83, 'v2'),
  ('v2 만 + T1283', '○ · · · · · · ○ ·', 'v2', T83, 'v2T'),
  ('v2 만 + T1283 + T1297', '○ ○ · · · · · ○ ·', 'v2', T97, 'v2TB'),
  ('v2 만 + T1283 + T1297 + 이주 문', '○ ○ · ○ · · · ○ ·', 'v2', T06, 'v2M'),
  ('v2 만 + T1283 + T1297 + 이주 문 + T1312', '○ ○ · ○ ○ · · ○ ·', 'v2', T12, 'v2MH'),
  ('v2 만 + … + T1312 + K 문', '○ ○ · ○ ○ ○ · ○ ·', 'v2', T19, 'v2K'),
  ('v2 만 + … + T1312 + 가을 문 `1`', '○ ○ · ○ ○ · ○ ○ ·', 'v2', T19, 'v2A'),
  ('v2 만 + … + T1312 + K 문 + 가을 문 `1`', '○ ○ · ○ ○ ○ ○ ○ ·', 'v2', T19, 'v2KA'),
  ('v2 만 + … + T1312 + K 문 + 가을 문 `mig`(이주 문만)', '○ ○ · ○ ○ ○ ◐ ○ ·', 'v2', T19, 'v2KAM'),
  ('v2 만 + T1283 + T1297 + T1306 둘', '○ ○ ○ ○ · · · ○ ·', 'v2', T06, 'v2G'),
  ('묶음(나무꾼 몸 + v2)', '· · · · · · · ○ ○', 'bundle', T83, 'bundle'),
  ('묶음 + T1283', '○ · · · · · · ○ ○', 'bundle', T83, 'bundleT'),
  ('묶음 + T1283 + T1297', '○ ○ · · · · · ○ ○', 'bundle', T97, 'bundleTB'),
  ('묶음 + T1283 + T1297 + 이주 문', '○ ○ · ○ · · · ○ ○', 'bundle', T06, 'bundleM'),
  ('묶음 + T1283 + T1297 + 이주 문 + T1312', '○ ○ · ○ ○ · · ○ ○', 'bundle', T12, 'bundleMH'),
  ('묶음 + … + T1312 + K 문', '○ ○ · ○ ○ ○ · ○ ○', 'bundle', T19, 'bundleK'),
  ('묶음 + … + T1312 + 가을 문 `1`', '○ ○ · ○ ○ · ○ ○ ○', 'bundle', T19, 'bundleA'),
  ('묶음 + … + T1312 + K 문 + 가을 문 `1`', '○ ○ · ○ ○ ○ ○ ○ ○', 'bundle', T19, 'bundleKA'),
  ('묶음 + … + T1312 + K 문 + 가을 문 `mig`(이주 문만)', '○ ○ · ○ ○ ○ ◐ ○ ○', 'bundle', T19, 'bundleKAM'),
  ('실험 — 묶음 + … + T1312 + 받는 쪽 문(1020 만 · 가지에 안 실음)', '○ ○ · ○ ○ · · ○ ○', 'bundle', T19, 'expG'),
  ('실험 — 묶음 + … + T1312 + K 문 + 가을 문 `1` + 받는 쪽 문(1020 만 · 가지에 안 실음)', '○ ○ · ○ ○ ○ ○ ○ ○', 'bundle', T19, 'expGKA'),
  ('묶음 + T1283 + T1297 + 단계 문(1020 만)', '○ ○ ○ · · · · ○ ○', 'bundle', T06, 'bundleGo'),
  ('묶음 + T1283 + T1297 + T1306 둘', '○ ○ ○ ○ · · · ○ ○', 'bundle', T06, 'bundleG'),
]
off = S(T83, 'off')
md = ['| 조합 | T1283 · T1297 · 단계 문 · 이주 문 · 무리 셈 · K 문 · 가을 문 · v2 · 나무꾼 몸 | 끔비 1020 · 7 · 42 | 끝 25날 평균 끔비 | 꼭대기 뒤 내림(%) | 굶어 죽음(명 · 400날) | 빈 마을(곳) | 1020 ≥ 1.10 · 끔비 ≥ 0.98 · 내림 ≤ 10% · 굶음 ≤ 끔 | 몸 세계 하루 CPU(초 · T1274 · 그 세계) | 빠른 판(초 · 세 시드 평균) | T1302 영토를 몸이(자리) |',
      '|---|---|---|---|---|---|---|---|---|---|---|']
out = []
for name, on, world, tab, key in ROWS:
    sd = S(tab, key)
    if not sd: md.append(f'| {name} | {on} | — | — | — | — | — | — | {CPU[world]:g} | — | (자리) |'); continue
    a6 = S(T19, key) or S(T12, key) or S(T06, key)
    rat = {s: (sd[s]['pop'] / off[s]['pop']) if sd.get(s) and sd[s].get('pop') else None for s in SEEDS}
    avg = {s: (a6.get(s) or {}).get('avg25') for s in SEEDS}
    fam = {s: sd[s].get('famine') if sd.get(s) else None for s in SEEDS}
    drop = {s: sd[s].get('drop') if sd.get(s) else None for s in SEEDS}
    emp = {s: sd[s].get('empty') if sd.get(s) else None for s in SEEDS}
    av = [s for s in SEEDS if sd.get(s)]   # 판이 있는 시드만(1020 만 돌린 줄은 이름에 적는다)
    g0 = rat['1020'] is not None and rat['1020'] >= 1.10
    g1 = all(rat[s] is not None and rat[s] >= 0.98 for s in av); g2 = all(drop[s] is not None and drop[s] <= 10 for s in av); g3 = all(fam[s] is not None and fam[s] <= off[s]['famine'] for s in av)
    goals = ' · '.join('○' if g else '✗' for g in (g0, g1, g2, g3))
    if g0 and g1 and g2 and g3: goals = f'**{goals}**'; name = f'**{name}**'   # ★[T1319] 목표 넷을 다 넘는 줄
    secs = [sd[s].get('secs') for s in SEEDS if sd.get(s) and sd[s].get('secs')]
    f3 = lambda d, f: ' · '.join(f(d[s]) if d[s] is not None else '—' for s in SEEDS)
    md.append(f"| {name} | {on} | {f3(rat, lambda x: f'{x:.3f}')} | {f3(avg, lambda x: f'{x:.3f}')} | {f3(drop, lambda x: f'{x:g}')} | "
              f"{f3(fam, lambda x: f'{x:,}')} | {f3(emp, str)} | {goals} | {CPU[world]:g} | {round(sum(secs) / len(secs)) if len(secs) == 3 else '—'} | (자리) |")
    out.append({'name': name.strip('*'), 'on': on, 'ratio': rat, 'avg25': avg, 'drop': drop, 'famine': fam, 'empty': emp, 'goals': goals.strip('*'), 'all4': bool(g0 and g1 and g2 and g3), 'seeds': av, 'cpuDay': CPU[world], 'secs': secs})
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
    if c[0] == 'KYB': md.append(f'| 밭 + T1297 + K 문(랩 무동작 — K 문은 서버 받는 곳 고르기 줄뿐) | {c[5]} | {c[6]} | {c[9]} | {c[7]} | {c[10]} |')
    if c[0] == 'KYA': md.append(f'| 밭 + T1297 + 가을 문(econ 출생 문 — 랩에서도 선다) | {c[5]} | {c[6]} | {c[9]} | {c[7]} | {c[10]} |')
# ★[T1319] 조합 한눈에 — 손잡이 묶음(T1312 위)마다 목표 넷을 세 세계에 걸쳐: 묶음 1020 ≥ 1.10 · 끔 세계 ≥ 0.98(세 시드) · 꼭대기 뒤 내림 ≤ 10%(세 세계 · 세 시드) · 굶어 죽음 ≤ 같은 시드 끔(세 세계 · 세 시드)
COMBO = [('T1312(손잡이 없음)', 'bundleMH', 'v2MH', 'offMH', T12), ('+ K 문', 'bundleK', 'v2K', 'offK', T19), ('+ 가을 문 1(출생 + 이주)', 'bundleA', 'v2A', 'offA', T19),
         ('+ K 문 + 가을 문 1', 'bundleKA', 'v2KA', 'offKA', T19), ('+ K 문 + 가을 문 mig(이주 문만)', 'bundleKAM', 'v2KAM', 'offKAM', T19)]
cm = ['', '| 조합(T1312 위) | 묶음 1020 ≥ 1.10 | 끔 세계 ≥ 0.98(1020 · 7 · 42) | 내림 ≤ 10%(세 세계 가장 큰 값) | 굶어 죽음 ≤ 끔(세 세계 · 1020 · 7 · 42) | 넷 |', '|---|---|---|---|---|---|']
combo_ok = []
for name, kb, kv, ko, tab in COMBO:
    B, V, O = S(tab, kb), S(tab, kv), S(tab, ko)
    if kb == 'bundleMH': B, V, O = S(T12, kb), S(T12, kv), S(T12, ko)
    if not (B and V and O) or any(len(x) < 3 for x in (B, V, O)): cm.append(f'| {name} | (판 모자람) | | | | |'); continue
    r = lambda D, s: D[s]['pop'] / off[s]['pop']
    b0 = r(B, '1020'); g0 = b0 >= 1.10
    oo = [r(O, s) for s in SEEDS]; g1 = all(x >= 0.98 for x in oo)
    dr = max((D[s].get('drop') or 0) for D in (B, V, O) for s in SEEDS); g2 = dr <= 10
    fam = {w: [D[s].get('famine') for s in SEEDS] for w, D in (('묶음', B), ('v2 만', V), ('끔 세계', O))}
    g3 = all(f is not None and f <= off[s]['famine'] for w in fam for f, s in zip(fam[w], SEEDS))
    ok4 = g0 and g1 and g2 and g3
    if ok4: combo_ok.append(name)
    mk = lambda g: '○' if g else '✗'
    cm.append(f"| {'**' + name + '**' if ok4 else name} | {mk(g0)} {b0:.3f} | {mk(g1)} {' · '.join(f'{x:.3f}' for x in oo)} | {mk(g2)} {dr:g}% | {mk(g3)} " + ' / '.join(f"{w} {' · '.join(f'{x:,}' for x in v)}" for w, v in fam.items()) + f" | {'**○**' if ok4 else '✗'} |")
md += cm
allok = [o for o in out if o.get('all4')]
md.append('')
md.append('**목표 넷(1020 ≥ 1.10 · 끔비 ≥ 0.98 · 내림 ≤ 10% · 굶어 죽음 ≤ 같은 시드 끔)을 다 넘는 줄(줄마다): ' + ('; '.join(f"{o['name']}(판 시드 {' · '.join(o['seeds'])})" for o in allok) if allok else '없음') + '**')
md.append('**세 세계에 걸쳐 넷을 다 넘는 조합: ' + ('; '.join(combo_ok) if combo_ok else '없음') + '**')
md.append('')
md.append('* 빠른 판(초) 칸 — T1319 판은 @regress 전수(9시간 19분)와 겹쳐 돈 판이 많아 견주지 않는다(같은 판 혼자 15 ~ 25분 · T1312 판 칸은 그때 그 자리).')
txt = '\n'.join(md); print(txt)
if OUT: os.makedirs(OUT, exist_ok=True); open(os.path.join(OUT, 't1319-reco.md'), 'w').write(txt + '\n'); json.dump(out, open(os.path.join(OUT, 't1319-reco.json'), 'w'), ensure_ascii=False)
