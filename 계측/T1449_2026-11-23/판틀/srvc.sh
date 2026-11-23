#!/bin/bash
# T1449 서버 판(코드 나무) — 인자: 나무(cnew|cold) 시드 날 팔 [뿌리 이름]
TREE=$1; SEED=$2; DAYS=$3; ARM=$4; ROOTN=${5:-srvarm}
WT=/root/t1449w/$TREE; D=/root/t1449runs/$ROOTN/server-$ARM-$SEED; rm -rf $D; mkdir -p $D/tmp
cd $WT; S=$WT/scripts
source /root/t1449runs/armenv.sh
export VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 SBC_HOOK=1 T577_DIR=$D T577_TAG=sbc T577_PAR=1 T745_VCLOCK=1 T699_ROUTE_CACHE=/tmp/t1449-route-cache-$TREE TMPDIR=$D/tmp
export NODE_OPTIONS="--max-old-space-size=3072 --require $S/t745-vclock.js --require $S/server-baseline-check.js --require $S/t740-side-hook.js --require $S/t1398-observe.js --require $S/t1449-observe.js --require $S/t1407-observe.js"
T0=$(date +%s)
node scripts/t577-server-run.js $DAYS $SEED > $D/run.log 2>&1
rc=$?
echo "$(date -u +%FT%TZ) server-$ARM-$SEED rc=$rc $(( $(date +%s)-T0 ))s days=$DAYS tree=$TREE" >> /root/t1449runs/$ROOTN/done.txt
echo "$(date -u +%FT%TZ) $ROOTN/server-$ARM-$SEED rc=$rc $(( $(date +%s)-T0 ))s" >> /root/t1449runs/done.txt
find $D/tmp -type f -delete 2>/dev/null
exit $rc
