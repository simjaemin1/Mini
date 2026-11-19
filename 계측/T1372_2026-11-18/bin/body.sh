#!/bin/bash
# body.sh DIR DAYS SEED EVERY [env..] — T1302 몸 팔(METHODS) · T1308 자
D=$1; DAYS=$2; SEED=$3; EV=$4; shift 4; R=${R:-/home/user/Mini}
H="scripts/t1274-baseline-hook.js scripts/t1302-observe.js scripts/t1274-observe.js scripts/t650-print.js scripts/t1308-bodyprint.js scripts/t1340-moment-hook.js"
NO="$EXTRA_R"; for h in $H; do NO="$NO -r $R/$h"; done
cd $R && env VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 T1244_BODY_MS=10000 T1221_EVERY=10 \
 T325_WOOD_ACT=1 T1259_WOOD_CAP=0 T1207_TERR_REAL=1 T1238_TERR_V2=1 T1243_FARM_ON=0 T1302_TERR_BODY=1 "$@" \
 NODE_OPTIONS="$NO" node scripts/t1308-long-run.js $DAYS $SEED --every $EV --tag B --dir $D > $D.out 2>&1
echo "exit $?" >> $D.out
