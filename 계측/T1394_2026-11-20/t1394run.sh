#!/bin/bash
# T1394 판 하나 — 서버 판 자(T650 · 가상 시계 · 생활층 지문 끔 · 기준선 11-16 조건) + T1394 훅. 판 끝나면 판 DB 를 지운다(디스크).
#   쓰는 법: [env…] bash t1394run.sh <이름> <시드> <날> <내보낼 폴더>
#   이름 = 세계·팔(예: home-off) · env 는 그대로 아이 판에 간다(T1373_HOME_CAP · T1334_BUNDLE · T1363_FAMINE_TOOLS · T1394_* …)
set -u
TAG="$1"; SEED="$2"; DAYS="$3"; OUTD="$4"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$OUTD"
LOG="$OUTD/$TAG-$SEED.log"
export NODE_OPTIONS="--require $ROOT/계측/T1394_2026-11-20/t1394hook.js"
T0=$(date +%s)
node --experimental-sqlite "$ROOT/scripts/server-baseline-check.js" --make "$OUTD/$TAG-$SEED.sbc-base.json" --days "$DAYS" --seeds "$SEED" --vclock --side off --par 1 > "$LOG" 2>&1
RC=$?
DIR=$(grep -o '판 /[^ ]*sbc-[A-Za-z0-9]*' "$LOG" | head -1 | sed 's/^판 //')
if [ -n "$DIR" ] && [ -d "$DIR" ]; then
  cp "$DIR/sbc-$SEED.json.t1394.json" "$OUTD/$TAG-$SEED.t1394.json" 2>/dev/null
  cp "$DIR/sbc-$SEED.json" "$OUTD/$TAG-$SEED.run.json" 2>/dev/null
  tail -c 4000 "$DIR/sbc-$SEED.log" > "$OUTD/$TAG-$SEED.zone-tail.log" 2>/dev/null
  rm -rf "$DIR"
fi
# (기준선 꼴 지문 `<이름>-<시드>.sbc-base.json` 은 남긴다 — 끈 판 앞 400날 견줌용)
echo "$TAG $SEED $DAYS rc=$RC sec=$(( $(date +%s) - T0 ))" >> "$OUTD/done.txt"
