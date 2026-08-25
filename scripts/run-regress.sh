#!/usr/bin/env bash
# === scripts/run-regress.sh — 회귀 일괄 러너 =====================================
#
# ★★왜 이 파일이 레포에 있나 [2026-08-26]
#   **러너도 하네스다.** 직전 배치에서 손으로 짠 러너가 두 번 틀렸고, 둘 다
#   "통과했다"는 **거짓 보고**를 만들 뻔했다:
#
#   ① **파이프 종료코드** — `out=$(node scripts/X.js | tail -3); rc=$?` 로 짰더니
#      `$?` 가 `tail` 의 것이라, `MODULE_NOT_FOUND` 로 **크래시한 하네스 6종이 전부 exit 0**
#      = 통과로 잡혔다. 로그에 `Node.js v22.22.2` 와 `}` 만 남은 게 유일한 단서였다.
#      (원인은 `pngjs` 가 package.json 에 없던 것 — 새 클론이면 지금도 같은 일이 난다.)
#   ② **고정 포트** — 실클라 하네스가 전부 central 3010 · zone 3020 을 쓴다.
#      앞 하네스 서버가 안 죽은 채 다음이 뜨면 `EADDRINUSE` 로 죽는데, 그게 "실패"로 보여
#      **없는 회귀를 보고**하게 된다(실제로 4종이 그렇게 나왔다가 재실행에서 전원 통과).
#
#   ⇒ 이 러너는 그 둘을 구조적으로 막는다:
#      · 종료코드는 **파이프 앞에서** 잡는다.
#      · 하네스 사이에 서버를 정리하고 기다린다.
#      · PASS 줄이 아예 없으면(=크래시) **실패로 센다** — 조용한 크래시 금지.
#
# 쓰는 법:
#   bash scripts/run-regress.sh            # 전 회귀 순차 단독
#   bash scripts/run-regress.sh --selftest # ★러너 자신이 크래시를 실패로 잡는지 검사
#   bash scripts/run-regress.sh a.js b.js  # 지정한 것만
#
# ⚠CPU 2코어다. **순차 단독**이 규약이고 이 스크립트가 그걸 강제한다.
set -u

DRAIN_SEC="${DRAIN_SEC:-8}"
TIMEOUT_SEC="${TIMEOUT_SEC:-2400}"
FAILED=()
PASSED=()

drain() {
  pkill -f "server/zon[e].js" 2>/dev/null || true
  pkill -f "server/centra[l].js" 2>/dev/null || true
  sleep "$DRAIN_SEC"
}

run_one() {
  local f="$1"
  drain
  echo "##### $f #####"
  # ★종료코드를 파이프 **앞에서** 잡는다. 이 한 줄이 이 파일의 존재 이유다.
  local out rc
  out="$(timeout "$TIMEOUT_SEC" node "scripts/$f" 2>&1)"
  rc=$?
  echo "$out" | grep -E "통과|PASS|실패|FAIL|EADDRINUSE|Error:|MODULE_NOT_FOUND" | tail -5
  # ★"결과 줄이 없으면 크래시다" — 종료코드만 믿지 않는다(하네스가 0 으로 죽을 수도 있다).
  local summary
  summary="$(echo "$out" | grep -cE "통과|PASS [0-9]|=== .*(통과|PASS)")"
  if [ "$rc" -ne 0 ] || [ "$summary" -eq 0 ]; then
    echo "  ✗ RC=$rc · 결과줄 ${summary}개 → **실패로 센다**"
    FAILED+=("$f(rc=$rc)")
  else
    echo "  ✓ RC=0"
    PASSED+=("$f")
  fi
}

if [ "${1:-}" = "--selftest" ]; then
  # ★러너 자신을 검사한다 — 일부러 크래시하는 하네스를 만들어 **실패로 잡히는지** 본다.
  echo "=== 러너 자가 검사: 크래시가 실패로 잡히는가 ==="
  cat > scripts/_runner_selftest_crash.js <<'JS'
// 러너 자가 검사용 — 일부러 존재하지 않는 모듈을 부른다(MODULE_NOT_FOUND 로 죽는다).
require('this-module-does-not-exist-on-purpose');
console.log('=== 이 줄은 절대 찍히면 안 된다 · 통과 1 ===');
JS
  DRAIN_SEC=0 run_one "_runner_selftest_crash.js"
  rm -f scripts/_runner_selftest_crash.js
  if [ "${#FAILED[@]}" -eq 1 ]; then
    echo "  ✓ 러너가 크래시를 실패로 잡는다 — 파이프 종료코드 함정 없음"
    exit 0
  fi
  echo "  ✗ ★러너가 크래시를 통과로 오독한다 — 고치기 전엔 어떤 회귀 보고도 믿지 마라"
  exit 1
fi

if [ "$#" -gt 0 ]; then
  LIST=("$@")
else
  LIST=(
    test-events.js
    test-guest-rejoin.js
    test-guest-identity.js
    e2e-events.js
    e2e-guest-reconnect.js
    e2e-mountain.js
    e2e-mtcorridor.js
    e2e-mtocc.js
    e2e-terrain.js
    e2e-nature.js
    e2e-rooms.js
    e2e-cutaway.js
    e2e-metallurgy.js
    e2e-village.js
  )
fi

for f in "${LIST[@]}"; do run_one "$f"; done
drain

echo
echo "=== 러너 요약 ==="
echo "  통과 ${#PASSED[@]}: ${PASSED[*]:-없음}"
echo "  실패 ${#FAILED[@]}: ${FAILED[*]:-없음}"
[ "${#FAILED[@]}" -eq 0 ] || exit 1
