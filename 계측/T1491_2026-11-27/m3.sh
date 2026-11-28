#!/bin/bash
L=/tmp/t1491/log.txt; cd /tmp/wt1491; T=/tmp/t1322/tpl/tpl-t100.db; HK=/tmp/wt1491/scripts/t1491-vel-hook.cjs
echo "start ss1 $(date -u +%T)" >> $L
T646_WINS=day node scripts/us-line.js run --dir /tmp/t1491/r/ss1 --tpl $T --n 1 --nolines --arm ss1=2ce164b94:T646_PRELOAD=$HK,T1491_VEL_OUT=/tmp/t1491/ss1.json,T1491_SS_ONLY=1 > /tmp/t1491/r/ss1.txt 2>&1
echo "done ss1 rc=$? $(date -u +%T)" >> $L; touch /tmp/t1491/done3
