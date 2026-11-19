#!/bin/bash
# T1384 랩 판 하나 — 인자: 작업 트리 · 판이름 · 꼴(real = econ-lab-real 51 곳 · ab = t176-ab) · 날 · 팔 · 시드(ab) / 난수열(real · 0 = 기본)   (T1385 lab85.sh 꼴 그대로)
#   팔: off · pull · sell · both(run84.sh 와 같은 env) · NOPROBE=1 이면 곁 관찰기 없이(관찰기 무섭동 확인)
#   → /root/t1384runs/lab/<판이름>-<시드>/{probe.json · run.log · farm.json(ab)} · 끝 줄 /root/t1384runs/lab.txt
W=$1; NM=$2; KIND=$3; DAYS=$4; ARM=$5; SD=${6:-0}
d=/root/t1384runs/lab/$NM-$SD; mkdir -p $d
unset T1384_MINE_FOOD T1384_MINE_FOOD_PULL T1384_MINE_FOOD_SELL T1347_FETCH LAB_SEED NODE_OPTIONS
case "$ARM" in
  off) ;; pull) export T1384_MINE_FOOD_PULL=1 ;; sell) export T1384_MINE_FOOD_SELL=1 ;; both) export T1384_MINE_FOOD=1 ;;
  *) echo "팔 모름 $ARM"; exit 2 ;;
esac
pre="-r $W/scripts/t1384-observe.js"; [ -n "$NOPROBE" ] && pre=""
s=$(date +%s)
if [ "$KIND" = "real" ]; then
  [ "$SD" != "0" ] && export LAB_SEED=$SD
  ( cd $W && SEED_ALL=1 VILLAGE_MAX=51 T1384_LAB_OUT=$d/probe.json node $pre scripts/econ-lab-real.js $DAYS 0 > $d/run.log 2>&1 )
else
  ( cd $W && T1384_LAB_OUT=$d/probe.json T17_JSON=$d/world.json T176_JSON=$d/farm.json LAB_SEEDCACHE=$d/seedcache.json node $pre scripts/t176-ab.js $DAYS $SD > $d/run.log 2>&1 )
fi
echo "$(date -u +%FT%TZ) $NM $SD rc=$? $(( $(date +%s)-s ))s kind=$KIND days=$DAYS arm=$ARM $(git -C $W rev-parse --short HEAD)" >> /root/t1384runs/lab.txt
