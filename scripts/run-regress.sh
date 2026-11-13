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
#   bash scripts/run-regress.sh -j 4 [a.js …]  # ★[T1288] 넷을 나란히(기본 1 = 종전 순차 · 아래 `-j` 절)
#
# ★★[2026-08-26] **러너는 이 파일 하나다.** 한때 `run-regressions.sh`(복수형)가 따로 있었고
#   목록이 갈려서, 어느 쪽을 돌리든 **상대편 하네스 5~7종을 통째로 빼먹었다**.
#   이제 복수형은 이 파일로 위임하는 한 줄이다.
#   ★★[0번 분할 2026-09-01] 하네스를 추가하는 법이 바뀌었다: **이 파일을 건드리지 마라.**
#     새 하네스 파일 머리에 `// @regress` 한 줄을 넣으면 러너가 스스로 찾는다(아래 자동 발견).
#
# ⚠CPU 2코어다. **순차 단독**이 규약이고 이 스크립트가 그걸 강제한다.
set -u
# ═══ ★[T1288 2026-11-12] `-j N` — 하네스 N 개를 나란히(기본 1 = 종전 순차 · 이 갈래 무접촉) ═══
#   왜 이제 되나: 포트가 겹치지 않는다 — pid 나머지 107곳(T1281) · 제품 밖 고정 수(T1288)는 `lib-port` 장부가 나누고,
#   제품이 박은 포트(존 설정 존 포트 · central 3010)는 하네스 머리 줄 `lib-port.hold(…)` 로 **혼자 쥔다**.
#   ⇒ 이 러너는 머리 줄의 수를 읽어 **같은 고정 포트를 쥐는 둘을 같이 띄우지 않는다**(하네스 안 기다림이 상한 시계를 먹지 않게).
#   · 출력: 하네스마다 제 임시 파일에 받고 **끝난 순서대로** 덩어리째 찍는다(줄이 섞이지 않는다) · 요약은 종전 꼴 그대로.
#   · 배수(앞 판 남은 아이 기다림)는 나란히 갈래에선 쉬지 않는다 — 남은 포트는 `lib-port` 가 OS 에 묶어 보고 피한다.
#   · 환경 `RUN_REGRESS_JOBS` 로도 준다(인자가 이긴다).
JOBS="${RUN_REGRESS_JOBS:-1}"
if [ "${1:-}" = "-j" ] || [ "${1:-}" = "--jobs" ]; then JOBS="${2:-}"; shift 2 || true; fi
case "$JOBS" in ''|*[!0-9]*) echo "  ✗ -j 는 1 이상 정수다 — '$JOBS'" >&2; exit 2 ;; esac
[ "$JOBS" -ge 1 ] || { echo "  ✗ -j 는 1 이상 정수다 — '$JOBS'" >&2; exit 2; }

DRAIN_SEC="${DRAIN_SEC:-8}"
TIMEOUT_SEC="${TIMEOUT_SEC:-2400}"
# ★[T760 · T751 회부 4] 하네스별 상한 표 — 표에 있는 것만 그 수(기본보다 클 때만) · 나머지는 `TIMEOUT_SEC` 그대로.
#   랩 둘은 단독 판이 2,042초(mining) · 1,468초(psite)라 기본 2,400초와 여유가 적다(다른 판과 같이 돌면 넘는다 · T735 회부 4).
#   ~~`@regress` 표식은 안 붙인다 — 야간 목록은 그대로고, 이름을 주고 돌릴 때만 이 표가 쓰인다.~~
#   ★[T830 2026-10-21 · PM 10-20 결정] 칠하기 끔(T799 · `fixture-lab-clock` `noPaint`) 뒤 두 판에 `@regress` 를 다시 붙였다 — 전수·야간 단위에 든다 · 이 표(3,600초)는 그대로.
#   ★[T1121 2026-11-03] 지금 판(2코어 · 혼자): mining 1,601 → 1,018초(표시만 하는 토글 둘 끔 · `leanDraw`) · psite 1,105 → 664초(판 넷 둘씩 나란히). 이 표(3,600초)는 그대로.
# T1170: 기본 세계 채광 창 90날 — 종전 끔 세계 60날의 상한을 늘린다.
declare -A TIMEOUT_OF=( [test-lab-mining.js]=7200 [test-lab-psite.js]=3600 )
FAILED=()
PASSED=()
# ★[T1121 2026-11-03] **걸린 시간도 러너가 말한다.** 야간 11-02 묶음 A 가 4시간 33분 · PM 착지 게이트(하네스 96)가 7시간을 넘었는데
#   하네스별 시간은 어디에도 안 남았다 — 야간 보고는 실패 칸에만 '소요'(분)가 있고, 러너는 아예 안 찍었다(긴 판을 아무도 못 짚었다).
#   ⇒ 하네스마다 `[소요] N초` 한 줄(판정 줄 바로 앞 · 벽시계 · **판정에 안 든다**) · 요약에 상위 열.
#   판정 문법(`##### f #####` · `✓ RC=0` / `✗ RC=n …`)은 한 글자도 안 바뀐다(`nightly-report.js` 가 읽는 줄 그대로).
TIMES=()

