#!/bin/bash
# T1347 랩 세계(econ-lab-real · 51 곳) 100날 — 팔: 끔 · 합금 발주 · ⓐ · ⓑ · ⓐ + ⓑ · 섞기(좁히기 전) → 랩-<팔>.json (레포 뿌리에서 · `ARMS="a b"` 로 몇 팔만)
#   ⓐ · ⓑ 팔은 합금 발주(`T1333_ALLOY_ORDER`)를 같이 켠다(서버 · 몸 판 팔과 같은 꼴 — run47.sh)
cd "$(dirname "$0")/../.."
D=계측/T1347_2026-11-17
for a in ${ARMS:-off alloy a b ab m}; do
  unset T1333_ALLOY_ORDER T1347_FETCH T1344_MIX_LOAD T1347_MIX_DEST T1344_BRONZE_STOCK
  case $a in alloy) export T1333_ALLOY_ORDER=1;; a) export T1333_ALLOY_ORDER=1 T1347_FETCH=1;; b) export T1333_ALLOY_ORDER=1 T1344_MIX_LOAD=1 T1347_MIX_DEST=1;;
    ab) export T1333_ALLOY_ORDER=1 T1347_FETCH=1 T1344_MIX_LOAD=1 T1347_MIX_DEST=1;; m) export T1333_ALLOY_ORDER=1 T1344_MIX_LOAD=1;; esac
  SEED_ALL=1 VILLAGE_MAX=51 timeout 6000 node scripts/t1347-lab.js ${1:-100} 2>&1 | tail -1 > $D/랩-$a.json
  echo "랩 $a $(head -c 200 $D/랩-$a.json)"
done
