#!/bin/bash
# 줄 1 — 만진 (다)(라)(표 밖) → 서버 잡 중 둘 밖 → e2e-first30(긴 판 — 끝에)
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1447
grep -vx 'e2e-first30.js' $D/L_touch_A.txt > $D/L_A1.txt
bash $D/hrun.sh $D/L_A1.txt $D/ev/h2_만진_A.txt
bash $D/hrun.sh $D/L_srv_only.txt $D/ev/h2_srv.txt
echo e2e-first30.js > $D/L_A2.txt
bash $D/hrun.sh $D/L_A2.txt $D/ev/h2_first30.txt
echo done > $D/s1.done
