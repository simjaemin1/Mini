#!/usr/bin/env bash
# (@regress 없음 — CI `changes` 잡이 부른다 · 하네스 `test-ci-changes`)
# === scripts/ci-changes.sh — 이 판에 코드가 바뀌었나(문서만이면 무거운 잡 건너뜀) [T1375 · main 보호 규칙 앞 · 문서/CI_main보호_안.md §4(가)] ===
#
# ★왜: 워크플로 머리의 `paths-ignore` 는 문서만 커밋에서 워크플로를 **아예 안 돌린다** — main 보호 규칙의 필수 체크(`CI 문`)가 Pending 으로 남아
#   카드만 올리는 커밋이 main 에 못 오른다(GitHub 문서: 경로 거름으로 건너뛴 워크플로의 체크는 Pending). 거름을 워크플로 **안**으로 옮긴다 —
#   이 자가 `code=false` 를 내면 무거운 잡은 `if:` 로 건너뛰고(조건으로 건너뛴 잡은 Success) `CI 문` 이 1분 안에 초록이 된다.
# ★문서 자리(종전 `paths-ignore` 그대로): 지시/ · 보고/ · 인계/ · 회부/ — 그 밖이 한 파일이라도 바뀌면 `code=true`.
# ★옛 판: PR = base sha · push = `before`(0 줄 · 없는 커밋이면 `origin/main` 과 갈림점) · 수동(workflow_dispatch) = 늘 돈다.
#   옛 판을 못 찾거나 바뀐 파일이 0 이면 돈다(보수 — 건너뜀은 확실할 때만).
# 쓰는 법: bash scripts/ci-changes.sh <event_name> <before> <pr_base_sha>   → 줄 `code=true|false` · `why=…`(GITHUB_OUTPUT 꼴)
set -u
EV="${1:-}"; BEFORE="${2:-}"; PRBASE="${3:-}"
DOCS='^(지시|보고|인계|회부)/'
out() { echo "code=$1"; echo "why=$2"; exit 0; }
[ "$EV" = workflow_dispatch ] && out true "수동 판"
BASE=""
if [ "$EV" = pull_request ] && [ -n "$PRBASE" ] && git cat-file -e "${PRBASE}^{commit}" 2>/dev/null; then BASE="$PRBASE"
elif [ -n "$BEFORE" ] && ! printf '%s' "$BEFORE" | grep -qE '^0+$' && git cat-file -e "${BEFORE}^{commit}" 2>/dev/null; then BASE="$BEFORE"
else BASE="$(git merge-base HEAD origin/main 2>/dev/null || true)"; fi
[ -z "$BASE" ] && out true "옛 판 없음"
FILES="$(git -c core.quotepath=off diff --name-only "$BASE" HEAD)"
[ -z "$FILES" ] && out true "바뀐 파일 0"
NCODE="$(printf '%s\n' "$FILES" | grep -cvE "$DOCS")"
NALL="$(printf '%s\n' "$FILES" | grep -c .)"
[ "$NCODE" -gt 0 ] && out true "코드 ${NCODE} · 문서 $((NALL - NCODE))"
out false "문서만 ${NALL}"
