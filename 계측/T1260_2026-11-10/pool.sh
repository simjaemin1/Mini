#!/bin/bash
# T1260 랩 800날 판 — 네 팔 × 세 시드 · 동시 $PAR
S=/tmp/claude-0/-home-user-Mini/ea15664f-9124-550c-b32e-7297048e2915/scratchpad/t1260
R=/dev/shm/t1260; mkdir -p $R
PAR=${PAR:-3}
cd /home/user/Mini
job() { arm=$1; seed=$2; d=$R/$arm-$seed; mkdir -p $d
  case $arm in F0) E="";; F1) E="T1243_FARM_ON=1";; F1R) E="T1243_FARM_ON=1 T1260_FOOD_READS=1";; F0R) E="T1260_FOOD_READS=1";; esac
  s=$(date +%s)
  env -u NODE_OPTIONS $E T17_JSON=$d/world.json T176_JSON=$d/farm.json LAB_SEEDCACHE=$d/seedcache.json node scripts/t176-ab.js 800 $seed > $d/run.log 2>&1
  echo "$arm $seed rc=$? $(( $(date +%s)-s ))s" >> $S/pool.txt; }
export -f job; export R S
: > $S/pool.txt
for a in F1 F1R F0 F0R; do for sd in 1020 7 42; do echo "$a $sd"; done; done | xargs -P $PAR -n 2 bash -c 'job "$0" "$1"'
echo done >> $S/pool.txt
