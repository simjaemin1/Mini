#!/usr/bin/env bash
# === 계측/T1483_2026-11-25/run.sh — 끔 · 나무꾼 · 어부 서버 판 730날 × 2시드(T1483 · 코드 손 0) ===
#   판 하나 = (팔 · 시드) 하나 = `server-baseline-check.js --make <팔>-<시드>.json --days 730 --seeds <시드> --par 1 --vclock`
#     (서버 기준선 판 자 · 가상 시계 · 판 조건 cond 그대로) + 곁 관찰기 `t1483-observe.js`(100날마다 칸 · 마을별 칸).
#   한 번에 둘까지(JOBS=2) · 판마다 제 TMPDIR(끝나면 지운다 · 판 로그 sbc-<시드>.log 만 남긴다) · 교역로 캐시는 한 폴더를 같이 쓴다(같은 지문 = 같은 길).
#   이어 돌리기: 이미 done.txt 에 있는 판은 건너뛴다. 죽거나 멎은 판은 다시 돌려 덮지 않는다(done.txt 에 rc 그대로).
#   env: ROOT(레포) · OUT(판 자료 폴더) · DAYS(730) · JOBS(2) · CAP_SEC(판 하나 상한 · 기본 43200) · HEAP(6144)
set -u
ROOT="${ROOT:?}"; OUT="${OUT:?}"; DAYS="${DAYS:-730}"; JOBS="${JOBS:-2}"; CAP_SEC="${CAP_SEC:-43200}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT/runs" "$OUT/tmp" "$OUT/route-cache"
touch "$OUT/done.txt"
# 팔: 이름 · env(공백으로 여럿)
ARMS=(
  "off|"
  "wood|T325_WOOD_ACT=1"
  "fish|T312_FISH_ACT=1"
)
SEEDS=(1020 7)
echo "start $(date -u +%FT%TZ) $(git -C "$ROOT" rev-parse --short HEAD) days=$DAYS jobs=$JOBS" >> "$OUT/meta.txt"
one() {   # $1 = 팔|env  $2 = 시드
  local arm="${1%%|*}" envs="${1#*|}" s="$2" tag="${1%%|*}-$2"
  grep -q "^$tag " "$OUT/done.txt" && return 0
  local T="$OUT/tmp/$tag"; rm -rf "$T"; mkdir -p "$T"
  local t0; t0=$(date +%s)
  ( cd "$ROOT" && env $envs TMPDIR="$T" T1483_OBS="$OUT/runs" T1483_ARM="$arm" \
      NODE_OPTIONS="--max-old-space-size=${HEAP:-6144} --require $HERE/t1483-observe.js" \
      timeout "$CAP_SEC" node scripts/server-baseline-check.js --make "$OUT/runs/$tag.json" --days "$DAYS" --seeds "$s" --par 1 --vclock \
      --route-cache "$OUT/route-cache" > "$OUT/runs/$tag.out" 2>&1 )
  local rc=$? dt=$(( $(date +%s) - t0 ))
  # 상한에 걸린 판(rc 124): 제 TMPDIR 를 든 남은 아이(존)도 끈다
  if [ "$rc" = 124 ]; then for p in $(pgrep -x node); do grep -qz "^TMPDIR=$T\$" "/proc/$p/environ" 2>/dev/null && kill "$p"; done; fi
  local lg; lg=$(ls "$T"/sbc-*/sbc-"$s".log 2>/dev/null | head -1)
  [ -n "$lg" ] && cp "$lg" "$OUT/runs/$tag.log"
  echo "$tag $rc $dt" >> "$OUT/done.txt"
  rm -rf "$T"
}
export -f one; export OUT ROOT DAYS CAP_SEC HERE HEAP
for a in "${ARMS[@]}"; do for s in "${SEEDS[@]}"; do printf '%s\t%s\n' "$a" "$s"; done; done \
  | xargs -P "$JOBS" -d '\n' -I{} bash -c 'IFS=$'"'"'\t'"'"' read -r a s <<< "$1"; one "$a" "$s"' _ {}
echo "done $(date -u +%FT%TZ)" >> "$OUT/meta.txt"