# ★★[T773 2026-10-16] **러너도 남의 판을 죽이지 않는다 — 내가 띄운 것만.** (T765 회부 7 · T764 §0)
#   종전 `drain` 은 하네스 사이마다 이름으로 일괄 죽이기(`server/zone.js` · `central.js` 를 이름으로 찾아 죽였다)라
#   **머신의 모든 존**을 죽였다 — 옆에서 돌던 서버 기준선 · 실제 하루 판이 같이 죽는다.
#   ⇒ 하네스 하나를 `timeout` 아래 **제 프로세스 무리**(timeout 이 스스로 새 무리를 연다)로 띄우고,
#     끝나면 **그 무리만** 내린다(`kill -- -<무리>`) — 남은 아이가 있어도 내 아이만 죽는다.
#     `drain` 은 이제 기다리기만 한다(포트가 아직 쥐여 있으면 다음 하네스가 `fixture-boot.mustBeFree` 로 이름 붙여 실패한다).
# ★★[T1161 · K14 2026-11-04] **배수는 포트를 쥘 수 있는 판 뒤에만.** 종전엔 하네스 사이마다 8초(`DRAIN_SEC`)를 무조건 쉬었다 —
#   전수 348종이면 2,784초(46분 · T1121 §1) · 야간 묶음 A 약 40분인데, 대부분의 하네스(포트를 안 쓰는 단위 · 0 ~ 2초짜리)엔 쓸모가 없다.
#   기다림의 까닭은 하나다: **앞 판의 몸(존 · central)이 아직 포트를 쥐고 있을 수 있다.** 그 몸은 하네스가 끝난 뒤에도 **제 무리에 남은 아이**뿐이다 —
#   제 몸으로 들은 포트는 프로세스가 끝날 때 커널이 닫는다(남은 아이가 없으면 쥔 포트도 없다).
#   ⇒ 하네스가 끝난 순간(위 `wait` 뒤 · 무리 내리기 **전**) 제 무리에 산 것이 있으면(`kill -0 -- -<무리>`) 다음 판 앞에서 `DRAIN_SEC` 를 쉬고, 없으면 0 초.
#     첫 판 앞은 종전대로 한 번 쉰다(러너 앞에 돌던 것의 잔재 — 그건 내 무리가 아니라 모른다). 끝 배수도 같은 규칙(마지막 판이 남긴 몸이 있을 때만).
#   · 남의 판은 여전히 무접촉(T773) — 묻기(`kill -0`)는 신호를 안 보낸다. 내리기는 종전 그 한 줄.
#   · 잘못 0 초를 골라도 조용한 빨강은 없다 — 다음 판이 `fixture-boot.mustBeFree` 로 쥔 포트 이름을 붙여 실패한다(종전과 같은 그물).
#   · 되돌림: `DRAIN_ALWAYS=1` = 종전(하네스마다 쉰다). 요약에 쉰 횟수 · 건넌 횟수를 찍는다(판정에 안 든다).
NEED_DRAIN=1
DRAINED=0
SKIPPED=0
drain() {
  if [ "${DRAIN_ALWAYS:-0}" = "1" ] || [ "$NEED_DRAIN" = "1" ]; then
    sleep "$DRAIN_SEC"; DRAINED=$(( DRAINED + 1 ))
  else
    SKIPPED=$(( SKIPPED + 1 ))
  fi
  NEED_DRAIN=0
}

