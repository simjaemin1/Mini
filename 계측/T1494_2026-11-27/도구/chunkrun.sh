#!/bin/bash
# 목록을 25개씩 러너 한 번에 · 끝난 덩이는 <이름>.done 에 적고 건너뜀(이어 도는 꼴) · TMPDIR 없음(브라우저 소켓 길이)
cd /home/claude/t1494
unset TMPDIR
N=$1; LIST=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/$N.txt
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/$N.done
split -l 25 -d $LIST /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/${N}_part_
for p in /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/${N}_part_*; do
  b=$(basename $p)
  grep -qx "$b" /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/$N.done && continue
  bash scripts/run-regress.sh -j 1 $(cat $p) > /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/$b.log 2>&1
  echo "$b" >> /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/$N.done
done
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/$N.fin
