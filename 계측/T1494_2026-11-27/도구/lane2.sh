#!/bin/bash
# lane 2 — t17(머리) · 게이트 셋 · 옛 코드 빨강 · CI 표 · 판 스물 · 그림(webkit · chromium)
cd /home/claude/t1494
export TMPDIR=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/tmp
while [ ! -f /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/t17/base.done ]; do sleep 10; done
for s in 1020 7 42; do node scripts/t17-metrics.js 800 $s > /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/t17/head_$s.txt 2>&1; echo "rc=$?" >> /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/t17/head_$s.txt; done
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/t17/head.done
{ echo '--- build-econ-bundle --check'; node sim/build-econ-bundle.js --check; echo "rc=$?"; echo '--- inline-engine --check'; node sim/inline-engine.js --check; echo "rc=$?"; echo '--- lab-wiring-check'; node scripts/lab-wiring-check.js; echo "rc=$?"; } > /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/gates.txt 2>&1
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/gates.done
OUT=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/옛코드빨강.txt TIMEOUT_SEC=600 bash scripts/pm-old-code-red.sh 2502f2825 scripts/test-t1494-grudge-ui.js > /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/oldred.log 2>&1; echo "rc=$?" >> /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/oldred.log
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/gate/oldred.done
for n in $(seq 1 20); do
  if [ $((n % 5)) -eq 0 ]; then extra="--restart --day-ms 6000"; else extra=""; fi
  node scripts/t1494-cycle-run.js --out /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/runs/run$n.json --run $n $extra > /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/runs/run$n.log 2>&1
  echo "rc=$?" >> /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/runs/run$n.log
done
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/runs/all.done
node scripts/t1494-shots.js --out-dir /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/webkit --json /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/webkit.json --browser webkit > /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/webkit.log 2>&1; echo "rc=$?" >> /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/webkit.log
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/webkit.done
node scripts/t1494-shots.js --out-dir /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/final --json /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/final.json --browser chromium > /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/final.log 2>&1; echo "rc=$?" >> /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/final.log
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/final.done
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/lane2.done
