#!/bin/bash
# T1385 랩 판 하나 — 인자: 작업 트리 · 판이름 · 꼴(real = econ-lab-real 51 곳 · ab = t176-ab) · 날 · 팔 · 시드(ab) / 난수열(real · 0 = 기본)
#   팔: off · armory · tingate · ws · poor · nocap · nocapx(run85.sh 와 같은 env) · NOPROBE=1 이면 곁 관찰기 없이(관찰기 무변 확인)
#   → /root/t1385runs/lab/<판이름>-<시드>/{probe.json · run.log · farm.json(ab)} · 끝 줄 /root/t1385runs/lab.txt
W=$1; NM=$2; KIND=$3; DAYS=$4; ARM=$5; SD=${6:-0}
d=/root/t1385runs/lab/$NM-$SD; mkdir -p $d
unset T1385_BRONZE_NOCAP T1385_BRONZE_NOCAP_ARMORY T1385_BRONZE_NOCAP_TINGATE T1385_BRONZE_NOCAP_WS T1385_BRONZE_NOCAP_POOR T1333_EXPORT_CAST T1344_BRONZE_STOCK T1333_WS_INPUT LAB_SEED NODE_OPTIONS
case "$ARM" in
  off) ;; armory) export T1385_BRONZE_NOCAP_ARMORY=1 ;; tingate) export T1385_BRONZE_NOCAP_TINGATE=1 ;; ws) export T1385_BRONZE_NOCAP_WS=1 ;;
  poor) export T1385_BRONZE_NOCAP_POOR=1 ;; nocap) export T1385_BRONZE_NOCAP=1 ;; nocapx) export T1385_BRONZE_NOCAP=1 T1333_EXPORT_CAST=1 ;;
  *) echo "팔 모름 $ARM"; exit 2 ;;
esac
pre="-r $W/scripts/t1385-lab-probe.js"; [ -n "$NOPROBE" ] && pre=""
s=$(date +%s)
if [ "$KIND" = "real" ]; then
  [ "$SD" != "0" ] && export LAB_SEED=$SD
  ( cd $W && SEED_ALL=1 VILLAGE_MAX=51 T1385_LAB_OUT=$d/probe.json node $pre scripts/econ-lab-real.js $DAYS 0 > $d/run.log 2>&1 )
else
  ( cd $W && T1385_LAB_OUT=$d/probe.json T17_JSON=$d/world.json T176_JSON=$d/farm.json LAB_SEEDCACHE=$d/seedcache.json node $pre scripts/t176-ab.js $DAYS $SD > $d/run.log 2>&1 )
fi
echo "$(date -u +%FT%TZ) $NM $SD rc=$? $(( $(date +%s)-s ))s kind=$KIND days=$DAYS arm=$ARM $(git -C $W rev-parse --short HEAD)" >> /root/t1385runs/lab.txt
