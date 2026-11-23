#!/bin/bash
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1438
cd /home/claude/mini
date -u > $D/ev/게이트_번들.txt; node sim/build-econ-bundle.js --check >> $D/ev/게이트_번들.txt 2>&1; echo "rc=$?" >> $D/ev/게이트_번들.txt
date -u > $D/ev/게이트_인라인.txt; node sim/inline-engine.js --check >> $D/ev/게이트_인라인.txt 2>&1; echo "rc=$?" >> $D/ev/게이트_인라인.txt
date -u > $D/ev/게이트_배선.txt; node scripts/lab-wiring-check.js >> $D/ev/게이트_배선.txt 2>&1; echo "rc=$?" >> $D/ev/게이트_배선.txt
echo done > $D/gates.done
