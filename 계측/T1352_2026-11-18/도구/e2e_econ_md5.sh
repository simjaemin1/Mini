#!/bin/bash
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1352/e2e
for r in E0_01 E0_02 E0_03 E0_04 E0_05 E0_06 E0_07 E0_08 E0_09 E0_10 EH_01 EH_02 EH_03 EH_04 EH_05 EH_06 EH_07 EH_08 EH_09 EH_10; do
  [ -d $D/$r ] || continue
  line="$r"
  for f in nippon hanbando nippon-2 hanbando-2 nippon-3; do
    [ -f $D/$r/$f.log ] || { line="$line | $f -"; continue; }
    n=$(grep -c '마을 econ day' $D/$r/$f.log); h=$(grep '마을 econ day' $D/$r/$f.log | sed -E 's/ · 일 [0-9]+ms.*//' | md5sum | cut -c1-8)
    line="$line | $f $n $h"
  done
  echo "$line"
done
