#!/bin/bash
unset TMPDIR
while [ ! -f /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/hr/lineB.fin ]; do sleep 20; done
cd /home/claude/t1494
cat /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/hr/lineA.done /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/hr/lineB.done | awk '$2!=0{print $1}' > /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/rerun.txt
bash /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/tools/chunkrun.sh rerun
bash /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/tools/chunkrun.sh core_out
bash /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/tools/chunkrun.sh srv_out
bash scripts/run-regress.sh -j 1 e2e-first30.js > /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/first30_runner.log 2>&1
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/post1.done
