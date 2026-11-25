#!/usr/bin/env bash
# === scripts/t1480-drive.sh — first-parent 이분 몰이 [T1480 · S14 · 2026-11-24] =====================
# (@regress 없음 — 러너 밖 · 판 도구 · 제품 코드 · 있던 스크립트 손 0)
# ★무엇: 커밋 목록(`$LIST` — first-parent · 옛 → 새 · 한 줄 한 커밋)에서 처음 · 끝을 먼저 재고(처음 = 마지막 초록 후보 · 끝 = 첫 빨강 쪽),
#   가운데를 이분한다. 한 커밋의 판정 = `t1480-run.sh` 로 N 판 → 빨강(R) 수 ≥ REDMIN 이면 빨강. 못 뜬 커밋(X 가 판 전부) = 건너뜀 · 옆 커밋으로 비켜 잰다.
#   membership: N=5 REDMIN=4("셋 넘게 빨강") · 흔들림 셋: N=10 REDMIN=1("0 이던 마지막 → 처음 흔들린").
#   이미 `$OUT/runs.tsv` 에 N 판 이상 있는 커밋은 다시 안 돈다(이어 돌기). 끝 표시: `$OUT/drive.<하네스>.done`.
#   쓰는 법: OUT=<디렉터리> LIST=<커밋 목록> [JOBS=1] [POS=1] bash scripts/t1480-drive.sh <하네스> <N> <REDMIN> [처음 번호=1] [끝 번호=줄 수]
set -u
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
OUT="${OUT:?OUT}"; LIST="${LIST:?LIST}"; H="$1"; N="$2"; REDMIN="$3"
mapfile -t C < "$LIST"; LO="${4:-1}"; HI="${5:-${#C[@]}}"
LOG="$OUT/drive.$H.log"; mkdir -p "$OUT"; touch "$OUT/runs.tsv"
say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
# judge <번호> → 전역 V = R|G|X · REDS · TOT
judge() {
  local i="$1" c="${C[$(( $1 - 1 ))]}" cs; cs="$(git rev-parse --short=9 "$c")"
  local have; have="$(awk -F'\t' -v c="$cs" -v h="$H" '$1==c && $2==h' "$OUT/runs.tsv" | wc -l)"
  [ "$have" -lt "$N" ] && OUT="$OUT" bash scripts/t1480-run.sh "$c" "$H" "$(( N - have ))" "$(( have + 1 ))"
  REDS="$(awk -F'\t' -v c="$cs" -v h="$H" '$1==c && $2==h && $4=="R"' "$OUT/runs.tsv" | wc -l)"
  local X; X="$(awk -F'\t' -v c="$cs" -v h="$H" '$1==c && $2==h && $4=="X"' "$OUT/runs.tsv" | wc -l)"
  TOT="$(awk -F'\t' -v c="$cs" -v h="$H" '$1==c && $2==h' "$OUT/runs.tsv" | wc -l)"
  if [ "$X" -ge "$N" ]; then V=X; elif [ "$REDS" -ge "$REDMIN" ]; then V=R; else V=G; fi
  say "#$i $cs $H 빨강 $REDS/$TOT(못뜸 $X) → $V"
}
# 건너뛴 곳은 옆으로 비켜 잰다(번호를 되돌려 줌)
probe() { local i="$1" d=1 j; judge "$i"; while [ "$V" = X ] && [ $d -le 6 ]; do
    echo "$i" >> "$OUT/skipped.$H.txt"; j=$(( i + d )); [ $j -gt "$HI" ] && j=$(( i - d )); i=$j; d=$(( d + 1 )); judge "$i"; done; PI=$i; }
probe "$LO"; lo=$PI; vlo=$V
probe "$HI"; hi=$PI; vhi=$V
say "처음 #$lo=$vlo · 끝 #$hi=$vhi"
if [ "$vlo" = R ]; then say "처음 커밋이 이미 빨강 — 구간 앞에서 이미 시작"; echo "FIRSTRED_AT_START $lo" > "$OUT/drive.$H.result"; echo "EXIT 0" > "$OUT/drive.$H.done"; exit 0; fi
if [ "$vhi" != R ]; then say "끝 커밋이 빨강이 아님 — 이분 못 함"; echo "HEAD_NOT_RED $hi" > "$OUT/drive.$H.result"; echo "EXIT 0" > "$OUT/drive.$H.done"; exit 0; fi
while [ $(( hi - lo )) -gt 1 ]; do
  mid=$(( (lo + hi) / 2 )); probe "$mid"; m=$PI; vm=$V
  if [ "$m" -le "$lo" ] || [ "$m" -ge "$hi" ]; then say "비킨 자리가 경계 — 멈춤(건너뜀 때문에 더 못 좁힘)"; break; fi
  if [ "$vm" = R ]; then hi=$m; else lo=$m; fi
done
say "마지막 초록 #$lo ${C[$((lo-1))]} · 첫 빨강 #$hi ${C[$((hi-1))]}"
echo "LAST_GREEN $lo ${C[$((lo-1))]} FIRST_RED $hi ${C[$((hi-1))]}" > "$OUT/drive.$H.result"
echo "EXIT 0" > "$OUT/drive.$H.done"
