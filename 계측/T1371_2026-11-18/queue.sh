#!/usr/bin/env bash
# T1371 줄: queue.sh <판(a|b)> — 시드 1020 · 7 · 42 를 차례로(일꾼 둘 = a 줄 · b 줄 동시) · 판마다 자료를 계측 폴더로(gz) 옮기고 /tmp 판 폴더(DB 포함)를 지운다
R=$1; O=/home/user/wt-years/계측/T1371_2026-11-18
for S in 1020 7 42; do
  J=/tmp/t1371/$S-$R; t0=$(date +%s)
  bash "$O/run.sh" "$S" "$R" 1200 10800
  t1=$(date +%s); D=$(ls -d "$J"/sbc-* 2>/dev/null | head -1)
  { echo "seed $S rep $R sec $((t1-t0)) $(cat "$J/X.done")"; } > "$O/$S-$R.time"
  [ -f "$D/sbc-$S.json" ] && gzip -c "$D/sbc-$S.json" > "$O/$S-$R.run.json.gz"
  [ -f "$D/sbc-$S.json.sbc.json" ] && gzip -c "$D/sbc-$S.json.sbc.json" > "$O/$S-$R.sbc.json.gz"
  [ -f "$D/sbc-$S.json.t1371.jsonl" ] && gzip -c "$D/sbc-$S.json.t1371.jsonl" > "$O/$S-$R.t1371.jsonl.gz"
  [ -f "$D/sbc-$S.fd-deaths.json" ] && gzip -c "$D/sbc-$S.fd-deaths.json" > "$O/$S-$R.fd-deaths.json.gz"
  [ -f "$J/make.json" ] && gzip -c "$J/make.json" > "$O/$S-$R.make.json.gz"
  cp "$J/check.log" "$O/$S-$R.check.log" 2>/dev/null
  [ -f "$D/sbc-$S.log" ] && tail -n 80 "$D/sbc-$S.log" | gzip -c > "$O/$S-$R.zone-tail.log.gz"
  rm -rf "$J"
done
echo done > /tmp/t1371/queue-$R.done