run_one() {
  local f="$1"
  drain
  echo "##### $f #####"
  # ★종료코드를 파이프 **앞에서** 잡는다. 이 한 줄이 이 파일의 존재 이유다.
  local out rc
  local t="$TIMEOUT_SEC"; [ -n "${TIMEOUT_OF[$f]:-}" ] && [ "${TIMEOUT_OF[$f]}" -gt "$t" ] && t="${TIMEOUT_OF[$f]}"
  local tmp; tmp="$(mktemp)"
  local t0=$SECONDS   # ★[T1121] 걸린 시간 — bash 내장 초 시계(포크 0)
  timeout "$t" node "scripts/$f" > "$tmp" 2>&1 < /dev/null &
  local tp=$!
  wait "$tp"
  rc=$?
  local el=$(( SECONDS - t0 ))
  # ★[T1161 · K14] 내리기 **전에** 묻는다 — 내 무리에 산 것이 남았나(신호 0 = 묻기만). 남았으면 다음 판 앞에서 쉰다(위 `drain` 머리).
  if kill -0 -- "-$tp" 2>/dev/null; then NEED_DRAIN=1; echo "  [남은 아이] 있음 — 내려 보내고 다음 판 앞에서 ${DRAIN_SEC}초 쉰다"; fi
  kill -KILL -- "-$tp" 2>/dev/null || true   # ★[T773] 내가 띄운 무리만 — 남은 아이(존 · central)까지 · 남의 판은 무접촉
  [ -n "${RUN_REGRESS_KEEP:-}" ] && { mkdir -p "$RUN_REGRESS_KEEP"; cp "$tmp" "$RUN_REGRESS_KEEP/$f.out" 2>/dev/null || true; }   # ★[T1288] 하네스 전체 출력 남기기(켬만 · 판정 0)
  out="$(cat "$tmp")"; rm -f "$tmp"
  # ★실패한 줄이 **자기 이름을 말하게** 한다 [2026-08-26] —
  #   종전엔 요약줄만 `tail -5` 로 남아서 "72/1 실패"만 보이고 **무엇이** 실패했는지는
  #   로그를 다시 돌려야 알 수 있었다(실제로 두 번 그랬다). ✗ 줄을 먼저, 따로 보여 준다.
  echo "$out" | grep -E "^\s*✗|실패|FAIL" | grep -vE "실패 0|FAIL 0" | head -6
  echo "$out" | grep -E "통과|PASS|EADDRINUSE|Error:|MODULE_NOT_FOUND" | tail -4
  # ★"결과 줄이 없으면 크래시다" — 종료코드만 믿지 않는다(하네스가 0 으로 죽을 수도 있다).
  local summary
  # ★★[T49 2026-09-02] **탐지기를 넓혔다.** 종전 문법(`통과` / `PASS <숫자>`)은 이 러너가
  #   길러 온 하네스들의 말투만 알았다. T49 가 러너 밖 27개를 등재하자 그중 **15개가 rc=0 인데
  #   "결과줄 0개 = 실패"로 잡혔다** — 그것들은 `결과: PASS` 로 끝난다. 잘 도는 하네스였다.
  #   ⇒ 러너 밖에서 자란 하네스는 러너의 말투를 따를 이유가 없다. **검사 표시의 존재**를
  #     1차 근거로 삼고, 요약 문구는 넓게 본다. "조용한 크래시 금지"라는 원래 목적은 그대로다
  #     (표시도 없고 요약어도 없으면 그건 여전히 크래시다).
  marks="$(echo "$out" | grep -cE '^[[:space:]]*(✓|✔|✗|✘)')"
  words="$(echo "$out" | grep -cE '통과|PASS|FAIL|실패|결과')"
  summary=$(( marks + words ))
  echo "  [소요] ${el}초"   # ★[T1121] 판정 줄 바로 앞 — 판정에 안 든다(✓/✗ 로 시작하지 않는다 · 보고기의 판정 문법 밖)
  TIMES+=("$el $f")
  if [ "$rc" -ne 0 ] || [ "$summary" -eq 0 ]; then
    echo "  ✗ RC=$rc · 결과줄 ${summary}개 → **실패로 센다**"
    FAILED+=("$f(rc=$rc)")
  else
    echo "  ✓ RC=0"
    PASSED+=("$f")
  fi
}

