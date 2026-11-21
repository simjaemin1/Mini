#!/usr/bin/env bash
# === scripts/pm-old-code-red.sh — 옛 코드 빨강 [PM · 2026-11-17 · 재민 "테스트를 대폭 강화"] ==================
# (@regress 없음 — 러너 밖 · PM 착지 게이트 · 세션도 올리기 전에 돈다)
#
# ★무엇: **새 하네스가 고침을 정말 재는가**를 세션 말 없이 본다. 지금 `scripts/`(하네스 · 픽스처 · lib) 를 그대로 두고
#   제품 코드(`server sim public lab`)만 옛 ref 것으로 되돌린 사본 위에서 새 하네스를 돈다 — **빨강이어야 한다**.
#   초록이면 그 하네스는 고침이 없어도 통과한다(자명 통과) = 실패.
# ★왜: 미끼는 하네스를 짠 세션이 짠다(무조건 통과하는 가짜 미끼를 못 막는다). 이 자는 git 이 옛 코드를 꺼내므로
#   세션이 쓴 글자를 한 줄도 안 믿는다. "고치기 전에는 실패하는 테스트" 그 확인이다.
# ★판정: RC≠0 이고 ✗ 줄이 있다 = 빨강(단언) ○ · RC≠0 인데 결과 줄 0 = 빨강(크래시 — 약함 · 까닭을 읽어라) △ ·
#   RC=0 = 초록 ✗ · 시한 = 모름(다시 재라).
# ★한계: 하네스 **고침**(새 파일이 아닌 것)은 기본 목록에 안 든다 — 이름을 주면 돈다. e2e(브라우저)는 이름을 줄 때만.
#   하네스 도구만 재는 하네스(`lib-*` 검사 · 러너 검사 — 제품을 안 부른다)는 옛 제품 위에서도 초록이 맞다 — 머리에 `// @harness-only` 를 달면
#   건너뛴다("제품 무관" 줄 · `test-harness-lint` ⑲ 가 표지를 단 하네스는 제품 자리를 안 가리킴을 본다 · T1350).
#   ★[T1375] 하네스가 재는 고침이 `scripts/` 안 운영 스크립트(예: `live-lag.sh` · 배포 셸)면 그 파일은 기본으로 지금 것 그대로라 옛 판에서도 초록이 난다.
#   머리에 `// @old-red-also <경로> [경로…]`(레포 뿌리 기준 · `scripts/test-*` 는 안 됨)를 달면 그 파일도 옛 ref 것으로 되돌려 돈다(옛 ref 에 없던 파일이면 지운다 —
#   크래시 △ 로 선다). `test-harness-bite` 가 표지 경로가 실제로 있고 하네스 자신이 아님을 본다.
#   손잡이 끔 기본 고침은 하네스가 손잡이를 켜고 돈다 — 옛 제품엔 그 손잡이가 없으니 빨강이어야 한다(초록이면 손잡이를 안 잰다).
#
# 쓰는 법:
#   bash scripts/pm-old-code-red.sh <옛 ref>                      # 옛 ref 에 없던 scripts/test-*.js 전부
#   bash scripts/pm-old-code-red.sh <옛 ref> test-a.js test-b.js  # 이것만
#   TIMEOUT_SEC=600 OUT=/tmp/ocr.txt bash scripts/pm-old-code-red.sh origin/main
#   TMPDIR="$HOME/tmp" bash scripts/pm-old-code-red.sh origin/main     # ★[T1414] 임시 worktree 는 TMPDIR 아래(없으면 /tmp) · 끝나도 죽어도 지운다
set -u
OLD="${1:?옛 ref 를 줘라(예: origin/main)}"; shift || true
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
TIMEOUT_SEC="${TIMEOUT_SEC:-600}"
OUT="${OUT:-/dev/stdout}"
PROD="${PROD:-server sim public lab}"
if [ $# -gt 0 ]; then LIST="$*"; else LIST="$(git diff --diff-filter=A --name-only "$OLD"..HEAD -- 'scripts/test-*.js' | sed 's#^scripts/##' | tr '\n' ' ')"; fi
[ -z "${LIST// /}" ] && { echo "새 하네스 0 — 볼 것 없음"; exit 0; }
# ★[T1414] 임시 폴더는 `${TMPDIR:-/tmp}` 아래 — 샌드박스 세션(`/tmp` 쓰기 금지 · TMPDIR 만 열림)도 같은 자로 돈다(종전 `/tmp` 박음 → S-API 가 손으로 대신했다 · T1396 회부 7).
#   지우기는 끝나도 · 죽어도(INT · TERM · HUP — `kill` 기본 신호) 한 곳(`_ocr_clean`)에서: 돌던 하네스(와 시한 감시)를 먼저 끄고 → worktree 를 풀고 → 폴더를 지운다.
#   하네스는 뒤에서 돌리고 `wait` 한다 — 앞에서 돌면 bash 가 그 자식이 끝날 때까지 신호 처리를 미뤄 `kill` 이 시한(600초) 뒤에야 먹는다. `kill -9` 는 못 막는다(찌꺼기는 TMPDIR 안에만 남는다).
_TMPB="${TMPDIR:-/tmp}"; _TMPB="${_TMPB%/}"; [ -n "$_TMPB" ] || _TMPB=/tmp
TMP="$(mktemp -d "$_TMPB/ocr.XXXXXX")" || { echo "임시 폴더를 못 만든다: $_TMPB/ocr.XXXXXX (TMPDIR 을 봐라)" >&2; exit 2; }
_cpid=""; _wpid=""
_ocr_clean() {
  [ -n "$_wpid" ] && { kill -TERM "$_wpid" 2>/dev/null; wait "$_wpid" 2>/dev/null; }
  [ -n "$_cpid" ] && { kill -TERM "$_cpid" 2>/dev/null; wait "$_cpid" 2>/dev/null; }
  git worktree remove --force "$TMP/w" >/dev/null 2>&1
  rm -rf "$TMP"
  git worktree list --porcelain 2>/dev/null | grep -qF "$TMP/w" && git worktree prune >/dev/null 2>&1
  return 0
}
trap _ocr_clean EXIT
trap 'exit 130' INT; trap 'exit 143' TERM; trap 'exit 129' HUP
git worktree add -q --detach "$TMP/w" HEAD || exit 2
# shellcheck disable=SC2086
# ★[T1383] 제품 자리를 옛 ref 그대로 — ① 옛 ref 에 없던 자리(예: 9월의 `lab`)는 통째로 지운다(종전: checkout 이 pathspec 오류로 자가 멈춰 줄이 비었다)
#   ② 옛 ref 뒤에 **새로 생긴 제품 파일**은 지운다(종전: `checkout <옛> -- server` 는 옛 파일을 덮어쓰기만 해 새 파일이 남았다 — 새 모듈을 재는 하네스가
#      옛 판에서도 초록으로 섰다 · `test-t1314-cols` 가 `server/hot-cols.js` 를 그렇게 읽었다)
for d in $PROD; do
  if git cat-file -e "$OLD:$d" 2>/dev/null; then git -C "$TMP/w" checkout -q "$OLD" -- "$d" || exit 2
  else rm -rf "${TMP:?}/w/$d"; fi
done
git -C "$TMP/w" -c core.quotepath=off diff --name-only --diff-filter=A "$OLD" HEAD -- $PROD | while IFS= read -r f; do rm -f "$TMP/w/$f"; done
[ -d "$ROOT/node_modules" ] && ln -s "$ROOT/node_modules" "$TMP/w/node_modules"
red=0; weak=0; green=0; unk=0; skip=0
{
  echo "# 옛 코드 빨강 — 하네스 = $(git rev-parse --short HEAD) · 제품($PROD) = $(git rev-parse --short "$OLD") · 시한 ${TIMEOUT_SEC}초"
  for t in $LIST; do
    # ★[T1350] 머리 표지 `// @harness-only`(제품 부름 0 — `test-harness-lint` ⑲ 가 확인) = 옛 제품 위에서도 초록이 맞다 → 건너뛴다(셈 밖 · 줄은 남긴다)
    if grep -qE '^// @harness-only([[:space:]]|$)' "scripts/$t" 2>/dev/null; then echo "제품 무관 | $t | @harness-only — 건너뜀"; skip=$((skip+1)); continue; fi
    # ★[PM land1083] PM 예외 목록(`scripts/old-green-ok.txt` — 하네스 도구를 재지만 제품 글자를 쥐는 하네스 · PM 만 편집) = 건너뛴다(줄은 남긴다)
    if [ -f scripts/old-green-ok.txt ] && grep -qE "^$(basename "$t" | sed 's/[.]/[.]/g')[[:space:]]*[|]" scripts/old-green-ok.txt; then echo "예외(PM 목록) | $t | $(grep -E "^$(basename "$t" | sed 's/[.]/[.]/g')[[:space:]]*[|]" scripts/old-green-ok.txt | cut -d'|' -f2- | cut -c1-120)"; skip=$((skip+1)); continue; fi
    log="$TMP/$(basename "$t").log"
    # ★[T1375] `// @old-red-also <경로…>` — 그 운영 스크립트도 옛 ref 것으로(판이 끝나면 지금 것으로 되돌린다 — 다음 하네스는 종전 그대로)
    also="$(grep -m1 -E '^// @old-red-also[[:space:]]' "scripts/$t" 2>/dev/null | sed -E 's#^// @old-red-also[[:space:]]+##; s#[[:space:]]+\(.*$##')"
    for a in $also; do
      case "$a" in scripts/test-*|*..*|/*) echo "  (표지 경로 거절: $a)"; continue ;; esac
      if git cat-file -e "$OLD:$a" 2>/dev/null; then git -C "$TMP/w" checkout -q "$OLD" -- "$a"; else rm -f "$TMP/w/$a"; fi
    done
    # ★[T1414] 뒤에서 돌리고 기다린다(위 `_ocr_clean` 머리) · `timeout` 이 없는 상자(맥 기본)는 같은 뜻의 감시로(시한 넘으면 TERM · RC 124 — 종전엔 RC 127 크래시 △ 로 섰다)
    if command -v timeout >/dev/null 2>&1; then
      ( cd "$TMP/w" && exec timeout "$TIMEOUT_SEC" node "scripts/$t" ) >"$log" 2>&1 & _cpid=$!
    else
      rm -f "$TMP/.timeout"
      ( cd "$TMP/w" && exec node "scripts/$t" ) >"$log" 2>&1 & _cpid=$!
      ( _sp=""; trap '[ -n "$_sp" ] && kill "$_sp" 2>/dev/null; exit 0' TERM; sleep "$TIMEOUT_SEC" & _sp=$!; wait "$_sp"; kill -TERM "$_cpid" 2>/dev/null && : >"$TMP/.timeout" ) & _wpid=$!
    fi
    wait "$_cpid"; rc=$?; _cpid=""
    if [ -n "$_wpid" ]; then kill -TERM "$_wpid" 2>/dev/null; wait "$_wpid" 2>/dev/null; _wpid=""; [ -f "$TMP/.timeout" ] && { rc=124; rm -f "$TMP/.timeout"; }; fi
    nf=$(grep -cE '^\s*(✗|❌|FAIL)' "$log"); np=$(grep -cE '^\s*(✓|✅|PASS)' "$log")
    why="$(grep -m1 -E '^\s*(✗|❌|FAIL)' "$log" | cut -c1-160)"
    [ -z "$why" ] && why="$(grep -m1 -E 'Error|Cannot find|is not defined|not a function' "$log" | cut -c1-160)"
    if [ "$rc" = 124 ]; then v="모름(시한)"; unk=$((unk+1))
    elif [ "$rc" = 0 ]; then v="초록 ✗"; green=$((green+1))
    elif [ "$nf" -gt 0 ]; then v="빨강 ○"; red=$((red+1))
    else v="빨강(크래시) △"; weak=$((weak+1)); fi
    for a in $also; do case "$a" in scripts/test-*|*..*|/*) continue ;; esac; git -C "$TMP/w" checkout -q HEAD -- "$a" 2>/dev/null; done
    [ -n "$also" ] && why="(옛 판으로 되돌린 운영 파일: $also) $why"
    echo "$v | $t | RC=$rc · ✓ $np · ✗ $nf | $why"
  done
  echo "# 합: 빨강 $red · 크래시 $weak · 초록 $green · 모름 $unk · 제품 무관 $skip"
} >"$OUT"
[ "$green" -gt 0 ] && exit 1
exit 0
