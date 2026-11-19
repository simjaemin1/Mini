#!/bin/bash
# T1347 판 모으기 — 판 자리(기본 /root/t1347runs · 인자 1)의 `<판>-<시드>/` → 이 폴더
#   판 JSON · fd-deaths(굶음) · 관찰기 JSON(300 KB 넘으면 `.json.gz` — 자들이 둘 다 읽는다) · 로그 gz · 러너 txt(`벽 …초` · 작업 트리 줄)
#   쓰는 법(레포 뿌리): bash 계측/T1347_2026-11-17/collect.sh [/root/t1347runs]   — 다 끝난 판(판 JSON 이 선 것)만 옮긴다 · 다시 돌려도 같다
R=${1:-/root/t1347runs}; D=$(dirname "$0")
n=0
for d in "$R"/*/; do
  b=$(basename "$d"); [ -f "$d/$b.json" ] || continue
  cp "$d/$b.json" "$D/"; [ -f "$d/$b.fd-deaths.json" ] && cp "$d/$b.fd-deaths.json" "$D/"
  for f in "$d/$b".t*.json; do
    [ -f "$f" ] || continue; x=$(basename "$f")
    if [ "$(stat -c %s "$f")" -gt 300000 ]; then gzip -9 -c "$f" > "$D/$x.gz"; rm -f "$D/$x"; else cp "$f" "$D/"; rm -f "$D/$x.gz"; fi
  done
  [ -f "$d/$b.log" ] && gzip -9 -c "$d/$b.log" > "$D/$b.log.gz"
  [ -f "$R/$b.log" ] && cp "$R/$b.log" "$D/$b-러너.txt"
  n=$((n+1))
done
echo "판 $n 옮김 → $D"