# ═══ ★[T1288] 나란히 갈래 — 같은 고정 포트(`lib-port.hold` 머리 줄)를 쥐는 둘은 같이 안 띄운다 ═══
holds_of() { grep -oE "require\('\./lib-port'\)\.hold\([0-9, ]+\)" "scripts/$1" 2>/dev/null | head -1 | grep -oE "[0-9]+" | tr '\n' ' '; }
run_par() {
  local WD; WD="$(mktemp -d)"
  local -a pend=("${LIST[@]}")
  local -A run_f=() run_h=() busy=()
  echo "  [나란히] -j ${JOBS} · ${#pend[@]}개 · 고정 포트 쥔 하네스는 같은 포트끼리 차례로"
  while [ "${#pend[@]}" -gt 0 ] || [ "${#run_f[@]}" -gt 0 ]; do
    # ① 빈 자리에 띄울 수 있는 것(쥐는 포트가 지금 쥔 것과 안 겹치는)을 띄운다
    #   ★[T1288] 포트를 쥐는 하네스를 **먼저** 고른다 — 같은 포트 무리는 차례로만 돌므로 그 줄이 쉬면 벽이 늘어난다
    #   (판 A: 목록 차례로 고르니 쥐지 않는 것 넷이 자리를 채운 동안 3010·3020 줄이 놀았다 · 끝에 그 줄만 홀로 남았다).
    #   고르는 차례만 바꾼다 — 무엇을 도는지 · 판정은 그대로.
    local started=1
    while [ "${#run_f[@]}" -lt "$JOBS" ] && [ "$started" = "1" ]; do
      started=0
      local i pass
      for pass in hold any; do
      [ "$started" = "1" ] && break
      for i in "${!pend[@]}"; do
        local f="${pend[$i]}" hs clash=0 p
        hs="$(holds_of "$f")"
        [ "$pass" = "hold" ] && [ -z "$hs" ] && continue
        for p in $hs; do [ -n "${busy[$p]:-}" ] && clash=1; done
        [ "$clash" = "1" ] && continue
        for p in $hs; do busy[$p]="$f"; done
        ( NEED_DRAIN=0; export RUN_REGRESS_HARNESS="$f"; run_one "$f" ) > "$WD/$f.out" 2>&1 &
        run_f[$!]="$f"; run_h[$!]="$hs"
        unset 'pend[$i]'; pend=("${pend[@]}")
        started=1
        break
      done
      done
    done
    # ② 하나 끝나기를 기다려 그 덩어리를 찍고 셈에 넣는다
    local done_pid=""
    wait -n -p done_pid "${!run_f[@]}" 2>/dev/null || true
    [ -n "$done_pid" ] || continue
    local f="${run_f[$done_pid]}" p
    for p in ${run_h[$done_pid]}; do unset 'busy[$p]'; done
    unset 'run_f[$done_pid]' 'run_h[$done_pid]'
    cat "$WD/$f.out"
    local el; el="$(grep -oE '\[소요\] [0-9]+초' "$WD/$f.out" | tail -1 | grep -oE '[0-9]+')"
    TIMES+=("${el:-0} $f")
    if grep -qE '^  ✓ RC=0$' "$WD/$f.out"; then PASSED+=("$f")
    else
      local rc; rc="$(grep -oE '✗ RC=[0-9]+' "$WD/$f.out" | tail -1 | grep -oE '[0-9]+$')"
      FAILED+=("$f(rc=${rc:-?})")
    fi
  done
  rm -rf "$WD"
}

# ═══ ★[T49 2026-09-02] 선행 점검 — 의존성이 없으면 **여기서** 죽는다 ═══════════
#   왜: `test-client-globals` 가 `acorn` 을 require 하는데, 새 클론에서 `npm install` 을 안 하면
#   `MODULE_NOT_FOUND` 로 **조용히** 죽는다. 그러면 러너는 "결과줄 0개 = 실패"라고만 말하고,
#   읽는 사람은 **제품 회귀**로 오독한다(이 레포가 `pngjs` 로 이미 한 번 당했다).
#   ⇒ 하네스를 한 개도 돌리기 전에, `package.json` 의 dependencies 가 **실제로 풀리는지** 본다.
#     스킵하지 않는다 — 스킵은 "안 쟀는데 초록"이라 더 나쁘다. 사유를 말하고 죽는다.
preflight() {
  local ROOTDIR; ROOTDIR="$(cd "$(dirname "$0")/.." && pwd)"
  local missing
  missing="$(cd "$ROOTDIR" && node -e '
    const p = require("./package.json");
    const need = Object.keys(p.dependencies || {});
    const bad = [];
    for (const m of need) { try { require.resolve(m); } catch (e) { bad.push(m); } }
    process.stdout.write(bad.join(" "));
  ' 2>/dev/null)"
  if [ -n "$missing" ]; then
    echo "  ✗ ★의존성이 없다: $missing"
    # ★큰따옴표 안의 역따옴표는 **명령 치환**이다 — 첫 판이 'package.json: command not found' 를 찍었다.
    echo '     package.json 에는 있는데 설치돼 있지 않다. 하네스는 MODULE_NOT_FOUND 로 조용히 죽고,'
    echo "     러너는 그걸 '결과줄 0개'로만 말해 제품 회귀처럼 보인다. 회귀를 재기 전에 먼저:"
    echo "        npm install"
    return 1
  fi
  return 0
}
preflight || exit 2

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

