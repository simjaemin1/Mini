#!/bin/bash
# @regress 전수 — 하네스 하나씩 러너(scripts/run-regress.sh <파일>)로 · 결과를 디스크에 적어 재시작 뒤 이어 간다(끝난 것은 건너뜀)
SP=/tmp/claude-0/-home-user-Mini/b6380702-943a-51e2-9935-6cef2859bf87/scratchpad/t1329; R=/home/user/Mini; L=$SP/regress; mkdir -p $L
cd $R
bash scripts/run-regress.sh --list > $L/list.txt || exit 2
echo "$(date -u +%FT%TZ) start $(wc -l < $L/list.txt) head=$(git rev-parse --short HEAD)" >> $L/run.log
while read f; do
  grep -q "^$f " $L/results.txt 2>/dev/null && continue
  t0=$(date +%s)
  ls -1A /tmp | LC_ALL=C sort > $L/tmp.before
  TMPDIR=/dev/shm bash scripts/run-regress.sh $f > $L/cur.log 2>&1; rc=$?
  # 이 하네스가 /tmp 에 새로 남긴 파일만(앞뒤 목록 차 · 정확한 이름) 지운다 — 디스크가 좁다(하네스 DB wal ~80MB)
  ls -1A /tmp | LC_ALL=C sort > $L/tmp.after
  LC_ALL=C comm -13 $L/tmp.before $L/tmp.after | while read n; do case "$n" in sbc-*|warw-*|t47-*|claude*|cc-*|rclone*) continue;; esac; [ -f "/tmp/$n" ] && rm -f -- "/tmp/$n" && echo "$f /tmp/$n" >> $L/cleaned.txt; done
  t1=$(date +%s)
  tail -n 30 $L/cur.log > $L/$f.tail
  echo "$f $rc $((t1-t0))" >> $L/results.txt
done < $L/list.txt
echo "$(date -u +%FT%TZ) end" >> $L/run.log
