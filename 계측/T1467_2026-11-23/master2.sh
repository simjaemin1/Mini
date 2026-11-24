#!/bin/bash
L=/tmp/t1467/log.txt; W=/tmp/wt1467; M=/tmp/wtm1467; H=ea8c3b77a; T=/tmp/t1322/tpl/tpl-t100.db; HK=/tmp/wt1467/scripts/t1467-touch-hook.cjs; D=/tmp/t1467/d30
while pgrep -f "t646-anatomy.js run inf cnt1" >/dev/null; do sleep 20; done
echo "cnt1 done $(date -u +%T)" >> $L
cd $W
run() { local d=$1; shift; echo "start $d $(date -u +%T)" >> $L; node scripts/us-line.js run --dir /tmp/t1467/r/$d "$@" > /tmp/t1467/r/$d.txt 2>&1; echo "done $d $(date -u +%T)" >> $L; }
run pil --tpl $T --n 2 --nolines --arm base=$H --arm st=$H:T1467_STILL=1 --arm wqst=$H:T1415_WAKEQ=1,T1467_STILL=1
T646_WINS=day run fst --tpl $T --n 1 --nolines --arm fst=$H:T646_PRELOAD=$HK,T1467_FREEZE=stand
T646_WINS=day run fwk --tpl $T --n 1 --nolines --arm fwk=$H:T646_PRELOAD=$HK,T1467_FREEZE=walk
T646_WINS=day run c16 --tpl $T --n 1 --nolines --conf cap16 --arm c16x=$H
T646_WINS=day run x4k --tpl /tmp/t1467/tpl/tpl-x2.52.db --n 1 --nolines --arm x4k=$H
T646_WINS=day run x10k --tpl /tmp/t1467/tpl/tpl-x6.3.db --n 1 --nolines --arm x10k=$H
echo "rulers done $(date -u +%T)" >> $L
job() { local n=$1 wt=$2 seed=$3 port=$4; shift 4
  echo "start $n $(date -u +%T)" >> $L
  ( cd $wt && env "$@" T1278_ROOT=$wt T1294_SEED=$seed T577_PORT_BASE=$port T1322_STAT=$D/$n-%p.stat.json node scripts/t1294/run.cjs $D/$n 30 > $D/$n.log 2>&1 ); local rc=$?
  rm -rf $D/$n/server; echo "done $n rc=$rc $(date -u +%T)" >> $L; }
( job main-1020 $M 1020 48100 X=1; job main-7 $M 7 48100 X=1; job main-42 $M 42 48100 X=1; job off-1020 $W 1020 48100 X=1 ) &
( job st-1020 $W 1020 48200 T1467_STILL=1; job st-7 $W 7 48200 T1467_STILL=1; job st-42 $W 42 48200 T1467_STILL=1; job wqst-1020 $W 1020 48200 T1415_WAKEQ=1 T1467_STILL=1 ) &
wait
for s in 1020 7 42; do echo "== st $s" >> $L; python3 /tmp/t1322/cmp30.py $D/main-$s $D/st-$s $s >> $L 2>&1; done
echo "== off 1020" >> $L; python3 /tmp/t1322/cmp30.py $D/main-1020 $D/off-1020 1020 >> $L 2>&1
echo "== wqst 1020" >> $L; python3 /tmp/t1322/cmp30.py $D/main-1020 $D/wqst-1020 1020 >> $L 2>&1
echo "boards done $(date -u +%T)" >> $L
