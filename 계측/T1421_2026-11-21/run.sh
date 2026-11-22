# arm seed days
cd /tmp/t1421wt; R=$PWD/scripts; st=$1; s=$2; days=${3:-730}; D=/tmp/t1421/srv/$st-$s
grep -q "^$st-$s ok" /tmp/t1421/q/done.txt 2>/dev/null && exit 0
rm -rf $D; mkdir -p $D
FW="T1243_FARM_ON=1 T1316_BODY_CLOCK=1 T1316_SUBSTEP=1 T1326_HUNT_CLOCK=1 T1351_MINE_CLOCK=1 VILLAGE_NPC_CAP=Infinity T1179_CROP_SEASON=1 T1276_FARM_K=1 T1284_FARM_YIELD=1 T1374_NO_BYGRAIN=1 T1374_BIRTH_HARV=1 T1374_FAMINE_HARV=1"
X="$FW"; [ -f /tmp/t1421/q/arm-$st.env ] && X="$FW $(cat /tmp/t1421/q/arm-$st.env)"
OBS="-r $R/t1408-observe.js"; [ "$st" = L6 ] && OBS="$OBS -r $R/t1388-observe.js -r $R/t1374-observe.js"
env VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 $X T745_VCLOCK=1 T577_PAR=1 T577_DIR=$D T577_TAG=$st NODE_OPTIONS="--max-old-space-size=4096 -r $R/t745-vclock.js $OBS" node scripts/t577-server-run.js $days $s > $D/run.log 2>&1
rc=$?; ok=bad; [ -f $D/$st-$s.json ] && ok=ok
rm -f $D/*.db $D/*.db-wal $D/*.db-shm
echo "$st-$s $ok $(date +%T) rc=$rc" >> /tmp/t1421/q/done.txt
