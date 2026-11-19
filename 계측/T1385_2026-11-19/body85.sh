#!/bin/bash
# T1385 몸 세계 판 — 이어 도는 판 자(`t1308-long-run.js` · 20날 마디 · 감독 `t1308-guard.sh`) — 인자: 뿌리(작업 트리) 판이름 날수 팔 시드   (body47.sh 꼴 그대로)
#   판 조건 = T1344 · T1347 몸 판(몸 전부 · 가상 시계 · 몸 표본 10초 · 날 1,440,000 ms) · 관찰기 = run85.sh 묶음 + 몸 관찰기(t1221 · t1230 · t1266 · t1277 · t1293)
#   같은 줄을 다시 부르면 progress.json 의 체크포인트 날에서 잇는다 · 끝나면 마디 관찰기 묶기(t1347-segmerge · t1385-segmerge) · 마디 로그 잇기
R=$1; NAME=$2; DAYS=$3; ARM=$4; SEED=${5:-1020}
S=$R/scripts; W=/root/t1385runs/$NAME-$SEED
mkdir -p $W/tmp
cd $R
unset T1266_ORE_BODY T1271_ORE_CAP T1293_ORE_SAT T1313_SURPLUS_EXPORT T1313_LAMBDA_ZERO T1333_ALLOY_ORDER T1333_EXPORT_CAST T1333_WS_INPUT COPPER_DERIV T1344_BRONZE_STOCK T1344_MIX_LOAD L_CARGO_TWO T1136_BASKET T1347_FETCH T1347_MIX_DEST
unset T1385_BRONZE_NOCAP T1385_BRONZE_NOCAP_ARMORY T1385_BRONZE_NOCAP_TINGATE T1385_BRONZE_NOCAP_WS T1385_BRONZE_NOCAP_POOR
export TMPDIR=$W/tmp T577_DIR=$W T577_TAG=$NAME VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 T745_VCLOCK=1
export T1244_BODY_MS=10000 T1221_EVERY=10 T1256_BODY_MS=10000 VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity
PRE="-r $S/t745-vclock.js -r $S/t1243-observe.js -r $S/t1221-observe.js -r $S/t1230-observe.js -r $S/t1256-observe.js -r $S/t1266-observe.js -r $S/t1277-observe.js -r $S/t1293-observe.js -r $S/t1313-observe.js -r $S/t1333-observe.js -r $S/t1385-observe.js -r $S/t1344-observe.js -r $S/t1347-observe.js"
case "$ARM" in
  off) ;;
  nocap) export T1385_BRONZE_NOCAP=1 ;;
  nocapx) export T1385_BRONZE_NOCAP=1 T1333_EXPORT_CAST=1 ;;
  armory) export T1385_BRONZE_NOCAP_ARMORY=1 ;;
  *) echo "팔 모름 $ARM"; exit 2 ;;
esac
export NODE_OPTIONS="$PRE"
T0=$(date +%s)
if [ -f $W/progress.json ]; then bash $S/t1308-guard.sh resume $W; else bash $S/t1308-guard.sh new $DAYS $SEED --every ${EVERY:-20} --dir $W --tag $NAME; fi
rc=$?
done=$(node -e "try{console.log(require('$W/progress.json').done?1:0)}catch(e){console.log(0)}")
if [ "$done" = "1" ]; then
  node $R/scripts/t1347-segmerge.js $W $NAME-$SEED
  node $R/scripts/t1385-segmerge.js $W $NAME-$SEED
  ls $W/seg-*.log 2>/dev/null | sed -E 's/.*seg-([0-9]+)\.log/\1/' | sort -n | while read s; do echo "=== 마디 $s ==="; cat $W/seg-$s.log; done > $W/$NAME-$SEED.log
fi
echo "벽 $(( $(date +%s) - T0 ))초(이번 부름) · 끝 $done · 감독 코드 $rc · 작업 트리 $(git -C $R rev-parse --short HEAD) $(git -C $R status --porcelain | grep -c '^ M') 고친 파일 · 팔 $ARM"
[ "$done" = "1" ]
