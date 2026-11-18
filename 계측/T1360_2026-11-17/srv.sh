#!/bin/bash
# T1360 서버 120날 판 — 줄마다 "이름 시드 env…" · 하나씩 · 판 JSON · 관찰기 JSON · 로그는 $OUTD(<이름>-<시드>.*)
ROOT=${ROOT:-/home/user/Mini}; OUTD=${OUTD:?}; LOG=${LOG:-$OUTD/srv.txt}; DAYS=${DAYS:-120}; mkdir -p $OUTD
OBS=$ROOT/계측/T1360_2026-11-17/t1360-observe.js
while read -r name seed rest; do [ -z "$name" ] && continue
  s=$(date +%s); b=$OUTD/$name-$seed
  ( cd $ROOT && env -u NODE_OPTIONS $rest T1360_OBS=$b.obs.json NODE_OPTIONS="--require $OBS" node --experimental-sqlite scripts/server-baseline-check.js --make $b.json --days $DAYS --seeds $seed --bodies all --farm > $b.log 2>&1 )
  echo "$name $seed rc=$? $(( $(date +%s)-s ))s" >> $LOG
done < "$1"
echo done >> $LOG
