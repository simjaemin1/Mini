#!/usr/bin/env bash
# === 계측/T1491_2026-11-26/run.sh — 몫 문 푼 판 · 무변 판 · 끈 세계 · 어부 서버 판(T1491 · 제품 코드 손 0) ===
#   판 하나 = 계획 줄 하나 `태그|시드|날|팔|건너뜀|env…`
#     = `server-baseline-check.js --make <태그>.json --days <날> --seeds <시드> --par 1 --vclock`(서버 기준선 판 자 · 가상 시계 · 판 조건 그대로)
#       + 곁 관찰기 `t1491-observe.js`(T1491_SKIP = 0 | gate | all — 관찰기 안에서만 문을 건너뛴다 · 건너뛴 수를 센다).
#   팔 env: 나무꾼 `T325_WOOD_ACT=1` · 어부 `T312_FISH_ACT=1` · 끈 세계 = 없음.
#   한 번에 JOBS 개(기본 2 · 730날 판 하나 ≈ 4~4.5 GB) · 판마다 제 TMPDIR(끝나면 지운다 · 판 로그 sbc-<시드>.log 만 남긴다) · 교역로 캐시는 한 폴더를 같이 쓴다.
#   이어 돌리기: done.txt 에 이미 있는 태그는 건너뛴다(판마다 "태그 rc 초" 한 줄 = 끝 표시). 상자가 다시 뜨면 같은 줄로 다시 부르면 된다.
#   env: ROOT(레포) · OUT(판 자료 폴더) · PLAN(계획 파일) · JOBS(2) · CAP_SEC(판 하나 상한 · 기본 43200) · HEAP(6144) · RC(교역로 캐시 · 기본 $OUT/route-cache)
set -u
ROOT="${ROOT:?}"; OUT="${OUT:?}"; PLAN="${PLAN:?}"; JOBS="${JOBS:-2}"; CAP_SEC="${CAP_SEC:-43200}"
HERE="$(cd "$(dirname "$0")" && pwd)"
RC="${RC:-$OUT/route-cache}"
mkdir -p "$OUT/runs" "$OUT/tmp" "$RC"
touch "$OUT/done.txt"
echo "start $(date -u +%FT%TZ) $(git -C "$ROOT" rev-parse --short HEAD) plan=$(basename "$PLAN") jobs=$JOBS" >> "$OUT/meta.txt"
one() {   # $1 = 태그|시드|날|팔|건너뜀|env
  IFS='|' read -r tag s days arm skip envs <<< "$1"
  grep -q "^$tag " "$OUT/done.txt" && return 0
  local T="$OUT/tmp/$tag"; rm -rf "$T"; mkdir -p "$T"
  local t0; t0=$(date +%s)
  ( cd "$ROOT" && env $envs TMPDIR="$T" T1491_OBS="$OUT/runs" T1491_ARM="$tag" T1491_SKIP="$skip" \
      NODE_OPTIONS="--max-old-space-size=${HEAP:-6144} --require $HERE/t1491-observe.js" \
      timeout "$CAP_SEC" node scripts/server-baseline-check.js --make "$OUT/runs/$tag.json" --days "$days" --seeds "$s" --par 1 --vclock \
      --route-cache "$RC" > "$OUT/runs/$tag.out" 2>&1 )
  local rc=$? dt=$(( $(date +%s) - t0 ))
  # 상한에 걸린 판(rc 124): 제 TMPDIR 를 든 남은 아이(존)도 끈다
  if [ "$rc" = 124 ]; then for p in $(pgrep -x node); do grep -qz "^TMPDIR=$T\$" "/proc/$p/environ" 2>/dev/null && kill "$p"; done; fi
  local lg; lg=$(ls "$T"/sbc-*/sbc-"$s".log 2>/dev/null | head -1)
  [ -n "$lg" ] && cp "$lg" "$OUT/runs/$tag.log"
  echo "$tag $rc $dt" >> "$OUT/done.txt"
  rm -rf "$T"
}
export -f one; export OUT ROOT CAP_SEC HERE HEAP RC
grep -v '^\s*\(#\|$\)' "$PLAN" | xargs -P "$JOBS" -d '\n' -I{} bash -c 'one "$1"' _ {}
echo "done $(date -u +%FT%TZ) plan=$(basename "$PLAN")" >> "$OUT/meta.txt"