# ═══ ★[T104 2026-09-05 · PM 승인] 표를 읽는 문법 하나 — `@regress` 도 `@pixel` 도 여기서 읽는다 ═══
#
#   ★왜 태그를 인자로 받나(사본 0): 종전엔 이 함수가 `'^// @regress'` 를 **글자로** 박고 있었다.
#     T98 회부 8("프레임을 픽셀로 재는 하네스 목록")을 세우려고 목록 파일을 따로 만들면 그게 사본이고,
#     사본은 갈린다(러너 둘이 갈렸던 2026-08-26 이 그 선례다). ⇒ **같은 자동 발견 절**에 태그만 얹는다.
#   ⚠앵커를 뒤에도 붙였다 — `@regress` 가 `@regression` 같은 이름을 물면 안 된다.
#     기존 표는 `// @regress   ← 설명…` 꼴이 있어 **공백 또는 줄끝**을 허용한다(집합 보존).
_disc() { grep -lE "^// @${2:-regress}([[:space:]]|\$)" scripts/$1 2>/dev/null | xargs -r -n1 basename | LC_ALL=C sort; }

# ★목록 모드 — 러너 **본문 무접촉**. 기계가 목록을 뽑는 창구다(사람이 손으로 세지 않게).
#   쓰는 법: bash scripts/run-regress.sh --list          # @regress 전수
#            bash scripts/run-regress.sh --list pixel    # @pixel — 프레임을 화소로 재는 하네스
#   ⚠비면 **종료코드 1**이다. 조용한 빈 목록은 이 저장소에서 제일 위험한 답이다(자동 발견 0개와 같은 자리).
if [ "${1:-}" = "--list" ]; then
  TAG="${2:-regress}"
  LIST=($(_disc 'test-*.js' "$TAG") $(_disc 'e2e-*.js' "$TAG"))
  if [ "${#LIST[@]}" -eq 0 ]; then
    echo "  ✗ ★'@${TAG}' 표를 단 하네스가 0개다 — 표가 사라졌거나 태그가 틀렸다." >&2
    exit 1
  fi
  printf '%s\n' "${LIST[@]}"
  exit 0
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
  LIST=($(_disc 'test-*.js') $(_disc 'e2e-*.js'))
  if [ "${#LIST[@]}" -eq 0 ]; then
    echo "  ✗ ★자동 발견이 0개다 — 표(// @regress)가 사라졌거나 경로가 틀렸다. 회귀를 믿지 마라."
    exit 1
  fi
  echo "  [자동 발견] ${#LIST[@]}개 (표 // @regress 기준)"
fi

if [ "$JOBS" -le 1 ]; then
  for f in "${LIST[@]}"; do run_one "$f"; done
  drain
else
  run_par
fi

echo
echo "=== 러너 요약 ==="
echo "  통과 ${#PASSED[@]}: ${PASSED[*]:-없음}"
echo "  실패 ${#FAILED[@]}: ${FAILED[*]:-없음}"
# ★[T1121] 걸린 시간 상위 열(초 · 긴 것부터 · 같으면 이름순) · 하네스 합 · 러너 전체 — 판정에 안 든다
if [ "${#TIMES[@]}" -gt 0 ]; then
  _sum=0; for _x in "${TIMES[@]}"; do _sum=$(( _sum + ${_x%% *} )); done
  _top="$(printf '%s\n' "${TIMES[@]}" | LC_ALL=C sort -k1,1nr -k2,2 | head -10 | while read -r _s _n; do printf '%s %s · ' "$_n" "$_s"; done)"
  echo "  걸린 시간 상위(초): ${_top% · }"
  echo "  걸린 시간 합: 하네스 ${_sum}초 · 러너 전체 ${SECONDS}초(그 사이 = 배수 · 정리 기다림 · 머리)"
fi
[ "$JOBS" -gt 1 ] && echo "  나란히(T1288): -j ${JOBS} · 배수 쉼 없음(남은 포트는 lib-port 가 피한다)"
echo "  배수(T1161): 쉼 ${DRAINED}번 × ${DRAIN_SEC}초 · 건넘 ${SKIPPED}번(앞 판이 남긴 아이 없음)"
[ "${#FAILED[@]}" -eq 0 ] || exit 1
