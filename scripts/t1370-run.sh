#!/usr/bin/env bash
# === scripts/t1370-run.sh — 끔 기본 손잡이를 하나씩 켠 서버 자 판 [T1370 · S13 · 2026-11-18] ======================
# (@regress 없음 — 러너 밖 · 판 도구 · 제품 손 0)
#
# ★무엇: `$OUT/knobs.tsv`(이름 \t env 줄 — 짝에 기대는 손잡이는 짝과 같이)마다 `server-baseline-check.js --make`(판 조건 그대로 ·
#   시드 · 날 · 가상 시계)를 켬 env 로 한 판 돌리고, 판 JSON(`sbc-<시드>.json` — t577 판 끝 수)을 `$OUT/runs/<이름>-<시드>.json` 에 둔다.
#   기준선 견줌이 아니라 판 끝 수를 뜬다(표는 `scripts/t1370-table.js`).
# ★이어 돌기: `$OUT/runs/<이름>-<시드>.done` 이 있으면 건너뛴다(재기동 뒤 그대로 다시 부르면 된다).
# ★자리: TMPDIR = `$WORK/tmp`(기본 /dev/shm/t1370) — 판 디렉터리(판 DB 1~2 GB)는 판 JSON 을 옮긴 뒤 지운다(판 사이 /tmp 0).
# ★멈춤: 판 디렉터리에 300초 동안 새 글자가 없으면 멈춤으로 끊는다(`STALL_SEC`) · 판 하나 시한 `MAX_SEC`(기본 7200).
#
#   OUT=계측/T1370_2026-11-18 SEED=1020 PAR=2 nohup bash scripts/t1370-run.sh > log 2>&1 &
#   ONLY="T1302_TERR_BODY T1329_TERR_CREW" SEED=7 … — 이 이름만
set -u
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
OUT="${OUT:-계측/T1370_2026-11-18}"; SEED="${SEED:-1020}"; DAYS="${DAYS:-400}"; PAR="${PAR:-2}"
WORK="${WORK:-/dev/shm/t1370}"; STALL_SEC="${STALL_SEC:-300}"; MAX_SEC="${MAX_SEC:-7200}"
mkdir -p "$OUT/runs" "$WORK/tmp" "$WORK/mk" "$WORK/log"
export ROOT OUT SEED DAYS WORK STALL_SEC MAX_SEC

one() {
  local name="$1" envs="$2" tag="$1-$SEED"
  [ -f "$OUT/runs/$tag.done" ] && return 0
  local log="$WORK/log/$tag.log" t0; t0=$(date +%s)
  # shellcheck disable=SC2086
  setsid env TMPDIR="$WORK/tmp" $envs node scripts/server-baseline-check.js --make "$WORK/mk/$tag.json" --seeds "$SEED" --days "$DAYS" --vclock >"$log" 2>&1 &   # 제 프로세스 묶음(끊을 때 이 판만)
  local pid=$! dir="" why="" last
  while kill -0 "$pid" 2>/dev/null; do
    sleep 15
    [ -z "$dir" ] && dir="$(grep -oE "판 $WORK/tmp/sbc-[A-Za-z0-9]+" "$log" | head -1 | sed 's/^판 //')"
    local now; now=$(date +%s)
    if [ $((now - t0)) -gt "$MAX_SEC" ]; then why="시한 ${MAX_SEC}초"; fi
    if [ -n "$dir" ] && [ -z "$why" ]; then
      last=$(find "$dir" -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1 | cut -d. -f1)
      [ -n "$last" ] && [ $((now - last)) -gt "$STALL_SEC" ] && why="멈춤 ${STALL_SEC}초(새 글자 없음)"
    fi
    if [ -n "$why" ]; then kill -TERM -- "-$pid" 2>/dev/null; sleep 3; kill -KILL -- "-$pid" 2>/dev/null; break; fi
  done
  wait "$pid" 2>/dev/null; local rc=$?
  local sec=$(( $(date +%s) - t0 ))
  [ -z "$dir" ] && dir="$(grep -oE "판 $WORK/tmp/sbc-[A-Za-z0-9]+" "$log" | head -1 | sed 's/^판 //')"
  local ok=0
  if [ -n "$dir" ] && [ -f "$dir/sbc-$SEED.json" ]; then cp "$dir/sbc-$SEED.json" "$OUT/runs/$tag.json" && ok=1; fi
  local lastday=""; [ -n "$dir" ] && [ -f "$dir/sbc-$SEED.json.sbc.json" ] && lastday=$(node -e "try{const f=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));const d=f.days||[];console.log(d.length?d[d.length-1][0]:'')}catch(e){}" "$dir/sbc-$SEED.json.sbc.json")
  printf '{"name":"%s","seed":%s,"env":"%s","rc":%s,"sec":%s,"json":%s,"why":"%s","lastDay":"%s"}\n' "$name" "$SEED" "$envs" "$rc" "$sec" "$ok" "$why" "$lastday" > "$OUT/runs/$tag.done"
  tail -3 "$log" > "$OUT/runs/$tag.tail.txt"
  # 판 JSON 이 없으면(판 실패) 판 디렉터리를 지우기 전에 안쪽 판 로그 꼬리 · 마지막 econ 날을 남긴다(까닭은 캐지 않는다 — 날 한 줄)
  if [ "$ok" = 0 ] && [ -n "$dir" ] && [ -f "$dir/sbc-$SEED.log" ]; then
    tail -40 "$dir/sbc-$SEED.log" | cut -c1-300 > "$OUT/runs/$tag.runlog.tail.txt"
    [ -z "$lastday" ] && lastday="econ d$(grep -oE 'econ d[0-9]+' "$dir/sbc-$SEED.log" | tail -1 | grep -oE '[0-9]+$')(로그 마지막)"
    sed -i "s/\"lastDay\":\"\"/\"lastDay\":\"$lastday\"/" "$OUT/runs/$tag.done"
  fi
  [ -n "$dir" ] && case "$dir" in "$WORK/tmp/sbc-"*) rm -rf -- "$dir";; esac
  rm -f -- "$WORK/mk/$tag.json"
  echo "$(date -u +%H:%M) $tag rc=$rc ${sec}s json=$ok ${why}"
}
export -f one

if [ -n "${ONLY:-}" ]; then
  for n in $ONLY; do grep -P "^$n\t" "$OUT/knobs.tsv"; done
else cat "$OUT/knobs.tsv"; fi | while IFS=$'\t' read -r n e; do printf '%s\0%s\0' "$n" "$e"; done |
  xargs -0 -n 2 -P "$PAR" bash -c 'one "$0" "$1"'
echo "끝 $(date -u +%FT%TZ)"
