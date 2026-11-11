#!/bin/bash
# T1266 판 — T1256 판 꼴(몸 전부 · 라이브 시계 · 시드 1020) + 관찰기 t1266 · 인자: 판이름 날수 [켬=1]
R=/home/user/Mini; S=$R/scripts; NAME=$1; DAYS=$2; ON=$3
mkdir -p /dev/shm/t1266-$NAME
cd $R
export TMPDIR=/dev/shm T577_DIR=/dev/shm/t1266-$NAME T1244_BODY_MS=10000 T1221_EVERY=10 T1256_BODY_MS=10000 VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1
[ "$ON" = "1" ] && export T1266_ORE_BODY=1
export NODE_OPTIONS="-r $S/t745-vclock.js -r $S/t1243-observe.js -r $S/t1221-observe.js -r $S/t1230-observe.js -r $S/t1256-observe.js -r $S/t1266-observe.js"
T0=$(date +%s); node scripts/t577-server-run.js $DAYS 1020
echo "벽 $(( $(date +%s) - T0 ))초"
