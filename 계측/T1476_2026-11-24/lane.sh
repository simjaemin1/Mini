#!/usr/bin/env bash
# T1476 봇 판 줄 — T1458 lane.sh 와 같은 꼴(판마다 네트워크 · pid · 마운트 이름공간 + /tmp 따로 · 끝 표시는 자식 안에서 쓴다).
#   쓰는 법: lane.sh <raw 디렉터리> <on|off> <id:vid:season> ...
#   세계 하나 = 전수 시딩(--villages all · 마을 51곳). 끔 = 되돌림 env 셋(T1305_DEEDS=0 T1392_FIRST_LOT=0 T1402_SPLIT_OK=0).
#   판 40분 넘으면 끊는다(timeout 40m · rc 124) — 끊은 판은 다시 안 돌린다. 죽은 판(rc 124 아님 · json 없음)만 한 번 다시.
set -u
WT=${WT:-/home/user/wt-pair}
RAW=$1; MODE=$2; shift 2
mkdir -p "$RAW"
OFFENV=""
[ "$MODE" = off ] && OFFENV="T1305_DEEDS=0 T1392_FIRST_LOT=0 T1402_SPLIT_OK=0"
for spec in "$@"; do
  IFS=: read -r id vid season <<<"$spec"
  for try in 1 2; do
    tag="$id-$MODE-t$try"
    echo "[$(date +%H:%M:%S)] start $tag vid=$vid season=$season"
    PT=/var/tmp/t1476/tmp-$tag; rm -rf "$PT"; mkdir -p "$PT"; chmod 1777 "$PT"
    timeout --kill-after=60 40m unshare -n -p -m -f --kill-child --mount-proc bash -c "
      mount --bind $PT /tmp || exit 96
      python3 $WT/scripts/t853/uplo.py || exit 97
      cd $WT && env $OFFENV NODE_OPTIONS=\"--require $WT/scripts/t1476-lotlog.js\" LIB_PORT_DIR=/tmp/t1476-lp node scripts/e2e-first30.js --season $season --start day --panel-bot --own --guide --cap 35 --no-align --villages all:$vid --out $RAW/$tag.json
    " > "$RAW/$tag.log" 2>&1
    rc=$?
    echo "EXIT $rc" > "$RAW/$tag.done"
    [ -s "$PT/t1476-lotlog.jsonl" ] && cp "$PT/t1476-lotlog.jsonl" "$RAW/$tag.lot.jsonl"
    rm -rf "$PT"
    echo "[$(date +%H:%M:%S)] end $tag rc=$rc"
    [ $rc -eq 124 ] && break
    if [ $rc -eq 0 ] && [ -s "$RAW/$tag.json" ] && ! grep -q '"fatal"' "$RAW/$tag.json"; then break; fi
  done
done
echo LANE_DONE
