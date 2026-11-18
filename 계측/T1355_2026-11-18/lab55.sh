#!/bin/bash
# T1355 랩 판 하나 — 인자: 작업트리 · 이름 · 시드 · 날 · env…(SPLIT=1 · BURDEN=1 이면 곁 하나씩 더)  → $R/<이름>-<시드>/{farm.json,probe.json,split.json,burden.json,run.log} · 끝 줄 $R/../lab.txt
W=$1; NM=$2; SD=$3; DAYS=$4; shift 4
R=${R:-/root/t1355runs/lab}; d=$R/$NM-$SD; mkdir -p $d; PB=$W/계측/T1355_2026-11-18/t1355-lab-probe.js
for a in "$@"; do [ "$a" = "SPLIT=1" ] && SPLIT=1; [ "$a" = "BURDEN=1" ] && BURDEN=1; done
pre="-r $PB"; [ -n "$NOPROBE" ] && pre=""; [ -n "$SPLIT" ] && pre="$pre -r $W/계측/T1355_2026-11-18/t1355-happy-split.js"; [ -n "$BURDEN" ] && pre="$pre -r $W/계측/T1355_2026-11-18/t1355-happy-burden.js"
s=$(date +%s)
( cd $W && env -u NODE_OPTIONS "$@" T1355_LAB_OUT=$d/probe.json T1355_SPLIT_OUT=$d/split.json T1355_BURDEN_OUT=$d/burden.json T17_JSON=$d/world.json T176_JSON=$d/farm.json LAB_SEEDCACHE=$d/seedcache.json node $pre scripts/t176-ab.js $DAYS $SD > $d/run.log 2>&1 )
echo "$(date -u +%FT%TZ) $NM $SD rc=$? $(( $(date +%s)-s ))s days=$DAYS $(git -C $W rev-parse --short HEAD)" >> $R/../lab.txt
