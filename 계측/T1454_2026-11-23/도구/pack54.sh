#!/bin/bash
# T1454 계측 꾸리기 — 레포 계측/T1454_<날짜>/ 로 판(판 JSON · 계측기 JSON · run.out) · 표 · 도구 · 지키기
set -e
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1454
R=/home/claude/t1454
DATE=$1
T=$R/계측/T1454_$DATE
mkdir -p $T/판 $T/표 $T/도구 $T/지키기
for d in $D/runs/*/; do
  t=$(basename $d)
  for f in $d$t-*.json; do [ -e "$f" ] || continue; case "$f" in *.fd-deaths.json) continue;; esac; cp "$f" $T/판/; done
  [ -e $d/probe.json ] && cp $d/probe.json $T/판/${t}_probe.json
  [ -e $d/run.out ] && cp $d/run.out $T/판/${t}_run.out
done
cp $D/out54.json $D/hdtable.md $D/tab/판표.md $D/tab/추상노후_날별.md $D/tab/비운움집.txt $T/표/
cp $D/chain.js $D/t1438-ablate.js $D/ana54.py $D/hd_diag.py $D/absent.js $D/runs1.json $D/p1.sh $D/t54.sh $D/gates54.sh $D/hrun.sh $D/pack54.sh $D/L_touch.txt $D/L_touch_A.txt $D/L_touch_B.txt $D/L_core_only.txt $D/L_srv_only.txt $T/도구/
for f in $D/ev/*; do case "$f" in *.done) continue;; esac; cp "$f" $T/지키기/; done
du -sh $T; find $T -type f | wc -l
