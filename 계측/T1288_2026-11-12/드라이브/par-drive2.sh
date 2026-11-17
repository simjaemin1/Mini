#!/bin/bash
# T1288 증명 판 이어 돌기 — 컨테이너 재시작(05:06)으로 홀로 판이 225/258 에서 끊겼다 → 남은 33 을 홀로로 이어 돌고 · 판 A · B(-j 4)
R=/home/user/Mini; SP=/tmp/claude-0/-home-user-Mini/2b37f3bf-4e2c-5696-b52a-e22e02e2f0d7/scratchpad/t1288; OUT=$SP/run
cd $R
( while true; do echo "$(date -u +%H:%M:%S) $(df -k / | awk 'NR==2{print $4}')" >> $OUT/disk.log; sleep 60; done ) &
DISKMON=$!
one() {   # $1 이름 $2 jobs $3 목록 파일
  local D=$OUT/$1; rm -rf $D; mkdir -p $D
  cp $3 $D/list.txt
  local T0=$(date +%s)
  env TIDE_FREEZE_MS=372603 LIB_PORT_LOG=$D/ports.jsonl T1288_NET_LOG=$D/net.jsonl RUN_REGRESS_KEEP=$D/out \
      NODE_OPTIONS="-r $R/scripts/t1288-net-log.js" bash scripts/run-regress.sh -j $2 $(cat $3) > $D/run.log 2>&1
  echo "rc=$? 벽 $(( $(date +%s) - T0 ))초" >> $D/run.log
  echo "$(date -u +%H:%M) $1 끝 · $(tail -1 $D/run.log)"
}
one solo2 1 $SP/rest.txt
# 홀로 판 합치기 — 앞 225 + 이은 33(벽 = 앞 판 디스크 기록 첫~끝 + 이은 판 러너 전체)
node -e '
const fs=require("fs"),p=require("path"),O=process.argv[1];
const a=fs.readFileSync(p.join(O,"solo/run.part1.log"),"utf8"),b=fs.readFileSync(p.join(O,"solo2/run.log"),"utf8");
const d=fs.readFileSync(p.join(O,"disk.log"),"utf8").trim().split("\n");const ts=(l)=>{const [h,m,s]=l.split(" ")[0].split(":").map(Number);return h*3600+m*60+s};
let w1=null;for(let i=1;i<d.length;i++){if(ts(d[i])<ts(d[i-1])){w1=ts(d[i-1])-ts(d[0]);break}}
const w2=+((/러너 전체 (\d+)초/.exec(b)||[])[1]||0);
fs.writeFileSync(p.join(O,"solo/run.log"),a+b.replace(/러너 전체 \d+초/g,"(이은 판 러너 $&)")+"\n러너 전체 "+(w1+w2)+"초 (앞 판 "+w1+"초 + 이은 판 "+w2+"초 · 컨테이너 재시작으로 둘로 나뉨)\n");
for(const f of ["ports.jsonl","net.jsonl"]) if(fs.existsSync(p.join(O,"solo2",f))) fs.appendFileSync(p.join(O,"solo",f),fs.readFileSync(p.join(O,"solo2",f)));
fs.mkdirSync(p.join(O,"solo/out"),{recursive:true});for(const f of fs.readdirSync(p.join(O,"solo2/out"))) fs.copyFileSync(p.join(O,"solo2/out",f),p.join(O,"solo/out",f));
console.log("홀로 합침 벽",w1,"+",w2);' $OUT
echo "$(date -u +%H:%M) solo 합침"
one A 4 $SP/listA.txt
one B 4 $SP/listB.txt
node scripts/t1288-par.js $OUT/요약.json $OUT/solo $OUT/A $OUT/B
kill $DISKMON
