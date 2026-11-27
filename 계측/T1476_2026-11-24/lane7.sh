#!/usr/bin/env bash
# T1476 e2e-membership ⑦ 줄 — 판마다 이름공간 + /tmp 따로. 쓰는 법: lane7.sh <raw 디렉터리> <on|off> <판 수> [시작 번호(기본 1)]
set -u
WT=${WT:-/home/user/wt-pair}
RAW=$1; MODE=$2; N=$3; START=${4:-1}
mkdir -p "$RAW"
OFFENV=""
[ "$MODE" = off ] && OFFENV="T1305_DEEDS=0 T1392_FIRST_LOT=0 T1402_SPLIT_OK=0"
for i in $(seq "$START" $((START + N - 1))); do
  tag=$(printf "m7-%s-%02d" "$MODE" "$i")
  PT=/var/tmp/t1476/tmp-$tag; rm -rf "$PT"; mkdir -p "$PT"; chmod 1777 "$PT"
  timeout --kill-after=30 10m unshare -n -p -m -f --kill-child --mount-proc bash -c "
    mount --bind $PT /tmp || exit 96
    python3 $WT/scripts/t853/uplo.py || exit 97
    cd $WT && env $OFFENV LIB_PORT_DIR=/tmp/t1476-lp node scripts/e2e-membership.js
  " > "$RAW/$tag.log" 2>&1
  rc=$?
  { echo "EXIT $rc"; grep -E "=== PASS|⑦" "$RAW/$tag.log" | cut -c1-260; } > "$RAW/$tag.done"
  rm -rf "$PT"
done
echo LANE_DONE
