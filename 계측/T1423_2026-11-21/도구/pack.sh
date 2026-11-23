#!/bin/bash
# 계측 폴더 꾸리기 — 레포 계측/T1423_<날짜>/ 로 판(계측기 JSON · 판 JSON) · 표 · 도구 · 지키기를 옮긴다
set -e
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1423
R=/home/claude/mini
DATE=$1
T=$R/계측/T1423_$DATE
mkdir -p $T/판 $T/표 $T/도구 $T/지키기
for d in $D/runs/*/; do
  t=$(basename $d)
  case "$t" in SMK_*) continue;; esac
  [ -e "$d/probe.json" ] && cp "$d/probe.json" "$T/판/${t}_probe.json"
  for f in $d$t-*.json; do [ -e "$f" ] || continue; case "$f" in *.fd-deaths.json) continue;; esac; cp "$f" "$T/판/"; done
done
cp $D/out/tabGroup.md $D/out/tabWorld.md $D/out/bot.json $D/out/oneblock.json $T/표/
cp $D/chain.js $D/ana.py $D/pack.sh $D/harn.sh $D/gates.sh $D/bot.json $D/L_touch.txt $D/L_core_only.txt $D/L_srv_only.txt $T/도구/
for f in $D/ev/*; do cp "$f" $T/지키기/; done
cp $D/out/README.md $T/README.md 2>/dev/null || true
du -sh $T; ls $T/판 | wc -l
