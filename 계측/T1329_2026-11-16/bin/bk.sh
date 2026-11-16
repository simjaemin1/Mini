#!/bin/bash
# 마디 체크포인트를 디스크로(컨테이너 재시작이 /dev/shm 을 지운다) — 체크포인트 날이 바뀐 판만 · 판 하나 = tar.gz 하나
SRC=/dev/shm/t1329/runs; DST=/tmp/claude-0/-home-user-Mini/b6380702-943a-51e2-9935-6cef2859bf87/scratchpad/t1329/bk
mkdir -p $DST
while :; do
  for d in $SRC/*/; do
    n=$(basename $d); [ -f $d/progress.json ] || continue
    ck=$(cat $d/ck/day 2>/dev/null || echo 0)
    done=$(grep -c '"done": true' $d/progress.json)
    key="$ck.$done"
    last=$(cat $DST/$n.key 2>/dev/null || echo -1)
    if [ "$key" != "$last" ]; then
      (cd $d && tar -czf $DST/$n.tgz.new --anchored --exclude './w.db' --exclude './w.db-wal' --exclude './w.db-shm' --exclude './ck.tmp' --exclude './ck.old' --exclude './stop-*' --exclude './keep-*' --exclude './phase-*' --exclude './state.json' .) && mv $DST/$n.tgz.new $DST/$n.tgz && echo $key > $DST/$n.key
      echo "$(date -u +%FT%TZ) bk $n ck=$ck done=$done $(du -h $DST/$n.tgz | cut -f1)" >> $DST/bk.log
    fi
  done
  for f in $SRC/*.exit $SRC/*.guard.out; do [ -f "$f" ] && cp -p $f $DST/; done
  sleep 60
done
