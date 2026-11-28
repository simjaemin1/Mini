#!/usr/bin/env bash
# === 계측/T1499_2026-11-27/run.sh — 몸 걸음 자 판(T1499) ===
#   판 하나 = 계획 줄 하나 `태그|시드|날|가상시계(1/0)|env…`
#     = `server-baseline-check.js --make <태그>.json --days <날> --seeds <시드> --par 1 [--vclock]`(판 조건 그대로) + 곁 관찰기 `t1499-observe.js`.
#   실제 시계 정본 = 가상시계 0 + env `VILLAGE_DAY_MS=1440000`(운영 하루 24분 · 집 칸은 판 자 그대로 끔 — 판 자 켬 판과 같은 세계).
#   한 번에 JOBS 개 · 판마다 제 TMPDIR · done.txt 에 "태그 rc 초" 한 줄 = 끝 표시(이어 돌리기).
#   env: ROOT · OUT · PLAN · JOBS(2) · CAP_SEC(43200) · HEAP(6144) · RC(교역로 캐시)
set -u
ROOT="${ROOT:?}"; OUT="${OUT:?}"; PLAN="${PLAN:?}"; JOBS="${JOBS:-2}"; CAP_SEC="${CAP_SEC:-43200}"
HERE="$(cd "$(dirname "$0")" && pwd)"
RC="${RC:-$OUT/route-cache}"
mkdir -p "$OUT/runs" "$OUT/tmp" "$RC"
touch "$OUT/done.txt"
echo "start $(date -u +%FT%TZ) $(git -C "$ROOT" rev-parse --short HEAD) plan=$(basename "$PLAN") jobs=$JOBS" >> "$OUT/meta.txt"
one() {
  IFS='|' read -r tag s days vc envs <<< "$1"
  grep -q "^$tag " "$OUT/done.txt" && return 0
  local T="$OUT/tmp/$tag"; rm -rf "$T"; mkdir -p "$T"
  local t0; t0=$(date +%s); local VF=""; [ "$vc" = 1 ] && VF="--vclock"
  ( cd "$ROOT" && env $envs TMPDIR="$T" T1499_OBS="$OUT/runs" T1499_ARM="$tag" \
      NODE_OPTIONS="--max-old-space-size=${HEAP:-6144} --require $HERE/t1499-observe.js" \
      timeout "$CAP_SEC" node scripts/server-baseline-check.js --make "$OUT/runs/$tag.json" --days "$days" --seeds "$s" --par 1 $VF \
      --route-cache "$RC" > "$OUT/runs/$tag.out" 2>&1 )
  local rc=$? dt=$(( $(date +%s) - t0 ))
  if [ "$rc" = 124 ]; then for p in $(pgrep -x node); do grep -qz "^TMPDIR=$T\$" "/proc/$p/environ" 2>/dev/null && kill "$p"; done; fi
  local lg; lg=$(ls "$T"/sbc-*/sbc-"$s".log 2>/dev/null | head -1)
  [ -n "$lg" ] && cp "$lg" "$OUT/runs/$tag.log"
  echo "$tag $rc $dt" >> "$OUT/done.txt"
  rm -rf "$T"
}
export -f one; export OUT ROOT CAP_SEC HERE HEAP RC
grep -v '^\s*\(#\|$\)' "$PLAN" | xargs -P "$JOBS" -d '\n' -I{} bash -c 'one "$1"' _ {}
echo "done $(date -u +%FT%TZ) plan=$(basename "$PLAN")" >> "$OUT/meta.txt"
