#!/bin/bash
# T1454 — T1447 다시 줄(s3)이 끝난 뒤: ① 판(동시 둘) ② 하네스 두 줄(만진 (다)(라) + 서버 잡 밖 / 만진 (가)(나) + core 밖) ③ e2e-first30 혼자 · 옛 코드 빨강 · CI 표
S=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad; D=$S/t1454
while [ ! -e $S/t1447/s3.done ]; do sleep 30; done
rm -f $D/stop_runs1.json
cd $D && T1438_ROOT=/home/claude/t1454 node chain.js runs1.json 2 >> $D/runs1.log 2>&1
echo "판 끝 $(date -u +%FT%TZ)" >> $D/ev/차례.txt
( bash $D/hrun.sh $D/L_touch_A.txt $D/ev/h_만진_A.txt; bash $D/hrun.sh $D/L_srv_only.txt $D/ev/h_srv.txt; echo done > $D/hA.done ) &
bash $D/hrun.sh $D/L_touch_B.txt $D/ev/h_만진_B.txt; bash $D/hrun.sh $D/L_core_only.txt $D/ev/h_core.txt
while [ ! -e $D/hA.done ]; do sleep 30; done
echo "하네스 두 줄 끝 $(date -u +%FT%TZ)" >> $D/ev/차례.txt
echo e2e-first30.js > $D/L_first30.txt; bash $D/hrun.sh $D/L_first30.txt $D/ev/h_first30.txt
cd /home/claude/t1454
if ! grep -q "^# 합" $D/ev/옛코드빨강.txt 2>/dev/null; then TMPDIR=$D TIMEOUT_SEC=600 OUT=$D/ev/옛코드빨강.txt bash scripts/pm-old-code-red.sh 11c8a01cd test-t1454-slow.js > $D/ev/옛코드빨강_러너.txt 2>&1; fi
if ! grep -q "^rc=" $D/ev/CI_분류.txt 2>/dev/null; then node scripts/ci-class.js --measure --server --only test-t1454-slow.js > $D/ev/CI_분류.txt 2>&1; echo "rc=$?" >> $D/ev/CI_분류.txt; fi
echo done > $D/t54.done
