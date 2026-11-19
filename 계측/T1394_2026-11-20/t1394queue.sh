#!/bin/bash
# T1394 판 줄 — 일꾼 하나. 줄 파일 `<폴더>/queue.txt` 의 줄(이름 시드 날 [KEY=VAL …])을 위에서부터 하나씩 집어 돌린다(잠금 = mkdir).
#   일꾼 둘을 띄우면 판 둘이 같이 돈다(카드 — 한 번에 둘까지). `<폴더>/stop` 이 있으면 지금 판 뒤에 멈춘다 · 줄이 비면 2분마다 다시 본다(1시간 비면 끝).
#   쓰는 법: bash t1394queue.sh <폴더> <일꾼 이름>
set -u
Q="$1"; W="$2"; HERE="$(cd "$(dirname "$0")" && pwd)"
touch "$Q/queue.txt" "$Q/claimed.txt"
idle=0
while [ ! -e "$Q/stop" ]; do
  line=""
  while ! mkdir "$Q/.lock" 2>/dev/null; do sleep 1; done
  while IFS= read -r l; do
    [ -z "$l" ] && continue; case "$l" in \#*) continue;; esac
    if ! grep -qxF "$l" "$Q/claimed.txt"; then line="$l"; echo "$l" >> "$Q/claimed.txt"; break; fi
  done < "$Q/queue.txt"
  rmdir "$Q/.lock"
  if [ -z "$line" ]; then idle=$((idle+1)); [ $idle -gt 30 ] && break; sleep 120; continue; fi
  idle=0
  set -- $line
  TAG="$1"; SEED="$2"; DAYS="$3"; shift 3
  echo "[$W] $(date +%H:%M) 시작 $TAG $SEED $DAYS $*" >> "$Q/workers.log"
  env "$@" bash "$HERE/t1394run.sh" "$TAG" "$SEED" "$DAYS" "$Q"
  echo "[$W] $(date +%H:%M) 끝 $TAG $SEED" >> "$Q/workers.log"
done
echo "[$W] $(date +%H:%M) 일꾼 끝" >> "$Q/workers.log"
