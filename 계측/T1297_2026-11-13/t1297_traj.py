#!/usr/bin/env python3
# T1297 50날 눈금 표 — `t1297-table.json`(scripts/t1297-table.js 가 쓴 것)의 traj 칸만 읽는다 · 세계 0
#   인구(괄호 = 같은 날 끔비) · 그날 나무꾼 · 곳간 통나무
# 실행: python3 t1297_traj.py <t1297-table.json>
import json, sys
R = json.load(open(sys.argv[1]))
NAME = {'off': '끔', 'offN': '끔(이 베이스 · 훅)', 'offB': '끔 + T1297', 'bundleT': '묶음 + T1283', 'bundleTB': '묶음 + T1283 + T1297', 'v2T': 'v2 만 + T1283', 'v2TB': 'v2 만 + T1283 + T1297', 'offB10': '끔 + T1297(10일치 · 실험)'}
DAYS = [50, 100, 150, 200, 250, 300, 350, 400]
off = {s: {q[0]: q for q in (R.get('off', {}).get('seeds', {}).get(s, {}) or {}).get('traj', [])} for s in ['1020', '7', '42']}
def table(title, fn):
    print(f"\n**{title}**\n")
    print('| 시드 · 판 | ' + ' | '.join(f'{d}날' for d in DAYS) + ' |')
    print('|---|' + '---:|' * len(DAYS))
    for s in ['1020', '7', '42']:
        for k in ['off', 'offB', 'offB10', 'bundleT', 'bundleTB', 'v2T', 'v2TB']:
            o = R.get(k, {}).get('seeds', {}).get(s)
            if not o or not o.get('traj'): continue
            T = {q[0]: q for q in o['traj']}
            print(f"| {s} · {NAME.get(k, k)} | " + ' | '.join(fn(k, s, T.get(d), d) for d in DAYS) + ' |')
def pop(k, s, q, d):
    if not q: return '—'
    return f"{q[1]:,}" + (f" ({q[1] / off[s][d][1]:.2f})" if k != 'off' and d in off[s] else '')
table('인구(명 · 괄호 = 같은 날 끔비)', pop)
table('나무꾼(명) · 곳간 통나무(단)', lambda k, s, q, d: '—' if not q else f"{q[2]} · {q[3]:,}")
