#!/usr/bin/env bash
# T1436 판 줄 — 한 줄에 판을 차례로(줄은 둘까지 나란히 · 상자 4코어). 판마다 t1436-run.js(= t1308-long-run CLI · env) · 끝나면 DB · 체크포인트만 지운다.
#   쓰는 법: bash 계측/T1436_2026-11-22/run-lane.sh <줄 이름> "<판 이름>:<t1436-run 인자>" …
#   판 폴더 /tmp/t1436/<판 이름> · 로그 /tmp/t1436/logs/<판 이름>.log · 끝 표지 /tmp/t1436/logs/<판 이름>.done
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT" || exit 2
W=/tmp/t1436; mkdir -p "$W/logs"
lane=$1; shift
for spec in "$@"; do
  name=${spec%%:*}; args=${spec#*:}
  [ -f "$W/logs/$name.done" ] && { echo "$(date -u +%T) $name 이미 끝 — 건넘"; continue; }
  rm -rf "$W/$name"
  echo "$(date -u +%T) $name 시작 — $args"
  # shellcheck disable=SC2086
  timeout 14400 node scripts/t1436-run.js --dir "$W/$name" --tag "$name" $args > "$W/logs/$name.log" 2>&1
  rc=$?
  rm -rf "$W/$name"/w.db "$W/$name"/w.db-wal "$W/$name"/w.db-shm "$W/$name"/ck "$W/$name"/ck.old "$W/$name"/ck.tmp
  echo "EXIT $rc" > "$W/logs/$name.done"
  echo "$(date -u +%T) $name 끝 — 코드 $rc · 디스크 $(df -h / | awk 'NR==2{print $4}') 남음"
done
echo "$(date -u +%T) 줄 $lane 끝"
