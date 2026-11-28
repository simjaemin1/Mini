#!/bin/bash
L=/tmp/t1491/log.txt; cd /tmp/wt1491; T=/tmp/t1322/tpl/tpl-t100.db; HK=/tmp/wt1491/scripts/t1491-vel-hook.cjs
echo "start vel2 $(date -u +%T)" >> $L
T646_WINS=day node scripts/us-line.js run --dir /tmp/t1491/r/vel2 --tpl $T --n 1 --nolines --arm vel2=2ce164b94:T646_PRELOAD=$HK,T1491_VEL_OUT=/tmp/t1491/vel2.json > /tmp/t1491/r/vel2.txt 2>&1
echo "done vel2 rc=$? $(date -u +%T)" >> $L; touch /tmp/t1491/done2
