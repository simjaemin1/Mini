#!/bin/bash
# (@regress 없음 — 러너 밖 · T1308 감독 · 제품 무변)
# === scripts/t1308-guard.sh — 이어 도는 판 자(`t1308-long-run.js`)를 끝날 때까지 다시 부른다 ===========================
#   새 판:   scripts/t1308-guard.sh new <날> <시드> [--every N] [--dir D] [--tag T]     (판 조건 env 는 부르는 쪽이 준다)
#   잇기:    scripts/t1308-guard.sh resume <폴더>                                     (컨테이너가 다시 선 뒤 첫 세션이 부르는 한 줄)
#   잇기 전부: scripts/t1308-guard.sh resume-all [<뿌리=/tmp/t1308>]                  (뿌리 밑 progress.json 이 있고 done 이 아닌 폴더 모두 — 하나씩 뒤에 띄운다)
#   마디가 체크포인트 없이 죽으면(코드 3) 그 마디부터 다시 부른다 — 같은 마디가 T1308_GUARD_MAX(기본 3)번 연달아 죽으면 멈춘다(진행 줄 progress.txt 에 남는다).
#   감독 자신의 줄은 <폴더>/guard.log 에 붙인다.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAX="${T1308_GUARD_MAX:-3}"
run_dir() {   # $1 = 폴더(이미 progress.json 이 있다)
  local d="$1" n=0 last=-1
  while :; do
    local ck; ck=$(node -e "const p=require('$d/progress.json');console.log(p.done?'done':p.ck)")
    [ "$ck" = "done" ] && { echo "$(date -u +%FT%TZ) 끝 $d" >> "$d/guard.log"; return 0; }
    if [ "$ck" = "$last" ]; then n=$((n+1)); else n=0; last="$ck"; fi
    [ "$n" -ge "$MAX" ] && { echo "$(date -u +%FT%TZ) 같은 마디(체크포인트 날 $ck)가 $MAX 번 죽음 — 멈춤" >> "$d/guard.log"; return 1; }
    echo "$(date -u +%FT%TZ) 잇기 — 체크포인트 날 $ck" >> "$d/guard.log"
    node "$ROOT/scripts/t1308-long-run.js" --resume "$d" >> "$d/guard.log" 2>&1
    local c=$?
    [ $c -eq 0 ] && continue
    [ $c -ne 3 ] && { echo "$(date -u +%FT%TZ) 판 자 코드 $c — 멈춤" >> "$d/guard.log"; return $c; }
    sleep 5
  done
}
case "${1:-}" in
  new)
    shift
    out=$(node "$ROOT/scripts/t1308-long-run.js" "$@" 2>&1); c=$?
    echo "$out"
    d=$(echo "$out" | sed -n 's/.* · \(\/[^ ]*\) · 체크포인트 날 .*/\1/p' | head -1)
    [ $c -eq 0 ] && exit 0
    [ -n "$d" ] && [ -f "$d/progress.json" ] && { run_dir "$d"; exit $?; }
    exit $c ;;
  resume) run_dir "$(cd "$2" && pwd)"; exit $? ;;
  resume-all)
    base="${2:-/tmp/t1308}"
    for p in $(ls -d "$base"/*/ 2>/dev/null); do
      [ -f "$p/progress.json" ] || continue
      node -e "process.exit(require('${p}progress.json').done?1:0)" && { nohup "$0" resume "$p" > /dev/null 2>&1 & echo "잇기 띄움 $p"; }
    done ;;
  *) sed -n 2,8p "$0"; exit 2 ;;
esac
