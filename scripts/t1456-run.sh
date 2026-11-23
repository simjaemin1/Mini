#!/usr/bin/env bash
# === scripts/t1456-run.sh — 새 주석 지도로 평형 저장본(1,900날 · 세 시드)을 다시 굽고 옛 지도와 견준다 [T1456 · S13 · 2026-11-23] ======
# (@regress 없음 — 러너 밖 · 판 도구 · 제품 손 0 · 하네스 손 0)
#
# ★두 지도 = 두 작업 트리(지도 파일 둘만 다르다 — `lab/map-editor-layers.json` · `server/hanbando-terrain.json`):
#   old = `origin/batch/eq-bind-1122`(T1426 끝 · 코드 지문 94df5705…) · new = 그 위에 `origin/batch/tin-map-1122`(T1427) merge.
#   `WT_OLD` · `WT_NEW`(기본 /dev/shm/t1456/wt-old · wt-new). 지도마다 TMPDIR 따로 → 저장본 캐시 · 시딩 캐시가 지도마다 따로(T1427 ⚠).
# ★판 넷(지도 × 시드마다):
#   bake  = `eq-run --seed S --from make:1900 --days 100 --fp-days 1901-2000` — 저장본 굽기(만든 시간 = 메타 makeSec) + 되살려 100날 지문.
#   ref   = 안 끊은 2,000날(`t17-metrics` · T1426 §1 과 같은 env — `T1420_EQ=1 T1420_SAVE_AT=1900` · 지문 1,801 ~ 2,000 · 관측 줄 날 1 부터) —
#           되살림 견줌(1,901 ~ 2,000)과 평형 기준(C1 · C2 · C3 든 날)의 판.
#   obs   = 1,900날 + 관찰기 둘(`t1385-lab-probe` · `t1407-observe` 맨 뒤 — 읽기만) · 지문 1,801 ~ 1,900(ref 와 같으면 관찰기가 세계를 안 바꿈).
#   plus-<팔> = 저장본에서 +730날(`eq-run --no-off --arm <팔>=…` · 관찰기 둘) — 팔 off(env 없음) · bundle(T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1).
#   bake 가 먼저(시딩 캐시를 만든다) — 나머지는 그 뒤 한 번에 `PAR`(기본 3)까지.
# ★자리: 판은 `$W`(/dev/shm/t1456 — `/` 가 꽉 차 있다) · 끝난 판의 작은 것(eq-run.json · 관측 · 지문 · 저장본 메타)만 `$OUT/runs/` 에 gz.
#   관찰기 날것(마을-날 줄)은 `$W/keep/` 에 gz 로 두고 표 자가 읽어 요약만 레포에 남긴다. `.done` 이 있으면 건너뛴다(재기동 뒤 다시 부른다).
#
#   OUT=계측/T1456_2026-11-23 PAR=3 setsid nohup bash scripts/t1456-run.sh > /dev/shm/t1456.log 2>&1 < /dev/null &
set -u
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
OUT="${OUT:-계측/T1456_2026-11-23}"; PAR="${PAR:-3}"; W="${W:-/dev/shm/t1456}"
WT_OLD="${WT_OLD:-$W/wt-old}"; WT_NEW="${WT_NEW:-$W/wt-new}"; SEEDS="${SEEDS:-1020 7 42}"
OUT="$ROOT/$OUT"; mkdir -p "$OUT/runs" "$W/keep"
export ROOT OUT W WT_OLD WT_NEW
HEAP=--max-old-space-size=6144

