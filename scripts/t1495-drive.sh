#!/usr/bin/env bash
# === scripts/t1495-drive.sh — T1495 판 줄을 둘씩 이어 돈다(끝 표시 있는 판은 건너뜀 · 줄 파일을 다시 읽으니 줄 끝에 판을 덧붙여도 된다) [S14] ===
# (@regress 없음 — 러너 밖 · 판 도구 · `t1489-drive.sh` 를 본떠 새로 씀)
#   쓰는 법: setsid nohup bash -c 'bash scripts/t1495-drive.sh; echo EXIT $? > /var/tmp/t1495w/DRIVE.done' > /var/tmp/t1495w/drive.log 2>&1 < /dev/null &
#   줄 파일 $RAW/plan.txt — 한 줄 = `<tag> <kind> <arm> [k=v …]` (# 주석) · 먼저 끝난 자리에 다음 줄을 채운다(동시에 둘 · 4코어)
#   `$RAW/HOLD` 가 있으면 줄이 비어도 안 끝나고 기다린다(줄을 덧붙이는 동안).  `$RAW/SOLO` 가 있으면 한 번에 하나.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT" || exit 2
RAW="${RAW:-/var/tmp/t1495w}"; export RAW
next_line() { while IFS= read -r l; do case "$l" in ''|'#'*) continue;; esac; set -- $l; [ -e "$RAW/done/$1.done" ] && continue; [ -e "$RAW/running/$1" ] && continue; echo "$l"; return 0; done < "$RAW/plan.txt"; return 1; }
mkdir -p "$RAW/running"; rm -f "$RAW/running/"* 2>/dev/null
while :; do
  MAXJ="${MAXJ:-2}"; [ -e "$RAW/SOLO" ] && MAXJ=1
  while [ "$(ls "$RAW/running" | wc -l)" -lt "$MAXJ" ]; do
    L="$(next_line)" || break
    set -- $L; tag="$1"; touch "$RAW/running/$tag"
    ( bash scripts/t1495-run.sh $L; rm -f "$RAW/running/$tag" ) &
    sleep 1
  done
  [ "$(ls "$RAW/running" | wc -l)" -eq 0 ] && [ ! -e "$RAW/HOLD" ] && { next_line >/dev/null || break; }
  sleep 15
done
echo DRIVE_DONE
