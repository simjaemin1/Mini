#!/usr/bin/env bash
# 개발용 존/센트럴 기동 헬퍼.
# ★pkill 패턴을 **셸 명령줄에 두지 마라** — 이 프로젝트에서 실제로 자기 셸을 죽였다(자살 함정).
#   그래서 종료는 포트 점유 PID 로만 한다.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CPORT=${CPORT:-3010}; ZPORT=${ZPORT:-3020}
ZDB=${ZDB:-/tmp/dev-zone.db}

killport() { local p=$1; local pids; pids=$(ss -lptn "sport = :$p" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); [ -n "$pids" ] && kill $pids 2>/dev/null; sleep 1; }

case "${1:-up}" in
  down) killport "$ZPORT"; killport "$CPORT"; echo "내렸다"; exit 0;;
esac

killport "$ZPORT"; killport "$CPORT"
cd "$ROOT"
PORT=$CPORT PUBLIC_HOST=localhost ENABLED_ZONES=hanbando node server/central.js > /tmp/dev-central.log 2>&1 &
sleep 3
PORT=$ZPORT ZONE_ID=hanbando DB_PATH="$ZDB" CENTRAL_URL="http://localhost:$CPORT" \
  ENABLE_VILLAGES=${ENABLE_VILLAGES:-1} ENABLE_BANDITS=0 node server/zone.js > /tmp/dev-zone.log 2>&1 &
for i in $(seq 1 150); do curl -sf "http://localhost:$ZPORT/health" >/dev/null 2>&1 && { echo "존 기동 완료 ($i×2초)"; exit 0; }; sleep 2; done
echo "존 기동 실패 — /tmp/dev-zone.log 마지막:"; tail -20 /tmp/dev-zone.log; exit 1
