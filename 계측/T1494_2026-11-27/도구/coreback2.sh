#!/bin/bash
# coreback 이어 — 그림 판(webkit3)이 끝난 뒤 멈춤 표지를 걷고 뒤에서부터 다시 집는다(무거운 일 둘까지)
while [ ! -f /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/webkit3.done ]; do sleep 10; done
python3 -c "import os; p='/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/core_out_part_zz.log'; os.path.exists(p) and os.remove(p)"
cd /home/claude/t1494
unset TMPDIR
G=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate
for k in 08 07 06 05 04 03 02 01 00; do
  b=core_out_part_$k
  [ -f $G/$b ] || continue
  grep -qx "$b" $G/core_out.done && break
  ls $G/core_out_part_*.log 2>/dev/null | grep -v mine | grep -q . && break
  echo "$b" >> $G/core_out.done
  bash scripts/run-regress.sh -j 1 $(cat $G/$b) > $G/$b.mine.log 2>&1
  echo "$b" >> $G/core_out.mine
done
touch $G/coreback2.fin
