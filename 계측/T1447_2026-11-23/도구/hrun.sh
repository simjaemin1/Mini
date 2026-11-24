#!/bin/bash
# 이어 도는 하네스 줄 — 목록(파일)의 하네스를 하나씩(-j 1) · 끝난 것은 <로그>.done 에 적고 건너뛴다(상자가 다시 떠도 같은 줄로 다시 부르면 이어 돈다)
#   bash hrun.sh <목록> <로그>
L=$1; LOG=$2
cd /home/claude/mini
touch "$LOG.done"
for t in $(cat "$L"); do
  grep -qx "$t" "$LOG.done" && continue
  echo "## 시작 $t $(date -u +%FT%TZ) · 머리 $(git rev-parse --short HEAD)" >> "$LOG"
  bash scripts/run-regress.sh -j 1 "$t" >> "$LOG" 2>&1
  echo "$t" >> "$LOG.done"
done
