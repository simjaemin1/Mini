#!/bin/bash
# T1288 증명 판 — 서버를 띄우는 @regress 전부: 홀로(-j 1) 한 번 → -j 4 두 번(순서 섞어 · 씨앗 1 · 2)
R=/home/user/Mini; SP=/tmp/claude-0/-home-user-Mini/2b37f3bf-4e2c-5696-b52a-e22e02e2f0d7/scratchpad/t1288; OUT=$SP/run   # ★재시작에 남는 디스크(첫 판은 /dev/shm 이라 컨테이너 재시작에 홀로 판을 잃었다)
LIST=$SP/boot-list.txt
cd $R
mkdir -p $OUT
( while true; do echo "$(date -u +%H:%M:%S) $(df -k / | awk 'NR==2{print $4}')" >> $OUT/disk.log; sleep 60; done ) &
DISKMON=$!
shuf_seed() { node -e "const L=require('fs').readFileSync('$LIST','utf8').trim().split('\n');let s=$1;const r=()=>{s=(s*1103515245+12345)%2147483648;return s/2147483648};for(let i=L.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[L[i],L[j]]=[L[j],L[i]]}console.log(L.join('\n'))"; }
one() {   # $1 이름 $2 jobs $3 목록 파일
  local D=$OUT/$1; rm -rf $D; mkdir -p $D
  cp $3 $D/list.txt
  local T0=$(date +%s)
  env TIDE_FREEZE_MS=372603 LIB_PORT_LOG=$D/ports.jsonl T1288_NET_LOG=$D/net.jsonl RUN_REGRESS_KEEP=$D/out \
      NODE_OPTIONS="-r $R/scripts/t1288-net-log.js" bash scripts/run-regress.sh -j $2 $(cat $3) > $D/run.log 2>&1
  echo "rc=$? 벽 $(( $(date +%s) - T0 ))초" >> $D/run.log
  echo "$(date -u +%H:%M) $1 끝 · $(tail -1 $D/run.log)"
}
shuf_seed 1 > $SP/listA.txt; shuf_seed 2 > $SP/listB.txt
one solo 1 $LIST
one A 4 $SP/listA.txt
one B 4 $SP/listB.txt
node scripts/t1288-par.js $OUT/요약.json $OUT/solo $OUT/A $OUT/B
kill $DISKMON
