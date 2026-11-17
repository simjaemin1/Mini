#!/bin/bash
# T1288 판 B 이어 돌기 — 컨테이너 재시작(11-13 10:21)으로 판 B 가 195/258 에서 끊겼다 → 남은 63 을 -j 4 로
R=/home/user/Mini; SP=/tmp/claude-0/-home-user-Mini/2b37f3bf-4e2c-5696-b52a-e22e02e2f0d7/scratchpad/t1288; OUT=$SP/run
cd $R
( while true; do echo "$(date -u +%H:%M:%S) $(df -k / | awk 'NR==2{print $4}')" >> $OUT/disk.log; sleep 60; done ) &
DISKMON=$!
D=$OUT/B2; rm -rf $D; mkdir -p $D; cp $SP/restB.txt $D/list.txt
T0=$(date +%s)
env TIDE_FREEZE_MS=372603 LIB_PORT_LOG=$D/ports.jsonl T1288_NET_LOG=$D/net.jsonl RUN_REGRESS_KEEP=$D/out \
    NODE_OPTIONS="-r $R/scripts/t1288-net-log.js" bash scripts/run-regress.sh -j 4 $(cat $SP/restB.txt) > $D/run.log 2>&1
echo "rc=$? 벽 $(( $(date +%s) - T0 ))초" >> $D/run.log
echo "$(date -u +%H:%M) B2 끝 · $(tail -1 $D/run.log)"
kill $DISKMON
