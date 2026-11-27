#!/bin/bash
# 이어 도는 꼴 — 줄(파일)의 하네스를 하나씩 · 끝난 것은 <줄>.done 에 적고 건너뜀
cd /home/claude/t1494
export TMPDIR=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/tmp
L=$1
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/hr/$L.done
while read -r h; do
  [ -z "$h" ] && continue
  grep -q "^$h " /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/hr/$L.done && continue
  s=$(date +%s)
  bash scripts/run-regress.sh -j 1 "$h" > /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/hr/log_$h.txt 2>&1
  rc=$?
  echo "$h $rc $(( $(date +%s) - s ))" >> /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/hr/$L.done
done < /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/hr/$L.txt
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/hr/$L.fin
