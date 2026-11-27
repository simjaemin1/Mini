#!/bin/bash
# T1478 혼자 판 — 하네스 한 종 단위로 끝 표시(컨테이너가 다시 서도 안 끝난 종부터). 15종 × S1~S5, 마지막에 verify-night 혼자 한 판(V1).
D=/tmp/claude-0/-home-user-Mini/2b37f3bf-4e2c-5696-b52a-e22e02e2f0d7/scratchpad/t1478
source $D/fn.sh
one() { local p=$1 h=$2 name=$1-$2; [ -f $D/solo/$name.done ] && return
  ls -A /tmp > $D/$name.tmp-before; mkdir -p /tmp/t1478-$name; local T0=$(date +%s)
  TMPDIR=/tmp/t1478-$name bash scripts/run-regress.sh -j 1 $h > $D/solo/$name.log 2>&1; local rc=$?
  echo "rc=$rc 벽 $(( $(date +%s) - T0 ))초" >> $D/solo/$name.log
  echo "$(now) $name 끝 · rc=$rc · 벽 $(( $(date +%s) - T0 ))초" >> $D/drive.log
  settle $name solo; rm -f $D/$name.tmp-before; touch $D/solo/$name.done; }
echo "$(now) drive4 시작 · $(git log --oneline -1 | cut -c1-9) · 남은 디스크 $(df -h / | awk 'NR==2{print $4}')" >> $D/drive.log
for i in 1 2 3 4 5; do for h in $(cat $D/reds-solo.txt); do one S$i $h; done; done
one V1 test-t1322-verify-night.js
echo "$(now) 혼자 다 끝남" >> $D/drive.log; touch $D/all.done
