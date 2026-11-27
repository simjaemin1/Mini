#!/bin/bash
# T1454 끈 판 — 최종 코드 커밋(하네스 줄 하나와 나란히 — 판 둘까지)
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1454
cd /home/claude/t1454
O=$D/base_final.tmp
date -u > $O; git rev-parse --short HEAD >> $O; git status --short -- server public sim | head -20 >> $O
node scripts/server-baseline-check.js 계측/서버기준선_2026-11-18.json --vclock --plan 1020:400 >> $O 2>&1; echo "rc=$?" >> $O
mv $O $D/ev/기준선1118_끔_최종.txt
echo done > $D/base_final.done
