#!/bin/bash
# farm-bench.sh <seed> <days> — 밭 세계(T1421 판 조건 E) 재는 판(T1452_SHADOW=1) · 장부 셈 µs 자만(진짜 시계 — 가상 시계 자보다 먼저 싣는다)
SP=/tmp/claude-0/-home-claude/1f1e7ed8-6ef5-52d5-88f7-6d92b60be336/scratchpad
WT=/tmp/t1452; R=$WT/scripts; s=$1; days=$2
D=$SP/t1452/bench/F-$s-$days; python3 -c "import shutil,sys; shutil.rmtree(sys.argv[1], ignore_errors=True)" $D; mkdir -p $D
FW="T1243_FARM_ON=1 T1316_BODY_CLOCK=1 T1316_SUBSTEP=1 T1326_HUNT_CLOCK=1 T1351_MINE_CLOCK=1 VILLAGE_NPC_CAP=Infinity T1179_CROP_SEASON=1 T1276_FARM_K=1 T1284_FARM_YIELD=1 T1374_NO_BYGRAIN=1 T1374_BIRTH_HARV=1 T1374_FAMINE_HARV=1"
ARM_E="T1408_HARV_AXIS=1 T1297_BIRTH_FOOD=1 T1319_AUTUMN_LOOK=1 T1346_BIRTH_FLOW=1 T1408_FARM_VALUE=1 T1421_FIELD_CAP=1 T1421_BIRTH_YEAR=1"
BK=$WT/계측/T1452_2026-11-23/t1452-us-bench.js
cd $WT && env VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 $FW $ARM_E T1452_SHADOW=1 T1452_BENCH_TRACE=1 T1452_ROOT=$WT T1452_BENCH_OUT=$SP/t1452/bench/farm-$s-$days.json T745_VCLOCK=1 T577_PAR=1 T577_DIR=$D T577_TAG=Fb NODE_OPTIONS="--max-old-space-size=4096 -r $BK -r $R/t745-vclock.js" node scripts/t577-server-run.js $days $s > $D/run.log 2>&1
rc=$?
python3 - "$D" <<'PY'
import os, sys, glob
d=sys.argv[1]
for f in glob.glob(os.path.join(d,'*.db'))+glob.glob(os.path.join(d,'*.db-wal'))+glob.glob(os.path.join(d,'*.db-shm')):
    try: os.remove(f)
    except Exception: pass
PY
echo "farm-bench $s rc=$rc $(date -u +%T)" >> $SP/t1452/done.txt
