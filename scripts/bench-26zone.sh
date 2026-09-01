#!/usr/bin/env bash
# === scripts/bench-26zone.sh ===
# 시나리오 D — "존 26개를 한 호스트에 올릴 수 있나"를 재는 판.
#   측정 대상: 존 하나가 **가만히 있을 때** 무는 값(RSS·CPU)과, 사람이 붙는 순간의 증분.
#   ⚠세계 시뮬(마을·야생·도적)은 기본 끈다. 26개를 마을까지 켜서 띄우면 부팅만 몇 시간이다.
#     그래서 이 판이 재는 것은 **프로세스·지형·틱 뼈대의 값**이고, 마을 든 존의 값이 아니다.
#     마을 든 존의 값은 실서버 hanbando(308MiB)와 아래 SIM_ZONE 한 곳으로 따로 잰다.
#
# 사용: bash scripts/bench-26zone.sh start [SIM_ZONE]   |   stop   |   ps
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="${BENCH26_DIR:-/root/benchlocal/d}"
mkdir -p "$RUN"

start() {
  cd "$ROOT"
  rm -f "$RUN"/*.log
  ENABLE_VILLAGES=0 ENABLE_WILDLIFE=0 ENABLE_BANDITS=0 \
    nohup node scripts/launch-all.js > "$RUN/launch.log" 2>&1 &
  echo "기동 시작 — /health 를 기다린다"
  local ids ok
  ids="$(node -e 'const{ZONES}=require("./server/zone-config");console.log(Object.keys(ZONES).map(i=>ZONES[i].port).join(" "))')"
  for i in $(seq 1 600); do
    ok=0
    for p in 3010 $ids; do curl -sf -m1 "http://127.0.0.1:$p/health" >/dev/null 2>&1 && ok=$((ok+1)); done
    if [ "$ok" -ge 27 ]; then echo "✅ central + 존 26개 기동 (${i}초)"; return 0; fi
    [ $((i % 20)) -eq 0 ] && echo "   … ${ok}/27 (${i}초)"
    sleep 1
  done
  echo "❌ 600초 안에 27개가 다 안 떴다 — 지금 ${ok}/27"; return 1
}

stop() { pkill -f "launch-al[l].js" 2>/dev/null; pkill -f "server/zon[e].js" 2>/dev/null
         pkill -f "server/centra[l].js" 2>/dev/null; pkill -f "server/dispatche[r].js" 2>/dev/null
         sleep 3; echo "남은 프로세스 $(pgrep -cf 'server/zon[e].js' 2>/dev/null || echo 0)개"; }

ps_() { pgrep -f "server/zon[e].js" | wc -l; }

case "${1:-start}" in start) start ;; stop) stop ;; ps) ps_ ;; *) echo "사용: $0 start|stop|ps"; exit 2 ;; esac
