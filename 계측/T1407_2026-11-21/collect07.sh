#!/bin/bash
# T1407 판 모으기 — /root/t1407runs/<꼴>-<팔>-<시드>/ 에서 표 자(`scripts/t1407-table.js`)가 읽는 것만 이 폴더 runs/ 로(.gz) · 끝난 판 줄(done.txt) · 표.md
#   남기는 것: t1407 관찰기(주석 장부 · 마을-날 · 교역 줄) · t1385 관찰기(청동 몫 · 날 50/100 꾸러미) · 서버 판 JSON · 랩 세계 JSON(t17 자) · 판 로그(.gz)
#   안 남기는 것: 서버 DB · t1398 관찰기(13 MB — 표가 안 읽는다) · 랩 씨 캐시
set -euo pipefail
SRC=${1:-/root/t1407runs}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
DST=$HERE/runs
mkdir -p "$DST"
grep -E ' rc=0 ' "$SRC/done.txt" | grep -E ' (lab|server)-[a-z0-9]+-[0-9]+ ' > "$DST/done.txt"
for d in $(awk '{print $2}' "$DST/done.txt"); do
  s=$SRC/$d; t=$DST/$d; mkdir -p "$t"
  for f in "$s"/t1407.json "$s"/probe.json "$s"/world.json "$s"/*.t1407.json "$s"/*.t1385.json; do if [ -f "$f" ]; then gzip -9 -c "$f" > "$t/$(basename "$f").gz"; fi; done
  for f in "$s"/run.log "$s"/*.log; do if [ -f "$f" ]; then gzip -9 -c "$f" > "$t/$(basename "$f").gz"; fi; done
  for f in "$s"/*-[0-9]*.json; do case "$f" in *.t1*.json) ;; *) if [ -f "$f" ]; then cp "$f" "$t/"; fi ;; esac; done
done
node "$ROOT/scripts/t1407-table.js" "$DST" --json "$HERE/요약.json" > "$HERE/표.md"
du -sh "$DST"
