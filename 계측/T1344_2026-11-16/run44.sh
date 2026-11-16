#!/bin/bash
# T1344 판 — 인자: 뿌리(작업 트리) 판이름 날수 팔 시드 꼴 [관찰기 셋: all(기본) | no44(t1344 빼고 — 관찰기 같음 확인용)]
#   팔: off(끔) · alloy(ⓐ T1333_ALLOY_ORDER) · ab(ⓐ + 병기고 T1344_BRONZE_STOCK) · abm(ⓐ + 병기고 + 섞어 싣기 T1344_MIX_LOAD) ·
#       b(병기고만) · m(섞어 싣기만) · bm(병기고 + 섞어 싣기)
#   꼴: body = 몸 세계(T1293 · T1313 · T1333 판 꼴 — 몸 전부 · 가상 시계 · 몸 표본 10초 · 날 1,440,000 ms · 관찰기 t1243 · t1221 · t1230 · t1256 · t1266 · t1277 · t1293 · t1313 · t1333 · t1344)
#       srv  = 서버 자(서버 기준선 판 조건 — 캐러밴 몸 0 · 집 끔 · 가상 시계 · 날 250 ms(t577 기본) · 관찰기 t1243 · t1256 · t1313 · t1333 · t1344 · 몸 표본 끔)
R=$1; NAME=$2; DAYS=$3; ARM=$4; SEED=${5:-1020}; KIND=${6:-body}; OBS=${7:-all}
S=$R/scripts; W=/root/t1344runs/$NAME-$SEED
mkdir -p $W/tmp
cd $R
unset T1266_ORE_BODY T1271_ORE_CAP T1293_ORE_SAT T1313_SURPLUS_EXPORT T1313_LAMBDA_ZERO T1333_ALLOY_ORDER T1333_EXPORT_CAST T1333_WS_INPUT COPPER_DERIV T1344_BRONZE_STOCK T1344_MIX_LOAD L_CARGO_TWO T1136_BASKET
export TMPDIR=$W/tmp T577_DIR=$W T577_TAG=$NAME VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 T745_VCLOCK=1
X44="-r $S/t1344-observe.js"; [ "$OBS" = "no44" ] && X44=""
case "$KIND" in
  body) export T1244_BODY_MS=10000 T1221_EVERY=10 T1256_BODY_MS=10000 VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity
        PRE="-r $S/t745-vclock.js -r $S/t1243-observe.js -r $S/t1221-observe.js -r $S/t1230-observe.js -r $S/t1256-observe.js -r $S/t1266-observe.js -r $S/t1277-observe.js -r $S/t1293-observe.js -r $S/t1313-observe.js -r $S/t1333-observe.js $X44" ;;
  srv)  export T1256_BODY_MS=0
        PRE="-r $S/t745-vclock.js -r $S/t1243-observe.js -r $S/t1256-observe.js -r $S/t1313-observe.js -r $S/t1333-observe.js $X44" ;;
  *) echo "꼴 모름 $KIND"; exit 2 ;;
esac
case "$ARM" in
  off) ;;
  alloy) export T1333_ALLOY_ORDER=1 ;;
  ab) export T1333_ALLOY_ORDER=1 T1344_BRONZE_STOCK=1 ;;
  abm) export T1333_ALLOY_ORDER=1 T1344_BRONZE_STOCK=1 T1344_MIX_LOAD=1 ;;
  b) export T1344_BRONZE_STOCK=1 ;;
  m) export T1344_MIX_LOAD=1 ;;
  bm) export T1344_BRONZE_STOCK=1 T1344_MIX_LOAD=1 ;;
  *) echo "팔 모름 $ARM"; exit 2 ;;
esac
export NODE_OPTIONS="$PRE"
T0=$(date +%s); node scripts/t577-server-run.js $DAYS $SEED
echo "벽 $(( $(date +%s) - T0 ))초"
