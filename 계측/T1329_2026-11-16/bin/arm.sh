#!/bin/bash
# arm.sh TREE SEED ARM  — T1318 main.sh 꼴 · T1308 자(--every 10 · 감독) · 100날 · 새 세계
# ARM: OFF | DIAG(카드 묶음 + T1302) | FIX(카드 묶음 + T1302 + T1329)
R=$1; SEED=$2; ARM=$3; RUNS=${RUNS:-/dev/shm/t1329/runs}; mkdir -p $RUNS
for k in $(env | grep -oE '^(T[0-9]+_[A-Z0-9_]+|VILLAGE_[A-Z_]+)'); do unset $k; done
case $ARM in
 OFF)  K="";;
 DIAG) K="T325_WOOD_ACT=1 T1207_TERR_REAL=1 T1238_TERR_V2=1 T1283_WOOD_DEMAND=1 T1297_BIRTH_FOOD=1 T1306_MIGRATE_FOOD=1 T1302_TERR_BODY=1 T1329_OBS=1";;
 FIX)  K="T325_WOOD_ACT=1 T1207_TERR_REAL=1 T1238_TERR_V2=1 T1283_WOOD_DEMAND=1 T1297_BIRTH_FOOD=1 T1306_MIGRATE_FOOD=1 T1302_TERR_BODY=1 T1329_TERR_CREW=1 T1329_OBS=1";;
 FIXB) K="T325_WOOD_ACT=1 T1207_TERR_REAL=1 T1238_TERR_V2=1 T1302_TERR_BODY=1 T1329_TERR_CREW=1 T1329_OBS=1";;   # T1318 몸 팔(BODY) 그대로 + T1329
 *) echo bad arm; exit 2;;
esac
H="scripts/t1274-baseline-hook.js scripts/t1302-observe.js scripts/t1243-observe.js scripts/t1221-observe.js scripts/t1230-observe.js scripts/t1251-observe.js scripts/t1274-observe.js"
[ -f $R/scripts/t1329-observe.js ] && H="$H scripts/t1329-observe.js"
NO=""; for h in $H; do NO="$NO -r $R/$h"; done
cd $R
env VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 T1244_BODY_MS=10000 T1221_EVERY=10 \
 T1259_WOOD_CAP=0 T1243_FARM_ON=0 $K \
 NODE_OPTIONS="$NO" TMPDIR=/dev/shm bash scripts/t1308-guard.sh new ${DAYS:-100} $SEED --every ${EVERY:-10} --tag $ARM --dir $RUNS/$ARM$SFX-$SEED > $RUNS/$ARM$SFX-$SEED.guard.out 2>&1
echo "exit $?" > $RUNS/$ARM$SFX-$SEED.exit
