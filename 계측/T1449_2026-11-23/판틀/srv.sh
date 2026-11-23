#!/bin/bash
# T1449 서버 판 하나 — 인자: 지도(new|old) 시드 날 꼬리표 [흔들림 "마을:칸:수"] [더 env "K=V K=V"]
MAP=$1; SEED=$2; DAYS=$3; TAG=$4; NUDGE=$5; EXTRA=$6
WT=/root/t1449w/$MAP
D=/root/t1449runs/srv-$MAP-$SEED-$TAG; rm -rf $D; mkdir -p $D/tmp
cd $WT
S=$WT/scripts
export VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 SBC_HOOK=1 T577_DIR=$D T577_TAG=sbc T577_PAR=1 T745_VCLOCK=1 T699_ROUTE_CACHE=/tmp/t1449-route-cache-$MAP TMPDIR=$D/tmp
export T1449_CURVE_OUT=$D/curve.json
[ -n "$NUDGE" ] && export T1449_NUDGE="$NUDGE"
for kv in $EXTRA; do export "$kv"; done
export NODE_OPTIONS="--max-old-space-size=3072 --require $S/t745-vclock.js --require $S/server-baseline-check.js --require $S/t740-side-hook.js --require /root/minirepo/scripts/t1449-vil-curve.cjs"
T0=$(date +%s)
node scripts/t577-server-run.js $DAYS $SEED > $D/run.log 2>&1
rc=$?
echo "$(date -u +%FT%TZ) srv-$MAP-$SEED-$TAG rc=$rc $(( $(date +%s)-T0 ))s days=$DAYS nudge=$NUDGE extra=$EXTRA" >> /root/t1449runs/done.txt
find $D/tmp -type f -delete 2>/dev/null
exit $rc
