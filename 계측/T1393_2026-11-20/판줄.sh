#!/bin/bash
# tag:seed ...  (tag = off | body | on)
cd /tmp/t1393wt
FW="T1243_FARM_ON=1,T1316_BODY_CLOCK=1,T1316_SUBSTEP=1,T1326_HUNT_CLOCK=1,T1351_MINE_CLOCK=1,VILLAGE_NPC_CAP=Infinity,T1195_HUNT_REAL=1"
for x in "$@"; do tag=${x%%:*}; s=${x#*:}
  grep -q "^$tag-$s " /tmp/t1393/done.txt 2>/dev/null && continue
  case $tag in off) E="$FW";; body) E="$FW,T1331_BEAST_BODY=1,T1331_BEAST_SCALE=5000";; on) E="$FW,T1331_BEAST_BODY=1,T1331_BEAST_SCALE=5000,T1393_HUNT_CHASE=1";; esac
  rm -f /tmp/t1393/runs/$tag-$s.probe.jsonl
  T1393_PROBE_OUT=/tmp/t1393/runs/$tag-$s.probe.jsonl NODE_OPTIONS="--max-old-space-size=4096 --require /tmp/t1393wt/scripts/t1393-probe.js" node scripts/t1331-run.js /tmp/t1393/runs $tag-$s hanbando $s 400 --env "$E" > /tmp/t1393/runs/$tag-$s.out 2>&1
  rm -f /tmp/t1393/runs/$tag-$s.db /tmp/t1393/runs/$tag-$s.db-wal /tmp/t1393/runs/$tag-$s.db-shm
  echo "$tag-$s $(date +%T) $(cat /tmp/t1393/runs/$tag-$s.done 2>/dev/null)" >> /tmp/t1393/done.txt
done
