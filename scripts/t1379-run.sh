#!/usr/bin/env bash
# === scripts/t1379-run.sh — 긴 판 셋(기본 800날 · 짐승 몸 켬 400날 · 밭 켬 400날) + 100날마다 DB 사본 [T1379 · S11 · 2026-11-21] =====
# (@regress 없음 — 러너 밖 · 판 도구)
#
# ★판: 서버 판 자(`t577-server-run.js` · 시드 1020 · 동시 1) · 가상 시계(`T745_VCLOCK=1` + `t745-vclock.js` 프리로드) · 그 밖은 제품 기본(손잡이 env 0).
#   켬 판 둘은 손잡이 하나씩만 더한다(`T1331_BEAST_BODY=1` · `T1243_FARM_ON=1`).
# ★자리: 판 DB · 로그 · 사본은 레포 밖 `$W`(기본 /tmp/t1379 — 크다 · 안 올린다) · 사본 목록(`snaps.json`)만 계측으로 옮긴다(표 자가 한다).
#   W=/tmp/t1379 nohup bash scripts/t1379-run.sh > /tmp/t1379/run.out 2>&1 &
set -u
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
W="${W:-/tmp/t1379}"; mkdir -p "$W"
PRE="--require $ROOT/scripts/t745-vclock.js"
one() {   # tag days extra-env...
  local tag=$1 days=$2; shift 2
  local d="$W/$tag"; mkdir -p "$d"
  env "$@" T577_DIR="$d" T577_TAG="$tag" T577_PAR=1 T745_VCLOCK=1 NODE_OPTIONS="$PRE ${NODE_OPTIONS:-}" \
    node scripts/t577-server-run.js "$days" 1020 > "$d/run.out" 2>&1 &
  local pid=$!
  node scripts/t1379-snap.js --db "$d/$tag-1020.db" --log "$d/$tag-1020.log" --out "$d/snaps" --every 100 --max "$days" --pid "$pid" > "$d/snap.out" 2>&1 &
  echo "$(date -u +%H:%M) $tag 판 pid $pid · $days 날"
}
one base 800 X=1
one beast 400 T1331_BEAST_BODY=1
one farm 400 T1243_FARM_ON=1
wait
echo "끝 $(date -u +%FT%TZ)"
