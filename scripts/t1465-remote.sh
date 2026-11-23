#!/bin/bash
# Independent copies of the same measurement protocol, suitable for CI workers.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
KIND=${1:?kind};SEED=${2:?seed};ARM=${3:?arm}
CARD="$ROOT/계측/T1465_2026-11-23"
CACHE="${RUNNER_TEMP:-/tmp}/t1465-replay-seeds.json"
gzip -dc "$CARD/재현캐시/seeds.json.gz" > "$CACHE"
gzip -dc "$CARD/재현캐시/seeds.json.t1047dist.json.gz" > "$CACHE.t1047dist.json"
export LAB_SEEDCACHE="$CACHE"
unset T1465_ORE_STOCK T1465_ATTACH T1420_EQ T1420_LOAD NODE_OPTIONS T1385_BRONZE_NOCAP T1398_BRONZE_BAND
if [ "$ARM" = bundle ];then export T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1;fi
if [ "$KIND" = off-replay ];then
 DIR="$CARD/runs-stock-off/lab-$ARM-$SEED";mkdir -p "$DIR"
 export T17_JSON="$DIR/world.json" T176_JSON="$DIR/farm.json" T1465_OBS="$DIR/stock.json" T1385_LAB_OUT="$DIR/probe.json" T1407_LAB_OUT="$DIR/t1407.json" T1398_OUT="$DIR/band.json"
 node -r ./scripts/t1398-observe.js -r ./scripts/t1385-lab-probe.js -r ./scripts/t1407-observe.js -r ./scripts/t1465-observe.js scripts/t176-ab.js 800 "$SEED" > "$DIR/run.log" 2>&1
 node - "$DIR" "$ARM" "$SEED" <<'JS'
const fs=require('fs'),z=require('zlib'),assert=require('assert'),[dir,arm,seed]=process.argv.slice(2),src='계측/T1427_2026-11-22/runs/new-lab-'+arm+'-'+seed,result={};
for(const name of ['world','probe']){const a=fs.readFileSync(dir+'/'+name+'.json'),b=z.gunzipSync(fs.readFileSync(src+'/'+name+'.json.gz'));result[name+'ByteEqual']=a.equals(b);assert(a.equals(b),name+' OFF bytes differ from inherited T1427 run');}
fs.writeFileSync(dir+'/parity.json',JSON.stringify({source:src,...result},null,2)+'\n');
JS
 touch "$DIR/done"
elif [ "$KIND" = eq ];then
 DIR="$CARD/eq/$ARM-$SEED";SNAPS="$CARD/eq/snapshots/$ARM-$SEED";mkdir -p "$DIR" "$SNAPS"
 SNAP="$SNAPS/lab-hanbando-$SEED-d1900.v8.gz"
 T1420_EQ=1 T1420_SAVE_AT=1900 T1420_SAVE_DIR="$SNAPS" T17_JSON="$DIR/make-world.json" T1465_OBS="$DIR/make-stock.json" node -r ./scripts/t1465-observe.js scripts/t17-metrics.js 1900 "$SEED" > "$DIR/make.log" 2>&1
 NODE_OPTIONS="--require $ROOT/scripts/t1465-eq-observe.js" node scripts/eq-run.js --seed "$SEED" --from "$SNAP" --days 730 --allow-stale --par 1 --arm stock=T1465_ORE_STOCK=1 --out "$DIR/continuation" > "$DIR/eq.log" 2>&1
 node -e 'const r=require(process.argv[1]);require("assert")(r.arms.length===2&&r.arms.every(a=>a.code===0&&a.days===730),"Incomplete equilibrium arm");' "$DIR/continuation/eq-run.json"
 touch "$DIR/done"
else
 echo "Unknown measurement kind: $KIND" >&2;exit 2
fi
node -e 'const fs=require("fs"),cp=require("child_process");fs.writeFileSync(process.argv[1],JSON.stringify({commit:cp.execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),node:process.version,run:process.env.GITHUB_RUN_ID,job:process.env.GITHUB_JOB},null,2));' "$DIR/remote-source.json"
