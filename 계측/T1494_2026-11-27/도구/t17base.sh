#!/bin/bash
cd /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/base
for s in 1020 7 42; do node scripts/t17-metrics.js 800 $s > /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/t17/base_$s.txt 2>&1; echo "rc=$?" >> /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/t17/base_$s.txt; done
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/t17/base.done
