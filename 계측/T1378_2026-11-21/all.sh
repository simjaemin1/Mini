#!/usr/bin/env bash
# (러너 밖 · T1378 여섯 판을 차례로 — 한 번에 한 판 · 판마다 timeout 35분) — 쓰는 법: all.sh <로그 디렉터리>
set -u
HERE=$(cd "$(dirname "$0")" && pwd); LOGD=$1
#      이름     의뢰봇 걷는봇 마을
RUNS=("b0 0 0 6" "b20 10 10 6" "b50 25 25 6" "b100 50 50 6" "b200 100 100 6" "crowd100 100 0 1")
for r in "${RUNS[@]}"; do
  set -- $r
  echo "=== $1 start $(date +%T)"
  timeout 2100 "$HERE/run.sh" "$1" "$2" "$3" "$4" "$HERE/runs/$1" "$LOGD/$1" > "$LOGD/$1.log" 2>&1
  echo "=== $1 exit $? $(date +%T)"
  pkill -9 -f "/home/user/wt-botload/server/(zone|central).js" 2>/dev/null
  rm -f /tmp/t1341-bots-*.db* /tmp/t1378-*.db*
  sleep 5
done
