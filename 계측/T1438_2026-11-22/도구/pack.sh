#!/bin/bash
# 계측 폴더 꾸리기 — 레포 계측/T1438_<날짜>/ 로 진단 · 판(최종 · 첫판 · 갈래 — 계측기 JSON · 판 JSON · 판 표) · 표 · 도구 · 지키기를 옮긴다
set -e
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1438
R=/home/claude/mini
DATE=$1
T=$R/계측/T1438_$DATE
mkdir -p $T/판/첫판 $T/판/갈래 $T/표 $T/도구 $T/지키기
cp $D/diag.md $T/진단.md
take() {   # $1 = 판 폴더 · $2 = 놓을 곳
  for d in $1/*/; do
    t=$(basename $d)
    case "$t" in SMK_*|AB_IND_42) continue;; esac
    [ -e "$d/probe.json" ] && cp "$d/probe.json" "$2/${t}_probe.json"
    for f in $d$t-*.json; do [ -e "$f" ] || continue; case "$f" in *.fd-deaths.json) continue;; esac; cp "$f" "$2/"; done
    [ -e "$d/run.out" ] && cp "$d/run.out" "$2/${t}_run.out"
  done
}
take $D/runs $T/판
take $D/runs_v1 $T/판/첫판
take $D/runs_abl $T/판/갈래
cp $D/out/nums.json $T/표/
cp $D/out/extra.json $T/표/
cp $D/chain.js $D/ana.py $D/abl.py $D/diag.js $D/t1438-ablate.js $D/pack.sh $D/harn.sh $D/seq.sh $D/gates.sh $D/runs.json $D/runs3.json $D/runs4.json $D/runs5.json $D/runs6.json $D/runs7.json $D/hsum.py $D/assemble.py $D/re.sh $D/pix.sh $D/L_touch.txt $D/L_core_only.txt $D/L_srv_only.txt $D/L_pixel_only.txt $T/도구/
for f in $D/ev/*; do cp "$f" $T/지키기/; done
cp $D/out/README.md $T/README.md
du -sh $T; find $T -type f | wc -l
