#!/bin/bash
# 계측 폴더 꾸리기 — 레포 계측/T1404_<날짜>/ 로 판 · 표 · 도구 · 지키기를 옮긴다(판 JSON · 관찰기 줄 · 진단 판)
set -e
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1404
R=/home/claude/mini
DATE=$1
T=$R/계측/T1404_$DATE
mkdir -p $T/판 $T/표 $T/도구 $T/지키기 $T/진단
for d in $D/runs/*/; do
  t=$(basename $d)
  case "$t" in SMK_ALLT_1020) ;; SMK_*) continue;; esac
  for f in $d$t-*.json $d$t-*.json.t1404.json; do
    [ -e "$f" ] || continue
    case "$f" in *.fd-deaths.json) continue;; esac
    case "$t" in DIAG*|NOFEAR*|SMK_*) cp "$f" "$T/진단/";; *) cp "$f" "$T/판/";; esac
  done
done
cp $D/out/*.md $D/out/sum.json $T/표/ 2>/dev/null || true
rm -f $T/표/report.md $T/표/hoebu.md $T/표/README.md $T/표/chat.md
for d in $D/runs_dead_*; do [ -d "$d" ] || continue; for f in $d/*.t1404.json $d/run.out; do [ -e "$f" ] && cp "$f" "$T/진단/$(basename $d)_$(basename $f)"; done; done   # 힙 한도에 죽은 첫 판(관찰기 · 판 자 출력)
cp $D/t1404hook.js $D/chain.js $D/after.js $D/after2.js $D/after3.js $D/harn.sh $D/ana.py $D/mk.py $D/ext.py $D/build.py $D/chat.py $D/pack.sh $D/main.json $D/war.json $D/rest.json $D/rest2.json $D/rest3.json $D/diag.json $D/diag2.json $D/nr.json $D/smoke.json $D/L_touch.txt $D/L_core_only.txt $D/L_srv_only.txt $T/도구/
for f in $D/ev/*; do cp "$f" $T/지키기/; done
mv $T/지키기/진단계측.patch $T/지키기/겁0대조.patch $T/진단/ 2>/dev/null || true
rm -f $T/지키기/extra.json
cp $D/old_red.txt $T/지키기/옛코드빨강.txt
cp $D/old_red_full.txt $T/지키기/옛코드빨강_줄.txt
cp $D/harness_run.txt $T/지키기/하네스.txt
cp $D/out/README.md $T/README.md
du -sh $T; ls $T/판 | wc -l
