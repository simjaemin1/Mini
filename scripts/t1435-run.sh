#!/usr/bin/env bash
# === scripts/t1435-run.sh — e2e 한 종마다 스무 판(혼자) + 둘씩 나란히 한 바퀴 [T1435 · S11 · 2026-11-22] =====================
# (@regress 없음 — 러너 밖 · 판 도구 · 코드 · 하네스 손 0)
#
# ★바탕: T1366 `계측/T1366_2026-11-18/e2e20.sh` 의 꼴 그대로(판 r 바깥 · 종 안 — 시간대 치우침을 줄인다 · 300초를 넘은 판이 한 번이라도 있는 종은
#   다섯 판에서 멈춘다 · `TIDE_FREEZE_MS=372603` · 판마다 /tmp 에 새로 생긴 DB 만 지운다). 더한 것 셋:
#   ① 판마다 제 `TMPDIR`(`$W/tmp/<종>.<판>` — 판 뒤 지운다) ② 실패면 첫 `✗` 줄을 `$W/fail.tsv` 에 ③ `--pair` — `run-regress.sh -j 2` 로 전 종 한 바퀴.
# ★결과: `$W/pool.txt` "이름 판 결과(G/R/Y) rc 초" · 로그 `$W/logs/<이름>.<판>.log` · 나란히 `$W/pair.log`.
# ★이어 돌기: pool.txt 에 있는 (이름 · 판)은 건너뛴다(재시작 뒤 그대로 다시 부른다 · 돌던 판은 처음부터).
#
#   W=/home/user/t1435w nohup bash scripts/t1435-run.sh > /home/user/t1435w/run.out 2>&1 &          # 혼자 스무 판
#   W=/home/user/t1435w nohup bash scripts/t1435-run.sh --pair > /home/user/t1435w/pair.out 2>&1 &   # 둘씩 나란히 한 바퀴
set -u
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
W="${W:?W 를 줘라(레포 밖 폴더)}"; ROUNDS="${ROUNDS:-20}"; CAPN="${CAPN:-5}"; CAPS="${CAPS:-300}"
mkdir -p "$W/logs" "$W/cap" "$W/tmp"; touch "$W/pool.txt" "$W/fail.tsv"
LIST="$(cd scripts && ls e2e-*.js)"
if [ "${1:-}" = "--pair" ]; then
  echo "pair start $(date -u +%FT%TZ) $(git rev-parse --short HEAD) $(echo $LIST | wc -w)종" >> "$W/pool.txt.meta"
  st="$W/.pstamp"; touch "$st"
  # shellcheck disable=SC2086
  TIDE_FREEZE_MS=372603 TMPDIR="$W/tmp" bash scripts/run-regress.sh -j 2 $LIST > "$W/pair.log" 2>&1
  find /tmp -maxdepth 2 -type f -newer "$st" \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.db-journal' -o -name '*.sqlite' \) ! -path '/tmp/claude*' -delete 2>/dev/null
  echo "pair done $(date -u +%FT%TZ)" >> "$W/pool.txt.meta"; exit 0
fi
echo "start $(date -u +%FT%TZ) $(git rev-parse --short HEAD) $(echo $LIST | wc -w)종" >> "$W/pool.txt.meta"
for r in $(seq 1 "$ROUNDS"); do
  for f in $LIST; do
    n="${f%.js}"
    grep -q "^$n $r " "$W/pool.txt" && continue
    [ "$r" -gt "$CAPN" ] && [ -e "$W/cap/$n" ] && continue
    st="$W/.stamp"; touch "$st"; t0=$(date +%s); td="$W/tmp/$n.$r"; mkdir -p "$td"
    TIDE_FREEZE_MS=372603 TMPDIR="$td" bash scripts/run-regress.sh "$f" > "$W/logs/$n.$r.log" 2>&1; rc=$?
    dt=$(( $(date +%s) - t0 ))
    if grep -qE '^  ✓ RC=0$' "$W/logs/$n.$r.log"; then res=G
    elif grep -qE '^  ⚠ RC=75' "$W/logs/$n.$r.log"; then res=Y
    else res=R; fi
    echo "$n $r $res $rc $dt" >> "$W/pool.txt"
    if [ "$res" = R ]; then printf '%s\t%s\t%s\n' "$n" "$r" "$(grep -m1 -E '^\s*(✗|❌)' "$W/logs/$n.$r.log" | grep -v 'RC=' | cut -c1-200 | tr '\t' ' ')" >> "$W/fail.tsv"; fi
    [ "$dt" -gt "$CAPS" ] && touch "$W/cap/$n"
    rm -rf "$td"
    find /tmp -maxdepth 2 -type f -newer "$st" \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.db-journal' -o -name '*.sqlite' \) ! -path '/tmp/claude*' -delete 2>/dev/null
  done
done
echo "done $(date -u +%FT%TZ)" >> "$W/pool.txt.meta"
