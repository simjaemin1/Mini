#!/bin/bash
# T1454 판 — T1447 지키기 줄 둘이 끝난 뒤(동시 둘) · 400날 세 시드 켬(낡음) ± 느려짐 · 끔 · 두 해 추상 노후 끔 갈래 · 끈 판(이 가지 나무)
S=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad; D=$S/t1454; T47=$S/t1447
while [ ! -e $T47/s1.done ] || [ ! -e $T47/s2.done ]; do sleep 30; done
cd $D && T1438_ROOT=/home/claude/t1454 node chain.js runs1.json 2 >> $D/runs1.log 2>&1
cd /home/claude/t1454
if ! grep -q "^rc=" $D/ev/기준선1118_끔.txt 2>/dev/null; then
  date -u > $D/ev/기준선1118_끔.txt; git rev-parse --short HEAD >> $D/ev/기준선1118_끔.txt; git status --short | head -20 >> $D/ev/기준선1118_끔.txt
  node scripts/server-baseline-check.js 계측/서버기준선_2026-11-18.json --vclock --plan 1020:400 >> $D/ev/기준선1118_끔.txt 2>&1; echo "rc=$?" >> $D/ev/기준선1118_끔.txt
fi
echo done > $D/p1.done
