#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
CARD="$ROOT/계측/T1465_2026-11-23/long"
for STOCK in ${T1465_LONG_STOCKS:-off on}; do
 DIR="$CARD/bundle-$STOCK-42";mkdir -p "$DIR"
 if [ -f "$DIR/done" ];then continue;fi
 unset T1465_ORE_STOCK T1420_EQ T1420_LOAD T1420_SAVE_AT
 if [ "$STOCK" = on ];then export T1465_ORE_STOCK=1 T1465_EMPTY_WATCH=1;fi
 export T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1
 export LAB_SEEDCACHE=/workspace/scratch/t1465-seeds-on.json T17_JSON="$DIR/world.json" T1465_OBS="$DIR/stock.json" T1385_LAB_OUT="$DIR/probe.json"
 npx --yes --package=node@22.23.4 node -r ./scripts/t1385-lab-probe.js -r ./scripts/t1465-observe.js scripts/t17-metrics.js 10950 42 > "$DIR/run.log" 2>&1
 touch "$DIR/done"
done
