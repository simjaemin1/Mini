#!/bin/bash
# lab.sh <tag> <seed> <days> [extra env...] — 랩(끔 세계) t17 판 하나 · 훅 t1452hook
SP=/tmp/claude-0/-home-claude/1f1e7ed8-6ef5-52d5-88f7-6d92b60be336/scratchpad
WT=${T1452_WT:-/tmp/t1452}; tag=$1; s=$2; days=${3:-800}; shift 3
O=$SP/t1452/lab/$tag-$s
cd $WT && env LAB_SEEDCACHE=$SP/t1452/seeds-$s.json "$@" T1452_ROOT=$WT T1452_OUT=$O.t1452.json T1437_ROOT=$WT T1437_OUT=$O.t1437.json node --max-old-space-size=3072 -r $WT/계측/T1452_2026-11-23/t1452hook.js -r $WT/계측/T1437_2026-11-22/t1437hook.js scripts/t17-metrics.js $days $s > $O.txt 2>&1
echo "lab $tag-$s rc=$? $(date -u +%T)" >> $SP/t1452/done.txt
