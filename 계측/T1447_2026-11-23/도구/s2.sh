#!/bin/bash
# 줄 2 — 만진 (가)(나) → core 중 만진 밖 → 30 % 판(chain · 끝난 판 건너뜀) → 끈 판 다시(최종 코드 나무)
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1447
bash $D/hrun.sh $D/L_touch_B.txt $D/ev/h2_만진_B.txt
bash $D/hrun.sh $D/L_core_only.txt $D/ev/h2_core.txt
cd $D && node chain.js runs5.json 1 >> $D/runs5.log 2>&1
cd /home/claude/mini
if ! grep -q "^rc=" $D/ev/기준선1118_끔_최종.txt 2>/dev/null; then
  date -u > $D/ev/기준선1118_끔_최종.txt; git rev-parse --short HEAD >> $D/ev/기준선1118_끔_최종.txt; git status --short | head -20 >> $D/ev/기준선1118_끔_최종.txt
  node scripts/server-baseline-check.js 계측/서버기준선_2026-11-18.json --vclock --plan 1020:400 >> $D/ev/기준선1118_끔_최종.txt 2>&1; echo "rc=$?" >> $D/ev/기준선1118_끔_최종.txt
fi
echo done > $D/s2.done
