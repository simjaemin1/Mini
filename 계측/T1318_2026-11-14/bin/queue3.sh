#!/bin/bash
# 동시 둘 — 앞 큐의 둘(R50 · BODY-1020)은 끝 표 파일로 센다
B=/tmp/t1318/bin; L=/tmp/t1318/queue.log
ext() { local n=0; [ -f /tmp/t1318/R50/exit.txt ] || n=$((n+1)); echo $n; }
JOBS=("$B/main.sh 1020 BODY" "env T1283_CLEAR_HAUL=1 $B/straight.sh /root/minirepo /tmp/t1318/H10 10 1020 BODY" "$B/gate.sh" "$B/main.sh 1020 OFF" "$B/main.sh 1020 COMBO" "$B/main.sh 7 BODY" "$B/main.sh 7 OFF" "$B/main.sh 7 COMBO")
for j in "${JOBS[@]}"; do
  while [ $(( $(jobs -rp | wc -l) + $(ext) )) -ge 2 ]; do sleep 30; done
  [ -f /tmp/t1318/STOP ] && { echo "$(date -u +%FT%TZ) STOP" >> $L; break; }
  echo "$(date -u +%FT%TZ) start $j" >> $L
  ( $j; echo "$(date -u +%FT%TZ) done $j" >> $L ) &
  sleep 5
done
wait; echo "$(date -u +%FT%TZ) all done" >> $L
