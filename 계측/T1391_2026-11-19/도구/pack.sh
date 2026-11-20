#!/bin/bash
# 계측 폴더 꾸리기 — 레포 계측/T1391_<날짜>/ 로 판 · 표 · 도구 · 지키기를 옮긴다
set -e
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1391
R=/home/claude/mini
DATE=$1
T=$R/계측/T1391_$DATE
mkdir -p $T/판 $T/표 $T/도구 $T/지키기
# 판 — 실제 판 파일(별칭 아님)만 · 별칭(ALL_7 = AR_7 · AR_42 = ALL_42)은 README 에 적는다
for d in $D/runs/*/; do
  t=$(basename $d)
  [ "$t" = "T_all40" ] && continue
  for f in $d$t-*.json $d$t-*.json.t1391.json; do
    [ -e "$f" ] || continue
    [ -L "$f" ] && continue
    case "$f" in *.fd-deaths.json) continue;; esac
    cp "$f" "$T/판/"
  done
done
# 멈춘 판(같은 세계 확인용 600날)
cp $D/runs_old/ALL_7_oom/ALL_7-7.json.t1391.json $T/판/ALL_7_oom600-7.json.t1391.json
cp $D/runs_old/AR_42_part/AR_42-42.json.t1391.json $T/판/AR_42_stop600-42.json.t1391.json
# 표
cp $D/out/*.md $D/out/*.json $D/out/*.csv $T/표/ 2>/dev/null || true
rm -f $T/표/report.md $T/표/hoebu.md $T/표/README.md
# 도구
cp $D/t1391hook.js $D/chain.js $D/waiter.js $D/warphase.sh $D/ana.py $D/mk.py $D/vals.py $D/s2.json $D/s3.json $D/wB.json $D/wW.json $D/wW2.json $D/q1a.json $D/q1b.json $D/wNH.json $D/wALL.json $T/도구/
# 지키기
cp $D/ev/기준선1118.txt $T/지키기/
cp $D/ev/t17.txt $T/지키기/
cp $D/ev/게이트_번들.txt $D/ev/게이트_인라인.txt $D/ev/게이트_배선.txt $T/지키기/
cp $D/ev/war_probe.txt $T/지키기/전쟁기준선1103_30.txt
cp $D/ev/war_det30.txt $T/지키기/전쟁_main30.txt
cp $D/ev/전쟁_main30.json $T/지키기/
[ -e $D/ev/전쟁_main120.json ] && cp $D/ev/전쟁_main120.json $T/지키기/ || true
[ -e $D/ev/war120.txt ] && cp $D/ev/war120.txt $T/지키기/전쟁_main120.txt || true
[ -e $D/ev/전쟁_main120v.json ] && cp $D/ev/전쟁_main120v.json $T/지키기/ || true
[ -e $D/ev/war120v.txt ] && cp $D/ev/war120v.txt $T/지키기/전쟁_main120v.txt || true
[ -e $D/ev/전쟁_main800_make.txt ] && cp $D/ev/전쟁_main800_make.txt $T/지키기/전쟁_main800_멈춤.txt || true
cp $D/ev/전쟁_main360_make.txt $T/지키기/전쟁_main360_OOM.txt; cp $D/ev/전쟁_가지360_make.txt $T/지키기/전쟁_가지360_OOM.txt
cp $D/ev/NH_B_part.t1391.json $T/판/NH_B_stop60-1020.json.t1391.json
cp $D/ev/OFF_W_360.t1391.json $T/판/OFF_W_cut360-1020.json.t1391.json 2>/dev/null || true
cp $D/cmpbase.py $D/pack.sh $D/assemble.py $D/warcut.js $T/도구/
cp $D/touched.txt $T/지키기/touched.txt
cp $D/touched_run.out $T/지키기/touched_run.txt
cp $D/ev/harness_run.txt $T/지키기/하네스.txt
cp $D/ev/old_red.txt $T/지키기/옛코드빨강.txt
cp $D/ev/old_red_full.txt $T/지키기/옛코드빨강_줄.txt
cp $D/out/README.md $T/README.md
du -sh $T; ls $T/판 | wc -l
