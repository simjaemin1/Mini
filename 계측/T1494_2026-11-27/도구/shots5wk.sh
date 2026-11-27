#!/bin/bash
while [ ! -f /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/final4.done ]; do sleep 10; done
cd /home/claude/t1494
unset TMPDIR
node scripts/t1494-shots.js --out-dir /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/webkit2 --json /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/webkit2.json --browser webkit > /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/webkit2.log 2>&1; echo "rc=$?" >> /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/webkit2.log
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/webkit2.done
