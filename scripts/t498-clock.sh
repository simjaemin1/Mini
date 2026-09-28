#!/usr/bin/env bash
# === scripts/t498-clock.sh — 핸드오프 벽시계 A-B(팔 끔/켬) × 지연(없음 · central 왕복 150ms · + 클라 LATENCY_MS 150) (T498 ③ · 러너 밖) ===
#   자 = `e2e-zone-cross`(그대로 · 46건) + `t498-probe`(출발 존 fire→handoff ms) + `t498-delay-proxy`(존 → central 한 다리 지연).
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=${OUT:-/tmp/t498clock}; rm -rf "$OUT"; mkdir -p "$OUT"
PROBE="--require $(pwd)/scripts/t498-probe.js"
node scripts/t498-delay-proxy.js 3910 3010 75 > "$OUT/proxy.log" 2>&1 & PX=$!
trap 'kill $PX 2>/dev/null' EXIT
sleep 1
for cond in "none::" "c150:3910:" "c150l150:3910:150"; do
  IFS=: read tag cport lat <<< "$cond"
  for arm in 0 1; do
    d="$OUT/$tag-$arm"; mkdir -p "$d"
    rounds=10; [ "$tag" != none ] && rounds=5
    env NODE_OPTIONS="$PROBE" T498_HANDOFF_PAYLOAD=$arm ZX_ROUNDS=$rounds ${cport:+CENTRAL_PORT=$cport} ${lat:+LATENCY_MS=$lat} \
      node scripts/e2e-zone-cross.js --shots "$d" > "$d/e2e.txt" 2>&1
    echo "$tag arm=$arm $(grep '===' "$d/e2e.txt" | tail -1)" | tee -a "$OUT/summary.txt"
    sleep 3
  done
done
echo done >> "$OUT/summary.txt"
