#!/bin/bash
# T1454 — t54 줄이 끝나면 끈 판을 최종 코드 커밋에서 한 번 더(기준선1118_끔_최종)
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1454
while [ ! -e $D/t54.done ]; do sleep 30; done
cd /home/claude/t1454
if ! grep -q "^rc=" $D/ev/기준선1118_끔_최종.txt 2>/dev/null; then
  date -u > $D/ev/기준선1118_끔_최종.txt; git rev-parse --short HEAD >> $D/ev/기준선1118_끔_최종.txt; git status --short -- server public sim | head -20 >> $D/ev/기준선1118_끔_최종.txt
  node scripts/server-baseline-check.js 계측/서버기준선_2026-11-18.json --vclock --plan 1020:400 >> $D/ev/기준선1118_끔_최종.txt 2>&1; echo "rc=$?" >> $D/ev/기준선1118_끔_최종.txt
fi
echo done > $D/t54b.done
