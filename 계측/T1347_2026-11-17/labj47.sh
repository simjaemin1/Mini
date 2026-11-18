#!/bin/bash
# T1347 판정 표 — 랩 세계(econ-lab-real · 51 곳) 100날 · 갈래 (가) ga · (나) na · (다) da 를 ⓐ(합금 발주 + 받아 올 짐) 위에서 → 랩-a<갈래>[-s<n>].json
#   갈래 사본은 판 자 작업 트리(`/root/wt47<갈래>` = 이 가지 7c6e9466a + `variants.py <갈래>` — 제품 무변 · 레포 글자는 그대로)에서 돈다 —
#   그 트리에 `scripts/t1347-lab.js`(이 가지 52fe85d6a 글자)를 넣어 그 트리의 econ 을 싣는다. `LAB_SEEDS` = lab47.sh 와 같은 뜻(0 = 기본 난수열 1020)
#   쓰는 법(레포 뿌리): bash 계측/T1347_2026-11-17/labj47.sh [날=100]   ← `WT=/root/wt47` 작업 트리 머리 · `VARS="ga na da"` · `LAB_SEEDS="0 1 2 3 4"`
D=$(cd "$(dirname "$0")" && pwd); WT=${WT:-/root/wt47}
for v in ${VARS:-ga na da}; do
for s in ${LAB_SEEDS:-0 1 2 3 4}; do
  unset T1333_ALLOY_ORDER T1347_FETCH T1344_MIX_LOAD T1347_MIX_DEST T1344_BRONZE_STOCK LAB_SEED
  export T1333_ALLOY_ORDER=1 T1347_FETCH=1
  O=$D/랩-a$v.json; [ "$s" != "0" ] && { export LAB_SEED=$s; O=$D/랩-a$v-s$s.json; }
  ( cd $WT$v && SEED_ALL=1 VILLAGE_MAX=51 timeout 6000 node scripts/t1347-lab.js ${1:-100} 2>&1 | tail -1 > $O )
  echo "랩 a$v $s $(head -c 160 $O)"
done
done
