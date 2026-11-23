#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
for SEED in 1020 7 42;do
 for ARM in off bundle;do
  DIR="$ROOT/계측/T1465_2026-11-23/runs-stock-off/lab-$ARM-$SEED";mkdir -p "$DIR"
  if [ -f "$DIR/done" ];then continue;fi
  unset T1465_ORE_STOCK T1465_ATTACH T1420_EQ T1420_LOAD NODE_OPTIONS T1385_BRONZE_NOCAP T1398_BRONZE_BAND T1407_ORE_WORTH T1407_FOOD_FIRST
  if [ "$ARM" = bundle ];then export T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1;fi
  export T1407_LAB_OUT="$DIR/t1407.json" T1398_OUT="$DIR/band.json"
  export LAB_SEEDCACHE=/workspace/scratch/t1465-seeds-on.json T17_JSON="$DIR/world.json" T176_JSON="$DIR/farm.json" T1465_OBS="$DIR/stock.json" T1385_LAB_OUT="$DIR/probe.json"
  node -r ./scripts/t1398-observe.js -r ./scripts/t1385-lab-probe.js -r ./scripts/t1407-observe.js -r ./scripts/t1465-observe.js scripts/t176-ab.js 800 "$SEED" > "$DIR/run.log" 2>&1
  node - "$DIR" "$ARM" "$SEED" <<'JS'
const fs=require('fs'),z=require('zlib'),assert=require('assert'),[dir,arm,seed]=process.argv.slice(2),src='계측/T1427_2026-11-22/runs/new-lab-'+arm+'-'+seed,result={};
for(const name of ['world','probe']){const a=fs.readFileSync(dir+'/'+name+'.json'),b=z.gunzipSync(fs.readFileSync(src+'/'+name+'.json.gz'));result[name+'ByteEqual']=a.equals(b);assert(a.equals(b),name+' OFF bytes differ from inherited T1427 run');}
fs.writeFileSync(dir+'/parity.json',JSON.stringify({source:src,...result},null,2)+'\n');
JS
  touch "$DIR/done"
 done
done
