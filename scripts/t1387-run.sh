#!/usr/bin/env bash
# === scripts/t1387-run.sh — 긴 판: 끔 세계 1,200날 · 전쟁 판 800날 × T1349 손잡이 끔 · 켬 [T1387 · S13 · 2026-11-21] ======
# (@regress 없음 — 러너 밖 · 판 도구 · 제품 손 0 · 하네스 손 0)
#
# ★판 조건: 끔 세계 = T1371 `run.sh` 그대로(`server-baseline-check --make … --days 1200 --seeds S --vclock --par 1` + 날 줄 관찰기
#   `t1371-observe.js`) · 전쟁 판 = T1349 §7 C 그대로(`--war inf --vclock --days 800 --seeds S --par 1` — 판 자가 아이 힙 4,608 MB 를 붙인다).
#   둘 다 `t1349-mem-hook.js`(날마다 힙 · RSS 한 줄)를 얹는다 — 둘 다 읽기만 · 세계에 0.
#   켬 팔 = env `T1349_WAR_PATH_SHARE=1`.
# ★줄: `$OUT/queue.tsv`(태그 \t 종류(off|war) \t 시드 \t 날 \t env) — 한 번에 `PAR`(기본 2)까지 · `.done` 이 있으면 건너뛴다(재기동 뒤 그대로 다시 부른다).
# ★멎음: 날 줄(`*.t1371.jsonl`)이 `STALL_SEC`(기본 1800)초 동안 안 늘면 멈춤 · 판 하나 시한 `MAX_SEC`(끔 21600 · 전쟁 57600).
#   끊을 때 SIGTERM → 60초 → SIGKILL(제 프로세스 묶음만).
# ★봉우리 RSS: 지킴이가 15초마다 제 프로세스 묶음 RSS 합을 본다(`peakRssMB`) · 날 줄 힙 · RSS 는 mem-hook 쪽.
# ★자리: 판 폴더 `$WORK/<태그>`(기본 /dev/shm/t1387 — `/` 가 꽉 차 있다) · 교역로 캐시 `$WORK/route-cache` · 판 끝에 자료를 gz 로
#   `$OUT/runs/` 에 옮기고 판 폴더(DB)를 지운다. 멎은 판은 멎기 앞 50날 날 줄 · 존 로그 끝 200줄을 따로 남긴다(읽지 않는다).
#
#   OUT=계측/T1387_2026-11-21 PAR=2 setsid nohup bash scripts/t1387-run.sh > /dev/shm/t1387.log 2>&1 < /dev/null &
set -u
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
OUT="${OUT:-계측/T1387_2026-11-21}"; PAR="${PAR:-2}"; WORK="${WORK:-/dev/shm/t1387}"; STALL_SEC="${STALL_SEC:-1800}"
mkdir -p "$OUT/runs" "$WORK/route-cache"
export ROOT OUT WORK STALL_SEC

