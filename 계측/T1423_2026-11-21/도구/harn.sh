#!/bin/bash
# T1423 하네스 — 만진 목록 단독(-j 1) · core 중 만진 목록 밖 · 서버 잡 중 둘 밖 — 로컬 한 번(land1086 규칙) · 출력 ev/하네스_*.txt
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1423
cd /home/claude/mini
echo "만진 시작 $(date -u +%FT%TZ) · 머리 $(git rev-parse --short HEAD) · 작업 트리 바뀜 $(git status --short | wc -l)" > $D/ev/하네스_차례.txt
node scripts/touched-harness.js origin/main --run -j 1 > $D/ev/하네스_만진.txt 2>&1; echo "RC=$?" >> $D/ev/하네스_만진.txt
echo "만진 끝 $(date -u +%FT%TZ)" >> $D/ev/하네스_차례.txt
bash scripts/run-regress.sh $(cat $D/L_core_only.txt) > $D/ev/하네스_core.txt 2>&1; echo "RC=$?" >> $D/ev/하네스_core.txt
echo "core 끝 $(date -u +%FT%TZ)" >> $D/ev/하네스_차례.txt
bash scripts/run-regress.sh $(cat $D/L_srv_only.txt) > $D/ev/하네스_srv.txt 2>&1; echo "RC=$?" >> $D/ev/하네스_srv.txt
echo "서버 잡 끝 $(date -u +%FT%TZ)" >> $D/ev/하네스_차례.txt
echo done > $D/harn.done
