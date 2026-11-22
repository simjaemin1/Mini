#!/bin/bash
# T1438 그림 층 — 렌더 층(36-r2 · 37-r1)을 만졌다 → @pixel 전수 가운데 만진 목록 밖 열다섯(-j 1) · 그다음 만진 목록의 빨강 둘(e2e-first30 · e2e-mtfuzz)을 혼자 다시
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1438
while [ ! -e $D/seq.done ]; do sleep 30; done
cd /home/claude/mini
echo "그림 시작 $(date -u +%FT%TZ) · 머리 $(git rev-parse --short HEAD) · 작업 트리 바뀜 $(git status --short | wc -l)" > $D/ev/하네스_그림_차례.txt
bash scripts/run-regress.sh -j 1 $(cat $D/L_pixel_only.txt) > $D/ev/하네스_그림.txt 2>&1; echo "RC=$?" >> $D/ev/하네스_그림.txt
echo "그림 끝 $(date -u +%FT%TZ)" >> $D/ev/하네스_그림_차례.txt
bash scripts/run-regress.sh -j 1 e2e-mtfuzz.js e2e-first30.js > $D/ev/하네스_다시.txt 2>&1; echo "RC=$?" >> $D/ev/하네스_다시.txt
echo "다시 끝 $(date -u +%FT%TZ)" >> $D/ev/하네스_그림_차례.txt
echo done > $D/pix.done
