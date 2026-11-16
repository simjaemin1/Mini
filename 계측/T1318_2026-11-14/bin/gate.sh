#!/bin/bash
R=/root/minirepo; D=/tmp/t1318/gate; mkdir -p $D; cd $R
for k in $(env | grep -oE '^(T[0-9]+_[A-Z0-9_]+|VILLAGE_[A-Z_]+)'); do unset $k; done
node scripts/server-baseline-check.js 계측/서버기준선_2026-11-14.json --vclock --plan 1020:400 --par 1 > $D/gate.log 2>&1; echo "exit $?" > $D/gate.exit
node scripts/t17-metrics.js 800 1020 > $D/t17.log 2>&1; echo "exit $?" > $D/t17.exit
