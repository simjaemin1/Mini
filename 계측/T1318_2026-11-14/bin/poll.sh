#!/bin/bash
date -u +%T
for d in /tmp/t1318/*-1020 /tmp/t1318/*-7; do [ -f $d/progress.txt ] && echo "$(basename $d): $(cut -c26- $d/progress.txt)"; done
[ -f /tmp/t1318/R50/server/run-1020.json.t1302-days.jsonl ] && echo "R50 day $(wc -l < /tmp/t1318/R50/server/run-1020.json.t1302-days.jsonl) $(cat /tmp/t1318/R50/exit.txt 2>/dev/null)"
[ -f /tmp/t1318/H10/server/run-1020.json.t1302-days.jsonl ] && echo "H10 day $(wc -l < /tmp/t1318/H10/server/run-1020.json.t1302-days.jsonl) $(cat /tmp/t1318/H10/exit.txt 2>/dev/null)"
ls /tmp/t1318/gate 2>/dev/null | tr '\n' ' '; echo
grep -h -c "장부 실패" /tmp/t1318/*-1020/seg-*.log /tmp/t1318/*-7/seg-*.log 2>/dev/null | paste -sd+ | bc
ps -eo args | grep -c "[s]erver/zone.js"; df -h / | tail -n 1 | awk '{print $4}'
