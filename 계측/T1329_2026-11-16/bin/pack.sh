#!/bin/bash
# 판 폴더의 작은 원자료를 gzip 으로 계측 폴더에(DB · 덤프 · 로그 · t740 뺌 — T1318 runs/ 꼴)
SRC=$1; DST=$2; mkdir -p $DST
for f in $SRC/progress.json $SRC/progress.txt $SRC/*.fd-deaths.json $SRC/*-*.json $SRC/seg-*.json.sbc.json $SRC/seg-*.json.t1274*.json* $SRC/seg-*.json.t1302*.json* $SRC/seg-*.json.t1329*.json* $SRC/seg-*.t1230.json $SRC/seg-*.t1243.json $SRC/seg-*.t1251.json $SRC/*.t1230.json $SRC/*.t1243.json $SRC/*.t1251.json; do
  [ -f "$f" ] || continue; case "$f" in *t740*|*stop-*|*keep-*|*phase-*|*.t1221.json) continue;; esac
  gzip -9 -c "$f" > $DST/$(basename $f).gz
done
grep -c "장부 실패" $SRC/seg-*.log 2>/dev/null | awk -F: '{s+=$2} END {print "ledger-fail", s+0}' > $DST/ledger.txt
du -sh $DST
