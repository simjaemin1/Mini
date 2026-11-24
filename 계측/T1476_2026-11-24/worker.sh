#!/usr/bin/env bash
# T1476 일꾼 — 일감 줄(queue 디렉터리의 `NNN.job` 파일)을 차례로 집는다. 집는 것은 `mkdir <일감>.claim`(원자) · 이미 `.done` 이 있는 판은 건너뛴다.
#   일감 한 줄: `bot <on|off> <id> <vid> <season>` 또는 `m7 <on|off> <판 수> <시작 번호>` — 일꾼 둘이 같이 돈다(같이 도는 판은 늘 둘 이하).
#   쓰는 법: worker.sh <raw 디렉터리> <queue 디렉터리>
set -u
D=$(cd "$(dirname "$0")" && pwd)
RAW=$1; Q=$2
for job in $(ls "$Q" | grep '\.job$' | sort); do
  mkdir "$Q/$job.claim" 2>/dev/null || continue
  read -r kind a b c d < "$Q/$job"
  if [ "$kind" = bot ]; then
    [ -e "$RAW/$b-$a-t1.done" ] && continue
    "$D/lane.sh" "$RAW" "$a" "$b:$c:$d"
  else
    "$D/lane7.sh" "$RAW" "$a" "$b" "$c"
  fi
done
echo WORKER_DONE
