#!/bin/bash
# 하네스별 혼자 로그(solo/S<i>-<h>.log) → 판 로그 S<i>.log(러너 로그 모양: 덩어리 · 요약 · rc/벽) — 끝난 종만
D=/tmp/claude-0/-home-user-Mini/2b37f3bf-4e2c-5696-b52a-e22e02e2f0d7/scratchpad/t1478; OUT=${1:-$D/out}; mkdir -p $OUT
for p in S1 S2 S3 S4 S5 V1; do g=(); r=(); w=0; n=0; : > $OUT/$p.log
  for f in $D/solo/$p-*.log; do [ -f "${f%.log}.done" ] || continue; h=$(basename $f .log); h=${h#$p-}; n=$((n+1))
    sed -n '/^##### /,/RC=/p' $f >> $OUT/$p.log
    sec=$(sed -n 's/^ *\[소요\] \([0-9]*\)초$/\1/p' $f | tail -1); w=$((w+${sec:-0}))
    rc=$(grep -oP '^\s+\S+ RC=\K[0-9]+' $f | tail -1)
    [ "$rc" = 0 ] && g+=("$h") || r+=("$h(rc=$rc)"); done
  [ $n = 0 ] && { rm $OUT/$p.log; continue; }
  { echo; echo "=== 러너 요약 ==="; echo "  통과 ${#g[@]}: ${g[*]:-없음}"; echo "  실패 ${#r[@]}: ${r[*]:-없음}"; echo "rc=$([ ${#r[@]} = 0 ] && echo 0 || echo 1) 벽 ${w}초"; } >> $OUT/$p.log
done
cat $D/J4c1.log $D/J4c2.log | grep -v '^rc=' > $OUT/J4-부분.log
