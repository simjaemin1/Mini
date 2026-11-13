#!/bin/bash
# T1293 판 — T1277 판 꼴(몸 전부 · 가상 시계 · 몸 표본 10초) + 관찰기 t1266 · t1277 · t1293 · 인자: 뿌리(작업 트리) 판이름 날수 팔(off|fix|sat) 시드
#   off = 끔 · fix = `T1266_ORE_BODY=1 T1271_ORE_CAP=1`(T1266 + T1271 — main 착지 T1277 자리 고침 든) · sat = fix + `T1293_ORE_SAT=1`
R=$1; NAME=$2; DAYS=$3; ARM=$4; SEED=${5:-1020}
S=$R/scripts; W=/root/t1293runs/$NAME
mkdir -p $W/tmp
cd $R
export TMPDIR=$W/tmp T577_DIR=$W T577_TAG=$NAME T1244_BODY_MS=10000 T1221_EVERY=10 T1256_BODY_MS=10000 VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1
unset T1266_ORE_BODY T1271_ORE_CAP T1293_ORE_SAT
[ "$ARM" = "fix" ] && export T1266_ORE_BODY=1 T1271_ORE_CAP=1
[ "$ARM" = "sat" ] && export T1266_ORE_BODY=1 T1271_ORE_CAP=1 T1293_ORE_SAT=1
PRE="-r $S/t745-vclock.js -r $S/t1243-observe.js -r $S/t1221-observe.js -r $S/t1230-observe.js -r $S/t1256-observe.js -r $S/t1266-observe.js -r $S/t1277-observe.js -r $S/t1293-observe.js"
export NODE_OPTIONS="$PRE"
T0=$(date +%s); node scripts/t577-server-run.js $DAYS $SEED
echo "벽 $(( $(date +%s) - T0 ))초"
