#!/usr/bin/env bash
# T1500 스냅숏 판 — A: 이어 돈 700날(스냅 100·300·500·690) · B: 500날 끊고 다시 띄운 판(다시 뜬 첫 날 스냅)
# 다시 부르기: 같은 줄 그대로(판 자가 progress.json 에서 이어 간다)
R=/home/user/t1500; O=/home/user/t1500-out; OBS=$R/계측/T1500_2026-11-27/t1500-observe.js
which=${1:-A}
if [ "$which" = A ]; then D=$O/snapA; mkdir -p $D/tmp
  cd $R && nohup env T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 TMPDIR=$D/tmp T1500_OBS=$D/obs T1500_SNAP_DAYS=100,300,500,690 NODE_OPTIONS="-r $OBS" \
    node scripts/t1308-long-run.js 700 1020 --every 700 --dir $D --tag snapA > $D/runner.out 2>&1 < /dev/null &
elif [ "$which" = B ]; then D=$O/snapB; mkdir -p $D/tmp
  cd $R && nohup env T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 TMPDIR=$D/tmp T1500_OBS=$D/obs T1500_SNAP_FIRST=1 NODE_OPTIONS="-r $OBS" \
    node scripts/t1308-long-run.js 520 1020 --cuts 500 --dir $D --tag snapB > $D/runner.out 2>&1 < /dev/null &
fi
[ "$which" != C ] && echo "$(date -u +%FT%TZ) launch $which pid $!" >> $O/meta.txt
# C: 1,260날 이어 돈 판(6 GB 힙 · 스냅 900·1100·1240 · 하루 큰 GC 꼭대기) — `launch-snap.sh C`
if [ "$which" = C ]; then D=$O/snapC; mkdir -p $D/tmp
  cd $R && nohup env T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 TMPDIR=$D/tmp T1500_OBS=$D/obs T1500_SNAP_DAYS=900,1100,1240 T1500_CENSUS=50 NODE_OPTIONS="-r $OBS" \
    node scripts/t1308-long-run.js 1260 1020 --every 1260 --dir $D --tag snapC > $D/runner.out 2>&1 < /dev/null &
  echo "$(date -u +%FT%TZ) launch C pid $!" >> $O/meta.txt
fi
