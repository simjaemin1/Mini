#!/usr/bin/env bash
# === 계측/T1502_2026-11-27/run.sh — 끔 / 농부 / 채집 서버 판(T1502) ===
#   계획 줄 하나 = `태그|시드|날|트리|env…` (트리 = 판을 돌릴 레포 · main 작업 트리일 수 있다)
#     = `server-baseline-check.js --make <태그>.json --days <날> --seeds <시드> --par 1 --vclock`(서버 기준선 판 자 · T1472 와 같은 자)
#       + 곁 탐침 `scripts/lib-act-funnel.js`(T1502_FUNNEL=<폴더> 일 때만 선다 · 읽기만) — REQ 로 다른 관찰기를 고를 수 있다.
#   한 번에 JOBS 개(기본 2) · 판마다 제 TMPDIR(끝나면 지운다) · 교역로 캐시 한 폴더.
#   이어 돌리기: done.txt 에 있는 태그는 건너뛴다.
#   env: OUT · PLAN · JOBS(2) · CAP_SEC(43200) · HEAP(6144) · REQ(--require 할 파일 · 기본 레포 scripts/lib-act-funnel.js)
set -u
OUT="${OUT:?}"; PLAN="${PLAN:?}"; JOBS="${JOBS:-2}"; CAP_SEC="${CAP_SEC:-43200}"
RC="${RC:-$OUT/route-cache}"
mkdir -p "$OUT/runs" "$OUT/tmp" "$RC"
touch "$OUT/done.txt"
echo "start $(date -u +%FT%TZ) plan=$(basename "$PLAN") jobs=$JOBS" >> "$OUT/meta.txt"
one() {
  IFS='|' read -r tag s days root envs <<< "$1"
  grep -q "^$tag " "$OUT/done.txt" && return 0
  local T="$OUT/tmp/$tag"; rm -rf "$T"; mkdir -p "$T"
  local req="${REQ:-$root/scripts/lib-act-funnel.js}"
  echo "$tag $(git -C "$root" rev-parse --short HEAD) $envs" >> "$OUT/meta.txt"
  local t0; t0=$(date +%s)
  ( cd "$root" && env $envs TMPDIR="$T" T1502_FUNNEL="$OUT/runs" T1502_ARM="$tag" T1472_OBS="$OUT/runs" T1472_ARM="$tag" \
      NODE_OPTIONS="--max-old-space-size=${HEAP:-6144} --require $req" \
      timeout "$CAP_SEC" node scripts/server-baseline-check.js --make "$OUT/runs/$tag.json" --days "$days" --seeds "$s" --par 1 --vclock \
      --route-cache "$RC" > "$OUT/runs/$tag.out" 2>&1 )
  local rc=$? dt=$(( $(date +%s) - t0 ))
  if [ "$rc" = 124 ]; then for p in $(pgrep -x node); do grep -qz "^TMPDIR=$T\$" "/proc/$p/environ" 2>/dev/null && kill "$p"; done; fi
  local lg; lg=$(ls "$T"/sbc-*/sbc-"$s".log 2>/dev/null | head -1)
  [ -n "$lg" ] && cp "$lg" "$OUT/runs/$tag.log"
  echo "$tag $rc $dt" >> "$OUT/done.txt"
  rm -rf "$T"
}
export -f one; export OUT CAP_SEC HEAP RC REQ
grep -v '^\s*\(#\|$\)' "$PLAN" | xargs -P "$JOBS" -d '\n' -I{} bash -c 'one "$1"' _ {}
echo "done $(date -u +%FT%TZ) plan=$(basename "$PLAN")" >> "$OUT/meta.txt"
