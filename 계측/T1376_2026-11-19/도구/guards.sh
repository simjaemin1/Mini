#!/bin/bash
# 합친 나무(wtf2) 지키기 — 차례로(한 번에 하나)
W=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1376/wtf2
E=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1376/ev
cd $W
node scripts/server-baseline-check.js 계측/서버기준선_2026-11-18.json --vclock --plan 1020:400 > $E/기준선1118_합친나무.txt 2>&1
T1327_ROUTE_FIX=0 node scripts/server-baseline-check.js 계측/서버기준선_2026-11-16.json --vclock --plan 1020:400 > $E/기준선1116_T1327끔_합친나무.txt 2>&1
( time node scripts/t17-metrics.js 800 1020 ) > $E/t17_합친나무.txt 2>&1
echo done > $E/guards.done
