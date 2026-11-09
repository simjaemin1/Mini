#!/bin/bash
# 한 단위: <판> <시드> <날> <손잡이…>
cd /home/user/Mini
S=/tmp/claude-0/-home-user-Mini/ea15664f-9124-550c-b32e-7297048e2915/scratchpad/t1234; C=$S/c
arm=$1; seed=$2; days=$3; shift 3
[ -s "$C/$arm-$seed.json" ] && exit 0
echo "== $arm $seed start $(date -u +%H:%M)"
env "$@" T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 T577_DIR=$C T577_TAG=$arm T577_PAR=1 NODE_OPTIONS="-r $PWD/scripts/t745-vclock.js -r $PWD/scripts/t1221-observe.js -r $PWD/scripts/t1230-observe.js" timeout 7000 node scripts/t577-server-run.js $days $seed > $C/$arm-$seed.out 2>&1
echo "== $arm $seed end $(date -u +%H:%M) rc=$?"; find $C -maxdepth 1 -type f -name "$arm-$seed.db*" -delete
