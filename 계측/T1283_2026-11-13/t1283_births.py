#!/usr/bin/env python3
# T1283 출생 · 주거 문 · 기근 표 — 계측 훅 두 벌(`sbc-<시드>.json.t1275.json` 날 줄 · `sbc-<시드>.json.t1283.json` 마을-날 줄)과
#   굶어 죽음 누계(`sbc-<시드>.fd-deaths.json`)만 읽는다 · 세계 0
#   판마다(시드마다): 늘림(명 · 400날 Σ max(dP, 0)) · 그중 곳간 식량 10일치 밑 날의 몫 · 깊은 기근 마을-날 · 주거 문에 막힌 마을-날 · 굶어 죽음(명)
#   dP = econ 인구 줄이 그날 적용한 몫(`_dpDebug.dP` — 로지스틱 · 굶주림 · 건강 · 행복 · 위신 · 주거 문 · T1149 출생 문 뒤 · ΔP 상한 앞 · 명/날)
#   주거 문 = T1275 훅 날 줄 칸 20(그날 `_dpDebug.gated` 마을 수) — 판 모두 이 칸이 있다
#   ⚠관찰 판 둘(v2 만 1020 · 묶음 1020)은 앞 판 훅(마을-날 32칸 — dP 칸 전)으로 돌아 늘림 칸이 "—"
# 실행: python3 t1283_births.py <판 지도 JSON>   (판 지도 = t1283_plot.py 와 같은 꼴)
import json, sys, os
MAP = json.load(open(sys.argv[1]))
NAME = {'off': '끔', 'v2': 'v2 만', 'v2T': 'v2 만 + T1283', 'bundle': '묶음', 'bundleT': '묶음 + T1283', 'bundleH': '묶음 + 걸음(나)', 'bundleTW': '묶음 + T1283 + 출생 곳간 문(실험)', 'bundleTK': '묶음 + T1283 + K 곳간(실험)'}
SEEDS = ['1020', '7', '42']
def one(d, s):
    o = {'grow': None, 'growDeep': None, 'deepVd': None, 'gated': None, 'famine': None}
    p5 = os.path.join(d, f'sbc-{s}.json.t1275.json')
    if os.path.exists(p5): o['gated'] = sum(q[20] for q in json.load(open(p5))['days'])
    p3 = os.path.join(d, f'sbc-{s}.json.t1283.json')
    if os.path.exists(p3):
        h = json.load(open(p3)); c = {k: i for i, k in enumerate(h['cols'])}
        o['deepVd'] = sum(1 for q in h['rows'] if q[c['N']] and q[c['foodDays']] is not None and q[c['foodDays']] < 10)
        if 'dP' in c:
            g = gd = 0.0
            for q in h['rows']:
                dp = q[c['dP']] or 0
                if q[c['N']] and dp > 0:
                    g += dp
                    if q[c['foodDays']] is not None and q[c['foodDays']] < 10: gd += dp
            o['grow'], o['growDeep'] = g, gd
    f = os.path.join(d, f'sbc-{s}.fd-deaths.json')
    if os.path.exists(f): o['famine'] = json.load(open(f)).get('fdDeadTot')
    return o
n = lambda x: '—' if x is None else f'{x:,.0f}'
print('| 판 | 시드 | 늘림(명 · 400날) | ㄴ 곳간 10일치 밑 날의 늘림(명 · 몫) | 깊은 기근 마을-날 | 주거 문에 막힌 마을-날 | 굶어 죽음(명) |')
print('|---|---|---:|---|---:|---:|---:|')
for a in ['off', 'v2', 'v2T', 'bundle', 'bundleT', 'bundleH', 'bundleTW', 'bundleTK']:
    if a not in MAP: continue
    for s in SEEDS:
        if s not in MAP[a]: continue
        o = one(MAP[a][s], s)
        deep = '—' if o['grow'] is None else f"{o['growDeep']:,.0f} ({100 * o['growDeep'] / o['grow'] if o['grow'] else 0:.0f}%)"
        print(f"| {NAME[a]} | {s} | {n(o['grow'])} | {deep} | {n(o['deepVd'])} | {n(o['gated'])} | {n(o['famine'])} |")
