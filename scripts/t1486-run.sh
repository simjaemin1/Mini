#!/usr/bin/env bash
# === scripts/t1486-run.sh — 봇 든 세계에서 손잡이 넷을 켬 ↔ 끔(T1486 · 코드 손 0 · T1473 run.sh 꼴) ===
#   판 하나 = (팔 · 시드): 팔 = off(끔) | nobuild | react | npcdeath | terrseq. 끔 판은 시드마다 한 번(네 손잡이가 같이 쓴다 — 가상 시계 판은 결정론이라 같은 시드 끔 두 판은 바이트 같다).
#   판 자 = scripts/t577-server-run.js <날> <시드> + 가상 시계 + 봇 프리로드(scripts/t1486-bots.js · 봇 BOTS 명 · 손짓 DAY0 날부터).
#   이어 돌리기: done.txt 에 있는 판은 건너뜀. 판마다 끝 표시 runs/<팔>-<시드>.done · 끝에 ALL_DONE. 판마다 제 TMPDIR(끝나면 이 판이 만든 것만 지움).
#   env: ROOT · OUT · DAYS(60) · JOBS(2) · BOTS(8) · SEEDS("1020 7 42 …") · CAP_SEC(5400) · ARMS("off nobuild react npcdeath terrseq")
set -u
ROOT="${ROOT:?}"; OUT="${OUT:?}"; DAYS="${DAYS:-60}"; JOBS="${JOBS:-2}"; BOTS="${BOTS:-8}"; CAP_SEC="${CAP_SEC:-5400}"
SEEDS="${SEEDS:-1020 7 42 101 202 303 404 505 606 707}"; ARMS="${ARMS:-off nobuild react npcdeath terrseq}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT/runs" "$OUT/tmp" "$OUT/route-cache"; touch "$OUT/done.txt"
envof() { case "$1" in off) echo "";; nobuild) echo "T1423_NO_BUILD=1";; react) echo "T1423_BLOCK_REACT=1";; npcdeath) echo "T1432_NPC_DEATH=1";; terrseq) echo "T1433_TERR_SEQ=1";; esac; }
echo "start $(date -u +%FT%TZ) $(git -C "$ROOT" rev-parse --short HEAD) days=$DAYS jobs=$JOBS bots=$BOTS seeds=[$SEEDS]" >> "$OUT/meta.txt"
one() {   # $1 = 팔  $2 = 시드
  local arm="$1" s="$2" tag="$1-$2"
  grep -q "^$tag " "$OUT/done.txt" && return 0
  local T="$OUT/tmp/$tag"; rm -rf "$T"; mkdir -p "$T"; local t0; t0=$(date +%s)
  ( cd "$ROOT" && env $(envof "$arm") TMPDIR="$T" T577_DIR="$T" T577_TAG=sbc T577_PAR=1 T745_VCLOCK=1 VILLAGE_DAY_MS=1440000 T699_ROUTE_CACHE="$OUT/route-cache" \
      T1486_OUT="$OUT/runs/$tag.json" T1486_BOTS="$BOTS" \
      NODE_OPTIONS="--max-old-space-size=4608 --require $HERE/t745-vclock.js --require $HERE/t1486-bots.js" \
      timeout "$CAP_SEC" node scripts/t577-server-run.js "$DAYS" "$s" > "$OUT/runs/$tag.out" 2>&1 )
  local rc=$? dt=$(( $(date +%s) - t0 ))
  if [ "$rc" = 124 ]; then for p in $(pgrep -x node); do grep -qz "^TMPDIR=$T\$" "/proc/$p/environ" 2>/dev/null && kill "$p"; done; fi
  [ -f "$T/sbc-$s.json" ] && cp "$T/sbc-$s.json" "$OUT/runs/$tag.sbc.json"
  [ -f "$T/sbc-$s.log" ] && gzip -c "$T/sbc-$s.log" > "$OUT/runs/$tag.log.gz"
  echo "$tag $rc $dt" >> "$OUT/done.txt"
  touch "$OUT/runs/$tag.done"
  rm -rf "$T"
}
export -f one envof; export OUT ROOT DAYS CAP_SEC HERE BOTS
for s in $SEEDS; do for a in $ARMS; do printf '%s\t%s\n' "$a" "$s"; done; done \
  | xargs -P "$JOBS" -d '\n' -I{} bash -c 'IFS=$'"'"'\t'"'"' read -r a s <<< "$1"; one "$a" "$s"' _ {}
echo "done $(date -u +%FT%TZ)" >> "$OUT/meta.txt"
echo "ALL DONE $(date -u +%FT%TZ)" > "$OUT/ALL_DONE"
