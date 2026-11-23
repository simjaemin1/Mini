#!/bin/bash
# T1418 흔들림 전수 둘째 — 러너 전수 -j 4 세 판(J1 · J2 · J3) → 한 번이라도 빨강인 하네스를 혼자(-j 1) 다섯 판(S1 ~ S5)
#   판마다 새 TMPDIR(/tmp/t1418-<판> — 짧게: 긴 경로는 Chromium 소켓 경로를 넘긴다 · J1 · J2 무효) · 로그 한 파일(<판>.log) · 끝난 판 <판>.done
#   판이 죽으면(컨테이너가 다시 섬 등) 그 판은 덮지 않는다: dead.txt 에 판 · 죽은 때 · 까닭을 적고 다음 번호로 새 판을 띄운다.
#   판 뒤 찌꺼기: ⓐ 그 판의 TMPDIR 에 남은 파일 수 · 바이트 ⓑ /tmp 에 새로 선 것(판 앞 목록과 견줌 · 박힌 '/tmp/' 경로 몫) 수 · 바이트
#     → leftover.tsv 에 적은 뒤 둘 다 지운다(세션 · 환경 자리 무접촉).
#   판은 한 번에 하나(카드 상한 둘).
R=/home/user/Mini; D=/tmp/claude-0/-home-user-Mini/2b37f3bf-4e2c-5696-b52a-e22e02e2f0d7/scratchpad/t1418
cd $R
keep() { case "$1" in t1418-*|claude*|environment-manager*|code-sign|night|.X*|.ICE*|.font*|node-compile-cache|v8-compile-cache*|hsperfdata*|systemd-*|tmux-*) return 0;; esac; return 1; }
now() { date -u +%FT%T; }
# /tmp 에 판 앞 목록에 없던 것: 수 · 바이트 (지우기는 $2 = rm)
tmpnew() { local before=$1 n=0 b=0 f; for f in $(ls -A /tmp); do grep -qxF "$f" "$before" && continue; keep "$f" && continue
  n=$((n+1)); b=$((b + $(du -sb "/tmp/$f" 2>/dev/null | cut -f1))); [ "$2" = rm ] && rm -rf "/tmp/$f" 2>/dev/null; done; echo "$n $b"; }
settle() { local name=$1 kind=$2  # 판 뒤 셈 · 지움
  local td=/tmp/t1418-$name tn tb; tn=$(find $td -mindepth 1 2>/dev/null | wc -l); tb=$(du -sb $td 2>/dev/null | cut -f1); tb=$((tb - 4096 < 0 ? 0 : tb - 4096))
  read sn sb < <(tmpnew $D/$name.tmp-before rm); rm -rf $td
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$name" "$kind" "$tn" "$tb" "$sn" "$sb" >> $D/leftover.tsv
  echo "$(now) $name 찌꺼기 · TMPDIR ${tn}개 $((tb/1048576))MB · /tmp 새 ${sn}개 $((sb/1048576))MB → 지움" >> $D/drive.log; }
run() { local name=$1 kind=$2; shift 2
  ls -A /tmp > $D/$name.tmp-before; mkdir -p /tmp/t1418-$name; local T0=$(date +%s)
  echo "$(now) $name 시작($kind) · $(git log --oneline -1 | cut -c1-9) · 남은 디스크 $(df -h / | awk 'NR==2{print $4}')" >> $D/drive.log
  TMPDIR=/tmp/t1418-$name bash scripts/run-regress.sh "$@" > $D/$name.log 2>&1; local rc=$?
  echo "rc=$rc 벽 $(( $(date +%s) - T0 ))초" >> $D/$name.log
  echo "$(now) $name 끝 · rc=$rc · 벽 $(( $(date +%s) - T0 ))초" >> $D/drive.log
  settle $name $kind; touch $D/$name.done; }
# 앞서 죽은 판: 로그는 있는데 .done 이 없다 → 적고(덮지 않음) 그 판 찌꺼기를 치운다
for L in $D/*.log; do [ -e "$L" ] || continue; n=$(basename $L .log); case $n in J*|S*) ;; *) continue;; esac
  [ -f $D/$n.done ] || [ -f $D/$n.dead ] && continue
  last=$(date -u -r $L +%FT%T); hs=$(grep -c '^##### ' $L)
  printf '%s\t%s\t%s\t%s\n' "$n" "$last" "$hs" "판 몰이 프로세스가 사라짐(컨테이너가 다시 섬 등 · 로그 마지막 쓰기 $last)" >> $D/dead.txt
  echo "$(now) $n 죽음 · 마지막 쓰기 $last · 하네스 ${hs}개째 · 덮지 않고 다음 번호로" >> $D/drive.log
  settle $n dead; touch $D/$n.dead; done
need() { local pre=$1 want=$2; shift 2; local i=1 done=0
  while [ $done -lt $want ]; do local n=$pre$i
    if [ -f $D/$n.done ]; then done=$((done+1)); elif [ ! -f $D/$n.dead ]; then run $n "$@"; done=$((done+1)); fi; i=$((i+1)); done; }
need J 3 par -j 4
if [ ! -f $D/reds.txt ]; then for f in $D/J*.done; do cat ${f%.done}.log; done | sed -n 's/^  실패 [0-9]*: //p' | tr ' ' '\n' | sed 's/(rc=[0-9]*)$//' | grep -E '\.js$' | sort -u > $D/reds.txt
  echo "$(now) 빨강 $(wc -l < $D/reds.txt)종 → 혼자 다섯 판" >> $D/drive.log; fi
[ -s $D/reds.txt ] && need S 5 solo -j 1 $(cat $D/reds.txt)
echo "$(now) 다 끝남" >> $D/drive.log; touch $D/all.done
