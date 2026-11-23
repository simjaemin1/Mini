#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
DIR="$ROOT/계측/T1465_2026-11-23/ablation/bundle-no-decrement-1020";mkdir -p "$DIR"
export T1465_ORE_STOCK=1 T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1 LAB_SEEDCACHE=/workspace/scratch/t1465-seeds-on.json
export T17_JSON="$DIR/world.json" T176_JSON="$DIR/farm.json" T1465_OBS="$DIR/stock.json" T1385_LAB_OUT="$DIR/probe.json" T1407_LAB_OUT="$DIR/t1407.json" T1398_OUT="$DIR/band.json"
node -r ./scripts/t1465-no-decrement.js -r ./scripts/t1398-observe.js -r ./scripts/t1385-lab-probe.js -r ./scripts/t1407-observe.js -r ./scripts/t1465-observe.js scripts/t176-ab.js 800 1020 > "$DIR/run.log" 2>&1
touch "$DIR/done"
