#!/bin/bash
# fast.sh DIR DAYS SEED EVERY [extra env...] — T1308 하네스 조건(빠른 시계 · 가상 시계 · 집 끔 · 캐러밴 0)
D=$1; DAYS=$2; SEED=$3; EV=$4; shift 4; R=/root/minirepo
NO="-r $R/scripts/t650-print.js -r $R/scripts/t1308-bodyprint.js -r $R/scripts/t1340-moment-hook.js"
cd $R && env T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 "$@" NODE_OPTIONS="$NO" node scripts/t1308-long-run.js $DAYS $SEED --every $EV --tag X --dir $D > $D.out 2>&1
echo "exit $?" >> $D.out