job() {   # job <지도> <종류> <시드>
  local map="$1" kind="$2" seed="$3" tag="$1-$2-$3"
  [ -f "$OUT/runs/$tag.done" ] && return 0
  local wt; [ "$map" = old ] && wt="$WT_OLD" || wt="$WT_NEW"
  local T="$W/$map/tmp"; mkdir -p "$T"
  local seeds="$T/durango-eq-cache/lab-seeds-hanbando-$seed.json" J="$W/$map/$tag" K="$W/keep/$tag"
  rm -rf -- "$J"; mkdir -p "$J"
  local obsR="-r $wt/scripts/t1385-lab-probe.js -r $wt/scripts/t1407-observe.js"
  local t0; t0=$(date +%s); local rc
  cd "$wt" || return 2
  unset NODE_OPTIONS T1385_BRONZE_NOCAP T1398_BRONZE_BAND
  case "$kind" in
    bake) TMPDIR="$T" node scripts/eq-run.js --seed "$seed" --from make:1900 --days 100 --fp-days 1901-2000 --out "$J" > "$J/run.log" 2>&1; rc=$? ;;
    ref) TMPDIR="$T" T1420_EQ=1 LAB_SEEDCACHE="$seeds" T1420_SAVE_AT=1900 T1420_SAVE_DIR="$J/save" T1420_OBS="$J/ref.obs.json" T1420_FP="$J/ref.fp.json" \
           T1420_FP_FROM=1801 T1420_FP_TO=2000 NODE_OPTIONS="$HEAP" node scripts/t17-metrics.js 2000 "$seed" > "$J/run.log" 2>&1; rc=$?; rm -rf -- "$J/save" ;;
    obs) TMPDIR="$T" T1420_EQ=1 LAB_SEEDCACHE="$seeds" T1420_OBS="$J/obs.obs.json" T1420_FP="$J/obs.fp.json" T1420_FP_FROM=1801 T1420_FP_TO=1900 \
           T1385_LAB_OUT="$J/probe.json" T1407_LAB_OUT="$J/t1407.json" T17_JSON="$J/t17.json" NODE_OPTIONS="$HEAP $obsR" \
           node scripts/t17-metrics.js 1900 "$seed" > "$J/run.log" 2>&1; rc=$? ;;
    plus-off|plus-bundle)
      local save="$T/durango-eq-cache/$(cd "$wt" && node -e 'console.log(require("./scripts/lib-eq-lab").codeSig())')/lab-hanbando-$seed-d1900.v8.gz"
      [ -f "$save" ] || { echo "$tag 저장본 없음 $save"; cd "$ROOT"; return 1; }
      local arm="${kind#plus-}" envs="NODE_OPTIONS=$obsR,T1385_LAB_OUT=$J/probe.json,T1407_LAB_OUT=$J/t1407.json,T17_JSON=$J/t17.json"
      [ "$arm" = bundle ] && envs="$envs,T1385_BRONZE_NOCAP=1,T1398_BRONZE_BAND=1"
      TMPDIR="$T" node scripts/eq-run.js --seed "$seed" --from "$save" --days 730 --fp-days 1901-2000 --no-off --arm "$arm=$envs" --out "$J" > "$J/run.log" 2>&1; rc=$? ;;
    *) echo "종류 모름 $kind"; cd "$ROOT"; return 2 ;;
  esac
  cd "$ROOT"
  local sec=$(( $(date +%s) - t0 )) R="$OUT/runs/$tag"
  for f in "$J"/*.json "$J"/*.md; do [ -f "$f" ] || continue; case "$f" in *t1407.json|*probe.json) gzip -c "$f" > "$K.$(basename "$f").gz";; *) gzip -c "$f" > "$R.$(basename "$f").gz";; esac; done
  tail -n 60 "$J/run.log" > "$R.run-tail.log"
  if [ "$kind" = bake ]; then local m; m=$(ls "$T"/durango-eq-cache/*/lab-hanbando-"$seed"-d1900.v8.gz.meta.json 2>/dev/null | head -1); [ -n "$m" ] && cp "$m" "$R.save-meta.json"; fi
  printf '{"tag":"%s","map":"%s","kind":"%s","seed":%s,"rc":%s,"sec":%s,"head":"%s"}\n' "$tag" "$map" "$kind" "$seed" "$rc" "$sec" "$(git -C "$wt" rev-parse --short HEAD)" > "$R.done"
  case "$J" in "$W/"?*) rm -rf -- "$J";; esac
  echo "$(date -u +%m-%dT%H:%M) $tag rc=$rc ${sec}s"
}
export -f job
export HEAP

list() { for k in "$@"; do for s in $SEEDS; do for m in new old; do printf '%s\0%s\0%s\0' "$m" "$k" "$s"; done; done; done; }
list bake | xargs -0 -n 3 -P "$PAR" bash -c 'job "$0" "$1" "$2"'
list obs plus-off plus-bundle ref | xargs -0 -n 3 -P "$PAR" bash -c 'job "$0" "$1" "$2"'
echo "끝 $(date -u +%FT%TZ)"
