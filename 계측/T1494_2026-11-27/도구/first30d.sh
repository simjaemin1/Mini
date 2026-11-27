#!/bin/bash
# e2e-first30 — 러너 상한(2,400초)에 걸려 상한 없이 직접(혼자)
cd /home/claude/t1494
unset TMPDIR
s=$(date +%s)
node scripts/e2e-first30.js --out /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/first30_out.json > /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/first30_direct.txt 2>&1
rc=$?
echo "RC=$rc · $(( $(date +%s) - s ))초" >> /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/first30_direct.txt
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/first30d.done
