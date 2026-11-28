#!/usr/bin/env bash
# === scripts/t1475-run.sh — 멎는 날 앞뒤의 광산5 날마다 뜨기 + 관찰기 무변 견줌 [T1475 · S13 · 2026-11-24] ======
# (@regress 없음 — 러너 밖 · 판 도구 · 제품 손 0 · 하네스 손 0)
# 두 지도 = 두 작업 트리(T1456 과 같은 두 커밋 — old = e1f373769 · new = ca0233b51). 지도마다 TMPDIR(시딩 캐시)를 따로 둔다. 관찰기는 작업 트리 scripts/ 로 복사해 싣는다(그 트리의 sim 을 읽게).
# 판(지도 × 시드 × 종류) — 끝나면 `$OUT/runs/<태그>.done`:
#   obs  = 관찰기 셋(t1385 · t1407 · t1475) 판. new 7 · 42 = 1,900날(지문 1,801~1,900 → T1456 obs 지문과 견줌) · 그 밖 = 400날(지문 1~400).
#   ctl  = 같은 400날 판에서 t1475 만 뺀 것(관찰기 무변 견줌 — new 1020 만).
#   OUT=계측/T1475_2026-11-24 PAR=3 setsid nohup bash scripts/t1475-run.sh > /dev/shm/t1475.log 2>&1 < /dev/null &
set -u
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
OUT="${OUT:-계측/T1475_2026-11-24}"; PAR="${PAR:-3}"; W="${W:-/dev/shm/t1475}"
WT_OLD="${WT_OLD:-$W/wt-old}"; WT_NEW="${WT_NEW:-$W/wt-new}"
OUT="$ROOT/$OUT"; mkdir -p "$OUT/runs" "$W/keep"
export ROOT OUT W WT_OLD WT_NEW
HEAP=--max-old-space-size=6144
for wt in "$WT_OLD" "$WT_NEW"; do cp "$ROOT/scripts/t1475-observe.js" "$wt/scripts/t1475-observe.js"; done

job() {   # job <지도> <종류> <시드> <날수>
  local map="$1" kind="$2" seed="$3" days="$4" tag="$1-$2-$3"
  [ -f "$OUT/runs/$tag.done" ] && return 0
  local wt; [ "$map" = old ] && wt="$WT_OLD" || wt="$WT_NEW"
  local T="$W/$map/tmp"; mkdir -p "$T/durango-eq-cache"
  local seeds="$T/durango-eq-cache/lab-seeds-hanbando-$seed.json" J="$W/$map/$tag"
  rm -rf -- "$J"; mkdir -p "$J"
  local fpTo=1900 fpFrom=1801; [ "$days" -lt 1900 ] && { fpFrom=1; fpTo="$days"; }
  local obsR="-r $wt/scripts/t1385-lab-probe.js -r $wt/scripts/t1407-observe.js"
  [ "$kind" = obs ] && obsR="$obsR -r $wt/scripts/t1475-observe.js"
  local t0; t0=$(date +%s); local rc
  cd "$wt" || return 2
  unset NODE_OPTIONS T1385_BRONZE_NOCAP T1398_BRONZE_BAND
  TMPDIR="$T" T1420_EQ=1 LAB_SEEDCACHE="$seeds" T1420_FP="$J/fp.json" T1420_FP_FROM="$fpFrom" T1420_FP_TO="$fpTo" \
    T1385_LAB_OUT="$J/probe.json" T1407_LAB_OUT="$J/t1407.json" T1475_OUT="$J/t1475.json" T17_JSON="$J/t17.json" \
    NODE_OPTIONS="$HEAP $obsR" node scripts/t17-metrics.js "$days" "$seed" > "$J/run.log" 2>&1; rc=$?
  cd "$ROOT"
  local sec=$(( $(date +%s) - t0 )) R="$OUT/runs/$tag" K="$W/keep/$tag"
  gzip -c "$J/fp.json" > "$R.fp.json.gz"
  [ -f "$J/t1475.json" ] && gzip -c "$J/t1475.json" > "$K.t1475.json.gz"
  [ -f "$J/t1407.json" ] && gzip -c "$J/t1407.json" > "$K.t1407.json.gz"
  tail -n 40 "$J/run.log" > "$R.run-tail.log"
  printf '{"tag":"%s","map":"%s","kind":"%s","seed":%s,"days":%s,"rc":%s,"sec":%s,"head":"%s"}\n' "$tag" "$map" "$kind" "$seed" "$days" "$rc" "$sec" "$(git -C "$wt" rev-parse --short HEAD)" > "$R.done"
  case "$J" in "$W/"?*) rm -rf -- "$J";; esac
  echo "$(date -u +%m-%dT%H:%M) $tag rc=$rc ${sec}s"
}
export -f job
export HEAP
JOBS=("new obs 7 1900" "new obs 42 1900" "new obs 1020 400" "old obs 7 400" "old obs 42 400" "old obs 1020 400" "new ctl 1020 400")
[ "${ONLY:-}" ] && JOBS=("$ONLY")
printf '%s\n' "${JOBS[@]}" | xargs -P "$PAR" -I{} bash -c 'job {}'
echo "끝 $(date -u +%FT%TZ)"
