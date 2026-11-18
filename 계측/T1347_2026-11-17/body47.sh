#!/bin/bash
# T1347 몸 세계 판 — 이어 도는 판 자(`t1308-long-run.js` · 20날 마디 · 감독 `t1308-guard.sh`)로 돈다 — 인자: 뿌리(작업 트리) 판이름 날수 팔 시드
#   ★왜: 컨테이너가 판 도중에 다시 선다(11-17 23:45Z · 11-18 01:17Z — 몸 판 100날 한 판 = 3 ~ 4 시간) — 한 번에 도는 판(run47.sh body)은 처음부터였다.
#     마디 판은 마지막 마디 체크포인트에서 잇는다(끊긴 판 = 안 끊긴 판 · 같은 마디 경계 — T1308 §2). 몸 판 넷 팔(끔 · ⓐ · ⓑ · ⓐ + ⓑ)이 다 같은 마디(20날)다
#     — 한 번에 돈 몸 판(T1344)과 바이트로 견주지 않는다(끊고 이은 판 ≠ 한 번에 돈 판 — T1340).
#   판 조건 · 관찰기 · 팔은 run47.sh 의 body 꼴 그대로. 같은 줄을 다시 부르면 progress.json 의 체크포인트 날에서 잇는다.
#   끝나면: 관찰기 마디 조각 묶기(`t1347-segmerge.js`) · 마디 로그 잇기(<판>-<시드>.log)
R=$1; NAME=$2; DAYS=$3; ARM=$4; SEED=${5:-1020}
S=$R/scripts; W=/root/t1347runs/$NAME-$SEED; MR=/root/minirepo
mkdir -p $W/tmp
cd $R
unset T1266_ORE_BODY T1271_ORE_CAP T1293_ORE_SAT T1313_SURPLUS_EXPORT T1313_LAMBDA_ZERO T1333_ALLOY_ORDER T1333_EXPORT_CAST T1333_WS_INPUT COPPER_DERIV T1344_BRONZE_STOCK T1344_MIX_LOAD L_CARGO_TWO T1136_BASKET T1347_FETCH T1347_MIX_DEST
export TMPDIR=$W/tmp T577_DIR=$W T577_TAG=$NAME VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 T745_VCLOCK=1
export T1244_BODY_MS=10000 T1221_EVERY=10 T1256_BODY_MS=10000 VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity
X47=""; [ -f $S/t1347-observe.js ] && X47="-r $S/t1347-observe.js"
PRE="-r $S/t745-vclock.js -r $S/t1243-observe.js -r $S/t1221-observe.js -r $S/t1230-observe.js -r $S/t1256-observe.js -r $S/t1266-observe.js -r $S/t1277-observe.js -r $S/t1293-observe.js -r $S/t1313-observe.js -r $S/t1333-observe.js -r $S/t1344-observe.js $X47"
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
T0=$(date +%s)
if [ -f $W/progress.json ]; then bash $S/t1308-guard.sh resume $W; else bash $S/t1308-guard.sh new $DAYS $SEED --every ${EVERY:-20} --dir $W --tag $NAME; fi
rc=$?
done=$(node -e "try{console.log(require('$W/progress.json').done?1:0)}catch(e){console.log(0)}")
if [ "$done" = "1" ]; then
  node $MR/scripts/t1347-segmerge.js $W $NAME-$SEED
  ls $W/seg-*.log 2>/dev/null | sed -E 's/.*seg-([0-9]+)\.log/\1/' | sort -n | while read s; do echo "=== 마디 $s ==="; cat $W/seg-$s.log; done > $W/$NAME-$SEED.log
fi
echo "벽 $(( $(date +%s) - T0 ))초(이번 부름) · 끝 $done · 감독 코드 $rc · 작업 트리 $(git -C $R rev-parse --short HEAD) $(git -C $R status --porcelain | grep -c '^ M') 고친 파일 · 마디 $(node -e "try{const p=require('$W/progress.json');console.log(p.segs.map(s=>s.from+'→'+s.to+' '+s.sec+'초').join(' · '))}catch(e){}")"
[ "$done" = "1" ]
