#!/bin/bash
# T1454 — 판 하나가 끝나 자리가 나면(HD0_42) 게이트 셋 · t17(800날) · 이 가지 나무
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1454
while ! python3 -c "import json,sys; j=json.load(open('$D/status_runs1.json')); sys.exit(0 if any(d['tag']=='HD0_42' for d in j['done']) else 1)"; do sleep 20; done
cd /home/claude/t1454
date -u > $D/ev/게이트_번들.txt; node sim/build-econ-bundle.js --check >> $D/ev/게이트_번들.txt 2>&1; echo "rc=$?" >> $D/ev/게이트_번들.txt
date -u > $D/ev/게이트_인라인.txt; node sim/inline-engine.js --check >> $D/ev/게이트_인라인.txt 2>&1; echo "rc=$?" >> $D/ev/게이트_인라인.txt
date -u > $D/ev/게이트_배선.txt; node scripts/lab-wiring-check.js >> $D/ev/게이트_배선.txt 2>&1; echo "rc=$?" >> $D/ev/게이트_배선.txt
date -u > $D/ev/t17.txt; node scripts/t17-metrics.js 800 1020 >> $D/ev/t17.txt 2>&1; echo "rc=$?" >> $D/ev/t17.txt; date -u >> $D/ev/t17.txt
echo done > $D/gates54.done
