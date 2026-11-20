#!/bin/bash
# 전쟁 판 차례(한 판씩 — 상자 메모리 한도 ≈ 6GB) — ① main 나무로 전쟁 판 기준선 800날을 뜬다 ② 이 가지(손잡이 끔)를 그것과 견준다 + 같은 판에 관찰기(= OFF_W) ③ NH_W · ALL_W(사슬)
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1391
E=$D/ev; M=$D/mainwt; WT=$D/wt
echo "start $(date -u)" > $E/warphase.log
cd $M && node scripts/server-baseline-check.js --make $E/전쟁_main800.json --war --days 800 --seeds 1020 > $E/전쟁_main800_make.txt 2>&1
echo "make rc=$? $(date -u)" >> $E/warphase.log
cd $WT && NODE_OPTIONS="--require $D/t1391hook.js" T1391_ROOT=$WT node scripts/server-baseline-check.js $E/전쟁_main800.json --war --plan 1020:800 > $E/전쟁_가지800_check.txt 2>&1
echo "check rc=$? $(date -u)" >> $E/warphase.log
cd $D && node chain.js $D/wW2.json 1 >> $D/chain_wW2.out 2>&1
echo "chain done $(date -u)" >> $E/warphase.log
