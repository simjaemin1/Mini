#!/usr/bin/env bash
# 회귀 전수 — **순차 실행 전용**(포트 3010/3020 공유라 동시에 돌리면 EADDRINUSE 로 거짓 실패한다).
# 사용: bash scripts/run-regressions.sh  → /tmp/reg/*.log · 요약은 stdout
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
OUT=${OUT:-/tmp/reg}; mkdir -p "$OUT"
killport() { local p=$1 pids; pids=$(ss -lptn "sport = :$p" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); [ -n "$pids" ] && kill $pids 2>/dev/null; sleep 2; }

run() { # run <이름> <타임아웃초> <명령...>
  local name=$1 to=$2; shift 2
  killport 3020; killport 3010
  echo "▶ $name …"
  ( ZDB="/tmp/reg-$name.db" timeout "$to" "$@" ) > "$OUT/$name.log" 2>&1
  local rc=$?
  local last; last=$(grep -Eo '[0-9]+ *(통과|pass)[^0-9]*[0-9]+ *(실패|fail)|통과 [0-9]+ · 실패 [0-9]+|[0-9]+ 통과 / [0-9]+ 실패' "$OUT/$name.log" | tail -1)
  echo "   $name rc=$rc  ${last:-$(tail -1 "$OUT/$name.log" | cut -c1-100)}"
}

rm -f /tmp/reg-*.db
run rooms       900 node scripts/e2e-rooms.js
run cutaway     900 node scripts/e2e-cutaway.js
run metallurgy  900 node scripts/e2e-metallurgy.js
run village    1200 node scripts/e2e-village.js
run guest       900 node scripts/e2e-guest-reconnect.js
# ★지형 렌더 계열 — 배치 19~22. 물·타일상태·산 덮개·산 가림.
run waterperf  1200 node scripts/e2e-waterperf.js
run tilestate  1500 node scripts/e2e-tilestate.js
run mountain    900 node scripts/e2e-mountain.js
run mtocc       900 node scripts/e2e-mtocc.js
run mtfuzz      900 node scripts/e2e-mtfuzz.js
run mtfoot      900 node scripts/e2e-mtfoot.js
killport 3020; killport 3010
echo "── 로그: $OUT/"
