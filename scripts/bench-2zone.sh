#!/usr/bin/env bash
# === scripts/bench-2zone.sh ===
# 시나리오 C(핸드오프 정합성) 전용 2존 기동기.
#   central(:3010) + hanbando(:3020) + nippon(:3021) 를 **각각 다른 env** 로 띄운다.
#   launch-all.js 는 모든 자식에 같은 env 를 물려주므로 여기선 쓸 수 없다
#   — 시작 인벤(ZONE_TEST_INV)을 **출발 존에만** 얹어야 "핸드오프로 건너왔다"를 증명할 수 있기 때문.
#
# 왜 hanbando↔nippon 인가: 실좌표가 맞닿아 있다.
#   hanbando rect=(409984,49984,70016x130016) → 동쪽 끝 480000
#   nippon   rect=(480000,49984,49984x130016) → 서쪽 끝 480000   (맞닿음)
#   ⇒ 동쪽으로만 넘나들면 이 두 존 밖으로는 절대 안 나간다(안 띄운 존에 handoff_prepare 갈 일 없음).
#
# 사용:  bash scripts/bench-2zone.sh start   |   stop   |   status
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="${BENCH2Z_DIR:-/root/benchlocal}"
INV="${ZONE_TEST_INV:-pillar:6,rafter:8,thatch:8}"
# ⚠ZONE_TEST_INV 는 central 이 살아 있으면 **무력화된다**(게스트도 central 행 복원 경로를 타서
#   inventory 가 계정 값으로 덮인다 — zone.js:2898). 그래서 실제 지급은 `__e2e_give`(E2E_GIVE=1)로 한다.
#   INV 는 그 사실을 기록으로 남기기 위해 그대로 둔다.
mkdir -p "$RUN/data"

start() {
  # 존 DB 를 매번 새로 — 이전 회차 인벤이 남아 보존 검사를 오염시키지 않게.
  rm -f "$RUN"/data/*.db "$RUN"/data/*.db-journal 2>/dev/null
  cd "$ROOT"
  DB_PATH="$RUN/data/central.db" PORT=3010 \
    node --experimental-sqlite server/central.js  > "$RUN/central.log" 2>&1 &
  sleep 2
  # ★출발 존만 시작 인벤을 얹는다. 도착 존에서 이 물건이 보이면 = 핸드오프가 옮긴 것.
  #   E2E_GIVE=1 도 **출발 존에만**. 도착 존에 없으니, 도착 존에서 보이는 물건은
  #   전부 "핸드오프가 옮긴 것"이다(도착 존이 스스로 만들어 줄 방법이 없다).
  DB_PATH="$RUN/data/world-hanbando.db" ZONE_ID=hanbando PORT=3020 ZONE_TEST_INV="$INV" E2E_GIVE=1 \
    ENABLE_VILLAGES=0 ENABLE_WILDLIFE=0 ENABLE_BANDITS=0 \
    node --experimental-sqlite server/zone.js    > "$RUN/hanbando.log" 2>&1 &
  DB_PATH="$RUN/data/world-nippon.db"   ZONE_ID=nippon   PORT=3021 \
    ENABLE_VILLAGES=0 ENABLE_WILDLIFE=0 ENABLE_BANDITS=0 \
    node --experimental-sqlite server/zone.js    > "$RUN/nippon.log" 2>&1 &
  for i in $(seq 1 180); do
    ok=0
    for p in 3010 3020 3021; do
      curl -sf -m2 "http://127.0.0.1:$p/health" >/dev/null 2>&1 && ok=$((ok+1))
    done
    [ "$ok" -eq 3 ] && { echo "✅ central·hanbando·nippon 기동 (${i}초)"; exit 0; }
    sleep 1
  done
  echo "❌ 180초 안에 셋 다 안 떴다"; tail -5 "$RUN"/*.log; exit 1
}

stop() {
  pkill -f "server/zon[e].js" 2>/dev/null
  pkill -f "server/centra[l].js" 2>/dev/null
  sleep 2
  echo "정지 — 남은 프로세스 $(pgrep -cf 'server/zon[e].js|server/centra[l].js' 2>/dev/null || echo 0)개"
}

status() {
  for p in 3010 3020 3021; do
    printf "%s " "$p"; curl -s -m2 -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:$p/health"
  done
}

case "${1:-start}" in
  start) start ;;
  stop)  stop ;;
  status) status ;;
  *) echo "사용: $0 start|stop|status"; exit 2 ;;
esac
