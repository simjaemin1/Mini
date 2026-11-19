#!/bin/bash
# T1364 흔들림 전수 — 러너 전수 -j 4 세 판(A · B · C) → 한 번이라도 빨강인 하네스를 혼자(-j 1) 다섯 판(S1 ~ S5)
#   판마다 로그 따로(<판>.log) · 끝난 판은 <판>.done(다시 띄우면 건너뛴다 — 컨테이너가 다시 서도 이어 간다)
#   판 사이: 그 판이 /tmp 에 새로 만든 것만 지운다(판 앞 목록과 견줌 · 세션 · 환경 자리는 무접촉)
R=/home/user/Mini; D=/tmp/claude-0/-home-user-Mini/2b37f3bf-4e2c-5696-b52a-e22e02e2f0d7/scratchpad/t1364
cd $R
keep() { case "$1" in claude*|environment-manager*|code-sign|night|.X*|.ICE*|.font*|node-compile-cache|v8-compile-cache*|hsperfdata*|systemd-*|tmux-*) return 0;; esac; return 1; }
clean() { local before=$1 n=0 kb=0; for f in $(ls -A /tmp); do grep -qxF "$f" "$before" && continue; keep "$f" && continue; kb=$((kb + $(du -sk "/tmp/$f" 2>/dev/null | cut -f1))); rm -rf "/tmp/$f" 2>/dev/null && n=$((n+1)); done; echo "$(date -u +%FT%T) 정리 $n개 · $((kb/1024))MB" >> $D/drive.log; }
run() { local name=$1; shift; [ -f $D/$name.done ] && return 0; ls -A /tmp > $D/$name.tmp-before; local T0=$(date +%s)
  echo "$(date -u +%FT%T) $name 시작 · $(git log --oneline -1 | cut -c1-9) · 남은 디스크 $(df -h / | awk 'NR==2{print $4}')" >> $D/drive.log
  bash scripts/run-regress.sh "$@" > $D/$name.log 2>&1; local rc=$?
  echo "rc=$rc 벽 $(( $(date +%s) - T0 ))초" >> $D/$name.log
  echo "$(date -u +%FT%T) $name 끝 · rc=$rc · 벽 $(( $(date +%s) - T0 ))초" >> $D/drive.log
  clean $D/$name.tmp-before; touch $D/$name.done; }
for P in A B C; do run $P -j 4; done
if [ ! -f $D/reds.txt ]; then cat $D/A.log $D/B.log $D/C.log | sed -n 's/^  실패 [0-9]*: //p' | tr ' ' '\n' | sed 's/(rc=[0-9]*)$//' | grep -E '\.js$' | sort -u > $D/reds.txt; fi
echo "$(date -u +%FT%T) 빨강 $(wc -l < $D/reds.txt)종 → 혼자 다섯 판" >> $D/drive.log
[ -s $D/reds.txt ] && for S in S1 S2 S3 S4 S5; do run $S -j 1 $(cat $D/reds.txt); done
echo "$(date -u +%FT%T) 다 끝남" >> $D/drive.log; touch $D/all.done
