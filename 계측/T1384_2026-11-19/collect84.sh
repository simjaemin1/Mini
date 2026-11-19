#!/bin/bash
# T1384 판 모으기 — 판 자리(기본 /root/t1384runs)의 서버 · 몸 판 `<판>-<시드>/` · 랩 판 `lab/<판>-<시드>/` → 이 폴더 `runs/`   (T1385 collect85.sh 꼴 그대로)
#   서버 · 몸: 판 JSON · fd-deaths · 관찰기 JSON(t1384 · t1333 · t1344 · t1347 · t1313 · t1243 — 300 KB 넘으면 `.json.gz`) · 러너 출력(`<판>-<시드>-러너.txt`) · 로그 gz · 몸 판 progress.json
#   랩: probe.json(gz) · 러너 로그 꼬리 · lab.txt
#   쓰는 법(레포 뿌리): bash 계측/T1384_2026-11-19/collect84.sh [/root/t1384runs] — 다 끝난 판(판 JSON 또는 관찰기 JSON 이 선 것)만 · 다시 돌려도 같다
#   표: RUNS=계측/T1384_2026-11-19/runs ARMS=OFF,ROUTE,KEEP node scripts/t1384-table.js
R=${1:-/root/t1384runs}; D=$(cd "$(dirname "$0")" && pwd)/runs; mkdir -p $D $D/lab
n=0
for d in "$R"/S*-*/ "$R"/B*-*/; do
  b=$(basename "$d"); [ -f "$d/$b.json" ] || [ -f "$d/$b.t1384.json" ] || continue
  [ -f "$d/$b.json" ] && cp "$d/$b.json" "$D/"; [ -f "$d/$b.fd-deaths.json" ] && cp "$d/$b.fd-deaths.json" "$D/"
  for f in "$d/$b".t*.json; do
    [ -f "$f" ] || continue; x=$(basename "$f")
    if [ "$(stat -c %s "$f")" -gt 300000 ]; then gzip -9 -c "$f" > "$D/$x.gz"; rm -f "$D/$x"; else cp "$f" "$D/"; rm -f "$D/$x.gz"; fi
  done
  [ -f "$d/$b.log" ] && gzip -9 -c "$d/$b.log" > "$D/$b.log.gz"
  [ -f "$R/$b.out" ] && cp "$R/$b.out" "$D/$b-러너.txt"
  [ -f "$d/progress.json" ] && cp "$d/progress.json" "$D/$b.progress.json"
  n=$((n+1))
done
m=0
for d in "$R"/lab/*/; do
  b=$(basename "$d"); [ -f "$d/probe.json" ] || continue; mkdir -p $D/lab/$b
  gzip -9 -c "$d/probe.json" > $D/lab/$b/probe.json.gz
  [ -f "$d/run.log" ] && tail -40 "$d/run.log" > $D/lab/$b/run-tail.txt
  m=$((m+1))
done
[ -f "$R/lab.txt" ] && cp "$R/lab.txt" $D/lab/
[ -f "$R/done.txt" ] && cp "$R/done.txt" $D/
echo "판 $n · 랩 $m 옮김 → $D"
