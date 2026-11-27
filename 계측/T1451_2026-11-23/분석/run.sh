cd /tmp/t1451wt; R=$PWD/scripts; st=$1; s=$2; days=${3:-730}; D=/tmp/t1451/srv/$st-$s
grep -q "^$st-$s ok" /tmp/t1451/q/done.txt 2>/dev/null && exit 0
rm -rf $D; mkdir -p $D
X="$(cat /tmp/t1451/q/arm-$st.env | tr '\n' ' ')"
case " $X " in *" FW=1 "*) X="$X T1243_FARM_ON=1 T1316_BODY_CLOCK=1 T1316_SUBSTEP=1 T1326_HUNT_CLOCK=1 T1351_MINE_CLOCK=1 VILLAGE_NPC_CAP=Infinity T1179_CROP_SEASON=1 T1276_FARM_K=1 T1284_FARM_YIELD=1 T1374_NO_BYGRAIN=1 T1374_BIRTH_HARV=1 T1374_FAMINE_HARV=1 T1408_HARV_AXIS=1 T1297_BIRTH_FOOD=1 T1319_AUTUMN_LOOK=1 T1346_BIRTH_FLOW=1 T1408_FARM_VALUE=1 VILLAGE_CARAVAN_MAX=0";; esac
s0=$(date +%s)
env T400_BUILD_ACT=0 $X T745_VCLOCK=1 T577_PAR=1 T577_DIR=$D T577_TAG=$st NODE_OPTIONS="--max-old-space-size=4096 -r $R/t745-vclock.js -r $R/t1408-observe.js -r $R/t1422-observe.js" node scripts/t577-server-run.js $days $s > $D/run.log 2>&1
rc=$?; ok=bad; [ -f $D/$st-$s.json ] && ok=ok
rm -f $D/*.db $D/*.db-wal $D/*.db-shm
echo "$st-$s $ok $(date +%T) rc=$rc $(( $(date +%s)-s0 ))s" >> /tmp/t1451/q/done.txt
