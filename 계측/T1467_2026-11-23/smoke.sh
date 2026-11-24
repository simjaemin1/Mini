#!/bin/bash
# 시범 손잡이 기동 확인(계측 아님) — 틀 사본 · central + zone · /perf walk.t1467
W=/tmp/wt1467; D=/tmp/t1467/sm; CP=4210; ZP=4211; T=/tmp/t1322/tpl/tpl-t100.db
rm -f $D/z.db* $D/c.db*; cp $T $D/z.db; [ -f $T-wal ] && cp $T-wal $D/z.db-wal
AT=$(node -e "const fs=require('fs');const D=1440000;console.log((Math.floor(fs.statSync('$T').mtimeMs/D)+2)*D-150000)")
export NODE_OPTIONS="--require $W/scripts/t455-clock.js" T455_CLOCK_PRE=1 T455_CLOCK_AT=$AT
cd $W
PORT=$CP DB_PATH=$D/c.db PUBLIC_HOST=localhost ENABLED_ZONES=hanbando CENTRAL_SECRET=t646 node server/central.js > $D/c.log 2>&1 &
sleep 2
env "$@" PORT=$ZP ZONE_ID=hanbando CENTRAL_HOST=localhost CENTRAL_PORT=$CP CENTRAL_SECRET=t646 ENABLE_VILLAGES=1 VILLAGE_DAY_MS=1440000 DB_PATH=$D/z.db VILLAGE_WAR_LOG=0 T312_FISH_ACT=1 node server/zone.js > $D/z.log 2>&1 &
