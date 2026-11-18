#!/usr/bin/env bash
# === scripts/t1369-run.sh — 옛 코드 빨강 뒤처리: T1361 초록 스무 종을 **고침 커밋 F 앞**(F^) 제품으로 다시 [T1369 · S11 · 2026-11-18] ======
# (@regress 없음 — 러너 밖 · 판 도구)
#
# ★무엇: T1361(`계측/T1361_2026-11-17/rows.tsv`)이 초록으로 낸 줄 중 제품 무관 1 을 뺀 스무 종(자명 통과 의심 5 · 제품 차 0 15).
#   하네스마다 카드 번호 → 그 카드의 **첫 제품 커밋** F(`git log --reverse --no-merges --grep` · 제품 경로 `server sim public lab` 를 바꾼 커밋 중 가장 이른 것).
#   F 가 있으면 `bash scripts/pm-old-code-red.sh F^ <하네스>`(하네스 · lib 는 지금 것 · 제품만 F^) — 판정 글자는 그 자의 것 그대로.
#   F 가 없으면 "못 찾음"(짐작 0 — 그 카드는 제품 커밋이 없다).
# ★카드 번호: 하네스를 **들인 커밋**의 카드(T1361 rows 의 카드 칸 = 그 커밋 제목의 첫 T 번호). 머리 글자의 첫 T 번호는 남의 카드를 가리킬 때가 있어
#   (예: `test-t1249-ore-fix` 이름 줄의 첫 T = T1188) 참고 칸으로만 적는다.
# ★이어 돌기: `$OUT/rerun.tsv` 에 한 줄씩 붙는다 — 이미 있는 하네스는 건너뛴다.
# ★/tmp 정리: 판마다 시작 표지 파일을 두고, 판 뒤에 /tmp 바로 밑의 그 뒤 생긴 `*.db` · `*.db-wal` · `*.db-shm` · `*.sqlite*` 만 지운다(T1361 회부 5).
#
#   OUT=계측/T1369_2026-11-18 TIMEOUT_SEC=1500 nohup bash scripts/t1369-run.sh > log 2>&1 &
set -u
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
OUT="${OUT:-계측/T1369_2026-11-18}"; mkdir -p "$OUT"
SRC="${SRC:-계측/T1361_2026-11-17/rows.tsv}"
ROWS="$OUT/rerun.tsv"; touch "$ROWS"
PROD="server sim public lab"
export TIMEOUT_SEC="${TIMEOUT_SEC:-1500}"
SCR="${SCR:-/tmp/t1369}"; mkdir -p "$SCR"

awk -F'\t' '$1=="초록" && !($5=="제품안부름" && $6=="제품차있음") {print $2"\t"$4"\t"$5"\t"$6"\t"$8}' "$SRC" |
while IFS=$'\t' read -r t card cp pd np0; do
  grep -q -P "^${t//./\\.}\t" "$ROWS" && continue
  kind="제품차0"; [ "$pd" = "제품차있음" ] && kind="의심"
  head1="$(head -8 "scripts/$t" | grep -oE 'T[0-9]{3,4}' | head -1)"; [ -z "$head1" ] && head1="—"
  F="$(git log --reverse --no-merges -E --grep="${card}([^0-9]|\$)" --format=%H -- $PROD | head -1)"
  if [ -z "$F" ]; then
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$t" "$kind" "$card" "$head1" "—" "못찾음" "-" "-" "-" "0" "카드 $card 의 제품 커밋 0(--grep · 제품 경로)" >> "$ROWS"
    echo "$(date -u +%H:%M) $t 못찾음"; continue
  fi
  Fs="$(git rev-parse --short=9 "$F")"
  mark="$SCR/mark"; : > "$mark"
  s0=$(date +%s)
  bash scripts/pm-old-code-red.sh "$F^" "$t" > "$SCR/one.txt" 2>&1
  sec=$(( $(date +%s) - s0 ))
  find /tmp -maxdepth 1 -newer "$mark" -type f \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.sqlite*' \) -delete 2>/dev/null
  line="$(grep -E "\| ${t//./\\.} \|" "$SCR/one.txt" | head -1)"
  v="$(printf '%s' "$line" | cut -d'|' -f1 | sed 's/ *$//')"
  rc="$(printf '%s' "$line" | grep -oE 'RC=[0-9]+' | cut -d= -f2)"
  np="$(printf '%s' "$line" | grep -oE '✓ [0-9]+' | grep -oE '[0-9]+')"
  nf="$(printf '%s' "$line" | grep -oE '✗ [0-9]+' | grep -oE '[0-9]+' | head -1)"
  why="$(printf '%s' "$line" | cut -d'|' -f4- | sed 's/^ *//' | tr '\t' ' ' | cut -c1-160)"
  [ -z "$v" ] && { v="자 실패"; why="$(tail -3 "$SCR/one.txt" | tr '\n\t' '  ' | cut -c1-160)"; }
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$t" "$kind" "$card" "$head1" "$Fs" "$v" "${rc:--}" "${np:-0}" "${nf:-0}" "$sec" "$why" >> "$ROWS"
  echo "$(date -u +%H:%M) $t F=$Fs $v ${sec}s"
done
echo "끝 $(date -u +%FT%TZ)"
