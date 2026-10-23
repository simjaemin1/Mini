#!/bin/bash
# === scripts/t853/round.sh — 한 판: 레인 둘 + 셋째 netns 의 청소 손(28초 뒤 한 번) (T853 재현·재기) ===
# 쓰는 법: bash scripts/t853/round.sh <legacy|fixed|none> <하네스 A> <하네스 B>
#   legacy = 종전 `pkill -f` (netns 를 가로질러 두 레인의 central 이 SIGTERM — 결함 재현)
#   fixed  = `bash scripts/_drain.sh 1` (내 netns 것만 — 두 레인 SIGTERM 0)   none = 청소 손 없음
H=$(cd "$(dirname "$0")" && pwd); R=$(cd "$H/../.." && pwd); export T853_OUT=${T853_OUT:-$HOME/t853-out}
mode=$1; rm -rf "$T853_OUT"; mkdir -p "$T853_OUT"
bash $H/lane.sh A $2 & bash $H/lane.sh B $3 &
( sleep 28; case $mode in
    legacy) unshare -n bash -c "pkill -f 'server/centra[l].js'; pkill -f 'server/zon[e].js'" ;;
    fixed)  unshare -n bash -c "cd $R && bash scripts/_drain.sh 1" ;;
  esac ) &
wait
for l in A B; do echo "[$l] $(grep -E 'PASS|통과' $T853_OUT/$l/harness.log | tail -1 | cut -c1-80) · central 이 받은 신호 $(grep -h 'si_pid' $T853_OUT/$l/central.strace.* 2>/dev/null | wc -l)"; done
grep -h "si_signo" $T853_OUT/*/central.strace.* 2>/dev/null | head -4 | cut -c1-140
