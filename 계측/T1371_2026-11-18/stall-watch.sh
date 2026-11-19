#!/usr/bin/env bash
# T1371 멈춤 지킴이: 시드 42 판 둘 — 날 700 넘어 10분에 날 줄이 5줄 밑으로 늘면 멈춤으로 보고 존을 SIGTERM(3분 뒤 SIGKILL)
prev=0
until [ -f /tmp/t1371/queue-a.done ] && [ -f /tmp/t1371/queue-b.done ]; do
  sleep 600
  n=$(cat /tmp/t1371/42-a/sbc-*/*.jsonl 2>/dev/null | wc -l)
  echo "$(date +%T) $n" >> /tmp/t1371/stall-watch.log
  if [ "$n" -gt 700 ] && [ $((n - prev)) -lt 5 ]; then
    P=$(pgrep -f "server/zone.js"); echo "$(date +%T) stall at $n -> TERM $P" >> /tmp/t1371/stall-watch.log
    kill -TERM $P; sleep 180; kill -KILL $P 2>/dev/null; echo "$(date +%T) KILL done" >> /tmp/t1371/stall-watch.log
  fi
  prev=$n
done
