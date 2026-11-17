#!/bin/bash
# T1288 확인 판 C — 착지할 코드(origin/main 병합 뒤)로 띄우는 @regress 261개를 -j 4 · 섞은 순서(씨앗 3 · A=1 · B=2 와 같은 섞개)
R=/home/user/Mini; SP=/tmp/claude-0/-home-user-Mini/2b37f3bf-4e2c-5696-b52a-e22e02e2f0d7/scratchpad/t1288; OUT=$SP/run
cd $R
( while true; do echo "$(date -u +%m-%dT%H:%M:%S) $(df -k / | awk 'NR==2{print $4}')" >> $OUT/disk.log; sleep 60; done ) &
DISKMON=$!
D=$OUT/C; rm -rf $D; mkdir -p $D
LIST=$SP/boot-list-D.txt
shuf_seed() { node -e "const L=require('fs').readFileSync('$LIST','utf8').trim().split('\n');let s=$1;const r=()=>{s=(s*1103515245+12345)%2147483648;return s/2147483648};for(let i=L.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[L[i],L[j]]=[L[j],L[i]]}console.log(L.join('\n'))"; }
shuf_seed 3 > $D/list.txt
T0=$(date +%s); echo "$(date -u +%m-%dT%H:%M:%S) C 시작 · $(git -C $R log --oneline -1 | cut -c1-9)" > $D/start.txt
env TIDE_FREEZE_MS=372603 LIB_PORT_LOG=$D/ports.jsonl T1288_NET_LOG=$D/net.jsonl RUN_REGRESS_KEEP=$D/out \
    NODE_OPTIONS="-r $R/scripts/t1288-net-log.js" bash scripts/run-regress.sh -j 4 $(cat $D/list.txt) > $D/run.log 2>&1
echo "rc=$? 벽 $(( $(date +%s) - T0 ))초" >> $D/run.log
echo "$(date -u +%m-%dT%H:%M) C 끝 · $(tail -1 $D/run.log)"
kill $DISKMON
