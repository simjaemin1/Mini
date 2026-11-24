#!/usr/bin/env bash
# === scripts/live-ping.sh — 밖에서 보는 생존 확인 한 줄(T1443 ②) — 몸은 `scripts/live-ping.js` ==========
#   bash scripts/live-ping.sh            # 표 + 판정 · 종료 0 = 살았다 · 1 = 빨강(세 번 다 실패)
#   bash scripts/live-ping.sh --line     # 야간러너 보고 첫 줄
#   bash scripts/live-ping.sh --json
#   핑 · TCP 연결만으로 "살았다"고 하지 않는다 — 게임 주소 · central · 존마다 HTTP 답(200 + 기대한 몸)이 와야 산 것이다.
set -u
exec node "$(cd "$(dirname "$0")" && pwd)/live-ping.js" "$@"
