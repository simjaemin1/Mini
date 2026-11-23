#!/bin/bash
# core 하네스 전부(ci-class --core) — 차례로 · 하나씩 · 결과 한 줄씩
cd /root/t1449w/cnew
OUT=/root/t1449runs/core; mkdir -p $OUT; : > $OUT/done.txt
T0=$(date +%s)
for t in $(node scripts/ci-class.js --core); do
  t1=$(date +%s); timeout 600 node scripts/$t > $OUT/$t.log 2>&1; rc=$?
  echo "$t rc=$rc $(( $(date +%s)-t1 ))s" >> $OUT/done.txt
done
echo "ALL $(( $(date +%s)-T0 ))s fail=$(grep -vc ' rc=0 ' $OUT/done.txt)" >> $OUT/done.txt
echo "$(date -u +%FT%TZ) core rc=0 $(( $(date +%s)-T0 ))s" >> /root/t1449runs/done.txt
