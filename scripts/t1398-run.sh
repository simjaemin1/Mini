#!/bin/bash
# T1398 판 하나. 판 동시 수 제한은 호출자가 맡는다(최대 둘).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
KIND=$1 ARM=$2 SEED=$3 DAYS=$4
DEST=${T1398_RUNS:-$ROOT/계측/T1398_2026-11-20/runs}/$KIND-$ARM-$SEED
mkdir -p "$DEST/tmp"
cd "$ROOT"
git hash-object sim/economy-sim.js sim/economy-sim-v2.js scripts/t1398-observe.js > "$DEST/source-blobs.txt"
unset NODE_OPTIONS T1385_BRONZE_NOCAP T1385_BRONZE_NOCAP_ARMORY T1385_BRONZE_NOCAP_TINGATE T1385_BRONZE_NOCAP_WS T1385_BRONZE_NOCAP_POOR T1398_BRONZE_BAND T1333_EXPORT_CAST
export T1385_BRONZE_NOCAP=1 T1333_EXPORT_CAST=1
if [ "$ARM" = on ]; then export T1398_BRONZE_BAND=1; fi
export TMPDIR=$DEST/tmp
if [ "$KIND" = lab ]; then
  T1398_OUT=$DEST/band.json T1385_LAB_OUT=$DEST/probe.json T17_JSON=$DEST/world.json T176_JSON=$DEST/farm.json LAB_SEEDCACHE=$DEST/seedcache.json \
    node -r "$ROOT/scripts/t1398-observe.js" -r "$ROOT/scripts/t1385-lab-probe.js" scripts/t176-ab.js "$DAYS" "$SEED" > "$DEST/run.log" 2>&1
elif [ "$KIND" = server ]; then
  export T577_DIR=$DEST T577_TAG=$ARM VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 T745_VCLOCK=1 T1256_BODY_MS=0
  NODE_OPTIONS="--max-old-space-size=3072 -r $ROOT/scripts/t745-vclock.js -r $ROOT/scripts/t1398-observe.js -r $ROOT/scripts/t1385-observe.js" \
    node scripts/t577-server-run.js "$DAYS" "$SEED" > "$DEST/run.log" 2>&1
elif [ "$KIND" = body ]; then
  export T577_DIR=$DEST T577_TAG=$ARM VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 T1244_BODY_MS=10000 T1256_BODY_MS=10000 T1221_EVERY=10 VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity
  # T1315 정본: 집 켬. T1385의 집 끔 몸 판과 조건이 다른 점을 보고에 명시.
  export T400_BUILD_ACT=1
  NODE_OPTIONS="-r $ROOT/scripts/t745-vclock.js -r $ROOT/scripts/t1398-observe.js -r $ROOT/scripts/t1385-observe.js" \
    bash scripts/t1308-guard.sh new "$DAYS" "$SEED" --every 20 --dir "$DEST" --tag "$ARM" > "$DEST/run.log" 2>&1
else
  exit 2
fi
printf 'complete %s %s %s %s\n' "$KIND" "$ARM" "$SEED" "$DAYS" > "$DEST/done.txt"
# 자기 판 scratch만 치운다. 증거 JSON·로그는 DEST에 남긴다.
find "$DEST/tmp" -type f -delete
