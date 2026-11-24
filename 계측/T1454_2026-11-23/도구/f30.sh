#!/bin/bash
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1454
cd /home/claude/t1454
echo "## 직접(러너 상한 없이) $(date -u +%FT%TZ) · 머리 $(git rev-parse --short HEAD)" > $D/ev/first30_직접.txt
node scripts/e2e-first30.js --out $D/ev/first30_out.json >> $D/ev/first30_직접.txt 2>&1; echo "rc=$?" >> $D/ev/first30_직접.txt
echo "## 끝 $(date -u +%FT%TZ)" >> $D/ev/first30_직접.txt
echo done > $D/f30.done
