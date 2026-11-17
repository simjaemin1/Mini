#!/bin/bash
R=/root/minirepo; D=/tmp/t1340/war; cd $R
for k in $(env | grep -oE '^(T[0-9]+_[A-Z0-9_]+|VILLAGE_[A-Z_]+)'); do unset $k; done
node scripts/server-baseline-check.js --make $D/전쟁기준선_가상시계_후보.json --war inf --vclock --days 800 --seeds 1020,7,42 --par 2 > $D/make.log 2>&1; echo "exit $?" > $D/make.exit
node scripts/server-baseline-check.js $D/전쟁기준선_가상시계_후보.json --war inf --vclock --plan 1020:800 --par 1 > $D/check1020.log 2>&1; echo "exit $?" > $D/check.exit
