#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
CARD="$ROOT/계측/T1465_2026-11-23/eq"
for SEED in 1020 7 42; do
 for ARM in off bundle; do
  DIR="$CARD/$ARM-$SEED"; SNAPS="$CARD/snapshots/$ARM-$SEED";mkdir -p "$DIR" "$SNAPS"
  SNAP="$SNAPS/lab-hanbando-$SEED-d1900.v8.gz"
  if [ -f "$DIR/done" ];then continue;fi
  if ! mkdir "$DIR/.running" 2>/dev/null;then continue;fi
  unset T1465_ORE_STOCK T1465_ATTACH T1420_LOAD T1420_ALLOW_STALE NODE_OPTIONS T1385_BRONZE_NOCAP T1398_BRONZE_BAND T1385_LAB_OUT T1407_LAB_OUT T1398_OUT T1465_OBS
  if [ "$ARM" = bundle ];then export T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1;fi
  if [ "$ARM-$SEED" = off-1020 ] && [ ! -f "$SNAP" ];then
   cp /workspace/scratch/t1465-eq/lab-hanbando-1020-d1900.v8.gz "$SNAP"
   cp /workspace/scratch/t1465-eq/lab-hanbando-1020-d1900.v8.gz.meta.json "$SNAP.meta.json"
  fi
  if [ ! -f "$SNAP" ];then
   T1420_EQ=1 T1420_SAVE_AT=1900 T1420_SAVE_DIR="$SNAPS" T17_JSON="$DIR/make-world.json" LAB_SEEDCACHE=/workspace/scratch/t1465-seeds-on.json T1465_OBS="$DIR/make-stock.json" \
    npx --yes --package=node@22.23.4 node -r ./scripts/t1465-observe.js scripts/t17-metrics.js 1900 "$SEED" > "$DIR/make.log" 2>&1
  fi
  NODE_OPTIONS="--require $ROOT/scripts/t1465-eq-observe.js" LAB_SEEDCACHE=/workspace/scratch/t1465-seeds-on.json \
   npx --yes --package=node@22.23.4 node scripts/eq-run.js --seed "$SEED" --from "$SNAP" --days 730 --allow-stale --par 1 --arm stock=T1465_ORE_STOCK=1 --out "$DIR/continuation" > "$DIR/eq.log" 2>&1
  npx --yes --package=node@22.23.4 node -e 'const r=require(process.argv[1]);require("assert")(r.arms.length===2&&r.arms.every(a=>a.code===0&&a.days===730),"Incomplete equilibrium arm");' "$DIR/continuation/eq-run.json"
  touch "$DIR/done"
  rmdir "$DIR/.running"
 done
done
