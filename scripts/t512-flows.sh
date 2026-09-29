#!/usr/bin/env bash
# === scripts/t512-flows.sh — 존↔존 직접 흐름이 바다를 건널 때(T512 ① · 러너 밖 · root 필요) =======================
#
# ★판: 닛폰을 **제 네트워크 이름공간**(`t512tokyo` · 10.61.0.2)에 띄우고, 한반도·central·중원북은 바깥(10.61.0.1)에 둔다.
#   존↔존 · 닛폰→central 다리마다 `t498-delay-proxy`(한 방향 D ms) — 포트가 존 표에 박혀 있어 한 이름공간에선 같은 포트에 중계를 못 세운다.
#     한반도 → 닛폰   : 127.0.0.2:3021(바깥) → 10.61.0.2:3021           (한반도 `ZONE_HOST_NIPPON=127.0.0.2`)
#     닛폰 → 한반도   : 10.61.0.2:3020(안)  → 10.61.0.1:3020           (닛폰 `ZONE_HOST_HANBANDO=10.61.0.2`)
#     닛폰 → central  : 10.61.0.2:3010(안)  → 10.61.0.1:3010           (닛폰 `CENTRAL_HOST=10.61.0.2`)
#   브라우저 → 닛폰은 central 이 내주는 10.61.0.2:3021(직접 · 클라 지연은 이 카드 밖 — `LATENCY_MS`).
#   판마다: 존 넷을 새로 띄우고 → `t512-mover`(걷기 40s · 달리기 40s) → [e2e 판이면] `e2e-zone-cross` 외부 모드 → 끈다.
# 실행: bash scripts/t512-flows.sh   (OUT=/tmp/t512 · 판 목록은 아래 RUNS)
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=${OUT:-/tmp/t512}; rm -rf "$OUT"; mkdir -p "$OUT"
NS=t512tokyo
ip netns del $NS 2>/dev/null; ip link del t512a 2>/dev/null
ip netns add $NS && ip link add t512a type veth peer name t512b && ip link set t512b netns $NS
ip addr add 10.61.0.1/24 dev t512a && ip link set t512a up
ip netns exec $NS ip addr add 10.61.0.2/24 dev t512b; ip netns exec $NS ip link set t512b up; ip netns exec $NS ip link set lo up
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null; done; sleep 1; PIDS=(); }
trap 'cleanup; ip netns del $NS 2>/dev/null; ip link del t512a 2>/dev/null' EXIT
wait_h() { for i in $(seq 1 300); do curl -sf -m 2 "http://$1/health" >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }
PROBE="--require=$(pwd)/scripts/t512-probe.js"
COMMON="ENABLE_VILLAGES=0 ENABLE_WILDLIFE=0 ENABLE_BANDITS=0 ENABLE_ROADS=0"
run() {   # run <태그> <한 방향 ms> <유령 팔 0/1> <T498 팔 0/1> <e2e 0/1>
  local tag=$1 D=$2 GX=$3 HP=$4 E2E=$5 d="$OUT/$1"; mkdir -p "$d"; local DB=/tmp/t512db-$tag; rm -rf "$DB"; mkdir -p "$DB"
  node scripts/t498-delay-proxy.js 127.0.0.2:3021 10.61.0.2:3021 "$D" > "$d/px1.log" 2>&1 & PIDS+=($!)
  ip netns exec $NS node scripts/t498-delay-proxy.js 10.61.0.2:3020 10.61.0.1:3020 "$D" > "$d/px2.log" 2>&1 & PIDS+=($!)
  ip netns exec $NS node scripts/t498-delay-proxy.js 10.61.0.2:3010 10.61.0.1:3010 "$D" > "$d/px3.log" 2>&1 & PIDS+=($!)
  env PORT=3010 DB_PATH=$DB/c.db PUBLIC_HOST=localhost ENABLED_ZONES=hanbando,nippon,jungwon_n ZONE_HOST_NIPPON=10.61.0.2 node server/central.js > "$d/central.log" 2>&1 & PIDS+=($!)
  sleep 2
  local ZE="T512_GHOST_EXTRAP=$GX T498_HANDOFF_PAYLOAD=$HP T512_OUT=$d NODE_OPTIONS=$PROBE"
  env $COMMON $ZE PORT=3020 ZONE_ID=hanbando DB_PATH=$DB/h.db CENTRAL_HOST=127.0.0.1 CENTRAL_PORT=3010 ZONE_HOST_NIPPON=127.0.0.2 PUBLIC_HOST=localhost \
    node server/zone.js > "$d/hanbando.log" 2>&1 & PIDS+=($!)
  env $COMMON $ZE PORT=3016 ZONE_ID=jungwon_n DB_PATH=$DB/j.db CENTRAL_HOST=127.0.0.1 CENTRAL_PORT=3010 ZONE_HOST_NIPPON=127.0.0.2 PUBLIC_HOST=localhost \
    node server/zone.js > "$d/jungwon_n.log" 2>&1 & PIDS+=($!)
  ip netns exec $NS env $COMMON $ZE PORT=3021 ZONE_ID=nippon DB_PATH=$DB/n.db CENTRAL_HOST=10.61.0.2 CENTRAL_PORT=3010 ZONE_HOST_HANBANDO=10.61.0.2 ZONE_HOST_JUNGWON_N=10.61.0.1 PUBLIC_HOST=10.61.0.2 \
    node server/zone.js > "$d/nippon.log" 2>&1 & PIDS+=($!)
  wait_h 127.0.0.1:3020; wait_h 127.0.0.1:3016; wait_h 10.61.0.2:3021
  # 다리 왕복 한 번씩(HTTP /health 는 바깥 문 — 중계를 지나는 한 번의 벽시계)
  echo "$tag 다리: 한→닛 $(curl -s -o /dev/null -w '%{time_total}' http://127.0.0.2:3021/health)s · 닛→한 $(ip netns exec $NS curl -s -o /dev/null -w '%{time_total}' http://10.61.0.2:3020/health)s · 닛→central $(ip netns exec $NS curl -s -o /dev/null -w '%{time_total}' http://10.61.0.2:3010/health)s" | tee -a "$OUT/summary.txt"
  if [ "$E2E" = 1 ]; then
    env -u HTTPS_PROXY -u HTTP_PROXY -u https_proxy -u http_proxy ZX_EXTERNAL=http://127.0.0.1:3010 ZX_ROUNDS=5 node scripts/e2e-zone-cross.js --shots "$d/zx" > "$d/e2e.txt" 2>&1
    echo "$tag e2e $(grep '===' "$d/e2e.txt" | tail -1)" | tee -a "$OUT/summary.txt"
  else
    node scripts/t512-mover.js http://127.0.0.1:3010 40 40 > "$d/mover.log" 2>&1
    echo "$tag mover $(tail -1 "$d/mover.log")" | tee -a "$OUT/summary.txt"
  fi
  cleanup; sleep 2
}
RUNS=${RUNS:-"g0-off:0:0:0:0 g75-off:75:0:0:0 g75-on:75:1:0:0 g0-on:0:1:0:0 h75-o0:75:0:0:1 h75-o1:75:0:1:1"}
for r in $RUNS; do IFS=: read a b c e f <<< "$r"; run "$a" "$b" "$c" "$e" "$f"; done
echo done >> "$OUT/summary.txt"
