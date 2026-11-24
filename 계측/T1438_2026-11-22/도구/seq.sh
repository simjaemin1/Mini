#!/bin/bash
# T1438 판 차례(한 판씩 — 하네스와 나란히 = 동시 둘) — 켬 가운데 1020 두 해 · 7 · 42 · lo · hi(계측기) → 끈 판(서버 기준선 1020:400 · 가상 시계) → t17 800날
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1438
cd $D
node chain.js runs6.json 1 > chain_runs6.out 2>&1
cd /home/claude/mini
date -u > $D/ev/기준선1118_끔.txt
node scripts/server-baseline-check.js 계측/서버기준선_2026-11-18.json --vclock --plan 1020:400 >> $D/ev/기준선1118_끔.txt 2>&1; echo "rc=$?" >> $D/ev/기준선1118_끔.txt
date -u > $D/ev/t17.txt
node scripts/t17-metrics.js 800 1020 >> $D/ev/t17.txt 2>&1; echo "rc=$?" >> $D/ev/t17.txt
date -u >> $D/ev/t17.txt
echo done > $D/seq.done
