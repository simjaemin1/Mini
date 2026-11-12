#!/bin/bash
# T1277 판 — T1271 판 꼴(몸 전부 · 라이브 시계 · 시드 1020) + 관찰기 t1266 · t1277 · 인자: 뿌리(작업 트리) 판이름 날수 팔(off|body|fix) [프로파일 날 50,53]
#   off = 끔 · body = `T1266_ORE_BODY=1` · fix = `T1266_ORE_BODY=1 T1271_ORE_CAP=1`(이 카드의 고침이 든 작업 트리에서)
R=$1; NAME=$2; DAYS=$3; ARM=$4; PROF=$5
S=$R/scripts; W=/root/t1277runs/$NAME
mkdir -p $W/tmp
cd $R
export TMPDIR=$W/tmp T577_DIR=$W T577_TAG=$NAME T1244_BODY_MS=10000 T1221_EVERY=10 T1256_BODY_MS=10000 VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1
[ "$ARM" = "body" ] && export T1266_ORE_BODY=1
[ "$ARM" = "fix" ] && export T1266_ORE_BODY=1 T1271_ORE_CAP=1
PRE="-r $S/t745-vclock.js -r $S/t1243-observe.js -r $S/t1221-observe.js -r $S/t1230-observe.js -r $S/t1256-observe.js -r $S/t1266-observe.js -r $S/t1277-observe.js"
if [ -n "$PROF" ]; then export T1277_PROF_DAYS=$PROF; PRE="$PRE -r $S/t1277-prof.js"; fi
export NODE_OPTIONS="$PRE"
T0=$(date +%s); node scripts/t577-server-run.js $DAYS 1020
echo "벽 $(( $(date +%s) - T0 ))초"
