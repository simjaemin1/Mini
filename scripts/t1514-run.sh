#!/usr/bin/env bash
# === scripts/t1514-run.sh — T1514 "본 만큼 사 둔다"를 자리 하나씩만 켠 긴 판 (코드 손 0 · @regress 없음) ===
#   t1488-run.sh 를 그대로 본떴다: 판 하나 = `server-baseline-check.js --make … --days 730 --seeds <시드> --par 1 --vclock` + 곁 관찰기(scripts/t1514-observe.js) + 자리 스위치 선행 적재(scripts/t1514-site.js).
#   팔(arm) 이름 → env:
#     off            = 끔(T1419_FOOD_NEED 없음)                       on            = 전부 켬(T1419_FOOD_NEED=seen · 스위치 없음)
#     only-<갈래>    = seen + T1514_ON=<갈래>  (ref famine birth mig keep switch depart — 그 갈래 하나만 켬)
#     but-<갈래>     = seen + T1514_ON=all-but:<갈래>  (하나만 끔)
#     noobs-off / noobs-on = 관찰기 없는 판(지문 견줌 · 스위치 선행 적재도 안 건다)
#     (확인용) offpre = 끔 + 스위치 선행 적재(T1514_ON 없음) · all = seen + T1514_ON=all · none = seen + T1514_ON=none
#   이어 돌리기: OUT/runs/<tag>.done(rc 0 일 때만 쓴다 · 실패는 <tag>.fail)이 있는 판은 건너뛴다(같은 명령으로 이어 돈다). 판마다 제 TMPDIR(/dev/shm/t1514/tmp/<tag> · 끝나면 그 폴더만 지운다) · 원자료 RAW(/dev/shm/t1514).
#   차례: (a) 전 시드 끔 · 전부 켬 · 갈래 하나씩 → (b) 하나만 끈 판 → (c) 관찰기 없는 판 넷. 맨 끝 OUT/runs/ALL_DONE.
#   env: OUT(기본 계측/T1514_2026-11-26) · RAW(/dev/shm/t1514) · PAR(3) · DAYS(730) · CAP_SEC(14400) · RUNLIST(줄마다 "팔<TAB>시드" — 주면 그것만 · 확인판용) · SEEDS("1020 7 42")
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="${ROOT:-$(cd "$HERE/.." && pwd)}"
OUT="${OUT:-$ROOT/계측/T1514_2026-11-26}"; RAW="${RAW:-/dev/shm/t1514}"; PAR="${PAR:-3}"; DAYS="${DAYS:-730}"; CAP_SEC="${CAP_SEC:-14400}"
SEEDS="${SEEDS:-1020 7 42}"; GROUPS_="ref famine birth mig keep switch depart"
mkdir -p "$OUT/runs" "$RAW/obs" "$RAW/tmp" "$RAW/route-cache" "$RAW/raw"
echo "start $(date -u +%FT%TZ) $(git -C "$ROOT" rev-parse --short HEAD) days=$DAYS par=$PAR" >> "$RAW/meta.txt"
one() {   # $1 = 팔   $2 = 시드
  local arm="$1" s="$2" tag="$1-$2" envs="" obs=1 site=0
  [ -f "$OUT/runs/$tag.done" ] && return 0
  case "$arm" in
    off) ;;
    on) envs="T1419_FOOD_NEED=seen" ;;
    only-*) envs="T1419_FOOD_NEED=seen T1514_ON=${arm#only-}"; site=1 ;;
    but-*) envs="T1419_FOOD_NEED=seen T1514_ON=all-but:${arm#but-}"; site=1 ;;
    all) envs="T1419_FOOD_NEED=seen T1514_ON=all"; site=1 ;;
    none) envs="T1419_FOOD_NEED=seen T1514_ON=none"; site=1 ;;
    offpre) site=1 ;;
    noobs-off) obs=0 ;;
    noobs-on) obs=0; envs="T1419_FOOD_NEED=seen" ;;
    *) echo "모르는 팔 $arm" >&2; return 1 ;;
  esac
  local T="$RAW/tmp/$tag"; rm -rf "$T"; mkdir -p "$T"; local t0; t0=$(date +%s)
  local nodeopt=""; [ "$site" = 1 ] && nodeopt="--require $HERE/t1514-site.js"; [ "$obs" = 1 ] && nodeopt="$nodeopt --require $HERE/t1514-observe.js"
  ( cd "$ROOT" && env $envs TMPDIR="$T" T1514_OBS="$RAW/obs" T1514_ARM="$arm" NODE_OPTIONS="$nodeopt" \
      timeout "$CAP_SEC" node scripts/server-baseline-check.js --make "$RAW/raw/$tag.json" --days "$DAYS" --seeds "$s" --par 1 --vclock \
      --route-cache "$RAW/route-cache" > "$RAW/raw/$tag.out" 2>&1 )
  local rc=$? dt=$(( $(date +%s) - t0 ))
  if [ "$rc" = 124 ]; then for p in $(pgrep -x node); do grep -qz "^TMPDIR=$T\$" "/proc/$p/environ" 2>/dev/null && kill "$p"; done; fi
  local lg; lg=$(ls "$T"/sbc-*/sbc-"$s".log 2>/dev/null | head -1)
  [ -n "$lg" ] && tail -n 40 "$lg" > "$OUT/runs/$tag.tail.log"
  tail -n 15 "$RAW/raw/$tag.out" >> "$OUT/runs/$tag.tail.log" 2>/dev/null
  [ -f "$RAW/raw/$tag.json" ] && gzip -c "$RAW/raw/$tag.json" > "$OUT/runs/$tag.json.gz"
  [ -f "$RAW/obs/obs-$arm-$s.json" ] && gzip -c "$RAW/obs/obs-$arm-$s.json" > "$OUT/runs/obs-$tag.json.gz"
  if [ "$rc" = 0 ]; then echo "$tag $rc $dt" > "$OUT/runs/$tag.done"; else echo "$tag $rc $dt" > "$OUT/runs/$tag.fail"; fi   # 실패는 .fail(이어 돌리면 다시 돈다)
  rm -rf "$T"
}
export -f one; export OUT ROOT RAW DAYS CAP_SEC HERE
mklist() {
  if [ -n "${RUNLIST:-}" ]; then printf '%s\n' "$RUNLIST"; return; fi
  for s in $SEEDS; do printf 'off\t%s\non\t%s\n' "$s" "$s"; for g in $GROUPS_; do printf 'only-%s\t%s\n' "$g" "$s"; done; done   # (a)
  for s in $SEEDS; do for g in $GROUPS_; do printf 'but-%s\t%s\n' "$g" "$s"; done; done                                      # (b)
  for s in 1020 7; do printf 'noobs-off\t%s\nnoobs-on\t%s\n' "$s" "$s"; done                                                 # (c)
}
mklist | xargs -P "$PAR" -d '\n' -I{} bash -c 'IFS=$'"'"'\t'"'"' read -r a s <<< "$1"; one "$a" "$s"' _ {}
echo "done $(date -u +%FT%TZ)" >> "$RAW/meta.txt"
touch "$OUT/runs/ALL_DONE"
