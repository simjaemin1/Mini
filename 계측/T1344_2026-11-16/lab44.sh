#!/bin/bash
# T1344 랩 세계(econ-lab-real · 51 곳) 100날 — 팔: 끔 · ⓐ · ⓐ + 병기고 · ⓐ + 병기고 + 섞어 싣기 · 병기고 · 섞어 싣기 → 랩-<팔>.json (레포 뿌리에서 · `ARMS="ab b"` 로 몇 팔만)
cd "$(dirname "$0")/../.."
D=계측/T1344_2026-11-16
for a in ${ARMS:-off alloy ab abm b m}; do
  unset T1333_ALLOY_ORDER T1344_BRONZE_STOCK T1344_MIX_LOAD
  case $a in alloy) export T1333_ALLOY_ORDER=1;; ab) export T1333_ALLOY_ORDER=1 T1344_BRONZE_STOCK=1;; abm) export T1333_ALLOY_ORDER=1 T1344_BRONZE_STOCK=1 T1344_MIX_LOAD=1;;
    b) export T1344_BRONZE_STOCK=1;; m) export T1344_MIX_LOAD=1;; esac
  SEED_ALL=1 VILLAGE_MAX=51 timeout 3000 node scripts/t1344-lab.js ${1:-100} 2>&1 | tail -1 > $D/랩-$a.json
  echo "$(date -u +%FT%TZ) 랩 $a $(head -c 160 $D/랩-$a.json)"
done
