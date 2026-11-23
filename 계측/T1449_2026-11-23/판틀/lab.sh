#!/bin/bash
# T1449 랩 판 하나 — 인자: 나무(cnew|cold|new) 지도(new|old) 팔 시드 날 [뿌리 이름]
TREE=$1; MAP=$2; ARM=$3; SEED=$4; DAYS=$5; ROOTN=${6:-lab-$MAP}
R=/root/t1449w/$TREE; D=/root/t1449runs/$ROOTN/lab-$ARM-$SEED; rm -rf $D; mkdir -p $D/tmp
cd $R; unset NODE_OPTIONS
source /root/t1449runs/armenv.sh
export TMPDIR=$D/tmp T699_ROUTE_CACHE=/tmp/t1449-route-cache-lab-$MAP
S=$R/scripts; OBS="-r $S/t1398-observe.js -r $S/t1385-lab-probe.js"
[ -f $S/t1449-observe.js ] && OBS="$OBS -r $S/t1449-observe.js"
T0=$(date +%s)
T1449_LAB_OUT=$D/t1449.json T1407_LAB_OUT=$D/t1407.json T1398_OUT=$D/band.json T1385_LAB_OUT=$D/probe.json T17_JSON=$D/world.json T176_JSON=$D/farm.json LAB_SEEDCACHE=/root/t1449runs/seeds/lab-seeds-$MAP-$SEED.json \
  node --max-old-space-size=2500 $OBS -r $S/t1407-observe.js scripts/t176-ab.js $DAYS $SEED > $D/run.log 2>&1
rc=$?
echo "$(date -u +%FT%TZ) lab-$ARM-$SEED rc=$rc $(( $(date +%s)-T0 ))s days=$DAYS tree=$TREE $(git -C $R rev-parse --short HEAD)" >> /root/t1449runs/$ROOTN/done.txt
echo "$(date -u +%FT%TZ) $ROOTN/lab-$ARM-$SEED rc=$rc $(( $(date +%s)-T0 ))s" >> /root/t1449runs/done.txt
find $D/tmp -type f -delete 2>/dev/null
exit $rc
