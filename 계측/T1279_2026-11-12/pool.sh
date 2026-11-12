#!/bin/bash
# T1279 랩 800날 판(T1272 pool.sh 꼴) — 줄마다 "이름 시드 env…" · 동시 $PAR · 판 폴더 $R/<이름>-<시드>
#   env 에 `T1279_SPLIT` 이 있으면 갈라 재기 패치(t1279-split.js)를 -r 로 얹는다
ROOT=/home/user/Mini; R=${R:-/dev/shm/t1279}; mkdir -p $R
LOG=${LOG:-$R/pool.txt}; PAR=${PAR:-4}
P=$ROOT/계측/T1279_2026-11-12/t1279-split.js
job() { name=$1; seed=$2; shift 2; d=$R/$name-$seed; mkdir -p $d
  pre=""; case "$*" in *T1279_SPLIT*) pre="-r $P";; esac
  s=$(date +%s)
  ( cd $ROOT && env -u NODE_OPTIONS "$@" T1279_AUDIT=$d/audit.json T17_JSON=$d/world.json T176_JSON=$d/farm.json LAB_SEEDCACHE=$d/seedcache.json node $pre scripts/t176-ab.js 800 $seed > $d/run.log 2>&1 )
  echo "$name $seed rc=$? $(( $(date +%s)-s ))s" >> $LOG; }
export -f job; export R LOG P ROOT
cat "$1" | xargs -P $PAR -L 1 bash -c 'job "$@"' _
echo done >> $LOG
