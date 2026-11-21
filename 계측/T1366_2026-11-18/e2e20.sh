#!/usr/bin/env bash
# T1366 — e2e 한 종당 스무 판(혼자 · 나란히 0). 러너는 레포의 것(scripts/run-regress.sh) 하나를 종마다 부른다.
#   차례: 판 r = 1..20 을 바깥에, 종을 안에(시간대 치우침을 줄인다). 300초를 넘은 판이 한 번이라도 있는 종은 다섯 판에서 멈춘다.
#   결과: $OUT/pool.txt 에 "이름 판 결과(G/R/Y) rc 초" 한 줄씩. 로그는 $OUT/logs/<이름>.<판>.log.
#   이어 돌기: pool.txt 에 있는 (이름 · 판)은 건너뛴다.
#   /tmp 정리: 판마다 그 판이 /tmp 에 새로 남긴 DB 파일(.db · -wal · -shm · -journal · .sqlite)만 지운다 · $OUT/clean.txt 에 적는다.
set -u
ROOT="${ROOT:?}"; OUT="${OUT:?}"; ROUNDS="${ROUNDS:-20}"; CAPN="${CAPN:-5}"; CAPS="${CAPS:-300}"
mkdir -p "$OUT/logs" "$OUT/cap"; touch "$OUT/pool.txt"
cd "$ROOT" || exit 1
LIST="$(cd scripts && ls e2e-*.js)"
echo "start $(date -u +%FT%TZ) $(git rev-parse --short HEAD) $(echo $LIST | wc -w)종" >> "$OUT/pool.txt.meta"
for r in $(seq 1 "$ROUNDS"); do
  for f in $LIST; do
    n="${f%.js}"
    grep -q "^$n $r " "$OUT/pool.txt" && continue
    [ "$r" -gt "$CAPN" ] && [ -e "$OUT/cap/$n" ] && continue
    st="$OUT/.stamp"; touch "$st"; t0=$(date +%s)
    TIDE_FREEZE_MS=372603 bash scripts/run-regress.sh "$f" > "$OUT/logs/$n.$r.log" 2>&1; rc=$?
    dt=$(( $(date +%s) - t0 ))
    if grep -qE '^  ✓ RC=0$' "$OUT/logs/$n.$r.log"; then res=G
    elif grep -qE '^  ⚠ RC=75' "$OUT/logs/$n.$r.log"; then res=Y
    else res=R; fi
    echo "$n $r $res $rc $dt" >> "$OUT/pool.txt"
    [ "$dt" -gt "$CAPS" ] && touch "$OUT/cap/$n"
    # 이 판이 /tmp 에 새로 남긴 DB 파일만(카드 — T1361 회부 5) · 디렉터리 · 다른 파일은 안 건드린다
    dbs="$(find /tmp -maxdepth 2 -type f -newer "$st" \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.db-journal' -o -name '*.sqlite' \) ! -path '/tmp/claude*' 2>/dev/null)"
    if [ -n "$dbs" ]; then
      kb=$(echo "$dbs" | xargs -d '\n' du -sk 2>/dev/null | awk '{s+=$1} END{print s+0}'); cnt=$(echo "$dbs" | wc -l)
      echo "$dbs" | xargs -d '\n' rm -f; echo "$n $r $cnt ${kb}KB" >> "$OUT/clean.txt"
    fi
  done
done
echo "done $(date -u +%FT%TZ)" >> "$OUT/pool.txt.meta"
