#!/bin/bash
# 판 줄 — 동시 2 이하. jobs.txt 줄 = "나무 시드 팔" · 띄운 줄은 started.txt 에(재시작 뒤 다시 안 띄운다 — 이어 가기는 restore.sh)
SP=/tmp/claude-0/-home-user-Mini/b6380702-943a-51e2-9935-6cef2859bf87/scratchpad/t1329; RUNS=/dev/shm/t1329/runs
active() { local n=0; for d in $RUNS/*/; do [ -f $d/progress.json ] || continue; grep -q '"done": true' $d/progress.json && continue; pgrep -f "runs/$(basename $d)" > /dev/null && n=$((n+1)); done; echo $n; }
while :; do
  next=""; while read t s a x; do [ -z "$t" ] && continue; grep -qx "$t $s $a${x:+ $x}" $SP/started.txt 2>/dev/null || { next="$t $s $a${x:+ $x}"; break; }; done < $SP/jobs.txt
  [ -z "$next" ] && exit 0
  if [ "$(active)" -lt 2 ]; then
    set -- $next
    echo "$next" >> $SP/started.txt; echo "$(date -u +%FT%TZ) start $next" >> $SP/queue.log
    if [ "$3" = GATE ]; then (cd /dev/shm/t1329 && setsid nohup bash -c "mkdir -p $RUNS/GATE && echo '{}' > $RUNS/GATE/progress.json && $SP/bin/gate.sh $1; echo '{"done": true}' > $RUNS/GATE/progress.json" > /dev/null 2>&1 &)
    else (cd /dev/shm/t1329 && SFX=$4 setsid nohup $SP/bin/arm.sh /dev/shm/t1329/$1 $2 $3 > /dev/null 2>&1 &); fi
    sleep 60
  fi
  sleep 30
done
