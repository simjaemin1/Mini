#!/usr/bin/env python3
# T1283 (나) 개간 통나무 걸음 표 — 계측 훅 두 벌(`sbc-<시드>.json.t1275.json` 날 줄 · `sbc-<시드>.json.t1283.json` 마을-날 줄)만 읽는다 · 세계 0
#   판마다(시드마다 · 400날 끝): 영토 칸(51마을 합) · 넓힌 칸 누계 · 벤 그루 누계 · 곳간에 든 개간 통나무 누계(단) · 마을 짐(단) ·
#     걸음 분 누계(`_t1207.haulMin` — 일괄 몸이 칸 ↔ 곳간을 진 분) · 걸음 때문에 미룬 칸 누계(`_t1207.haulWait`)
#   T1275 훅 날 줄 칸: 2 영토 칸 · 9 넓힌 칸 누계 · 11 벤 그루 누계 · 12 곳간에 든 개간 통나무 누계 · 13 마을 짐
#   ⚠걸음 칸 둘은 T1283 훅 덧칸(41 ~ 42)이다 — 걸음(나) 판과 그 뒤 판에만 있다(앞 판은 "—")
# 실행: python3 t1283_haul.py <판 지도 JSON> [팔 …]   (판 지도 = t1283_plot.py 와 같은 꼴 · 팔 기본 = bundle bundleH)
import json, sys, os
MAP = json.load(open(sys.argv[1]))
ARMS = sys.argv[2:] or ['bundle', 'bundleH']
NAME = {'off': '끔', 'v2': 'v2 만', 'v2T': 'v2 만 + T1283', 'bundle': '묶음', 'bundleT': '묶음 + T1283', 'bundleH': '묶음 + 걸음(나)', 'bundleTW': '묶음 + T1283 + 출생 곳간 문(실험)', 'bundleTK': '묶음 + T1283 + K 곳간(실험)'}
SEEDS = ['1020', '7', '42']
def one(d, s):
    o = {}
    p5 = os.path.join(d, f'sbc-{s}.json.t1275.json')
    if os.path.exists(p5):
        D = json.load(open(p5))['days']; q = D[-1]
        o.update(day=q[0], pop=q[1], terr=q[2], cells=q[9], felled=q[11], clearIn=q[12], pack=q[13])
    p3 = os.path.join(d, f'sbc-{s}.json.t1283.json')
    if os.path.exists(p3):
        h = json.load(open(p3)); c = {k: i for i, k in enumerate(h['cols'])}
        if 'haulMin' in c:
            last = max(q[c['day']] for q in h['rows'])
            rows = [q for q in h['rows'] if q[c['day']] == last]
            o['haulMin'] = sum(q[c['haulMin']] or 0 for q in rows); o['haulWait'] = sum(q[c['haulWait']] or 0 for q in rows)
    return o
f = lambda x: '—' if x is None else f'{x:,.0f}'
print('| 판 | 시드 | 인구(400날) | 영토 칸 | 넓힌 칸 누계 | 벤 그루 누계 | 곳간에 든 개간 통나무(단) | 마을 짐(단) | 걸음(분 · 누계) | 걸음 때문에 미룬 칸(누계) |')
print('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|')
for a in ARMS:
    if a not in MAP: continue
    for s in SEEDS:
        if s not in MAP[a]: continue
        o = one(MAP[a][s], s)
        print(f"| {NAME.get(a, a)} | {s} | {f(o.get('pop'))} | {f(o.get('terr'))} | {f(o.get('cells'))} | {f(o.get('felled'))} | {f(o.get('clearIn'))} | {f(o.get('pack'))} | {f(o.get('haulMin'))} | {f(o.get('haulWait'))} |")
