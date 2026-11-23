#!/usr/bin/env bash
# T1458 봇 판 줄(lane) — 판 하나씩 차례로 · 판마다 네트워크 · pid · 마운트 이름공간 따로(unshare -n -p -m · 끝나면 안의 아이가 다 죽는다) · 죽은 판은 한 번만 다시.
#   ★/tmp 도 판마다 따로(빈 디렉터리를 /tmp 에 묶는다) — pid 이름공간 안에선 자의 pid 가 늘 작은 수(3)라
#     `/tmp/t511-zone-<pid>.db` 가 두 줄 사이에 겹친다(첫 시도에서 실제로 겹쳤다 — 그 판들은 버리고 다시 돌렸다).
#   raw 디렉터리는 /tmp 밖이어야 한다(/var/tmp 등).
#   쓰는 법: lane.sh <raw 디렉터리> <id:vid:season> ...
#   ★자는 그대로(scripts/e2e-first30.js 무변) — 줄은 T1428 §6 그대로 + --vid · --season.
#   ★SEED_ALL=1 — 자의 존은 VILLAGE_MAX 4(농촌1 · 어촌2 · 임업2 · 광산4)만 심는다. 다른 마을에 내리려면
#     존 정본의 전수 시딩 env(라이브 hanbando 와 같은 50곳)를 아이에게 물려 준다(자는 ENV0 을 아이에게 넘긴다).
set -u
WT=/home/user/wt-deedsbots
RAW=$1; shift
mkdir -p "$RAW"
for spec in "$@"; do
  IFS=: read -r id vid season <<<"$spec"
  for try in 1 2; do
    tag="$id-t$try"
    echo "[$(date +%H:%M:%S)] start $tag vid=$vid season=$season"
    PT=/var/tmp/t1458/tmp-$tag; rm -rf "$PT"; mkdir -p "$PT"; chmod 1777 "$PT"
    timeout --kill-after=60 55m unshare -n -p -m -f --kill-child --mount-proc bash -c "
      mount --bind $PT /tmp || exit 96
      python3 $WT/scripts/t853/uplo.py || exit 97
      cd $WT && SEED_ALL=1 LIB_PORT_DIR=/tmp/t1458-lp node scripts/e2e-first30.js --season $season --start day --panel-bot --own --guide --cap 35 --no-align --vid $vid --out $RAW/$tag.json
    " > "$RAW/$tag.log" 2>&1
    rc=$?
    echo "EXIT $rc" > "$RAW/$tag.done"
    du -sh "$PT" 2>/dev/null | cut -f1 > "$RAW/$tag.tmpsize"; rm -rf "$PT"
    echo "[$(date +%H:%M:%S)] end $tag rc=$rc"
    if [ $rc -eq 0 ] && [ -s "$RAW/$tag.json" ] && ! grep -q '"fatal"' "$RAW/$tag.json"; then break; fi
    [ $try -eq 2 ] && echo "[$(date +%H:%M:%S)] $id 두 번째도 죽음 — 그대로 둔다"
  done
done
echo LANE_DONE
