#!/bin/bash
# T1407 판 하나 — 인자: 뿌리(작업 트리) 꼴(server · lab) 팔 시드 날   (T1398 t1398-run.sh 꼴 · 판 자리 /root/t1407runs/<꼴>-<팔>-<시드>/)
#   팔: off(청동 묶음 끔 = main 기본) · bundle(묶음 켬 = T1385_BRONZE_NOCAP · T1398_BRONZE_BAND(수출 주조 포함)) · 그 위 고침 팔 kb(㉡ T1407_ORE_WORTH) · kc(㉢ T1407_FOOD_FIRST) · kbc(둘 다) — 끔 기본 손잡이(㉠ 지도는 회부 — 팔 없음) · b84(묶음 + T1384 고침 둘)
#   관찰기: t1407(주석 장부) · t1398(주조 문 · 무기 줄) · t1385(드묾 · 청동 몫 곁 장부) — t1407 은 맨 뒤에 싣는다(주조 훅 사슬 — 관찰기 머리말)
R=$1; KIND=$2; ARM=$3; SEED=$4; DAYS=$5
D=/root/t1407runs/$KIND-$ARM-$SEED; mkdir -p $D/tmp
cd $R
unset NODE_OPTIONS T1385_BRONZE_NOCAP T1385_BRONZE_NOCAP_ARMORY T1385_BRONZE_NOCAP_TINGATE T1385_BRONZE_NOCAP_WS T1385_BRONZE_NOCAP_POOR T1398_BRONZE_BAND T1333_EXPORT_CAST
unset T1407_ORE_WORTH T1407_FOOD_FIRST T1384_FOOD_KEEP T1384_FOOD_ROUTE T1384_MINE_FOOD T1373_HOME_CAP
case "$ARM" in
  off) ;;
  bundle) export T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1 ;;
  kb) export T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1 T1407_ORE_WORTH=1 ;;
  kc) export T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1 T1407_FOOD_FIRST=1 ;;
  kbc) export T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1 T1407_ORE_WORTH=1 T1407_FOOD_FIRST=1 ;;
  b84) export T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1 T1384_MINE_FOOD=1 ;;   # ⓒ T1384 고침 둘(붙든다 · 길 위를 센다)을 얹은 묶음
  *) echo "팔 모름 $ARM"; exit 2 ;;
esac
export TMPDIR=$D/tmp T699_ROUTE_CACHE=/tmp/durango-route-cache
S=$R/scripts
T0=$(date +%s)
if [ "$KIND" = lab ]; then
  T1407_LAB_OUT=$D/t1407.json T1398_OUT=$D/band.json T1385_LAB_OUT=$D/probe.json T17_JSON=$D/world.json T176_JSON=$D/farm.json LAB_SEEDCACHE=/root/t1407runs/lab-seeds-$SEED.json \
    node -r $S/t1398-observe.js -r $S/t1385-lab-probe.js -r $S/t1407-observe.js scripts/t176-ab.js $DAYS $SEED > $D/run.log 2>&1
elif [ "$KIND" = server ]; then
  export T577_DIR=$D T577_TAG=$ARM VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 T745_VCLOCK=1 T1256_BODY_MS=0
  NODE_OPTIONS="--max-old-space-size=3072 -r $S/t745-vclock.js -r $S/t1398-observe.js -r $S/t1385-observe.js -r $S/t1407-observe.js" \
    node scripts/t577-server-run.js $DAYS $SEED > $D/run.log 2>&1
else exit 2; fi
rc=$?
echo "$(date -u +%FT%TZ) $KIND-$ARM-$SEED rc=$rc $(( $(date +%s)-T0 ))s days=$DAYS $(git -C $R rev-parse --short HEAD) dirty=$(git -C $R status --porcelain | grep -c '^ M')" >> /root/t1407runs/done.txt
find $D/tmp -type f -delete 2>/dev/null
exit $rc
