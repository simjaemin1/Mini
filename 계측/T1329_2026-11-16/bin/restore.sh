#!/bin/bash
# 재시작 뒤: 코드 나무를 다시 짓고(git archive · 나무 표 $SP/trees.txt "이름 커밋"), 판을 tar.gz 에서 되살려 감독을 잇는다(끝나지 않은 판만)
SP=/tmp/claude-0/-home-user-Mini/b6380702-943a-51e2-9935-6cef2859bf87/scratchpad/t1329; R=/home/user/Mini
mkdir -p /dev/shm/t1329/runs
while read name commit; do
  [ -z "$name" ] && continue
  T=/dev/shm/t1329/$name
  if [ ! -d $T/server ]; then mkdir -p $T && (cd $R && git archive $commit server sim scripts _terrain lab public package.json 계측/서버기준선_2026-11-16.json | tar -x -C $T) && ln -sfn $R/node_modules $T/node_modules; echo "tree $name $commit"; fi
done < $SP/trees.txt
pgrep -f bk.sh > /dev/null || (setsid nohup $SP/bin/bk.sh > /dev/null 2>&1 &)
for t in $SP/bk/*.tgz; do
  n=$(basename $t .tgz); d=/dev/shm/t1329/runs/$n
  [ -f $SP/bk/$n.skip ] && continue
  if [ ! -f $d/progress.json ]; then mkdir -p $d && tar -xzf $t -C $d; fi
  if grep -q '"done": true' $d/progress.json; then echo "done $n"; continue; fi
  if pgrep -f "runs/$n" > /dev/null; then echo "running $n"; continue; fi
  TREE=$(node -e "console.log(require('$d/progress.json').env.NODE_OPTIONS.match(/\/dev\/shm\/t1329\/[^\/]+\//)[0])")
  (cd /dev/shm/t1329 && setsid nohup bash -c "bash ${TREE}scripts/t1308-guard.sh resume $d > $d.resume.out 2>&1; echo exit-resume >> /dev/shm/t1329/runs/$n.exit" > /dev/null 2>&1 &)
  echo "resumed $n"
done
pgrep -f queue.sh > /dev/null || (setsid nohup $SP/bin/queue.sh > /dev/null 2>&1 &)
pgrep -f regress.sh > /dev/null || (setsid nohup $SP/bin/regress.sh > /dev/null 2>&1 &)
echo "queue+regress ensured"
