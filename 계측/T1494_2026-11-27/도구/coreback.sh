#!/bin/bash
# core 중 만진 밖 — 뒤에서부터 덩이를 미리 집어(core_out.done 에 먼저 적어 post1 의 chunkrun 이 건너뛰게) 돌린다 · post1 이 core 를 시작하면(앞 덩이 로그가 서면) 새로 안 집는다
cd /home/claude/t1494
unset TMPDIR
G=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate
touch $G/core_out.done
for k in 10 09 08 07 06 05 04 03 02 01 00; do
  b=core_out_part_$k
  [ -f $G/$b ] || continue
  grep -qx "$b" $G/core_out.done && break
  ls $G/core_out_part_*.log 2>/dev/null | grep -v mine | grep -q . && break
  echo "$b" >> $G/core_out.done
  bash scripts/run-regress.sh -j 1 $(cat $G/$b) > $G/$b.mine.log 2>&1
  echo "$b" >> $G/core_out.mine
done
touch $G/coreback.fin
