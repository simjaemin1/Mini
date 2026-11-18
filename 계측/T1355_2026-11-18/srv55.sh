#!/bin/bash
# T1355 서버 판 하나 — 인자: 작업트리 · 이름 · 시드 · 날 · env…  → /root/t1355runs/<이름>-<시드>.{json,obs.json,log}
W=$1; NM=$2; SD=$3; DAYS=$4; shift 4
OUT=${OUT:-/root/t1355runs}; b=$OUT/$NM-$SD; OBS=$W/계측/T1355_2026-11-18/t1355-observe.js
s=$(date +%s)
( cd $W && env -u NODE_OPTIONS "$@" T1355_OBS=$b.obs.json NODE_OPTIONS="--require $OBS" node --experimental-sqlite scripts/server-baseline-check.js --make $b.json --days $DAYS --seeds $SD --bodies all --farm ${VCLOCK:+--vclock} > $b.log 2>&1 )
echo "$(date -u +%FT%TZ) $NM $SD rc=$? $(( $(date +%s)-s ))s $(git -C $W rev-parse --short HEAD)" >> $OUT/srv.txt
