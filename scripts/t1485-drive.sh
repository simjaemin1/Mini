#!/usr/bin/env bash
# === scripts/t1485-drive.sh — T1485 전체 판 줄을 둘씩 이어 돈다(끝 표시 있는 판은 건너뜀) [S14] ===
#   쓰는 법: setsid nohup bash -c 'bash scripts/t1485-drive.sh; echo EXIT $? > /var/tmp/t1485w/ALL.done' > /var/tmp/t1485w/drive.log 2>&1 &
#   판 줄: mem on/off 각 20 · walk on 20(+off 20 은 덤) · memplain on 20(귀 대조)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT" || exit 2
RAW="${RAW:-/var/tmp/t1485w}"; export RAW
PLAN="${PLAN:-}"
if [ -z "$PLAN" ]; then
  PLAN=""
  for k in $(seq 1 20); do PLAN="$PLAN mem:on:$k mem:off:$k"; done
  for k in $(seq 1 20); do PLAN="$PLAN walk:on:$k"; done
  for k in $(seq 1 20); do PLAN="$PLAN memplain:on:$k"; done
  for k in $(seq 1 20); do PLAN="$PLAN walk:off:$k"; done
fi
set -- $PLAN
while [ $# -gt 0 ]; do
  a="$1"; shift; IFS=: read -r kd ar kk <<<"$a"
  bash scripts/t1485-run.sh "$kd" "$ar" "$kk" & 
  if [ $# -gt 0 ]; then b="$1"; shift; IFS=: read -r kd2 ar2 kk2 <<<"$b"; bash scripts/t1485-run.sh "$kd2" "$ar2" "$kk2" & fi
  wait
done
echo DRIVE_DONE
