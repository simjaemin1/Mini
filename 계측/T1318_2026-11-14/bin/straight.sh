#!/bin/bash
# straight.sh ROOT DIR DAYS SEED ARM(OFF|COMBO|BODY)  — t1302-run.py 와 같은 판(한 번에 · 마디 없음)
ROOT=$1; D=$2; DAYS=$3; SEED=$4; ARM=$5
case $ARM in OFF) W=0;T=0;F=0;; COMBO) W=1;T=1;F=0;; BODY) W=1;T=1;F=1;; esac
mkdir -p $D/server
H="scripts/t745-vclock.js scripts/t1274-baseline-hook.js scripts/t1302-observe.js scripts/t1243-observe.js scripts/t1221-observe.js scripts/t1230-observe.js scripts/t1251-observe.js scripts/t1274-observe.js"
NO=""; for h in $H; do NO="$NO -r $ROOT/$h"; done
cd $ROOT
env VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 T1244_BODY_MS=10000 T1221_EVERY=10 \
 T577_PAR=1 T577_TAG=run T577_DIR=$D/server T325_WOOD_ACT=$W T1259_WOOD_CAP=0 T1207_TERR_REAL=$T T1238_TERR_V2=$T T1243_FARM_ON=0 T1302_TERR_BODY=$F \
 NODE_OPTIONS="$NO" node scripts/t577-server-run.js $DAYS $SEED > $D/controller.log 2>&1
echo "exit $?" > $D/exit.txt
