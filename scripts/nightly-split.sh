#!/bin/bash
# ═══ 야간 러너 두 밤 — 러너를 **부르기만** 한다 [T220 2026-09-13 · 재민 확정] ═══
#
# 왜: T185 실측으로 이 상자에서 e2e 48종만 3시간을 넘고, 야간 창(3h39m~3h43m)은
#     09-12 에 108종 · 09-13 에 112종까지밖에 못 닿았다(미측정 35 → 31 · 전부 e2e).
#     ⇒ `판정대기` #25 의 PM 권고: **단위는 매일 · e2e 는 이틀로 나눠서.**
#
# ★★이 파일은 **목록을 하나도 안 들고 있다.** 세 줄 다 러너의 `--list` 가 낸다(사본 0).
#   묶음은 하네스 제 머리의 표식이 정한다: `// @nightly A` 또는 `// @nightly B` 한 줄.
#   러너의 `_disc()` 가 이미 태그를 인자로 받으므로 **러너는 한 글자도 안 고쳤다**
#   (`--list` 는 `^// @<태그>([[:space:]]|$)` 로 찾는다 — 태그에 공백이 있어도 그대로 먹는다).
#
#   단위 = (@regress 전수) − (@nightly A ∪ @nightly B). 뺄셈도 러너 출력끼리 한다 —
#   "test-* 는 단위" 같은 **이름 규칙을 안 믿는다**(이름은 언젠가 갈린다, 표식은 안 갈린다).
#
# 쓰는 법:
#   bash scripts/nightly-split.sh A       # 단위 전부 + e2e A 묶음
#   bash scripts/nightly-split.sh B       # 단위 전부 + e2e B 묶음
#   bash scripts/nightly-split.sh auto    # 날짜 홀짝으로 고른다(어느 쪽인지 찍고 시작한다)
#   bash scripts/nightly-split.sh A --list-only    # 돌리지 않고 목록만 (점검용)
#
# ⚠빈 목록은 이 저장소에서 제일 위험한 답이다 — 어느 줄이든 비면 **여기서 죽는다**.
set -euo pipefail
cd "$(dirname "$0")/.."
R="scripts/run-regress.sh"
[ -f "$R" ] || { echo "  ✗ 러너가 없다: $R" >&2; exit 1; }

# ★묶음 개수를 코드에 안 박는다 — **있는 것만** 러너에게 물어본다(A..D).
#   셋으로 늘리려면 태그만 `// @nightly C` 로 고치면 된다. 이 파일은 한 글자도 안 고친다.
#   ★목록은 **들고 있지 않는다** — 있는지만 묻고, 쓸 때 러너에게 다시 묻는다(사본 0).
#   ⚠변수 이름이 `GROUPS` 면 안 된다 — bash 가 **제 것으로 쓰는 이름**이다(현재 사용자의 그룹 id).
#     `GROUPS=()` 는 안 지워지고 `${GROUPS[*]}` 는 `0` 을 답한다(실측: 묶음이 늘 1개로 나왔다).
NIGHTS=()
for g in A B C D; do
  if bash "$R" --list "nightly $g" >/dev/null 2>&1; then NIGHTS+=("$g"); fi
done
[ ${#NIGHTS[@]} -ge 2 ] || { echo "  ✗ ★'@nightly <글자>' 묶음이 ${#NIGHTS[@]}개다 — 표식이 사라졌다. 회귀를 믿지 마라." >&2; exit 1; }

WHICH="${1:-}"
if [ "$WHICH" = "auto" ]; then
  # 날짜로 돌린다 — 묶음이 둘이면 이틀에 한 번, 셋이면 사흘에 한 번 같은 묶음이 돈다.
  WHICH="${NIGHTS[$(( 10#$(date +%j) % ${#NIGHTS[@]} ))]}"
  echo "  [auto] $(date +%F) · 묶음 ${#NIGHTS[@]}개 → **$WHICH**"
fi
case " ${NIGHTS[*]} " in *" $WHICH "*) ;; *) echo "쓰는 법: bash scripts/nightly-split.sh $(IFS='|'; echo "${NIGHTS[*]}")|auto [--list-only]" >&2; exit 2;; esac

ALL="$(bash "$R" --list)"
SPLIT="$(for g in "${NIGHTS[@]}"; do bash "$R" --list "nightly $g"; done | LC_ALL=C sort)"
UNITS="$(comm -23 <(printf '%s\n' "$ALL" | LC_ALL=C sort) <(printf '%s\n' "$SPLIT"))"
[ -n "$UNITS" ] || { echo "  ✗ ★단위(전수−묶음) 목록이 비었다 — 표식이 어긋났다." >&2; exit 1; }
# 두 묶음에 **둘 다** 달린 하네스는 그날 두 번 돈다 — 조용히 넘어가지 않는다.
DUP="$(printf '%s\n' "$SPLIT" | uniq -d)"
[ -z "$DUP" ] || { echo "  ✗ ★묶음 둘에 **같이** 달린 하네스가 있다: $DUP" >&2; exit 1; }

PICK="$(bash "$R" --list "nightly $WHICH")"
TONIGHT="$(printf '%s\n%s\n' "$UNITS" "$PICK")"
cnt() { printf '%s\n' "$1" | wc -l | tr -d ' '; }
echo "  [야간 $WHICH] 단위 $(cnt "$UNITS")종 + e2e $(cnt "$PICK")종 = $(cnt "$TONIGHT")종  (전수 $(cnt "$ALL")종 · 묶음 ${NIGHTS[*]})"

if [ "${2:-}" = "--list-only" ]; then printf '%s\n' "$TONIGHT"; exit 0; fi
exec bash "$R" $TONIGHT
