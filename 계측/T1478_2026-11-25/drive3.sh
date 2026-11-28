#!/bin/bash
# T1478 혼자 판 — J3 빨강(J4 앞 두 조각 빨강은 그 안) 16종 중 verify-night 뺀 15종 × 다섯 판(S1~S5) · 마지막에 verify-night 혼자 한 판(V1 · 한 판 한 시간)
D=/tmp/claude-0/-home-user-Mini/2b37f3bf-4e2c-5696-b52a-e22e02e2f0d7/scratchpad/t1478
source $D/fn.sh
for L in $D/S?.log $D/V?.log; do [ -e "$L" ] || continue; n=$(basename $L .log); [ -f $D/$n.done ] && continue
  hs=$(grep -c '^##### ' $L); printf '%s\t%s\t%s\t%s\n' "$n" "$(date -u -r $L +%FT%T)" "$hs" "컨테이너 재시작(혼자 판 · 그 판만 다시)" >> $D/dead.txt
  settle $n dead; mv $L $D/$n-죽음.log; done
for i in 1 2 3 4 5; do [ -f $D/S$i.done ] || run S$i solo -j 1 $(cat $D/reds-solo.txt); done
[ -f $D/V1.done ] || run V1 solo -j 1 test-t1322-verify-night.js
echo "$(now) 혼자 다 끝남" >> $D/drive.log; touch $D/all.done
