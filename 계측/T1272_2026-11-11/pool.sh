#!/bin/bash
# T1272 랩 800날 판(T1265 pool.sh 그대로 · 문 되돌림은 T1265 t1265-doors.js) — 줄마다 "이름 시드 env…" · 동시 $PAR · 판 폴더 $R/<이름>-<시드>
ROOT=/home/user/Mini; R=${R:-/dev/shm/t1265}; mkdir -p $R
LOG=${LOG:-$R/pool.txt}; PAR=${PAR:-3}
P=$ROOT/계측/T1265_2026-11-11/t1265-doors.js
job() { name=$1; seed=$2; shift 2; d=$R/$name-$seed; mkdir -p $d
  pre=""; case "$*" in *T1265_DOOR*) pre="-r $P";; esac
  s=$(date +%s)
  ( cd $ROOT && env -u NODE_OPTIONS "$@" T1265_AUDIT=$d/audit.json T17_JSON=$d/world.json T176_JSON=$d/farm.json LAB_SEEDCACHE=$d/seedcache.json node $pre scripts/t176-ab.js 800 $seed > $d/run.log 2>&1 )
  echo "$name $seed rc=$? $(( $(date +%s)-s ))s" >> $LOG; }
export -f job; export R LOG P ROOT
cat "$1" | xargs -P $PAR -L 1 bash -c 'job "$@"' _
echo done >> $LOG
