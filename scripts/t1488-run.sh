#!/usr/bin/env bash
# === scripts/t1488-run.sh — T1488 끔 / 켬(T1419_FOOD_NEED=seen) × 시드 셋 × 400날 서버 판 + 곁 관찰기 (코드 손 0 · @regress 없음) ===
#   판 하나 = `server-baseline-check.js --make … --days 400 --seeds <시드> --par 1 --vclock` (T1473 러너와 같은 자) + scripts/t1488-observe.js.
#   한 번에 PAR(2)까지 · 판마다 제 TMPDIR(끝나면 지운다) · 교역로 캐시 한 폴더 공유 · 힙은 lib-heap 기본 6,144 MB.
#   이어 돌리기: OUT/runs/<tag>.done 이 있는 판은 건너뛴다(상자가 다시 떠도 같은 명령으로 이어 돈다). 끝 표시는 관찰 자료(obs gz)와 판 지문(gz)을 OUT 에 올린 뒤에 쓴다.
#   관찰기 없는 판(noobs-off-1020)은 관찰기 무변 견줌 한 판(같은 시드 끔 판과 지문이 같아야 한다).
#   env: OUT(기본 계측/T1488_2026-11-25) · RAW(기본 /dev/shm/t1488) · PAR(2) · DAYS(400) · CAP_SEC(21600)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="${ROOT:-$(cd "$HERE/.." && pwd)}"
OUT="${OUT:-$ROOT/계측/T1488_2026-11-25}"; RAW="${RAW:-/dev/shm/t1488}"; PAR="${PAR:-2}"; DAYS="${DAYS:-400}"; CAP_SEC="${CAP_SEC:-21600}"
SEEDS=(1020 7 42)
mkdir -p "$OUT/runs" "$RAW/obs" "$RAW/tmp" "$RAW/route-cache" "$RAW/raw"
echo "start $(date -u +%FT%TZ) $(git -C "$ROOT" rev-parse --short HEAD) days=$DAYS par=$PAR" >> "$RAW/meta.txt"
one() {   # $1 = 팔(off|on|noobs-off)   $2 = 시드
  local arm="$1" s="$2" tag="$1-$2" envs="" obs=1
  [ -f "$OUT/runs/$tag.done" ] && return 0
  [ "$arm" = on ] && envs="T1419_FOOD_NEED=seen"
  [ "$arm" = noobs-off ] && obs=0
  local T="$RAW/tmp/$tag"; rm -rf "$T"; mkdir -p "$T"; local t0; t0=$(date +%s)
  local nodeopt=""; [ "$obs" = 1 ] && nodeopt="--require $HERE/t1488-observe.js"
  ( cd "$ROOT" && env $envs TMPDIR="$T" T1488_OBS="$RAW/obs" T1488_ARM="$arm" NODE_OPTIONS="$nodeopt" \
      timeout "$CAP_SEC" node scripts/server-baseline-check.js --make "$RAW/raw/$tag.json" --days "$DAYS" --seeds "$s" --par 1 --vclock \
      --route-cache "$RAW/route-cache" > "$RAW/raw/$tag.out" 2>&1 )
  local rc=$? dt=$(( $(date +%s) - t0 ))
  if [ "$rc" = 124 ]; then for p in $(pgrep -x node); do grep -qz "^TMPDIR=$T\$" "/proc/$p/environ" 2>/dev/null && kill "$p"; done; fi
  local lg; lg=$(ls "$T"/sbc-*/sbc-"$s".log 2>/dev/null | head -1)
  [ -n "$lg" ] && tail -n 40 "$lg" > "$OUT/runs/$tag.tail.log"
  tail -n 15 "$RAW/raw/$tag.out" >> "$OUT/runs/$tag.tail.log" 2>/dev/null
  [ -f "$RAW/raw/$tag.json" ] && gzip -c "$RAW/raw/$tag.json" > "$OUT/runs/$tag.json.gz"
  [ -f "$RAW/obs/obs-$arm-$s.json" ] && gzip -c "$RAW/obs/obs-$arm-$s.json" > "$OUT/runs/obs-$tag.json.gz"
  echo "$tag $rc $dt" > "$OUT/runs/$tag.done"
  rm -rf "$T"
}
export -f one; export OUT ROOT RAW DAYS CAP_SEC HERE
{ for s in "${SEEDS[@]}"; do printf 'off\t%s\non\t%s\n' "$s" "$s"; done; printf 'noobs-off\t1020\n'; } \
  | xargs -P "$PAR" -d '\n' -I{} bash -c 'IFS=$'"'"'\t'"'"' read -r a s <<< "$1"; one "$a" "$s"' _ {}
echo "done $(date -u +%FT%TZ)" >> "$RAW/meta.txt"
touch "$OUT/runs/ALL_DONE"
