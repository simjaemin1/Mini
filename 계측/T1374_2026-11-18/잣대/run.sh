# arm seed days env... — 밭 켬 판 시계 축 다 켬(ON) 또는 끔(OFF) 바탕 + 관찰기 t1374
cd /tmp/t1374wt; R=$PWD/scripts; a=$1; s=$2; days=$3; shift 3
D=/tmp/t1374/srv/$a-$s; rm -rf $D; mkdir -p $D
case $a in OFF*) BASE="VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0";; *) BASE="VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 VILLAGE_NPC_CAP=Infinity T1243_FARM_ON=1 T1316_BODY_CLOCK=1 T1316_SUBSTEP=1 T1326_HUNT_CLOCK=1 T1351_MINE_CLOCK=1";; esac
env $BASE "$@" T745_VCLOCK=1 T577_PAR=1 T577_DIR=$D T577_TAG=$a NODE_OPTIONS="${HEAP:+--max-old-space-size=$HEAP }-r $R/t745-vclock.js -r $R/t1374-observe.js" node scripts/t577-server-run.js $days $s > $D/run.log 2>&1
echo "$(date +%T) done $a $s $days rc=$?" >> /tmp/t1374/q/done.log
