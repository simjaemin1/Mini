#!/bin/bash
# 줄 하나씩 — jobs.txt 머리에서 꺼내 돈다(flock) · 빈 줄이면 끝
Q=/root/t1449runs/jobs.txt
while true; do
  J=$(flock /root/t1449runs/jobs.lock bash -c "head -1 $Q; sed -i '1d' $Q")
  [ -z "$J" ] && break
  echo "$(date -u +%FT%TZ) lane$1 start $J" >> /root/t1449runs/lanes.log
  bash -c "$J"
done
echo "$(date -u +%FT%TZ) lane$1 done" >> /root/t1449runs/lanes.log