one() {
  local tag="$1" kind="$2" seed="$3" days="$4" envs="$5"
  [ -f "$OUT/runs/$tag.done" ] && return 0
  local J="$WORK/$tag"; rm -rf -- "$J"; mkdir -p "$J"
  local max; if [ "$kind" = war ]; then max="${MAX_WAR:-57600}"; else max="${MAX_OFF:-21600}"; fi
  local args="--days $days --seeds $seed --vclock --par 1 --route-cache $WORK/route-cache"
  [ "$kind" = war ] && args="--war inf $args"
  local t0; t0=$(date +%s)
  # shellcheck disable=SC2086
  setsid env TMPDIR="$J" NODE_OPTIONS="--require $ROOT/scripts/t1371-observe.js --require $ROOT/scripts/t1349-mem-hook.js" $envs \
    node scripts/server-baseline-check.js --make "$J/make.json" $args > "$J/check.log" 2>&1 &
  local pid=$! why="" peak=0 lastn=0 lastt=$t0 dl=""
  while kill -0 "$pid" 2>/dev/null; do
    sleep 15
    local now; now=$(date +%s)
    local rss; rss=$(ps -o rss= -g "$pid" 2>/dev/null | awk '{s+=$1} END{print int(s/1024)}'); [ -n "$rss" ] && [ "$rss" -gt "$peak" ] && peak=$rss
    [ -z "$dl" ] && dl=$(ls "$J"/sbc-*/sbc-"$seed".json.t1371.jsonl 2>/dev/null | head -1)
    if [ -n "$dl" ]; then local n; n=$(wc -l < "$dl"); if [ "$n" -gt "$lastn" ]; then lastn=$n; lastt=$now; fi; fi
    [ $((now - t0)) -gt "$max" ] && why="시한 ${max}초"
    [ -z "$why" ] && [ $((now - lastt)) -gt "$STALL_SEC" ] && why="멈춤(날 줄 ${STALL_SEC}초 안 늚)"
    if [ -n "$why" ]; then kill -TERM -- "-$pid" 2>/dev/null; sleep 60; kill -KILL -- "-$pid" 2>/dev/null; break; fi
  done
  wait "$pid" 2>/dev/null; local rc=$?
  local sec=$(( $(date +%s) - t0 ))
  local D; D=$(ls -d "$J"/sbc-* 2>/dev/null | head -1)
  local R="$OUT/runs/$tag" last=""
  if [ -n "$D" ]; then
    [ -f "$D/sbc-$seed.json.t1371.jsonl" ] && { gzip -c "$D/sbc-$seed.json.t1371.jsonl" > "$R.t1371.jsonl.gz"; last=$(tail -1 "$D/sbc-$seed.json.t1371.jsonl" | grep -oE '^\[[0-9]+' | tr -d '['); }
    [ -f "$D/sbc-$seed.json.t1349-mem.jsonl" ] && gzip -c "$D/sbc-$seed.json.t1349-mem.jsonl" > "$R.mem.jsonl.gz"
    [ -f "$D/sbc-$seed.json" ] && gzip -c "$D/sbc-$seed.json" > "$R.run.json.gz"
    [ -f "$D/sbc-$seed.json.sbc.json" ] && gzip -c "$D/sbc-$seed.json.sbc.json" > "$R.sbc.json.gz"
    if [ ! -f "$D/sbc-$seed.json" ]; then   # 멎은 판 — 멎기 앞 50날 날 줄 · 존 로그 끝 200줄(읽지 않고 남긴다)
      [ -f "$D/sbc-$seed.json.t1371.jsonl" ] && tail -n 50 "$D/sbc-$seed.json.t1371.jsonl" | gzip -c > "$R.last50.jsonl.gz"
      [ -f "$D/sbc-$seed.log" ] && tail -n 200 "$D/sbc-$seed.log" | gzip -c > "$R.zone-tail200.log.gz"
    fi
  fi
  [ -f "$J/make.json" ] && gzip -c "$J/make.json" > "$R.make.json.gz"
  tail -n 40 "$J/check.log" > "$R.check-tail.log" 2>/dev/null
  local json=0; [ -n "$D" ] && [ -f "$D/sbc-$seed.json" ] && json=1
  printf '{"tag":"%s","kind":"%s","seed":%s,"days":%s,"env":"%s","rc":%s,"sec":%s,"json":%s,"why":"%s","lastDay":"%s","peakRssMB":%s}\n' \
    "$tag" "$kind" "$seed" "$days" "$envs" "$rc" "$sec" "$json" "$why" "$last" "$peak" > "$R.done"
  case "$J" in "$WORK/"?*) rm -rf -- "$J";; esac
  echo "$(date -u +%m-%dT%H:%M) $tag rc=$rc ${sec}s 끝날=$last json=$json 봉우리=${peak}MB $why"
}
export -f one

grep -v '^#' "$OUT/queue.tsv" | while IFS=$'\t' read -r t k s d e; do [ -n "$t" ] && printf '%s\0%s\0%s\0%s\0%s\0' "$t" "$k" "$s" "$d" "$e"; done |
  xargs -0 -n 5 -P "$PAR" bash -c 'one "$0" "$1" "$2" "$3" "$4"'
echo "끝 $(date -u +%FT%TZ)"
