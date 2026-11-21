#!/usr/bin/env bash
# (러너 밖 · T1378 판 하나 · 제품 무변) — 존 하나(한반도) + 이미 있는 봇 도구 둘을 함께 띄우고 20분 동안 표본을 모은다.
#   쓰는 법: run.sh <이름> <의뢰봇 수> <걷는봇 수> <마을 수> <데이터 디렉터리> <로그 디렉터리>
#   의뢰봇 = scripts/t1341-quest-bots.js(서버 central · 존을 스스로 띄운다 · 마을마다 관측 봇 하나가 더 붙는다)
#   걷는봇 = loadtest.js(MODE=walk · 같은 존에 손님 ws 로 붙는다 · 제 DURATION 은 창보다 넉넉히 주고 창이 끝나면 이 스크립트가 끈다)
#   봇 0 판 = 같은 env 로 central · 존만 띄운다.
#   존 diag 줄 = diag-tap.js(존 곁 프리로드) · 표본 = 10초마다 ps(rss · 누적 CPU) + /proc/<존>/io wchar + /health
set -u
TAG=$1; NQ=$2; NW=$3; NV=$4; DATA=$5; LOGD=$6
DUR=${DUR:-1200}; DAYMS=${DAYMS:-60000}; PB=${PB:-3710}; ZPORT=$((PB+10))
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
mkdir -p "$DATA" "$LOGD"
rm -f /tmp/t1341-bots-*.db* /tmp/t1378-*.db*
DIAG="$DATA/diag.txt"; PIDF="$LOGD/zone.pid"; SAMP="$DATA/samples.jsonl"
: > "$DIAG"; : > "$SAMP"; rm -f "$PIDF"
export NODE_OPTIONS="-r $HERE/diag-tap.js" T1378_DIAG="$DIAG" T1378_PID="$PIDF"
cd "$ROOT"
PIDS=()
if [ "$NQ" -gt 0 ]; then
  node scripts/t1341-quest-bots.js --arm off --bots "$NQ" --per 3 --warm 1 --days 30 --day-ms "$DAYMS" --villages "$NV" --port "$PB" --out "$LOGD/quest.json" > "$LOGD/quest.log" 2>&1 &
  QPID=$!; PIDS+=($QPID); OBS=$NV
else
  CDB=/tmp/t1378-c-$$.db; ZDB=/tmp/t1378-z-$$.db
  PORT=$PB DB_PATH=$CDB PUBLIC_HOST=localhost ENABLED_ZONES=hanbando node server/central.js > "$LOGD/central.log" 2>&1 &
  PIDS+=($!)
  sleep 3
  PORT=$ZPORT ZONE_ID=hanbando DB_PATH=$ZDB CENTRAL_URL=http://localhost:$PB ENABLE_VILLAGES=1 ENABLE_BANDITS=0 ENABLE_ROADS=0 ENABLE_WILDLIFE=0 \
    VILLAGE_MAX=$NV VILLAGE_DAY_MS=$DAYMS E2E_GIVE=1 node server/zone.js > "$LOGD/zone.log" 2>&1 &
  PIDS+=($!); QPID=""; OBS=0
fi
unset NODE_OPTIONS
humans() { curl -s -m 5 "http://localhost:$ZPORT/health" | node -e 'let b="";process.stdin.on("data",d=>b+=d).on("end",()=>{try{console.log(JSON.parse(b).humans|0)}catch(e){console.log(-1)}})'; }
for i in $(seq 1 120); do [ -s "$PIDF" ] && [ "$(humans)" -ge 0 ] && break; sleep 5; done
ZPID=$(cat "$PIDF" 2>/dev/null || echo 0)
echo "zone pid $ZPID up · $(date +%T)"
if [ "$NQ" -gt 0 ]; then for i in $(seq 1 120); do [ "$(humans)" -ge $((NQ+OBS)) ] && break; sleep 5; done; fi
WPID=""
if [ "$NW" -gt 0 ]; then
  HOST=localhost PORT=$ZPORT CLIENTS=$NW DURATION=$((DUR+900)) MODE=walk SCENARIO=t1378-$TAG OUT_DIR="$LOGD" \
    METRICS_URL=http://localhost:$ZPORT/metrics node loadtest.js > "$LOGD/walk.log" 2>&1 &
  WPID=$!; PIDS+=($WPID)
  for i in $(seq 1 60); do [ "$(humans)" -ge $((NQ+OBS+NW)) ] && break; sleep 2; done
fi
EXP=$((NQ+OBS+NW))
T0=$(date +%s%3N); echo "bots in: humans $(humans)/$EXP · $(date +%T)"
cpu() { ps -o times= -p "$1" 2>/dev/null | tr -d ' ' || true; }
END=$((T0 + DUR*1000))
while [ "$(date +%s%3N)" -lt "$END" ]; do
  T=$(date +%s%3N)
  RSS=$(ps -o rss= -p "$ZPID" 2>/dev/null | tr -d ' '); ZC=$(cpu "$ZPID")
  WCH=$(awk '/^wchar/{print $2}' /proc/$ZPID/io 2>/dev/null)
  BC=0; for p in $QPID $WPID; do c=$(cpu "$p"); BC=$((BC + ${c:-0})); done
  H=$(curl -s -m 5 "http://localhost:$ZPORT/health"); [ -n "$H" ] || H=null
  echo "{\"t\":$T,\"rss\":${RSS:-null},\"cpu\":${ZC:-null},\"wchar\":${WCH:-null},\"botcpu\":$BC,\"health\":$H}" >> "$SAMP"
  sleep 10
done
T1=$(date +%s%3N)
echo "{\"tag\":\"$TAG\",\"nq\":$NQ,\"nw\":$NW,\"obs\":$OBS,\"villages\":$NV,\"expected\":$EXP,\"t0\":$T0,\"t1\":$T1,\"dur\":$DUR,\"dayMs\":$DAYMS,\"nproc\":$(nproc)}" > "$DATA/meta.json"
echo "window done · $(date +%T) · humans $(humans)/$EXP"
ZCH=""; [ -n "$QPID" ] && ZCH=$(pgrep -P "$QPID" | tr '\n' ' ')
for p in "${PIDS[@]}" $ZCH $ZPID; do kill "$p" 2>/dev/null; done
sleep 3
for p in "${PIDS[@]}" $ZCH $ZPID; do kill -9 "$p" 2>/dev/null; done
rm -f /tmp/t1341-bots-*.db* /tmp/t1378-*.db*
gzip -f "$DIAG" "$SAMP"
echo "walk tail:"; tail -3 "$LOGD/walk.log" 2>/dev/null; echo "quest tail:"; tail -3 "$LOGD/quest.log" 2>/dev/null
df -h /tmp | tail -1
