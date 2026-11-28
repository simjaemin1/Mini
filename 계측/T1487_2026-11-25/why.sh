#!/usr/bin/env bash
# === 계측/T1487_2026-11-25/why.sh — 덧 관찰기 t1487-why.js 판(나무꾼 팔 · 짧은 판 · 코드 손 0) ===
#   판 하나 = 시드 하나 = `server-baseline-check.js --make <OUT>/run-<시드>-<DAYS>.json --days DAYS --seeds <시드> --par 1 --vclock`
#     + `T325_WOOD_ACT=1`(나무꾼 팔) + 덧 관찰기(--require t1487-why.js · 10날마다 why-wood<DAYS>-<시드>.json 덮어씀).
#   판마다 제 TMPDIR(끝나면 지운다) · CAP 초에서 끊는다(끊겨도 마지막 10날 칸까지 남는다) · done.txt 에 "시드 날 rc 초".
#   env: ROOT(레포) · OUT(자료 폴더) · DAYS(150) · SEEDS("7 1020") · CAP(1500) · RC(교역로 캐시 폴더 · 기본 OUT/route-cache)
set -u
ROOT="${ROOT:?}"; OUT="${OUT:?}"; DAYS="${DAYS:-150}"; CAP="${CAP:-1500}"; RC="${RC:-$OUT/route-cache}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT/tmp" "$RC"
one() {
  local s=$1 T="$OUT/tmp/$1-$DAYS" t0; mkdir -p "$T"; t0=$(date +%s)
  ( cd "$ROOT" && env T325_WOOD_ACT=1 TMPDIR="$T" T1487_WHY="$OUT" T1487_ARM="wood$DAYS" \
      NODE_OPTIONS="--max-old-space-size=6144 --require $HERE/t1487-why.js" \
      timeout "$CAP" node scripts/server-baseline-check.js --make "$OUT/run-$s-$DAYS.json" --days "$DAYS" --seeds "$s" --par 1 --vclock --route-cache "$RC" \
      > "$OUT/run-$s-$DAYS.out" 2>&1 )
  local rc=$?
  for p in $(pgrep -x node); do grep -qz "^TMPDIR=$T\$" /proc/$p/environ 2>/dev/null && kill "$p"; done
  echo "$s $DAYS $rc $(( $(date +%s) - t0 ))" >> "$OUT/done.txt"
  rm -rf -- "$T"
}
for s in ${SEEDS:-7 1020}; do one "$s" & done; wait
