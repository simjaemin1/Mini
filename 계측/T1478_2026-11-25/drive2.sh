#!/bin/bash
# T1478 조각 몰이(컨테이너 재시작이 잦아 판을 4조각으로 · 조각 사이 -j 4 이웃이 끊김) — 조각 하나 = run-regress.sh -j 4 <조각 목록>
D=/tmp/claude-0/-home-user-Mini/2b37f3bf-4e2c-5696-b52a-e22e02e2f0d7/scratchpad/t1478
source $D/fn.sh
[ -f $D/c1.txt ] || split -n l/4 -d --additional-suffix=.txt $D/list.txt $D/cc && for k in 0 1 2 3; do mv $D/cc0$k.txt $D/c$((k+1)).txt 2>/dev/null; done
# 죽은 조각: 로그는 있는데 .done 없음
for L in $D/J*c[1-4].log $D/S*c[1-9].log; do [ -e "$L" ] || continue; n=$(basename $L .log); [ -f $D/$n.done ] && continue
  hs=$(grep -c '^##### ' $L); printf '%s\t%s\t%s\t%s\n' "$n" "$(date -u -r $L +%FT%T)" "$hs" "컨테이너 재시작(조각 하나 · 그 조각만 다시 돌림)" >> $D/dead.txt
  echo "$(now) $n 죽음 · 조각 ${hs}개째" >> $D/drive.log; settle $n dead; mv $L $D/$n-죽음.log; done
runchunk() { local name=$1 list=$2; [ -f $D/$name.done ] && return; run $name par -j 4 $(cat $list); }
nrun=0; r=3
while [ $nrun -lt 3 ]; do
  [ -f $D/J$r.valid ] || { for k in 1 2 3 4; do runchunk J${r}c$k $D/c$k.txt; done
    node $D/mk-concat.js $D/J$r.log $D/J${r}c1.log $D/J${r}c2.log $D/J${r}c3.log $D/J${r}c4.log; touch $D/J$r.valid; echo "$(now) J$r 조각 넷 다 끝 → J$r.log" >> $D/drive.log; }
  nrun=$((nrun+1)); r=$((r+1)); done
if [ ! -f $D/reds.txt ]; then cat $D/J[3-5].log | sed -n 's/^  실패 [0-9]*: //p' | tr ' ' '\n' | sed 's/(rc=[0-9]*)$//' | grep -E '\.js$' | sort -u > $D/reds.txt; echo "$(now) 빨강 $(wc -l < $D/reds.txt)종" >> $D/drive.log; fi
if [ -s $D/reds.txt ]; then for i in 1 2 3 4 5; do [ -f $D/S$i.done ] || run S$i solo -j 1 $(cat $D/reds.txt); done
  for i in 1 2 3 4 5; do cp -n $D/S$i.log $D/S$i.log 2>/dev/null; done; fi
echo "$(now) 다 끝남" >> $D/drive.log; touch $D/all.done
