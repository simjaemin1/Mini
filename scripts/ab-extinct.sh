#!/usr/bin/env bash
# ★[2026-08-02c 소멸 0 튜닝] 손잡이 개별 A/B 러너 — 3시드 800일, 코어 2개라 2개씩만 동시.
#   사용: scripts/ab-extinct.sh <태그> [ENV=VAL ...]
#   예:   scripts/ab-extinct.sh stonenet STONE_NET=1
set -u
TAG="$1"; shift
OUT=/tmp/lab
mkdir -p "$OUT"
for S in 1020 7 42; do
  while [ "$(pgrep -fc 'econ-lab-real' || true)" -ge 2 ]; do sleep 5; done
  ( env "$@" LAB_SEED=$S LAB_DUMP="$OUT/${TAG}_$S.json" \
      node "$(dirname "$0")/econ-lab-real.js" 800 > "$OUT/${TAG}_$S.log" 2>&1 ) &
  sleep 2
done
wait
echo "done $TAG"
