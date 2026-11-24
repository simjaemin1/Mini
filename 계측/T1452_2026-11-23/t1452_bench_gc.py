#!/usr/bin/env python3
# T1452 장부 셈 자 — 긴 첫 셈(1 ms 넘음)이 GC 와 같은 때인가(랩 · `node --trace-gc` 줄의 "<ms> ms: Scavenge|Mark-Compact … a / b ms" 와 셈 시작 시각 t0 견줌)
#   같은 때 = GC 줄 시각이 [t0 − 2, t0 + 셈 길이 + 2] ms 안(줄 시각은 GC 끝 무렵 · 밑은 둘 다 프로세스 시작)
# 쓰는 법: python3 t1452_bench_gc.py <bench.json> <trace-gc 가 든 판 글>
import json, re, sys
d = json.load(open(sys.argv[1]))
G = []
for line in open(sys.argv[2], errors='replace'):
    m = re.search(r'\]\s+([0-9.]+) ms: ([A-Za-z\-\(\) ]+?) [0-9.]+ \(.*?MB, (?:pooled: [0-9.]+ MB, )?([0-9.]+) / ([0-9.]+) ms', line)
    if m: G.append((float(m.group(1)), m.group(2).strip(), float(m.group(3))))
slow = [t for t in d['top'] if t['us'] > 1000]
hit = 0
for t in slow:
    t0 = t['t0']; t1 = t0 + t['us'] / 1000
    if any(t0 - 2 <= g[0] <= t1 + 2 for g in G): hit += 1
out = {'gcEvents': len(G), 'gcMsTotal': round(sum(g[2] for g in G)), 'slowTop': len(slow), 'slowWithGc': hit,
       'slowMin3UnderMs': sum(1 for t in slow if t['usMin3'] < 1000), 'slow1ms': d.get('slow1ms')}
print(json.dumps(out, ensure_ascii=False))
