#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T1191 표 기계 · 관찰기 JSON 만 읽는다 · 산수뿐 · 판정 0)
# =============================================================================
# T1191 — 시범 마을 환호 표. `t1191-ditch-observe.js` 가 찍은 `<판>-<시드>.t1191.json` 을 읽어 마크다운 표를 낸다.
#   표 A(할 일 3) — 날마다: 영토 칸(시딩 고리 안쪽 타원 안 · 고리 띠 · 바깥) · 도랑 칸(영토 밖 · 남의 영토) · 영토 밖 도랑 중 제 영토와 맞닿은 칸 ·
#                     집(고리 안 · 띠 · 밖) · 그날 집을 다 품는 고리
#   표 B(할 일 2) — 꼴 셋: ㄷ(지금 판 고리 + 영토 밖 칸 편입) · ㄹ(회관 + 곳간) · 섞기(+ 가까운 집 ⌈집 × 6/17⌉) —
#                     도랑 칸 · 영토 밖 칸 · 남의 영토 칸 · 고리 안 집 · 일손(사람-날 = 칸 × 깊이 ÷ 1.8 m³ — 칸 넓이 1 m² · 깊이 0.2 ~ 1.1 m = 검단리)
# 쓰는 법: python3 scripts/t1191-table.py <run 디렉터리> [시드,…]
# =============================================================================
import json, math, os, sys

D = sys.argv[1]
SEEDS = (sys.argv[2] if len(sys.argv) > 2 else '1020,7,42').split(',')
DIG = 1.8             # m³ / 사람 · 날 — EXARC Euro-REA 3(2006) 원형 도랑 실험 "a strong person … 1,8 m3 of earth per day"
DEP = (0.2, 1.1)      # m — 검단리 도랑 깊이 20 ~ 110 cm(우리역사넷)
def lab(c): return f"{math.ceil(c * DEP[0] / DIG)} ~ {math.ceil(c * DEP[1] / DIG)}"
docs = {}
for s in SEEDS:
    f = os.path.join(D, f'base-{s}.t1191.json')
    if os.path.exists(f): docs[s] = json.load(open(f))
P = print
P('### 표 A — 영토가 자라며 도랑을 만나면(시드 · 마을 · 날)')
P('')
P('| 시드 | 마을 | 날 | 영토 칸 (고리 안쪽 · 띠 · 바깥) | 도랑 칸 | 그중 영토 밖 · 남의 영토 | 영토 밖 도랑 중 제 영토와 맞닿음 | 도랑과 맞닿은 영토 칸 | 집 (고리 안 · 띠 · 밖) | 그날 집을 다 품는 고리 a × b · 칸 (영토 밖 · 남) |')
P('|---|---|---:|---|---:|---|---:|---:|---|---|')
for s, doc in docs.items():
    if doc.get('err'): P(f'| {s} | 오류 | {doc["err"][:80]} |')
    for sh in doc['shots']:
        for n, o in sh['v'].items():
            T, H, R = o['T'], o['H'], o['ringNow']
            P(f"| {s} | {n} | {sh['day']} | {o['terr']:,} ({T['in']:,} · {T['band']} · {T['out']:,}) | {o['cells']} | {o['out']} · {o['other']} | {o.get('outTouch', '—')} | {o['touch']} | {o['houses']} ({H['in']} · {H['band']} · {H['out']}) | {R['a']} × {R['b']} · {R['cells']} ({R['out']} · {R['other']}) |")
P('')
P('### 표 B — 꼴 셋(시드 · 마을 · 날) — 칸 · 영토 밖 · 남의 영토 · 고리 안 집 / 집 · 일손(사람-날)')
P('')
P('| 시드 | 마을 | 날 | ㄷ 지금 판 고리 | ㄷ 그날 다 품는 고리 | ㄹ 회관 + 곳간 | 섞기 + 가까운 집 |')
P('|---|---|---:|---|---|---|---|')
SUM = {}
for s, doc in docs.items():
    for sh in doc['shots']:
        for n, o in sh['v'].items():
            A = sh.get('alt', {}).get(n)
            if not A: continue
            R = o['ringNow']
            cell = lambda c, out, oth, hin: f"{c} · 밖 {out} · 남 {oth} · 집 {hin}/{o['houses']} · {lab(c)}"
            P(f"| {s} | {n} | {sh['day']} | {cell(o['cells'], o['out'], o['other'], o['H']['in'])} | {cell(R['cells'], R['out'], R['other'], o['houses'])} | {cell(A['core']['cells'], A['core']['out'], A['core']['other'], A['core']['housesIn'])} | {cell(A['mix']['cells'], A['mix']['out'], A['mix']['other'], A['mix']['housesIn'])} ({A['mix']['nMix']}채) |")
            for k, (c, out, oth) in {'ㄷ': (o['cells'], o['out'], o['other']), 'ㄷ그날': (R['cells'], R['out'], R['other']), 'ㄹ': (A['core']['cells'], A['core']['out'], A['core']['other']), '섞기': (A['mix']['cells'], A['mix']['out'], A['mix']['other'])}.items():
                z = SUM.setdefault((sh['day'], k), [0, 0, 0, 0]); z[0] += c; z[1] += out; z[2] += oth; z[3] += 1
P('')
P('### 표 C — 꼴 셋 합(3시드 · 시범 마을 2곳 = 마을-시드 6)')
P('')
P('| 날 | 꼴 | 도랑 칸 합 | 영토 밖 칸 합 | 남의 영토 칸 합 | 일손 합(사람-날 · 깊이 0.2 ~ 1.1 m) |')
P('|---:|---|---:|---:|---:|---|')
for (day, k), z in sorted(SUM.items(), key=lambda x: (x[0][0], ['ㄷ', 'ㄷ그날', 'ㄹ', '섞기'].index(x[0][1]))):
    P(f'| {day} | {k} | {z[0]:,} | {z[1]:,} | {z[2]:,} | {lab(z[0])} |')
