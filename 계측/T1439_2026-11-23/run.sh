# arm seed days
cd /tmp/t1439wt; st=$1; s=$2; days=$3; D=/tmp/t1439/srv; 
grep -q "^$st-$s ok" /tmp/t1439/q/done.txt 2>/dev/null && exit 0
FW="T1243_FARM_ON=1,T1316_BODY_CLOCK=1,T1316_SUBSTEP=1,T1326_HUNT_CLOCK=1,T1351_MINE_CLOCK=1,VILLAGE_NPC_CAP=Infinity,T1195_HUNT_REAL=1"
ON="$FW,T1331_BEAST_BODY=1,T1331_BEAST_SCALE=5000,T1393_HUNT_CHASE=1,T1416_WAKE_PRE=1,T1416_FIELD_UNIT=1,T1416_BEAST_WALL=1,T1416_CARRY_HOME=1"
E="$ON"; [ "$st" = C ] && E="$ON,T1439_CALL_CARRY=1"
s0=$(date +%s)
T1416_PROBE_OUT=$D/$st-$s.p16.jsonl NODE_OPTIONS="--max-old-space-size=4096 --require $PWD/scripts/t1416-probe.js --require /tmp/t1439/obs.js" T1439_OBS=$D/$st-$s.t1439.json node scripts/t1331-run.js $D $st-$s hanbando $s $days --env "$E" > $D/$st-$s.run.log 2>&1
rc=$?; ok=bad; [ -f $D/$st-$s.json ] && ok=ok
rm -f $D/$st-$s.db $D/$st-$s.db-wal $D/$st-$s.db-shm
echo "$st-$s $ok $(date +%T) rc=$rc $(( $(date +%s)-s0 ))s" >> /tmp/t1439/q/done.txt
