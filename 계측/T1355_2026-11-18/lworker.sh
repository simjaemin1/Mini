#!/bin/bash
# 랩 일꾼 — 일 목록(줄: 작업트리 이름 시드 날 env…)을 하나씩 꺼내 lab55.sh 로 돈다(자물쇠 flock)
RUN=${RUN:-/root/t1355runs}; JF=$RUN/jobsL.txt; LK=$RUN/jobsL.lock
while true; do
  J=$(flock "$LK" -c "L=\$(head -n 1 $JF); [ -n \"\$L\" ] && sed -i 1d $JF; echo \"\$L\"")
  [ -z "$J" ] && break
  $(dirname "$0")/lab55.sh $J
done
