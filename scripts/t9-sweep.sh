#!/usr/bin/env bash
# === scripts/t9-sweep.sh — 러너 밖 하네스 전수 실행(T9) =========================
# 목적은 **판정이 아니라 표**다. 등록도 폐기도 하지 않는다(PM 몫).
#   러너와 같은 규약으로 돈다: 순차 · 하네스 사이 서버 정리 · 종료코드는 파이프 앞에서.
#   결과줄이 없으면 '실행 불가'로 센다(조용한 크래시 금지 — run-regress.sh 와 같은 함정).
# 사용: bash scripts/t9-sweep.sh [출력파일]
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-/tmp/t9-sweep.tsv}"
TIMEOUT_SEC="${TIMEOUT_SEC:-900}"
DRAIN_SEC="${DRAIN_SEC:-6}"
cd "$ROOT"

drain() {
  pkill -f "server/zon[e].js" 2>/dev/null || true
  pkill -f "server/centra[l].js" 2>/dev/null || true
  sleep "$DRAIN_SEC"
}

: > "$OUT"
LIST=()
for f in scripts/test-*.js scripts/e2e-*.js; do
  grep -q '^// @regress' "$f" || LIST+=("$(basename "$f")")
done
echo "러너 밖 하네스 ${#LIST[@]}개" >&2

for f in "${LIST[@]}"; do
  drain
  echo "##### $f" >&2
  t0=$(date +%s)
  out="$(timeout "$TIMEOUT_SEC" node "scripts/$f" 2>&1)"
  rc=$?
  t1=$(date +%s)
  # ★★판정 규칙 — 첫 판이 **내 자가 틀렸다**(족보 57).
  #   러너와 같은 `통과|PASS [0-9]` 문법을 그대로 썼더니 31개 중 19개가 '실행불가'로 나왔다.
  #   실제로는 잘 돌았고 요약 문구가 `결과: PASS` 였을 뿐이다 — 러너 밖 하네스는 러너의
  #   출력 규약을 따를 이유가 없다. **러너 밖을 러너의 자로 재면 안 된다.**
  #   ⇒ 검사 표시(✓/✔/✗/✘)의 존재를 1차 근거로 삼고, 요약 문구는 폭넓게 본다.
  marks="$(echo "$out" | grep -cE '^[[:space:]]*(✓|✔|✗|✘)')"
  summary="$(echo "$out" | grep -cE '통과|PASS|FAIL|실패|결과')"
  bad="$(echo "$out" | grep -cE '^[[:space:]]*(✗|✘)|FAIL [1-9]|실패 [1-9]|MODULE_NOT_FOUND|^\s+at .*\(.*:[0-9]+:[0-9]+\)')"
  if [ "$marks" -eq 0 ] && [ "$summary" -eq 0 ]; then verdict="실행불가"
  elif [ "$rc" -ne 0 ] || [ "$bad" -gt 0 ]; then verdict="실패"
  else verdict="통과"; fi
  # 마지막 커밋(날짜) — 이 파일이 언제 마지막으로 손 탔나
  last="$(git log -1 --format='%ad %h' --date=short -- "scripts/$f" 2>/dev/null)"
  # 한 줄 설명 — 파일 머리 주석에서 '=== 이름 — 설명' 꼴을 찾는다(없으면 첫 설명 주석)
  desc="$(sed -n '1,25p' "scripts/$f" | grep -m1 -oE '—[^=]*' | head -1 | sed 's/^— *//' | cut -c1-90)"
  [ -z "$desc" ] && desc="$(sed -n '1,25p' "scripts/$f" | grep -m1 '^//' | sed 's|^// *||' | cut -c1-90)"
  # 첫 실패 줄(있으면)
  firstfail="$(echo "$out" | grep -m1 -E '^[[:space:]]*(✗|✘)|MODULE_NOT_FOUND|Error:' | sed 's/^ *//' | cut -c1-110)"
  # 마지막 줄도 남긴다 — '실행불가'가 진짜 크래시인지 문구 차이인지 사람이 바로 본다
  lastline="$(echo "$out" | grep -v '^$' | tail -1 | cut -c1-90)"
  printf '%s\t%s\t%ds\t%s\t%s\t%s\t%s\n' "$f" "$verdict" "$((t1-t0))" "$last" "$desc" "$firstfail" "$lastline" >> "$OUT"
  echo "   → $verdict ($((t1-t0))s)" >&2
done
drain
echo >&2
awk -F'\t' '{c[$2]++} END {for (k in c) printf "%s %d\n", k, c[k]}' "$OUT" >&2
echo "표: $OUT" >&2
