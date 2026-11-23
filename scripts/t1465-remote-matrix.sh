#!/bin/bash
# Same-host control: old product OFF, new product OFF, and new product ON.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd);cd "$ROOT"
SEED=${1:?seed};ARM=${2:?arm};CARD="$ROOT/계측/T1465_2026-11-23"
CACHE="${RUNNER_TEMP:-/tmp}/t1465-paired-seeds.json"
gzip -dc "$CARD/재현캐시/seeds.json.gz" > "$CACHE"
gzip -dc "$CARD/재현캐시/seeds.json.t1047dist.json.gz" > "$CACHE.t1047dist.json"
export LAB_SEEDCACHE="$CACHE"
unset T1465_ORE_STOCK T1465_ATTACH T1420_EQ T1420_LOAD NODE_OPTIONS T1385_BRONZE_NOCAP T1398_BRONZE_BAND
if [ "$ARM" = bundle ];then export T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1;fi
run_lab(){
 local sim_root=$1 dir=$2 stock=$3 mutant=${4:-}
 mkdir -p "$dir";unset T1465_ORE_STOCK T1465_EMPTY_WATCH
 if [ "$stock" = on ];then export T1465_ORE_STOCK=1 T1465_EMPTY_WATCH=1;fi
 export T17_JSON="$dir/world.json" T176_JSON="$dir/farm.json" T1465_OBS="$dir/stock.json" T1385_LAB_OUT="$dir/probe.json" T1407_LAB_OUT="$dir/t1407.json" T1398_OUT="$dir/band.json"
 (
  cd "$sim_root"
  if [ -n "$mutant" ];then
   node -r ./scripts/t1465-no-decrement.js -r ./scripts/t1398-observe.js -r ./scripts/t1385-lab-probe.js -r ./scripts/t1407-observe.js -r ./scripts/t1465-observe.js scripts/t176-ab.js 800 "$SEED" > "$dir/run.log" 2>&1
  else
   node -r ./scripts/t1398-observe.js -r ./scripts/t1385-lab-probe.js -r ./scripts/t1407-observe.js -r ./scripts/t1465-observe.js scripts/t176-ab.js 800 "$SEED" > "$dir/run.log" 2>&1
  fi
 )
 touch "$dir/done"
 node -e 'const fs=require("fs"),cp=require("child_process");fs.writeFileSync(process.argv[1],JSON.stringify({commit:cp.execFileSync("git",["-C",process.argv[2],"rev-parse","HEAD"],{encoding:"utf8"}).trim(),observerRunnerCommit:process.env.GITHUB_SHA||null,node:process.version,run:process.env.GITHUB_RUN_ID,job:process.env.GITHUB_JOB},null,2));' "$dir/remote-source.json" "$sim_root"
}
OLD="${RUNNER_TEMP:-/tmp}/t1465-pre-product"
git worktree add --detach "$OLD" 34b1978a97b232323da53e177451ba30377049c6
ln -s "$ROOT/node_modules" "$OLD/node_modules"
cp -a "$ROOT/scripts/." "$OLD/scripts/"
mkdir -p "$OLD/계측/T1465_2026-11-23"
cp "$CARD/광맥-진단.json" "$OLD/계측/T1465_2026-11-23/광맥-진단.json"
run_lab "$OLD" "$CARD/baseline-off/lab-$ARM-$SEED" off
run_lab "$ROOT" "$CARD/runs-stock-off/lab-$ARM-$SEED" off
node - "$CARD" "$ARM" "$SEED" <<'JS'
const fs=require('fs'),assert=require('assert'),[root,arm,seed]=process.argv.slice(2),dir=root+'/runs-stock-off/lab-'+arm+'-'+seed,src=root+'/baseline-off/lab-'+arm+'-'+seed,result={};
for(const name of ['world','probe']){const a=fs.readFileSync(dir+'/'+name+'.json'),b=fs.readFileSync(src+'/'+name+'.json');result[name+'ByteEqual']=a.equals(b);assert(a.equals(b),name+' OFF old/new same-host bytes differ');}
fs.writeFileSync(dir+'/parity.json',JSON.stringify({source:'baseline-off/lab-'+arm+'-'+seed,baselineProduct:'34b1978a97b232323da53e177451ba30377049c6',sameHost:true,...result},null,2)+'\n');
JS
run_lab "$ROOT" "$CARD/runs/lab-$ARM-$SEED" on
if [ "$ARM-$SEED" = bundle-1020 ];then run_lab "$ROOT" "$CARD/ablation/bundle-no-decrement-1020" on no-decrement;fi
