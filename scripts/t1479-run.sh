#!/usr/bin/env bash
# === scripts/t1479-run.sh — 붓는 쪽(주조) 날마다 뜨기 + 1020 농촌18 들어온 길 + 관찰기 무변 견줌 [T1479 · S13 · 2026-11-24] ======
# (@regress 없음 — 러너 밖 · 판 도구 · 제품 손 0 · 하네스 손 0)
# 두 지도 = 두 작업 트리(T1456 · T1475 와 같은 두 커밋 — old = e1f373769 · new = ca0233b51). 지도마다 TMPDIR(시딩 캐시)를 따로 둔다.
# 판(지도 × 종류 × 시드 × 날수) — 끝나면 `$OUT/runs/<태그>.done`:
#   obs = 관찰기 셋(t1385 · t1407 · t1479) 판. 시드 7 · 42 = 1,450날(관찰 1,000~1,450 · 지문 1,351~1,450) · 1020 = 400날(관찰 1~400 · 모든 마을 가벼운 칸 · 농촌18 들어온 길 · 지문 1~400).
#   ctl = 같은 판에서 t1479 만 뺀 것(관찰기 무변 견줌 — new 1020 400날 · new 7 1,450날).
#   OUT=계측/T1479_2026-11-24 PAR=3 setsid nohup bash scripts/t1479-run.sh > /dev/shm/t1479.log 2>&1 < /dev/null &
set -u
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
OUT="${OUT:-계측/T1479_2026-11-24}"; PAR="${PAR:-3}"; W="${W:-/dev/shm/t1479}"
WT_OLD="${WT_OLD:-$W/wt-old}"; WT_NEW="${WT_NEW:-$W/wt-new}"
OUT="$ROOT/$OUT"; mkdir -p "$OUT/runs" "$W/keep"
export ROOT OUT W WT_OLD WT_NEW
HEAP=--max-old-space-size=6144
for wt in "$WT_OLD" "$WT_NEW"; do cp "$ROOT/scripts/t1479-observe.js" "$wt/scripts/t1479-observe.js"; done

job() {   # job <지도> <종류> <시드> <날수>
  local map="$1" kind="$2" seed="$3" days="$4" tag="$1-$2-$3"
  [ -f "$OUT/runs/$tag.done" ] && return 0
  local wt; [ "$map" = old ] && wt="$WT_OLD" || wt="$WT_NEW"
  local T="$W/$map/tmp"; mkdir -p "$T/durango-eq-cache"
  local seeds="$T/durango-eq-cache/lab-seeds-hanbando-$seed.json" J="$W/$map/$tag"
  rm -rf -- "$J"; mkdir -p "$J"
  local fpFrom=1351 fpTo=1450 oFrom=1000 oTo=1450 feed="" all=0
  [ "$days" -lt 1450 ] && { fpFrom=1; fpTo="$days"; oFrom=1; oTo="$days"; feed="농촌18"; all=1; }
  local obsR="-r $wt/scripts/t1385-lab-probe.js -r $wt/scripts/t1407-observe.js"
  [ "$kind" = obs ] && obsR="$obsR -r $wt/scripts/t1479-observe.js"
  local t0; t0=$(date +%s); local rc
  cd "$wt" || return 2
  unset NODE_OPTIONS T1385_BRONZE_NOCAP T1398_BRONZE_BAND
  TMPDIR="$T" T1420_EQ=1 LAB_SEEDCACHE="$seeds" T1420_FP="$J/fp.json" T1420_FP_FROM="$fpFrom" T1420_FP_TO="$fpTo" \
    T1385_LAB_OUT="$J/probe.json" T1407_LAB_OUT="$J/t1407.json" T1479_OUT="$J/t1479.json" T1479_FROM="$oFrom" T1479_TO="$oTo" T1479_FEED="$feed" T1479_ALL="$all" T17_JSON="$J/t17.json" \
    NODE_OPTIONS="$HEAP $obsR" node scripts/t17-metrics.js "$days" "$seed" > "$J/run.log" 2>&1; rc=$?
  cd "$ROOT"
  local sec=$(( $(date +%s) - t0 )) R="$OUT/runs/$tag" K="$W/keep/$tag"
  gzip -c "$J/fp.json" > "$R.fp.json.gz"
  [ -f "$J/t1479.json" ] && gzip -c "$J/t1479.json" > "$K.t1479.json.gz"
  [ -f "$J/t1407.json" ] && gzip -c "$J/t1407.json" > "$K.t1407.json.gz"
  tail -n 40 "$J/run.log" > "$R.run-tail.log"
  printf '{"tag":"%s","map":"%s","kind":"%s","seed":%s,"days":%s,"rc":%s,"sec":%s,"head":"%s"}\n' "$tag" "$map" "$kind" "$seed" "$days" "$rc" "$sec" "$(git -C "$wt" rev-parse --short HEAD)" > "$R.done"
  case "$J" in "$W/"?*) rm -rf -- "$J";; esac
  echo "$(date -u +%m-%dT%H:%M) $tag rc=$rc ${sec}s"
}
export -f job
export HEAP
JOBS=("new obs 1020 400" "new ctl 1020 400" "old obs 1020 400" "new obs 7 1450" "new obs 42 1450" "old obs 7 1450" "old obs 42 1450" "new ctl 7 1450")
[ "${ONLY:-}" ] && JOBS=("$ONLY")
printf '%s\n' "${JOBS[@]}" | xargs -P "$PAR" -I{} bash -c 'job {}'
echo "끝 $(date -u +%FT%TZ)"
