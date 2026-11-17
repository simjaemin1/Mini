#!/bin/bash
# T1347 판 — 인자: 뿌리(작업 트리) 판이름 날수 팔 시드 꼴
#   팔: off(끔) · alloy(T1333 합금 발주만 — 발주가 서는 자리) · a(합금 발주 + 받아 올 짐 T1347_FETCH) ·
#       b(합금 발주 + 섞어 싣기 T1344_MIX_LOAD + 목적지 발주만 T1347_MIX_DEST) · ab(a + b) · m(합금 발주 + 섞어 싣기 — 좁히기 전)
#   판정 표 (가) · (나) · (다)는 그 갈래 사본을 박은 작업 트리(`variants.sh`)에서 같은 팔로 돈다(제품 무변 — 사본은 판 자 작업 트리에만).
#   꼴: body = 몸 세계(T1344 판 꼴 그대로 — 몸 전부 · 가상 시계 · 몸 표본 10초 · 날 1,440,000 ms) · srv = 서버 자(서버 기준선 판 조건)
#   관찰기: T1344 판과 같은 셋 + t1347(작업 트리에 있으면 — 받아 올 짐 · 갈래 셈)
R=$1; NAME=$2; DAYS=$3; ARM=$4; SEED=${5:-1020}; KIND=${6:-body}
S=$R/scripts; W=/root/t1347runs/$NAME-$SEED
mkdir -p $W/tmp
cd $R
unset T1266_ORE_BODY T1271_ORE_CAP T1293_ORE_SAT T1313_SURPLUS_EXPORT T1313_LAMBDA_ZERO T1333_ALLOY_ORDER T1333_EXPORT_CAST T1333_WS_INPUT COPPER_DERIV T1344_BRONZE_STOCK T1344_MIX_LOAD L_CARGO_TWO T1136_BASKET T1347_FETCH T1347_MIX_DEST
export TMPDIR=$W/tmp T577_DIR=$W T577_TAG=$NAME VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 T745_VCLOCK=1
X47=""; [ -f $S/t1347-observe.js ] && X47="-r $S/t1347-observe.js"
case "$KIND" in
  body) export T1244_BODY_MS=10000 T1221_EVERY=10 T1256_BODY_MS=10000 VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity
        PRE="-r $S/t745-vclock.js -r $S/t1243-observe.js -r $S/t1221-observe.js -r $S/t1230-observe.js -r $S/t1256-observe.js -r $S/t1266-observe.js -r $S/t1277-observe.js -r $S/t1293-observe.js -r $S/t1313-observe.js -r $S/t1333-observe.js -r $S/t1344-observe.js $X47" ;;
  srv)  export T1256_BODY_MS=0
        PRE="-r $S/t745-vclock.js -r $S/t1243-observe.js -r $S/t1256-observe.js -r $S/t1313-observe.js -r $S/t1333-observe.js -r $S/t1344-observe.js $X47" ;;
  *) echo "꼴 모름 $KIND"; exit 2 ;;
esac
case "$ARM" in
  off) ;;
  alloy) export T1333_ALLOY_ORDER=1 ;;
  a) export T1333_ALLOY_ORDER=1 T1347_FETCH=1 ;;
  b) export T1333_ALLOY_ORDER=1 T1344_MIX_LOAD=1 T1347_MIX_DEST=1 ;;
  ab) export T1333_ALLOY_ORDER=1 T1347_FETCH=1 T1344_MIX_LOAD=1 T1347_MIX_DEST=1 ;;
  m) export T1333_ALLOY_ORDER=1 T1344_MIX_LOAD=1 ;;
  *) echo "팔 모름 $ARM"; exit 2 ;;
esac
export NODE_OPTIONS="$PRE"
T0=$(date +%s); node scripts/t577-server-run.js $DAYS $SEED
echo "벽 $(( $(date +%s) - T0 ))초 · 작업 트리 $(git -C $R rev-parse --short HEAD) $(git -C $R status --porcelain | grep -c '^ M') 고친 파일"
