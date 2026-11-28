#!/bin/bash
L=/tmp/t1491/log.txt; cd /tmp/wt1491; T=/tmp/t1322/tpl/tpl-t100.db; HK=/tmp/wt1491/scripts/t1491-vel-hook.cjs
echo "start vel $(date -u +%T)" >> $L
node scripts/us-line.js run --dir /tmp/t1491/r/vel --tpl $T --n 1 --nolines --arm vel=2ce164b94:T646_PRELOAD=$HK,T1491_VEL_OUT=/tmp/t1491/vel.json > /tmp/t1491/r/vel.txt 2>&1
echo "done vel rc=$? $(date -u +%T)" >> $L; touch /tmp/t1491/done1
