# arm(on/off) — 후보 판 그대로(server-baseline-check --make) 1020 380날 + 광산 걸이
a=$1; W=$2; D=/tmp/t1351/srv/MV$a; rm -rf $D; mkdir -p $D; cd $W
MV_OUT=$D/mv.json MV_ROOT=$W NODE_OPTIONS="-r /tmp/t1351/dbg/mv.js" node scripts/server-baseline-check.js --make $D/b.json --days 380 --seeds 1020 --bodies all --farm-clock --vclock --par 1 > $D/run.log 2>&1
echo "$(date +%T) MV$a rc=$? $(grep '시드 1020:' $D/run.log)" >> /tmp/t1351/c/log.txt
