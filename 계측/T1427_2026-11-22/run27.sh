#!/bin/bash
# T1427 판 하나 — 인자: 뿌리(작업 트리) 지도(old = main 정본 · new = 이 가지 정본) 꼴(lab · t17) 팔 시드 날
#   (T1407 run07.sh 꼴 · 판 자리 /root/t1427runs/<지도>-<꼴>-<팔>-<시드>/)
#   팔: off(청동 묶음 끔 = main 기본) · bundle(묶음 켬 = T1385_BRONZE_NOCAP · T1398_BRONZE_BAND(수출 주조 포함) — T1407 §7 의 "상한을 걷은 판")
#   lab = 두 해 랩(t176-ab · 800날) + 관찰기 셋(t1398 주조 문 · t1385 드묾 곁 장부 · t1407 주석 장부 — t1407 은 맨 뒤)
#   t17 = 랩 기준선 자(t17-metrics · 여덟 수 · 손잡이 없음)
#   ⚠시딩 캐시는 지도마다 따로(lab-seeds-<지도>-<시드>.json) — 옛 지도 캐시를 새 지도 판이 물려받으면 마을 땅이 옛 지도다.
R=$1; MAP=$2; KIND=$3; ARM=$4; SEED=$5; DAYS=$6
D=/root/t1427runs/$MAP-$KIND-$ARM-$SEED; mkdir -p $D/tmp
cd $R
unset NODE_OPTIONS T1385_BRONZE_NOCAP T1385_BRONZE_NOCAP_ARMORY T1385_BRONZE_NOCAP_TINGATE T1385_BRONZE_NOCAP_WS T1385_BRONZE_NOCAP_POOR T1398_BRONZE_BAND T1333_EXPORT_CAST
unset T1407_ORE_WORTH T1407_FOOD_FIRST T1384_FOOD_KEEP T1384_FOOD_ROUTE T1384_MINE_FOOD T1373_HOME_CAP T1363_FAMINE_TOOLS T17_JSON
case "$ARM" in
  off) ;;
  bundle) export T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1 ;;
  *) echo "팔 모름 $ARM"; exit 2 ;;
esac
export TMPDIR=$D/tmp T699_ROUTE_CACHE=/tmp/durango-route-cache
S=$R/scripts
T0=$(date +%s)
if [ "$KIND" = lab ]; then
  T1407_LAB_OUT=$D/t1407.json T1398_OUT=$D/band.json T1385_LAB_OUT=$D/probe.json T17_JSON=$D/world.json T176_JSON=$D/farm.json LAB_SEEDCACHE=/root/t1427runs/lab-seeds-$MAP-$SEED.json \
    node -r $S/t1398-observe.js -r $S/t1385-lab-probe.js -r $S/t1407-observe.js scripts/t176-ab.js $DAYS $SEED > $D/run.log 2>&1
elif [ "$KIND" = t17 ]; then
  T17_JSON=$D/t17.json node scripts/t17-metrics.js $DAYS $SEED > $D/run.log 2>&1
else exit 2; fi
rc=$?
echo "$(date -u +%FT%TZ) $MAP-$KIND-$ARM-$SEED rc=$rc $(( $(date +%s)-T0 ))s days=$DAYS $(git -C $R rev-parse --short HEAD) dirty=$(git -C $R status --porcelain | grep -c '^ M')" >> /root/t1427runs/done.txt
find $D/tmp -type f -delete 2>/dev/null
exit $rc
