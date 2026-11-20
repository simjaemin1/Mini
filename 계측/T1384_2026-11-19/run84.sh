#!/bin/bash
# T1384 서버 자 판 — 인자: 뿌리(작업 트리) 판이름 날수 팔 시드   (T1385 run85.sh 꼴 그대로 · 관찰기에 t1384 를 더함)
#   팔: off(끔) · 고침 팔(keep = T1384_FOOD_KEEP · route = T1384_FOOD_ROUTE · both = T1384_MINE_FOOD 둘 다) · NOOBS=1 = t1384 관찰기를 뺀 판(무섭동 견줌)
#   판 자리 /root/t1384runs/<판이름>-<시드>/ · 판 JSON · 관찰기 JSON(t1243 · t1313 · t1333 · t1344 · t1347 · t1384)
R=$1; NAME=$2; DAYS=$3; ARM=$4; SEED=${5:-1020}
S=$R/scripts; W=/root/t1384runs/$NAME-$SEED
mkdir -p $W/tmp
cd $R
unset T1266_ORE_BODY T1271_ORE_CAP T1293_ORE_SAT T1313_SURPLUS_EXPORT T1313_LAMBDA_ZERO T1333_ALLOY_ORDER T1333_EXPORT_CAST T1333_WS_INPUT COPPER_DERIV T1344_BRONZE_STOCK T1344_MIX_LOAD L_CARGO_TWO T1136_BASKET T1347_FETCH T1347_MIX_DEST T1347_VARIANT
unset T1384_MINE_FOOD T1384_FOOD_KEEP T1384_FOOD_ROUTE
export TMPDIR=$W/tmp T577_DIR=$W T577_TAG=$NAME VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 T745_VCLOCK=1
export T1256_BODY_MS=0; HEAP="--max-old-space-size=3072"
PRE="-r $S/t745-vclock.js -r $S/t1243-observe.js -r $S/t1313-observe.js -r $S/t1333-observe.js -r $S/t1344-observe.js -r $S/t1347-observe.js"
[ "${NOOBS:-0}" = "1" ] || PRE="$PRE -r $S/t1384-observe.js"
case "$ARM" in
  off) ;;
  keep) export T1384_FOOD_KEEP=1 ;;
  route) export T1384_FOOD_ROUTE=1 ;;
  both) export T1384_MINE_FOOD=1 ;;
  *) echo "팔 모름 $ARM"; exit 2 ;;
esac
export NODE_OPTIONS="$HEAP $PRE"
T0=$(date +%s); node scripts/t577-server-run.js $DAYS $SEED
echo "벽 $(( $(date +%s) - T0 ))초 · 작업 트리 $(git -C $R rev-parse --short HEAD) $(git -C $R status --porcelain | grep -c '^ M') 고친 파일 · 팔 $ARM"
