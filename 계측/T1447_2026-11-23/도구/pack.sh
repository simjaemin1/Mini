#!/bin/bash
# T1447 계측 꾸리기 — 레포 계측/T1447_<날짜>/ 로 판(계측기 JSON · 판 설정 · 판 JSON) · 표 · 도구 · 지키기 · 그림은 보고/T1447_<날짜>/그림/
set -e
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1447
R=/home/claude/mini
DATE=$1
T=$R/계측/T1447_$DATE; P=$R/보고/T1447_$DATE/그림
mkdir -p $T/판 $T/표 $T/도구 $T/지키기 $P
for d in $D/runs/*/; do
  t=$(basename $d); case "$t" in SMOKE|G6P_old) continue;; esac
  mkdir -p $T/판/$t
  for f in probe.json cfg.json; do [ -e "$d/$f" ] && cp "$d/$f" $T/판/$t/; done
  for f in $d$t-*.json; do [ -e "$f" ] || continue; case "$f" in *.fd-deaths.json) continue;; esac; cp "$f" $T/판/$t/; done
done
cp $D/hits_table.md $D/hits.json $D/out_val.json $D/ntab.json $T/표/ 2>/dev/null || true
[ -e $D/out30.json ] && cp $D/out30.json $T/표/
[ -e $D/out30.md ] && cp $D/out30.md $T/표/
cp $D/chain.js $D/render.py $D/ana.py $D/overview.py $D/val2.py $D/ntab.py $D/ana30.py $D/hrun.sh $D/s1.sh $D/s2.sh $D/gates.sh $D/base.sh $D/pack.sh $D/runs1.json $D/runs2.json $D/runs3.json $D/runs4.json $D/runs5.json $D/L_touch.txt $D/L_touch_A.txt $D/L_touch_B.txt $D/L_core_only.txt $D/L_srv_only.txt $T/도구/
for f in $D/ev/*; do case "$f" in *.done) continue;; esac; cp "$f" $T/지키기/; done
cp $D/pix/*.png $P/
[ -d $D/pix30 ] && cp $D/pix30/*.png $P/ || true
du -sh $T $P; find $T -type f | wc -l; find $P -type f | wc -l
