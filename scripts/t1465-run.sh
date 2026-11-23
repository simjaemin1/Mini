#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
CARD="$ROOT/계측/T1465_2026-11-23"
for SEED in 1020 7 42; do
 for ARM in off bundle; do
  DIR="$CARD/runs/lab-$ARM-$SEED"; mkdir -p "$DIR"
  if [ -f "$DIR/done" ]; then continue; fi
  export T1465_ORE_STOCK=1 T1465_OBS="$DIR/stock.json" T1407_LAB_OUT="$DIR/t1407.json" T1385_LAB_OUT="$DIR/probe.json" T1398_OUT="$DIR/band.json"
  export T17_JSON="$DIR/world.json" T176_JSON="$DIR/farm.json" LAB_SEEDCACHE=/workspace/scratch/t1465-seeds-on.json
  unset T1385_BRONZE_NOCAP T1398_BRONZE_BAND
  if [ "$ARM" = bundle ]; then export T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1; fi
  node -r ./scripts/t1398-observe.js -r ./scripts/t1385-lab-probe.js -r ./scripts/t1407-observe.js -r ./scripts/t1465-observe.js scripts/t176-ab.js 800 "$SEED" > "$DIR/run.log" 2>&1
  touch "$DIR/done"
 done
done
