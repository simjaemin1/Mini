#!/bin/bash
# 끈 판(기준선 11-16 · --vclock --plan 1020:400) · 랩 t17 — 손잡이 env 다 비우고 · 나무 $1(기본 fix1)
T=/dev/shm/t1329/${1:-fix1}; D=/dev/shm/t1329/runs/GATE; mkdir -p $D; cd $T
for k in $(env | grep -oE '^(T[0-9]+_[A-Z0-9_]+|VILLAGE_[A-Z_]+)'); do unset $k; done
TMPDIR=/dev/shm node scripts/server-baseline-check.js 계측/서버기준선_2026-11-16.json --vclock --plan 1020:400 > $D/gate.log 2>&1; echo "exit $?" > $D/gate.exit
TMPDIR=/dev/shm node scripts/t17-metrics.js 800 1020 > $D/t17.log 2>&1; echo "exit $?" > $D/t17.exit
cp $D/gate.log $D/gate.exit $D/t17.log $D/t17.exit /tmp/claude-0/-home-user-Mini/b6380702-943a-51e2-9935-6cef2859bf87/scratchpad/t1329/ 2>/dev/null
