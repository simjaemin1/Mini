#!/usr/bin/env bash
# (@regress 없음 — 러너 밖 · T581 자 · 초기화 게이트 한 줄)
# 초기화 리허설을 다시 돌리는 한 줄 — 카드가 착지할 때마다 PM 이 돌린다.
#   bash scripts/t581-rehearsal.sh [씨…]            (기본 씨 1020 7 42 · 씨마다 400일 · 두 존 · 새 세계 · 제품 기본 손잡이)
#   환경: T581_OUT(출력 · 기본 /tmp/t581) · T581_DAY_MS(마을 하루 · 기본 120000) · T581_DAYS(기본 400) · T581_XZONE(on|off · 기본 off = 제품 기본)
#   ⚠하루 길이: 생활층 몸의 하루 몫(집 크루·나무꾼 왕복)은 하루의 실초가 정한다(`_t341TripsPerDay`). 4초 판은 집 행위가 안 선다(침상 12 묶임) —
#     기본 120초(곳간↔집터 최대 44셀 왕복이 하루 낮 84초 안에 든다 · 보고 T581 §4). 운영 하루(1,440초)의 1/12 이라 집·나무는 운영보다 느리게 읽는다.
#   끝: <OUT>/table.md(한 장 표 · ✗ 칸) · 산그림/T581_리허설_<씨>_<날>.png(30·100·200·400일 두 존 지도)
#   ⚠한 판씩 돈다(같은 포트 — zone-config 그대로). 판 하나 ≈ 마을하루 × 날 + 기동 2분(120초 × 400 ≈ 13.4시간).
#     나란히: node scripts/t581-rehearsal.js run <씨> 120000 400 <OUT> --port-off 0|100|200 (씨마다 · 끝나면 maps·table)
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${T581_OUT:-/tmp/t581}"; DMS="${T581_DAY_MS:-120000}"; DAYS="${T581_DAYS:-400}"; XZ="${T581_XZONE:-off}"
SEEDS=("$@"); [ ${#SEEDS[@]} -eq 0 ] && SEEDS=(1020 7 42)
mkdir -p "$OUT/t524"
for z in hanbando nippon; do   # T568 그림이 읽는 존 지형 격자(T524 자) — 없을 때만 굽는다
  [ -f "$OUT/t524/$z.json" ] || node scripts/t524-land-audit.js "$z" "$OUT/t524" > "$OUT/t524/$z.log" 2>&1
done
for s in "${SEEDS[@]}"; do
  node scripts/t581-rehearsal.js run "$s" "$DMS" "$DAYS" "$OUT" --xzone "$XZ"
done
node scripts/t581-rehearsal.js maps "$OUT"
node scripts/t581-rehearsal.js table "$OUT" md | tee "$OUT/table.md"
