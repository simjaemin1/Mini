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
#   이제 복수형은 이 파일로 위임하는 한 줄이다. 하네스를 추가하면 **여기 목록에만** 넣어라.
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
  LIST=(
    test-events.js
    test-body.js
    test-fishing.js
    test-guest-rejoin.js
    test-save-periodic.js
    test-guest-identity.js
    test-trade.js
    test-weight.js
    test-emptystart.js
    test-craft.js
    test-ledger.js
    # ★[부패·보존 배치 2026-08-31] 부패 곡선(결정론·연속·순서) · 보존 3종 · 상함 = 확정 탈 · 거래 판정
    test-preserve.js
    # ★[작물 층 2026-08-31] 카탈로그 34종 → 게임(전사·차등·유도·파종철·월동·발아율·씨앗 조달)
    test-crops.js
    test-calendar.js
    test-move.js
    test-charsheet.js
    e2e-events.js
    e2e-trade.js
    e2e-weight.js
    e2e-emptystart.js
    e2e-forage-village.js
    e2e-craft.js
    # ★[부패·보존 배치 2026-08-31] 실클라 — 방치→시듦→상함 표시 · 건조대 말리기 · 상한 것 먹고 탈
    e2e-preserve.js
    e2e-inv.js
    e2e-conn.js
    e2e-ui.js
    # ★[온도 곡선 2026-08-31] 겨울 야생 밤 → 마을 안전망 → 모닥불 — 배선과 화면 도달
    e2e-cold.js
    e2e-fishing.js
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
    # ★★[2026-08-26 러너 통합] 아래 다섯은 **병행 세션의 `run-regressions.sh` 에만** 있던 것들이다.
    #   러너가 둘로 갈린 동안 내 쪽은 이 다섯을 **한 번도 안 돌렸다** — 정확히 그 위험이 있었다.
    #   (`run-regressions.sh` 는 이제 이 파일로 위임한다. 목록은 여기 하나뿐이다.)
    e2e-mtcut.js
    e2e-mtfoot.js
    e2e-mtfuzz.js
    e2e-tilestate.js
    e2e-waterperf.js
    # ★[이동 모델 2026-08-30] 실클라 이동/조준 계측 — legacy·accel 두 판을 스스로 띄운다(각 판 뒤 배수).
    e2e-move.js
    # ★[캐릭 시트] 실클라 애니 — 두 클라 짝. Blender 는 안 돌린다(2코어 캐논: 렌더와 e2e 를 겹치지 마라).
    e2e-charsprite.js
    # ★[줌 2026-08-31] 휠 확대/축소 — 제1 계약은 "배율 1 이면 종전 경로"다(오프스크린 없음+화면 동일).
    e2e-zoom.js
  )
fi

for f in "${LIST[@]}"; do run_one "$f"; done
drain

echo
echo "=== 러너 요약 ==="
echo "  통과 ${#PASSED[@]}: ${PASSED[*]:-없음}"
echo "  실패 ${#FAILED[@]}: ${FAILED[*]:-없음}"
[ "${#FAILED[@]}" -eq 0 ] || exit 1
