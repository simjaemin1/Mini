#!/bin/bash
cd /root/wt/t1442
run(){ timeout 1000 node 계측/T1442_2026-11-22/판.js $1 $2 $3 $4 /root/wt/r1442/d 900 >> /root/wt/r1442/run.log 2>&1; }
for s in 1020 7 42; do
  run A_${s}_0 $s assault 0 & run A_${s}_1 $s assault 1; wait
  run S_${s}_0 $s siege 0 & run S_${s}_1 $s siege 1; wait
done
echo DONE >> /root/wt/r1442/run.log
