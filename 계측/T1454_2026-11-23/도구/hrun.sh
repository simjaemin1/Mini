#!/bin/bash
# 이어 도는 하네스 줄(T1454 나무) — 목록의 하네스를 하나씩(-j 1) · 끝난 것은 <로그>.done 에 적고 건너뛴다
L=$1; LOG=$2
while [ -e /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1454/hold ]; do sleep 20; done   # 손질 중이면 기다린다
cd /home/claude/t1454
touch "$LOG.done"
for t in $(cat "$L"); do
  grep -qx "$t" "$LOG.done" && continue
  echo "## 시작 $t $(date -u +%FT%TZ) · 머리 $(git rev-parse --short HEAD)" >> "$LOG"
  bash scripts/run-regress.sh -j 1 "$t" >> "$LOG" 2>&1
  echo "$t" >> "$LOG.done"
done
