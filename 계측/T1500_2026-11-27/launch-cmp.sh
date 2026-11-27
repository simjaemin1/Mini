#!/usr/bin/env bash
# T1500 견줌 판 — off / on(T1500_HEAP_TRIM=1) · 시드 1020 · 끔 세계 · T1500 관찰기(GC 10날 · 큰 GC 꼭대기 · 셈 50날)
# 쓰는 법: launch-cmp.sh <off|on> <날> <fp|heap>
#   fp   = 날 지문 관찰기(t650-print · t1308-bodyprint · t740 은 판 자가 늘 싣는다) · 힙 6 GB(판 자 기본 — 지문 관찰기 자체가 날마다 쌓는다)
#   heap = 지문 관찰기 없음 · 기본 힙(LONG_RUN_HEAP_MB=0 — T1434 def 판과 같은 힙) — 넘치는 날 · 힙 곡선
# 다시 부르면 progress.json 에서 이어 간다(같은 줄)
R=/home/user/t1500; O=/home/user/t1500-out; OBS=$R/계측/T1500_2026-11-27/t1500-observe.js
arm=$1; days=$2; kind=${3:-fp}
D=$O/$kind-$arm$days; mkdir -p $D/tmp
KN=""; [ "$arm" = on ] && KN="T1500_HEAP_TRIM=1"
if [ "$kind" = fp ]; then NO="-r $R/scripts/t650-print.js -r $R/scripts/t1308-bodyprint.js -r $OBS"; HP=""; else NO="-r $OBS"; HP="LONG_RUN_HEAP_MB=0"; fi
cd $R && nohup env $KN $HP T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 TMPDIR=$D/tmp T1500_OBS=$D/obs T1500_CENSUS=50 NODE_OPTIONS="$NO" \
  node scripts/t1308-long-run.js $days 1020 --every $days --dir $D --tag $arm > $D/runner.out 2>&1 < /dev/null &
echo "$(date -u +%FT%TZ) launch-cmp $kind $arm $days pid $! head $(git -C $R rev-parse --short HEAD) dirty $(git -C $R status --porcelain server sim | wc -l) diff $(git -C $R diff -- server sim | md5sum | cut -c1-8)" >> $O/meta.txt
