#!/bin/bash
# T1314 긴 판 — T1293 판 꼴(몸 전부 · 가상 시계 · 캐러밴 0 · 집 행위 0 · 하루 1,440,000ms) + 날 관찰(모양 · 하루 CPU)만. 인자: 뿌리 출력 날수 시드 포트
R=$1; OUT=$2; DAYS=$3; SEED=${4:-1020}; PORT=${5:-47100}
mkdir -p $OUT/tmp; cd $R
export TMPDIR=$OUT/tmp T577_DIR=$OUT T577_PORT_BASE=$PORT VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 T1314_ROOT=$R T1314_DAY=$OUT/day.jsonl
export NODE_OPTIONS="-r $R/scripts/t745-vclock.js -r $R/scripts/t1314/day-hook.cjs"
T0=$(date +%s); node scripts/t577-server-run.js $DAYS $SEED > $OUT/run.log 2>&1; echo "rc=$? 벽 $(( $(date +%s) - T0 ))초" >> $OUT/run.log
