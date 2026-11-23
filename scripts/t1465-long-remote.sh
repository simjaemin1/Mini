#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd);cd "$ROOT"
STOCK=${1:?off or on};INPUT="$ROOT/계측/T1465_2026-11-23"
DIR="${T1465_LONG_OUT:-$INPUT/long/bundle-$STOCK-42}";mkdir -p "$DIR/checkpoints"
CACHE="${RUNNER_TEMP:-/tmp}/t1465-long-seeds.json"
gzip -dc "$INPUT/재현캐시/seeds.json.gz" > "$CACHE"
gzip -dc "$INPUT/재현캐시/seeds.json.t1047dist.json.gz" > "$CACHE.t1047dist.json"
unset T1465_ORE_STOCK T1465_OBS_RESUME T1465_EMPTY_RESUME T1420_LOAD NODE_OPTIONS
if [ "$STOCK" = on ];then export T1465_ORE_STOCK=1 T1465_EMPTY_WATCH=1;fi
export T1420_EQ=1 T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1 LAB_SEEDCACHE="$CACHE" T17_JSON="$DIR/world.json" T1465_OBS="$DIR/stock.json" T1465_CHECKPOINT_DIR="$DIR/checkpoints"
node -r ./scripts/t1465-long-checkpoint.js scripts/t17-metrics.js 10950 42 > "$DIR/run.log" 2>&1
node - "$DIR" <<'JS'
const fs=require('fs'),assert=require('assert'),p=process.argv[2],r=JSON.parse(fs.readFileSync(p+'/stock.json'));assert(r.partial===false&&r.final.day===10950&&r.final.elapsedDays===10950&&r.annual.length===30);if(r.stockOn)assert(JSON.parse(fs.readFileSync(p+'/stock.json.empty-events.json')).scannedDays===10950);
JS
touch "$DIR/done"
