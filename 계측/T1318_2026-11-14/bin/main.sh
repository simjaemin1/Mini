#!/bin/bash
# main.sh SEED ARM — T1302 METHODS 팔 그대로 · T1308 자(--every 10 · 감독) · 100날 · 새 세계
SEED=$1; ARM=$2; R=/root/minirepo
case $ARM in OFF) W=0;T=0;F=0;; COMBO) W=1;T=1;F=0;; BODY) W=1;T=1;F=1;; esac
H="scripts/t1274-baseline-hook.js scripts/t1302-observe.js scripts/t1243-observe.js scripts/t1221-observe.js scripts/t1230-observe.js scripts/t1251-observe.js scripts/t1274-observe.js"
NO=""; for h in $H; do NO="$NO -r $R/$h"; done
cd $R
env VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 T1244_BODY_MS=10000 T1221_EVERY=10 \
 T325_WOOD_ACT=$W T1259_WOOD_CAP=0 T1207_TERR_REAL=$T T1238_TERR_V2=$T T1243_FARM_ON=0 T1302_TERR_BODY=$F \
 NODE_OPTIONS="$NO" bash scripts/t1308-guard.sh new 100 $SEED --every 10 --tag $ARM --dir /tmp/t1318/$ARM-$SEED > /tmp/t1318/$ARM-$SEED.guard.out 2>&1
echo "exit $?" > /tmp/t1318/$ARM-$SEED.exit
