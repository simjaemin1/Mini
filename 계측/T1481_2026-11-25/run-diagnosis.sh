#!/usr/bin/env bash
# 현재 main 재구성 세계. T1434 원본870 저장본이라는 주장을 하지 않는다.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${T1481_OUT:-/workspace/scratch/t1481-main870}"
mkdir -p "$OUT"
cd "$ROOT"
{
  git rev-parse HEAD
  node --version
  sha256sum 계측/T1481_2026-11-25/diagnose.cjs
} > "$OUT/meta.txt"
env T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 VILLAGE_WAR_LOG=1 \
  T1481_FROM=869 T1481_DIAG="$OUT/diag.jsonl" \
  NODE_OPTIONS="--max-old-space-size=6144 -r $ROOT/계측/T1481_2026-11-25/diagnose.cjs" \
  node scripts/t1308-long-run.js 872 42 --cuts 870 --dir "$OUT/run" --tag main870 \
  > "$OUT/runner.log" 2>&1
rc=$?
printf '%s\n' "$rc" > "$OUT/done"
exit "$rc"
