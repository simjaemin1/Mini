#!/usr/bin/env python3
# T1391 보고 · 회부 · README 조립 — rep/*.md 조각 + out/* 표 → out/report.md · out/hoebu.md · out/README.md (자리표 @@…@@ 를 채운다 · 남으면 멈춘다)
#   python3 assemble.py <날짜> <코드 머리> [보고 커밋 자리표는 남긴다]
import os, re, sys, json
S = os.path.dirname(os.path.abspath(__file__))
DATE, CODE = sys.argv[1], sys.argv[2]
rd = lambda f: open(os.path.join(S, f), encoding='utf-8').read()
V = {'@@DATE@@': DATE, '@@CODE_HEAD@@': CODE}
if os.path.exists(os.path.join(S, 'rep', 'vals.json')):
    V.update(json.load(open(os.path.join(S, 'rep', 'vals.json'), encoding='utf-8')))
if os.path.exists(os.path.join(S, 'rep', 'vals_extra.json')):
    V.update(json.load(open(os.path.join(S, 'rep', 'vals_extra.json'), encoding='utf-8')))
for f in os.listdir(os.path.join(S, 'out')):
    if f.endswith('.md') and f.startswith('tab'):
        V['@@' + f[:-3].upper() + '@@'] = rd(os.path.join('out', f)).strip()
def fill(t):
    for _ in range(3):
        for k, v in V.items(): t = t.replace(k, v)
    return t
_hs = rd(os.path.join('rep', 'hoebu_sec.md'))
_items = [l for l in _hs.split('\n') if re.match(r'^\d+\. ', l) or l.startswith('@@HOEBU_SEC_MORE@@')]
V['@@HOEBU_ITEMS@@'] = '\n'.join(_items)
V['@@HOEBU_N@@'] = str(sum(1 for l in fill(V['@@HOEBU_ITEMS@@']).split('\n') if re.match(r'^\d+\. ', l)))
parts = [p for p in ['head.md', 'table0.md', 's0.md', 's1_now.md', 's2_impl.md', 's3_runs.md', 's4_feed.md', 's5_rich.md', 's6_harness.md', 's7_guard.md', 's8_hoebu.md', 's9_evid.md'] if os.path.exists(os.path.join(S, 'rep', p))]
rep = fill('\n'.join(rd(os.path.join('rep', p)) for p in parts))
hoe = fill(rd(os.path.join('rep', 'hoebu_sec.md'))) if os.path.exists(os.path.join(S, 'rep', 'hoebu_sec.md')) else ''
rme = fill(rd(os.path.join('rep', 'README.md')))
left = sorted(set(re.findall(r'@@[A-Z0-9_]+@@', rep + hoe + rme)))
open(os.path.join(S, 'out', 'report.md'), 'w').write(rep)
open(os.path.join(S, 'out', 'hoebu.md'), 'w').write(hoe)
open(os.path.join(S, 'out', 'README.md'), 'w').write(rme)
print('ok', len(rep), len(hoe), len(rme), 'left', left)
