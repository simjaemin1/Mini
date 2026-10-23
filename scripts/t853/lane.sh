#!/bin/bash
# === scripts/t853/lane.sh — 레인 하나: 제 netns · 제 /tmp(tmpfs)에서 하네스 하나를 돈다 (T853 계측 · 제품 0 · 하네스 0) ===
# 쓰는 법: bash scripts/t853/lane.sh <이름> <하네스 파일 (레포 기준)>      # 결과 $T853_OUT/<이름>/ (기본 ~/t853-out — /tmp 는 레인마다 비워진다)
#   · central 을 띄우는 `node` 만 `strace` 로 감싼다(`node-shim`) → central 이 받은 SIGTERM/SIGINT/SIGHUP 의 **보낸 pid**(si_pid)가 `central.strace.*` 에 남는다.
#   · `ps.log` — 0.4초마다 프로세스 표(크롬 뺌). 보낸 pid 가 아직 살아 있으면 명령줄을 찾을 수 있다.
# 루프백을 올리는 `ip` 가 없는 상자도 있어 파이썬 ioctl(`uplo.py`)로 올린다. ⚠셋 이상을 한 상자(2코어·7GB)에 띄우면 상자가 통째로 재시작됐다 — 둘까지.
H=$(cd "$(dirname "$0")" && pwd); R=$(cd "$H/../.." && pwd)
name=$1; file=$2; out=${T853_OUT:-$HOME/t853-out}/$name; mkdir -p "$out"
exec unshare -n -m --propagation private bash -c "
  mount -t tmpfs tmpfs /tmp && python3 $H/uplo.py
  mkdir -p /tmp/shim && cp $H/node-shim /tmp/shim/node && export PATH=/tmp/shim:\$PATH LANE_DIR=$out
  ( while :; do date +%s.%N; ps -eo pid,ppid,pgid,etimes,args | grep -v -E 'chrome|grep|ps -eo' ; sleep 0.4; done >> $out/ps.log 2>&1 ) &
  SNAP=\$!
  cd $R && node $file > $out/harness.log 2>&1
  echo EXIT=\$? >> $out/harness.log
  kill \$SNAP 2>/dev/null
"
