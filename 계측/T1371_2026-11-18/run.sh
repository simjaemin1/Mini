#!/usr/bin/env bash
# T1371 판 하나: run.sh <시드> <판(a|b)> [날=1200] [시한초=10800]
#   server-baseline-check --make(가상 시계 · 판 조건 그대로) + 읽기만 관찰기(t1371-observe · 날 줄) · 판 폴더 /tmp/t1371/<시드>-<판>
S=$1; R=$2; D=${3:-1200}; TO=${4:-10800}
J=/tmp/t1371/$S-$R; rm -rf "$J"; mkdir -p "$J"
cd /home/user/wt-years || exit 9
TMPDIR=$J NODE_OPTIONS="--require $PWD/scripts/t1371-observe.js" timeout -k 60 "$TO" \
  node scripts/server-baseline-check.js --make "$J/make.json" --days "$D" --seeds "$S" --vclock --par 1 --route-cache /tmp/durango-route-cache > "$J/check.log" 2>&1
echo "EXIT $?" > "$J/X.done"
