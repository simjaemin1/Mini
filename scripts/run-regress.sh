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
# ★★[2026-08-26] **러너는 이 파일 하나다.** 한때 `run-regressions.sh`(복수형)가 따로 있었고
#   목록이 갈려서, 어느 쪽을 돌리든 **상대편 하네스 5~7종을 통째로 빼먹었다**.
#   이제 복수형은 이 파일로 위임하는 한 줄이다.
#   ★★[0번 분할 2026-09-01] 하네스를 추가하는 법이 바뀌었다: **이 파일을 건드리지 마라.**
#     새 하네스 파일 머리에 `// @regress` 한 줄을 넣으면 러너가 스스로 찾는다(아래 자동 발견).
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
  # ★실패한 줄이 **자기 이름을 말하게** 한다 [2026-08-26] —
  #   종전엔 요약줄만 `tail -5` 로 남아서 "72/1 실패"만 보이고 **무엇이** 실패했는지는
  #   로그를 다시 돌려야 알 수 있었다(실제로 두 번 그랬다). ✗ 줄을 먼저, 따로 보여 준다.
  echo "$out" | grep -E "^\s*✗|실패|FAIL" | grep -vE "실패 0|FAIL 0" | head -6
  echo "$out" | grep -E "통과|PASS|EADDRINUSE|Error:|MODULE_NOT_FOUND" | tail -4
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
  # ═══ ★★[0번 분할 배치 2026-09-01 재민 확정] 명시 목록 → **표 기반 자동 발견** ═══
  #
  #   왜: 여러 세션이 각자 하네스를 추가할 때마다 **이 파일의 같은 줄**을 건드려야 했다.
  #   목록의 끝에 두 세션이 동시에 한 줄씩 붙이면 그건 매번 충돌이다.
  #   ⇒ 등록을 **하네스 자신에게** 옮긴다: 파일 머리에 `// @regress` 한 줄이 있으면 돈다.
  #     새 하네스는 자기 파일에 그 줄을 넣으면 끝 — 러너는 아무도 안 건드린다(충돌 지점 소멸).
  #
  #   ★집합 보존이 규약이다. 이 전환은 **종전 명시 목록 49개와 정확히 같은 집합**으로 시작했다
  #     (디스크엔 `test-*/e2e-*.js` 가 80개 있는데 31개는 예전부터 러너 밖이었다 —
  #      임의로 넣지 않았다. 그 31개의 편입 여부는 회부).
  #
  #   ★순서: `test-*` 먼저(가볍다·포트 안 씀), 그 다음 `e2e-*`(무겁다·3010/3020 공유).
  #     러너는 **한 번에 하나씩** 돌리므로(아래 for) 같은 급 안의 순서는 결과에 영향이 없다.
  #     급을 갈라 두는 이유는 빨리 실패를 보기 위해서지 의존 때문이 아니다.
  #   ⚠러너는 레포 루트에서 돈다(아래 `node "scripts/$f"` 와 같은 규약).
  _disc() { grep -l '^// @regress' scripts/$1 2>/dev/null | xargs -r -n1 basename | LC_ALL=C sort; }
  LIST=($(_disc 'test-*.js') $(_disc 'e2e-*.js'))
  if [ "${#LIST[@]}" -eq 0 ]; then
    echo "  ✗ ★자동 발견이 0개다 — 표(// @regress)가 사라졌거나 경로가 틀렸다. 회귀를 믿지 마라."
    exit 1
  fi
  echo "  [자동 발견] ${#LIST[@]}개 (표 // @regress 기준)"
fi

for f in "${LIST[@]}"; do run_one "$f"; done
drain

echo
echo "=== 러너 요약 ==="
echo "  통과 ${#PASSED[@]}: ${PASSED[*]:-없음}"
echo "  실패 ${#FAILED[@]}: ${FAILED[*]:-없음}"
[ "${#FAILED[@]}" -eq 0 ] || exit 1
