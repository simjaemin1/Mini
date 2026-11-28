#!/bin/bash
# T1427 판 모으기 — /root/t1427runs 의 판을 이 폴더로(관찰기 · 판 JSON · 로그 .gz) · 지도마다 뿌리(_old · _new)를 세워 t1407-table 로 요약 · t1427-table 로 비교 표
#   (T1407 collect07.sh 꼴 · 끝난 판만 — done.txt 의 rc=0 줄)
SRC=/root/t1427runs; DST=$(cd "$(dirname "$0")" && pwd); R=$(cd "$DST/../.." && pwd)
for MAP in old new; do
  M=$SRC/_$MAP; rm -rf $M; mkdir -p $M; : > $M/done.txt
  for d in $SRC/$MAP-lab-*; do [ -d "$d" ] || continue; b=$(basename $d); short=${b#$MAP-}
    ln -sfn $d $M/$short; grep " $b rc=0 " $SRC/done.txt | sed "s/ $b / $short /" >> $M/done.txt; done
  timeout 300 node $R/scripts/t1407-table.js $M --json $DST/요약-$MAP.json > $DST/표-$MAP.md
done
mkdir -p $DST/runs
for d in $SRC/old-* $SRC/new-*; do [ -d "$d" ] || continue; b=$(basename $d)
  grep -q " $b rc=0 " $SRC/done.txt || continue
  mkdir -p $DST/runs/$b; for f in t1407.json probe.json world.json t17.json run.log; do [ -f $d/$f ] && gzip -9c $d/$f > $DST/runs/$b/$f.gz; done; done
grep -E 'rc=' $SRC/done.txt > $DST/runs/done.txt
timeout 300 node $R/scripts/t1427-table.js $SRC $DST --json $DST/비교.json > $DST/표.md
